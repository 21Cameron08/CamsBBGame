// NIL + revenue share: budgets, deals, AI allocation.
import { clamp } from './rng';
import type { GameState, Player, Team } from './types';
import { nilValue, roundMoney } from './player';
import { teamPlayers } from './team';

export function marketFor(state: GameState, teamId: string): number {
  return state.teams[teamId]?.market ?? 5;
}

export function playerValue(state: GameState, p: Player): number {
  return nilValue(p, p.teamId ? marketFor(state, p.teamId) : 5);
}

/** satisfaction ratio of current deal vs market value */
export function nilSatisfaction(state: GameState, p: Player): number {
  const v = Math.max(1000, playerValue(state, p));
  return (p.nil?.amount ?? 0) / v;
}

export function committedNil(state: GameState, teamId: string): number {
  return teamPlayers(state, teamId).reduce((s, p) => s + (p.nil?.amount ?? 0), 0);
}

/** recruits committed to team with promised NIL */
export function committedRecruitNil(state: GameState, teamId: string): number {
  let s = 0;
  for (const r of Object.values(state.recruits)) {
    if (r.committed !== teamId) continue;
    const e = r.schools.find((x) => x.teamId === teamId);
    s += e?.nilOffer ?? 0;
  }
  return s;
}

export function nilAvailable(state: GameState, teamId: string): number {
  const t = state.teams[teamId];
  return t.nilBudget - committedNil(state, teamId);
}

/** AI: spread ~92% of budget across roster weighted by value */
export function allocateAiNil(state: GameState, team: Team) {
  const ps = teamPlayers(state, team.id);
  const vals = ps.map((p) => Math.pow(playerValue(state, p), 0.9));
  const total = vals.reduce((a, b) => a + b, 0) || 1;
  const pool = team.nilBudget * 0.92;
  ps.forEach((p, i) => {
    const amt = roundMoney(Math.min(pool * (vals[i] / total), playerValue(state, p) * 1.15));
    p.nil = { amount: amt, years: 1 };
  });
}

/** Sign every unsigned user player at (up to) market value, best players first, within budget */
export function autoSignUnsigned(state: GameState): number {
  const team = state.teams[state.user.teamId];
  const unsigned = teamPlayers(state, team.id).filter((p) => !p.nil).sort((a, b) => b.ovr - a.ovr);
  let signed = 0;
  for (const p of unsigned) {
    const avail = nilAvailable(state, team.id);
    if (avail <= 0) { p.nil = { amount: 0, years: 1 }; continue; }
    const amt = roundMoney(Math.min(playerValue(state, p), avail));
    p.nil = { amount: amt, years: 2 };
    p.morale = clamp(p.morale + 4, 0, 100);
    signed++;
  }
  return signed;
}

export function setUserNil(state: GameState, playerId: string, amount: number, years: number): { ok: boolean; msg: string } {
  const p = state.players[playerId];
  if (!p || p.teamId !== state.user.teamId) return { ok: false, msg: 'Not on your roster.' };
  const before = p.nil?.amount ?? 0;
  const avail = nilAvailable(state, state.user.teamId) + before;
  if (amount > avail) return { ok: false, msg: 'Not enough NIL budget available.' };
  const val = playerValue(state, p);
  p.nil = { amount: roundMoney(amount), years: clamp(Math.round(years), 1, 4) };
  // morale reaction
  const ratio = amount / Math.max(1000, val);
  const delta = amount > before ? Math.min(15, (amount - before) / Math.max(5000, val) * 20) : -Math.min(20, (before - amount) / Math.max(5000, val) * 25);
  p.morale = clamp(p.morale + delta + (ratio >= 1 ? 2 : 0), 0, 100);
  return { ok: true, msg: `${p.first} ${p.last} signed for ${amount >= 1e6 ? `$${(amount / 1e6).toFixed(2)}M` : `$${Math.round(amount / 1000)}K`}/yr.` };
}
