import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux'
import type { PrivateView, PublicRoomState } from '@drawguess/shared'
import { loadName, saveName } from '../services/session'
import { mergeRoom } from '../utils/reconcile'

export type Connection = 'idle' | 'connecting' | 'connected' | 'disconnected'

interface GameState {
  playerName: string
  connection: Connection
  error: string | null
  room: PublicRoomState | null
  me: PrivateView | null
}

const initialState: GameState = {
  playerName: typeof sessionStorage === 'undefined' ? '' : loadName(),
  connection: 'idle',
  error: null,
  room: null,
  me: null,
}

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    playerNameSet(state, action: PayloadAction<string>) {
      state.playerName = action.payload
    },
    setConnection(state, action: PayloadAction<Connection>) {
      state.connection = action.payload
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload
    },
    applyServerState(state, action: PayloadAction<PublicRoomState>) {
      state.room = mergeRoom(state.room, action.payload)
      state.error = null
    },
    applyLocalScene(state, action: PayloadAction<PublicRoomState['scene']>) {
      if (!state.room) return
      state.room.scene = action.payload
    },
    applyPrivate(state, action: PayloadAction<PrivateView>) {
      state.me = action.payload
    },
    resetRoom(state) {
      state.room = null
      state.me = null
    },
  },
})

export const store = configureStore({
  reducer: { game: gameSlice.reducer },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export const { setConnection, setError, applyServerState, applyLocalScene, applyPrivate, resetRoom } = gameSlice.actions

export function setPlayerName(name: string) {
  return (dispatch: AppDispatch) => {
    saveName(name)
    dispatch(gameSlice.actions.playerNameSet(name))
  }
}

export const useAppDispatch: () => AppDispatch = useDispatch
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector
