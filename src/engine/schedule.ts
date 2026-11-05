import { rng } from './rng';
import type { GameState, ScheduledGame, Team } from './types';
import { NONCONF_DAYS, FIRST_CONF_DAY, CONF_DAYS, FEAST_WEEK_DAYS } from './calendar';
import { RIVALRIES } from '../data/rivalries';
import { TV_NETWORKS } from '../data/names';
import { reservedTeams } from './scheduling';

const NONCONF_GAMES = 12;
/** teams in small conferences (realignment) pick up extra non-conference games to reach this total */
const MIN_TOTAL_GAMES = 26;

const MTE_EVENTS = [
  'Maui Shootout', 'Paradise Island Classic', 'Vegas Hardwood Showcase', 'Empire Classic', 'Sunshine Slam',
  'Cancún Challenge', 'Wooden Legacy Classic', 'Charleston Invitational', 'Myrtle Beach Showcase', 'Cayman Hoops Classic',
  'Fort Myers Tip-Off', 'Portland Phil Classic', 'Hall of Fame Invitational', 'Jersey Mike’s Jamboree', 'Alaska Northern Lights Classic',
  'Bahamas Breakers Invitational',
];

export function confTier(state: GameState, t: Team): number {
  return state.conferences.find((c) => c.id === t.conf)?.tier ?? 3;
}

export function pickTV(state: GameState, home: Team, away: Team): string {
  const top = Math.max(home.prestige, away.prestige);
  if (top >= 80) return rng.pick(TV_NETWORKS.slice(0, 6));
  if (top >= 55) return rng.pick(TV_NETWORKS.slice(2, 9));
  return rng.pick(['Streaming Exclusive', 'Conference Network+', 'CourtVision+']);
}

export function generateSchedule(state: GameState): ScheduledGame[] {
  confCache.clear();
  const games: ScheduledGame[] = [];
  const teams = Object.values(state.teams);
  const byId = state.teams;
  const played = new Set<string>();
  const key = (a: string, b: string) => (a < b ? a + '|' + b : b + '|' + a);
  const homeCount: Record<string, number> = {};
  const gameCount: Record<string, number> = {};
  const busy: Record<number, Set<string>> = {};
  for (let d = 1; d <= NONCONF_DAYS + CONF_DAYS; d++) busy[d] = new Set();
  for (const t of teams) { homeCount[t.id] = 0; gameCount[t.id] = 0; }
  let gid = 0;
  const add = (day: number, home: string, away: string, type: ScheduledGame['type'], neutral = false, event?: string) => {
    games.push({ id: `g${state.season}-${gid++}`, day, home, away, neutral, type, event, played: false, tv: pickTV(state, byId[home], byId[away]) });
    busy[day].add(home); busy[day].add(away);
    played.add(key(home, away));
    if (!neutral) homeCount[home]++;
    gameCount[home]++; gameCount[away]++;
  };

  // ---- 1. Conference schedules ----
  const confs = state.conferences;
  for (const conf of confs) {
    const ids = rng.shuffle(teams.filter((t) => t.conf === conf.id).map((t) => t.id));
    const n = ids.length;
    if (n < 2) continue;
    const list = n % 2 === 1 ? [...ids, '__BYE__'] : [...ids];
    const m = list.length;
    const roundsA: [string, string][][] = [];
    const arr = [...list];
    for (let r = 0; r < m - 1; r++) {
      const round: [string, string][] = [];
      for (let i = 0; i < m / 2; i++) {
        const a = arr[i], b = arr[m - 1 - i];
        if (a === '__BYE__' || b === '__BYE__') continue;
        round.push((r + i) % 2 === 0 ? [a, b] : [b, a]);
      }
      roundsA.push(round);
      // rotate (keep first fixed)
      arr.splice(1, 0, arr.pop()!);
    }
    const roundsB = roundsA.map((r) => r.map(([h, a]) => [a, h] as [string, string]));
    rng.shuffle(roundsA);
    rng.shuffle(roundsB);
    const target = Math.min(conf.confGames || 18, 22);
    const perRound = n % 2 === 1 ? (n - 1) / n : 1;
    let roundsNeeded = Math.round(target / perRound);
    const all = [...roundsA, ...roundsB];
    roundsNeeded = Math.min(roundsNeeded, all.length, CONF_DAYS);
    const chosen = all.slice(0, roundsNeeded);
    // spread across conf days
    const dayIdx: number[] = [];
    for (let i = 0; i < chosen.length; i++) {
      dayIdx.push(FIRST_CONF_DAY + Math.round((i * (CONF_DAYS - 1)) / Math.max(1, chosen.length - 1)));
    }
    if (chosen.length === 1) dayIdx[0] = FIRST_CONF_DAY;
    chosen.forEach((round, i) => {
      for (const [h, a] of round) add(dayIdx[i], h, a, 'conf');
    });
  }

  // ---- 1b. The user's planned non-conference slate (built in the Scheduling Office) ----
  const sc = state.scheduling;
  const uid = state.user.teamId;
  const planActive = !!sc && sc.season === state.season && sc.locked;
  if (planActive && sc) {
    const ev = sc.mte ? sc.mtes.find((m) => m.name === sc.mte) : undefined;
    const [d1, d2] = FEAST_WEEK_DAYS;
    if (ev && ev.field.every((id) => byId[id])) {
      const [a, b, c] = ev.field;
      const second = rng.chance(0.5) ? b : c;
      const third = second === b ? c : b;
      add(d1, uid, a, 'nc', true, ev.name);
      add(d1, b, c, 'nc', true, ev.name);
      add(d2, uid, second, 'nc', true, ev.name);
      add(d2, a, third, 'nc', true, ev.name);
    }
    const order = (x: (typeof sc.games)[number]) => (x.locked === 'rivalry' ? 3 : x.site === 'neutral' || x.series ? 2 : 1);
    const planned = [...sc.games].filter((x) => byId[x.oppId] && byId[x.oppId].conf !== byId[uid].conf).sort((x, y) => order(x) - order(y));
    const free: number[] = [];
    for (let d = 1; d <= NONCONF_DAYS; d++) if (!busy[d].has(uid)) free.push(d);
    const usedDays = new Set<number>();
    planned.forEach((x, i) => {
      const ideal = free[Math.round((i * (free.length - 1)) / Math.max(1, planned.length - 1))];
      const day = [ideal, ...free].find((d) => d != null && !usedDays.has(d) && !busy[d].has(x.oppId) && !busy[d].has(uid));
      if (day == null) return;
      usedDays.add(day);
      if (x.site === 'home') add(day, uid, x.oppId, 'nc', false, x.event);
      else if (x.site === 'away') add(day, x.oppId, uid, 'nc', false, x.event);
      else add(day, uid, x.oppId, 'nc', true, x.event);
    });
  }
  const reserved = reservedTeams(state);

  // ---- 2. Rivalry non-conference games ----
  for (const rv of RIVALRIES) {
    const a = byId[rv.a], b = byId[rv.b];
    if (!a || !b || a.conf === b.conf) continue;
    if (played.has(key(a.id, b.id))) continue;
    if (planActive && (rv.a === uid || rv.b === uid)) continue;
    const day = rng.int(9, NONCONF_DAYS);
    if (busy[day].has(a.id) || busy[day].has(b.id)) continue;
    const homeFirst = (state.season + (a.id < b.id ? 0 : 1)) % 2 === 0;
    add(day, homeFirst ? a.id : b.id, homeFirst ? b.id : a.id, 'nc', false, rv.name);
  }
  // rivalries born in the dynasty get a game while they're hot
  for (const r of Object.values(state.rivals?.pairs ?? {})) {
    if (!r.active || r.origin !== 'born' || r.heat < 55) continue;
    const a = byId[r.a], b = byId[r.b];
    if (!a || !b || a.conf === b.conf || played.has(key(a.id, b.id))) continue;
    if (planActive && (r.a === uid || r.b === uid)) continue;
    const day = rng.int(9, NONCONF_DAYS);
    if (busy[day].has(a.id) || busy[day].has(b.id)) continue;
    const homeFirst = (state.season + (a.id < b.id ? 0 : 1)) % 2 === 0;
    add(day, homeFirst ? a.id : b.id, homeFirst ? b.id : a.id, 'nc', false, r.name);
  }

  // ---- 3. Feast-week MTEs (neutral, 4-team pods among tier 1-2 teams) ----
  const mtePool = rng.shuffle(teams.filter((t) => (confTier(state, t) <= 2 || t.prestige >= 50) && !reserved.has(t.id)));
  let podIdx = 0;
  for (let i = 0; i + 3 < mtePool.length && podIdx < MTE_EVENTS.length * 2; i += 4) {
    const pod = mtePool.slice(i, i + 4);
    const ev = MTE_EVENTS[podIdx % MTE_EVENTS.length];
    podIdx++;
    const [d1, d2] = FEAST_WEEK_DAYS;
    const pairs1: [Team, Team][] = [[pod[0], pod[1]], [pod[2], pod[3]]];
    const pairs2: [Team, Team][] = [[pod[0], pod[2]], [pod[1], pod[3]]];
    for (const [x, y] of pairs1) if (x.conf !== y.conf && !busy[d1].has(x.id) && !busy[d1].has(y.id) && !played.has(key(x.id, y.id))) add(d1, x.id, y.id, 'nc', true, ev);
    for (const [x, y] of pairs2) if (x.conf !== y.conf && !busy[d2].has(x.id) && !busy[d2].has(y.id) && !played.has(key(x.id, y.id))) add(d2, x.id, y.id, 'nc', true, ev);
  }

  // ---- 4. Fill remaining non-conference games ----
  const tierOf: Record<string, number> = {};
  for (const t of teams) tierOf[t.id] = confTier(state, t);
  const quota: Record<string, number> = {};
  for (const t of teams) quota[t.id] = Math.max(NONCONF_GAMES, Math.min(NONCONF_DAYS - 1, MIN_TOTAL_GAMES - confGamesOf(games, t.id)));
  for (let day = 1; day <= NONCONF_DAYS; day++) {
    const remainingDays = NONCONF_DAYS - day + 1;
    const avail = teams.filter((t) => !busy[day].has(t.id) && gameCount[t.id] - confGamesOf(games, t.id) < quota[t.id]);
    // probability to play today so games spread evenly
    const want = rng.shuffle(avail.filter((t) => {
      const need = quota[t.id] - (gameCount[t.id] - confGamesOf(games, t.id));
      return rng.chance(Math.min(1, need / remainingDays + 0.05));
    }));
    const used = new Set<string>();
    for (const t of want) {
      if (used.has(t.id)) continue;
      // candidates
      let best: Team | null = null;
      let bestW = -1;
      for (let tries = 0; tries < 14; tries++) {
        const c = want[rng.int(0, want.length - 1)];
        if (c.id === t.id || used.has(c.id) || c.conf === t.conf || played.has(key(c.id, t.id))) continue;
        const tdiff = Math.abs(tierOf[c.id] - tierOf[t.id]);
        let w = 1 + (tdiff >= 2 ? 1.6 : 0) + (tierOf[c.id] === 1 && tierOf[t.id] === 1 ? 0.5 : 0) + (c.state === t.state ? 1.2 : 0);
        w *= rng.range(0.5, 1.5);
        if (w > bestW) { bestW = w; best = c; }
      }
      if (!best) continue;
      used.add(t.id); used.add(best.id);
      // home: higher prestige hosts buy games; else balance
      let home = t, away = best;
      const pdiff = t.prestige - best.prestige;
      if (Math.abs(pdiff) > 15) {
        if (pdiff < 0) { home = best; away = t; }
        if (rng.chance(0.08)) [home, away] = [away, home];
      } else if (homeCount[best.id] < homeCount[t.id]) { home = best; away = t; }
      add(day, home.id, away.id, 'nc');
    }
  }
  games.sort((a, b) => a.day - b.day);
  return games;
}

const confCache = new Map<string, number>();
function confGamesOf(games: ScheduledGame[], id: string): number {
  // conf games are generated first and never change during nonconf fill, so cache by id+length
  const k = id;
  if (confCache.has(k)) return confCache.get(k)!;
  let n = 0;
  for (const g of games) if (g.type === 'conf' && (g.home === id || g.away === id)) n++;
  confCache.set(k, n);
  return n;
}
export function resetScheduleCache() { confCache.clear(); }
