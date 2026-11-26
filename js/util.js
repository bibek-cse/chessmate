// Shared chess helpers: SAN lines, move classification, game analysis.
import { Chess } from './chess.js';
import { engine, winPct, fmtScore } from './engine.js';
export { winPct, fmtScore };

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uciObj = u => u ? { from: u.slice(0, 2), to: u.slice(2, 4) } : null;
export function apply(fen, mv) { const c = new Chess(fen); try { const m = c.move(mv); return { fen: c.fen(), from: m.from, to: m.to, san: m.san, uci: m.lan }; } catch (e) { return null; } }
export const turn = fen => fen.split(' ')[1];
export function lineSan(fen, pv, max = 8) { const c = new Chess(fen), out = []; for (const u of (pv || []).slice(0, max)) { try { out.push(c.move(u).san); } catch (e) { break; } } return out; }
export function numbered(fen, sans) {
  const c = new Chess(fen); let n = c.moveNumber(), w = c.turn() === 'w', s = '';
  sans.forEach((m, i) => { if (w) s += n + '. '; else if (i === 0) s += n + '… '; s += m + ' '; if (!w) n++; w = !w; });
  return s.trim();
}
// score from the point of view of `side` ('w'|'b') as a single comparable number
export function povVal(sc, side) {
  if (!sc) return 0;
  let v = sc.mate !== undefined && sc.mate !== null ? (sc.mate > 0 ? 100000 - sc.mate * 100 : sc.mate < 0 ? -100000 - sc.mate * 100 : 0) : sc.cp;
  return side === 'w' ? v : -v;
}
export const wpFor = (sc, side) => side === 'w' ? winPct(sc) : 100 - winPct(sc);
export const CLS = { best: ['!', 'Best move', 'best'], great: ['', 'Excellent', 'good'], good: ['', 'Good', 'good'], inacc: ['?!', 'Inaccuracy', 'inacc'], mistake: ['?', 'Mistake', 'mistake'], blunder: ['??', 'Blunder', 'blunder'] };
export function classify(lossWp, isBest) { return isBest ? 'best' : lossWp < 3 ? 'great' : lossWp < 10 ? 'good' : lossWp < 20 ? 'inacc' : lossWp < 30 ? 'mistake' : 'blunder'; }
// Evaluate one move: returns {cls, lossWp, before, after, best, bestSan}
export async function judgeMove(fenBefore, uci, opts = {}) {
  const side = turn(fenBefore);
  const b = await engine.analyse(fenBefore, { multipv: 1, depth: opts.depth });
  const after = apply(fenBefore, uci); if (!after) return null;
  const st = new Chess(after.fen);
  let a;
  if (st.isCheckmate()) a = { lines: [{ mate: side === 'w' ? 1 : -1, pv: [], mated: true }] };
  else if (st.isDraw()) a = { lines: [{ cp: 0, pv: [] }] };
  else a = await engine.analyse(after.fen, { multipv: 1, depth: opts.depth });
  const bs = b.lines[0], as = a.lines[0];
  if (!bs || !as) return { cls: null };
  const lossWp = Math.max(0, wpFor(bs, side) - wpFor(as, side));
  const isBest = b.bestmove === uci || (bs.pv && bs.pv[0] === uci);
  return { cls: classify(lossWp, isBest), lossWp, before: bs, after: as, best: bs.pv && bs.pv[0], bestSan: bs.pv ? lineSan(fenBefore, bs.pv, 1)[0] : null, reply: as.pv && as.pv[0], replyLine: as.pv, src: a.source || b.source };
}
