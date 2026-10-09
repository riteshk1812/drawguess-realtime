import { describe, expect, it } from 'vitest'
import { letterIndexes, maskWord, pickReveals, planRevealCount } from './hints.js'

describe('hints', () => {
  it('never reveals every letter', () => {
    const word = 'pineapple'
    const letters = letterIndexes(word)
    for (let stage = 0; stage <= 3; stage += 1) {
      expect(planRevealCount(letters.length, stage)).toBeLessThan(letters.length)
    }
    const revealed = pickReveals(word, [], 3, () => 0)
    expect(revealed.length).toBeLessThan(letters.length)
    expect(maskWord(word, revealed).replace(/ /g, '')).not.toBe(word)
    expect(maskWord('cat', [])).toBe('_ _ _')
  })
})
