import { rng, clamp } from './rng';
import type { GameState, Player, Strategy, Team, TeamRecord, OffStyle, DefStyle, Coach } from './types';
import { teamOvr } from './player';
import type { SimTeamSetup } from './sim';
import type { ConferenceDef } from '../data/types';
import { staffEffects } from './staff';

export const ROSTER_MAX = 15;
export const ROSTER_MIN = 12;

export function emptyRecord(): TeamRecord {
  return { w: 0, l: 0, cw: 0, cl: 0, hw: 0, hl: 0, aw: 0, al: 0, nw: 0, nl: 0, streak: 0, pf: 0, pa: 0, poss: 0, q1w: 0, q1l: 0 };
}

export function teamPlayers(state: GameState, teamId: string): Player[] {
  const t = state.teams[teamId];
  if (!t) return [];
  return t.roster.map((id) => state.players[id]).filter(Boolean);
}

export function coachOf(state: GameState, teamId: string): Coach | undefined {
  const t = state.teams[teamId];
  return t ? state.coaches[t.coachId] : undefined;
}

export function refreshPower(state: GameState, team: Team): number {
  const ps = teamPlayers(state, team.id);
  const coach = state.coaches[team.coachId];
  team.power = Math.round((teamOvr(ps) + (coach ? (coach.skills.tactics - 5) * 0.25 : 0)) * 10) / 10;
  return team.power;
}

export function confTierOf(state: GameState, team: Team): number {
  return state.conferences.find((c) => c.id === team.conf)?.tier ?? 3;
}

/** Annual NIL + revenue-share pool for men's basketball (dollars) */
export function nilBudgetFor(team: Pick<Team, 'prestige' | 'market'>, conf: ConferenceDef | undefined, hype = 50): number {
  const tierMul = conf ? [0, 1.6, 1.0, 0.6, 0.4][conf.tier] : 0.6;
  let b = 20000 * Math.exp(team.prestige * 0.065) * (0.6 + team.market * 0.08) * tierMul;
  b *= 0.85 + hype / 333;
  return Math.round(b / 25000) * 25000 || 15000;
}

export function nilCommitted(state: GameState, teamId: string): number {
  return teamPlayers(state, teamId).reduce((s, p) => s + (p.nil?.amount ?? 0), 0);
}

export function autoStrategy(players: Player[], coach?: Coach): Strategy {
  const avail = players.filter((p) => !p.injury).sort((a, b) => b.ovr - a.ovr).slice(0, 8);
  const avg = (k: keyof Player['ratings']) => avail.reduce((s, p) => s + p.ratings[k], 0) / Math.max(1, avail.length);
  const tp = avg('tp'), ins = avg('ins'), spd = avg('spd'), perD = avg('perD'), stl = avg('stl'), ath = avg('ath'), pas = avg('pas');
  let offense: OffStyle = 'balanced';
  const bigIns = avail.filter((p) => p.pos === 'C' || p.pos === 'PF').reduce((m, p) => Math.max(m, p.ratings.ins), 0);
  if (tp - ins > 6) offense = 'three';
  else if (bigIns > 76 && bigIns - tp > 10) offense = 'post';
  else if (spd + ath > ins + tp + 8) offense = 'pace';
  else if (pas > 64) offense = 'motion';
  else if (ins > tp + 4) offense = 'drive';
  let defense: DefStyle = 'man';
  if (stl + spd > 140 && rng.chance(0.5)) defense = 'press';
  else if (perD < 58 && rng.chance(0.5)) defense = 'zone';
  else if (rng.chance(0.25)) defense = 'packline';
  else if (rng.chance(0.15)) defense = 'switch';
  const tempo = offense === 'pace' || defense === 'press' ? rng.int(4, 5) : offense === 'post' ? rng.int(1, 3) : rng.int(2, 4);
  void coach;
  return { offense, defense, tempo, starters: [], rotation: defense === 'press' ? 10 : 9 };
}

export function assignNumbers(state: GameState, team: Team) {
  const used = new Set<number>();
  const ps = teamPlayers(state, team.id);
  for (const p of ps) if (p.num > 0 && !used.has(p.num)) used.add(p.num); else p.num = 0;
  const pool = [0, 1, 2, 3, 4, 5, 10, 11, 12, 13, 14, 15, 20, 21, 22, 23, 24, 25, 30, 31, 32, 33, 34, 35, 40, 41, 42, 43, 44, 45, 50, 51, 52, 55, 3, 7, 8, 9];
  for (const p of ps) {
    if (p.num > 0) continue;
    const opts = pool.filter((n) => n > 0 && !used.has(n));
    p.num = opts.length ? rng.pick(opts) : rng.int(1, 99);
    used.add(p.num);
  }
}

export function simSetup(state: GameState, team: Team): SimTeamSetup {
  const coach = state.coaches[team.coachId];
  const players = teamPlayers(state, team.id).filter((p) => !p.injury && !p.redshirting);
  const base = {
    id: team.id,
    abbr: team.abbr,
    name: team.school,
    players,
    strategy: team.strategy,
    coachTactics: coach ? coach.skills.tactics : 5,
    coachMotivation: coach ? coach.skills.motivation : 5,
  };
  if (team.id !== state.user.teamId || !state.staff) return base;
  const e = staffEffects(state);
  return { ...base, coachTactics: base.coachTactics + e.tactics, coachMotivation: base.coachMotivation + e.motivation, defBonus: e.defense, pressure: e.pressure, staminaMul: e.stamina };
}

export function winPct(r: TeamRecord): number {
  const g = r.w + r.l;
  return g ? r.w / g : 0;
}

export function recordStr(r: TeamRecord, conf = false): string {
  return conf ? `${r.cw}-${r.cl}` : `${r.w}-${r.l}`;
}

/** Fans hype drifts with winning */
export function updateHype(team: Team, won: boolean, big: boolean) {
  const d = won ? (big ? 4 : 1.2) : big ? -3 : -1.5;
  team.hype = clamp(team.hype + d, 5, 100);
}
