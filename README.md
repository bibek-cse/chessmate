# ChessMate Puzzles 👑

A simple puzzle trainer for strong players. It's free, light, works offline, and is ready for GitHub Pages.

- **Hard online puzzles:** puzzles come from the Lichess open puzzle database. There are three levels: **Hard (1700+)**, **Very hard (1950+)** and **Brutal (2200+)**, plus theme filters (sacrifice, quiet move, defence, in-between move, zugzwang, mate in 3–5+, long lines, endgame…).
- **Always a step above you:** each puzzle is picked a little above your current rating, so it gets harder as you improve.
- **Offline:** 15 puzzles are kept ready on the phone at all times, and the list refills itself whenever you're online. Settings → "Download 30 more" stocks up before a trip.
- **Play it out:** after any puzzle, play the position to the end against **full-strength Stockfish** (1, 2 or 4 seconds per move), with no hints and no take-backs.
- **Missed list:** every puzzle you fail is saved, so you can retry it until you solve it.
- **Hints:** first the theme, then the piece to move (from this hint on, the puzzle is unrated), then the arrow.
- **Install as an app:** Settings → Install app (on iPhone: Safari → Share → Add to Home Screen).

## Run locally
```bash
python3 -m http.server 8080   # inside this folder, then open http://localhost:8080
```
Opening `index.html` by double-clicking won't work, because the browser blocks the engine on `file://`.

## Files
| Path | What it is |
|---|---|
| `index.html`, `css/` | Page, dark theme, cburnett pieces |
| `js/app.js` | Puzzles, online fetch + offline cache, rating, play-it-out |
| `js/board.js` | Touch board (tap or drag), arrows, promotion |
| `js/chess.js` | chess.js 1.4 rules |
| `js/store.js` | Local storage |
| `engine/` | Stockfish 19 lite WASM (only used for "Play it out") |
| `icons/crown.svg` | Crown logo / app icon |
| `sw.js`, `manifest.webmanifest` | Offline + install |

## Notes
- Without a Lichess login, Lichess sets puzzle difficulty relative to an average player. The app throws away puzzles below your level's minimum, so the Brutal level can take a few extra downloads to fill up.
- Lichess allows one request at a time. When it says "too many requests", the app waits a minute and tries again.
- The engine is the "lite" build of Stockfish, chosen so it runs smoothly on phones. At full strength it is still far above human level.

## Licences
Puzzles: Lichess database (CC0) · Stockfish: GPLv3 (`engine/STOCKFISH-LICENSE-GPL3.txt`, source at https://github.com/official-stockfish/Stockfish) · chess.js: BSD-2 · Pieces: cburnett, CC BY-SA 3.0.
