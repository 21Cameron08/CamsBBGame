// New dynasty creation.
import { RNG, rng, setRng, clamp } from './rng';
import type { Coach, CoachArchetype, ClassYear, GameState, Pos, Team, Settings } from './types';
import { CONFERENCES } from '../data/conferences';
import { TEAMS } from '../data/teams';
import type { TeamDef } from '../data/types';
import { genPlayer } from './player';
import { emptyRecord, nilBudgetFor, autoStrategy, assignNumbers, refreshPower } from './team';
import { genAICoach, ARCHETYPE_INFO, blankSkills, setExpectations, hoursForWeek } from './coach';
import { allocateAiNil } from './nil';
import { buildCalendar, seasonLabel } from './calendar';
import { generateSchedule } from './schedule';
import { generateClass, seedInterest, seedUserBoard } from './recruiting';
import { computeRatings, runPoll } from './rankings';
import { addNews, addSocial } from './media';
import { introPresser } from './press';
import { welcomeInbox } from './events';

export const START_SEASON = 2026;
export const SAVE_VERSION = 1;

export interface NewGameOptions {
  seed?: number;
  saveName?: string;
  teamId: string;
  coach: { first: string; last: string; age: number; archetype: CoachArchetype; almaMater?: string; hometown?: string; face?: Record<string, unknown> };
  difficulty: Settings['difficulty'];
  /** custom team overrides (mods) keyed by team id */
  overrides?: Record<string, Partial<TeamDef>>;
}

function talentFor(prestige: number, tier: number): number {
  const tierBonus = [0, 2, 0.5, -1, -2][tier] ?? 0;
  return 50 + prestige * 0.28 + tierBonus;
}

export function buildRoster(state: GameState, team: Team, tier: number) {
  const T = talentFor(team.prestige, tier) + rng.normal(0, 2.3);
  const positions: Pos[] = rng.shuffle(['PG', 'PG', 'SG', 'SG', 'SG', 'SF', 'SF', 'SF', 'PF', 'PF', 'PF', 'C', 'C', 'C']);
  const classes: ClassYear[] = rng.shuffle(['FR', 'FR', 'FR', 'FR', 'SO', 'SO', 'SO', 'JR', 'JR', 'JR', 'SR', 'SR', 'SR', 'GR']);
  const offsets = [6, 4.5, 3, 1.5, 0.5, -1.5, -3, -4.5, -6, -8, -10, -12, -14, -16];
  const n = rng.int(13, 14);
  for (let i = 0; i < n; i++) {
    const cls = classes[i];
    const clsAdj = cls === 'FR' ? -2.5 : cls === 'SO' ? -0.5 : cls === 'JR' ? 0.8 : 1.8;
    const ovr = Math.round(clamp(T + offsets[i] + clsAdj + rng.normal(0, 2), 35, 92));
    const p = genPlayer({ pos: positions[i], ovr, cls, teamId: team.id });
    if (cls === 'GR') p.history.push('Graduate transfer');
    state.players[p.id] = p;
    team.roster.push(p.id);
  }
  assignNumbers(state, team);
}

export function createWorld(opts: NewGameOptions): GameState {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  setRng(new RNG(seed));
  const season = START_SEASON;
  const state: GameState = {
    version: SAVE_VERSION,
    saveId: rng.id('save'),
    saveName: opts.saveName ?? `${opts.coach.last} Dynasty`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    rngState: 0,
    season,
    startSeason: season,
    phase: 'preseason',
    day: 0,
    calendar: buildCalendar(season),
    conferences: CONFERENCES.map((c) => ({ ...c })),
    teams: {},
    players: {},
    coaches: {},
    recruits: {},
    schedule: [],
    boxScores: {},
    news: [],
    social: [],
    inbox: [],
    polls: [],
    ncaa: null,
    confTourneys: {},
    awards: [],
    draft: [],
    portal: null,
    user: {
      teamId: opts.teamId, coachId: '', hours: 40, hoursMax: 40, press: null, moments: [], board: [],
      expectation: '', expectationLevel: 0, offers: [], fired: false, retention: {}, scoutedTeams: [], achievements: [],
    },
    settings: { difficulty: opts.difficulty, sound: true, liveSpeed: 1, autoPress: false, confirmAdvance: false },
    champions: [],
    log: [],
    offseason: null,
  };

  for (const def0 of TEAMS) {
    const def = { ...def0, ...(opts.overrides?.[def0.id] ?? {}) } as TeamDef;
    const conf = state.conferences.find((c) => c.id === def.conf);
    const team: Team = {
      id: def.id, school: def.school, mascot: def.mascot, abbr: def.abbr, colors: [...def.colors] as [string, string],
      conf: def.conf, city: def.city, state: def.state, lat: def.lat, lng: def.lng, arena: def.arena, capacity: def.capacity,
      prestige: def.prestige, market: def.market, academics: def.academics, facilities: def.facilities,
      roster: [], coachId: '', strategy: { offense: 'balanced', defense: 'man', tempo: 3, starters: [], rotation: 9 },
      record: emptyRecord(), power: 0, srs: 0, net: 0, wab: 0, rating: 0, pollScore: 0, apRank: null, prevApRank: null,
      hype: clamp(30 + def.prestige * 0.5 + rng.normal(0, 8), 10, 95), nilBudget: 0, history: [],
    };
    team.nilBudget = nilBudgetFor(team, conf, team.hype);
    state.teams[team.id] = team;
    buildRoster(state, team, conf?.tier ?? 3);
    const coach = genAICoach(team.prestige, team.id);
    state.coaches[coach.id] = coach;
    team.coachId = coach.id;
  }

  // user coach
  const uteam = state.teams[opts.teamId];
  if (!uteam) throw new Error(`Unknown team ${opts.teamId}`);
  const displaced = state.coaches[uteam.coachId];
  if (displaced) delete state.coaches[displaced.id];
  const skills = blankSkills();
  for (const [k, v] of Object.entries(ARCHETYPE_INFO[opts.coach.archetype].skills)) skills[k as keyof typeof skills] += v as number;
  const diffRep = opts.difficulty === 'rookie' ? 10 : opts.difficulty === 'legend' ? -10 : 0;
  const ucoach: Coach = {
    id: rng.id('c'), first: opts.coach.first, last: opts.coach.last, age: opts.coach.age, face: opts.coach.face,
    teamId: uteam.id, isUser: true, archetype: opts.coach.archetype, rating: 50, skills, xp: 0, level: 1, skillPoints: 2,
    reputation: clamp(Math.max(30, uteam.prestige * 0.7) + diffRep, 10, 90), salary: Math.round((200000 + Math.exp(uteam.prestige * 0.05) * 30000) / 10000) * 10000,
    contractYears: 5, jobSecurity: 70, mediaRep: 55, almaMater: opts.coach.almaMater, hometown: opts.coach.hometown,
    career: [], trophies: [], careerW: 0, careerL: 0,
  };
  state.coaches[ucoach.id] = ucoach;
  uteam.coachId = ucoach.id;
  state.user.coachId = ucoach.id;

  for (const t of Object.values(state.teams)) {
    allocateAiNil(state, t);
    t.strategy = autoStrategy(state.teams[t.id].roster.map((id) => state.players[id]), state.coaches[t.coachId]);
    refreshPower(state, t);
  }
  // User's players: keep AI-assigned deals so nobody starts unpaid, but stagger expirations
  for (const id of uteam.roster) {
    const p = state.players[id];
    if (p.nil) p.nil.years = Math.max(1, Math.min(p.elig, rng.int(1, 3)));
  }
  state.schedule = generateSchedule(state);
  for (const r of generateClass(state, season + 1)) state.recruits[r.id] = r;
  computeRatings(state);
  seedInterest(state);
  seedUserBoard(state);
  const ranks = runPoll(state, 'Preseason AP Poll');
  setExpectations(state);
  state.user.hoursMax = hoursForWeek(state);
  state.user.hours = state.user.hoursMax;

  addNews(state, {
    kind: 'coach', headline: `${uteam.school} names ${ucoach.first} ${ucoach.last} head coach`,
    body: `${uteam.school} has hired ${ucoach.first} ${ucoach.last} to lead the ${uteam.mascot} into the ${seasonLabel(season)} season. "${rng.pick(['We found our leader.', 'This is a home-run hire.', 'The energy is already different.'])}" the athletic director said.`,
    teams: [uteam.id], important: true, personId: ucoach.id, personKind: 'coach',
  });
  addNews(state, { kind: 'rank', headline: `Preseason AP Poll: ${state.teams[ranks[0]].school} opens at No. 1`, body: `Top five: ${ranks.slice(0, 5).map((id, i) => `${i + 1}. ${state.teams[id].school}`).join(', ')}.`, teams: ranks.slice(0, 5) });
  addSocial(state, { handle: `${uteam.abbr}Nation`, name: `${uteam.school} Nation`, verified: false, kind: 'fan', text: `Welcome to ${uteam.school}, Coach ${ucoach.last}! Let's get it 🙌🏀`, teamId: uteam.id });
  addSocial(state, { handle: 'MarcusBellHoops', name: 'Marcus Bell', verified: true, kind: 'insider', text: `Sources: ${uteam.school} is finalizing a ${ucoach.contractYears}-year deal with ${ucoach.first} ${ucoach.last}. Intriguing hire.`, teamId: uteam.id });
  welcomeInbox(state);
  state.user.press = introPresser(state);
  state.rngState = rng.state;
  return state;
}
