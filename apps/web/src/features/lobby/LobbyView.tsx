import type { PublicRoomState } from '@drawguess/shared'
import { KickPoll } from '../players/KickPoll'

export function LobbyView({
  room,
  isHost,
  canStart,
  onStart,
  onCopy,
  copied,
  selfId = null,
  kickVote = null,
  onKick,
  onVote,
}: {
  room: PublicRoomState
  isHost: boolean
  canStart: boolean
  onStart: () => void
  onCopy: () => void
  copied: boolean
  selfId?: string | null
  kickVote?: 'yes' | 'no' | null
  onKick?: (playerId: string) => void
  onVote?: (yes: boolean) => void
}) {
  const link = `${window.location.origin}/room/${room.code}`
  return (
    <section className="paper mx-auto grid max-w-5xl gap-6 rounded-[2rem] p-6 shadow-card md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal">Lobby</p>
          <h1 className="font-display text-4xl text-ink">{room.name}</h1>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink/50">Room code</p>
          <p className="font-mono text-3xl font-bold tracking-[0.3em] text-ink">{room.code}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <button className="btn-secondary" type="button" onClick={onCopy}>
          {copied ? 'Link copied' : 'Copy invite link'}
        </button>
        <p className="self-center truncate text-sm text-ink/60">{link}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Rounds" value={String(room.settings.rounds)} />
        <Stat label="Draw time" value={`${room.settings.drawDurationSec}s`} />
        <Stat label="Words" value={room.settings.wordList} />
        <Stat label="Seats" value={`${room.players.length}/${room.settings.capacity}`} />
      </div>
      <ul className="grid gap-2">
        {room.players.map((player) => (
          <li key={player.id} className="flex items-center justify-between rounded-2xl bg-cream px-4 py-3">
            <span className="font-semibold">
              {player.name} {player.isHost ? '· host' : ''}
            </span>
            <span className="flex items-center gap-2">
              {onKick && selfId && player.id !== selfId && !player.isDrawer && !room.kick ? (
                <button type="button" className="btn-ghost" onClick={() => onKick(player.id)}>Kick {player.name}</button>
              ) : null}
              <span className={player.connected ? 'text-teal' : 'text-coral'}>{player.connected ? 'Connected' : 'Reconnecting'}</span>
            </span>
          </li>
        ))}
      </ul>
      {room.kick && onVote ? (
        <KickPoll
          kick={room.kick}
          serverNow={room.serverNow}
          canVote={Boolean(selfId && selfId !== room.kick.targetId && kickVote === null)}
          isTarget={selfId === room.kick.targetId}
          onVote={onVote}
        />
      ) : null}
      {isHost ? (
        <button className="btn-primary" type="button" onClick={onStart} disabled={!canStart}>
          {canStart ? 'Start game' : waitingLabel(room.settings.capacity)}
        </button>
      ) : (
        <p className="rounded-2xl bg-cream px-4 py-3 text-ink/70">Waiting for the host to start.</p>
      )}
    </section>
  )
}

function waitingLabel(capacity: number): string {
  return capacity >= 3 ? 'Waiting for at least 2 players' : 'Waiting for at least 1 players'
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-cream px-4 py-3">
      <p className="text-xs uppercase tracking-widest text-ink/50">{label}</p>
      <p className="text-lg font-bold capitalize">{value}</p>
    </div>
  )
}
