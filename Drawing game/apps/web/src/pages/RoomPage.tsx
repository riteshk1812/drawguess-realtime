import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { normalizePlayerName } from '@drawguess/shared'
import { ConnectionBanner } from '../components/ConnectionBanner'
import { HintWord } from '../components/HintWord'
import { TimerBadge } from '../components/TimerBadge'
import { ChatPanel } from '../features/chat/ChatPanel'
import { DrawCanvas } from '../features/drawing/DrawCanvas'
import { ReplayPlayer } from '../features/drawing/ReplayPlayer'
import { Toolbar } from '../features/drawing/Toolbar'
import { Leaderboard } from '../features/leaderboard/Leaderboard'
import { LobbyView } from '../features/lobby/LobbyView'
import { clearDraw, endGame, joinRoom, leaveRoom, returnToLobby, selectWord, sendText, startGame, undoDraw, watchRoom } from '../services/socket'
import { loadSession } from '../services/session'
import { setError, setPlayerName, useAppDispatch, useAppSelector } from '../stores/gameStore'

export function RoomPage() {
  const navigate = useNavigate()
  const params = useParams()
  const code = (params.code ?? '').toUpperCase()
  const dispatch = useAppDispatch()
  const room = useAppSelector((state) => state.game.room)
  const me = useAppSelector((state) => state.game.me)
  const connection = useAppSelector((state) => state.game.connection)
  const error = useAppSelector((state) => state.game.error)
  const playerName = useAppSelector((state) => state.game.playerName)
  const [copied, setCopied] = useState(false)
  const [color, setColor] = useState('#1c1917')
  const [size, setSize] = useState(10)
  const [tool, setTool] = useState<'pen' | 'eraser' | 'fill'>('pen')
  const [closeNotice, setCloseNotice] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    watchRoom(code)
  }, [code])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && me?.canDraw && room?.turnId) {
        event.preventDefault()
        void undoDraw(room.turnId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [me?.canDraw, room?.turnId])

  const session = loadSession()
  const inThisRoom = room?.code === code
  const restoring = !inThisRoom && session?.code === code
  const showJoin = !inThisRoom && !restoring

  return (
    <main className="mx-auto grid max-w-7xl gap-4 px-3 py-4 md:px-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="font-display text-3xl">DrawGuess</Link>
        <div className="flex items-center gap-3">
          {inThisRoom || restoring ? (
            <button
              type="button"
              className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-cream"
              onClick={() => {
                if (!window.confirm('Leave the game?')) return
                void leaveRoom().then((ack) => {
                  if (ack.ok) navigate('/')
                })
              }}
            >
              Leave
            </button>
          ) : null}
          <p className="text-sm text-cream/70">{connection === 'connected' ? 'Connected' : 'Offline'}</p>
        </div>
      </header>
      <ConnectionBanner connection={connection} error={error} />
      {restoring ? <p className="paper rounded-[2rem] p-6 text-ink" role="status">Restoring your seat…</p> : null}
      {showJoin ? (
        <form
          className="paper mx-auto grid w-full max-w-md gap-4 rounded-[2rem] p-6"
          onSubmit={(event) => {
            event.preventDefault()
            const name = normalizePlayerName(playerName)
            if (!name) {
              setJoinError('Enter a name using 1–16 letters, numbers, or spaces.')
              return
            }
            setJoining(true)
            dispatch(setPlayerName(name))
            void joinRoom({ code, playerName: name })
              .then((ack) => setJoinError(ack.ok ? null : ack.error ?? 'Could not join'))
              .catch((reason: unknown) => setJoinError(reason instanceof Error ? reason.message : 'Could not join'))
              .finally(() => setJoining(false))
          }}
        >
          <h1 className="font-display text-4xl text-ink">Join {code}</h1>
          <label className="grid gap-2 text-sm font-semibold" htmlFor="join-name">Your name
            <input id="join-name" className="field" value={playerName} maxLength={16} onChange={(event) => dispatch(setPlayerName(event.target.value))} />
          </label>
          {joinError ? <p role="alert" className="font-semibold text-coral">{joinError}</p> : null}
          <button className="btn-primary" type="submit" disabled={joining}>{joining ? 'Joining…' : 'Join room'}</button>
        </form>
      ) : null}
      {inThisRoom && room?.phase === 'WAITING' ? (
        <LobbyView
          room={room}
          isHost={Boolean(me?.isHost)}
          canStart={Boolean(me?.canStart)}
          copied={copied}
          onCopy={() => {
            void navigator.clipboard.writeText(`${window.location.origin}/room/${room.code}`).then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1500)
            })
          }}
          onStart={() => void startGame()}
        />
      ) : null}
      {inThisRoom && room && room.phase !== 'WAITING' ? (
        <section className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
          <aside className="paper rounded-[1.5rem] p-4">
            <h2 className="font-display text-2xl text-ink">Players</h2>
            <ul className="mt-3 grid gap-2">
              {room.players.map((player) => (
                <li key={player.id} className="rounded-xl bg-cream px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{player.name}</span>
                    <span>{player.score}</span>
                  </div>
                  <p className="text-xs text-ink/60">
                    {player.isHost ? 'Host · ' : ''}
                    {player.isDrawer ? 'Drawing · ' : ''}
                    {player.guessed ? `Guessed +${player.guessPoints ?? 0} · ` : ''}
                    {player.connected ? 'Online' : 'Away'}
                  </p>
                </li>
              ))}
            </ul>
          </aside>
          <section className="paper grid gap-3 rounded-[1.5rem] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-ink/50">Round {room.round || 1} / {room.totalRounds}</p>
                <HintWord hint={room.phase === 'DRAWING' ? room.hint : room.phase === 'WORD_SELECTION' ? 'Choosing a word' : room.roundResult?.word ?? ' '} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {me?.canEndGame ? (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      if (window.confirm('End the game for everyone?')) void endGame()
                    }}
                  >
                    End game
                  </button>
                ) : null}
                <TimerBadge
                  label={room.phase === 'WORD_SELECTION' ? 'Choose' : room.phase === 'ROUND_RESULTS' ? 'Next' : 'Time'}
                  endsAt={room.selectionEndsAt ?? room.drawEndsAt ?? room.resultsEndsAt}
                  serverNow={room.serverNow}
                />
              </div>
            </div>
            {me?.secretWord ? <p className="rounded-2xl bg-gold/30 px-4 py-2 font-bold text-ink">Your word: {me.secretWord}</p> : null}
            {me?.wordChoices ? (
              <div className="grid gap-2 sm:grid-cols-3" aria-label="Word choices">
                {me.wordChoices.map((choice) => (
                  <button key={choice.word} type="button" className="rounded-2xl bg-ink px-4 py-5 text-left text-cream" onClick={() => room.turnId && void selectWord(room.turnId, choice.word)}>
                    <span className="text-xs uppercase tracking-widest text-gold">{choice.difficulty}</span>
                    <span className="mt-1 block text-xl font-bold">{choice.word}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <DrawCanvas scene={room.scene} turnId={room.turnId} enabled={Boolean(me?.canDraw)} color={color} size={size} tool={tool} />
            <Toolbar
              color={color}
              size={size}
              tool={tool}
              canDraw={Boolean(me?.canDraw)}
              onColor={setColor}
              onSize={setSize}
              onTool={setTool}
              onUndo={() => room.turnId && void undoDraw(room.turnId)}
              onClear={() => room.turnId && void clearDraw(room.turnId)}
            />
            {room.phase === 'ROUND_RESULTS' && room.roundResult ? (
              <div className="rounded-2xl bg-cream p-4" aria-label="Round results">
                <h2 className="font-display text-3xl text-ink">The word was {room.roundResult.word}</h2>
                <p className="text-sm text-ink/70">{room.roundResult.drawerName} earned {room.roundResult.drawerPoints} for drawing.</p>
                <ul className="mt-2 grid gap-1">
                  {room.roundResult.guessers.map((guess) => (
                    <li key={guess.playerId}>{guess.name} +{guess.points}</li>
                  ))}
                  {room.roundResult.missed.map((player) => (
                    <li key={player.playerId} className="text-ink/50">{player.name} missed it</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {room.phase === 'GAME_RESULTS' && room.leaderboard ? (
              <Leaderboard entries={room.leaderboard} canLobby={Boolean(me?.canReturnToLobby)} onLobby={() => void returnToLobby()} />
            ) : null}
            {room.archives.length > 0 && (room.phase === 'GAME_RESULTS' || room.phase === 'ROUND_RESULTS') ? <ReplayPlayer rounds={room.archives} /> : null}
          </section>
          <ChatPanel
            messages={room.chat}
            canSend={connection === 'connected'}
            closeNotice={closeNotice}
            placeholder={me?.canGuess ? 'Type a guess' : me?.isDrawer ? 'Chat, but do not say the word' : 'Chat with the room'}
            onSend={(text) => {
              void sendText(text, room.turnId).then((ack) => {
                if (ack.close) {
                  setCloseNotice(true)
                  window.setTimeout(() => setCloseNotice(false), 1200)
                }
                if (!ack.ok) dispatch(setError(ack.error ?? 'Message was not sent'))
              })
            }}
          />
        </section>
      ) : null}
    </main>
  )
}
