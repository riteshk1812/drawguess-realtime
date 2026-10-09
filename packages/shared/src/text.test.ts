import { describe, expect, it } from 'vitest'
import { answersMatch, isCloseGuess, normalizeAnswer } from './text.js'

describe('answers', () => {
  it('normalizes case, punctuation, and spacing', () => {
    expect(normalizeAnswer('  Ice-Cream! ')).toBe('icecream')
    expect(answersMatch('Ice Cream', 'ice-cream')).toBe(true)
    expect(answersMatch('icecream', 'ice cream')).toBe(true)
    expect(answersMatch('cat', 'catalog')).toBe(false)
  })

  it('flags tight near misses and ignores short probes', () => {
    expect(isCloseGuess('car', 'cat')).toBe(true)
    expect(isCloseGuess('cot', 'cat')).toBe(true)
    expect(isCloseGuess('dog', 'cat')).toBe(false)
    expect(isCloseGuess('a', 'cat')).toBe(false)
    expect(isCloseGuess('pineaple', 'pineapple')).toBe(true)
    expect(isCloseGuess('pineapple', 'pineapple')).toBe(false)
    expect(isCloseGuess('zzzzzzzz', 'pineapple')).toBe(false)
  })
})
