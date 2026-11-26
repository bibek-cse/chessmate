// Game records, PGN, analysis, move classification, critical moments, simple verified notes.
import { Chess, DEFAULT_POSITION } from './chess.js';
import { engine, winPct } from './engine.js';
import { uid } from './store.js';

export const START = DEFAULT_POSITION;
export const fenAt = (g, ply) => ply === 0 ? g.startFen : g.moves[ply - 1].fen;
export function applyMove(fen, mv) {
  const c = new Chess(fen);
  try { const m = c.move(mv); return { san: m.san, uci: m.lan, fen: c.fen(), from: m.from, to: m.to }; } catch (e) { return null; }
}
export function status(fen) {
  const c = new Chess(fen);
  if (c.isCheckmate()) return { over: true, result: c.turn() === 'w' ? '0-1' : '1-0', text: 'Checkmate' };
  if (c.isStalemate()) return { over: true, result: '1/2-1/2', text: 'Stalemate' };
  if (c.isInsufficientMaterial()) return { over: true, result: '1/2-1/2', text: 'Insufficient material' };
  if (c.isDrawByFiftyMoves()) return { over: true, result: '1/2-1/2', text: '50-move rule' };
  return { over: false };
}
export function threefold(g, ply) {
  const k = f => f.split(' ').slice(0, 4).join(' '), t = k(fenAt(g, ply)); let n = 0;
  for (let i = 0; i <= ply; i++) if (k(fenAt(g, i)) === t) n++;
  return n >= 3;
}
export function newGame(o) {
  return Object.assign({ id: uid(), date: new Date().toISOString().slice(0, 10), startFen: START, moves: [], result: '*',
    source: 'played', branches: [], assisted: false, white: 'You', black: 'Stockfish' }, o);
}
export function gamesFromPgn(text, me) {
  const parts = text.replace(/\r/g, '').split(/\n(?=\[Event )/).filter(s => s.trim());
  const out = [];
  for (const p of parts) {
    const c = new Chess();
    try { c.loadPgn(p); } catch (e) { continue; }
    const h = c.getHeaders(), hist = c.history({ verbose: true });
    if (!hist.length) continue;
    const startFen = h.FEN || START, r = new Chess(startFen), moves = [];
    for (const m of hist) { r.move(m.lan); moves.push({ san: m.san, uci: m.lan, fen: r.fen() }); }
    const lw = (me || '').toLowerCase();
    out.push(newGame({ source: 'imported', startFen, moves, white: h.White || 'White', black: h.Black || 'Black',
      result: h.Result || '*', date: ((h.UTCDate || h.Date || '').includes('?') ? '' : (h.UTCDate || h.Date || '').replace(/\./g, '-')) || undefined,
      userColor: lw && (h.White || '').toLowerCase() === lw ? 'w' : lw && (h.Black || '').toLowerCase() === lw ? 'b' : null,
      event: h.Event || '', round: h.Round || '', welo: h.WhiteElo || '', belo: h.BlackElo || '', site: h.Site || '', link: h.Link || '' }));
  }
  return out;
}
export function pgnOf(g) {
  const c = new Chess(g.startFen);
  c.setHeader('Event', g.source === 'replay' ? 'ChessMate replay' : 'ChessMate');
  c.setHeader('White', g.white); c.setHeader('Black', g.black); c.setHeader('Result', g.result || '*');
  if (g.startFen !== START) { c.setHeader('SetUp', '1'); c.setHeader('FEN', g.startFen); }
  for (const m of g.moves) c.move(m.uci);
  return c.pgn();
}

// ---------- analysis ----------
export async function analyseGame(g, onProgress, isCancelled) {
  const n = g.moves.length, evals = [], best = [], depth = engine.settings.gameDepth || 12;
  let cloud = 0;
  for (let p = 0; p <= n; p++) {
    if (isCancelled && isCancelled()) return null;
    const fen = fenAt(g, p), st = status(fen);
    if (st.over) { evals.push(st.text === 'Checkmate' ? { mate: 0, side: st.result === '1-0' ? 1 : -1 } : { cp: 0 }); best.push(null); }
    else {
      const r = await engine.analyse(fen, { depth, multipv: 1 });
      if (r.source === 'cloud') cloud++;
      const l = r.lines[0] || { cp: 0 };
      evals.push(l.mate !== undefined && l.mate !== null ? { mate: l.mate } : { cp: l.cp || 0 });
      best.push(r.bestmove || (l.pv && l.pv[0]) || null);
    }
    onProgress && onProgress(p, n);
  }
  g.analysis = { depth, evals, best, cloud, date: Date.now() };
  return g.analysis;
}
const wpOf = e => e && e.mate === 0 ? (e.side > 0 ? 100 : 0) : winPct(e);
export function moveReport(g) {
  const a = g.analysis; if (!a) return null;
  const rows = [];
  for (let i = 0; i < g.moves.length; i++) {
    const white = new Chess(fenAt(g, i)).turn() === 'w';
    const before = wpOf(a.evals[i]), after = wpOf(a.evals[i + 1]);
    const loss = Math.max(0, white ? before - after : after - before);
    const acc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
    const isBest = a.best[i] === g.moves[i].uci;
    const cls = isBest ? 'best' : loss >= 30 ? 'blunder' : loss >= 20 ? 'mistake' : loss >= 10 ? 'inacc' : 'good';
    rows.push({ ply: i, white, loss, acc, cls, swing: Math.abs(after - before), best: a.best[i] });
  }
  const side = c => { const r = rows.filter(x => x.white === (c === 'w')); return r.length ? r.reduce((s, x) => s + x.acc, 0) / r.length : null; };
  const count = (c, k) => rows.filter(x => x.white === (c === 'w') && x.cls === k).length;
  const critical = rows.filter(r => r.swing >= 18 || r.cls === 'blunder' || r.cls === 'mistake')
    .sort((x, y) => y.swing - x.swing).slice(0, 6).sort((x, y) => x.ply - y.ply);
  return { rows, acc: { w: side('w'), b: side('b') }, count, critical };
}

// Short notes that are checked by the rules engine, not guessed.
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export function hanging(fen) {
  const c = new Chess(fen), side = c.turn() === 'w' ? 'b' : 'w', out = [];
  for (const row of c.board()) for (const p of row) {
    if (!p || p.color !== side || p.type === 'k' || p.type === 'p') continue;
    const att = c.attackers(p.square, c.turn()), def = c.attackers(p.square, side);
    const cheap = att.filter(s => c.get(s).type !== 'k').map(s => VAL[c.get(s).type]);
    if (att.length && (!def.length || (cheap.length && Math.min(...cheap) < VAL[p.type]))) out.push(p.square);
  }
  return out; // pieces of the side that just moved that the side to move can win
}
export function lineSan(fen, pv, max = 8) {
  const c = new Chess(fen), out = [];
  for (const u of pv.slice(0, max)) { try { const m = c.move(u); out.push(m.san); } catch (e) { break; } }
  return out;
}
export function numbered(fen, sans) {
  const c = new Chess(fen); let n = c.moveNumber(), w = c.turn() === 'w', s = '';
  sans.forEach((m, i) => { if (w) s += n + '. '; else if (i === 0) s += n + '… '; s += m + ' '; if (!w) n++; w = !w; });
  return s.trim();
}
