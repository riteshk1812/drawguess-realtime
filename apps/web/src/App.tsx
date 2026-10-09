import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { CreateRoomPage } from './pages/CreateRoomPage'
import { LandingPage } from './pages/LandingPage'
import { RoomPage } from './pages/RoomPage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/create" element={<CreateRoomPage />} />
        <Route path="/room/:code" element={<RoomPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
