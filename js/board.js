// Phone-first board: animated pieces, finger drag, tap-to-move, arrows, coloured guide squares, move badges.
import { Chess } from './chess.js';

const FILES = 'abcdefgh';
const BADGE = {
  brilliant: ['!!', 'Brilliant'], great: ['!', 'Great move'], best: ['★', 'Best move'], excellent: ['<svg viewBox="0 0 24 24"><path d="M2 21h3V10H2v11zm20-10a2 2 0 0 0-2-2h-6.3l1-4.6v-.3a1.5 1.5 0 0 0-.4-1L13.2 2 7.6 7.6c-.4.4-.6.9-.6 1.4V19a2 2 0 0 0 2 2h9c.8 0 1.5-.5 1.8-1.2l3-7.1c.1-.2.2-.5.2-.7v-1z" fill="currentColor"/></svg>', 'Excellent'],
  good: ['✓', 'Good'], book: ['<svg viewBox="0 0 24 24"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5a1.5 1.5 0 0 0 0 3H20v1H6.5A2.5 2.5 0 0 1 4 19.5v-15z" fill="currentColor"/></svg>', 'Book move'],
  inacc: ['?!', 'Inaccuracy'], mistake: ['?', 'Mistake'], blunder: ['??', 'Blunder'], miss: ['✕', 'Miss'], forced: ['→', 'Forced'],
};
export const badgeHTML = (cls, title = true) => BADGE[cls] ? `<span class="bdg b-${cls}"${title ? ` title="${BADGE[cls][1]}"` : ''}>${BADGE[cls][0]}</span>` : '';
export const badgeName = cls => BADGE[cls] ? BADGE[cls][1] : '';
let audio = null;
function tick(capture) {
  try { navigator.vibrate && navigator.vibrate(capture ? 18 : 8); } catch (e) { }
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain(); o.type = 'triangle'; o.frequency.value = capture ? 220 : 330;
    g.gain.setValueAtTime(0.0001, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.18, audio.currentTime + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.09);
    o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.1);
  } catch (e) { }
}
export function setSound(on) { try { localStorage.setItem('cm_sound', on ? '1' : '0'); } catch (e) { } }
const soundOn = () => { try { return localStorage.getItem('cm_sound') !== '0'; } catch (e) { return true; } };

export class Board {
  constructor(el, opts = {}) {
    this.el = el; this.opts = opts; this.white = true; this.fen = new Chess().fen();
    this.sel = null; this.arrows = []; this.last = null; this.interactive = true; this.marks = {}; this.tints = {}; this.badge = null;
    this.pieces = {}; // square -> {el, code}
    el.classList.add('board');
    el.innerHTML = '<div class="sqs"></div><div class="pcs"></div><svg class="arrows" viewBox="0 0 8 8"><defs>' +
      ['g', 'r', 'b', 'a'].map(c => `<marker id="ah-${c}" markerWidth="3" markerHeight="3" refX="1.6" refY="1.5" orient="auto"><path d="M0,0 L3,1.5 L0,3z" class="ah-${c}"/></marker>`).join('') +
      '</defs><g></g></svg><div class="bdgs"></div><div class="promo" hidden></div>';
    this.sqEl = el.querySelector('.sqs'); this.pcEl = el.querySelector('.pcs'); this.svg = el.querySelector('svg g');
    this.bdgEl = el.querySelector('.bdgs'); this.promo = el.querySelector('.promo');
    this.build();
    el.addEventListener('pointerdown', e => this.down(e));
    el.addEventListener('pointermove', e => this.move(e));
    el.addEventListener('pointerup', e => this.up(e));
    el.addEventListener('pointercancel', () => this.cancelDrag());
    el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !this.drag) this.hover(null); });
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  xy(sq) { const f = FILES.indexOf(sq[0]), r = +sq[1] - 1; return this.white ? [f, 7 - r] : [7 - f, r]; }
  build() {
    let h = '';
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      const f = this.white ? col : 7 - col, r = this.white ? 7 - row : row, n = FILES[f] + (r + 1);
      h += `<div class="sq ${(f + r) % 2 ? 'l' : 'd'}" data-sq="${n}">` + (col === 0 ? `<i class="rk">${r + 1}</i>` : '') + (row === 7 ? `<i class="fl">${FILES[f]}</i>` : '') + '</div>';
    }
    this.sqEl.innerHTML = h; this.cells = {}; for (const c of this.sqEl.children) this.cells[c.dataset.sq] = c;
    this.pcEl.innerHTML = ''; this.pieces = {};
  }
  flip(white) { if (white === undefined) white = !this.white; if (white !== this.white) { this.white = white; this.build(); this.render(false); } }
  set(fen, o = {}) {
    const prevFen = this.fen;
    this.fen = fen; this.last = o.last || null; this.arrows = o.arrows || []; this.marks = o.marks || {}; this.tints = o.tints || {};
    this.badge = o.badge || null; this.interactive = o.interactive !== false;
    let rebuilt = false;
    if (o.white !== undefined && o.white !== this.white) { this.white = o.white; this.build(); rebuilt = true; }
    this.sel = null;
    this.render(!rebuilt && o.animate !== false);
    if (o.sound && prevFen !== fen && soundOn()) tick(!!(o.last && o.last.captured) || /x/.test((o.last && o.last.san) || ''));
  }
  setOverlay(o = {}) { if ('tints' in o) this.tints = o.tints || {}; if ('arrows' in o) this.arrows = o.arrows || []; if ('badge' in o) this.badge = o.badge; this.renderSquares(); this.renderArrows(); this.renderBadge(); }
  render(animate = true) { this.renderSquares(); this.renderPieces(animate); this.renderArrows(); this.renderBadge(); }
  renderSquares() {
    const c = new Chess(this.fen), check = c.inCheck() ? c.turn() : null;
    const dests = this.sel ? c.moves({ square: this.sel, verbose: true }).map(m => m.to) : [];
    for (const n in this.cells) {
      const cell = this.cells[n], p = c.get(n);
      cell.classList.toggle('last', !!this.last && (this.last.from === n || this.last.to === n));
      cell.classList.toggle('sel', this.sel === n);
      cell.classList.toggle('dest', dests.includes(n) && !p);
      cell.classList.toggle('cap', dests.includes(n) && !!p);
      cell.classList.toggle('chk', !!p && p.type === 'k' && p.color === check);
      cell.dataset.mark = this.marks[n] || '';
      cell.dataset.t = this.tints[n] || '';
    }
  }
  renderPieces(animate) {
    const c = new Chess(this.fen), want = {};
    for (const row of c.board()) for (const p of row) if (p) want[p.square] = p.color + p.type;
    const old = this.pieces, keep = {}, free = [];
    for (const sq in old) { if (want[sq] === old[sq].code) keep[sq] = old[sq]; else free.push({ sq, ...old[sq] }); }
    const need = Object.keys(want).filter(sq => !keep[sq]);
    const place = (el, sq) => { const [x, y] = this.xy(sq); el.style.transform = `translate(${x * 100}%,${y * 100}%)`; };
    for (const sq of need) {
      const code = want[sq], [x, y] = this.xy(sq);
      let best = -1, bd = 99;
      free.forEach((f, i) => { if (f.code !== code || f.used) return; const [fx, fy] = this.xy(f.sq), d = Math.abs(fx - x) + Math.abs(fy - y); if (d < bd) { bd = d; best = i; } });
      let el;
      if (best >= 0 && animate) { el = free[best].el; free[best].used = true; el.classList.remove('drag'); }
      else { el = document.createElement('div'); el.className = 'pc ' + code; el.style.transition = 'none'; place(el, sq); this.pcEl.appendChild(el); void el.offsetWidth; el.style.transition = ''; }
      el.classList.remove('drag'); place(el, sq); keep[sq] = { el, code };
    }
    for (const f of free) if (!f.used) { f.el.classList.add('gone'); setTimeout(() => f.el.remove(), 160); }
    this.pieces = keep;
  }
  renderArrows() {
    this.svg.innerHTML = this.arrows.map(a => {
      const [x1, y1] = this.xy(a.from), [x2, y2] = this.xy(a.to);
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, k = (L - 0.32) / L;
      return `<line x1="${x1 + .5}" y1="${y1 + .5}" x2="${x1 + .5 + dx * k}" y2="${y1 + .5 + dy * k}" class="ar ar-${a.c || 'g'}" marker-end="url(#ah-${a.c || 'g'})"/>`;
    }).join('');
  }
  renderBadge() {
    if (!this.badge || !BADGE[this.badge.cls]) { this.bdgEl.innerHTML = ''; return; }
    const [x, y] = this.xy(this.badge.sq);
    this.bdgEl.innerHTML = `<div class="bpos" style="left:${(x + 1) * 12.5}%;top:${y * 12.5}%">${badgeHTML(this.badge.cls)}</div>`;
  }
  sqAt(e) {
    const r = this.el.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / r.width * 8), y = Math.floor((e.clientY - r.top) / r.height * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    const f = this.white ? x : 7 - x, rk = this.white ? 7 - y : y; return FILES[f] + (rk + 1);
  }
  mine(sq) { const c = new Chess(this.fen), p = c.get(sq); return p && p.color === c.turn() && (!this.opts.canMove || this.opts.canMove(p.color)); }
  down(e) {
    if (!this.interactive || !this.promo.hidden) return;
    const sq = this.sqAt(e); if (!sq) return;
    if (this.sel && sq !== this.sel && this.tryMove(this.sel, sq)) return;
    if (this.mine(sq)) {
      const changed = this.sel !== sq; this.sel = sq; this.renderSquares();
      if (changed && this.opts.onSelect) this.opts.onSelect(sq);
      const p = this.pieces[sq]; if (!p) return;
      const r = this.el.getBoundingClientRect();
      this.drag = { from: sq, el: p.el, x0: e.clientX, y0: e.clientY, moved: false, r };
      try { this.el.setPointerCapture(e.pointerId); } catch (er) { }
    } else { if (this.sel) { this.sel = null; this.renderSquares(); this.opts.onSelect && this.opts.onSelect(null); } }
  }
  move(e) {
    const d = this.drag;
    if (!d) { if (e.pointerType === 'mouse') this.hover(this.sqAt(e)); return; }
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
    d.moved = true; d.el.classList.add('drag');
    const s = d.r.width / 8, px = e.clientX - d.r.left - s / 2, py = e.clientY - d.r.top - s / 2;
    if (!d.raf) d.raf = requestAnimationFrame(() => { d.raf = 0; d.el.style.transform = `translate(${px}px,${py}px) scale(1.12)`; });
    const over = this.sqAt(e); for (const n in this.cells) this.cells[n].classList.toggle('over', n === over);
  }
  up(e) {
    const d = this.drag; this.drag = null; if (!d) return;
    if (d.raf) cancelAnimationFrame(d.raf);
    for (const n in this.cells) this.cells[n].classList.remove('over');
    if (!d.moved) return;
    const sq = this.sqAt(e);
    d.el.classList.remove('drag');
    if (!sq || sq === d.from || !this.tryMove(d.from, sq)) { const [x, y] = this.xy(d.from); d.el.style.transform = `translate(${x * 100}%,${y * 100}%)`; }
  }
  cancelDrag() { const d = this.drag; this.drag = null; if (d) { d.el.classList.remove('drag'); const [x, y] = this.xy(d.from); d.el.style.transform = `translate(${x * 100}%,${y * 100}%)`; } }
  hover(sq) { if (sq === this.hov) return; this.hov = sq; if (this.opts.onHover && this.interactive) this.opts.onHover(sq && this.mine(sq) ? sq : null); }
  tryMove(from, to) {
    const c = new Chess(this.fen);
    const ms = c.moves({ square: from, verbose: true }).filter(m => m.to === to);
    if (!ms.length) return false;
    if (ms.length > 1 || ms[0].promotion) { this.askPromo(from, to, c.turn()); return true; }
    this.sel = null; this.opts.onSelect && this.opts.onSelect(null);
    this.opts.onMove && this.opts.onMove({ from, to });
    return true;
  }
  askPromo(from, to, color) {
    this.promo.hidden = false;
    this.promo.innerHTML = ['q', 'r', 'b', 'n'].map(t => `<button class="pp ${color}${t}" data-t="${t}" aria-label="${t}"></button>`).join('');
    this.promo.onclick = e => {
      const t = e.target.dataset.t; this.promo.hidden = true; this.sel = null;
      if (t) this.opts.onMove && this.opts.onMove({ from, to, promotion: t }); else this.render(false);
    };
  }
}
