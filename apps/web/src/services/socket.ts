import type { DrawChunkInput, PrivateView, PublicRoomState } from '@drawguess/shared'
import { io, type Socket } from 'socket.io-client'
import { useGameStore } from '../stores/gameStore'
import { clearSession, loadSession, saveSession, type SavedSession } from './session'

export interface Ack {
  ok: boolean
  error?: string
  code?: string
  state?: PublicRoomState
  me?: PrivateView
  session?: { playerId: string; reconnectToken: string; roomId: string; code: string }
  correct?: boolean
  close?: boolean
  points?: number
}

const URL = import.meta.env.VITE_SOCKET_URL || (typeof window === 'undefined' ? 'http://127.0.0.1:3001' : window.location.origin)

export const socket: Socket = io(URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  timeout: 8000,
})

let wired = false
let watchedCode: string | null = null
let strokeFlight = 0
let pendingStroke: DrawChunkInput | null = null

export function ensureConnected(): void {
  wire()
  if (!socket.connected) {
    useGameStore.getState().setConnection('connecting')
    socket.connect()
  }
}

export function watchRoom(code: string): void {
  watchedCode = code.toUpperCase()
  ensureConnected()
}

export async function createRoom(input: { playerName: string; roomName: string; settings: unknown }): Promise<Ack> {
  ensureConnected()
  await waitForConnect()
  const ack = await emit<Ack>('room:create', input)
  return accept(ack, input.playerName)
}

export async function joinRoom(input: { code: string; playerName: string }): Promise<Ack> {
  ensureConnected()
  await waitForConnect()
  const ack = await emit<Ack>('room:join', { ...input, code: input.code.toUpperCase() })
  return accept(ack, input.playerName)
}

export async function reconnect(session = loadSession()): Promise<Ack> {
  if (!session) return { ok: false, code: 'forbidden', error: 'No saved session' }
  ensureConnected()
  await waitForConnect()
  const ack = await emit<Ack>('room:reconnect', session)
  if (!ack.ok) {
    clearSession()
    useGameStore.getState().setError(ack.error ?? 'Could not reconnect')
    return ack
  }
  return accept(ack, session.playerName)
}

export async function startGame(): Promise<Ack> {
  return take(await emit<Ack>('room:start', {}))
}

export async function updateSettings(settings: unknown): Promise<Ack> {
  return take(await emit<Ack>('room:settings', { settings }))
}

export async function selectWord(turnId: string, word: string): Promise<Ack> {
  return take(await emit<Ack>('word:select', { turnId, word }))
}

export async function sendText(text: string, turnId: string | null): Promise<Ack> {
  return take(await emit<Ack>('chat:send', { text, turnId }))
}

export async function undoDraw(turnId: string): Promise<Ack> {
  return take(await emit<Ack>('draw:undo', { turnId }))
}

export async function clearDraw(turnId: string): Promise<Ack> {
  return take(await emit<Ack>('draw:clear', { turnId }))
}

export async function returnToLobby(): Promise<Ack> {
  return take(await emit<Ack>('room:lobby', {}))
}

export async function requestSync(): Promise<Ack> {
  return take(await emit<Ack>('sync:request', {}))
}

export function sendStroke(chunk: DrawChunkInput): void {
  if (strokeFlight >= 2) {
    pendingStroke = chunk
    return
  }
  strokeFlight += 1
  socket.timeout(4000).emit('draw:chunk', chunk, (error: Error | null) => {
    strokeFlight = Math.max(0, strokeFlight - 1)
    if (error) void requestSync()
    const next = pendingStroke
    pendingStroke = null
    if (next) sendStroke(next)
  })
}

function accept(ack: Ack, playerName: string): Ack {
  if (ack.ok && ack.session) {
    const session: SavedSession = { ...ack.session, playerName }
    saveSession(session)
  }
  return take(ack)
}

function take(ack: Ack): Ack {
  const store = useGameStore.getState()
  if (ack.state) store.applyServerState(ack.state)
  if (ack.me) store.applyPrivate(ack.me)
  if (!ack.ok) store.setError(ack.error ?? 'Request failed')
  return ack
}

function wire(): void {
  if (wired) return
  wired = true
  socket.on('connect', () => {
    useGameStore.getState().setConnection('connected')
    const session = loadSession()
    if (session && watchedCode && session.code === watchedCode) void reconnect(session)
  })
  socket.on('disconnect', () => useGameStore.getState().setConnection('disconnected'))
  socket.on('connect_error', () => useGameStore.getState().setConnection('disconnected'))
  socket.on('room:state', (state: PublicRoomState) => useGameStore.getState().applyServerState(state))
  socket.on('player:private', (me: PrivateView) => useGameStore.getState().applyPrivate(me))
  socket.on('session:replaced', (payload: { error?: string }) => {
    clearSession()
    useGameStore.getState().resetRoom()
    useGameStore.getState().setError(payload.error ?? 'Connected somewhere else')
  })
  socket.on('server:shutdown', () => {
    useGameStore.getState().setError('The server is shutting down. Rejoin in a moment.')
    useGameStore.getState().setConnection('disconnected')
  })
}

function waitForConnect(): Promise<void> {
  if (socket.connected) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('Could not reach the game server'))
    }, 8000)
    const cleanup = () => {
      window.clearTimeout(timer)
      socket.off('connect', onConnect)
      socket.off('connect_error', onError)
    }
    const onConnect = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('Could not reach the game server'))
    }
    socket.on('connect', onConnect)
    socket.on('connect_error', onError)
  })
}

function emit<T>(event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(8000).emit(event, payload, (error: Error | null, response: T) => {
      if (error) reject(new Error('The server did not respond'))
      else resolve(response)
    })
  })
}
