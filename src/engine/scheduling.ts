// Non-conference scheduling: the user builds next season's non-conference slate in the offseason.
import { rng, clamp } from './rng';
import type { GameSite, GameState, MteOption, PlannedGame, SchedulingState, Team } from './types';
import { RIVALRIES } from '../data/rivalries';
import { refreshPower } from './team';
import { powerToPoints } from './rankings';
import { normCdf } from './sim';
import { roundMoney, fmtMoney } from './player';
import { rivalriesOf } from './rivalry';

export const NONCONF_SLOTS = 12;
const HOME_ADJ = 3.2;

const EVENT_POOL: { name: string; location: string; tier: 1 | 2 | 3 | 4 }[] = [
  { name: 'Maui Shootout', location: 'Lahaina, HI', tier: 1 },
  { name: 'Paradise Island Classic', location: 'Nassau, Bahamas', tier: 1 },
  { name: 'Vegas Hardwood Showcase', location: 'Las Vegas, NV', tier: 2 },
  { name: 'Empire Classic', location: 'New York, NY', tier: 2 },
  { name: 'Wooden Legacy Classic', location: 'Anaheim, CA', tier: 2 },
  { name: 'Sunshine Slam', location: 'Orlando, FL', tier: 3 },
  { name: 'Cancún Challenge', location: 'Cancún, Mexico', tier: 3 },
  { name: 'Charleston Invitational', location: 'Charleston, SC', tier: 3 },
  { name: 'Myrtle Beach Showcase', location: 'Myrtle Beach, SC', tier: 4 },
  { name: 'Northern Lights Classic', location: 'Anchorage, AK', tier: 4 },
];
const TIER_PRESTIGE = { 1: 80, 2: 64, 3: 45, 4: 25 } as const;
const TIER_MIN = { 1: 62, 2: 45, 3: 22, 4: 0 } as const;

export const NEUTRAL_SHOWCASES = ['Holiday Hoops Showcase', 'Hall of Fame Series', 'Hardwood Classic', 'Capital City Clash', 'Coast to Coast Challenge', 'Rivals Weekend'];

export function isInSeason(state: GameState) {
  return ['preseason', 'regular', 'confTourney', 'selection', 'ncaa'].includes(state.phase);
}

function user(state: GameState): Team {
  return state.teams[state.user.teamId];
}

/** Rivalry games that cross conferences for the user's team, with site for a given season */
export function userRivalryGames(state: GameState, season: number): PlannedGame[] {
  const me = user(state);
  const out: PlannedGame[] = [];
  for (const rv of RIVALRIES) {
    if (rv.a !== me.id && rv.b !== me.id) continue;
    const a = state.teams[rv.a], b = state.teams[rv.b];
    if (!a || !b || a.conf === b.conf) continue;
    const homeFirst = (season + (a.id < b.id ? 0 : 1)) % 2 === 0;
    const homeId = homeFirst ? a.id : b.id;
    const oppId = me.id === a.id ? b.id : a.id;
    out.push({ oppId, site: homeId === me.id ? 'home' : 'away', guarantee: 0, locked: 'rivalry', event: rv.name });
  }
  // rivalries born in the dynasty keep going while they're hot
  for (const r of rivalriesOf(state, me.id)) {
    if (r.origin !== 'born' || r.heat < 55) continue;
    const oppId = r.a === me.id ? r.b : r.a;
    const opp = state.teams[oppId];
    if (!opp || opp.conf === me.conf || out.some((x) => x.oppId === oppId)) continue;
    const homeFirst = (season + (me.id < oppId ? 0 : 1)) % 2 === 0;
    out.push({ oppId, site: homeFirst ? 'home' : 'away', guarantee: 0, locked: 'rivalry', event: r.name });
  }
  return out;
}

/** Open the scheduling step for next season */
export function openScheduling(state: GameState) {
  state.phase = 'scheduling';
  const next = state.season + 1;
  const prevOblig = state.scheduling?.obligations ?? [];
  // projected strength for next season from current (post-development) rosters
  const teams = Object.values(state.teams);
  for (const t of teams) refreshPower(state, t);
  const mean = teams.reduce((s, t) => s + t.power, 0) / teams.length;
  const proj: Record<string, number> = {};
  for (const t of teams) proj[t.id] = Math.round(powerToPoints(t.power, mean) * 10) / 10;
  const projRank: Record<string, number> = {};
  [...teams].sort((a, b) => proj[b.id] - proj[a.id]).forEach((t, i) => (projRank[t.id] = i + 1));

  const me = user(state);
  const games: PlannedGame[] = [];
  for (const rg of userRivalryGames(state, next)) games.push(rg);
  for (const o of prevOblig.filter((x) => x.season === next)) {
    if (!state.teams[o.oppId] || games.some((x) => x.oppId === o.oppId)) continue;
    games.push({ oppId: o.oppId, site: o.site, guarantee: 0, locked: 'return', event: 'Home-and-home series' });
  }
  state.scheduling = {
    season: next,
    mtes: genEvents(state, games.map((x) => x.oppId)),
    mte: undefined,
    games,
    droppedRivals: [],
    proj,
    projRank,
    obligations: prevOblig.filter((x) => x.season > state.season),
    locked: false,
  };
  void me;
}

function genEvents(state: GameState, exclude: string[]): MteOption[] {
  const me = user(state);
  const used = new Set<string>([me.id, ...exclude]);
  const others = Object.values(state.teams).filter((t) => t.conf !== me.conf);
  const pick = rng.shuffle([...EVENT_POOL]);
  const chosen = [
    ...pick.filter((e) => e.tier <= 2).slice(0, 3),
    ...pick.filter((e) => e.tier >= 3).slice(0, 3),
  ];
  const out: MteOption[] = [];
  for (const e of chosen.sort((a, b) => a.tier - b.tier)) {
    const target = TIER_PRESTIGE[e.tier];
    const field: string[] = [];
    const cands = rng.shuffle(others.filter((t) => !used.has(t.id) && Math.abs(t.prestige - target) < 14));
    for (const t of cands) {
      if (field.length >= 3) break;
      if (field.some((f) => state.teams[f].conf === t.conf)) continue;
      field.push(t.id);
      used.add(t.id);
    }
    if (field.length === 3) out.push({ name: e.name, location: e.location, tier: e.tier, field, minPrestige: TIER_MIN[e.tier] });
  }
  return out;
}

export function slotsUsed(sc: SchedulingState): number {
  return sc.games.length + (sc.mte ? 2 : 0);
}

export function canAttend(state: GameState, ev: MteOption): boolean {
  return user(state).prestige >= ev.minPrestige;
}

export interface OfferStatus { ok: boolean; label: string; guarantee: number; seriesOnly?: boolean }

/** Will this opponent agree to this kind of game? Deterministic so the UI can preview it. */
export function offerStatus(state: GameState, oppId: string, site: GameSite, series: boolean): OfferStatus {
  const me = user(state);
  const opp = state.teams[oppId];
  const sc = state.scheduling;
  if (!opp || opp.id === me.id) return { ok: false, label: 'Unavailable', guarantee: 0 };
  if (opp.conf === me.conf) return { ok: false, label: 'Conference opponent', guarantee: 0 };
  if (sc && (sc.games.some((x) => x.oppId === oppId) || (sc.mte && sc.mtes.find((m) => m.name === sc.mte)?.field.includes(oppId)))) return { ok: false, label: 'Already scheduled', guarantee: 0 };
  const diff = me.prestige - opp.prestige; // + = you're the bigger program
  const g = (host: Team) => roundMoney(55_000 + host.prestige * 800);
  if (series) {
    if (site === 'neutral') return { ok: false, label: 'Series are home-and-home', guarantee: 0 };
    if (Math.abs(diff) <= 25) return { ok: true, label: 'Agrees to a home-and-home', guarantee: 0 };
    return { ok: false, label: diff > 0 ? 'They’d rather take a payday' : 'Won’t commit to a return trip', guarantee: 0 };
  }
  if (site === 'home') {
    const strong = (sc?.projRank[oppId] ?? 999) <= 50 && opp.prestige >= 55;
    if (diff >= 12 && strong) return Math.abs(diff) <= 25 ? { ok: false, label: 'Contender — only as a home-and-home', guarantee: 0, seriesOnly: true } : { ok: false, label: 'Contender — won’t do a one-off road trip', guarantee: 0 };
    if (diff >= 12) return { ok: true, label: `Buy game · you pay ${fmtMoney(g(me))}`, guarantee: -g(me) };
    if (diff > -25) return { ok: false, label: 'Only as a home-and-home', guarantee: 0, seriesOnly: true };
    return { ok: false, label: 'Won’t come to your gym', guarantee: 0 };
  }
  if (site === 'away') {
    if (diff <= -12) return { ok: true, label: `Payday · they pay you ${fmtMoney(g(opp))}`, guarantee: g(opp) };
    if (diff >= 25) return { ok: true, label: 'Thrilled to host you', guarantee: 0 };
    return { ok: true, label: 'Agrees to host', guarantee: 0 };
  }
  if (Math.abs(diff) <= 30) return { ok: true, label: 'Agrees to a neutral-site game', guarantee: 0 };
  return { ok: false, label: 'Mismatch — no neutral site wants it', guarantee: 0 };
}

export function bookGame(state: GameState, oppId: string, site: GameSite, series: boolean): { ok: boolean; msg: string } {
  const sc = state.scheduling;
  if (!sc || sc.locked) return { ok: false, msg: 'Scheduling is closed.' };
  if (slotsUsed(sc) >= NONCONF_SLOTS) return { ok: false, msg: `Your ${NONCONF_SLOTS} non-conference dates are full.` };
  const st = offerStatus(state, oppId, site, series);
  const opp = state.teams[oppId];
  if (!st.ok) return { ok: false, msg: `${opp?.school ?? 'They'}: ${st.label}.` };
  sc.games.push({ oppId, site, series: series || undefined, guarantee: st.guarantee, event: site === 'neutral' ? rng.pick(NEUTRAL_SHOWCASES) : undefined });
  const where = site === 'home' ? 'at home' : site === 'away' ? 'on the road' : 'at a neutral site';
  return { ok: true, msg: `Booked: ${opp.school} ${where}${series ? ' (home-and-home)' : ''}.` };
}

export function removeGame(state: GameState, oppId: string) {
  const sc = state.scheduling;
  if (!sc || sc.locked) return;
  const g = sc.games.find((x) => x.oppId === oppId);
  if (!g || g.locked === 'return') return;
  if (g.locked === 'rivalry') sc.droppedRivals.push(oppId);
  sc.games = sc.games.filter((x) => x.oppId !== oppId);
}

export function restoreRival(state: GameState, oppId: string) {
  const sc = state.scheduling;
  if (!sc || sc.locked || slotsUsed(sc) >= NONCONF_SLOTS) return;
  const rg = userRivalryGames(state, sc.season).find((x) => x.oppId === oppId);
  if (!rg) return;
  sc.droppedRivals = sc.droppedRivals.filter((x) => x !== oppId);
  sc.games.unshift(rg);
}

export function chooseMte(state: GameState, name: string | null): { ok: boolean; msg: string } {
  const sc = state.scheduling;
  if (!sc || sc.locked) return { ok: false, msg: 'Scheduling is closed.' };
  if (name) {
    const ev = sc.mtes.find((m) => m.name === name);
    if (!ev) return { ok: false, msg: 'Event not found.' };
    if (!canAttend(state, ev)) return { ok: false, msg: `${ev.name} is invite-only for bigger programs.` };
    const extra = sc.mte ? 0 : 2;
    if (sc.games.length + extra > NONCONF_SLOTS) return { ok: false, msg: 'Free up two dates first — events are two games.' };
    // drop any booked games vs teams in this field
    sc.games = sc.games.filter((x) => x.locked || !ev.field.includes(x.oppId));
  }
  sc.mte = name;
  return { ok: true, msg: name ? `You're in the ${name}!` : 'Skipping Feast Week events — two more open dates.' };
}

/** Staff fills the remaining dates with a sensible mix */
export function autoFill(state: GameState): number {
  const sc = state.scheduling;
  if (!sc || sc.locked) return 0;
  const me = user(state);
  let added = 0;
  if (sc.mte === undefined) {
    const ok = sc.mtes.filter((m) => canAttend(state, m)).sort((a, b) => Math.abs(TIER_PRESTIGE[a.tier] - me.prestige) - Math.abs(TIER_PRESTIGE[b.tier] - me.prestige));
    if (ok[0] && slotsUsed(sc) + 2 <= NONCONF_SLOTS) sc.mte = ok[0].name;
    else sc.mte = null;
  }
  const hasGM = !!state.staff?.members.some((m) => m.role === 'gm');
  const all = Object.values(state.teams).filter((t) => t.conf !== me.conf && t.id !== me.id);
  const tryBook = (pool: Team[], site: GameSite, series: boolean, n: number) => {
    let k = 0;
    for (const t of rng.shuffle([...pool])) {
      if (k >= n || slotsUsed(sc) >= NONCONF_SLOTS) break;
      if (offerStatus(state, t.id, site, series).ok) {
        bookGame(state, t.id, site, series);
        k++;
        added++;
      }
    }
  };
  const marquee = sc.games.filter((x) => (sc.projRank[x.oppId] ?? 999) <= 40).length;
  // 1-2 marquee games against similar programs (series or neutral), more if a GM is planning
  const peers = all.filter((t) => Math.abs(t.prestige - me.prestige) <= 15 && (sc.projRank[t.id] ?? 999) <= Math.max(60, (sc.projRank[me.id] ?? 100) + 30));
  const wantMarquee = Math.max(0, (hasGM ? 3 : 2) - marquee);
  tryBook(peers, 'neutral', false, Math.ceil(wantMarquee / 2));
  tryBook(peers, rng.chance(0.5) ? 'home' : 'away', true, Math.floor(wantMarquee / 2));
  // smaller schools: home buy games, plus a road payday for lower programs
  if (me.prestige < 45) tryBook(all.filter((t) => t.prestige - me.prestige >= 15), 'away', false, 2);
  const cupcakes = all.filter((t) => me.prestige - t.prestige >= 12 && (hasGM ? (sc.projRank[t.id] ?? 0) < 250 : true));
  tryBook(cupcakes, 'home', false, NONCONF_SLOTS);
  // anything left: road games
  tryBook(all, 'away', false, NONCONF_SLOTS);
  return added;
}

export interface ResumeMetrics {
  games: number;
  avgOpp: number;
  sosPct: number; // 0..100 percentile of opponent strength
  sosLabel: string;
  q1: number; q2: number; q3: number; q4: number;
  expWins: number;
  expLosses: number;
  netGuarantee: number;
  marqueeHome: number;
  hype: number;
  verdict: string;
  verdictTone: 'good' | 'bad' | 'neutral';
}

function quadrant(rank: number, site: GameSite): 1 | 2 | 3 | 4 {
  const [a, b, c] = site === 'home' ? [30, 75, 160] : site === 'neutral' ? [50, 100, 200] : [75, 135, 240];
  return rank <= a ? 1 : rank <= b ? 2 : rank <= c ? 3 : 4;
}

export function resumeMetrics(state: GameState): ResumeMetrics {
  const sc = state.scheduling!;
  const me = user(state);
  const myR = sc.proj[me.id] ?? 0;
  const items: { r: number; rank: number; site: GameSite; weight: number }[] = [];
  for (const g of sc.games) items.push({ r: sc.proj[g.oppId] ?? 0, rank: sc.projRank[g.oppId] ?? 200, site: g.site, weight: 1 });
  const ev = sc.mte ? sc.mtes.find((m) => m.name === sc.mte) : undefined;
  if (ev) for (const f of ev.field) items.push({ r: sc.proj[f] ?? 0, rank: sc.projRank[f] ?? 200, site: 'neutral', weight: 2 / 3 });
  const q = [0, 0, 0, 0, 0];
  let exp = 0, wsum = 0, oppSum = 0;
  for (const it of items) {
    const adj = it.site === 'home' ? HOME_ADJ : it.site === 'away' ? -HOME_ADJ : 0;
    exp += normCdf((myR - it.r + adj) / 11) * it.weight;
    q[quadrant(it.rank, it.site)] += it.weight;
    oppSum += (it.r - adj * 0.5) * it.weight;
    wsum += it.weight;
  }
  const avgOpp = wsum ? oppSum / wsum : 0;
  const all = Object.values(sc.proj).sort((a, b) => a - b);
  const below = all.filter((v) => v < avgOpp).length;
  const sosPct = Math.round((below / Math.max(1, all.length)) * 100);
  const sosLabel = sosPct >= 85 ? 'Brutal' : sosPct >= 70 ? 'Tough' : sosPct >= 50 ? 'Solid' : sosPct >= 28 ? 'Soft' : 'Cupcake';
  const netGuarantee = sc.games.reduce((s, g) => s + g.guarantee, 0);
  const marqueeHome = sc.games.filter((g) => g.site === 'home' && (sc.projRank[g.oppId] ?? 999) <= 25).length;
  const contender = (sc.projRank[me.id] ?? 200) <= 40;
  let hype = Math.min(9, marqueeHome * 3);
  if (sosLabel === 'Cupcake') hype -= 3;
  let verdict: string, tone: ResumeMetrics['verdictTone'] = 'neutral';
  const games = Math.round(wsum);
  if (games < NONCONF_SLOTS) { verdict = `${NONCONF_SLOTS - games} open date${NONCONF_SLOTS - games > 1 ? 's' : ''} — your staff will fill them if you lock now.`; }
  else if (contender && (sosLabel === 'Cupcake' || sosLabel === 'Soft')) { verdict = 'Analysts will call this soft. The committee rewards teams that test themselves.'; tone = 'bad'; }
  else if (contender && q[1] >= 3) { verdict = 'A real gauntlet. Win a couple of these and you’re building a top-seed résumé.'; tone = 'good'; }
  else if (!contender && (sosLabel === 'Brutal')) { verdict = 'Bold. You could take some lumps — but every upset here is a résumé builder.'; tone = 'neutral'; }
  else if (!contender && q[4] >= 6) { verdict = 'Plenty of winnable games. Expect a good record — just not much of a résumé.'; tone = 'neutral'; }
  else { verdict = 'A balanced slate: some marquee chances and plenty of wins on the table.'; tone = 'good'; }
  return { games, avgOpp, sosPct, sosLabel, q1: Math.round(q[1] * 10) / 10, q2: Math.round(q[2] * 10) / 10, q3: Math.round(q[3] * 10) / 10, q4: Math.round(q[4] * 10) / 10, expWins: Math.round(exp * 10) / 10, expLosses: Math.round((wsum - exp) * 10) / 10, netGuarantee, marqueeHome, hype, verdict, verdictTone: tone };
}

/** Lock the plan (auto-filling any open dates). Called before the new season is generated. */
export function lockScheduling(state: GameState): number {
  const sc = state.scheduling;
  if (!sc || sc.locked) return 0;
  const filled = slotsUsed(sc) < NONCONF_SLOTS ? autoFill(state) : 0;
  sc.locked = true;
  // record return games owed next season
  for (const g of sc.games) {
    if (g.series && g.site !== 'neutral') sc.obligations.push({ oppId: g.oppId, site: g.site === 'home' ? 'away' : 'home', season: sc.season + 1 });
  }
  return filled;
}

/** After the new season's budgets/hype are set: money, hype and headlines from the slate */
export function applyScheduleEffects(state: GameState) {
  const sc = state.scheduling;
  if (!sc || sc.season !== state.season || !sc.locked) return;
  const me = user(state);
  const m = resumeMetrics(state);
  me.nilBudget = Math.max(0, me.nilBudget + m.netGuarantee);
  me.hype = clamp(me.hype + m.hype, 5, 100);
  const top = sc.games
    .map((g) => ({ g, rank: sc.projRank[g.oppId] ?? 999 }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 4)
    .map(({ g }) => `${g.site === 'away' ? 'at ' : g.site === 'neutral' ? 'vs ' : ''}${state.teams[g.oppId].school}`);
  state.news.unshift({
    id: `nsched${state.season}`, season: state.season, day: state.day, date: state.calendar[state.day]?.label ?? '',
    kind: 'user', headline: `${me.school} unveils ${m.sosLabel.toLowerCase()} non-conference schedule`,
    body: `${me.school}'s slate features ${top.join(', ')}${sc.mte ? `, plus the ${sc.mte}` : ''}. Projected: ${m.q1} Quad 1 chances, ~${m.expWins}-${m.expLosses} expected record.${m.netGuarantee ? ` Game guarantees: ${m.netGuarantee > 0 ? '+' : ''}${fmtMoney(m.netGuarantee)} to the NIL pool.` : ''}`,
    teams: [me.id], important: true,
  });
}

/** Teams reserved by the user's plan (so the generic Feast Week builder skips them) */
export function reservedTeams(state: GameState): Set<string> {
  const sc = state.scheduling;
  const out = new Set<string>();
  if (!sc || sc.season !== state.season || !sc.locked) return out;
  out.add(state.user.teamId);
  const ev = sc.mte ? sc.mtes.find((m) => m.name === sc.mte) : undefined;
  if (ev) for (const f of ev.field) out.add(f);
  return out;
}
