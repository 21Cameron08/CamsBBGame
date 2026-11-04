// Full Court Fanatics: a weekly fan radio show. Two hosts (Big Sal and Dex "The Professor")
// argue about the polls, the players, your team and the week's games, take calls, make
// weekly "locks" (graded on air) and preseason predictions (graded in the finale).
// Everything is generated from the live league. The show uses its own RNG so it never
// changes how games play out.
import { RNG } from './rng';
import type { Coach, GameState, Player, RadioEpisode, RadioEpisodeKind, RadioHost, RadioLine, RadioPicks, RadioSegment, RadioState, RadioTag, ScheduledGame, Team } from './types';
import { teamPlayers } from './team';
import { spread } from './rankings';
import { loreOf } from '../data/lore';
import { FIRST_NAMES } from '../data/names';
import { RIVALRIES } from '../data/rivalries';
import { classRankings } from './recruiting';
import { recordBook } from './records';
import { seasonLabel } from './calendar';
import { normCdf } from './sim';

export const SHOW = { name: 'Full Court Fanatics', station: '98.7 The Hoop', slot: 'Monday nights', tagline: 'Two guys. Zero chill. All takes.' };
export const HOSTS: Record<RadioHost, { name: string; nick: string; short: string; seed: string; colors: [string, string]; bio: string }> = {
  sal: { name: 'Sal Moretti', nick: 'Big Sal', short: 'Sal', seed: 'fcf-big-sal', colors: ['#b83227', '#f5b041'], bio: 'Former high-school benchwarmer. Loud ties, louder takes, no regrets.' },
  dex: { name: 'Dex Holloway', nick: 'The Professor', short: 'Dex', seed: 'fcf-dex-holloway', colors: ['#1f5f8b', '#5dade2'], bio: 'Numbers guy. Has a spreadsheet for everything, including Sal’s bad takes.' },
};
export const TAG_INFO: Record<RadioTag, { label: string; icon: string; cls: string }> = {
  hot: { label: 'Hot take', icon: '🔥', cls: 'hot' },
  bad: { label: 'Bad take', icon: '🗑️', cls: 'bad' },
  good: { label: 'Good take', icon: '🎯', cls: 'good' },
  info: { label: 'Random info', icon: '💡', cls: 'info' },
  lock: { label: 'Lock', icon: '🔒', cls: 'lock' },
};

const KEEP = 12;
const IN_SEASON = ['preseason', 'regular', 'confTourney', 'selection', 'ncaa'];

export function radioState(state: GameState): RadioState {
  return (state.radio ??= { episodes: [], aired: 0, locks: [], record: { sal: [0, 0], dex: [0, 0] }, recordSeason: state.season, recent: [] });
}
export function unheardCount(state: GameState): number {
  return state.radio?.episodes.filter((e) => !e.heard).length ?? 0;
}
export function markHeard(state: GameState, id: string) {
  const e = state.radio?.episodes.find((x) => x.id === id);
  if (e) e.heard = true;
}

// ---------------- helpers ----------------
interface Ctx {
  state: GameState;
  r: RNG;
  R: RadioState;
  U: Team;
  coach: Coach;
  heads: { p: number; t: string }[];
  ep: number;
}
const S = (text: string, tag?: RadioTag): RadioLine => (tag ? { who: 'sal', text, tag } : { who: 'sal', text });
const D = (text: string, tag?: RadioTag): RadioLine => (tag ? { who: 'dex', text, tag } : { who: 'dex', text });
const C = (caller: string, text: string, tag?: RadioTag): RadioLine => (tag ? { who: 'caller', caller, text, tag } : { who: 'caller', caller, text });

const rec = (t: Team) => `${t.record.w}-${t.record.l}`;
const gp = (t: Team) => Math.max(1, t.record.w + t.record.l);
const ppg = (p: Player) => (p.stats.gp ? p.stats.pts / p.stats.gp : 0);
const f1 = (n: number) => n.toFixed(1);
const nm = (p: Player) => `${p.first} ${p.last}`;
const ord = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], m = n % 100; return n + (s[(m - 20) % 10] || s[m] || s[0]); };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const CLS: Record<string, string> = { FR: 'freshman', SO: 'sophomore', JR: 'junior', SR: 'senior', GR: 'grad student' };
const POSN: Record<string, string> = { PG: 'point guard', SG: 'shooting guard', SF: 'wing', PF: 'forward', C: 'center' };
const describe = (p: Player) => `${CLS[p.cls] ?? ''} ${POSN[p.pos] ?? p.pos}`.trim();
/** the school a player plays (or last played) for */
function schoolOf(state: GameState, p: Player): Team | undefined {
  const id = p.teamId ?? p.career[p.career.length - 1]?.teamId;
  return id ? state.teams[id] : undefined;
}

function fresh(c: Ctx, key: string) { return !c.R.recent.includes(key); }
function use(c: Ctx, key: string) { c.R.recent.push(key); if (c.R.recent.length > 90) c.R.recent.splice(0, c.R.recent.length - 90); }
/** pick a variant that hasn't aired recently */
function pickFresh<T>(c: Ctx, prefix: string, items: T[]): T {
  const idx = items.map((_, i) => i).filter((i) => fresh(c, `${prefix}${i}`));
  const i = idx.length ? c.r.pick(idx) : Math.floor(c.r.next() * items.length);
  use(c, `${prefix}${i}`);
  return items[i];
}
/** try generators in random order until one has something to say */
function firstFresh(c: Ctx, prefix: string, gens: ((c: Ctx) => RadioLine[] | null)[]): RadioLine[] {
  const order = c.r.shuffle(gens.map((_, i) => i));
  const freshFirst = [...order.filter((i) => fresh(c, `${prefix}${i}`)), ...order.filter((i) => !fresh(c, `${prefix}${i}`))];
  for (const i of freshFirst) {
    const out = gens[i](c);
    if (out && out.length) { use(c, `${prefix}${i}`); return out; }
  }
  return [];
}
function head(c: Ctx, p: number, t: string) { c.heads.push({ p, t }); }

function ranked(state: GameState): Team[] {
  return Object.values(state.teams).filter((t) => t.apRank).sort((a, b) => a.apRank! - b.apRank!);
}
function byNet(state: GameState): Team[] {
  return Object.values(state.teams).filter((t) => t.net > 0).sort((a, b) => a.net - b.net);
}
function scorers(state: GameState, minGp = 3): Player[] {
  return Object.values(state.players).filter((p) => p.teamId && p.stats.gp >= minGp).sort((a, b) => ppg(b) - ppg(a));
}
function userStar(state: GameState, U: Team): Player | undefined {
  const ps = teamPlayers(state, U.id);
  const withStats = ps.filter((p) => p.stats.gp > 0);
  return (withStats.length ? withStats.sort((a, b) => ppg(b) - ppg(a)) : ps.sort((a, b) => b.ovr - a.ovr))[0];
}
/** games since the last show (or last calendar week for a debut); today's games haven't tipped when the show airs */
function lastWeek(state: GameState): ScheduledGame[] {
  const wk = state.calendar[state.day]?.week ?? 0;
  const from = state.radio?.lastDay ?? state.calendar.findIndex((d) => d.week === wk - 1);
  return state.schedule.filter((g) => g.played && g.day >= Math.max(0, from) && g.day <= state.day && g.hs != null && g.as != null);
}
function result(state: GameState, g: ScheduledGame) {
  const homeWon = (g.hs ?? 0) > (g.as ?? 0);
  const w = state.teams[homeWon ? g.home : g.away], l = state.teams[homeWon ? g.away : g.home];
  const ws = Math.max(g.hs ?? 0, g.as ?? 0), ls = Math.min(g.hs ?? 0, g.as ?? 0);
  return { w, l, ws, ls, margin: ws - ls, score: `${ws}-${ls}`, ot: !!g.ot };
}
/** this calendar week's games (or next week's, if this week is done) */
function upcoming(state: GameState): ScheduledGame[] {
  const wk = state.calendar[state.day]?.week ?? 0;
  const inWeek = (w: number) => state.schedule.filter((g) => !g.played && g.day >= state.day && state.calendar[g.day]?.week === w);
  const now = inWeek(wk);
  return now.length >= 3 ? now : [...now, ...inWeek(wk + 1)];
}
function rivalryOf(a: string, b: string) {
  return RIVALRIES.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
}
function callerName(c: Ctx, local = 0.45): string {
  const first = c.r.pick(FIRST_NAMES);
  const pool = ranked(c.state).slice(0, 25);
  const city = c.r.chance(local) || !pool.length ? c.U.city : c.r.pick(pool).city;
  return `${first} in ${city}`;
}
function month(c: Ctx): string {
  const d = c.state.calendar[c.state.day]?.date;
  return d ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][new Date(d + 'T12:00:00').getMonth()] : 'the season';
}

// ---------------- segments ----------------
const OPENERS: ((c: Ctx) => RadioLine[])[] = [
  () => [S(`Welcome back to ${SHOW.name} on ${SHOW.station}! Big Sal here, and I have been right about everything this week.`), D(`He has not. I'm Dex Holloway, and I have the receipts.`)],
  () => [S(`It's ${SHOW.name}! I'm Big Sal, and next to me is the only man alive who brings a spreadsheet to a tailgate.`), D(`It was laminated. For the rain.`)],
  () => [S(`Phones are lit, takes are hot, and the coffee is not. This is ${SHOW.name}.`), D(`I'm Dex. Somebody please fix the coffee machine.`)],
  () => [S(`We are LIVE! Big Sal and Dex. Two guys, zero chill.`), D(`One guy with zero chill. I'm extremely chill.`)],
  () => [D(`Good evening and welcome to ${SHOW.name}. I'm Dex Holloway, joined as always by Big Sal.`), S(`Joined? People tune in for ME, Dex.`), D(`People tune in for the traffic report after us.`)],
  (c) => [S(`${SHOW.name}, episode ${c.ep}! Can you believe they keep letting us do this?`), D(`Legally they have to. You signed a three-year deal.`)],
  () => [S(`Good evening, college basketball nation! Big Sal Moretti, coming to you from a chair that is way too small for me.`), D(`I'm Dex. We asked for a bigger chair. Management said no.`)],
  () => [D(`Welcome to ${SHOW.name}. Before we start: nothing Sal says tonight is financial advice.`), S(`Or basketball advice.`), D(`Correct.`)],
  () => [S(`Lock the doors, hide the children, it's ${SHOW.name}!`), D(`Please don't lock the doors. It's a fire code thing.`)],
];

const BANTER: ((c: Ctx) => RadioLine[] | null)[] = [
  () => [S(`I tried a cold plunge this week.`), D(`How long did you last?`), S(`One foot. Then I called my mother.`)],
  () => [S(`My uncle Vinnie says the three-point line is a fad.`, 'bad'), D(`It's been around for forty years, Sal.`), S(`Vinnie is a patient man.`)],
  () => [S(`Dex made a spreadsheet of my bad takes.`), D(`It has tabs.`), S(`It has TABS, people. Color-coded tabs.`)],
  () => [S(`I'm giving up carbs until somebody in this sport plays defense.`), D(`So, never.`), S(`I'm making an exception for garlic knots.`)],
  () => [D(`Did you watch any film this week, Sal?`), S(`I watched a movie about a dog who plays basketball. Same thing.`), D(`It is not the same thing.`)],
  (c) => { const t = ranked(c.state)[c.r.int(0, 4)]; return t ? [S(`My barber says ${t.school} is a fraud.`, 'hot'), D(`Is your barber on the selection committee?`), S(`He should be. That man has never been wrong about a fade or a fraud.`)] : null; },
  () => [S(`Producer Tony says we ran eight minutes over last week.`), D(`You did a nine-minute rant about free-throw routines.`), S(`And I'd do it again. Spin the ball ONCE and shoot it.`)],
  () => [D(`The mailbag was full this week.`), S(`Fan mail!`), D(`Mostly people asking you to apologize.`)],
  () => [S(`I bought a foam finger at the airport.`), D(`For which team?`), S(`Doesn't matter. I just like pointing at things.`)],
  () => [D(`I ran ten thousand simulations of the season this week.`), S(`And how many had me being right?`), D(`Four.`), S(`FOUR! I'll take it.`)],
  () => [S(`I got recognized at the grocery store!`), D(`By who?`), S(`The guy who calls in every week to say I'm an idiot. Lovely man. Great cart.`)],
  () => [S(`I started yoga.`), D(`Good for you.`), S(`The instructor asked me to stop yelling "AND ONE" every time I hold a pose.`)],
  (c) => { const [w, l] = c.R.record.sal; return w + l >= 3 ? [D(`Housekeeping: Sal's lock record this season is ${w}-${l}.`), S(`We agreed not to say that on air.`), D(`You agreed. I didn't.`)] : null; },
  (c) => {
    const ts = Object.values(c.state.teams).filter((t) => t.record.w + t.record.l > 0);
    if (ts.length < 50) return null;
    const avg = ts.reduce((s, t) => s + t.record.pf / gp(t), 0) / ts.length;
    return [D(`Random info to start the show: teams are scoring ${f1(avg)} points a game this season.`, 'info'), S(`That's it? I scored more than that in one church-league game in 1994.`), D(`You scored four points in that game. Your mother told me.`)];
  },
  (c) => {
    const t = c.r.pick(ranked(c.state).slice(0, 15).filter((x) => x.capacity > 9000));
    return t ? [D(`${t.arena} holds ${t.capacity.toLocaleString()} people.`, 'info'), S(`And I've been asked to leave it twice.`), D(`Three times.`), S(`The third one was a misunderstanding.`)] : null;
  },
  () => [S(`Dex, I have a new catchphrase.`), D(`Please don't.`), S(`"That's a bucket and a HALF!"`), D(`What does that mean?`), S(`It means a lot of buckets, Dex.`)],
  () => [S(`Somebody mailed me a slice of pizza.`), D(`That's concerning.`), S(`It was cold. I still ate it. Still better than the defense I watched this week.`)],
  () => [D(`Sal, you're wearing two different shoes.`), S(`It's called range, Dex. Like a stretch four.`)],
  () => [S(`I've been working out. Look at these forearms.`), D(`This is radio.`), S(`They can FEEL the forearms, Dex.`)],
  () => [D(`I've got a new stat this week: points per possession after a timeout.`), S(`I've got a new stat too: wings per possession.`), D(`That's not a stat.`), S(`It's a lifestyle.`)],
  (c) => { const m = month(c); return m === 'November' ? [S(`It's November, Dex. The turkey's thawing and the takes are ready.`), D(`Feast Week. Neutral courts, island resorts, and Sal on a strict all-stuffing diet.`)] : m === 'December' ? [S(`Happy holidays, everybody. Dex got me a calculator.`), D(`So you can check your lock record yourself.`)] : m === 'January' ? [S(`Conference play, baby! No more cupcakes!`), D(`You love cupcakes.`), S(`On my plate, Dex. Not on the schedule.`)] : m === 'February' ? [S(`February. Bubble season. My favorite time to panic about teams I don't even root for.`)] : m === 'March' ? [S(`It's MARCH, Dex!`), D(`It is March.`), S(`Say it with feeling!`), D(`It is... March.`)] : null; },
];

function introSeg(c: Ctx, open?: RadioLine[], debut = false): RadioSegment {
  const lines: RadioLine[] = [];
  if (debut) {
    lines.push(S(`Hello, hello, HELLO! This is the first-ever episode of ${SHOW.name} on ${SHOW.station}. I'm Big Sal Moretti!`));
    lines.push(D(`And I'm Dex Holloway. They gave us a radio show, Sal.`));
    lines.push(S(`They gave us a radio show, Dex. And nobody stopped them.`));
    lines.push(D(`Every week we'll talk polls, players, games and, unfortunately, Sal's opinions. Phone lines are open.`));
  } else {
    lines.push(...(open ?? pickFresh(c, 'open', OPENERS)(c)));
    lines.push(...firstFresh(c, 'banter', BANTER));
  }
  return { title: 'Cold Open', icon: '🎙️', lines };
}

function pollSeg(c: Ctx): RadioSegment | null {
  const { state, r } = c;
  const top = ranked(state);
  if (top.length < 10) return null;
  const lines: RadioLine[] = [];
  const one = top[0];
  const newPoll = (c.R.pollCount ?? -1) !== state.polls.length;
  const wasNo1 = c.R.no1;
  c.R.pollCount = state.polls.length;
  c.R.no1 = one.id;
  if (!newPoll) {
    if (state.phase !== 'confTourney') return null;
    lines.push(D(`No new poll this week. It's Championship Week, and ${one.school} is still No. 1 at ${rec(one)}.`), S(`Polls don't matter now, Dex. Survive and advance!`));
    return { title: 'The Poll', icon: '📊', lines };
  }
  if (one.record.w + one.record.l === 0) {
    lines.push(S(`${one.school} opens the season at No. 1. They haven't played a game and I'm already sick of them.`, 'hot'), D(`That's a new record, even for you.`));
  } else if (wasNo1 && wasNo1 !== one.id) {
    lines.push(S(`New No. 1 in the country: ${one.school}! I called this. I called this in October.`, 'hot'));
    const p = c.R.preds?.season === state.season ? c.R.preds.sal.title : undefined;
    lines.push(p && p !== one.id ? D(`In October you picked ${state.teams[p].school} to win it all.`) : D(`They're ${rec(one)} and No. ${one.net} in the NET. Hard to argue.`, 'good'));
    if (p && p !== one.id) lines.push(S(`October Sal was a different man, Dex. A younger man.`));
    head(c, 6, `New No. 1: ${one.school}`);
  } else {
    lines.push(...r.pick([
      [S(`${one.school} is No. 1 again. Boring! Somebody beat these guys.`), D(`People have tried. They're ${rec(one)}.`)],
      [S(`${one.school} at the top of the poll. Fine. I don't like it, but fine.`), D(`${rec(one)}, No. ${one.net} in the NET. The numbers like them too.`, 'good')],
      (() => {
        const nx = state.schedule.filter((g) => !g.played && g.day >= state.day && (g.home === one.id || g.away === one.id)).sort((a, b) => a.day - b.day)[0];
        const opp = nx ? state.teams[nx.home === one.id ? nx.away : nx.home] : undefined;
        return opp && opp.net > 120
          ? [D(`${one.school} holds No. 1 at ${rec(one)}.`), S(`I'm saying it now: they lose this week.`, 'bad'), D(`They play ${opp.school}. ${ord(opp.net)} in the NET.`), S(`Trap game, Dex! Classic trap game!`)]
          : [D(`${one.school} holds No. 1 at ${rec(one)}.`), S(`I'm saying it now: they lose this week.`, 'hot'), D(`Next up is ${opp ? opp.school : 'a tough one'}. Could happen.`)];
      })(),
    ]));
  }
  // biggest riser
  const risers = top.filter((t) => t.prevApRank && t.apRank! < t.prevApRank).sort((a, b) => (b.prevApRank! - b.apRank!) - (a.prevApRank! - a.apRank!));
  const newcomers = top.filter((t) => !t.prevApRank);
  const riser = risers[0];
  if (riser && riser.prevApRank! - riser.apRank! >= 4) {
    lines.push(S(`Biggest jump this week: ${riser.school}, from ${riser.prevApRank} to ${riser.apRank}. That's a Final Four team. Put it in writing.`, 'hot'));
    lines.push(r.pick([D(`Let's see them win a road game first.`), D(`They're up to ${ord(riser.net)} in the NET. I'll allow it.`, 'good'), D(`It's ${month(c)}, Sal.`)]));
    head(c, 3, `${riser.school} is rising`);
  } else if (newcomers.length) {
    const n = newcomers[0];
    lines.push(S(`Welcome to the poll, ${n.school}! No. ${n.apRank}! Get comfortable.`));
    lines.push(D(`${rec(n)}. First time in the Top 25 this season.`));
  }
  // biggest faller
  const fallers = top.filter((t) => t.prevApRank && t.apRank! > t.prevApRank).sort((a, b) => (b.apRank! - b.prevApRank!) - (a.apRank! - a.prevApRank!));
  const fell = fallers[0];
  if (fell && fell.apRank! - fell.prevApRank! >= 4) {
    const bad = fell.apRank! <= 15;
    lines.push(S(`${fell.school} drops from ${fell.prevApRank} to ${fell.apRank}. They're cooked. Done. Stick a fork in 'em.`, bad ? 'bad' : 'hot'));
    lines.push(D(bad ? `They're still a top-15 team, Sal. They lost a game.` : fell.record.streak <= -2 ? `They've dropped ${-fell.record.streak} straight. Fair to worry.` : `One bad week. The voters panicked.`, bad ? undefined : 'good'));
    head(c, 3, `Is ${fell.school} cooked?`);
  }
  // overrated / underrated by the numbers
  const over = top.slice(0, 20).filter((t) => t !== fell && t !== riser && t.net - t.apRank! >= 15).sort((a, b) => (b.net - b.apRank!) - (a.net - a.apRank!))[0];
  if (over) {
    lines.push(D(`${over.school} is No. ${over.apRank} in the poll and ${ord(over.net)} in the NET. Somebody's lying.`, 'good'));
    lines.push(...r.pick([[S(`The voters watch the games, Dex. You watch a spreadsheet.`, 'bad')], [S(`I've been saying it for weeks!`), D(`You have not.`)], [S(`Frauds! I KNEW it!`, 'hot'), D(`You had them in your top five last week.`)]]));
  }
  const under = byNet(state).slice(0, 18).find((t) => !t.apRank);
  if (under && fresh(c, `under:${under.id}`)) {
    use(c, `under:${under.id}`);
    lines.push(S(`Nobody is talking about ${under.school}. ${rec(under)}! I'm talking about them.`, 'hot'));
    lines.push(D(`${ord(under.net)} in the NET and not ranked. The voters are asleep.`, 'good'));
  }
  return { title: 'The Poll', icon: '📊', lines };
}

function recapSeg(c: Ctx): RadioSegment | null {
  const { state, r } = c;
  const games = lastWeek(state).filter((g) => fresh(c, `g:${g.id}`)).map((g) => ({ g, ...result(state, g) }));
  if (games.length < 5) return null;
  const cover = (g: ScheduledGame) => use(c, `g:${g.id}`);
  const lines: RadioLine[] = [];
  // biggest upset: unranked over ranked, or a ranked team beating a much higher one
  const ups = games.filter((x) => x.l.apRank && (!x.w.apRank || x.w.apRank - x.l.apRank >= 8)).sort((a, b) => (a.l.apRank ?? 99) - (b.l.apRank ?? 99));
  const up = ups[0];
  if (up) {
    lines.push(r.pick([
      S(`Did everybody see ${up.w.school} take down No. ${up.l.apRank} ${up.l.school}?! Storm the court! Storm it twice!`),
      S(`Upset of the week: ${up.w.school} over No. ${up.l.apRank} ${up.l.school}, ${up.score}. I need to lie down.`),
      S(`${up.w.school}! Beating No. ${up.l.apRank} ${up.l.school}! Somebody get those kids a parade!`),
    ]));
    const salHad = c.R.locks.find((l) => l.gameId === up.g.id && l.who === 'sal');
    if (salHad && salHad.pick === up.l.id) { lines.push(D(`Sal had ${up.l.school} as his lock in that game.`)); lines.push(S(`We're not talking about that, Dex.`)); }
    else lines.push(D(`${up.score}${up.ot ? ' in overtime' : ''}. ${up.w.school} is now ${rec(up.w)}.`));
    head(c, 5, `${up.w.school} shocks No. ${up.l.apRank} ${up.l.school}`);
    cover(up.g);
  }
  // thriller
  const close = games.filter((x) => x.margin <= 2 && (x.w.apRank || x.l.apRank) && x !== up)[0];
  if (close) {
    lines.push(D(`Best finish of the week: ${close.w.school} ${close.ws}, ${close.l.school} ${close.ls}${close.ot ? ' in overtime' : ''}.`));
    lines.push(r.pick([S(`I aged three years watching that.`), S(`My heart can't take these. Keep them coming.`), S(`I spilled an entire plate of nachos on that last possession. Worth it.`)]));
    cover(close.g);
  }
  // blowout
  const blow = games.filter((x) => x.margin >= 30 && x.w.apRank).sort((a, b) => b.margin - a.margin)[0];
  if (blow) {
    lines.push(S(`${blow.w.school} beat ${blow.l.school} by ${blow.margin}. That's not a game, that's a crime scene.`));
    lines.push(r.pick([D(`${blow.score}. The walk-ons played the last eight minutes.`), D(`They shot it well. Very well. ${blow.ws} points.`)]));
    cover(blow.g);
  }
  // biggest individual game
  let best: { name: string; pts: number; team: Team; opp: Team } | undefined;
  for (const x of games) {
    const box = state.boxScores[x.g.id];
    if (!box) continue;
    for (const side of [0, 1] as const) for (const p of box.players[side]) {
      if (!best || p.pts > best.pts) best = { name: p.name, pts: p.pts, team: state.teams[side === 0 ? x.g.home : x.g.away], opp: state.teams[side === 0 ? x.g.away : x.g.home] };
    }
  }
  if (best && best.pts >= 30) {
    lines.push(D(`Performance of the week: ${best.name} of ${best.team.school}, ${best.pts} points against ${best.opp.school}.`, 'info'));
    lines.push(r.pick([S(`Give that young man the keys to the city.`), S(`${best.pts}! I've never scored ${best.pts} of anything. Not even wings.`), S(`Somebody check that kid's shoes. Something's in there.`)]));
    if (best.pts >= 38) head(c, 4, `${best.name} drops ${best.pts}`);
  }
  if (!lines.length) return null;
  return { title: 'Around the Country', icon: '🌎', lines };
}

function yoursSeg(c: Ctx): RadioSegment {
  const { state, r, U, coach } = c;
  const lines: RadioLine[] = [];
  const star = userStar(state, U);
  const games = lastWeek(state).filter((g) => g.home === U.id || g.away === U.id).map((g) => result(state, g));
  const st = U.record.streak;
  const sec = coach.jobSecurity ?? 60;
  const title = `${U.school} Talk`;
  // March: if the season is over, keep it short
  const ncaaField = state.ncaa ? Object.keys(state.ncaa.seeds) : [];
  const done = (state.phase === 'ncaa' || state.phase === 'selection') && (!ncaaField.includes(U.id) || !aliveTeams(state).includes(U.id));
  if (done) {
    lines.push(ncaaField.includes(U.id)
      ? S(`${U.school}'s season is over at ${rec(U)}. They went down swinging. I'm proud of 'em.`)
      : S(`${U.school} finished ${rec(U)} and missed the dance. Long offseason for Coach ${coach.last}.`));
    if (star && star.stats.gp) lines.push(D(`${nm(star)} finished at ${f1(ppg(star))} a game. ${star.cls === 'SR' || star.cls === 'GR' ? 'His last season, too.' : 'The question is whether he comes back.'}`));
    lines.push(S(r.pick([`Portal season is coming, Coach. Get the phone charged.`, `Next year. I'm already writing the takes.`, `Hold your heads up, ${U.mascot}.`])));
    return { title, icon: '🏠', lines };
  }
  const later = ['February', 'March', 'April'].includes(month(c));
  // Sal's read on the team
  if (st >= 5) {
    lines.push(r.pick([
      S(`${U.school} has won ${st} straight. I'm booking a hotel for the Final Four. Two hotels. One for my takes.`, 'hot'),
      S(`${st} in a row for ${U.school}! Coach ${coach.last} is a genius and I want him to coach my nephew's rec team.`),
    ]));
    head(c, 4, `${U.school} has won ${st} straight`);
  } else if (st <= -3) {
    lines.push(r.pick([
      S(`${U.school} has dropped ${-st} straight. Somebody check on Coach ${coach.last}. Bring soup.`),
      S(`${-st} straight losses for ${U.school}. I'm worried, Dex. I'm genuinely worried.`),
    ]));
    head(c, 4, `What's wrong with ${U.school}?`);
  } else if (U.apRank && U.apRank <= 10) {
    lines.push(S(`${U.school}, No. ${U.apRank} in the country. They look like a team that's playing in April.`, 'hot'));
  } else if (U.apRank) {
    lines.push(S(`${U.school} is ranked ${U.apRank} and I think that's too low. Or too high. I'll know by Thursday.`));
  } else if (U.record.w > U.record.l) {
    lines.push(S(`Nobody respects ${U.school}. ${rec(U)}! I respect ${U.school}.`));
  } else if (U.record.w + U.record.l >= 4) {
    lines.push(S(`${U.school} is ${rec(U)}. That's either a rebuild or a disaster. ${later ? `I'm leaning disaster.` : `Ask me again in February.`}`, later ? 'hot' : undefined));
  } else {
    lines.push(S(`Let's talk ${U.school}. Coach ${coach.last}, ${rec(U)}. I have FEELINGS about this team.`));
  }
  // this week's results
  if (games.length) {
    const recent = games.slice(-3);
    const desc = recent.map((x) => (x.w.id === U.id ? `beat ${x.l.school} ${x.score}` : `lost to ${x.w.school} ${x.score}`));
    lines.push(D(games.length > 3 ? `Busy week. Their last three: they ${desc.join(', ')}.` : `This week they ${desc.join(', then ')}.`));
    const bigWin = games.find((x) => x.w.id === U.id && x.l.apRank);
    const badLoss = games.find((x) => x.l.id === U.id && !x.w.apRank && x.w.net > 100);
    if (bigWin) lines.push(S(`Beating No. ${bigWin.l.apRank} ${bigWin.l.school}! That's a résumé win, baby. Frame it.`));
    else if (badLoss) lines.push(S(`Losing to ${badLoss.w.school}? ${badLoss.w.school}?! I had to pull the car over.`, 'hot'));
  }
  // the numbers
  if (star && star.stats.gp >= 2) {
    const sh = star.stats.fga ? Math.round((star.stats.fgm / star.stats.fga) * 100) : 0;
    lines.push(r.pick([
      D(`${nm(star)} is carrying them: ${f1(ppg(star))} a night on ${sh}% shooting.`, 'good'),
      D(`The engine is ${nm(star)}. ${f1(ppg(star))} points, ${f1((star.stats.orb + star.stats.drb) / star.stats.gp)} boards a game.`),
    ]));
    lines.push(r.pick([
      S(`${star.last} should go pro tomorrow. Mid-season. Just leave. He's too good for this.`, 'bad'),
      S(`${star.last} is an All-American. Write it down.`, 'hot'),
      S(`I'd pay full price to watch ${star.last} do layup lines.`),
    ]));
  } else if (star) {
    lines.push(D(`The guy to watch is ${nm(star)}, a ${describe(star)}.`));
  }
  if (U.record.w + U.record.l >= 5) {
    const off = U.record.pf / gp(U), def = U.record.pa / gp(U);
    lines.push(D(`They're scoring ${f1(off)} and allowing ${f1(def)}. ${def < 66 ? 'That defense is real.' : def > 76 ? 'That defense has to get better.' : off > 80 ? 'That offense can really go.' : 'Pretty balanced.'}`, 'good'));
  }
  // the coach's own words, read back on air
  const claim = (state.user.pressMemory?.claims ?? []).filter((x) => x.teamId === U.id && x.season === state.season && fresh(c, `claim:${x.day}:${x.kind}`)).pop();
  if (claim && r.chance(0.6)) {
    use(c, `claim:${claim.day}:${claim.kind}`);
    lines.push(S(`And remember what Coach ${coach.last} said ${claim.when}: "${claim.text}"`));
    lines.push(r.pick([S(`I'm holding him to that. I wrote it on my fridge.`), D(`Bold. We'll see.`), D(`For the record, that quote is in my spreadsheet.`)]));
  }
  // job security
  if (sec < 35 && U.record.w + U.record.l >= 6) {
    lines.push(D(`Word around town is the boosters are getting restless.`));
    lines.push(S(`Hot seat? Coach ${coach.last}'s seat is a stovetop, Dex.`, 'hot'));
  } else if (sec > 88 && fresh(c, 'secure') && U.record.w > U.record.l) {
    use(c, 'secure');
    lines.push(S(`They should build Coach ${coach.last} a statue. Bronze. Life-size. Maybe bigger.`));
  }
  // next up
  const next = state.schedule.filter((g) => !g.played && g.day >= state.day && (g.home === U.id || g.away === U.id)).sort((a, b) => a.day - b.day)[0];
  if (next) {
    const opp = state.teams[next.home === U.id ? next.away : next.home];
    const home = next.home === U.id && !next.neutral;
    const line = spread(state, next.home, next.away, next.neutral) * (next.home === U.id ? 1 : -1);
    const rv = rivalryOf(U.id, opp.id);
    lines.push(D(`Next up: ${opp.apRank ? `No. ${opp.apRank} ` : ''}${opp.school}${home ? ' at home' : next.neutral ? ' on a neutral floor' : ' on the road'}.${rv ? ` ${rv.name ?? 'Rivalry game'}.` : ''} ${line > 0.5 ? `${U.school} by about ${Math.round(line)} in my numbers.` : line < -0.5 ? `${opp.school} by about ${Math.round(-line)} in my numbers.` : 'Coin flip.'}`));
    lines.push(r.pick([
      S(`${U.school} by twenty. Easy. I'm never wrong.`, line < -6 ? 'bad' : 'hot'),
      S(`I've got a bad feeling about this one. Trap game.`),
      rv ? S(`It's ${rv.name ?? 'a rivalry game'}! Throw the records out! Throw the spreadsheet out too, Dex!`) : S(`${opp.school}? I've never trusted ${opp.mascot}. Never.`),
    ]));
  }
  return { title, icon: '🏠', lines };
}

function spotlightSeg(c: Ctx): RadioSegment | null {
  const { state, r, U } = c;
  const sc = scorers(state, 4);
  if (sc.length < 20) return null;
  const lines: RadioLine[] = [];
  const top = sc[0];
  const tteam = state.teams[top.teamId!];
  lines.push(D(`The nation's leading scorer: ${nm(top)} of ${tteam.school}, ${f1(ppg(top))} a game.`, 'info'));
  lines.push(r.pick([
    S(`Best player in the country and it's not close.`, 'hot'),
    S(`Empty calories. Put him on a winning team and see what happens.`, tteam.record.w > tteam.record.l ? 'bad' : 'hot'),
    S(`I'd let that kid shoot in my living room.`),
  ]));
  // POY race: production on a winning team
  const score = (p: Player) => { const t = state.teams[p.teamId!]; const g = Math.max(1, p.stats.gp); return ppg(p) + ((p.stats.orb + p.stats.drb) / g) * 0.6 + (p.stats.ast / g) * 0.8 + (t.record.w / gp(t)) * 8; };
  const race = sc.slice(0, 60).sort((a, b) => score(b) - score(a)).slice(0, 3);
  if (race.length === 3) {
    lines.push(D(`My Player of the Year ballot today: ${race.map((p, i) => `${i + 1}. ${nm(p)}, ${state.teams[p.teamId!].abbr}`).join('. ')}.`, 'good'));
    lines.push(r.pick([
      S(`Wrong order. ${race[2].last} at No. 1. He passes the eye test, Dex. You don't even have eyes. You have a calculator.`, 'hot'),
      S(`${race[0].last}. Fine. I agree. Don't get used to it.`),
      S(`Where's the big man love? Nobody votes for the guys who do the dirty work.`),
    ]));
    head(c, 2, `The Player of the Year race`);
  }
  const fr = sc.find((p) => p.cls === 'FR');
  if (fr && fresh(c, `fr:${fr.id}`)) {
    use(c, `fr:${fr.id}`);
    lines.push(S(`Freshman alert: ${nm(fr)} at ${state.teams[fr.teamId!].school}, ${f1(ppg(fr))} points a game. Eighteen years old! At eighteen I was getting cut from my JV team.`));
    lines.push(D(`Twice.`));
  }
  const mine = sc.slice(0, 40).find((p) => p.teamId === U.id);
  if (mine) lines.push(D(`And from ${U.school}, ${nm(mine)} is ${ord(sc.indexOf(mine) + 1)} in the country at ${f1(ppg(mine))}.`));
  return { title: 'Player Spotlight', icon: '⭐', lines };
}

const CALLS: ((c: Ctx, who: string) => RadioLine[] | null)[] = [
  (c, who) => { const l = lastWeek(c.state).filter((g) => g.home === c.U.id || g.away === c.U.id).map((g) => result(c.state, g)).find((x) => x.l.id === c.U.id); return l ? [C(who, `I've had it. We lost to ${l.w.school}. Fire everybody.`, 'bad'), S(`Everybody? Even the mascot?`), C(who, `ESPECIALLY the mascot. He knows what he did.`), D(`For the record, ${c.U.school} is ${rec(c.U)}.`)] : null; },
  (c, who) => c.U.record.streak >= 3 ? [C(who, `Long-time listener, first-time caller. ${c.U.school} is winning the whole thing. I already bought the T-shirt.`, 'hot'), S(`I love the energy!`), D(`It's ${month(c)}.`), C(who, `The shirt was nonrefundable, Dex.`)] : null,
  (c, who) => [C(who, `My dog picks games by which food bowl he walks to first. He's ${c.r.int(9, 14)}-${c.r.int(1, 4)} this year.`), D(`That's a better record than Sal's.`), S(`Hang up on this man. And the dog.`)],
  (_c, who) => [C(who, `Sal, you're wrong about everything.`), S(`Thank you for calling!`), C(who, `I mean it.`), S(`I know you do, sweetheart. Next caller.`)],
  (c, who) => { const t = ranked(c.state).slice(0, 12).find((x) => x.record.l >= 2); return t ? [C(who, `${t.school} is going undefeated.`, 'bad'), D(`They have ${t.record.l} losses.`), C(who, `Starting now.`)] : null; },
  (_c, who) => [C(who, `Why don't they lower the rims so regular guys like me can dunk?`, 'bad'), S(`You know what? I'm for it.`), D(`I'm hanging up on both of you.`)],
  (_c, who) => [C(who, `Is it true Dex has never been to a game in person?`), D(`I watch the play-by-play data. It's purer.`), S(`He's never smelled arena nachos, folks. Pray for him.`)],
  (c, who) => [C(who, `My wife says if ${c.U.school} makes the Final Four, we can name the baby after Coach ${c.coach.last}.`), S(`What if it's a girl?`), C(who, `Still ${c.coach.last}.`), S(`Beautiful. That's family.`)],
  (c, who) => { const p = scorers(c.state, 4)[0]; return p ? [C(who, `${nm(p)} is the best player I've ever seen, and I've been watching since they used peach baskets.`, 'hot'), D(`He's averaging ${f1(ppg(p))}. He's good.`), S(`Peach baskets? How old are you?`), C(who, `Ninety-one. Don't change the subject.`)] : null; },
  (_c, who) => [C(who, `I want to defend the zone.`), S(`Nobody wants to hear this.`), C(who, `It's beautiful, Sal. It's like a hug, but for the paint.`), D(`That's... actually not bad.`, 'good')],
  (c, who) => { const p = userStar(c.state, c.U); return p && p.stats.gp >= 3 ? [C(who, `${c.U.school} needs to get the ball to ${p.last} every single possession.`, 'bad'), D(`He's already taking ${Math.round((p.stats.fga / Math.max(1, gp(c.U))) * 10) / 10} shots a game.`), C(who, `Make it a hundred.`)] : null; },
  (c, who) => { const r = RIVALRIES.find((x) => x.a === c.U.id || x.b === c.U.id); const o = r ? c.state.teams[r.a === c.U.id ? r.b : r.a] : undefined; return o ? [C(who, `I just want to say I can't stand ${o.school}. That's it. That's the call.`), S(`Beautiful. Thank you. Next caller.`)] : null; },
  (_c, who) => [C(who, `Sal, I named my fantasy team after you.`), S(`Aw! What's it called?`), C(who, `"Wrong Again."`)],
  (_c, who) => [C(who, `Every team should be allowed one player over forty.`, 'bad'), S(`Are you over forty?`), C(who, `I'm available Tuesdays and Thursdays.`)],
  (c, who) => { const up = lastWeek(c.state).map((g) => result(c.state, g)).find((x) => x.l.apRank && !x.w.apRank); return up ? [C(`${who.split(' in ')[0]} in ${up.w.city}`, `${up.w.school} fan here. We stormed the court and I lost a shoe. Worth it.`), S(`Did you get the shoe back?`), C(`${who.split(' in ')[0]} in ${up.w.city}`, `No. If anybody finds a size 13 by the scorer's table, it's mine.`)] : null; },
  (c, who) => [C(who, `I think Coach ${c.coach.last} should run more. More running. Everybody running.`, 'bad'), D(`Run what?`), C(who, `Just... running, Dex.`)],
  (_c, who) => [C(who, `Dex, what's the most important stat in basketball?`), D(`Points per possession, adjusted for opponent.`, 'good'), S(`Wrong. It's heart.`), D(`Heart isn't tracked.`), S(`That's why you can't see it, Dex.`)],
  (_c, who) => [C(who, `I've been to every home game for thirty-one years.`), S(`Respect.`), C(who, `I just wanted to say that. Also my seats are terrible.`)],
];

/** calls about the user's team come from the user's town */
const LOCAL_CALLS = new Set([0, 1, 7, 10, 11, 15]);
function hotlineSeg(c: Ctx): RadioSegment {
  const lines: RadioLine[] = [S(c.r.pick([`Let's go to the phones. You're on ${SHOW.name}!`, `Phone lines are lit up. Line two, go ahead.`, `Hot Take Hotline is open. You're on the air.`]))];
  const n = c.r.chance(0.55) ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const home = callerName(c, 1), any = callerName(c);
    const call = firstFresh(c, 'call', CALLS.map((f, k) => (cc: Ctx) => f(cc, LOCAL_CALLS.has(k) ? home : any)));
    lines.push(...call);
  }
  return { title: 'Hot Take Hotline', icon: '☎️', lines };
}

function triviaSeg(c: Ctx): RadioSegment | null {
  const { state, r, U } = c;
  const gens: ((c: Ctx) => RadioLine[] | null)[] = [
    () => {
      const pool = [U, ...ranked(state).slice(0, 15)].filter((t) => loreOf(t.id));
      const t = pool.find((x) => fresh(c, `lore:${x.id}`)) ?? pool[0];
      const l = t ? loreOf(t.id) : undefined;
      if (!t || !l) return null;
      use(c, `lore:${t.id}`);
      const tr = r.pick(l.traditions);
      return [D(`Random info, ${t.school} edition. ${tr}.`, 'info'), S(r.pick([`I'd go to that. I'd go to that tonight.`, `Chills. Actual chills.`, `We need that here. Why don't we have that here?`, `I tried that once and got escorted out.`]))];
    },
    () => {
      const pool = [U, ...ranked(state).slice(0, 15)].filter((t) => loreOf(t.id)?.moments?.length);
      const t = pool[0] && r.pick(pool);
      const m = t && loreOf(t.id)!.moments!;
      if (!t || !m) return null;
      const mo = r.pick(m);
      const yr = /^(\d{4}): (.*)$/.exec(mo);
      return [D(yr ? `A little history. ${t.school}, ${yr[1]}: ${yr[2]}.` : `A little history from ${t.school}: ${mo}.`, 'info'), S(`That's ${t.school} basketball. They don't make 'em like that anymore.`), D(`They might. That's kind of the point of the season.`)];
    },
    () => {
      const t = r.pick(ranked(state).slice(0, 20).filter((x) => loreOf(x.id)?.titles?.length));
      if (!t) return null;
      const ts = loreOf(t.id)!.titles!;
      const dyn = state.champions.filter((x) => x.teamId === t.id).length;
      return [D(`${t.school} has ${plural(ts.length + dyn, 'national title')}, the last in ${dyn ? state.champions.filter((x) => x.teamId === t.id).pop()!.season + 1 : ts[ts.length - 1]}.`, 'info'), S(r.pick([`And they act like it, Dex. They act like it.`, `I've won zero. But I've had zero chances.`]))];
    },
    () => {
      const rb = recordBook(state);
      const e = rb.league.game.pts?.[0];
      if (!e || e.v < 35) return null;
      return [D(`From the record book: the most points in a game since we started keeping track is ${e.v}, by ${e.n}${e.t ? ` of ${state.teams[e.t]?.school}` : ''}${e.o ? ` against ${state.teams[e.o]?.school}` : ''} in ${seasonLabel(e.s)}.`, 'info'), S(`${e.v}! I've never had ${e.v} of anything. Except wings. Once. Bad night.`)];
    },
    () => {
      const ps = Object.values(state.players).filter((p) => p.teamId && p.stats.gp >= 5);
      if (ps.length < 50) return null;
      const k = r.pick(['tpm', 'blk', 'stl', 'ast'] as const);
      const lead = ps.sort((a, b) => b.stats[k] - a.stats[k])[0];
      const label = { tpm: 'made threes', blk: 'blocked shots', stl: 'steals', ast: 'assists' }[k];
      return [D(`Most ${label} in the country this season: ${nm(lead)} of ${state.teams[lead.teamId!].school}, with ${lead.stats[k]}.`, 'info'), S(r.pick([`Never heard of him. Love him already.`, `Get that man a sandwich and a scholarship.`, `I'd have him on my team. Do I have a team? I should have a team.`]))];
    },
    () => {
      const t = r.pick(Object.values(state.teams).filter((x) => x.record.w + x.record.l >= 5 && x.record.streak >= 6));
      return t ? [D(`Longest active win streak I can find: ${t.school}, ${t.record.streak} straight.`, 'info'), S(`Don't say it out loud! You'll jinx it!`), D(`I'm a numbers guy, Sal. I don't believe in jinxes.`), S(`That's exactly what a jinx would say.`)] : null;
    },
  ];
  const lines = firstFresh(c, 'trivia', gens);
  return lines.length ? { title: 'Random Info with Dex', icon: '💡', lines } : null;
}

function recruitingSeg(c: Ctx): RadioSegment | null {
  const { state, U, r } = c;
  const cr = classRankings(state);
  if (cr.length < 5) return null;
  const top = state.teams[cr[0].teamId];
  const mineIdx = cr.findIndex((x) => x.teamId === U.id);
  const lines: RadioLine[] = [D(`On the recruiting trail, ${top.school} has the No. 1 class right now: ${plural(cr[0].count, 'commit')}.`, 'info')];
  lines.push(S(r.pick([`Rich get richer, Dex. Rich get richer.`, `I'd commit to ${top.school}. Nobody asked me, but I would.`, `Classes don't win games. Except when they do. Which is always.`])));
  if (mineIdx >= 0) lines.push(D(`${U.school} sits at No. ${mineIdx + 1} with ${plural(cr[mineIdx].count, 'commit')}.`), mineIdx < 10 ? S(`Top ten class! The future's bright, people. Wear sunglasses.`) : S(`Gotta close stronger, Coach ${c.coach.last}. Get on the phone!`));
  else lines.push(S(`${U.school} doesn't have a commit yet. Coach ${c.coach.last}, the phone works both ways.`));
  return { title: 'Recruiting Trail', icon: '🎯', lines };
}

// ---------------- locks ----------------
function gradeLocks(c: Ctx): RadioLine[] {
  const { state, R } = c;
  const lines: RadioLine[] = [];
  const pending = R.locks.filter((l) => !l.result);
  let salGraded = 0;
  for (const l of pending) {
    const g = state.schedule.find((x) => x.id === l.gameId);
    if (!g) { l.result = 'L'; continue; }
    if (!g.played) continue;
    const res = result(state, g);
    l.result = res.w.id === l.pick ? 'W' : 'L';
    if (l.season === state.season) R.record[l.who][l.result === 'W' ? 0 : 1]++;
    const pick = state.teams[l.pick], opp = state.teams[l.opp];
    if (l.who === 'sal') {
      lines.push(D(`${salGraded++ ? 'Sal also had' : `Last week Sal's lock was`} ${pick.school} over ${opp.school}.${l.result === 'L' ? ` ${res.w.school} won ${res.score}.` : ''}`));
      lines.push(l.result === 'W'
        ? S(c.r.pick([`And they WON, ${res.score}! Bow down! Kiss the ring!`, `${res.score}! Never in doubt! Okay, a little in doubt.`, `Cash it! Frame it! ${res.score}!`]))
        : S(c.r.pick([`The refs. I'm not saying any more than that.`, `My lock was correct. The players were wrong.`, `I'd like to formally protest the result of that game.`, `We had a bad connection on that one. Next.`])));
    } else {
      lines.push(l.result === 'W' ? D(`My lock, ${pick.school}, got there, ${res.score}.`) : D(`My lock, ${pick.school}, lost ${res.score}. The model has been notified.`));
      if (l.result === 'L') lines.push(S(`The model has been NOTIFIED! Ha! Put that on a T-shirt.`));
    }
  }
  return lines;
}

function locksSeg(c: Ctx): RadioSegment | null {
  const { state, r, R, U } = c;
  const lines = gradeLocks(c);
  const taken = new Set(R.locks.map((l) => l.gameId));
  const games = upcoming(state).filter((g) => state.teams[g.home] && state.teams[g.away] && !taken.has(g.id));
  const interest = (g: ScheduledGame) => {
    const h = state.teams[g.home], a = state.teams[g.away];
    return (g.home === U.id || g.away === U.id ? 40 : 0) + (h.apRank ? 30 - h.apRank : 0) + (a.apRank ? 30 - a.apRank : 0) + (rivalryOf(g.home, g.away) ? 15 : 0) - Math.abs(spread(state, g.home, g.away, g.neutral));
  };
  const top = games.sort((a, b) => interest(b) - interest(a)).slice(0, 4);
  if (top.length >= 2) {
    const dexG = top[0];
    const salG = r.chance(0.45) ? top[0] : top[1 + Math.floor(r.next() * (top.length - 1))];
    const dsp = spread(state, dexG.home, dexG.away, dexG.neutral);
    const dexPick = dsp >= 0 ? dexG.home : dexG.away, dexOpp = dexPick === dexG.home ? dexG.away : dexG.home;
    const ssp = spread(state, salG.home, salG.away, salG.neutral);
    const fav = ssp >= 0 ? salG.home : salG.away, dog = fav === salG.home ? salG.away : salG.home;
    const userIn = salG.home === U.id || salG.away === U.id;
    // Big Sal loves an upset, and loves the local team even more
    const salPick = userIn && r.chance(0.6) ? U.id : salG === dexG ? (r.chance(0.6) ? dog : fav) : r.chance(0.42) ? dog : fav;
    const salOpp = salPick === salG.home ? salG.away : salG.home;
    const sp = state.teams[salPick], so = state.teams[salOpp];
    const upset = salPick === dog && Math.abs(ssp) >= 4;
    lines.push(S(upset
      ? r.pick([`My lock of the week: ${sp.school} over ${so.school}. Upset special. Write it down. Tattoo it.`, `Lock of the week: ${sp.school} beats ${so.school}. Everybody's sleeping on them. Not Big Sal.`])
      : r.pick([`My lock of the week: ${sp.school} over ${so.school}. Easy money.`, `Big Sal's lock: ${sp.school}. Over ${so.school}. Don't even watch the game.`]), 'lock'));
    if (upset) lines.push(D(`${so.school} is favored by ${Math.round(Math.abs(ssp))} in my numbers.`), S(`Your numbers have never been to a gym, Dex.`));
    const conf = Math.round(Math.min(97, 50 + Math.abs(dsp) * 3.3));
    lines.push(D(`My lock: ${state.teams[dexPick].school} over ${state.teams[dexOpp].school}. About ${conf} percent by the model.`, 'lock'));
    if (salG === dexG) lines.push(salPick === dexPick ? S(`Great minds, Dex. Great minds.`) : S(`Same game, opposite sides. Loser buys lunch.`), ...(salPick === dexPick ? [] : [D(`You already owe me four lunches.`)]));
    R.locks.push({ who: 'sal', gameId: salG.id, pick: salPick, opp: salOpp, season: state.season }, { who: 'dex', gameId: dexG.id, pick: dexPick, opp: dexOpp, season: state.season });
    if (R.locks.length > 40) R.locks.splice(0, R.locks.length - 40);
  }
  const [sw, sl] = R.record.sal, [dw, dl] = R.record.dex;
  if (sw + sl + dw + dl > 0) {
    lines.push(D(`Season lock standings: Dex ${dw}-${dl}, Sal ${sw}-${sl}.`));
    if (sw > dw + 2) lines.push(S(`Read it again! Slower! For the people in the back!`));
    else if (dw > sw + 2) lines.push(S(`It's a long season, Dex. A LONG season.`));
  }
  if (!lines.length) return null;
  return { title: 'Locks of the Week', icon: '🔒', lines };
}

function outroSeg(c: Ctx, extra?: RadioLine[]): RadioSegment {
  const lines: RadioLine[] = [...(extra ?? [])];
  lines.push(...pickFresh(c, 'outro', [
    [S(`That's the show! Stay loud, stay wrong, stay Fanatic!`), D(`And check the numbers.`)],
    [D(`That's all the time we have.`), S(`We had more time. Dex wasted it on stats.`), D(`Goodnight, everybody.`)],
    [S(`Big Sal, signing off. Call your mother. Hug your point guard.`), D(`In that order.`)],
    [D(`Thanks for listening to ${SHOW.name}.`), S(`Same time next week. I'll be right. He'll be boring.`)],
    [S(`We're out of here! Producer Tony, roll the music!`), D(`We don't have music. We've never had music.`), S(`Hum something, Tony!`)],
    [S(`That's ${SHOW.name}. If you disagree with me, you're wrong. Goodnight!`), D(`If you disagree with Sal, you're probably right. Goodnight.`)],
  ]));
  return { title: 'Sign-Off', icon: '📻', lines };
}

// ---------------- postseason ----------------
function aliveTeams(state: GameState): string[] {
  const n = state.ncaa;
  if (!n) return [];
  const out = new Set<string>();
  for (const round of n.rounds) for (const g of round) if (g.winner) for (const t of g.teams) if (t && t !== g.winner) out.add(t);
  return Object.keys(n.seeds).filter((t) => !out.has(t));
}

function bracketSeg(c: Ctx): RadioSegment | null {
  const { state, r, U } = c;
  const n = state.ncaa;
  if (!n) return null;
  const alive = aliveTeams(state).map((id) => state.teams[id]);
  const seed = (t: Team) => n.seeds[t.id];
  const lines: RadioLine[] = [];
  if (alive.length >= 60) {
    const ones = alive.filter((t) => seed(t) === 1);
    lines.push(S(`The bracket is OUT, Dex! I've filled out eleven of them already.`), D(`How many have the same champion?`), S(`None. That's called diversification.`));
    if (ones.length) lines.push(D(`Your No. 1 seeds: ${ones.map((t) => t.school).join(', ')}.`));
    const cinderella = alive.filter((t) => seed(t) >= 11 && seed(t) <= 13).sort((a, b) => a.net - b.net)[0];
    if (cinderella) lines.push(S(`My Cinderella: No. ${seed(cinderella)} ${cinderella.school}. Sweet 16, minimum. Don't @ me.`, 'hot'), D(`They're ${ord(cinderella.net)} in the NET. That's not crazy, actually.`, 'good'));
    const shaky = ones.sort((a, b) => b.net - a.net)[0];
    if (shaky) lines.push(S(`And ${shaky.school} goes down in the first weekend. Calling it.`, 'hot'));
  } else if (alive.length === 2) {
    const [a, b] = alive;
    const sp = spread(state, a.id, b.id, true);
    const fav = sp >= 0 ? a : b, dog = fav === a ? b : a;
    lines.push(S(`It's the NATIONAL CHAMPIONSHIP, Dex! ${a.school} and ${b.school}! One game! All the marbles!`));
    lines.push(D(`My numbers have ${fav.school} by about ${Math.max(1, Math.round(Math.abs(sp)))}.`, 'good'));
    lines.push(S(`${dog.school}. Gut call. My gut has been through a lot this season, but it's never been more sure.`, 'hot'));
  } else {
    const low = alive.filter((t) => seed(t) >= 8).sort((a, b) => seed(b) - seed(a))[0];
    lines.push(D(alive.length === 4 ? `Final Four: ${alive.map((t) => t.school).join(', ')}.` : `${plural(alive.length, 'team')} left standing.`));
    if (low) lines.push(S(`And No. ${seed(low)} ${low.school} is still dancing! Somebody find that glass slipper!`), D(`Their next game is going to be very hard.`), S(`So was the last one, Dex!`));
    const favs = alive.sort((a, b) => seed(a) - seed(b) || a.net - b.net).slice(0, 2);
    if (favs.length === 2) lines.push(D(`The favorites by my numbers: ${favs[0].school} and ${favs[1].school}.`, 'good'), S(r.pick([`Chalk is for sidewalks, Dex.`, `Boring. True, but boring.`])));
  }
  if (n.seeds[U.id] != null) {
    const out = !alive.some((t) => t.id === U.id);
    lines.push(out ? S(`And ${U.school}'s season is over. Tough way to go out. Hold your heads high.`) : D(`${U.school}, a No. ${n.seeds[U.id]} seed, is still alive.`));
    if (!out) lines.push(S(r.pick([`Cut down the nets, Coach ${c.coach.last}! I'll bring the ladder!`, `${U.school} is a team of destiny. I can feel it in my knees.`]), 'hot'));
  } else if (state.phase !== 'selection') {
    lines.push(D(`${U.school} isn't in the field this year.`), S(`Next year, Coach ${c.coach.last}. Next year.`));
  }
  head(c, alive.length >= 60 ? 6 : 5, alive.length >= 60 ? 'Bracket reactions' : `${plural(alive.length, 'team')} left`);
  return { title: 'Bracket Talk', icon: '🗂️', lines };
}

function bubbleSeg(c: Ctx): RadioSegment | null {
  const { state, U } = c;
  const nb = byNet(state);
  const bubble = nb.slice(38, 52).filter((t) => !t.apRank);
  if (!bubble.length) return null;
  const b = c.r.pick(bubble);
  const lines: RadioLine[] = [S(`It's Championship Week! ${b.school} is right on the bubble. They need to win two games or they're playing in the NIT.`, 'hot'), D(`${ord(b.net)} in the NET, ${rec(b)}. One win might do it. Might.`, 'good')];
  const un = nb.findIndex((t) => t.id === U.id) + 1;
  if (un) lines.push(D(un <= 30 ? `${U.school} is ${ord(un)} in the NET. They're dancing.` : un <= 55 ? `${U.school} is ${ord(un)} in the NET. Sweaty.` : `${U.school} is ${ord(un)} in the NET. They need the automatic bid.`), S(un <= 30 ? `Pack the bags!` : un <= 55 ? `I'm sweating for them, Dex. I'm sweating right now.` : `Win the conference tournament! It's that simple!`, un > 55 ? 'hot' : undefined));
  head(c, 3, 'Bubble watch');
  return { title: 'Bubble Watch', icon: '🫧', lines };
}

// ---------------- specials ----------------
function predictions(c: Ctx): { sal: RadioPicks; dex: RadioPicks } {
  const { state, r, U } = c;
  const top = ranked(state);
  const byPower = Object.values(state.teams).sort((a, b) => b.rating - a.rating);
  const dexTitle = byPower[0];
  const salPool = top.slice(1, 9);
  const salTitle = U.apRank && U.apRank <= 12 && r.chance(0.45) ? U : r.pick(salPool.length ? salPool : top);
  const sleepers = byPower.filter((t) => !t.apRank).slice(0, 15);
  const busts = top.slice(0, 15).map((t) => ({ t, gap: byPower.indexOf(t) + 1 - t.apRank! })).sort((a, b) => b.gap - a.gap);
  const star = (t: Team) => teamPlayers(state, t.id).sort((a, b) => b.ovr - a.ovr)[0];
  const best = top.slice(0, 10).map(star).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
  return {
    sal: { title: salTitle.id, sleeper: sleepers[r.int(4, Math.max(4, sleepers.length - 1))]?.id ?? sleepers[0]?.id, bust: top[r.int(0, 2)]?.id, poy: star(salTitle)?.id },
    dex: { title: dexTitle.id, sleeper: sleepers[0]?.id, bust: busts[0]?.t.id, poy: best[0]?.id },
  };
}

function previewEpisode(c: Ctx, debut: boolean): RadioSegment[] {
  const { state, r, R, U, coach } = c;
  const segs: RadioSegment[] = [introSeg(c, [S(`Season preview show! The polls are out, the takes are loaded, and I haven't slept.`), D(`Welcome to the ${seasonLabel(state.season)} preview edition of ${SHOW.name}. I'm Dex Holloway.`)], debut)];
  if (debut) segs[0].lines.push(D(`And since it's preseason, we're doing predictions. On the record. I'll grade them in April.`), S(`He's going to grade them, people. Like a teacher.`));
  const P = predictions(c);
  R.preds = { season: state.season, ...P };
  const T = (id?: string) => (id ? state.teams[id] : undefined);
  const Pn = (id?: string) => (id ? state.players[id] : undefined);
  const lines: RadioLine[] = [];
  const st = T(P.sal.title)!, dt = T(P.dex.title)!;
  lines.push(D(`Title picks. I'll go first: ${dt.school}. Best roster in the country by my numbers.`, 'good'));
  lines.push(st.id === dt.id ? S(`Same! Don't make it weird.`) : st.id === U.id ? S(`${U.school}! Coach ${coach.last} cuts down the nets! I've never been more sure of anything.`, 'hot') : S(`${st.school}. They're No. ${st.apRank ?? '—'} in the poll and nobody believes in them. I believe.`, 'hot'));
  const ss = T(P.sal.sleeper), ds = T(P.dex.sleeper);
  if (ss && ds) {
    lines.push(D(`Sleeper: ${ds.school}. Unranked, but the roster is legit.`, 'good'));
    lines.push(S(ss.id === ds.id ? `Copycat! Fine. Same.` : `My sleeper is ${ss.school}. Mark my words. Sweet 16.`, ss.id === ds.id ? undefined : 'hot'));
  }
  const sb = T(P.sal.bust), db = T(P.dex.bust);
  if (sb && db) {
    lines.push(S(sb.apRank === 1 ? `Bust of the year: ${sb.school}. The No. 1 team in the preseason poll goes out in the first weekend.` : `Bust of the year: ${sb.school}. Ranked ${sb.apRank}, playing like ranked never.`, 'hot'));
    lines.push(D(db.id === sb.id ? `I can't believe I agree with you.` : `I'll take ${db.school}. Ranked ${db.apRank}, and the numbers say that's generous.`, db.id === sb.id ? undefined : 'good'));
  }
  const sp = Pn(P.sal.poy), dp = Pn(P.dex.poy);
  if (sp && dp) {
    lines.push(D(`Player of the Year: ${nm(dp)}, ${T(dp.teamId!)?.school}.`));
    lines.push(S(sp.id === dp.id ? `Fine. Yes. Him.` : `${nm(sp)}. ${T(sp.teamId!)?.school}. He's going to have a SEASON.`, sp.id === dp.id ? undefined : 'hot'));
  }
  segs.push({ title: 'Bold Predictions', icon: '🔮', lines });
  head(c, 7, `${seasonLabel(state.season)} season preview`);
  // the user's team
  const ul: RadioLine[] = [];
  const star = teamPlayers(state, U.id).sort((a, b) => b.ovr - a.ovr)[0];
  ul.push(D(`${U.school} ${U.apRank ? `opens at No. ${U.apRank}` : 'is unranked to start the year'}. The AD's goal for Coach ${coach.last}: ${state.user.expectation.toLowerCase()}.`));
  ul.push(U.apRank && U.apRank <= 10 ? S(`Title or bust. Anything less and I'm calling in myself.`, 'hot') : U.apRank ? S(`Ranked to start. I like it. I'll love it by Thanksgiving.`) : S(`Unranked? Disrespect! Remember this, ${U.mascot}. Remember who doubted you.`));
  if (star) ul.push(D(`Watch ${nm(star)}, the ${describe(star)}. Best player on the roster.`), S(r.pick([`I've heard he dunks so hard the rim files a complaint.`, `${star.last}! Great name. Strong name. Sounds like a closer.`, `I've seen his highlight tape eleven times. Twelve. It's on in my car right now.`])));
  // expected wins: win probability for every game on the schedule
  const mine = state.schedule.filter((g) => g.home === U.id || g.away === U.id);
  if (mine.length >= 20) {
    const exp = mine.reduce((sum, g) => sum + normCdf((spread(state, g.home, g.away, g.neutral) * (g.home === U.id ? 1 : -1)) / 11), 0);
    const line = Math.round(exp * 2) / 2;
    ul.push(D(`My model projects ${f1(exp)} regular-season wins. Call it ${line}.`, 'good'), S(r.pick([`Over. Smash the over.`, `Over. I always take the over. It's a lifestyle.`, line >= 22 ? `Under. Gasp! Yes, under. Somebody's gonna slip on a banana peel.` : `Over by five. Book it.`]), 'hot'));
  }
  segs.push({ title: `${U.school} Preview`, icon: '🏠', lines: ul });
  const poll = ranked(state).slice(0, 5);
  if (poll.length === 5) segs.push({ title: 'Preseason Top 5', icon: '📊', lines: [D(`Your preseason top five: ${poll.map((t, i) => `${i + 1}. ${t.school}`).join(', ')}.`, 'info'), S(r.pick([`I'd move ${poll[3].school} to No. 1 and I'd sleep like a baby.`, `${poll[0].school} at No. 1? In October? Bold, voters. Bold.`]), 'hot')] });
  segs.push(outroSeg(c, [S(`Predictions are locked in. No take-backs.`), D(`I wrote them down. In pen.`)]));
  return segs;
}

function finaleEpisode(c: Ctx): RadioSegment[] {
  const { state, r, R, U, coach } = c;
  const segs: RadioSegment[] = [introSeg(c, [S(`The confetti's swept up, the nets are cut, and Big Sal is emotional.`), D(`Welcome to the season finale of ${SHOW.name}.`)])];
  const ch = state.champions.find((x) => x.season === state.season);
  if (ch) {
    const t = state.teams[ch.teamId], ru = state.teams[ch.runnerUp];
    const L: RadioLine[] = [S(`ONE SHINING MOMENT, Dex! ${t.school}! National champions!`), D(`${t.school} beat ${ru?.school ?? 'their opponent'} ${ch.score} in the title game. ${rec(t)} on the year.`, 'info')];
    L.push(t.id === U.id ? S(`${U.school}! Coach ${coach.last}! I'm crying on the air and I don't care who knows it!`) : S(r.pick([`Congratulations to them. I hate it. Congratulations.`, `They earned it. I'll say it once and never again.`])));
    segs.push({ title: 'One Shining Moment', icon: '🏆', lines: L });
    head(c, 8, `${t.school} are national champions`);
  }
  const poy = state.awards.find((a) => a.season === state.season && a.name === 'National Player of the Year');
  // grade the preseason predictions
  const P = R.preds?.season === state.season ? R.preds : undefined;
  if (P) {
    const L: RadioLine[] = [D(`Time to grade the preseason predictions. I've been waiting all year.`), S(`I've been dreading it all year.`)];
    const finish = (id: string) => state.teams[id]?.history.find((h) => h.season === state.season);
    const how = (id: string) => { const h = finish(id); return !h ? 'did something' : h.postseason === 'Champion' ? 'won the whole thing' : h.postseason ? `went out in the ${h.postseason === 'Runner-up' ? 'title game' : h.postseason}` : `went ${h.w}-${h.l} and missed the tournament`; };
    for (const who of ['sal', 'dex'] as const) {
      const p = P[who];
      const hit = ch && p.title === ch.teamId;
      const line = `${who === 'sal' ? 'Sal' : 'Dex'} picked ${state.teams[p.title]?.school} to win it all. They ${how(p.title)}.`;
      L.push(who === 'sal' ? D(line) : S(line));
      L.push(who === 'sal' ? (hit ? S(`NAILED IT! Get me a trophy! Get me two trophies!`) : S(r.pick([`I was a year early. Mark it down for next year.`, `Directionally correct.`]))) : (hit ? D(`The model was right. The model is always right.`) : D(`The model has been notified.`)));
    }
    if (poy?.playerId) {
      const winner = poy.who ?? (state.players[poy.playerId] ? nm(state.players[poy.playerId]) : 'the winner');
      const sHit = P.sal.poy === poy.playerId, dHit = P.dex.poy === poy.playerId;
      L.push(D(`Player of the Year went to ${winner}. ${sHit && dHit ? 'We both had him.' : sHit ? 'Sal had him. I did not.' : dHit ? 'I had him. Sal did not.' : 'Neither of us had him.'}`));
      L.push(sHit ? S(`Write that in your spreadsheet, Professor! In BOLD!`) : S(`Awards are a popularity contest anyway.`));
    }
    segs.push({ title: 'Grading Our Predictions', icon: '📝', lines: L });
  }
  // the user's season
  const h = U.history.find((x) => x.season === state.season);
  if (h) {
    const grade = h.postseason === 'Champion' ? 'A+' : DEEP.includes(h.postseason) ? 'A' : ['Elite Eight', 'Sweet 16'].includes(h.postseason) ? 'B+' : h.ncaaSeed != null ? 'B' : h.w > h.l ? 'C' : h.w * 2 > h.l ? 'D' : 'F';
    const L: RadioLine[] = [D(`${U.school}'s season: ${h.w}-${h.l}${h.postseason ? `, ${h.postseason === 'Champion' ? 'national champions' : h.postseason === 'Runner-up' ? 'national runner-up' : h.postseason}` : ''}.`)];
    L.push(S(`My grade for Coach ${coach.last}: ${grade}.`, grade.startsWith('A') ? 'good' : grade === 'F' ? 'hot' : undefined));
    L.push(grade.startsWith('A') ? D(`Hard to argue. Historic stuff.`) : grade === 'F' ? D(`Harsh. Accurate, but harsh.`) : D(r.pick([`I'd say that's fair.`, `I'd go a half-grade higher. The numbers were better than the record.`])));
    segs.push({ title: `${U.school} Report Card`, icon: '📋', lines: L });
  }
  const [sw, sl] = R.record.sal, [dw, dl] = R.record.dex;
  const out: RadioLine[] = [];
  if (sw + sl + dw + dl > 0) {
    out.push(D(`Final lock standings: Dex ${dw}-${dl}, Sal ${sw}-${sl}.`));
    out.push(dw > sw ? S(`As per our bet, I'll be wearing a mascot costume on the portal show. Don't ask which mascot.`) : sw > dw ? S(`Dex has to read my takes in a British accent next week! Those are the rules!`) : S(`A tie! Nobody wins! America loses!`));
  }
  out.push(D(`Next up: the portal, the draft and signing day. We'll be here.`));
  segs.push(outroSeg(c, out));
  return segs;
}

function portalEpisode(c: Ctx): RadioSegment[] {
  const { state, r, U, coach } = c;
  const segs: RadioSegment[] = [introSeg(c, [S(`The portal is OPEN, Dex! It's the Wild West out there!`), D(`Welcome to the portal edition of ${SHOW.name}.`)])];
  const entries = Object.values(state.portal?.entries ?? {});
  const L: RadioLine[] = [];
  if (entries.length) {
    L.push(D(`${plural(entries.length, 'player')} in the portal already.`, 'info'), S(`That's not a portal, that's a stampede.`));
    const best = entries.filter((e) => state.players[e.id]).sort((a, b) => a.rank - b.rank).slice(0, 2);
    const reacts = r.shuffle([`I'd give that kid my car. It's not a nice car, but it's a gesture.`, `Every coach in America just picked up the phone.`, `Somebody's collective is about to get very generous.`, `Come to my house, son. We have snacks.`]);
    best.forEach((e, i) => {
      const p = state.players[e.id], from = state.teams[e.from];
      L.push(D(i === 0 ? `The top name: ${nm(p)} out of ${from?.school ?? 'nowhere'}. Reason given: ${e.reason.toLowerCase()}.` : `Also out there: ${nm(p)}, ${describe(p)}, from ${from?.school ?? 'somewhere'}.`));
      L.push(S(reacts[i]));
    });
    const mine = entries.filter((e) => e.from === U.id);
    L.push(mine.length ? D(`${U.school} has ${plural(mine.length, 'player')} in the portal.`) : D(`Nobody from ${U.school} has entered. Yet.`));
    L.push(mine.length >= 3 ? S(`Coach ${coach.last} has to plug the holes. Get the shop vac!`, 'hot') : S(`Good culture, Dex. You can't measure culture.`), D(`I could if they'd let me.`));
    head(c, 5, 'The portal is open');
  } else {
    L.push(S(`Retention meetings are happening right now. Every coach in America is hugging somebody.`), D(`And making promises.`));
  }
  segs.push({ title: 'Portal Madness', icon: '🔁', lines: L });
  const dec = state.offseason?.declared ?? [];
  if (dec.length) {
    const top = dec.map((id) => state.players[id]).filter((p) => p && p.draftStock && p.draftStock <= 14).slice(0, 2);
    if (top.length) segs.push({ title: 'Leaving Early', icon: '🎓', lines: [D(`Early entries headed for the draft include ${top.map((p) => `${nm(p)} of ${schoolOf(state, p)?.school ?? 'his school'}`).join(' and ')}.`, 'info'), S(`Go get your money, young men. Buy your mother a house. Buy me a sandwich.`)] });
  }
  segs.push(hotlineSeg(c));
  segs.push(outroSeg(c));
  return segs;
}

function signingEpisode(c: Ctx): RadioSegment[] {
  const { state, r, U, coach } = c;
  const segs: RadioSegment[] = [introSeg(c, [S(`Signing Day! The fax machines are humming!`), D(`Nobody uses fax machines, Sal.`), S(`In my heart they do.`)])];
  const cr = classRankings(state);
  const L: RadioLine[] = [];
  if (cr.length >= 3) {
    L.push(D(`Final class rankings: 1. ${state.teams[cr[0].teamId].school}, 2. ${state.teams[cr[1].teamId].school}, 3. ${state.teams[cr[2].teamId].school}.`, 'info'));
    L.push(S(r.pick([`${state.teams[cr[0].teamId].school} is going to be a problem for the next four years. Or one. These days, one.`, `Rankings schmankings. Show me who can guard a ball screen.`])));
    const mi = cr.findIndex((x) => x.teamId === U.id);
    L.push(mi >= 0 ? D(`${U.school} finished with the No. ${mi + 1} class.`) : D(`${U.school} didn't sign anyone in this class.`));
    L.push(mi >= 0 && mi < 10 ? S(`Top ten! Coach ${coach.last} can RECRUIT, people!`) : mi >= 0 && mi < 30 ? S(`Solid. Not flashy. Like a good pair of sneakers.`) : S(`There's always the portal, Coach ${coach.last}. There's ALWAYS the portal.`, 'hot'));
    const top = Object.values(state.recruits).filter((x) => x.committed).sort((a, b) => a.rank - b.rank)[0];
    if (top) L.push(D(`The No. 1 recruit in the country, ${top.first} ${top.last}, signed with ${state.teams[top.committed!]?.school}.`), S(`Generational. I've never seen him play, but generational.`, 'bad'));
    head(c, 5, 'Signing Day special');
  }
  if (!L.length) L.push(S(`Quiet signing day. I refreshed my phone four hundred times.`), D(`Four hundred and twelve.`));
  head(c, 4, 'Signing Day special');
  segs.push({ title: 'Signing Day', icon: '✍️', lines: L });
  segs.push(outroSeg(c));
  return segs;
}

function draftEpisode(c: Ctx): RadioSegment[] {
  const { state, r, U } = c;
  const segs: RadioSegment[] = [introSeg(c, [S(`Draft night, baby! Handshakes, hugs and very large suits!`), D(`Welcome to the draft edition of ${SHOW.name}.`)])];
  const picks = state.draft.filter((d) => d.season === state.season || d.season === state.season + 1).sort((a, b) => a.pick - b.pick);
  const L: RadioLine[] = [];
  if (picks.length) {
    const one = picks[0];
    L.push(D(`With the first pick, ${one.name} out of ${state.teams[one.teamId]?.school ?? 'college'}, to ${one.nbaTeam}.`, 'info'));
    L.push(S(r.pick([`Can't-miss prospect. I said that about my last three cars, but this time I mean it.`, `Great pick. Great kid. Great suit.`])));
    const mine = picks.filter((p) => p.teamId === U.id);
    L.push(mine.length ? D(`${U.school} had ${plural(mine.length, 'player')} drafted: ${mine.map((p) => `${p.name} at No. ${p.pick}`).join(', ')}.`) : D(`Nobody from ${U.school} heard their name this year.`));
    L.push(mine.length ? S(`That's a pipeline! Recruits, are you listening?`) : S(`Next year. Develop 'em, Coach.`));
    const byTeam: Record<string, number> = {};
    for (const p of picks.filter((x) => x.round === 1)) byTeam[p.teamId] = (byTeam[p.teamId] ?? 0) + 1;
    const fact = Object.entries(byTeam).sort((a, b) => b[1] - a[1])[0];
    if (fact && fact[1] >= 2) L.push(D(`${state.teams[fact[0]]?.school} had ${fact[1]} first-rounders.`, 'info'), S(`Show-offs.`));
    head(c, 5, 'Draft night');
  }
  segs.push({ title: 'Draft Night', icon: '🎩', lines: L.length ? L : [S(`Draft's done. I cried twice. Once for joy.`)] });
  segs.push(outroSeg(c, [D(`That's it for the season, folks. We're off for the summer.`), S(`I'll be at the beach. Working on my takes. And my tan.`)]));
  return segs;
}

const DEEP = ['Final Four', 'Runner-up', 'Champion'];

function weeklyEpisode(c: Ctx, debut: boolean): RadioSegment[] {
  const { state, r } = c;
  const segs: RadioSegment[] = [introSeg(c, undefined, debut)];
  const add = (s: RadioSegment | null) => { if (s && s.lines.length) segs.push(s); };
  if (state.phase === 'selection' || state.phase === 'ncaa') {
    add(bracketSeg(c));
    add(recapSeg(c));
    add(yoursSeg(c));
    add(spotlightSeg(c));
    add(hotlineSeg(c));
    add(locksSeg(c));
  } else {
    add(pollSeg(c));
    add(state.phase === 'confTourney' ? bubbleSeg(c) : recapSeg(c));
    add(yoursSeg(c));
    const rotating = r.shuffle([() => spotlightSeg(c), () => hotlineSeg(c), () => triviaSeg(c), () => recruitingSeg(c), () => recapSeg(c)].slice(0, state.phase === 'confTourney' ? 5 : 4));
    let n = 0;
    for (const f of rotating) { if (n >= 2) break; const s = f(); if (s && s.lines.length && !segs.some((x) => x.title === s.title)) { segs.push(s); n++; } }
    if (!segs.some((s) => s.title === 'Hot Take Hotline') && r.chance(0.6)) add(hotlineSeg(c));
    add(locksSeg(c));
  }
  segs.push(outroSeg(c));
  return segs;
}

const TITLE_FALLBACK = ['Takes, Takes and More Takes', 'Sal Has Concerns', 'The Professor Is In', 'Phone Lines Are Open', 'Nobody Asked, We Answered', 'Big Sal vs. The Spreadsheet', 'Overreaction Monday', 'Hold My Spreadsheet'];

/** Produce and air an episode */
export function airEpisode(state: GameState, kind: RadioEpisodeKind, opts: { debut?: boolean } = {}): RadioEpisode {
  const R = radioState(state);
  if (R.recordSeason !== state.season) { R.recordSeason = state.season; R.record = { sal: [0, 0], dex: [0, 0] }; }
  const no = R.aired + 1;
  const r = new RNG(`radio:${state.user.teamId}:${state.season}:${state.day}:${no}:${kind}`);
  const c: Ctx = { state, r, R, U: state.teams[state.user.teamId], coach: state.coaches[state.user.coachId], heads: [], ep: no };
  const segments = kind === 'preview' ? previewEpisode(c, !!opts.debut)
    : kind === 'finale' ? finaleEpisode(c)
    : kind === 'portal' ? portalEpisode(c)
    : kind === 'signing' ? signingEpisode(c)
    : kind === 'draft' ? draftEpisode(c)
    : weeklyEpisode(c, !!opts.debut);
  if (opts.debut && kind !== 'preview' && kind !== 'weekly') segments[0].lines.unshift(S(`Hello, hello! This is the first-ever episode of ${SHOW.name} on ${SHOW.station}. I'm Big Sal!`), D(`And I'm Dex Holloway. They gave us a radio show, Sal.`));
  const best = c.heads.sort((a, b) => b.p - a.p)[0];
  const title = opts.debut ? 'The First Episode' : best?.t ?? r.pick(TITLE_FALLBACK);
  const cal = state.calendar[state.day];
  const ep: RadioEpisode = {
    id: `fcf${state.season}-${no}`, no, kind, season: state.season, day: state.day,
    date: IN_SEASON.includes(state.phase) ? (cal?.label ?? '') : seasonLabel(state.season), phase: state.phase, title, segments,
  };
  R.episodes.unshift(ep);
  if (R.episodes.length > KEEP) R.episodes.length = KEEP;
  R.aired = no;
  R.lastDay = IN_SEASON.includes(state.phase) ? state.day : 0;
  return ep;
}

/** Weekly airing during the season (called from the weekly tick) */
export function radioWeekly(state: GameState) {
  if (!IN_SEASON.includes(state.phase) || state.day <= 0) return;
  airEpisode(state, 'weekly');
}

/** Offseason specials, called after each offseason step */
export function radioOffseason(state: GameState, before: GameState['phase']) {
  const now = state.phase;
  const last = state.radio?.episodes[0];
  const already = (k: RadioEpisodeKind) => last?.kind === k && last.season === state.season;
  if (now === 'portal' && (state.portal?.day ?? 0) >= 1 && !already('portal')) airEpisode(state, 'portal');
  else if (now === 'draft' && before !== 'draft' && !already('draft')) airEpisode(state, 'draft');
  else if (now === 'preseason' && before !== 'preseason') airEpisode(state, 'preview');
}

/** Saves from before the show existed get a debut episode on load */
export function ensureRadio(state: GameState) {
  if (state.radio) return;
  radioState(state);
  const p = state.phase;
  const kind: RadioEpisodeKind = p === 'preseason' || (IN_SEASON.includes(p) && state.day <= 0) ? 'preview'
    : IN_SEASON.includes(p) ? 'weekly'
    : p === 'seasonEnd' || p === 'declarations' ? 'finale'
    : p === 'portal' ? 'portal'
    : p === 'signing' ? 'signing'
    : 'draft';
  airEpisode(state, kind, { debut: true });
}
