import type { WORD_LIST_IDS } from './constants.js'

export type WordListId = (typeof WORD_LIST_IDS)[number]

export type Phase =
  | 'WAITING'
  | 'WORD_SELECTION'
  | 'DRAWING'
  | 'ROUND_RESULTS'
  | 'GAME_RESULTS'

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface GameSettings {
  rounds: number
  drawDurationSec: number
  wordSelectSec: number
  resultsSec: number
  capacity: number
  wordList: WordListId
  customWords: string[]
}

export interface PublicSettings {
  rounds: number
  drawDurationSec: number
  wordSelectSec: number
  resultsSec: number
  capacity: number
  wordList: WordListId
  customWordCount: number
}

export interface Point {
  x: number
  y: number
}

export type SceneItem =
  | {
      kind: 'stroke'
      opId: string
      tool: 'pen' | 'eraser'
      color: string
      size: number
      points: Point[]
      done: boolean
    }
  | {
      kind: 'fill'
      opId: string
      color: string
      x: number
      y: number
    }
  | {
      kind: 'clear'
      opId: string
    }

export type ReplayEvent =
  | {
      type: 'points'
      opId: string
      tool: 'pen' | 'eraser'
      color: string
      size: number
      points: Point[]
      t: number
    }
  | {
      type: 'fill'
      opId: string
      color: string
      x: number
      y: number
      t: number
    }
  | { type: 'undo'; t: number }
  | { type: 'clear'; opId: string; t: number }

export interface WordChoice {
  word: string
  difficulty: Difficulty
}

export interface ChatMessage {
  id: string
  at: number
  kind: 'system' | 'chat' | 'guess' | 'correct'
  playerId: string | null
  name: string | null
  text: string
}

export interface PublicPlayer {
  id: string
  name: string
  score: number
  connected: boolean
  isHost: boolean
  isDrawer: boolean
  guessed: boolean
  guessPoints: number | null
}

export interface RoundGuesser {
  playerId: string
  name: string
  points: number
  order: number
}

export interface RoundResult {
  word: string
  drawerId: string
  drawerName: string
  drawerPoints: number
  reason: 'timeout' | 'all_guessed'
  guessers: RoundGuesser[]
  missed: { playerId: string; name: string }[]
}

export interface LeaderboardEntry {
  playerId: string
  name: string
  score: number
  rank: number
  connected: boolean
}

export interface ArchivedRound {
  round: number
  turnId: string
  drawerId: string
  drawerName: string
  word: string
  events: ReplayEvent[]
}

export interface PublicRoomState {
  id: string
  code: string
  name: string
  phase: Phase
  settings: PublicSettings
  hostId: string
  round: number
  totalRounds: number
  turnId: string | null
  drawerId: string | null
  players: PublicPlayer[]
  hint: string | null
  selectionEndsAt: number | null
  drawEndsAt: number | null
  resultsEndsAt: number | null
  serverNow: number
  chat: ChatMessage[]
  scene: SceneItem[]
  lastSeq: number
  roundResult: RoundResult | null
  leaderboard: LeaderboardEntry[] | null
  archives: ArchivedRound[]
  systemMessage: string | null
  connectedCount: number
}

export interface PrivateView {
  playerId: string
  isHost: boolean
  isDrawer: boolean
  canDraw: boolean
  canGuess: boolean
  canStart: boolean
  canConfigure: boolean
  canReturnToLobby: boolean
  canEndGame: boolean
  secretWord: string | null
  wordChoices: WordChoice[] | null
  customWords: string[]
}

export interface SessionInfo {
  playerId: string
  reconnectToken: string
  roomId: string
  code: string
}

export type ClientAck<T> =
  | { ok: true; state: PublicRoomState; me: PrivateView; session?: SessionInfo }
  | { ok: false; error: string; code: string }
  | ({ ok: true } & T)
