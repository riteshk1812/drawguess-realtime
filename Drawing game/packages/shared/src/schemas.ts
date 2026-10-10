import { z } from 'zod'
import { CANVAS, LIMITS, WORD_LIST_IDS } from './constants.js'
import type { GameSettings } from './types.js'

export interface SettingsBounds {
  minDrawSec: number
  minSelectSec: number
  minResultsSec: number
}

const productionBounds: SettingsBounds = {
  minDrawSec: LIMITS.minDrawSec,
  minSelectSec: LIMITS.minSelectSec,
  minResultsSec: LIMITS.minResultsSec,
}

export function createSettingsSchema(bounds: SettingsBounds = productionBounds) {
  return z
    .object({
      rounds: z.number().int().min(LIMITS.minRounds).max(LIMITS.maxRounds),
      drawDurationSec: z.number().int().min(bounds.minDrawSec).max(LIMITS.maxDrawSec),
      wordSelectSec: z.number().int().min(bounds.minSelectSec).max(LIMITS.maxSelectSec),
      resultsSec: z.number().int().min(bounds.minResultsSec).max(LIMITS.maxResultsSec),
      capacity: z.number().int().min(LIMITS.minCapacity).max(LIMITS.maxCapacity),
      wordList: z.enum(WORD_LIST_IDS),
      customWords: z.array(z.string().trim().min(2).max(LIMITS.maxWordLength)).max(LIMITS.maxCustomWords).default([]),
    })
    .superRefine((value, context) => {
      if (value.wordList !== 'custom') return
      const unique = new Set(value.customWords.map((word) => word.toLowerCase()))
      if (unique.size < LIMITS.minCustomWords) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customWords'],
          message: `Add at least ${LIMITS.minCustomWords} unique custom words`,
        })
      }
    })
}

export const settingsSchema = createSettingsSchema()

export const createRoomSchema = z.object({
  playerName: z.string().trim().min(1).max(16),
  roomName: z.string().trim().min(1).max(40),
  settings: settingsSchema,
})

export const joinRoomSchema = z.object({
  code: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z2-9]{8}$/, 'Enter an 8-character room code')),
  playerName: z.string().trim().min(1).max(16),
})

export const reconnectSchema = z.object({
  code: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z2-9]{8}$/)),
  playerId: z.string().regex(/^[a-f0-9]{16,64}$/),
  reconnectToken: z.string().min(20).max(200),
})

export const chatSchema = z.object({
  text: z.string().trim().min(1).max(120),
  turnId: z.string().regex(/^[a-f0-9]{8,64}$/).nullable(),
})

export const wordSelectSchema = z.object({
  turnId: z.string().regex(/^[a-f0-9]{8,64}$/),
  word: z.string().trim().min(1).max(40),
})

export const turnSchema = z.object({
  turnId: z.string().regex(/^[a-f0-9]{8,64}$/),
})

export const drawChunkSchema = z
  .object({
    turnId: z.string().regex(/^[a-f0-9]{8,64}$/),
    opId: z.string().regex(/^[a-zA-Z0-9]{8,64}$/),
    chunkId: z.string().regex(/^[a-zA-Z0-9]{8,64}$/),
    tool: z.enum(['pen', 'eraser', 'fill']),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    size: z.number().int().min(1).max(48),
    points: z
      .array(
        z.object({
          x: z.number().finite().min(0).max(CANVAS.width),
          y: z.number().finite().min(0).max(CANVAS.height),
        }),
      )
      .min(1)
      .max(500),
    done: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.tool === 'fill' && value.points.length !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['points'],
        message: 'Fill uses a single point',
      })
    }
  })

export function formatZodError(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid input'
  const path = issue.path.join('.')
  return path ? `${path}: ${issue.message}` : issue.message
}

export function parseSettings(input: unknown, bounds?: SettingsBounds): GameSettings {
  const parsed = createSettingsSchema(bounds).parse(input)
  return {
    ...parsed,
    customWords: parsed.wordList === 'custom' ? [...new Set(parsed.customWords)] : [],
  }
}

export type DrawChunkInput = z.infer<typeof drawChunkSchema>
