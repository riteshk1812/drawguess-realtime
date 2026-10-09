import pg from 'pg'
import type { CompletedGame } from '../game/room.js'
import type { HistoryStore } from './history.js'

export class PostgresHistory implements HistoryStore {
  readonly kind = 'postgres' as const

  constructor(private readonly pool: pg.Pool) {}

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS completed_games (
        id TEXT PRIMARY KEY,
        room_code TEXT NOT NULL,
        finished_at TIMESTAMPTZ NOT NULL,
        payload JSONB NOT NULL
      )
    `)
  }

  async save(game: CompletedGame): Promise<void> {
    await this.pool.query(
      `INSERT INTO completed_games (id, room_code, finished_at, payload)
       VALUES ($1, $2, to_timestamp($3 / 1000.0), $4::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [game.id, game.code, game.finishedAt, JSON.stringify(game)],
    )
  }

  async close(): Promise<void> {
    await this.pool.end()
  }

  async recent(limit: number): Promise<CompletedGame[]> {
    const result = await this.pool.query<{ payload: CompletedGame }>(
      `SELECT payload FROM completed_games ORDER BY finished_at DESC LIMIT $1`,
      [limit],
    )
    return result.rows.map((row) => row.payload)
  }
}

export async function connectPostgres(url: string): Promise<PostgresHistory | null> {
  const pool = new pg.Pool({ connectionString: url, max: 4 })
  try {
    await pool.query('select 1')
    const history = new PostgresHistory(pool)
    await history.init()
    return history
  } catch {
    await pool.end().catch(() => undefined)
    return null
  }
}
