# Put ChessMate on GitHub Pages (free)

You get a link like `https://bibek-cse.github.io/chessmate/` that works on any phone and installs as an app.

## Option A — from the browser (no software needed)

1. Unzip `chessmate.zip`. Inside is a folder called `chessmate`.
2. Go to https://github.com/new
   - Repository name: `chessmate`
   - Choose **Public** (GitHub Pages is free for public repos).
   - Leave "Add a README" unticked, then click **Create repository**.
3. On the new repo page, click **uploading an existing file**.
4. Open the `chessmate` folder on your computer, select **everything inside it** (not the folder itself), and drag it into the page. Wait until all files are listed, including the `engine`, `js`, `css`, `icons` and `docs` folders.
   - On a phone: the GitHub website can't upload folders well. Use a computer, or use Option B.
5. Click **Commit changes**.
6. Go to **Settings → Pages**:
   - Source: **Deploy from a branch**
   - Branch: **main**, folder **/ (root)**, then click **Save**.
7. Wait 1–2 minutes, then refresh the Pages settings page. It shows your link: `https://<your-username>.github.io/chessmate/`

**Check:** the repo's top level must show `index.html` directly, not `chessmate/index.html`. If you see an extra `chessmate` folder, the site will be at `.../chessmate/chessmate/`. Either use that link, or upload again from inside the folder.

## Already uploaded an older version to this repo?

The simplest fix is to replace everything:
1. In the repo, delete every old file and folder, or delete the repo and create it again with the same name.
2. Upload all files from the new `chessmate` folder.

Phones that installed the old app pick up the new one the next time it is opened online.

## Option B — with git (computer terminal)

```bash
unzip chessmate.zip
cd chessmate
git init
git add .
git commit -m "ChessMate"
git branch -M main
git remote add origin https://github.com/<your-username>/chessmate.git
git push -u origin main
```

Then do step 6 above (Settings → Pages → main / root).

## On your phone

1. Open your Pages link in Chrome (Android) or Safari (iPhone) while online. Pick your starting stage. The app then downloads about 12 puzzles at your level in the background.
2. Tap ⚙ → **Install app on this phone**. On iPhone, use Share → **Add to Home Screen**.
3. Optional: tap ⚙ → **Save app + 30 puzzles for offline** before going offline. Lessons and classic games always work offline.

## Updating the app later

1. Edit or replace files in the repo (Add file → Upload files, or `git push`).
2. Open `sw.js` and change the version line, for example `const V = 'chessmate-v3';` → `'chessmate-v4'`.
   Make the same change in `js/app.js` at `const CACHE = 'chessmate-v3';`.
   This makes every installed phone fetch the new version.
3. On the phone, open the app online once, then close it fully and reopen it.

## If something doesn't work

| Problem | Fix |
|---|---|
| Page is 404 | Wait 2 minutes. Check that Pages is set to `main` / root and that `index.html` is at the top of the repo. |
| Blank page or "Loading…" forever | Open it through the `https://…github.io` link, not by double-clicking `index.html` (browsers block the engine on `file://`). |
| "Engine unavailable" | Check that `engine/stockfish-19-lite-single.wasm` was uploaded (1.8 MB). |
| "Fetching hard puzzles…" never finishes | You are offline, or Lichess is rate-limiting. Wait a minute; puzzles already saved still work. |
| Install button stays grey | Use the browser menu → **Install app** / **Add to Home screen**. |

## Licences (keep these files)

- `engine/STOCKFISH-LICENSE-GPL3.txt`: Stockfish is GPLv3. Since your repo is public, the source is already available. Also keep the link to https://github.com/official-stockfish/Stockfish in the README.
- The piece images (cburnett, CC BY-SA 3.0), chess.js (BSD-2) and the Lichess puzzles (CC0) are credited in the app footer and the README.
