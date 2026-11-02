import { rng, clamp } from './rng';
import type { Coach, CoachArchetype, CoachSkills, Effect, GameState, Team } from './types';
import { FIRST_NAMES, LAST_NAMES } from '../data/names';
import { teamPlayers } from './team';

export const ARCHETYPE_INFO: Record<CoachArchetype, { desc: string; skills: Partial<CoachSkills>; icon: string }> = {
  Recruiter: { desc: 'Lives on the road. More recruiting hours and stronger pitches.', skills: { recruiting: 4, nil: 1 }, icon: '📞' },
  Tactician: { desc: 'X’s and O’s savant. Teams execute better in games.', skills: { tactics: 4, development: 1 }, icon: '📋' },
  'Players Coach': { desc: 'Players run through walls for you. Better morale & retention.', skills: { motivation: 4, portal: 1 }, icon: '🤝' },
  Developer: { desc: 'Turns 3-stars into pros. Faster player progression.', skills: { development: 4, tactics: 1 }, icon: '📈' },
  Showman: { desc: 'Owns the podium. Media, hype and NIL collectives love you.', skills: { media: 3, nil: 2 }, icon: '🎤' },
  'Portal King': { desc: 'Master of the transfer market. Better portal pulls.', skills: { portal: 4, nil: 1 }, icon: '🔁' },
};

export const SKILL_INFO: Record<keyof CoachSkills, { label: string; desc: string; icon: string }> = {
  recruiting: { label: 'Recruiting', desc: '+recruiting hours per week and stronger relationship gains.', icon: '🎯' },
  development: { label: 'Player Development', desc: 'Players progress faster each offseason.', icon: '📈' },
  tactics: { label: 'Tactics', desc: 'In-game shot quality and fewer turnovers.', icon: '🧠' },
  motivation: { label: 'Motivation', desc: 'Higher morale, better chemistry and clutch play.', icon: '🔥' },
  nil: { label: 'NIL Dealmaker', desc: 'Bigger collective budget and cheaper deals.', icon: '💰' },
  media: { label: 'Media Savvy', desc: 'Press conferences hit harder; more fan hype.', icon: '🎤' },
  portal: { label: 'Portal Whisperer', desc: 'Transfers are more interested and your players stay.', icon: '🔁' },
};

export function xpForLevel(level: number): number {
  return Math.round(120 * Math.pow(level, 1.45));
}

export function blankSkills(): CoachSkills {
  return { recruiting: 1, development: 1, tactics: 1, motivation: 1, nil: 1, media: 1, portal: 1 };
}

export function genAICoach(prestige: number, teamId: string | null): Coach {
  const rating = Math.round(clamp(prestige * 0.6 + 25 + rng.normal(0, 9), 20, 98));
  const s = (rating - 20) / 10; // ~0..8
  const skills: CoachSkills = {
    recruiting: Math.round(clamp(s + rng.normal(0, 1.5), 0, 10)),
    development: Math.round(clamp(s + rng.normal(0, 1.5), 0, 10)),
    tactics: Math.round(clamp(s + rng.normal(0, 1.5), 0, 10)),
    motivation: Math.round(clamp(s + rng.normal(0, 1.5), 0, 10)),
    nil: Math.round(clamp(s + rng.normal(0, 1.5), 0, 10)),
    media: Math.round(clamp(s + rng.normal(0, 1.5), 0, 10)),
    portal: Math.round(clamp(s + rng.normal(0, 1.5), 0, 10)),
  };
  const age = rng.int(36, 68);
  const yrs = rng.int(0, Math.max(1, age - 34));
  const w = Math.round(yrs * (14 + rating * 0.12));
  const l = Math.round(yrs * (30 - 14 - rating * 0.06));
  return {
    id: rng.id('c'),
    first: rng.pick(FIRST_NAMES),
    last: rng.pick(LAST_NAMES),
    age,
    teamId,
    isUser: false,
    archetype: rng.pick(Object.keys(ARCHETYPE_INFO) as CoachArchetype[]),
    rating,
    skills,
    xp: 0,
    level: 1,
    skillPoints: 0,
    reputation: clamp(rating + rng.normal(0, 6), 10, 99),
    salary: Math.round((200000 + Math.exp(prestige * 0.05) * 30000) / 10000) * 10000,
    contractYears: rng.int(1, 6),
    jobSecurity: rng.int(55, 85),
    mediaRep: 50,
    career: [],
    trophies: [],
    careerW: Math.max(0, w),
    careerL: Math.max(0, l),
  };
}

export function userCoach(): Coach['skills'] { return blankSkills(); }

/** Add XP to user coach; returns levels gained */
export function gainXp(state: GameState, amount: number): number {
  const c = state.coaches[state.user.coachId];
  if (!c) return 0;
  c.xp += Math.round(amount);
  let gained = 0;
  while (c.xp >= xpForLevel(c.level)) {
    c.xp -= xpForLevel(c.level);
    c.level++;
    c.skillPoints++;
    gained++;
    state.user.moments.push({ kind: 'levelUp', level: c.level });
  }
  return gained;
}

export function hoursForWeek(state: GameState): number {
  const c = state.coaches[state.user.coachId];
  return 40 + (c ? c.skills.recruiting * 4 : 0);
}

export function applyEffects(state: GameState, effects: Effect[], ctxPlayer?: string) {
  const team = state.teams[state.user.teamId];
  const coach = state.coaches[state.user.coachId];
  const mediaMul = 1 + (coach?.skills.media ?? 0) * 0.06;
  for (const e of effects) {
    switch (e.kind) {
      case 'morale': {
        const targets = e.target === 'team' ? teamPlayers(state, team.id) : [state.players[e.target === 'ctx' ? ctxPlayer ?? '' : e.target]].filter(Boolean);
        for (const p of targets) p.morale = clamp(p.morale + e.delta * (p.traits.includes('coachable') ? 1.2 : 1), 0, 100);
        break;
      }
      case 'hype': team.hype = clamp(team.hype + e.delta * mediaMul, 0, 100); break;
      case 'security': coach.jobSecurity = clamp(coach.jobSecurity + e.delta, 0, 100); break;
      case 'mediaRep': coach.mediaRep = clamp(coach.mediaRep + e.delta * mediaMul, 0, 100); break;
      case 'nilBudget': team.nilBudget = Math.max(0, team.nilBudget + e.delta); break;
      case 'rep': coach.reputation = clamp(coach.reputation + e.delta, 0, 100); break;
      case 'xp': gainXp(state, e.delta); break;
      case 'followers': {
        const p = state.players[e.target === 'ctx' ? ctxPlayer ?? '' : e.target];
        if (p) p.followers = Math.max(0, Math.round(p.followers + e.delta));
        break;
      }
      case 'injury': {
        const p = state.players[e.target === 'ctx' ? ctxPlayer ?? '' : e.target];
        if (p) p.injury = e.games > 0 ? { type: p.injury?.type ?? 'Re-aggravated injury', games: e.games } : null;
        break;
      }
      case 'rating': {
        const p = state.players[e.target === 'ctx' ? ctxPlayer ?? '' : e.target];
        if (p) p.ratings[e.key] = clamp(p.ratings[e.key] + e.delta, 20, 99);
        break;
      }
      case 'recruitInterest': {
        for (const id of state.user.board) {
          const r = state.recruits[id];
          const s = r?.schools.find((x) => x.teamId === team.id);
          if (s) s.rel = clamp(s.rel + e.delta, 0, 100);
        }
        break;
      }
      case 'hours': state.user.hours = Math.max(0, state.user.hours + e.delta); break;
    }
  }
}

export function effectSummary(effects: Effect[]): string {
  const parts: string[] = [];
  for (const e of effects) {
    const sign = (v: number) => (v > 0 ? '+' : '');
    switch (e.kind) {
      case 'morale': parts.push(`${e.target === 'team' ? 'Team' : 'Player'} morale ${sign(e.delta)}${e.delta}`); break;
      case 'hype': parts.push(`Fan hype ${sign(e.delta)}${e.delta}`); break;
      case 'security': parts.push(`Job security ${sign(e.delta)}${e.delta}`); break;
      case 'mediaRep': parts.push(`Media relations ${sign(e.delta)}${e.delta}`); break;
      case 'nilBudget': parts.push(`NIL budget ${e.delta > 0 ? '+' : '-'}$${Math.abs(Math.round(e.delta / 1000))}K`); break;
      case 'rep': parts.push(`Reputation ${sign(e.delta)}${e.delta}`); break;
      case 'xp': parts.push(`+${e.delta} XP`); break;
      case 'recruitInterest': parts.push(`Recruit interest ${sign(e.delta)}${e.delta}`); break;
      case 'hours': parts.push(`Recruiting hours ${sign(e.delta)}${e.delta}`); break;
      case 'followers': parts.push(`Followers ${sign(e.delta)}${Math.round(e.delta / 1000)}K`); break;
      case 'injury': parts.push(`Injury risk`); break;
      case 'rating': parts.push(`Rating ${sign(e.delta)}${e.delta}`); break;
    }
  }
  return parts.join(' · ');
}

/** Expectation level 0..6 from team quality */
export const EXPECTATIONS = [
  'Show progress in conference play',
  'Finish in the top half of the conference',
  'Contend for a conference title',
  'Make the NCAA Tournament',
  'Win an NCAA Tournament game',
  'Reach the Sweet 16',
  'Make the Final Four',
];

export function setExpectations(state: GameState) {
  const team = state.teams[state.user.teamId];
  const sorted = Object.values(state.teams).sort((a, b) => b.rating - a.rating);
  const rank = sorted.findIndex((t) => t.id === team.id) + 1;
  let lvl: number;
  if (rank <= 5 && team.prestige >= 85) lvl = 6;
  else if (rank <= 12) lvl = 5;
  else if (rank <= 25) lvl = 4;
  else if (rank <= 50) lvl = 3;
  else {
    const confTeams = sorted.filter((t) => t.conf === team.conf);
    const crank = confTeams.findIndex((t) => t.id === team.id) + 1;
    lvl = crank <= 2 ? 2 : crank <= Math.ceil(confTeams.length / 2) ? 1 : 0;
  }
  state.user.expectationLevel = lvl;
  state.user.expectation = EXPECTATIONS[lvl];
}

/** Achieved level 0..6+ from season results */
export function achievedLevel(state: GameState, team: Team, confFinish: number, confSize: number, confChamp: boolean, ncaa: string): number {
  const order = ['', 'First Four', 'Round of 64', 'Round of 32', 'Sweet 16', 'Elite Eight', 'Final Four', 'Runner-up', 'Champion'];
  const idx = order.indexOf(ncaa);
  if (idx >= 6) return 6 + (idx - 6) * 0.5;
  if (idx >= 4) return 5 + (idx === 5 ? 0.5 : 0);
  if (idx === 3) return 4;
  if (idx >= 1) return 3;
  if (confChamp || confFinish <= 2) return 2;
  if (confFinish <= Math.ceil(confSize / 2)) return 1;
  void state; void team;
  return 0;
}
