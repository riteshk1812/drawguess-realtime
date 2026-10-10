import { io as ioClient, type Socket } from 'socket.io-client'
import type { PublicRoomState } from '@drawguess/shared'
import { loadEnv } from '../config/env.js'
import { createServer } from '../create-server.js'
import { testBounds } from '../rooms/manager.js'

const rooms = Number(process.env.LOAD_ROOMS ?? 4)
const players = Number(process.env.LOAD_PLAYERS ?? 3)
const strokes = Number(process.env.LOAD_STROKES ?? 20)

const words = ['alphaone', 'bravotwo', 'charliez', 'deltazzz', 'echozzzz', 'foxtrotz', 'golfzzzz', 'hotelzzz', 'indiazzz', 'julietzz']

async function main(): Promise<void> {
  const startedCpu = process.cpuUsage()
  const startedAt = performance.now()
  const env = loadEnv({
    NODE_ENV: 'test',
    PORT: '3001',
    HOST: '127.0.0.1',
    CLIENT_ORIGIN: 'http://127.0.0.1:5173',
    LOG_LEVEL: 'silent',
    REDIS_URL: '',
    DATABASE_URL: '',
    RECONNECT_GRACE_MS: '30000',
  })
  const server = await createServer({ env, bounds: testBounds })
  await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', () => resolve()))
  const address = server.httpServer.address()
  const port = typeof address === 'object' && address ? address.port : 0
  const latencies: number[] = []
  let errors = 0
  const sockets: Socket[] = []
  try {
    for (let roomIndex = 0; roomIndex < rooms; roomIndex += 1) {
      const members: Socket[] = []
      for (let playerIndex = 0; playerIndex < players; playerIndex += 1) {
        const socket = ioClient(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true, reconnection: false })
        sockets.push(socket)
        members.push(socket)
        await once(socket, 'connect')
      }
      const host = members[0]
      if (!host) continue
      const created = await ask<{ ok: boolean; session?: { code: string }; state?: PublicRoomState; me?: { wordChoices?: { word: string }[] } }>(host, 'room:create', {
        playerName: `H${roomIndex}`,
        roomName: `Load ${roomIndex}`,
        settings: { rounds: 1, drawDurationSec: 60, wordSelectSec: 10, resultsSec: 5, capacity: 8, wordList: 'custom', customWords: words },
      })
      const code = created.session?.code
      if (!created.ok || !code) {
        errors += 1
        continue
      }
      for (let playerIndex = 1; playerIndex < members.length; playerIndex += 1) {
        const socket = members[playerIndex]
        if (!socket) continue
        const joined = await ask<{ ok: boolean }>(socket, 'room:join', { code, playerName: `P${roomIndex}${playerIndex}` })
        if (!joined.ok) errors += 1
      }
      const started = await ask<{ ok: boolean; state?: PublicRoomState; me?: { wordChoices?: { word: string }[] } }>(host, 'room:start', {})
      const turnId = started.state?.turnId
      const word = started.me?.wordChoices?.[0]?.word
      if (!started.ok || !turnId || !word) {
        errors += 1
        continue
      }
      await ask(host, 'word:select', { turnId, word })
      for (let stroke = 0; stroke < strokes; stroke += 1) {
        const began = performance.now()
        const ack = await ask<{ ok: boolean }>(host, 'draw:chunk', {
          turnId,
          opId: `stroke${roomIndex}${stroke}`.padEnd(8, 'a'),
          chunkId: `chunk${roomIndex}${stroke}${Date.now()}`.replace(/\W/g, '').slice(0, 24).padEnd(8, 'b'),
          tool: 'pen',
          color: '#112233',
          size: 6,
          points: [{ x: (stroke * 7) % 780, y: 40 }, { x: (stroke * 7 + 12) % 780, y: 70 }],
          done: stroke === strokes - 1,
        })
        latencies.push(performance.now() - began)
        if (!ack.ok) errors += 1
      }
    }
  } finally {
    for (const socket of sockets) socket.close()
    await server.close()
  }
  const elapsed = performance.now() - startedAt
  const cpu = process.cpuUsage(startedCpu)
  const sorted = [...latencies].sort((left, right) => left - right)
  const summary = {
    measured: true,
    rooms,
    playersPerRoom: players,
    strokesPerRoom: strokes,
    drawEvents: latencies.length,
    errors,
    elapsedMs: Math.round(elapsed),
    throughputPerSecond: Number((latencies.length / (elapsed / 1000)).toFixed(2)),
    latencyMs: {
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      max: Math.round(sorted[sorted.length - 1] ?? 0),
    },
    cpuMs: { user: Math.round(cpu.user / 1000), system: Math.round(cpu.system / 1000) },
    rssMb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)),
  }
  console.log(JSON.stringify(summary, null, 2))
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0
  const index = Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)
  return Math.round(values[index] ?? 0)
}

function ask<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(8000).emit(event, payload, (error: Error | null, response: T) => {
      if (error) reject(error)
      else resolve(response)
    })
  })
}

function once(socket: Socket, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once(event, () => resolve())
    socket.once('connect_error', (error) => reject(error))
  })
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
