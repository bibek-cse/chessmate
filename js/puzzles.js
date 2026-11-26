// Puzzles from the internet (Lichess + Chess.com), kept on the phone for offline play.
// Adaptive stages from 500 to 3200+.
import { Chess } from './chess.js';
import { get, set } from './store.js';

export const STAGES = [
  { n: 1, name: 'Pawn', min: 500, max: 899 },
  { n: 2, name: 'Knight', min: 900, max: 1299 },
  { n: 3, name: 'Bishop', min: 1300, max: 1699 },
  { n: 4, name: 'Rook', min: 1700, max: 2099 },
  { n: 5, name: 'Queen', min: 2100, max: 2499 },
  { n: 6, name: 'King · GM', min: 2500, max: 3300 },
];
export const stageOf = r => STAGES.find(s => r <= s.max) || STAGES[5];
export const TRICKY = ['quietMove', 'sacrifice', 'defensiveMove', 'deflection', 'intermezzo', 'zugzwang', 'xRayAttack', 'clearance',
  'interference', 'attraction', 'long', 'veryLong', 'discoveredAttack', 'capturingDefender', 'doubleCheck', 'underPromotion'];
export const ANGLES = [['', 'All themes'], ['fork', 'Fork'], ['pin', 'Pin'], ['skewer', 'Skewer'], ['discoveredAttack', 'Discovered attack'],
  ['sacrifice', 'Sacrifice'], ['quietMove', 'Quiet move'], ['defensiveMove', 'Defence'], ['deflection', 'Deflection'], ['intermezzo', 'In-between move'],
  ['zugzwang', 'Zugzwang'], ['backRankMate', 'Back-rank mate'], ['mateIn2', 'Mate in 2'], ['mateIn3', 'Mate in 3'], ['mateIn4', 'Mate in 4'],
  ['opening', 'Opening'], ['middlegame', 'Middlegame'], ['endgame', 'Endgame'], ['rookEndgame', 'Rook endgame'], ['pawnEndgame', 'Pawn endgame'],
  ['long', 'Long (3 moves)'], ['veryLong', 'Very long (4+)'], ['masterVsMaster', 'From master games'], ['superGM', 'From super-GM games']];
const NAMES = Object.fromEntries(ANGLES.filter(a => a[0]));
Object.assign(NAMES, { mate: 'Checkmate', mateIn1: 'Mate in 1', mateIn5: 'Mate in 5+', short: 'Short (2 moves)', oneMove: 'One move', advantage: 'Advantage',
  crushing: 'Crushing', equality: 'Equality', master: 'Master game', hangingPiece: 'Hanging piece', trappedPiece: 'Trapped piece',
  capturingDefender: 'Remove the defender', doubleCheck: 'Double check', promotion: 'Promotion', underPromotion: 'Under-promotion',
  kingsideAttack: 'Kingside attack', queensideAttack: 'Queenside attack', exposedKing: 'Exposed king', smotheredMate: 'Smothered mate',
  attraction: 'Attraction', clearance: 'Clearance', interference: 'Interference', xRayAttack: 'X-ray', advancedPawn: 'Advanced pawn',
  bishopEndgame: 'Bishop endgame', knightEndgame: 'Knight endgame', queenEndgame: 'Queen endgame', anastasiaMate: "Anastasia's mate",
  arabianMate: 'Arabian mate', bodenMate: "Boden's mate", dovetailMate: 'Dovetail mate', hookMate: 'Hook mate', castling: 'Castling', enPassant: 'En passant' });
export const tname = t => NAMES[t] || t.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

export function profile() { return Object.assign({ rating: 600, n: 0, streak: 0, best: 0, ok: 0, challenge: 0, themes: {}, hist: [], started: false }, get('prof', {})); }
export const saveProfile = p => set('prof', p);
export const queue = () => get('queue', []);
export const seen = () => get('seen', {});
export const target = () => { const p = profile(); return Math.max(500, Math.min(3300, p.rating + 80 + p.challenge)); };
const DIFF = r => r < 1000 ? 'easiest' : r < 1300 ? 'easier' : r < 1650 ? 'normal' : r < 1950 ? 'harder' : 'hardest';

// ---------- converters ----------
export function fromLichess(j) {
  const c = new Chess(); c.loadPgn(j.game.pgn);
  const hist = c.history({ verbose: true }), sol = j.puzzle.solution;
  for (const k of [hist.length, j.puzzle.initialPly + 1, j.puzzle.initialPly]) {
    if (k < 1 || k > hist.length) continue;
    const r = new Chess(); for (let i = 0; i < k - 1; i++) r.move(hist[i].lan);
    const fen = r.fen(); r.move(hist[k - 1].lan);
    try { r.move(sol[0]); } catch (e) { continue; }
    const g = j.game, pl = g.players || [];
    return { id: 'li_' + j.puzzle.id, src: 'lichess', fen, moves: [hist[k - 1].lan, ...sol], rating: j.puzzle.rating, themes: j.puzzle.themes,
      plays: j.puzzle.plays, clip: hist.slice(Math.max(0, k - 11), k - 1).map(m => m.lan), clipStart: (() => { const q = new Chess(); for (let i = 0; i < Math.max(0, k - 11); i++) q.move(hist[i].lan); return q.fen(); })(),
      game: { id: g.id, perf: g.perf && g.perf.name, clock: g.clock, rated: g.rated, ply: k, white: pl.find(p => p.color === 'white'), black: pl.find(p => p.color === 'black') },
      url: 'https://lichess.org/training/' + j.puzzle.id };
  }
  return null;
}
export function fromChessCom(j) {
  const c = new Chess(); c.loadPgn(j.pgn);
  const h = c.getHeaders(), fen = h.FEN || j.fen, hist = c.history({ verbose: true });
  if (!fen || !hist.length) return null;
  return { id: 'cc_' + (j.publish_time || Date.now()), src: 'chesscom', fen, moves: hist.map(m => m.lan), noSetup: true, rating: null,
    themes: [], title: j.title, url: j.url, date: j.publish_time ? new Date(j.publish_time * 1000).toISOString().slice(0, 10) : '' };
}

// ---------- fetching ----------
let blockedUntil = 0, busy = false;
export const isBusy = () => busy;
async function getJSON(url) {
  if (Date.now() < blockedUntil) throw new Error('rate-limited, retry soon');
  const r = await fetch(url);
  if (r.status === 429) { blockedUntil = Date.now() + 61000; throw new Error('rate-limited, retry in a minute'); }
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
function add(p) {
  if (!p) return false;
  const q = queue(); if (q.some(x => x.id === p.id) || seen()[p.id]) return false;
  q.push(p); set('queue', q.slice(-400)); return true;
}
export async function fetchLichess(angle) {
  const q = new URLSearchParams({ difficulty: DIFF(target()) }); if (angle) q.set('angle', angle);
  return add(fromLichess(await getJSON('https://lichess.org/api/puzzle/next?' + q)));
}
export async function fetchDaily() { const p = fromLichess(await getJSON('https://lichess.org/api/puzzle/daily')); if (p) { p.daily = true; add(p); } return p; }
export async function fetchChessCom() { const p = fromChessCom(await getJSON('https://api.chess.com/pub/puzzle/random')); add(p); return p; }

export function ready(o) {
  const s = seen();
  return queue().filter(p => !s[p.id] && (o.src === 'chesscom' ? p.src === 'chesscom' : p.src !== 'chesscom')
    && (!o.angle || p.themes.includes(o.angle)));
}
const near = o => { const t = target(); return ready(o).filter(p => !p.rating || Math.abs(p.rating - t) < 400).length; };
export async function fill(o, want = 12, onStep) {
  if (busy || navigator.onLine === false) return;
  busy = true;
  try {
    for (let i = 0; i < want * 2 && near(o) < want; i++) {
      if (o.src === 'chesscom') await fetchChessCom(); else await fetchLichess(o.angle);
      onStep && onStep();
    }
  } catch (e) { /* offline or rate-limited */ }
  busy = false; onStep && onStep();
}
export function pick(o) {
  if (o.mode === 'missed') { const m = get('missed', []); return m.length ? m[m.length - 1] : null; }
  const t = target(), list = ready(o);
  if (!list.length) return null;
  list.sort((a, b) => Math.abs((a.rating || t) - t) - Math.abs((b.rating || t) - t));
  return list[Math.floor(Math.random() * Math.min(3, list.length))];
}

// ---------- rating & review ----------
export function record(p, ok, rated) {
  const s = seen(); s[p.id] = Date.now(); set('seen', s);
  let m = get('missed', []).filter(x => x.id !== p.id);
  if (!ok) m.unshift(p); set('missed', m.slice(0, 200));
  const pr = profile(), before = stageOf(pr.rating).n;
  const att = get('attempts', []); att.push({ ok, r: p.rating, th: p.themes, t: Date.now(), rated }); set('attempts', att.slice(-2000));
  if (!rated || !p.rating) { saveProfile(pr); return { delta: null }; }
  const K = pr.n < 15 ? 60 : pr.n < 50 ? 32 : 20;
  const exp = 1 / (1 + Math.pow(10, (p.rating - pr.rating) / 400));
  const d = Math.round(K * ((ok ? 1 : 0) - exp));
  pr.rating = Math.max(500, Math.min(3300, pr.rating + d)); pr.n++; pr.ok += ok ? 1 : 0;
  pr.streak = ok ? pr.streak + 1 : 0; pr.best = Math.max(pr.best, pr.streak);
  if (ok && pr.streak % 3 === 0) pr.challenge = Math.min(300, pr.challenge + 40);
  if (!ok) pr.challenge = Math.max(-150, pr.challenge - 50);
  for (const t of p.themes) { const th = pr.themes[t] || (pr.themes[t] = { n: 0, ok: 0 }); th.n++; th.ok += ok ? 1 : 0; }
  pr.hist.push([Date.now(), pr.rating]); pr.hist = pr.hist.slice(-400);
  saveProfile(pr);
  const after = stageOf(pr.rating).n;
  return { delta: d, stageUp: after > before ? stageOf(pr.rating) : null, stageDown: after < before };
}
