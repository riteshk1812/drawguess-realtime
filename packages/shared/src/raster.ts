import { CANVAS } from './constants.js'
import type { Point } from './types.js'

export class RasterBoard {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray

  constructor(width = CANVAS.width, height = CANVAS.height) {
    this.width = width
    this.height = height
    this.data = new Uint8ClampedArray(width * height * 4)
    this.clear()
  }

  clear(): void {
    this.data.fill(255)
  }

  in(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height
  }

  get(x: number, y: number): number {
    const index = (y * this.width + x) * 4
    return ((this.data[index] ?? 0) << 16) | ((this.data[index + 1] ?? 0) << 8) | (this.data[index + 2] ?? 0)
  }

  set(x: number, y: number, rgb: number): void {
    if (!this.in(x, y)) return
    const index = (y * this.width + x) * 4
    this.data[index] = (rgb >> 16) & 255
    this.data[index + 1] = (rgb >> 8) & 255
    this.data[index + 2] = rgb & 255
    this.data[index + 3] = 255
  }
}

export function parseColor(color: string): number {
  const match = /^#([0-9a-fA-F]{6})$/.exec(color)
  if (!match?.[1]) return 0x111111
  return Number.parseInt(match[1], 16)
}

export function stampCircle(board: RasterBoard, cx: number, cy: number, radius: number, rgb: number): void {
  const r = Math.max(1, Math.round(radius))
  const r2 = r * r
  const baseX = Math.round(cx)
  const baseY = Math.round(cy)
  for (let y = -r; y <= r; y += 1) {
    for (let x = -r; x <= r; x += 1) {
      if (x * x + y * y <= r2) board.set(baseX + x, baseY + y, rgb)
    }
  }
}

export function drawStroke(
  board: RasterBoard,
  stroke: { tool: 'pen' | 'eraser'; color: string; size: number; points: Point[] },
): void {
  const rgb = stroke.tool === 'eraser' ? 0xffffff : parseColor(stroke.color)
  const radius = Math.max(1, stroke.size / 2)
  let previous: Point | null = null
  for (const point of stroke.points) {
    if (previous) {
      const dx = point.x - previous.x
      const dy = point.y - previous.y
      const distance = Math.hypot(dx, dy)
      const step = Math.max(1, radius / 2)
      const count = Math.max(1, Math.ceil(distance / step))
      for (let index = 1; index <= count; index += 1) {
        stampCircle(board, previous.x + (dx * index) / count, previous.y + (dy * index) / count, radius, rgb)
      }
    } else {
      stampCircle(board, point.x, point.y, radius, rgb)
    }
    previous = point
  }
}

/** Iterative scanline flood fill. Exact color match keeps every client deterministic. */
export function floodFill(board: RasterBoard, startX: number, startY: number, fill: number): void {
  const x0 = Math.round(startX)
  const y0 = Math.round(startY)
  if (!board.in(x0, y0)) return
  const target = board.get(x0, y0)
  if (target === fill) return
  const width = board.width
  const height = board.height
  const data = board.data
  const matches = (x: number, y: number) => {
    const index = (y * width + x) * 4
    const rgb = ((data[index] ?? 0) << 16) | ((data[index + 1] ?? 0) << 8) | (data[index + 2] ?? 0)
    return rgb === target
  }
  const paint = (x: number, y: number) => {
    const index = (y * width + x) * 4
    data[index] = (fill >> 16) & 255
    data[index + 1] = (fill >> 8) & 255
    data[index + 2] = fill & 255
    data[index + 3] = 255
  }
  const stack = [x0, y0]
  while (stack.length > 0) {
    const y = stack.pop()
    let x = stack.pop()
    if (y === undefined || x === undefined) break
    while (x > 0 && matches(x - 1, y)) x -= 1
    let spanUp = false
    let spanDown = false
    while (x < width && matches(x, y)) {
      paint(x, y)
      if (y > 0) {
        const up = matches(x, y - 1)
        if (up && !spanUp) {
          stack.push(x, y - 1)
          spanUp = true
        } else if (!up) spanUp = false
      }
      if (y < height - 1) {
        const down = matches(x, y + 1)
        if (down && !spanDown) {
          stack.push(x, y + 1)
          spanDown = true
        } else if (!down) spanDown = false
      }
      x += 1
    }
  }
}
