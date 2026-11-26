// ChessMate AI — offline-first training app. Views: home, play, puzzles, games, analysis, stats.
import { Chess } from './chess.js';
import { Board } from './board.js';
import { engine, winPct, fmtScore } from './engine.js';
import { get, set, uid, profile, saveProfile, games, saveGame, findGame, exportAll, importAll } from './store.js';
import * as G from './game.js';
import * as PZ from './puzzles.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const main = $('#main');
const S = { live: get('live', null), vp: null, ex: [], tok: 0, pending: null, aid: null, temp: null, ap: 0, aex: [], pz: null, pzMode: 'adaptive', pzTheme: null, anaRun: null };
let cleanup = null, viewInst = 0;
window.__cm = S; // handy for debugging in the console
const settings = () => Object.assign({ engineMode: 'auto', depth: 14, gameDepth: 12, autoAnalyse: true }, get('settings', {}));
const lvlLabel = r => r >= 3200 ? 'Full strength' : `${r} · ${PZ.band(r)}${r < 1320 ? ' (estimate)' : ''}`;
const CLS = { best: ['★', 'Best'], good: ['', 'Good'], inacc: ['?!', 'Inaccuracy'], mistake: ['?', 'Mistake'], blunder: ['??', 'Blunder'] };

// ---------- shared pieces ----------
function setEval(el, score, white = true) {
  if (!el) return;
  const wp = score && score.mate === 0 ? (score.side > 0 ? 100 : 0) : winPct(score);
  el.querySelector('.fill').style.height = wp + '%';
  el.classList.toggle('flip', !white);
  el.querySelector('.lab').textContent = score ? (score.mate === 0 ? '#' : fmtScore(score)) : '';
  el.querySelector('.lab').classList.toggle('top', wp < 50 === white);
}
const stageHTML = (extra = '') => `<div class="stage"><div class="ebar"><div class="fill"></div><span class="lab"></span></div><div class="bd"></div>${extra}</div>`;
function movesHTML(fen0, moves, cur, marks = {}) {
  const c = new Chess(fen0); let n = c.moveNumber(), w = c.turn() === 'w', h = '';
  moves.forEach((m, i) => {
    if (w) h += `<span class="mn">${n}.</span>`; else if (i === 0) h += `<span class="mn">${n}…</span>`;
    const k = marks[i];
    h += `<button class="mv ${i + 1 === cur ? 'on' : ''} ${k ? 'c-' + k : ''}" data-p="${i + 1}">${esc(m.san)}${k && CLS[k][0] ? '<b>' + CLS[k][0] + '</b>' : ''}</button>`;
    if (!w) n++; w = !w;
  });
  return h || '<span class="muted">No moves yet</span>';
}
function linesHTML(fen, r) {
  if (!r) return '';
  if (!r.lines.length) return `<p class="muted">${r.source === 'none' ? 'Not in the cloud database. Switch engine to Auto or Device to compute on your phone.' : 'No lines.'}</p>`;
  return r.lines.map(l => `<div class="line"><span class="sc ${(l.mate ?? l.cp) >= 0 ? 'pos' : 'neg'}">${fmtScore(l)}</span><span>${esc(G.numbered(fen, G.lineSan(fen, l.pv, 8)))}</span></div>`).join('') +
    `<p class="src">${r.source === 'cloud' ? 'Lichess cloud' : 'On-device Stockfish 19 lite'} · depth ${r.depth || (r.lines[0] && r.lines[0].depth) || 0}${r.cached ? ' · cached' : ''}</p>`;
}
const uciObj = u => u ? { from: u.slice(0, 2), to: u.slice(2, 4) } : null;
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 2600); }
function netPill() {
  const on = navigator.onLine !== false;
  $('#net').textContent = on ? (engine.cloudOk === false ? 'Online · cloud unreachable' : 'Online') : 'Offline';
  $('#net').className = 'pill ' + (on && engine.cloudOk !== false ? 'ok' : 'off');
}

// ---------- HOME ----------
function viewHome() {
  const pr = profile(), st = settings(), all = games();
  const live = S.live && S.live.result === '*' ? S.live : null;
  const lastA = all.find(g => g.analysis);
  const crit = lastA ? (G.moveReport(lastA).critical || [])[0] : null;
  const due = get('retry', []).filter(x => x.due <= Date.now()).length;
  main.innerHTML = `
  <section class="hero"><div><h1>Train every position.</h1><p class="muted">Puzzles, replays from your own games and unlimited analysis. Works offline; uses the internet for new puzzles and cloud analysis.</p></div>
  <div class="kpi"><b>${pr.rating}</b><span>puzzle rating · ${PZ.band(pr.rating)}${pr.n < 20 ? ' · settling (' + pr.n + '/20)' : ''}</span></div></section>
  <div class="cards">
    ${live ? `<button class="card" data-go="play"><b>Continue game</b><span>vs Stockfish ${esc(lvlLabel(live.level))} · move ${Math.ceil((live.moves.length + 1) / 2)}</span></button>` : ''}
    <button class="card" data-pz="adaptive"><b>Puzzles at your level</b><span>Target ${pr.rating + pr.challenge} (challenge ${pr.challenge >= 0 ? '+' : ''}${pr.challenge})</span></button>
    <button class="card" data-pz="tricky"><b>Tricky puzzles</b><span>Quiet moves, sacrifices, defence, long lines</span></button>
    <button class="card" data-pz="retry"><b>Retry queue</b><span>${due} due today</span></button>
    ${crit ? `<button class="card" id="crit"><b>Replay a critical moment</b><span>${esc(lastA.white)} vs ${esc(lastA.black)}, move ${Math.floor(crit.ply / 2) + 1} — play it again</span></button>` : ''}
    <button class="card" data-go="play"><b>New training game</b><span>Stockfish 500–3200</span></button>
  </div>
  <section class="panel"><h2>Updates</h2>
    <p class="muted">Offline pack: ${PZ.pool().filter(p => !p.src).length} puzzles · downloaded: ${get('pool', []).length}${get('lastUpdate') ? ' · last update ' + new Date(get('lastUpdate')).toLocaleDateString() : ''}</p>
    <div class="row"><button class="btn" id="daily">Daily puzzle</button><button class="btn" id="more">Download 10 puzzles at my level</button></div><p id="upd" class="muted"></p></section>
  <section class="panel"><h2>Download &amp; install</h2>
    <p class="muted small" id="inst-st"></p>
    <div class="row"><button class="btn gold" id="inst">Install app on this phone</button></div>
    <p class="muted small" id="ios" hidden>On iPhone/iPad: open this page in Safari, tap Share, then “Add to Home Screen”.</p>
    <div class="row"><button class="btn" id="off">Download for offline use</button></div><p class="muted small" id="off-st"></p>
    <div class="row"><button class="btn ghost" id="dlpgn">Download my games (PGN)</button><button class="btn ghost" id="dlbk">Download backup file</button></div>
    <label class="filebtn">Restore from backup file<input type="file" id="upbk" accept=".json,application/json"></label></section>
  <section class="panel"><h2>Settings</h2>
    <label>Engine<select id="emode"><option value="auto">Auto — cloud first, phone if needed</option><option value="cloud">Cloud only — lightest on battery</option><option value="device">Device only — fully offline</option></select></label>
    <label>Live analysis depth<select id="depth">${[10, 12, 14, 16, 18, 20, 22].map(d => `<option ${d === st.depth ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
    <label>Full-game analysis depth<select id="gdepth">${[8, 10, 12, 14, 16].map(d => `<option ${d === st.gameDepth ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
    <div class="row"><button class="btn ghost" id="bk">Copy backup</button><button class="btn ghost" id="rs">Restore backup</button></div>
    <textarea id="bkt" hidden placeholder="Paste a backup here, then press Restore again"></textarea></section>`;
  $('#emode').value = st.engineMode;
  const saveSt = () => { set('settings', Object.assign(settings(), { engineMode: $('#emode').value, depth: +$('#depth').value, gameDepth: +$('#gdepth').value })); toast('Saved'); };
  for (const id of ['emode', 'depth', 'gdepth']) $('#' + id).onchange = saveSt;
  main.querySelectorAll('[data-go]').forEach(b => b.onclick = () => location.hash = b.dataset.go);
  main.querySelectorAll('[data-pz]').forEach(b => b.onclick = () => { S.pzMode = b.dataset.pz; S.pz = null; location.hash = 'puzzles'; });
  if (crit) $('#crit').onclick = () => { S.pending = { startFen: G.fenAt(lastA, crit.ply), parentId: lastA.id, fromPly: crit.ply, label: `${lastA.white} vs ${lastA.black}, move ${Math.floor(crit.ply / 2) + 1}` }; S.live = null; location.hash = 'play'; };
  $('#daily').onclick = async () => { $('#upd').textContent = 'Fetching…'; try { const p = await PZ.fetchDaily(); S.pz = null; S.forcePuzzle = p; location.hash = 'puzzles'; } catch (e) { $('#upd').textContent = 'Could not reach Lichess (' + e.message + '). Offline puzzles still work.'; } };
  $('#more').onclick = async () => { try { const n = await PZ.fetchMore(10, null, (i, t) => $('#upd').textContent = `Downloading ${i}/${t}…`); $('#upd').textContent = `${n} new puzzles saved for offline use.`; } catch (e) { $('#upd').textContent = 'Could not reach Lichess (' + e.message + ').'; } };
  setupDownloads();
  $('#bk').onclick = async () => { try { await navigator.clipboard.writeText(exportAll()); toast('Backup copied'); } catch (e) { $('#bkt').hidden = false; $('#bkt').value = exportAll(); } };
  $('#rs').onclick = () => { const t = $('#bkt'); if (t.hidden || !t.value.trim()) { t.hidden = false; t.value = ''; t.focus(); return; } try { importAll(t.value); toast('Backup restored'); viewHome(); } catch (e) { toast('That backup could not be read'); } };
}

// ---------- install, offline download, file downloads ----------
const OFFLINE_FILES = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'css/app.css', 'css/pieces.css',
  'js/app.js', 'js/board.js', 'js/chess.js', 'js/engine.js', 'js/game.js', 'js/puzzles.js', 'js/store.js',
  'engine/stockfish-19-lite-single.js', 'engine/stockfish-19-lite-single.wasm', 'data/puzzles.json'];
const CACHE = 'chessmate-v1'; // must match sw.js
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; const b = $('#inst'); if (b) b.disabled = false; });
window.addEventListener('appinstalled', () => { installEvt = null; toast('Installed — open it from your home screen'); });
const fmtMB = b => (b / 1048576).toFixed(1) + ' MB';
function saveFile(name, text, type) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000); return true;
  } catch (e) { return false; }
}
async function setupDownloads() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const ib = $('#inst'), st = $('#inst-st');
  if (standalone) { ib.hidden = true; st.textContent = 'Installed as an app on this device.'; }
  else if (ios) { ib.hidden = true; $('#ios').hidden = false; }
  else if (!installEvt) { ib.disabled = true; st.textContent = 'If the button stays grey, use your browser menu → “Install app” or “Add to Home screen”.'; }
  ib.onclick = async () => { if (!installEvt) return; installEvt.prompt(); const r = await installEvt.userChoice; installEvt = null; if (r.outcome === 'accepted') st.textContent = 'Installing…'; };
  // offline status
  const offSt = $('#off-st');
  async function status() {
    if (!('caches' in window)) { offSt.textContent = 'This browser cannot store the app offline.'; $('#off').disabled = true; return; }
    try {
      const c = await caches.open(CACHE); let have = 0;
      for (const f of OFFLINE_FILES) if (await c.match(f, { ignoreSearch: true })) have++;
      let extra = '';
      if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); extra = ` · using ${fmtMB(e.usage || 0)} on this device`; }
      offSt.textContent = have === OFFLINE_FILES.length ? `Ready offline — app, engine and ${PZ.pool().length} puzzles saved${extra}.` : `${have}/${OFFLINE_FILES.length} files saved for offline${extra}.`;
      if (have === OFFLINE_FILES.length) $('#off').textContent = 'Update offline copy';
    } catch (e) { offSt.textContent = 'Offline storage is blocked here (try the installed app or GitHub Pages link).'; }
  }
  status();
  $('#off').onclick = async () => {
    const b = $('#off'); b.disabled = true;
    try {
      const c = await caches.open(CACHE); let done = 0;
      for (const f of OFFLINE_FILES) {
        const r = await fetch(f, { cache: 'reload' }); if (!r.ok) throw new Error(f + ' ' + r.status);
        await c.put(f, r); done++; offSt.textContent = `Downloading ${done}/${OFFLINE_FILES.length}…`;
      }
      if (navigator.storage && navigator.storage.persist) await navigator.storage.persist().catch(() => {});
      if (navigator.onLine !== false) { try { offSt.textContent = 'Adding fresh puzzles at your level…'; await PZ.fetchMore(10); } catch (e) {} }
      toast('Saved for offline use');
    } catch (e) { toast('Download failed — check your connection'); }
    b.disabled = false; status();
  };
  const day = new Date().toISOString().slice(0, 10);
  $('#dlpgn').onclick = () => {
    const all = games(); if (!all.length) { toast('No games yet'); return; }
    const txt = all.map(G.pgnOf).join('\n\n');
    if (!saveFile(`chessmate-games-${day}.pgn`, txt, 'application/x-chess-pgn')) navigator.clipboard?.writeText(txt).then(() => toast('Download blocked here — PGN copied instead'));
  };
  $('#dlbk').onclick = () => { if (!saveFile(`chessmate-backup-${day}.json`, exportAll(), 'application/json')) toast('Download blocked here — use Copy backup'); };
  $('#upbk').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { importAll(await f.text()); toast('Backup restored'); viewHome(); } catch (err) { toast('That file is not a ChessMate backup'); }
  };
}

// ---------- PLAY ----------
function viewPlay() {
  if (!S.live || S.pending) return playSetup();
  const g = S.live, me = g.userColor, assisted = g.mode === 'assisted';
  main.innerHTML = `<div class="split">${stageHTML()}<div class="side">
    <div class="who"><b>${esc(g.white)}</b> vs <b>${esc(g.black)}</b><span class="tag">${assisted ? 'Assisted' : 'Unassisted'}</span>${g.parentId ? '<span class="tag">Replay</span>' : ''}</div>
    <p id="st" class="st"></p>
    <div class="nav"><button data-n="first" aria-label="First">⏮</button><button data-n="prev" aria-label="Back">◀</button><button data-n="next" aria-label="Forward">▶</button><button data-n="live" aria-label="Live">⏭</button><button id="flip" aria-label="Flip">⇅</button></div>
    <div class="row" id="acts"></div><div id="lines"></div><div class="moves" id="mv"></div></div></div>`;
  const board = new Board($('.bd'), { onMove: m => onUserMove(m), canMove: c => S.vp !== null || c === me });
  const ebar = $('.ebar'); let lastLines = null;
  const len = () => g.moves.length;
  const shownFen = () => S.ex.length ? S.ex[S.ex.length - 1].fen : G.fenAt(g, S.vp ?? len());
  const reviewing = () => S.vp !== null;
  function draw() {
    const fen = shownFen(), ply = S.vp ?? len();
    const lm = S.ex.length ? S.ex[S.ex.length - 1] : ply ? g.moves[ply - 1] : null;
    const arrows = lastLines && lastLines.fen === fen && lastLines.r.lines[0] ? [{ ...uciObj(lastLines.r.lines[0].pv[0]), c: 'g' }] : [];
    board.set(fen, { last: lm, white: board.white, arrows, interactive: g.result === '*' || reviewing() });
    ebar.hidden = !(reviewing() || g.showEval) || !assisted && g.result === '*';
    if (lastLines && lastLines.fen === fen && lastLines.r.lines[0]) setEval(ebar, lastLines.r.lines[0], board.white);
    $('#mv').innerHTML = movesHTML(g.startFen, g.moves, reviewing() ? S.vp : len());
    const turn = new Chess(fen).turn();
    $('#st').innerHTML = g.result !== '*' ? `<b>${esc(g.result)}</b> — ${esc(g.endText || 'Game over')}${reviewing() ? ' · reviewing' : ''}`
      : reviewing() ? `Reviewing move ${Math.ceil(ply / 2)}${S.ex.length ? ' + ' + S.ex.length + ' explored' : ''}. The live game is safe.`
      : S.thinking ? 'Stockfish is thinking…' : turn === me ? 'Your move' : 'Waiting…';
    const A = [];
    if (g.result === '*') {
      if (reviewing()) A.push('<button class="btn" id="back">Back to live game</button>', '<button class="btn gold" id="cont">Continue from here</button>');
      if (assisted) A.push('<button class="btn ghost" id="chk">Check position</button>', '<button class="btn ghost" id="hint">Hint</button>');
      A.push('<button class="btn ghost danger" id="resign">Resign</button>');
    } else A.push('<button class="btn gold" id="ana">Analyse this game</button>', '<button class="btn" id="again">New game</button>');
    $('#acts').innerHTML = A.join('');
    bind();
  }
  function bind() {
    const on = (id, f) => { const e = $('#' + id); if (e) e.onclick = f; };
    on('back', () => { S.vp = null; S.ex = []; draw(); });
    on('cont', () => branch());
    on('chk', () => check(3));
    on('hint', () => check(1));
    on('resign', () => finish(me === 'w' ? '0-1' : '1-0', 'Resigned'));
    on('ana', () => { S.aid = g.id; S.ap = 0; S.aex = []; location.hash = 'analysis'; });
    on('again', () => { S.live = null; set('live', null); viewPlay(); });
  }
  async function check(mp) {
    if (g.result === '*') { g.assisted = true; g.showEval = true; save(); }
    const fen = shownFen(); $('#lines').innerHTML = '<p class="muted">Analysing…</p>';
    const r = await engine.analyse(fen, { multipv: mp });
    if (shownFen() !== fen) return;
    lastLines = { fen, r };
    $('#lines').innerHTML = mp === 1 ? `<p class="muted">Hint: look at the green arrow.</p>` : linesHTML(fen, r);
    draw();
  }
  function branch() {
    g.branches.push({ fromPly: S.vp, moves: g.moves.slice(S.vp).map(m => m.san) });
    g.moves = g.moves.slice(0, S.vp).concat(S.ex); g.assisted = true;
    S.vp = null; S.ex = []; S.tok++; S.thinking = false; save(); toast('New branch — the old line is kept in the game record'); draw(); engineTurn();
  }
  function onUserMove(m) {
    if (reviewing()) {
      const r = G.applyMove(shownFen(), m); if (!r) return;
      if (!assisted && g.result === '*') return;
      S.ex.push(r); lastLines = null; draw(); if (assisted || g.result !== '*') autoCheck(); return;
    }
    if (g.result !== '*' || new Chess(shownFen()).turn() !== me || S.thinking) return;
    const r = G.applyMove(G.fenAt(g, len()), m); if (!r) return;
    g.moves.push(r); lastLines = null; save(); if (!endCheck()) { draw(); engineTurn(); }
  }
  let acT = 0;
  function autoCheck() { clearTimeout(acT); acT = setTimeout(() => check(3), 300); }
  function endCheck() {
    const s = G.status(G.fenAt(g, len()));
    if (s.over) { finish(s.result, s.text); return true; }
    if (G.threefold(g, len())) { finish('1/2-1/2', 'Threefold repetition'); return true; }
    return false;
  }
  function finish(res, text) { g.result = res; g.endText = text; S.vp = null; S.ex = []; S.tok++; S.thinking = false; save(); draw(); ladder(g); }
  async function engineTurn() {
    if (g.result !== '*') return;
    const fen = G.fenAt(g, len()); if (new Chess(fen).turn() === me) return;
    const tok = ++S.tok; S.thinking = true; draw();
    let mv; try { mv = await engine.play(fen, g.level); } catch (e) { S.thinking = false; $('#st').textContent = 'The on-device engine could not start in this browser.'; return; }
    if (tok !== S.tok || S.live !== g) return;
    S.thinking = false;
    const r = G.applyMove(fen, mv); if (!r) return;
    g.moves.push(r); save(); if (!endCheck()) draw();
  }
  function save() { set('live', g); saveGame(g); }
  main.querySelectorAll('[data-n]').forEach(b => b.onclick = () => {
    if (!assisted && g.result === '*') { toast('Review is off in Unassisted games'); return; }
    const n = b.dataset.n, cur = S.vp ?? len(); S.ex = []; lastLines = null;
    S.vp = n === 'first' ? 0 : n === 'prev' ? Math.max(0, cur - 1) : n === 'next' ? Math.min(len(), cur + 1) : len();
    if (S.vp === len()) S.vp = null; draw(); if (S.vp !== null) autoCheck();
  });
  $('#flip').onclick = () => { board.flip(); draw(); };
  $('#mv').onclick = e => { const p = e.target.closest('.mv'); if (!p) return; if (!assisted && g.result === '*') { toast('Review is off in Unassisted games'); return; } S.vp = +p.dataset.p; S.ex = []; if (S.vp === len()) S.vp = null; lastLines = null; draw(); if (S.vp !== null) autoCheck(); };
  board.white = me === 'w'; board.build(); draw(); engineTurn();
  cleanup = () => { S.tok++; S.thinking = false; };
}
function ladder(g) {
  if (g.mode !== 'unassisted' || g.parentId) return;
  const pr = profile(), win = g.result === (g.userColor === 'w' ? '1-0' : '0-1');
  pr.ladder = (pr.ladder || 0) + (win ? 1 : g.result === '1/2-1/2' ? 0 : -1);
  if (pr.ladder >= 2) { pr.level = Math.min(3200, g.level + 100); pr.ladder = 0; toast('Two wins — next opponent is 100 stronger'); }
  if (pr.ladder <= -2) { pr.level = Math.max(500, g.level - 100); pr.ladder = 0; }
  saveProfile(pr);
}
function playSetup() {
  const pr = profile(), pd = S.pending;
  const side = pd ? new Chess(pd.startFen).turn() : 'w';
  main.innerHTML = `<section class="panel narrow"><h2>${pd ? 'Play from this position' : 'New training game'}</h2>
    ${pd ? `<p class="muted">From ${esc(pd.label)}. The original game stays unchanged.</p><div class="bd mini"></div>` : ''}
    <label>Your colour<div class="seg" id="col"><button data-v="w" class="${side === 'w' ? 'on' : ''}">White</button><button data-v="b" class="${side === 'b' ? 'on' : ''}">Black</button>${pd ? '' : '<button data-v="r">Random</button>'}</div></label>
    <label>Opponent <output id="lv">${esc(lvlLabel(pr.level))}</output><input type="range" id="lvl" min="500" max="3200" step="100" value="${pr.level}"></label>
    <label>Mode<div class="seg" id="mode"><button data-v="assisted" class="on">Assisted — review, check & rewind</button><button data-v="unassisted">Unassisted</button></div></label>
    ${pd ? '' : '<label>Start position (optional FEN)<input id="fen" placeholder="Leave empty for the normal start"></label>'}
    <button class="btn gold wide" id="go">Start</button>${pd ? '<button class="btn ghost wide" id="cancel">Cancel</button>' : ''}<p id="err" class="err"></p></section>`;
  if (pd) new Board($('.mini')).set(pd.startFen, { interactive: false, white: side === 'w' });
  const seg = id => main.querySelectorAll('#' + id + ' button').forEach(b => b.onclick = () => { main.querySelectorAll('#' + id + ' button').forEach(x => x.classList.toggle('on', x === b)); });
  seg('col'); seg('mode');
  $('#lvl').oninput = e => $('#lv').textContent = lvlLabel(+e.target.value);
  if (pd) $('#cancel').onclick = () => { S.pending = null; history.back(); };
  $('#go').onclick = () => {
    let col = $('#col .on').dataset.v; if (col === 'r') col = Math.random() < .5 ? 'w' : 'b';
    let startFen = pd ? pd.startFen : ($('#fen').value.trim() || G.START);
    try { new Chess(startFen); } catch (e) { $('#err').textContent = 'That FEN is not a legal position.'; return; }
    const level = +$('#lvl').value, pr2 = profile(); pr2.level = level; saveProfile(pr2);
    const eng = 'Stockfish ' + (level >= 3200 ? 'full' : level);
    S.live = G.newGame({ userColor: col, level, mode: $('#mode .on').dataset.v, startFen, white: col === 'w' ? 'You' : eng, black: col === 'b' ? 'You' : eng,
      source: pd ? 'replay' : 'played', parentId: pd ? pd.parentId : null, fromPly: pd ? pd.fromPly : null, parentLabel: pd ? pd.label : null });
    S.pending = null; S.vp = null; S.ex = []; set('live', S.live); saveGame(S.live); viewPlay();
  };
}

// ---------- ANALYSIS ----------
function viewAnalysis() {
  const g = S.temp && S.temp.id === S.aid ? S.temp : findGame(S.aid);
  if (!g) { location.hash = 'games'; return; }
  main.innerHTML = `<div class="split">${stageHTML()}<div class="side">
    <div class="who"><b>${esc(g.white)}</b> vs <b>${esc(g.black)}</b> <span class="tag">${esc(g.result)}</span>${g.assisted ? '<span class="tag">Assisted</span>' : ''}</div>
    ${g.parentId ? `<p class="muted small">Replay from ${esc(g.parentLabel || 'a previous game')}</p>` : ''}
    <div id="sum"></div><div class="graph" id="gr"></div>
    <div class="nav"><button data-n="first">⏮</button><button data-n="prev">◀</button><button data-n="next">▶</button><button data-n="last">⏭</button><button id="flip">⇅</button></div>
    <div id="info"></div>
    <div class="eng"><div class="row"><b>Engine</b><button class="btn sm ghost" id="deep">Deeper</button><button class="btn sm ghost" id="inf">Infinite</button></div><div id="lines"><p class="muted">…</p></div></div>
    <div class="row"><button class="btn gold" id="pfh">Play from here</button><button class="btn ghost" id="mk">Save as my puzzle</button><button class="btn ghost" id="pgn">Copy PGN</button></div>
    <div id="crit"></div><div class="moves" id="mv"></div></div></div>`;
  const board = new Board($('.bd'), { onMove: m => { const r = G.applyMove(fen(), m); if (r) { S.aex.push(r); refresh(); } } });
  board.white = g.userColor !== 'b'; board.build();
  const ebar = $('.ebar'), inst = viewInst; let live = null, tok = 0, depthBoost = 0, infinite = false;
  const fen = () => S.aex.length ? S.aex[S.aex.length - 1].fen : G.fenAt(g, S.ap);
  function summary() {
    const rep = G.moveReport(g);
    if (S.anaRun && S.anaRun.id === g.id) { $('#sum').innerHTML = `<p class="muted">Analysing game… <span id="prog">${S.anaRun.p}/${g.moves.length}</span> <button class="btn sm ghost" id="stopa">Stop</button></p>`; $('#stopa').onclick = () => { S.anaRun.cancel = true; }; return null; }
    if (!rep) { $('#sum').innerHTML = g.moves.length ? `<button class="btn" id="run">Analyse whole game</button> <span class="muted small">depth ${settings().gameDepth}, cloud first</span>` : '<p class="muted">Explore: play moves on the board.</p>'; const b = $('#run'); if (b) b.onclick = runAnalysis; return null; }
    const f = v => v == null ? '–' : Math.round(v) + '%';
    const c = col => `${rep.count(col, 'inacc')} ?! · ${rep.count(col, 'mistake')} ? · ${rep.count(col, 'blunder')} ??`;
    $('#sum').innerHTML = `<div class="acc"><div><span>White accuracy</span><b>${f(rep.acc.w)}</b><small>${c('w')}</small></div><div><span>Black accuracy</span><b>${f(rep.acc.b)}</b><small>${c('b')}</small></div></div><p class="muted small">Accuracy is an estimate (depth ${g.analysis.depth}${g.analysis.cloud ? ', ' + g.analysis.cloud + ' positions from cloud' : ''}). <button class="lnk" id="rerun">Re-analyse</button></p>`;
    $('#rerun').onclick = () => { delete g.analysis; persist(); runAnalysis(); };
    return rep;
  }
  function graph(rep) {
    const el = $('#gr'); if (!g.analysis) { el.innerHTML = ''; return; }
    const ev = g.analysis.evals, n = ev.length - 1 || 1, W = 300, H = 60;
    const y = e => H - (e && e.mate === 0 ? (e.side > 0 ? 100 : 0) : winPct(e)) / 100 * H;
    const pts = ev.map((e, i) => `${(i / n * W).toFixed(1)},${y(e).toFixed(1)}`).join(' ');
    const dots = rep.rows.filter(r => r.cls === 'blunder' || r.cls === 'mistake').map(r => `<circle cx="${((r.ply + 1) / n * W).toFixed(1)}" cy="${y(ev[r.ply + 1]).toFixed(1)}" r="2.6" class="d-${r.cls}"/>`).join('');
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polygon points="0,${H} ${pts} ${W},${H}" class="wa"/><line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" class="mid"/><line id="cur" y1="0" y2="${H}" class="cur"/>${dots}</svg>`;
    el.onclick = e => { const b = el.getBoundingClientRect(); S.ap = Math.round((e.clientX - b.left) / b.width * n); S.aex = []; refresh(); };
  }
  function refresh() {
    const rep = summary(); graph(rep || G.moveReport(g));
    const ply = S.ap, f = fen(), mv = S.aex.length ? S.aex[S.aex.length - 1] : ply ? g.moves[ply - 1] : null;
    const row = rep && ply ? rep.rows[ply - 1] : null;
    const arrows = [];
    if (!S.aex.length && row && row.best && row.cls !== 'best' && row.cls !== 'good') { arrows.push({ ...uciObj(g.moves[ply - 1].uci), c: 'r' }); arrows.push({ ...uciObj(row.best), c: 'g' }); }
    board.set(f, { last: mv, arrows, white: board.white });
    const cur = $('#cur'); if (cur && g.analysis) { const x = ply / ((g.analysis.evals.length - 1) || 1) * 300; cur.setAttribute('x1', x); cur.setAttribute('x2', x); }
    if (g.analysis && !S.aex.length) setEval(ebar, g.analysis.evals[ply], board.white);
    // move info, with checked notes only
    let info = '';
    if (S.aex.length) info = `<p class="muted">Exploring ${S.aex.length} move${S.aex.length > 1 ? 's' : ''} from move ${Math.ceil(ply / 2) || 1}. <button class="lnk" id="exback">Back to game line</button></p>`;
    else if (row) {
      const before = G.fenAt(g, ply - 1), bestSan = row.best ? G.lineSan(before, [row.best])[0] : null;
      info = `<p><b class="c-${row.cls}">${esc(mv.san)} — ${CLS[row.cls][1]}</b>${row.cls !== 'best' && bestSan ? ` · best was <b>${esc(bestSan)}</b>` : ''} <span class="muted small">(${Math.round(row.loss)}% win chance lost)</span></p>`;
      const hang = G.hanging(f).map(s => { const p = new Chess(f).get(s); return 'nbrq'.includes(p.type) ? ({ n: 'knight', b: 'bishop', r: 'rook', q: 'queen' }[p.type] + ' on ' + s) : null; }).filter(Boolean);
      if (row.cls !== 'best' && row.cls !== 'good') info += `<button class="btn sm gold" id="retry">Retry from before ${esc(mv.san)}</button>`;
      if (hang.length && (row.cls === 'mistake' || row.cls === 'blunder')) info += `<p class="small"><span class="tag">Rule check</span> After ${esc(mv.san)}, the ${esc(hang.join(', '))} can be won.</p>`;
    } else if (ply === 0) info = '<p class="muted">Start position</p>';
    $('#info').innerHTML = info; const eb = $('#exback'); if (eb) eb.onclick = () => { S.aex = []; refresh(); };
    const rt = $('#retry'); if (rt) rt.onclick = () => { S.pending = { startFen: G.fenAt(g, ply - 1), parentId: g === S.temp ? null : g.id, fromPly: ply - 1, label: `${g.white} vs ${g.black}, before ${Math.floor((ply - 1) / 2) + 1}${(ply - 1) % 2 ? '…' : '.'} ${mv.san}` }; location.hash = 'play'; };
    $('#mv').innerHTML = movesHTML(g.startFen, g.moves, S.aex.length ? -1 : ply, rep ? Object.fromEntries(rep.rows.map(r => [r.ply, r.cls === 'good' ? '' : r.cls])) : {});
    const on = $('#mv .on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    $('#crit').innerHTML = rep && rep.critical.length ? `<p class="small"><b>Critical moments</b> — tap one to see what went wrong, then retry it</p><div class="chips">${rep.critical.map(r => `<button class="chip c-${r.cls}" data-p="${r.ply}">${Math.floor(r.ply / 2) + 1}${r.white ? '.' : '…'} ${esc(g.moves[r.ply].san)}</button>`).join('')}</div>` : '';
    main.querySelectorAll('#crit .chip').forEach(b => b.onclick = () => { S.ap = +b.dataset.p + 1; S.aex = []; refresh(); });
    if (settings().autoAnalyse) liveEval();
  }
  let lT = 0;
  function liveEval() {
    clearTimeout(lT); if (infinite) { engine.stop(); infinite = false; $('#inf').textContent = 'Infinite'; }
    lT = setTimeout(async () => {
      const f = fen(), t = ++tok; $('#lines').innerHTML = '<p class="muted">Analysing…</p>';
      const show = r => { if (t !== tok) return; live = { f, r }; $('#lines').innerHTML = linesHTML(f, r); if (r.lines[0]) { setEval(ebar, r.lines[0], board.white); if (S.aex.length || !g.analysis) board.set(f, { last: board.last, white: board.white, arrows: [{ ...uciObj(r.lines[0].pv[0]), c: 'g' }] }); } };
      try { const r = await engine.analyse(f, { multipv: 3, depth: settings().depth + depthBoost, onInfo: show }); show(r); }
      catch (e) { if (t === tok) $('#lines').innerHTML = '<p class="muted">Engine unavailable in this browser.</p>'; }
    }, 220);
  }
  $('#deep').onclick = () => { depthBoost += 4; liveEval(); };
  $('#inf').onclick = async () => {
    if (infinite) { engine.stop(); infinite = false; $('#inf').textContent = 'Infinite'; return; }
    infinite = true; $('#inf').textContent = 'Stop'; const f = fen(), t = ++tok;
    const show = r => { if (t !== tok) return; $('#lines').innerHTML = linesHTML(f, r) + `<p class="src">${r.lines[0] ? Math.round((r.lines[0].nps || 0) / 1000) + ' kN/s' : ''}</p>`; if (r.lines[0]) setEval(ebar, r.lines[0], board.white); };
    const r = await engine.analyse(f, { multipv: 3, infinite: true, onInfo: show }); show(r);
  };
  async function runAnalysis() {
    const run = S.anaRun = { id: g.id, p: 0, cancel: false };
    summary();
    let res = null;
    try { res = await G.analyseGame(g, (p) => { run.p = p; const e = location.hash === '#analysis' && S.aid === g.id && $('#prog'); if (e) e.textContent = `${p}/${g.moves.length}`; }, () => run.cancel || S.anaRun !== run); }
    catch (e) { toast('Engine unavailable in this browser'); }
    S.anaRun = null;
    if (res) { persist(); addMistakes(g); toast('Analysis done — mistakes added to your puzzles'); }
    if (location.hash === '#analysis' && S.aid === g.id) route();
  }
  function persist() { if (g !== S.temp) { saveGame(g); if (S.live && S.live.id === g.id) { S.live = g; set('live', g); } } }
  main.querySelectorAll('[data-n]').forEach(b => b.onclick = () => {
    const n = b.dataset.n; S.aex = [];
    S.ap = n === 'first' ? 0 : n === 'prev' ? Math.max(0, S.ap - 1) : n === 'next' ? Math.min(g.moves.length, S.ap + 1) : g.moves.length; refresh();
  });
  $('#flip').onclick = () => { board.flip(); refresh(); };
  $('#mv').onclick = e => { const p = e.target.closest('.mv'); if (p) { S.ap = +p.dataset.p; S.aex = []; refresh(); } };
  $('#pfh').onclick = () => { S.pending = { startFen: fen(), parentId: g === S.temp ? null : g.id, fromPly: S.ap, label: `${g.white} vs ${g.black}, move ${Math.floor(S.ap / 2) + 1}` }; location.hash = 'play'; };
  $('#mk').onclick = async () => {
    if (S.aex.length || S.ap === 0) { toast('Pick a move of the game first'); return; }
    const before = G.fenAt(g, S.ap - 1), r = await engine.analyse(before, { multipv: 1 });
    if (!r.bestmove) { toast('No engine result yet'); return; }
    toast(addMistake(g, S.ap - 1, r.bestmove, r.lines[0]) ? 'Saved to My mistakes' : 'Already saved, or too early in the game');
  };
  $('#pgn').onclick = async () => { try { await navigator.clipboard.writeText(G.pgnOf(g)); toast('PGN copied'); } catch (e) { $('#info').innerHTML = `<textarea readonly>${esc(G.pgnOf(g))}</textarea>`; } };
  document.onkeydown = e => { if (e.key === 'ArrowLeft') main.querySelector('[data-n=prev]').click(); if (e.key === 'ArrowRight') main.querySelector('[data-n=next]').click(); };
  refresh();
  cleanup = () => { tok++; if (infinite) engine.stop(); document.onkeydown = null; };
}
// mistakes → personal puzzles. ply = index of the bad move (position before it is fenAt(ply)).
function addMistake(g, ply, best, line) {
  if (ply < 1) return false;
  const list = get('mistakes', []), id = 'mk_' + g.id + '_' + ply;
  if (list.some(p => p.id === id)) return false;
  const pr = profile();
  list.unshift({ id, fen: G.fenAt(g, ply - 1), moves: [g.moves[ply - 1].uci, best], rating: pr.rating, themes: ['personal'],
    bestWp: line ? winPct(line) : null, src: 'game', label: `${g.white} vs ${g.black}, move ${Math.floor(ply / 2) + 1}` });
  set('mistakes', list.slice(0, 400)); return true;
}
function addMistakes(g) {
  const rep = G.moveReport(g); if (!rep) return;
  for (const r of rep.rows) {
    const mine = g.userColor ? (r.white === (g.userColor === 'w')) : true;
    if (mine && (r.cls === 'mistake' || r.cls === 'blunder') && r.best) addMistake(g, r.ply, r.best, g.analysis.evals[r.ply]);
  }
}

// ---------- PUZZLES ----------
function viewPuzzles() {
  const pr = profile(), due = get('retry', []).filter(x => x.due <= Date.now()).length, mk = get('mistakes', []).length;
  const themes = [...new Set(PZ.pool().flatMap(p => p.themes))].sort();
  main.innerHTML = `<div class="pzhead"><div><b class="big">${pr.rating}</b> <span class="muted">${PZ.band(pr.rating)} · challenge ${pr.challenge >= 0 ? '+' : ''}${pr.challenge} · streak ${pr.streak}</span></div>
    <div class="chips" id="modes">${[['adaptive', 'At my level'], ['tricky', 'Tricky'], ['retry', 'Retry ' + due], ['mistakes', 'My mistakes ' + mk]].map(([k, t]) => `<button class="chip ${S.pzMode === k ? 'on' : ''}" data-m="${k}">${t}</button>`).join('')}
    <select id="th"><option value="">All themes</option>${themes.map(t => `<option value="${t}" ${S.pzTheme === t ? 'selected' : ''}>${esc(PZ.tname(t))}</option>`).join('')}</select></div></div>
    <div class="split">${stageHTML()}<div class="side"><p id="st" class="st"></p><div class="row" id="acts"></div><div id="meta"></div><div id="lines"></div></div></div>`;
  main.querySelectorAll('#modes .chip').forEach(b => b.onclick = () => { S.pzMode = b.dataset.m; S.pz = null; viewPuzzles(); });
  $('#th').onchange = e => { S.pzTheme = e.target.value || null; S.pz = null; viewPuzzles(); };
  const board = new Board($('.bd'), { onMove: m => onMove(m) }); const ebar = $('.ebar'); ebar.hidden = true;
  let t = S.pz;
  if (!t) {
    const p = S.forcePuzzle || PZ.pick({ mode: S.pzMode, theme: S.pzTheme }); S.forcePuzzle = null;
    if (!p) { $('#st').innerHTML = S.pzMode === 'retry' ? 'Nothing due — good. Failed puzzles return here after 1, 3, 7 and 21 days.' : S.pzMode === 'mistakes' ? 'No personal puzzles yet. Analyse a game and its mistakes appear here.' : 'No puzzle left for this filter. Go online and download more on Home.'; board.set(G.START, { interactive: false }); return; }
    t = S.pz = { p, step: 1, failed: false, done: false, hint: 0, t0: Date.now(), rated: !['retry', 'mistakes'].includes(S.pzMode) && !p.themes.includes('personal'), recorded: false, fen: p.fen };
  }
  const p = t.p, solverWhite = new Chess(p.fen).turn() === 'b';
  board.white = solverWhite; board.build();
  const solverName = solverWhite ? 'White' : 'Black';
  function draw(msg, cls = '') {
    const last = t.step > 0 ? uciObj(p.moves[t.step - 1]) : null;
    board.set(t.fen, { last: t.lastMv || last, white: solverWhite, interactive: !t.done && !t.busy, arrows: t.arrows || [] });
    $('#st').className = 'st ' + cls;
    $('#st').innerHTML = msg || (t.done ? (t.failed ? 'Solved after a miss.' : 'Solved!') : `Find the best move for <b>${solverName}</b>.`);
    $('#acts').innerHTML = t.done ? '<button class="btn gold" id="next">Next puzzle</button><button class="btn ghost" id="ana">Analyse position</button><button class="btn ghost" id="pfh">Play it out</button>'
      : '<button class="btn ghost" id="hint">Hint</button><button class="btn ghost" id="sol">Show solution</button><button class="btn ghost" id="skip">Skip</button>';
    $('#meta').innerHTML = t.done ? `<p class="small">Puzzle rating ${p.rating}${p.src === 'lichess' ? ' · Lichess' : p.src === 'game' ? ' · ' + esc(p.label) : ' · offline pack (estimated rating)'} · ${p.themes.map(x => `<span class="tag">${esc(PZ.tname(x))}</span>`).join(' ')}</p>${t.delta !== undefined ? `<p class="small">Rating ${t.delta >= 0 ? '+' : ''}${t.delta}</p>` : ''}` : (t.rated ? '<p class="muted small">Rated</p>' : '<p class="muted small">Practice (unrated)</p>');
    const on = (id, f) => { const e = $('#' + id); if (e) e.onclick = f; };
    on('next', () => { S.pz = null; viewPuzzles(); });
    on('skip', () => { if (!t.recorded) rec(false); S.pz = null; viewPuzzles(); });
    on('hint', hint); on('sol', solution);
    on('ana', () => { const tg = G.newGame({ id: 'tmp_' + uid(), startFen: t.startFen, white: 'Puzzle', black: p.id, source: 'puzzle' }); S.temp = tg; S.aid = tg.id; S.ap = 0; S.aex = []; location.hash = 'analysis'; });
    on('pfh', () => { S.pending = { startFen: t.startFen, parentId: null, fromPly: 0, label: 'puzzle ' + p.id }; location.hash = 'play'; });
  }
  function rec(ok) { if (t.recorded) return; t.recorded = true; t.delta = PZ.record(p, ok, Date.now() - t.t0, t.rated && t.hint < 2); if (!t.rated || t.hint >= 2) t.delta = undefined; const pr = profile(), hb = $('.big'); if (hb) hb.textContent = pr.rating; }
  function playOpp(cb) {
    t.busy = true; draw();
    setTimeout(() => { const r = G.applyMove(t.fen, p.moves[t.step]); t.fen = r.fen; t.lastMv = r; t.step++; t.busy = false; t.arrows = []; cb && cb(); draw(); }, 420);
  }
  async function onMove(m) {
    if (t.done || t.busy) return;
    const r = G.applyMove(t.fen, m); if (!r) return;
    const want = p.moves[t.step];
    let ok = r.uci === want || new Chess(r.fen).isCheckmate();
    if (!ok && p.themes.includes('personal') && p.bestWp != null) {
      t.busy = true; draw('Checking your move with the engine…');
      const e = await engine.analyse(r.fen, { multipv: 1, depth: 12 }); t.busy = false;
      const wp = e.lines[0] ? winPct(e.lines[0]) : null;
      if (wp != null) { const mineWp = solverWhite ? wp : 100 - wp, bestMine = solverWhite ? p.bestWp : 100 - p.bestWp; ok = mineWp >= bestMine - 6; }
    }
    if (!ok) {
      t.failed = true; rec(false);
      board.set(r.fen, { last: r, white: solverWhite, interactive: false });
      $('#st').className = 'st bad'; $('#st').textContent = `${r.san} is not it.`;
      setTimeout(() => draw(`${esc(r.san)} is not it — try again (this attempt counts as a miss) or show the solution.`, 'bad'), 700);
      return;
    }
    t.fen = r.fen; t.lastMv = r; t.step++; t.arrows = [];
    if (t.step >= p.moves.length || new Chess(t.fen).isGameOver()) { t.done = true; rec(!t.failed); draw(null, 'good'); return; }
    draw('Correct — keep going.', 'good'); playOpp();
  }
  function hint() {
    t.hint++;
    const mv = p.moves[t.step], c = new Chess(t.fen), piece = c.get(mv.slice(0, 2));
    if (t.hint === 1) { const th = p.themes.filter(x => !['oneMove', 'short', 'long', 'veryLong', 'middlegame', 'endgame', 'opening', 'crushing', 'advantage'].includes(x)); draw(`Hint: ${th.length ? th.map(PZ.tname).join(', ') : 'look for forcing moves — checks, captures, threats'}.`); }
    else if (t.hint === 2) { board.marks = {}; draw(`Hint: move your ${({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' })[piece.type]}. (Hints from here make it unrated.)`); board.set(t.fen, { white: solverWhite, marks: { [mv.slice(0, 2)]: 'h' } }); }
    else { t.arrows = [{ ...uciObj(mv), c: 'g' }]; draw('Hint: play the arrow.'); }
  }
  function solution() {
    t.failed = true; rec(false); t.busy = true;
    const stepAll = () => { if (t.step >= p.moves.length) { t.busy = false; t.done = true; draw('Solution shown. It returns in your retry queue.', 'bad'); return; }
      const r = G.applyMove(t.fen, p.moves[t.step]); t.fen = r.fen; t.lastMv = r; t.step++; draw(); setTimeout(stepAll, 650); };
    stepAll();
  }
  if (t.step === 1 && !t.started) {
    t.started = true; t.fen = p.fen; t.step = 0;
    board.set(p.fen, { white: solverWhite, interactive: false });
    playOpp(() => { t.startFen = t.fen; });
  } else draw();
  cleanup = () => {};
}

// ---------- GAMES ----------
function viewGames() {
  const all = games();
  main.innerHTML = `<section class="panel"><h2>Import games</h2>
    <div class="row"><input id="lu" placeholder="Lichess username"><button class="btn" id="li">Fetch 10</button></div>
    <div class="row"><input id="cu" placeholder="Chess.com username"><button class="btn" id="cc">Fetch this month</button></div>
    <details><summary>Paste PGN</summary><textarea id="pg" placeholder="[Event …]"></textarea><button class="btn" id="imp">Import PGN</button></details><p id="im" class="muted"></p></section>
    <section class="panel"><h2>Your games (${all.length})</h2><div id="gl">${all.length ? '' : '<p class="muted">No games yet. Play one or import from Lichess / Chess.com.</p>'}</div></section>`;
  const list = $('#gl');
  list.innerHTML += all.map(g => {
    const rep = g.analysis ? G.moveReport(g) : null, me = g.userColor, acc = rep && me ? rep.acc[me] : null;
    return `<div class="gitem"><button class="gopen" data-id="${esc(g.id)}"><b>${esc(g.white)} – ${esc(g.black)}</b><span>${esc(g.result)} · ${g.moves.length} plies · ${esc(g.date || '')} · ${esc(g.source)}${g.parentId ? ' (replay)' : ''}${acc != null ? ' · your accuracy ' + Math.round(acc) + '%' : g.analysis ? ' · analysed' : ''}</span></button><button class="del" data-id="${esc(g.id)}" aria-label="Delete">✕</button></div>`;
  }).join('');
  list.onclick = e => {
    const o = e.target.closest('.gopen'), d = e.target.closest('.del');
    if (o) { S.aid = o.dataset.id; S.ap = 0; S.aex = []; S.temp = null; location.hash = 'analysis'; }
    if (d) { if (d.dataset.arm) { set('games', games().filter(g => g.id !== d.dataset.id)); viewGames(); } else { d.dataset.arm = 1; d.textContent = 'Delete?'; } }
  };
  const add = (gs, msg) => { gs.reverse().forEach(saveGame); $('#im').textContent = `${gs.length} game${gs.length === 1 ? '' : 's'} imported${msg || ''}.`; setTimeout(viewGames, 900); };
  $('#imp').onclick = () => { const gs = G.gamesFromPgn($('#pg').value); gs.length ? add(gs) : $('#im').textContent = 'No valid games found in that PGN.'; };
  $('#li').onclick = async () => {
    const u = $('#lu').value.trim(); if (!u) return; $('#im').textContent = 'Fetching from Lichess…';
    try {
      const r = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(u)}?max=10&pgnInJson=true&clocks=false&evals=false`, { headers: { Accept: 'application/x-ndjson' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const txt = (await r.text()).trim().split('\n').filter(Boolean).map(l => JSON.parse(l).pgn).join('\n\n');
      add(G.gamesFromPgn(txt, u), ' from Lichess');
    } catch (e) { $('#im').textContent = 'Could not fetch (' + e.message + '). Check the name and your connection.'; }
  };
  $('#cc').onclick = async () => {
    const u = $('#cu').value.trim().toLowerCase(); if (!u) return; $('#im').textContent = 'Fetching from Chess.com…';
    try {
      const d = new Date(), ym = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      const r = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(u)}/games/${ym}`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json(); const pgns = (j.games || []).slice(-10).map(x => x.pgn).filter(Boolean).join('\n\n');
      add(G.gamesFromPgn(pgns, u), ' from Chess.com');
    } catch (e) { $('#im').textContent = 'Could not fetch (' + e.message + ').'; }
  };
  cleanup = () => {};
}

// ---------- STATS ----------
function viewStats() {
  const pr = profile(), att = get('attempts', []), rated = att.filter(a => a.rated);
  const rate = a => a.length ? Math.round(a.filter(x => x.ok).length / a.length * 100) + '%' : '–';
  const trickyA = rated.filter(a => a.th.some(t => PZ.TRICKY.includes(t))), plainA = rated.filter(a => !a.th.some(t => PZ.TRICKY.includes(t)));
  const th = Object.entries(pr.themes).filter(([k]) => !['oneMove', 'short', 'middlegame', 'opening', 'endgame', 'crushing', 'advantage'].includes(k)).sort((a, b) => b[1].n - a[1].n);
  const weak = th.filter(([, v]) => v.n >= 3).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n).slice(0, 3);
  const played = games().filter(g => g.source !== 'imported' && g.analysis && g.userColor).slice(0, 12).reverse();
  const accs = played.map(g => ({ a: G.moveReport(g).acc[g.userColor], lvl: g.level, res: g.result }));
  const vs = games().filter(g => g.userColor && g.result !== '*' && g.source !== 'imported');
  const wdl = ['w', 'd', 'l'].map(k => vs.filter(g => k === 'd' ? g.result === '1/2-1/2' : (g.result === (g.userColor === 'w' ? '1-0' : '0-1')) === (k === 'w') && g.result !== '1/2-1/2').length);
  const h = pr.hist, W = 300, H = 70;
  let spark = '';
  if (h.length > 1) { const lo = Math.min(...h.map(x => x[1])) - 20, hi = Math.max(...h.map(x => x[1])) + 20; spark = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="spark"><polyline points="${h.map((x, i) => `${(i / (h.length - 1) * W).toFixed(1)},${(H - (x[1] - lo) / (hi - lo) * H).toFixed(1)}`).join(' ')}"/></svg>`; }
  const recent = rated.slice(-20), avgT = recent.length ? Math.round(recent.reduce((s, a) => s + a.ms, 0) / recent.length / 1000) : 0;
  main.innerHTML = `<section class="panel"><h2>Puzzle performance</h2>
    <div class="acc"><div><span>Rating</span><b>${pr.rating}</b><small>${PZ.band(pr.rating)}</small></div><div><span>Challenge level</span><b>${pr.challenge >= 0 ? '+' : ''}${pr.challenge}</b><small>added to your rating when picking puzzles</small></div><div><span>Tricky puzzles</span><b>${rate(trickyA)}</b><small>${trickyA.length} tried · normal ${rate(plainA)}</small></div><div><span>Avg time (last 20)</span><b>${avgT}s</b><small>${rated.length} rated</small></div></div>
    ${spark || '<p class="muted">Solve a few rated puzzles to see your trend.</p>'}
    <p class="muted small">Challenge rises by 40 after every 3 solves in a row and drops by 60 after a miss, so puzzles get harder as you improve.</p></section>
    ${weak.length ? `<section class="panel"><h2>Train next</h2><div class="chips">${weak.map(([k, v]) => `<button class="chip" data-t="${esc(k)}">${esc(PZ.tname(k))} · ${Math.round(v.ok / v.n * 100)}%</button>`).join('')}</div></section>` : ''}
    <section class="panel"><h2>By theme</h2>${th.length ? `<table><thead><tr><th>Theme</th><th class="n">Tried</th><th class="n">Solved</th><th class="n">Rating</th></tr></thead><tbody>${th.map(([k, v]) => `<tr><td>${esc(PZ.tname(k))}${PZ.TRICKY.includes(k) ? ' <span class="tag">tricky</span>' : ''}</td><td class="n">${v.n}</td><td class="n">${Math.round(v.ok / v.n * 100)}%</td><td class="n">${v.r}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No data yet.</p>'}</section>
    <section class="panel"><h2>Games vs Stockfish</h2><p>${wdl[0]} won · ${wdl[1]} drawn · ${wdl[2]} lost · next suggested level <b>${profile().level}</b></p>
    ${accs.length ? `<div class="bars">${accs.map(a => `<div title="${Math.round(a.a)}%"><i style="height:${Math.round(a.a)}%"></i><small>${a.lvl}</small></div>`).join('')}</div><p class="muted small">Your accuracy in analysed games (oldest → newest), opponent level underneath.</p>` : '<p class="muted">Analyse a finished game to track accuracy.</p>'}</section>`;
  main.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { S.pzTheme = b.dataset.t; S.pzMode = 'adaptive'; S.pz = null; location.hash = 'puzzles'; });
  cleanup = () => {};
}

// ---------- router ----------
const VIEWS = { home: viewHome, play: viewPlay, puzzles: viewPuzzles, games: viewGames, analysis: viewAnalysis, stats: viewStats };
function route() {
  if (cleanup) { try { cleanup(); } catch (e) { } cleanup = null; }
  viewInst++;
  const v = (location.hash || '#home').slice(1);
  const f = VIEWS[v] || viewHome;
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + (VIEWS[v] ? v : 'home')));
  try { f(); } catch (e) { main.innerHTML = `<section class="panel"><h2>Something went wrong</h2><p class="muted">${esc(e.message)}</p></section>`; console.error(e); }
  window.scrollTo(0, 0); netPill();
}
window.addEventListener('hashchange', route);
window.addEventListener('online', netPill); window.addEventListener('offline', netPill);
setInterval(netPill, 5000);
if ('serviceWorker' in navigator) { try { navigator.serviceWorker.register('sw.js').catch(() => { }); } catch (e) { } }
PZ.loadPack().then(route);
