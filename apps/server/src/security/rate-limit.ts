export interface RateLimiter {
  allow(key: string, limit: number, windowMs: number): Promise<boolean>
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, { count: number; reset: number }>()

  constructor(private readonly now: () => number = Date.now) {}

  async allow(key: string, limit: number, windowMs: number): Promise<boolean> {
    const now = this.now()
    const bucket = this.buckets.get(key)
    if (!bucket || now >= bucket.reset) {
      this.buckets.set(key, { count: 1, reset: now + windowMs })
      return true
    }
    if (bucket.count >= limit) return false
    bucket.count += 1
    return true
  }
}

export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly incr: (key: string, windowMs: number) => Promise<number>) {}

  async allow(key: string, limit: number, windowMs: number): Promise<boolean> {
    const count = await this.incr(key, windowMs)
    return count <= limit
  }
}
