// Rivalries 2.0. Every rivalry has heat (0-100) that rises with close games, upsets, ranked
// showdowns and postseason meetings, and cools when one side dominates or the teams stop playing.
// Historic rivalries (data/rivalries.ts) never die, they cool toward a floor. New rivalries are
// born from NCAA tournament meetings, coaches jumping between schools, star transfers, recruiting
// battles and close games with you, and they fade if they go cold. Each rivalry keeps its series,
// streak, meetings, and (once it matters enough) a trophy that goes to the winner of each meeting.
import { clamp, rng } from './rng';
import type { GameState, Rivalry, RivalryBook, ScheduledGame, Team } from './types';
import { RIVALRIES } from '../data/rivalries';
import { addNews } from './media';

export const BORN_AT = 40;
export const FADE_AT = 20;
const TROPHY_AT = 72;
const IN_SEASON = ['preseason', 'regular', 'confTourney', 'selection', 'ncaa'];

export const HEAT: { min: number; label: string; flames: number; cls: string }[] = [
  { min: 80, label: 'Blood Feud', flames: 4, cls: 'bad' },
  { min: 60, label: 'Bitter', flames: 3, cls: 'accent' },
  { min: 40, label: 'Heated', flames: 2, cls: 'gold' },
  { min: -Infinity, label: 'Lukewarm', flames: 1, cls: '' },
];
export const heatInfo = (h: number) => HEAT.find((x) => h >= x.min)!;

const TROPHIES = [
  'The Crosstown Cowbell', 'The Old Bleacher', 'The Brass Buzzer', 'The Granite Ball', 'The Hometown Hoop', 'The Chipped Mug',
  'The Silver Spike', 'The Mascot Head', 'The Ref’s Whistle', 'The Bronze Sneaker', 'The Oak Plank', 'The Golden Gavel',
  'The Iron Hoop', 'The Brass Whistle', 'The Golden Net', 'The Old Leather Ball', 'The Copper Kettle', 'The Hardwood Bell',
  'The Bronze Backboard', 'The Silver Sneaker', 'The Painted Rim', 'The Bragging Rights Belt', 'The Old Scoreboard', 'The Lucky Penny',
  'The Rusty Whistle', 'The Shot Clock', 'The Golden Ladder', 'The Heritage Cup', 'The Border Lantern', 'The Pewter Pitcher',
  'The Hall Pass', 'The Silver Clipboard', 'The Iron Kettle', 'The Old Floorboard', 'The Twine Trophy', 'The Courtside Crown',
];
const STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'the District',
};

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const other = (r: Rivalry, id: string) => (r.a === id ? r.b : r.a);

// ---------------- book ----------------
export function rivalryBook(state: GameState): RivalryBook {
  if (state.rivals) return state.rivals;
  const book: RivalryBook = { pairs: {}, since: state.season };
  state.rivals = book;
  for (const rv of RIVALRIES) {
    const a = state.teams[rv.a], b = state.teams[rv.b];
    if (!a || !b) continue;
    const key = pairKey(a.id, b.id);
    if (book.pairs[key]) continue;
    const base = rv.heat ?? 1;
    const floor = 30 + base * 15;
    book.pairs[key] = {
      key, a: a.id, b: b.id, name: rv.name ?? `${a.school}–${b.school}`, origin: 'historic', since: state.season,
      heat: floor + 5, floor, active: true, series: {}, meetings: [], total: 0, heatLog: [],
    };
    if (base >= 3 || a.id === state.user.teamId || b.id === state.user.teamId) giveTrophy(book, book.pairs[key]);
  }
  // a save from before Rivalries 2.0: count this season's meetings so far
  if (IN_SEASON.includes(state.phase)) {
    for (const g of state.schedule.filter((x) => x.played && x.hs != null).sort((x, y) => x.day - y.day)) {
      const r = book.pairs[pairKey(g.home, g.away)];
      if (r) record(state, r, g);
    }
  }
  return book;
}
export const ensureRivalries = (state: GameState) => { rivalryBook(state); };

function giveTrophy(book: RivalryBook, r: Rivalry) {
  if (r.trophy) return;
  const used = new Set(Object.values(book.pairs).map((x) => x.trophy).filter(Boolean));
  const start = hash(r.key) % TROPHIES.length;
  for (let i = 0; i < TROPHIES.length; i++) {
    const t = TROPHIES[(start + i) % TROPHIES.length];
    if (!used.has(t)) { r.trophy = t; return; }
  }
  // the named pool is spoken for: make one up
  const ADJ = ['Old', 'Golden', 'Iron', 'Silver', 'Bronze', 'Painted', 'Rusty', 'Copper', 'Brass', 'Pewter', 'Oak', 'Granite'];
  const OBJ = ['Bucket', 'Bell', 'Whistle', 'Net', 'Ladder', 'Lantern', 'Clipboard', 'Sneaker', 'Ball', 'Rim', 'Kettle', 'Scoreboard', 'Horn', 'Stool'];
  for (let i = 0; i < ADJ.length * OBJ.length; i++) {
    const k = (start + i * 7) % (ADJ.length * OBJ.length);
    const t = `The ${ADJ[k % ADJ.length]} ${OBJ[Math.floor(k / ADJ.length)]}`;
    if (!used.has(t)) { r.trophy = t; return; }
  }
  r.trophy = `The ${r.name.replace(/^The /, '')} Cup`;
}

/** an active rivalry between two schools */
export function rivalryOf(state: GameState, a: string, b: string): Rivalry | undefined {
  const r = state.rivals?.pairs[pairKey(a, b)];
  if (r?.active) return r;
  if (!state.rivals) {
    const rv = RIVALRIES.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    if (rv) return { key: pairKey(a, b), a, b, name: rv.name ?? 'Rivalry', origin: 'historic', since: state.season, heat: 30 + (rv.heat ?? 1) * 15, floor: 0, active: true, series: {}, meetings: [], total: 0, heatLog: [] };
  }
  return undefined;
}
export function rivalriesOf(state: GameState, teamId: string, includeSimmering = false): Rivalry[] {
  return Object.values(rivalryBook(state).pairs).filter((r) => (r.a === teamId || r.b === teamId) && (r.active || (includeSimmering && !r.faded && r.heat >= 12))).sort((x, y) => y.heat - x.heat);
}
/** extra home-crowd energy for a rivalry game (0..0.35) */
export function rivalCrowd(state: GameState, a: string, b: string): number {
  const r = rivalryOf(state, a, b);
  return r ? 0.1 + (r.heat / 100) * 0.25 : 0;
}
export function nextMeeting(state: GameState, r: Rivalry): ScheduledGame | undefined {
  return state.schedule.filter((g) => !g.played && pairKey(g.home, g.away) === r.key).sort((x, y) => x.day - y.day)[0];
}
export function seriesFor(r: Rivalry, teamId: string): [number, number] {
  return [r.series[teamId] ?? 0, r.series[other(r, teamId)] ?? 0];
}

// ---------------- heat ----------------
function makePair(state: GameState, a: string, b: string): Rivalry {
  const book = rivalryBook(state);
  const key = pairKey(a, b);
  return (book.pairs[key] ??= { key, a: key.split('|')[0], b: key.split('|')[1], name: '', origin: 'born', since: state.season, heat: 0, floor: 0, active: false, series: {}, meetings: [], total: 0, heatLog: [] });
}

function bornName(state: GameState, r: Rivalry, kind: string, detail?: string): string {
  const A = state.teams[r.a], B = state.teams[r.b];
  const taken = new Set(Object.values(state.rivals?.pairs ?? {}).filter((x) => x.active).map((x) => x.name));
  const h = hash(r.key);
  const opts: string[] = [];
  if (kind === 'coach' && detail) opts.push(`The ${detail} Bowl`, `The ${detail} Grudge Match`);
  if (A.state === B.state && STATES[A.state]) opts.push(`The Battle for ${STATES[A.state]}`, `The ${STATES[A.state]} Showdown`);
  if (kind === 'ncaa') opts.push(`The March Grudge`, `The Bracket Feud`);
  opts.push(`The ${A.mascot}–${B.mascot} Feud`, `The ${A.city}–${B.city} Series`);
  const free = opts.filter((o) => !taken.has(o));
  return free.length ? free[h % Math.min(free.length, 2)] : `${A.school}–${B.school}`;
}

/** Add heat to a pair (creating it if needed); a simmering pair that gets hot enough is born */
export function addHeat(state: GameState, a: string, b: string, amount: number, why: { kind: string; text: string; detail?: string }) {
  if (!state.teams[a] || !state.teams[b] || a === b || amount <= 0) return;
  const r = makePair(state, a, b);
  r.heat = clamp(r.heat + amount, 0, 100);
  if (!r.active && r.heat >= BORN_AT) {
    r.active = true;
    r.faded = false;
    r.since = state.season;
    r.reason = why.text;
    r.name = r.name && r.origin === 'historic' ? r.name : bornName(state, r, why.kind, why.detail);
    const A = state.teams[r.a], B = state.teams[r.b];
    const user = r.a === state.user.teamId || r.b === state.user.teamId;
    addNews(state, {
      kind: 'feature',
      headline: `A rivalry is born: ${r.name}`,
      body: `${A.school} and ${B.school} have a new rivalry on their hands. ${why.text} Fans on both sides have noticed.`,
      teams: [r.a, r.b], important: user,
    });
  }
  if (r.active && r.heat >= TROPHY_AT && !r.trophy) {
    giveTrophy(rivalryBook(state), r);
    if (r.a === state.user.teamId || r.b === state.user.teamId) addNews(state, { kind: 'feature', headline: `${r.name} gets a trophy: ${r.trophy}`, body: `Student governments at ${state.teams[r.a].school} and ${state.teams[r.b].school} commissioned ${r.trophy}. It goes to the winner of every meeting.`, teams: [r.a, r.b], important: true });
  }
}

function record(state: GameState, r: Rivalry, g: ScheduledGame) {
  const homeWon = (g.hs ?? 0) > (g.as ?? 0);
  const w = homeWon ? g.home : g.away;
  const ws = Math.max(g.hs ?? 0, g.as ?? 0), ls = Math.min(g.hs ?? 0, g.as ?? 0);
  if (r.meetings.some((m) => m.s === state.season && m.d === g.day)) return null;
  const prevStreak = r.streak ? { ...r.streak } : undefined;
  r.series[w] = (r.series[w] ?? 0) + 1;
  r.total++;
  r.streak = r.streak?.t === w ? { t: w, n: r.streak.n + 1 } : { t: w, n: 1 };
  r.meetings.push({ s: state.season, d: g.day, w, ws, ls, t: g.type, ...(g.ot ? { ot: true } : {}), ...(g.event ? { ev: g.event } : {}) });
  const keep = r.active || r.faded ? 14 : 4;
  if (r.meetings.length > keep) r.meetings.splice(0, r.meetings.length - keep);
  if (!r.big || ws - ls > r.big.m) r.big = { m: ws - ls, w, s: state.season };
  return { w, ws, ls, prevStreak };
}

/**
 * Called for every finished game. Updates the rivalry if there is one, and lets big games
 * (tournament meetings, ranked showdowns, close games with you) start new ones.
 */
export function rivalryResult(state: GameState, g: ScheduledGame, preRankHome: number | null, preRankAway: number | null) {
  if (g.type === 'exh' || g.hs == null || g.as == null) return;
  const book = rivalryBook(state);
  const key = pairKey(g.home, g.away);
  const uid = state.user.teamId;
  const userGame = g.home === uid || g.away === uid;
  const homeWon = g.hs > g.as;
  const margin = Math.abs(g.hs - g.as);
  const close = margin <= 3 || !!g.ot;
  const wRank = homeWon ? preRankHome : preRankAway, lRank = homeWon ? preRankAway : preRankHome;
  const bothRanked = !!preRankHome && !!preRankAway;
  const upset = !!lRank && (!wRank || wRank - lRank >= 10);
  const seeds = state.ncaa?.seeds;
  const wId = homeWon ? g.home : g.away, lId = homeWon ? g.away : g.home;
  const seedUpset = g.type === 'ncaa' && seeds && seeds[wId] != null && seeds[lId] != null && seeds[wId] - seeds[lId] >= 4;
  const late = g.type === 'ncaa' && /Final Four|Championship/i.test(g.event ?? '');
  let r = book.pairs[key];

  if (r?.active) {
    const res = record(state, r, g);
    if (!res) return;
    let d = 1;
    if (close) d += 3;
    if (bothRanked) d += 4; else if (upset) d += 5;
    if (g.type === 'ncaa') d += 12 + (late ? 6 : 0); else if (g.type === 'ctourn') d += 5;
    if (res.prevStreak && res.prevStreak.n >= 3 && res.prevStreak.t !== res.w) d += 5;
    if (r.streak && r.streak.n >= 5) d -= 4;
    if (margin >= 25) d -= 3;
    r.heat = clamp(r.heat + d, 0, 100);
    if ((r.heat >= TROPHY_AT || userGame) && !r.trophy) giveTrophy(book, r);
    // the trophy goes to the winner
    const prevHolder = r.holder;
    if (r.trophy) r.holder = res.w;
    if (userGame) userRivalryEffects(state, r, res.w === uid, prevHolder, res.prevStreak);
    else if (r.trophy && prevHolder && prevHolder !== res.w && r.heat >= 70) {
      addNews(state, { kind: 'feature', headline: `${state.teams[res.w].school} takes back ${r.trophy}`, body: `${state.teams[res.w].school} beat ${state.teams[other(r, res.w)].school} ${res.ws}-${res.ls}${r.name ? ` in ${r.name}` : ''} to reclaim ${r.trophy}.`, teams: [r.a, r.b] });
    }
    return;
  }

  // not a rivalry (yet): only meaningful games build heat
  let inc = 0;
  let kind = 'game';
  let text = '';
  const A = state.teams[g.home], B = state.teams[g.away];
  if (g.type === 'ncaa') {
    inc += 16 + (seedUpset ? 10 : 0) + (close ? 6 : 0) + (late ? 8 : 0);
    kind = 'ncaa';
    text = `It started in March: ${state.teams[wId].school} beat ${state.teams[lId].school} ${Math.max(g.hs, g.as)}-${Math.min(g.hs, g.as)} in the NCAA Tournament${seedUpset ? ', a stunning upset' : ''}.`;
  } else if (g.type === 'ctourn') {
    inc += 6 + (close ? 4 : 0) + (bothRanked ? 4 : 0) + (/Championship|Final/i.test(g.event ?? '') ? 4 : 0);
    text = `Their conference tournament meetings have gotten nasty.`;
  } else if (g.type === 'conf') {
    if (bothRanked) inc += 7;
    if (close && (preRankHome || preRankAway)) inc += 4;
    text = `Year after year, their conference games have decided the league.`;
  }
  if (userGame) {
    // familiarity breeds contempt: your conference foes and the games that go to the wire
    if (g.type === 'conf') inc += 3;
    if (close) inc += 5;
    if (lRank || wRank) inc += 2;
    text ||= `Every game between ${A.school} and ${B.school} seems to come down to the wire.`;
  }
  if (inc < 4 && !r) return;
  if (!inc) {
    if (r) record(state, r, g); // keep the series for simmering pairs
    return;
  }
  r = makePair(state, g.home, g.away);
  record(state, r, g);
  addHeat(state, g.home, g.away, inc, { kind, text });
}

function userRivalryEffects(state: GameState, r: Rivalry, won: boolean, prevHolder: string | undefined, prevStreak: { t: string; n: number } | undefined) {
  const uid = state.user.teamId;
  const me = state.teams[uid], opp = state.teams[other(r, uid)];
  const coach = state.coaches[state.user.coachId];
  const weight = r.heat / 100;
  me.hype = clamp(me.hype + (won ? 3 + weight * 5 : -(2 + weight * 3)), 0, 100);
  if (coach) coach.jobSecurity = clamp(coach.jobSecurity + (won ? 1 + weight * 1.5 : -(0.5 + weight * 1.5)), 0, 100);
  for (const pid of me.roster) { const p = state.players[pid]; if (p) p.morale = clamp(p.morale + (won ? 2 : -2) * (0.5 + weight), 0, 100); }
  const [w, l] = seriesFor(r, uid);
  const snapped = won && prevStreak && prevStreak.t !== uid && prevStreak.n >= 3;
  const reclaimed = won && r.trophy && prevHolder && prevHolder !== uid;
  if (!won && r.streak && r.streak.t !== uid && r.streak.n >= 3 && coach) coach.jobSecurity = clamp(coach.jobSecurity - 1.5, 0, 100);
  if (reclaimed || snapped || (won && r.heat >= 80 && rng.chance(0.5))) {
    state.user.moments.push({
      kind: 'rivalry', key: r.key, teamId: uid, oppId: opp.id,
      label: reclaimed ? `${r.trophy} is coming home` : snapped ? `Streak snapped` : `${r.name} belongs to ${me.school}`,
      sub: `${me.school} beats ${opp.school}${snapped ? `, ending a ${prevStreak!.n}-game losing streak in the series` : ''}. Series since ${r.since}: ${w}-${l}.`,
      ...(r.trophy ? { trophy: r.trophy } : {}),
    });
  }
}

// ---------------- off the court ----------------
/** A coach leaves one school for another */
export function rivalryCoachMove(state: GameState, fromId: string, toId: string, last: string, isUser: boolean) {
  // only moves people talk about: yours, or one involving a program with a real following
  if (!isUser && Math.max(state.teams[fromId]?.prestige ?? 0, state.teams[toId]?.prestige ?? 0) < 55) return;
  addHeat(state, fromId, toId, isUser ? 55 : 30, { kind: 'coach', detail: last, text: `Coach ${last} left ${state.teams[fromId]?.school} for ${state.teams[toId]?.school}, and ${state.teams[fromId]?.school} fans haven't forgiven him.` });
}
/** A star transfers between schools */
export function rivalryTransfer(state: GameState, fromId: string, toId: string, name: string, userInvolved: boolean) {
  addHeat(state, fromId, toId, userInvolved ? 14 : 10, { kind: 'portal', text: `${name} transferred from ${state.teams[fromId]?.school} to ${state.teams[toId]?.school}.` });
}
/** You lose a big recruiting battle */
export function rivalryRecruit(state: GameState, winnerId: string, name: string, stars: number) {
  addHeat(state, state.user.teamId, winnerId, stars >= 5 ? 9 : 6, { kind: 'recruiting', text: `${state.teams[winnerId]?.school} beat ${state.teams[state.user.teamId]?.school} for ${name}, and the recruiting wars have turned personal.` });
}

// ---------------- the calendar ----------------
/** End of season: log heat, cool things off, let cold rivalries fade */
export function rivalrySeasonEnd(state: GameState) {
  const book = rivalryBook(state);
  const uid = state.user.teamId;
  for (const [key, r] of Object.entries(book.pairs)) {
    if (r.active || r.faded) { r.heatLog.push([state.season, Math.round(r.heat)]); if (r.heatLog.length > 30) r.heatLog.shift(); }
    if (r.active && r.origin === 'historic') r.heat = r.heat + (r.floor - r.heat) * 0.35;
    else if (r.active) {
      const met = r.meetings.some((m) => m.s === state.season);
      r.heat = r.heat * (met ? 0.88 : 0.75) - 3;
      if (r.heat < FADE_AT) {
        r.active = false; r.faded = true;
        if (r.a === uid || r.b === uid) addNews(state, { kind: 'feature', headline: `${r.name} has cooled off`, body: `${state.teams[r.a].school} and ${state.teams[r.b].school} haven't given fans much to fight about lately.`, teams: [r.a, r.b] });
      }
    } else {
      r.heat *= 0.7;
      if (r.heat < 10 && !r.faded) delete book.pairs[key];
    }
  }
}

/** League-wide Rivalry Week headlines when the hottest rivalries meet */
export function rivalryWeek(state: GameState) {
  const book = rivalryBook(state);
  const wk = state.calendar[state.day]?.week ?? 0;
  if (book.weekNews === wk + state.season * 100) return;
  const games = state.schedule.filter((g) => !g.played && state.calendar[g.day]?.week === wk);
  const hot = games.map((g) => ({ g, r: rivalryOf(state, g.home, g.away) })).filter((x) => x.r && x.r.heat >= 65).sort((a, b) => b.r!.heat - a.r!.heat);
  const user = hot.find((x) => x.g.home === state.user.teamId || x.g.away === state.user.teamId);
  if (hot.length >= 3 || (user && user.r!.heat >= 70)) {
    book.weekNews = wk + state.season * 100;
    addNews(state, {
      kind: 'feature',
      headline: `Rivalry Week: ${hot.slice(0, 3).map((x) => x.r!.name).join(', ')}`,
      body: `Circle these: ${hot.slice(0, 5).map((x) => `${state.teams[x.g.away].school} at ${state.teams[x.g.home].school} (${x.r!.name}, ${heatInfo(x.r!.heat).label.toLowerCase()})`).join('; ')}.`,
      teams: hot.slice(0, 3).flatMap((x) => [x.g.home, x.g.away]),
      important: !!user,
    });
  }
}

/** The user's rivalry game this calendar week, if any */
export function userRivalryThisWeek(state: GameState): { g: ScheduledGame; r: Rivalry } | undefined {
  const uid = state.user.teamId;
  const wk = state.calendar[state.day]?.week ?? 0;
  for (const g of state.schedule.filter((x) => !x.played && (x.home === uid || x.away === uid) && x.day >= state.day && (state.calendar[x.day]?.week ?? -1) <= wk + 0).sort((a, b) => a.day - b.day)) {
    const r = rivalryOf(state, g.home, g.away);
    if (r) return { g, r };
  }
  return undefined;
}

export function originLine(state: GameState, r: Rivalry): string {
  if (r.origin === 'historic') return `A historic rivalry. Tracked since ${r.since}.`;
  return `${r.faded ? 'Faded' : 'Born'} in ${r.since}. ${r.reason ?? ''}`.trim();
}
export function teamName(state: GameState, id: string): Team | undefined { return state.teams[id]; }
