import { useEffect, useRef, useState } from 'react'
import { applyReplayEvent, type ArchivedRound, type SceneItem } from '@drawguess/shared'
import { blit } from './blit'

export function ReplayPlayer({ rounds }: { rounds: ArchivedRound[] }) {
  const [roundIndex, setRoundIndex] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [playing, setPlaying] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const round = rounds[roundIndex]

  useEffect(() => {
    if (!round || !canvasRef.current) return
    let scene: SceneItem[] = []
    for (const event of round.events.slice(0, cursor)) scene = applyReplayEvent(scene, event)
    blit(canvasRef.current, scene)
  }, [round, cursor])

  useEffect(() => {
    if (!playing || !round) return
    if (cursor >= round.events.length) {
      setPlaying(false)
      return
    }
    const current = round.events[cursor]
    const next = round.events[cursor + 1]
    const delay = next && current ? Math.min(90, Math.max(16, (next.t - current.t) / 4)) : 40
    const timer = window.setTimeout(() => setCursor((value) => value + 1), delay)
    return () => window.clearTimeout(timer)
  }, [playing, cursor, round])

  if (!round) return <p className="text-sm text-ink/60">No drawings were recorded.</p>

  return (
    <section className="paper rounded-[2rem] p-4" aria-label="Drawing replay">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-2xl text-ink">Replay · {round.word}</h3>
        <label className="text-sm font-semibold text-ink">
          Round
          <select
            className="ml-2 rounded-xl border border-black/10 bg-white px-3 py-2"
            value={roundIndex}
            onChange={(event) => {
              setRoundIndex(Number(event.target.value))
              setCursor(0)
              setPlaying(false)
            }}
          >
            {rounds.map((item, index) => (
              <option key={item.turnId} value={index}>
                {item.round} · {item.drawerName}
              </option>
            ))}
          </select>
        </label>
      </div>
      <canvas ref={canvasRef} width={800} height={500} className="aspect-[8/5] w-full rounded-2xl bg-white" />
      <div className="mt-3 flex gap-2">
        <button type="button" className="btn-primary" onClick={() => setPlaying((value) => !value)}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setCursor(0)
            setPlaying(false)
          }}
        >
          Restart
        </button>
      </div>
    </section>
  )
}
