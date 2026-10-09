import { mergeLonger, type PublicRoomState } from '@drawguess/shared'

export function mergeRoom(local: PublicRoomState | null, incoming: PublicRoomState): PublicRoomState {
  if (!local || local.id !== incoming.id || local.turnId !== incoming.turnId || local.phase !== incoming.phase) return incoming
  if (incoming.lastSeq > local.lastSeq) {
    if (local.scene.length === incoming.scene.length) {
      return { ...incoming, scene: mergeLonger(incoming.scene, local.scene) }
    }
    return incoming
  }
  if (local.scene.length !== incoming.scene.length) {
    return { ...incoming, scene: local.scene, lastSeq: local.lastSeq }
  }
  return { ...incoming, scene: mergeLonger(local.scene, incoming.scene), lastSeq: Math.max(local.lastSeq, incoming.lastSeq) }
}
