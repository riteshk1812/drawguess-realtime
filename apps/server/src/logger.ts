import pino from 'pino'

export function createLogger(level: string, pretty: boolean) {
  if (!pretty) return pino({ level })
  return pino({
    level,
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss' },
    },
  })
}

export type Logger = ReturnType<typeof createLogger>
