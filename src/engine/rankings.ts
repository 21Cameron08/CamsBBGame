import { clamp } from './rng';
import type { GameState, Team } from './types';
import { normCdf } from './sim';

const HOME_ADJ = 3.2;
const BUBBLE = 9;

/** Convert roster power (team ovr) to a points-margin prior vs an average D1 team */
export function powerToPoints(power: number, mean: number): number {
  return (power - mean) * 1.15;
}

export function computeRatings(state: GameState) {
  const teams = Object.values(state.teams);
  const mean = teams.reduce((s, t) => s + t.power, 0) / teams.length;
  const games = state.schedule.filter((g) => g.played && (g.type !== 'exh'));
  const byTeam: Record<string, { opp: string; margin: number; site: number; won: boolean }[]> = {};
  for (const t of teams) byTeam[t.id] = [];
  for (const g of games) {
    if (!state.teams[g.home] || !state.teams[g.away]) continue;
    const m = (g.hs ?? 0) - (g.as ?? 0);
    const site = g.neutral ? 0 : 1;
    byTeam[g.home].push({ opp: g.away, margin: m, site, won: m > 0 });
    byTeam[g.away].push({ opp: g.home, margin: -m, site: -site, won: m < 0 });
  }
  // SRS iteration
  let R: Record<string, number> = {};
  for (const t of teams) R[t.id] = powerToPoints(t.power, mean);
  for (let it = 0; it < 25; it++) {
    const N: Record<string, number> = {};
    for (const t of teams) {
      const gl = byTeam[t.id];
      if (!gl.length) { N[t.id] = R[t.id]; continue; }
      let s = 0;
      for (const g of gl) s += clamp(g.margin - g.site * HOME_ADJ, -28, 28) + R[g.opp];
      N[t.id] = s / gl.length;
    }
    // normalize mean to 0
    const avg = Object.values(N).reduce((a, b) => a + b, 0) / teams.length;
    for (const k in N) N[k] -= avg;
    R = N;
  }
  // blend with prior
  for (const t of teams) {
    const gp = byTeam[t.id].length;
    const prior = powerToPoints(t.power, mean);
    const k = 5;
    t.srs = Math.round(R[t.id] * 10) / 10;
    t.rating = Math.round(((R[t.id] * gp + prior * k) / (gp + k)) * 10) / 10;
  }
  // WAB
  for (const t of teams) {
    let wab = 0;
    for (const g of byTeam[t.id]) {
      const opp = state.teams[g.opp];
      const p = normCdf((BUBBLE + g.site * HOME_ADJ - opp.rating) / 11);
      wab += (g.won ? 1 : 0) - p;
    }
    t.wab = Math.round(wab * 100) / 100;
  }
  // Quadrant-ish quality wins (vs top-50 rating)
  const sorted = [...teams].sort((a, b) => b.rating - a.rating);
  const top50 = new Set(sorted.slice(0, 50).map((t) => t.id));
  for (const t of teams) {
    t.record.q1w = byTeam[t.id].filter((g) => g.won && top50.has(g.opp)).length;
    t.record.q1l = byTeam[t.id].filter((g) => !g.won && !top50.has(g.opp) && state.teams[g.opp].rating < -2).length;
  }
  // NET rank
  const net = [...teams].sort((a, b) => netScore(b) - netScore(a));
  net.forEach((t, i) => (t.net = i + 1));
}

export function netScore(t: Team): number {
  return t.rating + t.wab * 0.55;
}
export function selectionScore(t: Team): number {
  return t.rating * 0.55 + t.wab * 1.7 + t.record.q1w * 0.4 - t.record.q1l * 0.8;
}

/** AP Top 25 voting */
export function runPoll(state: GameState, label: string): string[] {
  const teams = Object.values(state.teams);
  const preseason = state.schedule.every((g) => !g.played);
  for (const t of teams) {
    const g = t.record.w + t.record.l;
    let cur: number;
    if (preseason || g === 0) {
      cur = t.rating * 1.0 + t.prestige * 0.06;
    } else {
      cur = t.rating * 0.7 + t.wab * 1.4 + (t.record.w / g) * 6 - t.record.l * 0.35 + t.prestige * 0.02;
    }
    t.pollScore = preseason || !t.pollScore ? cur : t.pollScore * 0.35 + cur * 0.65;
  }
  const ranked = [...teams].sort((a, b) => b.pollScore - a.pollScore);
  for (const t of teams) { t.prevApRank = t.apRank; t.apRank = null; }
  const top = ranked.slice(0, 25);
  top.forEach((t, i) => (t.apRank = i + 1));
  const week = state.calendar[state.day]?.week ?? 0;
  state.polls.push({ day: state.day, week, ranks: top.map((t) => t.id), label });
  return top.map((t) => t.id);
}

export interface FieldEntry { teamId: string; seed: number; region: number; auto: boolean; firstFour: boolean; score: number; }
export const REGIONS = ['East', 'West', 'South', 'Midwest'];

/** Build the 68-team field. autoBids: conf id -> team id */
export function selectField(state: GameState, autoBids: Record<string, string>): FieldEntry[] {
  const teams = Object.values(state.teams);
  const autoSet = new Set(Object.values(autoBids));
  const autos = teams.filter((t) => autoSet.has(t.id));
  const atLarge = teams.filter((t) => !autoSet.has(t.id)).sort((a, b) => selectionScore(b) - selectionScore(a)).slice(0, 68 - autos.length);
  const lastFour = [...atLarge].sort((a, b) => selectionScore(a) - selectionScore(b)).slice(0, 4);
  const lowAutos = [...autos].sort((a, b) => selectionScore(a) - selectionScore(b)).slice(0, 4);
  const ffIds = new Set([...lastFour, ...lowAutos].map((t) => t.id));
  const direct = [...autos, ...atLarge].filter((t) => !ffIds.has(t.id)).sort((a, b) => selectionScore(b) - selectionScore(a));
  // seed lines: 1-10 x4, 11 x2 (+2 FF), 12-15 x4, 16 x2 (+2 FF)
  const lines: number[] = [];
  for (let s = 1; s <= 16; s++) {
    const n = s === 11 || s === 16 ? 2 : 4;
    for (let i = 0; i < n; i++) lines.push(s);
  }
  const out: FieldEntry[] = [];
  const regionLoad: Record<number, number[]> = {};
  direct.forEach((t, i) => {
    const seed = lines[i];
    out.push({ teamId: t.id, seed, region: -1, auto: autoSet.has(t.id), firstFour: false, score: selectionScore(t) });
  });
  // regions via S-curve snake
  for (let s = 1; s <= 16; s++) {
    const group = out.filter((e) => e.seed === s);
    const order = s % 2 === 1 ? [0, 1, 2, 3] : [3, 2, 1, 0];
    const free = order.filter((r) => !(regionLoad[s] ?? []).includes(r));
    group.forEach((e, i) => {
      // avoid same conference as the region's 1-seed when possible
      e.region = free[i % free.length];
      (regionLoad[s] ??= []).push(e.region);
    });
  }
  // First Four: 11-seeds (last four in) and 16-seeds (lowest autos), in the regions missing an entry
  const ff11 = lastFour.sort((a, b) => selectionScore(b) - selectionScore(a));
  const ff16 = lowAutos.sort((a, b) => selectionScore(b) - selectionScore(a));
  const missing = (seed: number) => [0, 1, 2, 3].filter((r) => !out.some((e) => e.seed === seed && e.region === r));
  const m11 = missing(11), m16 = missing(16);
  ff11.forEach((t, i) => out.push({ teamId: t.id, seed: 11, region: m11[Math.floor(i / 2)] ?? 0, auto: false, firstFour: true, score: selectionScore(t) }));
  ff16.forEach((t, i) => out.push({ teamId: t.id, seed: 16, region: m16[Math.floor(i / 2)] ?? 0, auto: true, firstFour: true, score: selectionScore(t) }));
  return out;
}

/** Projected auto bids = current conference leader */
export function projectedAutoBids(state: GameState): Record<string, string> {
  const res: Record<string, string> = {};
  for (const c of state.conferences) {
    const ts = Object.values(state.teams).filter((t) => t.conf === c.id);
    if (!ts.length) continue;
    ts.sort((a, b) => confPct(b) - confPct(a) || b.rating - a.rating);
    res[c.id] = ts[0].id;
  }
  return res;
}
function confPct(t: Team) {
  const g = t.record.cw + t.record.cl;
  return g ? t.record.cw / g : 0.5;
}

export function confStandings(state: GameState, confId: string): Team[] {
  return Object.values(state.teams)
    .filter((t) => t.conf === confId)
    .sort((a, b) => {
      const pa = confPct(a), pb = confPct(b);
      if (pb !== pa) return pb - pa;
      if (b.record.cw !== a.record.cw) return b.record.cw - a.record.cw;
      return b.rating - a.rating;
    });
}

/** Pregame point spread (home margin) */
export function spread(state: GameState, homeId: string, awayId: string, neutral: boolean): number {
  const h = state.teams[homeId], a = state.teams[awayId];
  return Math.round(((h.rating - a.rating) + (neutral ? 0 : HOME_ADJ)) * 2) / 2;
}
