// Lightweight board: tap-to-move or press-drag-release, arrows, highlights, promotion picker.
import { Chess } from './chess.js';

const FILES = 'abcdefgh';
const sqName = (f, r) => FILES[f] + (r + 1);
const xy = (sq, white) => { const f = FILES.indexOf(sq[0]), r = +sq[1] - 1; return white ? [f, 7 - r] : [7 - f, r]; };

export class Board {
  constructor(el, opts = {}) {
    this.el = el; this.opts = opts; this.white = true; this.fen = new Chess().fen();
    this.sel = null; this.arrows = []; this.last = null; this.interactive = true; this.marks = {};
    el.classList.add('board');
    el.innerHTML = '<div class="sqs"></div><svg class="arrows" viewBox="0 0 8 8"><defs>' +
      ['g', 'r', 'b', 'a'].map(c => `<marker id="ah-${c}" markerWidth="3" markerHeight="3" refX="1.6" refY="1.5" orient="auto"><path d="M0,0 L3,1.5 L0,3z" class="ah-${c}"/></marker>`).join('') +
      '</defs><g></g></svg><div class="promo" hidden></div>';
    this.sqEl = el.firstChild; this.svg = el.querySelector('svg g'); this.promo = el.querySelector('.promo');
    this.build();
    el.addEventListener('pointerdown', e => this.down(e));
    el.addEventListener('pointerup', e => this.up(e));
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  build() {
    let h = '';
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      const f = this.white ? col : 7 - col, r = this.white ? 7 - row : row, n = sqName(f, r);
      const light = (f + r) % 2 === 1;
      h += `<div class="sq ${light ? 'l' : 'd'}" data-sq="${n}">` +
        (col === 0 ? `<i class="rk">${r + 1}</i>` : '') + (row === 7 ? `<i class="fl">${FILES[f]}</i>` : '') + '</div>';
    }
    this.sqEl.innerHTML = h;
    this.cells = {}; for (const c of this.sqEl.children) this.cells[c.dataset.sq] = c;
    this.drawn = {};
  }
  flip(white) { if (white === undefined) white = !this.white; if (white !== this.white) { this.white = white; this.build(); this.render(); } }
  set(fen, o = {}) {
    this.fen = fen; this.last = o.last || null; this.arrows = o.arrows || [];
    this.interactive = o.interactive !== false; this.marks = o.marks || {};
    if (o.white !== undefined && o.white !== this.white) { this.white = o.white; this.build(); }
    this.sel = null; this.render();
  }
  render() {
    const c = new Chess(this.fen), b = c.board(), check = c.inCheck() ? c.turn() : null;
    const dests = this.sel ? c.moves({ square: this.sel, verbose: true }).map(m => m.to) : [];
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const n = sqName(f, r), p = b[7 - r][f], cell = this.cells[n];
      const pc = p ? p.color + p.type : '';
      if (this.drawn[n] !== pc) { this.drawn[n] = pc; const old = cell.querySelector('.pc'); old && old.remove(); if (pc) cell.insertAdjacentHTML('beforeend', `<div class="pc ${pc}"></div>`); }
      cell.classList.toggle('last', !!this.last && (this.last.from === n || this.last.to === n));
      cell.classList.toggle('sel', this.sel === n);
      cell.classList.toggle('dest', dests.includes(n) && !p);
      cell.classList.toggle('cap', dests.includes(n) && !!p);
      cell.classList.toggle('chk', !!p && p.type === 'k' && p.color === check);
      cell.dataset.mark = this.marks[n] || '';
    }
    this.svg.innerHTML = this.arrows.map(a => {
      const [x1, y1] = xy(a.from, this.white), [x2, y2] = xy(a.to, this.white);
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, k = (L - 0.32) / L;
      return `<line x1="${x1 + .5}" y1="${y1 + .5}" x2="${x1 + .5 + dx * k}" y2="${y1 + .5 + dy * k}" class="ar ar-${a.c || 'g'}" marker-end="url(#ah-${a.c || 'g'})"/>`;
    }).join('');
  }
  sqAt(e) { const t = document.elementFromPoint(e.clientX, e.clientY); const c = t && t.closest('.sq'); return c && this.el.contains(c) ? c.dataset.sq : null; }
  down(e) {
    if (!this.interactive || !this.promo.hidden) return;
    const sq = this.sqAt(e); if (!sq) return;
    const c = new Chess(this.fen);
    if (this.sel && this.tryMove(this.sel, sq)) return;
    const p = c.get(sq);
    this.sel = p && p.color === c.turn() && (!this.opts.canMove || this.opts.canMove(p.color)) ? sq : null;
    this.pressed = this.sel; this.render();
  }
  up(e) {
    if (!this.pressed) return; const sq = this.sqAt(e), from = this.pressed; this.pressed = null;
    if (sq && sq !== from) this.tryMove(from, sq);
  }
  tryMove(from, to) {
    const c = new Chess(this.fen);
    const ms = c.moves({ square: from, verbose: true }).filter(m => m.to === to);
    if (!ms.length) return false;
    if (ms.length > 1 || ms[0].promotion) { this.askPromo(from, to, c.turn()); return true; }
    this.sel = null; this.opts.onMove && this.opts.onMove({ from, to });
    return true;
  }
  askPromo(from, to, color) {
    this.promo.hidden = false;
    this.promo.innerHTML = ['q', 'r', 'b', 'n'].map(t => `<button class="pc ${color}${t}" data-t="${t}" aria-label="${t}"></button>`).join('');
    this.promo.onclick = e => {
      const t = e.target.dataset.t; this.promo.hidden = true; this.sel = null;
      if (t) this.opts.onMove && this.opts.onMove({ from, to, promotion: t }); else this.render();
    };
  }
}
