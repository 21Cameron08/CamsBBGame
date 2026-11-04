// End of season → awards, carousel, declarations, portal, signing, draft, progression, new season.
import { rng, clamp } from './rng';
import type { Award, GameState, Player, PortalOffer, Team, TeamSeasonHistory, Coach } from './types';
import { teamPlayers, assignNumbers, autoStrategy, emptyRecord, nilBudgetFor, refreshPower, ROSTER_MAX, ROSTER_MIN, confTierOf } from './team';
import { confStandings, computeRatings, runPoll } from './rankings';
import { ncaaResult } from './postseason';
import { addNews, addSocial, INSIDERS, signingNews } from './media';
import { achievedLevel, gainXp, genAICoach, setExpectations, hoursForWeek } from './coach';
import { advanceClass, developPlayer, draftScore, genPlayer, nilValue, recruitToPlayer, roundMoney, emptyStats, fmtMoney } from './player';
import { allocateAiNil, playerValue, nilSatisfaction } from './nil';
import { buildCalendar, seasonLabel } from './calendar';
import { generateSchedule } from './schedule';
import { generateClass, seedInterest, seedUserBoard, signingDayDecisions, teamAppeal } from './recruiting';
import { introPresser, mediaDayPresser, seasonEndPresser, pressSeasonEnd, pressOffseasonRecap } from './press';
import { NBA_TEAMS } from '../data/names';
import { milesBetween } from '../data/places';
import { staffEffects, maybePoachStaff, finalizePoaching, staffSeasonEnd, staffNewSeason, staffFollowCoach } from './staff';
import { openScheduling, lockScheduling, applyScheduleEffects } from './scheduling';
import { openPortal, advancePortalDay } from './portal';
import { beginSummer, summerDone, runSummer, evaluateGoals, devNewSeason } from './development';
import { recordSeasonEnd, trackProgram } from './records';
import { seasonInstallReset, resetPlaybook } from './schemes';
import { retireJerseys, jerseyNights } from './legacy';

const NCAA_BONUS: Record<string, number> = { Champion: 30, 'Runner-up': 22, 'Final Four': 18, 'Elite Eight': 12, 'Sweet 16': 8, 'Round of 32': 4, 'Round of 64': 1, 'First Four': 0.5 };

function playerScore(p: Player): number {
  const g = Math.max(1, p.stats.gp);
  const s = p.stats;
  return (s.pts + (s.orb + s.drb) * 0.8 + s.ast * 1.1 + s.stl * 1.6 + s.blk * 1.4 - s.tov * 0.9 - (s.fga - s.fgm) * 0.45 - (s.fta - s.ftm) * 0.3) / g;
}

export function computeAwards(state: GameState): Award[] {
  const awards: Award[] = [];
  const all = Object.values(state.players).filter((p) => p.teamId && p.stats.gp >= 15);
  const teamBonus = (p: Player) => {
    const t = state.teams[p.teamId!];
    return t.rating * 0.12 + (t.apRank ? (26 - t.apRank) * 0.06 : 0);
  };
  const ranked = [...all].sort((a, b) => playerScore(b) + teamBonus(b) - (playerScore(a) + teamBonus(a)));
  const add = (name: string, p: Player) => {
    awards.push({ season: state.season, name, playerId: p.id, teamId: p.teamId!, who: `${p.first} ${p.last}` });
    p.awards.push(`${name} (${seasonLabel(state.season)})`);
  };
  if (ranked[0]) add('National Player of the Year', ranked[0]);
  ranked.slice(0, 5).forEach((p) => add('All-American First Team', p));
  ranked.slice(5, 10).forEach((p) => add('All-American Second Team', p));
  ranked.slice(10, 15).forEach((p) => add('All-American Third Team', p));
  const fr = ranked.find((p) => p.cls === 'FR');
  if (fr) add('Freshman of the Year', fr);
  const dpoy = [...all].sort((a, b) => (b.stats.stl * 1.5 + b.stats.blk * 1.6 + b.ratings.perD * 0.15 + b.ratings.intD * 0.15) / 1 - (a.stats.stl * 1.5 + a.stats.blk * 1.6 + a.ratings.perD * 0.15 + a.ratings.intD * 0.15))[0];
  if (dpoy) add('Defensive Player of the Year', dpoy);
  // Coach of the year: biggest overachiever
  const teams = Object.values(state.teams);
  const coy = [...teams].sort((a, b) => (b.record.w - b.record.l) * 0.6 + (b.rating - (b.power - 65) * 1.15) - ((a.record.w - a.record.l) * 0.6 + (a.rating - (a.power - 65) * 1.15)))[0];
  if (coy) {
    const cc = state.coaches[coy.coachId];
    awards.push({ season: state.season, name: 'Coach of the Year', coachId: coy.coachId, teamId: coy.id, who: cc ? `${cc.first} ${cc.last}` : undefined });
  }
  // Conference POY for each conference
  for (const c of state.conferences) {
    const best = ranked.find((p) => state.teams[p.teamId!].conf === c.id);
    if (best) add(`${c.short} Player of the Year`, best);
  }
  // Most Outstanding Player of the Final Four (champion's best)
  if (state.ncaa?.champion) {
    const champs = teamPlayers(state, state.ncaa.champion).sort((a, b) => playerScore(b) - playerScore(a));
    if (champs[0]) add('Final Four Most Outstanding Player', champs[0]);
  }
  return awards;
}

function finalPoll(state: GameState) {
  for (const t of Object.values(state.teams)) {
    const res = ncaaResult(state, t.id);
    t.pollScore = (t.pollScore || 0) + (NCAA_BONUS[res] ?? 0) * 0.9;
  }
  const ranked = Object.values(state.teams).sort((a, b) => b.pollScore - a.pollScore);
  if (state.ncaa?.champion) {
    const ch = ranked.findIndex((t) => t.id === state.ncaa!.champion);
    if (ch > 0) ranked.unshift(ranked.splice(ch, 1)[0]);
  }
  for (const t of Object.values(state.teams)) { t.prevApRank = t.apRank; t.apRank = null; }
  ranked.slice(0, 25).forEach((t, i) => (t.apRank = i + 1));
  state.polls.push({ day: state.day, week: 99, ranks: ranked.slice(0, 25).map((t) => t.id), label: 'Final AP Poll' });
}

export function beginSeasonEnd(state: GameState) {
  state.phase = 'seasonEnd';
  computeRatings(state);
  finalPoll(state);
  const awards = computeAwards(state);
  state.awards.push(...awards);
  const user = state.teams[state.user.teamId];
  const coach = state.coaches[state.user.coachId];

  // histories + career lines + prestige
  const confChamps: Record<string, string> = {};
  const confFinish: Record<string, number> = {};
  for (const c of state.conferences) {
    const st = confStandings(state, c.id);
    if (st[0]) confChamps[c.id] = st[0].id;
    st.forEach((t, i) => (confFinish[t.id] = i + 1));
  }
  for (const t of Object.values(state.teams)) {
    const res = ncaaResult(state, t.id);
    const h: TeamSeasonHistory = {
      season: state.season, w: t.record.w, l: t.record.l, cw: t.record.cw, cl: t.record.cl,
      confFinish: confFinish[t.id] ?? 0, confChamp: confChamps[t.conf] === t.id,
      confTourneyChamp: state.confTourneys[t.conf]?.champion === t.id,
      ncaaSeed: state.ncaa?.seeds[t.id] ?? null, postseason: res, apFinal: t.apRank, coachId: t.coachId, rating: t.rating,
    };
    t.history.push(h);
    const perf = clamp(50 + t.rating * 1.6 + (NCAA_BONUS[res] ?? 0), 0, 100);
    t.prestige = Math.round(clamp(t.prestige + (perf - t.prestige) * 0.1, 1, 99) * 10) / 10;
    const c = state.coaches[t.coachId];
    if (c) c.career.push({ season: state.season, teamId: t.id, w: t.record.w, l: t.record.l, cw: t.record.cw, cl: t.record.cl, postseason: res, seed: h.ncaaSeed });
  }
  for (const p of Object.values(state.players)) {
    if (!p.teamId || p.stats.gp === 0) continue;
    p.career.push({ ...p.stats, season: state.season, teamId: p.teamId, cls: p.cls, ovr: p.ovr });
  }
  recordSeasonEnd(state);

  // user evaluation
  const uh = user.history[user.history.length - 1];
  const confSize = state.conferences.find((c) => c.id === user.conf) ? confStandings(state, user.conf).length : 10;
  const achieved = achievedLevel(state, user, uh.confFinish, confSize, uh.confChamp || uh.confTourneyChamp, uh.postseason);
  const diff = achieved - state.user.expectationLevel;
  const secDelta = Math.round(diff * 9 + (user.record.w - user.record.l) * 0.3);
  coach.jobSecurity = clamp(coach.jobSecurity + secDelta, 0, 100);
  coach.reputation = clamp(coach.reputation + diff * 3 + (NCAA_BONUS[uh.postseason] ?? 0) * 0.25, 0, 100);
  coach.contractYears = Math.max(0, coach.contractYears - 1);
  gainXp(state, 60 + Math.max(0, diff) * 60 + (NCAA_BONUS[uh.postseason] ?? 0) * 8);
  const trophy = (kind: Coach['trophies'][number]['kind'], label: string) => coach.trophies.push({ season: state.season, kind, label, teamId: user.id });
  if (uh.postseason === 'Champion') trophy('natl', 'National Champion');
  else if (uh.postseason === 'Runner-up' || uh.postseason === 'Final Four') trophy('f4', 'Final Four');
  else if (uh.postseason === 'Elite Eight') trophy('e8', 'Elite Eight');
  else if (uh.postseason === 'Sweet 16') trophy('s16', 'Sweet 16');
  if (uh.confChamp) trophy('conf', `${state.conferences.find((c) => c.id === user.conf)?.short} Regular Season Champion`);
  const coyAward = awards.find((a) => a.name === 'Coach of the Year');
  if (coyAward?.coachId === coach.id) trophy('coy', 'National Coach of the Year');

  let fired = false;
  const seasonsAtSchool = coach.career.filter((c) => c.teamId === user.id).length;
  if (coach.jobSecurity < 12 && seasonsAtSchool >= 2) fired = true;
  if (coach.jobSecurity < 4) fired = true;
  if (state.settings.difficulty === 'rookie' && seasonsAtSchool < 3) fired = false;
  if (!fired && diff >= 1 && coach.contractYears <= 2) {
    coach.contractYears += 3;
    coach.salary = Math.round(coach.salary * 1.25 / 10000) * 10000;
  }
  const summary = `${user.school} finished ${user.record.w}-${user.record.l} (${user.record.cw}-${user.record.cl} conf, ${ordinal(uh.confFinish)} place)${uh.postseason ? ` — ${uh.postseason}` : ''}${uh.ncaaSeed ? ` as a No. ${uh.ncaaSeed} seed` : ''}. Goal: ${state.user.expectation}.`;

  // coaching carousel
  const carousel = runCarousel(state);
  state.user.fired = fired;
  state.user.offers = jobOffers(state, fired);
  if (fired) {
    state.user.moments.push({ kind: 'fired' });
    addNews(state, { kind: 'coach', headline: `${user.school} parts ways with ${coach.first} ${coach.last}`, body: `After ${seasonsAtSchool} season${seasonsAtSchool > 1 ? 's' : ''}, ${user.school} has fired head coach ${coach.first} ${coach.last}. The search begins immediately.`, teams: [user.id], important: true, personId: coach.id, personKind: 'coach' });
  }
  state.offseason = { graduating: [], declared: [], progression: {}, signed: [], carousel, summary, achieved, securityDelta: secDelta };
  staffSeasonEnd(state);
  evaluateGoals(state, achieved);
  pressSeasonEnd(state, achieved);
  state.user.press = fired ? null : seasonEndPresser(state, summary);
  for (const a of awards.filter((x) => x.name === 'National Player of the Year' || x.name === 'Coach of the Year' || x.name.startsWith('All-American First'))) {
    const t = state.teams[a.teamId];
    const who = a.playerId ? state.players[a.playerId] : a.coachId ? state.coaches[a.coachId] : null;
    if (!who) continue;
    if (a.name === 'All-American First Team' && a.teamId !== user.id) continue;
    addNews(state, { kind: 'award', headline: `${who.first} ${who.last} (${t.school}) named ${a.name}`, body: `${who.first} ${who.last} of ${t.school} has been named ${a.name} for the ${seasonLabel(state.season)} season.`, teams: [t.id], important: a.teamId === user.id || a.name === 'National Player of the Year', personId: who.id, personKind: a.playerId ? 'player' : 'coach' });
    if (a.teamId === user.id) state.user.moments.push({ kind: 'award', label: a.name, personId: who.id });
  }
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function runCarousel(state: GameState): string[] {
  const lines: string[] = [];
  const vacancies: Team[] = [];
  for (const t of Object.values(state.teams)) {
    if (t.id === state.user.teamId) continue;
    const c = state.coaches[t.coachId];
    if (!c) { vacancies.push(t); continue; }
    c.age++;
    const recent = t.history.slice(-3);
    const expected = t.prestige;
    const perf = recent.reduce((s, h) => s + clamp(50 + h.rating * 1.6 + (NCAA_BONUS[h.postseason] ?? 0), 0, 100), 0) / Math.max(1, recent.length);
    const gap = expected - perf;
    let pFire = gap > 12 ? 0.12 + (gap - 12) * 0.02 : 0;
    if (recent.length < 2) pFire *= 0.3;
    const retire = c.age >= 66 && rng.chance(0.25 + (c.age - 66) * 0.08);
    if (retire || rng.chance(clamp(pFire, 0, 0.6))) {
      lines.push(retire ? `${c.first} ${c.last} retires from ${t.school}` : `${t.school} fires ${c.first} ${c.last}`);
      if (t.prestige >= 50 || retire) addNews(state, { kind: 'coach', headline: retire ? `${t.school}'s ${c.first} ${c.last} announces retirement` : `${t.school} fires head coach ${c.first} ${c.last}`, body: retire ? `After a long career, ${c.first} ${c.last} is stepping away.` : `${t.school} is making a change after ${recent.map((h) => `${h.w}-${h.l}`).join(', ')} the past ${recent.length} seasons.`, teams: [t.id], personId: c.id, personKind: 'coach' });
      c.teamId = null;
      t.coachId = '';
      t.coachChange = true;
      vacancies.push(t);
    }
  }
  // fill vacancies: best performers from lower programs move up
  vacancies.sort((a, b) => b.prestige - a.prestige);
  for (const t of vacancies) {
    if (t.id === state.user.teamId) continue;
    maybePoachStaff(state, t.id);
    const candidates = Object.values(state.coaches).filter((c) => c.teamId && !c.isUser && state.teams[c.teamId].prestige < t.prestige - 8 && c.reputation >= t.prestige * 0.75);
    let hire: Coach | undefined;
    if (candidates.length && rng.chance(0.7)) {
      hire = candidates.sort((a, b) => b.reputation + rng.normal(0, 6) - a.reputation)[0];
      const old = state.teams[hire.teamId!];
      old.coachId = '';
      old.coachChange = true;
      lines.push(`${t.school} hires ${hire.first} ${hire.last} away from ${old.school}`);
      if (t.prestige >= 45) addNews(state, { kind: 'coach', headline: `${t.school} hires ${old.school}'s ${hire.first} ${hire.last}`, body: `${hire.first} ${hire.last} (${hire.careerW}-${hire.careerL} career) leaves ${old.school} for ${t.school}.`, teams: [t.id, old.id], personId: hire.id, personKind: 'coach' });
      vacancies.push(old);
    } else {
      hire = genAICoach(t.prestige, t.id);
      state.coaches[hire.id] = hire;
      lines.push(`${t.school} hires ${hire.first} ${hire.last}`);
    }
    hire.teamId = t.id;
    t.coachId = hire.id;
    hire.jobSecurity = 70;
    hire.contractYears = rng.int(4, 6);
  }
  // fill any team still lacking coach
  for (const t of Object.values(state.teams)) {
    if (!t.coachId && t.id !== state.user.teamId) {
      const c = genAICoach(t.prestige, t.id);
      state.coaches[c.id] = c;
      t.coachId = c.id;
    }
  }
  // purge unemployed AI coaches
  for (const [id, c] of Object.entries(state.coaches)) if (!c.teamId && !c.isUser) delete state.coaches[id];
  return lines;
}

function jobOffers(state: GameState, fired: boolean) {
  const coach = state.coaches[state.user.coachId];
  const user = state.teams[state.user.teamId];
  const changed = Object.values(state.teams).filter((t) => t.coachChange && t.id !== user.id);
  const maxPrestige = coach.reputation + 12;
  let pool = changed.filter((t) => t.prestige <= maxPrestige && (fired || t.prestige > user.prestige - 5));
  if (fired && pool.length < 2) {
    pool = Object.values(state.teams).filter((t) => t.id !== user.id && t.prestige < Math.max(25, coach.reputation - 10)).sort(() => rng.next() - 0.5).slice(0, 3);
  }
  return pool.sort((a, b) => b.prestige - a.prestige).slice(0, 3).map((t) => ({
    teamId: t.id,
    salary: Math.round((200000 + Math.exp(t.prestige * 0.05) * 32000) / 10000) * 10000,
    years: rng.int(4, 6),
    pitch: rng.pick([
      `${t.school} wants a coach who can restore the program. The AD promises full support and a bigger NIL push.`,
      `A fresh start at ${t.school}. The fan base is starving for a winner.`,
      `${t.school}'s boosters have pooled money for a new collective. They want you to lead it.`,
    ]),
  }));
}

/** User accepts a job at another school */
export function takeJob(state: GameState, teamId: string) {
  const coach = state.coaches[state.user.coachId];
  const old = state.teams[state.user.teamId];
  const wasFired = state.user.fired;
  const nu = state.teams[teamId];
  const offer = state.user.offers.find((o) => o.teamId === teamId);
  // old team gets new AI coach
  const repl = genAICoach(old.prestige, old.id);
  state.coaches[repl.id] = repl;
  old.coachId = repl.id;
  old.coachChange = true;
  // displaced coach at new team
  const prev = state.coaches[nu.coachId];
  if (prev && !prev.isUser) delete state.coaches[prev.id];
  nu.coachId = coach.id;
  nu.coachChange = true;
  coach.teamId = nu.id;
  coach.jobSecurity = 70;
  if (offer) { coach.salary = offer.salary; coach.contractYears = offer.years; }
  state.user.teamId = nu.id;
  staffFollowCoach(state, nu.id, old.school);
  if (state.scheduling) state.scheduling.obligations = []; // old school's series stay with the old school
  state.user.fired = false;
  state.user.offers = [];
  state.user.board = [];
  for (const r of Object.values(state.recruits)) r.userPromise = null;
  addNews(state, { kind: 'coach', headline: `${nu.school} hires ${coach.first} ${coach.last}`, body: `${coach.first} ${coach.last} leaves ${old.school} to take over at ${nu.school}.`, teams: [nu.id, old.id], important: true, personId: coach.id, personKind: 'coach' });
  state.user.moments.push({ kind: 'title', label: `New Job: ${nu.school}`, teamId: nu.id });
  trackProgram(state, nu.id);
  resetPlaybook(state);
  state.user.press = introPresser(state, { fromTeamId: old.id, fired: wasFired });
}

// ---------------- Declarations ----------------
export function doDeclarations(state: GameState) {
  finalizePoaching(state);
  state.phase = 'declarations';
  const os = state.offseason!;
  const players = Object.values(state.players).filter((p) => p.teamId);
  const ranked = players.map((p) => ({ p, s: draftScore(p) })).sort((a, b) => b.s - a.s);
  ranked.forEach(({ p }, i) => (p.draftStock = i < 100 ? i + 1 : 0));
  for (const p of players) {
    const exhausted = p.elig <= 1 && !p.redshirting;
    const pick = p.draftStock ?? 0;
    if (exhausted) { os.graduating.push(p.id); continue; }
    if (pick > 0 && pick <= 60) {
      const prob = pick <= 10 ? 0.95 : pick <= 20 ? 0.8 : pick <= 35 ? 0.45 : 0.15;
      if (rng.chance(prob * (p.traits.includes('loyal') ? 0.7 : 1) * (nilSatisfaction(state, p) > 1.2 ? 0.75 : 1))) os.declared.push(p.id);
    }
  }
  retireJerseys(state, [...os.graduating, ...os.declared]);
  // news
  for (const id of os.declared.slice(0, 200)) {
    const p = state.players[id];
    const t = state.teams[p.teamId!];
    if ((p.draftStock ?? 99) <= 15 || p.teamId === state.user.teamId) {
      addNews(state, { kind: 'draft', headline: `${t.school}'s ${p.first} ${p.last} declares for the NBA Draft`, body: `${p.first} ${p.last} (${p.cls}, ${p.pos}) is projected as a ${p.draftStock && p.draftStock <= 14 ? 'lottery pick' : p.draftStock && p.draftStock <= 30 ? 'first-round pick' : 'second-round pick'}.`, teams: [t.id], important: p.teamId === state.user.teamId, personId: p.id, personKind: 'player' });
    }
  }
}

function removeFromTeam(state: GameState, p: Player, note: string) {
  if (p.teamId) {
    const t = state.teams[p.teamId];
    if (t) t.roster = t.roster.filter((id) => id !== p.id);
  }
  p.history.push(note);
  p.teamId = null;
}

// ---------------- Portal ----------------
// The transfer portal lives in ./portal.ts (Portal 2.0: day-by-day window).

// ---------------- Signing ----------------
export function doSigning(state: GameState) {
  state.phase = 'signing';
  const os = state.offseason!;
  const recruits = Object.values(state.recruits).sort((a, b) => a.rank - b.rank);
  const roomFor = (teamId: string) => ROSTER_MAX - state.teams[teamId].roster.length;
  // Late signees: uncommitted recruits with offers decide, using the same odds as the season
  for (const r of signingDayDecisions(state, roomFor)) signingNews(state, r);
  for (const r of recruits) {
    if (r.committed) continue;
    if (r.stars <= 2 && rng.chance(0.6)) {
      const candidates = Object.values(state.teams).filter((t) => roomFor(t.id) > 1 && t.prestige < r.stars * 20 + 15);
      if (candidates.length) r.committed = rng.pick(candidates).id;
    }
  }
  for (const r of recruits) {
    if (!r.committed) { delete state.recruits[r.id]; continue; }
    const t = state.teams[r.committed];
    // AI programs drop overflow commits; the user's signees always make it (the roster trim below makes room)
    if (!t || (roomFor(t.id) <= 0 && t.id !== state.user.teamId)) { delete state.recruits[r.id]; continue; }
    const p = recruitToPlayer(r, t.id);
    const s = r.schools.find((x) => x.teamId === t.id);
    p.nil = { amount: s?.nilOffer ?? roundMoney(nilValue(p, t.market) * 0.6), years: 2 };
    p.history.push(`Signed with ${t.school} (Class of ${r.classYear}, No. ${r.rank} overall)`);
    state.players[p.id] = p;
    t.roster.push(p.id);
    if (t.id === state.user.teamId) os.signed.push(p.id);
    delete state.recruits[r.id];
  }
  // fill & trim rosters
  for (const t of Object.values(state.teams)) {
    while (t.roster.length < ROSTER_MIN) {
      const lvl = 44 + t.prestige * 0.18 + rng.normal(0, 3);
      const p = genPlayer({ ovr: Math.round(lvl), cls: 'FR', teamId: t.id, stars: rng.chance(0.5) ? 1 : 2 });
      p.history.push(`Walk-on at ${t.school}`);
      p.nil = { amount: 0, years: 1 };
      state.players[p.id] = p;
      t.roster.push(p.id);
    }
    const all = teamPlayers(state, t.id);
    if (all.length > ROSTER_MAX) {
      const isUser = t.id === state.user.teamId;
      const keep = new Set(isUser ? os.signed : []);
      const cut = all.filter((p) => !keep.has(p.id)).sort((a, b) => a.ovr - b.ovr).slice(0, all.length - ROSTER_MAX);
      if (isUser && cut.length) addNews(state, { kind: 'user', headline: `Roster crunch: ${t.school} releases ${cut.map((p) => `${p.first} ${p.last}`).join(', ')}`, body: `With the signing class arriving and only ${ROSTER_MAX} scholarships, ${t.school} let ${cut.length > 1 ? 'its lowest-rated players' : 'its lowest-rated player'} go to make room.`, teams: [t.id], important: true });
      for (const p of cut) { removeFromTeam(state, p, 'Released'); delete state.players[p.id]; }
    }
    assignNumbers(state, t);
  }
}

// ---------------- Draft ----------------
export function doDraft(state: GameState) {
  state.phase = 'draft';
  const os = state.offseason!;
  const seniors = os.graduating.map((id) => state.players[id]).filter(Boolean).sort((a, b) => draftScore(b) - draftScore(a)).slice(0, 90);
  const pool = [...os.declared.map((id) => state.players[id]).filter(Boolean), ...seniors];
  const scored = pool.map((p) => ({ p, s: draftScore(p) + rng.normal(0, 2.2) })).sort((a, b) => b.s - a.s);
  const order = rng.shuffle([...NBA_TEAMS]);
  const picks = scored.slice(0, 58);
  // a couple of international picks sprinkled in
  let pickNo = 1;
  for (const { p } of picks) {
    if (pickNo === 9 || pickNo === 37) pickNo++; // international prospects
    const teamId = p.career.length ? p.career[p.career.length - 1].teamId : '';
    state.draft.push({ season: state.season + 1, pick: pickNo, round: pickNo <= 30 ? 1 : 2, playerId: p.id, name: `${p.first} ${p.last}`, teamId, nbaTeam: order[(pickNo - 1) % 30], pos: p.pos });
    p.history.push(`Drafted No. ${pickNo} overall by ${order[(pickNo - 1) % 30]} (${state.season + 1})`);
    if (teamId) {
      const t = state.teams[teamId];
      if (t) t.prestige = clamp(t.prestige + (pickNo <= 14 ? 0.8 : pickNo <= 30 ? 0.4 : 0.15), 1, 99);
      if (teamId === state.user.teamId) {
        gainXp(state, pickNo <= 14 ? 120 : pickNo <= 30 ? 70 : 30);
        state.coaches[state.user.coachId].reputation = clamp(state.coaches[state.user.coachId].reputation + (pickNo <= 30 ? 2 : 1), 0, 100);
      }
    }
    if (pickNo <= 5 || teamId === state.user.teamId) {
      addNews(state, { kind: 'draft', headline: `${order[(pickNo - 1) % 30]} select ${p.first} ${p.last} at No. ${pickNo}`, body: `${p.first} ${p.last} (${state.teams[teamId]?.school ?? 'college'}) goes ${pickNo <= 30 ? 'in the first round' : 'in the second round'} of the NBA Draft.`, teams: teamId ? [teamId] : [], important: teamId === state.user.teamId, personId: p.id, personKind: 'player' });
    }
    pickNo++;
  }
  // purge everyone no longer on a team (keeps saves small)
  for (const [id, p] of Object.entries(state.players)) if (!p.teamId) delete state.players[id];
}

// ---------------- Progression ----------------
export function doProgression(state: GameState) {
  state.phase = 'progression';
  const os = state.offseason!;
  for (const t of Object.values(state.teams)) {
    const coach = state.coaches[t.coachId];
    const dev = (coach ? coach.skills.development : 4) + (t.id === state.user.teamId ? staffEffects(state).dev : 0);
    for (const p of teamPlayers(state, t.id)) {
      const share = p.stats.gp ? p.stats.min / Math.max(1, p.stats.gp) / 30 : 0.2;
      const isNewcomer = p.career.length === 0 && p.cls === 'FR' && p.stats.gp === 0;
      const d = isNewcomer ? 0 : developPlayer(p, dev, share);
      if (!isNewcomer) advanceClass(p);
      if (t.id === state.user.teamId) os.progression[p.id] = d;
    }
  }
}

// ---------------- New season ----------------
export function newSeason(state: GameState) {
  pressOffseasonRecap(state);
  state.season++;
  state.day = 0;
  state.phase = 'preseason';
  state.calendar = buildCalendar(state.season);
  state.confTourneys = {};
  state.ncaa = null;
  state.portal = null;
  state.boxScores = {};
  state.polls = [];
  state.schedule = [];
  state.news = state.news.slice(0, 150);
  state.social = state.social.slice(0, 100);
  jerseyNights(state);
  state.inbox = state.inbox.filter((i) => !i.resolved).slice(0, 10);
  for (const c of Object.values(state.coaches)) if (!c.isUser) c.contractYears = Math.max(0, c.contractYears - 1);
  const ucoach = state.coaches[state.user.coachId];
  ucoach.age++;
  for (const t of Object.values(state.teams)) {
    t.record = emptyRecord();
    t.apRank = null; t.prevApRank = null; t.pollScore = 0; t.srs = 0; t.wab = 0;
    t.coachChange = false;
    const conf = state.conferences.find((c) => c.id === t.conf);
    const coach = state.coaches[t.coachId];
    t.nilBudget = Math.round(nilBudgetFor(t, conf, t.hype) * (1 + (coach?.skills.nil ?? 3) * 0.03) * (t.id === state.user.teamId ? staffEffects(state).nilMul : 1));
    t.hype = clamp(t.hype * 0.7 + 15, 5, 100);
    for (const p of teamPlayers(state, t.id)) {
      p.stats = emptyStats();
      p.starts = 0;
      p.draftStock = undefined;
      if (p.nil) { p.nil.years--; if (p.nil.years <= 0) p.nil = t.id === state.user.teamId ? null : p.nil; }
    }
    if (t.id !== state.user.teamId) {
      allocateAiNil(state, t);
      t.strategy = autoStrategy(teamPlayers(state, t.id), coach);
    } else {
      t.strategy.starters = t.strategy.starters.filter((id) => t.roster.includes(id));
      if (t.strategy.starters.length !== 5) t.strategy.starters = [];
    }
    refreshPower(state, t);
  }
  state.offseason = null;
  finalizePoaching(state);
  staffNewSeason(state);
  state.schedule = generateSchedule(state);
  // new recruiting class
  for (const r of generateClass(state, state.season + 1)) state.recruits[r.id] = r;
  computeRatings(state);
  applyScheduleEffects(state);
  seedInterest(state);
  state.user.board = [];
  seedUserBoard(state);
  const ranks = runPoll(state, 'Preseason AP Poll');
  setExpectations(state);
  devNewSeason(state);
  seasonInstallReset(state);
  state.user.hoursMax = hoursForWeek(state);
  state.user.hours = state.user.hoursMax;
  state.user.press = mediaDayPresser(state);
  const user = state.teams[state.user.teamId];
  const unsigned = teamPlayers(state, user.id).filter((p) => !p.nil);
  addNews(state, { kind: 'rank', headline: `Preseason AP Poll: ${state.teams[ranks[0]].school} opens at No. 1`, body: `The ${seasonLabel(state.season)} season tips off soon. ${user.apRank ? `${user.school} is ranked No. ${user.apRank}.` : `${user.school} is unranked to start the year.`}`, teams: ranks.slice(0, 5), important: true });
  if (unsigned.length) {
    state.inbox.unshift({
      id: `nil${state.season}`, day: 0, season: state.season, from: 'Collective Director', fromRole: 'NIL Collective', resolved: false, priority: true,
      subject: `${unsigned.length} player${unsigned.length > 1 ? 's' : ''} need NIL deals`,
      body: `${unsigned.map((p) => `${p.first} ${p.last}`).join(', ')} ${unsigned.length > 1 ? 'are' : 'is'} without an NIL agreement for ${seasonLabel(state.season)}. Head to the NIL Office to get them signed — unpaid players lose morale fast.`,
      choices: [{ label: 'On it — I’ll handle it in the NIL Office.', effects: [] }, { label: 'Have the collective auto-sign everyone at market value', hint: 'Signs unsigned players, best first, within budget', effects: [], result: 'The collective director got to work.' }],
    });
    (state.inbox[0].choices[1] as { autoNil?: boolean }).autoNil = true;
  }
}

/** Advance whichever offseason step we're in */
export function advanceOffseason(state: GameState) {
  switch (state.phase) {
    case 'seasonEnd': doDeclarations(state); break;
    case 'declarations': openPortal(state); break;
    case 'portal': if (advancePortalDay(state) === 'closed') doSigning(state); break;
    case 'signing': doDraft(state); break;
    case 'draft': beginSummer(state); break;
    case 'progression': if (!summerDone(state)) runSummer(state); else openScheduling(state); break;
    case 'scheduling': lockScheduling(state); newSeason(state); break;
    default: break;
  }
}

export function teamTier(state: GameState, t: Team) { return confTierOf(state, t); }
export { teamAppeal };
