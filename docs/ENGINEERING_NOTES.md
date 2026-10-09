# Engineering notes

## Canvas sync

The logical canvas is 800×500. A stroke is a list of points, not a bitmap delta. The drawer draws locally first, then sends `draw:chunk` with the full point list for that stroke (at most 500 points). The client keeps at most two acknowledgements in flight. If a third chunk is ready, it replaces the pending one, so the server always receives the latest full list rather than a queue of stale prefixes.

The server accepts a chunk only from the current drawer, only for the current turn id, and only if the chunk id has not been seen. It grows a stroke; a shorter point list for the same stroke is ignored. Undo removes the latest complete stroke, fill, or clear. Clear itself is one undoable scene item.

Live viewers do not apply individual deltas. After each accepted change the server broadcasts the whole scene plus `lastSeq`. The client keeps an optimistic stroke only when the server scene has the same shape and a longer local point list (`mergeLonger`). A length change, such as undo or clear, replaces the local scene. A missed sequence is repaired by `sync:request`, which returns the same full snapshot. Late joiners receive that snapshot and the public room state. They never receive the secret.

Replay stores ordered deltas (new points, fills, undos, clears) on the turn. Playback folds those events with the same scene functions the live game uses. Playback delays are compressed to between 16ms and 90ms, so a one-minute drawing does not take a minute to watch.

Fill is a deterministic scanline flood fill on a shared raster: exact color match, no anti-aliasing. Pen and eraser stamp circles. Both clients and the server use the shared raster code, so a replay and a live canvas agree.

## Latency and ordering

Socket.IO preserves per-connection order. Stroke chunks from one drawer are applied in arrival order, and chunk ids suppress duplicates. The server is the order authority: `lastSeq` increases only when the scene changes. Timers compare an absolute server timestamp with the current clock, and the callback must still match the room's timer token. A late callback from a previous turn does nothing.

Guess order is the order the server accepts correct guesses. The client cannot set a score or end a timer. Unknown events such as `score:set` and `timer:end` have no handler.

## Restarts

Live rooms live in the Node process. With `REDIS_URL` empty, a restart drops every active game. That is the default local mode.

With Redis, the process writes a JSON snapshot per room (4 hour TTL) after each state change. On boot it loads those snapshots, marks every player disconnected, starts the reconnect grace from the boot clock, and arms timers from the stored absolute deadlines. If the process was down longer than the remaining draw time, `catchUp` completes that round during recovery. The Socket.IO Redis adapter is attached when Redis connects, so pub/sub can fan out. It does not make rooms multi-writer. One process still owns the authoritative room objects. Do not run two game processes against the same Redis and expect split room ownership to be correct.

Postgres, when `DATABASE_URL` is set and reachable, stores completed games. It is not used for the live turn. If Postgres is down, completed games stay in an in-memory list of the last 50. `GET /api/history` reads whichever store is active.

## Capacity

`npm run load-test` on this machine (Node v24.11.0) created 4 rooms of 3 players and sent 80 sequential stroke acknowledgements.

| | |
| --- | --- |
| Errors | 0 |
| Elapsed | 75 ms |
| Throughput | 1073.57 acks/s |
| Latency p50 / p95 / max | 0 / 0 / 1 ms (rounded) |
| CPU | 88 ms user, 10 ms system |
| RSS after the run | 149.2 MB |

Sub-millisecond figures are localhost round trips inside one process, rounded to whole milliseconds. The script never tries to saturate the event loop, the network, or a second machine. The raw record is `docs/capacity-results.json`.
