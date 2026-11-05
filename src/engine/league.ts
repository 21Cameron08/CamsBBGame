// Online leagues: more than one human coach in the same world.
//
// The engine was built around one human (state.user, state.inbox, state.staff, ...). Rather than
// rewrite every system, each human coach keeps his own copy of that per-coach state in a slot.
// The "current" coach's copy lives at the top level of the state, exactly like a single-player
// game; withHuman() swaps another coach in, runs some code as him, and swaps back. AI logic asks
// isHuman() so it leaves every human program alone.
import type { GameState, InboxItem, LockerState, UserState } from './types';

/** the per-coach parts of the state */
export interface PerCoach {
  user: UserState;
  inbox: InboxItem[];
  staff?: GameState['staff'];
  development?: GameState['development'];
  locker?: LockerState;
  scheduling?: GameState['scheduling'];
  radio?: GameState['radio'];
  playbook?: GameState['playbook'];
  /** his side of the transfer portal */
  portalUser?: { hours: number; hoursMax: number; calls: NonNullable<GameState['portal']>['calls']; lastResults?: NonNullable<GameState['portal']>['lastResults'] };
  /** his side of the offseason */
  osUser?: { signed: string[]; summary: string; achieved: number; securityDelta: number };
}
export interface HumanSlot { coachId: string; name: string; data?: PerCoach }
export interface LeagueState { humans: HumanSlot[]; current: string }

const KEYS = ['user', 'inbox', 'staff', 'development', 'locker', 'scheduling', 'radio', 'playbook'] as const;

export function leagueOn(state: GameState) { return !!state.league && state.league.humans.length > 1; }

function capture(state: GameState): PerCoach {
  const d = {} as PerCoach;
  for (const k of KEYS) (d as unknown as Record<string, unknown>)[k] = state[k];
  if (state.portal) d.portalUser = { hours: state.portal.hours, hoursMax: state.portal.hoursMax, calls: state.portal.calls, lastResults: state.portal.lastResults };
  if (state.offseason) d.osUser = { signed: state.offseason.signed, summary: state.offseason.summary, achieved: state.offseason.achieved, securityDelta: state.offseason.securityDelta };
  return d;
}
function restore(state: GameState, d: PerCoach) {
  for (const k of KEYS) (state as unknown as Record<string, unknown>)[k] = d[k];
  if (state.portal) {
    const p = d.portalUser ?? { hours: state.portal.hoursMax, hoursMax: state.portal.hoursMax, calls: [], lastResults: undefined };
    Object.assign(state.portal, p);
  }
  if (state.offseason) Object.assign(state.offseason, d.osUser ?? { signed: [], summary: '', achieved: 0, securityDelta: 0 });
}

/** every human coach id (single player: just you) */
export function humanCoachIds(state: GameState): string[] {
  return state.league?.humans.map((h) => h.coachId) ?? [state.user.coachId];
}
/** the user state for one human coach, wherever it's stored right now */
function userFor(state: GameState, coachId: string): UserState | undefined {
  if (coachId === state.user.coachId) return state.user;
  return state.league?.humans.find((h) => h.coachId === coachId)?.data?.user;
}
/** every human-coached team */
export function humanTeamIds(state: GameState): string[] {
  return humanCoachIds(state).map((c) => userFor(state, c)?.teamId).filter((t): t is string => !!t);
}
export function isHuman(state: GameState, teamId: string): boolean {
  if (teamId === state.user.teamId) return true;
  if (!state.league) return false;
  return state.league.humans.some((h) => userFor(state, h.coachId)?.teamId === teamId);
}
export function humanCoachOf(state: GameState, teamId: string): string | undefined {
  if (teamId === state.user.teamId) return state.user.coachId;
  return state.league?.humans.find((h) => userFor(state, h.coachId)?.teamId === teamId)?.coachId;
}
/** the user state of the human who coaches this team */
export function userOf(state: GameState, teamId: string): UserState | undefined {
  const c = humanCoachOf(state, teamId);
  return c ? userFor(state, c) : undefined;
}

/** run fn as another human coach (his Office, staff, locker room...), then swap back */
export function withHuman<T>(state: GameState, coachId: string, fn: () => T): T {
  const L = state.league;
  if (!L || coachId === state.user.coachId) return fn();
  const slot = L.humans.find((h) => h.coachId === coachId);
  if (!slot?.data) return fn();
  const prev = state.user.coachId;
  const prevSlot = L.humans.find((h) => h.coachId === prev);
  const mine = capture(state);
  if (prevSlot) prevSlot.data = mine; // so the swapped-out coach still counts as human meanwhile
  restore(state, slot.data);
  L.current = coachId;
  try {
    return fn();
  } finally {
    slot.data = capture(state);
    restore(state, mine);
    L.current = prev;
    if (prevSlot) prevSlot.data = undefined;
  }
}
/** run fn as whoever coaches this team (no-op swap for AI teams and the current coach) */
export function asTeam<T>(state: GameState, teamId: string, fn: () => T): T {
  const c = humanCoachOf(state, teamId);
  return c ? withHuman(state, c, fn) : fn();
}
/** run fn once as each human coach (the current one last) */
export function forEachHuman(state: GameState, fn: (teamId: string, coachId: string) => void) {
  const me = state.user.coachId;
  for (const c of [...humanCoachIds(state).filter((x) => x !== me), me]) {
    if (!humanCoachIds(state).includes(c)) continue;
    withHuman(state, c, () => fn(state.user.teamId, c));
  }
}

/** make another human the current coach (his turn at the keyboard) */
export function switchHuman(state: GameState, coachId: string) {
  const L = state.league;
  if (!L || coachId === state.user.coachId) return;
  const slot = L.humans.find((h) => h.coachId === coachId);
  const mineSlot = L.humans.find((h) => h.coachId === state.user.coachId);
  if (!slot?.data || !mineSlot) return;
  mineSlot.data = capture(state);
  restore(state, slot.data);
  slot.data = undefined;
  L.current = coachId;
}

/** start a league: the current coach becomes its first member */
export function ensureLeague(state: GameState): LeagueState {
  return (state.league ??= { humans: [{ coachId: state.user.coachId, name: coachName(state, state.user.coachId) }], current: state.user.coachId });
}
export function coachName(state: GameState, coachId: string) {
  const c = state.coaches[coachId];
  return c ? `${c.first} ${c.last}` : 'Coach';
}
/** a fresh, empty per-coach slot for a new human (filled in by world.addHumanCoach) */
export function blankCoachData(teamId: string, coachId: string): PerCoach {
  return {
    user: { teamId, coachId, hours: 0, hoursMax: 0, press: null, moments: [], board: [], expectation: '', expectationLevel: 0, offers: [], fired: false, retention: {}, scoutedTeams: [], achievements: [] },
    inbox: [],
  };
}
