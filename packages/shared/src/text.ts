/** Case-insensitive match. Punctuation is ignored and whitespace is collapsed. */
export function normalizeAnswer(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function compactAnswer(input: string): string {
  return normalizeAnswer(input).replace(/ /g, '')
}

/**
 * "ice cream" matches "icecream". Comparison never throws and never reports
 * which side was longer.
 */
export function answersMatch(guess: string, word: string): boolean {
  const left = normalizeAnswer(guess)
  const right = normalizeAnswer(word)
  if (!left || !right) return false
  return left === right || compactAnswer(guess) === compactAnswer(word)
}

export function levenshtein(left: string, right: string): number {
  const a = left
  const b = right
  const prev = new Array<number>(b.length + 1)
  const next = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j += 1) prev[j] = j
  for (let i = 1; i <= a.length; i += 1) {
    next[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const del = (prev[j] ?? 0) + 1
      const ins = (next[j - 1] ?? 0) + 1
      const sub = (prev[j - 1] ?? 0) + cost
      next[j] = Math.min(del, ins, sub)
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = next[j] ?? 0
  }
  return prev[b.length] ?? 0
}

/**
 * Private near-miss rule.
 * Distance must be small, length must be close, and the guess must be at
 * least 3 characters so single-letter probes are not confirmed.
 * Words of length <= 5 allow distance 1. Longer words allow distance 2.
 */
export function isCloseGuess(guess: string, word: string): boolean {
  if (answersMatch(guess, word)) return false
  const left = compactAnswer(guess)
  const right = compactAnswer(word)
  if (left.length < 3 || right.length < 3) return false
  if (Math.abs(left.length - right.length) > 2) return false
  const distance = levenshtein(left, right)
  const threshold = right.length <= 5 ? 1 : 2
  return distance > 0 && distance <= threshold
}

export function difficultyFor(word: string): 'easy' | 'medium' | 'hard' {
  const length = compactAnswer(word).length
  if (length <= 5) return 'easy'
  if (length <= 8) return 'medium'
  return 'hard'
}

export function normalizePlayerName(input: string): string | null {
  const name = input.trim().replace(/\s+/g, ' ')
  if (name.length < 1 || name.length > 16) return null
  if (!/^[\p{L}\p{N} _.'-]+$/u.test(name)) return null
  return name
}

export function normalizeRoomName(input: string): string | null {
  const name = input.trim().replace(/\s+/g, ' ')
  if (name.length < 1 || name.length > 40) return null
  if (!/^[\p{L}\p{N} _.'!-]+$/u.test(name)) return null
  return name
}
