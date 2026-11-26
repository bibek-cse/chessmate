// Tiny local storage layer. Everything stays on the device.
const P = 'cm2_';
const mem = {};
export function get(k, d) {
  if (k in mem) return mem[k];
  try { const v = localStorage.getItem(P + k); mem[k] = v ? JSON.parse(v) : d; }
  catch (e) { mem[k] = d; }
  return mem[k];
}
export function set(k, v) {
  mem[k] = v;
  try { localStorage.setItem(P + k, JSON.stringify(v)); return true; }
  catch (e) { return false; }
}
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function profile() {
  return Object.assign({ rating: 1200, n: 0, challenge: 0, streak: 0, themes: {}, hist: [], level: 1200, placed: false }, get('profile', {}));
}
export const saveProfile = p => set('profile', p);
export const games = () => get('games', []);
export function saveGame(g) {
  const all = games().filter(x => x.id !== g.id);
  all.unshift(g);
  set('games', all.slice(0, 150));
}
export const findGame = id => games().find(g => g.id === id);
export function exportAll() {
  const o = {};
  for (const k of ['profile', 'games', 'pool', 'retry', 'mistakes', 'settings']) o[k] = get(k, null);
  return JSON.stringify(o);
}
export function importAll(txt) {
  const o = JSON.parse(txt);
  for (const k in o) if (o[k] !== null) set(k, o[k]);
}
