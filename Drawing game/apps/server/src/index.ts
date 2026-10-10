import path from 'node:path'
import dotenv from 'dotenv'
import { repoRootFromImport } from './config/paths.js'
import { createServer } from './create-server.js'

const root = repoRootFromImport(import.meta.url)
dotenv.config({ path: path.join(root, '.env') })

const running = await createServer()
const { env, httpServer, logger, close } = running

httpServer.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    logger.fatal(`Port ${env.port} is already in use. Stop the other process or set PORT.`)
    process.exit(1)
  }
  logger.fatal({ err: error.message }, 'server failed')
  process.exit(1)
})

httpServer.listen(env.port, env.host, () => {
  logger.info(`DrawGuess listening on http://${env.host}:${env.port}`)
  logger.info(`Accepting browser origins: ${env.origins.join(', ')}`)
})

let shuttingDown = false
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, 'shutting down')
  running.io.emit('server:shutdown', { error: 'Server is shutting down' })
  await close()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
