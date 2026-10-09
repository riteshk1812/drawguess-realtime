export const CANVAS = {
  width: 800,
  height: 500,
} as const

export const LIMITS = {
  minRounds: 1,
  maxRounds: 8,
  minDrawSec: 30,
  maxDrawSec: 180,
  minSelectSec: 10,
  maxSelectSec: 30,
  minResultsSec: 5,
  maxResultsSec: 15,
  minCapacity: 2,
  maxCapacity: 8,
  minName: 1,
  maxName: 16,
  maxRoomName: 40,
  maxChat: 120,
  maxPoints: 500,
  maxSceneItems: 400,
  minCustomWords: 10,
  maxCustomWords: 80,
  maxWordLength: 24,
} as const

export const TEST_LIMITS = {
  ...LIMITS,
  minDrawSec: 1,
  minSelectSec: 1,
  minResultsSec: 1,
} as const

export const RATE = {
  create: { limit: 8, windowMs: 60_000 },
  join: { limit: 20, windowMs: 60_000 },
  chat: { limit: 8, windowMs: 10_000 },
  guess: { limit: 6, windowMs: 10_000 },
  draw: { limit: 30, windowMs: 1_000 },
  undo: { limit: 8, windowMs: 10_000 },
  clear: { limit: 4, windowMs: 10_000 },
  word: { limit: 4, windowMs: 10_000 },
  sync: { limit: 4, windowMs: 2_000 },
} as const

export const HINT_FRACTIONS = [0.3, 0.55, 0.8] as const

export const DEFAULT_RECONNECT_GRACE_MS = 30_000

export const WORD_LIST_IDS = ['mixed', 'animals', 'food', 'objects', 'custom'] as const
