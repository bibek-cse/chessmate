# Put ChessMate AI on GitHub Pages (free)

You get a link like `https://bibek-cse.github.io/chessmate/` that works on any phone and installs as an app.

## Option A — from the browser (no software needed)

1. Unzip `chessmate-ai.zip`. Inside is a folder called `chessmate`.
2. Go to https://github.com/new
   - Repository name: `chessmate`
   - Choose **Public** (GitHub Pages is free for public repos).
   - Leave "Add a README" unticked, then click **Create repository**.
3. On the new repo page, click **uploading an existing file**.
4. Open the `chessmate` folder on your computer, select **everything inside it** (not the folder itself), and drag it into the page. Wait until all files are listed, including the `engine`, `js`, `css`, `data` and `icons` folders.
   - On a phone: the GitHub website can't upload folders well. Use a computer, or use Option B.
5. Click **Commit changes**.
6. Go to **Settings → Pages**:
   - Source: **Deploy from a branch**
   - Branch: **main**, folder **/ (root)**, then click **Save**.
7. Wait 1–2 minutes, then refresh the Pages settings page. It shows your link: `https://<your-username>.github.io/chessmate/`

**Check:** the repo's top level must show `index.html` directly, not `chessmate/index.html`. If you see an extra `chessmate` folder, the site will be at `.../chessmate/chessmate/`. Either use that link, or upload again from inside the folder.

## Option B — with git (computer terminal)

```bash
unzip chessmate-ai.zip
cd chessmate
git init
git add .
git commit -m "ChessMate AI"
git branch -M main
git remote add origin https://github.com/<your-username>/chessmate.git
git push -u origin main
```

Then do step 6 above (Settings → Pages → main / root).

## On your phone

1. Open your Pages link in Chrome (Android) or Safari (iPhone).
2. Home → **Download & install**:
   - Press **Install app on this phone**. On iPhone, use Share → **Add to Home Screen**.
   - Press **Download for offline use**. The app, engine and puzzles are then saved on the phone, about 2 MB.
3. Optional, once online: press **Download 10 puzzles at my level** and **Daily puzzle**. In Games, you can also import your Lichess or Chess.com games by username.

## Updating the app later

1. Edit or replace files in the repo (Add file → Upload files, or `git push`).
2. Open `sw.js` and change the version line, for example `const V = 'chessmate-v1';` → `'chessmate-v2'`.
   Make the same change in `js/app.js` at `const CACHE = 'chessmate-v1';`.
   This makes every installed phone fetch the new version.
3. On the phone, open the app online once and close it fully. Reopen it, or press **Update offline copy**.

## If something doesn't work

| Problem | Fix |
|---|---|
| Page is 404 | Wait 2 minutes. Check that Pages is set to `main` / root and that `index.html` is at the top of the repo. |
| Blank page or "Loading…" forever | Open it through the `https://…github.io` link, not by double-clicking `index.html` (browsers block the engine on `file://`). |
| "Engine unavailable" | Check that `engine/stockfish-19-lite-single.wasm` was uploaded (1.8 MB). |
| Online buttons fail | Lichess or Chess.com may be rate-limiting. Wait a minute; everything offline keeps working. |
| Install button stays grey | Use the browser menu → **Install app** / **Add to Home screen**. |

## Licences (keep these files)

- `engine/STOCKFISH-LICENSE-GPL3.txt`: Stockfish is GPLv3. Since your repo is public, the source is already available. Also keep the link to https://github.com/official-stockfish/Stockfish in the README.
- The piece images (cburnett, CC BY-SA 3.0) and chess.js (BSD-2) are credited in the app footer and the README.
