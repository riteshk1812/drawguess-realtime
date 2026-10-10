import { CANVAS, applyChunkToScene, type Point, type SceneItem } from '@drawguess/shared'
import { useEffect, useRef } from 'react'
import { sendStroke } from '../../services/socket'
import { applyLocalScene, store } from '../../stores/gameStore'
import { blit, inkContext } from './blit'

const NETWORK_MS = 50

interface LiveStroke {
  opId: string
  points: Point[]
  color: string
  size: number
  tool: 'pen' | 'eraser'
}

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
  const active = useRef<LiveStroke | null>(null)
  const sendTimer = useRef<number | null>(null)
  const turnRef = useRef(turnId)
  turnRef.current = turnId

  useEffect(() => {
    if (!enabled) active.current = null
    if (active.current) return
    if (ref.current) blit(ref.current, scene)
  }, [scene, enabled])

  function publish(done: boolean) {
    const current = active.current
    const currentTurn = turnRef.current
    if (!current || !currentTurn) return
    sendStroke({
      turnId: currentTurn,
      opId: current.opId,
      chunkId: crypto.randomUUID().replace(/-/g, '').slice(0, 24),
      tool: current.tool,
      color: current.color,
      size: current.size,
      points: current.points.map((point) => ({ x: point.x, y: point.y })),
      done,
    })
  }

  function queueSend(done: boolean) {
    if (done) {
      if (sendTimer.current) window.clearTimeout(sendTimer.current)
      sendTimer.current = null
      publish(true)
      return
    }
    if (sendTimer.current) return
    sendTimer.current = window.setTimeout(() => {
      sendTimer.current = null
      publish(false)
    }, NETWORK_MS)
  }

  function commit(done: boolean) {
    const current = active.current
    const room = store.getState().game.room
    if (!current || !room) return
    const next = applyChunkToScene(room.scene, {
      opId: current.opId,
      tool: current.tool,
      color: current.color,
      size: current.size,
      points: current.points.map((point) => ({ x: point.x, y: point.y })),
      done,
    }).scene
    store.dispatch(applyLocalScene(next))
  }

  function remember(canvas: HTMLCanvasElement, stroke: LiveStroke, point: Point) {
    const previous = stroke.points[stroke.points.length - 1]
    if (previous && previous.x === point.x && previous.y === point.y) return
    stroke.points.push(point)
    drawMark(canvas, previous ?? null, point, stroke)
    if (stroke.points.length >= 500 && previous) {
      queueSend(true)
      commit(true)
      active.current = {
        opId: createOpId(),
        points: [point],
        color: stroke.color,
        size: stroke.size,
        tool: stroke.tool,
      }
      return
    }
    queueSend(false)
  }

  function finish(canvas: HTMLCanvasElement, event: { clientX: number; clientY: number }) {
    if (!active.current) return
    remember(canvas, active.current, toPoint(canvas, event))
    if (!active.current) return
    queueSend(true)
    commit(true)
    active.current = null
  }

  return (
    <canvas
      ref={ref}
      width={CANVAS.width}
      height={CANVAS.height}
      className="aspect-[8/5] w-full touch-none rounded-2xl bg-white"
      aria-label="Drawing canvas"
      onPointerDown={(event) => {
        if (!enabled || event.button !== 0) return
        const point = toPoint(event.currentTarget, event)
        if (tool === 'fill') {
          const room = store.getState().game.room
          if (!room || !turnId) return
          const opId = createOpId()
          const next = applyChunkToScene(room.scene, { opId, tool, color, size, points: [point], done: true }).scene
          store.dispatch(applyLocalScene(next))
          sendStroke({
            turnId,
            opId,
            chunkId: crypto.randomUUID().replace(/-/g, '').slice(0, 24),
            tool,
            color,
            size,
            points: [point],
            done: true,
          })
          return
        }
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // Drawing continues from pointer events when capture is unavailable.
        }
        const stroke: LiveStroke = { opId: createOpId(), points: [], color, size, tool }
        active.current = stroke
        remember(event.currentTarget, stroke, point)
      }}
      onPointerMove={(event) => {
        if (!active.current || !enabled) return
        const native = event.nativeEvent
        const coalesced = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : []
        const samples = coalesced.length > 0 ? coalesced : [native]
        for (const sample of samples) {
          const current = active.current
          if (!current) return
          remember(event.currentTarget, current, toPoint(event.currentTarget, sample))
        }
      }}
      onPointerUp={(event) => finish(event.currentTarget, event)}
      onPointerCancel={(event) => finish(event.currentTarget, event)}
    />
  )
}

function drawMark(canvas: HTMLCanvasElement, from: Point | null, to: Point, stroke: LiveStroke): void {
  const context = inkContext(canvas)
  if (!context) return
  const ink = stroke.tool === 'eraser' ? '#ffffff' : stroke.color
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.strokeStyle = ink
  context.fillStyle = ink
  context.lineWidth = Math.max(1, stroke.size)
  if (!from) {
    context.beginPath()
    context.arc(to.x, to.y, Math.max(0.5, stroke.size / 2), 0, Math.PI * 2)
    context.fill()
    return
  }
  context.beginPath()
  context.moveTo(from.x, from.y)
  context.lineTo(to.x, to.y)
  context.stroke()
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
