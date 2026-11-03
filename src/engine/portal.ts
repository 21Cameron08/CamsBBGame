// Transfer Portal 2.0: a live, day-by-day window with retention meetings, entry waves,
// relationships, official visits, bidding wars, counter-offer calls and decision days.
import { rng, clamp } from './rng';
import type { GameState, Player, PortalEntry, PortalFeedItem, PortalOffer, PortalPriorities, PortalReason, PortalState, RetentionMeeting, Team } from './types';
import { teamPlayers, ROSTER_MAX } from './team';
import { playerValue, nilSatisfaction, committedNil, committedRecruitNil } from './nil';
import { roundMoney, fmtMoney } from './player';
import { addNews, INSIDERS } from './media';
import { gainXp } from './coach';
import { staffEffects } from './staff';
import { milesBetween, PLACES } from '../data/places';
import { seasonLabel } from './calendar';

export const PORTAL_DAYS = 6;
export const PORTAL_ACTIONS = {
  call: { label: 'Call', hours: 2, rel: 10, icon: '📞', desc: 'Learn what he wants. Small relationship boost. Once a day.' },
  zoom: { label: 'Staff Zoom', hours: 5, rel: 16, icon: '💻', desc: 'Your staff walks him through the plan. Once a day.' },
  visit: { label: 'Official Visit', hours: 10, rel: 28, icon: '✈️', desc: 'Bring him to campus. Big boost, boosted by facilities & hype. Once.' },
} as const;
export type PortalActionKey = keyof typeof PORTAL_ACTIONS;

const isUser = (state: GameState, teamId: string) => teamId === state.user.teamId;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}

function removeFromTeam(state: GameState, p: Player, note: string) {
  if (p.teamId) {
    const t = state.teams[p.teamId];
    if (t) t.roster = t.roster.filter((id) => id !== p.id);
  }
  p.history.push(note);
  p.teamId = null;
}

function homeCoords(p: Player): [number, number] | null {
  if (p.country !== 'USA') return null;
  const exact = PLACES.find((x) => x.city === p.hometown && x.state === p.state);
  const any = exact ?? PLACES.find((x) => x.state === p.state);
  return any ? [any.lat, any.lng] : null;
}

function reasonFor(state: GameState, p: Player, team: Team): PortalReason {
  const mpg = p.stats.gp ? p.stats.min / p.stats.gp : 0;
  const roster = teamPlayers(state, team.id).sort((a, b) => b.ovr - a.ovr);
  const rank = roster.findIndex((x) => x.id === p.id);
  if ((mpg < 12 && rank < 8) || mpg < 6) return 'Playing time';
  if (nilSatisfaction(state, p) < 0.6) return 'NIL money';
  if (team.coachChange) return 'Coaching change';
  if ((p.ovr >= 68 && team.prestige < 45) || (p.ovr >= 74 && team.prestige < 65)) return 'Bigger stage';
  if (p.traits.includes('hometown')) return 'Closer to home';
  return 'Fresh start';
}

function prioritiesFor(p: Player, reason: PortalReason): PortalPriorities {
  const w: PortalPriorities = { nil: 0.2, pt: 0.2, win: 0.15, prestige: 0.15, home: 0.1, coach: 0.2 };
  if (reason === 'Playing time') w.pt += 0.3;
  if (reason === 'NIL money') w.nil += 0.35;
  if (reason === 'Coaching change') { w.coach += 0.2; w.pt += 0.1; }
  if (reason === 'Bigger stage') { w.prestige += 0.25; w.win += 0.15; }
  if (reason === 'Closer to home') w.home += 0.4;
  if (reason === 'Fresh start') { w.coach += 0.1; w.win += 0.1; }
  if (p.traits.includes('mercenary')) w.nil += 0.2;
  if (p.traits.includes('hometown')) w.home += 0.2;
  for (const k of Object.keys(w) as (keyof PortalPriorities)[]) w[k] *= rng.range(0.85, 1.15);
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(w) as (keyof PortalPriorities)[]) w[k] = w[k] / sum;
  return w;
}

function makeEntry(state: GameState, p: Player, from: string, enterDay: number, reason: PortalReason, askMul: [number, number]): PortalEntry {
  return {
    id: p.id, from, ask: roundMoney(Math.max(5000, playerValue(state, p) * rng.range(askMul[0], askMul[1]))),
    enterDay, decideDay: PORTAL_DAYS, stars: 2, rank: 999, reason, pri: prioritiesFor(p, reason),
    rel: {}, offers: [], visits: [], top: null, status: 'available', userCall: -1, userZoom: -1, known: false,
    seed: Math.floor(rng.next() * 1e9),
  };
}

function lastLine(p: Player) {
  const c = p.career[p.career.length - 1];
  if (!c || !c.gp) return { ppg: 0, rpg: 0, apg: 0 };
  return { ppg: c.pts / c.gp, rpg: (c.orb + c.drb) / c.gp, apg: c.ast / c.gp };
}

function rankEntries(state: GameState, ps: PortalState) {
  const list = Object.values(ps.entries);
  const score = (e: PortalEntry) => {
    const p = state.players[e.id];
    return p ? p.ovr * 0.7 + p.pot * 0.3 + lastLine(p).ppg * 0.35 : 0;
  };
  list.sort((a, b) => score(b) - score(a));
  const n = list.length;
  list.forEach((e, i) => {
    e.rank = i + 1;
    const pct = i / Math.max(1, n);
    e.stars = pct < 0.025 ? 5 : pct < 0.12 ? 4 : pct < 0.42 ? 3 : pct < 0.78 ? 2 : 1;
    const span = e.stars === 5 ? rng.int(2, 4) : e.stars === 4 ? rng.int(1, 4) : rng.int(1, 3);
    e.decideDay = clamp(e.enterDay + span, e.enterDay + 1, PORTAL_DAYS);
  });
}

function feed(ps: PortalState, item: Omit<PortalFeedItem, 'day'> & { day?: number }) {
  ps.feed.unshift({ day: item.day ?? ps.day, ...item });
  if (ps.feed.length > 500) ps.feed.length = 500;
}

export function portalHoursMax(state: GameState): number {
  const c = state.coaches[state.user.coachId];
  return 24 + (c ? c.skills.portal * 2 : 0) + Math.round(staffEffects(state).portal * 2);
}

// ---------------- Opening: departures + retention meetings ----------------
const RETENTION_QUOTES: Record<PortalReason, string[]> = {
  'Playing time': ['Coach, I played {mpg} minutes a night. I need to be on the floor.', 'I didn’t come here to watch. Where do I fit next year?'],
  'NIL money': ['Other schools are telling my people I’m worth {value}. I’m at {current}.', 'I love it here, but I have to take care of my family.'],
  'Coaching change': ['Everything changed when the staff turned over. I don’t know where I stand.', 'I committed to a different coach. Convince me.'],
  'Bigger stage': ['I want to play on the biggest stage. I think I’m ready.', 'Pros are telling me I need to play at a higher level.'],
  'Closer to home': ['My family needs me closer to home right now.', 'I’ve been homesick all year, Coach.'],
  'Fresh start': ['I just think I need a fresh start.', 'It hasn’t felt right this year. I’m thinking about my options.'],
};
const CHANCES: Record<PortalReason, { pay: number; promise: number; talk: number }> = {
  'Playing time': { pay: 0.5, promise: 0.85, talk: 0.35 },
  'NIL money': { pay: 1, promise: 0.3, talk: 0.25 },
  'Coaching change': { pay: 0.7, promise: 0.65, talk: 0.55 },
  'Bigger stage': { pay: 0.5, promise: 0.4, talk: 0.25 },
  'Closer to home': { pay: 0.3, promise: 0.25, talk: 0.4 },
  'Fresh start': { pay: 0.55, promise: 0.5, talk: 0.45 },
};

export function retentionOdds(state: GameState, id: string): { pay: number; promise: number; talk: number } {
  const r = state.user.retention[id];
  if (!r) return { pay: 0, promise: 0, talk: 0 };
  const base = CHANCES[r.reason ?? 'Fresh start'];
  const c = state.coaches[state.user.coachId];
  const p = state.players[id];
  const adj = 1.15 - (r.prob ?? 0.3) * 0.5 + (c ? c.skills.motivation * 0.015 : 0) + (p?.traits.includes('loyal') ? 0.15 : 0);
  return {
    pay: r.reason === 'NIL money' ? 1 : clamp(base.pay * adj, 0.05, 0.98),
    promise: clamp(base.promise * adj, 0.05, 0.98),
    talk: clamp(base.talk * adj + (c ? c.skills.portal * 0.01 : 0), 0.05, 0.95),
  };
}

export function openPortal(state: GameState) {
  state.phase = 'portal';
  const os = state.offseason!;
  const leaving = new Set([...os.graduating, ...os.declared]);
  for (const id of leaving) {
    const p = state.players[id];
    if (p && p.teamId) removeFromTeam(state, p, os.graduating.includes(id) ? `Graduated (${seasonLabel(state.season)})` : `Declared for NBA Draft (${state.season + 1})`);
  }
  const ps: PortalState = { day: 0, maxDays: PORTAL_DAYS, entries: {}, feed: [], hours: 0, hoursMax: 0, calls: [] };
  state.portal = ps;
  state.user.retention = {};
  const waves = [1, 2, 3, 4, 5];
  for (const p of Object.values(state.players)) {
    if (!p.teamId) continue;
    const team = state.teams[p.teamId];
    const mpg = p.stats.gp ? p.stats.min / p.stats.gp : 0;
    const roster = teamPlayers(state, team.id).sort((a, b) => b.ovr - a.ovr);
    const rank = roster.findIndex((x) => x.id === p.id);
    let pr = 0.05;
    if (mpg < 12 && rank < 8) pr += 0.15;
    if (mpg < 6) pr += 0.14;
    if (p.morale < 55) pr += ((55 - p.morale) / 100) * 0.9;
    if (nilSatisfaction(state, p) < 0.6) pr += p.traits.includes('mercenary') ? 0.22 : 0.1;
    if (team.coachChange) pr += 0.18;
    if (p.ovr >= 68 && team.prestige < 45) pr += 0.28;
    else if (p.ovr >= 74 && team.prestige < 65) pr += 0.16;
    if (p.traits.includes('loyal')) pr *= 0.3;
    if (p.traits.includes('mercenary')) pr *= 1.35;
    if (p.traits.includes('hometown')) pr *= 0.8;
    const coach = state.coaches[team.coachId];
    if (coach) pr *= 1 - coach.skills.portal * 0.03 - coach.skills.motivation * 0.02;
    pr = clamp(pr, 0, 0.85);
    const reason = reasonFor(state, p, team);
    if (isUser(state, team.id)) {
      if (pr >= 0.2) {
        const ask = roundMoney(Math.max(playerValue(state, p) * rng.range(1.0, 1.35), (p.nil?.amount ?? 0) * 1.15) * staffEffects(state).retentionMul);
        const quote = rng.pick(RETENTION_QUOTES[reason])
          .replace('{mpg}', mpg.toFixed(1)).replace('{value}', fmtMoney(playerValue(state, p))).replace('{current}', fmtMoney(p.nil?.amount ?? 0));
        state.user.retention[p.id] = { ask, resolved: false, prob: pr, reason, quote };
      }
      continue;
    }
    if (!rng.chance(pr)) continue;
    const day = rng.weighted(waves, [55, 20, 12, 8, 5]);
    ps.entries[p.id] = makeEntry(state, p, team.id, day, reason, [0.85, 1.25]);
    removeFromTeam(state, p, `Entered transfer portal from ${team.school}`);
    p.inPortal = true;
  }
  rankEntries(state, ps);
  ps.hoursMax = portalHoursMax(state);
  ps.hours = ps.hoursMax;
  const n = Object.keys(state.user.retention).length;
  feed(ps, { kind: 'open', text: `The portal window opens soon. ${n ? `${n} of your players want to talk first.` : 'Your locker room is locked in — nobody asked for a meeting.'}`, big: true });
}

export function retentionChoose(state: GameState, id: string, choice: 'pay' | 'promise' | 'talk' | 'release'): { ok: boolean; stayed: boolean; msg: string } {
  const r = state.user.retention[id] as RetentionMeeting | undefined;
  const p = state.players[id];
  if (!r || !p || r.resolved) return { ok: false, stayed: false, msg: '' };
  const odds = retentionOdds(state, id);
  if (choice === 'release') {
    Object.assign(r, { resolved: true, staying: false, choice });
    return { ok: true, stayed: false, msg: `You wished ${p.first} well. He’ll enter the portal.` };
  }
  if (choice === 'pay') {
    const team = state.teams[state.user.teamId];
    const avail = team.nilBudget - committedNil(state, team.id) + (p.nil?.amount ?? 0) - committedRecruitNil(state, team.id);
    if (avail < r.ask) return { ok: false, stayed: false, msg: `Not enough NIL budget to meet his ${fmtMoney(r.ask)} ask.` };
  }
  const stayed = rng.chance(odds[choice]);
  Object.assign(r, { resolved: true, staying: stayed, choice });
  if (stayed) {
    if (choice === 'pay') p.nil = { amount: r.ask, years: 2 };
    if (choice === 'promise') p.promise = 'starter';
    p.morale = clamp(p.morale + (choice === 'pay' ? 15 : choice === 'promise' ? 8 : 6), 0, 100);
    return { ok: true, stayed: true, msg: choice === 'pay' ? `${p.first} ${p.last} is staying on a new ${fmtMoney(r.ask)} deal!` : choice === 'promise' ? `${p.first} bought in. He’s staying — with a starting role promised.` : `${p.first} heard you out. He’s staying.` };
  }
  return { ok: true, stayed: false, msg: choice === 'pay' ? `Even the raise didn’t do it. ${p.first} is entering the portal.` : `${p.first} wasn’t convinced. He’s entering the portal.` };
}

function finalizeRetention(state: GameState) {
  const ps = state.portal!;
  const team = state.teams[state.user.teamId];
  for (const [id, r] of Object.entries(state.user.retention)) {
    const p = state.players[id];
    if (!p || p.teamId !== team.id) continue;
    let leaves: boolean;
    if (r.resolved) leaves = !r.staying;
    else { leaves = rng.chance(r.prob ?? 0.3); r.resolved = true; r.staying = !leaves; }
    if (!leaves) continue;
    ps.entries[id] = makeEntry(state, p, team.id, 1, r.reason ?? 'Fresh start', [0.9, 1.3]);
    removeFromTeam(state, p, `Entered transfer portal from ${team.school}`);
    p.inPortal = true;
    addNews(state, { kind: 'portal', headline: `${p.first} ${p.last} enters the transfer portal`, body: `${p.first} ${p.last} will leave ${team.school}. Reason cited: ${(r.reason ?? 'a fresh start').toLowerCase()}.`, teams: [team.id], important: true, personId: p.id, personKind: 'player' });
  }
  rankEntries(state, ps);
}

// ---------------- Scoring & odds ----------------
export function teamScore(state: GameState, e: PortalEntry, teamId: string, offer?: PortalOffer): number {
  const p = state.players[e.id];
  const t = state.teams[teamId];
  if (!p || !t) return -999;
  const w = e.pri;
  const nilS = offer ? clamp((offer.nil / Math.max(1, e.ask)) * 100, 0, 150) : 0;
  const roster = teamPlayers(state, teamId);
  const ahead = roster.filter((x) => x.pos === p.pos && x.ovr >= p.ovr - 1).length;
  let pt = clamp(100 - ahead * 32 - Math.max(0, roster.length - 11) * 3, 5, 100);
  if (offer?.promise === 'star') pt = 100;
  else if (offer?.promise === 'starter') pt = Math.max(pt, 88);
  else if (offer?.promise === 'rotation') pt = Math.max(pt, 65);
  const winS = clamp(50 + (t.rating ?? 0) * 2.2, 0, 100);
  const home = homeCoords(p);
  const homeS = home ? clamp(100 - milesBetween(home[0], home[1], t.lat, t.lng) / 12, 0, 100) : 45;
  const coach = state.coaches[t.coachId];
  let coachS = (e.rel[teamId] ?? 0) + (coach ? coach.skills.portal * 3 + (coach.reputation - 50) * 0.3 : 0);
  if (isUser(state, teamId)) coachS += staffEffects(state).portal * 2;
  coachS = clamp(coachS, 0, 110);
  let s = w.nil * nilS + w.pt * pt + w.win * winS + w.prestige * t.prestige + w.home * homeS + w.coach * coachS;
  if ((offer?.years ?? 1) >= 2) s += 2;
  if (teamId === e.from) s -= 8;
  if (p.traits.includes('mercenary')) s += (nilS - 100) * 0.1;
  s += (hash(`${e.seed}:${teamId}`) - 0.5) * 12;
  return s;
}

const TEMP = 5;
/** Honest odds: the % shown is the real chance he picks each school if he decided now */
export function entryOdds(state: GameState, e: PortalEntry, extra?: PortalOffer): { teamId: string; p: number; score: number; nil: number }[] {
  const offers = [...e.offers.filter((o) => !extra || o.teamId !== extra.teamId), ...(extra ? [extra] : [])]
    .filter((o) => state.teams[o.teamId] && state.teams[o.teamId].roster.length < ROSTER_MAX);
  if (!offers.length) return [];
  const sc = offers.map((o) => ({ teamId: o.teamId, nil: o.nil, score: teamScore(state, e, o.teamId, o) }));
  const max = Math.max(...sc.map((x) => x.score));
  const ex = sc.map((x) => Math.exp((x.score - max) / TEMP));
  const tot = ex.reduce((a, b) => a + b, 0);
  return sc.map((x, i) => ({ ...x, p: ex[i] / tot })).sort((a, b) => b.p - a.p);
}

export function userOffer(state: GameState, e: PortalEntry) {
  return e.offers.find((o) => o.teamId === state.user.teamId);
}

export function userPendingNil(state: GameState, exceptId?: string): number {
  const ps = state.portal;
  if (!ps) return 0;
  let s = 0;
  for (const e of Object.values(ps.entries)) {
    if (e.status !== 'available' || e.id === exceptId) continue;
    const o = userOffer(state, e);
    if (o) s += o.nil;
  }
  return s;
}

export function userNilRoom(state: GameState, exceptId?: string): number {
  const t = state.teams[state.user.teamId];
  return t.nilBudget - committedNil(state, t.id) - committedRecruitNil(state, t.id) - userPendingNil(state, exceptId);
}

export function visibleEntries(state: GameState): PortalEntry[] {
  const ps = state.portal;
  if (!ps) return [];
  return Object.values(ps.entries).filter((e) => e.enterDay <= ps.day && state.players[e.id]);
}

// ---------------- User actions ----------------
export function portalAction(state: GameState, id: string, action: PortalActionKey): { ok: boolean; msg: string } {
  const ps = state.portal;
  const e = ps?.entries[id];
  const p = state.players[id];
  if (!ps || !e || !p || e.status !== 'available' || e.enterDay > ps.day) return { ok: false, msg: 'He’s not available.' };
  const def = PORTAL_ACTIONS[action];
  if (ps.hours < def.hours) return { ok: false, msg: `Not enough portal hours today (${def.hours}h needed).` };
  const uid = state.user.teamId;
  if (action === 'call' && e.userCall === ps.day) return { ok: false, msg: 'You already called him today.' };
  if (action === 'zoom' && e.userZoom === ps.day) return { ok: false, msg: 'Your staff already met with him today.' };
  if (action === 'visit' && e.visits.includes(uid)) return { ok: false, msg: 'He’s already visited campus.' };
  const c = state.coaches[uid];
  const mul = 1 + (c ? c.skills.portal * 0.05 : 0) + staffEffects(state).portal * 0.03;
  let gain: number = def.rel * mul;
  const team = state.teams[uid];
  let flavor = '';
  if (action === 'visit') {
    gain += team.facilities * 1.2 + team.hype * 0.1;
    e.visits.push(uid);
    const lines = [
      `${p.first} lit up when he saw the practice facility.`,
      `The student section showed up for his visit. He felt the love.`,
      `He spent an hour with your point guard. Great chemistry.`,
      `His family loved the campus. Mom’s on board.`,
      `He kept asking about the NBA scouts who come to your games.`,
    ];
    flavor = ` ${rng.pick(lines)}`;
    feed(ps, { kind: 'visit', text: `${p.first} ${p.last} is on an official visit to ${team.school}.`, playerId: id, teamId: uid });
  }
  if (action === 'call') e.userCall = ps.day;
  if (action === 'zoom') e.userZoom = ps.day;
  e.known = true;
  e.rel[uid] = clamp((e.rel[uid] ?? 0) + gain * (1 - (e.rel[uid] ?? 0) / 130), 0, 100);
  ps.hours -= def.hours;
  return { ok: true, msg: `${def.label} with ${p.first} ${p.last} went well.${flavor}` };
}

export function portalMakeOffer(state: GameState, id: string, nil: number, years: number, promise: PortalOffer['promise']): { ok: boolean; msg: string } {
  const ps = state.portal;
  const e = ps?.entries[id];
  const p = state.players[id];
  if (!ps || !e || !p || e.status !== 'available' || e.enterDay > ps.day) return { ok: false, msg: 'He’s not available.' };
  const uid = state.user.teamId;
  if (state.teams[uid].roster.length >= ROSTER_MAX) return { ok: false, msg: 'Your roster is full (15). Free a spot first.' };
  const room = Math.max(0, userNilRoom(state, id));
  nil = roundMoney(Math.max(0, nil));
  if (nil > room && nil - room <= 25_000) nil = Math.floor(room / 1000) * 1000; // rounding nudged it past the room
  if (nil > room) return { ok: false, msg: `That's more than your available NIL (${fmtMoney(room)}).` };
  const existing = userOffer(state, e);
  if (existing) Object.assign(existing, { nil, years, promise, day: ps.day });
  else {
    e.offers.push({ teamId: uid, nil, years, promise, day: ps.day });
    e.rel[uid] = clamp((e.rel[uid] ?? 0) + 6, 0, 100);
  }
  ps.calls = ps.calls.filter((c) => c.playerId !== id);
  return { ok: true, msg: existing ? `Offer to ${p.first} ${p.last} updated.` : `Offer sent to ${p.first} ${p.last}: ${fmtMoney(nil)}/yr${promise ? `, ${promise} role` : ''}.` };
}

export function portalWithdraw(state: GameState, id: string) {
  const e = state.portal?.entries[id];
  if (!e) return;
  e.offers = e.offers.filter((o) => o.teamId !== state.user.teamId);
}

export function answerCall(state: GameState, playerId: string, answer: 'match' | 'half' | 'hold'): { ok: boolean; msg: string } {
  const ps = state.portal;
  const call = ps?.calls.find((c) => c.playerId === playerId);
  const e = ps?.entries[playerId];
  if (!ps || !call || !e) return { ok: false, msg: '' };
  const mine = userOffer(state, e);
  const p = state.players[playerId];
  if (!mine || !p) return { ok: false, msg: '' };
  if (answer === 'hold') {
    e.rel[state.user.teamId] = clamp((e.rel[state.user.teamId] ?? 0) - 6, 0, 100);
    ps.calls = ps.calls.filter((c) => c.playerId !== playerId);
    return { ok: true, msg: `You held firm at ${fmtMoney(mine.nil)}. ${p.first} sounded disappointed.` };
  }
  const target = answer === 'match' ? call.want : roundMoney((mine.nil + call.want) / 2);
  const r = portalMakeOffer(state, playerId, target, mine.years ?? 1, mine.promise);
  if (!r.ok) return r;
  e.rel[state.user.teamId] = clamp((e.rel[state.user.teamId] ?? 0) + (answer === 'match' ? 8 : 3), 0, 100);
  return { ok: true, msg: answer === 'match' ? `Done — you matched at ${fmtMoney(target)}. ${p.first}: "That means a lot, Coach."` : `You met him halfway at ${fmtMoney(target)}.` };
}

// ---------------- AI + daily simulation ----------------
function aiDay(state: GameState) {
  const ps = state.portal!;
  const avail = visibleEntries(state).filter((e) => e.status === 'available');
  const byTeam = new Map<string, PortalEntry[]>();
  for (const e of avail) for (const o of e.offers) {
    const l = byTeam.get(o.teamId);
    if (l) l.push(e); else byTeam.set(o.teamId, [e]);
  }
  const recruitCommits = new Map<string, number>();
  for (const r of Object.values(state.recruits)) if (r.committed) recruitCommits.set(r.committed, (recruitCommits.get(r.committed) ?? 0) + 1);
  const leaks: { e: PortalEntry; t: Team; text: string }[] = [];
  const visits: { e: PortalEntry; t: Team }[] = [];
  for (const t of Object.values(state.teams)) {
    if (isUser(state, t.id) && !state.settings.autoRecruit) continue;
    const open = ROSTER_MAX - t.roster.length - (recruitCommits.get(t.id) ?? 0);
    const mine = byTeam.get(t.id) ?? [];
    if (open <= 0) {
      for (const e of mine) e.offers = e.offers.filter((o) => o.teamId !== t.id);
      continue;
    }
    const pending = mine.reduce((s, e) => s + (e.offers.find((o) => o.teamId === t.id)?.nil ?? 0), 0);
    let budget = t.nilBudget - committedNil(state, t.id) - pending;
    // work existing targets
    for (const e of mine) {
      e.rel[t.id] = clamp((e.rel[t.id] ?? 0) + rng.range(3, 7), 0, 100);
      if (!e.visits.includes(t.id) && e.stars >= 3 && rng.chance(0.18)) {
        e.visits.push(t.id);
        e.rel[t.id] = clamp((e.rel[t.id] ?? 0) + 16, 0, 100);
        if (e.stars >= 4) visits.push({ e, t });
      }
      const o = e.offers.find((x) => x.teamId === t.id)!;
      const odds = entryOdds(state, e);
      const cap = e.ask * 1.6;
      if (e.stars >= 3 && odds[0] && odds[0].teamId !== t.id && budget > 0 && o.nil < cap && rng.chance(0.35)) {
        const bump = roundMoney(Math.min(o.nil * rng.range(0.1, 0.22) + 5000, budget, cap - o.nil));
        if (bump > 0) {
          o.nil += bump;
          budget -= bump;
          if (e.stars >= 4) leaks.push({ e, t, text: `Sources: ${t.school} has upped its NIL offer to ${state.players[e.id].first} ${state.players[e.id].last} — now around ${fmtMoney(o.nil)}.` });
        }
      }
    }
    // new targets
    const maxActive = open * 2 + 1;
    let slots = Math.min(2, maxActive - mine.length);
    if (slots <= 0 || budget < 8000) continue;
    const lo = t.power - 9, hi = t.power + 5;
    const cands = avail.filter((e) => {
      const p = state.players[e.id];
      return p && p.ovr >= lo && p.ovr <= hi && e.from !== t.id && !e.offers.some((o) => o.teamId === t.id);
    });
    for (let k = 0; k < 6 && slots > 0 && cands.length; k++) {
      const e = cands.splice(rng.int(0, cands.length - 1), 1)[0];
      const p = state.players[e.id];
      const nil = roundMoney(Math.min(e.ask * rng.range(0.75, 1.2), budget * 0.5));
      if (nil < 2000 && e.ask > 20000) continue;
      e.offers.push({ teamId: t.id, nil, years: rng.chance(0.4) ? 2 : 1, promise: p.ovr > t.power + 1 ? 'starter' : null, day: ps.day });
      e.rel[t.id] = clamp((e.rel[t.id] ?? 0) + rng.int(6, 14), 0, 100);
      budget -= nil;
      slots--;
      if (e.stars >= 4 && rng.chance(0.4)) leaks.push({ e, t, text: `${t.school} has offered ${p.first} ${p.last} (${state.teams[e.from]?.school ?? 'portal'}). Deal reportedly in the ${fmtMoney(nil)} range.` });
    }
  }
  for (const v of rng.shuffle(visits).slice(0, 5)) {
    feed(ps, { kind: 'visit', text: `${state.players[v.e.id].first} ${state.players[v.e.id].last} is on an official visit to ${v.t.school}.`, playerId: v.e.id, teamId: v.t.id });
  }
  for (const l of leaks.slice(0, 8)) {
    const ins = rng.pick(INSIDERS);
    feed(ps, { kind: 'leak', text: l.text, playerId: l.e.id, teamId: l.t.id, handle: ins.handle });
  }
}

function revealDay(state: GameState) {
  const ps = state.portal!;
  const fresh = Object.values(ps.entries).filter((e) => e.enterDay === ps.day && state.players[e.id]);
  const notable = fresh.filter((e) => e.stars >= 4 || e.from === state.user.teamId).sort((a, b) => a.rank - b.rank);
  if (ps.day === 1) feed(ps, { kind: 'open', text: `🚨 THE PORTAL IS OPEN — ${fresh.length} players entered on day one.`, big: true });
  else if (fresh.length) feed(ps, { kind: 'enter', text: `${fresh.length} more players hit the portal today.` });
  for (const e of notable.slice(0, 10)) {
    const p = state.players[e.id];
    const ll = lastLine(p);
    const from = state.teams[e.from];
    const late = ps.day >= 4 && e.stars >= 4;
    const ins = rng.pick(INSIDERS);
    feed(ps, {
      kind: late ? 'withdraw' : 'enter',
      text: late
        ? `${from.school}'s ${p.first} ${p.last} has withdrawn from the NBA Draft and entered the transfer portal. ${'★'.repeat(e.stars)}`
        : `${from.school} ${p.pos} ${p.first} ${p.last} (${ll.ppg.toFixed(1)} PPG) has entered the portal. ${'★'.repeat(e.stars)}`,
      playerId: e.id, teamId: e.from, big: e.stars === 5 || e.from === state.user.teamId, handle: ins.handle,
    });
  }
}

function releaseTopLists(state: GameState) {
  const ps = state.portal!;
  for (const e of visibleEntries(state)) {
    if (e.status !== 'available' || e.top || e.stars < 3 || ps.day < e.enterDay + 1 || e.offers.length < 3) continue;
    const odds = entryOdds(state, e).slice(0, 5);
    e.top = odds.map((o) => o.teamId);
    const p = state.players[e.id];
    if (e.stars >= 4 || e.top.includes(state.user.teamId)) {
      feed(ps, { kind: 'top', text: `${p.first} ${p.last} is down to ${e.top.length}: ${e.top.map((id) => state.teams[id].school).join(', ')}.`, playerId: e.id, big: e.top.includes(state.user.teamId) });
    }
  }
}

function makeCalls(state: GameState) {
  const ps = state.portal!;
  ps.calls = [];
  const uid = state.user.teamId;
  const cands: { e: PortalEntry; rival: number; mine: number; p: number }[] = [];
  for (const e of visibleEntries(state)) {
    if (e.status !== 'available') continue;
    const mine = userOffer(state, e);
    if (!mine) continue;
    const odds = entryOdds(state, e);
    const me = odds.find((x) => x.teamId === uid);
    const rival = Math.max(0, ...e.offers.filter((o) => o.teamId !== uid).map((o) => o.nil));
    if (!me || me.p < 0.1 || me.p > 0.8 || rival <= mine.nil * 1.1) continue;
    cands.push({ e, rival, mine: mine.nil, p: me.p });
  }
  cands.sort((a, b) => b.e.stars - a.e.stars || a.e.rank - b.e.rank);
  for (const c of cands.slice(0, 3)) {
    const rivalTeam = c.e.offers.filter((o) => o.teamId !== uid).sort((a, b) => b.nil - a.nil)[0].teamId;
    ps.calls.push({ playerId: c.e.id, teamId: rivalTeam, rivalNil: c.rival, want: roundMoney(Math.max(c.mine * 1.05, c.rival * rng.range(0.9, 0.98))), day: ps.day });
  }
}

function commit(state: GameState, e: PortalEntry, o: PortalOffer) {
  const ps = state.portal!;
  const p = state.players[e.id];
  const t = state.teams[o.teamId];
  const fromSchool = state.teams[e.from]?.school ?? 'his previous school';
  p.teamId = t.id;
  p.inPortal = false;
  p.transfers++;
  p.nil = { amount: o.nil, years: o.years ?? 1 };
  p.promise = o.promise;
  p.morale = 76;
  p.num = 0;
  p.history.push(`Transferred from ${fromSchool} to ${t.school} (${state.season + 1})`);
  t.roster.push(p.id);
  e.status = 'committed';
  e.to = t.id;
  e.dealNil = o.nil;
  const others = e.offers.filter((x) => x.teamId !== t.id).map((x) => state.teams[x.teamId]?.school).filter(Boolean).slice(0, 2);
  const userWon = isUser(state, t.id);
  const userInvolved = e.offers.some((x) => isUser(state, x.teamId)) || e.from === state.user.teamId;
  if (e.stars >= 4 || userInvolved) {
    feed(ps, { kind: 'commit', text: `${'★'.repeat(e.stars)} ${p.first} ${p.last} commits to ${t.school}${others.length ? ` over ${others.join(' and ')}` : ''}. (${fmtMoney(o.nil)} NIL)`, playerId: p.id, teamId: t.id, big: userWon || e.stars === 5 });
    addNews(state, { kind: 'portal', headline: `${p.first} ${p.last} commits to ${t.school} out of the portal`, body: `The ${p.pos} from ${fromSchool} chose ${t.school}${others.length ? ` over ${others.join(' and ')}` : ''}. NIL deal reportedly worth ${fmtMoney(o.nil)}.`, teams: [t.id], important: userWon, personId: p.id, personKind: 'player' });
  }
  if (userWon) {
    gainXp(state, 15 + Math.max(0, p.ovr - 60) + e.stars * 4);
    state.coaches[state.user.coachId].reputation = clamp(state.coaches[state.user.coachId].reputation + (e.stars >= 4 ? 1 : 0.3), 0, 100);
  }
}

function processDecisions(state: GameState, final: boolean) {
  const ps = state.portal!;
  const uid = state.user.teamId;
  const results: { playerId: string; teamId: string; won: boolean }[] = [];
  let quiet = 0;
  for (const e of visibleEntries(state).sort((a, b) => a.rank - b.rank)) {
    if (e.status !== 'available') continue;
    if (e.decideDay > ps.day && !final) continue;
    const odds = entryOdds(state, e);
    if (!odds.length) {
      if (!final) { e.decideDay = Math.min(ps.maxDays, ps.day + 1); continue; }
      e.status = 'unsigned';
      const p = state.players[e.id];
      if (e.stars >= 3) feed(ps, { kind: 'unsigned', text: `${p.first} ${p.last} never found a home and leaves Division I.`, playerId: e.id });
      p.inPortal = false;
      p.history.push('Went unsigned in the portal');
      delete state.players[e.id];
      continue;
    }
    const r = rng.next();
    let acc = 0;
    let pick = odds[0];
    for (const o of odds) { acc += o.p; if (r <= acc) { pick = o; break; } }
    const offer = e.offers.find((o) => o.teamId === pick.teamId)!;
    const involved = e.offers.some((o) => o.teamId === uid);
    commit(state, e, offer);
    if (involved) results.push({ playerId: e.id, teamId: pick.teamId, won: pick.teamId === uid });
    if (e.stars < 4 && !involved) quiet++;
  }
  if (quiet) feed(ps, { kind: 'commit', text: `+ ${quiet} more portal commitments today.` });
  ps.lastResults = results;
  if (results.length) state.user.moments.push({ kind: 'portalDay', day: ps.day, results: results.slice(0, 8) });
}

function grades(state: GameState) {
  const ps = state.portal!;
  const score: Record<string, { s: number; n: number; best?: PortalEntry }> = {};
  for (const e of Object.values(ps.entries)) {
    const p = state.players[e.id];
    const val = (p ? p.ovr - 50 : 10) + e.stars * 4;
    if (e.status === 'committed' && e.to) {
      const x = (score[e.to] ??= { s: 0, n: 0 });
      x.s += val; x.n++;
      if (!x.best || e.rank < x.best.rank) x.best = e;
    }
    const y = (score[e.from] ??= { s: 0, n: 0 });
    y.s -= val * 0.5;
  }
  const rows = Object.entries(score).map(([teamId, v]) => ({ teamId, score: Math.round(v.s * 10) / 10, count: v.n, best: v.best?.id }));
  rows.sort((a, b) => b.score - a.score);
  const n = rows.length;
  ps.grades = rows.map((r, i) => {
    const pct = i / Math.max(1, n);
    const grade = pct < 0.03 ? 'A+' : pct < 0.1 ? 'A' : pct < 0.2 ? 'A-' : pct < 0.32 ? 'B+' : pct < 0.45 ? 'B' : pct < 0.58 ? 'B-' : pct < 0.7 ? 'C+' : pct < 0.8 ? 'C' : pct < 0.9 ? 'D' : 'F';
    return { ...r, grade };
  });
  const winners = ps.grades.slice(0, 3).map((g) => state.teams[g.teamId].school);
  const mine = ps.grades.find((g) => g.teamId === state.user.teamId);
  addNews(state, { kind: 'portal', headline: `Portal grades are in: ${winners.join(', ')} lead the way`, body: `The window has closed. ${state.teams[state.user.teamId].school} earned ${mine ? `a${/^[AF]/.test(mine.grade) ? 'n' : ''} ${mine.grade} (${mine.count} addition${mine.count === 1 ? '' : 's'})` : 'an incomplete — no portal activity'}.`, teams: ps.grades.slice(0, 3).map((g) => g.teamId), important: true });
  feed(ps, { kind: 'close', text: `🔒 The portal window is closed. Portal champions: ${winners.join(', ')}.`, big: true });
}

/** Advance the portal one day. Returns 'closed' when the window ends. */
export function advancePortalDay(state: GameState): 'open' | 'closed' {
  const ps = state.portal!;
  ps.lastResults = [];
  if (ps.day === 0) {
    finalizeRetention(state);
    ps.day = 1;
  } else {
    const final = ps.day >= ps.maxDays;
    processDecisions(state, final);
    if (final) {
      grades(state);
      return 'closed';
    }
    ps.day++;
  }
  revealDay(state);
  aiDay(state);
  releaseTopLists(state);
  makeCalls(state);
  sortDayFeed(ps);
  ps.hoursMax = portalHoursMax(state);
  ps.hours = ps.hoursMax;
  return 'open';
}

/** Headlines first: today's entries/openings on top, then lists, leaks and visits */
function sortDayFeed(ps: PortalState) {
  const pri: Record<PortalFeedItem['kind'], number> = { open: 0, close: 0, withdraw: 1, enter: 2, top: 3, user: 3, commit: 4, leak: 5, offer: 5, visit: 6, unsigned: 7 };
  const today = ps.feed.filter((f) => f.day === ps.day);
  const rest = ps.feed.filter((f) => f.day !== ps.day);
  today.sort((a, b) => pri[a.kind] - pri[b.kind]);
  ps.feed = [...today, ...rest];
}

export function decidingToday(state: GameState): number {
  const ps = state.portal;
  if (!ps || ps.day === 0) return 0;
  return visibleEntries(state).filter((e) => e.status === 'available' && (e.decideDay <= ps.day || ps.day >= ps.maxDays) && e.offers.some((o) => isUser(state, o.teamId))).length;
}

/** Convert a v1 portal (rounds/pool) save into the new structure */
export function migratePortal(state: GameState): boolean {
  const ps = state.portal;
  if (!ps || ps.entries) return false;
  const entries: Record<string, PortalEntry> = {};
  for (const id of ps.pool ?? []) {
    const p = state.players[id];
    if (!p) continue;
    const e = makeEntry(state, p, ps.from?.[id] ?? '', 1, 'Fresh start', [1, 1]);
    e.ask = ps.asks?.[id] ?? e.ask;
    e.offers = (ps.offers?.[id] ?? []).map((o) => ({ ...o, years: 1, day: 1 }));
    entries[id] = e;
  }
  for (const r of Object.values(state.user.retention ?? {})) { r.reason ??= 'Fresh start'; }
  Object.assign(ps, { day: Math.max(1, ps.round ?? 1), maxDays: PORTAL_DAYS, entries, feed: [], calls: [], hours: 0, hoursMax: 0 });
  rankEntries(state, ps);
  ps.hoursMax = portalHoursMax(state);
  ps.hours = ps.hoursMax;
  return true;
}
