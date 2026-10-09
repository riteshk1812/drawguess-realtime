import { CANVAS, applyChunkToScene, type Point, type SceneItem } from '@drawguess/shared'
import { useEffect, useRef } from 'react'
import { sendStroke } from '../../services/socket'
import { useGameStore } from '../../stores/gameStore'
import { blit } from './blit'

export function DrawCanvas({
  scene,
  turnId,
  enabled,
  color,
  size,
  tool,
}: {
  scene: SceneItem[]
  turnId: string | null
  enabled: boolean
  color: string
  size: number
  tool: 'pen' | 'eraser' | 'fill'
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const active = useRef<{ opId: string; points: Point[] } | null>(null)
  const flushTimer = useRef<number | null>(null)

  useEffect(() => {
    if (ref.current) blit(ref.current, scene)
  }, [scene])

  function paint(chunk: { opId: string; points: Point[]; done: boolean }) {
    const room = useGameStore.getState().room
    if (!room) return
    const next = applyChunkToScene(room.scene, { opId: chunk.opId, tool, color, size, points: chunk.points, done: chunk.done }).scene
    useGameStore.getState().applyLocalScene(next)
    if (!turnId) return
    sendStroke({
      turnId,
      opId: chunk.opId,
      chunkId: crypto.randomUUID().replace(/-/g, '').slice(0, 24),
      tool,
      color,
      size,
      points: chunk.points,
      done: chunk.done,
    })
  }

  function schedule(done: boolean) {
    if (flushTimer.current) window.clearTimeout(flushTimer.current)
    const send = () => {
      const current = active.current
      if (!current || current.points.length === 0) return
      paint({ ...current, done })
    }
    if (done) send()
    else flushTimer.current = window.setTimeout(send, 40)
  }

  return (
    <canvas
      ref={ref}
      width={CANVAS.width}
      height={CANVAS.height}
      className="aspect-[8/5] w-full touch-none rounded-2xl bg-white"
      aria-label="Drawing canvas"
      onPointerDown={(event) => {
        if (!enabled) return
        const point = toPoint(event.currentTarget, event)
        if (tool === 'fill') {
          paint({ opId: createOpId(), points: [point], done: true })
          return
        }
        event.currentTarget.setPointerCapture(event.pointerId)
        active.current = { opId: createOpId(), points: [point] }
        schedule(false)
      }}
      onPointerMove={(event) => {
        if (!active.current || !enabled) return
        active.current.points.push(toPoint(event.currentTarget, event))
        if (active.current.points.length >= 500) {
          const finished = active.current
          active.current = { opId: createOpId(), points: [finished.points[finished.points.length - 1] ?? toPoint(event.currentTarget, event)] }
          paint({ ...finished, done: true })
          return
        }
        schedule(false)
      }}
      onPointerUp={() => {
        if (!active.current) return
        schedule(true)
        active.current = null
      }}
    />
  )
}

function toPoint(canvas: HTMLCanvasElement, event: { clientX: number; clientY: number }): Point {
  const rect = canvas.getBoundingClientRect()
  const width = rect.width || CANVAS.width
  const height = rect.height || CANVAS.height
  return {
    x: clamp(((event.clientX - rect.left) / width) * CANVAS.width, 0, CANVAS.width),
    y: clamp(((event.clientY - rect.top) / height) * CANVAS.height, 0, CANVAS.height),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function createOpId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 24)
}
