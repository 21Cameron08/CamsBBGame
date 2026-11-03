// Press conferences. Questions come from large pools that react to the moment, the season and
// the seasons before it. The media remembers what you said on the record and brings it back up.
import { rng } from './rng';
import type { BoxPlayer, BoxScore, Coach, Effect, GameState, Player, PressClaim, PressClaimKind, PressConference, PressMemory, PressQuestion, ScheduledGame, Team, TeamSeasonHistory } from './types';
import type { ConferenceDef } from '../data/types';
import { INSIDERS } from './media';
import { FIRST_NAMES, LAST_NAMES } from '../data/names';
import { RIVALRIES } from '../data/rivalries';
import { teamPlayers } from './team';
import { resumeMetrics } from './scheduling';
import { confStandings, selectionScore, REGIONS, type FieldEntry } from './rankings';
import { draftScore, fmtMoney } from './player';
import { seasonLabel } from './calendar';
import { classRankings } from './recruiting';
import { FOCUS_INFO } from './development';

type Tone = PressQuestion['answers'][number]['tone'];
type Answer = PressQuestion['answers'][number];

// ---------------- Reporters ----------------
type Role = 'beat' | 'national' | 'tv' | 'student' | 'analytics' | 'columnist' | 'opp';
const ROLE_LABEL: Record<Role, string> = {
  beat: 'Beat writer', national: 'National insider', tv: 'Local TV', student: 'Student radio', analytics: 'Analytics', columnist: 'Columnist', opp: 'Visiting beat writer',
};
const PAPERS = ['Courier', 'Tribune', 'Herald', 'Gazette', 'Ledger', 'Press', 'Star', 'Journal', 'Register', 'Times'];
const COLUMNISTS = [
  { name: 'Bill Hargrove', outlet: 'The Athletic Wire' },
  { name: 'Tasha Whitlock', outlet: 'The Morning Ledger' },
  { name: 'Greg Lindqvist', outlet: 'Full Court Press' },
];
const ANALYSTS = [
  { name: 'Priya Natarajan', outlet: 'Hoops Insider Analytics' },
  { name: 'Sam Okafor', outlet: 'The Bracket Report' },
  { name: 'Jonah Feld', outlet: 'Box Score Media' },
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function localName(seed: string) {
  const h = hash(seed);
  return `${FIRST_NAMES[h % FIRST_NAMES.length]} ${LAST_NAMES[(h >>> 9) % LAST_NAMES.length]}`;
}
/** Each program has its own beat writer, who covers every presser */
function beatWriter(t: Team) {
  const h = hash(`beat:${t.id}`);
  return { reporter: localName(`beat:${t.id}`), outlet: `The ${t.city} ${PAPERS[h % PAPERS.length]}` };
}
function reporterFor(role: Role, team: Team, opp?: Team) {
  switch (role) {
    case 'beat': return beatWriter(team);
    case 'opp': return beatWriter(opp ?? team);
    case 'tv': {
      const h = hash(`tv:${team.id}`);
      return { reporter: localName(`tv:${team.id}`), outlet: `${['Channel 4', 'Channel 7', 'Channel 11', 'Channel 13', 'News 9', 'Fox 5'][h % 6]} Sports` };
    }
    case 'student': return { reporter: localName(`student:${team.id}:${rng.int(0, 2)}`), outlet: `${team.school} Student Radio` };
    case 'analytics': { const a = rng.pick(ANALYSTS); return { reporter: a.name, outlet: a.outlet }; }
    case 'columnist': { const c = rng.pick(COLUMNISTS); return { reporter: c.name, outlet: c.outlet }; }
    default: { const i = rng.pick(INSIDERS); return { reporter: i.name, outlet: i.outlet }; }
  }
}

// ---------------- Building blocks ----------------
const A = (tone: Tone, text: string, effects: Effect[], claim?: Answer['claim']): Answer => (claim ? { tone, text, effects, claim } : { tone, text, effects });
const v = (...xs: string[]) => rng.pick(xs);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ord = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], m = n % 100; return n + (s[(m - 20) % 10] || s[m] || s[0]); };
const nm = (p: Player) => `${p.first} ${p.last}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const list = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

interface Cand {
  key: string;
  topic: string;
  w: number;
  lead?: boolean;
  build: () => PressQuestion;
  onAsk?: () => void;
}

interface QOpts { role: Role; tag?: string; quote?: { text: string; when: string }; opp?: Team }
function makeQ(team: Team, o: QOpts, text: string, answers: Answer[]): PressQuestion {
  const r = reporterFor(o.role, team, o.opp);
  const out: PressQuestion = { ...r, text, answers, role: o.role === 'opp' && o.opp ? `${o.opp.abbr} beat writer` : ROLE_LABEL[o.role] };
  if (o.tag) out.tag = o.tag;
  if (o.quote) out.quote = o.quote;
  return out;
}

// ---------------- Memory ----------------
export function pressMemory(state: GameState): PressMemory {
  if (!state.user.pressMemory) state.user.pressMemory = { asked: [], claims: [] };
  return state.user.pressMemory;
}

function recency(state: GameState, key: string): number {
  const a = pressMemory(state).asked.find((x) => x.key === key);
  if (!a) return 1;
  if (a.season === state.season) return state.day - a.day < 10 ? 0.05 : 0.2;
  if (a.season === state.season - 1) return 0.6;
  return 1;
}

/** Pick n questions: leads first, then a weighted mix that avoids repeats and doubles up on no topic */
function choose(state: GameState, cands: Cand[], n: number): PressQuestion[] {
  const out: Cand[] = [];
  const topics = new Set<string>();
  for (const c of cands.filter((x) => x.lead).sort((a, b) => b.w - a.w)) {
    if (out.length >= n) break;
    if (topics.has(c.topic)) continue;
    out.push(c);
    topics.add(c.topic);
  }
  let pool = cands.filter((c) => !c.lead && !topics.has(c.topic) && c.w > 0);
  while (out.length < n && pool.length) {
    const c = rng.weighted(pool, pool.map((x) => x.w * recency(state, x.key)));
    out.push(c);
    topics.add(c.topic);
    pool = pool.filter((x) => !topics.has(x.topic));
  }
  const mem = pressMemory(state);
  const qs: PressQuestion[] = [];
  for (const c of out) {
    mem.asked = [{ key: c.key, season: state.season, day: state.day }, ...mem.asked.filter((a) => a.key !== c.key)].slice(0, 150);
    c.onAsk?.();
    qs.push({ ...c.build(), key: c.key });
  }
  return qs;
}

function openClaims(state: GameState, kinds: PressClaimKind[], f: (c: PressClaim) => boolean = () => true): PressClaim[] {
  return pressMemory(state).claims.filter((c) => !c.followed && kinds.includes(c.kind) && f(c));
}
function quoteOf(state: GameState, c: PressClaim) {
  const said = c.said ?? c.season;
  return { text: c.text, when: said === state.season ? cap(c.when) : `${cap(c.when)}, ${seasonLabel(said)}` };
}

const IN_SEASON = ['preseason', 'regular', 'confTourney', 'selection', 'ncaa'];

/** Record a bold statement so the media can hold the coach to it later */
export function recordClaim(state: GameState, pc: PressConference, a: Answer) {
  if (!a.claim) return;
  const mem = pressMemory(state);
  // things said in the offseason are about next season
  const about = IN_SEASON.includes(state.phase) ? state.season : state.season + 1;
  mem.claims.push({ kind: a.claim.kind, subject: a.claim.subject, season: about, said: state.season, day: state.day, teamId: state.user.teamId, text: a.text, when: pc.when ?? 'at a press conference' });
  mem.claims = mem.claims.slice(-40);
}

// ---------------- Context ----------------
interface Ctx {
  state: GameState;
  team: Team;
  coach: Coach;
  uid: string;
  conf?: ConferenceDef;
  players: Player[];
  star?: Player;
  /** completed seasons at this school */
  tenure: number;
  /** last completed season for this program */
  last?: TeamSeasonHistory;
  /** recap of last season if the user ran this program */
  recap?: PressMemory['recap'];
  /** completed seasons since the last NCAA appearance (only counts seasons we've played) */
  drought: number;
}

function ctxFor(state: GameState): Ctx {
  const team = state.teams[state.user.teamId];
  const coach = state.coaches[state.user.coachId];
  const players = teamPlayers(state, team.id).sort((a, b) => b.ovr - a.ovr);
  const hist = team.history;
  // in the offseason, the season that just ended counts as "last season"
  const inSeason = IN_SEASON.includes(state.phase);
  const prior = hist.filter((h) => (inSeason ? h.season < state.season : h.season <= state.season));
  const last = prior[prior.length - 1];
  const mem = pressMemory(state);
  const recap = mem.recap && mem.recap.season === state.season - 1 && mem.recap.teamId === team.id ? mem.recap : undefined;
  let drought = 0;
  for (let i = prior.length - 1; i >= 0; i--) { if (prior[i].ncaaSeed != null) break; drought++; }
  return {
    state, team, coach, uid: team.id, conf: state.conferences.find((c) => c.id === team.conf), players, star: players[0],
    tenure: coach.career.filter((c) => c.teamId === team.id && c.season < state.season).length,
    last, recap, drought: prior.length >= 2 ? drought : 0,
  };
}

function nbaRank(state: GameState, p: Player): number {
  const mine = draftScore(p);
  let rank = 1;
  for (const o of Object.values(state.players)) if (o.teamId && o.id !== p.id && draftScore(o) > mine) rank++;
  return rank;
}
function nbaLabel(rank: number) {
  return rank <= 5 ? 'a top-five pick' : rank <= 14 ? 'a lottery pick' : rank <= 30 ? 'a first-round pick' : 'a second-round pick';
}
function selectionRank(state: GameState, teamId: string): number {
  const sorted = Object.values(state.teams).sort((a, b) => selectionScore(b) - selectionScore(a));
  return sorted.findIndex((t) => t.id === teamId) + 1;
}
function rivalOf(a: string, b: string) {
  return RIVALRIES.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
}
function confName(c: Ctx) { return c.conf?.short ?? 'league'; }
function postseasonPhrase(h: TeamSeasonHistory) {
  if (!h.postseason) return h.ncaaSeed ? 'in the NCAA Tournament' : 'without an NCAA bid';
  if (h.postseason === 'Champion') return 'with a national championship';
  if (h.postseason === 'Runner-up') return 'in the national championship game';
  return `in the ${h.postseason}`;
}
const DEEP = ['Final Four', 'Runner-up', 'Champion'];

// ======================================================================
// Introductory press conference
// ======================================================================
export function introPresser(state: GameState, opts: { fromTeamId?: string; fired?: boolean } = {}): PressConference {
  const c = ctxFor(state);
  const { team, coach } = c;
  const from = opts.fromTeamId ? state.teams[opts.fromTeamId] : undefined;
  const yearsAtOld = from ? coach.career.filter((x) => x.teamId === from.id).length : 0;
  const cands: Cand[] = [];

  cands.push({
    key: 'intro.why', topic: 'why', w: 10, lead: true,
    build: () => makeQ(team, { role: 'beat' }, from && !opts.fired
      ? v(`You leave ${from.school} after ${plural(yearsAtOld, 'season')}. Why ${team.school}, and why now?`, `Coach, ${from.school} fans are stunned this morning. What made ${team.school} the job you couldn't turn down?`)
      : from && opts.fired
        ? v(`Coach, a few weeks ago you were let go at ${from.school}. What made ${team.school} the right place to start over?`, `It's been a whirlwind few weeks since ${from.school}. Why is ${team.school} the right fit?`)
        : v(`Coach, welcome to ${team.school}. What made this the right job for you?`, `Coach, why ${team.school}? What sold you on this place?`, `You had options. Why did you choose ${team.school}?`), [
      A('humble', v(`This place has a proud history. I'm just grateful for the opportunity and ready to work.`, `The people. From the first phone call, it felt like home. I'm honored to be here.`), [{ kind: 'mediaRep', delta: 4 }, { kind: 'security', delta: 2 }]),
      A('confident', v(`We didn't come here to rebuild. We came here to win, and win big.`, `I believe you can win big here, right away. I wouldn't have come otherwise.`), [{ kind: 'hype', delta: 8 }, { kind: 'security', delta: -2 }, { kind: 'recruitInterest', delta: 3 }], { kind: 'beatExpect' }),
      A('joke', v(`Honestly? The barbecue. And the fans. Mostly the barbecue.`, `My wife said yes before I did. I just signed where she told me to.`), [{ kind: 'hype', delta: 4 }, { kind: 'mediaRep', delta: 3 }]),
    ]),
  });

  const leftClaim = from ? openClaims(state, ['notLeaving'], (x) => x.teamId === from.id && x.season >= state.season)[0] : undefined;
  if (leftClaim) {
    cands.push({
      key: 'intro.notLeaving', topic: 'loyalty', w: 12, lead: true,
      onAsk: () => { leftClaim.followed = true; },
      build: () => makeQ(team, { role: 'columnist', tag: 'Follow-up', quote: quoteOf(state, leftClaim) }, `Not long ago you told us you weren't going anywhere. What changed?`, [
        A('humble', `I meant it when I said it. Then a once-in-a-lifetime opportunity came along, and I owe it to my family to take it.`, [{ kind: 'mediaRep', delta: 1 }, { kind: 'hype', delta: 2 }]),
        A('joke', `I wasn't going anywhere... until I was. That's coaching.`, [{ kind: 'mediaRep', delta: -1 }, { kind: 'hype', delta: 3 }]),
        A('deflect', `I'm focused on ${team.school}. That's all I'm going to say about it.`, [{ kind: 'mediaRep', delta: -3 }]),
      ]),
    });
  }

  if (from) {
    cands.push({
      key: opts.fired ? 'intro.fired' : 'intro.oldFans', topic: 'past', w: 7,
      build: () => opts.fired
        ? makeQ(team, { role: 'national', tag: 'Your past' }, `What did you learn from how things ended at ${from.school}?`, [
          A('humble', `A lot. I made mistakes, and I own them. I'm a better coach today because of it.`, [{ kind: 'mediaRep', delta: 4 }, { kind: 'security', delta: 2 }]),
          A('fiery', `That I'm going to prove some people very wrong.`, [{ kind: 'hype', delta: 5 }, { kind: 'morale', target: 'team', delta: 2 }, { kind: 'mediaRep', delta: -1 }]),
          A('deflect', `That chapter's closed. I'm only looking forward.`, [{ kind: 'mediaRep', delta: -1 }]),
        ])
        : makeQ(team, { role: 'national', tag: 'Your past' }, `What's your message to ${from.school} fans who feel let down this morning?`, [
          A('praise', `Thank you. Those were some of the best years of my life, and those players will always be family.`, [{ kind: 'mediaRep', delta: 3 }]),
          A('humble', `I understand the frustration. I hope in time they'll see this was right for everyone.`, [{ kind: 'mediaRep', delta: 2 }]),
          A('confident', `I'm a ${team.mascot} now. All in. That's my message.`, [{ kind: 'hype', delta: 5 }, { kind: 'mediaRep', delta: -2 }]),
        ]),
    });
  }

  if (coach.almaMater && (coach.almaMater === team.id || coach.almaMater === team.school)) {
    cands.push({
      key: 'intro.home', topic: 'home', w: 9,
      build: () => makeQ(team, { role: 'tv' }, `You played here. What does it mean to come home and lead this program?`, [
        A('humble', `Everything. I walked these halls as a player. Now I get to give back to the place that made me.`, [{ kind: 'hype', delta: 6 }, { kind: 'mediaRep', delta: 3 }]),
        A('fiery', `I know what this program should be, because I lived it. We're going to get it back there.`, [{ kind: 'hype', delta: 8 }, { kind: 'security', delta: -1 }]),
        A('joke', `Same gym, same locker room. Thankfully, they upgraded the showers.`, [{ kind: 'hype', delta: 4 }, { kind: 'mediaRep', delta: 3 }]),
      ]),
    });
  }

  if (c.last) {
    const h = c.last;
    const good = DEEP.includes(h.postseason) || h.postseason === 'Elite Eight' || h.postseason === 'Sweet 16' || h.w - h.l >= 8;
    const middling = !good && h.w > h.l && h.ncaaSeed != null;
    cands.push({
      key: good ? 'intro.inheritGood' : middling ? 'intro.inheritMid' : 'intro.inherit', topic: 'program', w: 8, lead: true,
      build: () => middling
        ? makeQ(team, { role: 'beat', tag: 'Last season' }, `This program went ${h.w}-${h.l} and made the tournament last year. What's the next step?`, [
          A('confident', `The second weekend, and beyond. We're not here to just make the field.`, [{ kind: 'hype', delta: 5 }, { kind: 'security', delta: -2 }], { kind: 'beatExpect' }),
          A('humble', `Build on what's here. There's a good foundation, and I want to respect it.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'security', delta: 2 }]),
          A('fiery', `Good isn't the goal. We're chasing great.`, [{ kind: 'hype', delta: 4 }, { kind: 'morale', target: 'team', delta: 1 }]),
        ])
        : good
        ? makeQ(team, { role: 'beat', tag: 'Last season' }, `You're taking over a team that went ${h.w}-${h.l} and finished ${postseasonPhrase(h)}. Is the pressure on to keep it going?`, [
          A('confident', `Pressure is a privilege. We're going to build on it, not just maintain it.`, [{ kind: 'hype', delta: 5 }, { kind: 'security', delta: -1 }], { kind: 'tourney' }),
          A('humble', `My predecessor did a great job. My job is to honor that and keep growing.`, [{ kind: 'mediaRep', delta: 4 }, { kind: 'security', delta: 2 }]),
          A('deflect', `Last year's team was last year's team. This is a new group.`, [{ kind: 'mediaRep', delta: -1 }]),
        ])
        : makeQ(team, { role: 'beat', tag: 'Last season' }, `This program went ${h.w}-${h.l} last year${h.ncaaSeed ? '' : ' and missed the NCAA Tournament'}. How quickly can you turn it around?`, [
          A('confident', `We'll be dancing in March. Hold me to it.`, [{ kind: 'hype', delta: 8 }, { kind: 'security', delta: -3 }], { kind: 'tourney' }),
          A('humble', `It'll take time to do it right. I'm here to build something that lasts.`, [{ kind: 'security', delta: 3 }, { kind: 'mediaRep', delta: 2 }]),
          A('fiery', `Losing stops now. Everybody in that locker room will feel the difference on day one.`, [{ kind: 'hype', delta: 5 }, { kind: 'morale', target: 'team', delta: -1 }]),
        ]),
    });
  } else {
    cands.push({
      key: 'intro.timeline', topic: 'program', w: 6,
      build: () => makeQ(team, { role: 'columnist' }, `What's a fair timeline to judge your work here?`, [
        A('confident', `Judge me in year one. I don't believe in rebuilding years.`, [{ kind: 'hype', delta: 6 }, { kind: 'security', delta: -3 }], { kind: 'beatExpect' }),
        A('humble', `Give us three years. By then you'll know exactly who we are.`, [{ kind: 'security', delta: 4 }, { kind: 'mediaRep', delta: 2 }]),
        A('joke', `Judge me after I learn where the parking lot is.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'hype', delta: 2 }]),
      ]),
    });
  }

  cands.push({
    key: 'intro.nil', topic: 'nil', w: 6,
    build: () => makeQ(team, { role: 'national' }, v(`How will you approach NIL and the transfer portal?`, `College basketball runs on NIL and the portal now. What's your philosophy?`), [
      A('confident', `We're going to be aggressive. Our collective is going to be one of the best in the country.`, [{ kind: 'nilBudget', delta: 150000 }, { kind: 'hype', delta: 3 }]),
      A('humble', `Relationships first. The money matters, but development and culture matter more.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'recruitInterest', delta: 2 }]),
      A('deflect', `We'll be smart. I'm not going to get into specifics today.`, [{ kind: 'mediaRep', delta: -1 }]),
    ]),
  });
  cands.push({
    key: 'intro.fans', topic: 'fans', w: 5,
    build: () => makeQ(team, { role: 'tv' }, v(`What's your message to the fan base?`, `What do you want ${team.school} fans to know about you?`), [
      A('fiery', `Pack the gym. Every night. Make this the toughest place to play in America.`, [{ kind: 'hype', delta: 7 }]),
      A('humble', `Be patient with us, and I promise we'll give you a team you're proud of.`, [{ kind: 'security', delta: 3 }, { kind: 'hype', delta: 2 }]),
      A('confident', `Clear your calendars for the first weekend in April.`, [{ kind: 'hype', delta: 10 }, { kind: 'security', delta: -4 }], { kind: 'deepRun' }),
    ]),
  });
  if (c.star) {
    const s = c.star;
    cands.push({
      key: 'intro.star', topic: 'roster', w: 6,
      build: () => makeQ(team, { role: 'beat' }, `${nm(s)} is the best player on this roster. Have you talked to him about sticking around?`, [
        A('praise', `We've talked. He's a big part of what we're building, and I told him that.`, [{ kind: 'morale', target: s.id, delta: 7 }]),
        A('humble', `Every player in that room starts with a clean slate, including him.`, [{ kind: 'morale', target: 'team', delta: 2 }, { kind: 'morale', target: s.id, delta: -3 }]),
        A('deflect', `I'll keep those conversations private.`, [{ kind: 'mediaRep', delta: -1 }]),
      ]),
    });
  }
  cands.push({
    key: 'intro.recruit', topic: 'recruiting', w: 5,
    build: () => makeQ(team, { role: 'beat' }, `What's your pitch to the top prospects in ${team.state}?`, [
      A('confident', `Stay home and build something special. You don't have to leave to win.`, [{ kind: 'recruitInterest', delta: 3 }, { kind: 'hype', delta: 2 }]),
      A('humble', `We'll develop you, we'll care about you, and we'll get you ready for the next level.`, [{ kind: 'recruitInterest', delta: 2 }, { kind: 'mediaRep', delta: 2 }]),
      A('joke', `I already know where every gym in this state is. I'm coming for you.`, [{ kind: 'recruitInterest', delta: 2 }, { kind: 'hype', delta: 2 }]),
    ]),
  });
  cands.push({
    key: 'intro.style', topic: 'style', w: 4,
    build: () => makeQ(team, { role: 'tv' }, `What will your teams look like on the floor?`, [
      A('fiery', `We're going to guard. Every possession, for 40 minutes. That's non-negotiable.`, [{ kind: 'morale', target: 'team', delta: 1 }, { kind: 'mediaRep', delta: 2 }]),
      A('confident', `Fast and fun. Fans are going to love watching us play.`, [{ kind: 'hype', delta: 5 }]),
      A('humble', `We'll fit the system to our players, not the other way around.`, [{ kind: 'morale', target: 'team', delta: 3 }]),
    ]),
  });
  return { id: rng.id('pc'), title: 'Introductory Press Conference', context: `You are introduced as the new head coach of ${team.school}. The cameras are rolling.`, when: 'at your introductory press conference', questions: choose(state, cands, 4) };
}

// ======================================================================
// Preseason media day
// ======================================================================
export function mediaDayPresser(state: GameState): PressConference {
  const c = ctxFor(state);
  const { team, coach } = c;
  const cands: Cand[] = [];
  const rank = team.apRank;

  cands.push({
    key: 'md.poll', topic: 'poll', w: 10, lead: true,
    build: () => makeQ(team, { role: 'national' }, rank
      ? v(`The preseason poll has you at No. ${rank}. Your reaction?`, `No. ${rank} in the preseason AP poll. Does that number mean anything to you?`, `Voters put you at No. ${rank} to start the year. Too high, too low, or just right?`)
      : v(`The preseason poll doesn't have ${team.school} ranked. Your reaction?`, `Nobody has you in the preseason Top 25. Does that bother you?`), rank ? [
      A('humble', `Rankings in October don't mean anything. We haven't done anything yet.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'morale', target: 'team', delta: 2 }]),
      A('confident', `We belong there. Honestly, we should be higher.`, [{ kind: 'hype', delta: 6 }, { kind: 'morale', target: 'team', delta: 3 }, { kind: 'security', delta: -2 }], { kind: 'rankedHigher', subject: String(rank) }),
      A('deflect', `I'll let you guys worry about the polls.`, [{ kind: 'mediaRep', delta: -1 }]),
    ] : [
      A('fiery', `Good. Keep sleeping on us. We'll remember who wasn't on board.`, [{ kind: 'morale', target: 'team', delta: 5 }, { kind: 'hype', delta: 5 }]),
      A('humble', `We have to earn it. That's fine with me.`, [{ kind: 'mediaRep', delta: 3 }]),
      A('joke', `I checked twice. Thought it was a typo.`, [{ kind: 'hype', delta: 3 }, { kind: 'mediaRep', delta: 2 }]),
    ]),
  });

  cands.push({
    key: 'md.expect', topic: 'expect', w: 6,
    build: () => makeQ(team, { role: 'beat' }, v(`Your AD has said the goal is to "${state.user.expectation.toLowerCase()}". Is that fair?`, `What are the expectations for this group? The AD's goal is "${state.user.expectation.toLowerCase()}".`), [
      A('confident', `We'll exceed that. This roster is built for March.`, [{ kind: 'hype', delta: 6 }, { kind: 'security', delta: -3 }], { kind: 'beatExpect' }),
      A('humble', `That's fair. We'll take it one day at a time.`, [{ kind: 'security', delta: 2 }]),
      A('deflect', `My expectations are internal. They stay in the locker room.`, [{ kind: 'mediaRep', delta: -1 }, { kind: 'morale', target: 'team', delta: 1 }]),
    ]),
  });

  // ---- last season, as it carries into this one ----
  const h = c.last;
  const ran = !!h && h.coachId === coach.id;
  if (h && ran) {
    const elim = c.recap?.elim ? state.teams[c.recap.elim.oppId] : undefined;
    const exceeded = c.recap?.achieved != null && c.recap.expectationLevel != null && c.recap.achieved > c.recap.expectationLevel;
    if (h.postseason === 'Champion') {
      cands.push({
        key: 'md.ls.defend', topic: 'lastSeason', w: 11, lead: true,
        build: () => makeQ(team, { role: 'columnist', tag: 'Last season' }, v(`You're the defending national champions. How do you handle being everybody's biggest game?`, `Last April you cut down the nets. How do you keep this group hungry?`), [
          A('confident', `We're not defending anything. We're going to go take another one.`, [{ kind: 'hype', delta: 6 }, { kind: 'morale', target: 'team', delta: 3 }], { kind: 'deepRun' }),
          A('humble', `That banner belongs to last year's team. This group hasn't won anything yet.`, [{ kind: 'mediaRep', delta: 4 }, { kind: 'morale', target: 'team', delta: 2 }]),
          A('joke', `I'm still finding confetti in my car. Ask me again in November.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'hype', delta: 3 }]),
        ]),
      });
    } else if (DEEP.includes(h.postseason)) {
      cands.push({
        key: 'md.ls.f4', topic: 'lastSeason', w: 10, lead: true,
        build: () => makeQ(team, { role: 'columnist', tag: 'Last season' }, `Last season ended ${postseasonPhrase(h)}. Is anything short of that a disappointment now?`, [
          A('confident', `That's the standard now. We expect to be playing on the last weekend.`, [{ kind: 'hype', delta: 6 }, { kind: 'security', delta: -2 }], { kind: 'deepRun' }),
          A('humble', `Every season is its own journey. We'll measure this team on its own terms.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'security', delta: 2 }]),
          A('fiery', `We came up short. That's the only thing anybody in our building remembers.`, [{ kind: 'morale', target: 'team', delta: 3 }, { kind: 'hype', delta: 3 }]),
        ]),
      });
    } else if (h.ncaaSeed != null && h.ncaaSeed <= 4 && ['First Four', 'Round of 64', 'Round of 32'].includes(h.postseason)) {
      cands.push({
        key: 'md.ls.upset', topic: 'lastSeason', w: 11, lead: true,
        build: () => makeQ(team, { role: 'beat', tag: 'Last season' }, `Last March you were a No. ${h.ncaaSeed} seed and went out in the ${h.postseason}${elim ? ` to ${elim.school}` : ''}. How much has that stuck with this group?`, [
          A('fiery', `Every day. We've watched that film more than I'd like to admit. It's fuel.`, [{ kind: 'morale', target: 'team', delta: 4 }, { kind: 'hype', delta: 3 }]),
          A('humble', `It hurt. But one game doesn't define a season, and it won't define this one.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'morale', target: 'team', delta: 2 }]),
          A('confident', `We'll be back in March, and we'll be ready this time.`, [{ kind: 'hype', delta: 5 }, { kind: 'security', delta: -2 }], { kind: 'tourney' }),
          A('deflect', `That's last year. I'm not going to relive it today.`, [{ kind: 'mediaRep', delta: -2 }]),
        ]),
      });
    } else if (h.ncaaSeed == null) {
      cands.push({
        key: 'md.ls.missed', topic: 'lastSeason', w: 9, lead: true,
        build: () => makeQ(team, { role: 'beat', tag: 'Last season' }, v(`You went ${h.w}-${h.l} last year and missed the tournament. What has to change?`, `No NCAA bid last season at ${h.w}-${h.l}. Is this a tournament team?`), [
          A('confident', `This is a tournament team. Write it down.`, [{ kind: 'hype', delta: 6 }, { kind: 'security', delta: -2 }], { kind: 'tourney' }),
          A('humble', `We got better in the offseason, but we have to prove it. Nobody owes us anything.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'security', delta: 1 }]),
          A('fiery', `Toughness. We lost too many close games. That's on me, and we've attacked it.`, [{ kind: 'morale', target: 'team', delta: 2 }, { kind: 'security', delta: 2 }]),
        ]),
      });
    } else {
      cands.push({
        key: 'md.ls.tourney', topic: 'lastSeason', w: 7, lead: true,
        build: () => makeQ(team, { role: 'beat', tag: 'Last season' }, exceeded
          ? `Last year you beat expectations and finished ${postseasonPhrase(h)}. Can you take another step?`
          : `Last season ended ${postseasonPhrase(h)}${elim ? ` against ${elim.school}` : ''}. What's the next step for this program?`, [
          A('confident', `The next step is the second weekend. We have the pieces.`, [{ kind: 'hype', delta: 5 }, { kind: 'security', delta: -2 }], { kind: 'beatExpect' }),
          A('humble', `Get back to the tournament, then make some noise. One thing at a time.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'security', delta: 1 }]),
          A('praise', `Our returning guys learned what March takes. That experience is priceless.`, [{ kind: 'morale', target: 'team', delta: 3 }]),
        ]),
      });
    }
  } else if (h) {
    cands.push({
      key: 'md.ls.inherit', topic: 'lastSeason', w: 8, lead: true,
      build: () => makeQ(team, { role: 'beat', tag: 'Last season' }, h.w - h.l >= 8 ? `You inherit a team that went ${h.w}-${h.l} last year. How much will you change?` : `This program went ${h.w}-${h.l} last year before you arrived. What did you see on film that you want to change?`, [
        A('fiery', `Effort. Some nights it wasn't there. That's over.`, [{ kind: 'morale', target: 'team', delta: -2 }, { kind: 'hype', delta: 3 }]),
        A('humble', `There's a lot of talent here. We're just going to play to our strengths.`, [{ kind: 'morale', target: 'team', delta: 3 }]),
        A('confident', `Honestly? Not much. This group is closer than people think.`, [{ kind: 'hype', delta: 4 }, { kind: 'morale', target: 'team', delta: 2 }], { kind: 'beatExpect' }),
      ]),
    });
  }

  // ---- who left, who arrived ----
  const recap = c.recap;
  const gone = [...(recap?.drafted ?? []), ...(recap?.transfersOut ?? [])];
  if (recap && gone.length) {
    const top = recap.drafted?.[0];
    cands.push({
      key: 'md.departures', topic: 'roster', w: 7,
      build: () => makeQ(team, { role: 'beat', tag: 'Offseason' }, top
        ? `You lost ${top} to the NBA Draft${recap.transfersOut?.length ? ` and ${plural(recap.transfersOut.length, 'player')} to the portal` : ''}. How do you replace that production?`
        : `You lost ${list((recap.transfersOut ?? []).slice(0, 3))} to the transfer portal. How much did those departures hurt?`, [
        A('confident', `We reloaded. Wait until you see who's stepping up.`, [{ kind: 'hype', delta: 4 }, { kind: 'morale', target: 'team', delta: 3 }]),
        A('humble', `You don't replace guys like that with one player. It's going to take everybody.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'morale', target: 'team', delta: 2 }]),
        A('praise', `We're proud of those guys. That's what this program does: it sends players to the next level.`, [{ kind: 'recruitInterest', delta: 2 }, { kind: 'mediaRep', delta: 2 }]),
      ]),
    });
  }
  const arrivals = (recap?.transfersIn ?? []).map((x) => state.players[x.id]).filter((p): p is Player => !!p && p.teamId === team.id);
  if (arrivals.length) {
    const best = [...arrivals].sort((a, b) => b.ovr - a.ovr)[0];
    const fromSchool = recap?.transfersIn?.find((x) => x.id === best.id)?.from;
    cands.push({
      key: 'md.newcomers', topic: 'newcomers', w: 7,
      build: () => makeQ(team, { role: 'tv', tag: 'Offseason' }, arrivals.length > 1
        ? `You added ${list(arrivals.slice(0, 3).map(nm))} from the portal. Who should fans be most excited about?`
        : `${nm(best)} comes over from ${fromSchool ?? 'the portal'}. What does he bring?`, [
        A('praise', `${best.first}. He's a winner, and he's going to change how we play.`, [{ kind: 'morale', target: best.id, delta: 7 }, { kind: 'hype', delta: 3 }]),
        A('humble', `They all have to earn it in practice. Nobody walked in here with a starting job.`, [{ kind: 'morale', target: 'team', delta: 2 }]),
        A('confident', `We had the best portal haul in the ${confName(c)}. I'll say that.`, [{ kind: 'hype', delta: 5 }, { kind: 'mediaRep', delta: -1 }]),
      ]),
    });
  }
  const fresh = c.players.filter((p) => p.cls === 'FR' && !p.redshirting).sort((a, b) => b.ovr - a.ovr)[0];
  if (fresh && fresh.stars >= 3) {
    cands.push({
      key: 'md.freshman', topic: 'newcomers', w: 6,
      build: () => makeQ(team, { role: 'beat' }, `${nm(fresh)} arrives as a ${fresh.stars}-star freshman. Is he ready to contribute right away?`, [
        A('confident', `He'll start from day one. He's that good.`, [{ kind: 'morale', target: fresh.id, delta: 8 }, { kind: 'hype', delta: 3 }, { kind: 'morale', target: 'team', delta: -1 }], { kind: 'freshStar', subject: fresh.id }),
        A('humble', `He's talented, but freshmen have to earn it. He'll get his chances.`, [{ kind: 'morale', target: 'team', delta: 2 }]),
        A('joke', `He's ready. His jump shot's ready. His dorm room? Not so much.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'morale', target: fresh.id, delta: 3 }]),
      ]),
    });
  }

  // ---- the summer in the gym ----
  const summer = state.development?.summer;
  if (summer?.done && summer.season === state.season - 1) {
    const leap = summer.rows.find((r) => (r.tag === 'breakout' || r.archetypeTo) && state.players[r.id]?.teamId === team.id);
    if (leap) {
      const lp = state.players[leap.id];
      cands.push({
        key: leap.archetypeTo ? 'md.newRole' : 'md.leap', topic: 'leap', w: 8,
        build: () => makeQ(team, { role: 'beat', tag: 'Offseason' }, leap.archetypeTo
          ? `${leap.name} spent the summer on ${FOCUS_INFO[leap.focus].label.toLowerCase()} and came back as a ${leap.archetypeTo.toLowerCase()}. What did you see from him?`
          : `${leap.name} went from ${leap.before} to ${leap.after} overall this summer. What changed?`, [
          A('praise', `He lived in the gym. First one in, last one out, all summer long. He earned every bit of it.`, [{ kind: 'morale', target: lp.id, delta: 6 }, { kind: 'followers', target: lp.id, delta: 6000 }]),
          A('confident', `Wait until you see him in a real game. People aren't ready.`, [{ kind: 'hype', delta: 5 }, { kind: 'morale', target: lp.id, delta: 3 }]),
          A('humble', `Credit our player development staff. They had a plan for him, and he bought in.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'recruitInterest', delta: 2 }]),
        ]),
      });
    }
  }

  // ---- the coach and the program ----
  const yearN = c.tenure + 1;
  if (coach.jobSecurity < 38 && c.tenure >= 1) {
    cands.push({
      key: 'md.hotseat', topic: 'tenure', w: 9,
      build: () => makeQ(team, { role: 'columnist' }, v(`There's been plenty of talk about your job security this offseason. Do you feel the pressure?`, `Fair or not, a lot of people see this as a make-or-break year for you. Do you?`), [
        A('fiery', `I don't coach scared. Never have. We're going to win and the noise will go away.`, [{ kind: 'hype', delta: 4 }, { kind: 'morale', target: 'team', delta: 2 }, { kind: 'mediaRep', delta: -1 }]),
        A('humble', `It's a results business, and I accept that. I believe in this group.`, [{ kind: 'mediaRep', delta: 4 }, { kind: 'security', delta: 2 }]),
        A('deflect', `I don't read any of that. Next question.`, [{ kind: 'mediaRep', delta: -3 }]),
      ]),
    });
  } else if (coach.contractYears <= 1 && c.tenure >= 1) {
    cands.push({
      key: 'md.contract', topic: 'tenure', w: 6,
      build: () => makeQ(team, { role: 'national' }, `You're entering the final year of your contract. Any talks about an extension?`, [
        A('humble', `I'll let the results do the talking. Everything else takes care of itself.`, [{ kind: 'security', delta: 2 }, { kind: 'mediaRep', delta: 2 }]),
        A('confident', `I think we've earned one. We'll see where it goes.`, [{ kind: 'security', delta: -2 }, { kind: 'hype', delta: 2 }]),
        A('deflect', `That's between me and the AD.`, [{ kind: 'mediaRep', delta: -1 }]),
      ]),
    });
  } else if (yearN >= 2) {
    cands.push({
      key: yearN === 2 ? 'md.year2' : yearN >= 6 ? 'md.longTenure' : 'md.yearN', topic: 'tenure', w: 5,
      build: () => makeQ(team, { role: 'beat' }, yearN === 2
        ? `Year two. What's the biggest difference from where you were 12 months ago?`
        : yearN >= 6
          ? `This is year ${yearN} for you at ${team.school}. Do you ever think about what comes next?`
          : `Year ${yearN} at ${team.school}. Is this the year it all comes together?`, yearN >= 6 ? [
        A('humble', `This is home. I want to retire here, if they'll have me that long.`, [{ kind: 'security', delta: 3 }, { kind: 'hype', delta: 3 }], { kind: 'notLeaving' }),
        A('confident', `What comes next is a banner. That's all I think about.`, [{ kind: 'hype', delta: 5 }], { kind: 'deepRun' }),
        A('joke', `What comes next is the nine o'clock practice. Nothing past that.`, [{ kind: 'mediaRep', delta: 3 }]),
      ] : [
        A('confident', `The culture's in place. Now it's about winning big.`, [{ kind: 'hype', delta: 5 }, { kind: 'security', delta: -1 }], { kind: 'beatExpect' }),
        A('humble', `We're further along than last year, but we're not done building.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'security', delta: 1 }]),
        A('praise', `The players have bought in completely. That's the difference.`, [{ kind: 'morale', target: 'team', delta: 4 }]),
      ]),
    });
  }
  const stint = coach.career.filter((x) => x.teamId === team.id && x.season < state.season);
  if (stint.length >= 2) {
    const w = stint.reduce((a, x) => a + x.w, 0), l = stint.reduce((a, x) => a + x.l, 0);
    const bids = stint.filter((x) => x.seed != null).length;
    const recent = stint.slice(-3).map((x) => x.w);
    const rising = recent.length >= 3 && recent[2] > recent[1] && recent[1] > recent[0];
    cands.push({
      key: rising ? 'md.buildRising' : 'md.build', topic: 'build', w: 6,
      build: () => makeQ(team, { role: 'columnist', tag: 'Big picture' }, rising
        ? `You've won ${list(recent.map(String))} games the last three seasons. Is this the year the climb pays off?`
        : `In ${plural(stint.length, 'season')} here you're ${w}-${l}${bids ? ` with ${plural(bids, 'NCAA appearance')}` : ' without an NCAA bid'}. How would you assess the build so far?`, [
        A('confident', rising ? `That's the plan. Every year we've gotten better. This is the year it shows up in March.` : `We're right where I want to be. The best is coming.`, [{ kind: 'hype', delta: 5 }, { kind: 'security', delta: -1 }], { kind: 'beatExpect' }),
        A('humble', `We're not where we want to be yet. But the foundation is real, and it's built to last.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'security', delta: 2 }]),
        A('praise', `I'm proud of the players who believed in us early. They built this.`, [{ kind: 'morale', target: 'team', delta: 3 }, { kind: 'recruitInterest', delta: 1 }]),
      ]),
    });
  }
  if (c.drought >= 3) {
    cands.push({
      key: 'md.drought', topic: 'drought', w: 7,
      build: () => makeQ(team, { role: 'columnist' }, `It's been ${c.drought} years since ${team.school} made the NCAA Tournament. Fans are restless. Is this the year?`, [
        A('confident', `Yes. The drought ends this season.`, [{ kind: 'hype', delta: 8 }, { kind: 'security', delta: -3 }], { kind: 'tourney' }),
        A('humble', `I understand the frustration. All I can promise is we'll compete every night.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'security', delta: 1 }]),
        A('fiery', `Nobody's more tired of hearing about it than me. Let's go fix it.`, [{ kind: 'hype', delta: 4 }, { kind: 'morale', target: 'team', delta: 2 }]),
      ]),
    });
  }

  // ---- the season ahead ----
  const sc = state.scheduling;
  if (sc && sc.season === state.season && sc.locked) {
    const m = resumeMetrics(state);
    const top = [...sc.games].sort((a, b) => (sc.projRank[a.oppId] ?? 999) - (sc.projRank[b.oppId] ?? 999)).slice(0, 2).map((x) => state.teams[x.oppId].school);
    if (m.sosLabel === 'Brutal' || m.sosLabel === 'Tough') {
      cands.push({
        key: 'md.sched.tough', topic: 'schedule', w: 6,
        build: () => makeQ(team, { role: 'national' }, `You loaded up the non-conference schedule: ${top.join(' and ')}${sc.mte ? `, plus the ${sc.mte}` : ''}. Why take on that gauntlet?`, [
          A('confident', `We want the best. March prep starts in November.`, [{ kind: 'hype', delta: 4 }, { kind: 'morale', target: 'team', delta: 2 }]),
          A('humble', `It'll test us. We're going to learn a lot about who we are.`, [{ kind: 'mediaRep', delta: 3 }]),
          A('joke', `Ask me again after I've watched the film from those games.`, [{ kind: 'mediaRep', delta: 2 }, { kind: 'hype', delta: 1 }]),
        ]),
      });
    } else if (m.sosLabel === 'Soft' || m.sosLabel === 'Cupcake') {
      cands.push({
        key: 'md.sched.soft', topic: 'schedule', w: 6,
        build: () => makeQ(team, { role: 'analytics' }, `Critics are calling your non-conference schedule soft. Your response?`, [
          A('fiery', `Ask the committee in March. We'll be just fine.`, [{ kind: 'hype', delta: 2 }, { kind: 'security', delta: -1 }]),
          A('humble', `Fair critique. We're young, and building confidence early matters.`, [{ kind: 'mediaRep', delta: 2 }, { kind: 'morale', target: 'team', delta: 2 }]),
          A('deflect', `You play who's available. Next question.`, [{ kind: 'mediaRep', delta: -2 }]),
        ]),
      });
    } else {
      cands.push({
        key: 'md.sched', topic: 'schedule', w: 3,
        build: () => makeQ(team, { role: 'beat' }, `Walk us through your approach to the non-conference schedule this year.`, [
          A('confident', `Enough big games to get us battle-tested, enough home games to build momentum.`, [{ kind: 'mediaRep', delta: 2 }, { kind: 'hype', delta: 2 }]),
          A('humble', `Our staff did a great job. It's balanced, and it'll prepare us for league play.`, [{ kind: 'mediaRep', delta: 3 }]),
        ]),
      });
    }
  }
  const rivalGame = state.schedule.filter((g) => (g.home === team.id || g.away === team.id) && rivalOf(g.home, g.away)).sort((a, b) => a.day - b.day)[0];
  if (rivalGame) {
    const rv = state.teams[rivalGame.home === team.id ? rivalGame.away : rivalGame.home];
    const name = rivalOf(rivalGame.home, rivalGame.away)?.name;
    cands.push({
      key: 'md.rival', topic: 'rival', w: 6,
      build: () => makeQ(team, { role: 'tv' }, `Fans already have ${state.calendar[rivalGame.day]?.date ? 'the date' : 'it'} circled: ${rv.school}${name ? `, ${name}` : ''}. How much do your guys talk about that game?`, [
        A('fiery', `Every day. That's the one. Everybody in this building knows it.`, [{ kind: 'hype', delta: 6 }, { kind: 'morale', target: 'team', delta: 2 }]),
        A('humble', `It's a great rivalry, and we respect them. But it's one game on the schedule.`, [{ kind: 'mediaRep', delta: 3 }]),
        A('joke', `I'm not allowed to say their name in my house. My kids won't let me.`, [{ kind: 'hype', delta: 4 }, { kind: 'mediaRep', delta: 2 }]),
      ]),
    });
  }
  if (c.conf) {
    const st = Object.values(state.teams).filter((t) => t.conf === team.conf && t.id !== team.id).sort((a, b) => b.rating - a.rating);
    const fav = st[0];
    if (fav) {
      cands.push({
        key: 'md.conf', topic: 'conf', w: 5,
        build: () => makeQ(team, { role: 'beat' }, `Who's the team to beat in the ${confName(c)} this year?`, [
          A('confident', `Us. We're winning the league.`, [{ kind: 'hype', delta: 6 }, { kind: 'morale', target: 'team', delta: 2 }, { kind: 'security', delta: -2 }], { kind: 'confTitle' }),
          A('praise', `${fav.school} until somebody knocks them off. They've earned that.`, [{ kind: 'mediaRep', delta: 3 }]),
          A('humble', `This league is a gauntlet. Anybody can beat anybody on a given night.`, [{ kind: 'mediaRep', delta: 2 }]),
        ]),
      });
    }
  }
  if (c.star) {
    const s = c.star;
    cands.push({
      key: 'md.star', topic: 'star', w: 6,
      build: () => makeQ(team, { role: 'tv' }, v(`${nm(s)} is getting a lot of preseason buzz. What makes him special?`, `Talk about ${nm(s)}. What's his ceiling this year?`), [
        A('praise', `He's the hardest worker I've ever coached. All-American, no question.`, [{ kind: 'morale', target: s.id, delta: 8 }, { kind: 'followers', target: s.id, delta: 15000 }], { kind: 'allAmerican', subject: s.id }),
        A('humble', `He's talented, but this is a team. Nobody's bigger than the program.`, [{ kind: 'morale', target: 'team', delta: 3 }, { kind: 'morale', target: s.id, delta: s.traits.includes('diva') ? -6 : 0 }]),
        A('joke', `His shoe deal is bigger than my salary, so... a lot of things.`, [{ kind: 'hype', delta: 3 }, { kind: 'mediaRep', delta: 3 }]),
      ]),
    });
    const r = nbaRank(state, s);
    if (r <= 30 && s.elig > 1) {
      cands.push({
        key: 'md.nba', topic: 'nba', w: 5,
        build: () => makeQ(team, { role: 'national' }, `NBA scouts have ${nm(s)} projected as ${nbaLabel(r)}. Is this his last college season?`, [
          A('praise', `If it is, we'll celebrate it. Our job is to get him ready for that moment.`, [{ kind: 'recruitInterest', delta: 2 }, { kind: 'morale', target: s.id, delta: 4 }]),
          A('humble', `He's focused on this team, and so am I. We'll talk about the draft in April.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'morale', target: 'team', delta: 1 }]),
          A('joke', `I'm trying to talk him into a fifth year. So far it's not going well.`, [{ kind: 'mediaRep', delta: 3 }]),
        ]),
      });
    }
  }
  const nilRank = Object.values(state.teams).filter((t) => t.conf === team.conf).sort((a, b) => b.nilBudget - a.nilBudget).findIndex((t) => t.id === team.id) + 1;
  cands.push({
    key: 'md.nil', topic: 'nil', w: 3,
    build: () => makeQ(team, { role: 'national' }, `Your NIL pool is about ${fmtMoney(team.nilBudget)}, ${ord(nilRank)} in the ${confName(c)}. Can you compete with the big spenders?`, nilRank <= 3 ? [
      A('confident', `Our fans and donors have stepped up. We'll compete with anybody.`, [{ kind: 'hype', delta: 3 }, { kind: 'recruitInterest', delta: 2 }]),
      A('humble', `The money helps, but players come here to develop and win.`, [{ kind: 'mediaRep', delta: 3 }]),
    ] : [
      A('fiery', `We'll outwork the money. We always have.`, [{ kind: 'morale', target: 'team', delta: 2 }, { kind: 'hype', delta: 2 }]),
      A('confident', `Donors, if you're watching: call me. We need you.`, [{ kind: 'nilBudget', delta: 90000 }, { kind: 'mediaRep', delta: -1 }]),
      A('humble', `We have to be smarter than everybody else, and we will be.`, [{ kind: 'mediaRep', delta: 2 }]),
    ]),
  });
  const ratingRank = Object.values(state.teams).sort((a, b) => b.rating - a.rating).findIndex((t) => t.id === team.id) + 1;
  cands.push({
    key: 'md.models', topic: 'analytics', w: 3,
    build: () => makeQ(team, { role: 'analytics' }, `The computer models project you around No. ${ratingRank} nationally. Do you trust the numbers?`, [
      A('humble', `Numbers tell you a lot. They don't measure heart. We'll find out.`, [{ kind: 'mediaRep', delta: 2 }]),
      A('confident', `The models will be updating their projections soon. Upward.`, [{ kind: 'hype', delta: 4 }]),
      A('joke', `I don't trust anything that can't run a full-court drill.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'hype', delta: 1 }]),
    ]),
  });
  cands.push(funQuestion(state, team, 'md'));

  // ---- holding him to last season's promises ----
  const portalClaim = openClaims(state, ['portalSplash', 'retention'], (x) => x.teamId === team.id && x.season === state.season)[0];
  if (portalClaim && recap) {
    const ins = recap.transfersIn?.length ?? 0, outs = recap.transfersOut?.length ?? 0;
    const delivered = portalClaim.kind === 'portalSplash' ? ins >= 2 || /A/.test(recap.portalGrade ?? '') : outs <= 1;
    cands.push({
      key: 'md.portalClaim', topic: 'followup', w: 9,
      onAsk: () => { portalClaim.followed = true; },
      build: () => makeQ(team, { role: 'beat', tag: 'Follow-up', quote: quoteOf(state, portalClaim) }, portalClaim.kind === 'portalSplash'
        ? (delivered ? `You promised big names out of the portal, and you landed ${plural(ins, 'transfer')}. Did you get everything you wanted?` : `You said you were going shopping in the portal. You brought in ${ins === 0 ? 'nobody' : plural(ins, 'player')}. What happened?`)
        : (delivered ? `You said retention came first, and you kept this group together. How did you pull that off?` : `You said retention came first, but ${plural(outs, 'player')} left through the portal. What went wrong?`), delivered ? [
        A('confident', `I told you. We do what we say around here.`, [{ kind: 'hype', delta: 4 }, { kind: 'mediaRep', delta: 1 }]),
        A('humble', `Credit our staff. They worked around the clock.`, [{ kind: 'mediaRep', delta: 3 }]),
      ] : [
        A('humble', `That's fair. It didn't go the way we planned, and that's on me.`, [{ kind: 'mediaRep', delta: 4 }, { kind: 'security', delta: 1 }]),
        A('deflect', `The portal's unpredictable. We like the group we have.`, [{ kind: 'mediaRep', delta: -2 }]),
        A('fiery', `The guys who wanted to be here are here. That's who I want.`, [{ kind: 'morale', target: 'team', delta: 4 }, { kind: 'mediaRep', delta: -1 }]),
      ]),
    });
  }

  return { id: rng.id('pc'), title: 'Preseason Media Day', context: `Media day at ${team.arena}. A wall of cameras awaits.`, when: 'at Media Day', questions: choose(state, cands, 5) };
}

/** A lighter question from the student radio host, so pressers aren't all business */
function funQuestion(state: GameState, team: Team, prefix: string): Cand {
  const opts: { k: string; q: string; a: Answer[] }[] = [
    { k: 'playlist', q: `Student section wants to know: what's on the pregame playlist?`, a: [
      A('joke', `Mostly my assistants' music. I lost a bet in July and I'm still paying for it.`, [{ kind: 'hype', delta: 3 }, { kind: 'mediaRep', delta: 2 }]),
      A('praise', `The players run the aux cord. I trust them with that more than I trust them with a zone.`, [{ kind: 'morale', target: 'team', delta: 3 }]),
      A('deflect', `I'm an old-school guy. Silence and film.`, [{ kind: 'mediaRep', delta: 1 }]),
    ] },
    { k: 'dancer', q: `Who's the best dancer on the team?`, a: [
      A('joke', `Not me. Definitely not me. There's video and I've had it destroyed.`, [{ kind: 'hype', delta: 3 }, { kind: 'mediaRep', delta: 3 }]),
      A('praise', `Ask the guys. I think they'd all say themselves.`, [{ kind: 'morale', target: 'team', delta: 2 }]),
    ] },
    { k: 'student', q: `What do you want to say to the student section?`, a: [
      A('fiery', `Be loud. Be early. Be the sixth man. We feed off you.`, [{ kind: 'hype', delta: 6 }]),
      A('joke', `First 500 students get free pizza from my own pocket. Don't tell the AD.`, [{ kind: 'hype', delta: 7 }, { kind: 'nilBudget', delta: -5000 }]),
      A('humble', `Thank you. You make this place special.`, [{ kind: 'hype', delta: 3 }, { kind: 'mediaRep', delta: 2 }]),
    ] },
    { k: 'superstition', q: `Any game-day superstitions we should know about?`, a: [
      A('joke', `Same tie every game we win. It's getting pretty rough.`, [{ kind: 'hype', delta: 3 }, { kind: 'mediaRep', delta: 2 }]),
      A('humble', `Preparation is the only superstition I believe in.`, [{ kind: 'mediaRep', delta: 2 }]),
    ] },
    { k: 'karaoke', q: `Rumor has it the team did karaoke on a road trip. Who's the best singer?`, a: [
      A('joke', `I'll take the fifth. Some things stay on the bus.`, [{ kind: 'hype', delta: 2 }, { kind: 'morale', target: 'team', delta: 2 }, { kind: 'mediaRep', delta: 2 }]),
      A('praise', `Our managers, honestly. They carried the whole night.`, [{ kind: 'morale', target: 'team', delta: 3 }]),
    ] },
  ];
  const o = rng.pick(opts);
  return { key: `${prefix}.fun.${o.k}`, topic: 'fun', w: 2.5, build: () => makeQ(team, { role: 'student' }, o.q, o.a) };
}

// ======================================================================
// Postgame
// ======================================================================
function sumBox(ps: BoxPlayer[]) {
  const s = { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, tov: 0, bench: 0 };
  for (const p of ps) {
    s.pts += p.pts; s.fgm += p.fgm; s.fga += p.fga; s.tpm += p.tpm; s.tpa += p.tpa; s.ftm += p.ftm; s.fta += p.fta; s.reb += p.orb + p.drb; s.tov += p.tov;
    if (!p.starter) s.bench += p.pts;
  }
  return s;
}

export function postgamePresser(state: GameState, g: ScheduledGame, box: BoxScore): PressConference | null {
  const c = ctxFor(state);
  const { team } = c;
  const home = g.home === team.id;
  const opp = state.teams[home ? g.away : g.home];
  if (!opp) return null;
  const us = home ? box.hs : box.as, them = home ? box.as : box.hs;
  const margin = us - them;
  const won = margin > 0;
  const mine = home ? box.players[0] : box.players[1];
  const theirs = home ? box.players[1] : box.players[0];
  const ts = sumBox(mine), os = sumBox(theirs);
  const best = [...mine].sort((a, b) => b.pts - a.pts)[0];
  const starP = best ? state.players[best.id] : undefined;
  const worstBox = [...mine].filter((p) => p.min >= 15).sort((a, b) => (a.pts - a.fga * 0.6) - (b.pts - b.fga * 0.6))[0];
  const worst = worstBox ? state.players[worstBox.id] : undefined;
  const upsetWin = won && !!opp.apRank && (!team.apRank || team.apRank > opp.apRank);
  const badLoss = !won && !opp.apRank && team.rating - opp.rating > 6;
  const rv = rivalOf(g.home, g.away);
  const ncaa = g.type === 'ncaa', ctourn = g.type === 'ctourn';
  const tourney = ncaa || ctourn;
  const big = !!opp.apRank || !!rv || tourney;
  const ot = box.ot > 0;
  const oppLead = home ? box.largestLead[1] : box.largestLead[0];
  const ourLead = home ? box.largestLead[0] : box.largestLead[1];
  const halfUs = home ? box.half[0] : box.half[1], halfThem = home ? box.half[1] : box.half[0];
  const when = `after the ${opp.school} game`;
  const cands: Cand[] = [];
  const pts = (n: number) => `${n}-point`;

  // ---- the result ----
  if (won) {
    if (ncaa) {
      cands.push({ key: 'pg.ncaaW', topic: 'result', w: 10, lead: true, build: () => makeQ(team, { role: 'national' }, v(`You're moving on in the NCAA Tournament. What won you this game?`, `Survive and advance. How did you get it done against ${opp.school}?`), [
        A('praise', `Our guys refused to lose. You could see it in their eyes in the huddle.`, [{ kind: 'morale', target: 'team', delta: 4 }, { kind: 'hype', delta: 3 }]),
        A('humble', `Credit ${opp.school}. They made us earn every bucket. We just made one more play.`, [{ kind: 'mediaRep', delta: 4 }]),
        A('confident', `We're not here to be happy with one win. We came to cut down nets.`, [{ kind: 'hype', delta: 6 }, { kind: 'morale', target: 'team', delta: 3 }], { kind: 'deepRun' }),
      ]) });
    } else if (upsetWin) {
      cands.push({ key: 'pg.upsetW', topic: 'result', w: 10, lead: true, build: () => makeQ(team, { role: 'national' }, v(`Coach, that's a statement win over No. ${opp.apRank} ${opp.school}. Does this change how people see ${team.school}?`, `Beating a top-${opp.apRank! <= 10 ? 10 : 25} team. Is this the win that puts ${team.school} on the map?`), [
        A('confident', `It should. We've been saying it all year: we're a top-tier team.`, [{ kind: 'hype', delta: 8 }, { kind: 'morale', target: 'team', delta: 4 }, { kind: 'recruitInterest', delta: 3 }]),
        A('humble', `It's one win. We'll enjoy it tonight and get back to work tomorrow.`, [{ kind: 'mediaRep', delta: 4 }, { kind: 'security', delta: 2 }]),
        A('praise', `Credit to ${opp.school}. Hall of Fame program. Our guys just made a couple more plays.`, [{ kind: 'mediaRep', delta: 5 }]),
      ]) });
    } else if (rv) {
      cands.push({ key: 'pg.rivalW', topic: 'result', w: 10, lead: true, build: () => makeQ(team, { role: 'beat' }, `You beat ${opp.school}${rv.name ? ` in ${rv.name}` : ''}. What does this one mean to your fan base?`, [
        A('fiery', `Everything. Our fans live for this game, and so do I.`, [{ kind: 'hype', delta: 8 }, { kind: 'morale', target: 'team', delta: 3 }]),
        A('humble', `It's a great rivalry. We'll enjoy it, but it's still one win in the standings.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'hype', delta: 3 }]),
        A('joke', `My dad called before I got to the podium. That's how much it means.`, [{ kind: 'hype', delta: 5 }, { kind: 'mediaRep', delta: 2 }]),
      ]) });
    } else if (ot || margin <= 3) {
      cands.push({ key: 'pg.closeW', topic: 'result', w: 9, lead: true, build: () => makeQ(team, { role: 'tv' }, ot ? `Overtime! How did your guys find a way?` : v(`A ${pts(margin)} win that went down to the wire. How did you close it out?`, `That one came down to the last possession. What did you tell them in the final timeout?`), [
        A('praise', `Toughness. When it got tight, we got tougher. I love this group.`, [{ kind: 'morale', target: 'team', delta: 4 }]),
        A('humble', `We got lucky, honestly. We have to close games better than that.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'security', delta: 1 }]),
        A('joke', `I told them to win. They listened. Great coaching.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'hype', delta: 2 }]),
      ]) });
    } else if (margin >= 20) {
      cands.push({ key: 'pg.blowoutW', topic: 'result', w: 8, lead: true, build: () => makeQ(team, { role: 'beat' }, v(`A ${pts(margin)} win. Is that as complete a game as you've played?`, `You were in control from the opening tip. What clicked tonight?`, `That one was over early. Did anything worry you?`, `Everybody got in tonight. How valuable are games like this?`), [
        A('praise', `That's the best we've shared the ball all year. Everybody ate.`, [{ kind: 'morale', target: 'team', delta: 4 }]),
        A('humble', `We'll take it, but the film will show plenty of things we need to fix.`, [{ kind: 'mediaRep', delta: 2 }, { kind: 'security', delta: 1 }]),
        A('confident', `That's who we are when we play our game. Not many teams can hang with that.`, [{ kind: 'hype', delta: 5 }]),
      ]) });
    } else {
      cands.push({ key: 'pg.win', topic: 'result', w: 8, lead: true, build: () => makeQ(team, { role: 'beat' }, v(`A ${pts(margin)} win tonight over ${opp.school}. What did you like?`, `What was the difference tonight against ${opp.school}?`, `Solid win. What's your takeaway?`, `${team.record.w}-${team.record.l} now. What did tonight tell you about this team?`, `Walk us through how you pulled away from ${opp.school}.`), [
        A('praise', v(`Our defense. We were connected for 40 minutes. That's who we want to be.`, `How hard we played. When we play that hard, we're tough to beat.`, `The ball movement. Nobody cared who scored.`), [{ kind: 'morale', target: 'team', delta: 3 }]),
        A('humble', v(`We won, but we left a lot out there. Plenty to clean up on film.`, `Good, not great. We're still a work in progress.`), [{ kind: 'security', delta: 1 }, { kind: 'mediaRep', delta: 2 }]),
        A('joke', v(`I liked the final score. Everything else we'll talk about at practice.`, `I liked that I didn't have to call a timeout in the last four minutes.`), [{ kind: 'mediaRep', delta: 3 }, { kind: 'hype', delta: 1 }]),
      ]) });
    }
  } else {
    if (ncaa) {
      cands.push({ key: 'pg.ncaaL', topic: 'result', w: 10, lead: true, build: () => makeQ(team, { role: 'beat' }, v(`The season is over. What will you remember about this team?`, `Coach, what do you say to this group after a season-ending loss like that?`), [
        A('praise', `Their heart. This group laid the foundation for something big.`, [{ kind: 'morale', target: 'team', delta: 5 }, { kind: 'recruitInterest', delta: 2 }]),
        A('humble', `It hurts. We'll learn from it and be back.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'security', delta: 1 }]),
        A('fiery', `I told them to remember this feeling. Next March, we use it.`, [{ kind: 'morale', target: 'team', delta: 2 }, { kind: 'hype', delta: 3 }]),
      ]) });
    } else if (badLoss) {
      cands.push({ key: 'pg.badL', topic: 'result', w: 10, lead: true, build: () => makeQ(team, { role: 'columnist' }, v(`Coach, a loss to ${opp.school}: that's going to hurt the résumé. What happened?`, `That's a loss you can't afford in March. How do you explain it?`), [
        A('fiery', `We were soft. Flat-out soft. That's on me, and it will not happen again.`, [{ kind: 'morale', target: 'team', delta: -2 }, { kind: 'security', delta: 2 }, { kind: 'hype', delta: 1 }], { kind: 'neverAgain', subject: opp.id }),
        A('deflect', `Give ${opp.school} credit. They played well. We'll watch the film.`, [{ kind: 'mediaRep', delta: 1 }]),
        A('humble', `I didn't have them ready. I take full responsibility.`, [{ kind: 'morale', target: 'team', delta: 3 }, { kind: 'security', delta: -1 }, { kind: 'mediaRep', delta: 3 }]),
      ]) });
    } else if (rv) {
      cands.push({ key: 'pg.rivalL', topic: 'result', w: 10, lead: true, build: () => makeQ(team, { role: 'beat' }, `A loss to ${opp.school}. How long will this one sting?`, [
        A('fiery', `Until we get them back. And we will.`, [{ kind: 'hype', delta: 4 }, { kind: 'morale', target: 'team', delta: 2 }]),
        A('humble', `It hurts. Our fans deserved better, and I'll own that.`, [{ kind: 'mediaRep', delta: 4 }, { kind: 'security', delta: -1 }]),
        A('deflect', `It's one game. We have a lot of season left.`, [{ kind: 'mediaRep', delta: -1 }]),
      ]) });
    } else if (margin <= -20) {
      cands.push({ key: 'pg.blowoutL', topic: 'result', w: 9, lead: true, build: () => makeQ(team, { role: 'beat' }, v(`A ${pts(-margin)} loss. Is there anything positive to take from tonight?`, `That one got away from you early. What went wrong?`), [
        A('fiery', `No. Nothing. We got embarrassed, and everybody in that locker room should feel it.`, [{ kind: 'morale', target: 'team', delta: -3 }, { kind: 'security', delta: 1 }]),
        A('humble', `They were better than us tonight in every way. I have to get us ready.`, [{ kind: 'mediaRep', delta: 3 }]),
        A('praise', `Our guys kept fighting when it would have been easy to quit. I'll take that.`, [{ kind: 'morale', target: 'team', delta: 3 }]),
      ]) });
    } else if (ot || margin >= -3) {
      cands.push({ key: 'pg.closeL', topic: 'result', w: 9, lead: true, build: () => makeQ(team, { role: 'tv' }, ot ? `A loss in overtime. What did you tell them in the locker room?` : `A ${pts(-margin)} loss that came down to the final possession. How do you process that?`, [
        A('humble', `We were right there. We have to execute better in those moments, starting with me.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'morale', target: 'team', delta: 2 }]),
        A('praise', `I'm proud of the fight. We'll win plenty of those this year.`, [{ kind: 'morale', target: 'team', delta: 4 }]),
        A('fiery', `Close doesn't count. I'm sick of close.`, [{ kind: 'morale', target: 'team', delta: -1 }, { kind: 'hype', delta: 2 }]),
      ]) });
    } else {
      cands.push({ key: 'pg.loss', topic: 'result', w: 8, lead: true, build: () => makeQ(team, { role: 'beat' }, v(`Tough ${pts(-margin)} loss to ${opp.school}. What's the message to the locker room?`, `What was the difference tonight?`, `Coach, where did this one get away from you?`, `What did you see from ${opp.school} that you didn't expect?`, `${team.record.w}-${team.record.l} after tonight. What do you need to fix first?`), [
        A('humble', `Keep the faith. We're close. We have to finish games.`, [{ kind: 'morale', target: 'team', delta: 3 }]),
        A('fiery', `Nobody in that room should be happy. Practice is going to be... spirited.`, [{ kind: 'morale', target: 'team', delta: -2 }, ...(c.star ? [{ kind: 'rating' as const, target: c.star.id, key: 'perD' as const, delta: 1 }] : [])]),
        A('deflect', `We'll move on. Next game.`, [{ kind: 'mediaRep', delta: -2 }]),
      ]) });
    }
  }

  // ---- the media holds him to his words ----
  const peak = openClaims(state, ['peaking'], (x) => x.season === state.season && x.teamId === team.id && state.day - x.day <= 14)[0];
  if (peak && !won) {
    cands.push({ key: 'pg.peakFollow', topic: 'followup', w: 12, onAsk: () => { peak.followed = true; }, build: () => makeQ(team, { role: 'columnist', tag: 'Follow-up', quote: quoteOf(state, peak) }, `Not long ago you said this team hadn't peaked yet. What do you make of tonight?`, [
      A('confident', `I still believe it. One game doesn't change what this team is.`, [{ kind: 'hype', delta: 2 }, { kind: 'mediaRep', delta: -1 }]),
      A('joke', `Well, I didn't say which direction.`, [{ kind: 'mediaRep', delta: 3 }]),
      A('humble', `Tonight was humbling. We have work to do.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'morale', target: 'team', delta: 1 }]),
    ]) });
  }
  const never = openClaims(state, ['neverAgain'], (x) => x.season === state.season && x.teamId === team.id)[0];
  if (never && badLoss && never.day < state.day) {
    cands.push({ key: 'pg.neverFollow', topic: 'followup', w: 13, onAsk: () => { never.followed = true; }, build: () => makeQ(team, { role: 'columnist', tag: 'Follow-up', quote: quoteOf(state, never) }, `After the ${state.teams[never.subject ?? '']?.school ?? 'last'} loss you said it would not happen again. It happened again. Why?`, [
      A('humble', `You're right to ask. I said it, and I didn't deliver. I have to be better.`, [{ kind: 'mediaRep', delta: 4 }, { kind: 'security', delta: -1 }]),
      A('fiery', `Because some guys didn't listen. That changes now, and lineups will reflect it.`, [{ kind: 'morale', target: 'team', delta: -4 }, { kind: 'security', delta: 1 }]),
      A('deflect', `Different game, different circumstances.`, [{ kind: 'mediaRep', delta: -3 }]),
    ]) });
  }
  const winPct = team.record.w / Math.max(1, team.record.w + team.record.l);
  const struggling = team.record.streak <= -3 || (badLoss && winPct < 0.65);
  const bigTalk = openClaims(state, ['deepRun', 'beatExpect', 'tourney', 'confTitle'], (x) => x.season === state.season && x.teamId === team.id)[0];
  if (bigTalk && struggling && !tourney) {
    cands.push({ key: 'pg.claimFollow', topic: 'followup', w: 11, onAsk: () => { bigTalk.followed = true; }, build: () => makeQ(team, { role: 'columnist', tag: 'Follow-up', quote: quoteOf(state, bigTalk) }, team.record.streak <= -3 ? `That's ${-team.record.streak} straight losses, and you're ${team.record.w}-${team.record.l}. Do you still stand by what you said?` : `After a loss like tonight, ${team.record.w}-${team.record.l} on the year, do you still stand by what you said?`, [
      A('confident', `Every word. Talk to me in March.`, [{ kind: 'hype', delta: 3 }, { kind: 'security', delta: -2 }, { kind: 'morale', target: 'team', delta: 2 }]),
      A('humble', `Maybe I got ahead of myself. Right now we need to win one game.`, [{ kind: 'mediaRep', delta: 4 }, { kind: 'security', delta: 1 }]),
      A('deflect', `I'm not going to look backward tonight.`, [{ kind: 'mediaRep', delta: -2 }]),
    ]) });
  }

  // ---- the people ----
  if (starP && best && best.pts >= 15 && won) {
    const transferFrom = starP.history.some((h) => h.startsWith(`Transferred from ${opp.school} to`));
    const dd = best.pts >= 10 && best.orb + best.drb >= 10;
    const variant = transferFrom ? 'revenge' : best.pts >= 30 ? '30' : starP.cls === 'FR' ? 'fresh' : dd ? 'dd' : 'base';
    cands.push({
      key: `pg.star.${variant}`, topic: 'star', w: transferFrom ? 9 : 6,
      build: () => makeQ(team, { role: variant === 'revenge' ? 'opp' : 'tv', opp, tag: variant === 'revenge' ? 'Storyline' : undefined }, variant === 'revenge'
        ? `${nm(starP)} had ${best.pts} against his old team. Did that one mean a little more to him?`
        : variant === '30'
          ? `${nm(starP)} went for ${best.pts}. Have you seen him shoot like that before?`
          : variant === 'fresh'
            ? `${best.pts} points from a freshman. Is ${starP.first} ahead of schedule?`
            : variant === 'dd'
              ? `${nm(starP)} with a double-double: ${best.pts} and ${best.orb + best.drb}. What does he give you that doesn't show up in the box score?`
              : v(`${nm(starP)} was terrific tonight. Talk about his performance.`, `${nm(starP)} had ${best.pts}. What's clicking for him right now?`, `${best.pts} points from ${starP.first}. Is he playing the best basketball of his career?`, `How much of tonight's game plan ran through ${nm(starP)}?`), [
        A('praise', variant === 'revenge' ? `You'd have to ask him, but I saw the look in his eye at shootaround.` : `He's a special player. Kid's a pro and he plays like one.`, [{ kind: 'morale', target: starP.id, delta: 6 }, { kind: 'followers', target: starP.id, delta: 8000 }]),
        A('humble', `He made winning plays, but his teammates found him. It's a team win.`, [{ kind: 'morale', target: 'team', delta: 2 }]),
        A('fiery', `He can be better. He knows it. We're going to keep pushing him.`, [{ kind: 'morale', target: starP.id, delta: starP.traits.includes('coachable') ? 3 : -4 }, { kind: 'rating', target: starP.id, key: 'iq', delta: 1 }]),
      ]),
    });
  }
  if (!won && worst) {
    cands.push({ key: 'pg.worst', topic: 'struggle', w: 5, build: () => makeQ(team, { role: 'beat' }, v(`${nm(worst)} struggled tonight. Are you considering lineup changes?`, `${nm(worst)} went ${worstBox!.fgm}-for-${worstBox!.fga}. What's going on with him?`, `How do you get ${worst.first} going again?`, `${nm(worst)} looked frustrated out there. Is his confidence an issue?`), [
      A('praise', v(`I've got total confidence in him. He'll bounce back.`, `He's one of the hardest workers we have. Shots will fall.`), [{ kind: 'morale', target: worst.id, delta: 6 }]),
      A('fiery', `Everybody's minutes are up for grabs. Nobody is guaranteed anything.`, [{ kind: 'morale', target: worst.id, delta: -8 }, { kind: 'morale', target: 'team', delta: 1 }]),
      A('deflect', `I'm not going to talk about individual guys tonight.`, [{ kind: 'mediaRep', delta: -1 }]),
    ]) });
  }
  const freshStar = openClaims(state, ['freshStar'], (x) => x.season === state.season && !!x.subject && state.players[x.subject]?.teamId === team.id)[0];
  if (freshStar && state.day >= 12) {
    const p = state.players[freshStar.subject!];
    const ppg = p.stats.gp ? p.stats.pts / p.stats.gp : 0;
    cands.push({ key: 'pg.freshFollow', topic: 'followup', w: 4, onAsk: () => { freshStar.followed = true; }, build: () => makeQ(team, { role: 'beat', tag: 'Follow-up', quote: quoteOf(state, freshStar) }, ppg >= 11
      ? `You said ${p.first} would start from day one. He's averaging ${ppg.toFixed(1)} points. Is he exceeding even your expectations?`
      : `You were high on ${nm(p)} in the preseason. He's at ${ppg.toFixed(1)} points a game. Is the freshman adjustment harder than you expected?`, ppg >= 11 ? [
      A('confident', `No. This is exactly who I said he was.`, [{ kind: 'morale', target: p.id, delta: 5 }, { kind: 'hype', delta: 2 }]),
      A('praise', `He's a worker. He earned every bit of it.`, [{ kind: 'morale', target: p.id, delta: 4 }, { kind: 'morale', target: 'team', delta: 1 }]),
    ] : [
      A('praise', `He'll be fine. Freshmen take time. I believe in him completely.`, [{ kind: 'morale', target: p.id, delta: 6 }]),
      A('humble', `I probably put too much on him too early. That's on me.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'morale', target: p.id, delta: 2 }]),
    ]) });
  }
  const injured = c.players.slice(0, 8).find((p) => p.injury && p.injury.games > 0);
  if (injured) {
    cands.push({ key: 'pg.injury', topic: 'injury', w: 4, build: () => makeQ(team, { role: 'tv' }, `Any update on ${nm(injured)}? How much are you missing him?`, [
      A('humble', `Day to day. We'll be smart with him. His long-term health comes first.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'morale', target: injured.id, delta: 3 }]),
      A('praise', `You can't replace a guy like that. The others have to step up, and they are.`, [{ kind: 'morale', target: 'team', delta: 2 }]),
      A('deflect', `I don't talk about injuries.`, [{ kind: 'mediaRep', delta: -2 }]),
    ]) });
  }

  // ---- how it happened ----
  const tp = ts.tpa ? ts.tpm / ts.tpa : 0;
  if (ts.tpa >= 15 && tp >= 0.45) {
    cands.push({ key: 'pg.hot', topic: 'shooting', w: 4, build: () => makeQ(team, { role: 'analytics' }, `You made ${ts.tpm} of ${ts.tpa} from three. Is that sustainable, or was it just one of those nights?`, [
      A('confident', `We have shooters. When we move the ball, that's what happens.`, [{ kind: 'hype', delta: 3 }, { kind: 'morale', target: 'team', delta: 2 }]),
      A('joke', `I'd like to take credit for it, but I can't shoot. Never could.`, [{ kind: 'mediaRep', delta: 3 }]),
      A('humble', `Some nights the rim looks like an ocean. We can't count on it.`, [{ kind: 'mediaRep', delta: 2 }]),
    ]) });
  } else if (ts.tpa >= 15 && tp <= 0.25) {
    cands.push({ key: 'pg.cold', topic: 'shooting', w: 4, build: () => makeQ(team, { role: 'analytics' }, `${ts.tpm} for ${ts.tpa} from three. ${won ? 'How do you win shooting like that?' : 'Were those the shots you wanted?'}`, won ? [
      A('praise', `Defense travels. When shots aren't falling, you get stops. Proud of that.`, [{ kind: 'morale', target: 'team', delta: 3 }]),
      A('joke', `We'll be in the gym early tomorrow. Very early.`, [{ kind: 'mediaRep', delta: 2 }]),
    ] : [
      A('humble', `Good looks, they just didn't fall. Keep shooting.`, [{ kind: 'morale', target: 'team', delta: 3 }]),
      A('fiery', `No. We settled. We fell in love with the three and got away from what works.`, [{ kind: 'morale', target: 'team', delta: -1 }, { kind: 'mediaRep', delta: 1 }]),
    ]) });
  }
  if (ts.tov >= 17) {
    cands.push({ key: 'pg.tov', topic: 'details', w: 4, build: () => makeQ(team, { role: 'beat' }, `${ts.tov} turnovers tonight. What's behind the sloppiness?`, [
      A('fiery', `Careless. Unacceptable. We'll fix it, and they won't enjoy how.`, [{ kind: 'morale', target: 'team', delta: -2 }, { kind: 'mediaRep', delta: 1 }]),
      A('humble', `Some of that is their pressure. Some of it's us. We have to value the ball.`, [{ kind: 'mediaRep', delta: 2 }]),
    ]) });
  } else if (!won && Math.abs(margin) <= 6 && ts.fta - ts.ftm >= 7) {
    cands.push({ key: 'pg.ft', topic: 'details', w: 5, build: () => makeQ(team, { role: 'beat' }, `You missed ${ts.fta - ts.ftm} free throws in a ${pts(-margin)} loss. Is that the story of the game?`, [
      A('humble', `Free throws cost us. That's just the truth. We'll shoot a lot of them this week.`, [{ kind: 'mediaRep', delta: 3 }]),
      A('deflect', `There were 40 minutes of plays. You can't pin it on one thing.`, [{ kind: 'mediaRep', delta: -1 }, { kind: 'morale', target: 'team', delta: 2 }]),
    ]) });
  } else if (Math.abs(ts.reb - os.reb) >= 12) {
    const outr = ts.reb > os.reb;
    cands.push({ key: outr ? 'pg.boardsW' : 'pg.boardsL', topic: 'details', w: 3, build: () => makeQ(team, { role: 'beat' }, outr ? `You out-rebounded ${opp.school} ${ts.reb}-${os.reb}. Was that the plan?` : `${opp.school} beat you on the glass, ${os.reb}-${ts.reb}. What happened?`, outr ? [
      A('praise', `Effort plays. Our bigs were relentless.`, [{ kind: 'morale', target: 'team', delta: 3 }]),
      A('confident', `That's our identity. Nobody's going to out-tough us.`, [{ kind: 'hype', delta: 3 }]),
    ] : [
      A('fiery', `They wanted it more. That's the only explanation, and it's not acceptable.`, [{ kind: 'morale', target: 'team', delta: -2 }]),
      A('humble', `They're big and physical. We have to do a better job boxing out.`, [{ kind: 'mediaRep', delta: 2 }]),
    ]) });
  }
  if (ts.bench >= 28 || (ts.bench <= 4 && mine.length > 6)) {
    const deep = ts.bench >= 28;
    cands.push({ key: deep ? 'pg.benchBig' : 'pg.benchNone', topic: 'depth', w: 3, build: () => makeQ(team, { role: 'beat' }, deep ? `Your bench scored ${ts.bench}. How big was that?` : `Your bench scored ${ts.bench} points. Are you worried about depth?`, deep ? [
      A('praise', `Huge. Those guys practice hard every day and they were ready.`, [{ kind: 'morale', target: 'team', delta: 4 }]),
      A('confident', `We're 10 deep. Not many teams can say that.`, [{ kind: 'hype', delta: 3 }]),
    ] : [
      A('humble', `We need more from the second unit, and I need to find the right combinations.`, [{ kind: 'mediaRep', delta: 2 }]),
      A('fiery', `Guys coming off the bench need to bring energy. It wasn't there.`, [{ kind: 'morale', target: 'team', delta: -2 }]),
    ]) });
  }
  if (won && oppLead >= 10) {
    cands.push({ key: 'pg.comeback', topic: 'flow', w: 7, build: () => makeQ(team, { role: 'tv' }, `You were down ${oppLead} at one point. What changed?`, [
      A('praise', `Our guys never blinked. Nobody panicked. That's character.`, [{ kind: 'morale', target: 'team', delta: 5 }]),
      A('humble', `We dug ourselves a hole. I'm glad we climbed out, but we can't do that every night.`, [{ kind: 'mediaRep', delta: 3 }]),
      A('joke', `I got some gray hairs tonight. Thanks, guys.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'hype', delta: 2 }]),
    ]) });
  } else if (!won && ourLead >= 10) {
    cands.push({ key: 'pg.blown', topic: 'flow', w: 7, build: () => makeQ(team, { role: 'beat' }, `You led by ${ourLead}. How did it slip away?`, [
      A('humble', `We stopped attacking. We played not to lose. That's on me.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'security', delta: -1 }]),
      A('fiery', `We got comfortable. You can't get comfortable against anybody.`, [{ kind: 'morale', target: 'team', delta: -2 }]),
      A('deflect', `They made shots. Sometimes that happens.`, [{ kind: 'mediaRep', delta: -2 }]),
    ]) });
  } else if (won && halfUs < halfThem) {
    cands.push({ key: 'pg.halftime', topic: 'flow', w: 4, build: () => makeQ(team, { role: 'tv' }, `You trailed at the half. What was said in the locker room?`, [
      A('fiery', `Not much that I can repeat on TV.`, [{ kind: 'hype', delta: 3 }, { kind: 'mediaRep', delta: 2 }]),
      A('praise', `The players said it before I could. Our leaders took over.`, [{ kind: 'morale', target: 'team', delta: 4 }]),
    ]) });
  }
  if (!won && Math.abs(margin) <= 5) {
    cands.push({ key: 'pg.refs', topic: 'refs', w: 2.5, build: () => makeQ(team, { role: 'national' }, `There were a couple of tough calls down the stretch. What did you think of the officiating?`, [
      A('fiery', `I'll get fined if I say what I think. Watch the tape and decide for yourself.`, [{ kind: 'morale', target: 'team', delta: 3 }, { kind: 'mediaRep', delta: -3 }, { kind: 'security', delta: -1 }]),
      A('humble', `The officials didn't lose that game. We did.`, [{ kind: 'mediaRep', delta: 4 }]),
      A('joke', `I thought they were great. Next question, before I change my mind.`, [{ kind: 'mediaRep', delta: 2 }]),
    ]) });
  }

  if (c.last && c.last.coachId === c.coach.id && state.day >= 5 && state.day <= 24 && g.type !== 'ncaa') {
    const lh = c.last;
    const better = team.record.w - team.record.l > 2 && lh.w - lh.l < 6;
    const worse = team.record.l - team.record.w >= 1 && lh.w - lh.l >= 6;
    if (better || worse) {
      cands.push({ key: better ? 'pg.lastYearUp' : 'pg.lastYearDown', topic: 'compare', w: 5, build: () => makeQ(team, { role: 'beat', tag: 'Last season' }, better
        ? `Last season ended ${lh.w}-${lh.l}${lh.ncaaSeed ? '' : ' without a tournament bid'}. You're ${team.record.w}-${team.record.l} now. What's different about this group?`
        : `This team won ${lh.w} games last year. You're ${team.record.w}-${team.record.l} now. Why hasn't it carried over?`, better ? [
        A('praise', `Chemistry. These guys genuinely like each other, and it shows on the floor.`, [{ kind: 'morale', target: 'team', delta: 4 }]),
        A('confident', `We're older and tougher. Last year taught us how to win close games.`, [{ kind: 'hype', delta: 4 }]),
        A('humble', `It's early. Ask me again in February.`, [{ kind: 'mediaRep', delta: 3 }]),
      ] : [
        A('humble', `We lost a lot from last year's team, and we're still finding our identity. I have to speed that up.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'security', delta: 1 }]),
        A('fiery', `Some guys think last year's wins come back automatically. They don't.`, [{ kind: 'morale', target: 'team', delta: -2 }, { kind: 'hype', delta: 1 }]),
        A('deflect', `Last year doesn't matter. Different team.`, [{ kind: 'mediaRep', delta: -1 }]),
      ]) });
    }
  }

  // ---- the season around this game ----
  const rematch = state.schedule.find((x) => x.played && x.id !== g.id && x.day < g.day && ((x.home === team.id && x.away === opp.id) || (x.home === opp.id && x.away === team.id)));
  if (rematch && rematch.hs != null && rematch.as != null) {
    const ru = rematch.home === team.id ? rematch.hs : rematch.as, rt = rematch.home === team.id ? rematch.as : rematch.hs;
    const lostFirst = ru < rt;
    cands.push({ key: 'pg.rematch', topic: 'rematch', w: 7, build: () => makeQ(team, { role: 'opp', opp, tag: 'Rematch' }, lostFirst
      ? (won ? `They beat you ${rt}-${ru} the first time. What changed?` : `That's two losses to ${opp.school} this season. What do they do that gives you trouble?`)
      : (won ? `That's a season sweep of ${opp.school}. What's the key against them?` : `You won the first meeting ${ru}-${rt}. Why was tonight different?`), [
      A('praise', won ? `Our guys took that first game personally. You could see it.` : `They're well coached. They made adjustments and we didn't.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'morale', target: 'team', delta: 2 }]),
      A('confident', won ? `We know exactly who they are now. That's going to keep happening.` : `If we see them again, it'll be different. Promise you that.`, [{ kind: 'hype', delta: 4 }]),
      A('deflect', `Every game's different. I don't put much into the first one.`, [{ kind: 'mediaRep', delta: -1 }]),
    ]) });
  }
  if (c.recap?.elim?.oppId === opp.id && !ncaa) {
    const elim = c.recap.elim;
    cands.push({ key: 'pg.revenge', topic: 'rematch', w: 9, build: () => makeQ(team, { role: 'national', tag: 'Last season' }, won
      ? `${opp.school} ended your season in the ${elim.round} last year. How much did that motivate tonight?`
      : `${opp.school} ended your season last March, and they beat you again tonight. Are they in your heads?`, won ? [
      A('fiery', `We didn't say it out loud. We didn't have to.`, [{ kind: 'hype', delta: 6 }, { kind: 'morale', target: 'team', delta: 3 }]),
      A('humble', `Different year, different team. But I won't pretend it doesn't feel good.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'hype', delta: 2 }]),
    ] : [
      A('fiery', `No. And the next time we see them, we'll prove it.`, [{ kind: 'hype', delta: 3 }, { kind: 'morale', target: 'team', delta: 2 }]),
      A('humble', `They're a great team. We have to be better. Simple as that.`, [{ kind: 'mediaRep', delta: 3 }]),
    ]) });
  }
  if (g.type === 'conf' && team.record.cw + team.record.cl >= 5 && c.conf) {
    const st = confStandings(state, team.conf);
    const pos = st.findIndex((t) => t.id === team.id) + 1;
    const leader = st[0];
    const gb = ((leader.record.cw - leader.record.cl) - (team.record.cw - team.record.cl)) / 2;
    const left = state.schedule.filter((x) => !x.played && x.type === 'conf' && (x.home === team.id || x.away === team.id)).length;
    cands.push({ key: pos === 1 ? 'pg.confLead' : gb <= 2 ? 'pg.confChase' : 'pg.confBack', topic: 'conf', w: pos <= 3 ? 6 : 3, build: () => makeQ(team, { role: 'beat' }, pos === 1
      ? `You're ${team.record.cw}-${team.record.cl} and alone at the top of the ${confName(c)}${left ? ` with ${left} league games left` : ''}. Can anybody catch you?`
      : gb <= 2
        ? `You're ${gb === 0 ? 'tied for first' : `${gb} game${gb === 1 ? '' : 's'} back of ${leader.school}`} in the ${confName(c)}. Is a league title realistic?`
        : `You're ${ord(pos)} in the ${confName(c)}, ${gb} games back. What's the goal from here?`, pos <= 2 || gb <= 2 ? [
      A('confident', `We're winning this league. Nobody's taking it from us.`, [{ kind: 'hype', delta: 5 }, { kind: 'morale', target: 'team', delta: 2 }], { kind: 'confTitle' }),
      A('humble', `We don't look at the standings. One game at a time is a cliché because it works.`, [{ kind: 'mediaRep', delta: 3 }]),
      A('praise', `This league is brutal. Being in the race at all says a lot about our guys.`, [{ kind: 'morale', target: 'team', delta: 3 }]),
    ] : [
      A('humble', `Get better every day and be playing our best in March.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'security', delta: 1 }]),
      A('fiery', `Win every game left. That's the only goal I care about.`, [{ kind: 'morale', target: 'team', delta: 2 }, { kind: 'hype', delta: 2 }]),
    ]) });
  }
  if (g.type !== 'ncaa' && state.day >= 22 && state.user.expectationLevel >= 2) {
    const sr = selectionRank(state, team.id);
    if (sr <= 70) {
      const seed = Math.ceil(sr / 4);
      const label = sr <= 36 ? `a projected No. ${seed} seed` : sr <= 46 ? 'just on the right side of the bubble' : sr <= 56 ? 'squarely on the bubble' : 'on the outside looking in';
      cands.push({ key: sr <= 36 ? 'pg.bracketSafe' : 'pg.bubble', topic: 'bracket', w: sr > 36 && sr <= 56 ? 7 : 4, build: () => makeQ(team, { role: 'analytics' }, `Bracketologists have you ${label}. ${sr <= 36 ? 'Do you pay attention to seeding?' : 'How much are you thinking about the bubble?'}`, sr <= 36 ? [
        A('confident', `We want to be on the top line. That's the goal.`, [{ kind: 'hype', delta: 4 }], { kind: 'tourney' }),
        A('humble', `I don't look at it. Win games and the seed takes care of itself.`, [{ kind: 'mediaRep', delta: 3 }]),
      ] : [
        A('confident', `We'll be dancing. I'm not worried.`, [{ kind: 'hype', delta: 4 }, { kind: 'security', delta: -1 }], { kind: 'tourney' }),
        A('humble', `We control our own destiny. Win and we'll be fine.`, [{ kind: 'mediaRep', delta: 3 }]),
        A('fiery', `Every game's a tournament game for us now. The guys know it.`, [{ kind: 'morale', target: 'team', delta: 3 }]),
      ]) });
    }
  }
  if (team.record.streak >= 4 || team.record.streak <= -3) {
    const sk = team.record.streak;
    cands.push({ key: sk > 0 ? 'pg.streakW' : 'pg.streakL', topic: 'streak', w: 6, build: () => makeQ(team, { role: 'beat' }, sk > 0 ? v(`That's ${sk} straight wins. Is this team peaking?`, `${sk} in a row. What's driving this run?`, `Nobody's beaten you in ${sk} games. Does this team feel different?`) : v(`That's ${-sk} losses in a row. Is there any concern about the direction of the program?`, `${-sk} straight losses. How do you stop the bleeding?`, `How is the locker room holding up through ${-sk} straight losses?`), sk > 0 ? [
      A('confident', `We haven't peaked. That's the scary part.`, [{ kind: 'hype', delta: 5 }, { kind: 'morale', target: 'team', delta: 2 }], { kind: 'peaking' }),
      A('humble', `Streaks are fun but they end. Stay present.`, [{ kind: 'mediaRep', delta: 3 }]),
      A('praise', `Our older guys. They've set the tone in practice every day.`, [{ kind: 'morale', target: 'team', delta: 3 }]),
    ] : [
      A('fiery', `Concern? No. Anger? Yes. We'll fix it.`, [{ kind: 'security', delta: 1 }, { kind: 'morale', target: 'team', delta: -1 }]),
      A('humble', `Of course. It's my job to get it turned around and I will.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'security', delta: 2 }]),
      A('deflect', `Ask me in March.`, [{ kind: 'mediaRep', delta: -3 }, { kind: 'security', delta: -2 }]),
    ]) });
  }
  if (ctourn) {
    cands.push({ key: won ? 'pg.ctW' : 'pg.ctL', topic: 'march', w: 6, build: () => makeQ(team, { role: 'national' }, won ? `You're moving on in the ${g.event ?? 'conference tournament'}. How do you keep the legs fresh?` : `Your conference tournament is over. Have you done enough for Selection Sunday?`, won ? [
      A('confident', `Legs don't matter in March. Hearts do.`, [{ kind: 'hype', delta: 3 }, { kind: 'morale', target: 'team', delta: 2 }]),
      A('humble', `Ice baths and film. Survive and advance.`, [{ kind: 'mediaRep', delta: 2 }]),
    ] : [
      A('confident', `Our résumé speaks for itself. We'll be in.`, [{ kind: 'hype', delta: 3 }, { kind: 'mediaRep', delta: -1 }], { kind: 'tourney' }),
      A('humble', `It's out of our hands now. We'll watch on Sunday like everybody else.`, [{ kind: 'mediaRep', delta: 3 }]),
    ]) });
  }
  const homeLeft = state.schedule.some((x) => !x.played && x.home === team.id && !x.neutral && (x.type === 'conf' || x.type === 'nc') && x.day > g.day);
  const seniors = c.players.filter((p) => p.elig <= 1 && !p.redshirting).slice(0, 3);
  if (home && !g.neutral && g.type === 'conf' && !homeLeft && seniors.length) {
    cands.push({ key: 'pg.seniorNight', topic: 'senior', w: 8, build: () => makeQ(team, { role: 'tv', tag: 'Senior Night' }, `Senior night for ${list(seniors.map(nm))}. What will you remember about them?`, [
      A('praise', `They're the reason this program is where it is. I'll miss them more than they know.`, [{ kind: 'morale', target: 'team', delta: 5 }, { kind: 'hype', delta: 3 }]),
      A('humble', `It's emotional. Coaches aren't supposed to cry at the podium, but I came close.`, [{ kind: 'mediaRep', delta: 4 }, { kind: 'hype', delta: 2 }]),
    ]) });
  }
  if (won && state.coaches[state.user.coachId].careerW % 50 === 0 && state.coaches[state.user.coachId].careerW > 0) {
    const w = state.coaches[state.user.coachId].careerW;
    cands.push({ key: 'pg.milestone', topic: 'milestone', w: 9, build: () => makeQ(team, { role: 'tv', tag: 'Milestone' }, `That's career win No. ${w}. What does that number mean to you?`, [
      A('humble', `It means I've been lucky to coach a lot of great players. They won those games.`, [{ kind: 'mediaRep', delta: 4 }, { kind: 'morale', target: 'team', delta: 3 }]),
      A('joke', `It means I'm getting old. Somebody get me a chair.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'hype', delta: 2 }]),
    ]) });
  }
  if (home && !g.neutral && (big || team.hype >= 70) && won) {
    cands.push({ key: 'pg.crowd', topic: 'crowd', w: 3, build: () => makeQ(team, { role: 'student' }, `That crowd tonight. How much did the student section help?`, [
      A('praise', `They were the sixth man. I could barely hear my own huddle. Best fans in the country.`, [{ kind: 'hype', delta: 5 }]),
      A('joke', `I owe them pizza. I said that last time too. I really need to start paying up.`, [{ kind: 'hype', delta: 4 }, { kind: 'mediaRep', delta: 2 }]),
    ]) });
    cands.push({ key: 'pg.recruits', topic: 'recruiting', w: 3, build: () => makeQ(team, { role: 'beat' }, `There were some big-time recruits in the building tonight. What do you hope they saw?`, [
      A('confident', `A program on the rise and the best home crowd in the country.`, [{ kind: 'recruitInterest', delta: 3 }, { kind: 'hype', delta: 2 }]),
      A('humble', `I can't talk about recruits. But I hope everybody in the building had fun.`, [{ kind: 'mediaRep', delta: 2 }, { kind: 'recruitInterest', delta: 1 }]),
    ]) });
  }
  if (g.event && !tourney) {
    cands.push({ key: 'pg.event', topic: 'crowd', w: 3, build: () => makeQ(team, { role: 'national' }, `How much did the atmosphere at the ${g.event} add to tonight?`, [
      A('praise', `Unreal. These are the games you play college basketball for.`, [{ kind: 'hype', delta: 3 }, { kind: 'recruitInterest', delta: 1 }]),
      A('humble', `Fun environment, but it's still 40 minutes of basketball.`, [{ kind: 'mediaRep', delta: 1 }]),
    ]) });
  }
  cands.push({ key: 'pg.opp', topic: 'opp', w: 1.5, build: () => makeQ(team, { role: 'opp', opp }, won ? v(`What makes ${opp.school} such a tough matchup?`, `How did you game-plan for ${opp.school}'s best player?`, `What did you see on film from ${opp.school} that worried you?`) : v(`What did ${opp.school} do that gave you the most trouble?`, `Was ${opp.school} better than you expected?`, `How does ${opp.school} stack up against the best teams you've seen?`), [
    A('praise', `${opp.school} is well coached and they play hard. ${won ? 'We had to earn that one.' : 'They deserved it tonight.'}`, [{ kind: 'mediaRep', delta: 3 }]),
    A('humble', won ? `They make you defend for a full shot clock. That wears on you.` : `Their pace. We never got comfortable.`, [{ kind: 'mediaRep', delta: 2 }]),
  ]) });
  if (!tourney) {
    cands.push({ key: 'pg.nil', topic: 'nil', w: 1.2, build: () => makeQ(team, { role: 'national' }, v(`Any update on NIL? Fans want to know if the collective is doing enough.`, `Is your collective keeping up with the programs you're recruiting against?`), [
      A('confident', `Our collective is going to make some noise. Donors, call me.`, [{ kind: 'nilBudget', delta: 75000 }, { kind: 'mediaRep', delta: -1 }]),
      A('humble', `Our fans and donors have been incredible. We're grateful.`, [{ kind: 'nilBudget', delta: 30000 }, { kind: 'mediaRep', delta: 2 }]),
      A('deflect', `That's a question for the collective, not me.`, [{ kind: 'mediaRep', delta: -1 }]),
    ]) });
  }
  if (team.apRank && won && team.record.w >= 8 && !tourney) {
    cands.push({ key: 'pg.poll', topic: 'poll', w: 2.5, build: () => makeQ(team, { role: 'national' }, `You're ${team.record.w}-${team.record.l} and ranked No. ${team.apRank}. Do you deserve to be higher?`, [
      A('confident', `Put us against anybody in the country. We'll find out.`, [{ kind: 'hype', delta: 4 }, { kind: 'mediaRep', delta: -1 }]),
      A('humble', `Polls don't matter until the last one. We're fine where we are.`, [{ kind: 'mediaRep', delta: 3 }]),
    ]) });
  }
  if (state.day > 3 && won && !tourney) { const f = funQuestion(state, team, 'pg'); f.w = 1.5; cands.push(f); }

  const n = big || cands.some((x) => x.topic === 'followup') ? 4 : 3;
  const title = won ? (upsetWin ? 'Postgame: Statement Win' : rv ? 'Postgame: Rivalry Win' : ncaa ? 'Postgame: Survive and Advance' : 'Postgame Press Conference') : badLoss ? 'Postgame: Damage Control' : ncaa ? 'Postgame: Season Over' : 'Postgame Press Conference';
  return {
    id: rng.id('pc'),
    title,
    context: `${team.school} ${us}, ${opp.school} ${them}${ot ? ` (${box.ot > 1 ? `${box.ot}OT` : 'OT'})` : ''}${g.event ? ` · ${g.event}` : ''}`,
    when,
    questions: choose(state, cands, n).filter((x) => x.answers.length),
  };
}

// ======================================================================
// Selection Sunday
// ======================================================================
export function selectionPresser(state: GameState, field: FieldEntry[]): PressConference | null {
  const c = ctxFor(state);
  const { team } = c;
  const me = field.find((e) => e.teamId === team.id);
  const sr = selectionRank(state, team.id);
  if (!me && sr > 60 && state.user.expectationLevel < 3) return null;
  const cands: Cand[] = [];
  const region = me ? REGIONS[me.region] ?? 'its' : '';
  const r1 = state.ncaa?.rounds.flatMap((r) => r).find((bg) => bg.teams.includes(team.id) && (bg.round <= 1));
  const firstOppId = r1?.teams.find((t) => t && t !== team.id) ?? null;
  const firstOpp = firstOppId ? state.teams[firstOppId] : undefined;
  const expectedSeed = team.apRank ? Math.ceil(team.apRank / 4) : null;

  if (me) {
    const disrespect = expectedSeed != null && me.seed - expectedSeed >= 2;
    cands.push({ key: disrespect ? 'ss.disrespect' : me.firstFour ? 'ss.firstFour' : 'ss.seed', topic: 'seed', w: 10, lead: true, build: () => makeQ(team, { role: 'national' }, disrespect
      ? `You're ranked No. ${team.apRank} but got a No. ${me.seed} seed. Do you feel disrespected by the committee?`
      : me.firstFour
        ? `You're in, but you're headed to the First Four. Your reaction?`
        : v(`A No. ${me.seed} seed in the ${region} Region. Your reaction when you saw your name?`, `No. ${me.seed} seed, ${region} Region. What went through your mind?`), disrespect ? [
      A('fiery', `Disrespected? Yes. And my guys saw it too. Somebody's going to pay for it.`, [{ kind: 'morale', target: 'team', delta: 5 }, { kind: 'hype', delta: 4 }, { kind: 'mediaRep', delta: -2 }]),
      A('humble', `The seed doesn't matter. You have to beat good teams no matter where they put you.`, [{ kind: 'mediaRep', delta: 4 }]),
      A('joke', `I'll be sending the committee a fruit basket. A very small one.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'hype', delta: 2 }]),
    ] : [
      A('praise', `Pure joy. Watching my players' faces when our name came up, that's why you do this.`, [{ kind: 'morale', target: 'team', delta: 4 }, { kind: 'hype', delta: 4 }]),
      A('confident', `Happy to be in, but we're not here to just be here. We're here to make a run.`, [{ kind: 'hype', delta: 6 }, { kind: 'morale', target: 'team', delta: 2 }], { kind: 'deepRun' }),
      A('humble', `Grateful. A lot of good teams are sitting at home tonight.`, [{ kind: 'mediaRep', delta: 4 }]),
    ]) });
  } else {
    cands.push({ key: 'ss.snub', topic: 'seed', w: 10, lead: true, build: () => makeQ(team, { role: 'national' }, `Your name wasn't called. Was the committee wrong?`, [
      A('fiery', `Absolutely. Look at our résumé and tell me with a straight face we're not a tournament team.`, [{ kind: 'morale', target: 'team', delta: 3 }, { kind: 'mediaRep', delta: -3 }, { kind: 'hype', delta: 2 }]),
      A('humble', `We left the door open. We didn't win enough games. That's on us, and on me.`, [{ kind: 'mediaRep', delta: 4 }, { kind: 'security', delta: 1 }]),
      A('deflect', `I'm not going to criticize the committee. It's a tough job.`, [{ kind: 'mediaRep', delta: 2 }]),
    ]) });
    cands.push({ key: 'ss.next', topic: 'future', w: 6, build: () => makeQ(team, { role: 'beat' }, `What does this team need to do this offseason to make sure this doesn't happen again?`, [
      A('confident', `Get tougher, get deeper, and get back. We'll be dancing next year.`, [{ kind: 'hype', delta: 4 }], { kind: 'tourney' }),
      A('humble', `Look in the mirror, starting with me. Then get to work.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'security', delta: 1 }]),
    ]) });
  }
  if (firstOpp) {
    cands.push({ key: 'ss.opp', topic: 'opp', w: 7, build: () => makeQ(team, { role: 'opp', opp: firstOpp }, `You'll open against ${firstOpp.school}${firstOpp.apRank ? `, ranked No. ${firstOpp.apRank}` : ''}. What do you know about them?`, [
      A('praise', `They're dangerous. Well coached, and they won't be scared of anybody.`, [{ kind: 'mediaRep', delta: 3 }]),
      A('confident', `I know they've got their hands full with us.`, [{ kind: 'hype', delta: 4 }, { kind: 'mediaRep', delta: -1 }]),
      A('joke', `I know where they're from and that's about it. Give me 24 hours and a pot of coffee.`, [{ kind: 'mediaRep', delta: 3 }]),
    ]) });
  }
  if (me && !me.firstFour) {
    const pods: Record<number, number> = { 1: 8, 16: 8, 8: 1, 9: 1, 4: 5, 13: 5, 5: 4, 12: 4, 3: 6, 14: 6, 6: 3, 11: 3, 2: 7, 15: 7, 7: 2, 10: 2 };
    const r2 = field.find((e) => e.region === me.region && e.seed === pods[me.seed]);
    if (r2) {
      const t2 = state.teams[r2.teamId];
      cands.push({ key: 'ss.path', topic: 'path', w: 5, build: () => makeQ(team, { role: 'analytics' }, `A win would likely set up No. ${r2.seed} seed ${t2.school}. Have you looked that far ahead?`, [
        A('humble', `Not for a second. We have one game on our schedule right now.`, [{ kind: 'mediaRep', delta: 3 }]),
        A('confident', `I've looked at the whole bracket. I like our path.`, [{ kind: 'hype', delta: 4 }], { kind: 'deepRun' }),
      ]) });
    }
  }
  const h = c.last;
  if (h && h.coachId === c.coach.id) {
    const elim = c.recap?.elim ? state.teams[c.recap.elim.oppId] : undefined;
    cands.push({ key: h.ncaaSeed ? 'ss.lastMarch' : 'ss.lastMissed', topic: 'history', w: 6, build: () => makeQ(team, { role: 'beat', tag: 'Last season' }, h.ncaaSeed
      ? `Last March ended ${postseasonPhrase(h)}${elim ? ` against ${elim.school}` : ''}. What's different about this team?`
      : `You missed the tournament last year. ${me ? 'What does it mean to get back?' : 'Is this one harder to take?'}`, [
      A('praise', `This group is tougher. They've been through it together.`, [{ kind: 'morale', target: 'team', delta: 4 }]),
      A('confident', `We're older, deeper, and hungrier. Watch.`, [{ kind: 'hype', delta: 4 }]),
      A('humble', `Every March is different. We'll find out together.`, [{ kind: 'mediaRep', delta: 3 }]),
    ]) });
  }
  if (me) {
    cands.push({ key: 'ss.expect', topic: 'expect', w: 4, build: () => makeQ(team, { role: 'beat' }, `The goal at the start of the year was to "${state.user.expectation.toLowerCase()}". Does that weigh on you this week?`, [
      A('confident', `We set that bar for a reason. We'll clear it.`, [{ kind: 'hype', delta: 3 }, { kind: 'security', delta: -1 }], { kind: 'beatExpect' }),
      A('humble', `I don't think about it. I think about our first game.`, [{ kind: 'mediaRep', delta: 2 }]),
    ]) });
    cands.push({ key: 'ss.bracket', topic: 'fun', w: 4, build: () => makeQ(team, { role: 'student' }, `Did you fill out a bracket? Who do you have winning it all?`, [
      A('confident', `Us. Every bracket in my house has us cutting down the nets.`, [{ kind: 'hype', delta: 6 }, { kind: 'morale', target: 'team', delta: 2 }], { kind: 'deepRun' }),
      A('joke', `My daughter filled mine out. She picked teams by mascot. She'll probably win the pool.`, [{ kind: 'mediaRep', delta: 4 }, { kind: 'hype', delta: 2 }]),
      A('humble', `I'll fill one out when we're done playing.`, [{ kind: 'mediaRep', delta: 2 }]),
    ]) });
    const tourneyClaim = openClaims(state, ['tourney'], (x) => x.teamId === team.id && x.season === state.season)[0];
    if (tourneyClaim) {
      cands.push({ key: 'ss.claimDelivered', topic: 'followup', w: 9, onAsk: () => { tourneyClaim.followed = true; }, build: () => makeQ(team, { role: 'columnist', tag: 'Follow-up', quote: quoteOf(state, tourneyClaim) }, `You said this team would be dancing. Here you are. Does it feel good to be right?`, [
        A('confident', `I never doubted it. Not for a second.`, [{ kind: 'hype', delta: 4 }, { kind: 'mediaRep', delta: 1 }]),
        A('praise', `The players made me right. All credit to them.`, [{ kind: 'morale', target: 'team', delta: 4 }, { kind: 'mediaRep', delta: 2 }]),
      ]) });
    }
  }
  const seniors = c.players.filter((p) => p.elig <= 1 && !p.redshirting).slice(0, 2);
  if (seniors.length) {
    cands.push({ key: 'ss.seniors', topic: 'seniors', w: 4, build: () => makeQ(team, { role: 'tv' }, `This is the last March for ${list(seniors.map(nm))}. How do you think they'll handle it?`, [
      A('praise', `They've been waiting their whole careers for this. They'll lead us.`, [{ kind: 'morale', target: 'team', delta: 4 }]),
      A('humble', `It's emotional for them. I just want them to enjoy every minute.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'morale', target: 'team', delta: 2 }]),
    ]) });
  }
  return { id: rng.id('pc'), title: 'Selection Sunday', context: me ? `${team.school} is a No. ${me.seed} seed in the ${region} Region.` : `${team.school} is left out of the field of 68.`, when: 'on Selection Sunday', questions: choose(state, cands, 4) };
}

// ======================================================================
// End of season
// ======================================================================
export function seasonEndPresser(state: GameState, summary: string): PressConference {
  const c = ctxFor(state);
  const { team, coach } = c;
  const os = state.offseason;
  const h = team.history[team.history.length - 1];
  const achieved = os?.achieved ?? 0;
  const goal = state.user.expectationLevel;
  const cands: Cand[] = [];

  const verdict = achieved > goal ? 'over' : achieved === goal ? 'met' : 'under';
  cands.push({ key: `se.grade.${verdict}`, topic: 'grade', w: 10, lead: true, build: () => makeQ(team, { role: 'beat' }, verdict === 'over'
    ? v(`The goal was to "${state.user.expectation.toLowerCase()}", and you blew past it. How would you grade this season?`, `You exceeded every expectation this year. What grade do you give it?`)
    : verdict === 'met'
      ? `You hit your AD's goal of "${state.user.expectation.toLowerCase()}". How would you grade the season?`
      : v(`The goal was to "${state.user.expectation.toLowerCase()}", and you came up short. Is it fair to call this a disappointment?`, `This season didn't meet expectations. What went wrong?`), verdict === 'under' ? [
    A('humble', `Yes. It's fair. I own it, and I'll fix it.`, [{ kind: 'mediaRep', delta: 4 }, { kind: 'security', delta: 2 }]),
    A('fiery', `Not good enough. The standard here is higher than this, and everybody will feel that this offseason.`, [{ kind: 'security', delta: 2 }, { kind: 'morale', target: 'team', delta: -2 }]),
    A('deflect', `Injuries, bad bounces, close losses. A lot of things went against us.`, [{ kind: 'mediaRep', delta: -3 }, { kind: 'security', delta: -2 }]),
  ] : [
    A('confident', `A-minus. We exceeded what anybody outside our building thought.`, [{ kind: 'hype', delta: 3 }]),
    A('humble', `Incomplete. We have a long way to go.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'security', delta: 1 }]),
    A('praise', `An A for the players. They gave me everything. My grade is a little lower.`, [{ kind: 'morale', target: 'team', delta: 4 }, { kind: 'mediaRep', delta: 2 }]),
  ]) });

  // ---- holding him to this season's words ----
  const delivered = (cl: PressClaim): boolean => {
    switch (cl.kind) {
      case 'deepRun': return DEEP.includes(h?.postseason ?? '');
      case 'tourney': return h?.ncaaSeed != null;
      case 'beatExpect': return achieved > goal;
      case 'confTitle': return !!(h?.confChamp || h?.confTourneyChamp);
      case 'rankedHigher': return h?.apFinal != null && h.apFinal < Number(cl.subject ?? 99);
      case 'allAmerican': return state.awards.some((a) => a.season === state.season && a.playerId === cl.subject && /All-American/.test(a.name));
      case 'freshStar': { const p = state.players[cl.subject ?? '']; return !!p && p.stats.gp > 0 && p.stats.pts / p.stats.gp >= 10; }
      default: return true;
    }
  };
  const claims = openClaims(state, ['deepRun', 'tourney', 'beatExpect', 'confTitle', 'rankedHigher', 'allAmerican', 'freshStar'], (x) => x.season === state.season && x.teamId === team.id);
  const focus = claims.find((x) => !delivered(x)) ?? claims[0];
  if (focus) {
    const ok = delivered(focus);
    const subject = focus.subject ? state.players[focus.subject] : undefined;
    const result = h ? `${h.w}-${h.l}${h.postseason ? `, ${h.postseason}` : h.ncaaSeed ? '' : ', no NCAA bid'}` : 'where you finished';
    cands.push({ key: 'se.claimFollow', topic: 'followup', w: 12, onAsk: () => { focus.followed = true; }, build: () => makeQ(team, { role: 'columnist', tag: 'Follow-up', quote: quoteOf(state, focus) }, ok
      ? (focus.kind === 'allAmerican' && subject ? `You called ${subject.first} an All-American in October, and he made it. Did you know?` : `You said it, and you backed it up: ${result}. Was there ever a moment you doubted it?`)
      : (focus.kind === 'allAmerican' && subject ? `You called ${nm(subject)} an All-American. He didn't make the team. Did you put too much on him?` : `You said that ${focus.when}. You finished ${result}. What happened?`), ok ? [
      A('confident', `Never. I knew what we had in that locker room.`, [{ kind: 'hype', delta: 5 }, { kind: 'rep', delta: 2 }]),
      A('humble', `Plenty of moments. The players never doubted, and that's what matters.`, [{ kind: 'mediaRep', delta: 4 }, { kind: 'morale', target: 'team', delta: 3 }]),
    ] : [
      A('humble', `I said it and we didn't deliver. That's on me. You're right to hold me to it.`, [{ kind: 'mediaRep', delta: 5 }, { kind: 'security', delta: 1 }]),
      A('fiery', `I'd say it again. I believe in this program, and I'm not going to apologize for that.`, [{ kind: 'hype', delta: 3 }, { kind: 'mediaRep', delta: -2 }, { kind: 'security', delta: -1 }]),
      A('deflect', `Things change over a season. I'm not going to relitigate October.`, [{ kind: 'mediaRep', delta: -3 }]),
    ]) });
  }

  // ---- March ----
  const elim = pressMemory(state).recap?.season === state.season ? pressMemory(state).recap?.elim : undefined;
  if (elim) {
    const t = state.teams[elim.oppId];
    cands.push({ key: 'se.march', topic: 'march', w: 6, build: () => makeQ(team, { role: 'national' }, `Looking back at the ${t?.school ?? 'final'} loss in the ${elim.round}, what would you do differently?`, [
      A('humble', `A hundred things. I've watched it four times. We'll learn from it.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'security', delta: 1 }]),
      A('praise', `Not much. ${t?.school ?? 'They'} played great. Sometimes you tip your cap.`, [{ kind: 'mediaRep', delta: 3 }]),
      A('fiery', `I'd have had us tougher. We'll never be out-toughed in March again.`, [{ kind: 'morale', target: 'team', delta: 2 }, { kind: 'hype', delta: 2 }]),
    ]) });
  }

  // ---- the people ----
  const star = c.players.filter((p) => p.elig > 1).sort((a, b) => draftScore(b) - draftScore(a))[0];
  if (star) {
    const r = nbaRank(state, star);
    if (r <= 45) {
      cands.push({ key: 'se.nba', topic: 'nba', w: 8, build: () => makeQ(team, { role: 'national' }, `Is ${nm(star)} coming back next year, or is he headed to the NBA? Scouts have him as ${nbaLabel(r)}.`, [
        A('praise', `Whatever he decides, we'll support him 100 percent. That's what we do for our guys.`, [{ kind: 'recruitInterest', delta: 2 }, { kind: 'morale', target: star.id, delta: 4 }, { kind: 'mediaRep', delta: 2 }]),
        A('confident', `I think he'll be back. He has unfinished business here.`, [{ kind: 'hype', delta: 4 }, { kind: 'morale', target: star.id, delta: -2 }]),
        A('deflect', `That's his decision and his family's. I won't speak for him.`, [{ kind: 'mediaRep', delta: 1 }]),
      ]) });
    }
  }
  const seniors = c.players.filter((p) => p.elig <= 1 && !p.redshirting).sort((a, b) => b.ovr - a.ovr).slice(0, 3);
  if (seniors.length) {
    cands.push({ key: 'se.seniors', topic: 'seniors', w: 5, build: () => makeQ(team, { role: 'tv' }, `${list(seniors.map(nm))} played ${seniors.length > 1 ? 'their' : 'his'} last game for ${team.school}. What will you remember?`, [
      A('praise', `How they showed up every single day. They set the standard for everyone after them.`, [{ kind: 'morale', target: 'team', delta: 4 }, { kind: 'recruitInterest', delta: 1 }]),
      A('humble', `That's the hardest part of this job. Saying goodbye.`, [{ kind: 'mediaRep', delta: 3 }]),
    ]) });
  }

  // ---- players who didn't get what they came for ----
  const dvg = state.development;
  if (dvg && dvg.goalsSeason === state.season) {
    const unhappy = c.players.filter((p) => p.elig > 1 && dvg.goals[p.id]?.result === 'missed' && (dvg.goals[p.id].kind === 'minutes' || dvg.goals[p.id].kind === 'starter')).sort((a, b) => b.ovr - a.ovr)[0];
    if (unhappy) {
      cands.push({ key: 'se.unhappy', topic: 'portalRisk', w: 6, build: () => makeQ(team, { role: 'national' }, `${nm(unhappy)} wanted a bigger role this year and didn't get it. Are you worried he'll enter the portal?`, [
        A('humble', `I'll sit down with him this week. He's earned an honest conversation about next year.`, [{ kind: 'morale', target: unhappy.id, delta: 6 }, { kind: 'mediaRep', delta: 2 }]),
        A('confident', `His role grows next season. He knows that, and so does everybody in our building.`, [{ kind: 'morale', target: unhappy.id, delta: 4 }, { kind: 'morale', target: 'team', delta: -1 }]),
        A('deflect', `Every player has to earn his minutes. That's how it works here.`, [{ kind: 'morale', target: unhappy.id, delta: -4 }, { kind: 'morale', target: 'team', delta: 1 }]),
      ]) });
    }
  }

  // ---- the coach's future ----
  const offers = state.user.offers;
  if (offers.length) {
    const best = [...offers].sort((a, b) => state.teams[b.teamId].prestige - state.teams[a.teamId].prestige)[0];
    const t = state.teams[best.teamId];
    cands.push({ key: 'se.job', topic: 'job', w: 11, lead: t.prestige > team.prestige, build: () => makeQ(team, { role: 'national' }, v(`Your name has come up for the ${t.school} job. Are you staying at ${team.school}?`, `There are reports ${t.school} wants to talk to you. Can you tell ${team.school} fans you're not going anywhere?`), [
      A('humble', `I'm not going anywhere. I love this place, and we have unfinished business.`, [{ kind: 'security', delta: 4 }, { kind: 'mediaRep', delta: 2 }, { kind: 'hype', delta: 3 }], { kind: 'notLeaving' }),
      A('confident', `It's flattering. I'll always listen. That's just good business.`, [{ kind: 'rep', delta: 3 }, { kind: 'security', delta: -5 }, { kind: 'hype', delta: -3 }]),
      A('deflect', `I'm not going to comment on rumors.`, [{ kind: 'mediaRep', delta: -2 }, { kind: 'security', delta: -1 }]),
    ]) });
  } else if (coach.jobSecurity < 30) {
    cands.push({ key: 'se.hotseat', topic: 'job', w: 9, build: () => makeQ(team, { role: 'columnist' }, `Do you expect to be the coach here next season?`, [
      A('humble', `That's not my call. I've given everything I have, and I'd like the chance to finish the job.`, [{ kind: 'mediaRep', delta: 4 }, { kind: 'security', delta: 2 }]),
      A('fiery', `Yes. And we're going to make a lot of people eat their words.`, [{ kind: 'hype', delta: 3 }, { kind: 'mediaRep', delta: -2 }]),
      A('deflect', `I'm focused on the offseason. That's all I can control.`, [{ kind: 'mediaRep', delta: -1 }]),
    ]) });
  } else if (os && os.securityDelta >= 9) {
    cands.push({ key: 'se.extension', topic: 'job', w: 5, build: () => makeQ(team, { role: 'beat' }, `There's talk of a contract extension after this season. Are you ready to commit long-term?`, [
      A('humble', `This is home. If they'll have me, I'm not going anywhere.`, [{ kind: 'security', delta: 3 }, { kind: 'hype', delta: 2 }], { kind: 'notLeaving' }),
      A('joke', `I'm committed. My family just bought a house. We're stuck here now.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'hype', delta: 2 }]),
    ]) });
  }

  // ---- next year ----
  cands.push({ key: 'se.portal', topic: 'portal', w: 6, build: () => makeQ(team, { role: 'national' }, v(`What's the plan in the portal this spring?`, `The transfer portal opens soon. Are you buying or keeping your guys?`), [
    A('confident', `We're going shopping. Expect some big names.`, [{ kind: 'nilBudget', delta: 100000 }, { kind: 'hype', delta: 3 }], { kind: 'portalSplash' }),
    A('humble', `Retention first. We want our guys back.`, [{ kind: 'morale', target: 'team', delta: 5 }], { kind: 'retention' }),
    A('deflect', `We'll evaluate everything. No sense tipping our hand.`, [{ kind: 'mediaRep', delta: -1 }]),
  ]) });
  const cr = classRankings(state);
  const ci = cr.findIndex((x) => x.teamId === team.id);
  if (ci >= 0) {
    const topCommit = Object.values(state.recruits).filter((r) => r.committed === team.id).sort((a, b) => a.rank - b.rank)[0];
    cands.push({ key: 'se.class', topic: 'recruiting', w: ci < 25 ? 6 : 3, build: () => makeQ(team, { role: 'beat' }, `Your incoming class ranks No. ${ci + 1} nationally${topCommit ? `, led by ${topCommit.first} ${topCommit.last}` : ''}. How soon can they help?`, [
      A('confident', `Right away. This class is going to change our program.`, [{ kind: 'hype', delta: 5 }, { kind: 'recruitInterest', delta: 2 }]),
      A('humble', `They'll have to earn it like everybody else. But I love the group.`, [{ kind: 'morale', target: 'team', delta: 2 }, { kind: 'mediaRep', delta: 2 }]),
    ]) });
  }
  const prev = team.history.filter((x) => x.season < state.season).slice(-1)[0];
  if (prev && h) {
    const dw = h.w - prev.w;
    if (Math.abs(dw) >= 4) {
      cands.push({ key: dw > 0 ? 'se.improved' : 'se.declined', topic: 'compare', w: 5, build: () => makeQ(team, { role: 'beat', tag: 'Last season' }, dw > 0
        ? `${h.w} wins this year, up ${dw} from last season. What was the biggest reason for the jump?`
        : `${h.w} wins, down ${-dw} from last year. Why did this team take a step back?`, dw > 0 ? [
        A('praise', `Player development. Our returning guys got so much better.`, [{ kind: 'morale', target: 'team', delta: 4 }]),
        A('confident', `Culture. We know who we are now. And we're not done.`, [{ kind: 'hype', delta: 4 }]),
      ] : [
        A('humble', `We lost a lot of experience and I didn't adjust fast enough. I will.`, [{ kind: 'mediaRep', delta: 4 }, { kind: 'security', delta: 1 }]),
        A('deflect', `It was a transition year. We'll be back.`, [{ kind: 'mediaRep', delta: -2 }]),
      ]) });
    }
  }
  if (h && c.conf) {
    cands.push({ key: h.confChamp ? 'se.confChamp' : 'se.conf', topic: 'conf', w: h.confChamp ? 6 : 2.5, build: () => makeQ(team, { role: 'beat' }, h.confChamp
      ? `You won the ${confName(c)} regular-season title. Where does that rank among your accomplishments?`
      : `You finished ${ord(h.confFinish)} in the ${confName(c)}. What separates you from the top of the league?`, h.confChamp ? [
      A('praise', `Right at the top. Winning a league is a grind, and these guys did it.`, [{ kind: 'morale', target: 'team', delta: 4 }, { kind: 'hype', delta: 3 }]),
      A('confident', `It's the first of many.`, [{ kind: 'hype', delta: 5 }]),
    ] : [
      A('humble', `Consistency. We beat good teams, then let games slip we should have won.`, [{ kind: 'mediaRep', delta: 3 }]),
      A('fiery', `Toughness. And we'll get it.`, [{ kind: 'morale', target: 'team', delta: 2 }]),
    ]) });
  }
  const stint = coach.career.filter((x) => x.teamId === team.id);
  if (stint.length >= 3) {
    const first = stint[0], now = stint[stint.length - 1];
    const bids = stint.filter((x) => x.seed != null).length;
    cands.push({ key: 'se.build', topic: 'build', w: 6, build: () => makeQ(team, { role: 'columnist', tag: 'Big picture' }, `That's ${plural(stint.length, 'season')} at ${team.school}: ${first.w}-${first.l} in year one, ${now.w}-${now.l} this year${bids ? `, ${plural(bids, 'NCAA bid')} along the way` : ''}. Where is this program compared to when you took over?`, [
      A('confident', `Light-years ahead. And the next chapter is the best one.`, [{ kind: 'hype', delta: 5 }], { kind: 'beatExpect' }),
      A('humble', `Better, but not finished. Not even close.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'security', delta: 2 }]),
      A('praise', `The players and staff deserve the credit. They bought in when it wasn't easy.`, [{ kind: 'morale', target: 'team', delta: 3 }, { kind: 'mediaRep', delta: 2 }]),
    ]) });
  }
  if (state.awards.some((a) => a.season === state.season && a.name === 'Coach of the Year' && a.coachId === coach.id)) {
    cands.push({ key: 'se.coy', topic: 'award', w: 9, build: () => makeQ(team, { role: 'national', tag: 'Award' }, `You were named National Coach of the Year. What does that mean to you?`, [
      A('humble', `It's a staff award and a players' award. My name just happens to be on it.`, [{ kind: 'mediaRep', delta: 5 }, { kind: 'morale', target: 'team', delta: 3 }]),
      A('joke', `I'll let my wife know. She still makes me take out the trash.`, [{ kind: 'mediaRep', delta: 4 }, { kind: 'hype', delta: 3 }]),
    ]) });
  }
  cands.push({ key: 'se.fans', topic: 'fans', w: 3, build: () => makeQ(team, { role: 'tv' }, `Message to ${team.school} fans heading into the offseason?`, [
    A('praise', `Thank you. You were incredible all year. We're building something.`, [{ kind: 'hype', delta: 4 }, { kind: 'mediaRep', delta: 2 }]),
    A('confident', `Renew those season tickets. Next year is going to be special.`, [{ kind: 'hype', delta: 6 }, { kind: 'security', delta: -1 }], { kind: 'beatExpect' }),
  ]) });

  return { id: rng.id('pc'), title: 'End-of-Season Press Conference', context: summary, when: 'at your end-of-season press conference', questions: choose(state, cands, 5) };
}

// ======================================================================
// Season bookkeeping the media relies on
// ======================================================================
/** At season's end: remember the goal, the result and who ended the season */
export function pressSeasonEnd(state: GameState, achieved: number) {
  const mem = pressMemory(state);
  const uid = state.user.teamId;
  const lastNcaa = state.schedule.filter((g) => g.type === 'ncaa' && g.played && (g.home === uid || g.away === uid)).sort((a, b) => b.day - a.day)[0];
  let elim: { oppId: string; round: string } | undefined;
  if (lastNcaa && lastNcaa.hs != null && lastNcaa.as != null) {
    const us = lastNcaa.home === uid ? lastNcaa.hs : lastNcaa.as, them = lastNcaa.home === uid ? lastNcaa.as : lastNcaa.hs;
    const h = state.teams[uid].history[state.teams[uid].history.length - 1];
    if (us < them) elim = { oppId: lastNcaa.home === uid ? lastNcaa.away : lastNcaa.home, round: h?.postseason || 'NCAA Tournament' };
  }
  mem.recap = { season: state.season, teamId: uid, expectation: state.user.expectation, expectationLevel: state.user.expectationLevel, achieved, elim };
}

/** Before a new season begins: remember who left and who arrived this offseason */
export function pressOffseasonRecap(state: GameState) {
  const mem = pressMemory(state);
  const uid = state.user.teamId;
  if (!mem.recap || mem.recap.season !== state.season) mem.recap = { season: state.season, teamId: uid };
  const r = mem.recap;
  if (r.teamId !== uid) return; // new job: the old program's offseason isn't ours to answer for
  r.drafted = state.draft.filter((d) => d.season === state.season + 1 && d.teamId === uid).sort((a, b) => a.pick - b.pick).map((d) => d.name);
  const ps = state.portal;
  if (ps) {
    const entries = Object.values(ps.entries);
    r.transfersOut = entries.filter((e) => e.from === uid && e.status === 'committed' && e.to !== uid).map((e) => state.players[e.id]).filter(Boolean).map((p) => nm(p));
    r.transfersIn = entries.filter((e) => e.to === uid && e.from !== uid && e.status === 'committed').map((e) => ({ id: e.id, name: state.players[e.id] ? nm(state.players[e.id]) : '', from: state.teams[e.from]?.school ?? '' })).filter((x) => x.name);
    r.portalGrade = ps.grades?.find((g) => g.teamId === uid)?.grade;
  }
  r.signees = (state.offseason?.signed ?? []).map((id) => state.players[id]).filter(Boolean).map((p) => nm(p));
}
