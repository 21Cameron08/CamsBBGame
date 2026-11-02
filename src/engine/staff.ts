// Coaching staff: hiring market, contracts, effects, poaching + coaching tree.
import { rng, clamp } from './rng';
import type { Coach, GameState, InboxItem, StaffMember, StaffRole, StaffState, StaffTrait } from './types';
import { FIRST_NAMES, LAST_NAMES } from '../data/names';
import { PLACES } from '../data/places';
import { genAICoach, hoursForWeek } from './coach';
import { roundMoney, fmtMoney } from './player';

export const STAFF_ROLES: StaffRole[] = ['assoc', 'recruiting', 'defense', 'development', 'gm', 'strength'];

export const ROLE_INFO: Record<StaffRole, { title: string; short: string; icon: string; desc: string; salaryMul: number }> = {
  assoc: { title: 'Associate Head Coach', short: 'Assoc. HC', icon: '🧠', desc: 'Your right hand on game day. Sharper in-game execution and a steadier locker room.', salaryMul: 1.3 },
  recruiting: { title: 'Recruiting Coordinator', short: 'Recruiting', icon: '🎯', desc: 'More recruiting hours, stronger relationships, and a pipeline state where prospects listen.', salaryMul: 1.1 },
  defense: { title: 'Defensive Coordinator', short: 'Defense', icon: '🛡️', desc: 'Schemes that take away the opponent’s best looks and force turnovers.', salaryMul: 1.1 },
  development: { title: 'Player Development Coach', short: 'Development', icon: '📈', desc: 'Turns summers into leaps. Bigger offseason rating jumps.', salaryMul: 1.0 },
  gm: { title: 'General Manager', short: 'GM', icon: '💼', desc: 'Runs roster strategy and donor relations. Bigger NIL pool, better portal pitches, cheaper retention.', salaryMul: 1.2 },
  strength: { title: 'Strength & Conditioning', short: 'S&C', icon: '💪', desc: 'Fresher legs late in games and fewer injuries.', salaryMul: 0.6 },
};

export const TRAIT_INFO: Record<StaffTrait, string> = {
  'Recruiting Ace': 'Lives on the AAU circuit — extra recruiting pull.',
  'X&O Wizard': 'Whiteboard genius — extra game-day impact.',
  'Players’ Favorite': 'Players love him — small morale boost.',
  Grinder: 'Outworks everyone — steady, reliable.',
  'Former Pro': 'Played in the league — recruits and pros listen.',
  'Rising Star': 'Young and ambitious — improves fast, may leave fast.',
  'Old School': 'Been there, done that — very loyal, slowly declining.',
  'Analytics Guru': 'Numbers-driven edges in game planning.',
  Connector: 'Knows everyone — donors, agents, high school coaches.',
  'Loyal Soldier': 'Not going anywhere. Hard to poach.',
};

const TRAITS = Object.keys(TRAIT_INFO) as StaffTrait[];

export function staffBudgetFor(prestige: number, market: number): number {
  const b = 300_000 + Math.exp(prestige * 0.045) * 60_000 * (0.7 + market * 0.06);
  return Math.round(b / 25_000) * 25_000;
}

export function salaryAsk(rating: number, role: StaffRole): number {
  return roundMoney(12_000 * Math.exp(rating * 0.048) * ROLE_INFO[role].salaryMul);
}

/** quality factor: ~0 for a weak hire (35), +1 for elite (90). Any hire beats a vacancy unless he's truly bad. */
export function q(rating: number) {
  return clamp((rating - 35) / 55, -0.3, 1);
}

const statesWithRecruits = Array.from(new Set(PLACES.filter((p) => p.w >= 1).map((p) => p.state)));

export function genStaff(role: StaffRole, level: number): StaffMember {
  const rating = Math.round(clamp(level + rng.normal(0, 9), 22, 97));
  const age = role === 'strength' ? rng.int(27, 55) : rng.int(29, 64);
  let trait = rng.pick(TRAITS);
  if (age < 36 && rng.chance(0.4)) trait = 'Rising Star';
  if (age > 56 && rng.chance(0.4)) trait = 'Old School';
  const ambitionBase = age < 40 ? 65 : age < 50 ? 50 : 30;
  const m: StaffMember = {
    id: rng.id('st'),
    first: rng.pick(FIRST_NAMES),
    last: rng.pick(LAST_NAMES),
    age,
    role,
    rating,
    trait,
    pipeline: role === 'recruiting' || (role === 'assoc' && rng.chance(0.4)) || trait === 'Connector' ? rng.pick(statesWithRecruits) : null,
    salary: 0,
    years: rng.int(1, 4),
    loyalty: Math.round(clamp(rng.normal(trait === 'Loyal Soldier' || trait === 'Old School' ? 82 : 55, 14), 5, 99)),
    ambition: Math.round(clamp(rng.normal(trait === 'Rising Star' ? 85 : ambitionBase, 14), 5, 99)),
    seasons: 0,
    history: [],
  };
  m.ask = salaryAsk(rating, role);
  m.salary = m.ask;
  return m;
}

export function genMarket(state: GameState): StaffMember[] {
  const out: StaffMember[] = [];
  for (const role of STAFF_ROLES) {
    for (let i = 0; i < 6; i++) {
      // spread of quality: a couple of elite names, many middling
      const level = rng.weighted([82, 68, 55, 42, 30], [1, 2.5, 3, 2.2, 1.4]);
      out.push(genStaff(role, level));
    }
  }
  void state;
  return out.sort((a, b) => b.rating - a.rating);
}

export function initStaff(state: GameState, opts: { vacantGM?: boolean } = {}): StaffState {
  const team = state.teams[state.user.teamId];
  const budget = staffBudgetFor(team.prestige, team.market);
  const level = 40 + team.prestige * 0.38;
  const members: StaffMember[] = [];
  for (const role of STAFF_ROLES) {
    if (opts.vacantGM && role === 'gm') continue;
    const m = genStaff(role, level);
    m.history.push(`Joined ${team.school} staff`);
    members.push(m);
  }
  // fit the payroll, leaving room to hire a program-level GM if that seat is open
  const target = opts.vacantGM ? budget - salaryAsk(Math.round(level), 'gm') * 1.1 : budget * 0.88;
  let total = members.reduce((s, m) => s + m.salary, 0);
  let guard = 0;
  while (total > target && guard++ < 60) {
    const top = [...members].sort((a, b) => b.salary - a.salary)[0];
    top.rating = Math.max(25, top.rating - 3);
    top.salary = salaryAsk(top.rating, top.role);
    total = members.reduce((s, m) => s + m.salary, 0);
  }
  const st: StaffState = { members, market: [], budget, buyouts: 0, tree: [] };
  state.staff = st;
  st.market = genMarket(state);
  return st;
}

/** Ensure an old (pre-staff) save gets a staff. Returns true if migrated. */
export function migrateStaff(state: GameState): boolean {
  if (state.staff) return false;
  initStaff(state, { vacantGM: true });
  staffWelcomeInbox(state, true);
  if (['preseason', 'regular', 'confTourney', 'selection', 'ncaa'].includes(state.phase)) syncHours(state);
  return true;
}

export function staffWelcomeInbox(state: GameState, migrated = false) {
  const team = state.teams[state.user.teamId];
  state.inbox.unshift({
    id: `staffgm${state.season}${Date.now().toString(36)}`, day: state.day, season: state.season,
    from: 'Athletic Director', fromRole: team.school, resolved: false, priority: true,
    subject: migrated ? 'Meet your coaching staff' : 'New position approved: General Manager',
    body: migrated
      ? `Coach, your assistants are now on the books — open the Coaching Staff page to meet them. Good news too: I've approved a brand-new General Manager position to run roster strategy and donor relations. Your staff pool is ${fmtMoney(state.staff!.budget)} a year. Go hire someone great.`
      : `Every serious program has one now. I've approved a General Manager position to run roster strategy, the portal and donor relations. Your staff pool is ${fmtMoney(state.staff!.budget)} a year — the hiring market is open.`,
    choices: [{ label: 'Open the Coaching Staff page', effects: [], result: 'Your staff awaits.', goto: 'staff' }],
  });
}

export function staffPayroll(st: StaffState): number {
  return st.members.reduce((s, m) => s + m.salary, 0) + st.buyouts;
}

export function staffAvailable(st: StaffState): number {
  return st.budget - staffPayroll(st);
}

export function member(state: GameState, role: StaffRole): StaffMember | undefined {
  return state.staff?.members.find((m) => m.role === role);
}

// ---------------- Effects ----------------
export interface StaffEffects {
  tactics: number; // added to coach tactics (0-10 scale)
  motivation: number; // added to coach motivation
  defense: number; // opponent shot-make reduction (probability)
  pressure: number; // added turnover pressure (probability)
  hours: number; // extra weekly recruiting hours
  relMul: number; // relationship gain multiplier
  pipeline: string | null;
  pipelineBonus: number; // multiplier for pipeline-state recruits
  dev: number; // added to development skill in offseason
  nilMul: number; // NIL pool multiplier at season start
  portal: number; // portal pitch bonus
  retentionMul: number; // multiplier on retention asks
  stamina: number; // energy drain multiplier
  injury: number; // injury risk multiplier
  morale: number; // weekly morale nudge
}

export const NO_EFFECTS: StaffEffects = {
  tactics: 0, motivation: 0, defense: 0, pressure: 0, hours: 0, relMul: 1, pipeline: null, pipelineBonus: 1,
  dev: 0, nilMul: 1, portal: 0, retentionMul: 1, stamina: 1, injury: 1, morale: 0,
};

export function staffEffects(state: GameState): StaffEffects {
  const st = state.staff;
  if (!st) return NO_EFFECTS;
  const e: StaffEffects = { ...NO_EFFECTS };
  for (const m of st.members) {
    const k = q(m.rating);
    const t = m.trait;
    switch (m.role) {
      case 'assoc':
        e.tactics += 2.5 * k + (t === 'X&O Wizard' || t === 'Analytics Guru' ? 0.8 : 0);
        e.motivation += 2 * k + (t === 'Players’ Favorite' ? 0.8 : 0);
        if (m.pipeline && !e.pipeline) { e.pipeline = m.pipeline; e.pipelineBonus = 1.15; }
        break;
      case 'recruiting':
        e.hours += Math.round(4 + 6 * k + (t === 'Recruiting Ace' ? 3 : 0));
        e.relMul *= 1 + 0.15 * k + (t === 'Recruiting Ace' || t === 'Former Pro' ? 0.05 : 0);
        if (m.pipeline) { e.pipeline = m.pipeline; e.pipelineBonus = 1.3 + Math.max(0, k) * 0.2; }
        break;
      case 'defense':
        e.defense += 0.0105 * k + (t === 'X&O Wizard' || t === 'Analytics Guru' ? 0.003 : 0);
        e.pressure += 0.006 * Math.max(0, k);
        break;
      case 'development':
        e.dev += 3 * k + (t === 'Grinder' || t === 'Former Pro' ? 0.6 : 0);
        break;
      case 'gm':
        e.nilMul *= 1 + 0.08 * k + (t === 'Connector' ? 0.03 : 0);
        e.portal += 3 * k + (t === 'Connector' ? 1 : 0);
        e.retentionMul *= 1 - 0.08 * k;
        break;
      case 'strength':
        e.stamina *= 1 - 0.1 * k;
        e.injury *= 1 - 0.3 * k;
        break;
    }
    if (t === 'Players’ Favorite') e.morale += 0.3;
  }
  e.hours = Math.max(0, e.hours);
  return e;
}

/** Human readable impact chips for the UI */
export function staffImpact(state: GameState): { icon: string; label: string; good: boolean }[] {
  const e = staffEffects(state);
  const out: { icon: string; label: string; good: boolean }[] = [];
  const sign = (v: number, d = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}`;
  if (member(state, 'recruiting')) out.push({ icon: '🎯', label: `${e.hours >= 0 ? '+' : ''}${e.hours} recruiting hrs/wk`, good: e.hours > 0 });
  if (e.relMul !== 1) out.push({ icon: '🤝', label: `${sign((e.relMul - 1) * 100, 0)}% relationship gains`, good: e.relMul > 1 });
  if (e.pipeline) out.push({ icon: '📍', label: `Pipeline: ${e.pipeline}`, good: true });
  if (member(state, 'assoc')) out.push({ icon: '🧠', label: `${sign(e.tactics)} game-day tactics`, good: e.tactics >= 0 });
  if (member(state, 'defense')) out.push({ icon: '🛡️', label: `${sign(-e.defense * 100)}% opp. FG`, good: e.defense >= 0 });
  if (member(state, 'development')) out.push({ icon: '📈', label: `${sign(e.dev)} development`, good: e.dev >= 0 });
  if (member(state, 'gm')) out.push({ icon: '💰', label: `${sign((e.nilMul - 1) * 100, 0)}% NIL pool`, good: e.nilMul >= 1 });
  if (member(state, 'strength')) out.push({ icon: '💪', label: `${sign((e.injury - 1) * 100, 0)}% injury risk`, good: e.injury <= 1 });
  return out;
}

export function staffGrade(st: StaffState | undefined): string {
  if (!st) return '—';
  const filled = STAFF_ROLES.map((r) => st.members.find((m) => m.role === r)?.rating ?? 25);
  const avg = filled.reduce((a, b) => a + b, 0) / filled.length;
  return avg >= 82 ? 'A+' : avg >= 75 ? 'A' : avg >= 70 ? 'A-' : avg >= 65 ? 'B+' : avg >= 60 ? 'B' : avg >= 55 ? 'B-' : avg >= 50 ? 'C+' : avg >= 45 ? 'C' : avg >= 40 ? 'C-' : avg >= 33 ? 'D' : 'F';
}

// ---------------- Hiring ----------------
export function candidateInterest(state: GameState, c: StaffMember, salary: number): number {
  const team = state.teams[state.user.teamId];
  const coach = state.coaches[state.user.coachId];
  const ask = c.ask ?? salaryAsk(c.rating, c.role);
  return clamp(55 + (team.prestige - c.rating) * 0.7 + ((coach?.reputation ?? 50) - 50) * 0.35 + (salary / ask - 1) * 60 + (c.pipeline && c.pipeline === team.state ? 6 : 0), 0, 100);
}

export function interestLabel(v: number): { label: string; cls: string } {
  if (v >= 65) return { label: 'Eager', cls: 'good' };
  if (v >= 50) return { label: 'Open', cls: 'blue' };
  if (v >= 35) return { label: 'Needs convincing', cls: 'gold' };
  return { label: 'Not interested', cls: 'bad' };
}

export function hireStaff(state: GameState, candidateId: string, salary: number, years: number): { ok: boolean; msg: string } {
  const st = state.staff;
  if (!st) return { ok: false, msg: 'No staff data.' };
  const c = st.market.find((m) => m.id === candidateId);
  if (!c) return { ok: false, msg: 'Candidate is no longer available.' };
  const team = state.teams[state.user.teamId];
  const current = st.members.find((m) => m.role === c.role);
  const availAfter = staffAvailable(st) + (current ? current.salary * 0.5 : 0) - salary;
  if (availAfter < 0) return { ok: false, msg: `Not enough in the staff pool (${fmtMoney(staffAvailable(st))} available).` };
  if (candidateInterest(state, c, salary) < 50) return { ok: false, msg: `${c.first} ${c.last} turned you down. Try a bigger offer — or a candidate who's a better fit.` };
  if (current) fireStaff(state, current.id, true);
  st.market = st.market.filter((m) => m.id !== c.id);
  c.salary = salary;
  c.years = clamp(Math.round(years), 1, 5);
  c.seasons = 0;
  c.loyalty = clamp(c.loyalty + (salary / (c.ask ?? salary) - 1) * 40, 5, 99);
  c.history.push(`Hired by ${team.school} (${state.season})`);
  delete c.release;
  st.members.push(c);
  if (c.role === 'gm' && !current) {
    // a brand-new GM shakes the donor tree right away
    team.nilBudget = Math.round((team.nilBudget * (1 + 0.08 * Math.max(0, q(c.rating)))) / 25_000) * 25_000;
  }
  syncHours(state);
  return { ok: true, msg: `${c.first} ${c.last} is your new ${ROLE_INFO[c.role].title}!` };
}

export function fireStaff(state: GameState, staffId: string, replacing = false): { ok: boolean; msg: string } {
  const st = state.staff;
  const m = st?.members.find((x) => x.id === staffId);
  if (!st || !m) return { ok: false, msg: 'Not on your staff.' };
  const buyout = roundMoney(m.salary * 0.5);
  st.buyouts += buyout;
  st.members = st.members.filter((x) => x.id !== staffId);
  m.history.push(`${replacing ? 'Replaced' : 'Fired'} by ${state.teams[state.user.teamId].school} (${state.season})`);
  // fired coaches return to the market at a discount
  m.ask = roundMoney((m.ask ?? m.salary) * 0.85);
  m.seasons = 0;
  st.market.push(m);
  syncHours(state);
  return { ok: true, msg: `${m.first} ${m.last} has been let go (${fmtMoney(buyout)} buyout counts against this season's pool).` };
}

/** Keep this week's recruiting hours in step with staff changes */
function syncHours(state: GameState) {
  const before = state.user.hoursMax;
  state.user.hoursMax = hoursForWeek(state);
  state.user.hours = clamp(state.user.hours + (state.user.hoursMax - before), 0, state.user.hoursMax);
}

export function memberEffectText(m: StaffMember): string {
  const k = q(m.rating);
  const f = (v: number, d = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}`;
  switch (m.role) {
    case 'assoc': return `${f(2.5 * k)} game-day tactics · ${f(2 * k)} motivation`;
    case 'recruiting': return `${f(Math.round(4 + 6 * k + (m.trait === 'Recruiting Ace' ? 3 : 0)), 0)} recruiting hrs/wk · ${f(15 * k, 0)}% relationship gains`;
    case 'defense': return `${f(-1.05 * k)}% opponent FG · more forced turnovers`;
    case 'development': return `${f(3 * k)} offseason development`;
    case 'gm': return `${f(8 * k, 0)}% NIL pool · ${f(3 * k)} portal pitch · ${f(-8 * k, 0)}% retention asks`;
    case 'strength': return `${f(-30 * k, 0)}% injury risk · ${f(-10 * k, 0)}% fatigue`;
  }
}

export function extendStaff(state: GameState, staffId: string): { ok: boolean; msg: string } {
  const st = state.staff;
  const m = st?.members.find((x) => x.id === staffId);
  if (!st || !m) return { ok: false, msg: 'Not on your staff.' };
  const raise = roundMoney(m.salary * 0.1);
  if (staffAvailable(st) < raise) return { ok: false, msg: `A ${fmtMoney(raise)} raise doesn't fit in the staff pool.` };
  m.salary += raise;
  m.years = Math.min(5, m.years + 2);
  m.loyalty = clamp(m.loyalty + 12, 0, 99);
  m.ambition = clamp(m.ambition - 5, 0, 99);
  delete m.release;
  return { ok: true, msg: `${m.first} ${m.last} extended through ${state.season + m.years} (+${fmtMoney(raise)}/yr).` };
}

// ---------------- Season-end: poaching & contracts ----------------
/** Called from the coaching carousel: may offer one of your staff a head job at a vacancy. */
export function maybePoachStaff(state: GameState, vacancyTeamId: string): InboxItem | null {
  const st = state.staff;
  if (!st) return null;
  const vac = state.teams[vacancyTeamId];
  const user = state.teams[state.user.teamId];
  if (!vac || vac.id === user.id || vac.prestige > user.prestige + 5) return null;
  if (state.inbox.some((i) => !i.resolved && i.choices.some((c) => c.staffPoach))) return null; // one at a time
  const cands = st.members.filter((m) => m.role !== 'strength' && m.rating >= 60 && m.ambition >= 45 && m.seasons >= 1);
  if (!cands.length) return null;
  const m = cands.sort((a, b) => b.rating + b.ambition - (a.rating + a.ambition))[0];
  const p = clamp((m.ambition - m.loyalty * 0.5) / 100 + (m.rating - 60) / 120, 0.05, 0.75);
  if (!rng.chance(p)) return null;
  const counter = roundMoney(m.salary * 0.35);
  const item: InboxItem = {
    id: `poach${m.id}${state.season}`, day: state.day, season: state.season, resolved: false, priority: true,
    from: `${m.first} ${m.last}`, fromRole: ROLE_INFO[m.role].title, personId: m.id, personKind: 'staff',
    subject: `${vac.school} wants me as their head coach`,
    body: `Coach, I need to tell you something. ${vac.school} offered me their head job. It's a real opportunity — but I love it here. If you want me to stay, I'd need a raise of about ${fmtMoney(counter)} and an extension. Either way, I'll always be grateful.`,
    choices: [
      { label: `Counter-offer (+${fmtMoney(counter)}/yr, 3-yr extension)`, hint: 'Keep him; uses staff pool', effects: [], result: `${m.first} is staying. Loyalty earned.`, staffPoach: { staffId: m.id, teamId: vac.id, keep: true } },
      { label: 'Give him your blessing', hint: 'He leaves; your coaching tree grows (+reputation)', effects: [{ kind: 'rep', delta: 2 }, { kind: 'xp', delta: 40 }], result: `${m.first} ${m.last} is the new head coach at ${vac.school}. Your coaching tree grows.`, staffPoach: { staffId: m.id, teamId: vac.id, keep: false } },
    ],
  };
  state.inbox.unshift(item);
  return item;
}

/** Apply a poaching decision. keep=false moves him to the vacancy as head coach. */
export function resolvePoach(state: GameState, staffId: string, teamId: string, keep: boolean) {
  const st = state.staff;
  const m = st?.members.find((x) => x.id === staffId);
  const team = state.teams[teamId];
  if (!st || !m || !team) return;
  if (keep) {
    const raise = roundMoney(m.salary * 0.35);
    m.salary += raise;
    m.years = Math.min(5, m.years + 3);
    m.loyalty = clamp(m.loyalty + 25, 0, 99);
    m.ambition = clamp(m.ambition - 15, 0, 99);
    m.history.push(`Turned down ${team.school} head job (${state.season})`);
    return;
  }
  // He becomes the head coach at the vacancy (replacing whoever the carousel put there)
  st.members = st.members.filter((x) => x.id !== staffId);
  const prev = state.coaches[team.coachId];
  if (prev && !prev.isUser) delete state.coaches[prev.id];
  const c: Coach = genAICoach(team.prestige, team.id);
  c.id = m.id; // same id => same generated face
  c.first = m.first;
  c.last = m.last;
  c.age = m.age;
  c.rating = clamp(m.rating - 5, 20, 95);
  c.reputation = clamp(m.rating - 10, 10, 90);
  c.careerW = 0;
  c.careerL = 0;
  c.career = [];
  c.jobSecurity = 75;
  c.contractYears = 5;
  state.coaches[c.id] = c;
  team.coachId = c.id;
  team.coachChange = true;
  st.tree.push({ staffId: m.id, name: `${m.first} ${m.last}`, role: m.role, teamId: team.id, season: state.season, coachId: c.id });
  const user = state.teams[state.user.teamId];
  state.news.unshift({
    id: `n${Date.now().toString(36)}${m.id}`, season: state.season, day: state.day, date: state.calendar[state.day]?.label ?? '',
    kind: 'coach', headline: `${team.school} hires ${user.school} assistant ${m.first} ${m.last} as head coach`,
    body: `${m.first} ${m.last}, ${user.school}'s ${ROLE_INFO[m.role].title.toLowerCase()}, gets his first head coaching job. Another branch on Coach ${state.coaches[state.user.coachId].last}'s coaching tree.`,
    teams: [team.id, user.id], important: true, personId: c.id, personKind: 'coach',
  });
}

/** Unresolved poaching offers default to the assistant leaving. */
export function finalizePoaching(state: GameState) {
  for (const item of state.inbox) {
    if (item.resolved) continue;
    const ch = item.choices.find((c) => c.staffPoach && !c.staffPoach.keep);
    if (!ch || !ch.staffPoach) continue;
    item.resolved = true;
    item.chosen = item.choices.indexOf(ch);
    resolvePoach(state, ch.staffPoach.staffId, ch.staffPoach.teamId, false);
  }
}

/** End of season: contract notice for expiring staff */
export function staffSeasonEnd(state: GameState) {
  const st = state.staff;
  if (!st) return;
  const expiring = st.members.filter((m) => m.years <= 1);
  if (!expiring.length) return;
  state.inbox.unshift({
    id: `staffexp${state.season}`, day: state.day, season: state.season, resolved: false,
    from: 'Director of Operations', fromRole: 'Basketball Operations',
    subject: `${expiring.length} staff contract${expiring.length > 1 ? 's' : ''} expiring`,
    body: `${expiring.map((m) => `${m.first} ${m.last} (${ROLE_INFO[m.role].short}, ${m.rating} rating, ${fmtMoney(m.salary)})`).join('; ')}. Unless you say otherwise, we'll re-sign them for two more years with a modest raise.`,
    choices: [
      { label: 'Re-sign everyone (default)', effects: [], result: 'Contracts will be renewed for two years.', staffRenew: true },
      { label: 'Let them all walk', hint: 'Open the slots for new hires', effects: [], result: 'They’ll leave when the new season begins. The hiring market awaits.', staffRenew: false },
    ],
  });
}

export function applyStaffRenewChoice(state: GameState, renew: boolean) {
  const st = state.staff;
  if (!st) return;
  for (const m of st.members) if (m.years <= 1) m.release = !renew;
}

/** New season: contracts tick, ratings drift, budget & market refresh */
export function staffNewSeason(state: GameState) {
  const st = state.staff;
  if (!st) return;
  const team = state.teams[state.user.teamId];
  st.budget = staffBudgetFor(team.prestige, team.market);
  st.buyouts = 0;
  const keep: StaffMember[] = [];
  for (const m of st.members) {
    m.age++;
    m.seasons++;
    m.years--;
    const drift = m.age < 38 ? rng.int(0, 3) : m.age > 58 ? rng.int(-2, 0) : rng.int(-1, 2);
    m.rating = clamp(m.rating + drift + (m.trait === 'Rising Star' ? 1 : 0), 15, 99);
    m.ambition = clamp(m.ambition + (m.rating >= 70 ? 3 : 0), 0, 99);
    if (m.years <= 0) {
      if (m.release) {
        m.history.push(`Contract expired at ${team.school} (${state.season})`);
        m.ask = salaryAsk(m.rating, m.role);
        st.market.push(m);
        continue;
      }
      m.years = 2;
      m.salary = roundMoney(m.salary * 1.08);
    }
    delete m.release;
    keep.push(m);
  }
  st.members = keep;
  // refresh market: keep a few returning free agents, add new faces
  const returning = st.market.filter(() => rng.chance(0.35)).slice(0, 10);
  st.market = [...returning, ...genMarket(state)].sort((a, b) => b.rating - a.rating);
  for (const m of st.market) m.ask = salaryAsk(m.rating, m.role);
}

/** When the user takes a new job, staff follow; budget changes. */
export function staffFollowCoach(state: GameState, newTeamId: string, oldSchool: string) {
  const st = state.staff;
  if (!st) return;
  const team = state.teams[newTeamId];
  st.budget = staffBudgetFor(team.prestige, team.market);
  for (const m of st.members) m.history.push(`Followed you from ${oldSchool} to ${team.school} (${state.season})`);
}
