// Tiny local storage layer — everything stays on the phone.
const P = 'crown_', mem = {};
export function get(k, d) {
  if (k in mem) return mem[k];
  try { const v = localStorage.getItem(P + k); mem[k] = v ? JSON.parse(v) : d; } catch (e) { mem[k] = d; }
  return mem[k];
}
export function set(k, v) {
  mem[k] = v;
  try { localStorage.setItem(P + k, JSON.stringify(v)); return true; } catch (e) { return false; }
}
