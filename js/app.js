// ChessMate — learn chess through puzzles, lessons and master games. Offline-first, online-updated.
import { Chess } from './chess.js';
import { Board } from './board.js';
import { get, set } from './store.js';
import { engine } from './engine.js';
import { esc, uciObj, apply, turn, lineSan, numbered, povVal, wpFor, winPct, fmtScore, CLS, judgeMove } from './util.js';
import * as P from './puzzles.js';
import * as G from './game.js';
import { CHAPTERS, LESSONS, THEME_NOTES } from './lessons.js';
import { CLASSICS } from './classics.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const main = $('#main');
const S = { pzo: Object.assign({ src: 'lichess', angle: '', mode: 'new' }, get('pzo', {})), pz: null, lesson: null, vg: null, pl: null };
let cleanup = null, inst = 0;
const settings = () => Object.assign({ engineMode: 'auto', depth: 14, gameDepth: 12, think: 1500 }, get('settings', {}));
window.__cm = S;

// ---------- small UI helpers ----------
function toast(t, ms = 2600) { const e = $('#toast'); e.innerHTML = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => e.hidden = true, ms); }
const stageHTML = () => `<div class="lab top" data-lab="top"></div><div class="stage"><div class="ebar"><div class="fill"></div><span class="elab"></span></div><div class="bd"></div></div><div class="lab bot" data-lab="bot"></div>`;
function setEval(el, sc, white) {
  if (!el) return; el.hidden = false;
  const wp = sc ? winPct(sc) : 50;
  el.querySelector('.fill').style.height = wp + '%'; el.classList.toggle('flip', !white);
  const l = el.querySelector('.elab'); l.textContent = sc ? fmtScore(sc) : ''; l.classList.toggle('top', (wp < 50) === white);
}
function labels(top, bot) { const t = $('[data-lab=top]'), b = $('[data-lab=bot]'); if (t) t.textContent = top || ''; if (b) b.textContent = bot || ''; }
const colName = c => c === 'w' ? 'WHITE' : 'BLACK';
function header() {
  const pr = P.profile(), st = P.stageOf(pr.rating);
  $('#hstage').textContent = `Stage ${st.n} · ${st.name}`; $('#hrating').textContent = pr.rating;
}
function noteHTML(n) {
  if (!n.j) return `<div class="note"><b>${esc(n.san)}</b> <span class="muted">analysing…</span></div>`;
  if (!n.j.cls) return `<div class="note"><b>${esc(n.san)}</b> <span class="muted">no engine result</span></div>`;
  const c = CLS[n.j.cls], side = n.side;
  const ev = n.j.after && n.j.after.mated ? 'Checkmate' : fmtScore(n.j.after);
  return `<div class="note c-${c[2]}"><span class="sym">${c[0] || '•'}</span><div><b>${esc(n.san)}</b> — ${c[1]} <span class="ev">${ev}</span>` +
    (n.j.cls !== 'best' && n.j.bestSan ? `<br><small>Best was <b>${esc(n.j.bestSan)}</b>${n.j.lossWp >= 10 ? ` · you lost ${Math.round(n.j.lossWp)}% winning chances` : ''}${n.j.replyLine && n.j.lossWp >= 20 ? ` · reply: ${esc(lineSan(n.fenAfter, n.j.replyLine, 3).join(' '))}` : ''}</small>` : '') + `</div></div>`;
}
async function analyseInto(list, idx, render) {
  const n = list[idx];
  try { n.j = await judgeMove(n.fenBefore, n.uci); } catch (e) { n.j = { cls: null }; }
  render();
}

// =====================================================================
// PUZZLES
// =====================================================================
function viewPuzzles() {
  const pr = P.profile(), o = S.pzo;
  if (!pr.started) return welcome();
  const st = P.stageOf(pr.rating), pct = Math.min(100, Math.max(0, (pr.rating - st.min) / (st.max + 1 - st.min) * 100));
  const missed = get('missed', []).length;
  main.innerHTML = `<section class="stagecard"><div><span class="kick">STAGE ${st.n} OF 6</span><h2>${st.name}</h2><div class="bar"><i style="width:${pct}%"></i></div>
      <small>${pr.rating} · next stage at ${st.n < 6 ? st.max + 1 : 'GM level'} · puzzles aimed at ~${P.target()}</small></div><div class="big"><b>${pr.rating}</b><span>RATING</span></div></section>
    <div class="chips"><button class="chip ${o.src === 'lichess' && o.mode !== 'missed' ? 'on' : ''}" data-src="lichess">Lichess</button><button class="chip ${o.src === 'chesscom' && o.mode !== 'missed' ? 'on' : ''}" data-src="chesscom">Chess.com</button>
      <button class="chip ${o.mode === 'missed' ? 'on' : ''}" id="missed">Missed ${missed}</button>
      <select id="angle" ${o.src === 'chesscom' ? 'disabled' : ''}>${P.ANGLES.map(([k, v]) => `<option value="${k}" ${o.angle === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="split"><div class="left">${stageHTML()}</div>
      <div class="side"><div id="src"></div><p id="st" class="st"></p><div class="row" id="acts"></div><div id="notes"></div><div id="lesson"></div><p class="net" id="net"></p></div></div>`;
  $$('[data-src]').forEach(b => b.onclick = () => { S.pzo = { ...S.pzo, src: b.dataset.src, mode: 'new' }; set('pzo', S.pzo); S.pz = null; viewPuzzles(); });
  $('#missed').onclick = () => { S.pzo = { ...S.pzo, mode: S.pzo.mode === 'missed' ? 'new' : 'missed' }; set('pzo', S.pzo); S.pz = null; viewPuzzles(); };
  $('#angle').onchange = e => { S.pzo = { ...S.pzo, angle: e.target.value, mode: 'new' }; set('pzo', S.pzo); S.pz = null; viewPuzzles(); };
  const board = new Board($('.bd'), { onMove: m => onMove(m) }), ebar = $('.ebar'), my = inst;
  ebar.hidden = true;
  const net = () => { const e = $('#net'); if (e) e.textContent = (navigator.onLine === false ? 'Offline · ' : P.isBusy() ? 'Downloading puzzles… ' : '') + `${P.ready(S.pzo).length} puzzles saved for offline`; };
  let t = S.pz;
  const start = () => {
    const p = P.pick(S.pzo);
    if (!p) {
      board.set(new Chess().fen(), { interactive: false }); labels('', '');
      status(navigator.onLine === false ? 'No saved puzzles for this choice yet. Connect once to download some.' : 'Downloading puzzles for your level…');
      P.fill(S.pzo, 12, () => { net(); if (my === inst && !S.pz && P.pick(S.pzo)) viewPuzzles(); });
      return null;
    }
    const me = p.noSetup ? turn(p.fen) : (turn(p.fen) === 'w' ? 'b' : 'w');
    return S.pz = { p, me, fen: p.fen, step: 0, start: p.noSetup ? p.fen : null, notes: [], hint: 0, failed: false, done: false, busy: !p.noSetup, recorded: false,
      rated: S.pzo.mode !== 'missed' && p.src === 'lichess' };
  };
  function status(h, cls = '') { const e = $('#st'); e.className = 'st ' + cls; e.innerHTML = h; }
  function srcCard() {
    const p = t.p, g = p.game;
    let h = '';
    if (p.src === 'lichess' && g) {
      const pl = x => x ? `${esc(x.name || x.id || '?')}${x.rating ? ' (' + x.rating + ')' : ''}` : '?';
      h = `<div class="card src"><span class="kick">FROM A REAL GAME</span><p><b>${pl(g.white)}</b> vs <b>${pl(g.black)}</b><br><small>Lichess ${esc(g.perf || '')}${g.clock ? ' · ' + esc(g.clock) : ''} · after move ${Math.ceil(g.ply / 2)}</small></p>
        <div class="row">${p.clip && p.clip.length ? '<button class="btn sm" id="clip">▶ Watch how it happened</button>' : ''}<a class="btn sm ghost" href="https://lichess.org/${esc(g.id)}/${g.ply % 2 ? 'white' : 'black'}#${g.ply}" target="_blank" rel="noopener">Open game ↗</a></div></div>`;
    } else if (p.src === 'chesscom') h = `<div class="card src"><span class="kick">CHESS.COM PUZZLE</span><p><b>${esc(p.title || 'Puzzle')}</b><br><small>${esc(p.date || '')} · unrated</small></p><a class="btn sm ghost" href="${esc(p.url)}" target="_blank" rel="noopener">Open on Chess.com ↗</a></div>`;
    $('#src').innerHTML = h;
    const c = $('#clip'); if (c) c.onclick = clip;
  }
  function draw(msg, cls) {
    if (!t) return;
    const last = t.last || null;
    board.set(t.fen, { last, white: t.me === 'w', interactive: !t.done && !t.busy, arrows: t.arrows || [], marks: t.marks || {} });
    labels(`${t.p.src === 'chesscom' ? 'PUZZLE' : 'OPPONENT'} · ${colName(t.me === 'w' ? 'b' : 'w')}`, `YOU · ${colName(t.me)}`);
    status(msg || (t.done ? (t.failed ? 'Done. This one goes to your Missed list.' : 'Solved! ✓') : `Find the best move for <b>${t.me === 'w' ? 'White' : 'Black'}</b>${t.p.rating ? ` · puzzle ${t.p.rating}` : ''}`), cls || (t.done && !t.failed ? 'good' : ''));
    $('#acts').innerHTML = t.done
      ? '<button class="btn green" id="next">Next puzzle</button><button class="btn" id="play">Play it out vs Stockfish</button>'
      : '<button class="btn ghost" id="hint">Hint</button><button class="btn ghost" id="sol">Solution</button><button class="btn ghost" id="skip">Skip</button>';
    const on = (id, f) => { const e = $('#' + id); if (e) e.onclick = f; };
    on('next', () => { S.pz = null; viewPuzzles(); }); on('hint', hint); on('sol', solution);
    on('skip', () => { rec(false); S.pz = null; viewPuzzles(); });
    on('play', () => { S.pl = newPlay(t.start, t.me, 'puzzle ' + (t.p.rating || '')); location.hash = 'play'; });
    renderNotes();
    if (t.done) lessonPanel();
  }
  function renderNotes() { if (my !== inst) return; $('#notes').innerHTML = t.notes.length ? `<h3>Your moves, checked by the engine</h3>${t.notes.map(noteHTML).join('')}` : ''; }
  function rec(ok) {
    if (t.recorded) return; t.recorded = true;
    const r = P.record(t.p, ok, t.rated && t.hint < 2); t.delta = r.delta; header(); const sb = $('.stagecard .big b'); if (sb) sb.textContent = P.profile().rating;
    if (r.stageUp) toast(`🎉 Promoted to <b>Stage ${r.stageUp.n} · ${r.stageUp.name}</b>`, 4000);
  }
  function onMove(m) {
    if (!t || t.done || t.busy) return;
    const before = t.fen, r = apply(before, m); if (!r) return;
    const want = t.p.moves[t.step], ok = r.uci === want || new Chess(r.fen).isCheckmate();
    const n = { san: r.san, uci: r.uci, fenBefore: before, fenAfter: r.fen, side: t.me, ok }; t.notes.push(n); analyseInto(t.notes, t.notes.length - 1, renderNotes);
    if (!ok) {
      t.failed = true; rec(false);
      board.set(r.fen, { last: r, white: t.me === 'w', interactive: false });
      status(`${esc(r.san)} is not it.`, 'bad');
      setTimeout(() => { if (S.pz === t) draw(`${esc(r.san)} is not it. Read the engine note below, then try again.`, 'bad'); }, 800);
      return;
    }
    t.fen = r.fen; t.last = r; t.step++; t.arrows = []; t.marks = {};
    if (t.step >= t.p.moves.length || new Chess(t.fen).isGameOver()) { t.done = true; rec(!t.failed); draw(); P.fill(S.pzo, 12, net); return; }
    t.busy = true; draw('Correct. Keep going…', 'good');
    setTimeout(() => { if (S.pz !== t) return; const o = apply(t.fen, t.p.moves[t.step]); t.fen = o.fen; t.last = o; t.step++; t.busy = false; draw(); }, 500);
  }
  function hint() {
    if (t.done || t.busy) return; t.hint++;
    const mv = t.p.moves[t.step], pc = new Chess(t.fen).get(mv.slice(0, 2));
    const th = t.p.themes.filter(x => THEME_NOTES[x] && !['endgame', 'opening', 'mate'].includes(x));
    if (t.hint === 1) draw(`Hint: ${th.length ? th.map(x => THEME_NOTES[x][0]).join(', ') : 'look at every check, capture and threat'}.`);
    else if (t.hint === 2) { t.marks = { [mv.slice(0, 2)]: 'h' }; draw(`Hint: move your ${({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' })[pc.type]}. (now unrated)`); }
    else { t.arrows = [{ ...uciObj(mv), c: 'g' }]; draw('Hint: play the arrow.'); }
  }
  function solution() {
    if (t.done) return; t.failed = true; rec(false); t.busy = true; t.arrows = []; t.marks = {};
    const go = () => { if (S.pz !== t) return; if (t.step >= t.p.moves.length) { t.busy = false; t.done = true; draw(); return; }
      const r = apply(t.fen, t.p.moves[t.step]); t.fen = r.fen; t.last = r; t.step++; board.set(t.fen, { last: r, white: t.me === 'w', interactive: false }); setTimeout(go, 750); };
    go();
  }
  function clip() {
    const p = t.p; if (!p.clip) return;
    const wasBusy = t.busy; t.busy = true; let f = p.clipStart, i = 0; const seq = [...p.clip, p.moves[0]];
    status(`Replaying the last ${seq.length} moves of the game…`);
    const stepc = () => {
      if (S.pz !== t || my !== inst) return;
      if (i >= seq.length) { t.busy = wasBusy && t.step === 0; draw(); return; }
      const r = apply(f, seq[i]); f = r.fen; i++;
      board.set(f, { last: r, white: t.me === 'w', interactive: false }); setTimeout(stepc, 900);
    };
    stepc();
  }
  async function lessonPanel() {
    const p = t.p, el = $('#lesson'); if (!el) return;
    const notes = [...new Set(p.themes)].filter(x => THEME_NOTES[x]).slice(0, 3);
    el.innerHTML = `${notes.length ? `<h3>The idea</h3>${notes.map(x => { const n = THEME_NOTES[x]; return `<div class="card idea"><b>${n[0]}</b><p>${n[1]}</p><button class="lnk" data-lesson="${n[2]}">Read the lesson →</button></div>`; }).join('')}` : ''}
      <div class="row tags">${p.themes.map(x => `<span>${esc(P.tname(x))}</span>`).join('')}</div>
      ${t.delta != null ? `<p class="small">Rating ${t.delta >= 0 ? '+' : ''}${t.delta} → <b>${P.profile().rating}</b></p>` : '<p class="small muted">Unrated</p>'}
      <h3>Other options in the starting position</h3><div id="opts"><p class="muted small">Asking the engine…</p></div>`;
    $$('[data-lesson]', el).forEach(b => b.onclick = () => { S.lesson = b.dataset.lesson; location.hash = 'lesson'; });
    const fen0 = t.start || t.p.fen;
    let r; try { r = await engine.analyse(fen0, { multipv: 4 }); } catch (e) { r = null; }
    if (my !== inst || S.pz !== t) return;
    const o = $('#opts'); if (!o) return;
    if (!r || !r.lines.length) { o.innerHTML = '<p class="muted small">Engine unavailable right now.</p>'; return; }
    const solU = t.p.moves[t.p.noSetup ? 0 : 1];
    o.innerHTML = r.lines.map((l, i) => { const sans = lineSan(fen0, l.pv, 6); const isSol = l.pv[0] === solU;
      return `<button class="opt ${isSol ? 'sol' : ''}" data-i="${i}"><span class="ev">${fmtScore(l)}</span><span>${esc(numbered(fen0, sans))}</span>${isSol ? '<em>solution</em>' : ''}</button>`; }).join('') +
      `<p class="src">${r.source === 'cloud' ? 'Lichess cloud analysis' : 'Stockfish on your phone'} · depth ${r.depth}. Tap a line to see it on the board.</p>`;
    setEval(ebar, r.lines[0], t.me === 'w');
    $$('.opt', o).forEach(b => b.onclick = () => showLine(fen0, r.lines[+b.dataset.i].pv));
  }
  function showLine(fen0, pv) {
    let f = fen0, i = 0; t.busy = true;
    const go = () => { if (S.pz !== t || my !== inst) return; if (i >= Math.min(pv.length, 8)) { setTimeout(() => { if (S.pz === t) { t.busy = false; draw(); } }, 1200); return; }
      const r = apply(f, pv[i]); if (!r) return; f = r.fen; i++; board.set(f, { last: r, white: t.me === 'w', interactive: false, arrows: [{ from: r.from, to: r.to, c: 'b' }] }); setTimeout(go, 800); };
    board.set(fen0, { white: t.me === 'w', interactive: false }); setTimeout(go, 400);
  }
  if (!t) t = start();
  if (!t) { net(); return; }
  srcCard(); net();
  if (t.step === 0 && !t.p.noSetup && !t.started) {
    t.started = true; board.set(t.p.fen, { white: t.me === 'w', interactive: false });
    status('Watch the opponent\'s move…');
    setTimeout(() => { if (S.pz !== t) return; const r = apply(t.fen, t.p.moves[0]); t.fen = r.fen; t.last = r; t.step = 1; t.start = t.fen; t.busy = false; draw(); }, 700);
  } else draw();
  P.fill(S.pzo, 12, net);
  cleanup = () => { };
}
function welcome() {
  main.innerHTML = `<section class="hero"><img src="icons/crown.svg" width="64" alt=""><h1>Learn chess through puzzles</h1>
    <p class="muted">Pick where to start. The app moves you up (or down) after every puzzle — from 500 all the way to GM level.</p>
    <div class="ladder pick">${P.STAGES.map(s => `<button data-s="${s.n}"><b>Stage ${s.n} · ${s.name}</b><span>${s.min}${s.n === 6 ? '+' : '–' + s.max}</span></button>`).join('')}</div></section>`;
  $$('[data-s]').forEach(b => b.onclick = () => { const s = P.STAGES[+b.dataset.s - 1], pr = P.profile(); pr.rating = s.min + 100; pr.started = true; P.saveProfile(pr); header(); viewPuzzles(); });
}

// =====================================================================
// LEARN (offline textbook)
// =====================================================================
function viewLearn() {
  const done = get('lessonsDone', {}), pr = P.profile();
  const weak = Object.entries(pr.themes).filter(([k, v]) => v.n >= 3 && THEME_NOTES[k]).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n)[0];
  const rec = weak ? LESSONS.find(l => l.id === THEME_NOTES[weak[0]][2]) : LESSONS.find(l => !done[l.id] && l.stage <= P.stageOf(pr.rating).n + 1) || LESSONS[0];
  main.innerHTML = `<section class="hero left"><span class="kick">THE TEXTBOOK · WORKS OFFLINE</span><h1>Opening, middlegame, endgame, strategy</h1>
    <p class="muted">Short chapters with a position to solve in each. The engine checks your answer — any good move counts, not just one.</p></section>
    ${rec ? `<button class="card rec" data-l="${rec.id}"><span class="kick">${weak ? 'RECOMMENDED · YOU MISS ' + esc(P.tname(weak[0]).toUpperCase()) + ' OFTEN' : 'START HERE'}</span><b>${esc(rec.title)}</b><span class="muted">${CHAPTERS.find(c => c.id === rec.ch).title} · Stage ${rec.stage}</span></button>` : ''}
    ${CHAPTERS.map(c => `<section class="chapter"><h2>${c.title}</h2><p class="muted">${c.blurb}</p><div class="lgrid">${LESSONS.filter(l => l.ch === c.id).map(l =>
      `<button class="lcard ${done[l.id] ? 'done' : ''}" data-l="${l.id}"><span class="lvl">Stage ${l.stage}</span><b>${esc(l.title)}</b><span class="muted small">${done[l.id] ? '✓ Completed' : esc(l.task.split('.')[0])}</span></button>`).join('')}</div></section>`).join('')}`;
  $$('[data-l]').forEach(b => b.onclick = () => { S.lesson = b.dataset.l; location.hash = 'lesson'; });
}
function viewLesson() {
  const l = LESSONS.find(x => x.id === S.lesson) || LESSONS[0], idx = LESSONS.indexOf(l), my = inst;
  const side = turn(l.fen);
  main.innerHTML = `<button class="lnk back" id="back">← All lessons</button>
    <div class="split"><div class="left">${stageHTML()}</div><div class="side">
      <span class="kick">${CHAPTERS.find(c => c.id === l.ch).title.toUpperCase()} · STAGE ${l.stage}</span><h1 class="lt">${esc(l.title)}</h1>
      ${l.text.map(p => `<p>${esc(p)}</p>`).join('')}
      <ul class="keys">${l.keys.map(k => `<li>${esc(k)}</li>`).join('')}</ul>
      <div class="card task"><span class="kick">YOUR TURN</span><p><b>${esc(l.task)}</b></p><p id="st" class="st"></p>
        <div class="row"><button class="btn ghost" id="show">Show the engine's move</button><button class="btn ghost" id="reset">Reset</button></div></div>
      <div id="notes"></div>
      <div class="row">${l.classic ? `<button class="btn" id="classic">Open the full game</button>` : ''}${LESSONS[idx + 1] ? `<button class="btn green" id="nextl">Next lesson →</button>` : ''}</div>
    </div></div>`;
  const board = new Board($('.bd'), { onMove: m => onMove(m) }), ebar = $('.ebar');
  ebar.hidden = true;
  let ex = { fen: l.fen, step: 0, done: false, busy: false, notes: [] };
  const st = (h, c = '') => { const e = $('#st'); e.className = 'st ' + c; e.innerHTML = h; };
  const draw = (arrows = []) => { board.set(ex.fen, { last: ex.last, white: side === 'w', interactive: !ex.done && !ex.busy, arrows }); labels(colName(side === 'w' ? 'b' : 'w'), 'YOU · ' + colName(side)); };
  const renderNotes = () => { if (my === inst) $('#notes').innerHTML = ex.notes.map(noteHTML).join(''); };
  async function onMove(m) {
    if (ex.done || ex.busy) return;
    const before = ex.fen, r = apply(before, m); if (!r) return;
    ex.busy = true; board.set(r.fen, { last: r, white: side === 'w', interactive: false }); st('Checking with the engine…');
    let b, a;
    try {
      b = await engine.analyse(before, { multipv: 1, depth: 16 });
      const mated = new Chess(r.fen).isCheckmate();
      a = mated ? { lines: [{ mate: side === 'w' ? 1 : -1, pv: [] }] } : await engine.analyse(r.fen, { multipv: 1, depth: 16 });
    } catch (e) { ex.busy = false; draw(); st('The engine is not available in this browser.', 'bad'); return; }
    if (my !== inst) return;
    const vb = povVal(b.lines[0], side), va = povVal(a.lines[0], side), mated = new Chess(r.fen).isCheckmate();
    if (mated) a.lines[0].mated = true;
    const ok = l.goal === 'mate' ? (mated || va >= 90000) : l.goal === 'win' ? va >= 250 : l.goal === 'draw' ? va >= -80 : va >= vb - l.tol;
    ex.notes.push({ san: r.san, fenAfter: r.fen, side, j: { cls: ok ? (b.bestmove === r.uci ? 'best' : 'great') : 'mistake', after: a.lines[0], bestSan: lineSan(before, b.lines[0].pv, 1)[0], lossWp: Math.max(0, wpFor(b.lines[0], side) - wpFor(a.lines[0], side)), replyLine: a.lines[0].pv } });
    renderNotes();
    if (!ok) { ex.busy = false; draw(); st(`${esc(r.san)} doesn't do the job (${fmtScore(a.lines[0])}). Try again.`, 'bad'); return; }
    ex.fen = r.fen; ex.last = r; ex.step++;
    setEval(ebar, a.lines[0], side === 'w');
    if (mated || ex.step >= l.moves || new Chess(ex.fen).isGameOver()) { ex.done = true; ex.busy = false; draw(); st(mated ? 'Checkmate! Lesson complete ✓' : 'Well done — lesson complete ✓', 'good'); const d = get('lessonsDone', {}); d[l.id] = Date.now(); set('lessonsDone', d); return; }
    st('Good. The opponent replies…', 'good');
    setTimeout(() => { if (my !== inst) return; const rep = a.lines[0].pv && a.lines[0].pv[0]; const o = rep && apply(ex.fen, rep); if (o) { ex.fen = o.fen; ex.last = o; } ex.busy = false; draw(); st('Your move again.'); }, 600);
  }
  $('#show').onclick = async () => { try { const r = await engine.analyse(ex.fen, { multipv: 1, depth: 16 }); if (my === inst && r.lines[0]) { draw([{ ...uciObj(r.lines[0].pv[0]), c: 'g' }]); setEval(ebar, r.lines[0], side === 'w'); st(`Engine: ${esc(numbered(ex.fen, lineSan(ex.fen, r.lines[0].pv, 5)))}`); } } catch (e) { st('Engine unavailable.', 'bad'); } };
  $('#reset').onclick = () => { ex = { fen: l.fen, step: 0, done: false, busy: false, notes: [] }; renderNotes(); ebar.hidden = true; draw(); st(''); };
  $('#back').onclick = () => location.hash = 'learn';
  const nb = $('#nextl'); if (nb) nb.onclick = () => { S.lesson = LESSONS[idx + 1].id; viewLesson(); window.scrollTo(0, 0); };
  const cb = $('#classic'); if (cb) cb.onclick = () => openClassic(l.classic);
  draw(); st('');
}

// =====================================================================
// MASTERS: classic games (offline), Lichess broadcasts + Chess.com GMs (online)
// =====================================================================
function viewMasters() {
  main.innerHTML = `<section class="hero left"><span class="kick">MASTER GAMES</span><h1>Watch, guess, then play the GMs</h1>
    <p class="muted">Replay any game move by move with engine notes, play "Guess the move", or take over from any position against Stockfish.</p></section>
    <section class="chapter"><h2>Classic games <small class="muted">· offline</small></h2><div class="lgrid">${CLASSICS.map(c =>
      `<button class="lcard" data-c="${c.id}"><span class="lvl">${c.year}</span><b>${esc(c.title)}</b><span class="muted small">${esc(c.white)} – ${esc(c.black)}</span></button>`).join('')}</div></section>
    <section class="chapter"><h2>Elite events <small class="muted">· Lichess broadcasts, online</small></h2><button class="btn" id="bc">Load top events</button><div id="bcl"></div></section>
    <section class="chapter"><h2>Grandmasters online <small class="muted">· Chess.com, online</small></h2><button class="btn" id="gm">Load recent GM games</button><div id="gml"></div></section>`;
  $$('[data-c]').forEach(b => b.onclick = () => openClassic(b.dataset.c));
  const gameList = (el, gs) => { el.innerHTML = gs.length ? `<div class="glist">${gs.map((g, i) => `<button class="gitem" data-i="${i}"><b>${esc(g.white)}${g.welo ? ' ' + esc(g.welo) : ''} – ${esc(g.black)}${g.belo ? ' ' + esc(g.belo) : ''}</b><span>${esc(g.result)} · ${g.moves.length} plies${g.event ? ' · ' + esc(g.event) : ''}</span></button>`).join('')}</div>` : '<p class="muted">No finished games found.</p>';
    $$('.gitem', el).forEach(b => b.onclick = () => { S.vg = gs[+b.dataset.i]; location.hash = 'game'; }); };
  $('#bc').onclick = async () => {
    const el = $('#bcl'); el.innerHTML = '<p class="muted">Loading…</p>';
    try {
      const j = await (await fetch('https://lichess.org/api/broadcast/top')).json();
      const items = [], walk = x => { if (!x || typeof x !== 'object') return; if (x.tour && x.round && x.round.id) items.push(x); else Object.values(x).forEach(walk); };
      walk(j);
      el.innerHTML = `<div class="glist">${items.slice(0, 15).map((x, i) => `<button class="gitem" data-r="${i}"><b>${esc(x.tour.name)}</b><span>${esc(x.round.name || '')}</span></button>`).join('')}</div>`;
      $$('[data-r]', el).forEach(b => b.onclick = async () => {
        const x = items[+b.dataset.r]; el.innerHTML = '<p class="muted">Loading games…</p>';
        try { const txt = await (await fetch(`https://lichess.org/api/broadcast/round/${x.round.id}.pgn`)).text(); gameList(el, G.gamesFromPgn(txt).filter(g => g.moves.length >= 10).map(g => ({ ...g, event: x.tour.name }))); }
        catch (e) { el.innerHTML = '<p class="muted">Could not load this round.</p>'; }
      });
    } catch (e) { el.innerHTML = '<p class="muted">Could not reach Lichess. The classic games work offline.</p>'; }
  };
  $('#gm').onclick = async () => {
    const el = $('#gml'); el.innerHTML = '<p class="muted">Finding grandmasters…</p>';
    try {
      let gms = get('gmlist', null);
      if (!gms || Date.now() - gms.t > 7 * 864e5) { const j = await (await fetch('https://api.chess.com/pub/titled/GM')).json(); gms = { t: Date.now(), list: j.players || [] }; set('gmlist', gms); }
      const out = [];
      for (let k = 0; k < 4 && out.length < 12; k++) {
        const u = gms.list[Math.floor(Math.random() * gms.list.length)]; if (!u) break;
        el.innerHTML = `<p class="muted">Loading games of ${esc(u)}…</p>`;
        const a = await (await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(u)}/games/archives`)).json();
        const last = (a.archives || []).slice(-1)[0]; if (!last) continue;
        const m = await (await fetch(last)).json();
        for (const g of (m.games || []).slice(-30)) {
          if (!g.pgn || (g.white.rating || 0) < 2300 || (g.black.rating || 0) < 2300) continue;
          const gg = G.gamesFromPgn(g.pgn)[0]; if (gg && gg.moves.length >= 20) out.push({ ...gg, event: `Chess.com ${g.time_class}`, welo: g.white.rating, belo: g.black.rating, link: g.url });
        }
      }
      gameList(el, out.slice(-12).reverse());
    } catch (e) { el.innerHTML = '<p class="muted">Could not reach Chess.com.</p>'; }
  };
}
function openClassic(id) {
  const c = CLASSICS.find(x => x.id === id); const g = G.gamesFromPgn(`[Event "${c.event}"]\n[White "${c.white}"]\n[Black "${c.black}"]\n[Result "${c.result}"]\n\n${c.pgn} ${c.result}`)[0];
  S.vg = { ...g, event: `${c.event}, ${c.year}`, note: c.note, title: c.title, classicId: c.id }; location.hash = 'game';
}
function viewGame() {
  const g = S.vg; if (!g) { location.hash = 'masters'; return; }
  const my = inst; let ply = g.startPly ?? 0, guess = null, autoT = 0, white = true;
  main.innerHTML = `<button class="lnk back" id="back">← Master games</button>
    <div class="split"><div class="left">${stageHTML()}
      <div class="nav"><button data-n="first" aria-label="Start">⏮</button><button data-n="prev" aria-label="Back">◀</button><button id="auto" aria-label="Play clip">▶</button><button data-n="next" aria-label="Forward">▶|</button><button data-n="last" aria-label="End">⏭</button><button id="flip" aria-label="Flip">⇅</button></div></div>
      <div class="side"><div class="big"><b id="mvno">0</b><span>MOVE</span></div>
        <div class="card"><b>${esc(g.title || g.white + ' – ' + g.black)}</b><p class="small muted">${esc(g.event || '')} · ${esc(g.result)}</p>${g.note ? `<p class="small">${esc(g.note)}</p>` : ''}${g.link ? `<a class="small" href="${esc(g.link)}" target="_blank" rel="noopener">Open original ↗</a>` : ''}</div>
        <div class="row"><button class="btn" id="gw">Guess White's moves</button><button class="btn" id="gb">Guess Black's moves</button><button class="btn green" id="pfh">Play from here</button></div>
        <p id="st" class="st"></p><div id="mvnote"></div>
        <h3>Engine: best options here</h3><div id="lines"><p class="muted small">…</p></div>
        <div class="row"><button class="btn ghost" id="full">Analyse whole game</button></div><div id="crit"></div>
        <div class="moves" id="mv"></div></div></div>`;
  const board = new Board($('.bd'), { onMove: m => onGuess(m), canMove: c => !!guess && c === guess.side }), ebar = $('.ebar');
  const fen = () => G.fenAt(g, ply);
  function draw() {
    const last = ply ? g.moves[ply - 1] : null;
    board.set(fen(), { last, white, interactive: !!guess && turn(fen()) === guess.side && ply < g.moves.length });
    labels(white ? `${g.black}${g.belo ? ' (' + g.belo + ')' : ''} · BLACK` : `${g.white}${g.welo ? ' (' + g.welo + ')' : ''} · WHITE`, white ? `${g.white}${g.welo ? ' (' + g.welo + ')' : ''} · WHITE` : `${g.black}${g.belo ? ' (' + g.belo + ')' : ''} · BLACK`);
    $('#mvno').textContent = ply ? Math.ceil(ply / 2) : 0;
    const rep = g.analysis ? G.moveReport(g) : null;
    const marks = rep ? Object.fromEntries(rep.rows.map(r => [r.ply, ['inacc', 'mistake', 'blunder'].includes(r.cls) ? r.cls : ''])) : {};
    $('#mv').innerHTML = movesList(g, ply, marks); const on = $('#mv .on'); if (on) on.scrollIntoView({ block: 'nearest' });
    if (rep) $('#crit').innerHTML = rep.critical.length ? `<p class="small"><b>Turning points</b> — tap to jump</p><div class="chips">${rep.critical.map(r => `<button class="chip" data-p="${r.ply + 1}">${Math.floor(r.ply / 2) + 1}${r.white ? '.' : '…'} ${esc(g.moves[r.ply].san)}</button>`).join('')}</div>` : '';
    $$('#crit .chip').forEach(b => b.onclick = () => { ply = +b.dataset.p; draw(); analyseHere(); });
    if (guess) $('#st').innerHTML = `Guess the move · score <b>${guess.score}</b> / ${guess.max * 2}${ply >= g.moves.length ? ' · game over' : turn(fen()) === guess.side ? ' · your guess' : ''}`;
  }
  let at = 0, tok = 0;
  function analyseHere() {
    clearTimeout(at); const t = ++tok;
    at = setTimeout(async () => {
      const f = fen();
      if (ply > 0) {
        $('#mvnote').innerHTML = noteHTML({ san: `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '…'} ${g.moves[ply - 1].san}` });
        judgeMove(G.fenAt(g, ply - 1), g.moves[ply - 1].uci).then(j => { if (t === tok && my === inst) $('#mvnote').innerHTML = noteHTML({ san: `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '…'} ${g.moves[ply - 1].san}`, j, fenAfter: f, side: turn(G.fenAt(g, ply - 1)) }); }).catch(() => { });
      } else $('#mvnote').innerHTML = '';
      try {
        const r = await engine.analyse(f, { multipv: 3 });
        if (t !== tok || my !== inst) return;
        if (!r.lines.length) { $('#lines').innerHTML = '<p class="muted small">Game over.</p>'; return; }
        setEval(ebar, r.lines[0], white);
        $('#lines').innerHTML = r.lines.map(l => `<div class="opt"><span class="ev">${fmtScore(l)}</span><span>${esc(numbered(f, lineSan(f, l.pv, 6)))}</span></div>`).join('') + `<p class="src">${r.source === 'cloud' ? 'Lichess cloud' : 'Stockfish on your phone'} · depth ${r.depth}</p>`;
        if (!guess) board.set(f, { last: ply ? g.moves[ply - 1] : null, white, interactive: false, arrows: [{ ...uciObj(r.lines[0].pv[0]), c: 'g' }] });
      } catch (e) { if (t === tok) $('#lines').innerHTML = '<p class="muted small">Engine unavailable.</p>'; }
    }, 250);
  }
  function go(n) { ply = Math.max(0, Math.min(g.moves.length, n)); draw(); if (!guess) analyseHere(); }
  $$('[data-n]').forEach(b => b.onclick = () => { stopAuto(); const n = b.dataset.n; go(n === 'first' ? 0 : n === 'prev' ? ply - 1 : n === 'next' ? ply + 1 : g.moves.length); });
  $('#mv').onclick = e => { const b = e.target.closest('.mv'); if (b && !guess) { stopAuto(); go(+b.dataset.p); } };
  $('#flip').onclick = () => { white = !white; board.flip(white); draw(); };
  const stopAuto = () => { clearInterval(autoT); autoT = 0; $('#auto').textContent = '▶'; };
  $('#auto').onclick = () => { if (autoT) return stopAuto(); if (guess) return; $('#auto').textContent = '❚❚'; autoT = setInterval(() => { if (my !== inst || ply >= g.moves.length) return stopAuto(); go(ply + 1); }, 1400); };
  const startGuess = side => { stopAuto(); white = side === 'w'; board.flip(white); guess = { side, score: 0, max: 0 }; ply = 0; $('#lines').innerHTML = '<p class="muted small">Hidden while you guess.</p>'; ebar.hidden = true; draw(); autoOther(); };
  $('#gw').onclick = () => startGuess('w'); $('#gb').onclick = () => startGuess('b');
  function autoOther() { if (!guess || ply >= g.moves.length || turn(fen()) === guess.side) return draw(); setTimeout(() => { if (my !== inst || !guess) return; ply++; draw(); autoOther(); }, 700); }
  async function onGuess(m) {
    if (!guess) return; const f = fen(), r = apply(f, m); if (!r) return;
    const gm = g.moves[ply]; guess.max++; board.set(r.fen, { last: r, white, interactive: false });
    let msg;
    if (r.uci === gm.uci) { guess.score += 2; msg = `<span class="good">Exact! ${esc(gm.san)} is what was played. +2</span>`; }
    else {
      $('#st').textContent = 'Comparing with the engine…';
      try { const [a, b] = await Promise.all([judgeMove(f, r.uci), judgeMove(f, gm.uci)]); const diff = wpFor(b.after, guess.side) - wpFor(a.after, guess.side);
        if (diff <= 4) { guess.score += 1; msg = `<span class="good">${esc(r.san)} is about as good (${fmtScore(a.after)}). They played <b>${esc(gm.san)}</b>. +1</span>`; }
        else msg = `<span class="bad">${esc(r.san)} (${fmtScore(a.after)}). They played <b>${esc(gm.san)}</b> (${fmtScore(b.after)}).</span>`; }
      catch (e) { msg = `They played <b>${esc(gm.san)}</b>.`; }
    }
    if (my !== inst) return;
    ply++; draw(); $('#mvnote').innerHTML = `<p>${msg}</p>`;
    const best = get('guess', {}); const key = g.classicId || g.white + g.black + g.moves.length; best[key] = Math.max(best[key] || 0, guess.score); set('guess', best);
    autoOther();
  }
  $('#pfh').onclick = () => { S.pl = newPlay(fen(), turn(fen()), `${g.white} – ${g.black}, move ${Math.ceil((ply + 1) / 2)}`); location.hash = 'play'; };
  $('#full').onclick = async () => {
    const b = $('#full'); b.disabled = true;
    await G.analyseGame(g, (p, n) => { if (my === inst) b.textContent = `Analysing ${p}/${n}…`; }, () => my !== inst);
    if (my === inst) { b.textContent = 'Analysed ✓'; draw(); }
  };
  $('#back').onclick = () => location.hash = 'masters';
  draw(); analyseHere();
  cleanup = () => { clearInterval(autoT); };
}
function movesList(g, cur, marks = {}) {
  const c = new Chess(g.startFen); let n = c.moveNumber(), w = c.turn() === 'w', h = '';
  g.moves.forEach((m, i) => { if (w) h += `<span class="mn">${n}.</span>`; else if (i === 0) h += `<span class="mn">${n}…</span>`;
    h += `<button class="mv ${i + 1 === cur ? 'on' : ''} ${marks[i] ? 'c-' + marks[i] : ''}" data-p="${i + 1}">${esc(m.san)}${marks[i] ? `<b>${CLS[marks[i]][0]}</b>` : ''}</button>`; if (!w) n++; w = !w; });
  return h;
}

// =====================================================================
// PLAY IT OUT vs Stockfish (from any puzzle / master position) with move-by-move analysis
// =====================================================================
function newPlay(fen, me, label) { const r = P.profile().rating; return { start: fen, fen, me, label, moves: [], notes: [], level: Math.min(3200, r + 300), over: false, showEval: false }; }
function viewPlay() {
  const g = S.pl; if (!g) { location.hash = 'puzzles'; return; }
  const my = inst; let tok = 0;
  main.innerHTML = `<div class="split"><div class="left">${stageHTML()}</div><div class="side">
    <div class="big"><b id="mvno">1</b><span>MOVE</span></div>
    <p class="small muted">From ${esc(g.label)}</p>
    <div class="chips" id="lv">${[[Math.min(3200, P.profile().rating + 300), 'Your level +300'], [2500, 'Master 2500'], [3200, 'Full strength']].map(([v, t]) => `<button class="chip ${g.level === v ? 'on' : ''}" data-v="${v}" ${g.moves.length ? 'disabled' : ''}>${t}</button>`).join('')}</div>
    <p id="st" class="st"></p><div class="row" id="acts"></div><h3>Every move, analysed</h3><div id="notes"></div></div></div>`;
  const board = new Board($('.bd'), { onMove: m => userMove(m), canMove: c => c === g.me }), ebar = $('.ebar');
  $$('#lv .chip').forEach(b => b.onclick = () => { g.level = +b.dataset.v; viewPlay(); });
  const renderNotes = () => { if (my === inst) $('#notes').innerHTML = g.notes.length ? g.notes.slice().reverse().map(noteHTML).join('') : '<p class="muted small">Your moves appear here with the engine\'s verdict.</p>'; };
  function draw(msg) {
    board.set(g.fen, { last: g.last, white: g.me === 'w', interactive: !g.over && !g.thinking && turn(g.fen) === g.me });
    labels(`STOCKFISH ${g.level >= 3200 ? 'FULL' : g.level} · ${colName(g.me === 'w' ? 'b' : 'w')}`, `YOU · ${colName(g.me)}`);
    $('#mvno').textContent = new Chess(g.fen).moveNumber();
    ebar.hidden = !g.showEval && !g.over;
    $('#st').innerHTML = msg || (g.over ? `<b>${esc(g.text)}</b>${g.acc != null ? ` · your accuracy ${g.acc}%` : ''}` : g.thinking ? 'Stockfish is thinking…' : 'Your move');
    $('#acts').innerHTML = g.over ? '<button class="btn green" id="again">Play again</button><button class="btn" id="bk">Back to puzzles</button>'
      : `<button class="btn ghost" id="ev">${g.showEval ? 'Hide' : 'Show'} eval bar</button><button class="btn ghost danger" id="res">Resign</button>`;
    const on = (id, f) => { const e = $('#' + id); if (e) e.onclick = f; };
    on('again', () => { S.pl = { ...newPlay(g.start, g.me, g.label), level: g.level }; viewPlay(); });
    on('bk', () => { location.hash = 'puzzles'; });
    on('ev', () => { g.showEval = !g.showEval; draw(); if (g.showEval) evalNow(); });
    on('res', () => finish(false, false, 'You resigned'));
    renderNotes();
  }
  async function evalNow() { try { const r = await engine.analyse(g.fen, { multipv: 1, depth: 12 }); if (my === inst && r.lines[0]) setEval(ebar, r.lines[0], g.me === 'w'); } catch (e) { } }
  function userMove(m) {
    if (g.over || g.thinking || turn(g.fen) !== g.me) return;
    const before = g.fen, r = apply(before, m); if (!r) return;
    g.fen = r.fen; g.last = r; g.moves.push(r.uci);
    const n = { san: `${new Chess(before).moveNumber()}${g.me === 'w' ? '.' : '…'} ${r.san}`, uci: r.uci, fenBefore: before, fenAfter: r.fen, side: g.me };
    g.notes.push(n); analyseInto(g.notes, g.notes.length - 1, () => { renderNotes(); if (g.over) summary(); });
    if (!end()) { draw(); engineMove(); }
  }
  async function engineMove() {
    const t = ++tok; g.thinking = true; draw();
    let mv; try { mv = await engine.play(g.fen, g.level >= 3200 ? 3200 : g.level); } catch (e) { g.thinking = false; draw('The engine could not start in this browser.'); return; }
    if (t !== tok || my !== inst || S.pl !== g) return;
    g.thinking = false; const r = apply(g.fen, mv); if (!r) return; g.fen = r.fen; g.last = r; g.moves.push(r.uci);
    if (!end()) { draw(); if (g.showEval) evalNow(); }
  }
  function end() {
    const c = new Chess(g.fen);
    if (c.isCheckmate()) { finish(c.turn() !== g.me, false, c.turn() !== g.me ? 'Checkmate — you beat Stockfish!' : 'Checkmate — Stockfish wins'); return true; }
    if (c.isDraw()) { finish(false, true, 'Draw'); return true; }
    return false;
  }
  function summary() { const done = g.notes.filter(n => n.j && n.j.cls); if (!done.length) return; g.acc = Math.round(done.reduce((s, n) => s + Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * n.j.lossWp) - 3.1669)), 0) / done.length); if (my === inst) draw(); }
  function finish(win, draw_, text) {
    g.over = true; g.thinking = false; g.text = text; tok++;
    const s = get('playstats', { w: 0, d: 0, l: 0, acc: [] }); s[win ? 'w' : draw_ ? 'd' : 'l']++; set('playstats', s);
    summary(); draw(); evalNow();
    setTimeout(() => { if (g.acc != null) { const s2 = get('playstats', { w: 0, d: 0, l: 0, acc: [] }); s2.acc = (s2.acc || []).concat(g.acc).slice(-30); set('playstats', s2); } }, 4000);
  }
  if (!g.started) { g.started = true; g.thinking = false; }
  draw(); if (!g.over && turn(g.fen) !== g.me) engineMove();
  cleanup = () => { tok++; };
}

// =====================================================================
// PROGRESS: stage ladder + review of strengths and weaknesses
// =====================================================================
function viewProgress() {
  const pr = P.profile(), st = P.stageOf(pr.rating), ps = get('playstats', { w: 0, d: 0, l: 0, acc: [] }), done = get('lessonsDone', {});
  const th = Object.entries(pr.themes).filter(([k]) => !['short', 'long', 'veryLong', 'oneMove', 'advantage', 'crushing', 'equality', 'master', 'masterVsMaster', 'superGM'].includes(k)).sort((a, b) => b[1].n - a[1].n);
  const weak = th.filter(([, v]) => v.n >= 3 && v.ok / v.n < 0.7).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n).slice(0, 3);
  const strong = th.filter(([, v]) => v.n >= 3 && v.ok / v.n >= 0.7).sort((a, b) => b[1].ok / b[1].n - a[1].ok / a[1].n).slice(0, 3);
  const h = pr.hist, W = 300, H = 70;
  let spark = '';
  if (h.length > 1) { const lo = Math.min(...h.map(x => x[1])) - 20, hi = Math.max(...h.map(x => x[1])) + 20; spark = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="spark"><polyline points="${h.map((x, i) => `${(i / (h.length - 1) * W).toFixed(1)},${(H - (x[1] - lo) / (hi - lo) * H).toFixed(1)}`).join(' ')}"/></svg>`; }
  const pct = v => Math.round(v.ok / v.n * 100) + '%';
  main.innerHTML = `<section class="hero left"><span class="kick">YOUR REVIEW</span><h1>Stage ${st.n} · ${st.name}</h1><p class="muted">Rating ${pr.rating}. Every 3 correct in a row raises the challenge; a miss lowers it.</p></section>
    <div class="ladder">${P.STAGES.slice().reverse().map(s => `<div class="rung ${s.n === st.n ? 'on' : s.n < st.n ? 'past' : ''}"><b>Stage ${s.n} · ${s.name}</b><span>${s.min}${s.n === 6 ? '+' : '–' + s.max}</span>${s.n === st.n ? `<div class="bar"><i style="width:${Math.min(100, (pr.rating - s.min) / (s.max + 1 - s.min) * 100)}%"></i></div>` : ''}</div>`).join('')}</div>
    <div class="tiles"><div><b>${pr.rating}</b><span>rating</span></div><div><b>${pr.n ? pct(pr) : '–'}</b><span>${pr.n} rated puzzles</span></div><div><b>${pr.best}</b><span>best streak</span></div><div><b>${pr.challenge >= 0 ? '+' : ''}${pr.challenge}</b><span>challenge</span></div>
      <div><b>${ps.w}/${ps.d}/${ps.l}</b><span>vs Stockfish W/D/L</span></div><div><b>${ps.acc && ps.acc.length ? Math.round(ps.acc.reduce((a, b) => a + b, 0) / ps.acc.length) + '%' : '–'}</b><span>play-out accuracy</span></div><div><b>${Object.keys(done).length}/${LESSONS.length}</b><span>lessons done</span></div></div>
    ${spark ? `<section class="card"><h3>Rating over time</h3>${spark}</section>` : ''}
    ${weak.length ? `<section class="card"><h3>Work on these</h3>${weak.map(([k, v]) => `<div class="wrow"><div><b>${esc(P.tname(k))}</b> <span class="muted small">${pct(v)} of ${v.n}</span></div><div class="row">${THEME_NOTES[k] ? `<button class="btn sm" data-lesson="${THEME_NOTES[k][2]}">Lesson</button>` : ''}<button class="btn sm green" data-train="${k}">Train</button></div></div>`).join('')}</section>` : '<section class="card"><p class="muted">Solve at least 3 puzzles of a theme to see your strengths and weaknesses.</p></section>'}
    ${strong.length ? `<section class="card"><h3>Your strengths</h3><p>${strong.map(([k, v]) => `${esc(P.tname(k))} <span class="muted small">${pct(v)}</span>`).join(' · ')}</p></section>` : ''}
    ${th.length ? `<section class="card"><h3>All themes</h3><table><thead><tr><th>Theme</th><th class="n">Tried</th><th class="n">Solved</th></tr></thead><tbody>${th.map(([k, v]) => `<tr><td>${esc(P.tname(k))}${P.TRICKY.includes(k) ? ' <span class="tag">tricky</span>' : ''}</td><td class="n">${v.n}</td><td class="n">${pct(v)}</td></tr>`).join('')}</tbody></table></section>` : ''}
    <section class="card"><h3>Change your stage</h3><div class="chips">${P.STAGES.map(s => `<button class="chip" data-st="${s.n}">${s.n} · ${s.name}</button>`).join('')}</div></section>`;
  $$('[data-lesson]').forEach(b => b.onclick = () => { S.lesson = b.dataset.lesson; location.hash = 'lesson'; });
  $$('[data-train]').forEach(b => b.onclick = () => { S.pzo = { src: 'lichess', angle: b.dataset.train, mode: 'new' }; set('pzo', S.pzo); S.pz = null; location.hash = 'puzzles'; });
  $$('[data-st]').forEach(b => b.onclick = () => { const s = P.STAGES[+b.dataset.st - 1], p2 = P.profile(); p2.rating = s.min + 100; p2.challenge = 0; p2.started = true; P.saveProfile(p2); header(); S.pz = null; viewProgress(); toast(`Now at Stage ${s.n} · ${s.name}`); });
}

// =====================================================================
// SETTINGS sheet
// =====================================================================
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
const CACHE = 'chessmate-v3'; // keep in sync with sw.js
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icons/crown.svg', 'docs/qr.png', 'css/app.css', 'css/pieces.css', 'js/app.js', 'js/board.js', 'js/chess.js', 'js/store.js',
  'js/engine.js', 'js/util.js', 'js/game.js', 'js/puzzles.js', 'js/lessons.js', 'js/classics.js', 'engine/stockfish-19-lite-single.js', 'engine/stockfish-19-lite-single.wasm'];
function openSheet() {
  const s = settings(), ios = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  $('#sheet').innerHTML = `<div class="sh"><div class="row sp"><h2>Settings</h2><button class="x" id="close" aria-label="Close">✕</button></div>
    <h3>Engine</h3><div class="seg" id="em">${[['auto', 'Auto', 'cloud first'], ['cloud', 'Cloud', 'saves battery'], ['device', 'Phone', 'fully offline']].map(([k, a, b]) => `<button data-v="${k}" class="${s.engineMode === k ? 'on' : ''}">${a}<small>${b}</small></button>`).join('')}</div>
    <h3>Analysis depth</h3><div class="seg" id="dp">${[12, 16, 20].map(v => `<button data-v="${v}" class="${s.depth === v ? 'on' : ''}">${v}<small>${v === 12 ? 'fast' : v === 16 ? 'balanced' : 'deep'}</small></button>`).join('')}</div>
    <h3>Install</h3>${standalone ? '<p class="muted">Installed on this device.</p>' : ios ? '<p class="muted">Safari → Share → Add to Home Screen.</p>' : `<button class="btn green" id="inst" ${installEvt ? '' : 'disabled'}>Install app on this phone</button>${installEvt ? '' : '<p class="muted small">Or use the browser menu → Install app.</p>'}`}
    <h3>Offline</h3><p class="muted small" id="offst">${P.queue().length} puzzles saved. Lessons and classic games always work offline.</p><button class="btn" id="dl">Save app + 30 puzzles for offline</button>
    <h3>Share</h3><div class="share"><img src="docs/qr.png" width="140" height="140" alt="QR code for the app"><div><p class="muted small">Scan to open on another phone.</p><button class="btn" id="copy">Copy link</button></div></div>
    <h3>Progress</h3><button class="btn ghost danger" id="reset">Reset everything</button></div>`;
  $('#sheet').hidden = false;
  $('#close').onclick = () => $('#sheet').hidden = true;
  const seg = (id, key, num) => $$(`#${id} button`).forEach(b => b.onclick = () => { set('settings', Object.assign(settings(), { [key]: num ? +b.dataset.v : b.dataset.v })); openSheet(); });
  seg('em', 'engineMode'); seg('dp', 'depth', true);
  const ib = $('#inst'); if (ib) ib.onclick = async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; openSheet(); };
  $('#dl').onclick = async () => {
    const b = $('#dl'); b.disabled = true;
    try { if ('caches' in window) { const c = await caches.open(CACHE); await c.addAll(FILES); } } catch (e) { }
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { }
    await P.fill({ ...S.pzo, mode: 'new' }, 30, () => { const e = $('#offst'); if (e) e.textContent = `Downloading… ${P.queue().length} saved`; });
    b.disabled = false; const e = $('#offst'); if (e) e.textContent = `${P.queue().length} puzzles saved. Lessons and classic games always work offline.`; toast('Saved for offline');
  };
  $('#copy').onclick = async () => { const u = location.href.split('#')[0].replace(/index\.html$/, ''); try { await navigator.clipboard.writeText(u); toast('Link copied'); } catch (e) { toast(esc(u)); } };
  $('#reset').onclick = e => { if (!e.target.dataset.arm) { e.target.dataset.arm = 1; e.target.textContent = 'Tap again to reset everything'; return; } for (const k of ['prof', 'seen', 'missed', 'attempts', 'playstats', 'lessonsDone', 'guess']) set(k, null); location.reload(); };
}

// =====================================================================
// router
// =====================================================================
const VIEWS = { puzzles: viewPuzzles, learn: viewLearn, lesson: viewLesson, masters: viewMasters, game: viewGame, play: viewPlay, progress: viewProgress };
const TAB = { lesson: 'learn', game: 'masters', play: 'puzzles' };
function route() {
  if (cleanup) { try { cleanup(); } catch (e) { } cleanup = null; }
  inst++;
  const v = (location.hash || '#puzzles').slice(1), f = VIEWS[v] || viewPuzzles, tab = TAB[v] || (VIEWS[v] ? v : 'puzzles');
  $$('#tabs a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + tab));
  try { f(); } catch (e) { console.error(e); main.innerHTML = `<section class="card"><h2>Something went wrong</h2><p class="muted">${esc(e.message)}</p></section>`; }
  window.scrollTo(0, 0); header();
}
window.addEventListener('hashchange', route);
window.addEventListener('online', () => { if ((location.hash || '#puzzles') === '#puzzles' && !S.pz) route(); });
$('#gear').onclick = openSheet;
if ('serviceWorker' in navigator) { try { navigator.serviceWorker.register('sw.js').catch(() => { }); } catch (e) { } }
route();
