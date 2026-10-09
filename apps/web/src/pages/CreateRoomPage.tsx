import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LIMITS, type WordListId } from '@drawguess/shared'
import { createRoom } from '../services/socket'
import { useGameStore } from '../stores/gameStore'

const LISTS: WordListId[] = ['mixed', 'animals', 'food', 'objects', 'custom']

export function CreateRoomPage() {
  const navigate = useNavigate()
  const playerName = useGameStore((state) => state.playerName)
  const [roomName, setRoomName] = useState('Friday night')
  const [rounds, setRounds] = useState(3)
  const [drawDurationSec, setDrawDurationSec] = useState(80)
  const [wordSelectSec, setWordSelectSec] = useState(15)
  const [resultsSec, setResultsSec] = useState(8)
  const [capacity, setCapacity] = useState(8)
  const [wordList, setWordList] = useState<WordListId>('mixed')
  const [customWords, setCustomWords] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (!playerName.trim()) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <p className="paper rounded-[2rem] p-6">Enter your name on the home page first. <Link className="font-semibold text-teal" to="/">Go back</Link></p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <form
        className="paper grid gap-5 rounded-[2rem] p-6 shadow-card md:p-8"
        onSubmit={(event) => {
          event.preventDefault()
          setPending(true)
          setError(null)
          const words = customWords.split(/[\n,]/).map((word) => word.trim()).filter(Boolean)
          void createRoom({
            playerName,
            roomName,
            settings: { rounds, drawDurationSec, wordSelectSec, resultsSec, capacity, wordList, customWords: wordList === 'custom' ? words : [] },
          })
            .then((ack) => {
              if (!ack.ok || !ack.session) {
                setError(ack.error ?? 'Could not create the room')
                return
              }
              navigate(`/room/${ack.session.code}`)
            })
            .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not create the room'))
            .finally(() => setPending(false))
        }}
      >
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal">New room</p>
          <h1 className="font-display text-4xl text-ink">Set the rules</h1>
        </div>
        <label className="grid gap-2 text-sm font-semibold" htmlFor="roomName">Room name
          <input id="roomName" className="field" value={roomName} maxLength={40} onChange={(event) => setRoomName(event.target.value)} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField id="rounds" label="Rounds" min={LIMITS.minRounds} max={LIMITS.maxRounds} value={rounds} onChange={setRounds} />
          <NumberField id="duration" label="Draw seconds" min={LIMITS.minDrawSec} max={LIMITS.maxDrawSec} value={drawDurationSec} onChange={setDrawDurationSec} />
          <NumberField id="select" label="Word choice seconds" min={LIMITS.minSelectSec} max={LIMITS.maxSelectSec} value={wordSelectSec} onChange={setWordSelectSec} />
          <NumberField id="results" label="Results seconds" min={LIMITS.minResultsSec} max={LIMITS.maxResultsSec} value={resultsSec} onChange={setResultsSec} />
          <NumberField id="capacity" label="Player capacity" min={LIMITS.minCapacity} max={LIMITS.maxCapacity} value={capacity} onChange={setCapacity} />
          <label className="grid gap-2 text-sm font-semibold" htmlFor="list">Word list
            <select id="list" className="field" value={wordList} onChange={(event) => setWordList(event.target.value as WordListId)}>
              {LISTS.map((list) => <option key={list} value={list}>{list}</option>)}
            </select>
          </label>
        </div>
        {wordList === 'custom' ? (
          <label className="grid gap-2 text-sm font-semibold" htmlFor="words">Custom words
            <textarea id="words" className="field min-h-32" value={customWords} onChange={(event) => setCustomWords(event.target.value)} placeholder="One word per line, at least 10" />
          </label>
        ) : null}
        {error ? <p role="alert" className="font-semibold text-coral">{error}</p> : null}
        <div className="flex gap-3">
          <button className="btn-primary" type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create room'}</button>
          <Link className="btn-ghost" to="/">Back</Link>
        </div>
      </form>
    </main>
  )
}

function NumberField({ id, label, min, max, value, onChange }: { id: string; label: string; min: number; max: number; value: number; onChange: (value: number) => void }) {
  return (
    <label className="grid gap-2 text-sm font-semibold" htmlFor={id}>{label}
      <input id={id} className="field" type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}
