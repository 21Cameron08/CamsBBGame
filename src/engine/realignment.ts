// Conference realignment. When it's on (a setting chosen with difficulty), each offseason may
// bring a wave of moves: stronger conferences invite programs from the tier below, a power
// program occasionally jumps between power leagues, and conferences that lose members backfill
// from below. Moves are announced when the season ends and take effect next season (before the
// Scheduling Office opens). If your school is invited, you get a say.
import { clamp, rng } from './rng';
import type { ConferenceDef } from '../data/types';
import type { GameState, RealignMode, RealignMove, Team } from './types';
import { addNews } from './media';
import { rivalriesOf, addHeat } from './rivalry';

export const REALIGN_INFO: Record<RealignMode, { label: string; desc: string }> = {
  off: { label: 'Off', desc: 'Conferences stay exactly as they are.' },
  realistic: { label: 'Realistic', desc: 'Every few years, a wave: leagues raid the tier below, and the leftovers backfill.' },
  chaos: { label: 'Chaos', desc: 'Superconferences, power programs jumping ship, and a shake-up almost every year.' },
};

const MAX: Record<number, number> = { 1: 18, 2: 14, 3: 14, 4: 12 };
const MAX_CHAOS: Record<number, number> = { 1: 20, 2: 16, 3: 14, 4: 12 };
const MIN: Record<number, number> = { 1: 10, 2: 9, 3: 8, 4: 7 };
const PRESTIGE_FOR: Record<number, number> = { 1: 55, 2: 40, 3: 25, 4: 0 };
/** leagues that don't play the realignment game (academic or HBCU identity) */
const LOCKED = new Set(['ivy', 'swac', 'meac']);
/** how far a conference will reach for a new member (degrees, roughly 70 miles each) */
const REACH: Record<number, number> = { 1: 24, 2: 16, 3: 12, 4: 10 };

export function realignMode(state: GameState): RealignMode { return state.settings.realignment ?? 'off'; }
function book(state: GameState) { return (state.realign ??= { moves: [] }); }
export function pendingMoves(state: GameState) { return (state.realign?.moves ?? []).filter((m) => m.status === 'pending'); }
export function recentMoves(state: GameState, seasons = 3) { return (state.realign?.moves ?? []).filter((m) => m.status === 'done' && m.effective > state.season - seasons).sort((a, b) => b.effective - a.effective); }
/** a team that joined its conference this season */
export function newcomer(state: GameState, teamId: string) {
  return (state.realign?.moves ?? []).some((m) => m.teamId === teamId && m.status === 'done' && m.effective === state.season);
}

interface ConfInfo { c: ConferenceDef; members: Team[]; size: number; lat: number; lng: number; prestige: number }

function info(state: GameState, membership: Record<string, string>): Map<string, ConfInfo> {
  const out = new Map<string, ConfInfo>();
  for (const c of state.conferences) out.set(c.id, { c, members: [], size: 0, lat: 0, lng: 0, prestige: 0 });
  for (const t of Object.values(state.teams)) {
    const ci = out.get(membership[t.id]);
    if (!ci) continue;
    ci.members.push(t);
  }
  for (const ci of out.values()) {
    ci.size = ci.members.length;
    if (!ci.size) continue;
    ci.lat = ci.members.reduce((s, t) => s + t.lat, 0) / ci.size;
    ci.lng = ci.members.reduce((s, t) => s + t.lng, 0) / ci.size;
    ci.prestige = ci.members.reduce((s, t) => s + t.prestige, 0) / ci.size;
  }
  return out;
}
const dist = (t: Team, ci: ConfInfo) => Math.hypot(t.lat - ci.lat, (t.lng - ci.lng) * 0.8);
function recentForm(t: Team) {
  const h = t.history.slice(-3);
  return h.length ? h.reduce((s, x) => s + x.rating, 0) / h.length : t.rating;
}
/** how much a conference wants a team (higher is better) */
function appeal(t: Team, ci: ConfInfo) {
  return t.prestige + recentForm(t) * 1.5 + t.market * 2 - dist(t, ci) * 2.2 + rng.normal(0, 4);
}

/**
 * End of season: maybe announce a realignment wave. Moves take effect next season.
 */
export function planRealignment(state: GameState) {
  const mode = realignMode(state);
  if (mode === 'off') return;
  const B = book(state);
  if (pendingMoves(state).length) return;
  if (!rng.chance(mode === 'chaos' ? 0.85 : 0.4)) return;
  const max = mode === 'chaos' ? MAX_CHAOS : MAX;
  const membership: Record<string, string> = {};
  for (const t of Object.values(state.teams)) membership[t.id] = t.conf;
  const moving = new Set<string>();
  const moves: RealignMove[] = [];
  const effective = state.season + 1;
  const move = (t: Team, to: string, kind: RealignMove['kind'], reason: string) => {
    const from = membership[t.id];
    moves.push({ id: rng.id('rl'), teamId: t.id, from, to, season: state.season, effective, kind, reason, status: 'pending', userChoice: t.id === state.user.teamId || undefined });
    membership[t.id] = to;
    moving.add(t.id);
  };

  // 1. raids: a conference invites a program from the tier below (in chaos, sometimes from its own tier)
  const raids = mode === 'chaos' ? rng.int(2, 5) : rng.chance(0.3) ? 2 : 1;
  for (let i = 0; i < raids; i++) {
    const ci = info(state, membership);
    const raiders = [...ci.values()].filter((x) => x.size > 0 && x.size < max[x.c.tier] && x.c.tier <= 3 && !LOCKED.has(x.c.id));
    if (!raiders.length) break;
    const raider = rng.weighted(raiders, raiders.map((x) => [0, 5, 3, 1.5, 0][x.c.tier] ?? 1));
    const lateral = raider.c.tier === 1 && rng.chance(mode === 'chaos' ? 0.45 : 0.15);
    const fromTier = lateral ? raider.c.tier : raider.c.tier + 1;
    const pool = Object.values(state.teams).filter((t) => {
      if (moving.has(t.id) || membership[t.id] === raider.c.id) return false;
      const own = ci.get(membership[t.id]);
      if (!own || own.c.tier !== fromTier || LOCKED.has(own.c.id) || own.size - 1 < MIN[own.c.tier] - (mode === 'chaos' ? 1 : 0)) return false;
      if (dist(t, raider) > REACH[raider.c.tier] * (mode === 'chaos' ? 1.25 : 1)) return false;
      if (t.prestige < PRESTIGE_FOR[raider.c.tier]) return false;
      // lateral moves only make sense for a better, closer league
      if (lateral && !(raider.prestige > own.prestige + 2 && dist(t, raider) < dist(t, own))) return false;
      return true;
    });
    if (!pool.length) continue;
    const pick = pool.map((t) => ({ t, a: appeal(t, raider) })).sort((x, y) => y.a - x.a).slice(0, 3);
    const chosen = rng.weighted(pick, pick.map((_, k) => [5, 3, 2][k])).t;
    const fromName = state.conferences.find((c) => c.id === membership[chosen.id])?.short ?? '';
    move(chosen, raider.c.id, lateral ? 'lateral' : 'up', lateral
      ? `${raider.c.short} poaches ${chosen.school} from the ${fromName}: more money, a better footprint.`
      : `${raider.c.short} adds ${chosen.school} from the ${fromName} to grow its brand.`);
  }

  // 2. backfill: any league that fell below its minimum adds the best fit from below (can cascade)
  for (let pass = 0; pass < 4; pass++) {
    const ci = info(state, membership);
    const short = [...ci.values()].filter((x) => x.size > 0 && x.size < MIN[x.c.tier] && x.c.tier <= 3 && !LOCKED.has(x.c.id));
    if (!short.length) break;
    for (const x of short) {
      const need = MIN[x.c.tier] - x.size;
      for (let k = 0; k < need; k++) {
        const below = Object.values(state.teams).filter((t) => {
          const own = ci.get(membership[t.id]);
          return !moving.has(t.id) && own?.c.tier === x.c.tier + 1 && !LOCKED.has(own.c.id) && own.size - 1 >= MIN[own.c.tier] - 1 && dist(t, x) <= REACH[x.c.tier] * 1.4;
        });
        const qualified = below.filter((t) => t.prestige >= PRESTIGE_FOR[x.c.tier] - 5);
        const pool = qualified.length ? qualified : below;
        if (!pool.length) break;
        const best = pool.map((t) => ({ t, a: appeal(t, x) })).sort((p, q) => q.a - p.a)[0].t;
        move(best, x.c.id, 'backfill', `The ${x.c.short} backfills after losing members, adding ${best.school}.`);
      }
    }
  }
  if (!moves.length) return;
  B.moves.push(...moves);
  announce(state, moves);
}

function announce(state: GameState, moves: RealignMove[]) {
  const conf = (id: string) => state.conferences.find((c) => c.id === id);
  const uid = state.user.teamId;
  const userConf = state.teams[uid].conf;
  for (const m of moves) {
    const t = state.teams[m.teamId];
    if (m.userChoice) continue;
    addNews(state, {
      kind: 'feature',
      headline: `BREAKING: ${t.school} is leaving the ${conf(m.from)?.short} for the ${conf(m.to)?.short}`,
      body: `${m.reason} The move takes effect in ${m.effective}-${String((m.effective + 1) % 100).padStart(2, '0')}.`,
      teams: [m.teamId], important: m.from === userConf || m.to === userConf,
    });
  }
  addNews(state, { kind: 'feature', headline: `Realignment: ${moves.length} school${moves.length > 1 ? 's' : ''} on the move`, body: moves.map((m) => `${state.teams[m.teamId].school}: ${conf(m.from)?.short} → ${conf(m.to)?.short}`).join('; ') + '.', teams: moves.map((m) => m.teamId).slice(0, 5) });

  // your school is invited: you get a say
  const mine = moves.find((m) => m.userChoice);
  if (mine) {
    const to = conf(mine.to)!, from = conf(mine.from)!;
    const up = to.tier < from.tier, side = to.tier === from.tier;
    state.inbox.unshift({
      id: `realign-${mine.id}`, day: state.day, season: state.season, from: 'Athletic Director', fromRole: 'Administration', resolved: false, priority: true,
      subject: `The ${to.short} wants ${state.teams[uid].school}`,
      body: `We've received a formal invitation to join the ${to.name}, starting next season. ${up ? `It's a step up: bigger TV money, a bigger NIL pool, tougher games every night.` : side ? `It's a lateral move, but the money and the footprint are better.` : `It's a different neighborhood, and the travel will be brutal.`} The board will follow your lead. If you don't weigh in before we build next year's schedule, I'm accepting.`,
      choices: [
        { label: `Accept: we're joining the ${to.short}`, hint: up ? 'Bigger NIL pool and prestige, tougher conference' : 'New conference next season', effects: [{ kind: 'hype', delta: 6 }], realign: { moveId: mine.id, accept: true }, result: `It's done: ${state.teams[uid].school} joins the ${to.short} next season.` },
        { label: `Decline: we're staying in the ${from.short}`, hint: 'Loyalty pleases the old guard', effects: [{ kind: 'mediaRep', delta: 3 }, { kind: 'security', delta: 2 }], realign: { moveId: mine.id, accept: false }, result: `${state.teams[uid].school} is staying in the ${from.short}.` },
      ],
    });
    addNews(state, { kind: 'user', headline: `Report: the ${to.short} has invited ${state.teams[uid].school}`, body: `Sources say ${state.teams[uid].school} has an offer to join the ${to.name}. A decision is expected before the summer.`, teams: [uid], important: true });
  }
}

/** The user answers the invitation */
export function answerInvitation(state: GameState, moveId: string, accept: boolean) {
  const m = state.realign?.moves.find((x) => x.id === moveId);
  if (!m || m.status !== 'pending') return;
  if (!accept) m.status = 'declined';
  else m.userChoice = false;
}

/** Before the Scheduling Office opens: make the announced moves official */
export function applyRealignment(state: GameState) {
  const due = pendingMoves(state).filter((m) => m.effective <= state.season + 1);
  if (!due.length) return;
  const conf = (id: string) => state.conferences.find((c) => c.id === id);
  const uid = state.user.teamId;
  for (const m of due) {
    // an unanswered invitation: the AD accepts
    const item = state.inbox.find((i) => i.id === `realign-${m.id}` && !i.resolved);
    if (item) { item.resolved = true; item.chosen = 0; }
    const t = state.teams[m.teamId];
    if (!t) { m.status = 'declined'; continue; }
    const from = conf(m.from), to = conf(m.to);
    if (!from || !to) { m.status = 'declined'; continue; }
    // old conference rivals don't take it well
    for (const r of rivalriesOf(state, t.id)) {
      const other = r.a === t.id ? r.b : r.a;
      if (state.teams[other]?.conf === m.from) addHeat(state, t.id, other, 8, { kind: 'game', text: `${t.school} left the ${from.short}, and its old rivals took it personally.` });
    }
    t.conf = m.to;
    t.prestige = clamp(t.prestige + (to.tier < from.tier ? 3 : to.tier > from.tier ? -3 : 1), 1, 99);
    if (to.tier < from.tier) t.hype = clamp(t.hype + 6, 0, 100);
    m.status = 'done';
    if (t.id === uid) state.user.moments.push({ kind: 'conference', teamId: uid, from: m.from, to: m.to });
  }
  const done = due.filter((m) => m.status === 'done');
  if (done.length) addNews(state, { kind: 'feature', headline: `It's official: realignment takes effect`, body: done.map((m) => `${state.teams[m.teamId].school} is now in the ${conf(m.to)?.short}`).join('; ') + '.', teams: done.map((m) => m.teamId).slice(0, 5), important: done.some((m) => m.teamId === uid || state.teams[uid].conf === m.to || m.from === state.teams[uid].conf) });
}

export function moveLine(state: GameState, m: RealignMove) {
  const c = (id: string) => state.conferences.find((x) => x.id === id)?.short ?? id;
  return `${state.teams[m.teamId]?.school}: ${c(m.from)} → ${c(m.to)}`;
}
