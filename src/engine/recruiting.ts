// Recruiting: class generation, interest model, AI recruiting, user actions, commitments.
import { rng, clamp } from './rng';
import type { GameState, Recruit, RecruitPriorities, RecruitSchool, Team, Pos, RecruitType } from './types';
import { ARCHETYPES_BY_POS, buildRatings, calcOvr, genFollowers, genName, genTraits, pickPlace, nilValue, randomPos, roundMoney } from './player';
import { milesBetween } from '../data/places';
import { teamPlayers, ROSTER_MAX, confTierOf } from './team';

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
    coach: clamp((coach?.reputation ?? 50) * 0.8 + (coach ? coach.skills.recruiting * 2 : 10), 0, 100),
    pro: clamp(team.prestige * 0.6 + (coach ? coach.skills.development * 4 : 20) + (team.facilities ?? 5) * 2, 0, 100),
    academics: clamp(team.academics * 10, 0, 100),
    winning: clamp(50 + team.rating * 2.2 + (team.record.w - team.record.l) * 1.5, 0, 100),
  };
  let total = 0;
  for (const k of PRIORITY_KEYS) total += parts[k] * r.priorities[k];
  // Elite recruits discount low-level programs heavily
  const levelGap = r.stars * 18 - team.prestige;
  if (levelGap > 20) total -= (levelGap - 20) * 0.5;
  return { total: clamp(total, 0, 100), parts };
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

export function interestOf(state: GameState, r: Recruit, s: RecruitSchool): number {
  const team = state.teams[s.teamId];
  if (!team) return 0;
  const isUser = s.teamId === state.user.teamId;
  const appeal = teamAppeal(state, r, team, s.nilOffer, isUser ? r.userPromise : null).total;
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

/** Weekly update of interests + commitments. Returns newly committed recruit ids */
export function updateRecruits(state: GameState, week: number): Recruit[] {
  buildDepthCache(state);
  buildCommitCache(state);
  const committed: Recruit[] = [];
  for (const r of Object.values(state.recruits)) {
    r.userWeek = { call: false, text: false, asst: false, hc: false, visit: false, scout: r.userWeek.scout };
    if (r.committed) continue;
    for (const s of r.schools) s.interest = interestOf(state, r, s);
    r.schools.sort((a, b) => b.interest - a.interest);
    if (r.schools.length > 10) r.schools = r.schools.slice(0, 10);
    const offered = r.schools.filter((s) => s.offered && openSpotsCached(state, s.teamId) > 0);
    if (!offered.length) continue;
    const top = offered[0];
    const second = offered[1]?.interest ?? 0;
    const ready = (week >= r.decisionWeek && top.interest >= 55) || (top.interest >= 82 && top.interest - second >= 12) || week >= 32;
    if (!ready) continue;
    if (!rng.chance(week >= r.decisionWeek ? 0.55 : 0.25)) continue;
    // weighted choice among top offers
    const choice = rng.weighted(offered.slice(0, 4), offered.slice(0, 4).map((s) => Math.pow(s.interest, 5)));
    r.committed = choice.teamId;
    r.committedWeek = week;
    committed.push(r);
    commitCache!.set(choice.teamId, (commitCache!.get(choice.teamId) ?? 0) + 1);
    spotsCache.delete(choice.teamId);
  }
  spotsCache.clear();
  depthCache = null;
  commitCache = null;
  return committed;
}

const spotsCache = new Map<string, number>();
function openSpotsCached(state: GameState, teamId: string) {
  if (!spotsCache.has(teamId)) spotsCache.set(teamId, openSpots(state, teamId));
  return spotsCache.get(teamId)!;
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
  const skillMul = 1 + (coach?.skills.recruiting ?? 0) * 0.06;
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
