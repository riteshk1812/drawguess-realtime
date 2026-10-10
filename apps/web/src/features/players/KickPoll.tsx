import type { KickPollView } from '@drawguess/shared'
import { TimerBadge } from '../../components/TimerBadge'

export function KickPoll({
  kick,
  serverNow,
  canVote,
  isTarget,
  onVote,
}: {
  kick: KickPollView
  serverNow: number
  canVote: boolean
  isTarget: boolean
  onVote: (yes: boolean) => void
}) {
  return (
    <div className="rounded-2xl bg-cream px-4 py-3" aria-label="Kick vote">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-ink">
          {isTarget ? 'Players are voting to kick you.' : `Kick ${kick.targetName}?`} {kick.yes} yes · {kick.no} no
        </p>
        <TimerBadge label="Vote" endsAt={kick.endsAt} serverNow={serverNow} />
      </div>
      {canVote ? (
        <div className="mt-2 flex gap-2">
          <button type="button" className="btn-primary" onClick={() => onVote(true)}>Yes</button>
          <button type="button" className="btn-ghost" onClick={() => onVote(false)}>No</button>
        </div>
      ) : null}
    </div>
  )
}
