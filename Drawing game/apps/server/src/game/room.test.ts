import { describe, expect, it } from 'vitest'
import type { GameSettings } from '@drawguess/shared'
import { guesserPoints } from '@drawguess/shared'
import { GameRoom, type RoomDeps } from './room.js'

const WORDS = ['cat', 'dog', 'fish', 'banana', 'orange', 'guitar', 'pineapple', 'butterfly', 'waterfall', 'lion', 'piano', 'telescope']

const settings: GameSettings = {
  rounds: 2,
  drawDurationSec: 60,
  wordSelectSec: 15,
  resultsSec: 5,
  capacity: 5,
  wordList: 'custom',
  customWords: WORDS,
}

function setup(graceMs = 30_000) {
  let now = 1_000_000
  const deps: RoomDeps = { now: () => now, rng: () => 0, graceMs }
  const created = GameRoom.create({
    id: 'room-1',
    code: 'ABCD2345',
    name: 'Party',
    hostName: 'Ada',
    settings,
    deps,
  })
  if (!created.ok) throw new Error(created.error)
  return {
    room: created.data.room,
    hostId: created.data.playerId,
    hostToken: created.data.reconnectToken,
    add(name: string) {
      now += 1
      return join(created.data.room, name, now)
    },
    setNow(value: number) {
      now = value
    },
    now: () => now,
  }
}

function join(room: GameRoom, name: string, now: number) {
  const result = room.join(name, now)
  if (!result.ok) throw new Error(result.error)
  return result.data
}

describe('game room', () => {
  it('runs a scored round without leaking the secret before results', () => {
    const { room, hostId, now, setNow, add } = setup()
    const bea = add('Bea')
    add('Cy')
    expect(room.start(bea.playerId, now()).ok).toBe(false)
    expect(room.start(hostId, now()).ok).toBe(true)
    const choices = room.toPrivateState(hostId).wordChoices ?? []
    expect(choices).toHaveLength(3)
    expect(room.toPrivateState(bea.playerId).wordChoices).toBeNull()
    const secret = 'pineapple'
    expect(choices.some((choice) => choice.word === secret)).toBe(true)
    expect(JSON.stringify(room.toPublicState(now()))).not.toContain(secret)

    expect(room.selectWord(hostId, room.turnId ?? '', secret, now()).ok).toBe(true)
    const drawing = room.toPublicState(now())
    expect(drawing.phase).toBe('DRAWING')
    expect(JSON.stringify(drawing)).not.toContain(secret)
    expect(room.toPrivateState(bea.playerId).secretWord).toBeNull()
    expect(room.toPrivateState(hostId).secretWord).toBe(secret)
    expect(drawing.hint?.replace(/ /g, '')).not.toBe(secret)

    const close = room.handleText(bea.playerId, 'pineaple', drawing.turnId, now())
    expect(close.ok && close.data.close).toBe(true)
    expect(JSON.stringify(room.toPublicState(now()))).not.toContain(secret)

    setNow(now() + 15_000)
    const correct = room.handleText(bea.playerId, 'Pineapple!', room.turnId ?? '', now())
    expect(correct.ok && correct.data.correct).toBe(true)
    const expected = guesserPoints({ remainingMs: 45_000, durationMs: 60_000, orderIndex: 0 })
    expect(correct.ok && correct.data.points).toBe(expected)
    const repeat = room.handleText(bea.playerId, 'pineapple', room.turnId ?? '', now())
    expect(repeat.ok).toBe(false)
    expect(room.toPublicState(now()).players.find((player) => player.id === bea.playerId)?.score).toBe(expected)
    expect(room.toPublicState(now()).phase).toBe('DRAWING')
    expect(room.handleText(room.toPublicState(now()).players.find((player) => player.name === 'Cy')?.id ?? '', 'pineapple', room.turnId ?? '', now()).ok).toBe(true)
    expect(room.toPublicState(now()).phase).toBe('ROUND_RESULTS')
    expect(room.toPublicState(now()).roundResult?.word).toBe(secret)
    expect(room.toPrivateState(bea.playerId).secretWord).toBeNull()
  })

  it('rejects drawing, scoring, and stale turns from the wrong player', () => {
    const { room, hostId, now, add } = setup()
    const bea = add('Bea')
    room.start(hostId, now())
    const turnId = room.turnId ?? ''
    expect(room.selectWord(hostId, turnId, 'pineapple', now()).ok).toBe(true)
    const denied = room.applyDraw(bea.playerId, stroke(turnId, 'bea'), now())
    expect(denied.ok).toBe(false)
    const drawn = room.applyDraw(hostId, stroke(turnId, 'ada'), now())
    expect(drawn.ok && drawn.data.changed).toBe(true)
    expect(room.toPublicState(now()).scene).toHaveLength(1)
    expect(room.applyDraw(hostId, stroke('deadbeef00', 'ada2'), now()).ok).toBe(false)
    expect(room.undo(bea.playerId, turnId, now()).ok).toBe(false)
    expect(room.undo(hostId, turnId, now()).ok).toBe(true)
    expect(room.toPublicState(now()).scene).toHaveLength(0)
  })

  it('keeps identity for 30 seconds and skips a drawer who does not return', () => {
    const { room, hostId, hostToken, now, setNow, add } = setup()
    const bea = add('Bea')
    const cy = add('Cy')
    room.start(hostId, now())
    room.selectWord(hostId, room.turnId ?? '', 'pineapple', now())
    const turnId = room.turnId ?? ''
    const guess = room.handleText(bea.playerId, 'pineapple', turnId, now())
    expect(guess.ok && guess.data.points).toBeGreaterThan(0)
    room.disconnect(hostId, now())
    setNow(now() + 10_000)
    const resumed = room.reconnect(hostId, hostToken, now())
    expect(resumed.ok).toBe(true)
    expect(room.toPrivateState(hostId).canDraw).toBe(true)
    expect(room.turnId).toBe(turnId)

    room.disconnect(hostId, now())
    setNow(now() + 30_001)
    room.catchUp(now())
    expect(room.turnId).not.toBe(turnId)
    expect(room.toPublicState(now()).phase).not.toBe('DRAWING')
    expect(JSON.stringify(room.toPublicState(now()))).not.toContain('pineapple')
    expect(room.toPublicState(now()).players.find((player) => player.id === bea.playerId)?.score).toBe(0)
    expect(room.reconnect(hostId, 'wrong-token-value-000000', now()).ok).toBe(false)
    expect(room.toPublicState(now()).players.some((player) => player.id === cy.playerId && player.connected)).toBe(true)
  })

  it('ends the round on the server clock exactly once', () => {
    const { room, hostId, now, setNow, add } = setup()
    add('Bea')
    room.start(hostId, now())
    room.selectWord(hostId, room.turnId ?? '', 'pineapple', now())
    setNow(now() + 60_000)
    expect(room.catchUp(now())).toBeGreaterThan(0)
    const score = room.toPublicState(now()).players.find((player) => player.id === hostId)?.score ?? 0
    expect(room.toPublicState(now()).phase).toBe('ROUND_RESULTS')
    setNow(now() + 1_000)
    room.catchUp(now())
    expect(room.toPublicState(now()).players.find((player) => player.id === hostId)?.score).toBe(score)
  })

  it('promotes the earliest remaining player when the host disconnects', () => {
    const { room, hostId, now, add } = setup()
    const bea = add('Bea')
    add('Cy')
    room.disconnect(hostId, now())
    expect(room.toPublicState(now()).hostId).toBe(bea.playerId)
    expect(room.start(hostId, now()).ok).toBe(false)
    expect(room.start(bea.playerId, now()).ok).toBe(true)
  })

  it('ends the game only when the host asks', () => {
    const { room, hostId, now, add } = setup()
    const bea = add('Bea')
    expect(room.endGame(hostId, now()).ok).toBe(false)
    expect(room.start(hostId, now()).ok).toBe(true)
    const secret = room.toPrivateState(hostId).wordChoices?.[0]?.word ?? 'pineapple'
    expect(room.selectWord(hostId, room.turnId ?? '', secret, now()).ok).toBe(true)
    expect(room.toPrivateState(bea.playerId).canEndGame).toBe(false)
    expect(room.endGame(bea.playerId, now()).ok).toBe(false)
    expect(room.toPrivateState(hostId).canEndGame).toBe(true)
    expect(room.endGame(hostId, now()).ok).toBe(true)
    const finished = room.toPublicState(now())
    expect(finished.phase).toBe('GAME_RESULTS')
    expect(JSON.stringify(finished)).not.toContain(secret)
  })

  it('removes a player who leaves and skips the turn when the drawer leaves', () => {
    const { room, hostId, now, add } = setup()
    const bea = add('Bea')
    const cy = add('Cy')
    expect(room.start(hostId, now()).ok).toBe(true)
    expect(room.leave(bea.playerId, now()).ok).toBe(true)
    expect(room.toPublicState(now()).phase).toBe('WORD_SELECTION')
    expect(room.toPublicState(now()).players.map((player) => player.name).sort()).toEqual(['Ada', 'Cy'])
    expect(room.reconnect(bea.playerId, bea.reconnectToken, now()).ok).toBe(false)

    expect(room.leave(hostId, now()).ok).toBe(true)
    const afterDrawer = room.toPublicState(now())
    expect(afterDrawer.players.map((player) => player.id)).toEqual([cy.playerId])
    expect(afterDrawer.phase).toBe('WAITING')
    expect(afterDrawer.hostId).toBe(cy.playerId)
  })

  it('round-trips a snapshot without trusting a stale turn', () => {
    const { room, hostId, now, add } = setup()
    const bea = add('Bea')
    room.start(hostId, now())
    room.selectWord(hostId, room.turnId ?? '', 'pineapple', now())
    const snapshot = room.toSnapshot()
    const restored = GameRoom.fromSnapshot(snapshot, { now: () => now(), rng: () => 0, graceMs: 30_000 })
    restored.markDisconnectedForRecovery(now())
    expect(restored.toPrivateState(bea.playerId).secretWord).toBeNull()
    expect(restored.toPrivateState(hostId).secretWord).toBe('pineapple')
    const oldTurn = snapshot.turn?.id ?? ''
    expect(restored.applyDraw(hostId, stroke(oldTurn, 'later'), now()).ok).toBe(false)
    restored.catchUp(now() + 60_000)
    expect(restored.toPublicState(now()).phase === 'DRAWING').toBe(false)
  })
})

function stroke(turnId: string, opId: string) {
  return {
    turnId,
    opId: opId.padEnd(8, 'x'),
    chunkId: `${opId}chunk`.padEnd(8, 'y'),
    tool: 'pen' as const,
    color: '#112233',
    size: 4,
    points: [{ x: 10, y: 10 }],
    done: true,
  }
}
