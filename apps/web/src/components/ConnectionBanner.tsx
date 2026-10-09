import type { Connection } from '../stores/gameStore'

export function ConnectionBanner({ connection, error }: { connection: Connection; error: string | null }) {
  if (connection === 'disconnected' || connection === 'connecting') {
    return (
      <div role="status" className="rounded-2xl bg-gold/20 px-4 py-3 text-sm font-semibold text-ink">
        {connection === 'connecting' ? 'Connecting to the game…' : 'Reconnecting… your seat is held for 30 seconds.'}
      </div>
    )
  }
  if (!error) return null
  return (
    <div role="alert" className="rounded-2xl bg-coral/15 px-4 py-3 text-sm font-semibold text-coral">
      {error}
    </div>
  )
}
