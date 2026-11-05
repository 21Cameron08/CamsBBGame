// Recruiting: class generation, interest model, AI recruiting, user actions, commitments.
import { rng, clamp } from './rng';
import type { GameState, Recruit, RecruitPriorities, RecruitSchool, Team, Pos, RecruitType, RecruitDecision } from './types';
import { ARCHETYPES_BY_POS, buildRatings, calcOvr, fmtMoney, genFollowers, genName, genTraits, pickPlace, nilValue, randomPos, roundMoney } from './player';
import { milesBetween } from '../data/places';
import { teamPlayers, ROSTER_MAX, confTierOf } from './team';
import { staffEffects } from './staff';
import { academicBonus } from './facilities';
import { nbaCount, pipelineBonus } from './pros';

export const RECRUIT_ACTIONS = {
  text: { label: 'Text', hours: 1, pts: 2.5, desc: 'Quick check-in. Small relationship boost.' },
  call: { label: 'Phone Call', hours: 3, pts: 5.5, desc: 'Weekly call with the prospect. Solid boost.' },
  asst: { label: 'Assistant Visit', hours: 6, pts: 8, desc: 'Send an assistant to watch him play.' },
  hc: { label: 'Head Coach Visit', hours: 12, pts: 14, desc: 'In-home visit from you. Big boost.' },
  visit: { label: 'Official Visit', hours: 16, pts: 20, desc: 'Bring him to campus. Boosted by fan hype & winning. Once per recruit.' },
  scout: { label: 'Scout', hours: 3, pts: 0, desc: 'Evaluate film. Reveals more accurate ratings.' },
} as const;
export type RecruitActionKey = keyof typeof RECRUIT_ACTIONS;

const PRIORITY_KEYS: (keyof RecruitPriorities)[] = ['nil', 'pt', 'prestige', 'proximity', 'coach', 'pro', 'academics', 'winning'];
export const PRIORITY_LABELS: Record<keyof RecruitPriorities, string> = {
  nil: 'NIL Money', pt: 'Playing Time', prestige: 'Program Prestige', proximity: 'Close to Home',
  coach: 'Coach Relationship', pro: 'Pro Development', academics: 'Academics', winning: 'Winning Now',
};

const STORYLINES = [
  'Son of a former NBA player', 'Reclassified up a year', 'Grew 4 inches since last summer', 'Viral mixtape star with millions of views',
  'State Player of the Year', 'Led his team to a state title', 'Overseas pro looking to play college ball', 'Former football recruit',
  'Twin brother is also a D-I prospect', 'Played for a famous prep powerhouse', 'Late bloomer climbing the rankings', 'Coming back from injury',
  'Grandfather played at a blue blood', 'Top student in his class', 'Elite AAU circuit standout', 'Former G League Ignite camp invitee',
];

function genPriorities(type: RecruitType, stars: number, traits: string[]): RecruitPriorities {
  const p: RecruitPriorities = { nil: 0, pt: 0, prestige: 0, proximity: 0, coach: 0, pro: 0, academics: 0, winning: 0 };
  for (const k of PRIORITY_KEYS) p[k] = rng.range(0.3, 1);
  if (stars >= 4) { p.pro += 0.5; p.nil += 0.3; p.prestige += 0.2; }
  if (stars <= 2) { p.pt += 0.4; p.prestige -= 0.1; }
  if (type === 'INTL') { p.proximity = 0.1; p.pro += 0.3; }
  if (type === 'JUCO') { p.pt += 0.4; p.nil += 0.2; }
  if (traits.includes('mercenary')) p.nil += 0.8;
  if (traits.includes('hometown')) p.proximity += 1.0;
  if (traits.includes('scholar')) p.academics += 0.8;
  // normalize to sum 1
  const sum = PRIORITY_KEYS.reduce((s, k) => s + Math.max(0.05, p[k]), 0);
  for (const k of PRIORITY_KEYS) p[k] = Math.max(0.05, p[k]) / sum;
  return p;
}

export function topPriorities(p: RecruitPriorities, n = 3): (keyof RecruitPriorities)[] {
  return [...PRIORITY_KEYS].sort((a, b) => p[b] - p[a]).slice(0, n);
}

/** Generate a recruiting class for `classYear` (enrolls that fall) */
export function generateClass(state: GameState, classYear: number): Recruit[] {
  const out: Recruit[] = [];
  const N = 1350;
  for (let i = 0; i < N; i++) {
    const rankPct = i / N; // 0 best
    const type: RecruitType = i < 40 ? (rng.chance(0.08) ? 'INTL' : rng.chance(0.06) ? 'PREP' : 'HS') : rng.weighted<RecruitType>(['HS', 'JUCO', 'INTL', 'PREP'], [80, 9, 6, 5]);
    // quality curve
    const q = 1 - Math.pow(rankPct, 0.55);
    let ovr = Math.round(44 + q * 30 + rng.normal(0, 2.5));
    let pot = Math.round(ovr + 10 + q * 12 + rng.normal(0, 4));
    if (type === 'JUCO') { ovr += 4; pot -= 4; }
    if (type === 'INTL') { pot += rng.int(-3, 6); }
    const pos = randomPos();
    const arch = rng.pick(ARCHETYPES_BY_POS[pos]);
    const hm: Record<Pos, number> = { PG: 74, SG: 76.5, SF: 78.5, PF: 80.5, C: 83 };
    const height = Math.round(clamp(rng.normal(hm[pos], 1.5), hm[pos] - 4, hm[pos] + 4));
    const ratings = buildRatings(pos, arch, ovr, height);
    ovr = calcOvr(ratings, pos);
    pot = clamp(Math.max(pot, ovr + 2), ovr, 99);
    const intl = type === 'INTL';
    const nm = genName(intl);
    const place = pickPlace();
    const traits = genTraits();
    const r: Recruit = {
      id: rng.id('r'),
      first: nm.first,
      last: nm.last,
      pos,
      archetype: arch,
      height,
      weight: Math.round(185 + (height - 74) * 7.5 + rng.normal(0, 10)),
      hometown: intl ? nm.country : place.city,
      state: intl ? nm.country : place.state,
      country: nm.country,
      age: type === 'JUCO' ? 20 : type === 'INTL' ? rng.int(18, 20) : rng.chance(0.3) ? 19 : 18,
      ratings,
      ovr,
      pot,
      stars: 0,
      traits,
      num: 0,
      followers: 0,
      injury: null,
      history: [],
      awards: [],
      type,
      rank: 0,
      posRank: 0,
      priorities: genPriorities(type, 3, traits),
      schools: [],
      committed: null,
      committedWeek: null,
      signed: false,
      scouted: 0,
      nilAsk: 0,
      decisionWeek: rng.int(3, 26),
      userWeek: { call: false, text: false, asst: false, hc: false, visit: false, scout: 0 },
      userPromise: null,
      classYear,
      storyline: rng.chance(0.12) ? rng.pick(STORYLINES) : undefined,
      lat: intl ? 40 : place.lat,
      lng: intl ? -40 : place.lng,
    };
    out.push(r);
  }
  // rank by composite
  const comp = (r: Recruit) => r.ovr * 0.45 + r.pot * 0.55 + rng.normal(0, 1.2);
  const scored = out.map((r) => ({ r, s: comp(r) })).sort((a, b) => b.s - a.s);
  const posCount: Record<string, number> = {};
  scored.forEach(({ r }, i) => {
    r.rank = i + 1;
    posCount[r.pos] = (posCount[r.pos] ?? 0) + 1;
    r.posRank = posCount[r.pos];
    r.stars = i < 28 ? 5 : i < 140 ? 4 : i < 520 ? 3 : i < 1050 ? 2 : 1;
    r.priorities = genPriorities(r.type, r.stars, r.traits);
    r.followers = genFollowers(r.stars, r.ovr, r.traits);
    r.nilAsk = askFor(r);
    if (r.stars >= 4) r.decisionWeek = rng.int(6, 30);
  });
  return scored.map((x) => x.r);
}

function askFor(r: Recruit): number {
  // recruits value themselves on potential
  const v = nilValue({ ovr: Math.round(r.ovr * 0.5 + r.pot * 0.5), pot: r.pot, followers: r.followers, traits: r.traits, stars: r.stars }, 6);
  return roundMoney(v * (0.6 + r.priorities.nil * 2));
}

export function recruitLatLng(r: Recruit): [number, number] {
  return [r.lat ?? 38, r.lng ?? -90];
}

// Batch cache of returning-roster depth (set during weekly batch updates)
let depthCache: Map<string, { byPos: Record<string, number[]>; count: number }> | null = null;
function buildDepthCache(state: GameState) {
  depthCache = new Map();
  for (const t of Object.values(state.teams)) {
    const byPos: Record<string, number[]> = { PG: [], SG: [], SF: [], PF: [], C: [] };
    let count = 0;
    for (const id of t.roster) {
      const p = state.players[id];
      if (!p || p.elig <= 1) continue;
      byPos[p.pos].push(p.ovr);
      count++;
    }
    depthCache.set(t.id, { byPos, count });
  }
}

/** How good a fit/appeal a team is for a recruit (0..100), excluding relationship */
export function teamAppeal(state: GameState, r: Recruit, team: Team, nilOffer = 0, promise: Recruit['userPromise'] = null): { total: number; parts: Record<keyof RecruitPriorities, number> } {
  const coach = state.coaches[team.coachId];
  const [lat, lng] = recruitLatLng(r);
  const miles = r.type === 'INTL' ? 1500 : milesBetween(lat, lng, team.lat, team.lng);
  // playing time: how many better players at position returning
  const bar = r.ovr + (r.pot - r.ovr) * 0.3;
  let ahead = 0, rosterCount = 0;
  const dc = depthCache?.get(team.id);
  if (dc) {
    for (const o of dc.byPos[r.pos]) if (o + 2 >= bar) ahead++;
    rosterCount = dc.count;
  } else {
    const roster = teamPlayers(state, team.id).filter((p) => p.elig > 1);
    ahead = roster.filter((p) => p.pos === r.pos && p.ovr + 2 >= bar).length;
    rosterCount = roster.length;
  }
  let pt = clamp(100 - ahead * 28 - Math.max(0, rosterCount - 10) * 4, 5, 100);
  if (promise === 'star') pt = Math.max(pt, 100);
  else if (promise === 'starter') pt = Math.max(pt, 85);
  else if (promise === 'rotation') pt = Math.max(pt, 60);
  const ask = Math.max(1, r.nilAsk);
  const nil = clamp((nilOffer / ask) * 70 + (team.nilBudget > ask * 3 ? 10 : 0), 0, 100);
  const tierBoost = [0, 12, 4, 0, -6][confTierOf(state, team)] ?? 0;
  const parts: Record<keyof RecruitPriorities, number> = {
    nil,
    pt,
    prestige: clamp(team.prestige + tierBoost, 0, 100),
    proximity: clamp(100 - miles / 12, 0, 100),
    coach: clamp((coach?.reputation ?? 50) * 0.8 + (coach ? coach.skills.recruiting * 2 : 10) + (team.id === state.user.teamId && state.staff && staffPipelineState(state) === r.state ? 12 : 0), 0, 100),
    pro: clamp(team.prestige * 0.6 + (coach ? coach.skills.development * 4 : 20) + (team.facilities ?? 5) * 2 + pipelineBonus(state, team.id), 0, 100),
    academics: clamp(team.academics * 10 + academicBonus(state, team.id), 0, 100),
    winning: clamp(50 + team.rating * 2.2 + (team.record.w - team.record.l) * 1.5, 0, 100),
  };
  let total = 0;
  for (const k of PRIORITY_KEYS) total += parts[k] * r.priorities[k];
  // Elite recruits discount low-level programs heavily
  const levelGap = r.stars * 18 - team.prestige;
  if (levelGap > 20) total -= (levelGap - 20) * 0.5;
  return { total: clamp(total, 0, 100), parts };
}

let pipeCache: { s: GameState; v: string | null } | null = null;
function staffPipelineState(state: GameState): string | null {
  if (!pipeCache || pipeCache.s !== state || !depthCache) pipeCache = { s: state, v: staffEffects(state).pipeline };
  return pipeCache.v;
}

export function schoolEntry(r: Recruit, teamId: string): RecruitSchool | undefined {
  return r.schools.find((s) => s.teamId === teamId);
}

function ensureSchool(r: Recruit, teamId: string): RecruitSchool {
  let s = schoolEntry(r, teamId);
  if (!s) {
    s = { teamId, interest: 0, offered: false, nilOffer: 0, visited: false, rel: 0 };
    r.schools.push(s);
  }
  return s;
}

export function interestOf(state: GameState, r: Recruit, s: RecruitSchool, promise?: Recruit['userPromise']): number {
  const team = state.teams[s.teamId];
  if (!team) return 0;
  const isUser = s.teamId === state.user.teamId;
  const pr = isUser ? (promise !== undefined ? promise : r.userPromise) : null;
  const appeal = teamAppeal(state, r, team, s.nilOffer, pr).total;
  return clamp(appeal * 0.55 + s.rel * 0.5 + (s.offered ? 5 : 0), 0, 100);
}

function addRel(s: RecruitSchool, pts: number) {
  s.rel = clamp(s.rel + pts * (1 - s.rel / 110), 0, 100);
}

/** Seed each recruit's initial list of interested schools */
export function seedInterest(state: GameState) {
  buildDepthCache(state);
  const teams = Object.values(state.teams);
  for (const r of Object.values(state.recruits)) {
    if (r.committed) continue;
    // pick candidate teams by appeal sampling
    const cands: { t: Team; a: number }[] = [];
    for (let i = 0; i < 40; i++) {
      const t = rng.pick(teams);
      const fit = 100 - Math.abs(r.stars * 18 - t.prestige) * 1.2;
      if (fit < 20 && rng.chance(0.85)) continue;
      cands.push({ t, a: teamAppeal(state, r, t).total + fit * 0.3 + rng.normal(0, 8) });
    }
    cands.sort((a, b) => b.a - a.a);
    const seen = new Set<string>();
    for (const c of cands) {
      if (seen.has(c.t.id)) continue;
      seen.add(c.t.id);
      const s = ensureSchool(r, c.t.id);
      s.rel = rng.range(0, 15);
      if (seen.size >= 6) break;
    }
    for (const s of r.schools) s.interest = interestOf(state, r, s);
  }
  depthCache = null;
}

/** Open scholarship spots a team will have next season */
let commitCache: Map<string, number> | null = null;
export function openSpots(state: GameState, teamId: string): number {
  const dc = depthCache?.get(teamId);
  const returning = dc ? dc.count : teamPlayers(state, teamId).filter((p) => p.elig > 1).length;
  const commits = commitCache ? commitCache.get(teamId) ?? 0 : Object.values(state.recruits).filter((r) => r.committed === teamId).length;
  return Math.max(0, ROSTER_MAX - returning - commits);
}
function buildCommitCache(state: GameState) {
  commitCache = new Map();
  for (const r of Object.values(state.recruits)) if (r.committed) commitCache.set(r.committed, (commitCache.get(r.committed) ?? 0) + 1);
}

/** AI recruiting each week */
export function aiRecruitingWeek(state: GameState, week: number) {
  buildDepthCache(state);
  buildCommitCache(state);
  const recruits = Object.values(state.recruits).filter((r) => !r.committed);
  const byStars: Record<number, Recruit[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  const offersBy = new Map<string, Recruit[]>();
  for (const r of recruits) {
    byStars[r.stars].push(r);
    for (const s of r.schools) if (s.offered) {
      const l = offersBy.get(s.teamId);
      if (l) l.push(r); else offersBy.set(s.teamId, [r]);
    }
  }
  for (const team of Object.values(state.teams)) {
    if (team.id === state.user.teamId && !state.settings.autoRecruit) continue;
    const coach = state.coaches[team.coachId];
    const open = openSpots(state, team.id);
    const offers = offersBy.get(team.id) ?? [];
    const wantOffers = Math.min(14, open * 3 + 1);
    if (open > 0 && offers.length < wantOffers) {
      const lvl = team.prestige;
      const starPool = lvl >= 88 ? [5, 4] : lvl >= 72 ? [4, 5, 3] : lvl >= 58 ? [4, 3] : lvl >= 40 ? [3, 2] : lvl >= 22 ? [2, 3, 1] : [2, 1];
      for (let k = 0; k < wantOffers - offers.length; k++) {
        const stars = rng.weighted(starPool, starPool.map((_, i) => 1 / (i + 1)));
        const pool = byStars[stars];
        if (!pool.length) continue;
        // pick a few random candidates, prefer proximity & positional need
        let best: Recruit | null = null, bestS = -1e9;
        for (let i = 0; i < 6; i++) {
          const r = rng.pick(pool);
          if (r.committed) continue;
          const [lat, lng] = recruitLatLng(r);
          const miles = milesBetween(lat, lng, team.lat, team.lng);
          const s = -miles / 300 + rng.normal(0, 1) + (schoolEntry(r, team.id) ? 2 : 0);
          if (s > bestS) { bestS = s; best = r; }
        }
        if (best) {
          const s = ensureSchool(best, team.id);
          if (!s.offered) {
            s.offered = true;
            s.nilOffer = roundMoney(Math.min(best.nilAsk * rng.range(0.6, 1.1), team.nilBudget * 0.16));
          }
        }
      }
    }
    // effort on offered recruits
    const effort = 3 + team.prestige / 25 + (coach ? coach.skills.recruiting * 0.5 : 2);
    for (const r of offers) {
      const s = schoolEntry(r, team.id)!;
      addRel(s, effort * rng.range(0.5, 1.4) * (state.settings.difficulty === 'legend' ? 1.2 : state.settings.difficulty === 'rookie' ? 0.8 : 1));
      if (!s.visited && week >= 4 && rng.chance(0.08)) { s.visited = true; addRel(s, 12); }
    }
  }
  depthCache = null;
  commitCache = null;
}

const spotsCache = new Map<string, number>();
function openSpotsCached(state: GameState, teamId: string) {
  if (!commitCache) return openSpots(state, teamId);
  if (!spotsCache.has(teamId)) spotsCache.set(teamId, openSpots(state, teamId));
  return spotsCache.get(teamId)!;
}

// ---------------- Commitment odds ----------------
/**
 * Softmax temperature for commitment odds. Head-to-head, a 5-point interest
 * lead is about 70%, 10 points about 84% and 20 points about 96%.
 */
export const COMMIT_TEMP = 6;

export interface RecruitOdds {
  teamId: string;
  /** live interest in this school (0-100) */
  interest: number;
  /** chance he picks this school if he decided right now (0 if he can't pick it) */
  p: number;
  offered: boolean;
  /** the school has a scholarship open for next season */
  room: boolean;
}

/** A hypothetical offer from the user, to preview odds before sending it */
export interface UserOfferPreview { nil: number; promise: Recruit['userPromise'] }

/**
 * Honest commitment odds: the same numbers the weekly decision uses.
 * Only schools that have offered and still have a scholarship open can be picked.
 */
export function recruitOdds(state: GameState, r: Recruit, preview?: UserOfferPreview, roomFn?: (teamId: string) => boolean): RecruitOdds[] {
  const uid = state.user.teamId;
  const hasRoom = roomFn ?? ((id: string) => openSpotsCached(state, id) > 0);
  const schools = [...r.schools];
  if (preview && !schools.some((s) => s.teamId === uid)) schools.push({ teamId: uid, interest: 0, offered: false, nilOffer: 0, visited: false, rel: 0 });
  const rows: RecruitOdds[] = schools.filter((s) => state.teams[s.teamId]).map((s) => {
    let entry = s, promise: Recruit['userPromise'] | undefined;
    if (preview && s.teamId === uid) {
      // mirror userOffer(): a first offer also earns a small relationship bump
      const rel = s.offered ? s.rel : clamp(s.rel + 6 * (1 - s.rel / 110), 0, 100);
      entry = { ...s, offered: true, nilOffer: Math.max(0, Math.round(preview.nil)), rel };
      promise = preview.promise;
    }
    return { teamId: s.teamId, interest: interestOf(state, r, entry, promise), p: 0, offered: entry.offered, room: hasRoom(s.teamId) };
  });
  const elig = rows.filter((x) => x.offered && x.room);
  if (elig.length) {
    const max = Math.max(...elig.map((x) => x.interest));
    let tot = 0;
    for (const x of elig) { x.p = Math.exp((x.interest - max) / COMMIT_TEMP); tot += x.p; }
    for (const x of elig) x.p /= tot;
  }
  return rows.sort((a, b) => b.p - a.p || b.interest - a.interest);
}

/** Run UI-side odds lookups with the batch caches built once (fast for long lists) */
export function withRecruitCache<T>(state: GameState, fn: () => T): T {
  buildDepthCache(state);
  buildCommitCache(state);
  try { return fn(); } finally { depthCache = null; commitCache = null; spotsCache.clear(); }
}

/** Last calendar week of the season; recruits with a later decision week wait for Signing Day */
export function lastRecruitWeek(state: GameState): number {
  let w = 0;
  for (const d of state.calendar) if (d.week > w) w = d.week;
  return w || 23;
}

/** Would he commit early this week? (big favorite pulling away) */
function earlyReady(top: number, second: number) {
  return top >= 82 && top - second >= 12;
}

export interface RecruitOutlook {
  odds: RecruitOdds[];
  mine: RecruitOdds | undefined;
  /** user's chance if he decided now */
  userP: number;
  /** best school by interest (whether or not it has offered) */
  leader: RecruitOdds | undefined;
  /** favorite among schools he can actually pick */
  favorite: RecruitOdds | undefined;
  /** warnings about the user's position, most urgent first */
  warnings: { level: 'bad' | 'gold'; text: string }[];
  /** when he's expected to decide */
  timing: string;
  deciding: boolean;
}

/** Everything the UI needs to show where the user stands with a recruit */
export function recruitOutlook(state: GameState, r: Recruit, preview?: UserOfferPreview): RecruitOutlook {
  const uid = state.user.teamId;
  const odds = recruitOdds(state, r, preview);
  const mine = odds.find((o) => o.teamId === uid);
  const byInterest = [...odds].sort((a, b) => b.interest - a.interest);
  const leader = byInterest[0];
  const favorite = odds[0]?.p ? odds[0] : undefined;
  const week = state.calendar[state.day]?.week ?? 0;
  const last = lastRecruitWeek(state);
  const inSeason = state.phase === 'preseason' || state.phase === 'regular' || state.phase === 'confTourney' || state.phase === 'selection' || state.phase === 'ncaa';
  const warnings: RecruitOutlook['warnings'] = [];
  if (!r.committed) {
    const leadsByInterest = !!mine && leader?.teamId === uid && mine.interest > 0;
    if (!mine || !mine.offered) {
      if (leadsByInterest) warnings.push({ level: 'bad', text: `You lead, but you haven't offered. He can't commit to you without a scholarship offer.` });
      else if (mine) warnings.push({ level: 'gold', text: `No offer yet, so he can't pick you. Offer to get in the race.` });
    } else if (!mine.room) {
      warnings.push({ level: 'bad', text: `No scholarships left for next season, so your offer can't land. Free up a spot or he'll go elsewhere.` });
    }
    const elig = odds.filter((o) => o.p > 0).sort((a, b) => b.interest - a.interest);
    if (elig.length && elig[0].teamId !== uid && earlyReady(elig[0].interest, elig[1]?.interest ?? 0) && inSeason)
      warnings.push({ level: 'bad', text: `${state.teams[elig[0].teamId].school} is pulling away. He could commit there any week now.` });
    if (mine?.offered && mine.room && favorite && favorite.teamId !== uid && mine.p < favorite.p) {
      const gap = Math.round(favorite.interest - mine.interest);
      if (gap > 0) warnings.push({ level: 'gold', text: `${state.teams[favorite.teamId].school} leads by ${gap} interest. Close the gap before he decides.` });
    }
    if (mine?.offered && mine.room) {
      // a school he likes more could still offer (an offer adds about 5 interest)
      const lurker = odds.find((o) => !o.offered && o.room && o.teamId !== uid && o.interest + 5 > mine.interest);
      if (lurker) warnings.push({ level: 'gold', text: `${state.teams[lurker.teamId].school} (${Math.round(lurker.interest)}) hasn't offered yet. If they do, they'd ${lurker.interest > mine.interest ? 'jump ahead of' : 'be right with'} you.` });
    }
    const topElig = elig[0]?.interest ?? 0;
    if (inSeason && r.decisionWeek <= lastRecruitWeek(state) && topElig < 55 && (mine?.offered || leadsByInterest))
      warnings.push({ level: 'gold', text: `He won't commit during the season until a school that offered reaches 55 interest${mine?.offered ? ` (you're at ${Math.round(mine.interest)})` : ''}. Otherwise he waits for Signing Day.` });
  }
  let timing = '';
  let deciding = false;
  if (r.committed) timing = 'Committed';
  else if (!inSeason) { timing = 'Decides on Signing Day'; deciding = true; }
  else if (r.decisionWeek > last) timing = 'Decides on Signing Day';
  else {
    const left = r.decisionWeek - week;
    if (left <= 0) { timing = (leader?.interest ?? 0) >= 55 ? 'Could decide this week' : 'Ready to decide, waiting for a school to stand out'; deciding = true; }
    else timing = `Decision in ~${left} wk`;
  }
  return { odds, mine, userP: mine?.p ?? 0, leader, favorite, warnings, timing, deciding };
}

// ---------------- Why he chose ----------------
const FACTOR_LABEL: Record<keyof RecruitPriorities | 'rel', string> = {
  nil: 'NIL money', pt: 'playing time', prestige: 'program prestige', proximity: 'staying close to home',
  coach: 'the head coach', pro: 'pro development', academics: 'academics', winning: 'winning right now', rel: 'the relationship',
};

/** Factors where school A beat school B for this recruit, biggest edge first */
export function decisionFactors(state: GameState, r: Recruit, aId: string, bId: string): { key: keyof RecruitPriorities | 'rel'; edge: number; label: string }[] {
  const ta = state.teams[aId], tb = state.teams[bId];
  const sa = schoolEntry(r, aId), sb = schoolEntry(r, bId);
  if (!ta || !tb) return [];
  const uid = state.user.teamId;
  const pa = teamAppeal(state, r, ta, sa?.nilOffer ?? 0, aId === uid ? r.userPromise : null).parts;
  const pb = teamAppeal(state, r, tb, sb?.nilOffer ?? 0, bId === uid ? r.userPromise : null).parts;
  const out: { key: keyof RecruitPriorities | 'rel'; edge: number; label: string }[] = [];
  for (const k of PRIORITY_KEYS) {
    const edge = (pa[k] - pb[k]) * r.priorities[k] * 0.55;
    let label = FACTOR_LABEL[k];
    if (k === 'nil' && (sa?.nilOffer || sb?.nilOffer)) label = `NIL money (${fmtMoney(sa?.nilOffer ?? 0)} vs ${fmtMoney(sb?.nilOffer ?? 0)})`;
    if (k === 'proximity' && r.type !== 'INTL') {
      const [lat, lng] = recruitLatLng(r);
      label = `staying close to home (${Math.round(milesBetween(lat, lng, ta.lat, ta.lng))} mi vs ${Math.round(milesBetween(lat, lng, tb.lat, tb.lng))} mi)`;
    }
    if (k === 'pro' && Math.abs(ta.facilities - tb.facilities) >= 1) label = `player development and facilities (${ta.facilities.toFixed(1)} vs ${tb.facilities.toFixed(1)})`;
    if (k === 'pro' && Math.abs(nbaCount(state, ta.id) - nbaCount(state, tb.id)) >= 2) label = `the NBA pipeline (${nbaCount(state, ta.id)} vs ${nbaCount(state, tb.id)} former players in the league)`;
    if (k === 'prestige') { const ga = r.stars * 18 - ta.prestige, gb = r.stars * 18 - tb.prestige; out.push({ key: k, edge: edge + ((gb > 20 ? (gb - 20) * 0.5 : 0) - (ga > 20 ? (ga - 20) * 0.5 : 0)) * 0.55, label }); continue; }
    out.push({ key: k, edge, label });
  }
  out.push({ key: 'rel', edge: ((sa?.rel ?? 0) - (sb?.rel ?? 0)) * 0.5, label: FACTOR_LABEL.rel });
  return out.filter((f) => f.edge > 0.6).sort((a, b) => b.edge - a.edge);
}

function buildDecision(state: GameState, r: Recruit, teamId: string, odds: RecruitOdds[], week: number): RecruitDecision | undefined {
  const uid = state.user.teamId;
  const mine = odds.find((o) => o.teamId === uid);
  if (!mine) return undefined; // user wasn't in the mix
  const won = teamId === uid;
  const runnerUp = odds.find((o) => o.teamId !== teamId && o.p > 0) ?? odds.find((o) => o.teamId !== teamId);
  const vsId = won ? runnerUp?.teamId ?? null : uid;
  const why = vsId ? decisionFactors(state, r, teamId, vsId).slice(0, 2).map((f) => f.label) : [];
  const winner = odds.find((o) => o.teamId === teamId);
  return {
    week,
    teamId,
    odds: odds.filter((o, i) => o.p > 0 && (i < 5 || o.teamId === uid || o.teamId === teamId)).map((o) => ({ teamId: o.teamId, p: Math.round(o.p * 1000) / 1000 })),
    userP: Math.round(mine.p * 1000) / 1000,
    userStatus: won ? 'won' : !mine.offered ? 'noOffer' : !mine.room ? 'noRoom' : 'lost',
    vsId,
    why,
    userInterest: Math.round(mine.interest),
    winnerInterest: Math.round(winner?.interest ?? 0),
  };
}

/** Plain-English summary of a decision, written to the user */
export function decisionSummary(state: GameState, d: RecruitDecision): string {
  const t = state.teams[d.teamId];
  const vs = d.vsId ? state.teams[d.vsId] : undefined;
  const pct = (p: number) => (p > 0 && p < 0.005 ? 'under 1%' : p < 1 && p > 0.995 ? 'over 99%' : `${Math.round(p * 100)}%`);
  const why = d.why.length ? d.why.join(' and ') : '';
  if (d.userStatus === 'won') {
    const fav = d.odds.find((o) => o.teamId !== d.teamId);
    if (d.userP < 0.35 && fav && fav.p > d.userP) return `Upset on the trail: you were at ${pct(d.userP)} and ${state.teams[fav.teamId]?.school ?? 'a rival'} was the favorite at ${pct(fav.p)}.${why ? ` What won him over: ${why}.` : ''}`;
    return `${why ? `Your edge: ${why}.` : 'He picked you.'} You had a ${pct(d.userP)} chance${vs ? `; ${vs.school} was next` : ''}.`;
  }
  if (d.userStatus === 'noOffer') return `You never offered, so he couldn't pick you${d.userInterest >= d.winnerInterest ? ', even though you had the most interest' : ''}.`;
  if (d.userStatus === 'noRoom') return `You were out of scholarships for next season, so your offer couldn't land.`;
  const lead = d.userInterest - d.winnerInterest;
  const tail = lead > 0 ? ` You led on interest (${d.userInterest} to ${d.winnerInterest}) and had a ${pct(d.userP)} chance; the other ${pct(1 - d.userP)} came in.` : ` You were at ${pct(d.userP)} when he decided.`;
  return `${t?.school ?? 'They'} won on ${why || 'the final lean'}.${tail}`;
}

/** Weekly decisions: who commits this week. Uses exactly the odds the UI shows. */
export function decideRecruits(state: GameState, week: number): Recruit[] {
  buildDepthCache(state);
  buildCommitCache(state);
  spotsCache.clear();
  const committed: Recruit[] = [];
  try {
    for (const r of Object.values(state.recruits)) {
      r.userWeek = { call: false, text: false, asst: false, hc: false, visit: false, scout: r.userWeek.scout };
      if (r.committed) continue;
      const odds = recruitOdds(state, r);
      for (const s of r.schools) s.interest = odds.find((o) => o.teamId === s.teamId)?.interest ?? s.interest;
      const elig = odds.filter((o) => o.p > 0).sort((a, b) => b.interest - a.interest);
      if (!elig.length) continue;
      const top = elig[0].interest;
      const second = elig[1]?.interest ?? 0;
      const ready = (week >= r.decisionWeek && top >= 55) || earlyReady(top, second) || week >= 32;
      if (!ready) continue;
      if (!rng.chance(week >= r.decisionWeek ? 0.55 : 0.25)) continue;
      const choice = rng.weighted(elig, elig.map((o) => o.p));
      r.committed = choice.teamId;
      r.committedWeek = week;
      r.decision = buildDecision(state, r, choice.teamId, odds, week);
      committed.push(r);
      commitCache!.set(choice.teamId, (commitCache!.get(choice.teamId) ?? 0) + 1);
      spotsCache.delete(choice.teamId);
    }
  } finally {
    spotsCache.clear();
    depthCache = null;
    commitCache = null;
  }
  return committed;
}

/** Recompute interest after the week's recruiting so the board shows where things stand */
export function refreshRecruitInterest(state: GameState) {
  buildDepthCache(state);
  const uid = state.user.teamId;
  try {
    for (const r of Object.values(state.recruits)) {
      if (r.committed) continue;
      for (const s of r.schools) s.interest = interestOf(state, r, s);
      r.schools.sort((a, b) => b.interest - a.interest);
      if (r.schools.length > 10) {
        // never drop the user's entry (or the offer that comes with it)
        const mine = r.schools.find((s) => s.teamId === uid);
        r.schools = r.schools.slice(0, 10);
        if (mine && !r.schools.includes(mine)) r.schools.push(mine);
      }
    }
  } finally {
    depthCache = null;
  }
}

/** Weekly update of interests + commitments. Returns newly committed recruits */
export function updateRecruits(state: GameState, week: number): Recruit[] {
  const commits = decideRecruits(state, week);
  refreshRecruitInterest(state);
  return commits;
}

/** Signing Day: recruits still deciding pick among schools with room, using the same odds */
export function signingDayDecisions(state: GameState, roomFor: (teamId: string) => number): Recruit[] {
  const out: Recruit[] = [];
  const pending = new Map<string, number>();
  for (const r of Object.values(state.recruits)) if (r.committed) pending.set(r.committed, (pending.get(r.committed) ?? 0) + 1);
  const room = (id: string) => roomFor(id) - (pending.get(id) ?? 0) > 0;
  const recruits = Object.values(state.recruits).filter((r) => !r.committed).sort((a, b) => a.rank - b.rank);
  buildDepthCache(state);
  try {
    for (const r of recruits) {
      const odds = recruitOdds(state, r, undefined, room);
      const elig = odds.filter((o) => o.p > 0);
      if (!elig.length) continue;
      const choice = rng.weighted(elig, elig.map((o) => o.p));
      r.committed = choice.teamId;
      r.committedWeek = 0;
      r.decision = buildDecision(state, r, choice.teamId, odds, 0);
      pending.set(choice.teamId, (pending.get(choice.teamId) ?? 0) + 1);
      out.push(r);
    }
  } finally {
    depthCache = null;
  }
  return out;
}

/** User performs a recruiting action. Returns message or error */
export function userRecruitAction(state: GameState, recruitId: string, action: RecruitActionKey): { ok: boolean; msg: string } {
  const r = state.recruits[recruitId];
  if (!r) return { ok: false, msg: 'Recruit not found.' };
  if (r.committed && r.committed !== state.user.teamId && action !== 'scout') {
    // can still try to flip
  }
  const def = RECRUIT_ACTIONS[action];
  if (state.user.hours < def.hours) return { ok: false, msg: `Not enough recruiting hours (${def.hours}h needed).` };
  const s = ensureSchool(r, state.user.teamId);
  const coach = state.coaches[state.user.coachId];
  const se = staffEffects(state);
  const skillMul = (1 + (coach?.skills.recruiting ?? 0) * 0.06) * se.relMul * (se.pipeline && r.state === se.pipeline ? se.pipelineBonus : 1);
  const coachPri = 0.7 + r.priorities.coach * 3;
  if (action === 'scout') {
    if (r.scouted >= 100) return { ok: false, msg: 'Already fully scouted.' };
    r.scouted = clamp(r.scouted + 34, 0, 100);
    state.user.hours -= def.hours;
    return { ok: true, msg: `Film study complete — scouting ${r.scouted}%` };
  }
  if (action === 'text' && r.userWeek.text) return { ok: false, msg: 'Already texted this week.' };
  if (action === 'call' && r.userWeek.call) return { ok: false, msg: 'Already called this week.' };
  if (action === 'asst' && r.userWeek.asst) return { ok: false, msg: 'An assistant already visited this week.' };
  if (action === 'hc' && r.userWeek.hc) return { ok: false, msg: 'You already visited this week.' };
  if (action === 'visit' && s.visited) return { ok: false, msg: 'He has already taken an official visit.' };
  let pts: number = def.pts;
  if (action === 'visit') {
    const team = state.teams[state.user.teamId];
    pts += team.hype * 0.12 + team.facilities * 0.8 + Math.max(0, team.record.w - team.record.l) * 0.5;
    s.visited = true;
  }
  addRel(s, pts * skillMul * coachPri);
  r.userWeek[action as 'text' | 'call' | 'asst' | 'hc' | 'visit'] = true;
  state.user.hours -= def.hours;
  s.interest = interestOf(state, r, s);
  r.schools.sort((a, b) => b.interest - a.interest);
  if (r.scouted < 100 && action !== 'text') r.scouted = clamp(r.scouted + (action === 'hc' || action === 'visit' ? 20 : 8), 0, 100);
  return { ok: true, msg: `${def.label} with ${r.first} ${r.last} went well.` };
}

export function userOffer(state: GameState, recruitId: string, nil: number, promise: Recruit['userPromise']): { ok: boolean; msg: string } {
  const r = state.recruits[recruitId];
  if (!r) return { ok: false, msg: 'Recruit not found.' };
  const s = ensureSchool(r, state.user.teamId);
  const firstOffer = !s.offered;
  s.offered = true;
  s.nilOffer = Math.max(0, Math.round(nil));
  r.userPromise = promise;
  if (firstOffer) addRel(s, 6);
  s.interest = interestOf(state, r, s);
  r.schools.sort((a, b) => b.interest - a.interest);
  if (!state.user.board.includes(r.id)) state.user.board.push(r.id);
  return { ok: true, msg: firstOffer ? `Scholarship offered to ${r.first} ${r.last}!` : `Offer updated.` };
}

export function pullOffer(state: GameState, recruitId: string) {
  const r = state.recruits[recruitId];
  const s = r && schoolEntry(r, state.user.teamId);
  if (s) { s.offered = false; s.nilOffer = 0; r.userPromise = null; }
}

/** Visible (scouted) rating — fuzzed by scouting level */
export function scoutedValue(r: Recruit, value: number, salt: number): number {
  const fuzz = (100 - r.scouted) / 100;
  const h = Math.sin((r.id.length * 31 + salt * 17 + r.rank * 13) * 12.9898) * 43758.5453;
  const noise = (h - Math.floor(h) - 0.5) * 2; // -1..1
  return Math.round(clamp(value + noise * 14 * fuzz, 20, 99));
}

/** Composite class score (247-style) */
export function classScore(recruits: Recruit[]): number {
  const vals = recruits.map((r) => 100 - Math.min(99, r.rank / 14) + r.stars * 6).sort((a, b) => b - a);
  let s = 0;
  vals.forEach((v, i) => (s += v * Math.pow(0.85, i)));
  return Math.round(s * 10) / 10;
}

export function classRankings(state: GameState): { teamId: string; score: number; count: number; avgStars: number }[] {
  const by: Record<string, Recruit[]> = {};
  for (const r of Object.values(state.recruits)) if (r.committed) (by[r.committed] ??= []).push(r);
  return Object.entries(by)
    .map(([teamId, rs]) => ({ teamId, score: classScore(rs), count: rs.length, avgStars: rs.reduce((s, r) => s + r.stars, 0) / rs.length }))
    .sort((a, b) => b.score - a.score);
}

/** Pre-fill the user's board with prospects who fit the program (onboarding help) */
export function seedUserBoard(state: GameState, n = 8) {
  const team = state.teams[state.user.teamId];
  const existing = state.user.board.filter((id) => state.recruits[id]);
  const chosen = new Set(existing);
  const all = Object.values(state.recruits).filter((r) => !r.committed);
  const interested = all.filter((r) => schoolEntry(r, team.id)).sort((a, b) => a.rank - b.rank);
  for (const r of interested) { if (chosen.size >= n / 2) break; chosen.add(r.id); }
  const targetStars = team.prestige >= 85 ? 5 : team.prestige >= 68 ? 4 : team.prestige >= 45 ? 3 : 2;
  const fits = all
    .filter((r) => !chosen.has(r.id) && Math.abs(r.stars - targetStars) <= (targetStars === 5 ? 1 : 0))
    .map((r) => ({ r, d: milesBetween(r.lat, r.lng, team.lat, team.lng) + rng.range(0, 400) }))
    .sort((a, b) => a.d - b.d);
  for (const f of fits) { if (chosen.size >= n) break; chosen.add(f.r.id); }
  state.user.board = [...chosen];
}
