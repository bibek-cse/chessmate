# ChessMate AI — offline-first chess training

Link: https://bibek-cse.github.io/chessmate/

A light, free web app for players rated about 500–3200. It has no build step and no framework.
The whole download is about 2 MB, and the engine (1.8 MB) is downloaded once and then cached.

## What it does

- **Hybrid engine.** Analysis asks the free Lichess cloud database first, so your phone does almost no work. If the position isn't in the cloud, or you're offline, it uses Stockfish 19 lite on your device. Results are cached on the phone.
  You can choose the engine mode in Settings:
  - **Auto:** tries the cloud first, then the phone.
  - **Cloud only:** uses the least battery.
  - **Device only:** works fully offline.
- **Play vs Stockfish (500–3200).**
  - In **Assisted** mode you can pause, step back through your moves, check the position (eval bar, top 3 lines and the best-move arrow), try out moves and go back to the live game. You can also choose **Continue from here** to rewind. The old line is kept in the game record.
  - **Unassisted** mode hides all help until the game ends.
  - Winning twice in a row in Unassisted mode raises your suggested level by 100.
- **Play from any point of a past game.** Open any game (played, imported or replayed), tap any move or a critical moment, and press **Play from here**. You then play that position to the end against Stockfish, and the original game is never changed. Afterwards, press **Analyse this game**.
- **Unlimited analysis.**
  - **Full-game analysis** gives an evaluation graph, accuracy (an estimate), ★ / ?! / ? / ?? marks and critical moments.
  - **Live lines** show the top 3 moves, with **Deeper** and **Infinite** options.
  - **Explore mode** lets you play your own moves on the board while the engine evaluates them.
  - A rule check points out pieces left hanging after a bad move.
- **Puzzles.**
  - **Modes:** adaptive (your rating plus a challenge level), Tricky (quiet moves, sacrifices, defence, long lines…), filter by theme, a retry queue (missed puzzles come back after 1, 3, 7 and 21 days) and My mistakes (mistakes from your analysed games, turned into your own puzzles).
  - **Progressive hints:** first the theme, then which piece to move, then the arrow.
- **Online updates.** Get the daily puzzle and download more puzzles at your level from Lichess. You can also import your last games from Lichess or Chess.com by username, or paste a PGN.
- **Progress page.** Shows your rating trend, success on tricky vs normal puzzles, rating per theme, a "Train next" list of weak themes, game accuracy over time and your win/draw/loss record.
- **Offline.** A service worker caches the app, the engine and the puzzle pack. Downloaded puzzles and games are kept on the device.
- **Download & install (Home → Download & install).**
  - **Install app on this phone:** uses your browser's install prompt on Android/Chrome. On iPhone, the app shows the Safari "Add to Home Screen" steps instead.
  - **Download for offline use:** saves the app, the engine and the puzzles on the phone, asks the browser to keep that storage, adds 10 fresh puzzles if you're online, and shows how much space is used.
  - **Download my games (PGN)** and **Download backup file** save files to your phone. **Restore from backup file** loads a backup back in. Copy/Restore backup through the clipboard still works too.
  - Your data stays on your device.

## Run locally

Any static file server works. Opening the page as a `file://` URL won't work, because the browser blocks workers and the service worker there.

```bash
cd chessmate
python3 -m http.server 8080
# open http://localhost:8080
```

## Host free on GitHub Pages

1. Create a repository, for example `chessmate`, and upload every file in this folder (keep the folder layout).
2. Go to Settings → Pages → Deploy from branch → `main` / root.
3. Open `https://<user>.github.io/chessmate/` on your phone, then use "Add to Home screen" to install it.

## Files

| Path | What it is |
|---|---|
| `index.html`, `css/` | App shell, dark analytical theme, cburnett pieces |
| `js/app.js` | Views: home, play, puzzles, games, analysis, progress |
| `js/engine.js` | Hybrid engine: Lichess cloud eval → on-device Stockfish worker, cache, strength levels |
| `js/game.js` | Game records, PGN, full-game analysis, classification, critical moments |
| `js/puzzles.js` | Puzzle pool, adaptive picking, ratings, retry queue, Lichess downloads |
| `js/board.js` | Board with tap or drag-and-release moves, arrows, promotion |
| `js/chess.js` | chess.js 1.4 (rules) |
| `engine/` | Stockfish 19 lite, single-threaded WASM (nmrugg/stockfish.js) |
| `data/puzzles.json` | Offline starter pack (auto-generated, see below) |
| `sw.js`, `manifest.webmanifest` | Offline cache and install |

## Honest limits

- **Engine strength.** The lite engine is weaker than full Stockfish, but it is far lighter on phones. Stockfish's own rating limit starts at 1320. Below that, levels use a shallow search plus deliberate mistakes, so those levels are estimates.
- **Cloud evaluation.** It only covers positions that someone has already analysed on Lichess (mostly openings and popular lines). Other positions fall back to the device. Lichess asks for one request at a time and returns HTTP 429 when you go too fast. The app respects both and backs off.
- **Offline starter pack.** These puzzles were generated by Stockfish self-play, and every puzzle was checked to have a single best move at each step. Their ratings are estimates. Most are short, so download Lichess puzzles while online for harder, rated ones.
- **Ratings.** Puzzle rating uses an Elo-style update, with large steps for your first 20 puzzles (instead of a separate placement test) and a range of 500–3200.
- **Chess.com import.** Only the current month's games are imported.

## Licences

- Stockfish: GPLv3 (`engine/STOCKFISH-LICENSE-GPL3.txt`). If you distribute this app, keep the Stockfish source available, for example by linking https://github.com/official-stockfish/Stockfish.
- chess.js: BSD-2-Clause.
- Piece set: cburnett, CC BY-SA 3.0.
- Puzzles downloaded from Lichess come from its open database (public domain, CC0).
