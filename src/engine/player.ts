import { rng, clamp } from './rng';
import type { Archetype, ClassYear, Player, Pos, Ratings, RatingKey, StatLine, Trait, Recruit } from './types';
import { RATING_KEYS } from './types';
import { FIRST_NAMES, LAST_NAMES, INTL_POOLS } from '../data/names';
import { PLACES, type Place } from '../data/places';

// ---------- Overall formula ----------
const W: Record<Pos, Partial<Record<RatingKey, number>>> = {
  PG: { hdl: 14, pas: 14, tp: 12, mid: 7, ins: 7, ft: 3, perD: 10, stl: 5, iq: 12, spd: 8, ath: 4, reb: 2, str: 1, intD: 1 },
  SG: { tp: 16, mid: 10, ins: 9, ft: 4, hdl: 9, pas: 6, perD: 11, stl: 5, iq: 9, spd: 7, ath: 7, reb: 3, str: 2, intD: 2 },
  SF: { tp: 11, mid: 9, ins: 11, ft: 3, hdl: 6, pas: 6, perD: 11, stl: 4, iq: 9, ath: 9, spd: 5, reb: 7, str: 5, intD: 4 },
  PF: { ins: 14, mid: 7, tp: 6, ft: 2, pas: 4, hdl: 3, intD: 12, perD: 6, blk: 6, reb: 13, str: 10, ath: 8, iq: 7, spd: 2 },
  C: { ins: 15, mid: 3, tp: 3, ft: 2, pas: 4, hdl: 2, intD: 15, perD: 3, blk: 10, reb: 16, str: 12, ath: 7, iq: 6, spd: 2 },
};
const WN: Record<Pos, [RatingKey, number][]> = {} as never;
for (const pos of Object.keys(W) as Pos[]) {
  const entries = Object.entries(W[pos]) as [RatingKey, number][];
  const sum = entries.reduce((s, [, v]) => s + v, 0);
  WN[pos] = entries.map(([k, v]) => [k, v / sum]);
}

/** How much a rating counts toward a position's overall (normalized weight) */
export function ratingWeight(pos: Pos, k: RatingKey): number {
  return WN[pos].find((x) => x[0] === k)?.[1] ?? 0.02;
}
/** The ratings that matter most at a position */
export function topRatings(pos: Pos, n = 3): RatingKey[] {
  return [...WN[pos]].sort((a, b) => b[1] - a[1]).slice(0, n).map((x) => x[0]);
}

export function calcOvr(r: Ratings, pos: Pos): number {
  let wavg = 0;
  const vals: number[] = [];
  for (const [k, w] of WN[pos]) {
    wavg += r[k] * w;
    if (w >= 0.09) vals.push(r[k]);
  }
  vals.sort((a, b) => b - a);
  const top = (vals[0] + vals[1] + (vals[2] ?? vals[1])) / 3;
  return Math.round(clamp(wavg * 0.78 + top * 0.22, 25, 99));
}

// ---------- Archetypes ----------
const POS_OFFSETS: Record<Pos, Partial<Record<RatingKey, number>>> = {
  PG: { hdl: 12, pas: 12, tp: 3, spd: 9, iq: 4, reb: -14, blk: -16, intD: -14, str: -10, ins: -2, stl: 3 },
  SG: { hdl: 6, pas: 2, tp: 6, mid: 3, spd: 6, reb: -10, blk: -13, intD: -10, str: -7, stl: 2 },
  SF: { reb: -2, blk: -5, intD: -3, ath: 3 },
  PF: { reb: 9, intD: 8, blk: 7, str: 8, ins: 4, tp: -8, hdl: -10, pas: -6, spd: -5, perD: -4 },
  C: { reb: 13, intD: 12, blk: 12, str: 11, ins: 6, tp: -14, hdl: -16, pas: -8, spd: -9, perD: -8, mid: -6 },
};
const ARCH_OFFSETS: Record<Archetype, Partial<Record<RatingKey, number>>> = {
  'Floor General': { pas: 10, iq: 9, hdl: 6, ins: -4, ath: -3 },
  'Scoring Guard': { tp: 6, mid: 7, ins: 4, pas: -5, perD: -2 },
  'Combo Guard': { tp: 3, hdl: 3, pas: 2, mid: 3 },
  Slasher: { ins: 9, ath: 7, spd: 6, tp: -7, mid: -2 },
  Sharpshooter: { tp: 13, ft: 9, mid: 5, ath: -4, ins: -6, perD: -3 },
  '3&D Wing': { perD: 9, tp: 7, stl: 5, hdl: -5, ins: -3, mid: -2 },
  'Two-Way Wing': { perD: 6, ins: 3, tp: 3, ath: 4, mid: 2 },
  'Point Forward': { pas: 11, hdl: 7, iq: 5, tp: -2, intD: -2 },
  'Stretch Big': { tp: 14, mid: 7, ft: 6, intD: -5, reb: -4, str: -3, blk: -3 },
  'Post Scorer': { ins: 10, str: 5, mid: 3, ath: -3, spd: -3, perD: -2 },
  'Rim Runner': { ath: 11, ins: 7, spd: 5, tp: -12, mid: -8, ft: -8 },
  'Rim Protector': { blk: 13, intD: 11, ins: -3, tp: -10, mid: -4, pas: -3 },
  'Glass Cleaner': { reb: 13, str: 7, intD: 4, tp: -9, ins: -1, mid: -3 },
};
export const ARCHETYPES_BY_POS: Record<Pos, Archetype[]> = {
  PG: ['Floor General', 'Scoring Guard', 'Combo Guard', 'Slasher'],
  SG: ['Sharpshooter', 'Scoring Guard', '3&D Wing', 'Slasher', 'Combo Guard'],
  SF: ['Two-Way Wing', '3&D Wing', 'Slasher', 'Point Forward', 'Sharpshooter'],
  PF: ['Stretch Big', 'Post Scorer', 'Rim Runner', 'Glass Cleaner', 'Two-Way Wing'],
  C: ['Rim Protector', 'Post Scorer', 'Glass Cleaner', 'Rim Runner', 'Stretch Big'],
};

const HEIGHT: Record<Pos, [number, number]> = { PG: [74, 1.7], SG: [76.5, 1.4], SF: [78.5, 1.3], PF: [80.5, 1.3], C: [83, 1.6] };

export function emptyStats(): StatLine {
  return { gp: 0, gs: 0, min: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0 };
}

export function buildRatings(pos: Pos, arch: Archetype, target: number, height: number): Ratings {
  const r = {} as Ratings;
  const hDelta = height - HEIGHT[pos][0];
  for (const k of RATING_KEYS) {
    let v = target + (POS_OFFSETS[pos][k] ?? 0) + (ARCH_OFFSETS[arch][k] ?? 0) + rng.normal(0, 5.5);
    if (k === 'reb' || k === 'blk' || k === 'intD') v += hDelta * 1.6;
    if (k === 'spd' || k === 'hdl') v -= hDelta * 1.2;
    if (k === 'sta') v = target + rng.normal(4, 7);
    if (k === 'ft') v = v * 0.6 + (r.tp ?? target) * 0.0 + target * 0.4 + 4;
    r[k] = v;
  }
  // FT correlates with shooting
  r.ft = (r.ft + r.tp * 0.5 + r.mid * 0.3) / 1.8 + 6;
  // Normalize to hit target overall
  for (let i = 0; i < 4; i++) {
    for (const k of RATING_KEYS) r[k] = clamp(r[k], 20, 99);
    const o = calcOvr(r, pos);
    const diff = target - o;
    if (Math.abs(diff) < 0.5) break;
    for (const k of RATING_KEYS) r[k] += diff;
  }
  for (const k of RATING_KEYS) r[k] = Math.round(clamp(r[k], 20, 99));
  return r;
}

const TRAITS: [Trait, number][] = [
  ['leader', 6], ['gymRat', 8], ['loyal', 8], ['mercenary', 7], ['diva', 4], ['clutch', 6], ['hometown', 4],
  ['raw', 6], ['coachable', 8], ['hothead', 4], ['influencer', 5], ['glue', 6], ['scholar', 5], ['injuryProne', 3],
];
export const TRAIT_INFO: Record<Trait, { label: string; desc: string; icon: string; good: boolean | null }> = {
  leader: { label: 'Leader', desc: 'Boosts team chemistry and teammate morale.', icon: '👑', good: true },
  gymRat: { label: 'Gym Rat', desc: 'Develops faster in the offseason.', icon: '🏋️', good: true },
  loyal: { label: 'Loyal', desc: 'Rarely enters the transfer portal.', icon: '🤝', good: true },
  mercenary: { label: 'Mercenary', desc: 'Follows the money — NIL drives decisions.', icon: '💰', good: null },
  diva: { label: 'Diva', desc: 'Needs touches and the spotlight or morale tanks.', icon: '💅', good: false },
  clutch: { label: 'Clutch', desc: 'Elevates late in close games.', icon: '🧊', good: true },
  hometown: { label: 'Hometown Kid', desc: 'Strongly prefers schools close to home.', icon: '🏠', good: null },
  raw: { label: 'Raw', desc: 'High variance development — boom or bust.', icon: '🎲', good: null },
  coachable: { label: 'Coachable', desc: 'Responds well to coaching; steadier morale.', icon: '📋', good: true },
  hothead: { label: 'Hothead', desc: 'Prone to technicals and foul trouble.', icon: '🔥', good: false },
  influencer: { label: 'Influencer', desc: 'Huge social following — NIL magnet.', icon: '📱', good: true },
  glue: { label: 'Glue Guy', desc: 'Makes lineups better than the sum of their parts.', icon: '🧩', good: true },
  scholar: { label: 'Scholar', desc: 'Academics matter; never an eligibility risk.', icon: '🎓', good: true },
  injuryProne: { label: 'Injury Prone', desc: 'Gets hurt more often.', icon: '🩹', good: false },
};

export function genTraits(): Trait[] {
  const n = rng.weighted([0, 1, 2], [35, 45, 20]);
  const out: Trait[] = [];
  for (let i = 0; i < n; i++) {
    const t = rng.weighted(TRAITS.map((x) => x[0]), TRAITS.map((x) => x[1]));
    if (!out.includes(t) && !(t === 'loyal' && out.includes('mercenary')) && !(t === 'mercenary' && out.includes('loyal'))) out.push(t);
  }
  return out;
}

export function pickPlace(): Place {
  return rng.weighted(PLACES, PLACES.map((p) => p.w));
}

export function genName(intl = false): { first: string; last: string; country: string } {
  if (intl) {
    const pool = rng.weighted(INTL_POOLS, INTL_POOLS.map((p) => p.weight));
    return { first: rng.pick(pool.first), last: rng.pick(pool.last), country: pool.country };
  }
  return { first: rng.pick(FIRST_NAMES), last: rng.pick(LAST_NAMES), country: 'USA' };
}

export const CLASS_ORDER: ClassYear[] = ['FR', 'SO', 'JR', 'SR', 'GR'];
const CLASS_AGE: Record<ClassYear, number> = { FR: 18, SO: 19, JR: 20, SR: 21, GR: 22 };

export function randomPos(): Pos {
  return rng.weighted<Pos>(['PG', 'SG', 'SF', 'PF', 'C'], [20, 22, 21, 20, 17]);
}

export interface GenPlayerOpts {
  pos?: Pos;
  ovr: number;
  pot?: number;
  cls: ClassYear;
  teamId: string | null;
  stars?: number;
  intl?: boolean;
  place?: Place;
}

export function genPlayer(o: GenPlayerOpts): Player {
  const pos = o.pos ?? randomPos();
  const arch = rng.pick(ARCHETYPES_BY_POS[pos]);
  const [hm, hsd] = HEIGHT[pos];
  const height = Math.round(clamp(rng.normal(hm, hsd), hm - 4, hm + 4));
  const weight = Math.round(185 + (height - 74) * 7.5 + rng.normal(0, 11) + (pos === 'C' ? 12 : 0));
  const ratings = buildRatings(pos, arch, o.ovr, height);
  const ovr = calcOvr(ratings, pos);
  const intl = o.intl ?? rng.chance(0.07);
  const nm = genName(intl);
  const place = o.place ?? pickPlace();
  const clsIdx = CLASS_ORDER.indexOf(o.cls);
  const growth = o.cls === 'FR' ? rng.range(6, 20) : o.cls === 'SO' ? rng.range(4, 14) : o.cls === 'JR' ? rng.range(2, 9) : rng.range(0, 4);
  const pot = Math.round(clamp(o.pot ?? ovr + growth, ovr, 99));
  const stars = o.stars ?? starsFromOvr(ovr - clsIdx * 3.5, pot);
  const traits = genTraits();
  const followers = genFollowers(stars, ovr, traits);
  const redshirted = clsIdx >= 1 && rng.chance(0.18);
  return {
    id: rng.id('p'),
    first: nm.first,
    last: nm.last,
    pos,
    archetype: arch,
    height,
    weight,
    hometown: intl ? nm.country : place.city,
    state: intl ? nm.country : place.state,
    country: nm.country,
    age: CLASS_AGE[o.cls] + (redshirted ? 1 : 0) + (rng.chance(0.25) ? 1 : 0),
    cls: o.cls,
    elig: 4 - Math.min(3, clsIdx) - (o.cls === 'GR' ? 0 : 0),
    redshirted,
    redshirting: false,
    ratings,
    ovr,
    pot,
    stars,
    traits,
    teamId: o.teamId,
    num: 0,
    morale: Math.round(rng.range(60, 85)),
    nil: null,
    followers,
    injury: null,
    stats: emptyStats(),
    career: [],
    history: [],
    promise: null,
    starts: 0,
    inPortal: false,
    transfers: 0,
    awards: [],
  };
}

export function starsFromOvr(freshOvr: number, pot: number): number {
  const s = freshOvr * 0.55 + pot * 0.45;
  if (s >= 80) return 5;
  if (s >= 72) return 4;
  if (s >= 63) return 3;
  if (s >= 54) return 2;
  return 1;
}

export function genFollowers(stars: number, ovr: number, traits: Trait[]): number {
  let base = [800, 1500, 4000, 12000, 45000, 180000][stars] ?? 1000;
  base *= Math.exp((ovr - 65) * 0.045);
  base *= Math.exp(rng.normal(0, 0.7));
  if (traits.includes('influencer')) base *= rng.range(4, 10);
  return Math.round(clamp(base, 150, 6_000_000));
}

/** Annual NIL market value in dollars */
export function nilValue(p: Pick<Player, 'ovr' | 'pot' | 'followers' | 'traits' | 'stars'>, market = 5): number {
  let v = 2500 * Math.exp((p.ovr - 40) * 0.15);
  v *= 1 + Math.max(0, p.pot - p.ovr) * 0.025;
  v *= 1 + Math.min(3, p.followers / 400_000);
  v *= 0.75 + market * 0.05;
  if (p.traits.includes('mercenary')) v *= 1.2;
  if (p.traits.includes('loyal')) v *= 0.9;
  return roundMoney(clamp(v, 0, 4_000_000));
}

export function roundMoney(v: number): number {
  if (v >= 1_000_000) return Math.round(v / 25_000) * 25_000;
  if (v >= 100_000) return Math.round(v / 5_000) * 5_000;
  if (v >= 10_000) return Math.round(v / 1_000) * 1_000;
  return Math.round(v / 250) * 250;
}

export function fmtMoney(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1_000_000) return `${s}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, '')}M`;
  if (a >= 1_000) return `${s}$${Math.round(a / 1_000)}K`;
  return `${s}$${Math.round(a)}`;
}

export function fmtHeight(inches: number): string {
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

export function fullName(p: { first: string; last: string }): string {
  return `${p.first} ${p.last}`;
}

/** Draft value score (higher = better prospect) */
export function draftScore(p: Pick<Player, 'ovr' | 'pot' | 'age' | 'height' | 'pos'>): number {
  const youth = clamp(22 - p.age, -2, 4) * 1.6;
  const size = clamp(p.height - 77, -4, 6) * 0.35;
  return p.ovr * 0.55 + p.pot * 0.45 + youth + size;
}

/** Offseason development; returns ovr delta */
export function developPlayer(p: Player, devSkill: number, minutesShare: number): number {
  const before = p.ovr;
  const room = Math.max(0, p.pot - p.ovr);
  const ageFactor = p.age <= 19 ? 1.15 : p.age <= 20 ? 1.0 : p.age <= 21 ? 0.8 : p.age <= 22 ? 0.6 : 0.4;
  let base = room * 0.32 * ageFactor + 0.8;
  base *= 1 + devSkill * 0.035;
  base *= 0.85 + Math.min(1, minutesShare) * 0.3;
  if (p.traits.includes('gymRat')) base *= 1.25;
  if (p.traits.includes('coachable')) base *= 1.1;
  const sd = p.traits.includes('raw') ? 2.6 : 1.4;
  let delta = base + rng.normal(0, sd);
  delta = clamp(delta, -3, 14);
  // Distribute over attributes, weighting those relevant to the position
  const keys = WN[p.pos];
  const points = delta * 1.25;
  for (const k of RATING_KEYS) {
    const w = keys.find((x) => x[0] === k)?.[1] ?? 0.02;
    const jitter = rng.range(0.4, 1.6);
    p.ratings[k] = Math.round(clamp(p.ratings[k] + points * (0.55 + w * 6) * jitter * 0.75, 20, 99));
  }
  p.ovr = calcOvr(p.ratings, p.pos);
  // Pot drifts
  p.pot = Math.round(clamp(p.pot + rng.normal(0, 2) - (p.age >= 22 ? 1 : 0), p.ovr, 99));
  return p.ovr - before;
}

export function advanceClass(p: Player): void {
  if (p.redshirting) {
    p.redshirting = false;
    p.redshirted = true;
  } else {
    p.elig -= 1;
    const idx = CLASS_ORDER.indexOf(p.cls);
    p.cls = CLASS_ORDER[Math.min(4, idx + 1)];
  }
  if (p.elig <= 1 && p.cls !== 'SR' && p.cls !== 'GR') p.cls = 'SR';
  if (p.cls === 'SR' && p.elig < 1) p.cls = 'GR';
  p.age += 1;
}

/** Convert a signed recruit into a rostered player */
export function recruitToPlayer(r: Recruit, teamId: string): Player {
  return {
    id: r.id,
    first: r.first,
    last: r.last,
    pos: r.pos,
    archetype: r.archetype,
    height: r.height,
    weight: r.weight,
    hometown: r.hometown,
    state: r.state,
    country: r.country,
    age: r.age,
    cls: r.type === 'JUCO' ? 'JR' : 'FR',
    elig: r.type === 'JUCO' ? 2 : 4,
    redshirted: false,
    redshirting: false,
    ratings: { ...r.ratings },
    ovr: r.ovr,
    pot: r.pot,
    stars: r.stars,
    traits: [...r.traits],
    teamId,
    num: 0,
    morale: 80,
    nil: null,
    followers: r.followers,
    injury: null,
    stats: emptyStats(),
    career: [],
    history: [],
    promise: r.userPromise,
    starts: 0,
    inPortal: false,
    transfers: 0,
    awards: [],
  };
}

export const INJURY_TYPES: [string, number, number][] = [
  ['Ankle sprain', 1, 4], ['Knee soreness', 1, 3], ['Hamstring strain', 2, 5], ['Concussion protocol', 1, 3],
  ['Broken finger', 3, 6], ['Back spasms', 1, 3], ['Foot fracture', 6, 14], ['Torn ACL', 30, 40], ['High ankle sprain', 3, 7],
  ['Wrist sprain', 1, 4], ['Illness', 1, 2], ['Groin strain', 2, 4], ['Shoulder sprain', 2, 6], ['Torn meniscus', 6, 12],
];
export function randomInjury(): { type: string; games: number } {
  const w = INJURY_TYPES.map(([, a]) => (a >= 30 ? 0.4 : a >= 6 ? 1.2 : 4));
  const [type, a, b] = rng.weighted(INJURY_TYPES, w);
  return { type, games: rng.int(a, b) };
}

export function teamOvr(players: Player[]): number {
  const sorted = players.filter((p) => !p.injury && !p.redshirting).map((p) => p.ovr).sort((a, b) => b - a);
  const w = [1.25, 1.2, 1.15, 1.1, 1.05, 0.8, 0.65, 0.5, 0.3, 0.15];
  let s = 0, ws = 0;
  for (let i = 0; i < w.length; i++) {
    const v = sorted[i] ?? 35;
    s += v * w[i];
    ws += w[i];
  }
  return s / ws;
}
