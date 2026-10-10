import { RATE, TEST_LIMITS, type DrawChunkInput, type GameSettings, type SettingsBounds } from '@drawguess/shared'
import type { Server } from 'socket.io'
import { LIMITS } from '@drawguess/shared'
import { GameRoom, type CompletedGame, type RoomDeps, type RoomSnapshot } from '../game/room.js'
import type { Logger } from '../logger.js'
import type { HistoryStore } from '../persistence/history.js'
import type { RedisStore } from '../persistence/redis.js'
import { createId, createRoomCode } from '../security/ids.js'
import type { RateLimiter } from '../security/rate-limit.js'

export interface ClientResponse {
  ok: boolean
  error?: string
  code?: string
  state?: ReturnType<GameRoom['toPublicState']>
  me?: ReturnType<GameRoom['toPrivateState']>
  session?: { playerId: string; reconnectToken: string; roomId: string; code: string }
  changed?: boolean
  seq?: number
  close?: boolean
  correct?: boolean
  points?: number
}

interface Binding {
  roomId: string
  playerId: string
}

export class RoomManager {
  private readonly rooms = new Map<string, GameRoom>()
  private readonly codes = new Map<string, string>()
  private readonly sockets = new Map<string, Binding>()
  private readonly playerSockets = new Map<string, string>()
  private readonly timeouts = new Map<string, NodeJS.Timeout>()
  private readonly tokens = new Map<string, number>()
  private tokenSeq = 0
  private readonly savedHistory = new Set<string>()
  private sweepTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly io: Server,
    private readonly history: HistoryStore,
    private readonly redis: RedisStore | null,
    private readonly limiter: RateLimiter,
    private readonly logger: Logger,
    private readonly graceMs: number,
    private readonly bounds: SettingsBounds,
    private readonly now: () => number = Date.now,
  ) {
    this.sweepTimer = setInterval(() => this.sweep(), 15_000)
    this.sweepTimer.unref?.()
  }

  get historyKind(): string {
    return this.history.kind
  }

  get redisEnabled(): boolean {
    return this.redis !== null
  }

  async restore(): Promise<number> {
    if (!this.redis) return 0
    const snapshots = await this.redis.loadAll()
    for (const snapshot of snapshots) {
      try {
        const room = GameRoom.fromSnapshot(snapshot, this.deps())
        room.markDisconnectedForRecovery(this.now())
        this.rooms.set(room.id, room)
        this.codes.set(room.code, room.id)
        this.after(room)
      } catch (error) {
        this.logger.warn({ err: error instanceof Error ? error.message : 'snapshot' }, 'skipped room snapshot')
      }
    }
    return snapshots.length
  }

  async createRoom(socketId: string, input: { playerName: string; roomName: string; settings: GameSettings }, ip: string): Promise<ClientResponse> {
    if (!(await this.limiter.allow(`create:${ip}`, RATE.create.limit, RATE.create.windowMs))) {
      return { ok: false, code: 'rate', error: 'Too many rooms created. Wait a minute and try again.' }
    }
    if (this.rooms.size >= 500) return { ok: false, code: 'full', error: 'The server is hosting too many rooms' }
    const created = GameRoom.create({
      id: createId(16),
      code: this.uniqueCode(),
      name: input.roomName,
      hostName: input.playerName,
      settings: input.settings,
      deps: this.deps(),
    })
    if (!created.ok) return { ok: false, code: created.code, error: created.error }
    const { room, playerId, reconnectToken } = created.data
    this.rooms.set(room.id, room)
    this.codes.set(room.code, room.id)
    this.bind(socketId, room.id, playerId)
    this.after(room)
    return this.accepted(room, playerId, { playerId, reconnectToken, roomId: room.id, code: room.code })
  }

  async joinRoom(socketId: string, input: { code: string; playerName: string }, ip: string): Promise<ClientResponse> {
    if (!(await this.limiter.allow(`join:${ip}`, RATE.join.limit, RATE.join.windowMs))) {
      return { ok: false, code: 'rate', error: 'Too many join attempts. Wait a minute and try again.' }
    }
    const room = this.byCode(input.code)
    if (!room) return { ok: false, code: 'not_found', error: 'Room not found' }
    const joined = room.join(input.playerName, this.now())
    if (!joined.ok) return { ok: false, code: joined.code, error: joined.error }
    this.bind(socketId, room.id, joined.data.playerId)
    this.after(room)
    return this.accepted(room, joined.data.playerId, {
      playerId: joined.data.playerId,
      reconnectToken: joined.data.reconnectToken,
      roomId: room.id,
      code: room.code,
    })
  }

  async reconnect(socketId: string, input: { code: string; playerId: string; reconnectToken: string }): Promise<ClientResponse> {
    const room = this.byCode(input.code)
    if (!room) return { ok: false, code: 'not_found', error: 'Room no longer exists' }
    const result = room.reconnect(input.playerId, input.reconnectToken, this.now())
    if (!result.ok) return { ok: false, code: result.code, error: result.error }
    this.bind(socketId, room.id, result.data.playerId)
    this.after(room)
    return this.accepted(room, result.data.playerId, {
      playerId: result.data.playerId,
      reconnectToken: input.reconnectToken,
      roomId: room.id,
      code: room.code,
    })
  }

  async start(socketId: string): Promise<ClientResponse> {
    const bound = this.require(socketId)
    if (!bound.ok) return bound.response
    const result = bound.room.start(bound.playerId, this.now())
    if (!result.ok) return { ok: false, code: result.code, error: result.error }
    this.after(bound.room)
    return this.accepted(bound.room, bound.playerId)
  }

  async updateSettings(socketId: string, settings: GameSettings): Promise<ClientResponse> {
    const bound = this.require(socketId)
    if (!bound.ok) return bound.response
    const result = bound.room.updateSettings(bound.playerId, settings)
    if (!result.ok) return { ok: false, code: result.code, error: result.error }
    this.after(bound.room)
    return this.accepted(bound.room, bound.playerId)
  }

  async selectWord(socketId: string, turnId: string, word: string): Promise<ClientResponse> {
    const bound = this.require(socketId)
    if (!bound.ok) return bound.response
    if (!(await this.limiter.allow(`word:${bound.playerId}`, RATE.word.limit, RATE.word.windowMs))) {
      return { ok: false, code: 'rate', error: 'Slow down a moment' }
    }
    const result = bound.room.selectWord(bound.playerId, turnId, word, this.now())
    if (!result.ok) return { ok: false, code: result.code, error: result.error }
    this.after(bound.room)
    return this.accepted(bound.room, bound.playerId)
  }

  async text(socketId: string, text: string, turnId: string | null): Promise<ClientResponse> {
    const bound = this.require(socketId)
    if (!bound.ok) return bound.response
    const guessing = bound.room.phase === 'DRAWING' && bound.room.drawerId !== bound.playerId
    const rule = guessing ? RATE.guess : RATE.chat
    if (!(await this.limiter.allow(`${guessing ? 'guess' : 'chat'}:${bound.playerId}`, rule.limit, rule.windowMs))) {
      return { ok: false, code: 'rate', error: 'Slow down a moment' }
    }
    const result = bound.room.handleText(bound.playerId, text, turnId, this.now())
    if (!result.ok) return { ok: false, code: result.code, error: result.error }
    this.after(bound.room)
    if (result.data.close) this.io.to(socketId).emit('guess:feedback', { close: true })
    if (result.data.correct) this.io.to(socketId).emit('guess:feedback', { correct: true, points: result.data.points })
    return { ...this.accepted(bound.room, bound.playerId), correct: result.data.correct, close: result.data.close, points: result.data.points }
  }

  async draw(socketId: string, input: DrawChunkInput): Promise<ClientResponse> {
    const bound = this.require(socketId)
    if (!bound.ok) return bound.response
    if (!(await this.limiter.allow(`draw:${bound.playerId}`, RATE.draw.limit, RATE.draw.windowMs))) {
      return { ok: false, code: 'rate', error: 'Drawing too fast' }
    }
    const result = bound.room.applyDraw(bound.playerId, input, this.now())
    if (!result.ok) return { ok: false, code: result.code, error: result.error }
    if (result.data.changed) this.after(bound.room)
    return { ok: true, changed: result.data.changed, seq: result.data.seq }
  }

  async undo(socketId: string, turnId: string): Promise<ClientResponse> {
    return this.canvasCommand(socketId, turnId, 'undo', RATE.undo)
  }

  async clear(socketId: string, turnId: string): Promise<ClientResponse> {
    return this.canvasCommand(socketId, turnId, 'clear', RATE.clear)
  }

  async endGame(socketId: string): Promise<ClientResponse> {
    const bound = this.require(socketId)
    if (!bound.ok) return bound.response
    if (!(await this.limiter.allow(`end:${bound.playerId}`, RATE.end.limit, RATE.end.windowMs))) {
      return { ok: false, code: 'rate', error: 'Slow down a moment' }
    }
    const result = bound.room.endGame(bound.playerId, this.now())
    if (!result.ok) return { ok: false, code: result.code, error: result.error }
    this.after(bound.room)
    return this.accepted(bound.room, bound.playerId)
  }

  async leave(socketId: string): Promise<ClientResponse> {
    const bound = this.require(socketId)
    if (!bound.ok) return bound.response
    if (!(await this.limiter.allow(`leave:${bound.playerId}`, RATE.leave.limit, RATE.leave.windowMs))) {
      return { ok: false, code: 'rate', error: 'Slow down a moment' }
    }
    const result = bound.room.leave(bound.playerId, this.now())
    if (!result.ok) return { ok: false, code: result.code, error: result.error }
    this.release(socketId, bound.room.id)
    this.after(bound.room)
    return { ok: true }
  }

  async returnToLobby(socketId: string): Promise<ClientResponse> {
    const bound = this.require(socketId)
    if (!bound.ok) return bound.response
    const result = bound.room.returnToLobby(bound.playerId)
    if (!result.ok) return { ok: false, code: result.code, error: result.error }
    this.after(bound.room)
    return this.accepted(bound.room, bound.playerId)
  }

  async sync(socketId: string): Promise<ClientResponse> {
    const bound = this.require(socketId)
    if (!bound.ok) return bound.response
    if (!(await this.limiter.allow(`sync:${bound.playerId}`, RATE.sync.limit, RATE.sync.windowMs))) {
      return { ok: false, code: 'rate', error: 'Slow down a moment' }
    }
    this.broadcast(bound.room)
    return this.accepted(bound.room, bound.playerId)
  }

  socketClosed(socketId: string): void {
    const binding = this.sockets.get(socketId)
    if (!binding) return
    this.sockets.delete(socketId)
    const key = playerKey(binding.roomId, binding.playerId)
    if (this.playerSockets.get(key) !== socketId) return
    this.playerSockets.delete(key)
    const room = this.rooms.get(binding.roomId)
    if (!room) return
    room.disconnect(binding.playerId, this.now())
    this.after(room)
  }

  handleTimer(roomId: string, token: number): void {
    if (this.tokens.get(roomId) !== token) return
    const room = this.rooms.get(roomId)
    if (!room) return
    room.catchUp(this.now())
    this.after(room)
  }

  async recent(limit: number): Promise<CompletedGame[]> {
    return this.history.recent(limit)
  }

  async close(): Promise<void> {
    if (this.sweepTimer) clearInterval(this.sweepTimer)
    for (const timeout of this.timeouts.values()) clearTimeout(timeout)
    this.timeouts.clear()
  }

  limits(): SettingsBounds {
    return this.bounds
  }

  private async canvasCommand(socketId: string, turnId: string, kind: 'undo' | 'clear', rule: { limit: number; windowMs: number }): Promise<ClientResponse> {
    const bound = this.require(socketId)
    if (!bound.ok) return bound.response
    if (!(await this.limiter.allow(`${kind}:${bound.playerId}`, rule.limit, rule.windowMs))) {
      return { ok: false, code: 'rate', error: 'Slow down a moment' }
    }
    const result = kind === 'undo'
      ? bound.room.undo(bound.playerId, turnId, this.now())
      : bound.room.clearCanvas(bound.playerId, turnId, this.now())
    if (!result.ok) return { ok: false, code: result.code, error: result.error }
    this.after(bound.room)
    return this.accepted(bound.room, bound.playerId)
  }

  private release(socketId: string, roomId: string): void {
    const binding = this.sockets.get(socketId)
    if (!binding || binding.roomId !== roomId) return
    this.sockets.delete(socketId)
    const key = playerKey(roomId, binding.playerId)
    if (this.playerSockets.get(key) === socketId) this.playerSockets.delete(key)
    this.io.sockets.sockets.get(socketId)?.leave(roomId)
  }

  private bind(socketId: string, roomId: string, playerId: string): void {
    const key = playerKey(roomId, playerId)
    const previous = this.playerSockets.get(key)
    if (previous && previous !== socketId) {
      this.sockets.delete(previous)
      const old = this.io.sockets.sockets.get(previous)
      old?.emit('session:replaced', { error: 'This player connected somewhere else' })
      old?.disconnect(true)
    }
    this.sockets.set(socketId, { roomId, playerId })
    this.playerSockets.set(key, socketId)
    this.io.sockets.sockets.get(socketId)?.join(roomId)
  }

  private require(socketId: string): { ok: true; room: GameRoom; playerId: string } | { ok: false; response: ClientResponse } {
    const binding = this.sockets.get(socketId)
    if (!binding) return { ok: false, response: { ok: false, code: 'forbidden', error: 'Join a room first' } }
    const room = this.rooms.get(binding.roomId)
    if (!room) return { ok: false, response: { ok: false, code: 'not_found', error: 'Room no longer exists' } }
    return { ok: true, room, playerId: binding.playerId }
  }

  private byCode(code: string): GameRoom | undefined {
    const id = this.codes.get(code.toUpperCase())
    if (!id) return undefined
    return this.rooms.get(id)
  }

  private uniqueCode(): string {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = createRoomCode()
      if (!this.codes.has(code)) return code
    }
    return createRoomCode() + createRoomCode().slice(0, 2)
  }

  private after(room: GameRoom): void {
    if (room.playerCount === 0) {
      this.deleteRoom(room)
      return
    }
    room.catchUp(this.now())
    if (room.playerCount === 0) {
      this.deleteRoom(room)
      return
    }
    this.arm(room)
    this.broadcast(room)
    void this.persist(room)
    void this.saveHistory(room)
  }

  private broadcast(room: GameRoom): void {
    const state = room.toPublicState(this.now())
    this.io.to(room.id).emit('room:state', state)
    for (const [key, socketId] of this.playerSockets) {
      if (!key.startsWith(`${room.id}:`)) continue
      const playerId = key.slice(room.id.length + 1)
      this.io.to(socketId).emit('player:private', room.toPrivateState(playerId))
    }
  }

  private arm(room: GameRoom): void {
    const existing = this.timeouts.get(room.id)
    if (existing) clearTimeout(existing)
    const token = ++this.tokenSeq
    this.tokens.set(room.id, token)
    const wake = room.nextWake(this.now())
    if (!wake) {
      this.timeouts.delete(room.id)
      return
    }
    const delay = Math.max(0, wake.at - this.now())
    const timeout = setTimeout(() => this.handleTimer(room.id, token), delay)
    timeout.unref?.()
    this.timeouts.set(room.id, timeout)
  }

  private sweep(): void {
    for (const room of [...this.rooms.values()]) {
      room.sweepExpired(this.now())
      this.after(room)
    }
  }

  private deleteRoom(room: GameRoom): void {
    const timeout = this.timeouts.get(room.id)
    if (timeout) clearTimeout(timeout)
    this.timeouts.delete(room.id)
    this.tokens.delete(room.id)
    this.rooms.delete(room.id)
    this.codes.delete(room.code)
    if (this.redis) void this.redis.delete({ id: room.id, code: room.code }).catch(() => undefined)
  }

  private async persist(room: GameRoom): Promise<void> {
    if (!this.redis) return
    try {
      await this.redis.save(room.toSnapshot())
    } catch (error) {
      this.logger.warn({ err: error instanceof Error ? error.message : 'redis' }, 'room snapshot failed')
    }
  }

  private async saveHistory(room: GameRoom): Promise<void> {
    const record = room.toHistory()
    if (!record || this.savedHistory.has(record.id)) return
    this.savedHistory.add(record.id)
    try {
      await this.history.save(record)
    } catch (error) {
      this.savedHistory.delete(record.id)
      this.logger.warn({ err: error instanceof Error ? error.message : 'history' }, 'history save failed')
    }
  }

  private accepted(room: GameRoom, playerId: string, session?: ClientResponse['session']): ClientResponse {
    return {
      ok: true,
      state: room.toPublicState(this.now()),
      me: room.toPrivateState(playerId),
      ...(session ? { session } : {}),
    }
  }

  private deps(): RoomDeps {
    return { now: this.now, rng: Math.random, graceMs: this.graceMs }
  }
}

function playerKey(roomId: string, playerId: string): string {
  return `${roomId}:${playerId}`
}

export const defaultBounds: SettingsBounds = {
  minDrawSec: LIMITS.minDrawSec,
  minSelectSec: LIMITS.minSelectSec,
  minResultsSec: LIMITS.minResultsSec,
}

export const testBounds: SettingsBounds = {
  minDrawSec: TEST_LIMITS.minDrawSec,
  minSelectSec: TEST_LIMITS.minSelectSec,
  minResultsSec: TEST_LIMITS.minResultsSec,
}

export type { RoomSnapshot }
