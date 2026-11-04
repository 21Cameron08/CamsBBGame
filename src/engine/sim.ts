// Possession-by-possession basketball simulation.
// Works in two modes: fast (no play-by-play strings) for the ~6,000 games a
// season, and live (pbp) for the user's games, stepped one possession at a time.
import { rng, clamp } from './rng';
import type { BoxPlayer, BoxScore, DefStyle, OffStyle, Player, Pos, Ratings, ShotMark, Strategy } from './types';
import { OFF, DEF, AI_FAMILIARITY, counterEdge, famPenalty, fitEdge, type OffScheme, type DefScheme } from './schemes';

export interface SimTeamSetup {
  id: string;
  abbr: string;
  name: string;
  players: Player[]; // healthy & eligible
  strategy: Strategy;
  coachTactics: number; // 0..10
  coachMotivation: number; // 0..10
  /** staff: opponent shot-make reduction when this team defends */
  defBonus?: number;
  /** staff: extra turnover pressure when this team defends */
  pressure?: number;
  /** staff: energy drain multiplier */
  staminaMul?: number;
  /** scheme familiarity (user's team; AI programs know their schemes) */
  fam?: { off: Partial<Record<OffStyle, number>>; def: Partial<Record<DefStyle, number>> };
}

/** Everything a team's schemes and tendencies do, resolved for one game */
interface TeamMods {
  off: OffScheme;
  def: DefScheme;
  /** make% delta on this team's shots from fit and familiarity */
  offExec: number;
  offTov: number;
  /** make% delta on the opponent's shots from this team's defensive fit and familiarity */
  defExec: number;
  defTov: number;
  crash: number;
  shotProfile: number;
  pressure: number;
  help: number;
  /** best scorer (box-and-one target) */
  starId: string | null;
}

export interface SimOptions {
  neutral?: boolean;
  pbp?: boolean;
  /** extra home-court boost (rivalry, sold-out arena) 0..1 */
  crowd?: number;
  gameId?: string;
  /** stakes: elevates clutch behaviour */
  tourney?: boolean;
}

export type PlayKind =
  | 'jump' | 'make' | 'miss' | 'ft' | 'ftmiss' | 'tov' | 'steal' | 'block' | 'oreb' | 'dreb'
  | 'foul' | 'sub' | 'timeout' | 'media' | 'period' | 'final';

export interface PlayEvent {
  id: number;
  t: number;
  period: number;
  clock: string;
  team: 0 | 1 | -1;
  kind: PlayKind;
  text: string;
  pid?: string;
  pts?: number;
  shot?: { x: number; y: number; made: boolean; three: boolean };
  score: [number, number];
  big?: boolean;
}

interface SP {
  p: Player;
  r: Ratings;
  on: boolean;
  energy: number;
  fouls: number;
  secs: number;
  target: number; // target minutes
  depth: number;
  usage: number;
  /** usage before scheme adjustments */
  base: number;
  box: BoxPlayer;
  out: boolean; // fouled out
  short: string;
}

type ShotType = 'rim' | 'mid' | 'three';

const REG = 2400;
const HALF = 1200;
const OT = 300;

const MINUTES_BY_ROT: Record<number, number[]> = {
  7: [36, 35, 34, 33, 32, 18, 12],
  8: [35, 33, 32, 31, 29, 20, 12, 8],
  9: [34, 32, 31, 29, 28, 19, 13, 9, 5],
  10: [32, 30, 29, 28, 27, 18, 14, 10, 7, 5],
  11: [30, 29, 28, 27, 26, 17, 14, 11, 8, 6, 4],
};

export function fmtClock(secsLeft: number): string {
  const s = Math.max(0, Math.round(secsLeft));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const isGuard = (p: Pos) => p === 'PG' || p === 'SG';
const isBig = (p: Pos) => p === 'PF' || p === 'C';

/** Pick a positionally sane 5 from a priority-ordered list */
export function pickLineup<T extends { p: Player }>(ordered: T[]): T[] {
  const out: T[] = [];
  let g = 0, b = 0, c = 0;
  for (const cand of ordered) {
    if (out.length >= 5) break;
    const pos = cand.p.pos;
    const ig = isGuard(pos), ib = isBig(pos);
    if (ig && g >= 3) continue;
    if (ib && b >= 3) continue;
    if (pos === 'C' && c >= 2) continue;
    const slotsLeft = 5 - out.length - 1;
    const needG = Math.max(0, 1 - g - (ig ? 1 : 0));
    const needB = Math.max(0, 1 - b - (ib ? 1 : 0));
    if (needG + needB > slotsLeft) continue;
    out.push(cand);
    if (ig) g++;
    if (ib) b++;
    if (pos === 'C') c++;
  }
  // fallback fill
  for (const cand of ordered) {
    if (out.length >= 5) break;
    if (!out.includes(cand)) out.push(cand);
  }
  return out;
}

/** Order players for a depth chart (starters first) */
export function depthChart(players: Player[], strategy?: Strategy): Player[] {
  const avail = players.filter((p) => !p.injury && !p.redshirting);
  const byOvr = [...avail].sort((a, b) => b.ovr - a.ovr);
  let starters: Player[] = [];
  if (strategy && strategy.starters.length === 5) {
    starters = strategy.starters.map((id) => avail.find((p) => p.id === id)).filter(Boolean) as Player[];
  }
  if (starters.length < 5) {
    const wrap = byOvr.map((p) => ({ p }));
    const keep = starters.map((p) => ({ p }));
    const rest = wrap.filter((w) => !starters.includes(w.p));
    starters = pickLineup([...keep, ...rest]).map((w) => w.p);
  }
  // order starters PG..C
  const order: Record<Pos, number> = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 };
  starters.sort((a, b) => order[a.pos] - order[b.pos]);
  const bench = byOvr.filter((p) => !starters.includes(p));
  return [...starters, ...bench];
}

function pickW<T>(arr: T[], w: (x: T) => number): T {
  let total = 0;
  for (let i = 0; i < arr.length; i++) total += Math.max(0, w(arr[i]));
  let r = rng.next() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= Math.max(0, w(arr[i]));
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

function offSkill(r: Ratings): number {
  const best = Math.max(r.tp, r.ins, r.mid);
  return best * 0.4 + ((r.tp + r.ins + r.mid) / 3) * 0.25 + r.hdl * 0.15 + r.iq * 0.2;
}

export class GameSim {
  readonly setups: [SimTeamSetup, SimTeamSetup];
  readonly neutral: boolean;
  readonly pbp: boolean;
  readonly crowd: number;
  readonly tourney: boolean;
  t = 0;
  period = 1;
  periodEnd = HALF;
  score: [number, number] = [0, 0];
  poss: 0 | 1 = 0;
  teamFouls: [number, number] = [0, 0];
  timeouts: [number, number] = [4, 4];
  sp: [SP[], SP[]];
  court: [SP[], SP[]] = [[], []];
  events: PlayEvent[] = [];
  done = false;
  halfScore: [number, number] = [0, 0];
  flow: [number, number, number][] = [[0, 0, 0]];
  possCount: [number, number] = [0, 0];
  runPts: [number, number] = [0, 0];
  lastSub: [number, number] = [-999, -999];
  mediaMarks = new Set<number>();
  shots: ShotMark[] = [];
  largestLead: [number, number] = [0, 0];
  pendingTO: [boolean, boolean] = [false, false];
  nextTransition = false;
  private eid = 0;
  private started = false;
  private lastLeader: -1 | 0 | 1 = -1;
  /** strategies can be changed live */
  strategy: [Strategy, Strategy];
  mods!: [TeamMods, TeamMods];

  constructor(home: SimTeamSetup, away: SimTeamSetup, opts: SimOptions = {}) {
    this.setups = [home, away];
    this.neutral = !!opts.neutral;
    this.pbp = !!opts.pbp;
    this.crowd = opts.crowd ?? 0.5;
    this.tourney = !!opts.tourney;
    this.strategy = [{ ...home.strategy }, { ...away.strategy }];
    this.sp = [this.buildTeam(0), this.buildTeam(1)];
    this.mods = [this.computeMods(0), this.computeMods(1)];
    this.applyUsage(0);
    this.applyUsage(1);
    this.syncCourt(0);
    this.syncCourt(1);
    this.poss = rng.chance(0.5) ? 0 : 1;
  }

  private buildTeam(i: 0 | 1): SP[] {
    const s = this.setups[i];
    const chart = depthChart(s.players, s.strategy);
    const rot = clamp(s.strategy.rotation || 9, 7, 11);
    const mins = MINUTES_BY_ROT[rot];
    const motivation = s.coachMotivation;
    return chart.map((p, idx) => {
      const moraleMod = (p.morale - 65) * 0.06 + motivation * 0.15;
      const r = { ...p.ratings };
      for (const k of Object.keys(r) as (keyof Ratings)[]) r[k] = r[k] + moraleMod;
      let usage = Math.exp((offSkill(r) - 60) * 0.042);
      if (p.traits.includes('diva')) usage *= 1.15;
      const box: BoxPlayer = {
        id: p.id, name: `${p.first} ${p.last}`, pos: p.pos, num: p.num, starter: idx < 5,
        min: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pm: 0,
      };
      return {
        p, r, on: idx < 5, energy: 100, fouls: 0, secs: 0,
        target: mins[idx] ?? 0, depth: idx, usage, base: usage, box, out: false,
        short: `${p.first[0]}. ${p.last}`,
      };
    });
  }

  /** Resolve schemes, fit, familiarity and tendencies for one team */
  private computeMods(i: 0 | 1): TeamMods {
    const st = this.strategy[i], set = this.setups[i];
    const off = OFF[st.offense] ?? OFF.balanced, def = DEF[st.defense] ?? DEF.man;
    const famO = set.fam ? set.fam.off[off.id] ?? 30 : AI_FAMILIARITY;
    const famD = set.fam ? set.fam.def[def.id] ?? 30 : AI_FAMILIARITY;
    const pO = famPenalty(famO), pD = famPenalty(famD);
    let star: SP | null = null;
    for (const x of this.sp?.[i] ?? []) if (!star || x.base > star.base) star = x;
    const t = (v: number | undefined) => clamp(Math.round(v ?? 0), -2, 2);
    return {
      off, def,
      offExec: fitEdge(off.fit(set.players).score) + pO.make,
      offTov: pO.tov,
      defExec: -fitEdge(def.fit(set.players).score) * 0.875 - pD.make * 0.8,
      defTov: -pD.tov * 0.6,
      crash: t(st.crash), shotProfile: t(st.shotProfile), pressure: t(st.pressure), help: t(st.help),
      starId: star?.p.id ?? null,
    };
  }

  /** Who gets the ball depends on the offense */
  private applyUsage(i: 0 | 1) {
    const st = this.strategy[i], m = this.mods[i], team = this.sp[i];
    const handler = team.reduce<SP | null>((b, x) => (!b || x.r.hdl + x.r.pas > b.r.hdl + b.r.pas ? x : b), null);
    const roller = team.filter((x) => isBig(x.p.pos)).reduce<SP | null>((b, x) => (!b || Math.max(x.r.ath + x.r.ins, x.r.tp * 2) > Math.max(b.r.ath + b.r.ins, b.r.tp * 2) ? x : b), null);
    for (const x of team) {
      let u = x.base;
      const big = isBig(x.p.pos);
      switch (m.off.id) {
        case 'post': if (big) u *= 1.25; break;
        case 'three': if (x.r.tp > 70) u *= 1.12; break;
        case 'drive': if ((x.r.ins + x.r.spd) / 2 > 68) u *= 1.1; break;
        case 'princeton': u = Math.pow(u, 0.7); break;
        case 'motion': u = Math.pow(u, 0.85); break;
        case 'flex': if (x.p.pos === 'SF' || x.p.pos === 'PF') u *= 1.12; break;
        case 'pnr': if (x === handler) u *= 1.22; else if (x === roller) u *= 1.12; break;
        case 'iso': u *= x.p.id === m.starId ? 1.5 : 0.92; break;
        case 'pace': if (isGuard(x.p.pos)) u *= 1.05; break;
      }
      if (x.p.pos === 'C' && m.off.id !== 'post' && !(m.off.id === 'pnr' && x === roller)) u *= 0.82;
      if (st.goTo && x.p.id === st.goTo) u *= 1.3;
      x.usage = u;
    }
  }

  // ---------------- public controls ----------------
  setStrategy(team: 0 | 1, s: Partial<Strategy>) {
    this.strategy[team] = { ...this.strategy[team], ...s };
    this.mods[team] = this.computeMods(team);
    this.applyUsage(team);
  }
  callTimeout(team: 0 | 1): boolean {
    if (this.timeouts[team] <= 0 || this.done) return false;
    this.pendingTO[team] = true;
    return true;
  }
  onCourt(team: 0 | 1): SP[] {
    return this.court[team];
  }
  private syncCourt(team: 0 | 1) {
    this.court[team] = this.sp[team].filter((x) => x.on);
  }
  get regulationOver() { return this.t >= REG; }
  get secsLeftInPeriod() { return Math.max(0, this.periodEnd - this.t); }
  get clockStr() { return fmtClock(this.secsLeftInPeriod); }
  periodLabel(): string {
    if (this.period === 1) return '1st';
    if (this.period === 2) return '2nd';
    return this.period === 3 ? 'OT' : `${this.period - 2}OT`;
  }

  /** Simulate one possession; returns new events (pbp mode) */
  step(): PlayEvent[] {
    if (this.done) return [];
    const start = this.events.length;
    if (!this.started) {
      this.started = true;
      const w = this.poss;
      this.emit(-1, 'jump', `Tip-off! ${this.setups[w].abbr} wins the opening tip.`);
    }
    this.possession();
    this.afterPossession();
    return this.events.slice(start);
  }

  run(): BoxScore {
    let guard = 0;
    while (!this.done && guard++ < 1000) this.step();
    return this.boxScore();
  }

  // ---------------- internals ----------------
  private emit(team: 0 | 1 | -1, kind: PlayKind, text: string, extra: Partial<PlayEvent> = {}) {
    if (!this.pbp) return;
    this.events.push({
      id: this.eid++, t: this.t, period: this.period, clock: this.clockStr, team, kind, text,
      score: [this.score[0], this.score[1]], ...extra,
    });
  }

  private pace(): number {
    const tempoPace = (tp: number) => [0, 62.5, 66, 69, 72.5, 76][clamp(Math.round(tp), 1, 5)];
    const [a, b] = this.mods;
    return (tempoPace(this.strategy[0].tempo) + tempoPace(this.strategy[1].tempo)) / 2 + (a.off.pace + a.def.pace + b.off.pace + b.def.pace) / 2;
  }

  private advance(dur: number) {
    const before = this.t;
    this.t += dur;
    for (const team of [0, 1] as const) {
      const m = this.mods[team];
      const tempoDrain = (1 + (this.strategy[team].tempo - 3) * 0.08 + m.def.drain + m.pressure * 0.04) * (this.setups[team].staminaMul ?? 1);
      for (const x of this.sp[team]) {
        if (x.on) {
          x.secs += dur;
          x.energy = clamp(x.energy - (dur / 60) * (2.3 - x.r.sta * 0.012) * tempoDrain, 0, 100);
        } else {
          x.energy = clamp(x.energy + (dur / 60) * 3.6, 0, 100);
        }
      }
    }
    // media timeout marks (16:00, 12:00, 8:00, 4:00 each half)
    if (this.period <= 2) {
      const base = (this.period - 1) * HALF;
      for (const m of [240, 480, 720, 960]) {
        const mark = base + m;
        if (before < mark && this.t >= mark) this.mediaMarks.add(mark);
      }
    }
  }

  private trailingMargin(team: 0 | 1) {
    return this.score[1 - team] - this.score[team];
  }

  private finalPeriod() {
    return this.period >= 2;
  }

  private possession() {
    const o = this.poss;
    const d = (1 - o) as 0 | 1;
    this.possCount[o]++;
    let putback = false;
    let transition = this.nextTransition;
    this.nextTransition = false;
    let shotClock = 30;
    for (let seg = 0; seg < 6; seg++) {
      const remaining = this.periodEnd - this.t;
      if (remaining <= 1) { this.t = this.periodEnd; return; }
      const lead = this.score[o] - this.score[d];

      // ---- intentional foul by trailing defense late ----
      if (this.finalPeriod() && remaining <= 40 && lead >= 1 && lead <= 9 && remaining > 3) {
        const dur = Math.min(remaining - 0.5, rng.range(2, 6));
        this.advance(dur);
        const fouler = this.pickFouler(d, true);
        const shooter = this.pickFTShooter(o);
        this.commitFoul(d, fouler, `${fouler.short} fouls ${shooter.short} intentionally to stop the clock`);
        const res = this.shootFTs(o, shooter, 2);
        if (res === 'orb') { putback = true; shotClock = 20; continue; }
        return;
      }

      // ---- time used this segment ----
      const avgSec = 2400 / (2 * this.pace());
      let dur: number;
      if (putback) dur = rng.range(2, 7);
      else if (transition) dur = rng.range(4, 9);
      else dur = clamp(rng.normal(avgSec + 0.5, 5.2), 5, Math.min(shotClock, 30));
      // milk clock when leading late
      const milk = this.finalPeriod() && lead > 0 && remaining < 70;
      if (milk && !putback) dur = Math.min(Math.max(dur, 24), shotClock - 1);
      // trailing late: hurry
      if (this.finalPeriod() && lead < 0 && remaining < 60 && !putback) dur = Math.min(dur, rng.range(4, 10));

      let buzzer = false;
      if (dur >= remaining - 0.3) {
        dur = Math.max(0, remaining - rng.range(0.2, 1.5));
        buzzer = true;
      }
      this.advance(dur);
      shotClock -= dur;

      // ---- turnover ----
      if (!buzzer && this.turnover(o, d, transition)) return;

      // ---- non-shooting foul ----
      if (!buzzer && rng.chance(Math.max(0.03, 0.075 + this.mods[d].def.foul + this.mods[d].pressure * 0.008))) {
        const fouler = this.pickFouler(d, false);
        this.commitFoul(d, fouler, `Foul on ${fouler.short}`);
        if (this.teamFouls[d] >= 7) {
          const shooter = this.pickShooter(o);
          const res = this.teamFouls[d] >= 10 ? this.shootFTs(o, shooter, 2) : this.shootFTs(o, shooter, 2, true);
          if (res === 'orb') { putback = true; shotClock = 20; continue; }
          return;
        }
        shotClock = Math.max(shotClock, 20);
        continue;
      }

      // ---- shot ----
      const forceThree = this.finalPeriod() && lead >= -3 && lead <= -3 && remaining < 15;
      const res = this.shoot(o, d, { transition, putback, buzzer, forceThree });
      if (buzzer) { this.t = this.periodEnd; return; }
      if (res === 'orb') {
        putback = true;
        transition = false;
        shotClock = 20;
        continue;
      }
      return;
    }
  }

  private turnover(o: 0 | 1, d: 0 | 1, transition: boolean): boolean {
    const on = this.onCourt(o), don = this.onCourt(d);
    let secN = 0, secD = 0, pressure = 0, fatigue = 0;
    for (const x of on) { secN += (x.r.hdl * 0.55 + x.r.pas * 0.2 + x.r.iq * 0.25) * x.usage; secD += x.usage; fatigue += Math.max(0, 70 - x.energy); }
    for (const x of don) pressure += x.r.stl * 0.5 + x.r.perD * 0.5;
    const sec = secN / secD;
    pressure /= don.length;
    fatigue /= on.length;
    let p = 0.16 + (pressure - sec) * 0.0012 + fatigue * 0.002;
    const mo = this.mods[o], md = this.mods[d];
    p += md.def.tov + md.defTov + mo.off.tov + mo.offTov + md.pressure * 0.006;
    if (transition) p += 0.02;
    if (!this.neutral) p += o === 0 ? -0.006 : 0.006;
    p -= this.setups[o].coachTactics * 0.0015;
    p += this.setups[d].pressure ?? 0;
    p = clamp(p, 0.07, 0.32);
    if (!rng.chance(p)) return false;
    const culprit = pickW(on, (x) => x.usage * (1.35 - x.r.hdl / 100));
    culprit.box.tov++;
    const pSteal = clamp(0.5 + (pressure - 60) * 0.008 + md.def.steal + md.pressure * 0.04, 0.3, 0.75);
    if (rng.chance(pSteal)) {
      const thief = pickW(don, (x) => Math.exp((x.r.stl - 60) * 0.06));
      thief.box.stl++;
      this.nextTransition = rng.chance(0.55);
      if (this.pbp) this.emit(d, 'steal', rng.pick([
        `${thief.short} picks the pocket of ${culprit.short}!`,
        `Steal by ${thief.short} — jumps the passing lane!`,
        `${culprit.short} loses it, ${thief.short} with the steal`,
      ]), { pid: thief.p.id, big: this.nextTransition });
    } else {
      if (this.pbp) this.emit(o, 'tov', rng.pick([
        `Turnover — ${culprit.short} travels`,
        `Offensive foul on ${culprit.short}`,
        `${culprit.short} throws it away`,
        `Shot clock violation on ${this.setups[o].abbr}`,
        `${culprit.short} steps out of bounds`,
        `Bad pass by ${culprit.short}`,
      ]), { pid: culprit.p.id });
      this.deadBall();
    }
    this.runPts[d] += 0;
    return true;
  }

  private pickShooter(o: 0 | 1): SP {
    const boxed = this.mods[1 - o].def.id === 'boxone' ? this.mods[o].starId : null;
    return pickW(this.onCourt(o), (x) => (x.p.id === boxed ? x.usage * 0.7 : x.usage));
  }
  private pickFTShooter(o: 0 | 1): SP {
    const on = this.onCourt(o);
    if (rng.chance(0.6)) { let b = on[0]; for (const x of on) if (x.r.ft > b.r.ft) b = x; return b; }
    return this.pickShooter(o);
  }
  private pickFouler(d: 0 | 1, intentional: boolean): SP {
    return pickW(this.onCourt(d), (x) => (intentional ? 1 : (1.4 - x.r.perD / 100) * (x.p.traits.includes('hothead') ? 1.4 : 1) * (x.fouls >= 4 ? 0.3 : 1)));
  }

  private commitFoul(d: 0 | 1, fouler: SP, text: string) {
    fouler.fouls++;
    fouler.box.pf++;
    this.teamFouls[d]++;
    if (this.pbp) this.emit(d, 'foul', text + (fouler.fouls >= 4 && fouler.fouls < 5 ? ` (${fouler.fouls} fouls)` : ''), { pid: fouler.p.id });
    if (fouler.fouls >= 5) {
      fouler.out = true;
      this.emit(d, 'foul', `${fouler.short} has fouled out!`, { pid: fouler.p.id, big: true });
      if (fouler.on) this.forceSub(d, fouler);
    }
  }

  private forceSub(team: 0 | 1, outP: SP) {
    const bench = this.sp[team].filter((x) => !x.on && !x.out);
    if (!bench.length) return;
    const sameType = bench.filter((x) => isBig(x.p.pos) === isBig(outP.p.pos));
    const pool = sameType.length ? sameType : bench;
    const inP = pool.sort((a, b) => b.p.ovr + b.energy * 0.1 - (a.p.ovr + a.energy * 0.1))[0];
    outP.on = false;
    inP.on = true;
    this.syncCourt(team);
    if (this.pbp) this.emit(team, 'sub', `${inP.short} checks in for ${outP.short}`);
  }

  private chooseType(x: SP, o: 0 | 1, d: 0 | 1, ctx: { putback: boolean; transition: boolean; forceThree: boolean; buzzer: boolean }): ShotType {
    if (ctx.forceThree) return 'three';
    if (ctx.putback) return rng.chance(0.82) ? 'rim' : 'mid';
    if (ctx.buzzer && this.periodEnd - this.t < 2.5) return 'three';
    const r = x.r;
    const fin = r.ins * 0.6 + r.ath * 0.25 + r.str * 0.15;
    let wr = Math.exp((fin - 60) * 0.04) * 1.0;
    let wm = Math.exp((r.mid - 60) * 0.035) * 0.62;
    let wt = r.tp < 45 ? 0.02 : Math.exp((r.tp - 60) * 0.075) * 1.05;
    const mo = this.mods[o], md = this.mods[d];
    // the post offense feeds the bigs; everybody else just plays inside-out
    wr *= mo.off.id === 'post' ? (isBig(x.p.pos) ? 1.35 : 1.05) : mo.off.mix.rim;
    wm *= mo.off.mix.mid;
    wt *= mo.off.mix.three;
    wr *= md.def.mix.rim; wm *= md.def.mix.mid; wt *= md.def.mix.three;
    wt *= 1 + 0.12 * mo.shotProfile; wr *= 1 - 0.07 * mo.shotProfile; wm *= 1 - 0.05 * mo.shotProfile;
    wt *= 1 + 0.06 * md.help; wr *= 1 - 0.05 * md.help;
    if (ctx.transition) { wr *= 1.8; wt *= 1.1; }
    return rng.weighted<ShotType>(['rim', 'mid', 'three'], [wr, wm, wt]);
  }

  private matchup(x: SP, d: 0 | 1): SP {
    const don = this.onCourt(d);
    const same = don.filter((y) => y.p.pos === x.p.pos);
    if (same.length) return same[0];
    const sim = don.filter((y) => isBig(y.p.pos) === isBig(x.p.pos));
    return (sim.length ? sim : don)[0];
  }

  private shoot(o: 0 | 1, d: 0 | 1, ctx: { transition: boolean; putback: boolean; buzzer: boolean; forceThree: boolean }): 'made' | 'orb' | 'drb' | 'ft' {
    const shooter = ctx.putback && rng.chance(0.65)
      ? pickW(this.onCourt(o), (x) => Math.exp((x.r.reb - 60) * 0.05))
      : this.pickShooter(o);
    const type = this.chooseType(shooter, o, d, ctx);
    const def = this.matchup(shooter, d);
    const don = this.onCourt(d);
    const r = shooter.r;
    const remaining = this.periodEnd - this.t;
    const lead = this.score[o] - this.score[d];
    const mo = this.mods[o], md = this.mods[d];

    // --- make probability ---
    let p: number;
    if (type === 'rim') {
      const fin = r.ins * 0.55 + r.ath * 0.25 + r.str * 0.2;
      let prot = 0;
      for (const y of don) prot = Math.max(prot, y.r.intD * 0.6 + y.r.blk * 0.4);
      const rimD = prot * 0.45 + (def.r.intD * 0.5 + def.r.perD * 0.5) * 0.55;
      p = 0.575 + (fin - rimD) * 0.0026;
      if (ctx.transition) p += 0.1;
      if (ctx.putback) p += 0.03;
      p += md.pressure * 0.006 - md.help * 0.008;
    } else if (type === 'mid') {
      p = 0.385 + (r.mid - def.r.perD) * 0.0021;
    } else {
      p = 0.322 + (r.tp - (def.r.perD * 0.6 + 62 * 0.4)) * 0.0026;
      if (ctx.transition) p += 0.03;
      p += md.help * 0.006;
    }
    // schemes: what each system does, how well it's run, and how they match up
    p += mo.off.make[type] + md.def.make[type] + mo.offExec + md.defExec + counterEdge(mo.off.id, md.def.id);
    if (md.def.id === 'boxone' && shooter.p.id === mo.starId) p -= 0.025;
    p += (r.iq - 65) * 0.0006;
    p += this.setups[o].coachTactics * 0.0018 - this.setups[d].coachTactics * 0.0012 - (this.setups[d].defBonus ?? 0);
    p -= Math.max(0, 72 - shooter.energy) * 0.0022;
    if (!this.neutral) p += (o === 0 ? 1 : -1) * (0.008 + this.crowd * 0.008);
    if (this.runPts[o] >= 7) p += 0.012; // momentum
    const clutchTime = this.finalPeriod() && remaining < 150 && Math.abs(lead) <= 6;
    if (clutchTime) {
      if (shooter.p.traits.includes('clutch')) p += 0.05;
      else p -= (70 - Math.min(70, r.iq)) * 0.001;
    }
    if (ctx.buzzer && remaining < 2.5) p *= type === 'three' ? 0.45 : 0.6;
    p = clamp(p, 0.08, 0.86);

    const three = type === 'three';
    const dist = type === 'rim' ? rng.range(0, 4) : type === 'mid' ? rng.range(8, 19) : rng.range(22, 26.5);

    // --- shooting foul ---
    let pFoul = type === 'rim' ? 0.215 + (r.ins + r.str - def.r.intD - def.r.str) * 0.001 : type === 'mid' ? 0.065 : 0.018;
    if (def.p.traits.includes('hothead')) pFoul *= 1.25;
    pFoul *= mo.off.foulDraw * md.def.shootFoul;
    if (!this.neutral) pFoul *= o === 0 ? 1.06 : 0.94;
    pFoul = clamp(pFoul, 0.005, 0.3);
    const fouled = !ctx.buzzer && rng.chance(pFoul);

    // --- block ---
    const blocker = type !== 'three' ? pickW(don, (y) => Math.exp((y.r.blk - 60) * 0.07)) : def;
    const pBlk = type === 'rim' ? clamp(0.075 + (blocker.r.blk - r.ath * 0.5 - r.ins * 0.5 + 10) * 0.0028, 0.02, 0.2) : type === 'mid' ? 0.03 : 0.008;

    const loc = this.shotLoc(type, dist);
    if (fouled) {
      this.commitFoul(d, def, `Shooting foul on ${def.short}`);
      const made = rng.chance(p * 0.42);
      if (made) {
        this.recordFG(o, shooter, type, true, loc, d);
        if (this.pbp) this.emit(o, 'make', `AND-ONE! ${shooter.short} ${this.makeText(shooter, type, null)} through the contact`, { pid: shooter.p.id, pts: three ? 3 : 2, shot: { ...loc, made: true, three }, big: true });
        const res = this.shootFTs(o, shooter, 1);
        return res === 'orb' ? 'orb' : res === 'drb' ? 'drb' : 'made';
      }
      const res = this.shootFTs(o, shooter, three ? 3 : 2);
      return res === 'orb' ? 'orb' : res === 'drb' ? 'drb' : 'ft';
    }

    if (type !== 'three' && rng.chance(pBlk)) {
      blocker.box.blk++;
      this.recordFG(o, shooter, type, false, loc, d);
      if (this.pbp) this.emit(d, 'block', rng.pick([`${blocker.short} SWATS ${shooter.short}!`, `Rejected! ${blocker.short} with the block`, `${blocker.short} protects the rim — blocked!`]), { pid: blocker.p.id, shot: { ...loc, made: false, three }, big: true });
      return this.rebound(o, d, 0.22);
    }

    const made = rng.chance(p);
    this.recordFG(o, shooter, type, made, loc, d);
    if (made) {
      let assister: SP | null = null;
      const pAst = (type === 'three' ? 0.8 : type === 'rim' ? 0.5 : 0.36) + mo.off.ast - (ctx.putback ? 0.4 : 0);
      if (rng.chance(clamp(pAst, 0, 0.9))) {
        assister = pickW(this.onCourt(o), (y) => (y === shooter ? 0 : Math.exp((y.r.pas - 60) * 0.07)));
        assister.box.ast++;
      }
      const pts = three ? 3 : 2;
      const lateBig = this.finalPeriod() && remaining < 30 && Math.abs(this.score[o] - this.score[d]) <= 3;
      const buzzerBeater = ctx.buzzer && remaining < 3;
      if (this.pbp) {
        let text = `${shooter.short} ${this.makeText(shooter, type, assister)}`;
        if (buzzerBeater) text = `AT THE BUZZER! ${text}!`;
        this.emit(o, 'make', text, { pid: shooter.p.id, pts, shot: { ...loc, made: true, three }, big: buzzerBeater || lateBig || (type === 'rim' && shooter.r.ath > 80 && rng.chance(0.3)) });
      }
      this.deadBall();
      return 'made';
    }
    if (this.pbp) this.emit(o, 'miss', `${shooter.short} ${this.missText(type, dist)}`, { pid: shooter.p.id, shot: { ...loc, made: false, three } });
    return this.rebound(o, d, 0);
  }

  private shotLoc(type: ShotType, dist: number): { x: number; y: number } {
    // half-court coords in feet: basket at (0, 5.25); x in [-25,25], y from baseline
    let ang: number;
    if (type === 'three' && rng.chance(0.3)) {
      // corner three
      const side = rng.chance(0.5) ? -1 : 1;
      return { x: side * rng.range(21.5, 23.5), y: rng.range(1, 8) };
    }
    ang = rng.range(-Math.PI * 0.48, Math.PI * 0.48);
    const x = Math.sin(ang) * dist;
    const y = 5.25 + Math.cos(ang) * dist;
    return { x: clamp(x, -24.5, 24.5), y: clamp(y, 0.5, 40) };
  }

  private makeText(x: SP, type: ShotType, ast: SP | null): string {
    const a = ast ? ` (${ast.short} assist)` : '';
    if (type === 'rim') {
      if (x.r.ath > 74 && rng.chance(0.35)) {
        if (ast && rng.chance(0.4)) return `throws down the alley-oop from ${ast.short}!`;
        return rng.pick(['throws it down! 💥', 'with a thunderous slam!', 'hammers home the dunk!']) + a;
      }
      return rng.pick(['finishes at the rim', 'scores in the post', 'with the layup', 'converts the reverse layup', 'drops in the floater', 'muscles it in']) + a;
    }
    if (type === 'mid') return rng.pick(['hits the pull-up jumper', 'drains the turnaround J', 'knocks down the elbow jumper', 'buries the fadeaway', 'hits from mid-range']) + a;
    return rng.pick(['drills the three! 🎯', 'BANG! From downtown', 'hits from the corner', 'cashes the triple', 'splashes a deep three', 'knocks down the open three']) + a;
  }

  private missText(type: ShotType, dist: number): string {
    if (type === 'rim') return rng.pick(['misses the layup', 'can’t finish at the rim', 'layup rolls off', 'misses in the paint']);
    if (type === 'mid') return `misses a ${Math.round(dist)}-footer`;
    return rng.pick(['misses the three', 'three rims out', 'airballs from deep', 'misses from beyond the arc']);
  }

  private recordFG(o: 0 | 1, x: SP, type: ShotType, made: boolean, loc: { x: number; y: number }, d: 0 | 1) {
    x.box.fga++;
    if (type === 'three') x.box.tpa++;
    if (this.pbp) this.shots.push({ team: o, x: Math.round(loc.x * 10) / 10, y: Math.round(loc.y * 10) / 10, made, three: type === 'three', pid: x.p.id });
    if (made) {
      x.box.fgm++;
      const pts = type === 'three' ? 3 : 2;
      if (type === 'three') x.box.tpm++;
      this.addPoints(o, x, pts);
    }
  }

  private addPoints(o: 0 | 1, x: SP, pts: number) {
    const d = (1 - o) as 0 | 1;
    x.box.pts += pts;
    this.score[o] += pts;
    for (const y of this.onCourt(o)) y.box.pm += pts;
    for (const y of this.onCourt(d)) y.box.pm -= pts;
    this.runPts[o] += pts;
    this.runPts[d] = 0;
    const lead = this.score[o] - this.score[d];
    if (lead > this.largestLead[o]) this.largestLead[o] = lead;
    const leader: -1 | 0 | 1 = this.score[0] === this.score[1] ? -1 : this.score[0] > this.score[1] ? 0 : 1;
    this.lastLeader = leader;
    if (this.pbp) this.flow.push([Math.round(this.t), this.score[0], this.score[1]]);
  }

  private shootFTs(o: 0 | 1, x: SP, n: number, oneAndOne = false): 'made' | 'orb' | 'drb' {
    const d = (1 - o) as 0 | 1;
    let p = clamp(x.r.ft / 100 * 0.95 + 0.035, 0.3, 0.95);
    const remaining = this.periodEnd - this.t;
    if (this.finalPeriod() && remaining < 60 && Math.abs(this.score[0] - this.score[1]) <= 5) {
      p += x.p.traits.includes('clutch') ? 0.04 : -0.03;
      if (!this.neutral && o === 1) p -= 0.015; // road crowd
    }
    let lastMade = false;
    const total = n;
    for (let i = 0; i < n; i++) {
      const made = rng.chance(p);
      x.box.fta++;
      if (made) {
        x.box.ftm++;
        this.addPoints(o, x, 1);
        if (this.pbp) this.emit(o, 'ft', `${x.short} makes free throw ${i + 1} of ${oneAndOne ? '1-and-1' : total}`, { pid: x.p.id, pts: 1 });
        if (oneAndOne && i === 0) n = 2;
      } else {
        if (this.pbp) this.emit(o, 'ftmiss', `${x.short} misses free throw ${i + 1} of ${oneAndOne ? '1-and-1' : total}`, { pid: x.p.id });
        if (oneAndOne && i === 0) { lastMade = false; break; }
      }
      lastMade = made;
    }
    if (lastMade) {
      this.deadBall();
      return 'made';
    }
    const res = this.rebound(o, d, -0.15);
    return res === 'orb' ? 'orb' : 'drb';
  }

  private rebound(o: 0 | 1, d: 0 | 1, mod: number): 'orb' | 'drb' {
    const on = this.onCourt(o), don = this.onCourt(d);
    const rs = (arr: SP[]) => { let s = 0; for (const x of arr) s += x.r.reb * 0.7 + x.r.str * 0.15 + x.r.ath * 0.15; return s / arr.length; };
    let p = 0.295 + (rs(on) - rs(don)) * 0.002 + mod;
    p += this.mods[o].off.orb + this.mods[d].def.orbAllowed + this.mods[o].crash * 0.022;
    p = clamp(p, 0.08, 0.5);
    if (rng.chance(p)) {
      const x = pickW(on, (y) => Math.exp((y.r.reb - 60) * 0.06));
      x.box.orb++;
      if (this.pbp) this.emit(o, 'oreb', `${x.short} grabs the offensive rebound`, { pid: x.p.id });
      return 'orb';
    }
    const x = pickW(don, (y) => Math.exp((y.r.reb - 60) * 0.06));
    x.box.drb++;
    if (this.pbp) this.emit(d, 'dreb', `${x.short} with the defensive board`, { pid: x.p.id });
    // leaking out vs crashing: the rebounding team runs more when the shooters crashed
    if (rng.chance(clamp(0.14 * this.mods[d].off.transition + this.mods[o].crash * 0.03, 0.02, 0.4))) this.nextTransition = true;
    return 'drb';
  }

  private deadBall() {
    // Process timeouts / media timeouts / subs at dead balls
    for (const team of [0, 1] as const) {
      if (this.pendingTO[team] && this.timeouts[team] > 0) {
        this.pendingTO[team] = false;
        this.timeouts[team]--;
        this.runPts[1 - team] = 0;
        for (const x of this.sp[team]) x.energy = clamp(x.energy + 6, 0, 100);
        this.emit(team, 'timeout', `Timeout, ${this.setups[team].name}.`);
        this.subs(team, true);
      }
    }
    // AI timeout on opponent run
    for (const team of [0, 1] as const) {
      const opp = (1 - team) as 0 | 1;
      if (this.runPts[opp] >= 9 && this.timeouts[team] > 1 && !this.setupsIsUser(team) && this.t < REG - 120) {
        this.timeouts[team]--;
        this.runPts[opp] = 0;
        for (const x of this.sp[team]) x.energy = clamp(x.energy + 6, 0, 100);
        this.emit(team, 'timeout', `${this.setups[team].abbr} calls timeout to stop a ${this.score[opp]}-${this.score[team]} run.`);
        this.subs(team, true);
      }
    }
    if (this.mediaMarks.size) {
      this.mediaMarks.clear();
      for (const team of [0, 1] as const) for (const x of this.sp[team]) x.energy = clamp(x.energy + 5, 0, 100);
      this.emit(-1, 'media', `Media timeout — ${this.setups[0].abbr} ${this.score[0]}, ${this.setups[1].abbr} ${this.score[1]}`);
      this.subs(0, true);
      this.subs(1, true);
      return;
    }
    for (const team of [0, 1] as const) {
      if (this.t - this.lastSub[team] >= (this.pbp ? 50 : 70)) this.subs(team, false);
    }
  }

  userTeam: -1 | 0 | 1 = -1;
  private setupsIsUser(team: 0 | 1) { return this.userTeam === team; }

  private subs(team: 0 | 1, force: boolean) {
    this.lastSub[team] = this.t;
    const all = this.sp[team].filter((x) => !x.out && x.p.injury == null);
    if (all.length <= 5) return;
    const remaining = this.periodEnd - this.t;
    const margin = Math.abs(this.score[0] - this.score[1]);
    const late = (this.period >= 2 && remaining < 240 && margin <= 12) || this.period >= 3;
    const garbage = this.period >= 2 && remaining < 330 && margin >= 22;
    const elapsedFrac = Math.min(this.t, REG) / REG;
    let avgOvr = 0;
    for (const x of all) avgOvr += x.p.ovr;
    avgOvr /= all.length;
    const prio = (x: SP): number => {
      if (garbage) return x.depth + (x.on ? 0.5 : 0) + x.energy * 0.01;
      const trouble =
        (this.period === 1 && x.fouls >= 2 && remaining > 120) ||
        (this.period === 2 && x.fouls >= 3 && remaining > 600) ||
        (this.period === 2 && x.fouls >= 4 && remaining > 240);
      if (late) return x.p.ovr * 1 + x.energy * 0.12 - (x.fouls >= 4 ? 4 : 0) + (x.target > 0 ? 3 : -20);
      if (x.target <= 0) return -50 + x.p.ovr * 0.1;
      const expected = x.target * elapsedFrac;
      const deficit = expected - x.secs / 60;
      let s = deficit * 1.0 + (x.energy - 72) * 0.07 + (x.p.ovr - avgOvr) * 0.05;
      if (x.on) s += 0.9; // hysteresis
      if (trouble) s -= 8;
      return s;
    };
    const scored = all.map((x) => ({ x, s: prio(x) }));
    scored.sort((a, b) => b.s - a.s);
    const ordered = scored.map((o) => o.x);
    // fast path: same five as now
    let same = true;
    for (let i = 0; i < 5; i++) if (!ordered[i].on) { same = false; break; }
    if (same && !force) return;
    const lineup = pickLineup(ordered);
    const changes: [SP, SP][] = [];
    const outs = this.sp[team].filter((x) => x.on && !lineup.includes(x));
    const ins = lineup.filter((x) => !x.on);
    for (let i = 0; i < Math.min(outs.length, ins.length); i++) changes.push([ins[i], outs[i]]);
    for (const x of this.sp[team]) x.on = lineup.includes(x);
    this.syncCourt(team);
    if (changes.length && this.pbp) {
      const txt = changes.map(([a, b]) => `${a.short} in for ${b.short}`).join(' · ');
      this.emit(team, 'sub', `Substitution ${this.setups[team].abbr}: ${txt}`);
    }
    void force;
  }

  private afterPossession() {
    // track lead change flair
    this.poss = (1 - this.poss) as 0 | 1;
    if (this.t >= this.periodEnd - 1) {
      this.endPeriod();
    }
  }

  private endPeriod() {
    if (this.period === 1) {
      this.halfScore = [this.score[0], this.score[1]];
      this.emit(-1, 'period', `End of 1st half: ${this.setups[0].abbr} ${this.score[0]}, ${this.setups[1].abbr} ${this.score[1]}`);
      this.period = 2;
      this.t = HALF;
      this.periodEnd = REG;
      this.teamFouls = [0, 0];
      for (const team of [0, 1] as const) {
        for (const x of this.sp[team]) x.energy = clamp(x.energy + 35, 0, 100);
        // restart with starters-ish
        this.restartLineup(team);
      }
      this.poss = rng.chance(0.5) ? 0 : 1;
      return;
    }
    if (this.score[0] === this.score[1]) {
      this.emit(-1, 'period', `End of ${this.periodLabel()} — tied at ${this.score[0]}. We're going to overtime!`, { big: true });
      this.period++;
      this.t = this.periodEnd;
      this.periodEnd += OT;
      this.timeouts = [Math.min(this.timeouts[0] + 1, 3), Math.min(this.timeouts[1] + 1, 3)];
      for (const team of [0, 1] as const) for (const x of this.sp[team]) x.energy = clamp(x.energy + 10, 0, 100);
      this.poss = rng.chance(0.5) ? 0 : 1;
      return;
    }
    this.done = true;
    const w = this.score[0] > this.score[1] ? 0 : 1;
    this.emit(-1, 'final', `FINAL${this.period > 2 ? (this.period === 3 ? '/OT' : `/${this.period - 2}OT`) : ''}: ${this.setups[w].name} wins ${Math.max(...this.score)}-${Math.min(...this.score)}`, { big: true });
  }

  private restartLineup(team: 0 | 1) {
    const avail = this.sp[team].filter((x) => !x.out);
    const ordered = [...avail].sort((a, b) => a.depth - b.depth - (b.energy - a.energy) * 0.01);
    const lineup = pickLineup(ordered.filter((x) => x.fouls < 4).concat(ordered.filter((x) => x.fouls >= 4)));
    for (const x of this.sp[team]) x.on = lineup.includes(x);
    this.syncCourt(team);
    this.lastSub[team] = this.t;
  }

  boxScore(): BoxScore {
    const players = this.sp.map((team) =>
      team
        .filter((x) => x.secs > 0 || x.box.starter)
        .map((x) => ({ ...x.box, min: Math.round(x.secs / 60) })),
    ) as [BoxPlayer[], BoxPlayer[]];
    return {
      gameId: '',
      home: this.setups[0].id,
      away: this.setups[1].id,
      hs: this.score[0],
      as: this.score[1],
      ot: Math.max(0, this.period - 2),
      poss: Math.round((this.possCount[0] + this.possCount[1]) / 2),
      players,
      half: this.halfScore,
      flow: this.flow,
      largestLead: this.largestLead,
      shots: this.shots,
    };
  }

  /** Win probability for home team using score, time and a pregame spread (home margin) */
  winProb(pregameSpread: number): number {
    const remaining = Math.max(0, REG - this.t) + (this.period > 2 ? this.periodEnd - this.t : 0);
    const frac = remaining / REG;
    const margin = this.score[0] - this.score[1];
    if (this.done) return margin > 0 ? 1 : 0;
    const mu = margin + pregameSpread * frac;
    const sd = Math.max(0.5, 11.5 * Math.sqrt(Math.max(frac, 0.0005)));
    return normCdf(mu / sd);
  }
}

export function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const dd = 0.3989423 * Math.exp((-z * z) / 2);
  let p = dd * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p;
}

export function simulateGame(home: SimTeamSetup, away: SimTeamSetup, opts: SimOptions = {}): BoxScore {
  const g = new GameSim(home, away, opts);
  return g.run();
}
