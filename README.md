# DrawGuess

A browser drawing-and-guessing game. One player draws, the others guess, and the server owns the word, the clock, and the score. The default local run is a single Node process. Redis and Postgres are optional.

## Quick start

Requires Node 20 or newer. This repo was developed on Node v24.11.0 and npm 11.6.1.

```bash
npm install
npm run dev
```

Open http://localhost:5173. The Vite server proxies `/socket.io` and `/api` to `127.0.0.1:3001`. No Docker and no cloud account are required.

Production, from the same machine:

```bash
npm run build
npm start
```

`npm start` serves the API, Socket.IO, and the built web app on port 3001 (`NODE_ENV=production`).

## Configuration

Copy `.env.example` to `.env` if you want to override defaults. Empty `REDIS_URL` and `DATABASE_URL` mean in-memory mode. `.env` is gitignored. The example file contains placeholders only.

| Variable | Default | Role |
| --- | --- | --- |
| `PORT` | `3001` | HTTP and Socket.IO port |
| `HOST` | `0.0.0.0` | Bind address |
| `CLIENT_ORIGIN` | localhost 5173 and 3001 | Comma-separated CORS origins |
| `LOG_LEVEL` | `info` | Pino level. Pretty logs only when `NODE_ENV=development` |
| `RECONNECT_GRACE_MS` | `30000` | How long a disconnected player keeps their seat (1000–120000) |
| `REDIS_URL` | empty | Optional snapshots, rate counters, Socket.IO adapter |
| `DATABASE_URL` | empty | Optional completed-game history |

Optional infrastructure:

```bash
docker compose up -d
```

That starts Redis 7 on port 6379 and Postgres 16 with user, password, and database `drawguess`. Point the env vars at `redis://127.0.0.1:6379` and `postgres://drawguess:drawguess@127.0.0.1:5432/drawguess`. Those credentials are local placeholders.

SIGINT and SIGTERM emit `server:shutdown` and close HTTP, Socket.IO, Redis, and Postgres.

## Architecture

```mermaid
flowchart LR
  subgraph browser [Browser]
    UI[React + Redux Toolkit]
    Canvas[Canvas 800x500]
  end
  subgraph node [One Node process]
    IO[Socket.IO]
    Rooms[RoomManager]
    Engine[GameRoom]
  end
  Redis[(Redis optional)]
  Postgres[(Postgres optional)]
  UI --> IO
  Canvas --> IO
  IO --> Rooms --> Engine
  Rooms -.-> Redis
  Rooms -.-> Postgres
```

`packages/shared` holds types, Zod settings, scoring, hints, word lists, and the raster. The web app and the server both import it, so a fill on the client matches a fill in replay. `apps/server` is Express plus Socket.IO. `apps/web` is Vite, React, TypeScript, Tailwind, and Redux Toolkit.

The server keeps authoritative rooms in memory. It broadcasts `room:state` to the room and `player:private` only to that player's socket. Public state never includes the secret, the three word choices, or the custom word list.

## State machine

`NEXT_TURN` is not a resting phase. When a turn finishes, the server either opens the next word selection or the final leaderboard.

```mermaid
stateDiagram-v2
  [*] --> WAITING
  WAITING --> WORD_SELECTION: host starts, at least 2 connected
  WORD_SELECTION --> DRAWING: drawer picks one of 3 words, or the clock picks
  DRAWING --> ROUND_RESULTS: timer, or every connected guesser is correct
  WORD_SELECTION --> WORD_SELECTION: drawer hold expires, turn skipped
  DRAWING --> WORD_SELECTION: drawer hold expires, turn skipped
  ROUND_RESULTS --> WORD_SELECTION: another turn remains
  ROUND_RESULTS --> GAME_RESULTS: schedule finished
  GAME_RESULTS --> WAITING: host returns to the lobby
  DRAWING --> GAME_RESULTS: fewer than 2 connected and someone has a score
  DRAWING --> WAITING: fewer than 2 connected and the game has no score
```

Timers store absolute server timestamps. A callback runs only when its token still matches the room and the phase. Clients display a countdown from `serverNow` and the deadline. They cannot end the round.

## Room and player lifecycle

```mermaid
sequenceDiagram
  participant Host
  participant Server
  participant Guest
  Host->>Server: room:create
  Server-->>Host: playerId + reconnect token
  Guest->>Server: room:join with 8-character code
  Host->>Server: room:start
  Server-->>Host: three words, privately
  Server-->>Guest: masked hint only
  Host->>Server: word:select then draw:chunk
  Server-->>Guest: full scene snapshot
  Guest->>Server: chat:send guess
  Note over Server: disconnect starts a 30s reservation
  Guest->>Server: room:reconnect with token
```

Room codes are 8 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no I, O, 0, or 1). Capacity is 2–8. The server assigns player ids. The reconnect token is random; only its SHA-256 hash is stored, and comparison uses `timingSafeEqual`. A client-supplied player id is not enough.

The host is the earliest joined connected player. If the host disconnects, the role moves immediately and does not move back when they return. The same earliest-joined order, repeated for each round, chooses drawers. Someone who joins after the start is added only to future rounds, and they may guess the current drawing turn. Starting a game resets scores.

A disconnect in the lobby, during a turn, or on the results screen keeps the seat for `RECONNECT_GRACE_MS` (30 seconds by default). Refresh usually reconnects inside that window and keeps the score, membership, and permissions. When the window expires, the player is removed. The session lives in `sessionStorage` for that tab. The secret is kept in memory, not in `localStorage`.

If the drawer disconnects during word choice or drawing, the turn is held for the same grace period. The round clock keeps running. If the hold expires first, the server cancels the turn, rolls back guesser points from that turn, does not reveal the word, and advances. If the draw timer fires first, scoring and the reveal happen normally. A stale turn id is rejected. An empty room is deleted. A sweep runs every 15 seconds.

## Scoring and hints

Guesses are normalized: case, punctuation, and extra whitespace do not matter, and `ice cream` matches `icecream`. A player scores at most once per round. A correct guess is broadcast as `X guessed the word!` without the word. A near miss is private to that socket. The rule is Levenshtein on the compacted guess: length at least 3, length difference at most 2, distance at most 1 when the word is 5 characters or shorter, otherwise at most 2.

```
timeRatio   = clamp(remaining / duration, 0, 1)
orderFactor = max(0.55, 1 - orderIndex * 0.08)
guesser     = max(0, round(500 * timeRatio * orderFactor))
drawer      = max(0, round(average(guesser scores) * correct / eligible))
```

Checked examples on a 60 second round: 45 seconds left, first guess, is 375. 30 seconds left, second guess, is 230. A drawer with those two scores and 3 eligible guessers receives 202. The drawer bonus is applied once, when the round ends.

Hints appear at 30%, 55%, and 80% of the draw time. Each hint reveals more letters. The mask never shows the whole word.

Word lists are animals, food, objects, mixed, or a custom list of at least 10 unique words. The custom list is sent only to the host, and only while the room is waiting. The drawer receives exactly three choices, preferring one easy, one medium, and one hard word when the pool allows it.

## Drawing and replay

Tools are pen, eraser, fill, four brush sizes (4, 10, 18, 32), eight colors, undo, and clear. Undo and clear are drawer-only and rate limited. Replay controls are play, pause, and restart, per finished round, after the word is public. See `docs/ENGINEERING_NOTES.md` for ordering, snapshots, and backpressure.

## Socket events

Clients send these and wait for an acknowledgement of `{ ok, error?, code?, state?, me?, session? }`:

| Event | Who |
| --- | --- |
| `room:create` | new host |
| `room:join` | guest with a room code |
| `room:reconnect` | same tab after a drop, with the hashed-token pair |
| `room:start` | host, lobby only |
| `room:settings` | host, lobby only |
| `word:select` | current drawer |
| `chat:send` | anyone; a guess during drawing is scored |
| `draw:chunk` | current drawer |
| `draw:undo` / `draw:clear` | current drawer |
| `room:lobby` | host, from the final results |
| `sync:request` | any member, rate limited |

The server emits `room:state`, `player:private`, `guess:feedback` (close or correct, to that socket only), `session:replaced` when the same player connects elsewhere, and `server:shutdown`.

## Security

Zod validates settings, names, room codes, chat, and draw chunks before they touch the room. Draw colors, tools, sizes, and canvas bounds are checked. Chat is at most 120 characters. Each stroke carries at most 500 points. Socket.IO rejects payloads over 100kb (`maxHttpBufferSize`). Express JSON is limited to 32kb. CORS is the configured origin list. Errors returned to the client have a code and a short message, not a stack.

Rate limits, per player or per IP for create and join:

| Action | Limit |
| --- | --- |
| create | 8 / minute |
| join | 20 / minute |
| chat | 8 / 10s |
| guess | 6 / 10s |
| draw | 30 / second |
| undo | 8 / 10s |
| clear | 4 / 10s |
| word select | 4 / 10s |
| sync | 4 / 2s |

The secret is omitted from public payloads. Logs use pino and do not include the word. Tests cover a hidden secret, drawing out of turn, an ignored score and timer forge, an oversized stroke, and a chat flood.

## Persistence and restarts

| Mode | Live game | After a restart |
| --- | --- | --- |
| Default, no Redis | memory | active rooms are gone |
| `REDIS_URL` set and reachable | memory, plus a snapshot | players are disconnected, grace starts at boot, timers resume from absolute deadlines |
| `DATABASE_URL` set and reachable | unchanged | completed games are readable from Postgres |

Redis here is a restart snapshot, a rate-limit counter, and a Socket.IO adapter. It is not a multi-writer room owner. Running a second server process does not safely split rooms.

## Tests

```bash
npm test
npm run typecheck
```

Shared tests cover scoring, answer normalization, hints, the raster, and scene undo. Server tests cover the room state machine, rate limits, a full socket round, reconnect inside and after the grace window, and rejected oversized or flooded input. Web tests render the landing validation, create form, lobby, toolbar, chat, timer, hint, leaderboard, and replay controls with the socket module mocked. jsdom does not implement canvas `getContext`, so the replay test logs that and still checks the controls.

## Capacity

One measured run of `npm run load-test` on Node v24.11.0, 9 October 2026: 4 rooms, 3 players each, 20 sequential strokes per room, 80 acknowledgements, 0 errors, 75 ms elapsed, 1073.57 acks/s, latency p50/p95/max of 0/0/1 ms after rounding, 88 ms user CPU, 10 ms system CPU, 149.2 MB RSS. Those numbers are localhost round trips, not a maximum user count. Details are in `docs/capacity-results.json` and `docs/ENGINEERING_NOTES.md`.

## Demo and limitations

`docs/DEMO_SCRIPT.md` is a two-minute, three-player walkthrough. No demo video is in this repository.

Known limits, matching the code:

- Without Redis, a restart ends active games.
- With Redis, rooms are still owned by one process.
- Replay time is compressed.
- The recovery chat line says "30 seconds" even if `RECONNECT_GRACE_MS` is changed. The timer uses the configured value.
- The load test does not measure a saturated or multi-host deployment.
