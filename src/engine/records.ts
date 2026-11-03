// League and program record books: single game, single season and career (all-time) records.
// Records are tracked from the first season of the dynasty. The league keeps top-10 lists,
// programs you've coached keep top-10 lists, and every other program keeps its record holder.
import type { BoxPlayer, BoxScore, GameState, RecEntry, RecScope, RecordBook, RecordBreak, RecordSet, ScheduledGame, SeasonLine, StatLine, Team } from './types';
import { addNews, addSocial } from './media';
import { seasonLabel } from './calendar';

export interface RecCat {
  id: string;
  label: string;
  short: string;
  /** lower is better */
  asc?: boolean;
  /** display decimals (averages), or 'pct' */
  fmt?: 1 | 'pct';
  /** values below this never make the book (keeps lists meaningful) */
  floor?: number;
  /** a record this size is newsworthy: [league, program] */
  notable?: [number, number];
}

export const GAME_CATS: (RecCat & { get: (b: BoxPlayer) => number })[] = [
  { id: 'pts', label: 'Points', short: 'PTS', floor: 20, notable: [40, 32], get: (b) => b.pts },
  { id: 'reb', label: 'Rebounds', short: 'REB', floor: 10, notable: [20, 16], get: (b) => b.orb + b.drb },
  { id: 'ast', label: 'Assists', short: 'AST', floor: 7, notable: [14, 12], get: (b) => b.ast },
  { id: 'stl', label: 'Steals', short: 'STL', floor: 4, notable: [8, 6], get: (b) => b.stl },
  { id: 'blk', label: 'Blocks', short: 'BLK', floor: 4, notable: [9, 7], get: (b) => b.blk },
  { id: 'tpm', label: '3-Pointers Made', short: '3PM', floor: 5, notable: [10, 8], get: (b) => b.tpm },
];
type SeasonGet = (s: StatLine) => number | null;
export const SEASON_CATS: (RecCat & { get: SeasonGet })[] = [
  { id: 'ppg', label: 'Points Per Game', short: 'PPG', fmt: 1, notable: [26, 22], get: (s) => (s.gp >= 20 ? s.pts / s.gp : null) },
  { id: 'pts', label: 'Points', short: 'PTS', notable: [800, 650], get: (s) => s.pts },
  { id: 'rpg', label: 'Rebounds Per Game', short: 'RPG', fmt: 1, notable: [13, 11], get: (s) => (s.gp >= 20 ? (s.orb + s.drb) / s.gp : null) },
  { id: 'reb', label: 'Rebounds', short: 'REB', notable: [420, 350], get: (s) => s.orb + s.drb },
  { id: 'apg', label: 'Assists Per Game', short: 'APG', fmt: 1, notable: [8.5, 7], get: (s) => (s.gp >= 20 ? s.ast / s.gp : null) },
  { id: 'ast', label: 'Assists', short: 'AST', notable: [280, 230], get: (s) => s.ast },
  { id: 'stl', label: 'Steals', short: 'STL', notable: [100, 80], get: (s) => s.stl },
  { id: 'blk', label: 'Blocks', short: 'BLK', notable: [120, 95], get: (s) => s.blk },
  { id: 'tpm', label: '3-Pointers Made', short: '3PM', notable: [130, 105], get: (s) => s.tpm },
  { id: 'fgp', label: 'Field Goal %', short: 'FG%', fmt: 'pct', notable: [0.66, 0.62], get: (s) => (s.fga >= 200 ? s.fgm / s.fga : null) },
];
export const CAREER_CATS: (RecCat & { get: SeasonGet })[] = [
  { id: 'pts', label: 'Points', short: 'PTS', notable: [2600, 2000], get: (s) => s.pts },
  { id: 'reb', label: 'Rebounds', short: 'REB', notable: [1300, 1000], get: (s) => s.orb + s.drb },
  { id: 'ast', label: 'Assists', short: 'AST', notable: [850, 650], get: (s) => s.ast },
  { id: 'stl', label: 'Steals', short: 'STL', notable: [330, 260], get: (s) => s.stl },
  { id: 'blk', label: 'Blocks', short: 'BLK', notable: [380, 300], get: (s) => s.blk },
  { id: 'tpm', label: '3-Pointers Made', short: '3PM', notable: [380, 300], get: (s) => s.tpm },
  { id: 'gp', label: 'Games Played', short: 'GP', notable: [125, 115], get: (s) => s.gp },
  { id: 'ppg', label: 'Points Per Game', short: 'PPG', fmt: 1, notable: [22, 19], get: (s) => (s.gp >= 60 ? s.pts / s.gp : null) },
];
export const TEAM_GAME_CATS: RecCat[] = [
  { id: 'pts', label: 'Points Scored', short: 'PTS', floor: 90, notable: [125, 115] },
  { id: 'margin', label: 'Margin of Victory', short: 'MOV', floor: 25, notable: [60, 50] },
  { id: 'tpm', label: '3-Pointers Made', short: '3PM', floor: 12, notable: [21, 18] },
];
export const TEAM_SEASON_CATS: RecCat[] = [
  { id: 'w', label: 'Wins', short: 'W' },
  { id: 'pct', label: 'Winning Percentage', short: 'PCT', fmt: 'pct' },
  { id: 'ppg', label: 'Points Per Game', short: 'PPG', fmt: 1 },
  { id: 'oppg', label: 'Fewest Points Allowed', short: 'OPP', fmt: 1, asc: true },
];
export const CATS: Record<RecScope, RecCat[]> = { game: GAME_CATS, season: SEASON_CATS, career: CAREER_CATS, teamGame: TEAM_GAME_CATS, teamSeason: TEAM_SEASON_CATS };

const LEAGUE_N = 10;
const TRACKED_N = 10;
const OTHER_N = 1;

export function fmtRec(cat: RecCat, v: number): string {
  if (cat.fmt === 'pct') return v.toFixed(3).replace(/^0/, '');
  if (cat.fmt === 1) return v.toFixed(1);
  return String(Math.round(v));
}

function emptySet(): RecordSet {
  return { game: {}, season: {}, career: {}, teamGame: {}, teamSeason: {} };
}

function better(cat: RecCat, a: number, b: number) {
  return cat.asc ? a < b : a > b;
}

/**
 * Insert into a top-n list. A new entry has to beat the last place outright (ties go to the
 * older record). Returns the new rank (0 = record) or -1.
 */
function insert(list: RecEntry[], e: RecEntry, n: number, cat: RecCat, dedupe?: (x: RecEntry) => boolean): number {
  if (dedupe) {
    const i = list.findIndex(dedupe);
    if (i >= 0) list.splice(i, 1);
  }
  if (list.length >= n && !better(cat, e.v, list[n - 1].v)) return -1;
  let pos = list.length;
  while (pos > 0 && better(cat, e.v, list[pos - 1].v)) pos--;
  list.splice(pos, 0, e);
  if (list.length > n) list.length = n;
  return pos;
}

/** The record book, created (and filled from existing history) on first use */
export function recordBook(state: GameState): RecordBook {
  if (!state.records) {
    const coach = state.coaches[state.user.coachId];
    const tracked = new Set([state.user.teamId, ...(coach?.career.map((c) => c.teamId) ?? [])]);
    state.records = { since: state.season, league: emptySet(), programs: {}, tracked: [...tracked], recent: [] };
    backfill(state);
  }
  return state.records;
}

export function trackProgram(state: GameState, teamId: string) {
  const rb = recordBook(state);
  if (!rb.tracked.includes(teamId)) rb.tracked.push(teamId);
}

function program(rb: RecordBook, teamId: string): RecordSet {
  return (rb.programs[teamId] ??= emptySet());
}
function nFor(rb: RecordBook, teamId: string) {
  return rb.tracked.includes(teamId) ? TRACKED_N : OTHER_N;
}

interface Ctx { state: GameState; rb: RecordBook; silent: boolean; day: number; gameId?: string }

/** Put an entry into the league list and its program's list; report record-breaking moments */
function place(c: Ctx, scope: RecScope, cat: RecCat, e: RecEntry, teamId: string, dedupe?: (x: RecEntry) => boolean) {
  const { rb } = c;
  const lg = (rb.league[scope][cat.id] ??= []);
  const prevL = lg[0];
  const rl = insert(lg, { ...e, t: teamId }, LEAGUE_N, cat, dedupe);
  const pg = (program(rb, teamId)[scope][cat.id] ??= []);
  const prevP = pg[0];
  const { t: _t, ...pe } = e;
  void _t;
  const keep = rb.tracked.includes(teamId);
  const rp = insert(pg, keep ? pe : { ...pe, x: undefined }, nFor(rb, teamId), cat, dedupe);
  if (c.silent) return;
  const samePerson = (prev?: RecEntry) => !!prev && !!e.p && prev.p === e.p;
  if (rl === 0 && prevL && !samePerson(prevL) && (!cat.notable || !better(cat, cat.notable[0], e.v))) report(c, { scope, cat: cat.id, level: 'league', teamId, v: e.v, prev: prevL.v, prevName: prevL.n, n: e.n, p: e.p, season: e.s, day: c.day, gameId: c.gameId }, cat);
  else if (rp === 0 && prevP && !samePerson(prevP) && teamId === c.state.user.teamId && (!cat.notable || !better(cat, cat.notable[1], e.v))) report(c, { scope, cat: cat.id, level: 'program', teamId, v: e.v, prev: prevP.v, prevName: prevP.n, n: e.n, p: e.p, season: e.s, day: c.day, gameId: c.gameId }, cat);
}

const SCOPE_WORD: Record<RecScope, string> = { game: 'single-game', season: 'single-season', career: 'career', teamGame: 'single-game', teamSeason: 'single-season' };

function report(c: Ctx, b: RecordBreak, cat: RecCat) {
  const { state, rb } = c;
  rb.recent = [b, ...rb.recent].slice(0, 30);
  const t = state.teams[b.teamId];
  const what = `${SCOPE_WORD[b.scope]} ${cat.label.toLowerCase()} record`;
  const lvl = b.level === 'league' ? 'a new league' : `a new ${t.school}`;
  const isUser = b.teamId === state.user.teamId;
  addNews(state, {
    kind: 'milestone',
    headline: `${b.n} sets ${lvl} ${what}: ${fmtRec(cat, b.v)}`,
    body: `${b.n} (${t.school}) now holds ${b.level === 'league' ? 'the league' : 'the program'} ${what} with ${fmtRec(cat, b.v)}${b.prevName ? `, passing ${b.prevName} (${fmtRec(cat, b.prev ?? 0)})` : ''}. Record books date to ${seasonLabel(rb.since)}.`,
    teams: [b.teamId],
    important: isUser || b.level === 'league',
    personId: b.p,
    personKind: b.p ? 'player' : undefined,
  });
  if (b.level === 'league' && b.scope === 'game') addSocial(state, { handle: 'BoxScoreMedia', name: 'Box Score Media', verified: true, kind: 'analyst', text: `📖 HISTORY: ${b.n} just put up ${fmtRec(cat, b.v)} ${cat.label.toLowerCase()}. That's a new league single-game record.`, teamId: b.teamId, personId: b.p });
}

function statLineShort(b: BoxPlayer) {
  const reb = b.orb + b.drb;
  return `${b.pts} pts, ${reb} reb, ${b.ast} ast · ${b.fgm}-${b.fga} FG${b.tpa ? `, ${b.tpm}-${b.tpa} 3PT` : ''}`;
}

// ---------------- Updates ----------------
/** After every game: single-game records */
export function recordGame(state: GameState, g: ScheduledGame, box: BoxScore, silent = false) {
  const rb = recordBook(state);
  const c: Ctx = { state, rb, silent, day: g.day, gameId: g.id };
  const scores = [box.hs, box.as];
  const ids = [g.home, g.away];
  for (const side of [0, 1] as const) {
    const teamId = ids[side], oppId = ids[1 - side];
    if (!state.teams[teamId]) continue;
    for (const b of box.players[side]) {
      if (b.min <= 0) continue;
      for (const cat of GAME_CATS) {
        const v = cat.get(b);
        if (v < (cat.floor ?? 0)) continue;
        place(c, 'game', cat, { v, n: b.name, s: state.season, o: oppId, p: b.id, x: statLineShort(b) }, teamId);
      }
    }
    const tpm = box.players[side].reduce((a, b) => a + b.tpm, 0);
    const margin = scores[side] - scores[1 - side];
    const team = state.teams[teamId];
    const teamEntry = (v: number): RecEntry => ({ v, n: team.school, s: state.season, o: oppId });
    for (const cat of TEAM_GAME_CATS) {
      const v = cat.id === 'pts' ? scores[side] : cat.id === 'margin' ? margin : tpm;
      if (v < (cat.floor ?? 0)) continue;
      place(c, 'teamGame', cat, teamEntry(v), teamId);
    }
  }
}

function sumLines(lines: StatLine[]): StatLine {
  const s: StatLine = { gp: 0, gs: 0, min: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0 };
  for (const l of lines) for (const k of Object.keys(s) as (keyof StatLine)[]) s[k] += l[k] ?? 0;
  return s;
}

function teamSeason(c: Ctx, team: Team, season: number, w: number, l: number, pf?: number, pa?: number) {
  const gp = w + l;
  if (!gp) return;
  const vals: Record<string, number | null> = { w, pct: gp >= 25 ? w / gp : null, ppg: pf != null ? pf / gp : null, oppg: pa != null ? pa / gp : null };
  for (const cat of TEAM_SEASON_CATS) {
    const v = vals[cat.id];
    if (v == null) continue;
    place(c, 'teamSeason', cat, { v, n: team.school, s: season }, team.id, (x) => x.s === season && (x.t ?? team.id) === team.id && x.n === team.school);
  }
}

type Snapshot = Map<string, RecEntry | undefined>;
const SEASON_SCOPES: RecScope[] = ['season', 'career', 'teamSeason'];
function snapshot(rb: RecordBook, teamId: string): Snapshot {
  const m: Snapshot = new Map();
  for (const sc of SEASON_SCOPES) for (const cat of CATS[sc]) {
    m.set(`L:${sc}:${cat.id}`, rb.league[sc][cat.id]?.[0]);
    m.set(`P:${sc}:${cat.id}`, rb.programs[teamId]?.[sc][cat.id]?.[0]);
  }
  return m;
}
/** Report only the final record holders once the whole season is in the books */
function reportChanges(c: Ctx, before: Snapshot, teamId: string) {
  for (const sc of SEASON_SCOPES) for (const cat of CATS[sc]) {
    for (const level of ['league', 'program'] as const) {
      const prev = before.get(`${level === 'league' ? 'L' : 'P'}:${sc}:${cat.id}`);
      const now = level === 'league' ? c.rb.league[sc][cat.id]?.[0] : c.rb.programs[teamId]?.[sc][cat.id]?.[0];
      if (!prev || !now || !better(cat, now.v, prev.v)) continue;
      if (now.p ? now.p === prev.p : now.s === prev.s && now.n === prev.n) continue;
      const bar = cat.notable?.[level === 'league' ? 0 : 1];
      if (bar != null && better(cat, bar, now.v)) continue;
      report(c, { scope: sc, cat: cat.id, level, teamId: level === 'league' ? now.t ?? teamId : teamId, v: now.v, prev: prev.v, prevName: prev.n, n: now.n, p: now.p, season: now.s, day: c.day }, cat);
    }
  }
}

/** At season's end (after career lines are written): season, career and team-season records */
export function recordSeasonEnd(state: GameState, silent = false) {
  const rb = recordBook(state);
  const uid = state.user.teamId;
  const before = snapshot(rb, uid);
  const c: Ctx = { state, rb, silent: true, day: state.day };
  const season = state.season;
  for (const p of Object.values(state.players)) {
    if (!p.teamId || !p.stats.gp) continue;
    const name = `${p.first} ${p.last}`;
    for (const cat of SEASON_CATS) {
      const v = cat.get(p.stats);
      if (v == null || v <= 0) continue;
      place(c, 'season', cat, { v, n: name, s: season, p: p.id }, p.teamId, (x) => x.p === p.id && x.s === season);
    }
    careerFor(c, p.id, name, p.teamId, p.career, season);
  }
  for (const t of Object.values(state.teams)) teamSeason(c, t, season, t.record.w, t.record.l, t.record.pf, t.record.pa);
  if (!silent) reportChanges({ ...c, silent: false }, before, uid);
}

/** Career totals: league-wide across schools, and at the current school */
function careerFor(c: Ctx, id: string, name: string, teamId: string, career: SeasonLine[], season: number) {
  const all = sumLines(career);
  const here = sumLines(career.filter((l) => l.teamId === teamId));
  for (const cat of CAREER_CATS) {
    const vl = cat.get(all), vp = cat.get(here);
    if (vl != null && vl > 0) insert((c.rb.league.career[cat.id] ??= []), { v: vl, n: name, t: teamId, s: season, p: id }, LEAGUE_N, cat, (x) => x.p === id);
    if (vp != null && vp > 0) insert((program(c.rb, teamId).career[cat.id] ??= []), { v: vp, n: name, s: season, p: id }, nFor(c.rb, teamId), cat, (x) => x.p === id);
  }
}

/** Fill a new record book from what the save already knows */
function backfill(state: GameState) {
  const rb = state.records!;
  const c: Ctx = { state, rb, silent: true, day: state.day };
  const done = (season: number) => season < state.season || !['preseason', 'regular', 'confTourney', 'selection', 'ncaa'].includes(state.phase);
  let first = state.season;
  for (const p of Object.values(state.players)) {
    const lines = p.career.filter((l) => done(l.season));
    if (!lines.length) continue;
    const name = `${p.first} ${p.last}`;
    for (const l of lines) {
      first = Math.min(first, l.season);
      for (const cat of SEASON_CATS) {
        const v = cat.get(l);
        if (v == null || v <= 0) continue;
        place(c, 'season', cat, { v, n: name, s: l.season, p: p.id }, l.teamId, (x) => x.p === p.id && x.s === l.season);
      }
    }
    const last = lines[lines.length - 1];
    for (const teamId of new Set(lines.map((l) => l.teamId))) careerFor(c, p.id, name, teamId, lines, last.season);
  }
  for (const t of Object.values(state.teams)) {
    for (const h of t.history) { first = Math.min(first, h.season); teamSeason(c, t, h.season, h.w, h.l); }
  }
  // this season's saved box scores (your games and big matchups)
  for (const box of Object.values(state.boxScores)) {
    const g = state.schedule.find((x) => x.id === box.gameId);
    if (g) recordGame(state, g, box, true);
  }
  rb.since = first;
}

/** Record-breaking moments for a game (for the postgame press) */
export function recordsInGame(state: GameState, gameId: string): RecordBreak[] {
  return state.records?.recent.filter((r) => r.gameId === gameId) ?? [];
}

// ---------------- All-time team records (from program history) ----------------
export interface ProgramTotals {
  teamId: string; seasons: number; w: number; l: number; ncaa: number; s16: number; f4: number; titles: number; confTitles: number; bestW: number; bestSeason: number | null;
}
export function programTotals(state: GameState, t: Team): ProgramTotals {
  const out: ProgramTotals = { teamId: t.id, seasons: t.history.length, w: 0, l: 0, ncaa: 0, s16: 0, f4: 0, titles: 0, confTitles: 0, bestW: 0, bestSeason: null };
  for (const h of t.history) {
    out.w += h.w; out.l += h.l;
    if (h.ncaaSeed != null) out.ncaa++;
    if (['Sweet 16', 'Elite Eight', 'Final Four', 'Runner-up', 'Champion'].includes(h.postseason)) out.s16++;
    if (['Final Four', 'Runner-up', 'Champion'].includes(h.postseason)) out.f4++;
    if (h.postseason === 'Champion') out.titles++;
    if (h.confChamp || h.confTourneyChamp) out.confTitles++;
    if (h.w > out.bestW) { out.bestW = h.w; out.bestSeason = h.season; }
  }
  return out;
}
