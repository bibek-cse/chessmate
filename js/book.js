// Small offline opening book (main lines of popular openings). Moves played from these positions get the 📖 "book" icon.
import { Chess } from './chess.js';
export const LINES = [
  ['Italian Game', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+'],
  ['Italian: Giuoco Pianissimo', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O'],
  ['Two Knights Defence', 'e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O'],
  ['Ruy Lopez: Closed', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3'],
  ['Ruy Lopez: Berlin', 'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8'],
  ['Ruy Lopez: Exchange', 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O f6'],
  ['Scotch Game', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5'],
  ['Petrov Defence', 'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3'],
  ['Philidor Defence', 'e4 e5 Nf3 d6 d4 Nf6 Nc3 Nbd7'],
  ["King's Gambit", 'e4 e5 f4 exf4 Nf3 g5 h4 g4 Ne5'],
  ['Vienna Game', 'e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4'],
  ['Sicilian: Najdorf', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3'],
  ['Sicilian: Najdorf Bg5', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6 f4'],
  ['Sicilian: Dragon', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6'],
  ['Sicilian: Sveshnikov', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5 a6 Na3 b5'],
  ['Sicilian: Kan', 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6 Bd3 Nf6 O-O Qc7'],
  ['Sicilian: Alapin', 'e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6'],
  ['Sicilian: Rossolimo', 'e4 c5 Nf3 Nc6 Bb5 g6 O-O Bg7 Re1 e5'],
  ['French: Winawer', 'e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7 Qg4'],
  ['French: Advance', 'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3'],
  ['French: Tarrasch', 'e4 e6 d4 d5 Nd2 Nf6 e5 Nfd7 Bd3 c5 c3 Nc6'],
  ['French: Classical', 'e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7 f4'],
  ['Caro-Kann: Classical', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3'],
  ['Caro-Kann: Advance', 'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3'],
  ['Scandinavian', 'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5'],
  ['Pirc Defence', 'e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3 O-O'],
  ['Alekhine Defence', 'e4 Nf6 e5 Nd5 d4 d6 Nf3 Bg4 Be2 e6'],
  ["Queen's Gambit Declined", 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6'],
  ["Queen's Gambit Accepted", 'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6'],
  ['Slav Defence', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4'],
  ['Semi-Slav: Meran', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6 e3 Nbd7 Bd3 dxc4 Bxc4 b5'],
  ['London System', 'd4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nd2 e6 Ngf3 Bd6 Bg3 O-O'],
  ['London vs King\'s Indian', 'd4 Nf6 Nf3 g6 Bf4 Bg7 e3 O-O Be2 d6 h3'],
  ["King's Indian: Classical", 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7'],
  ['Grünfeld: Exchange', 'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Nf3 c5 Be3'],
  ['Nimzo-Indian: Rubinstein', 'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O'],
  ['Nimzo-Indian: Classical', 'd4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3 b6'],
  ["Queen's Indian", 'd4 Nf6 c4 e6 Nf3 b6 g3 Ba6 b3 Bb4+ Bd2 Be7'],
  ['Catalan', 'd4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O O-O dxc4 Qc2 a6'],
  ['Modern Benoni', 'd4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 e4 g6 Nf3 Bg7'],
  ['Dutch Defence', 'd4 f5 g3 Nf6 Bg2 e6 Nf3 Be7 O-O O-O c4 d6'],
  ['English: Four Knights', 'c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2 Nb6'],
  ['English: Symmetrical', 'c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 Nf3 Nf6 O-O O-O'],
  ['Réti Opening', 'Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4 d3 Nbd7'],
  ["King's Indian Attack", 'Nf3 d5 g3 Nf6 Bg2 e6 O-O Be7 d3 O-O Nbd2 c5 e4'],
];
const key = fen => fen.split(' ').slice(0, 3).join(' ');
let BOOK = null;
function build() {
  BOOK = new Map();
  for (const [name, line] of LINES) {
    const c = new Chess(); BOOK.set(key(c.fen()), BOOK.get(key(c.fen())) || 'Starting position');
    for (const m of line.split(' ')) { try { c.move(m); } catch (e) { break; } if (!BOOK.has(key(c.fen()))) BOOK.set(key(c.fen()), name); }
  }
}
// Name of the opening if this position is in the book, else null.
export function bookName(fen) { if (!BOOK) build(); return BOOK.get(key(fen)) || null; }
