// The playbook: offensive and defensive schemes, how well a roster fits each one,
// how they match up against each other, and how familiar a team is with them.
import { clamp } from './rng';
import type { DefStyle, GameState, OffStyle, Player, PlaybookState, Strategy } from './types';

type Mix = { rim: number; mid: number; three: number };

export interface FitResult { score: number; notes: { good: boolean; text: string }[] }

export interface OffScheme {
  id: OffStyle; label: string; icon: string; desc: string;
  strengths: string[]; weaknesses: string[]; needs: string;
  /** shot selection multipliers */
  mix: Mix;
  /** make% adjustments built into the system */
  make: Mix;
  /** possessions per game delta */
  pace: number;
  /** turnover probability delta */
  tov: number;
  /** assist probability delta */
  ast: number;
  /** offensive rebound probability delta */
  orb: number;
  /** shooting-foul multiplier on drives */
  foulDraw: number;
  /** transition chance multiplier after defensive rebounds */
  transition: number;
  fit: (ps: Player[]) => FitResult;
}

export interface DefScheme {
  id: DefStyle; label: string; icon: string; desc: string;
  strengths: string[]; weaknesses: string[]; needs: string;
  /** opponent shot selection multipliers */
  mix: Mix;
  /** opponent make% adjustments (negative = good defense) */
  make: Mix;
  tov: number;
  /** share of turnovers that are live-ball steals */
  steal: number;
  /** non-shooting foul probability delta */
  foul: number;
  /** shooting-foul multiplier */
  shootFoul: number;
  /** opponent offensive rebound delta */
  orbAllowed: number;
  /** extra energy drain on your own players */
  drain: number;
  /** possessions per game delta */
  pace: number;
  fit: (ps: Player[]) => FitResult;
}

// ---------------- roster helpers ----------------
const W = [1, 1, 1, 1, 1, 0.7, 0.55, 0.4];
const isBig = (p: Player) => p.pos === 'PF' || p.pos === 'C';
const isGuard = (p: Player) => p.pos === 'PG' || p.pos === 'SG';
/** the likely rotation: best eight healthy players */
export function rotationOf(ps: Player[]): Player[] {
  return ps.filter((p) => !p.injury && !p.redshirting).sort((a, b) => b.ovr - a.ovr).slice(0, 8);
}
function avg(top: Player[], f: (p: Player) => number) {
  let s = 0, w = 0;
  top.forEach((p, i) => { s += f(p) * (W[i] ?? 0.3); w += W[i] ?? 0.3; });
  return w ? s / w : 0;
}
function wcount(top: Player[], pred: (p: Player) => boolean) {
  let s = 0;
  top.forEach((p, i) => { if (pred(p)) s += W[i] ?? 0.3; });
  return s;
}
const max = (arr: Player[], f: (p: Player) => number) => arr.reduce((m, p) => Math.max(m, f(p)), 0);
const sc = (v: number, lo: number, hi: number) => clamp(((v - lo) / (hi - lo)) * 100, 0, 100);
const done = (score: number, notes: FitResult['notes']): FitResult => ({ score: Math.round(clamp(score, 5, 99)), notes });
const note = (good: boolean, text: string) => ({ good, text });
const r0 = (v: number) => Math.round(v);
function benchGap(top: Player[]) {
  const st = top.slice(0, 5), bn = top.slice(5, 8);
  if (!bn.length) return -15;
  return bn.reduce((a, p) => a + p.ovr, 0) / bn.length - st.reduce((a, p) => a + p.ovr, 0) / st.length;
}
const offSkill = (p: Player) => p.ratings.ins * 0.3 + p.ratings.mid * 0.2 + p.ratings.tp * 0.3 + p.ratings.hdl * 0.2;

/** a roster's overall rating level, so fit measures its shape rather than its talent */
function level(top: Player[]) {
  return avg(top, (p) => { const r = p.ratings; return (r.ins + r.mid + r.tp + r.ft + r.pas + r.hdl + r.perD + r.intD + r.stl + r.blk + r.reb + r.ath + r.spd + r.str + r.sta + r.iq) / 16; });
}
const rel = (v: number, L: number) => v - L;
const sgn = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v)}`;

// ---------------- offenses ----------------
export const OFF_SCHEMES: OffScheme[] = [
  {
    id: 'balanced', label: 'Balanced', icon: '⚖️', desc: 'Take what the defense gives you. A little of everything.',
    strengths: ['Works with any roster', 'No glaring weakness to attack'], weaknesses: ['No real edge against anybody'], needs: 'Nothing in particular',
    mix: { rim: 1, mid: 1, three: 1 }, make: { rim: 0, mid: 0, three: 0 }, pace: 0, tov: 0, ast: 0, orb: 0, foulDraw: 1, transition: 1,
    fit: () => done(58, [note(true, 'Fits any roster, but never a great fit')]),
  },
  {
    id: 'motion', label: 'Motion', icon: '🔄', desc: 'Read-and-react: cut, screen, move the ball. Everybody touches it.',
    strengths: ['Shreds zones with ball movement', 'Fewer turnovers, more assists'], weaknesses: ['Stalls if players can’t pass or shoot', 'Switching defenses blunt it'], needs: 'Smart passers and shooters at most spots',
    mix: { rim: 1, mid: 0.95, three: 1.08 }, make: { rim: 0, mid: 0.005, three: 0.005 }, pace: -0.5, tov: -0.008, ast: 0.07, orb: -0.01, foulDraw: 1, transition: 1,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top);
      const iq = rel(avg(top, (p) => p.ratings.pas * 0.5 + p.ratings.iq * 0.5), L), sh = wcount(top, (p) => p.ratings.tp >= L + 4);
      return done(sc(iq, -4, 10) * 0.6 + sc(sh, 1.5, 5) * 0.4, [note(iq >= 3, `Passing & IQ ${sgn(iq)} vs. team level`), note(sh >= 3, `${sh.toFixed(1)} weighted shooters`)]);
    },
  },
  {
    id: 'pace', label: 'Pace & Space', icon: '⚡', desc: 'Push after every miss and make. Early offense, early threes.',
    strengths: ['Easy transition baskets', 'Wears down thin benches'], weaknesses: ['Gives up offensive rebounds', 'More turnovers'], needs: 'Fast, fit athletes and a deep bench',
    mix: { rim: 1.08, mid: 0.8, three: 1.12 }, make: { rim: 0.009, mid: 0, three: 0.004 }, pace: 3, tov: 0.004, ast: 0, orb: -0.02, foulDraw: 1, transition: 1.6,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top);
      const a = rel(avg(top, (p) => p.ratings.spd * 0.4 + p.ratings.ath * 0.4 + p.ratings.sta * 0.2), L), b = benchGap(top);
      return done(sc(a, -2, 12) * 0.65 + sc(b, -14, 0) * 0.35, [note(a >= 5, `Speed & athleticism ${sgn(a)} vs. team level`), note(b >= -7, b >= -7 ? 'Bench can keep up' : 'Bench drops off sharply')]);
    },
  },
  {
    id: 'post', label: 'Inside-Out', icon: '🏋️', desc: 'Pound it inside, then kick out when the defense collapses.',
    strengths: ['Draws fouls and gets bigs going', 'Punishes switches and small lineups'], weaknesses: ['Packed paints (zone, pack line) clog it', 'Slow, low-possession games'], needs: 'A dominant post scorer and guards who can feed him',
    mix: { rim: 1.25, mid: 1, three: 0.82 }, make: { rim: 0.003, mid: 0, three: 0.004 }, pace: -1, tov: 0, ast: 0, orb: 0.012, foulDraw: 1.08, transition: 0.9,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top), bigs = top.filter(isBig), guards = top.filter((p) => !isBig(p));
      const b = rel(max(bigs, (p) => p.ratings.ins * 0.6 + p.ratings.str * 0.4), L), e = rel(avg(guards, (p) => p.ratings.pas), L);
      return done(sc(b, 2, 22) * 0.65 + sc(e, -4, 10) * 0.35, [note(b >= 12, `Post scorer ${sgn(b)} vs. team level`), note(e >= 3, `Entry passing ${sgn(e)}`)]);
    },
  },
  {
    id: 'drive', label: 'Dribble Drive', icon: '🏃', desc: 'Spread the floor and attack the rim one-on-one.',
    strengths: ['Gets to the line', 'Beats aggressive, pressuring defenses'], weaknesses: ['Pack line walls it off', 'Needs shooters to keep driving lanes open'], needs: 'Quick guards and wings who finish at the rim',
    mix: { rim: 1.3, mid: 0.85, three: 1 }, make: { rim: 0.003, mid: 0, three: 0 }, pace: 0.5, tov: 0.004, ast: -0.02, orb: 0, foulDraw: 1.12, transition: 1.1,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top), perim = top.filter((p) => p.pos !== 'C');
      const d = rel(avg(perim, (p) => p.ratings.ins * 0.4 + p.ratings.spd * 0.3 + p.ratings.hdl * 0.3), L), sh = wcount(top, (p) => p.ratings.tp >= L + 4);
      return done(sc(d, -2, 12) * 0.7 + sc(sh, 1, 4) * 0.3, [note(d >= 5, `Downhill attackers ${sgn(d)} vs. team level`), note(sh >= 2.5, `Spacing: ${sh.toFixed(1)} shooters`)]);
    },
  },
  {
    id: 'three', label: 'Five-Out Bombs', icon: '🎯', desc: 'Five shooters spread out. Hunt threes and live by the arc.',
    strengths: ['Punishes zones and pack lines', 'Huge comeback potential'], weaknesses: ['Cold nights happen', 'Gives up the glass'], needs: 'Shooters everywhere, ideally a big who can step out',
    mix: { rim: 0.9, mid: 0.75, three: 1.38 }, make: { rim: 0.006, mid: 0, three: 0.004 }, pace: 0.5, tov: 0, ast: 0.02, orb: -0.02, foulDraw: 0.95, transition: 1.1,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top);
      const sh = wcount(top, (p) => p.ratings.tp >= L + 6), stretch = top.filter(isBig).some((p) => p.ratings.tp >= L);
      return done(sc(sh, 1, 4.5) * 0.78 + (stretch ? 22 : 0), [note(sh >= 3, `${sh.toFixed(1)} weighted knockdown shooters`), note(stretch, stretch ? 'A big who can stretch the floor' : 'No big can shoot: the paint stays crowded')]);
    },
  },
  {
    id: 'princeton', label: 'Princeton', icon: '✂️', desc: 'Backdoor cuts, high-post passing and patience. Brains over brawn.',
    strengths: ['Burns pressure and denial defenses', 'Fewest turnovers, lots of layups', 'Shortens games for underdogs'], weaknesses: ['Zones take away the backdoor', 'Fewer possessions'], needs: 'High-IQ passers at every spot, including the bigs',
    mix: { rim: 1.15, mid: 0.95, three: 1 }, make: { rim: 0.009, mid: 0, three: 0.003 }, pace: -2.5, tov: -0.012, ast: 0.09, orb: -0.02, foulDraw: 0.95, transition: 0.8,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top);
      const iq = rel(avg(top, (p) => p.ratings.iq), L), pas = rel(avg(top, (p) => p.ratings.pas), L), bp = rel(avg(top.filter(isBig), (p) => p.ratings.pas), L);
      return done(sc(iq, -2, 10) * 0.4 + sc(pas, -4, 8) * 0.35 + sc(bp, -14, 0) * 0.25, [note(iq >= 4, `Team IQ ${sgn(iq)} vs. team level`), note(pas >= 2, `Passing ${sgn(pas)}`), note(bp >= -7, `Bigs who can pass: ${sgn(bp)}`)]);
    },
  },
  {
    id: 'flex', label: 'Flex', icon: '🔀', desc: 'Screen-the-screener continuity. Patient, physical, built for mid-range looks.',
    strengths: ['Grinds down man-to-man', 'Gets versatile forwards open'], weaknesses: ['Switching defenses kill the screens', 'Zones blunt it'], needs: 'Forwards who can shoot, pass and finish',
    mix: { rim: 1.05, mid: 1.22, three: 0.9 }, make: { rim: 0, mid: 0.014, three: 0 }, pace: -1, tov: -0.005, ast: 0.04, orb: 0.005, foulDraw: 1, transition: 0.9,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top), fwd = top.filter((p) => p.pos === 'SF' || p.pos === 'PF');
      const f = rel(avg(fwd, (p) => p.ratings.mid * 0.4 + p.ratings.ins * 0.3 + p.ratings.pas * 0.3), L), iq = rel(avg(top, (p) => p.ratings.iq), L);
      return done(sc(f, -4, 8) * 0.6 + sc(iq, -2, 10) * 0.4, [note(f >= 2, `Versatile forwards ${sgn(f)} vs. team level`), note(iq >= 4, `Team IQ ${sgn(iq)}`)]);
    },
  },
  {
    id: 'pnr', label: 'Spread Pick-and-Roll', icon: '🔁', desc: 'High ball screens all game: your best handler and a rolling or popping big.',
    strengths: ['Elite handlers feast', 'Beats drop coverage and pack lines'], weaknesses: ['Switching defenses neutralize it', 'Predictable if the handler is ordinary'], needs: 'A star ball handler and a big who rolls hard or pops',
    mix: { rim: 1.12, mid: 0.98, three: 1.05 }, make: { rim: 0.003, mid: 0.002, three: 0.002 }, pace: 0, tov: 0.003, ast: 0.03, orb: 0, foulDraw: 1.06, transition: 1,
    fit: (ps) => {
      const top = rotationOf(ps).slice(0, 6), L = level(top);
      const h = rel(max(top, (p) => p.ratings.hdl * 0.5 + p.ratings.pas * 0.5), L), b = rel(max(top.filter(isBig), (p) => Math.max(p.ratings.ath * 0.5 + p.ratings.ins * 0.5, p.ratings.tp)), L);
      return done(sc(h, 6, 22) * 0.6 + sc(b, 2, 16) * 0.4, [note(h >= 14, `Lead handler ${sgn(h)} vs. team level`), note(b >= 9, `Roll or pop big ${sgn(b)}`)]);
    },
  },
  {
    id: 'iso', label: 'Star Iso', icon: '⭐', desc: 'Clear out and let your best scorer go to work.',
    strengths: ['A true star becomes unstoppable', 'Clutch shot creation'], weaknesses: ['Box-and-one and zones swarm the star', 'Teammates go cold, few assists'], needs: 'One scorer who is far better than everybody else',
    mix: { rim: 1, mid: 1.25, three: 0.96 }, make: { rim: 0, mid: 0.006, three: 0 }, pace: -1, tov: -0.004, ast: -0.1, orb: 0, foulDraw: 1.1, transition: 0.95,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top);
      const sorted = [...top].sort((a, b) => offSkill(b) - offSkill(a));
      const star = sorted[0] ? offSkill(sorted[0]) : 0, rest = sorted.slice(1, 5).reduce((a, p) => a + offSkill(p), 0) / Math.max(1, Math.min(4, sorted.length - 1));
      return done(sc(star - L, 2, 16) * 0.5 + sc(star - rest, 2, 12) * 0.5, [note(star - L >= 9, sorted[0] ? `${sorted[0].first} ${sorted[0].last} as the star (${sgn(star - L)})` : 'No star'), note(star - rest >= 7, `Gap over the rest: ${Math.round(star - rest)}`)]);
    },
  },
];

// ---------------- defenses ----------------
export const DEF_SCHEMES: DefScheme[] = [
  {
    id: 'man', label: 'Man-to-Man', icon: '🛡️', desc: 'Solid fundamentals. Guard your man, help when needed.',
    strengths: ['Holds up against everything', 'Fewest weaknesses'], weaknesses: ['Exposes weak individual defenders'], needs: 'Solid individual defenders',
    mix: { rim: 1, mid: 1, three: 1 }, make: { rim: 0, mid: 0, three: 0 }, tov: 0, steal: 0, foul: 0, shootFoul: 1, orbAllowed: 0, drain: 0, pace: 0,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top), d = rel(avg(top, (p) => p.ratings.perD * 0.6 + p.ratings.intD * 0.4), L);
      return done(sc(d, -6, 8) * 0.7 + 22, [note(d >= 1, `Individual defense ${sgn(d)} vs. team level`)]);
    },
  },
  {
    id: 'packline', label: 'Pack Line', icon: '🧱', desc: 'Everybody inside the line. Wall off the paint, live with contested jumpers.',
    strengths: ['Kills dribble drive and post-ups', 'Few fouls, few easy baskets'], weaknesses: ['Shooting teams light it up', 'Concedes threes'], needs: 'Disciplined, high-IQ defenders and a rim protector',
    mix: { rim: 0.82, mid: 1.1, three: 1.15 }, make: { rim: -0.016, mid: 0, three: 0.006 }, tov: -0.004, steal: -0.05, foul: -0.01, shootFoul: 0.88, orbAllowed: -0.01, drain: 0, pace: -0.5,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top);
      const d = rel(avg(top, (p) => p.ratings.perD), L), iq = rel(avg(top, (p) => p.ratings.iq), L), rp = rel(max(top.filter(isBig), (p) => p.ratings.intD * 0.6 + p.ratings.blk * 0.4), L);
      return done(sc(d, -4, 8) * 0.4 + sc(iq, -2, 10) * 0.3 + sc(rp, 2, 20) * 0.3, [note(d >= 2, `Perimeter D ${sgn(d)} vs. team level`), note(iq >= 4, `Discipline (IQ) ${sgn(iq)}`), note(rp >= 11, `Rim protector ${sgn(rp)}`)]);
    },
  },
  {
    id: 'zone', label: '2-3 Zone', icon: '🕸️', desc: 'Protect the rim and the glass. Hides weak perimeter defenders.',
    strengths: ['Hides poor individual defenders', 'Shuts down post-ups and drives'], weaknesses: ['Motion and shooting teams carve it up', 'Gives up offensive rebounds'], needs: 'Long bigs who block shots and rebound',
    mix: { rim: 0.86, mid: 1.05, three: 1.15 }, make: { rim: -0.012, mid: 0.01, three: -0.016 }, tov: -0.008, steal: 0, foul: -0.01, shootFoul: 0.9, orbAllowed: 0.025, drain: -0.05, pace: -0.5,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top), bigs = top.filter(isBig);
      const rp = rel(max(bigs, (p) => p.ratings.intD * 0.6 + p.ratings.blk * 0.4), L), rb = rel(avg(bigs, (p) => p.ratings.reb), L), len = avg(top.slice(0, 5), (p) => p.height);
      return done(sc(rp, 2, 20) * 0.45 + sc(rb, 2, 18) * 0.3 + sc(len, 76.5, 80) * 0.25, [note(rp >= 11, `Rim protection ${sgn(rp)} vs. team level`), note(rb >= 10, `Bigs' rebounding ${sgn(rb)}`), note(len >= 78.3, `Length: ${Math.floor(len / 12)}'${Math.round(len % 12)}" avg starter`)]);
    },
  },
  {
    id: 'zone131', label: '1-3-1 Trap', icon: '🪤', desc: 'A long athlete at the top, traps on the wings. Chaos by design.',
    strengths: ['Forces turnovers and live-ball steals', 'Unfamiliar look throws teams off'], weaknesses: ['Corner threes and offensive rebounds', 'Tires your wings'], needs: 'Long, active wings and quick guards',
    mix: { rim: 0.9, mid: 0.95, three: 1.2 }, make: { rim: -0.004, mid: -0.008, three: 0.01 }, tov: 0.018, steal: 0.08, foul: 0.005, shootFoul: 1, orbAllowed: 0.035, drain: 0.06, pace: 1,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top), five = top.slice(0, 5);
      const act = rel(avg(five, (p) => p.ratings.stl * 0.5 + p.ratings.ath * 0.5), L), len = max(five.filter((p) => !isBig(p)), (p) => p.height), q = rel(avg(five, (p) => p.ratings.spd), L);
      return done(sc(act, -2, 10) * 0.45 + sc(len, 77, 81) * 0.3 + sc(q, -4, 8) * 0.25, [note(act >= 4, `Active hands & athleticism ${sgn(act)} vs. team level`), note(len >= 79, `Length on the wing: ${Math.floor(len / 12)}'${len % 12}"`), note(q >= 2, `Quickness ${sgn(q)}`)]);
    },
  },
  {
    id: 'matchup', label: 'Matchup Zone', icon: '🧩', desc: 'Looks like a zone, plays like man. Hard to read, harder to beat.',
    strengths: ['Confuses motion and Princeton offenses', 'Takes away open threes'], weaknesses: ['Breaks down without smart defenders', 'Gives up some offensive boards'], needs: 'High-IQ defenders who communicate',
    mix: { rim: 0.92, mid: 1.05, three: 1.04 }, make: { rim: -0.004, mid: 0, three: -0.005 }, tov: 0.003, steal: 0, foul: -0.004, shootFoul: 0.95, orbAllowed: 0.015, drain: 0, pace: 0,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top), iq = rel(avg(top, (p) => p.ratings.iq), L), d = rel(avg(top, (p) => p.ratings.perD * 0.5 + p.ratings.intD * 0.5), L);
      return done(sc(iq, -2, 10) * 0.6 + sc(d, -6, 6) * 0.4, [note(iq >= 4, `Team IQ ${sgn(iq)} vs. team level`), note(d >= 0, `Overall defense ${sgn(d)}`)]);
    },
  },
  {
    id: 'press', label: 'Full-Court Press', icon: '🔥', desc: 'Pressure for 94 feet. Turn them over and run.',
    strengths: ['Feasts on shaky ball handlers', 'Speeds up slower teams'], weaknesses: ['Gives up layups when broken', 'Exhausting: needs a deep bench'], needs: 'Quick, active athletes and depth',
    mix: { rim: 1.1, mid: 1, three: 1 }, make: { rim: 0.03, mid: 0, three: 0 }, tov: 0.022, steal: 0.04, foul: 0.02, shootFoul: 1.03, orbAllowed: 0, drain: 0.15, pace: 4,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top), a = rel(avg(top, (p) => p.ratings.spd * 0.4 + p.ratings.ath * 0.3 + p.ratings.stl * 0.3), L), b = benchGap(top), st = rel(avg(top, (p) => p.ratings.sta), L);
      return done(sc(a, -2, 10) * 0.5 + sc(b, -14, 0) * 0.3 + sc(st, -2, 12) * 0.2, [note(a >= 4, `Quickness & hands ${sgn(a)} vs. team level`), note(b >= -7, b >= -7 ? 'Deep enough to rotate fresh legs' : 'Bench drop-off: fatigue risk'), note(st >= 5, `Stamina ${sgn(st)}`)]);
    },
  },
  {
    id: 'switch', label: 'Switch Everything', icon: '🔄', desc: 'Switch every screen. No breakdowns, if everybody can guard everybody.',
    strengths: ['Neutralizes pick-and-roll and flex screens', 'Few open looks'], weaknesses: ['Post-ups and isolation mismatches', 'Needs versatile defenders'], needs: 'Versatile defenders of similar size',
    mix: { rim: 0.98, mid: 1.15, three: 0.96 }, make: { rim: -0.004, mid: 0, three: -0.006 }, tov: -0.004, steal: 0, foul: 0, shootFoul: 1, orbAllowed: 0.005, drain: 0, pace: 0,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top), five = top.slice(0, 5);
      const minV = rel(five.reduce((m, p) => Math.min(m, p.ratings.perD * 0.5 + p.ratings.intD * 0.5), 99), L), ath = rel(avg(five, (p) => p.ratings.ath), L);
      const hs = five.map((p) => p.height), spread = hs.length ? Math.max(...hs) - Math.min(...hs) : 8;
      return done(sc(minV, -16, -2) * 0.45 + sc(ath, -2, 10) * 0.25 + sc(10 - spread, 0, 6) * 0.3, [note(minV >= -9, `Weakest link ${sgn(minV)} vs. team level`), note(ath >= 4, `Athleticism ${sgn(ath)}`), note(spread <= 6, `Size spread: ${spread}"`)]);
    },
  },
  {
    id: 'pressure', label: 'Denial Man', icon: '🙅', desc: 'Deny every pass, pressure every dribble, jump passing lanes.',
    strengths: ['Forces turnovers in the half court', 'Disrupts timing and rhythm'], weaknesses: ['Backdoor cuts (Princeton) and drivers burn it', 'Foul trouble'], needs: 'Quick, tireless perimeter defenders',
    mix: { rim: 1.12, mid: 0.95, three: 0.92 }, make: { rim: 0.015, mid: 0, three: -0.01 }, tov: 0.014, steal: 0.05, foul: 0.012, shootFoul: 1.08, orbAllowed: 0, drain: 0.08, pace: 1,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top), perim = top.filter((p) => !isBig(p));
      const d = rel(avg(perim, (p) => p.ratings.perD * 0.5 + p.ratings.stl * 0.3 + p.ratings.spd * 0.2), L), st = rel(avg(top, (p) => p.ratings.sta), L);
      return done(sc(d, -2, 10) * 0.7 + sc(st, -2, 12) * 0.3, [note(d >= 4, `Perimeter pressure ${sgn(d)} vs. team level`), note(st >= 5, `Stamina ${sgn(st)}`)]);
    },
  },
  {
    id: 'boxone', label: 'Box-and-One', icon: '🎯', desc: 'A four-man zone plus your best defender shadowing their star.',
    strengths: ['Takes the other team’s star out of the game', 'Wrecks Star Iso offenses'], weaknesses: ['Everyone else gets open looks', 'Easy to beat if they have balance'], needs: 'One lockdown perimeter defender and a rim protector',
    mix: { rim: 0.95, mid: 1, three: 1.08 }, make: { rim: -0.004, mid: 0.006, three: 0.006 }, tov: 0, steal: 0, foul: 0, shootFoul: 0.95, orbAllowed: 0.015, drain: 0.02, pace: 0,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top), stopper = rel(max(top, (p) => p.ratings.perD), L), rp = rel(max(top.filter(isBig), (p) => p.ratings.intD * 0.6 + p.ratings.blk * 0.4), L);
      return done(sc(stopper, 6, 24) * 0.6 + sc(rp, 2, 20) * 0.4, [note(stopper >= 15, `Lockdown defender ${sgn(stopper)} vs. team level`), note(rp >= 11, `Rim protector ${sgn(rp)}`)]);
    },
  },
];

// Calibrate every scheme's fit to the same scale (measured on real league rosters): a typical roster lands near 55,
// the best-suited 10% of rosters reach 80 and the worst-suited 10% sit near 30.
const CAL: Record<string, [number, number]> = {
  motion: [11, 44], pace: [22, 44], post: [30, 74], drive: [18, 51], three: [5, 66], princeton: [8, 40], flex: [13, 51], pnr: [16, 68], iso: [20, 85],
  man: [30, 52], packline: [17, 42], zone: [30, 82], zone131: [18, 59], matchup: [12, 37], press: [24, 43], switch: [18, 71], pressure: [15, 52], boxone: [18, 65],
};
for (const sch of [...OFF_SCHEMES, ...DEF_SCHEMES] as { id: string; fit: (ps: Player[]) => FitResult }[]) {
  const c = CAL[sch.id];
  if (!c) continue;
  const raw = sch.fit;
  sch.fit = (ps) => { const r = raw(ps); return { ...r, score: Math.round(clamp(30 + ((r.score - c[0]) * 50) / (c[1] - c[0]), 5, 99)) }; };
}

export const OFF: Record<OffStyle, OffScheme> = Object.fromEntries(OFF_SCHEMES.map((s) => [s.id, s])) as Record<OffStyle, OffScheme>;
export const DEF: Record<DefStyle, DefScheme> = Object.fromEntries(DEF_SCHEMES.map((s) => [s.id, s])) as Record<DefStyle, DefScheme>;

// ---------------- counters ----------------
/** Offense make% edge against a defense (positive favors the offense) */
const COUNTERS: Partial<Record<OffStyle, Partial<Record<DefStyle, number>>>> = {
  motion: { zone: 0.014, zone131: 0.01, boxone: 0.008, switch: -0.01, matchup: -0.008 },
  pace: { press: 0.014, packline: 0.006, zone: 0.004, pressure: 0.004, matchup: -0.004 },
  post: { switch: 0.02, zone131: 0.008, zone: -0.016, packline: -0.014, boxone: -0.004 },
  drive: { pressure: 0.014, switch: 0.004, packline: -0.016, zone: -0.01, matchup: -0.006 },
  three: { packline: 0.016, zone: 0.012, zone131: 0.012, boxone: 0.006, switch: -0.006, pressure: -0.006, matchup: -0.006 },
  princeton: { pressure: 0.022, man: 0.003, press: -0.008, zone: -0.012, matchup: -0.012, zone131: -0.008 },
  flex: { man: 0.006, pressure: 0.008, packline: 0.004, switch: -0.014, zone: -0.012, zone131: -0.006 },
  pnr: { packline: 0.01, man: 0.003, zone: -0.004, switch: -0.016, matchup: -0.004 },
  iso: { switch: 0.01, boxone: -0.024, zone: -0.01, matchup: -0.006, packline: -0.006 },
};
export function counterEdge(off: OffStyle, def: DefStyle): number {
  return COUNTERS[off]?.[def] ?? 0;
}
export function edgeLabel(e: number): { text: string; tone: 'good' | 'bad' | '' } {
  if (e >= 0.012) return { text: 'Big edge', tone: 'good' };
  if (e >= 0.005) return { text: 'Edge', tone: 'good' };
  if (e <= -0.012) return { text: 'Bad matchup', tone: 'bad' };
  if (e <= -0.005) return { text: 'Tough matchup', tone: 'bad' };
  return { text: 'Neutral', tone: '' };
}

// ---------------- execution: fit and familiarity ----------------
/** AI programs run their schemes all season */
export const AI_FAMILIARITY = 90;
/** make% delta from how well a roster fits a scheme */
export function fitEdge(fit: number) { return (fit - 58) * 0.00035; }
/** make% penalty and turnover increase for an unfamiliar scheme */
export function famPenalty(fam: number) {
  const gap = Math.max(0, 85 - fam);
  return { make: -gap * 0.00013, tov: gap * 0.0002 };
}

export function playbookState(state: GameState): PlaybookState {
  if (!state.playbook) {
    const s = state.teams[state.user.teamId].strategy;
    const pb: PlaybookState = { off: {}, def: {} };
    for (const o of OFF_SCHEMES) pb.off[o.id] = o.id === s.offense ? 90 : o.id === 'balanced' ? 70 : 30;
    for (const d of DEF_SCHEMES) pb.def[d.id] = d.id === s.defense ? 90 : d.id === 'man' ? 70 : 30;
    state.playbook = pb;
  }
  return state.playbook;
}
export function famOf(state: GameState, side: 'off' | 'def', id: string): number {
  const pb = playbookState(state);
  return (side === 'off' ? pb.off[id as OffStyle] : pb.def[id as DefStyle]) ?? 30;
}

/** Weekly install: practice the schemes you run, forget the ones you don't */
export function weeklyInstall(state: GameState, opts: { tactics: number; gamePrep: boolean }) {
  const pb = playbookState(state);
  const s = state.teams[state.user.teamId].strategy;
  const gain = (8 + opts.tactics * 0.8) * (opts.gamePrep ? 1.6 : 1);
  for (const o of OFF_SCHEMES) pb.off[o.id] = clamp((pb.off[o.id] ?? 30) + (o.id === s.offense ? gain : -1.5), 20, 100);
  for (const d of DEF_SCHEMES) pb.def[d.id] = clamp((pb.def[d.id] ?? 30) + (d.id === s.defense ? gain : -1.5), 20, 100);
}
/** New season: some knowledge leaves with graduating players, then summer and preseason practice install your schemes */
export function seasonInstallReset(state: GameState) {
  const pb = playbookState(state);
  const s = state.teams[state.user.teamId].strategy;
  for (const k of Object.keys(pb.off) as OffStyle[]) pb.off[k] = clamp(Math.round((pb.off[k] ?? 30) * 0.85), 20, 100);
  for (const k of Object.keys(pb.def) as DefStyle[]) pb.def[k] = clamp(Math.round((pb.def[k] ?? 30) * 0.85), 20, 100);
  pb.off[s.offense] = clamp((pb.off[s.offense] ?? 30) + PRESEASON_INSTALL, 20, 100);
  pb.def[s.defense] = clamp((pb.def[s.defense] ?? 30) + PRESEASON_INSTALL, 20, 100);
}
/** Familiarity gained from summer workouts and preseason practice */
export const PRESEASON_INSTALL = 40;
/** In the offseason and preseason there's time to install a new system before games count */
export function offseasonInstall(state: GameState, side: 'off' | 'def', id: string) {
  const pb = playbookState(state);
  if (side === 'off') pb.off[id as OffStyle] = Math.max(pb.off[id as OffStyle] ?? 30, 75);
  else pb.def[id as DefStyle] = Math.max(pb.def[id as DefStyle] ?? 30, 75);
}
/** New job: a new roster has to learn everything */
export function resetPlaybook(state: GameState) {
  state.playbook = undefined;
  playbookState(state);
}

// ---------------- AI coaches ----------------
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** Every coach leans toward a pet offense and defense */
export function coachLean(coachId: string): { off: OffStyle; def: DefStyle } {
  const h = hash(coachId);
  return { off: OFF_SCHEMES[h % OFF_SCHEMES.length].id, def: DEF_SCHEMES[(h >>> 8) % DEF_SCHEMES.length].id };
}

/** Pick schemes and tendencies for a roster */
export function chooseSchemes(ps: Player[], coachId?: string, rand: () => number = Math.random): Pick<Strategy, 'offense' | 'defense' | 'crash' | 'shotProfile' | 'pressure' | 'help'> {
  const lean = coachId ? coachLean(coachId) : null;
  let bestO: OffStyle = 'balanced', bo = -1, bestD: DefStyle = 'man', bd = -1;
  for (const o of OFF_SCHEMES) {
    const v = o.fit(ps).score + (lean?.off === o.id ? 14 : 0) + rand() * 8;
    if (v > bo) { bo = v; bestO = o.id; }
  }
  for (const d of DEF_SCHEMES) {
    const v = d.fit(ps).score + (lean?.def === d.id ? 14 : 0) + rand() * 8;
    if (v > bd) { bd = v; bestD = d.id; }
  }
  const top = rotationOf(ps);
  const reb = avg(top, (p) => p.ratings.reb), tp = avg(top, (p) => p.ratings.tp), ins = avg(top, (p) => p.ratings.ins), stl = avg(top, (p) => p.ratings.stl);
  const rp = max(top.filter(isBig), (p) => p.ratings.intD * 0.6 + p.ratings.blk * 0.4);
  return {
    offense: bestO, defense: bestD,
    crash: reb >= 66 ? 1 : reb <= 56 ? -1 : 0,
    shotProfile: tp - ins >= 6 ? 1 : ins - tp >= 8 ? -1 : 0,
    pressure: stl >= 64 ? 1 : 0,
    help: rp >= 74 ? 0 : rp <= 62 ? 1 : 0,
  };
}

export const TENDENCIES = [
  { key: 'crash', label: 'Offensive Rebounding', lo: 'Get back on defense', hi: 'Crash the glass', desc: 'More second chances, but you give up more fast breaks.' },
  { key: 'shotProfile', label: 'Shot Profile', lo: 'Attack the paint', hi: 'Hunt threes', desc: 'Shifts shots between the rim and the arc.' },
  { key: 'pressure', label: 'Ball Pressure', lo: 'Sit back', hi: 'Get up into them', desc: 'More turnovers forced, but more fouls, blow-bys and tired legs.' },
  { key: 'help', label: 'Help Defense', lo: 'Run shooters off the line', hi: 'Pack the paint', desc: 'Protect the rim or the three-point line. You can’t do both.' },
] as const;
export type TendencyKey = (typeof TENDENCIES)[number]['key'];

const IN_SEASON = ['regular', 'confTourney', 'selection', 'ncaa'];
/** Change the user's scheme. Outside the season there's time to install it properly. */
export function setUserScheme(state: GameState, side: 'off' | 'def', id: OffStyle | DefStyle) {
  const st = state.teams[state.user.teamId].strategy;
  if (side === 'off') st.offense = id as OffStyle; else st.defense = id as DefStyle;
  if (!IN_SEASON.includes(state.phase) || state.day === 0) offseasonInstall(state, side, id);
}
/** Is a scheme change right now a mid-season switch (costly) or an offseason install (cheap)? */
export function midSeason(state: GameState) {
  return IN_SEASON.includes(state.phase) && state.day > 0;
}
