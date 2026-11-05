// Player development: individual plans, spotlight players, weekly practice, season goals and the
// summer development report. AI programs keep the classic position-weighted development.
import { rng, clamp } from './rng';
import type { Archetype, DevFocus, DevelopmentState, DevReportRow, GameState, GoalKind, Player, PlayerGoal, PracticeFocus, RatingKey } from './types';
import { RATING_KEYS } from './types';
import { advanceClass, calcOvr, developPlayer, draftScore, ratingWeight, topRatings } from './player';
import { teamPlayers } from './team';
import { staffEffects } from './staff';
import { addNews, addSocial } from './media';
import { confStandings, selectionScore } from './rankings';
import { isHuman } from './league';

// ---------------- Plans ----------------
export const FOCUS_INFO: Record<DevFocus, { label: string; icon: string; desc: string; keys: RatingKey[] }> = {
  balanced: { label: 'Balanced', icon: '⚖️', desc: 'A little of everything, weighted toward what his position needs.', keys: [] },
  shooting: { label: 'Shooting', icon: '🎯', desc: 'Add range: three-point shooting, mid-range and free throws.', keys: ['tp', 'mid', 'ft'] },
  finishing: { label: 'Attack the Rim', icon: '💥', desc: 'Finishing, explosiveness and first-step speed.', keys: ['ins', 'ath', 'spd'] },
  playmaking: { label: 'Playmaking', icon: '🧠', desc: 'Run the offense: passing, handles and feel for the game.', keys: ['pas', 'hdl', 'iq'] },
  perimeterD: { label: 'Lockdown D', icon: '🔒', desc: 'On-ball defense, active hands and a motor that never stops.', keys: ['perD', 'stl', 'sta'] },
  interior: { label: 'Protect the Paint', icon: '🧱', desc: 'Interior defense, shot blocking and rebounding.', keys: ['intD', 'blk', 'reb'] },
  strength: { label: 'Weight Room', icon: '🏋️', desc: 'Strength, finishing through contact and owning the glass.', keys: ['str', 'ins', 'reb'] },
};
export const FOCUS_ORDER: DevFocus[] = ['balanced', 'shooting', 'finishing', 'playmaking', 'perimeterD', 'interior', 'strength'];
export const SPOTLIGHT_MAX = 3;
/** share of summer growth a focused plan pulls into its three ratings */
const FOCUS_SHARE = 0.25;

// ---------------- Practice ----------------
export interface PracticeInfo {
  label: string; icon: string; desc: string;
  /** in-season growth multiplier on each player's plan */
  growth: number;
  /** tactics bonus in games that week */
  tactics: number;
  /** injury risk multiplier */
  injury: number;
  /** stamina drain multiplier in games */
  stamina: number;
  /** morale change per week */
  morale: number;
}
export const PRACTICE_INFO: Record<PracticeFocus, PracticeInfo> = {
  balanced: { label: 'Standard Practice', icon: '🏀', desc: 'A normal week: drills, scrimmage and film. No edge, no cost.', growth: 0, tactics: 0, injury: 1, stamina: 1, morale: 0 },
  skill: { label: 'Skill Development', icon: '🛠️', desc: "Individual work on every player's plan. Less time spent preparing for opponents.", growth: 1, tactics: -0.8, injury: 1, stamina: 1, morale: 0 },
  gameprep: { label: 'Game Prep', icon: '📋', desc: "Scout the opponent, walk through their sets and rehearse late-game situations.", growth: 0, tactics: 2, injury: 0.9, stamina: 1, morale: 0 },
  conditioning: { label: 'Conditioning', icon: '🏃', desc: 'Sprints and stamina work. Builds lasting stamina, but tired bodies get hurt more.', growth: 0, tactics: -0.4, injury: 1.15, stamina: 0.96, morale: -0.5 },
  recovery: { label: 'Recovery Week', icon: '🛌', desc: 'Light practice, film and treatment. Injured players heal faster and spirits lift.', growth: 0, tactics: -0.4, injury: 0.6, stamina: 0.93, morale: 1.2 },
  intense: { label: 'Compete Week', icon: '🔥', desc: 'Full-contact scrimmages and live drills. Players improve fast, but tempers and bodies wear thin.', growth: 1.6, tactics: 0.6, injury: 1.35, stamina: 1.05, morale: -1.5 },
};
export const PRACTICE_ORDER: PracticeFocus[] = ['balanced', 'skill', 'gameprep', 'conditioning', 'recovery', 'intense'];

// ---------------- State ----------------
const IN_SEASON = ['preseason', 'regular', 'confTourney', 'selection', 'ncaa'];

export function devState(state: GameState): DevelopmentState {
  if (!state.development) {
    state.development = { plans: {}, spotlight: [], practice: 'balanced', practiceLog: {}, bank: {}, seasonGains: {}, goals: {}, goalsSeason: 0 };
  }
  return state.development;
}

/** Set up development for a save that doesn't have it yet (or a new dynasty) */
export function ensureDevelopment(state: GameState) {
  const dv = devState(state);
  if (IN_SEASON.includes(state.phase) && dv.goalsSeason !== state.season) {
    fillPlans(state);
    assignGoals(state);
  }
}

export function planOf(state: GameState, id: string): DevFocus {
  return state.development?.plans[id] ?? 'balanced';
}
export function isSpotlight(state: GameState, id: string): boolean {
  return !!state.development?.spotlight.includes(id);
}

export function devSkillFor(state: GameState): number {
  const coach = state.coaches[state.user.coachId];
  return (coach?.skills.development ?? 4) + (state.staff ? staffEffects(state).dev : 0);
}
function hasDevCoach(state: GameState) {
  return !!state.staff?.members.some((m) => m.role === 'development');
}

/** Players who just signed haven't played yet: their first summer is orientation, not development */
export function isNewcomer(p: Player) {
  return p.career.length === 0 && p.cls === 'FR' && p.stats.gp === 0;
}

function minutesShare(p: Player) {
  return p.stats.gp ? p.stats.min / Math.max(1, p.stats.gp) / 30 : 0.2;
}
/** weak ratings grow faster than strong ones */
function weakness(r: number) {
  return clamp(1.3 - (r - 45) / 90, 0.7, 1.3);
}
function youth(p: Player) {
  return p.age <= 19 ? 1.2 : p.age <= 20 ? 1.0 : p.age <= 21 ? 0.8 : 0.6;
}

// ---------------- Summer development ----------------
function summerGains(p: Player, devSkill: number, share: number, focus: DevFocus, spotlight: boolean, random: boolean): Record<RatingKey, number> {
  const room = Math.max(0, p.pot - p.ovr);
  const ageFactor = p.age <= 19 ? 1.15 : p.age <= 20 ? 1.0 : p.age <= 21 ? 0.8 : p.age <= 22 ? 0.6 : 0.4;
  let base = room * 0.32 * ageFactor + 0.8;
  base *= 1 + devSkill * 0.035;
  base *= 0.85 + Math.min(1, share) * 0.3;
  if (p.traits.includes('gymRat')) base *= 1.25;
  if (p.traits.includes('coachable')) base *= 1.1;
  if (spotlight) base *= 1.3;
  const sd = p.traits.includes('raw') ? 2.6 : 1.4;
  const delta = clamp(base + (random ? rng.normal(0, sd) : 0), -3, 14);
  const points = delta * 1.25;
  const gains = {} as Record<RatingKey, number>;
  for (const k of RATING_KEYS) gains[k] = points * (0.55 + ratingWeight(p.pos, k) * 6) * (random ? rng.range(0.4, 1.6) : 1) * 0.75;
  const keys = FOCUS_INFO[focus].keys;
  if (keys.length && delta > 0) {
    let total = 0;
    for (const k of RATING_KEYS) total += gains[k];
    for (const k of RATING_KEYS) gains[k] *= 1 - FOCUS_SHARE;
    // a summer can add a real skill, but not rebuild a player from scratch
    const cap = 3 + delta * 0.6;
    for (const k of keys) gains[k] += Math.min(cap, ((total * FOCUS_SHARE) / keys.length) * weakness(p.ratings[k]));
  }
  return gains;
}

export function focusKeys(p: Pick<Player, 'pos'>, focus: DevFocus): RatingKey[] {
  return focus === 'balanced' ? topRatings(p.pos, 3) : FOCUS_INFO[focus].keys;
}

/** Expected summer result for a plan (no luck involved) */
export function projectFocus(state: GameState, p: Player, focus: DevFocus, spotlight = isSpotlight(state, p.id)): { changes: [RatingKey, number][]; ovr: number } {
  const gains = summerGains(p, devSkillFor(state), minutesShare(p), focus, spotlight, false);
  const r = { ...p.ratings };
  for (const k of RATING_KEYS) r[k] = Math.round(clamp(r[k] + gains[k], 20, 99));
  return { changes: focusKeys(p, focus).map((k) => [k, r[k] - p.ratings[k]] as [RatingKey, number]), ovr: calcOvr(r, p.pos) - p.ovr };
}

/** The plan that adds the most overall */
export function recommendFocus(state: GameState, p: Player): DevFocus {
  let best: DevFocus = 'balanced', bestOvr = -99;
  for (const f of FOCUS_ORDER) {
    const o = projectFocus(state, p, f).ovr + (f === 'balanced' ? 0.01 : 0);
    if (o > bestOvr) { bestOvr = o; best = f; }
  }
  return best;
}

const ARCH_NEWS: Partial<Record<Archetype, string>> = {
  'Stretch Big': 'added a three-point shot', Sharpshooter: 'turned into a knockdown shooter', 'Point Forward': 'became a playmaker',
  'Floor General': 'took command of the offense', 'Rim Protector': 'became a shot-blocking force', '3&D Wing': 'became a 3-and-D wing',
  Slasher: 'became a downhill slasher', 'Rim Runner': 'became an above-the-rim finisher', 'Glass Cleaner': 'owns the glass now', 'Post Scorer': 'built a low-post game',
};
function maybeNewArchetype(p: Player, focus: DevFocus): Archetype | null {
  const r = p.ratings, a = p.archetype, big = p.pos === 'PF' || p.pos === 'C', wing = p.pos === 'SG' || p.pos === 'SF';
  const pick = (x: Archetype, ok: boolean) => (ok && a !== x ? x : null);
  switch (focus) {
    case 'shooting': return pick('Stretch Big', big && r.tp >= 60) ?? pick('Sharpshooter', wing && r.tp >= 78 && r.ft >= 72);
    case 'playmaking': return pick('Point Forward', (p.pos === 'SF' || p.pos === 'PF') && r.pas >= 70 && r.hdl >= 62) ?? pick('Floor General', p.pos === 'PG' && r.pas >= 78 && r.iq >= 72);
    case 'interior': return pick('Rim Protector', big && r.blk >= 76 && r.intD >= 74);
    case 'perimeterD': return pick('3&D Wing', wing && r.perD >= 76 && r.tp >= 62);
    case 'finishing': return pick('Slasher', !big && r.ins >= 76 && r.ath >= 74) ?? pick('Rim Runner', big && r.ath >= 78 && r.ins >= 74);
    case 'strength': return pick('Glass Cleaner', big && r.reb >= 80 && r.str >= 76) ?? pick('Post Scorer', big && r.ins >= 78 && r.str >= 75);
    default: return null;
  }
}

export function nbaRankOf(state: GameState, p: Player): number {
  const mine = draftScore(p);
  let rank = 1;
  for (const o of Object.values(state.players)) if (o.teamId && o.id !== p.id && draftScore(o) > mine) rank++;
  return rank;
}

/** Fill missing plans: your development coach drafts them, otherwise they start balanced */
export function fillPlans(state: GameState) {
  const dv = devState(state);
  const roster = teamPlayers(state, state.user.teamId);
  const ids = new Set(roster.map((p) => p.id));
  for (const id of Object.keys(dv.plans)) if (!ids.has(id)) delete dv.plans[id];
  dv.spotlight = dv.spotlight.filter((id) => ids.has(id));
  const auto = hasDevCoach(state);
  for (const p of roster) if (!dv.plans[p.id]) dv.plans[p.id] = auto && !isNewcomer(p) ? recommendFocus(state, p) : 'balanced';
}

/** Draft phase -> summer: plans can still change until workouts run */
export function beginSummer(state: GameState) {
  state.phase = 'progression';
  const dv = devState(state);
  fillPlans(state);
  dv.summer = { season: state.season, done: false, rows: [] };
}

export function summerDone(state: GameState): boolean {
  const s = state.development?.summer;
  if (s && s.season === state.season) return s.done;
  // saves from before plans existed developed on entering the phase
  return Object.keys(state.offseason?.progression ?? {}).length > 0;
}

/** Run summer workouts for every program */
export function runSummer(state: GameState, aiToo = true) {
  const os = state.offseason!;
  const dv = devState(state);
  const uid = state.user.teamId;
  const mine = teamPlayers(state, uid);
  const draftBefore = new Map(mine.filter((p) => p.elig > 1).map((p) => [p.id, nbaRankOf(state, p)]));
  const rows: DevReportRow[] = [];
  for (const t of Object.values(state.teams)) {
    const coach = state.coaches[t.coachId];
    if (!isHuman(state, t.id)) {
      if (!aiToo) continue;
      const dev = coach ? coach.skills.development : 4;
      for (const p of teamPlayers(state, t.id)) {
        if (isNewcomer(p)) continue;
        developPlayer(p, dev, minutesShare(p));
        advanceClass(p);
      }
      continue;
    }
    if (t.id !== uid) continue; // other humans run their own summer
    const dev = devSkillFor(state);
    for (const p of teamPlayers(state, t.id)) {
      const focus = planOf(state, p.id);
      const spotlight = isSpotlight(state, p.id);
      const keys = focusKeys(p, focus);
      const beforeR = { ...p.ratings };
      const row: DevReportRow = { id: p.id, name: `${p.first} ${p.last}`, pos: p.pos, cls: p.cls, focus, spotlight, before: p.ovr, after: p.ovr, pot: p.pot, changes: {} };
      if (isNewcomer(p)) {
        row.tag = 'newcomer';
        os.progression[p.id] = 0;
        rows.push(row);
        continue;
      }
      const gains = summerGains(p, dev, minutesShare(p), focus, spotlight, true);
      for (const k of RATING_KEYS) p.ratings[k] = Math.round(clamp(p.ratings[k] + gains[k], 20, 99));
      p.ovr = calcOvr(p.ratings, p.pos);
      p.pot = Math.round(clamp(p.pot + rng.normal(0, 2) - (p.age >= 22 ? 1 : 0), p.ovr, 99));
      const arch = maybeNewArchetype(p, focus);
      if (arch) { row.archetypeFrom = p.archetype; row.archetypeTo = arch; p.archetype = arch; p.history.push(`Summer ${state.season + 1}: ${ARCH_NEWS[arch] ?? `became a ${arch}`}`); }
      advanceClass(p);
      row.after = p.ovr;
      row.pot = p.pot;
      row.cls = p.cls;
      for (const k of keys) row.changes[k] = [beforeR[k], p.ratings[k]];
      const d = row.after - row.before;
      os.progression[p.id] = d;
      if (d >= 6) row.tag = 'breakout';
      else if (d <= 0 && p.age <= 21 && p.pot - p.ovr >= 8) row.tag = 'stalled';
      rows.push(row);
    }
  }
  for (const row of rows) {
    const p = state.players[row.id];
    if (!p || !draftBefore.has(row.id)) continue;
    const before = draftBefore.get(row.id)!, after = nbaRankOf(state, p);
    if (before <= 90 || after <= 90) { row.draftBefore = before; row.draftAfter = after; }
  }
  rows.sort((a, b) => (b.after - b.before) - (a.after - a.before));
  dv.summer = { season: state.season, done: true, rows };
  summerNews(state, rows);
}

function summerNews(state: GameState, rows: DevReportRow[]) {
  const team = state.teams[state.user.teamId];
  for (const r of rows.filter((x) => x.tag === 'breakout').slice(0, 2)) {
    const p = state.players[r.id];
    if (!p) continue;
    addNews(state, { kind: 'feature', headline: `${team.school}'s ${r.name} made a leap this summer`, body: `${r.name} went from ${r.before} to ${r.after} overall after a summer focused on ${FOCUS_INFO[r.focus].label.toLowerCase()}.${r.draftAfter && r.draftBefore && r.draftAfter < r.draftBefore && r.draftAfter <= 60 ? ` NBA scouts have noticed: he's climbed to No. ${r.draftAfter} on some big boards.` : ''}`, teams: [team.id], important: true, personId: p.id, personKind: 'player' });
    if (rng.chance(0.7)) addSocial(state, { handle: 'ThePaintPod', name: 'The Paint Podcast', verified: true, kind: 'analyst', text: `Whatever ${team.school} is doing in the gym, it's working. ${r.name} looks like a different player. 👀`, teamId: team.id, personId: p.id });
  }
  for (const r of rows.filter((x) => x.archetypeTo).slice(0, 2)) {
    const p = state.players[r.id];
    if (!p || r.tag === 'breakout') continue;
    addNews(state, { kind: 'feature', headline: `${r.name} ${ARCH_NEWS[r.archetypeTo as Archetype] ?? `is now a ${r.archetypeTo}`}`, body: `A summer of ${FOCUS_INFO[r.focus].label.toLowerCase()} work changed ${r.name}'s game. ${team.school}'s staff now sees him as a ${r.archetypeTo}.`, teams: [team.id], personId: p.id, personKind: 'player' });
  }
}

// ---------------- In-season practice ----------------
function bankGain(dv: DevelopmentState, p: Player, k: RatingKey, amt: number): boolean {
  const b = (dv.bank[p.id] ??= {});
  b[k] = (b[k] ?? 0) + amt;
  let changed = false;
  while ((b[k] ?? 0) >= 1) {
    b[k]! -= 1;
    if (p.ratings[k] >= 99) { b[k] = 0; break; }
    p.ratings[k] += 1;
    const sg = (dv.seasonGains[p.id] ??= {});
    sg[k] = (sg[k] ?? 0) + 1;
    changed = true;
  }
  return changed;
}

/** Apply last week's practice to the user's players (called on the weekly tick) */
export function weeklyPractice(state: GameState) {
  if (!IN_SEASON.includes(state.phase) || state.day <= 0) return;
  const dv = devState(state);
  const pr = PRACTICE_INFO[dv.practice];
  dv.practiceLog[dv.practice] = (dv.practiceLog[dv.practice] ?? 0) + 1;
  const dev = devSkillFor(state);
  for (const p of teamPlayers(state, state.user.teamId)) {
    if (pr.morale) {
      let m = pr.morale;
      if (m < 0) m *= p.traits.includes('gymRat') ? 0 : p.traits.includes('coachable') ? 0.5 : p.traits.includes('diva') || p.traits.includes('hothead') ? 1.6 : 1;
      p.morale = clamp(p.morale + m, 0, 100);
    }
    if (dv.practice === 'recovery' && p.injury) {
      p.injury.games -= 1;
      if (p.injury.games <= 0) p.injury = null;
    }
    if (p.injury) continue;
    let changed = false;
    if (pr.growth > 0) {
      const room = p.pot > p.ovr ? 1 : 0.25;
      const rate = 0.1 * pr.growth * youth(p) * room * (1 + dev * 0.03) * (isSpotlight(state, p.id) ? 1.3 : 1) * (p.traits.includes('gymRat') ? 1.2 : 1);
      for (const k of focusKeys(p, planOf(state, p.id))) changed = bankGain(dv, p, k, rate * weakness(p.ratings[k])) || changed;
    }
    if (dv.practice === 'conditioning') changed = bankGain(dv, p, 'sta', 0.3 * youth(p)) || changed;
    if (changed) p.ovr = calcOvr(p.ratings, p.pos);
  }
}

/** This week's practice effects on the user's games */
export function practiceMods(state: GameState): { tactics: number; stamina: number; injury: number } {
  const dv = state.development;
  if (!dv || !IN_SEASON.includes(state.phase)) return { tactics: 0, stamina: 1, injury: 1 };
  const pr = PRACTICE_INFO[dv.practice];
  return { tactics: pr.tactics, stamina: pr.stamina, injury: pr.injury };
}

/** Season rollover: clear in-season progress and set new goals */
export function devNewSeason(state: GameState) {
  const dv = devState(state);
  dv.bank = {};
  dv.seasonGains = {};
  dv.practiceLog = {};
  fillPlans(state);
  assignGoals(state);
}

// ---------------- Goals ----------------
const WIN_GOAL: Record<number, string> = {
  1: 'Finish in the top half of the conference', 2: 'Contend for a conference title', 3: 'Make the NCAA Tournament',
  4: 'Win an NCAA Tournament game', 5: 'Reach the Sweet 16', 6: 'Make the Final Four',
};
export const GOAL_ICON: Record<GoalKind, string> = { pro: '🏀', minutes: '⏱️', starter: '🔝', scoring: '🔥', winning: '🏆' };

export function assignGoals(state: GameState) {
  const dv = devState(state);
  dv.goals = {};
  dv.goalsSeason = state.season;
  const roster = teamPlayers(state, state.user.teamId).filter((p) => !p.redshirting).sort((a, b) => b.ovr - a.ovr);
  roster.forEach((p, rank) => {
    const nba = p.elig >= 1 ? nbaRankOf(state, p) : 999;
    let g: Omit<PlayerGoal, 'season'> | null;
    if (nba <= 45) g = nba <= 14 ? { kind: 'pro', target: 14, label: 'Stay a lottery-level prospect' } : { kind: 'pro', target: 30, label: 'Play his way into the first round' };
    else if (p.promise === 'starter' || p.promise === 'star') g = { kind: 'starter', target: 50, label: 'Start most games, as promised' };
    else if (p.elig <= 1 && rank < 9) { const lvl = clamp(state.user.expectationLevel - 1, 1, 6); g = { kind: 'winning', target: lvl, label: WIN_GOAL[lvl] }; }
    else if (rank < 5) { const t = [13, 11, 10, 9, 8][rank]; g = { kind: 'scoring', target: t, label: `Average ${t}+ points a game` }; }
    else if (rank < 9) { const t = [17, 12, 8, 5][rank - 5]; g = { kind: 'minutes', target: t, label: `Earn ${t}+ minutes a game` }; }
    else g = null; // end of the bench: just happy to be here
    if (g) dv.goals[p.id] = { ...g, season: state.season };
  });
}

export interface GoalStatus { text: string; pct: number; status: 'met' | 'missed' | 'onTrack' | 'behind' | 'pending' }

export function goalStatus(state: GameState, p: Player, g: PlayerGoal): GoalStatus {
  if (g.result) return { text: g.result === 'met' ? 'Goal met' : 'Goal missed', pct: g.result === 'met' ? 1 : 0.3, status: g.result };
  const gp = p.stats.gp;
  const per = (v: number) => (gp ? v / gp : 0);
  const track = (v: number, t: number, unit: string) => ({ text: gp ? `${v.toFixed(1)} ${unit} · goal ${t}` : 'Season not started', pct: clamp(v / t, 0, 1), status: (!gp ? 'pending' : v >= t ? 'onTrack' : 'behind') as GoalStatus['status'] });
  switch (g.kind) {
    case 'scoring': return track(per(p.stats.pts), g.target, 'ppg');
    case 'minutes': return track(per(p.stats.min), g.target, 'mpg');
    case 'starter': {
      const pct = gp ? (p.stats.gs / gp) * 100 : 0;
      return { text: gp ? `${p.stats.gs} of ${gp} starts` : 'Season not started', pct: clamp(pct / g.target, 0, 1), status: !gp ? 'pending' : pct >= g.target ? 'onTrack' : 'behind' };
    }
    case 'pro': {
      const r = nbaRankOf(state, p);
      return { text: `Projected No. ${r} prospect · goal top ${g.target}`, pct: clamp(g.target / r, 0, 1), status: r <= g.target ? 'onTrack' : 'behind' };
    }
    case 'winning': {
      const team = state.teams[state.user.teamId];
      if (!team.record.w && !team.record.l) return { text: 'Season not started', pct: 0, status: 'pending' };
      let ok: boolean;
      if (g.target >= 3) {
        const rank = Object.values(state.teams).sort((a, b) => selectionScore(b) - selectionScore(a)).findIndex((t) => t.id === team.id) + 1;
        ok = rank <= (g.target >= 5 ? 16 : g.target === 4 ? 32 : 44);
      } else {
        if (!team.record.cw && !team.record.cl) return { text: `${team.record.w}-${team.record.l} · conference play hasn't started`, pct: 0.1, status: 'pending' };
        const st = confStandings(state, team.conf);
        const pos = st.findIndex((t) => t.id === team.id) + 1;
        ok = pos <= (g.target === 2 ? 3 : Math.ceil(st.length / 2));
      }
      return { text: `${team.record.w}-${team.record.l} · ${ok ? 'on pace' : 'off pace'}`, pct: ok ? 0.75 : 0.35, status: ok ? 'onTrack' : 'behind' };
    }
  }
}

/** Season over: did each player get what he wanted? */
export function evaluateGoals(state: GameState, achieved: number): { met: string[]; missed: string[] } {
  const dv = state.development;
  const out = { met: [] as string[], missed: [] as string[] };
  if (!dv || dv.goalsSeason !== state.season) return out;
  for (const [id, g] of Object.entries(dv.goals)) {
    const p = state.players[id];
    if (!p || p.teamId !== state.user.teamId || g.result) continue;
    const gp = Math.max(1, p.stats.gp);
    let met: boolean;
    switch (g.kind) {
      case 'scoring': met = p.stats.gp >= 8 && p.stats.pts / gp >= g.target; break;
      case 'minutes': met = p.stats.gp >= 8 && p.stats.min / gp >= g.target; break;
      case 'starter': met = p.stats.gp >= 8 && (p.stats.gs / gp) * 100 >= g.target; break;
      case 'pro': met = nbaRankOf(state, p) <= g.target; break;
      case 'winning': met = achieved >= g.target; break;
    }
    g.result = met ? 'met' : 'missed';
    if (met) {
      p.morale = clamp(p.morale + 6, 0, 100);
      out.met.push(`${p.first} ${p.last}`);
    } else {
      const hit = p.traits.includes('diva') ? 10 : p.traits.includes('loyal') ? 4 : p.traits.includes('coachable') ? 5 : 7;
      p.morale = clamp(p.morale - hit, 0, 100);
      out.missed.push(`${p.first} ${p.last}`);
    }
  }
  const team = state.teams[state.user.teamId];
  const total = out.met.length + out.missed.length;
  if (total) {
    addNews(state, {
      kind: 'user',
      headline: `Exit meetings: ${out.met.length} of ${total} ${team.mascot} hit their personal goals`,
      body: `${out.met.length ? `Goals met: ${out.met.slice(0, 6).join(', ')}${out.met.length > 6 ? ' and more' : ''}. ` : ''}${out.missed.length ? `Came up short: ${out.missed.slice(0, 6).join(', ')}${out.missed.length > 6 ? ' and more' : ''}. Players who missed their goals are more likely to test the transfer portal.` : 'Everybody got what they came for. That kind of loyalty matters in the portal.'}`,
      teams: [team.id],
      important: true,
    });
  }
  return out;
}

/** Goal outcome for portal decisions */
export function goalResult(state: GameState, id: string): 'met' | 'missed' | undefined {
  const dv = state.development;
  if (!dv || dv.goalsSeason !== state.season) return undefined;
  return dv.goals[id]?.result;
}
