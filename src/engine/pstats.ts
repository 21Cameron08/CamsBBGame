// Program and coach stats. Each season, the details that TeamSeasonHistory doesn't keep
// (poll weeks, record vs the Top 25, home/road splits, tournament records, streaks, biggest win,
// recruiting class rank) are saved per program. Summaries for programs and coaches are built on
// demand from team histories, those season lines, awards and the draft, plus the season in
// progress, so the leaderboards are live from day one.
import type { Coach, CoachExit, GameState, ProgSeason, ProgramStatsState, ScheduledGame, Team, TeamSeasonHistory } from './types';
import { classRankings } from './recruiting';
import { loreOf } from '../data/lore';

const IN_SEASON = ['preseason', 'regular', 'confTourney', 'selection', 'ncaa'];
const FIELDS = ['s', 'wk', 'w1', 'hi', 'pre', 'rw', 'rl', 'hw', 'hl', 'aw', 'al', 'nw', 'nl', 'pf', 'pa', 'st', 'tw', 'tl', 'ctw', 'ctl', 'bm', 'bo', 'cr'] as const;
const NULLABLE = new Set(['hi', 'pre', 'cr']);

function enc(x: ProgSeason): (number | string | null)[] { return FIELDS.map((k) => (x[k] ?? null) as number | string | null); }
function dec(a: (number | string | null)[]): ProgSeason {
  const o: Record<string, unknown> = {};
  FIELDS.forEach((k, i) => { o[k] = a[i] ?? (NULLABLE.has(k) ? null : k === 'bo' ? '' : 0); });
  return o as unknown as ProgSeason;
}

export function pstatsState(state: GameState): ProgramStatsState {
  return (state.pstats ??= { since: state.season, seasons: {}, exits: {}, h2h: { coach: {}, team: {} } });
}
export function progSeasons(state: GameState, teamId: string): ProgSeason[] {
  return (state.pstats?.seasons[teamId] ?? []).map(dec);
}

// ---------------- the season in progress ----------------
/** Season details for every team, computed from this season's polls, schedule and records */
export function liveExtras(state: GameState): Record<string, ProgSeason> {
  const polls = state.polls.filter((p) => p.week !== 99).sort((a, b) => a.day - b.day);
  const finalPoll = state.polls.find((p) => p.week === 99);
  const rankMaps = polls.map((p) => new Map(p.ranks.map((id, i) => [id, i + 1])));
  const preIdx = polls.findIndex((p) => /Preseason/i.test(p.label));
  const rankAt = (teamId: string, day: number) => {
    let idx = -1;
    for (let i = 0; i < polls.length; i++) if (polls[i].day <= day) idx = i; else break;
    return idx >= 0 ? rankMaps[idx].get(teamId) ?? null : null;
  };
  const games: Record<string, ScheduledGame[]> = {};
  for (const g of state.schedule) {
    if (!g.played || g.hs == null || g.as == null) continue;
    (games[g.home] ??= []).push(g);
    (games[g.away] ??= []).push(g);
  }
  const out: Record<string, ProgSeason> = {};
  for (const t of Object.values(state.teams)) {
    const x: ProgSeason = { s: state.season, wk: 0, w1: 0, hi: null, pre: null, rw: 0, rl: 0, hw: t.record.hw, hl: t.record.hl, aw: t.record.aw, al: t.record.al, nw: t.record.nw, nl: t.record.nl, pf: t.record.pf, pa: t.record.pa, st: 0, tw: 0, tl: 0, ctw: 0, ctl: 0, bm: 0, bo: '', cr: null };
    rankMaps.forEach((m) => {
      const r = m.get(t.id);
      if (!r) return;
      x.wk++;
      if (r === 1) x.w1++;
      x.hi = x.hi == null ? r : Math.min(x.hi, r);
    });
    if (preIdx >= 0) x.pre = rankMaps[preIdx].get(t.id) ?? null;
    const fr = finalPoll?.ranks.indexOf(t.id) ?? -1;
    if (fr >= 0) x.hi = x.hi == null ? fr + 1 : Math.min(x.hi, fr + 1);
    let run = 0;
    for (const g of (games[t.id] ?? []).sort((a, b) => a.day - b.day)) {
      const home = g.home === t.id;
      const us = home ? g.hs! : g.as!, them = home ? g.as! : g.hs!;
      const won = us > them;
      const opp = home ? g.away : g.home;
      if (rankAt(opp, g.day)) { if (won) x.rw++; else x.rl++; }
      if (g.type === 'ncaa') { if (won) x.tw++; else x.tl++; }
      if (g.type === 'ctourn') { if (won) x.ctw++; else x.ctl++; }
      run = won ? run + 1 : 0;
      x.st = Math.max(x.st, run);
      if (won && us - them > x.bm) { x.bm = us - them; x.bo = opp; }
    }
    out[t.id] = x;
  }
  return out;
}

/** Called at the end of the season, after histories are written */
export function finalizeProgramSeason(state: GameState) {
  const P = pstatsState(state);
  const userTeam = state.user.teamId;
  if ((P.seasons[userTeam] ?? []).some((a) => a[0] === state.season)) return; // already done
  const live = liveExtras(state);
  for (const [id, x] of Object.entries(live)) (P.seasons[id] ??= []).push(enc(x));
  // your record against each program and coach
  for (const g of state.schedule) {
    if (!g.played || g.hs == null || g.as == null || (g.home !== userTeam && g.away !== userTeam)) continue;
    const opp = g.home === userTeam ? g.away : g.home;
    const won = (g.home === userTeam ? g.hs > g.as : g.as > g.hs);
    const ct = (P.h2h.team[opp] ??= [0, 0]);
    ct[won ? 0 : 1]++;
    const oc = state.teams[opp]?.coachId;
    if (oc) { const cc = (P.h2h.coach[oc] ??= [0, 0]); cc[won ? 0 : 1]++; }
  }
}

/** Signing day: store each program's recruiting class rank on the season that just ended */
export function recordClassRanks(state: GameState) {
  const P = pstatsState(state);
  classRankings(state).forEach((c, i) => {
    const list = P.seasons[c.teamId];
    const row = list?.find((a) => a[0] === state.season);
    if (row) row[FIELDS.indexOf('cr')] = i + 1;
  });
}

/** A head coach leaves the league: keep his record */
export function coachExit(state: GameState, c: Coach, status: CoachExit['status'], teamId: string) {
  const P = pstatsState(state);
  P.exits[c.id] = { id: c.id, first: c.first, last: c.last, age: c.age, archetype: c.archetype, status, lastTeam: teamId, until: state.season, careerW: c.careerW, careerL: c.careerL };
}

// ---------------- summaries ----------------
const NCAA_WINS: Record<string, number> = { 'First Four': 0, 'Round of 64': 0, 'Round of 32': 1, 'Sweet 16': 2, 'Elite Eight': 3, 'Final Four': 4, 'Runner-up': 5, Champion: 6 };
const S16 = ['Sweet 16', 'Elite Eight', 'Final Four', 'Runner-up', 'Champion'];
const E8 = ['Elite Eight', 'Final Four', 'Runner-up', 'Champion'];
const F4 = ['Final Four', 'Runner-up', 'Champion'];
const POST_PTS: Record<string, number> = { Champion: 40, 'Runner-up': 24, 'Final Four': 16, 'Elite Eight': 9, 'Sweet 16': 5, 'Round of 32': 2.5, 'Round of 64': 1, 'First Four': 0.5 };

/** points a season is worth toward the Dynasty Score */
export function seasonScore(h: TeamSeasonHistory): number {
  return (POST_PTS[h.postseason] ?? 0) + (h.ncaaSeed != null ? 1 : 0) + (h.confChamp ? 4 : 0) + (h.confTourneyChamp ? 2 : 0)
    + (h.apFinal ? (h.apFinal <= 10 ? 3 : 1) : 0) + (h.w - h.l) * 0.12;
}

export interface SeasonRow { h: TeamSeasonHistory; x: ProgSeason | null; live?: boolean }
export interface ProgramSummary {
  team: Team;
  rows: SeasonRow[];
  seasons: number; w: number; l: number; pct: number; cw: number; cl: number;
  regTitles: number; tournTitles: number; bids: number; ncaaW: number; ncaaL: number;
  s16: number; e8: number; f4: number; ru: number; titles: number; preTitles: number;
  wk: number; w1: number; top25: number; top10: number; preNo1: number;
  rw: number; rl: number; hw: number; hl: number; aw: number; al: number; pf: number; pa: number; games: number;
  draft: number; firstRd: number; lottery: number; aa: number; aa1: number; poy: number;
  coaches: number; classAvg: number | null; topClasses: number; jerseys: number;
  streak: { n: number; s: number }; bigWin: { m: number; opp: string; s: number } | null;
  best: TeamSeasonHistory | null; score: number; tracked: number;
}

interface Index {
  live: Record<string, ProgSeason> | null;
  liveRow: (t: Team) => TeamSeasonHistory | null;
  awards: Record<string, GameState['awards']>;
  draft: Record<string, GameState['draft']>;
}
function buildIndex(state: GameState): Index {
  const inSeason = IN_SEASON.includes(state.phase);
  const awards: Index['awards'] = {}, draft: Index['draft'] = {};
  for (const a of state.awards) (awards[a.teamId] ??= []).push(a);
  for (const d of state.draft) if (d.teamId) (draft[d.teamId] ??= []).push(d);
  return {
    live: inSeason ? liveExtras(state) : null,
    liveRow: (t) => (inSeason && t.record.w + t.record.l > 0 && !t.history.some((h) => h.season === state.season)
      ? { season: state.season, w: t.record.w, l: t.record.l, cw: t.record.cw, cl: t.record.cl, confFinish: 0, confChamp: false, confTourneyChamp: false, ncaaSeed: null, postseason: '', apFinal: null, coachId: t.coachId, rating: t.rating }
      : null),
    awards, draft,
  };
}

function summarize(state: GameState, t: Team, ix: Index): ProgramSummary {
  const xs = new Map(progSeasons(state, t.id).map((x) => [x.s, x]));
  const rows: SeasonRow[] = t.history.map((h) => ({ h, x: xs.get(h.season) ?? null }));
  const lr = ix.liveRow(t);
  if (lr) rows.push({ h: lr, x: ix.live?.[t.id] ?? null, live: true });
  const S: ProgramSummary = {
    team: t, rows, seasons: rows.length, w: 0, l: 0, pct: 0, cw: 0, cl: 0, regTitles: 0, tournTitles: 0, bids: 0, ncaaW: 0, ncaaL: 0,
    s16: 0, e8: 0, f4: 0, ru: 0, titles: 0, preTitles: loreOf(t.id)?.titles?.length ?? 0,
    wk: 0, w1: 0, top25: 0, top10: 0, preNo1: 0, rw: 0, rl: 0, hw: 0, hl: 0, aw: 0, al: 0, pf: 0, pa: 0, games: 0,
    draft: 0, firstRd: 0, lottery: 0, aa: 0, aa1: 0, poy: 0, coaches: 0, classAvg: null, topClasses: 0,
    jerseys: state.legacy?.retired[t.id]?.length ?? 0, streak: { n: 0, s: 0 }, bigWin: null, best: null, score: 0, tracked: 0,
  };
  const coachIds = new Set<string>();
  const classes: number[] = [];
  for (const { h, x, live } of rows) {
    S.w += h.w; S.l += h.l; S.cw += h.cw; S.cl += h.cl;
    if (h.coachId) coachIds.add(h.coachId);
    if (live) S.score += (h.w - h.l) * 0.12; // the season in progress counts its record so far
    if (!live) {
      if (h.confChamp) S.regTitles++;
      if (h.confTourneyChamp) S.tournTitles++;
      if (h.ncaaSeed != null) S.bids++;
      if (S16.includes(h.postseason)) S.s16++;
      if (E8.includes(h.postseason)) S.e8++;
      if (F4.includes(h.postseason)) S.f4++;
      if (h.postseason === 'Runner-up') S.ru++;
      if (h.postseason === 'Champion') S.titles++;
      if (h.apFinal) { S.top25++; if (h.apFinal <= 10) S.top10++; }
      S.score += seasonScore(h);
      if (!S.best || seasonScore(h) > seasonScore(S.best)) S.best = h;
    }
    if (x) {
      S.tracked++;
      S.wk += x.wk; S.w1 += x.w1; if (x.pre === 1) S.preNo1++;
      S.rw += x.rw; S.rl += x.rl; S.hw += x.hw; S.hl += x.hl; S.aw += x.aw; S.al += x.al; S.pf += x.pf; S.pa += x.pa; S.games += h.w + h.l;
      if (x.st > S.streak.n) S.streak = { n: x.st, s: h.season };
      if (x.bm && (!S.bigWin || x.bm > S.bigWin.m)) S.bigWin = { m: x.bm, opp: x.bo, s: h.season };
      if (x.cr) { classes.push(x.cr); if (x.cr <= 10) S.topClasses++; }
      if (!live) { S.ncaaW += x.tw; S.ncaaL += x.tl; }
    } else if (!live && h.ncaaSeed != null) {
      S.ncaaW += NCAA_WINS[h.postseason] ?? 0;
      S.ncaaL += h.postseason === 'Champion' ? 0 : 1;
    }
  }
  S.pct = S.w + S.l ? S.w / (S.w + S.l) : 0;
  S.coaches = coachIds.size;
  S.classAvg = classes.length ? classes.reduce((a, b) => a + b, 0) / classes.length : null;
  for (const a of ix.awards[t.id] ?? []) {
    if (a.name.startsWith('All-American')) { S.aa++; if (a.name === 'All-American First Team') S.aa1++; }
    if (a.name === 'National Player of the Year') S.poy++;
  }
  for (const d of ix.draft[t.id] ?? []) { S.draft++; if (d.round === 1) S.firstRd++; if (d.pick <= 14) S.lottery++; }
  S.score += S.w1 * 0.4 + S.poy * 3 + S.firstRd * 0.8;
  S.score = Math.round(S.score * 10) / 10;
  return S;
}

export function programSummaries(state: GameState): ProgramSummary[] {
  const ix = buildIndex(state);
  return Object.values(state.teams).map((t) => summarize(state, t, ix));
}
export function programSummary(state: GameState, teamId: string): ProgramSummary | null {
  const t = state.teams[teamId];
  return t ? summarize(state, t, buildIndex(state)) : null;
}

// ---------------- coaches ----------------
export interface CoachSeasonRow { season: number; teamId: string; h: TeamSeasonHistory; coy: boolean; live?: boolean }
export interface CoachSummary {
  id: string; first: string; last: string; age: number; archetype: string;
  coach?: Coach; exit?: CoachExit; isUser: boolean; active: boolean;
  teamId: string | null; status: string;
  rows: CoachSeasonRow[];
  seasons: number; w: number; l: number; pct: number; careerW: number; careerL: number; preW: number; preL: number;
  cw: number; cl: number; regTitles: number; tournTitles: number; bids: number; ncaaW: number; ncaaL: number;
  s16: number; f4: number; titles: number; coy: number; draft: number; firstRd: number; aa: number; poy: number;
  schools: string[]; best: CoachSeasonRow | null; score: number; tier: string; rep: number | null;
}
export const TIERS: { min: number; label: string; cls: string }[] = [
  { min: 300, label: 'Legend', cls: 'gold' },
  { min: 180, label: 'Hall of Famer', cls: 'gold' },
  { min: 100, label: 'Elite', cls: 'accent' },
  { min: 45, label: 'Proven', cls: 'blue' },
  { min: 15, label: 'Rising', cls: 'good' },
  { min: -Infinity, label: 'Unproven', cls: '' },
];
export const tierOf = (score: number) => TIERS.find((t) => score >= t.min)!;

export function coachSummaries(state: GameState): CoachSummary[] {
  const P = state.pstats;
  const inSeason = IN_SEASON.includes(state.phase);
  // every dynasty season, by coach
  const byCoach: Record<string, CoachSeasonRow[]> = {};
  const coachOf: Record<string, string> = {};
  const coy = new Set(state.awards.filter((a) => a.name === 'Coach of the Year' && a.coachId).map((a) => `${a.coachId}:${a.season}`));
  for (const t of Object.values(state.teams)) {
    for (const h of t.history) {
      if (!h.coachId) continue;
      coachOf[`${t.id}:${h.season}`] = h.coachId;
      (byCoach[h.coachId] ??= []).push({ season: h.season, teamId: t.id, h, coy: coy.has(`${h.coachId}:${h.season}`) });
    }
    if (inSeason && t.coachId && t.record.w + t.record.l > 0 && !t.history.some((h) => h.season === state.season)) {
      (byCoach[t.coachId] ??= []).push({ season: state.season, teamId: t.id, live: true, coy: false, h: { season: state.season, w: t.record.w, l: t.record.l, cw: t.record.cw, cl: t.record.cl, confFinish: 0, confChamp: false, confTourneyChamp: false, ncaaSeed: null, postseason: '', apFinal: null, coachId: t.coachId, rating: t.rating } });
      coachOf[`${t.id}:${state.season}`] = t.coachId;
    }
  }
  const draft: Record<string, { n: number; first: number }> = {};
  for (const d of state.draft) {
    const c = coachOf[`${d.teamId}:${d.season - 1}`];
    if (!c) continue;
    const e = (draft[c] ??= { n: 0, first: 0 });
    e.n++; if (d.round === 1) e.first++;
  }
  const players: Record<string, { aa: number; poy: number }> = {};
  for (const a of state.awards) {
    if (!a.playerId) continue;
    const c = coachOf[`${a.teamId}:${a.season}`];
    if (!c) continue;
    const e = (players[c] ??= { aa: 0, poy: 0 });
    if (a.name.startsWith('All-American')) e.aa++;
    if (a.name === 'National Player of the Year') e.poy++;
  }
  const cache = new Map<string, ProgSeason[]>();
  const seasonsOf = (teamId: string) => { let v = cache.get(teamId); if (!v) { v = progSeasons(state, teamId); cache.set(teamId, v); } return v; };
  const ids = new Set([...Object.keys(state.coaches).filter((id) => state.coaches[id].teamId || state.coaches[id].isUser), ...Object.keys(P?.exits ?? {})]);
  const out: CoachSummary[] = [];
  for (const id of ids) {
    const c = state.coaches[id];
    const ex = c ? undefined : P?.exits[id];
    if (!c && !ex) continue;
    const rows = (byCoach[id] ?? []).sort((a, b) => a.season - b.season);
    const S: CoachSummary = {
      id, first: c?.first ?? ex!.first, last: c?.last ?? ex!.last, age: c?.age ?? ex!.age, archetype: c?.archetype ?? ex!.archetype,
      coach: c, exit: ex, isUser: !!c?.isUser, active: !!c, teamId: c?.teamId ?? null,
      status: c ? (c.teamId ? state.teams[c.teamId]?.school ?? '' : 'Free agent') : `${ex!.status === 'retired' ? 'Retired' : 'Fired'} ${ex!.until + 1}`,
      rows, seasons: rows.length, w: 0, l: 0, pct: 0, careerW: c?.careerW ?? ex!.careerW, careerL: c?.careerL ?? ex!.careerL, preW: 0, preL: 0,
      cw: 0, cl: 0, regTitles: 0, tournTitles: 0, bids: 0, ncaaW: 0, ncaaL: 0, s16: 0, f4: 0, titles: 0,
      coy: rows.filter((r) => r.coy).length, draft: draft[id]?.n ?? 0, firstRd: draft[id]?.first ?? 0, aa: players[id]?.aa ?? 0, poy: players[id]?.poy ?? 0,
      schools: [...new Set(rows.map((r) => r.teamId))], best: null, score: 0, tier: '', rep: c ? c.reputation : null,
    };
    for (const r of rows) {
      const h = r.h;
      S.w += h.w; S.l += h.l; S.cw += h.cw; S.cl += h.cl;
      if (r.live) { S.score += (h.w - h.l) * 0.12; continue; }
      if (h.confChamp) S.regTitles++;
      if (h.confTourneyChamp) S.tournTitles++;
      if (h.ncaaSeed != null) {
        S.bids++;
        const x = seasonsOf(r.teamId).find((y) => y.s === h.season);
        S.ncaaW += x ? x.tw : NCAA_WINS[h.postseason] ?? 0;
        S.ncaaL += x ? x.tl : h.postseason === 'Champion' ? 0 : 1;
      }
      if (S16.includes(h.postseason)) S.s16++;
      if (F4.includes(h.postseason)) S.f4++;
      if (h.postseason === 'Champion') S.titles++;
      S.score += seasonScore(h);
      if (!S.best || seasonScore(h) > seasonScore(S.best.h)) S.best = r;
    }
    S.pct = S.w + S.l ? S.w / (S.w + S.l) : 0;
    S.preW = Math.max(0, S.careerW - S.w);
    S.preL = Math.max(0, S.careerL - S.l);
    S.score += S.coy * 6 + S.poy * 3 + S.firstRd * 0.6 + Math.max(0, S.preW * 0.1 - S.preL * 0.05);
    S.score = Math.round(S.score * 10) / 10;
    S.tier = tierOf(S.score).label;
    out.push(S);
  }
  return out;
}

/** your games this season that aren't in the head-to-head book yet */
function liveH2H(state: GameState, f: (opp: string) => boolean): [number, number] {
  const out: [number, number] = [0, 0];
  const uid = state.user.teamId;
  if (!IN_SEASON.includes(state.phase)) return out;
  for (const g of state.schedule) {
    if (!g.played || g.hs == null || g.as == null || (g.home !== uid && g.away !== uid)) continue;
    const opp = g.home === uid ? g.away : g.home;
    if (!f(opp)) continue;
    out[(g.home === uid ? g.hs > g.as : g.as > g.hs) ? 0 : 1]++;
  }
  return out;
}
/** your record against a program (since tracking began, including this season) */
export function h2hTeam(state: GameState, teamId: string): [number, number] {
  const b = state.pstats?.h2h.team[teamId] ?? [0, 0];
  const l = liveH2H(state, (opp) => opp === teamId);
  return [b[0] + l[0], b[1] + l[1]];
}
/** your record against a coach (since tracking began, including this season) */
export function h2hCoach(state: GameState, coachId: string): [number, number] {
  const b = state.pstats?.h2h.coach[coachId] ?? [0, 0];
  const l = liveH2H(state, (opp) => state.teams[opp]?.coachId === coachId);
  return [b[0] + l[0], b[1] + l[1]];
}

/** Saves from before stat tracking: start now, and catch the season that just ended if we're in the offseason */
export function ensurePstats(state: GameState) {
  if (state.pstats) return;
  const P = pstatsState(state);
  const done = state.teams[state.user.teamId]?.history.some((h) => h.season === state.season);
  if (!IN_SEASON.includes(state.phase) && done && state.schedule.some((g) => g.played)) finalizeProgramSeason(state);
  else if (!IN_SEASON.includes(state.phase)) P.since = state.season + 1;
}
