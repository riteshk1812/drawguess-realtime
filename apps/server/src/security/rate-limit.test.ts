import { describe, expect, it } from 'vitest'
import { MemoryRateLimiter } from './rate-limit.js'

describe('memory rate limiter', () => {
  it('blocks once the window is exhausted', async () => {
    let now = 1_000
    const limiter = new MemoryRateLimiter(() => now)
    for (let index = 0; index < 3; index += 1) {
      expect(await limiter.allow('chat:a', 3, 1_000)).toBe(true)
    }
    expect(await limiter.allow('chat:a', 3, 1_000)).toBe(false)
    now += 1_000
    expect(await limiter.allow('chat:a', 3, 1_000)).toBe(true)
  })
})