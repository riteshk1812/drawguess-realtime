import { describe, expect, it } from 'vitest'
import { drawerPoints, guesserPoints } from './scoring.js'

describe('scoring', () => {
  it('rewards faster guesses and earlier order without going negative', () => {
    expect(guesserPoints({ remainingMs: 45_000, durationMs: 60_000, orderIndex: 0 })).toBe(375)
    expect(guesserPoints({ remainingMs: 30_000, durationMs: 60_000, orderIndex: 1 })).toBe(230)
    expect(guesserPoints({ remainingMs: 0, durationMs: 60_000, orderIndex: 0 })).toBe(0)
    expect(guesserPoints({ remainingMs: -10, durationMs: 60_000, orderIndex: 4 })).toBe(0)
    expect(drawerPoints([375, 230], 3)).toBe(202)
    expect(drawerPoints([], 3)).toBe(0)
  })
})
