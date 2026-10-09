export interface SavedSession {
  code: string
  playerId: string
  reconnectToken: string
  playerName: string
}

const NAME_KEY = 'drawguess.playerName'
const SESSION_KEY = 'drawguess.session'

export function loadName(): string {
  return sessionStorage.getItem(NAME_KEY) ?? ''
}

export function saveName(name: string): void {
  sessionStorage.setItem(NAME_KEY, name)
}

export function loadSession(): SavedSession | null {
  const raw = sessionStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as SavedSession
    if (!parsed.code || !parsed.playerId || !parsed.reconnectToken) return null
    return parsed
  } catch {
    return null
  }
}

export function saveSession(session: SavedSession): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  saveName(session.playerName)
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY)
}
