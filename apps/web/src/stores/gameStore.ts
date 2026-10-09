import { create } from 'zustand'
import type { PrivateView, PublicRoomState } from '@drawguess/shared'
import { loadName, saveName } from '../services/session'
import { mergeRoom } from '../utils/reconcile'

export type Connection = 'idle' | 'connecting' | 'connected' | 'disconnected'

interface GameStore {
  playerName: string
  connection: Connection
  error: string | null
  room: PublicRoomState | null
  me: PrivateView | null
  setPlayerName: (name: string) => void
  setConnection: (connection: Connection) => void
  setError: (error: string | null) => void
  applyServerState: (room: PublicRoomState) => void
  applyLocalScene: (scene: PublicRoomState['scene']) => void
  applyPrivate: (me: PrivateView) => void
  resetRoom: () => void
}

export const useGameStore = create<GameStore>((set) => ({
  playerName: typeof sessionStorage === 'undefined' ? '' : loadName(),
  connection: 'idle',
  error: null,
  room: null,
  me: null,
  setPlayerName: (playerName) => {
    saveName(playerName)
    set({ playerName })
  },
  setConnection: (connection) => set({ connection }),
  setError: (error) => set({ error }),
  applyServerState: (room) => set((state) => ({ room: mergeRoom(state.room, room), error: null })),
  applyLocalScene: (scene) => set((state) => (state.room ? { room: { ...state.room, scene } } : state)),
  applyPrivate: (me) => set({ me }),
  resetRoom: () => set({ room: null, me: null }),
}))
