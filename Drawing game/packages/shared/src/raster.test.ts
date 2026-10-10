import { describe, expect, it } from 'vitest'
import { floodFill, RasterBoard } from './raster.js'

describe('flood fill', () => {
  it('fills an enclosed area without crossing a stroke', () => {
    const board = new RasterBoard(24, 24)
    for (let i = 4; i <= 16; i += 1) {
      board.set(i, 4, 0x000000)
      board.set(i, 16, 0x000000)
      board.set(4, i, 0x000000)
      board.set(16, i, 0x000000)
    }
    floodFill(board, 10, 10, 0xff0000)
    expect(board.get(10, 10)).toBe(0xff0000)
    expect(board.get(2, 2)).toBe(0xffffff)
    expect(board.get(4, 4)).toBe(0x000000)
  })

  it('fills a full canvas quickly enough for a click', () => {
    const board = new RasterBoard()
    const started = Date.now()
    floodFill(board, 1, 1, 0x00aa88)
    expect(Date.now() - started).toBeLessThan(1500)
    expect(board.get(790, 490)).toBe(0x00aa88)
  })
})
