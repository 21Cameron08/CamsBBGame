// Inbox story events: weekly dilemmas with choices and consequences.
import { rng } from './rng';
import type { GameState, InboxItem, Player, InboxChoice } from './types';
import { teamPlayers } from './team';
import { fmtMoney, roundMoney, nilValue } from './player';
import { FIRST_NAMES, LAST_NAMES } from '../data/names';

let seq = 0;
function mk(state: GameState, o: Omit<InboxItem, 'id' | 'day' | 'season' | 'resolved'>): InboxItem {
  return { id: `ev${Date.now().toString(36)}${(seq++).toString(36)}`, day: state.day, season: state.season, resolved: false, ...o };
}

type Gen = (state: GameState) => InboxItem | null;

const pickPlayer = (ps: Player[], f: (p: Player) => boolean = () => true) => {
  const c = ps.filter(f);
  return c.length ? rng.pick(c) : null;
};

const booster = () => `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;

const GENERATORS: { w: number; phase: ('regular' | 'preseason' | 'confTourney' | 'any')[]; gen: Gen }[] = [
  {
    w: 3, phase: ['regular', 'preseason'], gen: (s) => {
      const team = s.teams[s.user.teamId];
      const amt = roundMoney(team.nilBudget * rng.range(0.06, 0.15) + 50000);
      const b = booster();
      return mk(s, {
        from: b, fromRole: 'Mega-Booster', subject: 'A generous offer… with strings',
        body: `${b}, one of the program's biggest donors, wants to drop ${fmtMoney(amt)} into the collective. The catch: he wants a seat at the table on recruiting decisions and "a little more playing time" for a walk-on who happens to be his nephew.`,
        choices: [
          { label: 'Take the money', hint: 'NIL budget up, team morale down', effects: [{ kind: 'nilBudget', delta: amt }, { kind: 'morale', target: 'team', delta: -4 }, { kind: 'mediaRep', delta: -2 }], result: `The check clears. The locker room noticed the nephew's new jersey.` },
          { label: 'Take it, no strings', hint: 'Partial money; booster annoyed', effects: [{ kind: 'nilBudget', delta: Math.round(amt * 0.4) }, { kind: 'security', delta: -2 }], result: `He grumbled, but gave a smaller gift anyway.` },
          { label: 'Politely decline', hint: 'Integrity respected', effects: [{ kind: 'morale', target: 'team', delta: 2 }, { kind: 'mediaRep', delta: 2 }, { kind: 'security', delta: -1 }], result: `Your players respect the stance. The booster's golf buddies do not.` },
        ],
        priority: true,
      });
    },
  },
  {
    w: 4, phase: ['regular'], gen: (s) => {
      const ps = teamPlayers(s, s.user.teamId);
      const p = pickPlayer(ps, (x) => x.stats.gp > 2 && x.ovr >= 55);
      if (!p) return null;
      const views = rng.int(2, 15);
      return mk(s, {
        from: 'Sports Information Director', fromRole: 'Media Relations', subject: `${p.first} ${p.last} just went viral`,
        body: `A clip of ${p.first} ${p.last}'s highlight from the last game has ${views}M views across platforms. Brands are calling. How do you want to handle it?`,
        personId: p.id, personKind: 'player',
        choices: [
          { label: 'Lean in — media blitz', hint: 'Followers & hype up, small focus risk', effects: [{ kind: 'followers', target: p.id, delta: views * 25000 }, { kind: 'hype', delta: 4 }, { kind: 'morale', target: p.id, delta: 4 }, { kind: 'morale', target: 'team', delta: -1 }], result: `${p.last}'s follower count explodes. Teammates roll their eyes a bit.` },
          { label: 'Let him enjoy it', hint: 'Balanced', effects: [{ kind: 'followers', target: p.id, delta: views * 12000 }, { kind: 'morale', target: p.id, delta: 3 }], result: `He's having fun with it. No harm done.` },
          { label: 'Stay humble — team first', hint: 'Team morale up', effects: [{ kind: 'morale', target: 'team', delta: 2 }, { kind: 'morale', target: p.id, delta: p.traits.includes('diva') ? -6 : 0 }], result: `The message is received loud and clear.` },
        ],
      });
    },
  },
  {
    w: 3, phase: ['regular'], gen: (s) => {
      const ps = teamPlayers(s, s.user.teamId).sort((a, b) => b.ovr - a.ovr);
      const p = pickPlayer(ps.slice(0, 6), (x) => !!x.nil);
      if (!p) return null;
      const val = nilValue(p, s.teams[s.user.teamId].market);
      const ask = roundMoney(Math.max(val, (p.nil?.amount ?? 0) * 1.35));
      return mk(s, {
        from: `${p.first} ${p.last}'s agent`, fromRole: 'Player Representation', subject: 'Contract talk mid-season',
        body: `${p.first}'s representation says other programs have "made it known" what he'd be worth in the portal. They want his NIL bumped from ${fmtMoney(p.nil?.amount ?? 0)} to ${fmtMoney(ask)} — now.`,
        personId: p.id, personKind: 'player',
        choices: [
          { label: `Pay him (${fmtMoney(ask)})`, hint: 'Uses NIL budget; he’s happy', effects: [{ kind: 'morale', target: p.id, delta: 12 }, { kind: 'nilBudget', delta: -(ask - (p.nil?.amount ?? 0)) }], result: `Deal done. ${p.first} is locked in.` },
          { label: 'Promise to revisit in the offseason', hint: 'Small morale hit', effects: [{ kind: 'morale', target: p.id, delta: -5 }], result: `They'll wait — for now.` },
          { label: 'Refuse — tampering is tampering', hint: 'Big morale hit, media respect', effects: [{ kind: 'morale', target: p.id, delta: -14 }, { kind: 'mediaRep', delta: 3 }], result: `Things are frosty. Watch for the portal in April.` },
        ],
        priority: true,
      });
    },
  },
  {
    w: 3, phase: ['regular'], gen: (s) => {
      const ps = teamPlayers(s, s.user.teamId);
      const p = pickPlayer(ps, (x) => !x.traits.includes('scholar'));
      if (!p) return null;
      return mk(s, {
        from: 'Academic Advisor', fromRole: 'Academic Support', subject: `${p.first} ${p.last} — eligibility concern`,
        body: `${p.first} is failing a required class. If his grade doesn't improve before finals he could be ruled ineligible. We can assign mandatory tutoring, but it will cut into his practice time.`,
        personId: p.id, personKind: 'player',
        choices: [
          { label: 'Mandatory tutoring', hint: 'Costs 8 recruiting hours of staff time', effects: [{ kind: 'hours', delta: -8 }, { kind: 'mediaRep', delta: 1 }], result: `He passes with a B-. Crisis averted.` },
          { label: 'Sit him until grades improve', hint: 'Misses 2 games; morale dip', effects: [{ kind: 'injury', target: p.id, games: 2 }, { kind: 'morale', target: p.id, delta: -5 }, { kind: 'morale', target: 'team', delta: 2 }], result: `He sits two games and gets the message.` },
          (() => { const ok = rng.chance(0.5); return { label: "He'll figure it out", hint: 'Risky', effects: ok ? [] : [{ kind: 'injury' as const, target: p.id, games: 5 }, { kind: 'security' as const, delta: -3 }], result: ok ? 'He pulled it out. Phew.' : `He was ruled academically ineligible for several games.` }; })(),
        ],
      });
    },
  },
  {
    w: 2, phase: ['regular'], gen: (s) => {
      const ps = teamPlayers(s, s.user.teamId);
      const a = pickPlayer(ps, (x) => x.traits.includes('diva') || x.traits.includes('hothead')) ?? pickPlayer(ps);
      const b = pickPlayer(ps, (x) => x.id !== a?.id);
      if (!a || !b) return null;
      return mk(s, {
        from: 'Team Captain', fromRole: 'Locker Room', subject: 'Locker room tension',
        body: `${a.first} ${a.last} and ${b.first} ${b.last} got into it at practice — words were exchanged over shots and minutes. The team is watching how you handle it.`,
        choices: [
          { label: 'Team meeting — clear the air', hint: 'Team morale +', effects: [{ kind: 'morale', target: 'team', delta: 3 }, { kind: 'morale', target: a.id, delta: -2 }], result: `Hugs all around. Mostly.` },
          { label: `Back ${a.last}`, hint: `${a.last} +, ${b.last} −`, effects: [{ kind: 'morale', target: a.id, delta: 8 }, { kind: 'morale', target: b.id, delta: -10 }], result: `${b.last} isn't thrilled.` },
          { label: `Back ${b.last}`, hint: `${b.last} +, ${a.last} −`, effects: [{ kind: 'morale', target: b.id, delta: 8 }, { kind: 'morale', target: a.id, delta: -10 }], result: `${a.last} is sulking.` },
          { label: 'Suspend both for a half', hint: 'Discipline; media respect', effects: [{ kind: 'morale', target: a.id, delta: -4 }, { kind: 'morale', target: b.id, delta: -4 }, { kind: 'mediaRep', delta: 3 }, { kind: 'morale', target: 'team', delta: 1 }], result: `Message sent: nobody is bigger than the team.` },
        ],
      });
    },
  },
  {
    w: 2, phase: ['regular'], gen: (s) => {
      const team = s.teams[s.user.teamId];
      if (!team.apRank || team.apRank > 15) return null;
      return mk(s, {
        from: 'Hoops Saturday Live', fromRole: 'National TV', subject: 'The big pregame show is coming to campus!',
        body: `The nation's top college hoops pregame show wants to broadcast live from ${team.arena} before your next home game. It's a circus — but recruits love it.`,
        choices: [
          { label: 'Roll out the red carpet', hint: 'Hype & recruiting boost', effects: [{ kind: 'hype', delta: 8 }, { kind: 'recruitInterest', delta: 4 }, { kind: 'morale', target: 'team', delta: -1 }], result: `The student section shows up at 5 a.m. with signs. Legendary.` },
          { label: 'Keep it low-key', hint: 'Small boost, focus maintained', effects: [{ kind: 'hype', delta: 3 }, { kind: 'morale', target: 'team', delta: 2 }], result: `A great day without the distractions.` },
        ],
      });
    },
  },
  {
    w: 2, phase: ['regular'], gen: (s) => {
      const name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
      const school = rng.pick(Object.values(s.teams).filter((t) => t.prestige < s.teams[s.user.teamId].prestige)).school;
      return mk(s, {
        from: name, fromRole: 'Associate Head Coach', subject: 'I have a head coaching offer',
        body: `Your top assistant, ${name}, has been offered the head job at ${school}. He's been your best recruiter. A raise from your staff pool might keep him.`,
        choices: [
          { label: 'Match with a raise', hint: 'Costs NIL/staff money, keep recruiting edge', effects: [{ kind: 'nilBudget', delta: -120000 }, { kind: 'hours', delta: 4 }, { kind: 'recruitInterest', delta: 2 }], result: `He stays. Loyalty pays.` },
          { label: 'Congratulate him', hint: 'Lose recruiting hours this week', effects: [{ kind: 'hours', delta: -10 }, { kind: 'rep', delta: 2 }], result: `Your coaching tree grows. Your recruiting board feels it.` },
        ],
      });
    },
  },
  {
    w: 2, phase: ['regular'], gen: (s) => {
      const ps = teamPlayers(s, s.user.teamId);
      const p = pickPlayer(ps, (x) => !!x.injury && x.injury.games >= 2 && x.ovr >= 60);
      if (!p) return null;
      return mk(s, {
        from: 'Head Athletic Trainer', fromRole: 'Sports Medicine', subject: `${p.first} ${p.last} wants to play through it`,
        body: `${p.first} (${p.injury!.type.toLowerCase()}) is begging to play this week. Medically, he's not 100%. Rushing him back risks a setback.`,
        personId: p.id, personKind: 'player',
        choices: [
          (() => { const bad = rng.chance(0.35); return { label: 'Clear him to play', hint: 'Back now; re-injury risk', effects: bad ? [{ kind: 'injury' as const, target: p.id, games: p.injury!.games + 4 }, { kind: 'morale' as const, target: p.id, delta: -6 }] : [{ kind: 'injury' as const, target: p.id, games: 0 }, { kind: 'morale' as const, target: p.id, delta: 6 }], result: bad ? `He tweaked it again in warmups. Setback.` : `He's back — and he looks great.` }; })(),
          { label: 'Follow the medical timeline', hint: 'Safe', effects: [{ kind: 'morale', target: p.id, delta: -2 }, { kind: 'mediaRep', delta: 1 }], result: `He's frustrated but will be healthy for the stretch run.` },
        ],
      });
    },
  },
  {
    w: 2, phase: ['regular', 'preseason'], gen: (s) => {
      const team = s.teams[s.user.teamId];
      return mk(s, {
        from: 'Collective Director', fromRole: `${team.school} NIL Collective`, subject: 'Donor drive weekend?',
        body: `We want to host a donor gala and a youth camp this weekend. You'd need to give up a practice day and a chunk of your recruiting calendar, but the collective could raise real money.`,
        choices: [
          { label: 'Do the gala and the camp', hint: '+NIL budget, −hours, −practice', effects: [{ kind: 'nilBudget', delta: roundMoney(team.nilBudget * 0.08 + 40000) }, { kind: 'hours', delta: -12 }, { kind: 'morale', target: 'team', delta: -1 }], result: `Big night. The collective is flush.` },
          { label: 'Just the gala', hint: 'Smaller boost', effects: [{ kind: 'nilBudget', delta: roundMoney(team.nilBudget * 0.04 + 15000) }, { kind: 'hours', delta: -5 }], result: 'You shook a lot of hands.' },
          { label: 'Not this week', hint: 'No change', effects: [], result: 'Maybe next time.' },
        ],
      });
    },
  },
  {
    w: 2, phase: ['regular'], gen: (s) => {
      const ps = teamPlayers(s, s.user.teamId).filter((p) => p.cls === 'FR' && p.stats.gp <= 3 && !p.redshirting);
      const p = pickPlayer(ps);
      if (!p) return null;
      return mk(s, {
        from: 'Director of Player Personnel', fromRole: 'Staff', subject: `Redshirt ${p.first} ${p.last}?`,
        body: `${p.first} (${p.ovr} OVR, ${p.pot} POT) has barely played. We could redshirt him to preserve a year of eligibility and let him develop.`,
        personId: p.id, personKind: 'player',
        choices: [
          { label: 'Redshirt him', hint: 'Out for the season; extra year', effects: [{ kind: 'morale', target: p.id, delta: -3 }], result: `${p.first} will redshirt this season.` },
          { label: 'Keep him active', hint: 'No change', effects: [{ kind: 'morale', target: p.id, delta: 2 }], result: 'He stays available.' },
        ],
      });
    },
  },
];

/** Maybe generate a weekly event for the user */
export function maybeWeeklyEvent(state: GameState): InboxItem | null {
  const pending = state.inbox.filter((i) => !i.resolved).length;
  if (pending >= 3) return null;
  if (!rng.chance(0.42)) return null;
  const phase = state.phase === 'preseason' ? 'preseason' : state.phase === 'regular' ? 'regular' : 'any';
  const pool = GENERATORS.filter((g) => g.phase.includes(phase as 'regular') || g.phase.includes('any'));
  for (let i = 0; i < 4; i++) {
    const g = rng.weighted(pool, pool.map((x) => x.w));
    const ev = g.gen(state);
    if (ev) {
      // special-case redshirt choice marker
      if (ev.subject.startsWith('Redshirt') && ev.personId) {
        (ev.choices[0] as InboxChoice & { redshirt?: string }).redshirt = ev.personId;
      }
      state.inbox.unshift(ev);
      return ev;
    }
  }
  return null;
}

export function welcomeInbox(state: GameState) {
  const team = state.teams[state.user.teamId];
  const ad = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
  state.inbox.unshift(mk(state, {
    from: ad, fromRole: 'Athletic Director', subject: `Welcome to ${team.school}, Coach`,
    body: `Welcome aboard. Our expectation for this season: ${state.user.expectation.toLowerCase()}. Your basketball NIL + revenue-share pool is ${fmtMoney(team.nilBudget)} this year. Recruit hard, keep our players happy, and win. My door is always open.`,
    choices: [
      { label: "Let's get to work.", effects: [{ kind: 'security', delta: 1 }], result: 'The AD nods approvingly.' },
      { label: 'Ask for a bigger NIL pool', hint: 'Small chance of more money', effects: rng.chance(0.4) ? [{ kind: 'nilBudget', delta: roundMoney(team.nilBudget * 0.1) }] : [{ kind: 'security', delta: -1 }], result: 'We will see what we can do.' },
    ],
    priority: true,
  }));
}
