import { io as ioClient, type Socket } from 'socket.io-client'
import { afterEach, describe, expect, it } from 'vitest'
import type { PrivateView, PublicRoomState } from '@drawguess/shared'
import { loadEnv } from '../config/env.js'
import { createServer, type AppServer } from '../create-server.js'
import { testBounds } from '../rooms/manager.js'

const WORDS = [
  'xylophonezz',
  'quokkaaaaa',
  'lanternzzz',
  'marblezzzz',
  'cactuszzzz',
  'violinzzzz',
  'pumpkinzzz',
  'sapphirezz',
  'tornadozzzz',
  'backpackzz',
]

const settings = {
  rounds: 1,
  drawDurationSec: 30,
  wordSelectSec: 10,
  resultsSec: 5,
  capacity: 6,
  wordList: 'custom' as const,
  customWords: WORDS,
}

const open: AppServer[] = []
const sockets: Socket[] = []

describe('socket gameplay', () => {
  afterEach(async () => {
    for (const socket of sockets) socket.close()
    sockets.length = 0
    for (const server of open) await server.close()
    open.length = 0
  })

  it('plays a round, syncs strokes, and hides the secret from guessers', async () => {
    const server = await boot(30_000)
    const ada = await connect(server.env.port)
    const bea = await connect(server.env.port)
    const cy = await connect(server.env.port)
    collect(ada)
    const beaEvents = collect(bea)

    const created = await ask<Ack>(ada, 'room:create', { playerName: 'Ada', roomName: 'Friday', settings })
    expect(created.ok).toBe(true)
    const code = created.session?.code ?? ''
    const joined = await ask<Ack>(bea, 'room:join', { code, playerName: 'Bea' })
    expect(joined.ok).toBe(true)
    expect(joined.state?.code).toBe(code)
    const third = await ask<Ack>(cy, 'room:join', { code, playerName: 'Cy' })
    expect(third.ok).toBe(true)

    const started = await ask<Ack>(ada, 'room:start', {})
    expect(started.ok).toBe(true)
    const choices = started.me?.wordChoices ?? []
    expect(choices).toHaveLength(3)
    const secret = choices[0]?.word ?? ''
    expect(secret.length).toBeGreaterThan(4)

    const selected = await ask<Ack>(ada, 'word:select', { turnId: started.state?.turnId, word: secret })
    expect(selected.ok).toBe(true)
    expect(selected.me?.secretWord).toBe(secret)
    const beaPrivate = latest(beaEvents, 'player:private') as PrivateView
    const beaState = latest(beaEvents, 'room:state') as PublicRoomState
    expect(beaPrivate.secretWord).toBeNull()
    expect(beaPrivate.wordChoices).toBeNull()
    expect(containsWord(beaState, secret)).toBe(false)
    for (const choice of choices) expect(containsWord(beaEvents.map((entry) => entry.payload), choice.word)).toBe(false)

    const turnId = selected.state?.turnId ?? ''
    const drawn = await ask<Ack>(ada, 'draw:chunk', {
      turnId,
      opId: 'stroke0001',
      chunkId: 'chunk00001',
      tool: 'pen',
      color: '#112233',
      size: 8,
      points: [{ x: 12, y: 16 }, { x: 40, y: 48 }],
      done: false,
    })
    expect(drawn.ok).toBe(true)
    await waitFor(() => beaEvents.some((entry) => entry.event === 'room:state' && containsWord(entry.payload, 'stroke0001')))
    const seen = latest(beaEvents, 'room:state') as PublicRoomState
    expect(seen.scene.some((item) => item.kind === 'stroke' && item.opId === 'stroke0001')).toBe(true)

    const sneaky = await ask<Ack>(bea, 'draw:chunk', {
      turnId,
      opId: 'sneaky0001',
      chunkId: 'sneakych1',
      tool: 'pen',
      color: '#ff0000',
      size: 8,
      points: [{ x: 4, y: 4 }],
      done: true,
    })
    expect(sneaky.ok).toBe(false)

    ada.emit('score:set', { score: 9999 })
    ada.emit('timer:end', { turnId })
    await delay(30)
    const near = `${secret.slice(0, -1)}${secret.endsWith('a') ? 'b' : 'a'}`
    const close = await ask<Ack>(bea, 'chat:send', { text: near, turnId })
    expect(close.ok && close.close).toBe(true)
    const correct = await ask<Ack>(bea, 'chat:send', { text: secret, turnId })
    expect(correct.ok && correct.correct).toBe(true)
    expect(correct.points).toBeGreaterThan(0)
    const again = await ask<Ack>(bea, 'chat:send', { text: secret, turnId })
    expect(again.ok).toBe(false)
    const finished = await ask<Ack>(cy, 'chat:send', { text: secret, turnId })
    expect(finished.ok && finished.correct).toBe(true)
    const after = latest(beaEvents, 'room:state') as PublicRoomState
    expect(after.phase).toBe('ROUND_RESULTS')
    expect(after.roundResult?.word).toBe(secret)
    expect(after.players.find((player) => player.name === 'Ada')?.score).toBeGreaterThan(0)
    expect(containsWord(beaEvents.filter((entry) => entry.event !== 'room:state' || (entry.payload as PublicRoomState).phase !== 'ROUND_RESULTS').map((entry) => entry.payload), secret)).toBe(false)
  })

  it('reconnects inside the grace window and rejects a late return', async () => {
    const server = await boot(1000)
    const ada = await connect(server.env.port)
    const bea = await connect(server.env.port)
    const created = await ask<Ack>(ada, 'room:create', {
      playerName: 'Ada',
      roomName: 'Reconnect',
      settings: { ...settings, drawDurationSec: 20 },
    })
    const code = created.session?.code ?? ''
    await ask(bea, 'room:join', { code, playerName: 'Bea' })
    ada.close()
    const next = await connect(server.env.port)
    const resumed = await ask<Ack>(next, 'room:reconnect', {
      code,
      playerId: created.session?.playerId,
      reconnectToken: created.session?.reconnectToken,
    })
    expect(resumed.ok).toBe(true)
    expect(resumed.me?.playerId).toBe(created.session?.playerId)
    next.close()
    await delay(1300)
    const late = await connect(server.env.port)
    const expired = await ask<Ack>(late, 'room:reconnect', {
      code,
      playerId: created.session?.playerId,
      reconnectToken: created.session?.reconnectToken,
    })
    expect(expired.ok).toBe(false)
    expect(expired.code).toBe('expired')
  })

  it('rejects oversized and flooded input', async () => {
    const server = await boot(30_000)
    const ada = await connect(server.env.port)
    const bea = await connect(server.env.port)
    const created = await ask<Ack>(ada, 'room:create', { playerName: 'Ada', roomName: 'Limits', settings })
    await ask(bea, 'room:join', { code: created.session?.code, playerName: 'Bea' })
    await ask(ada, 'room:start', {})
    const huge = await ask<Ack>(ada, 'draw:chunk', {
      turnId: 'abcdabcd',
      opId: 'stroke0001',
      chunkId: 'chunk00001',
      tool: 'pen',
      color: 'red',
      size: 4,
      points: Array.from({ length: 501 }, () => ({ x: 1, y: 1 })),
      done: true,
    })
    expect(huge.ok).toBe(false)
    let blocked = false
    for (let index = 0; index < 10; index += 1) {
      const response = await ask<Ack>(bea, 'chat:send', { text: `hello ${index}`, turnId: null })
      if (!response.ok && response.code === 'rate') blocked = true
    }
    expect(blocked).toBe(true)
  })
})

interface Ack {
  ok: boolean
  error?: string
  code?: string
  state?: PublicRoomState
  me?: PrivateView
  session?: { playerId: string; reconnectToken: string; roomId: string; code: string }
  close?: boolean
  correct?: boolean
  points?: number
}

async function boot(graceMs: number): Promise<AppServer> {
  const env = loadEnv({
    NODE_ENV: 'test',
    PORT: '3001',
    HOST: '127.0.0.1',
    CLIENT_ORIGIN: 'http://127.0.0.1:5173',
    LOG_LEVEL: 'silent',
    REDIS_URL: '',
    DATABASE_URL: '',
    RECONNECT_GRACE_MS: String(graceMs),
  })
  const server = await createServer({ env, bounds: testBounds })
  await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', () => resolve()))
  const address = server.httpServer.address()
  const port = typeof address === 'object' && address ? address.port : 0
  server.env.port = port
  open.push(server)
  return server
}

async function connect(port: number): Promise<Socket> {
  const socket = ioClient(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true, reconnection: false })
  sockets.push(socket)
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve())
    socket.once('connect_error', (error) => reject(error))
  })
  return socket
}

function ask<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(5_000).emit(event, payload, (error: Error | null, response: T) => {
      if (error) reject(error)
      else resolve(response)
    })
  })
}

function collect(socket: Socket): { event: string; payload: unknown }[] {
  const events: { event: string; payload: unknown }[] = []
  socket.onAny((event, payload) => events.push({ event, payload }))
  return events
}

function latest(events: { event: string; payload: unknown }[], name: string): unknown {
  return [...events].reverse().find((entry) => entry.event === name)?.payload
}

function containsWord(value: unknown, word: string): boolean {
  if (typeof value === 'string') return value.toLowerCase().includes(word.toLowerCase())
  if (Array.isArray(value)) return value.some((item) => containsWord(item, word))
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).some((item) => containsWord(item, word))
  return false
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor(check: () => boolean): Promise<void> {
  const started = Date.now()
  while (!check()) {
    if (Date.now() - started > 2000) throw new Error('timed out waiting for a room event')
    await delay(20)
  }
}
