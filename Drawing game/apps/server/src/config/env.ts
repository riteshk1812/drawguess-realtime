import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().min(1).default('0.0.0.0'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173,http://localhost:3001'),
  LOG_LEVEL: z.string().default('info'),
  NODE_ENV: z.string().default('development'),
  REDIS_URL: z.string().optional().default(''),
  DATABASE_URL: z.string().optional().default(''),
  RECONNECT_GRACE_MS: z.coerce.number().int().min(1000).max(120_000).default(30_000),
})

export interface Env {
  port: number
  host: string
  origins: string[]
  logLevel: string
  nodeEnv: string
  redisUrl: string
  databaseUrl: string
  reconnectGraceMs: number
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.parse(source)
  return {
    port: parsed.PORT,
    host: parsed.HOST,
    origins: parsed.CLIENT_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean),
    logLevel: parsed.LOG_LEVEL,
    nodeEnv: parsed.NODE_ENV,
    redisUrl: parsed.REDIS_URL.trim(),
    databaseUrl: parsed.DATABASE_URL.trim(),
    reconnectGraceMs: parsed.RECONNECT_GRACE_MS,
  }
}
