// Hybrid engine: Lichess cloud eval first (saves phone battery), on-device Stockfish 19 lite as fallback.
// All scores returned are from WHITE's point of view: {cp} or {mate}.
import { get, set } from './store.js';

const ENGINE_URL = 'engine/stockfish-19-lite-single.js';

export const winPct = s => {
  if (!s) return 50;
  if (s.mate !== undefined && s.mate !== null) return s.mate > 0 ? 100 : s.mate < 0 ? 0 : 50;
  const cp = Math.max(-1500, Math.min(1500, s.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
};
export const fmtScore = s => {
  if (!s) return '–';
  if (s.mate !== undefined && s.mate !== null) return (s.mate > 0 ? '#' : '#-') + Math.abs(s.mate);
  const v = s.cp / 100; return (v > 0 ? '+' : '') + v.toFixed(1);
};
const posKey = fen => fen.split(' ').slice(0, 4).join(' ');

// ---------- on-device Stockfish (one shared worker, jobs run one at a time) ----------
class Local {
  constructor() { this.w = null; this.boot = null; this.onLine = null; this.chain = Promise.resolve(); this.busy = false; }
  start() {
    if (this.boot) return this.boot;
    this.boot = new Promise((ok, bad) => {
      try { this.w = new Worker(ENGINE_URL); } catch (e) { bad(e); return; }
      this.w.onerror = e => bad(e);
      this.w.onmessage = e => { const l = String(e.data); if (this.onLine) this.onLine(l); };
      let stage = 0;
      this.onLine = l => {
        if (stage === 0 && l === 'uciok') { stage = 1; this.send('setoption name Hash value 16'); this.send('isready'); }
        else if (stage === 1 && l === 'readyok') { this.onLine = null; ok(); }
      };
      this.send('uci');
    });
    return this.boot;
  }
  send(c) { this.w && this.w.postMessage(c); }
  stop() { if (this.busy) this.send('stop'); }
  run(fen, o = {}, onInfo) {
    const job = () => new Promise(res => {
      const black = fen.split(' ')[1] === 'b', lines = {};
      const snap = () => Object.keys(lines).sort((a, b) => a - b).map(k => lines[k]);
      this.onLine = l => {
        if (l.startsWith('info') && l.includes(' pv ') && !l.includes('bound')) {
          const mp = +(l.match(/ multipv (\d+)/) || [0, 1])[1];
          const sc = l.match(/ score (cp|mate) (-?\d+)/); if (!sc) return;
          let v = +sc[2]; if (black) v = -v;
          lines[mp] = { multipv: mp, depth: +(l.match(/ depth (\d+)/) || [0, 0])[1], [sc[1]]: v,
            nps: +(l.match(/ nps (\d+)/) || [0, 0])[1], pv: l.split(' pv ')[1].trim().split(' ') };
          onInfo && onInfo({ lines: snap(), source: 'device' });
        } else if (l.startsWith('bestmove')) {
          this.onLine = null; this.busy = false;
          const lt = snap();
          res({ bestmove: l.split(' ')[1], lines: lt, depth: lt[0] ? lt[0].depth : 0, source: 'device' });
        }
      };
      this.busy = true;
      const lim = o.elo && o.elo >= 1320 && o.elo < 3200;
      this.send('setoption name MultiPV value ' + (o.multipv || 1));
      this.send('setoption name Skill Level value ' + (o.skill ?? 20));
      this.send('setoption name UCI_LimitStrength value ' + (lim ? 'true' : 'false'));
      if (lim) this.send('setoption name UCI_Elo value ' + Math.min(3190, o.elo));
      this.send('position fen ' + fen);
      this.send(o.infinite ? 'go infinite' : o.movetime ? 'go movetime ' + o.movetime : 'go depth ' + (o.depth || 14));
    });
    const p = this.chain.then(() => this.start()).then(job);
    this.chain = p.catch(() => {});
    return p;
  }
}

// ---------- hybrid front door ----------
class Engine {
  constructor() {
    this.local = new Local();
    this.cache = new Map(Object.entries(get('evalcache', {})));
    this.cloudChain = Promise.resolve(); this.cloudBlockedUntil = 0; this.cloudOk = null;
    this.lastSource = '';
    this._saveT = 0;
  }
  get settings() { return get('settings', { engineMode: 'auto', depth: 14, gameDepth: 12 }); }
  online() { return navigator.onLine !== false; }
  _remember(key, r) {
    this.cache.set(key, r);
    if (this.cache.size > 1500) this.cache.delete(this.cache.keys().next().value);
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => set('evalcache', Object.fromEntries(this.cache)), 1500);
  }
  cloud(fen, multipv) {
    if (!this.online() || Date.now() < this.cloudBlockedUntil) return Promise.resolve(null);
    const p = this.cloudChain.then(async () => {
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
        const r = await fetch('https://lichess.org/api/cloud-eval?multiPv=' + multipv + '&fen=' + encodeURIComponent(fen), { signal: ctl.signal });
        clearTimeout(t);
        if (r.status === 429) { this.cloudBlockedUntil = Date.now() + 60000; return null; }
        this.cloudOk = true;
        if (!r.ok) return null; // position not in the cloud database
        const j = await r.json();
        const lines = (j.pvs || []).map((p, i) => ({ multipv: i + 1, depth: j.depth, cp: p.cp, mate: p.mate, pv: p.moves.split(' ') }));
        if (!lines.length) return null;
        return { bestmove: lines[0].pv[0], lines, depth: j.depth, source: 'cloud' };
      } catch (e) { this.cloudOk = false; this.cloudBlockedUntil = Date.now() + 30000; return null; }
    });
    this.cloudChain = p.catch(() => {});
    return p;
  }
  // Analyse a position. opts: {depth, multipv, mode, infinite, onInfo, noCloud}
  async analyse(fen, opts = {}) {
    const s = this.settings, mode = opts.mode || s.engineMode, mp = opts.multipv || 1;
    const depth = opts.depth || s.depth, key = posKey(fen) + '|' + mp;
    const c = this.cache.get(key);
    if (c && !opts.infinite && c.depth >= depth) { this.lastSource = c.source; return { ...c, cached: true }; }
    if (mode !== 'device' && !opts.noCloud && !opts.infinite) {
      const r = await this.cloud(fen, mp);
      if (r) { this._remember(key, r); this.lastSource = 'cloud'; return r; }
      if (mode === 'cloud') return { lines: [], depth: 0, source: 'none' };
    }
    const r = await this.local.run(fen, { depth, multipv: mp, infinite: opts.infinite }, opts.onInfo);
    if (r.lines.length && r.depth >= Math.min(depth, 10)) this._remember(key, r);
    this.lastSource = 'device';
    return r;
  }
  stop() { this.local.stop(); }
  // Choose a move at a playing strength between 500 and 3200 (always on device).
  async play(fen, elo) {
    if (elo >= 3200) return (await this.local.run(fen, { movetime: 900 })).bestmove;
    if (elo >= 1320) return (await this.local.run(fen, { elo, movetime: 500 })).bestmove;
    // Below Stockfish's 1320 floor: shallow search + controlled mistakes. Strength is an estimate.
    const depth = elo < 700 ? 1 : elo < 1000 ? 2 : 4;
    const r = await this.local.run(fen, { depth, multipv: 4, skill: 0 });
    const pErr = Math.max(0.1, 0.45 - (elo - 500) * 0.000375);
    if (r.lines.length > 1 && Math.random() < pErr) return r.lines[1 + Math.floor(Math.random() * (r.lines.length - 1))].pv[0];
    return r.bestmove;
  }
}
export const engine = new Engine();
