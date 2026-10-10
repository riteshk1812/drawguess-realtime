import type { CompletedGame } from '../game/room.js'

export interface HistoryStore {
  save(game: CompletedGame): Promise<void>
  recent(limit: number): Promise<CompletedGame[]>
  readonly kind: 'memory' | 'postgres'
}

export class MemoryHistory implements HistoryStore {
  readonly kind = 'memory' as const
  private items: CompletedGame[] = []

  async save(game: CompletedGame): Promise<void> {
    if (this.items.some((item) => item.id === game.id)) return
    this.items.unshift(game)
    this.items = this.items.slice(0, 50)
  }

  async recent(limit: number): Promise<CompletedGame[]> {
    return this.items.slice(0, limit)
  }
}
