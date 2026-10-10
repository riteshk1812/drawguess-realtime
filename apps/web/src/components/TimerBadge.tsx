import { useEffect, useRef, useState } from 'react'

export function TimerBadge({ endsAt, serverNow, label }: { endsAt: number | null; serverNow: number; label: string }) {
  const [now, setNow] = useState(() => Date.now())
  const skew = useRef(0)
  const syncedServerNow = useRef<number | null>(null)
  if (syncedServerNow.current !== serverNow) {
    syncedServerNow.current = serverNow
    skew.current = serverNow - Date.now()
  }
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(id)
  }, [])
  if (!endsAt) return null
  const seconds = Math.max(0, Math.ceil((endsAt - (now + skew.current)) / 1000))
  const urgent = seconds <= 10
  return (
    <div className={`rounded-full px-4 py-2 text-sm font-bold ${urgent ? 'bg-coral text-white' : 'bg-ink text-cream'}`} aria-label={`${label} ${seconds} seconds`}>
      {label} {seconds}s
    </div>
  )
}
