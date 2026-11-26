// Crown Chess — hard online puzzles (Lichess), cached for offline, and "play it out" vs full-strength Stockfish.
import { Chess } from './chess.js';
import { Board } from './board.js';
import { get, set } from './store.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LEVELS = {
  hard:   { label: 'Hard',      diff: 'harder',  min: 1700 },
  vhard:  { label: 'Very hard', diff: 'hardest', min: 1950 },
  brutal: { label: 'Brutal',    diff: 'hardest', min: 2200 },
};
const THEMES = [['', 'All themes'], ['sacrifice', 'Sacrifice'], ['quietMove', 'Quiet move'], ['defensiveMove', 'Defence'],
  ['intermezzo', 'In-between move'], ['deflection', 'Deflection'], ['attraction', 'Attraction'], ['clearance', 'Clearance'],
  ['zugzwang', 'Zugzwang'], ['xRayAttack', 'X-ray'], ['discoveredAttack', 'Discovered attack'], ['exposedKing', 'Exposed king'],
  ['mateIn2', 'Mate in 2'], ['mateIn3', 'Mate in 3'], ['mateIn4', 'Mate in 4'], ['mateIn5', 'Mate in 5+'], ['long', 'Long (3 moves)'], ['veryLong', 'Very long (4+)'],
  ['endgame', 'Endgame'], ['crushing', 'Crushing']];
const EXTRA = { mateIn1: 'Mate in 1', mateIn2: 'Mate in 2', mate: 'Checkmate', short: 'Short (2 moves)', oneMove: 'One move', middlegame: 'Middlegame', opening: 'Opening', advantage: 'Advantage', master: 'Master game', masterVsMaster: 'Master vs master', superGM: 'Super-GM game', backRankMate: 'Back-rank mate', smotheredMate: 'Smothered mate', hangingPiece: 'Hanging piece', trappedPiece: 'Trapped piece', capturingDefender: 'Capture the defender', doubleCheck: 'Double check', promotion: 'Promotion', underPromotion: 'Under-promotion', fork: 'Fork', pin: 'Pin', skewer: 'Skewer', kingsideAttack: 'Kingside attack', queensideAttack: 'Queenside attack' };
const tname = t => EXTRA[t] || (THEMES.find(x => x[0] === t) || [0, t.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())])[1];
const PIECE = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const QUEUE_TARGET = 15;

const prof = () => Object.assign({ rating: 1800, n: 0, streak: 0, best: 0, ok: 0 }, get('prof', {}));
const opts = () => Object.assign({ level: 'vhard', theme: '', think: 2000, mode: 'new' }, get('opts', {}));
const uciObj = u => ({ from: u.slice(0, 2), to: u.slice(2, 4) });
function toast(t) { const e = $('#toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => e.hidden = true, 2600); }

// ---------- online puzzles (Lichess open API), cached on the phone ----------
let blockedUntil = 0, filling = false;
function fromLichess(j) {
  const c = new Chess(); c.loadPgn(j.game.pgn);
  const hist = c.history({ verbose: true }), sol = j.puzzle.solution;
  for (const k of [hist.length, j.puzzle.initialPly + 1, j.puzzle.initialPly]) {
    if (k < 1 || k > hist.length) continue;
    const r = new Chess(); for (let i = 0; i < k - 1; i++) r.move(hist[i].lan);
    const fen = r.fen(); r.move(hist[k - 1].lan);
    try { r.move(sol[0]); } catch (e) { continue; }
    return { id: j.puzzle.id, fen, moves: [hist[k - 1].lan, ...sol], rating: j.puzzle.rating, themes: j.puzzle.themes, plays: j.puzzle.plays };
  }
  return null;
}
async function fetchOne(o) {
  const q = new URLSearchParams({ difficulty: LEVELS[o.level].diff }); if (o.theme) q.set('angle', o.theme);
  const r = await fetch('https://lichess.org/api/puzzle/next?' + q);
  if (r.status === 429) { blockedUntil = Date.now() + 61000; throw new Error('busy'); }
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return fromLichess(await r.json());
}
const matches = (p, o) => p.rating >= LEVELS[o.level].min && (!o.theme || p.themes.includes(o.theme));
const queue = () => get('queue', []);
const seen = () => get('seen', {});
function ready(o = opts()) { const s = seen(); return queue().filter(p => matches(p, o) && !s[p.id]); }
async function fill(onStep) {
  if (filling || navigator.onLine === false || Date.now() < blockedUntil) return;
  filling = true; let tries = 0;
  try {
    while (ready().length < QUEUE_TARGET && tries < 40) {
      tries++; const o = opts();
      const p = await fetchOne(o);
      if (p && !queue().some(x => x.id === p.id) && !seen()[p.id]) {
        // keep everything (other filters may want it), but only harder ones count for this level
        set('queue', queue().concat(p).slice(-300));
      }
      onStep && onStep();
    }
  } catch (e) { /* offline or rate-limited: try again later */ }
  filling = false; onStep && onStep();
}

// ---------- engine (full-strength Stockfish 19 lite, on the phone, only for "play it out") ----------
const engine = {
  w: null, boot: null, cb: null,
  start() {
    if (this.boot) return this.boot;
    this.boot = new Promise((ok, bad) => {
      try { this.w = new Worker('engine/stockfish-19-lite-single.js'); } catch (e) { bad(e); return; }
      this.w.onerror = bad;
      this.w.onmessage = e => { const l = String(e.data); this.cb && this.cb(l); };
      this.cb = l => { if (l === 'uciok') { this.w.postMessage('setoption name Hash value 32'); this.w.postMessage('isready'); } else if (l === 'readyok') { this.cb = null; ok(); } };
      this.w.postMessage('uci');
    });
    return this.boot;
  },
  async move(fen, ms) {
    await this.start();
    return new Promise(res => {
      this.cb = l => { if (l.startsWith('bestmove')) { this.cb = null; res(l.split(' ')[1]); } };
      this.w.postMessage('ucinewgame'); this.w.postMessage('position fen ' + fen); this.w.postMessage('go movetime ' + ms);
    });
  },
};

// ---------- rating & stats ----------
function record(p, ok, rated) {
  const s = seen(); s[p.id] = Date.now(); set('seen', s);
  if (!ok) { const m = get('missed', []).filter(x => x.id !== p.id); m.unshift(p); set('missed', m.slice(0, 200)); }
  else set('missed', get('missed', []).filter(x => x.id !== p.id));
  if (!rated) return null;
  const pr = prof(), K = pr.n < 20 ? 40 : 20, exp = 1 / (1 + Math.pow(10, (p.rating - pr.rating) / 400));
  const d = Math.round(K * ((ok ? 1 : 0) - exp));
  pr.rating = Math.max(500, Math.min(3200, pr.rating + d)); pr.n++; pr.ok += ok ? 1 : 0;
  pr.streak = ok ? pr.streak + 1 : 0; pr.best = Math.max(pr.best, pr.streak);
  set('prof', pr); return d;
}

// ---------- UI ----------
const board = new Board($('#board'), { onMove: m => onMove(m), canMove: c => mode === 'game' ? c === me : true });
let t = null, mode = 'puzzle', me = 'w', game = null, tok = 0;

function header() {
  const pr = prof(), o = opts(), n = ready(o).length;
  $('#rating').textContent = pr.rating;
  $('#streak').textContent = pr.streak ? `streak ${pr.streak}` : '';
  $('#lv').innerHTML = Object.entries(LEVELS).map(([k, v]) => `<button data-v="${k}" class="${o.level === k ? 'on' : ''}">${v.label}<small>${v.min}+</small></button>`).join('');
  $('#theme').innerHTML = THEMES.map(([k, v]) => `<option value="${k}" ${o.theme === k ? 'selected' : ''}>${v}</option>`).join('');
  const missed = get('missed', []).length;
  $('#missed').textContent = `Missed ${missed}`; $('#missed').classList.toggle('on', o.mode === 'missed');
  $('#net').textContent = navigator.onLine === false ? `Offline · ${n} ready` : filling ? `Loading puzzles… ${n} ready` : `${n} ready offline`;
}
function pick() {
  const o = opts();
  if (o.mode === 'missed') { const m = get('missed', []); return m.length ? { p: m[m.length - 1], rated: false } : null; }
  const list = ready(o).sort((a, b) => a.rating - b.rating);
  if (!list.length) return null;
  const target = Math.max(prof().rating + 100, LEVELS[o.level].min); // always a bit above you
  list.sort((a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target));
  return { p: list[Math.floor(Math.random() * Math.min(4, list.length))], rated: true };
}
function nextPuzzle() {
  mode = 'puzzle'; tok++; document.body.classList.remove('playing');
  const k = pick();
  if (!k) {
    t = null; board.set(new Chess().fen(), { interactive: false });
    status(navigator.onLine === false ? 'No puzzles saved for this filter. Connect once to download more.' : 'Fetching hard puzzles from Lichess…', '');
    $('#acts').innerHTML = ''; $('#meta').innerHTML = '';
    fill(() => { header(); if (!t && mode === 'puzzle' && ready().length) nextPuzzle(); });
    return;
  }
  const p = k.p;
  t = { p, rated: k.rated, step: 0, fen: p.fen, failed: false, done: false, hint: 0, busy: true, recorded: false };
  me = new Chess(p.fen).turn() === 'w' ? 'b' : 'w';
  board.set(p.fen, { white: me === 'w', interactive: false });
  status(`Puzzle ${p.rating} — watch the last move…`, '');
  $('#meta').innerHTML = ''; buttons();
  setTimeout(() => { if (!t || t.p !== p) return; const r = apply(t.fen, p.moves[0]); t.fen = r.fen; t.last = r; t.step = 1; t.start = t.fen; t.busy = false; draw(); }, 600);
  header(); fill(header);
}
function apply(fen, mv) { const c = new Chess(fen); try { const m = c.move(mv); return { fen: c.fen(), from: m.from, to: m.to, san: m.san, uci: m.lan }; } catch (e) { return null; } }
function status(h, cls) { const e = $('#st'); e.className = 'st ' + (cls || ''); e.innerHTML = h; }
function draw(msg, cls) {
  board.set(t.fen, { last: t.last, white: me === 'w', interactive: !t.done && !t.busy, arrows: t.arrows || [], marks: t.marks || {} });
  status(msg || (t.done ? (t.failed ? 'Done — this one goes to your Missed list.' : 'Solved!') : `Find the best move for <b>${me === 'w' ? 'White' : 'Black'}</b>`), cls || (t.done && !t.failed ? 'good' : ''));
  buttons();
  if (t.done) $('#meta').innerHTML = `<p>Puzzle rating <b>${t.p.rating}</b>${t.delta != null ? ` · your rating ${t.delta >= 0 ? '+' : ''}${t.delta}` : ' · unrated'}</p><p class="tags">${t.p.themes.map(x => `<span>${esc(tname(x))}</span>`).join('')}</p><p class="muted"><a href="https://lichess.org/training/${esc(t.p.id)}" target="_blank" rel="noopener">View on Lichess</a></p>`;
}
function buttons() {
  if (mode === 'game') { $('#acts').innerHTML = game && game.over ? '<button class="btn gold" id="back">Back to puzzles</button><button class="btn" id="again">Play again</button>' : '<button class="btn ghost danger" id="resign">Resign</button>'; }
  else if (!t) $('#acts').innerHTML = '';
  else $('#acts').innerHTML = t.done
    ? '<button class="btn gold" id="next">Next puzzle</button><button class="btn" id="play">Play it out vs Stockfish</button>'
    : '<button class="btn ghost" id="hint">Hint</button><button class="btn ghost" id="sol">Solution</button><button class="btn ghost" id="skip">Skip</button>';
  const on = (id, f) => { const e = $('#' + id); if (e) e.onclick = f; };
  on('next', nextPuzzle); on('hint', hint); on('sol', solution); on('play', () => startGame(t.start));
  on('skip', () => { rec(false); nextPuzzle(); });
  on('resign', () => endGame(me === 'w' ? '0-1' : '1-0', 'You resigned'));
  on('back', nextPuzzle); on('again', () => startGame(game.start));
}
function rec(ok) { if (t.recorded) return; t.recorded = true; t.delta = record(t.p, ok, t.rated && t.hint < 2); header(); }
function onMove(m) {
  if (mode === 'game') return gameMove(m);
  if (!t || t.done || t.busy) return;
  const r = apply(t.fen, m); if (!r) return;
  const ok = r.uci === t.p.moves[t.step] || new Chess(r.fen).isCheckmate();
  if (!ok) {
    t.failed = true; rec(false);
    board.set(r.fen, { last: r, white: me === 'w', interactive: false });
    status(`${esc(r.san)} is not it.`, 'bad');
    setTimeout(() => draw(`${esc(r.san)} is not it — try again, or see the solution.`, 'bad'), 700);
    return;
  }
  t.fen = r.fen; t.last = r; t.step++; t.arrows = []; t.marks = {};
  if (t.step >= t.p.moves.length || new Chess(t.fen).isGameOver()) { t.done = true; rec(!t.failed); draw(); fill(header); return; }
  draw('Correct — keep going', 'good'); t.busy = true; board.interactive = false;
  setTimeout(() => { const o = apply(t.fen, t.p.moves[t.step]); t.fen = o.fen; t.last = o; t.step++; t.busy = false; draw(); }, 450);
}
function hint() {
  if (!t || t.done || t.busy) return;
  t.hint++; const mv = t.p.moves[t.step], pc = new Chess(t.fen).get(mv.slice(0, 2));
  if (t.hint === 1) { const th = t.p.themes.filter(x => !['short', 'long', 'veryLong', 'oneMove', 'middlegame', 'endgame', 'opening', 'advantage', 'crushing', 'master', 'masterVsMaster', 'superGM'].includes(x)); draw(`Hint: ${th.length ? th.map(tname).join(', ') : 'checks, captures and threats — for both sides'}`); }
  else if (t.hint === 2) { t.marks = { [mv.slice(0, 2)]: 'h' }; draw(`Hint: move your ${PIECE[pc.type]} (now unrated)`); }
  else { t.arrows = [{ ...uciObj(mv), c: 'g' }]; draw('Hint: play the arrow'); }
}
function solution() {
  if (!t || t.done) return; t.failed = true; rec(false); t.busy = true; t.arrows = []; t.marks = {};
  const go = () => {
    if (!t || mode !== 'puzzle') return;
    if (t.step >= t.p.moves.length) { t.busy = false; t.done = true; draw(); return; }
    const r = apply(t.fen, t.p.moves[t.step]); t.fen = r.fen; t.last = r; t.step++;
    board.set(t.fen, { last: r, white: me === 'w', interactive: false }); setTimeout(go, 700);
  };
  go();
}

// ---------- play it out ----------
function startGame(fen) {
  mode = 'game'; document.body.classList.add('playing'); tok++;
  game = { start: fen, fen, last: null, over: false, moves: 0 };
  $('#meta').innerHTML = `<p class="muted">Stockfish plays at full strength (${opts().think / 1000}s per move). No hints, no take-backs.</p>`;
  gdraw(); engineTurn();
}
function gdraw(msg) {
  const c = new Chess(game.fen);
  board.set(game.fen, { last: game.last, white: me === 'w', interactive: !game.over && c.turn() === me && !game.thinking });
  status(msg || (game.over ? game.text : game.thinking ? 'Stockfish is thinking…' : 'Your move'), game.over ? (game.win ? 'good' : 'bad') : '');
  buttons();
}
function gameMove(m) {
  if (game.over || game.thinking || new Chess(game.fen).turn() !== me) return;
  const r = apply(game.fen, m); if (!r) return;
  game.fen = r.fen; game.last = r; game.moves++;
  if (!checkEnd()) { gdraw(); engineTurn(); }
}
async function engineTurn() {
  if (game.over || new Chess(game.fen).turn() === me) return;
  const k = ++tok; game.thinking = true; gdraw();
  let mv; try { mv = await engine.move(game.fen, opts().think); } catch (e) { game.thinking = false; gdraw('The engine could not start in this browser.'); return; }
  if (k !== tok || mode !== 'game') return;
  game.thinking = false; const r = apply(game.fen, mv); if (!r) return;
  game.fen = r.fen; game.last = r; if (!checkEnd()) gdraw();
}
function checkEnd() {
  const c = new Chess(game.fen);
  if (c.isCheckmate()) { const win = c.turn() !== me; endGame(null, win ? 'Checkmate — you beat Stockfish!' : 'Checkmate — Stockfish wins', win); return true; }
  if (c.isDraw()) { endGame(null, c.isStalemate() ? 'Stalemate — draw' : 'Draw', false, true); return true; }
  return false;
}
function endGame(res, text, win = false, draw = false) {
  game.over = true; game.thinking = false; game.text = text; game.win = win; tok++;
  const s = get('games', { w: 0, d: 0, l: 0 }); s[win ? 'w' : draw ? 'd' : 'l']++; set('games', s);
  gdraw();
}

// ---------- settings sheet: install, offline, think time, reset ----------
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
function openSheet() {
  const pr = prof(), g = get('games', { w: 0, d: 0, l: 0 }), o = opts();
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  $('#sheet').innerHTML = `<div class="sh"><div class="row sp"><h2>Settings</h2><button class="x" id="close" aria-label="Close">✕</button></div>
    <div class="stats"><div><b>${pr.rating}</b><span>rating</span></div><div><b>${pr.n ? Math.round(pr.ok / pr.n * 100) : 0}%</b><span>${pr.n} rated</span></div><div><b>${pr.best}</b><span>best streak</span></div><div><b>${g.w}/${g.d}/${g.l}</b><span>vs Stockfish W/D/L</span></div></div>
    <h3>Install</h3>${standalone ? '<p class="muted">Installed on this device.</p>' : ios ? '<p class="muted">In Safari: Share → Add to Home Screen.</p>' : `<button class="btn gold" id="inst" ${installEvt ? '' : 'disabled'}>Install app on this phone</button>${installEvt ? '' : '<p class="muted">Or use the browser menu → Install app / Add to Home screen.</p>'}`}
    <h3>Offline</h3><p class="muted" id="offst">${ready().length} puzzles ready for this filter · ${queue().length} saved in total.</p>
    <button class="btn" id="dl">Download ${QUEUE_TARGET * 2} more puzzles now</button>
    <h3>Stockfish think time (play it out)</h3><div class="seg" id="think">${[1000, 2000, 4000].map(v => `<button data-v="${v}" class="${o.think === v ? 'on' : ''}">${v / 1000}s</button>`).join('')}</div>
    <h3>Progress</h3><button class="btn ghost danger" id="reset">Reset rating and history</button></div>`;
  $('#sheet').hidden = false;
  $('#close').onclick = () => $('#sheet').hidden = true;
  const ib = $('#inst'); if (ib) ib.onclick = async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; openSheet(); };
  $('#dl').onclick = async () => {
    if (navigator.onLine === false) { toast('You are offline'); return; }
    if ('caches' in window) { try { const c = await caches.open(CACHE); await c.addAll(FILES); } catch (e) { } }
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { }
    const before = queue().length; const want = before + QUEUE_TARGET * 2; let n = 0;
    $('#dl').disabled = true;
    while (queue().length < want && n < 50 && Date.now() >= blockedUntil) {
      n++; try { const p = await fetchOne(opts()); if (p && !queue().some(x => x.id === p.id)) set('queue', queue().concat(p).slice(-300)); } catch (e) { break; }
      $('#offst').textContent = `Downloading… ${queue().length - before} new`;
    }
    $('#dl').disabled = false; $('#offst').textContent = `${ready().length} puzzles ready for this filter · ${queue().length} saved in total.`; header();
  };
  document.querySelectorAll('#think button').forEach(b => b.onclick = () => { set('opts', Object.assign(opts(), { think: +b.dataset.v })); openSheet(); });
  $('#reset').onclick = e => { if (!e.target.dataset.arm) { e.target.dataset.arm = 1; e.target.textContent = 'Tap again to reset'; return; } set('prof', {}); set('seen', {}); set('missed', []); set('games', { w: 0, d: 0, l: 0 }); toast('Progress reset'); openSheet(); header(); };
}
const CACHE = 'crown-v1'; // keep in sync with sw.js
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icons/crown.svg', 'css/app.css', 'css/pieces.css', 'js/app.js', 'js/board.js', 'js/chess.js', 'js/store.js', 'engine/stockfish-19-lite-single.js', 'engine/stockfish-19-lite-single.wasm'];

// ---------- wire up ----------
$('#lv').onclick = e => { const b = e.target.closest('button'); if (!b) return; set('opts', Object.assign(opts(), { level: b.dataset.v, mode: 'new' })); nextPuzzle(); };
$('#theme').onchange = e => { set('opts', Object.assign(opts(), { theme: e.target.value, mode: 'new' })); nextPuzzle(); };
$('#missed').onclick = () => { const o = opts(); set('opts', Object.assign(o, { mode: o.mode === 'missed' ? 'new' : 'missed' })); nextPuzzle(); };
$('#gear').onclick = openSheet;
window.addEventListener('online', () => { header(); fill(header); if (!t && mode === 'puzzle') nextPuzzle(); });
window.addEventListener('offline', header);
if ('serviceWorker' in navigator) { try { navigator.serviceWorker.register('sw.js').catch(() => { }); } catch (e) { } }
window.__crown = { get t() { return t; }, get game() { return game; } }; // for debugging
header(); nextPuzzle();
