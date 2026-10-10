import { HINT_FRACTIONS } from './constants.js'

export function maskWord(word: string, revealed: readonly number[]): string {
  const set = new Set(revealed)
  return [...word]
    .map((character, index) => {
      if (character === ' ') return ' '
      return set.has(index) ? character : '_'
    })
    .join(' ')
}

export function letterIndexes(word: string): number[] {
  const indexes: number[] = []
  for (let index = 0; index < word.length; index += 1) {
    if (word[index] !== ' ') indexes.push(index)
  }
  return indexes
}

/** How many letters should be visible at a reveal stage. Never the whole word. */
export function planRevealCount(letterCount: number, stage: number): number {
  if (letterCount <= 1) return 0
  if (letterCount === 2) return stage >= 3 ? 1 : 0
  if (letterCount === 3) return stage >= 2 ? 1 : 0
  const plan = [
    0,
    1,
    Math.min(letterCount - 1, Math.max(2, Math.floor(letterCount * 0.34))),
    Math.min(letterCount - 1, Math.max(2, Math.floor(letterCount * 0.5))),
  ]
  return plan[Math.min(Math.max(stage, 0), 3)] ?? 0
}

export function pickReveals(
  word: string,
  already: readonly number[],
  stage: number,
  rng: () => number,
): number[] {
  const letters = letterIndexes(word)
  const target = Math.min(planRevealCount(letters.length, stage), Math.max(0, letters.length - 1))
  const next = [...already]
  const pool = letters.filter((index) => !next.includes(index))
  while (next.length < target && pool.length > 0) {
    const pick = Math.min(pool.length - 1, Math.floor(rng() * pool.length))
    const index = pool.splice(pick, 1)[0]
    if (index !== undefined) next.push(index)
  }
  return next
}

export function nextHintAt(drawStartedAt: number, durationMs: number, hintStage: number): number | null {
  const fraction = HINT_FRACTIONS[hintStage]
  if (fraction === undefined) return null
  return drawStartedAt + durationMs * fraction
}
