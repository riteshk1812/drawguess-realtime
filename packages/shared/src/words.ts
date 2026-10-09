import type { WordChoice, WordListId } from './types.js'
import { difficultyFor } from './text.js'

const animals = [
  'cat', 'dog', 'fish', 'lion', 'tiger', 'zebra', 'horse', 'sheep', 'whale', 'eagle',
  'rabbit', 'monkey', 'panda', 'koala', 'camel', 'otter', 'giraffe', 'dolphin', 'penguin', 'elephant',
  'butterfly', 'crocodile', 'hedgehog', 'kangaroo',
]

const food = [
  'pie', 'soup', 'bread', 'apple', 'mango', 'pizza', 'pasta', 'sushi', 'taco', 'salad',
  'cookie', 'banana', 'orange', 'waffle', 'noodle', 'sandwich', 'pancake', 'burrito', 'popcorn', 'cupcake',
  'watermelon', 'strawberry', 'cheeseburger', 'pineapple',
]

const objects = [
  'key', 'lamp', 'book', 'clock', 'chair', 'table', 'pencil', 'guitar', 'camera', 'bottle',
  'pillow', 'mirror', 'rocket', 'bicycle', 'umbrella', 'backpack', 'telescope', 'headphones', 'skateboard', 'keyboard',
  'microscope', 'typewriter', 'chandelier', 'toothbrush',
]

const lists: Record<Exclude<WordListId, 'custom'>, string[]> = {
  animals,
  food,
  objects,
  mixed: [...new Set([...animals, ...food, ...objects])],
}

export function builtinWords(list: Exclude<WordListId, 'custom'>): string[] {
  return [...lists[list]]
}

export function pickWordChoices(
  words: readonly string[],
  exclude: readonly string[],
  rng: () => number = Math.random,
): WordChoice[] | null {
  const banned = new Set(exclude.map((word) => word.toLowerCase()))
  const unique = [...new Set(words.map((word) => word.trim()).filter(Boolean))]
  const fresh = unique.filter((word) => !banned.has(word.toLowerCase()))
  const pool = fresh.length >= 3 ? fresh : unique
  if (pool.length < 3) return null

  const buckets: Record<WordChoice['difficulty'], string[]> = {
    easy: pool.filter((word) => difficultyFor(word) === 'easy'),
    medium: pool.filter((word) => difficultyFor(word) === 'medium'),
    hard: pool.filter((word) => difficultyFor(word) === 'hard'),
  }
  const picked: string[] = []
  for (const key of ['easy', 'medium', 'hard'] as const) {
    const options = buckets[key].filter((word) => !picked.includes(word))
    if (options.length === 0) continue
    const index = Math.min(options.length - 1, Math.floor(rng() * options.length))
    const word = options[index]
    if (word) picked.push(word)
  }
  const rest = pool.filter((word) => !picked.includes(word))
  while (picked.length < 3 && rest.length > 0) {
    const index = Math.min(rest.length - 1, Math.floor(rng() * rest.length))
    const word = rest.splice(index, 1)[0]
    if (word) picked.push(word)
  }
  if (picked.length < 3) return null
  for (let index = picked.length - 1; index > 0; index -= 1) {
    const swap = Math.min(index, Math.floor(rng() * (index + 1)))
    const current = picked[index]
    const other = picked[swap]
    if (current && other) {
      picked[index] = other
      picked[swap] = current
    }
  }
  return picked.map((word) => ({ word, difficulty: difficultyFor(word) }))
}
