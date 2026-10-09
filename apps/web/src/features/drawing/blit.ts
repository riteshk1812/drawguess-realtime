import { renderScene, type SceneItem } from '@drawguess/shared'

export function blit(canvas: HTMLCanvasElement, scene: readonly SceneItem[]): void {
  const context = canvas.getContext('2d')
  if (!context) return
  const board = renderScene([...scene])
  const pixels = new Uint8ClampedArray(board.data.byteLength)
  pixels.set(board.data)
  const image = new ImageData(pixels, board.width, board.height)
  context.putImageData(image, 0, 0)
}
