import type { LeaderboardEntry } from '@drawguess/shared'

export function Leaderboard({ entries, onLobby, canLobby }: { entries: LeaderboardEntry[]; onLobby: () => void; canLobby: boolean }) {
  const winners = entries.filter((entry) => entry.rank === 1)
  return (
    <section className="paper rounded-[2rem] p-6 shadow-card" aria-label="Final leaderboard">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal">Final scores</p>
      <h2 className="font-display text-4xl text-ink">{winners.length > 1 ? 'Winners' : 'Winner'}: {winners.map((entry) => entry.name).join(', ') || 'Nobody yet'}</h2>
      <ol className="mt-4 grid gap-2">
        {entries.map((entry) => (
          <li key={entry.playerId} className={`flex items-center justify-between rounded-2xl px-4 py-3 ${entry.rank === 1 ? 'bg-gold/30' : 'bg-cream'}`}>
            <span className="font-semibold">#{entry.rank} {entry.name}</span>
            <span className="font-bold">{entry.score}</span>
          </li>
        ))}
      </ol>
      <button className="btn-primary mt-4" type="button" onClick={onLobby} disabled={!canLobby}>
        {canLobby ? 'Return to lobby' : 'Waiting for the host'}
      </button>
    </section>
  )
}
