// Program legacy: real traditions (from data/lore), a Ring of Honor of fictional legends for
// the lore programs, and jerseys retired during the dynasty at any school.
import type { GameState, Pos, RetiredJersey, Team } from './types';
import { FIRST_NAMES, LAST_NAMES } from '../data/names';
import { loreOf, type ProgramLore } from '../data/lore';
import { addNews } from './media';
import { recordBook } from './records';

export { loreOf };
export type { ProgramLore };

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export interface Legend { name: string; num: number; pos: Pos; era: string; nickname?: string; line: string; dynasty: boolean; season?: number; playerId?: string }

const NICKS = ['Smooth', 'The Professor', 'Big Shot', 'The Wall', 'Flash', 'Ice', 'Downtown', 'The Engine', 'Buckets', 'Hammer', 'Spider', 'Bounce'];
const LINES = [
  'A four-year starter and still the fans’ all-time favorite.',
  'The purest shooter anyone in this building has ever seen.',
  'A rim protector nobody wanted to challenge.',
  'Ran the point for four seasons and never missed a game.',
  'Scored in bunches and filled the building every night.',
  'The heart of some of the best teams in program history.',
  'A hometown kid who became a legend.',
  'Went on to a long pro career and never forgot where he came from.',
  'The toughest defender the program has ever had.',
  'Hit more big shots than anybody can count.',
];
const POS: Pos[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const ERAS = ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s'];
const NUMS = [3, 4, 5, 10, 11, 12, 14, 15, 20, 21, 22, 23, 24, 25, 30, 31, 32, 33, 34, 35, 40, 41, 42, 44, 45, 50, 52, 55];

/** The Ring of Honor before the dynasty: fictional legends, only for programs with real lore */
export function historicLegends(teamId: string): Legend[] {
  if (!loreOf(teamId)) return [];
  const h = hash(`legends:${teamId}`);
  const n = 3 + (h % 3);
  const out: Legend[] = [];
  const usedNums = new Set<number>();
  for (let i = 0; i < n; i++) {
    const k = hash(`${teamId}:${i}`);
    let num = NUMS[k % NUMS.length];
    while (usedNums.has(num)) num = NUMS[(NUMS.indexOf(num) + 1) % NUMS.length];
    usedNums.add(num);
    out.push({
      name: `${FIRST_NAMES[(k >>> 3) % FIRST_NAMES.length]} ${LAST_NAMES[(k >>> 11) % LAST_NAMES.length]}`,
      num,
      pos: POS[(k >>> 5) % POS.length],
      era: `the ${ERAS[(k >>> 7) % ERAS.length]}`,
      nickname: (k >>> 13) % 3 === 0 ? NICKS[(k >>> 17) % NICKS.length] : undefined,
      line: LINES[(k >>> 19) % LINES.length],
      dynasty: false,
    });
  }
  return out.sort((a, b) => a.era.localeCompare(b.era));
}

export function retiredJerseys(state: GameState, teamId: string): RetiredJersey[] {
  return state.legacy?.retired[teamId] ?? [];
}

/** Everyone in the rafters: dynasty-era retirements first, then the program's older legends */
export function ringOfHonor(state: GameState, teamId: string): Legend[] {
  const dyn = retiredJerseys(state, teamId).slice().reverse().map((r): Legend => ({ name: r.name, num: r.num, pos: r.pos, era: r.years, line: r.why, dynasty: true, season: r.season, playerId: r.playerId }));
  return [...dyn, ...historicLegends(teamId)];
}

/** National titles before the dynasty began */
export function preDynastyTitles(teamId: string): number[] {
  return loreOf(teamId)?.titles ?? [];
}

/** Numbers nobody new can wear at this school (players already wearing one keep it) */
export function retiredNumbers(state: GameState, teamId: string): Set<number> {
  return new Set([...historicLegends(teamId).map((l) => l.num), ...retiredJerseys(state, teamId).map((r) => r.num)]);
}

/**
 * When a great player leaves (graduation or the draft), his school retires his jersey.
 * A National Player of the Year or a two-time First Team All-American always goes up;
 * anyone else needs two strong claims (an All-American year, starring for a champion,
 * Final Four MOP, two conference POYs, or 2,300+ points at the school).
 * Called at draft declarations, once we know who is leaving.
 */
export function retireJerseys(state: GameState, leaving: string[]) {
  const lg = (state.legacy ??= { retired: {} });
  const rb = recordBook(state);
  for (const id of leaving) {
    const p = state.players[id];
    if (!p || !p.teamId) continue;
    const teamId = p.teamId;
    if ((lg.retired[teamId] ?? []).some((r) => r.playerId === id)) continue;
    const mine = state.awards.filter((a) => a.playerId === id && a.teamId === teamId);
    const strong: string[] = [], medium: string[] = [];
    const poy = mine.filter((a) => a.name === 'National Player of the Year');
    if (poy.length) strong.push(`National Player of the Year (${poy.map((a) => a.season + 1).join(', ')})`);
    const aa1 = mine.filter((a) => a.name === 'All-American First Team');
    if (aa1.length >= 2) strong.push(`${aa1.length}-time First Team All-American`);
    else if (aa1.length) medium.push('First Team All-American');
    const mop = mine.filter((a) => a.name === 'Final Four Most Outstanding Player');
    if (mop.length) medium.push(`Final Four Most Outstanding Player (${mop.map((a) => a.season + 1).join(', ')})`);
    const cpoy = mine.filter((a) => / Player of the Year$/.test(a.name) && a.name !== 'National Player of the Year' && a.name !== 'Defensive Player of the Year');
    if (cpoy.length >= 2) medium.push(`${cpoy.length}-time ${cpoy[0].name}`);
    for (const c of state.champions.filter((x) => x.teamId === teamId)) {
      const s = c.season;
      const line = p.career.find((l) => l.season === s && l.teamId === teamId);
      if (!line || !line.gp) continue;
      const ppg = (o: typeof p) => { const l = o.career.find((x) => x.season === s && x.teamId === teamId); return l && l.gp ? l.pts / l.gp : 0; };
      const best = Object.values(state.players).filter((o) => ppg(o) > 0).sort((a, b) => ppg(b) - ppg(a))[0];
      if (best?.id === id) medium.push(`led the ${s + 1} national champions in scoring`);
    }
    const pts = p.career.filter((l) => l.teamId === teamId).reduce((n, l) => n + l.pts, 0);
    const leader = rb.programs[teamId]?.career.pts?.[0];
    if (pts >= 2300) medium.push(leader?.p === id ? `the program’s career scoring leader (${pts.toLocaleString()} points)` : `${pts.toLocaleString()} career points`);
    if (!strong.length && medium.length < 2) continue;
    const list = (lg.retired[teamId] ??= []);
    const seasons = p.career.filter((l) => l.teamId === teamId).map((l) => l.season);
    const first = Math.min(...seasons, state.season), last = Math.max(...seasons, state.season);
    const why = cap([...strong, ...medium].join('; '));
    list.push({ playerId: id, name: `${p.first} ${p.last}`, num: p.num, pos: p.pos, years: `${first}–${String((last + 1) % 100).padStart(2, '0')}`, why, season: state.season });
    const t = state.teams[teamId];
    addNews(state, {
      kind: 'feature',
      headline: `${t.school} will retire ${p.first} ${p.last}’s No. ${p.num}`,
      body: `${p.first} ${p.last}’s No. ${p.num} is going to the rafters at ${t.arena}. ${why}.`,
      teams: [teamId],
      important: teamId === state.user.teamId,
      personId: id,
      personKind: 'player',
    });
  }
}
/** At the start of a new season, last year's retirements get their night (and a little buzz) */
export function jerseyNights(state: GameState) {
  for (const [teamId, list] of Object.entries(state.legacy?.retired ?? {})) {
    const t = state.teams[teamId];
    if (!t) continue;
    for (const r of list.filter((x) => x.season === state.season - 1)) {
      const user = teamId === state.user.teamId;
      t.hype = Math.min(100, t.hype + (user ? 3 : 1));
      addNews(state, {
        kind: 'feature',
        headline: `Jersey night at ${t.arena}: ${r.name}’s No. ${r.num} goes to the rafters`,
        body: `${t.school} will raise ${r.name}’s No. ${r.num} before a home game this season. ${r.why}. No ${t.mascot} will wear it again.`,
        teams: [teamId],
        important: user,
        personId: r.playerId,
        personKind: 'player',
      });
    }
  }
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A short tradition line for the user's recruiting pitch */
export function programPitch(state: GameState, t: Team): string | null {
  const lore = loreOf(t.id);
  const dyn = state.champions.filter((c) => c.teamId === t.id).length;
  const titles = (lore?.titles?.length ?? 0) + dyn;
  const bits: string[] = [];
  if (titles) bits.push(`${titles} national title${titles > 1 ? 's' : ''}`);
  if (lore?.arenaNick) bits.push(lore.arenaNick);
  else if (lore) bits.push(t.arena);
  if (lore?.students) bits.push(`the ${lore.students}`);
  else if (lore?.fans) bits.push(lore.fans);
  const ring = ringOfHonor(state, t.id).length;
  if (ring) bits.push(`${ring} retired jersey${ring > 1 ? 's' : ''}`);
  return bits.length ? bits.join(' · ') : null;
}
