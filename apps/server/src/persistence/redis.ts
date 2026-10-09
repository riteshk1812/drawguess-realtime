import { Redis } from 'ioredis'
import type { RoomSnapshot } from '../game/room.js'

const ROOM_PREFIX = 'drawguess:room:'
const CODE_PREFIX = 'drawguess:code:'

export class RedisStore {
  constructor(readonly client: Redis) {}

  async save(snapshot: RoomSnapshot): Promise<void> {
    const payload = JSON.stringify(snapshot)
    await this.client
      .multi()
      .set(`${ROOM_PREFIX}${snapshot.id}`, payload, 'EX', 60 * 60 * 4)
      .set(`${CODE_PREFIX}${snapshot.code}`, snapshot.id, 'EX', 60 * 60 * 4)
      .exec()
  }

  async delete(snapshot: Pick<RoomSnapshot, 'id' | 'code'>): Promise<void> {
    await this.client.del(`${ROOM_PREFIX}${snapshot.id}`, `${CODE_PREFIX}${snapshot.code}`)
  }

  async loadAll(): Promise<RoomSnapshot[]> {
    const rooms: RoomSnapshot[] = []
    let cursor = '0'
    do {
      const [next, keys] = await this.client.scan(cursor, 'MATCH', `${ROOM_PREFIX}*`, 'COUNT', 50)
      cursor = next
      if (keys.length === 0) continue
      const values = await this.client.mget(...keys)
      for (const value of values) {
        if (!value) continue
        try {
          const parsed = JSON.parse(value) as RoomSnapshot
          if (parsed.version === 1) rooms.push(parsed)
        } catch {
          // Ignore corrupt snapshots. The live process remains authoritative.
        }
      }
    } while (cursor !== '0')
    return rooms
  }

  async close(): Promise<void> {
    await this.client.quit()
  }

  async hit(key: string, windowMs: number): Promise<number> {
    const namespaced = `drawguess:rate:${key}`
    const count = await this.client.incr(namespaced)
    if (count === 1) await this.client.pexpire(namespaced, windowMs)
    return count
  }
}

export async function connectRedis(url: string): Promise<RedisStore | null> {
  const client = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true, enableOfflineQueue: false })
  try {
    await client.connect()
    await client.ping()
    return new RedisStore(client)
  } catch {
    client.disconnect()
    return null
  }
}
