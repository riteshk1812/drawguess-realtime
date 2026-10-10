import { drawChunkSchema, formatZodError, parseSettings, type GameSettings } from '@drawguess/shared'
import type { Server, Socket } from 'socket.io'
import { ZodError, z } from 'zod'
import type { Logger } from '../logger.js'
import type { ClientResponse, RoomManager } from '../rooms/manager.js'

const nameSchema = z.string().trim().min(1).max(16)
const createSchema = z.object({
  playerName: nameSchema,
  roomName: z.string().trim().min(1).max(40),
  settings: z.unknown(),
})
const roomCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z2-9]{8}$/, 'Enter an 8-character room code'))
const joinSchema = z.object({
  code: roomCodeSchema,
  playerName: nameSchema,
})
const reconnectSchema = z.object({
  code: roomCodeSchema,
  playerId: z.string().regex(/^[a-f0-9]{16,64}$/),
  reconnectToken: z.string().min(20).max(200),
})
const chatSchema = z.object({
  text: z.string().trim().min(1).max(120),
  turnId: z.string().regex(/^[a-f0-9]{8,64}$/).nullish(),
})
const wordSchema = z.object({
  turnId: z.string().regex(/^[a-f0-9]{8,64}$/),
  word: z.string().trim().min(1).max(40),
})
const turnSchema = z.object({
  turnId: z.string().regex(/^[a-f0-9]{8,64}$/),
})
const settingsSchema = z.object({ settings: z.unknown() })
const kickSchema = z.object({
  targetId: z.string().regex(/^[a-f0-9]{16,64}$/),
})
const voteSchema = z.object({ yes: z.boolean() })

export function registerSockets(io: Server, manager: RoomManager, logger: Logger): void {
  io.on('connection', (socket) => {
    socket.on('room:create', (payload, ack) => {
      void handle(socket, ack, logger, async () => {
        const parsed = createSchema.safeParse(payload)
        if (!parsed.success) return invalid(parsed.error)
        const settings = readSettings(parsed.data.settings, manager)
        return manager.createRoom(socket.id, { playerName: parsed.data.playerName, roomName: parsed.data.roomName, settings }, ipOf(socket))
      })
    })

    socket.on('room:join', (payload, ack) => {
      void handle(socket, ack, logger, async () => {
        const parsed = joinSchema.safeParse(payload)
        if (!parsed.success) return invalid(parsed.error)
        return manager.joinRoom(socket.id, parsed.data, ipOf(socket))
      })
    })

    socket.on('room:reconnect', (payload, ack) => {
      void handle(socket, ack, logger, async () => {
        const parsed = reconnectSchema.safeParse(payload)
        if (!parsed.success) return invalid(parsed.error)
        return manager.reconnect(socket.id, parsed.data)
      })
    })

    socket.on('room:start', (_payload, ack) => {
      void handle(socket, ack, logger, () => manager.start(socket.id))
    })

    socket.on('room:settings', (payload, ack) => {
      void handle(socket, ack, logger, async () => {
        const parsed = settingsSchema.safeParse(payload)
        if (!parsed.success) return invalid(parsed.error)
        return manager.updateSettings(socket.id, readSettings(parsed.data.settings, manager))
      })
    })

    socket.on('word:select', (payload, ack) => {
      void handle(socket, ack, logger, async () => {
        const parsed = wordSchema.safeParse(payload)
        if (!parsed.success) return invalid(parsed.error)
        return manager.selectWord(socket.id, parsed.data.turnId, parsed.data.word)
      })
    })

    socket.on('chat:send', (payload, ack) => {
      void handle(socket, ack, logger, async () => {
        const parsed = chatSchema.safeParse(payload)
        if (!parsed.success) return invalid(parsed.error)
        return manager.text(socket.id, parsed.data.text, parsed.data.turnId ?? null)
      })
    })

    socket.on('draw:chunk', (payload, ack) => {
      void handle(socket, ack, logger, async () => {
        const parsed = drawChunkSchema.safeParse(payload)
        if (!parsed.success) return invalid(parsed.error)
        return manager.draw(socket.id, parsed.data)
      })
    })

    socket.on('draw:undo', (payload, ack) => {
      void handle(socket, ack, logger, async () => {
        const parsed = turnSchema.safeParse(payload)
        if (!parsed.success) return invalid(parsed.error)
        return manager.undo(socket.id, parsed.data.turnId)
      })
    })

    socket.on('draw:clear', (payload, ack) => {
      void handle(socket, ack, logger, async () => {
        const parsed = turnSchema.safeParse(payload)
        if (!parsed.success) return invalid(parsed.error)
        return manager.clear(socket.id, parsed.data.turnId)
      })
    })

    socket.on('game:end', (_payload, ack) => {
      void handle(socket, ack, logger, () => manager.endGame(socket.id))
    })

    socket.on('room:leave', (_payload, ack) => {
      void handle(socket, ack, logger, () => manager.leave(socket.id))
    })

    socket.on('kick:start', (payload, ack) => {
      void handle(socket, ack, logger, async () => {
        const parsed = kickSchema.safeParse(payload)
        if (!parsed.success) return invalid(parsed.error)
        return manager.startKick(socket.id, parsed.data.targetId)
      })
    })

    socket.on('kick:vote', (payload, ack) => {
      void handle(socket, ack, logger, async () => {
        const parsed = voteSchema.safeParse(payload)
        if (!parsed.success) return invalid(parsed.error)
        return manager.voteKick(socket.id, parsed.data.yes)
      })
    })

    socket.on('room:lobby', (_payload, ack) => {
      void handle(socket, ack, logger, () => manager.returnToLobby(socket.id))
    })

    socket.on('sync:request', (_payload, ack) => {
      void handle(socket, ack, logger, () => manager.sync(socket.id))
    })

    socket.on('disconnect', () => {
      manager.socketClosed(socket.id)
    })
  })
}

class InputError extends Error {
  readonly code = 'invalid'
}

function readSettings(input: unknown, manager: RoomManager): GameSettings {
  try {
    return parseSettings(input, manager.limits())
  } catch (error) {
    if (error instanceof ZodError) throw new InputError(formatZodError(error))
    throw error
  }
}

function invalid(error: z.ZodError): ClientResponse {
  return { ok: false, code: 'invalid', error: formatZodError(error) }
}

function ipOf(socket: Socket): string {
  return socket.handshake.address || 'unknown'
}

async function handle(
  _socket: Socket,
  ack: unknown,
  logger: Logger,
  work: () => Promise<ClientResponse> | ClientResponse,
): Promise<void> {
  const respond = typeof ack === 'function' ? (ack as (response: ClientResponse) => void) : () => undefined
  try {
    respond(await work())
  } catch (error) {
    if (error instanceof InputError) {
      respond({ ok: false, code: 'invalid', error: error.message })
      return
    }
    logger.error({ err: error instanceof Error ? error.message : 'request' }, 'socket handler failed')
    respond({ ok: false, code: 'internal', error: 'Something went wrong' })
  }
}
