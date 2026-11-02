// Runtime game-state types for Courtside Dynasty.
import type { ConferenceDef } from '../data/types';

export type Pos = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export const POSITIONS: Pos[] = ['PG', 'SG', 'SF', 'PF', 'C'];
export type ClassYear = 'FR' | 'SO' | 'JR' | 'SR' | 'GR';

export interface Ratings {
  ins: number; // finishing at the rim / post
  mid: number; // mid-range
  tp: number;  // three-point
  ft: number;  // free throw
  pas: number; // passing / vision
  hdl: number; // ball handling
  perD: number; // perimeter defense
  intD: number; // interior defense
  stl: number;
  blk: number;
  reb: number;
  ath: number; // athleticism / vertical
  spd: number;
  str: number;
  sta: number; // stamina
  iq: number;
}
export type RatingKey = keyof Ratings;
export const RATING_KEYS: RatingKey[] = ['ins', 'mid', 'tp', 'ft', 'pas', 'hdl', 'perD', 'intD', 'stl', 'blk', 'reb', 'ath', 'spd', 'str', 'sta', 'iq'];
export const RATING_LABELS: Record<RatingKey, string> = {
  ins: 'Finishing', mid: 'Mid-Range', tp: '3-Point', ft: 'Free Throw', pas: 'Passing', hdl: 'Handles',
  perD: 'Perimeter D', intD: 'Interior D', stl: 'Steals', blk: 'Blocks', reb: 'Rebounding',
  ath: 'Athleticism', spd: 'Speed', str: 'Strength', sta: 'Stamina', iq: 'Basketball IQ',
};

export type Trait =
  | 'leader' | 'gymRat' | 'loyal' | 'mercenary' | 'diva' | 'clutch' | 'hometown'
  | 'raw' | 'coachable' | 'hothead' | 'influencer' | 'glue' | 'scholar' | 'injuryProne';

export type Archetype =
  | 'Floor General' | 'Scoring Guard' | 'Sharpshooter' | 'Slasher' | '3&D Wing' | 'Two-Way Wing'
  | 'Point Forward' | 'Stretch Big' | 'Post Scorer' | 'Rim Runner' | 'Rim Protector' | 'Glass Cleaner' | 'Combo Guard';

export interface StatLine {
  gp: number; gs: number; min: number; pts: number;
  fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
  orb: number; drb: number; ast: number; stl: number; blk: number; tov: number; pf: number;
}
export interface SeasonLine extends StatLine { season: number; teamId: string; cls: ClassYear; ovr: number; }

export interface Injury { type: string; games: number; }

export interface NilDeal {
  /** annual amount in dollars */
  amount: number;
  /** remaining seasons (including current) */
  years: number;
}

export interface Player {
  id: string;
  first: string;
  last: string;
  pos: Pos;
  archetype: Archetype;
  height: number; // inches
  weight: number;
  hometown: string;
  state: string; // US state code or country name for internationals
  country: string; // 'USA' or country
  age: number;
  cls: ClassYear;
  /** seasons of eligibility remaining including the current one */
  elig: number;
  redshirted: boolean; // has used redshirt year
  redshirting: boolean; // redshirting the current season
  ratings: Ratings;
  ovr: number;
  pot: number;
  stars: number;
  traits: Trait[];
  teamId: string | null;
  num: number;
  morale: number; // 0-100
  nil: NilDeal | null;
  followers: number;
  injury: Injury | null;
  stats: StatLine;
  career: SeasonLine[];
  /** Notes like 'Transferred from X (2027)' */
  history: string[];
  /** Role promise made by coach on recruit/transfer */
  promise: 'star' | 'starter' | 'rotation' | null;
  /** season-level counters */
  starts: number;
  /** transfer flags */
  inPortal: boolean;
  transfers: number;
  /** user-visible scouting is per recruit; rostered players are fully known */
  draftStock?: number; // projected pick (1-60) or 0 for undrafted
  awards: string[];
}

export type OffStyle = 'balanced' | 'motion' | 'pace' | 'post' | 'drive' | 'three';
export type DefStyle = 'man' | 'packline' | 'zone' | 'press' | 'switch';
export interface Strategy {
  offense: OffStyle;
  defense: DefStyle;
  /** 1 (grind) .. 5 (blitz) */
  tempo: number;
  /** player ids in starting lineup order (PG..C); empty = auto */
  starters: string[];
  /** rotation size 7..11 */
  rotation: number;
}

export interface TeamRecord {
  w: number; l: number; cw: number; cl: number;
  hw: number; hl: number; aw: number; al: number; nw: number; nl: number;
  streak: number; // +n wins, -n losses
  pf: number; pa: number; poss: number;
  q1w: number; q1l: number; // quality wins/losses vs top teams
}

export interface TeamSeasonHistory {
  season: number;
  w: number; l: number; cw: number; cl: number;
  confFinish: number;
  confChamp: boolean;
  confTourneyChamp: boolean;
  ncaaSeed: number | null;
  /** e.g. 'Champion', 'Runner-up', 'Final Four', 'Elite Eight', 'Sweet 16', 'Round of 32', 'Round of 64', 'First Four', 'NIT', '' */
  postseason: string;
  apFinal: number | null;
  coachId: string;
  rating: number;
}

export interface Team {
  id: string;
  school: string;
  mascot: string;
  abbr: string;
  colors: [string, string];
  conf: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  arena: string;
  capacity: number;
  prestige: number; // dynamic 1-100
  market: number;
  academics: number;
  facilities: number;
  roster: string[];
  coachId: string;
  strategy: Strategy;
  record: TeamRecord;
  /** Cached rating numbers */
  power: number; // roster-derived strength (approx team ovr)
  srs: number;   // results-derived rating (pts/100 poss above avg-ish)
  net: number;   // NET-like rank (1..N), 0 if not computed
  wab: number;   // wins above bubble
  rating: number; // blended efficiency rating (points per game vs avg team)
  pollScore: number;
  apRank: number | null;
  prevApRank: number | null;
  hype: number; // fan excitement 0-100
  nilBudget: number; // annual NIL + revenue share pool
  history: TeamSeasonHistory[];
  /** dynamic offseason flags */
  coachChange?: boolean;
}

export type CoachArchetype = 'Recruiter' | 'Tactician' | 'Players Coach' | 'Developer' | 'Showman' | 'Portal King';
export interface CoachSkills {
  recruiting: number; // 0-10
  development: number;
  tactics: number;
  motivation: number;
  nil: number;
  media: number;
  portal: number;
}
export interface CoachSeason {
  season: number;
  teamId: string;
  w: number; l: number; cw: number; cl: number;
  postseason: string;
  seed: number | null;
}
export interface Coach {
  id: string;
  first: string;
  last: string;
  age: number;
  /** For the user coach, a custom FaceConfig object; for AI coaches undefined (generated from id). */
  face?: Record<string, unknown>;
  teamId: string | null;
  isUser: boolean;
  archetype: CoachArchetype;
  /** 1-100 coaching quality (AI) */
  rating: number;
  skills: CoachSkills;
  xp: number;
  level: number;
  skillPoints: number;
  reputation: number; // 0-100
  salary: number;
  contractYears: number;
  jobSecurity: number; // 0-100
  mediaRep: number; // 0-100 relationship with press
  almaMater?: string;
  hometown?: string;
  career: CoachSeason[];
  trophies: Trophy[];
  careerW: number;
  careerL: number;
}
export interface Trophy { season: number; kind: 'natl' | 'f4' | 'conf' | 'ctourn' | 'coy' | 'e8' | 's16'; label: string; teamId: string; }

export type RecruitType = 'HS' | 'JUCO' | 'INTL' | 'PREP';
export interface RecruitPriorities {
  nil: number; pt: number; prestige: number; proximity: number; coach: number; pro: number; academics: number; winning: number;
}
export interface RecruitSchool {
  teamId: string;
  interest: number; // 0-100
  offered: boolean;
  nilOffer: number;
  visited: boolean;
  /** weekly effort accumulated */
  rel: number;
}
export interface Recruit extends Omit<Player, 'teamId' | 'stats' | 'career' | 'nil' | 'cls' | 'elig' | 'redshirted' | 'redshirting' | 'promise' | 'starts' | 'inPortal' | 'transfers' | 'morale'> {
  type: RecruitType;
  rank: number; // national rank (1 = best)
  posRank: number;
  priorities: RecruitPriorities;
  schools: RecruitSchool[];
  committed: string | null;
  committedWeek: number | null;
  signed: boolean;
  /** user's scouting progress 0-100 */
  scouted: number;
  /** expected annual NIL */
  nilAsk: number;
  /** week they'd like to decide by (1..30) */
  decisionWeek: number;
  /** user actions this week (to enforce limits) */
  userWeek: { call: boolean; text: boolean; asst: boolean; hc: boolean; visit: boolean; scout: number };
  /** promised role by user */
  userPromise: 'star' | 'starter' | 'rotation' | null;
  classYear: number; // season they'd enroll (e.g. 2027 means 2027-28)
  lat: number;
  lng: number;
  /** headline storyline, e.g. 'Son of a former NBA player' */
  storyline?: string;
}

export type GameType = 'nc' | 'conf' | 'ctourn' | 'ncaa' | 'exh';
export interface ScheduledGame {
  id: string;
  day: number;
  home: string;
  away: string;
  neutral: boolean;
  type: GameType;
  /** Event name for neutral-site MTEs, conference tourneys, NCAA rounds */
  event?: string;
  round?: number;
  played: boolean;
  hs?: number;
  as?: number;
  ot?: number;
  poss?: number;
  /** id of player of the game */
  potg?: string;
  /** network the game is televised on (flavor) */
  tv?: string;
}

export interface BoxPlayer {
  id: string;
  name: string;
  pos: Pos;
  num: number;
  starter: boolean;
  min: number; pts: number; fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
  orb: number; drb: number; ast: number; stl: number; blk: number; tov: number; pf: number;
  pm: number;
}
export interface BoxScore {
  gameId: string;
  home: string;
  away: string;
  hs: number;
  as: number;
  ot: number;
  poss: number;
  players: [BoxPlayer[], BoxPlayer[]]; // [home, away]
  /** halftime score */
  half: [number, number];
  /** cumulative score snapshots for chart: [elapsedSec, home, away] */
  flow: [number, number, number][];
  largestLead: [number, number];
  shots?: ShotMark[];
}
export interface ShotMark { team: 0 | 1; x: number; y: number; made: boolean; three: boolean; pid: string; }

export interface NewsItem {
  id: string;
  season: number;
  day: number;
  date: string;
  kind: 'recap' | 'upset' | 'rank' | 'recruit' | 'portal' | 'coach' | 'injury' | 'award' | 'draft' | 'nil' | 'feature' | 'bracket' | 'milestone' | 'user';
  headline: string;
  body: string;
  teams: string[];
  important?: boolean;
  /** optional player/coach to show a face for */
  personId?: string;
  personKind?: 'player' | 'coach' | 'recruit';
}

export interface SocialPost {
  id: string;
  day: number;
  season: number;
  handle: string;
  name: string;
  verified: boolean;
  kind: 'fan' | 'insider' | 'player' | 'recruit' | 'school' | 'analyst' | 'hater';
  text: string;
  likes: number;
  reposts: number;
  teamId?: string;
  personId?: string;
}

export interface InboxChoice {
  label: string;
  /** short preview of effects shown in UI */
  hint?: string;
  effects: Effect[];
  /** result text shown after choosing */
  result?: string;
}
export type Effect =
  | { kind: 'morale'; target: 'team' | string; delta: number }
  | { kind: 'hype'; delta: number }
  | { kind: 'security'; delta: number }
  | { kind: 'mediaRep'; delta: number }
  | { kind: 'nilBudget'; delta: number }
  | { kind: 'rep'; delta: number }
  | { kind: 'xp'; delta: number }
  | { kind: 'followers'; target: string; delta: number }
  | { kind: 'injury'; target: string; games: number }
  | { kind: 'rating'; target: string; key: RatingKey; delta: number }
  | { kind: 'recruitInterest'; delta: number }
  | { kind: 'hours'; delta: number };

export interface InboxItem {
  id: string;
  day: number;
  season: number;
  from: string;
  fromRole: string;
  subject: string;
  body: string;
  choices: InboxChoice[];
  resolved: boolean;
  chosen?: number;
  /** person to show portrait of */
  personId?: string;
  personKind?: 'player' | 'coach' | 'staff';
  priority?: boolean;
}

export interface PressQuestion {
  reporter: string;
  outlet: string;
  text: string;
  answers: { tone: 'confident' | 'humble' | 'deflect' | 'fiery' | 'praise' | 'joke'; text: string; effects: Effect[] }[];
}
export interface PressConference {
  id: string;
  title: string;
  context: string;
  questions: PressQuestion[];
}

export interface BracketGame {
  id: string;
  round: number;
  slot: number;
  /** seeds as shown */
  seeds: [number | null, number | null];
  teams: [string | null, string | null];
  winner: string | null;
  score?: [number, number];
  gameId?: string;
  region?: string;
  /** First Four: which [round-1 slot, side] the winner feeds */
  feed?: [number, number];
}
export interface TourneyBracket {
  name: string;
  confId?: string;
  rounds: BracketGame[][];
  champion: string | null;
  /** seed map teamId -> seed */
  seeds: Record<string, number>;
  regions?: string[];
  dayForRound: number[];
  roundNames: string[];
}

export interface Award { season: number; name: string; playerId?: string; coachId?: string; teamId: string; /** display name snapshot (players get purged after leaving) */ who?: string; }

export interface DraftPick { season: number; pick: number; round: number; playerId: string; name: string; teamId: string; nbaTeam: string; pos: Pos; }

export type Phase =
  | 'preseason'
  | 'regular'
  | 'confTourney'
  | 'selection'
  | 'ncaa'
  | 'seasonEnd'
  | 'declarations'
  | 'portal'
  | 'signing'
  | 'draft'
  | 'progression';

export interface CalendarDay {
  day: number;
  date: string; // ISO date
  label: string; // 'Tue, Nov 3'
  week: number;
  phase: Phase;
}

export interface PortalOffer { teamId: string; nil: number; promise: 'star' | 'starter' | 'rotation' | null; }
export interface PortalState {
  round: number; // 0..maxRounds
  maxRounds: number;
  /** player ids currently in the portal */
  pool: string[];
  offers: Record<string, PortalOffer[]>;
  /** player id -> asking NIL */
  asks: Record<string, number>;
  /** player id -> previous team */
  from: Record<string, string>;
  log: string[];
}

export interface Settings {
  difficulty: 'rookie' | 'pro' | 'legend';
  sound: boolean;
  liveSpeed: number;
  autoPress: boolean;
  /** let assistants run recruiting + portal for the user's team */
  autoRecruit?: boolean;
  confirmAdvance: boolean;
}

export interface UserState {
  teamId: string;
  coachId: string;
  /** recruiting hours left this week */
  hours: number;
  hoursMax: number;
  /** pending press conference */
  press: PressConference | null;
  /** queued celebratory moments for UI (commits, wins, titles) */
  moments: Moment[];
  /** player ids on user's recruiting board */
  board: string[];
  /** AD expectations for the season */
  expectation: string;
  expectationLevel: number; // 0-6 scale
  offers: JobOffer[];
  fired: boolean;
  /** retention: players requesting meetings during portal */
  retention: Record<string, { ask: number; resolved: boolean; staying?: boolean; prob?: number }>;
  scoutedTeams: string[];
  achievements: string[];
}

export interface JobOffer { teamId: string; salary: number; years: number; pitch: string; }

export type Moment =
  | { kind: 'commit'; recruitId: string; teamId: string; others: string[] }
  | { kind: 'win'; gameId: string; big: boolean }
  | { kind: 'title'; label: string; teamId: string }
  | { kind: 'levelUp'; level: number }
  | { kind: 'fired' }
  | { kind: 'award'; label: string; personId: string };

export interface GameState {
  version: number;
  saveId: string;
  saveName: string;
  createdAt: number;
  updatedAt: number;
  rngState: number;
  season: number; // e.g. 2026 means the 2026-27 season
  startSeason: number;
  phase: Phase;
  day: number;
  calendar: CalendarDay[];
  conferences: ConferenceDef[];
  teams: Record<string, Team>;
  players: Record<string, Player>;
  coaches: Record<string, Coach>;
  recruits: Record<string, Recruit>;
  schedule: ScheduledGame[];
  boxScores: Record<string, BoxScore>;
  news: NewsItem[];
  social: SocialPost[];
  inbox: InboxItem[];
  polls: { day: number; week: number; ranks: string[]; label: string }[];
  ncaa: TourneyBracket | null;
  confTourneys: Record<string, TourneyBracket>;
  awards: Award[];
  draft: DraftPick[];
  portal: PortalState | null;
  user: UserState;
  settings: Settings;
  /** champions by season */
  champions: { season: number; teamId: string; runnerUp: string; score: string; mop?: string }[];
  /** free-form log for debugging/history */
  log: string[];
  offseason: OffseasonState | null;
}

export interface OffseasonState {
  graduating: string[];
  declared: string[];
  /** player id -> ovr change from development */
  progression: Record<string, number>;
  /** recruits signed by user this cycle */
  signed: string[];
  /** coaching carousel headlines */
  carousel: string[];
  /** user's season summary */
  summary: string;
  achieved: number;
  securityDelta: number;
}
