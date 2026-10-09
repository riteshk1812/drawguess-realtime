import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { PublicRoomState } from '@drawguess/shared'
import { ConnectionBanner } from './components/ConnectionBanner'
import { HintWord } from './components/HintWord'
import { TimerBadge } from './components/TimerBadge'
import { ChatPanel } from './features/chat/ChatPanel'
import { ReplayPlayer } from './features/drawing/ReplayPlayer'
import { Toolbar } from './features/drawing/Toolbar'
import { Leaderboard } from './features/leaderboard/Leaderboard'
import { LobbyView } from './features/lobby/LobbyView'
import { CreateRoomPage } from './pages/CreateRoomPage'
import { LandingPage } from './pages/LandingPage'
import { useGameStore } from './stores/gameStore'

vi.mock('./services/socket', () => ({
  createRoom: vi.fn(),
  watchRoom: vi.fn(),
  ensureConnected: vi.fn(),
}))

const room: PublicRoomState = {
  id: 'room',
  code: 'ABCD2345',
  name: 'Friday',
  phase: 'WAITING',
  settings: { rounds: 3, drawDurationSec: 80, wordSelectSec: 15, resultsSec: 8, capacity: 8, wordList: 'mixed', customWordCount: 0 },
  hostId: 'host',
  round: 0,
  totalRounds: 3,
  turnId: null,
  drawerId: null,
  players: [
    { id: 'host', name: 'Ada', score: 0, connected: true, isHost: true, isDrawer: false, guessed: false, guessPoints: null },
    { id: 'bea', name: 'Bea', score: 0, connected: false, isHost: false, isDrawer: false, guessed: false, guessPoints: null },
  ],
  hint: null,
  selectionEndsAt: null,
  drawEndsAt: null,
  resultsEndsAt: null,
  serverNow: Date.now(),
  chat: [],
  scene: [],
  lastSeq: 0,
  roundResult: null,
  leaderboard: null,
  archives: [],
  systemMessage: null,
  connectedCount: 1,
}

describe('interface', () => {
  it('validates the landing form', async () => {
    useGameStore.setState({ playerName: '' })
    render(<MemoryRouter><LandingPage /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: 'Join room' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/name/i)
  })

  it('renders the create-room settings', () => {
    useGameStore.setState({ playerName: 'Ada' })
    render(<MemoryRouter><CreateRoomPage /></MemoryRouter>)
    expect(screen.getByLabelText('Rounds')).toBeInTheDocument()
    expect(screen.getByLabelText('Draw seconds')).toBeInTheDocument()
    expect(screen.getByLabelText('Word list')).toBeInTheDocument()
  })

  it('shows the lobby, host control, and disconnected player', () => {
    const onStart = vi.fn()
    render(<LobbyView room={room} isHost canStart={false} onStart={onStart} onCopy={vi.fn()} copied={false} />)
    expect(screen.getByText('ABCD2345')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /waiting for at least two/i })).toBeDisabled()
    expect(screen.getByText('Reconnecting')).toBeInTheDocument()
  })

  it('renders drawing tools, chat, timer, hint, leaderboard, and replay controls', async () => {
    const onColor = vi.fn()
    render(<Toolbar color="#1c1917" size={10} tool="pen" canDraw onColor={onColor} onSize={vi.fn()} onTool={vi.fn()} onUndo={vi.fn()} onClear={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Color #e11d48' }))
    expect(onColor).toHaveBeenCalledWith('#e11d48')
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled()

    const onSend = vi.fn()
    render(<ChatPanel messages={[]} canSend placeholder="Type a guess" closeNotice={false} onSend={onSend} />)
    await userEvent.type(screen.getByLabelText('Message'), 'cat{enter}')
    expect(onSend).toHaveBeenCalledWith('cat')

    render(<TimerBadge endsAt={Date.now() + 20_000} serverNow={Date.now()} label="Time" />)
    expect(screen.getByLabelText(/Time/)).toBeInTheDocument()
    render(<HintWord hint="_ _ t" />)
    expect(screen.getByLabelText('Hint _ _ t')).toBeInTheDocument()
    render(<ConnectionBanner connection="disconnected" error={null} />)
    expect(screen.getByRole('status')).toHaveTextContent(/Reconnecting/)
    render(<Leaderboard entries={[{ playerId: 'a', name: 'Ada', score: 10, rank: 1, connected: true }]} onLobby={vi.fn()} canLobby />)
    expect(screen.getByText(/Winner: Ada/)).toBeInTheDocument()
    render(<ReplayPlayer rounds={[{ round: 1, turnId: 'turn', drawerId: 'a', drawerName: 'Ada', word: 'cat', events: [{ type: 'undo', t: 1 }] }]} />)
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })
})
