// Pros from your program: every drafted player gets a simulated pro career (NBA, G League or
// overseas), with All-Star nods, rings, MVPs, busts and retirements. Programs build an NBA
// pipeline that pro-minded recruits notice.
import { clamp, rng } from './rng';
import type { GameState, Player, ProCareer, ProState } from './types';
import { addNews } from './media';
import { NBA_TEAMS } from '../data/names';

const LVL = ['NBA', 'G League', 'Overseas'] as const;
export const LEVEL_LABEL = LVL;

export function prosState(state: GameState): ProState {
  return (state.pros ??= { list: {}, champs: [], pipeline: {} });
}

/** draft night: a new pro career begins */
export function addPro(state: GameState, p: Player, pick: number, nbaTeam: string, collegeId: string) {
  const P = prosState(state);
  P.list[p.id] = {
    id: p.id, name: `${p.first} ${p.last}`, pos: p.pos, num: p.num, college: collegeId, draft: state.season + 1, pick, team: nbaTeam,
    ovr: clamp(Math.round(p.ovr - 6 + rng.normal(0, 2)), 40, 95), peak: clamp(Math.round(Math.max(p.ovr, p.pot) + rng.normal(0, 6)), 50, 99),
    age: p.age + 1, log: [], allStar: 0, allNba: 0, rings: 0, mvp: 0, earnings: 0,
  };
}

/** older saves: rebuild careers from the draft history so the wall isn't empty */
export function ensurePros(state: GameState, through?: number) {
  if (state.pros) return;
  // the pro season ends with the college season: mid-season, the current one isn't over yet
  const last = through ?? (['preseason', 'regular', 'confTourney', 'selection', 'ncaa'].includes(state.phase) ? state.season - 1 : state.season);
  const P = prosState(state);
  const firstSeason = Math.min(...state.draft.map((d) => d.season), state.season + 1);
  for (const d of state.draft) {
    const base = 78 - d.pick * 0.28 + rng.normal(0, 3);
    P.list[d.playerId] = {
      id: d.playerId, name: d.name, pos: d.pos, num: rng.int(0, 35), college: d.teamId, draft: d.season, pick: d.pick, team: d.nbaTeam,
      ovr: clamp(Math.round(base - 6), 40, 95), peak: clamp(Math.round(base + 2 + rng.normal(0, 6)), 50, 99), age: 21, log: [], allStar: 0, allNba: 0, rings: 0, mvp: 0, earnings: 0,
    };
  }
  // play out the pro seasons that already happened, quietly
  for (let s = firstSeason; s <= last; s++) proSeason(state, s, true);
}

const salary = (c: ProCareer, lvl: number, rookie: boolean) =>
  lvl === 0 ? (rookie ? Math.max(1.2e6, 12e6 - c.pick * 0.35e6) : Math.max(1.2e6, (c.ovr - 62) * 1.9e6)) : lvl === 1 ? 0.05e6 : 0.45e6;

/** one pro season for everyone drafted before `season` ends (runs at the end of the college season) */
export function proSeason(state: GameState, season: number, quiet = false) {
  const P = prosState(state);
  const uid = state.user.teamId;
  const champ = rng.pick(NBA_TEAMS);
  P.champs = [{ season, team: champ }, ...P.champs.filter((x) => x.season !== season)].slice(0, 60);
  const active = Object.values(P.list).filter((c) => c.retired == null && c.draft <= season);
  let best: ProCareer | undefined;
  let roy: ProCareer | undefined;
  const notes: { c: ProCareer; text: string; big: boolean }[] = [];
  for (const c of active) {
    if (c.log.some((x) => x[0] === season)) continue;
    const rookie = c.log.length === 0;
    if (!rookie) c.age++;
    // develop toward the peak, then decline
    const grow = c.age <= 25 ? (c.peak - c.ovr) * rng.range(0.15, 0.4) : c.age <= 29 ? rng.range(-1, 1.5) : -rng.range(1, 3.5) - Math.max(0, c.age - 32) * 0.8;
    c.ovr = clamp(Math.round(c.ovr + grow + rng.normal(0, 1.5)), 35, 99);
    // retirement
    const age = c.age;
    if ((age >= 34 && rng.chance((age - 33) * 0.22)) || (c.ovr < 50 && !rookie) || (c.log.length >= 3 && c.ovr < 56 && rng.chance(0.35))) {
      c.retired = season;
      const hl = c.allStar >= 3 || c.rings >= 2;
      if (c.college === uid || hl) notes.push({ c, text: `${c.name} (${state.teams[c.college]?.school ?? 'college'}) retires after ${c.log.length} pro season${c.log.length === 1 ? '' : 's'}${c.allStar ? `, ${c.allStar}× All-Star` : ''}${c.rings ? `, ${c.rings} ring${c.rings > 1 ? 's' : ''}` : ''}`, big: hl });
      continue;
    }
    // where he plays
    const lvl = c.ovr >= 66 || (rookie && c.pick <= 30 && c.ovr >= 58) ? 0 : c.ovr >= 60 ? 1 : 2;
    if (lvl === 0 && c.log.length && rng.chance(0.14)) c.team = rng.pick(NBA_TEAMS.filter((t) => t !== c.team));
    const ppg = Math.round(clamp(lvl === 0 ? (c.ovr - 62) * 0.95 + rng.normal(0, 2) : lvl === 1 ? (c.ovr - 50) * 0.9 + rng.normal(0, 2) : (c.ovr - 45) * 0.8 + rng.normal(0, 2), 1, 36) * 10) / 10;
    const entry: ProCareer['log'][number] = [season, lvl, ppg];
    c.log.push(entry);
    c.earnings += salary(c, lvl, rookie);
    if (lvl !== 0) continue;
    // honors
    if (c.ovr >= 80 && rng.chance(clamp((c.ovr - 83) / 6, 0.03, 0.95))) { c.allStar++; entry.push('AS'); notes.push({ c, text: `${c.name} is an NBA All-Star${c.allStar > 1 ? ` for the ${ord(c.allStar)} time` : ''}`, big: c.allStar === 1 }); }
    if (c.ovr >= 88 && rng.chance(clamp((c.ovr - 87) / 5, 0.1, 0.9))) { c.allNba++; entry.push('ANBA'); }
    if (c.team === champ) { c.rings++; entry.push('RING'); notes.push({ c, text: `${c.name} wins an NBA title with ${champ}`, big: true }); }
    if (!best || c.ovr > best.ovr) best = c;
    if (rookie && (!roy || c.ovr + ppg > roy.ovr + (roy.log[roy.log.length - 1]?.[2] ?? 0))) roy = c;
    if (c.pick <= 10 && c.log.length === 3 && c.ovr < 66) c.bust = true;
  }
  // a bust: lottery pick out of the league by year three
  for (const c of active) if (c.pick <= 10 && !c.bust && c.log.length === 3 && c.log[2][1] !== 0) c.bust = true;
  if (best && best.ovr >= 92 && rng.chance(0.45)) { best.mvp++; best.log[best.log.length - 1].push('MVP'); notes.push({ c: best, text: `${best.name} wins NBA MVP`, big: true }); }
  if (roy) { roy.roy = season; roy.log[roy.log.length - 1].push('ROY'); notes.push({ c: roy, text: `${roy.name} is NBA Rookie of the Year`, big: true }); }
  refreshPipeline(state);
  if (quiet) return;
  // the news: anything from your program, plus the league's biggest stories
  const seen = new Set<string>();
  for (const n of notes.sort((a, b) => Number(b.c.college === uid) - Number(a.c.college === uid))) {
    const mine = n.c.college === uid;
    if (!mine && !n.big) continue;
    if (!mine && n.text.includes('NBA title')) { if (seen.has('title')) continue; seen.add('title'); }
    if (seen.size >= 6 || seen.has(n.c.id + n.text)) continue;
    seen.add(n.c.id + n.text);
    const school = state.teams[n.c.college]?.school;
    addNews(state, { kind: 'draft', headline: mine ? `Former ${state.teams[uid].mascot.replace(/s$/, '')} ${n.text.replace(n.c.name, n.c.name)}` : n.text, body: `${n.c.name}${school ? ` played his college ball at ${school}` : ''} and was the No. ${n.c.pick} pick in the ${n.c.draft} draft.`, teams: n.c.college ? [n.c.college] : [], important: mine });
  }
}

/** active NBA players and All-Stars per school, for recruiting and the rankings */
export function refreshPipeline(state: GameState) {
  const P = prosState(state);
  const pipe: ProState['pipeline'] = {};
  for (const c of Object.values(P.list)) {
    if (!c.college) continue;
    const x = (pipe[c.college] ??= { nba: 0, allStars: 0, alumni: 0 });
    x.alumni++;
    const last = c.log[c.log.length - 1];
    if (c.retired == null && last && last[1] === 0) x.nba++;
    if (c.allStar) x.allStars++;
  }
  P.pipeline = pipe;
}

/** what the NBA pipeline adds to a school's pro-development pitch (0-100 scale) */
export function pipelineBonus(state: GameState, teamId: string) {
  const x = state.pros?.pipeline[teamId];
  return x ? Math.min(18, x.nba * 2.5 + x.allStars * 1.5) : 0;
}
export function nbaCount(state: GameState, teamId: string) { return state.pros?.pipeline[teamId]?.nba ?? 0; }

export function prosOf(state: GameState, teamId: string): ProCareer[] {
  return Object.values(state.pros?.list ?? {}).filter((c) => c.college === teamId)
    .sort((a, b) => Number(a.retired != null) - Number(b.retired != null) || b.allStar - a.allStar || b.rings - a.rings || b.ovr - a.ovr);
}
export function proStatus(c: ProCareer): string {
  if (c.retired != null) return 'Retired';
  const last = c.log[c.log.length - 1];
  if (!last) return 'Rookie season';
  return last[1] === 0 ? c.team : LVL[last[1]];
}
export function proTotals(c: ProCareer) {
  const nba = c.log.filter((x) => x[1] === 0);
  return { seasons: c.log.length, nbaSeasons: nba.length, ppg: nba.length ? nba.reduce((s, x) => s + x[2], 0) / nba.length : 0, best: Math.max(0, ...nba.map((x) => x[2])) };
}
const ord = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], m = n % 100; return n + (s[(m - 20) % 10] || s[m] || s[0]); };
