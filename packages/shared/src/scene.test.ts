import { describe, expect, it } from 'vitest'
import { RasterBoard } from './raster.js'
import { applyChunkToScene, clearScene, foldReplay, renderScene, undoScene } from './scene.js'
import type { ReplayEvent } from './types.js'

describe('scene replay', () => {
  it('folds undo and clear into the same pixels as the live scene', () => {
    let scene = applyChunkToScene([], {
      opId: 'stroke0001',
      tool: 'pen',
      color: '#112233',
      size: 6,
      points: [{ x: 8, y: 8 }, { x: 20, y: 12 }],
      done: true,
    }).scene
    const events: ReplayEvent[] = [
      { type: 'points', opId: 'stroke0001', tool: 'pen', color: '#112233', size: 6, points: [{ x: 8, y: 8 }, { x: 20, y: 12 }], t: 1 },
    ]
    scene = clearScene(scene, 'clear00001')
    events.push({ type: 'clear', opId: 'clear00001', t: 2 })
    const undone = undoScene(scene)
    expect(undone).not.toBeNull()
    scene = undone ?? []
    events.push({ type: 'undo', t: 3 })
    const live = renderScene(scene, new RasterBoard(40, 30))
    const replayed = renderScene(foldReplay(events), new RasterBoard(40, 30))
    expect(Array.from(replayed.data)).toEqual(Array.from(live.data))
    expect(live.get(8, 8)).toBe(0x112233)
  })

  it('keeps a pen stroke independent of the array still being drawn', () => {
    const points = [{ x: 4, y: 4 }]
    const first = applyChunkToScene([], {
      opId: 'pen1',
      tool: 'pen',
      color: '#112233',
      size: 8,
      points,
      done: false,
    })
    points.push({ x: 16, y: 10 })
    const stored = first.scene[0]
    expect(stored?.kind === 'stroke' && stored.points).toEqual([{ x: 4, y: 4 }])
    const second = applyChunkToScene(first.scene, {
      opId: 'pen1',
      tool: 'pen',
      color: '#112233',
      size: 8,
      points,
      done: true,
    })
    const grown = second.scene[0]
    expect(grown?.kind === 'stroke' && grown.points).toEqual([{ x: 4, y: 4 }, { x: 16, y: 10 }])
    expect(grown?.kind === 'stroke' && grown.done).toBe(true)
    const board = renderScene(second.scene, new RasterBoard(40, 30))
    expect(board.get(4, 4)).toBe(0x112233)
    expect(board.get(16, 10)).toBe(0x112233)
  })
})
