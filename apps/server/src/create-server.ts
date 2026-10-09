import { createServer as createHttpServer, type Server as HttpServer } from 'node:http'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { createAdapter } from '@socket.io/redis-adapter'
import cors from 'cors'
import express from 'express'
import { Server } from 'socket.io'
import { loadEnv, type Env } from './config/env.js'
import { repoRootFromImport } from './config/paths.js'
import { createLogger, type Logger } from './logger.js'
import { MemoryHistory, type HistoryStore } from './persistence/history.js'
import { connectPostgres, PostgresHistory } from './persistence/postgres.js'
import { connectRedis, RedisStore } from './persistence/redis.js'
import { defaultBounds, RoomManager, testBounds } from './rooms/manager.js'
import { MemoryRateLimiter, RedisRateLimiter, type RateLimiter } from './security/rate-limit.js'
import { registerSockets } from './sockets/register.js'
import type { SettingsBounds } from '@drawguess/shared'

export interface CreateServerOptions {
  env?: Env
  bounds?: SettingsBounds
  now?: () => number
}

export interface AppServer {
  env: Env
  httpServer: HttpServer
  io: Server
  manager: RoomManager
  logger: Logger
  close: () => Promise<void>
}

export async function createServer(options: CreateServerOptions = {}): Promise<AppServer> {
  const env = options.env ?? loadEnv()
  const logger = createLogger(env.logLevel, env.nodeEnv === 'development')
  const bounds = options.bounds ?? (env.nodeEnv === 'test' ? testBounds : defaultBounds)

  let redis: RedisStore | null = null
  if (env.redisUrl) {
    redis = await connectRedis(env.redisUrl)
    if (redis) logger.info('Redis connected')
    else logger.warn('REDIS_URL is set but Redis is unreachable. Continuing in memory.')
  }

  let history: HistoryStore = new MemoryHistory()
  let postgres: PostgresHistory | null = null
  if (env.databaseUrl) {
    postgres = await connectPostgres(env.databaseUrl)
    if (postgres) {
      history = postgres
      logger.info('Postgres history enabled')
    } else {
      logger.warn('DATABASE_URL is set but Postgres is unreachable. Completed games stay in memory.')
    }
  }

  const limiter: RateLimiter = redis
    ? new RedisRateLimiter((key, windowMs) => redis!.hit(key, windowMs))
    : new MemoryRateLimiter(options.now)

  const app = express()
  app.disable('x-powered-by')
  app.use(cors({ origin: env.origins }))
  app.use(express.json({ limit: '32kb' }))

  const httpServer = createHttpServer(app)
  const io = new Server(httpServer, {
    cors: { origin: env.origins },
    maxHttpBufferSize: 100_000,
    connectTimeout: 10_000,
  })

  let redisSub: RedisStore['client'] | null = null
  if (redis) {
    redisSub = redis.client.duplicate()
    if (redisSub.status === 'wait') await redisSub.connect()
    io.adapter(createAdapter(redis.client, redisSub))
  }

  const manager = new RoomManager(io, history, redis, limiter, logger, env.reconnectGraceMs, bounds, options.now)
  registerSockets(io, manager, logger)

  app.get('/api/health', (_request, response) => {
    response.json({
      ok: true,
      redis: manager.redisEnabled,
      history: manager.historyKind,
      uptime: process.uptime(),
    })
  })

  app.get('/api/history', async (request, response) => {
    const limit = Math.min(20, Math.max(1, Number(request.query.limit) || 10))
    response.json({ games: await manager.recent(limit) })
  })

  const root = repoRootFromImport(import.meta.url)
  const staticDir = path.join(root, 'apps', 'web', 'dist')
  const serveStatic = env.nodeEnv === 'production' && existsSync(staticDir)
  if (serveStatic) {
    app.use(express.static(staticDir))
    app.use((request, response, next) => {
      if (request.method !== 'GET' || request.path.startsWith('/api') || request.path.startsWith('/socket.io')) {
        next()
        return
      }
      response.sendFile(path.join(staticDir, 'index.html'), (error) => {
        if (error) next()
      })
    })
  }

  const restored = await manager.restore()
  if (restored > 0) logger.info({ rooms: restored }, 'restored rooms from Redis')

  return {
    env,
    httpServer,
    io,
    manager,
    logger,
    close: async () => {
      await manager.close()
      await new Promise<void>((resolve) => io.close(() => resolve()))
      if (httpServer.listening) {
        await new Promise<void>((resolve, reject) => {
          httpServer.close((error) => (error ? reject(error) : resolve()))
        })
      }
      if (redisSub) await redisSub.quit().catch(() => undefined)
      if (redis) await redis.close().catch(() => undefined)
      if (postgres) await postgres.close().catch(() => undefined)
    },
  }
}
