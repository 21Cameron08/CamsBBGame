// Full-season smoke test: `npm run season:test`
import { createWorld } from '../src/engine/world';
import { processDay, nextDay, userGameToday } from '../src/engine/season';
import { advanceOffseason } from '../src/engine/offseason';
import { classRankings } from '../src/engine/recruiting';
import type { GameState } from '../src/engine/types';

const t0 = performance.now();
const s: GameState = createWorld({ seed: 7, teamId: 'indiana', difficulty: 'pro', coach: { first: 'Cam', last: 'Lawson', age: 38, archetype: 'Recruiter' } });
console.log(`World: ${Object.keys(s.teams).length} teams, ${Object.keys(s.players).length} players, ${Object.keys(s.recruits).length} recruits, ${s.schedule.length} games. ${(performance.now() - t0).toFixed(0)}ms`);
const gpt: Record<string, number> = {};
for (const g of s.schedule) { gpt[g.home] = (gpt[g.home] ?? 0) + 1; gpt[g.away] = (gpt[g.away] ?? 0) + 1; }
const counts = Object.values(gpt);
console.log(`Games/team min ${Math.min(...counts)} max ${Math.max(...counts)} avg ${(counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1)}`);
console.log('Preseason top 10:', s.polls[0].ranks.slice(0, 10).map((id) => `${s.teams[id].school}(${s.teams[id].power})`).join(', '));
const user = s.teams['indiana'];
console.log(`User team power ${user.power}, expectation: ${s.user.expectation}, NIL ${user.nilBudget}`);

for (const seasonIdx of [0, 1]) {
  const t1 = performance.now();
  let guard = 0;
  while (['preseason', 'regular', 'confTourney', 'selection', 'ncaa'].includes(s.phase) && guard++ < 200) {
    void userGameToday(s);
    processDay(s);
    nextDay(s);
  }
  console.log(`Season ${s.season} simmed in ${(performance.now() - t1).toFixed(0)}ms; phase=${s.phase}`);
  const teams = Object.values(s.teams).sort((a, b) => b.rating - a.rating);
  console.log('Top 8 by rating:', teams.slice(0, 8).map((t) => `${t.school} ${t.record.w}-${t.record.l} (${t.rating})`).join(' | '));
  console.log('Champion:', s.champions.map((c) => `${c.season} ${s.teams[c.teamId].school} over ${s.teams[c.runnerUp].school} ${c.score}`).join('; '));
  const f4 = s.ncaa!.rounds[5].flatMap((g) => g.teams).map((id) => `${s.teams[id!].school}(${s.ncaa!.seeds[id!]})`);
  console.log('Final Four:', f4.join(', '));
  console.log(`User: ${user.record.w}-${user.record.l}, hist: ${JSON.stringify(user.history[user.history.length - 1])}`);
  const allPlayers = Object.values(s.players).filter((p) => p.stats.gp > 10);
  const top = allPlayers.sort((a, b) => b.stats.pts / b.stats.gp - a.stats.pts / a.stats.gp).slice(0, 5);
  console.log('Scoring leaders:', top.map((p) => `${p.first} ${p.last} ${(p.stats.pts / p.stats.gp).toFixed(1)}`).join(', '));
  const ppg = Object.values(s.teams).reduce((a, t) => a + t.record.pf / Math.max(1, t.record.w + t.record.l), 0) / Object.keys(s.teams).length;
  console.log(`Avg team PPG ${ppg.toFixed(1)}`);
  const cr = classRankings(s).slice(0, 5).map((c) => `${s.teams[c.teamId].school} ${c.count}/${c.score}`);
  console.log('Recruiting class leaders:', cr.join(', '));
  const committed = Object.values(s.recruits).filter((r) => r.committed).length;
  console.log(`Recruits committed: ${committed}/${Object.keys(s.recruits).length}`);
  console.log('Awards:', s.awards.filter((a) => a.season === s.season && (a.name.includes('National') || a.name.includes('Coach of'))).map((a) => `${a.name}: ${a.playerId ? s.players[a.playerId]?.last : s.coaches[a.coachId!]?.last} (${s.teams[a.teamId].school})`).join('; '));
  // offseason
  const t2 = performance.now();
  let g2 = 0;
  while (s.phase !== 'preseason' && g2++ < 20) {
    if (s.phase === 'seasonEnd') console.log(`Carousel: ${s.offseason!.carousel.length} moves; user security ${s.coaches[s.user.coachId].jobSecurity}; offers ${s.user.offers.length}`);
    if (s.phase === 'declarations') console.log(`Graduating ${s.offseason!.graduating.length}, declared ${s.offseason!.declared.length}`);
    if (s.phase === 'portal' && s.portal!.day === 0) console.log(`Portal entries ${Object.keys(s.portal!.entries).length}, user retention ${Object.keys(s.user.retention).length}`);
    advanceOffseason(s);
  }
  console.log(`Offseason in ${(performance.now() - t2).toFixed(0)}ms. Draft picks ${s.draft.length}. Players ${Object.keys(s.players).length}. Season now ${s.season}`);
  const sizes = Object.values(s.teams).map((t) => t.roster.length);
  console.log(`Roster sizes min ${Math.min(...sizes)} max ${Math.max(...sizes)}`);
  console.log('New preseason top 5:', s.polls[0].ranks.slice(0, 5).map((id) => s.teams[id].school).join(', '));
  console.log('Save size (MB):', (JSON.stringify(s).length / 1e6).toFixed(2));
}
