// Calibration harness for the game engine: `npm run sim:test`
import { genPlayer } from '../src/engine/player';
import { simulateGame, type SimTeamSetup } from '../src/engine/sim';
import type { ClassYear, Pos, Strategy } from '../src/engine/types';
import { setRng, RNG } from '../src/engine/rng';

setRng(new RNG(42));
const strat = (o: Partial<Strategy> = {}): Strategy => ({ offense: 'balanced', defense: 'man', tempo: 3, starters: [], rotation: 9, ...o });

function team(id: string, level: number, s?: Partial<Strategy>): SimTeamSetup {
  const pos: Pos[] = ['PG', 'SG', 'SF', 'PF', 'C', 'PG', 'SG', 'SF', 'PF', 'C', 'SG', 'SF', 'PF', 'C'];
  const cls: ClassYear[] = ['SR', 'JR', 'SO', 'FR'];
  const players = pos.map((p, i) => genPlayer({ pos: p, ovr: Math.round(level + 7 - i * 1.4 + (Math.random() - 0.5) * 4), cls: cls[i % 4], teamId: id }));
  players.forEach((p, i) => (p.num = i + 1));
  return { id, abbr: id.toUpperCase(), name: id, players, strategy: strat(s), coachTactics: 5, coachMotivation: 5 };
}

function agg(n: number, a: SimTeamSetup, b: SimTeamSetup) {
  let pts = 0, fga = 0, fgm = 0, tpa = 0, tpm = 0, fta = 0, ftm = 0, tov = 0, orb = 0, drb = 0, poss = 0, wins = 0, margin = 0, ot = 0, ast = 0, blk = 0, stl = 0;
  const mins: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const box = simulateGame(a, b, { neutral: true });
    poss += box.poss;
    if (box.hs > box.as) wins++;
    margin += box.hs - box.as;
    if (box.ot) ot++;
    for (const side of box.players) for (const p of side) {
      pts += p.pts; fga += p.fga; fgm += p.fgm; tpa += p.tpa; tpm += p.tpm; fta += p.fta; ftm += p.ftm; tov += p.tov; orb += p.orb; drb += p.drb; ast += p.ast; blk += p.blk; stl += p.stl;
    }
    for (const p of box.players[0]) mins[p.name] = (mins[p.name] ?? 0) + p.min;
  }
  const g = n * 2;
  console.log(`PPG ${(pts / g).toFixed(1)} | poss ${(poss / n).toFixed(1)} | FG% ${(fgm / fga * 100).toFixed(1)} | 2P% ${((fgm - tpm) / (fga - tpa) * 100).toFixed(1)} | 3P% ${(tpm / tpa * 100).toFixed(1)} | 3PAr ${(tpa / fga * 100).toFixed(1)} | FT% ${(ftm / fta * 100).toFixed(1)} | FTr ${(fta / fga * 100).toFixed(1)}`);
  console.log(`TOV/poss ${(tov / (poss * 2) * 100).toFixed(1)} | OREB% ${(orb / (orb + drb) * 100).toFixed(1)} | AST/FGM ${(ast / fgm * 100).toFixed(1)} | BLK/g ${(blk / g).toFixed(1)} | STL/g ${(stl / g).toFixed(1)} | homeWin ${(wins / n * 100).toFixed(1)}% | avgMargin ${(margin / n).toFixed(1)} | OT ${(ot / n * 100).toFixed(1)}%`);
  return mins;
}

console.log('--- Even (65 v 65) ---');
const A = team('aaa', 65), B = team('bbb', 65);
const mins = agg(400, A, B);
console.log('Minutes per game (team A):', Object.entries(mins).map(([k, v]) => `${k.split(' ')[1]}:${(v / 400).toFixed(1)}`).join(' '));
for (const [la, lb] of [[78, 70], [78, 60], [78, 52], [70, 62], [60, 55]]) {
  console.log(`--- ${la} v ${lb} ---`);
  agg(300, team('x', la), team('y', lb));
}
console.log('--- Styles: three+fast vs post+slow (65) ---');
agg(300, team('t', 65, { offense: 'three', tempo: 5 }), team('p', 65, { offense: 'post', tempo: 1 }));
console.log('--- Press vs man ---');
agg(300, team('pr', 65, { defense: 'press', tempo: 5 }), team('mn', 65));
console.log('--- Zone vs man ---');
agg(300, team('zn', 65, { defense: 'zone' }), team('mn2', 65));
// timing
const t0 = performance.now();
for (let i = 0; i < 1000; i++) simulateGame(A, B, {});
console.log(`1000 games in ${(performance.now() - t0).toFixed(0)}ms`);
