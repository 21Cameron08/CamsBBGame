// Press conference generator. Questions adapt to context; answers carry effects.
import { rng } from './rng';
import type { BoxScore, Effect, GameState, Player, PressConference, PressQuestion, ScheduledGame } from './types';
import { INSIDERS } from './media';
import { MEDIA_OUTLETS } from '../data/names';
import { teamPlayers } from './team';
import { resumeMetrics } from './scheduling';

type Ctx = {
  team: string; mascot: string; opp?: string; record: string; star?: Player; streak: number; rank: number | null;
  us?: number; them?: number; margin?: number; rival?: boolean; event?: string; expectation?: string; worst?: Player;
};

const REPORTERS = [
  ...INSIDERS.map((i) => ({ name: i.name, outlet: i.outlet })),
  { name: 'Bill Hargrove', outlet: 'The Daily Courier' },
  { name: 'Alicia Ramos', outlet: 'Channel 7 Sports' },
  { name: 'Devon Price', outlet: 'Student Radio 88.1' },
  { name: 'Greg Lindqvist', outlet: 'Hoops Insider' },
  { name: 'Tasha Whitlock', outlet: 'The Morning Ledger' },
];

const A = (tone: PressQuestion['answers'][number]['tone'], text: string, effects: Effect[]) => ({ tone, text, effects });

function reporter() {
  const r = rng.pick(REPORTERS);
  return { reporter: r.name, outlet: r.outlet || rng.pick(MEDIA_OUTLETS) };
}

function q(text: string, answers: PressQuestion['answers']): PressQuestion {
  return { ...reporter(), text, answers };
}

function ctxFor(state: GameState, g?: ScheduledGame, box?: BoxScore): Ctx {
  const team = state.teams[state.user.teamId];
  const ps = teamPlayers(state, team.id).sort((a, b) => b.ovr - a.ovr);
  const c: Ctx = { team: team.school, mascot: team.mascot, record: `${team.record.w}-${team.record.l}`, star: ps[0], streak: team.record.streak, rank: team.apRank, expectation: state.user.expectation };
  if (g && box) {
    const home = g.home === team.id;
    c.opp = state.teams[home ? g.away : g.home].school;
    c.us = home ? box.hs : box.as;
    c.them = home ? box.as : box.hs;
    c.margin = c.us - c.them;
    c.event = g.event;
    const mine = home ? box.players[0] : box.players[1];
    const best = [...mine].sort((a, b) => b.pts - a.pts)[0];
    if (best) c.star = state.players[best.id] ?? c.star;
    const worst = [...mine].filter((p) => p.min >= 15).sort((a, b) => (a.pts - a.fga * 0.6) - (b.pts - b.fga * 0.6))[0];
    if (worst) c.worst = state.players[worst.id];
  }
  return c;
}

export function introPresser(state: GameState): PressConference {
  const c = ctxFor(state);
  return {
    id: rng.id('pc'),
    title: 'Introductory Press Conference',
    context: `You are introduced as the new head coach of ${c.team}. The cameras are rolling.`,
    questions: [
      q(`Coach, welcome to ${c.team}. What made this the right job for you?`, [
        A('humble', `This place has a proud history. I'm just grateful for the opportunity and ready to work.`, [{ kind: 'mediaRep', delta: 4 }, { kind: 'security', delta: 2 }]),
        A('confident', `We didn't come here to rebuild. We came here to win — and win big.`, [{ kind: 'hype', delta: 8 }, { kind: 'security', delta: -2 }, { kind: 'recruitInterest', delta: 3 }]),
        A('joke', `Honestly? The barbecue. And the fans. Mostly the barbecue.`, [{ kind: 'hype', delta: 4 }, { kind: 'mediaRep', delta: 3 }]),
      ]),
      q(`How will you approach NIL and the transfer portal?`, [
        A('confident', `We're going to be aggressive. Our collective is going to be one of the best in the country.`, [{ kind: 'nilBudget', delta: 150000 }, { kind: 'hype', delta: 3 }]),
        A('humble', `Relationships first. The money matters, but development and culture matter more.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'recruitInterest', delta: 2 }]),
        A('deflect', `We'll be smart. I'm not going to get into specifics today.`, [{ kind: 'mediaRep', delta: -1 }]),
      ]),
      q(`What's your message to the fan base?`, [
        A('fiery', `Pack the gym. Every night. Make this the toughest place to play in America.`, [{ kind: 'hype', delta: 7 }]),
        A('humble', `Be patient with us, and I promise we'll give you a team you're proud of.`, [{ kind: 'security', delta: 3 }, { kind: 'hype', delta: 2 }]),
        A('confident', `Clear your calendars for the first weekend in April.`, [{ kind: 'hype', delta: 10 }, { kind: 'security', delta: -4 }]),
      ]),
    ],
  };
}

export function mediaDayPresser(state: GameState): PressConference {
  const c = ctxFor(state);
  const qs: PressQuestion[] = [
    q(`The preseason poll ${c.rank ? `has you at No. ${c.rank}` : `doesn't have ${c.team} ranked`}. Your reaction?`, c.rank ? [
      A('humble', `Rankings in October don't mean anything. We haven't done anything yet.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'morale', target: 'team', delta: 2 }]),
      A('confident', `We belong there. Honestly we should be higher.`, [{ kind: 'hype', delta: 6 }, { kind: 'morale', target: 'team', delta: 3 }, { kind: 'security', delta: -2 }]),
      A('deflect', `I'll let you guys worry about the polls.`, [{ kind: 'mediaRep', delta: -1 }]),
    ] : [
      A('fiery', `Good. Keep sleeping on us. We'll remember who wasn't on board.`, [{ kind: 'morale', target: 'team', delta: 5 }, { kind: 'hype', delta: 5 }]),
      A('humble', `We have to earn it. That's fine with me.`, [{ kind: 'mediaRep', delta: 3 }]),
      A('joke', `I checked twice. Thought it was a typo.`, [{ kind: 'hype', delta: 3 }, { kind: 'mediaRep', delta: 2 }]),
    ]),
    q(`What are the expectations for this group? Your AD has said "${c.expectation?.toLowerCase()}".`, [
      A('confident', `We'll exceed that. This roster is built for March.`, [{ kind: 'hype', delta: 6 }, { kind: 'security', delta: -3 }]),
      A('humble', `That's fair. We'll take it one day at a time.`, [{ kind: 'security', delta: 2 }]),
      A('deflect', `My expectations are internal. They stay in the locker room.`, [{ kind: 'mediaRep', delta: -1 }, { kind: 'morale', target: 'team', delta: 1 }]),
    ]),
  ];
  const sc = state.scheduling;
  if (sc && sc.season === state.season && sc.locked) {
    const m = resumeMetrics(state);
    const top = [...sc.games].sort((a, b) => (sc.projRank[a.oppId] ?? 999) - (sc.projRank[b.oppId] ?? 999)).slice(0, 2).map((x) => state.teams[x.oppId].school);
    if (m.sosLabel === 'Brutal' || m.sosLabel === 'Tough') {
      qs.push(q(`You loaded up the non-conference schedule — ${top.join(' and ')}${sc.mte ? `, plus the ${sc.mte}` : ''}. Why take on that gauntlet?`, [
        A('confident', `We want the best. March prep starts in November.`, [{ kind: 'hype', delta: 4 }, { kind: 'morale', target: 'team', delta: 2 }]),
        A('humble', `It'll test us. We're going to learn a lot about who we are.`, [{ kind: 'mediaRep', delta: 3 }]),
        A('joke', `Ask me again after I've watched the film from those games.`, [{ kind: 'mediaRep', delta: 2 }, { kind: 'hype', delta: 1 }]),
      ]));
    } else if (m.sosLabel === 'Soft' || m.sosLabel === 'Cupcake') {
      qs.push(q(`Critics are calling your non-conference schedule soft. Your response?`, [
        A('fiery', `Ask the committee in March. We'll be just fine.`, [{ kind: 'hype', delta: 2 }, { kind: 'security', delta: -1 }]),
        A('humble', `Fair critique. We're young — building confidence early matters.`, [{ kind: 'mediaRep', delta: 2 }, { kind: 'morale', target: 'team', delta: 2 }]),
        A('deflect', `You play who's available. Next question.`, [{ kind: 'mediaRep', delta: -2 }]),
      ]));
    } else {
      qs.push(q(`Walk us through your approach to the non-conference schedule this year.`, [
        A('confident', `Enough big games to get us battle-tested, enough home games to build momentum.`, [{ kind: 'mediaRep', delta: 2 }, { kind: 'hype', delta: 2 }]),
        A('humble', `Our staff did a great job. It's balanced, and it'll prepare us for league play.`, [{ kind: 'mediaRep', delta: 3 }]),
      ]));
    }
  }
  if (c.star) {
    qs.push(q(`${c.star.first} ${c.star.last} is getting a lot of preseason buzz. What makes him special?`, [
      A('praise', `He's the hardest worker I've ever coached. All-American, no question.`, [{ kind: 'morale', target: c.star.id, delta: 8 }, { kind: 'followers', target: c.star.id, delta: 15000 }]),
      A('humble', `He's talented, but this is a team. Nobody's bigger than the program.`, [{ kind: 'morale', target: 'team', delta: 3 }, { kind: 'morale', target: c.star.id, delta: c.star.traits.includes('diva') ? -6 : 0 }]),
      A('joke', `His shoe deal is bigger than my salary, so... a lot of things.`, [{ kind: 'hype', delta: 3 }, { kind: 'mediaRep', delta: 3 }]),
    ]));
  }
  return { id: rng.id('pc'), title: 'Preseason Media Day', context: `Media day at ${state.teams[state.user.teamId].arena}. A wall of cameras awaits.`, questions: qs };
}

export function postgamePresser(state: GameState, g: ScheduledGame, box: BoxScore): PressConference | null {
  const c = ctxFor(state, g, box);
  if (c.margin == null || !c.opp) return null;
  const won = c.margin > 0;
  const team = state.teams[state.user.teamId];
  const oppTeam = state.teams[g.home === team.id ? g.away : g.home];
  const upsetWin = won && oppTeam.apRank && (!team.apRank || team.apRank > oppTeam.apRank);
  const badLoss = !won && !oppTeam.apRank && team.rating - oppTeam.rating > 6;
  const tourney = g.type === 'ncaa' || g.type === 'ctourn';
  const qs: PressQuestion[] = [];
  if (won) {
    if (upsetWin) {
      qs.push(q(`Coach, that's a statement win over No. ${oppTeam.apRank} ${c.opp}. Does this change how people see ${c.team}?`, [
        A('confident', `It should. We've been saying it all year — we're a top-tier team.`, [{ kind: 'hype', delta: 8 }, { kind: 'morale', target: 'team', delta: 4 }, { kind: 'recruitInterest', delta: 3 }]),
        A('humble', `It's one win. We'll enjoy it tonight and get back to work tomorrow.`, [{ kind: 'mediaRep', delta: 4 }, { kind: 'security', delta: 2 }]),
        A('praise', `Credit to ${c.opp}. Hall of Fame program. Our guys just made a couple more plays.`, [{ kind: 'mediaRep', delta: 5 }]),
      ]));
    } else {
      qs.push(q(`A ${c.margin}-point win tonight over ${c.opp}. What did you like?`, [
        A('praise', `Our defense. We were connected for 40 minutes. That's who we want to be.`, [{ kind: 'morale', target: 'team', delta: 3 }]),
        A('humble', `We won, but we left a lot out there. Plenty to clean up on film.`, [{ kind: 'security', delta: 1 }, { kind: 'mediaRep', delta: 2 }]),
        A('joke', `I liked the final score. Everything else we'll talk about at practice.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'hype', delta: 1 }]),
      ]));
    }
    if (c.star) {
      qs.push(q(`${c.star.first} ${c.star.last} was terrific tonight. Talk about his performance.`, [
        A('praise', `He's a special player. Kid’s a pro and he plays like one.`, [{ kind: 'morale', target: c.star.id, delta: 6 }, { kind: 'followers', target: c.star.id, delta: 8000 }]),
        A('humble', `He made winning plays, but his teammates found him. It's a team win.`, [{ kind: 'morale', target: 'team', delta: 2 }]),
        A('fiery', `He can be better. He knows it. We're going to keep pushing him.`, [{ kind: 'morale', target: c.star.id, delta: c.star.traits.includes('coachable') ? 3 : -4 }, { kind: 'rating', target: c.star.id, key: 'iq', delta: 1 }]),
      ]));
    }
  } else {
    if (badLoss) {
      qs.push(q(`Coach, a loss to ${c.opp} — that's going to hurt the résumé. What happened?`, [
        A('fiery', `We were soft. Flat-out soft. That's on me, and it will not happen again.`, [{ kind: 'morale', target: 'team', delta: -2 }, { kind: 'security', delta: 2 }, { kind: 'hype', delta: 1 }]),
        A('deflect', `Give ${c.opp} credit. They played well. We'll watch the film.`, [{ kind: 'mediaRep', delta: 1 }]),
        A('humble', `I didn't have them ready. I take full responsibility.`, [{ kind: 'morale', target: 'team', delta: 3 }, { kind: 'security', delta: -1 }, { kind: 'mediaRep', delta: 3 }]),
      ]));
    } else {
      qs.push(q(`Tough ${Math.abs(c.margin)}-point loss to ${c.opp}. What's the message to the locker room?`, [
        A('humble', `Keep the faith. We're close. We have to finish games.`, [{ kind: 'morale', target: 'team', delta: 3 }]),
        A('fiery', `Nobody in that room should be happy. Practice is going to be... spirited.`, [{ kind: 'morale', target: 'team', delta: -2 }, { kind: 'rating', target: c.star?.id ?? '', key: 'perD', delta: 1 }]),
        A('deflect', `We'll move on. Next game.`, [{ kind: 'mediaRep', delta: -2 }]),
      ]));
    }
    if (c.worst) {
      qs.push(q(`${c.worst.first} ${c.worst.last} struggled tonight. Are you considering lineup changes?`, [
        A('praise', `I've got total confidence in him. He'll bounce back.`, [{ kind: 'morale', target: c.worst.id, delta: 6 }]),
        A('fiery', `Everybody's minutes are up for grabs. Nobody is guaranteed anything.`, [{ kind: 'morale', target: c.worst.id, delta: -8 }, { kind: 'morale', target: 'team', delta: 1 }]),
        A('deflect', `I'm not going to talk about individual guys tonight.`, [{ kind: 'mediaRep', delta: -1 }]),
      ]));
    }
  }
  if (tourney) {
    qs.push(q(won ? `You're moving on. How do you keep this group hungry?` : `The season is over. What will you remember about this team?`, won ? [
      A('confident', `They're not satisfied. We came here to cut down nets.`, [{ kind: 'morale', target: 'team', delta: 4 }, { kind: 'hype', delta: 4 }]),
      A('humble', `Survive and advance. That's all March is.`, [{ kind: 'mediaRep', delta: 3 }]),
    ] : [
      A('praise', `Their heart. This group laid the foundation for something big.`, [{ kind: 'morale', target: 'team', delta: 5 }, { kind: 'recruitInterest', delta: 2 }]),
      A('humble', `It hurts. We'll learn from it and be back.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'security', delta: 1 }]),
    ]));
  } else if (c.streak >= 4 || c.streak <= -3) {
    qs.push(q(c.streak > 0 ? `That's ${c.streak} straight wins. Is this team peaking?` : `That's ${-c.streak} losses in a row. Is there any concern about the direction of the program?`, c.streak > 0 ? [
      A('confident', `We haven't peaked. That's the scary part.`, [{ kind: 'hype', delta: 5 }, { kind: 'morale', target: 'team', delta: 2 }]),
      A('humble', `Streaks are fun but they end. Stay present.`, [{ kind: 'mediaRep', delta: 3 }]),
    ] : [
      A('fiery', `Concern? No. Anger? Yes. We'll fix it.`, [{ kind: 'security', delta: 1 }, { kind: 'morale', target: 'team', delta: -1 }]),
      A('humble', `Of course. It's my job to get it turned around and I will.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'security', delta: 2 }]),
      A('deflect', `Ask me in March.`, [{ kind: 'mediaRep', delta: -3 }, { kind: 'security', delta: -2 }]),
    ]));
  } else if (g.event && rng.chance(0.5)) {
    qs.push(q(`How much did the atmosphere in the ${g.event} add to tonight?`, [
      A('praise', `Unreal. These are the games you play college basketball for.`, [{ kind: 'hype', delta: 3 }, { kind: 'recruitInterest', delta: 1 }]),
      A('humble', `Fun environment, but it's still 40 minutes of basketball.`, [{ kind: 'mediaRep', delta: 1 }]),
    ]));
  } else {
    qs.push(q(`Any update on NIL? Fans want to know if the collective is doing enough.`, [
      A('confident', `Our collective is going to make some noise. Donors, call me.`, [{ kind: 'nilBudget', delta: 75000 }, { kind: 'mediaRep', delta: -1 }]),
      A('humble', `Our fans and donors have been incredible. We're grateful.`, [{ kind: 'nilBudget', delta: 30000 }, { kind: 'mediaRep', delta: 2 }]),
      A('deflect', `That's a question for the collective, not me.`, [{ kind: 'mediaRep', delta: -1 }]),
    ]));
  }
  return {
    id: rng.id('pc'),
    title: won ? (upsetWin ? 'Postgame — Statement Win' : 'Postgame Press Conference') : badLoss ? 'Postgame — Damage Control' : 'Postgame Press Conference',
    context: `${state.teams[state.user.teamId].school} ${c.us}, ${c.opp} ${c.them}${g.event ? ` · ${g.event}` : ''}`,
    questions: qs.filter((x) => x.answers.length).slice(0, 3),
  };
}

export function seasonEndPresser(state: GameState, summary: string): PressConference {
  const team = state.teams[state.user.teamId];
  return {
    id: rng.id('pc'),
    title: 'End-of-Season Press Conference',
    context: summary,
    questions: [
      q(`Looking back at the season, how would you grade it?`, [
        A('confident', `A-minus. We exceeded what anybody outside our building thought.`, [{ kind: 'hype', delta: 3 }]),
        A('humble', `Incomplete. We have a long way to go.`, [{ kind: 'mediaRep', delta: 3 }, { kind: 'security', delta: 1 }]),
        A('fiery', `Not good enough. The standard here is higher than this.`, [{ kind: 'security', delta: 2 }, { kind: 'morale', target: 'team', delta: -2 }]),
      ]),
      q(`What's the plan in the portal this spring?`, [
        A('confident', `We're going shopping. Expect some big names.`, [{ kind: 'nilBudget', delta: 100000 }, { kind: 'hype', delta: 3 }]),
        A('humble', `Retention first. We want our guys back.`, [{ kind: 'morale', target: 'team', delta: 5 }]),
      ]),
      q(`Message to ${team.school} fans heading into the offseason?`, [
        A('praise', `Thank you. You were incredible all year. We're building something.`, [{ kind: 'hype', delta: 4 }, { kind: 'mediaRep', delta: 2 }]),
        A('confident', `Renew those season tickets. Next year is going to be special.`, [{ kind: 'hype', delta: 6 }, { kind: 'security', delta: -1 }]),
      ]),
    ],
  };
}
