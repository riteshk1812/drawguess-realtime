/**
 * Guesser points reward remaining time and earlier correct guesses.
 *
 *   timeRatio   = clamp(remainingMs / durationMs, 0, 1)
 *   orderFactor = max(0.55, 1 - orderIndex * 0.08)   // 0 for the first correct guess
 *   points      = max(0, round(500 * timeRatio * orderFactor))
 *
 * Drawer points are awarded once, when the round ends:
 *
 *   avg       = mean of guesser points this round (0 if nobody guessed)
 *   coverage  = correctGuesses / eligibleGuessers
 *   points    = max(0, round(avg * coverage))
 *
 * Scores are never negative. Each eligible player scores at most once per round.
 */
export function guesserPoints(input: {
  remainingMs: number
  durationMs: number
  orderIndex: number
}): number {
  if (input.durationMs <= 0) return 0
  const timeRatio = clamp(input.remainingMs / input.durationMs, 0, 1)
  const orderFactor = Math.max(0.55, 1 - input.orderIndex * 0.08)
  return Math.max(0, Math.round(500 * timeRatio * orderFactor))
}

export function drawerPoints(guesserScores: number[], eligibleCount: number): number {
  if (guesserScores.length === 0 || eligibleCount <= 0) return 0
  const avg = guesserScores.reduce((sum, value) => sum + value, 0) / guesserScores.length
  const coverage = guesserScores.length / eligibleCount
  return Math.max(0, Math.round(avg * coverage))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
