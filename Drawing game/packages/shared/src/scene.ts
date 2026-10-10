import { drawStroke, floodFill, parseColor, RasterBoard } from './raster.js'
import type { Point, ReplayEvent, SceneItem } from './types.js'

export interface StrokeChunk {
  opId: string
  tool: 'pen' | 'eraser' | 'fill'
  color: string
  size: number
  points: Point[]
  done?: boolean
}

export function findStrokeIndex(scene: SceneItem[], opId: string): number {
  for (let index = scene.length - 1; index >= 0; index -= 1) {
    const item = scene[index]
    if (!item || item.kind === 'clear') return -1
    if (item.kind === 'stroke' && item.opId === opId) return index
  }
  return -1
}

export function applyChunkToScene(scene: SceneItem[], chunk: StrokeChunk): {
  scene: SceneItem[]
  changed: boolean
  delta: Point[]
} {
  const color = chunk.tool === 'eraser' ? '#ffffff' : chunk.color
  if (chunk.tool === 'fill') {
    if (scene.some((item) => item.opId === chunk.opId)) return { scene, changed: false, delta: [] }
    const point = chunk.points[0]
    if (!point) return { scene, changed: false, delta: [] }
    return {
      changed: true,
      delta: [],
      scene: [...scene, { kind: 'fill', opId: chunk.opId, color, x: point.x, y: point.y }],
    }
  }
  const tool = chunk.tool === 'eraser' ? 'eraser' : 'pen'
  const index = findStrokeIndex(scene, chunk.opId)
  const points = chunk.points.slice()
  if (index === -1) {
    return {
      changed: true,
      delta: points,
      scene: [...scene, { kind: 'stroke', opId: chunk.opId, tool, color, size: chunk.size, points, done: Boolean(chunk.done) }],
    }
  }
  const current = scene[index]
  if (!current || current.kind !== 'stroke') return { scene, changed: false, delta: [] }
  if (points.length < current.points.length) return { scene, changed: false, delta: [] }
  const done = current.done || Boolean(chunk.done)
  if (points.length === current.points.length && done === current.done) {
    return { scene, changed: false, delta: [] }
  }
  const next = scene.slice()
  next[index] = { ...current, points, done, color, size: chunk.size, tool }
  return { scene: next, changed: true, delta: points.slice(current.points.length) }
}

export function undoScene(scene: SceneItem[]): SceneItem[] | null {
  if (scene.length === 0) return null
  return scene.slice(0, -1)
}

export function clearScene(scene: SceneItem[], opId: string): SceneItem[] {
  return [...scene, { kind: 'clear', opId }]
}

export function applyReplayEvent(scene: SceneItem[], event: ReplayEvent): SceneItem[] {
  if (event.type === 'undo') return scene.slice(0, -1)
  if (event.type === 'clear') return [...scene, { kind: 'clear', opId: event.opId }]
  if (event.type === 'fill') {
    return applyChunkToScene(scene, {
      opId: event.opId,
      tool: 'fill',
      color: event.color,
      size: 1,
      points: [{ x: event.x, y: event.y }],
      done: true,
    }).scene
  }
  const index = findStrokeIndex(scene, event.opId)
  if (index === -1) {
    return [...scene, {
      kind: 'stroke',
      opId: event.opId,
      tool: event.tool,
      color: event.color,
      size: event.size,
      points: event.points,
      done: true,
    }]
  }
  const current = scene[index]
  if (!current || current.kind !== 'stroke') return scene
  const next = scene.slice()
  next[index] = { ...current, points: [...current.points, ...event.points], done: true }
  return next
}

export function foldReplay(events: readonly ReplayEvent[]): SceneItem[] {
  return events.reduce<SceneItem[]>((scene, event) => applyReplayEvent(scene, event), [])
}

export function renderScene(scene: readonly SceneItem[], board = new RasterBoard()): RasterBoard {
  board.clear()
  for (const item of scene) {
    if (item.kind === 'clear') {
      board.clear()
    } else if (item.kind === 'fill') {
      floodFill(board, item.x, item.y, parseColor(item.color))
    } else {
      drawStroke(board, item)
    }
  }
  return board
}

export function mergeLonger(primary: SceneItem[], secondary: SceneItem[]): SceneItem[] {
  if (primary.length !== secondary.length) return primary
  return primary.map((item, index) => {
    const other = secondary[index]
    if (!other || item.kind !== 'stroke' || other.kind !== 'stroke' || item.opId !== other.opId) return item
    if (other.points.length > item.points.length) return other
    return item
  })
}
