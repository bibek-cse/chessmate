// Puzzle pool (offline pack + puzzles downloaded when online), adaptive selection, ratings, retry queue.
import { Chess } from './chess.js';
import { get, set, profile, saveProfile } from './store.js';

export const TRICKY = ['quietMove', 'sacrifice', 'defensiveMove', 'deflection', 'intermezzo', 'zugzwang', 'underPromotion',
  'xRayAttack', 'clearance', 'interference', 'attraction', 'long', 'veryLong', 'discoveredAttack', 'capturingDefender',
  'trappedPiece', 'doubleCheck', 'exposedKing', 'equality', 'advantage'];
export const THEME_NAMES = { mate: 'Checkmate', mateIn1: 'Mate in 1', mateIn2: 'Mate in 2', mateIn3: 'Mate in 3', mateIn4: 'Mate in 4',
  fork: 'Fork', pin: 'Pin', skewer: 'Skewer', sacrifice: 'Sacrifice', quietMove: 'Quiet move', defensiveMove: 'Defence',
  deflection: 'Deflection', intermezzo: 'In-between move', zugzwang: 'Zugzwang', discoveredAttack: 'Discovered attack',
  endgame: 'Endgame', middlegame: 'Middlegame', opening: 'Opening', long: 'Long (3 moves)', veryLong: 'Very long (4+)',
  short: 'Short (2 moves)', oneMove: 'One move', promotion: 'Promotion', underPromotion: 'Under-promotion', check: 'Starts with check',
  hangingPiece: 'Hanging piece', backRankMate: 'Back-rank mate', attraction: 'Attraction', clearance: 'Clearance',
  trappedPiece: 'Trapped piece', crushing: 'Crushing', personal: 'From your games' };
export const tname = t => THEME_NAMES[t] || t.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
export const isTricky = p => p.themes.some(t => TRICKY.includes(t));

let pack = [];
export async function loadPack() {
  try { const r = await fetch('data/puzzles.json'); pack = await r.json(); } catch (e) { pack = []; }
  return pack.length;
}
export const pool = () => pack.concat(get('pool', []));
export const solved = () => get('solved', {});

// rating band for the 500–3200 scale
export function band(r) {
  return r < 1000 ? 'Foundations' : r < 1400 ? 'Developing' : r < 1800 ? 'Intermediate' : r < 2200 ? 'Advanced' : r < 2600 ? 'Expert' : 'Master';
}

export function pick({ mode = 'adaptive', theme = null } = {}) {
  const pr = profile(), seen = solved(), now = Date.now();
  if (mode === 'retry') {
    const due = get('retry', []).filter(x => x.due <= now);
    if (!due.length) return null;
    const all = pool().concat(get('mistakes', []));
    return all.find(p => p.id === due[0].id) || null;
  }
  if (mode === 'mistakes') {
    const m = get('mistakes', []).filter(p => !(seen[p.id] && seen[p.id].ok >= 2));
    return m.length ? m[Math.floor(Math.random() * Math.min(5, m.length))] : null;
  }
  let list = pool().filter(p => !seen[p.id] || (now - seen[p.id].t > 30 * 864e5));
  if (mode === 'tricky') list = list.filter(isTricky);
  if (theme) list = list.filter(p => p.themes.includes(theme));
  if (!list.length) return null;
  const target = pr.rating + pr.challenge + (mode === 'tricky' ? 100 : 0);
  list.sort((a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target));
  return list[Math.floor(Math.random() * Math.min(8, list.length))];
}

// Elo-style rating with a larger K while the rating is still settling. Clamped to 500–3200.
export function record(p, ok, ms, rated) {
  const pr = profile(), s = solved();
  s[p.id] = { t: Date.now(), ok: ((s[p.id] && s[p.id].ok) || 0) + (ok ? 1 : 0) }; set('solved', s);
  const att = get('attempts', []); att.push({ id: p.id, ok, ms, r: p.rating, th: p.themes, rated, t: Date.now() });
  set('attempts', att.slice(-3000));
  let delta = 0;
  if (rated) {
    const K = pr.n < 20 ? 48 : pr.n < 60 ? 32 : 20;
    const exp = 1 / (1 + Math.pow(10, (p.rating - pr.rating) / 400));
    delta = Math.round(K * ((ok ? 1 : 0) - exp));
    pr.rating = Math.max(500, Math.min(3200, pr.rating + delta)); pr.n++;
    pr.hist.push([Date.now(), pr.rating]); pr.hist = pr.hist.slice(-300);
    for (const t of p.themes) {
      const th = pr.themes[t] || (pr.themes[t] = { n: 0, ok: 0, r: 1200 });
      const e = 1 / (1 + Math.pow(10, (p.rating - th.r) / 400));
      th.n++; th.ok += ok ? 1 : 0; th.r = Math.max(500, Math.min(3200, Math.round(th.r + 32 * ((ok ? 1 : 0) - e))));
    }
    // challenge ladder: harder after a streak, easier after a miss
    if (ok) { pr.streak++; if (pr.streak % 3 === 0) pr.challenge = Math.min(400, pr.challenge + 40); }
    else { pr.streak = 0; pr.challenge = Math.max(-200, pr.challenge - 60); }
  }
  saveProfile(pr);
  // spaced repetition: failed puzzles return after 1, 3, 7, 21 days
  let q = get('retry', []); const i = q.findIndex(x => x.id === p.id);
  if (!ok) { const step = 0; if (i >= 0) q[i] = { id: p.id, due: Date.now() + 864e5, step }; else q.push({ id: p.id, due: Date.now() + 864e5, step }); }
  else if (i >= 0) { const st = q[i].step + 1; if (st >= 4) q.splice(i, 1); else q[i] = { id: p.id, due: Date.now() + [1, 3, 7, 21][st] * 864e5, step: st }; }
  set('retry', q);
  return delta;
}

// ---------- online updates (Lichess open puzzle API) ----------
export function fromLichess(j) {
  const c = new Chess(); c.loadPgn(j.game.pgn);
  const hist = c.history({ verbose: true }), sol = j.puzzle.solution;
  const tries = [hist.length, j.puzzle.initialPly + 1, j.puzzle.initialPly];
  for (const k of tries) {
    if (k < 1 || k > hist.length) continue;
    const r = new Chess(); for (let i = 0; i < k - 1; i++) r.move(hist[i].lan);
    const fen = r.fen(); r.move(hist[k - 1].lan);
    try { r.move(sol[0]); } catch (e) { continue; }
    return { id: 'li_' + j.puzzle.id, fen, moves: [hist[k - 1].lan, ...sol], rating: j.puzzle.rating, themes: j.puzzle.themes, src: 'lichess' };
  }
  return null;
}
function addToPool(ps) {
  const cur = get('pool', []), ids = new Set(cur.map(p => p.id).concat(pack.map(p => p.id)));
  const add = ps.filter(p => p && !ids.has(p.id));
  set('pool', cur.concat(add).slice(-2500));
  return add.length;
}
export async function fetchDaily() {
  const r = await fetch('https://lichess.org/api/puzzle/daily');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const p = fromLichess(await r.json()); if (p) { p.daily = true; addToPool([p]); }
  return p;
}
const DIFF = r => r < 1100 ? 'easiest' : r < 1400 ? 'easier' : r < 1800 ? 'normal' : r < 2200 ? 'harder' : 'hardest';
export async function fetchMore(n = 10, angle = null, onStep) {
  const pr = profile(), got = [];
  for (let i = 0; i < n; i++) {
    const q = new URLSearchParams({ difficulty: DIFF(pr.rating + pr.challenge) }); if (angle) q.set('angle', angle);
    const r = await fetch('https://lichess.org/api/puzzle/next?' + q);
    if (r.status === 429) break;
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const p = fromLichess(await r.json()); if (p) got.push(p);
    onStep && onStep(i + 1, n);
  }
  const added = addToPool(got); set('lastUpdate', Date.now());
  return added;
}
