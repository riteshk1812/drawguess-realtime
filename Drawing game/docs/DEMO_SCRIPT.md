# Two-minute demo

Three browsers, one local server. No recording is included with this repo.

1. In a terminal at the repo root, run `npm install` once, then `npm run dev`. Leave that process running. It serves the API and Socket.IO on port 3001 and the web app on port 5173.
2. Browser A: open http://localhost:5173. Type `Ada` and choose **Create room**. Leave the defaults (3 rounds, 80 second draws, mixed words) and submit **Create room**. The lobby shows an 8-character code and **Waiting for at least 2 players**.
3. Browser B: open http://localhost:5173, type `Bea`, enter Ada's code, and choose **Join room**. Browser C does the same as `Cy`.
4. Browser A: the start button is now **Start game**. Click it. Only Ada sees three word buttons. Bea and Cy see the masked hint and must not see those words.
5. Ada clicks one word. The canvas tools enable for Ada only. Draw a short stroke. Within a moment the same stroke appears on Bea and Cy's boards.
6. Bea types a one-letter-off guess. Only Bea's client shows the private "close" hint. The chat does not reveal the word. Bea then types the word. Chat says `Bea guessed the word!` and Bea's row shows points. Cy can still guess.
7. Cy guesses the word. The round ends, the word is revealed, and Ada receives drawer points. After the results timer, the next drawer is Bea.
8. Refresh Bea's tab during a later turn. The same name, score, and room come back if the refresh finishes inside 30 seconds. If Bea was drawing, the turn continues. The host, if Ada disconnects, moves to the earliest joined player who is still connected and does not move back when Ada returns.

Stop the demo with Ctrl+C in the dev terminal. Without Redis, that restart ends the live room.
