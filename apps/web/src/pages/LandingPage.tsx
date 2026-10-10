import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { normalizePlayerName } from '@drawguess/shared'
import { setPlayerName, useAppDispatch, useAppSelector } from '../stores/gameStore'

export function LandingPage() {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const playerName = useAppSelector((state) => state.game.playerName)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  function requireName(): string | null {
    const name = normalizePlayerName(playerName)
    if (!name) {
      setError('Enter a name using 1–16 letters, numbers, or spaces.')
      return null
    }
    dispatch(setPlayerName(name))
    setError(null)
    return name
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-6xl items-center gap-8 px-4 py-10 lg:grid-cols-[1.1fr_0.9fr]">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-gold">Party game</p>
        <h1 className="mt-3 font-display text-6xl leading-none sm:text-7xl">DrawGuess</h1>
        <p className="mt-4 max-w-xl text-lg text-cream/80">Draw it. Guess it. Score it. A live room for friends, with a shared canvas, secret words, and a server that keeps the score.</p>
        <ul className="mt-6 flex flex-wrap gap-2 text-sm">
          {['Live strokes', 'Private words', 'Reconnect for 30s'].map((item) => (
            <li key={item} className="rounded-full bg-white/10 px-4 py-2">{item}</li>
          ))}
        </ul>
      </section>
      <form
        className="paper grid gap-4 rounded-[2rem] p-6 shadow-card"
        onSubmit={(event) => {
          event.preventDefault()
          if (!requireName()) return
          const room = code.trim().toUpperCase()
          if (!/^[A-Z2-9]{8}$/.test(room)) {
            setError('Enter an 8-character room code, or create a room.')
            return
          }
          navigate(`/room/${room}`)
        }}
      >
        <label className="grid gap-2 text-sm font-semibold" htmlFor="name">
          Your name
          <input id="name" className="field" value={playerName} maxLength={16} onChange={(event) => dispatch(setPlayerName(event.target.value))} placeholder="Ada" />
        </label>
        <label className="grid gap-2 text-sm font-semibold" htmlFor="code">
          Room code
          <input id="code" className="field uppercase tracking-[0.2em]" value={code} maxLength={8} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="AB12CD34" />
        </label>
        {error ? <p role="alert" className="text-sm font-semibold text-coral">{error}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <button className="btn-primary" type="submit">Join room</button>
          <Link
            className="btn-secondary"
            to="/create"
            onClick={(event) => {
              if (!requireName()) event.preventDefault()
            }}
          >
            Create room
          </Link>
        </div>
      </form>
    </main>
  )
}
