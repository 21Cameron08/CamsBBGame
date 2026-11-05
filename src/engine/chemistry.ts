// Locker room & chemistry: every team has a chemistry rating built from its captains, leaders,
// roles, continuity, mood and results. It nudges game play a little (a small edge in every
// rating and in the clutch), player morale and who enters the portal. Your team also gets
// captains to name, promises to keep and locker-room dilemmas to handle.
import { clamp, rng } from './rng';
import type { GameState, InboxChoice, InboxItem, LockerAction, LockerEntry, LockerGroup, LockerState, Player, ScheduledGame, Team } from './types';
import { teamPlayers } from './team';
import { addNews } from './media';
import { depthChart } from './sim';
import { staffEffects } from './staff';
import { asTeam, forEachHuman, isHuman } from './league';

export const CHEM_NEUTRAL = 60;
const BOOST_CAP = 15;

// ---------------- labels & small helpers ----------------
export function chemLabel(c: number): { label: string; tone: 'good' | '' | 'gold' | 'bad'; icon: string; desc: string } {
  if (c >= 82) return { label: 'Brotherhood', tone: 'good', icon: '🔥', desc: 'They would run through a wall for each other.' };
  if (c >= 68) return { label: 'Tight', tone: 'good', icon: '🤝', desc: 'A close group that plays for each other.' };
  if (c >= 54) return { label: 'Solid', tone: '', icon: '🙂', desc: 'No problems you can see from the outside.' };
  if (c >= 40) return { label: 'Shaky', tone: 'gold', icon: '😬', desc: 'A few cracks. Losing streaks will find them.' };
  if (c >= 26) return { label: 'Fractured', tone: 'bad', icon: '💔', desc: 'Cliques, sulking and finger-pointing.' };
  return { label: 'Toxic', tone: 'bad', icon: '☠️', desc: 'The locker room has turned on itself.' };
}

/** what chemistry does in games, from -1 to +1 */
export function chemEdge(chem: number | undefined) { return clamp(((chem ?? CHEM_NEUTRAL) - CHEM_NEUTRAL) / 32, -1, 1); }
/** the edge in plain numbers, for the UI */
export function chemImpact(chem: number | undefined) {
  const e = chemEdge(chem);
  return { ratings: Math.round(e * 0.9 * 10) / 10, clutch: Math.round(e * 2 * 10) / 10, portal: Math.round((portalChemMul(chem) - 1) * 100) };
}

export function lockerGroup(p: Player, teamId: string): LockerGroup {
  if (p.career.some((c) => c.teamId === teamId)) return 'returner';
  if (p.history.some((h) => h.startsWith('Transferred') && h.includes(' to '))) return 'transfer';
  // anyone past his freshman year who didn't transfer in was already here (redshirts, and
  // everyone on the roster when the dynasty began)
  return p.cls === 'FR' ? 'freshman' : 'returner';
}
export const GROUP_INFO: Record<LockerGroup, { label: string; icon: string }> = {
  returner: { label: 'Returners', icon: '🏠' },
  transfer: { label: 'Transfers', icon: '🔁' },
  freshman: { label: 'Newcomers', icon: '🌱' },
};

/** the role a player expects (rank = his place on the roster by overall, redshirts excluded) */
export function roleOf(p: Player, rank: number): { role: string; min: number } {
  if (p.redshirting) return { role: 'Redshirt', min: 0 };
  if (p.promise === 'star') return { role: 'Star', min: 30 };
  if (p.promise === 'starter' || rank < 5) return { role: 'Starter', min: 24 };
  if (rank < 8) return { role: 'Rotation', min: 12 };
  if (rank < 10) return { role: 'Spot minutes', min: 5 };
  return { role: 'Bench', min: 0 };
}
const mpgOf = (p: Player) => (p.stats.gp ? p.stats.min / p.stats.gp : 0);
const isSenior = (p: Player) => (p.cls === 'SR' || p.cls === 'GR') && p.elig <= 1;
const posGroup = (p: Player) => (p.pos === 'PG' || p.pos === 'SG' ? 'g' : p.pos === 'SF' ? 'w' : 'b');
const name = (p: Player) => `${p.first} ${p.last}`;

// ---------------- captains ----------------
export function captainScore(p: Player, teamId: string): number {
  const t = p.traits;
  let s = 0;
  if (t.includes('leader')) s += 3;
  if (t.includes('coachable')) s += 1;
  if (t.includes('glue')) s += 1;
  if (t.includes('loyal')) s += 0.5;
  if (t.includes('scholar')) s += 0.3;
  if (t.includes('diva')) s -= 2.5;
  if (t.includes('hothead')) s -= 2;
  if (t.includes('mercenary')) s -= 0.7;
  s += ({ FR: -1.5, SO: -0.3, JR: 0.8, SR: 1.8, GR: 1.5 } as const)[p.cls];
  s += Math.min(2, p.career.filter((c) => c.teamId === teamId).length * 0.6);
  s += (p.morale - 60) / 25;
  s += (p.ovr - 62) / 14;
  return Math.round(s * 10) / 10;
}
export function captainGrade(score: number): { label: string; tone: 'good' | '' | 'gold' | 'bad' } {
  if (score >= 5.5) return { label: 'Natural leader', tone: 'good' };
  if (score >= 3.5) return { label: 'Respected voice', tone: 'good' };
  if (score >= 1.5) return { label: 'Solid choice', tone: '' };
  if (score >= 0) return { label: 'Unproven', tone: 'gold' };
  return { label: 'Wrong guy', tone: 'bad' };
}
export function autoCaptains(state: GameState, team: Team): Player[] {
  return teamPlayers(state, team.id).filter((p) => !p.redshirting)
    .sort((a, b) => captainScore(b, team.id) - captainScore(a, team.id)).slice(0, 2);
}
export function captainsOf(state: GameState, team: Team): Player[] {
  if (team.id !== state.user.teamId) return isHuman(state, team.id) ? asTeam(state, team.id, () => captainsOf(state, team)) : autoCaptains(state, team);
  const L = state.locker;
  if (!L || L.teamId !== team.id) return [];
  return L.captains.map((id) => state.players[id]).filter((p): p is Player => !!p && p.teamId === team.id);
}

// ---------------- the locker room (your team) ----------------
export function locker(state: GameState): LockerState {
  const uid = state.user.teamId;
  let L = state.locker;
  if (!L || L.teamId !== uid) {
    L = state.locker = { teamId: uid, season: state.season, trend: [], captains: [], boost: 0, log: [], doorOpen: [], promised: {}, pastCaptains: L?.pastCaptains ?? [] };
  }
  if (L.season !== state.season) {
    const names = L.captains.map((id) => state.players[id]).filter(Boolean).map((p) => name(p));
    if (names.length && !L.pastCaptains.some((x) => x.season === L!.season && x.teamId === L!.teamId)) L.pastCaptains.unshift({ season: L.season, teamId: L.teamId, names });
    L.pastCaptains = L.pastCaptains.slice(0, 30);
    Object.assign(L, { season: state.season, trend: [], captains: [], captainsBy: undefined, boost: 0, doorOpen: [], promised: {}, lastEventWeek: undefined, lastMeetingWeek: undefined, askedCaptains: undefined, cool: {} });
  }
  return L;
}
export function lockerLog(state: GameState, icon: string, text: string, delta?: number, playerId?: string) {
  const L = locker(state);
  const e: LockerEntry = { season: state.season, day: state.day, icon, text };
  if (delta) e.delta = Math.round(delta * 10) / 10;
  if (playerId) e.playerId = playerId;
  L.log = [e, ...L.log].slice(0, 60);
}
function bump(state: GameState, delta: number) {
  const L = locker(state);
  L.boost = clamp(L.boost + delta, -BOOST_CAP, BOOST_CAP);
  const t = state.teams[state.user.teamId];
  t.chem = Math.round(clamp((t.chem ?? CHEM_NEUTRAL) + delta * 0.6, 0, 100) * 10) / 10;
}

// ---------------- chemistry ----------------
export interface ChemFactor { key: string; label: string; value: number }
type Recent = Record<string, boolean[]>;
/** each team's last n results, newest first */
function recentByTeam(state: GameState, n: number): Recent {
  const out: Recent = {};
  const played = state.schedule.filter((g) => g.played && g.type !== 'exh').sort((a, b) => b.day - a.day);
  for (const g of played) {
    const hw = (g.hs ?? 0) > (g.as ?? 0);
    for (const [id, won] of [[g.home, hw], [g.away, !hw]] as const) {
      const a = (out[id] ??= []);
      if (a.length < n) a.push(won);
    }
  }
  return out;
}

export function chemFactors(state: GameState, team: Team, recent?: Recent): { target: number; factors: ChemFactor[] } {
  const isUser = team.id === state.user.teamId;
  const ps = teamPlayers(state, team.id).filter((p) => !p.redshirting);
  const F: ChemFactor[] = [];
  const add = (key: string, label: string, v: number) => { if (Math.abs(v) >= 0.05) F.push({ key, label, value: Math.round(v * 10) / 10 }); };
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  if (!ps.length) return { target: CHEM_NEUTRAL, factors: [] };
  // captains
  const caps = captainsOf(state, team);
  if (caps.length) add('captains', `Captains: ${caps.map((p) => p.last).join(' & ')}`, caps.reduce((s, p) => s + clamp((captainScore(p, team.id) - 2) * 1.4, -4, 5), 0));
  else if (isUser) add('captains', 'No captains named', -3);
  // leaders, glue guys, divas, hotheads
  const leaders = ps.filter((p) => p.traits.includes('leader') && !caps.includes(p)).length;
  add('leaders', `${plural(leaders, 'other leader')} in the room`, Math.min(3, leaders * 1.5));
  const glue = ps.filter((p) => p.traits.includes('glue')).length;
  add('glue', plural(glue, 'glue guy'), Math.min(4.5, glue * 1.5));
  const divas = ps.filter((p) => p.traits.includes('diva'));
  const sour = divas.filter((p) => p.morale < 50).length;
  add('divas', sour ? `${plural(divas.length, 'diva')}, ${sour} unhappy` : plural(divas.length, 'diva'), divas.reduce((s, p) => s + (p.morale < 50 ? -3.5 : -1), 0));
  const hot = ps.filter((p) => p.traits.includes('hothead')).length;
  add('hotheads', plural(hot, 'hothead'), -hot);
  // mood
  const avg = ps.reduce((s, p) => s + p.morale, 0) / ps.length;
  add('mood', `Team mood (${Math.round(avg)})`, (avg - 65) * 0.3);
  const unhappy = ps.filter((p) => p.morale < 40).length;
  add('unhappy', `${plural(unhappy, 'unhappy player')}`, -2.5 * unhappy);
  // roles: anyone well short of the minutes he expected
  const sorted = [...ps].sort((a, b) => b.ovr - a.ovr);
  const frustrated = sorted.filter((p, i) => p.stats.gp >= 3 && mpgOf(p) + 6 < roleOf(p, i).min).length;
  add('roles', `${frustrated} unhappy with ${frustrated === 1 ? 'his' : 'their'} role`, -Math.min(6, frustrated * 1.5));
  // continuity
  const top = sorted.slice(0, 8);
  const ret = top.filter((p) => lockerGroup(p, team.id) === 'returner').length / Math.max(1, top.length);
  add('continuity', `${Math.round(ret * 100)}% of the rotation is back`, ret * 12 - 6);
  const transfers = ps.filter((p) => lockerGroup(p, team.id) === 'transfer').length;
  if (transfers > 3) add('transfers', `${transfers} transfers still learning each other`, -(transfers - 3) * 1.5);
  // winning
  const res = (recent ?? recentByTeam(state, 6))[team.id] ?? [];
  if (res.length) {
    const w = res.filter(Boolean).length;
    add('winning', `Last ${res.length} games: ${w}-${res.length - w}`, (w - (res.length - w)) * 1.0);
  }
  // the head coach (and your staff)
  const coach = state.coaches[team.coachId];
  let mot = coach ? coach.skills.motivation : 5;
  if (isUser && state.staff) mot += staffEffects(state).motivation;
  add('coach', 'Coach’s motivation', (mot - 5) * 0.8);
  // what you've done in the locker room
  if (isUser && state.locker?.teamId === team.id) add('moments', 'Locker-room moments', state.locker.boost);
  const sum = F.reduce((s, f) => s + f.value, 0);
  return { target: Math.round(clamp(52 + sum, 8, 96) * 10) / 10, factors: F.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)) };
}

/** weekly: every team's chemistry moves toward its target; morale follows chemistry a little */
export function chemistryWeek(state: GameState, week: number) {
  const recent = recentByTeam(state, 6);
  for (const t of Object.values(state.teams)) {
    const { target } = isHuman(state, t.id) ? asTeam(state, t.id, () => chemFactors(state, t, recent)) : chemFactors(state, t, recent);
    t.chem = t.chem == null ? target : Math.round((t.chem + (target - t.chem) * 0.3) * 10) / 10;
  }
  for (const p of Object.values(state.players)) {
    if (!p.teamId) continue;
    const c = state.teams[p.teamId]?.chem ?? CHEM_NEUTRAL;
    p.morale = clamp(p.morale + (c - CHEM_NEUTRAL) * 0.03, 0, 100);
  }
}

/** weekly, for the current coach: his captains, promises, dilemmas and the chemistry trend */
export function lockerTick(state: GameState, week: number) {
  if (!['preseason', 'regular', 'confTourney', 'selection', 'ncaa'].includes(state.phase)) return;
  const L = locker(state);
  L.boost = Math.round(L.boost * 0.85 * 10) / 10;
  lockerWeek(state, L, week);
  L.trend.push(state.teams[state.user.teamId].chem ?? CHEM_NEUTRAL);
  if (L.trend.length > 30) L.trend = L.trend.slice(-30);
}

/** end of the season: remember the captains, and every team's final chemistry */
export function chemistrySeasonEnd(state: GameState) {
  for (const t of Object.values(state.teams)) {
    const h = t.history[t.history.length - 1];
    if (h && h.season === state.season && t.chem != null) h.chem = Math.round(t.chem);
  }
  forEachHuman(state, () => rememberCaptains(state));
}
function rememberCaptains(state: GameState) {
  const L = state.locker;
  if (!L || L.teamId !== state.user.teamId || L.season !== state.season) return;
  const names = L.captains.map((id) => state.players[id]).filter(Boolean).map((p) => name(p));
  if (names.length && !L.pastCaptains.some((x) => x.season === L.season && x.teamId === L.teamId)) L.pastCaptains.unshift({ season: L.season, teamId: L.teamId, names });
}

/** a fresh season: chemistry starts from scratch (continuity matters most now) */
export function chemistryNewSeason(state: GameState) {
  for (const t of Object.values(state.teams)) t.chem = (isHuman(state, t.id) ? asTeam(state, t.id, () => chemFactors(state, t, {})) : chemFactors(state, t, {})).target;
  forEachHuman(state, () => {
    const L = locker(state);
    L.trend = [state.teams[state.user.teamId].chem ?? CHEM_NEUTRAL];
    captainsInbox(state, L);
  });
}

/** in games: chemistry is a small edge in every rating and in the clutch */
export function portalChemMul(chem: number | undefined) { return clamp(1 + (CHEM_NEUTRAL - (chem ?? CHEM_NEUTRAL)) * 0.012, 0.8, 1.4); }

// ---------------- captains: naming them ----------------
function captainsInbox(state: GameState, L: LockerState) {
  if (L.captains.length || L.askedCaptains === state.season) return;
  const team = state.teams[state.user.teamId];
  const best = autoCaptains(state, team);
  if (!best.length) return;
  L.askedCaptains = state.season;
  const desc = best.map((p) => `${name(p)} (${p.cls}, ${captainGrade(captainScore(p, team.id)).label.toLowerCase()})`).join(' and ');
  state.inbox.unshift(item(state, {
    subject: 'Who wears the C this year?',
    body: `Every team needs a voice in the huddle. The staff likes ${desc}. Good captains steady the locker room when the season gets hard; the wrong pick can split it. If you don't choose before the games start, the staff will.`,
    choices: [
      { label: `Name ${best.map((p) => p.last).join(' and ')}`, hint: 'The staff’s picks', effects: [], locker: { kind: 'captains', ids: best.map((p) => p.id) }, result: `${best.map((p) => p.last).join(' and ')} will wear the C.` },
      { label: 'I’ll pick them myself', hint: 'Opens the Locker Room', effects: [], goto: 'locker', result: 'Head to the Locker Room to name your captains.' },
    ],
    priority: true,
  }));
}

export function nameCaptains(state: GameState, ids: string[]): { ok: boolean; msg: string } {
  const L = locker(state);
  const team = state.teams[state.user.teamId];
  const pick = [...new Set(ids)].filter((id) => state.players[id]?.teamId === team.id).slice(0, 2);
  if (!pick.length) return { ok: false, msg: 'Pick at least one captain.' };
  const removed = L.captains.filter((id) => !pick.includes(id));
  const added = pick.filter((id) => !L.captains.includes(id));
  if (!added.length && !removed.length) return { ok: false, msg: 'Those are already your captains.' };
  const midSeason = team.record.w + team.record.l > 0;
  const first = !L.captains.length;
  for (const id of removed) {
    const p = state.players[id];
    if (!p) continue;
    p.morale = clamp(p.morale - (midSeason ? 15 : 5), 0, 100);
    if (midSeason) { bump(state, -4); lockerLog(state, '💔', `Stripped ${name(p)} of the captaincy`, -4, p.id); }
  }
  for (const id of added) state.players[id].morale = clamp(state.players[id].morale + 6, 0, 100);
  if (first) {
    // seniors passed over for an underclassman notice
    const young = pick.some((id) => ['FR', 'SO'].includes(state.players[id].cls));
    if (young) for (const p of teamPlayers(state, team.id)) if (!pick.includes(p.id) && isSenior(p) && lockerGroup(p, team.id) === 'returner') p.morale = clamp(p.morale - 4, 0, 100);
  }
  L.captains = pick;
  L.captainsBy = 'you';
  const names = pick.map((id) => name(state.players[id])).join(' and ');
  lockerLog(state, '©️', `Named ${names} captain${pick.length > 1 ? 's' : ''}`);
  return { ok: true, msg: `${names} will wear the C.` };
}

// ---------------- locker-room decisions ----------------
export function resolveLocker(state: GameState, a: LockerAction) {
  const L = locker(state);
  const team = state.teams[state.user.teamId];
  switch (a.kind) {
    case 'captains': nameCaptains(state, a.ids); break;
    case 'promise': { const p = state.players[a.playerId]; if (p) L.promised[p.id] = { day: state.day, min: p.stats.min, gp: p.stats.gp }; break; }
    case 'door': if (!L.doorOpen.includes(a.playerId)) L.doorOpen.push(a.playerId); break;
    case 'strip': L.captains = L.captains.filter((id) => id !== a.playerId); break;
    case 'start': {
      const st = team.strategy.starters;
      const i = st.indexOf(a.benchId);
      if (st.length === 5 && i >= 0 && !st.includes(a.playerId)) st[i] = a.playerId;
      break;
    }
  }
}
/** after any locker-room inbox decision: write it in the log */
export function logDecision(state: GameState, it: InboxItem, ch: InboxChoice) {
  const delta = ch.effects.reduce((s, e) => s + (e.kind === 'chem' ? e.delta : 0), 0);
  lockerLog(state, ch.locker?.kind === 'captains' ? '©️' : '🗝️', `${it.subject}: ${ch.label.replace(/\.$/, '')}`, delta, it.personId);
}

let seq = 0;
function item(state: GameState, o: { subject: string; body: string; choices: InboxChoice[]; personId?: string; from?: string; priority?: boolean }): InboxItem {
  return { id: `lk${state.season}${state.day}${(seq++).toString(36)}`, day: state.day, season: state.season, resolved: false, from: o.from ?? 'Your staff', fromRole: 'Locker Room', subject: o.subject, body: o.body, choices: o.choices, personId: o.personId, personKind: o.personId ? 'player' : undefined, priority: o.priority };
}

type Gen = { w: number; gen: (state: GameState, L: LockerState, team: Team, week: number) => InboxItem | null };
const GENS: Gen[] = [
  // a player wants more minutes
  { w: 4, gen: (s, L, team) => {
    const ps = teamPlayers(s, team.id).filter((p) => !p.redshirting).sort((a, b) => b.ovr - a.ovr);
    const c = ps.map((p, i) => ({ p, r: roleOf(p, i) })).filter(({ p, r }) => p.stats.gp >= 4 && mpgOf(p) + 5 < r.min && p.morale < 62 && !L.promised[p.id] && !L.doorOpen.includes(p.id));
    if (!c.length) return null;
    const { p, r } = rng.weighted(c, c.map((x) => (x.p.traits.includes('diva') ? 3 : 1)));
    const quote = rng.pick([`I came here to play, Coach. I'm not getting a chance.`, `Tell me what I have to do. I'll do it. I just need minutes.`, `My family keeps asking why I'm not playing. I don't have an answer.`, `I know I can help this team. Let me prove it.`]);
    const coachable = p.traits.includes('coachable');
    return item(s, {
      subject: `${name(p)} wants a bigger role`, personId: p.id,
      body: `${p.last} expected ${r.role.toLowerCase()} minutes (about ${r.min} a game) and he's averaging ${mpgOf(p).toFixed(1)}. He asked to meet. "${quote}"`,
      choices: [
        { label: 'Tell him to earn it in practice', hint: coachable ? 'He’s coachable; he’ll respond' : 'He won’t love it', effects: [{ kind: 'morale', target: p.id, delta: coachable ? 2 : -5 }, { kind: 'chem', delta: 1 }], result: coachable ? `"Yes sir." He was first in the gym the next morning.` : `He nodded, but he's not happy.` },
        { label: 'Promise him a bigger role', hint: 'He’s thrilled. Keep your word in the next few games.', effects: [{ kind: 'morale', target: p.id, delta: 12 }], locker: { kind: 'promise', playerId: p.id }, result: `"That's all I wanted, Coach." The staff will be watching his minutes.` },
        { label: 'Tell him he’s free to look elsewhere', hint: 'He’ll enter the portal after the season', effects: [{ kind: 'morale', target: p.id, delta: -18 }, { kind: 'chem', delta: 1 }], locker: { kind: 'door', playerId: p.id }, result: `Honest, and it stung. He'll finish the season and then move on.` },
      ],
    });
  } },
  // a freshman is outplaying a senior starter
  { w: 3, gen: (s, L, team) => {
    const all = teamPlayers(s, team.id);
    const starters = depthChart(all, team.strategy).slice(0, 5);
    for (const f of rng.shuffle(all.filter((p) => p.cls === 'FR' && !p.redshirting && !starters.includes(p)))) {
      const sr = starters.find((p) => (p.cls === 'SR' || p.cls === 'GR') && posGroup(p) === posGroup(f) && f.ovr >= p.ovr + 2);
      if (!sr) continue;
      const soft = sr.traits.includes('coachable') || sr.traits.includes('leader');
      const cap = L.captains.includes(sr.id);
      return item(s, {
        subject: `${f.last} is pushing ${sr.last} for a starting spot`, personId: f.id,
        body: `Freshman ${name(f)} (${f.ovr}) has outplayed senior ${name(sr)} (${sr.ovr}) in practice for two weeks${cap ? `, and ${sr.last} is one of your captains` : ''}. The whole team is watching what you do.`,
        choices: [
          { label: `Start ${f.last}`, hint: soft ? `${sr.last} will handle it like a pro` : `${sr.last} won’t take it well`, effects: [{ kind: 'morale', target: f.id, delta: 8 }, { kind: 'morale', target: sr.id, delta: soft ? -4 : -12 }, { kind: 'chem', delta: cap ? -4 : soft ? 1 : -2 }], locker: { kind: 'start', playerId: f.id, benchId: sr.id }, result: soft ? `${sr.last} was the first one to congratulate him.` : `${sr.last} skipped the team dinner.` },
          { label: `${sr.last} keeps his spot`, hint: 'Seniority; the freshman waits', effects: [{ kind: 'morale', target: f.id, delta: f.traits.includes('diva') ? -10 : -6 }, { kind: 'morale', target: sr.id, delta: 4 }, { kind: 'chem', delta: 1 }], result: `${f.last} will get his turn. The seniors appreciate it.` },
          { label: 'Split the minutes', hint: 'Nobody’s thrilled, nobody’s crushed', effects: [{ kind: 'morale', target: f.id, delta: -2 }, { kind: 'morale', target: sr.id, delta: -2 }, { kind: 'chem', delta: 1 }], result: 'A time-share it is. Both of them want the job.' },
        ],
      });
    }
    return null;
  } },
  // an off-court incident
  { w: 1.2, gen: (s, L, team) => {
    const ps = teamPlayers(s, team.id).filter((p) => !p.injury);
    if (!ps.length) return null;
    const p = rng.weighted(ps, ps.map((x) => (x.traits.includes('hothead') ? 3 : x.traits.includes('diva') ? 1.5 : 1) * (x.cls === 'FR' ? 1.3 : 1) * (L.captains.includes(x.id) ? 0.4 : 1)));
    const what = rng.weighted([
      ['missed curfew on the last road trip', 'Curfew'], ['skipped two classes this week', 'Academics'], ['showed up late for the team flight', 'Team rules'],
      ['posted something he shouldn’t have', 'Social media'], ['got into a shouting match with a teammate at practice', 'Conduct'],
    ] as const, [2, 2, 2, p.traits.includes('influencer') ? 4 : 1, p.traits.includes('hothead') ? 4 : 1]);
    const starter = depthChart(teamPlayers(s, team.id), team.strategy).slice(0, 5).includes(p);
    const leak = rng.chance(0.3);
    return item(s, {
      subject: `${name(p)}: ${what[1].toLowerCase()} problem`, personId: p.id,
      body: `${name(p)} ${what[0]}. ${starter ? 'He’s a starter, and ' : ''}your players know about it. They’re waiting to see if the rules apply to everyone.`,
      choices: [
        { label: 'Suspend him for a game', hint: 'Consistency; the room respects it', effects: [{ kind: 'suspend', target: p.id, games: 1, reason: what[1] }, { kind: 'morale', target: p.id, delta: -6 }, { kind: 'chem', delta: 2 }, { kind: 'mediaRep', delta: 1 }], result: `He sits one game. Nobody else is late for anything.` },
        { label: 'Handle it internally', hint: starter ? 'Teammates may see a double standard' : 'Quiet, but people talk', effects: [{ kind: 'morale', target: p.id, delta: 1 }, { kind: 'chem', delta: starter ? -3 : -1 }, ...(leak ? [{ kind: 'mediaRep' as const, delta: -2 }, { kind: 'security' as const, delta: -1 }] : [])], result: leak ? `It leaked anyway. Now the beat writers are asking questions.` : `It stays in the building.` },
        { label: '6 a.m. sprints with the walk-ons', hint: 'Old school', effects: [{ kind: 'morale', target: p.id, delta: p.traits.includes('hothead') ? -6 : -3 }, { kind: 'chem', delta: 1 }], result: `He threw up twice. Message received.` },
      ],
    });
  } },
  // the diva wants the ball
  { w: 2, gen: (s, L, team) => {
    const p = teamPlayers(s, team.id).find((x) => x.traits.includes('diva') && x.morale < 56 && x.stats.gp >= 3);
    if (!p) return null;
    const coach = s.coaches[s.user.coachId];
    const talk = rng.chance(clamp(0.35 + (coach?.skills.motivation ?? 5) * 0.05, 0.2, 0.9));
    return item(s, {
      subject: `${name(p)} is posting cryptic tweets`, personId: p.id,
      body: `"Some people don't see it. That's on them." ${p.last} has ${mpgOf(p) ? `${(p.stats.pts / Math.max(1, p.stats.gp)).toFixed(1)} points a game and ` : ''}a lot to say online. His teammates have noticed.`,
      choices: [
        { label: 'Run more plays for him', hint: 'He’s happy; teammates notice', effects: [{ kind: 'morale', target: p.id, delta: 10 }, { kind: 'chem', delta: -3 }], result: `He's smiling again. The bigs are not.` },
        { label: 'Sit down and talk it out', hint: 'Depends on your motivation skill', effects: talk ? [{ kind: 'morale', target: p.id, delta: 5 }, { kind: 'chem', delta: 1 }] : [{ kind: 'morale', target: p.id, delta: -2 }], result: talk ? 'He deleted the tweets and apologized to the team.' : `He nodded through the whole thing and tweeted again that night.` },
        { label: 'Bench him for a game', hint: 'A statement; he’ll be furious', effects: [{ kind: 'suspend', target: p.id, games: 1, reason: 'Coach’s decision' }, { kind: 'morale', target: p.id, delta: -12 }, { kind: 'chem', delta: 3 }], result: 'He watched from the end of the bench. The rest of the team got the message.' },
      ],
    });
  } },
  // two locker rooms: transfers and returners
  { w: 2, gen: (s, L, team) => {
    const ps = teamPlayers(s, team.id).filter((p) => !p.redshirting);
    const tr = ps.filter((p) => lockerGroup(p, team.id) === 'transfer'), re = ps.filter((p) => lockerGroup(p, team.id) === 'returner');
    if (tr.length < 3 || re.length < 3) return null;
    const avg = (a: Player[]) => a.reduce((x, p) => x + p.morale, 0) / a.length;
    const gap = avg(re) - avg(tr);
    if (Math.abs(gap) < 6) return null;
    const [sad, glad, sadLabel] = gap < 0 ? [re, tr, 'returners'] : [tr, re, 'transfers'];
    return item(s, {
      subject: 'Two locker rooms',
      body: gap < 0 ? `The returners say they feel like strangers in their own gym. The transfers sit together, eat together and get most of the shots.` : `The transfers say the returners never let them in. They sit at their own table and talk about "how we used to do it."`,
      choices: [
        { label: 'Team retreat (10 hours)', hint: 'Costs recruiting hours this week', effects: [{ kind: 'hours', delta: -10 }, { kind: 'chem', delta: 6 }, ...sad.map((p) => ({ kind: 'morale' as const, target: p.id, delta: 3 }))], result: 'A ropes course, a campfire and a lot of bad singing. It worked.' },
        { label: 'Pair every newcomer with a returner', hint: 'Costs 4 hours', effects: [{ kind: 'hours', delta: -4 }, { kind: 'chem', delta: 3 }], result: 'Road-trip roommates are now mixed. It’s slowly getting better.' },
        { label: 'Remind them it’s a meritocracy', hint: `The ${sadLabel} won’t like it`, effects: [...sad.map((p) => ({ kind: 'morale' as const, target: p.id, delta: -4 })), ...glad.map((p) => ({ kind: 'morale' as const, target: p.id, delta: 2 })), { kind: 'chem', delta: -2 }], result: 'The best players play. The divide is still there.' },
      ],
    });
  } },
  // the star's NBA buzz
  { w: 2, gen: (s, L, team) => {
    const star = teamPlayers(s, team.id).filter((p) => p.stats.gp >= 5 && p.ovr >= 72).sort((a, b) => b.ovr - a.ovr)[0];
    if (!star || star.stats.pts / star.stats.gp < 14) return null;
    const leader = star.traits.includes('leader') || star.traits.includes('coachable');
    return item(s, {
      subject: `NBA scouts are everywhere ${star.last} goes`, personId: star.id,
      body: `There were 14 NBA scouts at the last game, and every postgame question is about ${name(star)}'s draft stock. A few teammates have joked they feel like extras in his documentary.`,
      choices: [
        { label: 'Shut down the NBA talk', hint: 'Team first; he may bristle', effects: [{ kind: 'morale', target: star.id, delta: leader ? -1 : -5 }, { kind: 'chem', delta: 2 }, { kind: 'mediaRep', delta: -1 }], result: 'No more draft questions at pressers. The beat writers grumbled.' },
        { label: 'Embrace it: it helps recruiting', hint: 'Recruits notice; teammates notice too', effects: [{ kind: 'recruitInterest', delta: 3 }, { kind: 'morale', target: star.id, delta: 4 }, { kind: 'chem', delta: -2 }], result: 'Every recruit on campus this month heard about the scouts.' },
        { label: `Let ${star.last} address the team`, hint: leader ? 'He’s a leader; it could help' : 'Risky if he says the wrong thing', effects: leader ? [{ kind: 'chem', delta: 4 }, { kind: 'morale', target: 'team', delta: 2 }] : [{ kind: 'chem', delta: rng.chance(0.5) ? 2 : -2 }], result: leader ? `"I don't get any of this without you guys." The room went quiet, then loud.` : `He said all the right things. Mostly.` },
      ],
    });
  } },
  // the bench went viral
  { w: 1.4, gen: (s, L, team) => {
    if (team.record.streak < 3) return null;
    const bench = teamPlayers(s, team.id).sort((a, b) => a.ovr - b.ovr)[0];
    if (!bench) return null;
    return item(s, {
      subject: 'Your bench celebration went viral', personId: bench.id,
      body: `${name(bench)} and the end of the bench have a new routine for every big shot, and the clip has two million views. Opposing fans hate it. Your players love it.`,
      choices: [
        { label: 'Love it. Keep it going', hint: 'Chemistry and hype', effects: [{ kind: 'chem', delta: 2 }, { kind: 'hype', delta: 3 }, { kind: 'morale', target: bench.id, delta: 5 }], result: 'They added choreography. There are now T-shirts.' },
        { label: 'Tone it down; act like you’ve been there', hint: 'Old school', effects: [{ kind: 'chem', delta: -1 }, { kind: 'mediaRep', delta: 2 }], result: 'They toned it down. A little.' },
      ],
    });
  } },
  // a prank war
  { w: 1.2, gen: (s, L, team) => {
    const ps = teamPlayers(s, team.id);
    if (ps.length < 6) return null;
    const a = rng.pick(ps), b = rng.pick(ps.filter((x) => x.id !== a.id));
    const pr = rng.pick([`filled ${b.last}'s car with packing peanuts`, `replaced ${b.last}'s shampoo with ketchup`, `put ${b.last}'s mattress in the shower`, `changed ${b.last}'s ringtone to a rival's fight song`]);
    return item(s, {
      subject: 'The prank war is escalating', personId: a.id,
      body: `It started small. Then ${a.last} ${pr}. Now ${b.last} is planning revenge and half the team has picked sides. Your trainer says it's mostly harmless.`,
      choices: [
        { label: 'Let them have fun', hint: 'Usually bonds a team', effects: [{ kind: 'chem', delta: 2 }, { kind: 'morale', target: 'team', delta: 1 }], result: 'The revenge involved a goat. Nobody will tell you more.' },
        { label: 'End it before someone gets hurt', hint: 'Safe and a little boring', effects: [{ kind: 'chem', delta: -1 }], result: 'Peace was declared. Suspiciously quickly.' },
        { label: 'Join in', hint: 'Bold; it could go either way', effects: rng.chance(0.6) ? [{ kind: 'chem', delta: 4 }, { kind: 'morale', target: 'team', delta: 3 }] : [{ kind: 'chem', delta: -1 }, { kind: 'mediaRep', delta: -1 }], result: 'You filled the team bus with balloons. Legend status, or close to it.' },
      ],
    });
  } },
  // the players ask for something
  { w: 1.2, gen: (s, L, team) => {
    const caps = captainsOf(s, team);
    const ask = rng.pick([
      ['a team trip to an NBA game', 'They’ve never seen a game together outside of practice.', 8],
      ['new music in the locker room', 'They are tired of your playlist. They were polite about it.', 0],
      ['a Thanksgiving dinner for players who can’t go home', 'Half the roster can’t fly home for the break.', 4],
      ['throwback uniforms for the rivalry game', 'They found a picture of the 1990s set and won’t stop talking about it.', 2],
    ] as [string, string, number][]);
    return item(s, {
      subject: `The players have a request: ${ask[0]}`, from: caps[0] ? name(caps[0]) : 'Your staff', personId: caps[0]?.id,
      body: `${caps[0] ? `${name(caps[0])} came by your office on behalf of the team.` : 'A few players came by your office.'} They'd like ${ask[0]}. ${ask[1]}`,
      choices: [
        { label: 'Make it happen', hint: ask[2] ? `Costs ${ask[2]} recruiting hours` : 'Easy yes', effects: [...(ask[2] ? [{ kind: 'hours' as const, delta: -ask[2] }] : []), { kind: 'chem', delta: ask[2] ? 3 : 2 }, { kind: 'morale', target: 'team', delta: 2 }, ...(caps[0] ? [{ kind: 'morale' as const, target: caps[0].id, delta: 3 }] : [])], result: 'Done. The group chat was all exclamation points.' },
        { label: 'Not this year', hint: 'They’ll get over it', effects: [{ kind: 'chem', delta: -1 }], result: 'They took it fine. Mostly.' },
      ],
    });
  } },
  // a captain has checked out
  { w: 3, gen: (s, L) => {
    const p = L.captains.map((id) => s.players[id]).find((x) => x && x.morale < 40);
    if (!p) return null;
    return item(s, {
      subject: `Your captain has checked out`, personId: p.id,
      body: `${name(p)} has been quiet in huddles and late to film. Players are noticing that the guy wearing the C doesn't seem to care.`,
      choices: [
        { label: 'Strip the captaincy', hint: 'Bold; he’ll be crushed', effects: [{ kind: 'morale', target: p.id, delta: -15 }, { kind: 'chem', delta: p.traits.includes('diva') ? 1 : -2 }], locker: { kind: 'strip', playerId: p.id }, result: `${p.last} handed the C back. Name a new captain in the Locker Room.` },
        { label: 'Give him time', hint: 'The room is watching', effects: [{ kind: 'chem', delta: -2 }], result: 'You let it ride. For now.' },
        { label: 'Heart-to-heart (3 hours)', hint: 'Costs recruiting hours', effects: [{ kind: 'hours', delta: -3 }, { kind: 'morale', target: p.id, delta: 9 }], result: `Turns out it was stuff at home. He's back.` },
      ],
    });
  } },
];

function lockerWeek(state: GameState, L: LockerState, week: number) {
  const team = state.teams[state.user.teamId];
  const inSeason = state.phase === 'regular' || state.phase === 'confTourney' || state.phase === 'preseason';
  if (!inSeason) { L.promised = {}; return; }
  // captains: ask, then the staff picks once games start
  if (!L.captains.length) {
    if (L.askedCaptains !== state.season) captainsInbox(state, L);
    else if (state.phase !== 'preseason') {
      const best = autoCaptains(state, team);
      if (best.length) {
        L.captains = best.map((p) => p.id);
        L.captainsBy = 'staff';
        for (const it of state.inbox) if (!it.resolved && it.fromRole === 'Locker Room' && it.subject.startsWith('Who wears')) it.resolved = true;
        lockerLog(state, '©️', `Your staff named ${best.map(name).join(' and ')} captain${best.length > 1 ? 's' : ''}`);
      }
    }
  }
  if (state.phase === 'preseason') return;
  // promises come due after a few games
  for (const [id, pr] of Object.entries(L.promised)) {
    const p = state.players[id];
    if (!p || p.teamId !== team.id) { delete L.promised[id]; continue; }
    const games = p.stats.gp - pr.gp;
    if (games < 4) continue;
    const since = (p.stats.min - pr.min) / games, before = pr.gp ? pr.min / pr.gp : 0;
    delete L.promised[id];
    if (since >= before + 5) {
      p.morale = clamp(p.morale + 5, 0, 100);
      bump(state, 2);
      lockerLog(state, '✅', `You kept your word: ${name(p)} is up to ${since.toFixed(1)} minutes a game`, 2, p.id);
    } else {
      p.morale = clamp(p.morale - 15, 0, 100);
      bump(state, -4);
      lockerLog(state, '💔', `You broke your promise to ${name(p)} (${since.toFixed(1)} minutes a game since)`, -4, p.id);
    }
  }
  // moments that need no decision
  const st = team.record.streak;
  const caps = captainsOf(state, team);
  const leaderCap = caps.find((p) => p.traits.includes('leader'));
  if (st === -2 && leaderCap && rng.chance(0.5)) {
    bump(state, 3);
    lockerLog(state, '📣', `${name(leaderCap)} called out the team after practice`, 3, leaderCap.id);
  } else if ((team.chem ?? CHEM_NEUTRAL) >= 50 && rng.chance(0.1)) {
    const ps = teamPlayers(state, team.id);
    const host = rng.weighted(ps, ps.map((p) => (p.traits.includes('leader') || p.traits.includes('glue') ? 3 : p.traits.includes('influencer') ? 2 : 1)));
    const what = rng.pick(['a team bowling night', 'a Madden tournament', 'dinner at his family’s place', 'a karaoke night', 'a pickup game against the football team', 'a team trip to the movies']);
    bump(state, 2);
    lockerLog(state, '🎳', `${name(host)} organized ${what}`, 2, host.id);
  }
  // at most one dilemma every other week
  if (L.lastEventWeek != null && week - L.lastEventWeek < 2) return;
  if (state.inbox.filter((i) => !i.resolved).length >= 4) return;
  // a losing streak calls for a meeting
  if (st <= -3 && (L.lastMeetingWeek == null || week - L.lastMeetingWeek >= 4)) {
    const ev = meeting(state, team, caps, -st);
    state.inbox.unshift(ev);
    L.lastEventWeek = week; L.lastMeetingWeek = week;
    return;
  }
  if (!rng.chance(0.65)) return;
  // the same story doesn't come back for a while
  const cool = (L.cool ??= {});
  for (let i = 0; i < 4; i++) {
    const gi = rng.weighted(GENS.map((_, j) => j), GENS.map((x) => x.w));
    const ev = GENS[gi].gen(state, L, team, week);
    if (!ev) continue;
    const key = `${gi}:${ev.personId ?? ''}`;
    if ((cool[key] ?? -99) > week || (cool[`g${gi}`] ?? -99) > week) continue;
    cool[key] = week + 8;
    cool[`g${gi}`] = week + 6;
    state.inbox.unshift(ev); L.lastEventWeek = week;
    return;
  }
}

function meeting(state: GameState, team: Team, caps: Player[], losses: number): InboxItem {
  const capAvg = caps.length ? caps.reduce((s, p) => s + captainScore(p, team.id), 0) / caps.length : -1;
  const okCaps = caps.length > 0 && rng.chance(clamp(0.3 + capAvg * 0.09, 0.12, 0.88));
  const coach = state.coaches[state.user.coachId];
  const okCoach = rng.chance(clamp(0.35 + (coach?.skills.motivation ?? 5) * 0.05, 0.2, 0.9));
  const capNames = caps.map((p) => p.last).join(' and ');
  return item(state, {
    subject: `${losses} straight losses: time for a meeting?`,
    body: `The bus ride home was silent. Your staff thinks the team needs to clear the air before this gets worse.${caps.length ? ` Your captains are ${caps.map(name).join(' and ')}.` : ' You haven’t named captains.'}`,
    choices: [
      { label: 'Let the captains hold a players-only meeting', hint: caps.length ? `Depends on ${capNames}` : 'Nobody to lead it', effects: okCaps ? [{ kind: 'chem', delta: 7 }, { kind: 'morale', target: 'team', delta: 3 }] : [{ kind: 'chem', delta: -4 }, { kind: 'morale', target: 'team', delta: -2 }], result: okCaps ? `${caps[0].last} stood up and said what needed saying. Players walked out of that room together.` : caps.length ? `It turned into a shouting match. ${capNames} lost the room.` : 'With nobody leading it, it turned into a gripe session.' },
      { label: 'Run the meeting yourself', hint: 'Depends on your motivation skill', effects: okCoach ? [{ kind: 'chem', delta: 4 }, { kind: 'morale', target: 'team', delta: 2 }] : [{ kind: 'chem', delta: -1 }], result: okCoach ? 'You kept it short and honest. They bought in.' : 'They heard you. Whether they listened is another question.' },
      { label: 'Cancel practice: team bowling night (6 hours)', hint: 'Costs recruiting hours; a sure lift', effects: [{ kind: 'hours', delta: -6 }, { kind: 'chem', delta: 3 }, { kind: 'morale', target: 'team', delta: 4 }], result: 'Your walk-on bowled a 212. Nobody has stopped talking about it.' },
    ],
  });
}

// ---------------- Senior Night ----------------
/** after your last regular-season home game: honor the seniors */
export function seniorNight(state: GameState, g: ScheduledGame) {
  const uid = state.user.teamId;
  if (g.home !== uid || g.neutral || (g.type !== 'conf' && g.type !== 'nc')) return;
  const L = locker(state);
  if (L.seniorNight === state.season) return;
  if (state.schedule.some((x) => !x.played && x.home === uid && !x.neutral && (x.type === 'conf' || x.type === 'nc'))) return;
  L.seniorNight = state.season;
  const seniors = teamPlayers(state, uid).filter(isSenior);
  if (!seniors.length) return;
  for (const p of seniors) p.morale = clamp(p.morale + 6, 0, 100);
  bump(state, 3);
  const team = state.teams[uid];
  const names = seniors.map(name);
  lockerLog(state, '🌹', `Senior Night: ${names.join(', ')} took their last bow at ${team.arena}`, 3);
  addNews(state, { kind: 'feature', headline: `${team.school} honors ${seniors.length} senior${seniors.length > 1 ? 's' : ''} on Senior Night`, body: `${names.join(', ')} ${seniors.length > 1 ? 'were' : 'was'} honored before tipoff at ${team.arena}.`, teams: [uid] });
  state.user.moments.push({ kind: 'seniorNight', teamId: uid, players: seniors.map((p) => p.id), oppId: g.away });
}

// ---------------- the portal ----------------
/** multiplier on a player's chance of entering the portal */
export function portalLockerMul(state: GameState, p: Player, team: Team): number {
  let m = portalChemMul(team.chem);
  if (isHuman(state, team.id) && asTeam(state, team.id, () => state.locker?.teamId === team.id && state.locker.captains.includes(p.id))) m *= 0.7;
  return m;
}
export function doorOpen(state: GameState, playerId: string) {
  const t = state.players[playerId]?.teamId;
  if (!t || !isHuman(state, t)) return false;
  return asTeam(state, t, () => !!state.locker && state.locker.teamId === t && state.locker.doorOpen.includes(playerId));
}
