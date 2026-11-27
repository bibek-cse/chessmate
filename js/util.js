// Shared chess helpers: SAN lines, chess.com-style move classification, safety checks.
import { Chess } from './chess.js';
import { engine, winPct, fmtScore } from './engine.js';
import { bookName } from './book.js';
export { winPct, fmtScore, bookName };

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uciObj = u => u ? { from: u.slice(0, 2), to: u.slice(2, 4) } : null;
export function apply(fen, mv) { const c = new Chess(fen); try { const m = c.move(mv); return { fen: c.fen(), from: m.from, to: m.to, san: m.san, uci: m.lan, captured: m.captured }; } catch (e) { return null; } }
export const turn = fen => fen.split(' ')[1];
export function lineSan(fen, pv, max = 8) { const c = new Chess(fen), out = []; for (const u of (pv || []).slice(0, max)) { try { out.push(c.move(u).san); } catch (e) { break; } } return out; }
export function numbered(fen, sans) {
  const c = new Chess(fen); let n = c.moveNumber(), w = c.turn() === 'w', s = '';
  sans.forEach((m, i) => { if (w) s += n + '. '; else if (i === 0) s += n + '… '; s += m + ' '; if (!w) n++; w = !w; });
  return s.trim();
}
export function povVal(sc, side) {
  if (!sc) return 0;
  let v = sc.mate !== undefined && sc.mate !== null ? (sc.mate > 0 ? 100000 - sc.mate * 100 : sc.mate < 0 ? -100000 - sc.mate * 100 : 0) : sc.cp;
  return side === 'w' ? v : -v;
}
export const wpFor = (sc, side) => side === 'w' ? winPct(sc) : 100 - winPct(sc);

// [symbol, label, colour class] — the badge itself is drawn by board.js badgeHTML()
export const CLS = {
  brilliant: ['!!', 'Brilliant', 'brilliant'], great: ['!', 'Great move', 'great'], best: ['★', 'Best move', 'best'], excellent: ['👍', 'Excellent', 'excellent'],
  good: ['✓', 'Good', 'good'], book: ['📖', 'Book move', 'book'], forced: ['→', 'Forced', 'forced'],
  inacc: ['?!', 'Inaccuracy', 'inacc'], mistake: ['?', 'Mistake', 'mistake'], blunder: ['??', 'Blunder', 'blunder'],
};

// ---------- static safety (instant, no engine) ----------
export const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
// Can the opponent win the piece standing on `sq` (owned by `owner`)?
export function enPrise(c, sq, owner) {
  const p = c.get(sq); if (!p || p.type === 'k') return false;
  const opp = owner === 'w' ? 'b' : 'w', att = c.attackers(sq, opp); if (!att.length) return false;
  const def = c.attackers(sq, owner); if (!def.length) return true;
  const cheap = att.filter(s => c.get(s).type !== 'k').map(s => VAL[c.get(s).type]);
  return cheap.length > 0 && Math.min(...cheap) < VAL[p.type];
}
export function hangingSquares(fen, owner) {
  const c = new Chess(fen), out = [];
  for (const row of c.board()) for (const p of row) if (p && p.color === owner && p.type !== 'p' && p.type !== 'k' && enPrise(c, p.square, owner)) out.push(p.square);
  return out;
}
// A real material sacrifice: the moved piece (or another piece) is left en prise, worth ≥ 2 more than what was taken.
export function isSacrifice(fenBefore, uci) {
  const side = turn(fenBefore), b = new Chess(fenBefore), a = new Chess(fenBefore);
  let m; try { m = a.move(uci); } catch (e) { return false; }
  const to = uci.slice(2, 4), moved = VAL[m.promotion || m.piece], taken = m.captured ? VAL[m.captured] : 0;
  if (moved >= 3 && enPrise(a, to, side) && moved - taken >= 2) return true;
  for (const row of a.board()) for (const p of row) {
    if (!p || p.color !== side || VAL[p.type] < 3 || p.square === to) continue;
    if (enPrise(a, p.square, side) && !enPrise(b, p.square, side) && VAL[p.type] - taken >= 2) return true;
  }
  return false;
}
export function classify({ lossWp, isBest, book, sac, onlyMove, wpAfter, forced }) {
  if (forced) return 'forced';
  if (book && lossWp < 8) return 'book';
  if ((isBest || lossWp < 2) && sac && wpAfter >= 50) return 'brilliant';
  if (isBest && onlyMove && wpAfter >= 40) return 'great';
  if (isBest) return 'best';
  return lossWp < 2 ? 'excellent' : lossWp < 5 ? 'good' : lossWp < 10 ? 'inacc' : lossWp < 20 ? 'mistake' : 'blunder';
}
// Evaluate one move with the engine: {cls, lossWp, before, after, best, bestSan, reply, replyLine, opening}
export async function judgeMove(fenBefore, uci, opts = {}) {
  const side = turn(fenBefore), after = apply(fenBefore, uci); if (!after) return null;
  const opening = bookName(after.fen), book = !!opening && !!bookName(fenBefore);
  const legal = new Chess(fenBefore).moves().length;
  const b = await engine.analyse(fenBefore, { multipv: 2, depth: opts.depth });
  const st = new Chess(after.fen);
  let a;
  if (st.isCheckmate()) a = { lines: [{ mate: side === 'w' ? 1 : -1, pv: [], mated: true }] };
  else if (st.isDraw()) a = { lines: [{ cp: 0, pv: [] }] };
  else a = await engine.analyse(after.fen, { multipv: 1, depth: opts.depth });
  const bs = b.lines[0], second = b.lines[1], as = a.lines[0];
  if (!bs || !as) return { cls: book ? 'book' : null, opening };
  const lossWp = Math.max(0, wpFor(bs, side) - wpFor(as, side));
  const isBest = (bs.pv && bs.pv[0] === uci) || (as.mated === true);
  const onlyMove = !!second && wpFor(bs, side) - wpFor(second, side) >= 15;
  const cls = classify({ lossWp, isBest, book, sac: isSacrifice(fenBefore, uci), onlyMove, wpAfter: wpFor(as, side), forced: legal === 1 });
  return { cls, lossWp, before: bs, after: as, best: bs.pv && bs.pv[0], bestSan: bs.pv ? lineSan(fenBefore, bs.pv, 1)[0] : null,
    reply: as.pv && as.pv[0], replyLine: as.pv, src: a.source || b.source, opening };
}
// Classification from a finished game analysis (no second line available → no "great").
export function quickClass(fenBefore, uci, evBefore, evAfter, bestUci, evNext) {
  const side = turn(fenBefore), after = apply(fenBefore, uci);
  // Shallow searches can miss a forced line; if the opponent then played the engine's best reply, trust the deeper-looking next eval.
  if (evNext && evNext.mate !== 0 && evAfter && evAfter.mate !== 0 && wpFor(evNext, side) > wpFor(evAfter, side)) evAfter = evNext;
  const book = !!(after && bookName(after.fen) && bookName(fenBefore));
  const wpB = evBefore && evBefore.mate === 0 ? 50 : wpFor(evBefore, side);
  const wpA = evAfter && evAfter.mate === 0 ? (evAfter.side === (side === 'w' ? 1 : -1) ? 100 : 0) : wpFor(evAfter, side);
  const lossWp = Math.max(0, wpB - wpA);
  return classify({ lossWp, isBest: bestUci === uci || (evAfter && evAfter.mate === 0), book, sac: isSacrifice(fenBefore, uci), wpAfter: wpA, forced: new Chess(fenBefore).moves().length === 1 });
}
