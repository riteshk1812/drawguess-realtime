import {
  answersMatch,
  applyChunkToScene,
  builtinWords,
  clearScene,
  drawerPoints,
  guesserPoints,
  isCloseGuess,
  maskWord,
  nextHintAt,
  normalizePlayerName,
  normalizeRoomName,
  pickReveals,
  pickWordChoices,
  undoScene,
  type ArchivedRound,
  type ChatMessage,
  type DrawChunkInput,
  type GameSettings,
  type LeaderboardEntry,
  type Phase,
  type PrivateView,
  type PublicRoomState,
  type PublicSettings,
  type ReplayEvent,
  type RoundResult,
  type SceneItem,
  type WordChoice,
} from '@drawguess/shared'
import { createId, createToken, tokenHash, tokenMatches } from '../security/ids.js'

export interface RoomDeps {
  now: () => number
  rng: () => number
  graceMs: number
}

interface PlayerState {
  id: string
  name: string
  joinedAt: number
  score: number
  connected: boolean
  disconnectAt: number | null
  tokenHash: string
}

interface ScheduleEntry {
  round: number
  drawerId: string
}

interface CorrectGuess {
  playerId: string
  at: number
  points: number
  order: number
}

interface TurnState {
  id: string
  round: number
  drawerId: string
  choices: WordChoice[] | null
  secret: string | null
  revealed: number[]
  hint: string | null
  hintStage: number
  selectionEndsAt: number | null
  drawStartedAt: number | null
  drawEndsAt: number | null
  resultsEndsAt: number | null
  drawerHoldEndsAt: number | null
  scene: SceneItem[]
  replay: ReplayEvent[]
  seq: number
  seen: string[]
  eligibleIds: string[]
  correct: CorrectGuess[]
  roundResult: RoundResult | null
}

export interface RoomSnapshot {
  version: 1
  id: string
  code: string
  name: string
  createdAt: number
  settings: GameSettings
  hostId: string
  phase: Phase
  players: PlayerState[]
  round: number
  schedule: ScheduleEntry[]
  turnIndex: number
  turn: TurnState | null
  chat: ChatMessage[]
  archives: ArchivedRound[]
  leaderboard: LeaderboardEntry[] | null
  systemMessage: string | null
  usedWords: string[]
  graceMs: number
  finishedAt: number | null
  historyId: string | null
}

export type GameResult<T> = { ok: true; data: T } | { ok: false; code: string; error: string }

export interface TextOutcome {
  correct: boolean
  close: boolean
  points: number
}

export interface CompletedGame {
  id: string
  roomId: string
  code: string
  name: string
  finishedAt: number
  leaderboard: LeaderboardEntry[]
  archives: ArchivedRound[]
  settings: PublicSettings
}

type WakeKind = 'select' | 'hint' | 'draw' | 'results' | 'drawer_hold'

const ok = <T>(data: T): GameResult<T> => ({ ok: true, data })
const fail = (code: string, error: string): GameResult<never> => ({ ok: false, code, error })

export class GameRoom {
  readonly id: string
  readonly code: string
  name: string
  readonly createdAt: number
  settings: GameSettings
  hostId: string
  phase: Phase = 'WAITING'
  private players: PlayerState[] = []
  round = 0
  private schedule: ScheduleEntry[] = []
  private turnIndex = 0
  private turn: TurnState | null = null
  private chat: ChatMessage[] = []
  private archives: ArchivedRound[] = []
  private leaderboard: LeaderboardEntry[] | null = null
  private systemMessage: string | null = null
  private usedWords: string[] = []
  private finishedAt: number | null = null
  private historyId: string | null = null
  private readonly deps: RoomDeps

  private constructor(snapshot: RoomSnapshot, deps: RoomDeps) {
    this.deps = deps
    this.id = snapshot.id
    this.code = snapshot.code
    this.name = snapshot.name
    this.createdAt = snapshot.createdAt
    this.settings = snapshot.settings
    this.hostId = snapshot.hostId
    this.phase = snapshot.phase
    this.players = snapshot.players
    this.round = snapshot.round
    this.schedule = snapshot.schedule
    this.turnIndex = snapshot.turnIndex
    this.turn = snapshot.turn
    this.chat = snapshot.chat
    this.archives = snapshot.archives
    this.leaderboard = snapshot.leaderboard
    this.systemMessage = snapshot.systemMessage
    this.usedWords = snapshot.usedWords
    this.finishedAt = snapshot.finishedAt
    this.historyId = snapshot.historyId
  }

  static create(input: {
    id: string
    code: string
    name: string
    hostName: string
    settings: GameSettings
    deps: RoomDeps
  }): GameResult<{ room: GameRoom; playerId: string; reconnectToken: string }> {
    const roomName = normalizeRoomName(input.name)
    const hostName = normalizePlayerName(input.hostName)
    if (!roomName) return fail('invalid', 'Room name must be 1–40 characters')
    if (!hostName) return fail('invalid', 'Name must be 1–16 letters, numbers, or spaces')
    const now = input.deps.now()
    const reconnectToken = createToken()
    const host: PlayerState = {
      id: createId(16),
      name: hostName,
      joinedAt: now,
      score: 0,
      connected: true,
      disconnectAt: null,
      tokenHash: tokenHash(reconnectToken),
    }
    const snapshot: RoomSnapshot = {
      version: 1,
      id: input.id,
      code: input.code,
      name: roomName,
      createdAt: now,
      settings: input.settings,
      hostId: host.id,
      phase: 'WAITING',
      players: [host],
      round: 0,
      schedule: [],
      turnIndex: 0,
      turn: null,
      chat: [],
      archives: [],
      leaderboard: null,
      systemMessage: 'Waiting for players.',
      usedWords: [],
      graceMs: input.deps.graceMs,
      finishedAt: null,
      historyId: null,
    }
    const room = new GameRoom(snapshot, input.deps)
    room.pushSystem(`${hostName} created the room.`)
    return ok({ room, playerId: host.id, reconnectToken })
  }

  static fromSnapshot(snapshot: RoomSnapshot, deps: RoomDeps): GameRoom {
    if (snapshot.version !== 1) throw new Error('Unsupported room snapshot')
    return new GameRoom(snapshot, deps)
  }

  get playerCount(): number {
    return this.players.length
  }

  get turnId(): string | null {
    return this.turn?.id ?? null
  }

  get drawerId(): string | null {
    return this.turn?.drawerId ?? null
  }

  markDisconnectedForRecovery(now: number): void {
    for (const player of this.players) {
      player.connected = false
      player.disconnectAt = now
    }
    if (this.turn && (this.phase === 'DRAWING' || this.phase === 'WORD_SELECTION')) {
      this.turn.drawerHoldEndsAt = now + this.deps.graceMs
    }
    this.systemMessage = 'Server restarted. Reconnect within 30 seconds to keep your place.'
  }

  join(nameRaw: string, now: number): GameResult<{ playerId: string; reconnectToken: string }> {
    this.sweepExpired(now)
    if (this.players.length >= this.settings.capacity) return fail('full', 'This room is full')
    const name = normalizePlayerName(nameRaw)
    if (!name) return fail('invalid', 'Name must be 1–16 letters, numbers, or spaces')
    if (this.players.some((player) => player.name.toLowerCase() === name.toLowerCase())) {
      return fail('invalid', 'That name is already in the room')
    }
    const reconnectToken = createToken()
    const player: PlayerState = {
      id: createId(16),
      name,
      joinedAt: now,
      score: 0,
      connected: true,
      disconnectAt: null,
      tokenHash: tokenHash(reconnectToken),
    }
    this.players.push(player)
    this.addToFutureRounds(player.id)
    if (this.phase === 'DRAWING' && this.turn && player.id !== this.turn.drawerId) {
      this.turn.eligibleIds.push(player.id)
    }
    this.pushSystem(`${name} joined.`)
    return ok({ playerId: player.id, reconnectToken })
  }

  reconnect(playerId: string, token: string, now: number): GameResult<{ playerId: string }> {
    const player = this.player(playerId)
    if (!player || !tokenMatches(token, player.tokenHash)) return fail('forbidden', 'Invalid session')
    if (!player.connected && player.disconnectAt !== null && now - player.disconnectAt > this.deps.graceMs) {
      this.removePlayer(player.id, now)
      this.sweepExpired(now)
      return fail('expired', 'Reconnect window expired')
    }
    this.sweepExpired(now)
    const resumed = !player.connected
    player.connected = true
    player.disconnectAt = null
    if (this.turn?.drawerId === player.id) this.turn.drawerHoldEndsAt = null
    if (resumed) this.pushSystem(`${player.name} reconnected.`)
    return ok({ playerId: player.id })
  }

  disconnect(playerId: string, now: number): void {
    const player = this.player(playerId)
    if (!player || !player.connected) return
    player.connected = false
    player.disconnectAt = now
    if (this.hostId === playerId) {
      const next = this.pickHost(playerId)
      if (next) this.hostId = next
    }
    if (this.turn && (this.phase === 'DRAWING' || this.phase === 'WORD_SELECTION') && this.turn.drawerId === playerId) {
      this.turn.drawerHoldEndsAt = now + this.deps.graceMs
    }
    this.pushSystem(`${player.name} disconnected.`)
  }

  sweepExpired(now: number): string[] {
    const removed: string[] = []
    for (const player of [...this.players]) {
      if (!player.connected && player.disconnectAt !== null && now - player.disconnectAt > this.deps.graceMs) {
        removed.push(player.id)
        this.removePlayer(player.id, now)
      }
    }
    return removed
  }

  updateSettings(playerId: string, settings: GameSettings): GameResult<null> {
    if (playerId !== this.hostId) return fail('forbidden', 'Only the host can change settings')
    if (this.phase !== 'WAITING') return fail('phase', 'Settings can only change in the lobby')
    this.settings = settings
    this.pushSystem('Game settings updated.')
    return ok(null)
  }

  start(playerId: string, now: number): GameResult<null> {
    if (playerId !== this.hostId) return fail('forbidden', 'Only the host can start the game')
    if (this.phase !== 'WAITING') return fail('phase', 'The game has already started')
    if (this.connectedCount() < 2) return fail('invalid', 'At least two connected players are required')
    if (this.wordPool().length < 3) return fail('invalid', 'The word list needs at least three words')
    for (const player of this.players) player.score = 0
    this.archives = []
    this.leaderboard = null
    this.usedWords = []
    this.finishedAt = null
    this.historyId = null
    this.chat = []
    this.buildSchedule()
    this.turnIndex = 0
    this.turn = null
    this.pushSystem('Game started.')
    this.beginTurn(now)
    return ok(null)
  }

  selectWord(playerId: string, turnId: string, word: string, now: number): GameResult<null> {
    if (this.phase !== 'WORD_SELECTION' || !this.turn || this.turn.id !== turnId) {
      return fail('phase', 'Word selection is closed')
    }
    if (playerId !== this.turn.drawerId) return fail('forbidden', 'Only the drawer can choose a word')
    const match = this.turn.choices?.find((choice) => choice.word.toLowerCase() === word.trim().toLowerCase())
    if (!match) return fail('invalid', 'Choose one of the offered words')
    this.beginDrawing(match.word, now)
    return ok(null)
  }

  handleText(playerId: string, text: string, turnId: string | null, now: number): GameResult<TextOutcome> {
    const cleaned = text.trim().slice(0, 120)
    if (!cleaned) return fail('invalid', 'Message is empty')
    if (this.phase === 'DRAWING' && this.turn && playerId !== this.turn.drawerId) {
      if (turnId !== this.turn.id) return fail('phase', 'That turn has ended')
      const already = this.turn.correct.some((guess) => guess.playerId === playerId)
      if (already) {
        if (this.turn.secret && answersMatch(cleaned, this.turn.secret)) {
          return fail('invalid', 'You already guessed the word')
        }
        return this.postChat(playerId, cleaned, now)
      }
      return this.submitGuess(playerId, cleaned, now)
    }
    return this.postChat(playerId, cleaned, now)
  }

  applyDraw(playerId: string, input: DrawChunkInput, now: number): GameResult<{ changed: boolean; seq: number }> {
    if (this.phase !== 'DRAWING' || !this.turn || this.turn.id !== input.turnId) {
      return fail('phase', 'You cannot draw right now')
    }
    if (playerId !== this.turn.drawerId) return fail('forbidden', 'Only the drawer can draw')
    const drawer = this.player(playerId)
    if (!drawer?.connected) return fail('forbidden', 'The drawer is disconnected')
    if (this.turn.seen.includes(input.chunkId)) return ok({ changed: false, seq: this.turn.seq })
    if (this.turn.scene.length >= 400 && !this.turn.scene.some((item) => item.opId === input.opId)) {
      return fail('invalid', 'Canvas is full. Undo or clear to continue')
    }
    const applied = applyChunkToScene(this.turn.scene, {
      opId: input.opId,
      tool: input.tool,
      color: input.color,
      size: input.size,
      points: input.points,
      done: input.done,
    })
    this.turn.seen.push(input.chunkId)
    if (this.turn.seen.length > 800) this.turn.seen.splice(0, this.turn.seen.length - 800)
    if (!applied.changed) return ok({ changed: false, seq: this.turn.seq })
    this.turn.scene = applied.scene
    this.turn.seq += 1
    if (input.tool === 'fill') {
      const point = input.points[0]
      if (point) {
        this.turn.replay.push({
          type: 'fill',
          opId: input.opId,
          color: input.tool === 'fill' ? input.color : '#ffffff',
          x: point.x,
          y: point.y,
          t: now,
        })
      }
    } else if (applied.delta.length > 0) {
      this.turn.replay.push({
        type: 'points',
        opId: input.opId,
        tool: input.tool === 'eraser' ? 'eraser' : 'pen',
        color: input.tool === 'eraser' ? '#ffffff' : input.color,
        size: input.size,
        points: applied.delta,
        t: now,
      })
    }
    return ok({ changed: true, seq: this.turn.seq })
  }

  undo(playerId: string, turnId: string, now: number): GameResult<null> {
    if (this.phase !== 'DRAWING' || !this.turn || this.turn.id !== turnId) return fail('phase', 'You cannot undo right now')
    if (playerId !== this.turn.drawerId) return fail('forbidden', 'Only the drawer can undo')
    const next = undoScene(this.turn.scene)
    if (!next) return fail('invalid', 'Nothing to undo')
    this.turn.scene = next
    this.turn.seq += 1
    this.turn.replay.push({ type: 'undo', t: now })
    return ok(null)
  }

  clearCanvas(playerId: string, turnId: string, now: number): GameResult<null> {
    if (this.phase !== 'DRAWING' || !this.turn || this.turn.id !== turnId) return fail('phase', 'You cannot clear right now')
    if (playerId !== this.turn.drawerId) return fail('forbidden', 'Only the drawer can clear')
    const opId = createId(8)
    this.turn.scene = clearScene(this.turn.scene, opId)
    this.turn.seq += 1
    this.turn.replay.push({ type: 'clear', opId, t: now })
    return ok(null)
  }

  returnToLobby(playerId: string): GameResult<null> {
    if (playerId !== this.hostId) return fail('forbidden', 'Only the host can return to the lobby')
    if (this.phase !== 'GAME_RESULTS' && this.phase !== 'WAITING') {
      return fail('phase', 'Finish the game before returning to the lobby')
    }
    for (const player of this.players) player.score = 0
    this.phase = 'WAITING'
    this.turn = null
    this.schedule = []
    this.turnIndex = 0
    this.round = 0
    this.archives = []
    this.leaderboard = null
    this.usedWords = []
    this.finishedAt = null
    this.historyId = null
    this.chat = []
    this.systemMessage = 'Back in the lobby. Scores were reset.'
    this.pushSystem('Back in the lobby. Scores were reset.')
    return ok(null)
  }

  endGame(playerId: string, now: number): GameResult<null> {
    const player = this.player(playerId)
    if (!player?.connected) return fail('forbidden', 'You are not connected')
    if (playerId !== this.hostId) return fail('forbidden', 'Only the host can end the game')
    if (this.phase === 'WAITING' || this.phase === 'GAME_RESULTS') return fail('phase', 'There is no game to end')
    if (this.phase === 'DRAWING' && this.turn) {
      for (const guess of this.turn.correct) {
        const guesser = this.player(guess.playerId)
        if (guesser) guesser.score = Math.max(0, guesser.score - guess.points)
      }
    }
    this.turn = null
    this.pushSystem(`${player.name} ended the game.`)
    this.finishGame(now)
    return ok(null)
  }

  leave(playerId: string, now: number): GameResult<null> {
    const player = this.player(playerId)
    if (!player) return fail('forbidden', 'You are not in this room')
    this.removePlayer(playerId, now, `${player.name} left the game.`)
    return ok(null)
  }

  nextWake(now: number): { at: number; kind: WakeKind } | null {
    return this.scheduledWake(now)
  }

  private scheduledWake(_now: number): { at: number; kind: WakeKind } | null {
    const turn = this.turn
    if (!turn) return null
    if (this.phase === 'WORD_SELECTION' && turn.selectionEndsAt !== null) {
      const drawer = this.player(turn.drawerId)
      if (turn.drawerHoldEndsAt !== null && drawer && !drawer.connected && turn.drawerHoldEndsAt <= turn.selectionEndsAt) {
        return { at: turn.drawerHoldEndsAt, kind: 'drawer_hold' }
      }
      return { at: turn.selectionEndsAt, kind: 'select' }
    }
    if (this.phase === 'DRAWING' && turn.drawStartedAt !== null && turn.drawEndsAt !== null) {
      const events: { at: number; kind: WakeKind }[] = [{ at: turn.drawEndsAt, kind: 'draw' }]
      const hintAt = nextHintAt(turn.drawStartedAt, this.settings.drawDurationSec * 1000, turn.hintStage)
      if (hintAt !== null && hintAt < turn.drawEndsAt) events.push({ at: hintAt, kind: 'hint' })
      const drawer = this.player(turn.drawerId)
      if (turn.drawerHoldEndsAt !== null && drawer && !drawer.connected) {
        events.push({ at: turn.drawerHoldEndsAt, kind: 'drawer_hold' })
      }
      events.sort((left, right) => left.at - right.at || wakePriority(left.kind) - wakePriority(right.kind))
      return events[0] ?? null
    }
    if (this.phase === 'ROUND_RESULTS' && turn.resultsEndsAt !== null) {
      return { at: turn.resultsEndsAt, kind: 'results' }
    }
    return null
  }

  catchUp(now: number): number {
    let steps = 0
    while (steps < 16) {
      const wake = this.nextWake(now)
      if (!wake || wake.at > now) break
      const changed = this.wake(now, wake.kind)
      steps += 1
      if (!changed) break
    }
    return steps
  }

  toSnapshot(): RoomSnapshot {
    return {
      version: 1,
      id: this.id,
      code: this.code,
      name: this.name,
      createdAt: this.createdAt,
      settings: this.settings,
      hostId: this.hostId,
      phase: this.phase,
      players: this.players.map((player) => ({ ...player })),
      round: this.round,
      schedule: this.schedule.map((entry) => ({ ...entry })),
      turnIndex: this.turnIndex,
      turn: this.turn ? structuredClone(this.turn) : null,
      chat: this.chat.map((message) => ({ ...message })),
      archives: structuredClone(this.archives),
      leaderboard: this.leaderboard ? this.leaderboard.map((entry) => ({ ...entry })) : null,
      systemMessage: this.systemMessage,
      usedWords: [...this.usedWords],
      graceMs: this.deps.graceMs,
      finishedAt: this.finishedAt,
      historyId: this.historyId,
    }
  }

  toHistory(): CompletedGame | null {
    if (this.phase !== 'GAME_RESULTS' || !this.leaderboard || this.finishedAt === null || !this.historyId) return null
    return {
      id: this.historyId,
      roomId: this.id,
      code: this.code,
      name: this.name,
      finishedAt: this.finishedAt,
      leaderboard: this.leaderboard.map((entry) => ({ ...entry })),
      archives: structuredClone(this.archives),
      settings: this.publicSettings(),
    }
  }

  toPublicState(now = this.deps.now()): PublicRoomState {
    const turn = this.turn
    const showScene = this.phase === 'DRAWING' || this.phase === 'ROUND_RESULTS'
    return {
      id: this.id,
      code: this.code,
      name: this.name,
      phase: this.phase,
      settings: this.publicSettings(),
      hostId: this.hostId,
      round: this.phase === 'WAITING' || this.phase === 'GAME_RESULTS' ? this.round : turn?.round ?? this.round,
      totalRounds: this.settings.rounds,
      turnId: turn?.id ?? null,
      drawerId: turn?.drawerId ?? null,
      players: this.players.map((player) => {
        const guess = turn?.correct.find((item) => item.playerId === player.id)
        return {
          id: player.id,
          name: player.name,
          score: player.score,
          connected: player.connected,
          isHost: player.id === this.hostId,
          isDrawer: player.id === turn?.drawerId && (this.phase === 'DRAWING' || this.phase === 'WORD_SELECTION'),
          guessed: Boolean(guess),
          guessPoints: guess?.points ?? null,
        }
      }),
      hint: this.phase === 'DRAWING' ? turn?.hint ?? null : null,
      selectionEndsAt: this.phase === 'WORD_SELECTION' ? turn?.selectionEndsAt ?? null : null,
      drawEndsAt: this.phase === 'DRAWING' ? turn?.drawEndsAt ?? null : null,
      resultsEndsAt: this.phase === 'ROUND_RESULTS' ? turn?.resultsEndsAt ?? null : null,
      serverNow: now,
      chat: this.chat.map((message) => ({ ...message })),
      scene: showScene && turn ? turn.scene.map((item) => structuredClone(item)) : [],
      lastSeq: turn?.seq ?? 0,
      roundResult: this.phase === 'ROUND_RESULTS' ? turn?.roundResult ?? null : null,
      leaderboard: this.phase === 'GAME_RESULTS' ? this.leaderboard : null,
      archives: this.archives.map((round) => structuredClone(round)),
      systemMessage: this.systemMessage,
      connectedCount: this.connectedCount(),
    }
  }

  toPrivateState(playerId: string): PrivateView {
    const player = this.player(playerId)
    const isDrawer = Boolean(player && this.turn && player.id === this.turn.drawerId && (this.phase === 'DRAWING' || this.phase === 'WORD_SELECTION'))
    const guessed = Boolean(this.turn?.correct.some((guess) => guess.playerId === playerId))
    return {
      playerId,
      isHost: playerId === this.hostId,
      isDrawer,
      canDraw: Boolean(player?.connected && this.phase === 'DRAWING' && this.turn?.drawerId === playerId),
      canGuess: Boolean(player?.connected && this.phase === 'DRAWING' && this.turn && this.turn.drawerId !== playerId && !guessed),
      canStart: Boolean(player?.connected && playerId === this.hostId && this.phase === 'WAITING' && this.connectedCount() >= 2),
      canConfigure: Boolean(playerId === this.hostId && this.phase === 'WAITING'),
      canReturnToLobby: Boolean(playerId === this.hostId && (this.phase === 'GAME_RESULTS' || this.phase === 'WAITING')),
      canEndGame: Boolean(player?.connected && playerId === this.hostId && this.phase !== 'WAITING' && this.phase !== 'GAME_RESULTS'),
      secretWord: this.phase === 'DRAWING' && isDrawer ? this.turn?.secret ?? null : null,
      wordChoices: this.phase === 'WORD_SELECTION' && isDrawer ? this.turn?.choices ?? null : null,
      customWords: this.phase === 'WAITING' && playerId === this.hostId ? [...this.settings.customWords] : [],
    }
  }

  private submitGuess(playerId: string, text: string, now: number): GameResult<TextOutcome> {
    if (this.phase !== 'DRAWING' || !this.turn?.secret || !this.turn.drawEndsAt) {
      return fail('phase', 'You cannot guess right now')
    }
    const player = this.player(playerId)
    if (!player?.connected) return fail('forbidden', 'You are not connected')
    if (this.turn.correct.some((guess) => guess.playerId === playerId)) {
      return fail('invalid', 'You already guessed the word')
    }
    if (answersMatch(text, this.turn.secret)) {
      const points = guesserPoints({
        remainingMs: this.turn.drawEndsAt - now,
        durationMs: this.settings.drawDurationSec * 1000,
        orderIndex: this.turn.correct.length,
      })
      player.score += points
      this.turn.correct.push({
        playerId,
        at: now,
        points,
        order: this.turn.correct.length + 1,
      })
      this.pushChat({ kind: 'correct', playerId, name: player.name, text: `${player.name} guessed the word!`, at: now })
      if (this.allConnectedGuessed()) this.endDrawing(now, 'all_guessed')
      return ok({ correct: true, close: false, points })
    }
    const close = isCloseGuess(text, this.turn.secret)
    this.pushChat({ kind: 'guess', playerId, name: player.name, text, at: now })
    return ok({ correct: false, close, points: 0 })
  }

  private postChat(playerId: string, text: string, now: number): GameResult<TextOutcome> {
    const player = this.player(playerId)
    if (!player?.connected) return fail('forbidden', 'You are not connected')
    if (this.bannedWords().some((word) => answersMatch(text, word))) {
      return fail('forbidden', 'You cannot share the word')
    }
    this.pushChat({ kind: 'chat', playerId, name: player.name, text, at: now })
    return ok({ correct: false, close: false, points: 0 })
  }

  private wake(now: number, kind: WakeKind): boolean {
    const turn = this.turn
    if (!turn) return false
    if (kind === 'select') {
      if (this.phase !== 'WORD_SELECTION') return false
      const drawer = this.player(turn.drawerId)
      if (!drawer?.connected) {
        this.abortTurn(now, 'The drawer left. This turn was skipped.')
        return true
      }
      const choices = turn.choices ?? []
      const index = Math.min(choices.length - 1, Math.floor(this.deps.rng() * choices.length))
      const choice = choices[index]
      if (!choice) return false
      this.beginDrawing(choice.word, now)
      this.pushSystem(`${drawer.name} ran out of time. A word was chosen automatically.`)
      return true
    }
    if (kind === 'hint') {
      if (this.phase !== 'DRAWING' || !turn.secret || turn.drawStartedAt === null) return false
      const due = nextHintAt(turn.drawStartedAt, this.settings.drawDurationSec * 1000, turn.hintStage)
      if (due === null || due > now) return false
      turn.hintStage += 1
      turn.revealed = pickReveals(turn.secret, turn.revealed, turn.hintStage, this.deps.rng)
      turn.hint = maskWord(turn.secret, turn.revealed)
      return true
    }
    if (kind === 'draw') {
      if (this.phase !== 'DRAWING' || turn.drawEndsAt === null || turn.drawEndsAt > now) return false
      this.endDrawing(now, 'timeout')
      return true
    }
    if (kind === 'drawer_hold') {
      if (this.phase !== 'DRAWING' && this.phase !== 'WORD_SELECTION') return false
      const drawer = this.player(turn.drawerId)
      if (!drawer || drawer.connected) return false
      if (turn.drawerHoldEndsAt === null || now < turn.drawerHoldEndsAt) return false
      this.abortTurn(now, 'The drawer left. This turn was skipped.')
      return true
    }
    if (kind === 'results') {
      if (this.phase !== 'ROUND_RESULTS' || turn.resultsEndsAt === null || turn.resultsEndsAt > now) return false
      this.turnIndex += 1
      this.turn = null
      if (this.connectedCount() < 2) {
        this.suspendOrFinish(now, 'Not enough connected players to continue.')
        return true
      }
      this.beginTurn(now)
      return true
    }
    return false
  }

  private beginDrawing(word: string, now: number): void {
    if (!this.turn) return
    const duration = this.settings.drawDurationSec * 1000
    this.turn.secret = word
    this.turn.choices = null
    this.turn.revealed = []
    this.turn.hintStage = 0
    this.turn.hint = maskWord(word, [])
    this.turn.drawStartedAt = now
    this.turn.drawEndsAt = now + duration
    this.turn.selectionEndsAt = null
    this.phase = 'DRAWING'
    this.usedWords.push(word)
    const drawer = this.player(this.turn.drawerId)
    this.pushSystem(`${drawer?.name ?? 'The drawer'} is drawing.`)
  }

  private endDrawing(now: number, reason: 'timeout' | 'all_guessed'): void {
    const turn = this.turn
    if (this.phase !== 'DRAWING' || !turn || !turn.secret) return
    const secret = turn.secret
    const scores = turn.correct.map((guess) => guess.points)
    const bonus = drawerPoints(scores, turn.eligibleIds.length)
    const drawer = this.player(turn.drawerId)
    if (drawer) drawer.score += bonus
    const guessed = new Set(turn.correct.map((guess) => guess.playerId))
    turn.roundResult = {
      word: secret,
      drawerId: turn.drawerId,
      drawerName: drawer?.name ?? 'Drawer',
      drawerPoints: bonus,
      reason,
      guessers: turn.correct.map((guess) => ({
        playerId: guess.playerId,
        name: this.player(guess.playerId)?.name ?? 'Player',
        points: guess.points,
        order: guess.order,
      })),
      missed: turn.eligibleIds
        .filter((id) => !guessed.has(id))
        .map((id) => ({ playerId: id, name: this.player(id)?.name ?? 'Player' })),
    }
    this.archives.push({
      round: turn.round,
      turnId: turn.id,
      drawerId: turn.drawerId,
      drawerName: drawer?.name ?? 'Drawer',
      word: secret,
      events: turn.replay.map((event) => structuredClone(event)),
    })
    this.phase = 'ROUND_RESULTS'
    turn.resultsEndsAt = now + this.settings.resultsSec * 1000
    turn.drawerHoldEndsAt = null
    this.pushSystem(`The word was ${secret}.`)
  }

  private abortTurn(now: number, message: string): void {
    if (this.phase !== 'DRAWING' && this.phase !== 'WORD_SELECTION') return
    if (this.turn) {
      for (const guess of this.turn.correct) {
        const player = this.player(guess.playerId)
        if (player) player.score = Math.max(0, player.score - guess.points)
      }
      const secret = this.turn.secret
      if (secret) this.usedWords = this.usedWords.filter((word) => word !== secret)
    }
    this.pushSystem(message)
    this.turnIndex += 1
    this.turn = null
    if (this.connectedCount() < 2) {
      this.suspendOrFinish(now, 'Not enough connected players to continue.')
      return
    }
    this.beginTurn(now)
  }

  private beginTurn(now: number): void {
    while (this.turnIndex < this.schedule.length) {
      const entry = this.schedule[this.turnIndex]
      if (!entry) {
        this.turnIndex += 1
        continue
      }
      const drawer = this.player(entry.drawerId)
      if (!drawer?.connected) {
        this.turnIndex += 1
        continue
      }
      if (this.connectedCount() < 2) {
        this.suspendOrFinish(now, 'Not enough connected players to continue.')
        return
      }
      const choices = pickWordChoices(this.wordPool(), this.usedWords, this.deps.rng)
      if (!choices) {
        this.suspendOrFinish(now, 'Not enough words left to continue.')
        return
      }
      this.round = entry.round
      this.phase = 'WORD_SELECTION'
      this.turn = {
        id: createId(8),
        round: entry.round,
        drawerId: drawer.id,
        choices,
        secret: null,
        revealed: [],
        hint: null,
        hintStage: 0,
        selectionEndsAt: now + this.settings.wordSelectSec * 1000,
        drawStartedAt: null,
        drawEndsAt: null,
        resultsEndsAt: null,
        drawerHoldEndsAt: null,
        scene: [],
        replay: [],
        seq: 0,
        seen: [],
        eligibleIds: this.players.filter((player) => player.connected && player.id !== drawer.id).map((player) => player.id),
        correct: [],
        roundResult: null,
      }
      this.pushSystem(`${drawer.name} is choosing a word.`)
      return
    }
    this.finishGame(now)
  }

  private finishGame(now: number): void {
    if (this.phase === 'GAME_RESULTS') return
    this.phase = 'GAME_RESULTS'
    this.turn = null
    this.finishedAt = now
    this.historyId = this.historyId ?? createId(16)
    this.leaderboard = this.rankPlayers()
    this.systemMessage = 'Game over.'
    this.pushSystem('Game over. Check the leaderboard.')
  }

  private suspendOrFinish(now: number, message: string): void {
    const scored = this.players.some((player) => player.score > 0) || this.archives.length > 0
    this.turn = null
    this.pushSystem(message)
    if (scored) {
      this.finishGame(now)
      return
    }
    this.phase = 'WAITING'
    this.schedule = []
    this.turnIndex = 0
    this.round = 0
    this.systemMessage = message
  }

  private allConnectedGuessed(): boolean {
    if (!this.turn) return false
    const connected = this.turn.eligibleIds.filter((id) => this.player(id)?.connected)
    if (connected.length === 0) return false
    const guessed = new Set(this.turn.correct.map((guess) => guess.playerId))
    return connected.every((id) => guessed.has(id))
  }

  private buildSchedule(): void {
    const order = this.players
      .filter((player) => player.connected)
      .sort((left, right) => left.joinedAt - right.joinedAt || left.id.localeCompare(right.id))
    this.schedule = []
    for (let round = 1; round <= this.settings.rounds; round += 1) {
      for (const player of order) this.schedule.push({ round, drawerId: player.id })
    }
  }

  private addToFutureRounds(playerId: string): void {
    if (this.phase === 'WAITING' || this.phase === 'GAME_RESULTS' || this.schedule.length === 0) return
    const current = this.turn?.round ?? this.round
    for (let round = current + 1; round <= this.settings.rounds; round += 1) {
      if (!this.schedule.some((entry) => entry.round === round && entry.drawerId === playerId)) {
        this.schedule.push({ round, drawerId: playerId })
      }
    }
  }

  private removePlayer(playerId: string, now: number, reason?: string): void {
    const player = this.player(playerId)
    if (!player) return
    this.players = this.players.filter((item) => item.id !== playerId)
    if (this.turn) this.turn.eligibleIds = this.turn.eligibleIds.filter((id) => id !== playerId)
    if (this.hostId === playerId) {
      const next = this.pickHost()
      if (next) this.hostId = next
    }
    const wasDrawer = this.turn?.drawerId === playerId && (this.phase === 'DRAWING' || this.phase === 'WORD_SELECTION')
    this.pushSystem(reason ?? `${player.name} left the room.`)
    if (wasDrawer) {
      this.abortTurn(now, 'The drawer left. This turn was skipped.')
      return
    }
    if (this.phase !== 'WAITING' && this.phase !== 'GAME_RESULTS' && this.connectedCount() < 2) {
      this.suspendOrFinish(now, 'Not enough connected players to continue.')
      return
    }
    if (this.phase === 'DRAWING' && this.turn && this.allConnectedGuessed()) this.endDrawing(now, 'all_guessed')
  }

  private pickHost(except?: string): string | null {
    const connected = this.players.filter((player) => player.connected && player.id !== except)
    const pool = connected.length > 0 ? connected : this.players.filter((player) => player.id !== except)
    const sorted = [...pool].sort((left, right) => left.joinedAt - right.joinedAt || left.id.localeCompare(right.id))
    return sorted[0]?.id ?? null
  }

  private player(id: string): PlayerState | undefined {
    return this.players.find((player) => player.id === id)
  }

  private connectedCount(): number {
    return this.players.filter((player) => player.connected).length
  }

  private wordPool(): string[] {
    if (this.settings.wordList === 'custom') return this.settings.customWords
    return builtinWords(this.settings.wordList)
  }

  private bannedWords(): string[] {
    if (!this.turn || (this.phase !== 'WORD_SELECTION' && this.phase !== 'DRAWING')) return []
    const words: string[] = []
    if (this.turn.secret) words.push(this.turn.secret)
    if (this.phase === 'WORD_SELECTION') {
      for (const choice of this.turn.choices ?? []) words.push(choice.word)
    }
    return words
  }

  private publicSettings(): PublicSettings {
    return {
      rounds: this.settings.rounds,
      drawDurationSec: this.settings.drawDurationSec,
      wordSelectSec: this.settings.wordSelectSec,
      resultsSec: this.settings.resultsSec,
      capacity: this.settings.capacity,
      wordList: this.settings.wordList,
      customWordCount: this.settings.customWords.length,
    }
  }

  private rankPlayers(): LeaderboardEntry[] {
    const sorted = [...this.players].sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    let rank = 0
    let lastScore: number | null = null
    return sorted.map((player, index) => {
      if (lastScore !== player.score) {
        rank = index + 1
        lastScore = player.score
      }
      return { playerId: player.id, name: player.name, score: player.score, rank, connected: player.connected }
    })
  }

  private pushSystem(text: string): void {
    this.systemMessage = text
    this.pushChat({ kind: 'system', playerId: null, name: null, text, at: this.deps.now() })
  }

  private pushChat(message: Omit<ChatMessage, 'id'>): void {
    this.chat.push({ ...message, id: createId(8) })
    if (this.chat.length > 100) this.chat.splice(0, this.chat.length - 100)
  }
}

function wakePriority(kind: WakeKind): number {
  if (kind === 'draw') return 0
  if (kind === 'drawer_hold') return 1
  if (kind === 'hint') return 2
  return 3
}
