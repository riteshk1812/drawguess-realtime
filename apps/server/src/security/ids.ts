import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function createId(bytes = 16): string {
  return randomBytes(bytes).toString('hex')
}

export function createRoomCode(): string {
  const data = randomBytes(8)
  let code = ''
  for (const value of data) code += ALPHABET[value % ALPHABET.length] ?? 'A'
  return code
}

export function createToken(): string {
  return randomBytes(32).toString('base64url')
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function tokenMatches(token: string, hash: string): boolean {
  const actual = Buffer.from(tokenHash(token), 'utf8')
  const expected = Buffer.from(hash, 'utf8')
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}
