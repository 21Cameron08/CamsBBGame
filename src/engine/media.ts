// News + social media generation. All personalities and outlets are fictional.
import { rng } from './rng';
import type { BoxPlayer, BoxScore, GameState, NewsItem, Player, Recruit, ScheduledGame, SocialPost, Team } from './types';
import { MEDIA_OUTLETS } from '../data/names';

export const INSIDERS = [
  { name: 'Marcus Bell', handle: 'MarcusBellHoops', outlet: 'Hoops Insider' },
  { name: 'Dana Whitfield', handle: 'DanaW_CBB', outlet: 'The Bracket Report' },
  { name: 'Trey Calloway', handle: 'TreyCallowayCBB', outlet: 'CBB Wire' },
  { name: 'Nina Park', handle: 'NinaParkReports', outlet: 'Courtside Daily' },
  { name: 'Rob Delgado', handle: 'RobDelgadoHoops', outlet: 'Full Court Press' },
  { name: 'Kendra Ellis', handle: 'KendraEllisCBB', outlet: 'Hardwood Weekly' },
];
export const ANALYSTS = [
  { name: 'Coach Vic Moreno', handle: 'CoachVicBaby', style: 'hype' },
  { name: 'Bracket Brad', handle: 'BracketBrad', style: 'bracket' },
  { name: 'Lou Bertoli', handle: 'LouBTakes', style: 'contrarian' },
  { name: 'The Paint Podcast', handle: 'ThePaintPod', style: 'pod' },
];
export const RECRUITING_ANALYSTS = [
  { name: 'Sam Okafor', handle: 'SamOkaforRecruits', outlet: 'Prep Hoops Central' },
  { name: 'Jess Navarro', handle: 'JessNavarroRecruiting', outlet: 'The Recruiting Desk' },
];

let seq = 0;
const nid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export function addNews(state: GameState, n: Omit<NewsItem, 'id' | 'season' | 'day' | 'date'>) {
  const cal = state.calendar[state.day];
  state.news.unshift({ id: nid('n'), season: state.season, day: state.day, date: cal?.label ?? '', ...n });
  if (state.news.length > 500) state.news.length = 500;
}

export function addSocial(state: GameState, p: Omit<SocialPost, 'id' | 'season' | 'day' | 'likes' | 'reposts'> & { likes?: number; reposts?: number }) {
  const base = p.verified ? rng.int(800, 25000) : rng.int(5, 2500);
  state.social.unshift({ id: nid('s'), season: state.season, day: state.day, likes: p.likes ?? base, reposts: p.reposts ?? Math.round(base * rng.range(0.05, 0.3)), ...p });
  if (state.social.length > 400) state.social.length = 400;
}

const fanHandle = (t: Team) => rng.pick([`${t.abbr}Nation`, `${t.mascot.replace(/\s+/g, '')}Talk`, `${t.school.replace(/[^A-Za-z]/g, '')}Hoops`, `Real${t.abbr}Fan`, `${t.abbr}_Barstool`, `${t.mascot.replace(/\s+/g, '')}4Life`]);
const fanName = (t: Team) => rng.pick([`${t.school} Nation`, `${t.mascot} Talk`, `${t.school} Hoops Fan`, `Die-hard ${t.abbr}`, `${t.school} Student Section`, `${t.mascot} Insider (fan)`]);

function bestPerformer(players: BoxPlayer[]): BoxPlayer {
  const gs = (p: BoxPlayer) => p.pts + 0.4 * p.fgm - 0.7 * p.fga - 0.4 * (p.fta - p.ftm) + 0.7 * p.orb + 0.3 * p.drb + 0.7 * p.ast + p.stl + 0.7 * p.blk - p.tov;
  return [...players].sort((a, b) => gs(b) - gs(a))[0];
}
export function statLine(p: BoxPlayer): string {
  const parts = [`${p.pts} pts`];
  if (p.drb + p.orb >= 6) parts.push(`${p.drb + p.orb} reb`);
  if (p.ast >= 4) parts.push(`${p.ast} ast`);
  if (p.stl >= 3) parts.push(`${p.stl} stl`);
  if (p.blk >= 3) parts.push(`${p.blk} blk`);
  if (p.tpm >= 4) parts.push(`${p.tpm} threes`);
  return parts.join(', ');
}

function rankTag(t: Team) { return t.apRank ? `No. ${t.apRank} ` : ''; }

export function gameRecapNews(state: GameState, g: ScheduledGame, box: BoxScore) {
  const home = state.teams[g.home], away = state.teams[g.away];
  const homeWon = box.hs > box.as;
  const W = homeWon ? home : away, L = homeWon ? away : home;
  const ws = Math.max(box.hs, box.as), ls = Math.min(box.hs, box.as);
  const wBox = homeWon ? box.players[0] : box.players[1];
  const lBox = homeWon ? box.players[1] : box.players[0];
  const star = bestPerformer(wBox);
  const lstar = bestPerformer(lBox);
  const margin = ws - ls;
  const ot = box.ot ? (box.ot === 1 ? ' in overtime' : ` in ${box.ot}OT`) : '';
  const verb = margin >= 25 ? rng.pick(['demolishes', 'routs', 'obliterates', 'cruises past']) : margin >= 12 ? rng.pick(['handles', 'pulls away from', 'rolls past', 'downs']) : margin <= 3 ? rng.pick(['edges', 'survives', 'outlasts', 'holds off']) : rng.pick(['beats', 'tops', 'takes down', 'defeats']);
  const headline = `${rankTag(W)}${W.school} ${verb} ${rankTag(L)}${L.school} ${ws}-${ls}${ot}`;
  const starName = star?.name ?? 'The starters';
  const body = [
    `${starName} led the way with ${star ? statLine(star) : 'a big night'} as ${W.school} (${W.record.w}-${W.record.l}) ${verb} ${L.school} (${L.record.w}-${L.record.l})${g.event ? ` in the ${g.event}` : ''}${ot}.`,
    box.largestLead[homeWon ? 1 : 0] >= 10 ? `${L.school} led by as many as ${box.largestLead[homeWon ? 1 : 0]} before the ${W.mascot} rallied.` : `${W.school} led by as many as ${box.largestLead[homeWon ? 0 : 1]}.`,
    lstar ? `${lstar.name} paced ${L.school} with ${statLine(lstar)}.` : '',
    `The game was played at ${g.neutral ? 'a neutral site' : home.arena} in front of ${g.neutral ? 'a packed house' : `${Math.round(home.capacity * (0.75 + home.hype / 400)).toLocaleString()} fans`}.`,
  ].filter(Boolean).join(' ');
  addNews(state, { kind: 'recap', headline, body, teams: [g.home, g.away], important: g.home === state.user.teamId || g.away === state.user.teamId, personId: star?.id, personKind: 'player' });
}

export function upsetNews(state: GameState, g: ScheduledGame) {
  const home = state.teams[g.home], away = state.teams[g.away];
  const homeWon = (g.hs ?? 0) > (g.as ?? 0);
  const W = homeWon ? home : away, L = homeWon ? away : home;
  if (!L.apRank || (W.apRank && W.apRank < L.apRank)) return;
  const big = L.apRank <= 10 && !W.apRank;
  const headline = big
    ? rng.pick([`STUNNER: ${W.school} knocks off No. ${L.apRank} ${L.school}`, `Upset alert answered: ${W.school} topples No. ${L.apRank} ${L.school}`, `${W.school} storms the court after beating No. ${L.apRank} ${L.school}`])
    : `${W.school} takes down No. ${L.apRank} ${L.school}, ${Math.max(g.hs!, g.as!)}-${Math.min(g.hs!, g.as!)}`;
  addNews(state, { kind: 'upset', headline, body: `${L.school} falls to ${L.record.w}-${L.record.l} after a ${Math.max(g.hs!, g.as!)}-${Math.min(g.hs!, g.as!)} loss to ${W.school}${g.neutral ? ' on a neutral floor' : homeWon ? ' on the road' : ' at home'}. Expect a tumble in next week’s poll.`, teams: [W.id, L.id], important: big });
  if (big && rng.chance(0.7)) {
    const a = rng.pick(ANALYSTS);
    addSocial(state, { handle: a.handle, name: a.name, verified: true, kind: 'analyst', text: rng.pick([`${W.school.toUpperCase()}!!! That's why we play the games, baby! 🔥🏀`, `Nobody's safe this year. ${W.school} over No. ${L.apRank} ${L.school}. Wow.`, `${L.school} fans, it's going to be a long bus ride home.`]), teamId: W.id });
  }
}

export function userGameSocial(state: GameState, g: ScheduledGame, box: BoxScore) {
  const user = state.teams[state.user.teamId];
  const isHome = g.home === user.id;
  const us = isHome ? box.hs : box.as, them = isHome ? box.as : box.hs;
  const opp = state.teams[isHome ? g.away : g.home];
  const won = us > them;
  const myBox = isHome ? box.players[0] : box.players[1];
  const star = bestPerformer(myBox);
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const text = won
      ? rng.pick([
        `LET'S GOOOO ${user.mascot.toUpperCase()} 🔥🔥 ${us}-${them}`,
        `${star?.name.split(' ')[1] ?? 'Our guys'} is HIM. That's it. That's the tweet.`,
        `Coach ${state.coaches[state.user.coachId].last} has this thing rolling. ${user.record.w}-${user.record.l}!`,
        `Beat ${opp.school}. Love to see it. Book the tickets for March 🎟️`,
        `That second half defense was disgusting (complimentary) 😤`,
        `Who's got next? ${user.school} is coming.`,
      ])
      : rng.pick([
        `Ugh. Can't keep turning it over like that.`,
        `That was ugly. ${them}-${us} to ${opp.school}?? Fix it.`,
        `Somebody explain that rotation to me. I'll wait.`,
        `We'll bounce back. Still believe in this group. ${user.record.w}-${user.record.l}.`,
        `Free throws win games. We didn't make ours. 😩`,
        `Hot seat talk starting already lol relax people`,
      ]);
    addSocial(state, { handle: fanHandle(user), name: fanName(user), verified: false, kind: 'fan', text, teamId: user.id });
  }
  if (!won && rng.chance(0.5)) {
    addSocial(state, { handle: fanHandle(opp), name: fanName(opp), verified: false, kind: 'hater', text: rng.pick([`${user.school} fans real quiet tonight 🤫`, `Overrated. Told y'all.`, `Thanks for the W, ${user.school} 😂`]), teamId: opp.id });
  }
  if (star && star.pts >= 25) {
    const ins = rng.pick(INSIDERS);
    addSocial(state, { handle: ins.handle, name: ins.name, verified: true, kind: 'insider', text: `${star.name} (${user.school}) tonight: ${statLine(star)}. NBA scouts in the building took notice.`, teamId: user.id, personId: star.id });
  }
}

export function commitNews(state: GameState, r: Recruit, teamId: string) {
  const t = state.teams[teamId];
  const isUser = teamId === state.user.teamId;
  const top = r.rank <= 150 || isUser;
  if (!top) return;
  const stars = '★'.repeat(r.stars);
  const others = r.schools.filter((s) => s.teamId !== teamId).slice(0, 3).map((s) => state.teams[s.teamId]?.school).filter(Boolean);
  addNews(state, {
    kind: 'recruit',
    headline: `${stars} ${r.pos} ${r.first} ${r.last} commits to ${t.school}`,
    body: `${r.first} ${r.last}, the No. ${r.rank} overall prospect in the class of ${r.classYear} (${r.hometown}${r.type === 'INTL' ? '' : `, ${r.state}`}), committed to ${t.school}${others.length ? ` over ${others.join(', ')}` : ''}. ${r.storyline ? r.storyline + '. ' : ''}The ${fmtHt(r.height)} ${r.archetype.toLowerCase()} gives ${t.mascot} fans plenty to be excited about.`,
    teams: [teamId],
    important: isUser || r.rank <= 25,
    personId: r.id,
    personKind: 'recruit',
  });
  const an = rng.pick(RECRUITING_ANALYSTS);
  if (r.rank <= 60 || isUser) {
    addSocial(state, { handle: an.handle, name: an.name, verified: true, kind: 'insider', text: `BREAKING: ${stars} ${r.first} ${r.last} (No. ${r.rank} nationally) has committed to ${t.school}. ${rng.pick(['Huge get.', 'Major win on the trail.', 'Did not see this one coming.', 'Expected — the relationship there was strong.'])}`, teamId, personId: r.id });
    addSocial(state, { handle: `${r.first}${r.last}${rng.int(1, 99)}`.replace(/[^A-Za-z0-9]/g, ''), name: `${r.first} ${r.last}`, verified: r.followers > 50000, kind: 'recruit', text: rng.pick([`100% COMMITTED 🙏 #${t.abbr}`, `Home. 💯 Thank you to every coach who recruited me. Let's work ${t.mascot}!`, `God's plan. ${t.school} let's get to work 🏀`, `Committed. No more questions 😤`]), teamId, personId: r.id, likes: Math.round(r.followers * rng.range(0.02, 0.15)) });
  }
}

function fmtHt(inches: number) { return `${Math.floor(inches / 12)}-${inches % 12}`; }

export function pollNews(state: GameState, label: string, ranks: string[]) {
  const no1 = state.teams[ranks[0]];
  const user = state.teams[state.user.teamId];
  addNews(state, {
    kind: 'rank',
    headline: `${label}: ${no1.school} ${no1.prevApRank === 1 ? 'holds at' : 'claims'} No. 1`,
    body: `Top five: ${ranks.slice(0, 5).map((id, i) => `${i + 1}. ${state.teams[id].school}`).join(', ')}.${user.apRank ? ` ${user.school} checks in at No. ${user.apRank}.` : ''}`,
    teams: ranks.slice(0, 5),
    important: !!user.apRank && user.apRank !== user.prevApRank,
  });
}

export function randomBuzz(state: GameState) {
  const teams = Object.values(state.teams).filter((t) => t.apRank).sort((a, b) => a.apRank! - b.apRank!);
  if (!teams.length) return;
  const t = rng.pick(teams.slice(0, 15));
  const a = rng.pick(ANALYSTS);
  const lines = a.style === 'hype'
    ? [`${t.school} is a PTPer's dream, baby! Diaper dandy on that roster! 🔥`, `Don't sleep on ${t.school}. Final Four material, AWESOME baby!`]
    : a.style === 'bracket'
      ? [`Bracketology update: ${t.school} firmly on the ${Math.max(1, Math.ceil((t.apRank ?? 8) / 4))}-line this week.`, `Bubble watch: lots of movement this week. ${t.school} is safe. Others... not so much.`]
      : a.style === 'contrarian'
        ? [`Hot take: ${t.school} is a paper tiger. First-weekend exit incoming.`, `Everyone loves ${t.school}. I'm not buying it.`]
        : [`New episode: we break down ${t.school}'s rotation and why their defense travels. 🎙️`];
  addSocial(state, { handle: a.handle, name: a.name, verified: true, kind: 'analyst', text: rng.pick(lines), teamId: t.id });
}

export function injuryNews(state: GameState, p: Player, teamId: string) {
  const t = state.teams[teamId];
  if (!p.injury) return;
  const serious = p.injury.games >= 6;
  if (!serious && teamId !== state.user.teamId) return;
  addNews(state, {
    kind: 'injury',
    headline: `${t.school}'s ${p.first} ${p.last} out ${p.injury.games >= 25 ? 'for the season' : `${p.injury.games} game${p.injury.games > 1 ? 's' : ''}`} (${p.injury.type.toLowerCase()})`,
    body: `${t.school} will be without ${p.pos} ${p.first} ${p.last} (${p.stats.gp ? (p.stats.pts / p.stats.gp).toFixed(1) : '0.0'} ppg) after he suffered a ${p.injury.type.toLowerCase()}.`,
    teams: [teamId],
    important: teamId === state.user.teamId,
    personId: p.id,
    personKind: 'player',
  });
}

export function pickOutlet() { return rng.pick(MEDIA_OUTLETS); }
