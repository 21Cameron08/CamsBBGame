// Season awards and Awards Night. Picks every award (the classics plus Sixth Man, Most Improved,
// Transfer, Performance, Upset and Game of the Year), keeps the nominees for an animated awards
// show, and inducts each year's Hall of Fame class (players, coaches, and a charter class of
// program legends the first time the doors open).
import type { Award, AwardCategory, AwardNominee, AwardsShowData, GameState, HofInductee, Player, ScheduledGame, Team } from './types';
import { seasonLabel, NCAA_ROUND_NAMES } from './calendar';
import { teamPlayers } from './team';
import { addNews } from './media';
import { coachSummaries } from './pstats';
import { historicLegends } from './legacy';
import { loreOf } from '../data/lore';

export function playerScore(p: Player): number {
  const g = Math.max(1, p.stats.gp);
  const s = p.stats;
  return (s.pts + (s.orb + s.drb) * 0.8 + s.ast * 1.1 + s.stl * 1.6 + s.blk * 1.4 - s.tov * 0.9 - (s.fga - s.fgm) * 0.45 - (s.fta - s.ftm) * 0.3) / g;
}

const f1 = (n: number) => n.toFixed(1);
const CLS: Record<string, string> = { FR: 'Freshman', SO: 'Sophomore', JR: 'Junior', SR: 'Senior', GR: 'Grad' };
const ord = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], m = n % 100; return n + (s[(m - 20) % 10] || s[m] || s[0]); };
function statLine(p: Player) {
  const g = Math.max(1, p.stats.gp), s = p.stats;
  return `${f1(s.pts / g)} ppg · ${f1((s.orb + s.drb) / g)} rpg · ${f1(s.ast / g)} apg`;
}
function nomP(state: GameState, p: Player, line?: string, sub?: string): AwardNominee {
  const t = state.teams[p.teamId!];
  return { kind: 'player', id: p.id, name: `${p.first} ${p.last}`, teamId: p.teamId!, line: line ?? statLine(p), sub: sub ?? `${CLS[p.cls] ?? p.cls} ${p.pos} · ${t?.school ?? ''}`, num: p.num };
}

export interface AwardsResult { awards: Award[]; show: AwardsShowData }

export function runAwards(state: GameState): AwardsResult {
  const awards: Award[] = [];
  const cats: AwardCategory[] = [];
  const season = state.season;
  const all = Object.values(state.players).filter((p) => p.teamId && p.stats.gp >= 15);
  const teamBonus = (p: Player) => { const t = state.teams[p.teamId!]; return t.rating * 0.12 + (t.apRank ? (26 - t.apRank) * 0.06 : 0); };
  const ranked = [...all].sort((a, b) => playerScore(b) + teamBonus(b) - (playerScore(a) + teamBonus(a)));
  const add = (name: string, p: Player) => {
    awards.push({ season, name, playerId: p.id, teamId: p.teamId!, who: `${p.first} ${p.last}` });
    p.awards.push(`${name} (${seasonLabel(season)})`);
  };
  const cat = (key: string, title: string, icon: string, blurb: string, nominees: AwardNominee[], marquee = false) => {
    if (nominees.length) cats.push({ key, title, icon, blurb, nominees, winner: 0, marquee });
  };
  const ppg = (p: Player) => p.stats.pts / Math.max(1, p.stats.gp);
  const lastLine = (p: Player) => { const l = p.career[p.career.length - 1]; return l && l.season === season - 1 && l.gp >= 10 ? l : undefined; };

  // ---- the classics ----
  if (ranked[0]) add('National Player of the Year', ranked[0]);
  ranked.slice(0, 5).forEach((p) => add('All-American First Team', p));
  ranked.slice(5, 10).forEach((p) => add('All-American Second Team', p));
  ranked.slice(10, 15).forEach((p) => add('All-American Third Team', p));

  const frs = ranked.filter((p) => p.cls === 'FR').slice(0, 4);
  if (frs[0]) add('Freshman of the Year', frs[0]);
  cat('fr', 'Freshman of the Year', '🌱', 'The best first-year player in the country.', frs.map((p) => nomP(state, p)));

  // ---- new: Sixth Man ----
  const bench = all.filter((p) => p.stats.gs / Math.max(1, p.stats.gp) <= 0.3 && ppg(p) >= 6).sort((a, b) => playerScore(b) - playerScore(a)).slice(0, 4);
  if (bench[0]) add('Sixth Man of the Year', bench[0]);
  cat('sixth', 'Sixth Man of the Year', '🪑', 'Came off the bench and changed games anyway.', bench.map((p) => nomP(state, p, `${statLine(p)} · ${p.stats.gs} starts`)));

  // ---- new: Most Improved ----
  const lineScore = (l: NonNullable<ReturnType<typeof lastLine>>) => (l.pts + (l.orb + l.drb) * 0.8 + l.ast * 1.1 + l.stl * 1.6 + l.blk * 1.4 - l.tov * 0.9 - (l.fga - l.fgm) * 0.45 - (l.fta - l.ftm) * 0.3) / Math.max(1, l.gp);
  const mip = all.map((p) => ({ p, l: lastLine(p) })).filter((x) => x.l).map((x) => ({ ...x, d: playerScore(x.p) - lineScore(x.l!) })).filter((x) => x.d > 2).sort((a, b) => b.d - a.d).slice(0, 4);
  if (mip[0]) add('Most Improved Player', mip[0].p);
  cat('mip', 'Most Improved Player', '📈', 'The biggest jump from last season to this one.', mip.map((x) => nomP(state, x.p, `${f1(x.l!.pts / Math.max(1, x.l!.gp))} → ${f1(ppg(x.p))} ppg`, `${CLS[x.p.cls] ?? x.p.cls} ${x.p.pos} · ${state.teams[x.p.teamId!].school}`)));

  // ---- new: Transfer of the Year ----
  const transfers = all.filter((p) => { const l = lastLine(p); return l && l.teamId !== p.teamId; }).sort((a, b) => playerScore(b) + teamBonus(b) - (playerScore(a) + teamBonus(a))).slice(0, 4);
  if (transfers[0]) add('Transfer of the Year', transfers[0]);
  cat('transfer', 'Transfer of the Year', '🔁', 'New school, new jersey, same buckets.', transfers.map((p) => nomP(state, p, statLine(p), `${state.teams[p.teamId!].school} · from ${state.teams[lastLine(p)!.teamId]?.school ?? 'another school'}`)));

  // ---- Defensive Player of the Year ----
  const dScore = (p: Player) => p.stats.stl * 1.5 + p.stats.blk * 1.6 + p.ratings.perD * 0.15 + p.ratings.intD * 0.15;
  const dpoy = [...all].sort((a, b) => dScore(b) - dScore(a)).slice(0, 4);
  if (dpoy[0]) add('Defensive Player of the Year', dpoy[0]);
  cat('dpoy', 'Defensive Player of the Year', '🛡️', 'Nobody wanted to see him on the other end.', dpoy.map((p) => nomP(state, p, `${f1(p.stats.stl / Math.max(1, p.stats.gp))} spg · ${f1(p.stats.blk / Math.max(1, p.stats.gp))} bpg · ${f1((p.stats.orb + p.stats.drb) / Math.max(1, p.stats.gp))} rpg`)));

  // ---- new: Performance of the Year (the best single game we have a box score for) ----
  const games = new Map(state.schedule.map((g) => [g.id, g]));
  const perfs: { p: Player; pts: number; reb: number; ast: number; gs: number; g: ScheduledGame; opp: string }[] = [];
  for (const [gid, box] of Object.entries(state.boxScores)) {
    const g = games.get(gid);
    if (!g || !g.played) continue;
    box.players.forEach((side, i) => {
      for (const b of side) {
        const p = state.players[b.id];
        if (!p || !p.teamId) continue;
        const reb = b.orb + b.drb;
        perfs.push({ p, pts: b.pts, reb, ast: b.ast, gs: b.pts + reb * 0.7 + b.ast * 0.8 + b.stl + b.blk - b.tov * 0.7, g, opp: i === 0 ? g.away : g.home });
      }
    });
  }
  const seen = new Set<string>();
  const topPerf = perfs.sort((a, b) => b.gs - a.gs).filter((x) => (seen.has(x.p.id) ? false : (seen.add(x.p.id), true))).slice(0, 4);
  if (topPerf[0]) add('Performance of the Year', topPerf[0].p);
  cat('perf', 'Performance of the Year', '💥', 'One night. One stat line. Everybody saw it.', topPerf.map((x) => nomP(state, x.p, `${x.pts} pts · ${x.reb} reb · ${x.ast} ast`, `vs ${state.teams[x.opp]?.school ?? ''}${x.g.type === 'ncaa' ? ' · NCAA Tournament' : ''} · ${state.calendar[x.g.day]?.label.split(' · ')[0] ?? ''}`)).map((n, i) => ({ ...n, oppId: topPerf[i].opp })));

  // ---- new: Upset of the Year (March) ----
  const n = state.ncaa;
  if (n) {
    const ups = n.rounds.flat().filter((bg) => bg.winner && bg.teams[0] && bg.teams[1]).map((bg) => {
      const w = bg.winner!, l = bg.teams.find((t) => t !== w)!;
      return { bg, w, l, d: (n.seeds[w] ?? 0) - (n.seeds[l] ?? 0) };
    }).filter((x) => x.d >= 4).sort((a, b) => b.d - a.d || b.bg.round - a.bg.round).slice(0, 4);
    const score = (x: (typeof ups)[number]) => { const sc = x.bg.score; if (!sc) return ''; const wi = x.bg.teams.indexOf(x.w); return `${sc[wi]}-${sc[1 - wi]}`; };
    if (ups[0]) awards.push({ season, name: 'Upset of the Year', teamId: ups[0].w, who: `No. ${n.seeds[ups[0].w]} ${state.teams[ups[0].w].school} over No. ${n.seeds[ups[0].l]} ${state.teams[ups[0].l].school}` });
    cat('upset', 'Upset of the Year', '🤯', 'Brackets everywhere, ruined.', ups.map((x) => ({
      kind: 'game' as const, id: x.bg.id, teamId: x.w, oppId: x.l, name: `No. ${n.seeds[x.w]} ${state.teams[x.w].school}`,
      line: `beat No. ${n.seeds[x.l]} ${state.teams[x.l].school} ${score(x)}`, sub: `NCAA Tournament · ${NCAA_ROUND_NAMES[x.bg.round] ?? 'March'}`,
    })));
  }

  // ---- new: Game of the Year ----
  const gScore = (g: ScheduledGame) => {
    const m = Math.abs((g.hs ?? 0) - (g.as ?? 0));
    const box = state.boxScores[g.id];
    const comeback = box ? ((g.hs ?? 0) > (g.as ?? 0) ? box.largestLead[1] : box.largestLead[0]) : 0;
    return (g.type === 'ncaa' ? 10 + (g.round ?? 0) * 3 : g.type === 'ctourn' ? 4 : box ? 3 : 0) + (g.ot ? 3 + 2 * g.ot : 0) + (m <= 1 ? 5 : m <= 3 ? 3 : m <= 5 ? 1 : 0) + comeback / 4;
  };
  const best = state.schedule.filter((g) => g.played && g.hs != null && (Math.abs(g.hs - (g.as ?? 0)) <= 5 || g.ot) && (g.type === 'ncaa' || g.type === 'ctourn' || state.boxScores[g.id]))
    .sort((a, b) => gScore(b) - gScore(a)).slice(0, 4);
  if (best.length) {
    const desc = (g: ScheduledGame) => {
      const hw = (g.hs ?? 0) > (g.as ?? 0);
      const w = hw ? g.home : g.away, l = hw ? g.away : g.home;
      const box = state.boxScores[g.id];
      const cb = box ? (hw ? box.largestLead[1] : box.largestLead[0]) : 0;
      return { w, l, ws: Math.max(g.hs ?? 0, g.as ?? 0), ls: Math.min(g.hs ?? 0, g.as ?? 0), cb };
    };
    const d0 = desc(best[0]);
    awards.push({ season, name: 'Game of the Year', teamId: d0.w, who: `${state.teams[d0.w].school} ${d0.ws}, ${state.teams[d0.l].school} ${d0.ls}${best[0].ot ? ' (OT)' : ''}` });
    cat('game', 'Game of the Year', '🎬', 'The one you’ll be telling people about.', best.map((g) => {
      const d = desc(g);
      return {
        kind: 'game' as const, id: g.id, teamId: d.w, oppId: d.l, name: `${state.teams[d.w].school} ${d.ws}, ${state.teams[d.l].school} ${d.ls}${g.ot ? ` (${g.ot > 1 ? `${g.ot}OT` : 'OT'})` : ''}`,
        line: g.event ?? (g.type === 'conf' ? 'Conference play' : g.type === 'ncaa' ? 'NCAA Tournament' : 'Regular season'),
        sub: d.cb >= 8 ? `${state.teams[d.w].school} came back from ${d.cb} down` : `${state.calendar[g.day]?.label.split(' · ')[0] ?? ''}`,
      };
    }));
  }

  // ---- Coach of the Year ----
  const teams = Object.values(state.teams);
  const coyScore = (t: Team) => (t.record.w - t.record.l) * 0.6 + (t.rating - (t.power - 65) * 1.15);
  const coys = [...teams].filter((t) => state.coaches[t.coachId]).sort((a, b) => coyScore(b) - coyScore(a)).slice(0, 4);
  if (coys[0]) {
    const cc = state.coaches[coys[0].coachId];
    awards.push({ season, name: 'Coach of the Year', coachId: coys[0].coachId, teamId: coys[0].id, who: `${cc.first} ${cc.last}` });
  }
  cat('coy', 'Coach of the Year', '🧢', 'Did the most with what he had.', coys.map((t) => {
    const c = state.coaches[t.coachId];
    return { kind: 'coach' as const, id: c.id, name: `${c.first} ${c.last}`, teamId: t.id, age: c.age, line: `${t.record.w}-${t.record.l}${t.apRank ? ` · No. ${t.apRank} in the final poll` : ''}`, sub: t.school };
  }));

  // ---- conference Players of the Year (not in the show) ----
  for (const c of state.conferences) {
    const b = ranked.find((p) => state.teams[p.teamId!].conf === c.id);
    if (b) add(`${c.short} Player of the Year`, b);
  }

  // ---- Final Four MOP ----
  if (n?.champion) {
    const champs = teamPlayers(state, n.champion).filter((p) => p.stats.gp > 0).sort((a, b) => playerScore(b) - playerScore(a)).slice(0, 3);
    if (champs[0]) add('Final Four Most Outstanding Player', champs[0]);
    cat('mop', 'Final Four Most Outstanding Player', '🏆', `The star of ${state.teams[n.champion].school}'s title run.`, champs.map((p) => nomP(state, p)));
  }

  // ---- National Player of the Year (last) ----
  cat('poy', 'National Player of the Year', '👑', 'The best player in college basketball.', ranked.slice(0, 4).map((p) => nomP(state, p, statLine(p), `${CLS[p.cls] ?? p.cls} ${p.pos} · ${state.teams[p.teamId!].school}${state.teams[p.teamId!].apRank ? ` (No. ${state.teams[p.teamId!].apRank})` : ''}`)), true);

  const show: AwardsShowData = {
    season, categories: cats,
    allAmerica: { first: ranked.slice(0, 5).map((p) => nomP(state, p)), second: ranked.slice(5, 10).map((p) => nomP(state, p)), third: ranked.slice(10, 15).map((p) => nomP(state, p)) },
    hof: [],
  };
  return { awards, show };
}

// ---------------- Hall of Fame ----------------
const P_WEIGHTS: Record<string, number> = {
  'National Player of the Year': 40, 'All-American First Team': 15, 'All-American Second Team': 8, 'All-American Third Team': 5,
  'Final Four Most Outstanding Player': 12, 'Defensive Player of the Year': 8, 'Freshman of the Year': 4, 'Sixth Man of the Year': 3,
  'Most Improved Player': 2, 'Transfer of the Year': 3, 'Performance of the Year': 4,
};
export const HOF_PLAYER_BAR = 45;
export const HOF_COACH_SCORE = 140;
export const HOF_COACH_WINS = 650;

export function hallOfFame(state: GameState) { return (state.hof ??= { inductees: [] }); }

/** Induct this year's class. The very first ceremony opens with a charter class of program legends. */
export function inductHallOfFame(state: GameState): HofInductee[] {
  const H = hallOfFame(state);
  const cls = state.season;
  const out: HofInductee[] = [];
  const done = new Set(H.inductees.map((i) => `${i.kind}:${i.id}`));
  if (!H.inductees.length) {
    // charter class: the biggest legend from each of the most storied programs
    const programs = Object.values(state.teams).filter((t) => loreOf(t.id)?.titles?.length).sort((a, b) => (loreOf(b.id)!.titles!.length - loreOf(a.id)!.titles!.length) || b.prestige - a.prestige).slice(0, 5);
    for (const t of programs) {
      const l = historicLegends(t.id)[0];
      if (!l) continue;
      out.push({ kind: 'player', id: `legend:${t.id}:${l.num}`, name: l.name, teamId: t.id, cls, line: `Charter class. ${l.line}`, years: l.era.replace(/^the /, ''), num: l.num, pos: l.pos, score: 0 });
    }
  }
  // players: careers that are over, judged by their hardware
  const byPlayer = new Map<string, { name: string; teams: Record<string, number>; score: number; names: string[]; seasons: number[] }>();
  for (const a of state.awards) {
    if (!a.playerId || done.has(`player:${a.playerId}`)) continue;
    const w = P_WEIGHTS[a.name] ?? (/ Player of the Year$/.test(a.name) ? 3 : 0);
    if (!w) continue;
    const e = byPlayer.get(a.playerId) ?? { name: a.who ?? 'Former player', teams: {}, score: 0, names: [], seasons: [] };
    e.score += w; e.names.push(a.name); e.seasons.push(a.season); e.teams[a.teamId] = (e.teams[a.teamId] ?? 0) + w;
    byPlayer.set(a.playerId, e);
  }
  const jerseys = new Map<string, { teamId: string; num: number; pos: string; years: string }>();
  for (const [teamId, list] of Object.entries(state.legacy?.retired ?? {})) for (const r of list) jerseys.set(r.playerId, { teamId, num: r.num, pos: r.pos, years: r.years });
  const players = [...byPlayer.entries()]
    .filter(([id]) => !state.players[id]?.teamId) // still in college: not yet
    .map(([id, e]) => ({ id, e, score: e.score + (jerseys.has(id) ? 15 : 0) }))
    .filter((x) => x.score >= HOF_PLAYER_BAR)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  for (const { id, e, score } of players) {
    const j = jerseys.get(id);
    const teamId = j?.teamId ?? Object.entries(e.teams).sort((a, b) => b[1] - a[1])[0][0];
    const count = (n: string) => e.names.filter((x) => x === n).length;
    const bits: string[] = [];
    if (count('National Player of the Year')) bits.push(`${count('National Player of the Year') > 1 ? `${count('National Player of the Year')}× ` : ''}National Player of the Year`);
    if (count('All-American First Team')) bits.push(`${count('All-American First Team') > 1 ? `${count('All-American First Team')}× ` : ''}First Team All-American`);
    if (count('Final Four Most Outstanding Player')) bits.push('Final Four MOP');
    if (count('Defensive Player of the Year')) bits.push('Defensive Player of the Year');
    if (j) bits.push(`No. ${j.num} retired`);
    const first = Math.min(...e.seasons), last = Math.max(...e.seasons);
    out.push({ kind: 'player', id, name: e.name, teamId, cls, line: bits.slice(0, 3).join(' · ') || 'Decorated college career', years: j?.years ?? (first === last ? seasonLabel(first) : `${first}–${String((last + 1) % 100).padStart(2, '0')}`), num: j?.num, pos: j?.pos, score });
  }
  // coaches: retired at least a year, with a legacy (or the wins) to match
  const coaches = coachSummaries(state)
    .filter((c) => c.exit?.status === 'retired' && c.exit.until < state.season && !done.has(`coach:${c.id}`))
    .filter((c) => c.score >= HOF_COACH_SCORE || c.careerW >= HOF_COACH_WINS)
    .sort((a, b) => b.score - a.score || b.careerW - a.careerW)
    .slice(0, 2);
  for (const c of coaches) {
    const team = c.exit!.lastTeam;
    out.push({ kind: 'coach', id: c.id, name: `${c.first} ${c.last}`, teamId: team, cls, age: c.age, score: c.score,
      line: `${c.careerW}-${c.careerL} career${c.titles ? ` · ${c.titles} national title${c.titles > 1 ? 's' : ''}` : ''}${c.f4 ? ` · ${c.f4} Final Four${c.f4 > 1 ? 's' : ''}` : ''}${c.coy ? ` · ${c.coy}× Coach of the Year` : ''}` });
  }
  if (out.length) {
    H.inductees.push(...out);
    addNews(state, {
      kind: 'feature',
      headline: `Hall of Fame Class of ${cls + 1}: ${out.map((i) => i.name).join(', ')}`,
      body: `${out.length > 1 ? 'They join' : 'He joins'} college basketball's Hall of Fame. ${out.map((i) => `${i.name} (${state.teams[i.teamId]?.school ?? ''}): ${i.line}`).join(' ')}`,
      teams: [...new Set(out.map((i) => i.teamId))],
      important: out.some((i) => i.teamId === state.user.teamId || i.id === state.user.coachId),
    });
  }
  return out;
}

/** Store the show and queue it for the user (its season-end presser plays after) */
export function stageAwardsNight(state: GameState, show: AwardsShowData) {
  show.hof = inductHallOfFame(state);
  state.awardsShows = [...(state.awardsShows ?? []).filter((s) => s.season !== show.season), show].slice(-6);
  const m = { kind: 'awards' as const, season: show.season, press: state.user.press };
  state.user.press = null;
  const firedAt = state.user.moments.findIndex((x) => x.kind === 'fired');
  if (firedAt >= 0) state.user.moments.splice(firedAt, 0, m); else state.user.moments.push(m);
}

/** The user's awards this season, for the show's closing card */
export function userHaul(state: GameState, show: AwardsShowData): string[] {
  const uid = state.user.teamId;
  const out: string[] = [];
  for (const c of show.categories) { const w = c.nominees[c.winner]; if (w && (w.teamId === uid || w.id === state.user.coachId)) out.push(`${c.title}: ${w.name}`); }
  for (const [k, list] of Object.entries(show.allAmerica)) for (const p of list) if (p.teamId === uid) out.push(`All-American ${k === 'first' ? 'First' : k === 'second' ? 'Second' : 'Third'} Team: ${p.name}`);
  return out;
}

export function ordinal(n: number) { return ord(n); }
