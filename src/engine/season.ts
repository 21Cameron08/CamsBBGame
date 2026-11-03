// Daily/weekly season loop: sim games, apply results, weekly tick, phase changes.
import { rng, clamp } from './rng';
import type { BoxScore, GameState, InboxChoice, Player, ScheduledGame } from './types';
import { simulateGame } from './sim';
import { simSetup, teamPlayers, updateHype, refreshPower } from './team';
import { computeRatings, runPoll, spread } from './rankings';
import { advanceBrackets, buildNcaa, setupConfTourneys, NCAA_EXIT_LABEL } from './postseason';
import { CT_FIRST, LAST_REG_DAY, NCAA_FIRST, NCAA_LAST, SELECTION_DAY, phaseForDay, NCAA_ROUND_NAMES } from './calendar';
import { addNews, addSocial, commitNews, gameRecapNews, injuryNews, pollNews, randomBuzz, upsetNews, userGameSocial, statLine } from './media';
import { aiRecruitingWeek, decideRecruits, refreshRecruitInterest } from './recruiting';
import { maybeWeeklyEvent } from './events';
import { gainXp, hoursForWeek, applyEffects } from './coach';
import { postgamePresser, recordClaim, selectionPresser } from './press';
import { weeklyPractice, practiceMods } from './development';
import { randomInjury } from './player';
import { RIVALRIES } from '../data/rivalries';
import { beginSeasonEnd } from './offseason';
import { autoSignUnsigned } from './nil';
import { staffEffects, resolvePoach, applyStaffRenewChoice } from './staff';

export function isUserGame(state: GameState, g: ScheduledGame) {
  return g.home === state.user.teamId || g.away === state.user.teamId;
}

export function userGameToday(state: GameState): ScheduledGame | undefined {
  return state.schedule.find((g) => g.day === state.day && !g.played && isUserGame(state, g));
}

export function nextUserGame(state: GameState): ScheduledGame | undefined {
  return state.schedule.filter((g) => !g.played && isUserGame(state, g)).sort((a, b) => a.day - b.day)[0];
}

export function isRivalry(a: string, b: string) {
  return RIVALRIES.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
}

function gameScore(p: { pts: number; fgm: number; fga: number; fta: number; ftm: number; orb: number; drb: number; ast: number; stl: number; blk: number; tov: number; pf: number }) {
  return p.pts + 0.4 * p.fgm - 0.7 * p.fga - 0.4 * (p.fta - p.ftm) + 0.7 * p.orb + 0.3 * p.drb + p.stl + 0.7 * p.ast + 0.7 * p.blk - 0.4 * p.pf - p.tov;
}

export function simGame(state: GameState, g: ScheduledGame): BoxScore {
  const home = state.teams[g.home], away = state.teams[g.away];
  const rv = isRivalry(g.home, g.away);
  return simulateGame(simSetup(state, home), simSetup(state, away), {
    neutral: g.neutral, crowd: clamp(home.hype / 100 + (rv ? 0.25 : 0), 0, 1), tourney: g.type === 'ncaa',
  });
}

export function applyGameResult(state: GameState, g: ScheduledGame, box: BoxScore) {
  if (g.played) return;
  box.gameId = g.id;
  g.played = true;
  g.hs = box.hs; g.as = box.as; g.ot = box.ot; g.poss = box.poss;
  const home = state.teams[g.home], away = state.teams[g.away];
  const homeWon = box.hs > box.as;
  const isUser = isUserGame(state, g);
  const preSpread = spread(state, g.home, g.away, g.neutral);
  const preApH = home.apRank, preApA = away.apRank;

  for (const [t, won, pf, pa, side] of [[home, homeWon, box.hs, box.as, 'h'], [away, !homeWon, box.as, box.hs, 'a']] as const) {
    const r = t.record;
    if (won) r.w++; else r.l++;
    if (g.type === 'conf') { if (won) r.cw++; else r.cl++; }
    if (g.neutral) { if (won) r.nw++; else r.nl++; }
    else if (side === 'h') { if (won) r.hw++; else r.hl++; }
    else { if (won) r.aw++; else r.al++; }
    r.streak = won ? (r.streak > 0 ? r.streak + 1 : 1) : r.streak < 0 ? r.streak - 1 : -1;
    r.pf += pf; r.pa += pa; r.poss += box.poss;
    const coach = state.coaches[t.coachId];
    if (coach) { if (won) coach.careerW++; else coach.careerL++; }
    const big = !!(won ? (side === 'h' ? preApA : preApH) : (side === 'h' ? !preApA : !preApH) && t.apRank);
    updateHype(t, won, big || g.type === 'ncaa');
  }

  // player stats, morale, injuries
  let potg: { id: string; s: number } | null = null;
  const userInjuryMul = (state.staff ? staffEffects(state).injury : 1) * practiceMods(state).injury;
  box.players.forEach((side, i) => {
    const team = i === 0 ? home : away;
    const won = i === 0 ? homeWon : !homeWon;
    const roster = teamPlayers(state, team.id);
    // tick down injuries
    for (const p of roster) {
      if (p.injury) {
        p.injury.games--;
        if (p.injury.games <= 0) p.injury = null;
      }
    }
    const sorted = [...roster].filter((p) => !p.redshirting).sort((a, b) => b.ovr - a.ovr);
    for (const bp of side) {
      const p = state.players[bp.id];
      if (!p) continue;
      const s = p.stats;
      if (bp.min > 0 || bp.starter) s.gp++;
      if (bp.starter) { s.gs++; p.starts++; }
      s.min += bp.min; s.pts += bp.pts; s.fgm += bp.fgm; s.fga += bp.fga; s.tpm += bp.tpm; s.tpa += bp.tpa;
      s.ftm += bp.ftm; s.fta += bp.fta; s.orb += bp.orb; s.drb += bp.drb; s.ast += bp.ast; s.stl += bp.stl; s.blk += bp.blk; s.tov += bp.tov; s.pf += bp.pf;
      if (won) {
        const gs = gameScore(bp);
        if (!potg || gs > potg.s) potg = { id: bp.id, s: gs };
      }
      // injuries
      const risk = (bp.min / 40) * 0.0055 * (p.traits.includes('injuryProne') ? 2.5 : 1) * (team.id === state.user.teamId ? userInjuryMul : 1);
      if (!p.injury && rng.chance(risk)) {
        p.injury = randomInjury();
        injuryNews(state, p, team.id);
      }
      // playing-time morale
      const rank = sorted.findIndex((x) => x.id === p.id);
      const expMin = p.promise === 'star' ? 30 : p.promise === 'starter' ? 24 : rank < 5 ? 24 : rank < 8 ? 12 : rank < 10 ? 5 : 0;
      let dm = won ? 0.8 : -0.8;
      if (bp.min + 6 < expMin) dm -= (p.traits.includes('diva') ? 2.2 : 1.1) * (p.promise ? 1.8 : 1);
      else if (bp.min > expMin + 4) dm += 0.6;
      if (p.traits.includes('leader')) dm += 0.2;
      p.morale = clamp(p.morale + dm, 0, 100);
      if (bp.pts >= 35 && !isUser) {
        addNews(state, { kind: 'milestone', headline: `${p.first} ${p.last} erupts for ${bp.pts} as ${team.school} ${won ? 'wins' : 'falls'}`, body: `${p.first} ${p.last} (${team.school}) finished with ${statLine(bp)}.`, teams: [team.id], personId: p.id, personKind: 'player' });
      }
    }
  });
  if (potg) g.potg = (potg as { id: string }).id;

  // store box scores for notable games
  const notable = isUser || (preApH && preApA) || g.type === 'ncaa';
  if (notable) {
    if (!isUser) delete box.shots;
    state.boxScores[g.id] = box;
  }

  // news
  if (isUser) {
    gameRecapNews(state, g, box);
    userGameSocial(state, g, box);
    const user = state.teams[state.user.teamId];
    const userHome = g.home === user.id;
    const won = userHome ? homeWon : !homeWon;
    const opp = state.teams[userHome ? g.away : g.home];
    const oppRank = userHome ? preApA : preApH;
    const expectedMargin = userHome ? preSpread : -preSpread;
    // XP
    let xp = won ? 10 : 2;
    if (won && oppRank) xp += 10 + Math.max(0, 26 - oppRank);
    if (g.type === 'conf') xp += won ? 4 : 0;
    if (g.type === 'ncaa') xp += won ? 50 : 10;
    if (g.type === 'ctourn') xp += won ? 12 : 2;
    gainXp(state, xp);
    // job security drift
    const coach = state.coaches[state.user.coachId];
    const surprise = (won ? 1 : -1) * (won ? Math.max(0, -expectedMargin) : Math.max(0, expectedMargin));
    coach.jobSecurity = clamp(coach.jobSecurity + (won ? 0.4 : -0.5) + surprise * 0.08, 0, 100);
    // press conference
    const big = !!oppRank || !!isRivalry(g.home, g.away) || g.type !== 'nc' && g.type !== 'conf' || Math.abs(user.record.streak) >= 4 || (!won && expectedMargin > 6) || (won && expectedMargin < -5);
    if (state.settings.autoPress || big || rng.chance(0.3)) {
      state.user.press = postgamePresser(state, g, box);
    }
    state.user.moments.push({ kind: 'win', gameId: g.id, big: won && (!!oppRank || g.type === 'ncaa' || g.type === 'ctourn') });
    void opp;
  } else {
    upsetNews(state, g);
  }
}

/** Sim every unplayed game on the current day (optionally skipping the user's game) */
export function processDay(state: GameState, opts: { skipUser?: boolean } = {}) {
  const games = state.schedule.filter((g) => g.day === state.day && !g.played);
  for (const g of games) {
    if (opts.skipUser && isUserGame(state, g)) continue;
    const box = simGame(state, g);
    applyGameResult(state, g, box);
  }
  if (games.length) {
    if (state.phase === 'confTourney' || state.phase === 'ncaa') {
      advanceBrackets(state);
      tourneyNews(state);
    }
    computeRatings(state);
  }
}

function tourneyNews(state: GameState) {
  // conference champions crowned today
  for (const b of Object.values(state.confTourneys)) {
    const final = b.rounds[b.rounds.length - 1][0];
    if (b.champion && final.gameId && state.schedule.find((g) => g.id === final.gameId)?.day === state.day) {
      const t = state.teams[b.champion];
      addNews(state, { kind: 'feature', headline: `${t.school} wins the ${b.name}, punches ticket to the Big Dance`, body: `${t.school} (${t.record.w}-${t.record.l}) claimed the ${b.name} title${final.score ? ` with a ${Math.max(...final.score)}-${Math.min(...final.score)} win in the final` : ''}, earning an automatic bid to the NCAA Tournament.`, teams: [t.id], important: t.id === state.user.teamId });
      if (t.id === state.user.teamId) {
        state.user.moments.push({ kind: 'title', label: `${b.name} Champions`, teamId: t.id });
        gainXp(state, 120);
        const c = state.coaches[state.user.coachId];
        c.trophies.push({ season: state.season, kind: 'ctourn', label: `${b.name} Champion`, teamId: t.id });
      }
    }
  }
  if (state.ncaa && state.phase === 'ncaa') {
    const roundIdx = state.day - NCAA_FIRST;
    const roundName = NCAA_ROUND_NAMES[roundIdx];
    const games = state.ncaa.rounds[roundIdx] ?? [];
    const upsets = games.filter((g) => g.winner && g.seeds[0] != null && g.seeds[1] != null && (state.ncaa!.seeds[g.winner] ?? 0) - Math.min(g.seeds[0]!, g.seeds[1]!) >= 4);
    for (const g of upsets.slice(0, 3)) {
      const w = state.teams[g.winner!];
      const loserId = g.teams.find((x) => x !== g.winner)!;
      const l = state.teams[loserId];
      addNews(state, { kind: 'bracket', headline: `MADNESS: No. ${state.ncaa.seeds[w.id]} ${w.school} stuns No. ${state.ncaa.seeds[l.id]} ${l.school}`, body: `Brackets everywhere just took a hit. ${w.school} advances past ${l.school} in the ${roundName}${g.score ? `, ${Math.max(...g.score)}-${Math.min(...g.score)}` : ''}.`, teams: [w.id, l.id], important: true });
      addSocial(state, { handle: 'BracketBrad', name: 'Bracket Brad', verified: true, kind: 'analyst', text: `Only ${rng.int(2, 9)}% of brackets had ${w.school} winning that one. Chaos. 🔥🏀 #MarchMadness`, teamId: w.id });
    }
    if (state.ncaa.champion && roundIdx === 6) {
      const ch = state.teams[state.ncaa.champion];
      const final = state.ncaa.rounds[6][0];
      const ru = state.teams[final.teams.find((x) => x !== ch.id)!];
      addNews(state, { kind: 'feature', headline: `${ch.school.toUpperCase()} ARE NATIONAL CHAMPIONS`, body: `${ch.school} cut down the nets after beating ${ru.school}${final.score ? ` ${Math.max(...final.score)}-${Math.min(...final.score)}` : ''} in the national championship game. One Shining Moment.`, teams: [ch.id, ru.id], important: true });
      state.champions.push({ season: state.season, teamId: ch.id, runnerUp: ru.id, score: final.score ? `${Math.max(...final.score)}-${Math.min(...final.score)}` : '' });
      if (ch.id === state.user.teamId) state.user.moments.push({ kind: 'title', label: 'National Champions', teamId: ch.id });
    }
    // user eliminated?
    const userId = state.user.teamId;
    for (const g of games) {
      if (g.winner && g.teams.includes(userId) && g.winner !== userId) {
        addNews(state, { kind: 'user', headline: `${state.teams[userId].school}'s season ends in the ${roundName}`, body: `The run is over. ${state.teams[userId].school} finishes ${state.teams[userId].record.w}-${state.teams[userId].record.l} with a ${NCAA_EXIT_LABEL[roundIdx]} exit.`, teams: [userId], important: true });
      }
    }
  }
}

/** Weekly tasks: polls, recruiting, events, hours */
export function weeklyTick(state: GameState, week: number) {
  const inSeason = state.phase === 'regular' || state.phase === 'preseason';
  if (inSeason && state.day > 0 && state.day <= LAST_REG_DAY + 1) {
    const label = `AP Poll · Week ${week}`;
    const ranks = runPoll(state, label);
    pollNews(state, label, ranks);
  }
  // last week's practice
  weeklyPractice(state);
  // recruiting: decisions use the board exactly as the user left it this week,
  // then rivals put in next week's work and the board refreshes.
  const commits = decideRecruits(state, week);
  aiRecruitingWeek(state, week);
  refreshRecruitInterest(state);
  for (const r of commits) {
    commitNews(state, r, r.committed!);
    const userInvolved = r.schools.some((s) => s.teamId === state.user.teamId && s.offered);
    if (userInvolved || r.committed === state.user.teamId) {
      state.user.moments.push({ kind: 'commit', recruitId: r.id, teamId: r.committed!, others: [r.committed!, ...(userInvolved ? [state.user.teamId] : []), ...(r.decision?.odds.map((o) => o.teamId) ?? []), ...r.schools.map((s) => s.teamId)].filter((id, i, a) => a.indexOf(id) === i).slice(1, 4) });
      if (r.committed === state.user.teamId) gainXp(state, 10 + r.stars * 6);
    }
  }
  state.user.hoursMax = hoursForWeek(state);
  state.user.hours = state.user.hoursMax;
  // events & buzz
  if (state.phase === 'regular' || state.phase === 'preseason') maybeWeeklyEvent(state);
  if (rng.chance(0.7)) randomBuzz(state);
  // morale drift and follower growth
  const staffMorale = state.staff ? staffEffects(state).morale : 0;
  for (const p of Object.values(state.players)) {
    if (staffMorale && p.teamId === state.user.teamId) p.morale = clamp(p.morale + staffMorale, 0, 100);
    if (!p.teamId) continue;
    p.morale = clamp(p.morale + (65 - p.morale) * 0.04, 0, 100);
    if (p.teamId === state.user.teamId && !p.nil && p.ovr >= 55) p.morale = clamp(p.morale - 2, 0, 100);
    if (p.stats.gp) p.followers = Math.round(p.followers * (1 + Math.min(0.04, (p.stats.pts / p.stats.gp) * 0.0012)));
  }
}

/** Move to the next calendar day, handling transitions */
export function nextDay(state: GameState) {
  if (state.phase !== 'preseason' && state.phase !== 'regular' && state.phase !== 'confTourney' && state.phase !== 'selection' && state.phase !== 'ncaa') return;
  const prevWeek = state.calendar[state.day]?.week ?? 0;
  if (state.day >= NCAA_LAST) {
    beginSeasonEnd(state);
    return;
  }
  state.day++;
  state.phase = phaseForDay(state.day);
  const week = state.calendar[state.day]?.week ?? prevWeek;
  if (state.day === CT_FIRST) {
    setupConfTourneys(state);
    addNews(state, { kind: 'feature', headline: 'Championship Week is here', body: 'Thirty-two conference tournaments. Thirty-two automatic bids. Bubble teams, start sweating.', teams: [], important: true });
  }
  if (state.day === SELECTION_DAY) {
    computeRatings(state);
    const ranks = runPoll(state, 'AP Poll · Final Regular Season');
    pollNews(state, 'Final regular-season AP Poll', ranks);
    const field = buildNcaa(state);
    const user = field.find((e) => e.teamId === state.user.teamId);
    const ones = field.filter((e) => e.seed === 1).map((e) => state.teams[e.teamId].school);
    // the Selection Sunday show plays first; its presser follows when the show ends
    state.user.moments.push({ kind: 'selection', season: state.season, press: selectionPresser(state, field) });
    addNews(state, { kind: 'bracket', headline: `The field of 68 is set — ${ones.join(', ')} earn No. 1 seeds`, body: `Selection Sunday delivered drama as the committee revealed the bracket. ${user ? `${state.teams[state.user.teamId].school} is in as a No. ${user.seed} seed in the ${['East', 'West', 'South', 'Midwest'][user.region]} Region.` : `${state.teams[state.user.teamId].school} was left out of the field.`}`, teams: field.slice(0, 4).map((e) => e.teamId), important: true });
  }
  if (week > prevWeek) weeklyTick(state, week);
}

/** Resolve an inbox decision */
export function resolveInbox(state: GameState, id: string, choiceIdx: number): string {
  const item = state.inbox.find((i) => i.id === id);
  if (!item || item.resolved) return '';
  const ch = item.choices[choiceIdx] as InboxChoice & { redshirt?: string; autoNil?: boolean };
  item.resolved = true;
  item.chosen = choiceIdx;
  applyEffects(state, ch.effects, item.personId);
  if (ch.autoNil) autoSignUnsigned(state);
  if (ch.staffPoach) resolvePoach(state, ch.staffPoach.staffId, ch.staffPoach.teamId, ch.staffPoach.keep);
  if (ch.staffRenew != null) applyStaffRenewChoice(state, ch.staffRenew);
  if (ch.redshirt) {
    const p = state.players[ch.redshirt];
    if (p) p.redshirting = true;
  }
  return ch.result ?? 'Done.';
}

export function answerPress(state: GameState, qIdx: number, aIdx: number) {
  const pc = state.user.press;
  if (!pc) return;
  const a = pc.questions[qIdx]?.answers[aIdx];
  if (a) { applyEffects(state, a.effects); recordClaim(state, pc, a); }
}

export function refreshAllPower(state: GameState) {
  for (const t of Object.values(state.teams)) refreshPower(state, t);
}

export function playerPerGame(p: Player) {
  const g = Math.max(1, p.stats.gp);
  return {
    ppg: p.stats.pts / g, rpg: (p.stats.orb + p.stats.drb) / g, apg: p.stats.ast / g, spg: p.stats.stl / g, bpg: p.stats.blk / g, mpg: p.stats.min / g,
    fgp: p.stats.fga ? p.stats.fgm / p.stats.fga : 0, tpp: p.stats.tpa ? p.stats.tpm / p.stats.tpa : 0, ftp: p.stats.fta ? p.stats.ftm / p.stats.fta : 0,
  };
}
