import { rng } from './rng';
import type { BracketGame, GameState, ScheduledGame, TourneyBracket } from './types';
import { confStandings, selectField, REGIONS, type FieldEntry } from './rankings';
import { CT_FIRST, CT_LAST, NCAA_FIRST, NCAA_ROUND_NAMES } from './calendar';
import { pickTV } from './schedule';

function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2;
    const next: number[] = [];
    for (const s of order) next.push(s, n + 1 - s);
    order = next;
  }
  return order;
}

let gseq = 0;
function newGameId(state: GameState, prefix: string) {
  return `${prefix}${state.season}-${Date.now().toString(36)}${(gseq++).toString(36)}`;
}

export function setupConfTourneys(state: GameState) {
  state.confTourneys = {};
  for (const conf of state.conferences) {
    const standings = confStandings(state, conf.id);
    if (standings.length < 2) continue;
    let size = standings.length;
    if (conf.id === 'ivy') size = 4;
    if (size > 16) size = 16;
    if (conf.id === 'big-ten' || conf.id === 'acc') size = Math.min(size, 15);
    const teams = standings.slice(0, size);
    const bsize = 2 ** Math.ceil(Math.log2(size));
    const nRounds = Math.log2(bsize);
    const order = seedOrder(bsize);
    const rounds: BracketGame[][] = [];
    for (let r = 0; r < nRounds; r++) {
      const games: BracketGame[] = [];
      const n = bsize / 2 ** (r + 1);
      for (let i = 0; i < n; i++) games.push({ id: `${conf.id}-${r}-${i}`, round: r, slot: i, seeds: [null, null], teams: [null, null], winner: null });
      rounds.push(games);
    }
    const seeds: Record<string, number> = {};
    teams.forEach((t, i) => (seeds[t.id] = i + 1));
    for (let i = 0; i < bsize / 2; i++) {
      const sa = order[2 * i], sb = order[2 * i + 1];
      const g = rounds[0][i];
      g.seeds = [sa <= size ? sa : null, sb <= size ? sb : null];
      g.teams = [sa <= size ? teams[sa - 1].id : null, sb <= size ? teams[sb - 1].id : null];
    }
    const startDay = CT_LAST - (nRounds - 1);
    const dayForRound = Array.from({ length: nRounds }, (_, r) => Math.max(CT_FIRST, startDay + r));
    const roundNames = Array.from({ length: nRounds }, (_, r) => {
      const left = nRounds - r;
      return left === 1 ? 'Championship' : left === 2 ? 'Semifinals' : left === 3 ? 'Quarterfinals' : `Round ${r + 1}`;
    });
    const bracket: TourneyBracket = { name: `${conf.short} Tournament`, confId: conf.id, rounds, champion: null, seeds, dayForRound, roundNames };
    // resolve byes
    for (const g of rounds[0]) {
      if (g.teams[0] && !g.teams[1]) setWinner(bracket, g, g.teams[0]);
      else if (!g.teams[0] && g.teams[1]) setWinner(bracket, g, g.teams[1]);
    }
    state.confTourneys[conf.id] = bracket;
    scheduleReady(state, bracket, `${conf.short} Tournament`, 'ctourn');
  }
}

function setWinner(b: TourneyBracket, g: BracketGame, winner: string, score?: [number, number]) {
  g.winner = winner;
  if (score) g.score = score;
  const r = g.round;
  if (g.feed) {
    const [slot, side] = g.feed;
    const ng = b.rounds[1][slot];
    ng.teams[side] = winner;
    ng.seeds[side] = b.seeds[winner] ?? null;
    return;
  }
  if (r + 1 >= b.rounds.length) {
    b.champion = winner;
    return;
  }
  const ng = b.rounds[r + 1][g.slot >> 1];
  const side = g.slot & 1;
  ng.teams[side] = winner;
  ng.seeds[side] = b.seeds[winner] ?? null;
}

function scheduleReady(state: GameState, b: TourneyBracket, event: string, type: ScheduledGame['type']) {
  b.rounds.forEach((games, r) => {
    for (const g of games) {
      if (g.winner || g.gameId || !g.teams[0] || !g.teams[1]) continue;
      // higher seed listed as "home" (neutral site)
      const [a, c] = g.teams as [string, string];
      const sa = g.seeds[0] ?? 99, sc = g.seeds[1] ?? 99;
      const home = sa <= sc ? a : c, away = home === a ? c : a;
      const sg: ScheduledGame = {
        id: newGameId(state, type === 'ncaa' ? 'n' : 'c'),
        day: b.dayForRound[r],
        home, away, neutral: true, type,
        event: `${event} · ${b.roundNames[r]}${g.region ? ` (${g.region})` : ''}`,
        round: r,
        played: false,
        tv: type === 'ncaa' ? (r >= 5 ? 'THN' : rng.pick(['THN', 'SportsNet One', 'Big Stage Sports', 'National Hoops TV'])) : pickTV(state, state.teams[home], state.teams[away]),
      };
      g.gameId = sg.id;
      state.schedule.push(sg);
    }
  });
}

/** After games are played, push winners forward and schedule new games */
export function advanceBrackets(state: GameState) {
  const byId = new Map(state.schedule.map((g) => [g.id, g]));
  const process = (b: TourneyBracket, event: string, type: ScheduledGame['type']) => {
    for (const games of b.rounds) {
      for (const g of games) {
        if (g.winner || !g.gameId) continue;
        const sg = byId.get(g.gameId);
        if (!sg || !sg.played) continue;
        const homeWon = (sg.hs ?? 0) > (sg.as ?? 0);
        const w = homeWon ? sg.home : sg.away;
        const score: [number, number] = g.teams[0] === sg.home ? [sg.hs!, sg.as!] : [sg.as!, sg.hs!];
        setWinner(b, g, w, score);
      }
    }
    scheduleReady(state, b, event, type);
  };
  for (const b of Object.values(state.confTourneys)) process(b, b.name, 'ctourn');
  if (state.ncaa) process(state.ncaa, 'NCAA Tournament', 'ncaa');
}

export function autoBids(state: GameState): Record<string, string> {
  const res: Record<string, string> = {};
  for (const [cid, b] of Object.entries(state.confTourneys)) if (b.champion) res[cid] = b.champion;
  return res;
}

const R64_ORDER: [number, number][] = [[1, 16], [8, 9], [5, 12], [4, 13], [6, 11], [3, 14], [7, 10], [2, 15]];

export function buildNcaa(state: GameState): FieldEntry[] {
  const field = selectField(state, autoBids(state));
  const seeds: Record<string, number> = {};
  for (const e of field) seeds[e.teamId] = e.seed;
  const rounds: BracketGame[][] = [];
  const sizes = [4, 32, 16, 8, 4, 2, 1];
  sizes.forEach((n, r) => {
    const games: BracketGame[] = [];
    for (let i = 0; i < n; i++) games.push({ id: `ncaa-${r}-${i}`, round: r, slot: i, seeds: [null, null], teams: [null, null], winner: null });
    rounds.push(games);
  });
  // region labels on rounds 1-4
  for (let r = 1; r <= 4; r++) for (const g of rounds[r]) g.region = REGIONS[Math.floor(g.slot / (rounds[r].length / 4))];
  // R64
  for (let reg = 0; reg < 4; reg++) {
    R64_ORDER.forEach(([sa, sb], m) => {
      const g = rounds[1][reg * 8 + m];
      const a = field.find((e) => e.region === reg && e.seed === sa && !e.firstFour);
      const b = field.find((e) => e.region === reg && e.seed === sb && !e.firstFour);
      g.seeds = [sa, sb];
      g.teams = [a?.teamId ?? null, b?.teamId ?? null];
    });
  }
  // First Four
  const ff = field.filter((e) => e.firstFour);
  let ffi = 0;
  for (const seed of [11, 16]) {
    for (let reg = 0; reg < 4; reg++) {
      const pair = ff.filter((e) => e.seed === seed && e.region === reg);
      if (pair.length !== 2) continue;
      const g = rounds[0][ffi++];
      if (!g) continue;
      g.seeds = [seed, seed];
      g.teams = [pair[0].teamId, pair[1].teamId];
      g.region = REGIONS[reg];
      const m = R64_ORDER.findIndex(([a, b]) => a === seed || b === seed);
      const side = R64_ORDER[m][0] === seed ? 0 : 1;
      g.feed = [reg * 8 + m, side];
    }
  }
  const dayForRound = NCAA_ROUND_NAMES.map((_, i) => NCAA_FIRST + i);
  state.ncaa = { name: 'NCAA Tournament', rounds, champion: null, seeds, regions: REGIONS, dayForRound, roundNames: NCAA_ROUND_NAMES };
  scheduleReady(state, state.ncaa, 'NCAA Tournament', 'ncaa');
  return field;
}

export const NCAA_EXIT_LABEL = ['First Four', 'Round of 64', 'Round of 32', 'Sweet 16', 'Elite Eight', 'Final Four', 'Runner-up'];

/** Furthest NCAA round reached label for a team (or '' if not in field) */
export function ncaaResult(state: GameState, teamId: string): string {
  const b = state.ncaa;
  if (!b || b.seeds[teamId] == null) return '';
  if (b.champion === teamId) return 'Champion';
  let last = -1;
  b.rounds.forEach((games, r) => {
    for (const g of games) if (g.teams.includes(teamId)) last = Math.max(last, r);
  });
  if (last < 0) return '';
  // if lost in round `last`
  return NCAA_EXIT_LABEL[last] ?? '';
}
