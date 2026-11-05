// Programs & Coaches: league-wide program leaderboards and the coach rankings, with a detailed
// page for every program and every head coach (opened as modals so they work from anywhere).
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { TeamLogo, TeamName, CoachFace, Tabs, Empty, useSorted, TeamHeroBg } from '../components/common';
import type { GameState, Team } from '../../engine/types';
import { programSummaries, coachSummaries, h2hTeam, h2hCoach, tierOf, seasonScore, type ProgramSummary, type CoachSummary } from '../../engine/pstats';
import { seasonLabel } from '../../engine/calendar';
import { allTitles } from '../components/Legacy';
import { Plaque } from '../overlays/AwardsShow';
import { HOF_COACH_SCORE, HOF_COACH_WINS, HOF_PLAYER_BAR } from '../../engine/awards';
import { replayAwardsNight } from '../shell/advance';

const pct = (w: number, l: number) => (w + l ? (w / (w + l)).toFixed(3).replace(/^0/, '') : '—');
const wl = (w: number, l: number) => `${w}-${l}`;
const f1 = (n: number) => n.toFixed(1);
const tierCls = (label: string) => tierOf(TIER_MIN[label] ?? -1).cls;
const TIER_MIN: Record<string, number> = { Legend: 260, 'Hall of Famer': 140, Elite: 100, Proven: 45, Rising: 15, Unproven: -1 };
const POST_CLS = (p: string) => (p === 'Champion' ? 'pill gold' : p === 'Runner-up' || p === 'Final Four' ? 'pill accent' : p === 'Elite Eight' || p === 'Sweet 16' ? 'pill blue' : p ? 'pill good' : '');

function useSummaries(g: GameState) {
  const programs = useMemo(() => programSummaries(g).sort((a, b) => b.score - a.score || b.w - a.w), [g.season, g.day, g.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const coaches = useMemo(() => coachSummaries(g).sort((a, b) => b.score - a.score || b.careerW - a.careerW), [g.season, g.day, g.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  return { programs, coaches };
}

export function ProgramsScreen() {
  const g = useGameState();
  const arg = useGame((s) => s.screenArg);
  const [tab, setTab] = useState<'programs' | 'coaches' | 'hof'>(arg === 'coaches' ? 'coaches' : arg === 'hof' ? 'hof' : 'programs');
  const { programs, coaches } = useSummaries(g);
  const since = g.pstats?.since ?? g.season;
  return (
    <div>
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div className="hero" style={{ padding: '22px 26px 18px' }}>
          <TeamHeroBg team={g.teams[g.user.teamId]} intensity={0.7} />
          <div className="row" style={{ alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div className="eyebrow" style={{ color: 'rgba(255,255,255,.8)' }}>The Dynasty Era · since {seasonLabel(Math.min(since, g.season))}</div>
              <div className="h1" style={{ fontSize: 40 }}>Programs &amp; Coaches</div>
              <div className="small" style={{ opacity: 0.85, maxWidth: 640 }}>Every program and every head coach, ranked by what they've done since your dynasty began. The season in progress counts toward records; postseason results count once they're in the books.</div>
            </div>
            <div className="spacer" />
            <Tabs id="pc" value={tab} onChange={setTab} tabs={[{ id: 'programs', label: '🏛️ Programs' }, { id: 'coaches', label: '🧢 Coaches' }, { id: 'hof', label: '🏅 Hall of Fame' }]} />
          </div>
        </div>
      </div>
      {tab === 'programs' ? <ProgramBoard g={g} programs={programs} /> : tab === 'coaches' ? <CoachBoard g={g} coaches={coaches} /> : <HallOfFameBoard g={g} coaches={coaches} />}
    </div>
  );
}

// ======================= programs =======================
type PView = 'overview' | 'postseason' | 'polls' | 'talent' | 'splits';
const PVIEWS: { id: PView; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'postseason', label: 'Postseason' }, { id: 'polls', label: 'Polls & Top 25' }, { id: 'talent', label: 'Talent' }, { id: 'splits', label: 'Home & Road' },
];

function ProgramBoard({ g, programs }: { g: GameState; programs: ProgramSummary[] }) {
  const open = useGame((s) => s.open);
  const [view, setView] = useState<PView>('overview');
  const [conf, setConf] = useState('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(60);
  const rank = useMemo(() => new Map(programs.map((p, i) => [p.team.id, i + 1])), [programs]);
  const rows = useMemo(() => programs.filter((p) => (!conf || p.team.conf === conf) && (!q || p.team.school.toLowerCase().includes(q.toLowerCase()))), [programs, conf, q]);
  const { sorted, th } = useSorted<ProgramSummary>(rows, { key: 'score', dir: -1 }, {
    score: (p) => p.score, school: (p) => p.team.school, seasons: (p) => p.seasons, w: (p) => p.w, pct: (p) => p.pct, bids: (p) => p.bids,
    s16: (p) => p.s16, e8: (p) => p.e8, f4: (p) => p.f4, ru: (p) => p.ru, titles: (p) => p.titles * 100 + p.f4, all: (p) => p.titles + p.preTitles, w1: (p) => p.w1, draft: (p) => p.draft,
    ncaa: (p) => p.ncaaW - p.ncaaL * 0.5, reg: (p) => p.regTitles, tourn: (p) => p.tournTitles, wk: (p) => p.wk, pre1: (p) => p.preNo1, top25: (p) => p.top25, top10: (p) => p.top10,
    rw: (p) => p.rw, rpct: (p) => (p.rw + p.rl ? p.rw / (p.rw + p.rl) : -1), first: (p) => p.firstRd, lottery: (p) => p.lottery, aa: (p) => p.aa, aa1: (p) => p.aa1, poy: (p) => p.poy,
    cls: (p) => -(p.classAvg ?? 999), topcl: (p) => p.topClasses, jerseys: (p) => p.jerseys, home: (p) => (p.hw + p.hl ? p.hw / (p.hw + p.hl) : -1), road: (p) => (p.aw + p.al ? p.aw / (p.aw + p.al) : -1),
    ppg: (p) => (p.games ? p.pf / p.games : 0), opp: (p) => -(p.games ? p.pa / p.games : 999), margin: (p) => (p.games ? (p.pf - p.pa) / p.games : -99), streak: (p) => p.streak.n, big: (p) => p.bigWin?.m ?? 0,
  });
  const mine = programs.find((p) => p.team.id === g.user.teamId);
  const confs = g.conferences;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        {programs.slice(0, 3).map((p, i) => (
          <motion.div key={p.team.id} className="card hover pc-podium" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} onClick={() => open({ kind: 'program', id: p.team.id })}
            style={{ borderColor: i === 0 ? 'rgba(246,201,76,.55)' : undefined }}>
            <div className="row" style={{ gap: 10 }}>
              <span className="pc-medal">{['🥇', '🥈', '🥉'][i]}</span>
              <TeamLogo team={p.team} size={40} />
              <div style={{ minWidth: 0 }}>
                <div className="b ellipsis">{p.team.school}</div>
                <div className="tiny muted">Dynasty Score <b style={{ color: 'var(--text)' }}>{p.score}</b></div>
              </div>
            </div>
            <div className="row wrap" style={{ gap: 5, marginTop: 10 }}>
              <span className="pill">{wl(p.w, p.l)}</span>
              {p.titles > 0 && <span className="pill gold">🏆 {p.titles}</span>}
              {p.f4 > 0 && <span className="pill accent">F4 ×{p.f4}</span>}
              {p.w1 > 0 && <span className="pill">{p.w1} wk at No. 1</span>}
            </div>
          </motion.div>
        ))}
        {mine && (
          <div className="card hover pc-podium" onClick={() => open({ kind: 'program', id: mine.team.id })} style={{ borderStyle: 'dashed' }}>
            <div className="row" style={{ gap: 10 }}>
              <TeamLogo team={mine.team} size={40} />
              <div style={{ minWidth: 0 }}>
                <div className="tiny muted upper" style={{ letterSpacing: '.1em' }}>Your program</div>
                <div className="b ellipsis">{mine.team.school}</div>
              </div>
              <div className="spacer" />
              <div style={{ textAlign: 'right' }}><div className="num" style={{ fontSize: 26 }}>#{rank.get(mine.team.id)}</div><div className="tiny muted">of {programs.length}</div></div>
            </div>
            <div className="row wrap" style={{ gap: 5, marginTop: 10 }}>
              <span className="pill">{wl(mine.w, mine.l)}</span><span className="pill">Score {mine.score}</span>{mine.bids > 0 && <span className="pill good">{mine.bids} NCAA</span>}
            </div>
          </div>
        )}
      </div>

      <div className="card flush">
        <div className="row wrap" style={{ padding: '14px 16px', gap: 10 }}>
          <div className="seg">{PVIEWS.map((v) => <button key={v.id} className={view === v.id ? 'on' : ''} onClick={() => setView(v.id)}>{v.label}</button>)}</div>
          <div className="spacer" />
          <select className="select" style={{ width: 210 }} value={conf} onChange={(e) => setConf(e.target.value)}>
            <option value="">All conferences</option>
            {confs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className="input" style={{ width: 190 }} placeholder="Search programs…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 300px)' }}>
          <table className="table">
            <thead>
              <tr>
                <th className="c">#</th>{th('school', 'Program')}
                {view === 'overview' && <>{th('seasons', 'Yrs', 'r')}{th('w', 'W-L', 'r')}{th('pct', 'Pct', 'r')}{th('bids', 'NCAA', 'r')}{th('s16', 'S16', 'r')}{th('f4', 'F4', 'r')}{th('titles', 'Titles', 'r')}{th('w1', 'Wks #1', 'r')}{th('draft', 'Pros', 'r')}{th('score', 'Score', 'r')}</>}
                {view === 'postseason' && <>{th('bids', 'Bids', 'r')}{th('ncaa', 'NCAA W-L', 'r')}{th('s16', 'S16', 'r')}{th('e8', 'E8', 'r')}{th('f4', 'F4', 'r')}{th('ru', 'Runner-up', 'r')}{th('titles', 'Titles', 'r')}{th('all', 'All-time', 'r')}{th('reg', 'Conf reg.', 'r')}{th('tourn', 'Conf tourn.', 'r')}</>}
                {view === 'polls' && <>{th('wk', 'Wks ranked', 'r')}{th('w1', 'Wks #1', 'r')}{th('pre1', 'Pre. #1', 'r')}{th('top25', 'Final Top 25', 'r')}{th('top10', 'Final Top 10', 'r')}{th('rw', 'vs Top 25', 'r')}{th('rpct', 'Pct', 'r')}</>}
                {view === 'talent' && <>{th('draft', 'Drafted', 'r')}{th('first', '1st Rd', 'r')}{th('lottery', 'Lottery', 'r')}{th('aa', 'All-Amer.', 'r')}{th('aa1', '1st Team', 'r')}{th('poy', 'POY', 'r')}{th('cls', 'Avg class', 'r')}{th('topcl', 'Top-10 classes', 'r')}{th('jerseys', 'Retired #s', 'r')}</>}
                {view === 'splits' && <>{th('home', 'Home', 'r')}{th('road', 'Road', 'r')}{th('ppg', 'PPG', 'r')}{th('opp', 'Opp PPG', 'r')}{th('margin', 'Margin', 'r')}{th('streak', 'Best streak', 'r')}{th('big', 'Biggest win', 'r')}</>}
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, limit).map((p) => {
                const games = Math.max(1, p.games);
                return (
                  <tr key={p.team.id} className={`click ${p.team.id === g.user.teamId ? 'me' : ''}`} onClick={() => open({ kind: 'program', id: p.team.id })}>
                    <td className="c mono muted">{rank.get(p.team.id)}</td>
                    <td><span className="row" style={{ gap: 8 }}><TeamLogo team={p.team} size={22} /><span className="b">{p.team.school}</span></span></td>
                    {view === 'overview' && <><td className="r">{p.seasons}</td><td className="r num">{wl(p.w, p.l)}</td><td className="r mono">{pct(p.w, p.l)}</td><td className="r">{p.bids || '—'}</td><td className="r">{p.s16 || '—'}</td><td className="r">{p.f4 || '—'}</td><td className="r">{p.titles ? <b style={{ color: 'var(--gold)' }}>{p.titles}</b> : '—'}</td><td className="r">{p.w1 || '—'}</td><td className="r">{p.draft || '—'}</td><td className="r num">{p.score}</td></>}
                    {view === 'postseason' && <><td className="r">{p.bids || '—'}</td><td className="r mono">{p.bids ? wl(p.ncaaW, p.ncaaL) : '—'}</td><td className="r">{p.s16 || '—'}</td><td className="r">{p.e8 || '—'}</td><td className="r">{p.f4 || '—'}</td><td className="r">{p.ru || '—'}</td><td className="r">{p.titles ? <b style={{ color: 'var(--gold)' }}>{p.titles}</b> : '—'}</td><td className="r">{p.titles + p.preTitles || '—'}</td><td className="r">{p.regTitles || '—'}</td><td className="r">{p.tournTitles || '—'}</td></>}
                    {view === 'polls' && <><td className="r">{p.wk || '—'}</td><td className="r">{p.w1 || '—'}</td><td className="r">{p.preNo1 || '—'}</td><td className="r">{p.top25 || '—'}</td><td className="r">{p.top10 || '—'}</td><td className="r mono">{p.rw + p.rl ? wl(p.rw, p.rl) : '—'}</td><td className="r mono">{pct(p.rw, p.rl)}</td></>}
                    {view === 'talent' && <><td className="r">{p.draft || '—'}</td><td className="r">{p.firstRd || '—'}</td><td className="r">{p.lottery || '—'}</td><td className="r">{p.aa || '—'}</td><td className="r">{p.aa1 || '—'}</td><td className="r">{p.poy || '—'}</td><td className="r mono">{p.classAvg != null ? f1(p.classAvg) : '—'}</td><td className="r">{p.topClasses || '—'}</td><td className="r">{p.jerseys || '—'}</td></>}
                    {view === 'splits' && <><td className="r mono">{wl(p.hw, p.hl)}</td><td className="r mono">{wl(p.aw, p.al)}</td><td className="r mono">{p.games ? f1(p.pf / games) : '—'}</td><td className="r mono">{p.games ? f1(p.pa / games) : '—'}</td><td className="r mono" style={{ color: p.pf >= p.pa ? 'var(--good)' : 'var(--bad)' }}>{p.games ? `${p.pf >= p.pa ? '+' : ''}${f1((p.pf - p.pa) / games)}` : '—'}</td><td className="r">{p.streak.n || '—'}</td><td className="r">{p.bigWin ? `+${p.bigWin.m}` : '—'}</td></>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {sorted.length > limit && <div style={{ padding: 12, textAlign: 'center' }}><button className="btn sm" onClick={() => setLimit(limit + 100)}>Show more ({sorted.length - limit} left)</button></div>}
        {!sorted.length && <Empty>No programs match.</Empty>}
      </div>
    </div>
  );
}

// ======================= coaches =======================
function CoachBoard({ g, coaches }: { g: GameState; coaches: CoachSummary[] }) {
  const open = useGame((s) => s.open);
  const [scope, setScope] = useState<'active' | 'all'>('active');
  const [conf, setConf] = useState('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(60);
  const rank = useMemo(() => new Map(coaches.map((c, i) => [c.id, i + 1])), [coaches]);
  const rows = useMemo(() => coaches.filter((c) => (scope === 'all' || c.active) && (!conf || (c.teamId && g.teams[c.teamId]?.conf === conf)) && (!q || `${c.first} ${c.last}`.toLowerCase().includes(q.toLowerCase()))), [coaches, scope, conf, q, g]);
  const { sorted, th } = useSorted<CoachSummary>(rows, { key: 'score', dir: -1 }, {
    score: (c) => c.score, name: (c) => c.last, school: (c) => c.status, age: (c) => c.age, seasons: (c) => c.seasons, w: (c) => c.w, pct: (c) => (c.w + c.l ? c.pct : -1),
    career: (c) => c.careerW, cpct: (c) => (c.careerW + c.careerL ? c.careerW / (c.careerW + c.careerL) : -1), bids: (c) => c.bids, ncaa: (c) => c.ncaaW - c.ncaaL * 0.5, s16: (c) => c.s16, f4: (c) => c.f4,
    titles: (c) => c.titles * 100 + c.f4, conf: (c) => c.regTitles + c.tournTitles, coy: (c) => c.coy, draft: (c) => c.draft,
  });
  const me = coaches.find((c) => c.isUser);
  const active = coaches.filter((c) => c.active);
  const winningest = [...active].sort((a, b) => b.careerW - a.careerW)[0];
  const mostTitles = [...coaches].sort((a, b) => b.titles - a.titles || b.f4 - a.f4)[0];
  const bestPct = active.filter((c) => c.seasons >= 2 || c.w + c.l >= 50).sort((a, b) => b.pct - a.pct)[0];
  const card = (label: string, c: CoachSummary | undefined, value: string) => c ? (
    <div className="card hover pc-podium" onClick={() => open({ kind: 'coach', id: c.id })}>
      <div className="tiny muted upper" style={{ letterSpacing: '.1em' }}>{label}</div>
      <div className="row" style={{ gap: 10, marginTop: 6 }}>
        <CoachAvatar g={g} c={c} size={40} />
        <div style={{ minWidth: 0 }}><div className="b ellipsis">{c.first} {c.last}</div><div className="tiny muted ellipsis">{c.status}</div></div>
        <div className="spacer" /><div className="num" style={{ fontSize: 20 }}>{value}</div>
      </div>
    </div>
  ) : null;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {coaches.slice(0, 3).map((c, i) => (
          <motion.div key={c.id} className="card hover pc-podium" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} onClick={() => open({ kind: 'coach', id: c.id })}
            style={{ borderColor: i === 0 ? 'rgba(246,201,76,.55)' : undefined }}>
            <div className="row" style={{ gap: 10 }}>
              <span className="pc-medal">{['🥇', '🥈', '🥉'][i]}</span>
              <CoachAvatar g={g} c={c} size={52} />
              <div style={{ minWidth: 0 }}>
                <div className="b ellipsis">{c.first} {c.last}{c.isUser ? ' (You)' : ''}</div>
                <div className="tiny muted ellipsis">{c.status}</div>
                <span className={`pill ${tierCls(c.tier)}`} style={{ marginTop: 4, fontSize: 10 }}>{c.tier}</span>
              </div>
              <div className="spacer" />
              <div style={{ textAlign: 'right' }}><div className="num" style={{ fontSize: 24 }}>{c.score}</div><div className="tiny muted">legacy</div></div>
            </div>
            <div className="row wrap" style={{ gap: 5, marginTop: 10 }}>
              <span className="pill">{wl(c.w, c.l)}</span>{c.titles > 0 && <span className="pill gold">🏆 {c.titles}</span>}{c.f4 > 0 && <span className="pill accent">F4 ×{c.f4}</span>}{c.coy > 0 && <span className="pill">COY ×{c.coy}</span>}
            </div>
          </motion.div>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {me && (
          <div className="card hover pc-podium" onClick={() => open({ kind: 'coach', id: me.id })} style={{ borderStyle: 'dashed' }}>
            <div className="tiny muted upper" style={{ letterSpacing: '.1em' }}>Where you rank</div>
            <div className="row" style={{ gap: 10, marginTop: 6 }}>
              <CoachAvatar g={g} c={me} size={40} />
              <div style={{ minWidth: 0 }}><div className="b">No. {rank.get(me.id)} of {coaches.length}</div><span className={`pill ${tierCls(me.tier)}`} style={{ fontSize: 10 }}>{me.tier}</span></div>
              <div className="spacer" /><div className="num" style={{ fontSize: 20 }}>{me.score}</div>
            </div>
          </div>
        )}
        {card('Winningest active coach', winningest, `${winningest?.careerW ?? 0} W`)}
        {card('Most titles', mostTitles?.titles ? mostTitles : undefined, `${mostTitles?.titles ?? 0} 🏆`)}
        {card('Best win % (active)', bestPct, bestPct ? pct(bestPct.w, bestPct.l) : '')}
      </div>

      <div className="card flush">
        <div className="row wrap" style={{ padding: '14px 16px', gap: 10 }}>
          <div className="seg"><button className={scope === 'active' ? 'on' : ''} onClick={() => setScope('active')}>Active coaches</button><button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>All-time (incl. retired)</button></div>
          <div className="spacer" />
          <select className="select" style={{ width: 210 }} value={conf} onChange={(e) => setConf(e.target.value)}>
            <option value="">All conferences</option>
            {g.conferences.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className="input" style={{ width: 190 }} placeholder="Search coaches…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 300px)' }}>
          <table className="table">
            <thead>
              <tr>
                <th className="c">#</th>{th('name', 'Coach')}{th('school', 'School')}{th('age', 'Age', 'r')}{th('seasons', 'Yrs', 'r')}{th('w', 'W-L', 'r')}{th('pct', 'Pct', 'r')}{th('career', 'Career', 'r')}{th('bids', 'NCAA', 'r')}{th('ncaa', 'NCAA W-L', 'r')}{th('s16', 'S16', 'r')}{th('f4', 'F4', 'r')}{th('titles', 'Titles', 'r')}{th('conf', 'Conf', 'r')}{th('coy', 'COY', 'r')}{th('draft', 'Pros', 'r')}{th('score', 'Legacy', 'r')}
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, limit).map((c) => (
                <tr key={c.id} className={`click ${c.isUser ? 'me' : ''}`} onClick={() => open({ kind: 'coach', id: c.id })} style={{ opacity: c.active ? 1 : 0.72 }}>
                  <td className="c mono muted">{rank.get(c.id)}</td>
                  <td><span className="row" style={{ gap: 8 }}><CoachAvatar g={g} c={c} size={26} /><span className="b">{c.first} {c.last}</span>{c.tier !== 'Unproven' && <span className={`pill ${tierCls(c.tier)}`} style={{ fontSize: 9.5, padding: '1px 7px' }}>{c.tier}</span>}</span></td>
                  <td>{c.teamId && g.teams[c.teamId] ? <span className="row" style={{ gap: 6 }}><TeamLogo team={g.teams[c.teamId]} size={18} /><span className="small">{g.teams[c.teamId].school}</span></span> : <span className="small muted">{c.status}</span>}</td>
                  <td className="r muted">{c.age}</td>
                  <td className="r">{c.seasons}</td>
                  <td className="r num">{wl(c.w, c.l)}</td>
                  <td className="r mono">{pct(c.w, c.l)}</td>
                  <td className="r mono muted">{wl(c.careerW, c.careerL)}</td>
                  <td className="r">{c.bids || '—'}</td>
                  <td className="r mono">{c.bids ? wl(c.ncaaW, c.ncaaL) : '—'}</td>
                  <td className="r">{c.s16 || '—'}</td>
                  <td className="r">{c.f4 || '—'}</td>
                  <td className="r">{c.titles ? <b style={{ color: 'var(--gold)' }}>{c.titles}</b> : '—'}</td>
                  <td className="r">{c.regTitles + c.tournTitles || '—'}</td>
                  <td className="r">{c.coy || '—'}</td>
                  <td className="r">{c.draft || '—'}</td>
                  <td className="r num">{c.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sorted.length > limit && <div style={{ padding: 12, textAlign: 'center' }}><button className="btn sm" onClick={() => setLimit(limit + 100)}>Show more ({sorted.length - limit} left)</button></div>}
        {!sorted.length && <Empty>No coaches match.</Empty>}
      </div>
    </div>
  );
}

function CoachAvatar({ g, c, size }: { g: GameState; c: CoachSummary; size: number }) {
  const team = c.teamId ? g.teams[c.teamId] : c.exit ? g.teams[c.exit.lastTeam] : undefined;
  return <CoachFace c={{ id: c.id, age: c.age, face: c.coach?.face }} size={size} team={team} />;
}

// ======================= detail pages (modals) =======================
function Tile({ label, value, sub, gold }: { label: string; value: React.ReactNode; sub?: React.ReactNode; gold?: boolean }) {
  return (
    <div className="stat-tile" style={{ padding: '10px 12px', borderColor: gold ? 'rgba(246,201,76,.45)' : undefined }}>
      <div className="l">{label}</div>
      <div className="v" style={{ fontSize: 22, color: gold ? 'var(--gold)' : undefined }}>{value}</div>
      {sub != null && <div className="tiny muted" style={{ marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export function ProgramDetail({ id }: { id: string }) {
  const g = useGameState();
  const open = useGame((s) => s.open);
  const { programs, coaches } = useSummaries(g);
  const p = programs.find((x) => x.team.id === id);
  if (!p) return null;
  const t = p.team;
  const rank = programs.indexOf(p) + 1;
  const conf = g.conferences.find((c) => c.id === t.conf);
  const coach = g.coaches[t.coachId];
  const titles = allTitles(g, t.id);
  const vs = t.id !== g.user.teamId ? h2hTeam(g, t.id) : null;
  const games = Math.max(1, p.games);
  // head coaches of this program in the dynasty
  const hc = new Map<string, { w: number; l: number; n: number; bids: number; f4: number; titles: number; from: number; to: number }>();
  for (const r of p.rows) {
    const e = hc.get(r.h.coachId) ?? { w: 0, l: 0, n: 0, bids: 0, f4: 0, titles: 0, from: r.h.season, to: r.h.season };
    e.w += r.h.w; e.l += r.h.l; e.n++; e.to = r.h.season;
    if (!r.live) { if (r.h.ncaaSeed != null) e.bids++; if (['Final Four', 'Runner-up', 'Champion'].includes(r.h.postseason)) e.f4++; if (r.h.postseason === 'Champion') e.titles++; }
    hc.set(r.h.coachId, e);
  }
  const csum = new Map(coaches.map((c) => [c.id, c]));
  const picks = g.draft.filter((d) => d.teamId === t.id).slice().reverse();
  const bestRow = p.best;
  return (
    <div>
      <div className="hero" style={{ padding: '26px 30px 20px' }}>
        <TeamHeroBg team={t} intensity={1.1} />
        <div className="row gap-l" style={{ alignItems: 'center' }}>
          <TeamLogo team={t} size={96} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow" style={{ color: 'rgba(255,255,255,.8)' }}>Program Stats · {conf?.name}</div>
            <div className="h1" style={{ fontSize: 42 }}>{t.school} <span style={{ opacity: 0.7, fontSize: 26 }}>{t.mascot}</span></div>
            <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>
              <span className="pill">Dynasty rank <b>&nbsp;#{rank}</b>&nbsp;of {programs.length}</span>
              <span className="pill">Score {p.score}</span>
              {titles.length > 0 && <span className="pill gold">🏆 {titles.length} national title{titles.length > 1 ? 's' : ''} all-time</span>}
              {coach && <span className="pill link" onClick={() => open({ kind: 'coach', id: coach.id })}>🧢 {coach.isUser ? 'You' : `${coach.first} ${coach.last}`}</span>}
              <span className="pill link" onClick={() => open({ kind: 'team', id: t.id })}>Team page →</span>
            </div>
          </div>
        </div>
      </div>
      <div style={{ padding: '6px 30px 26px' }}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 10, marginTop: 10 }}>
          <Tile label="Record" value={wl(p.w, p.l)} sub={`${pct(p.w, p.l)} · ${p.seasons} season${p.seasons === 1 ? '' : 's'}`} />
          <Tile label="Conference" value={wl(p.cw, p.cl)} sub={`${p.regTitles} reg. · ${p.tournTitles} tourn. titles`} />
          <Tile label="NCAA bids" value={p.bids} sub={p.bids ? `${wl(p.ncaaW, p.ncaaL)} in the tournament` : undefined} />
          <Tile label="Sweet 16s" value={p.s16} sub={`${p.e8} Elite Eight${p.e8 === 1 ? '' : 's'}`} />
          <Tile label="Final Fours" value={p.f4} sub={p.ru ? `${p.ru} runner-up` : undefined} />
          <Tile label="Titles" value={p.titles} gold={p.titles > 0} sub={p.preTitles ? `+${p.preTitles} before the dynasty` : undefined} />
          <Tile label="Weeks ranked" value={p.wk} sub={`${p.w1} at No. 1`} />
          <Tile label="vs Top 25" value={wl(p.rw, p.rl)} sub={pct(p.rw, p.rl)} />
          <Tile label="Final AP Top 25" value={p.top25} sub={`${p.top10} in the top 10`} />
          <Tile label="Home" value={wl(p.hw, p.hl)} sub={pct(p.hw, p.hl)} />
          <Tile label="Road" value={wl(p.aw, p.al)} sub={pct(p.aw, p.al)} />
          <Tile label="Scoring" value={p.games ? f1(p.pf / games) : '—'} sub={p.games ? `allowing ${f1(p.pa / games)}` : undefined} />
          <Tile label="Drafted" value={p.draft} sub={`${p.firstRd} first-rounders`} />
          <Tile label="All-Americans" value={p.aa} sub={`${p.poy} Player${p.poy === 1 ? '' : 's'} of the Year`} />
          <Tile label="Avg. class rank" value={p.classAvg != null ? f1(p.classAvg) : '—'} sub={`${p.topClasses} top-10 class${p.topClasses === 1 ? '' : 'es'}`} />
          <Tile label="Head coaches" value={p.coaches} sub={`${p.jerseys} retired jersey${p.jerseys === 1 ? '' : 's'}`} />
        </div>

        <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
          {bestRow && <span className="pill">⭐ Best season: {seasonLabel(bestRow.season)}, {bestRow.w}-{bestRow.l}{bestRow.postseason ? `, ${bestRow.postseason}` : ''}</span>}
          {p.streak.n > 0 && <span className="pill">🔥 Longest win streak: {p.streak.n} ({seasonLabel(p.streak.s)})</span>}
          {p.bigWin && <span className="pill">💥 Biggest win: +{p.bigWin.m} vs {g.teams[p.bigWin.opp]?.school ?? '—'} ({seasonLabel(p.bigWin.s)})</span>}
          {vs && vs[0] + vs[1] > 0 && <span className="pill blue">Your record vs {t.school}: {wl(vs[0], vs[1])}</span>}
        </div>

        <div className="eyebrow" style={{ margin: '18px 0 8px' }}>Season by Season</div>
        {p.rows.length === 0 ? <div className="small muted">No seasons in the books yet.</div> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Season</th><th>Coach</th><th className="r">W-L</th><th className="r">Conf</th><th className="r">Home · Away</th><th className="r">vs T25</th><th className="r">Pts · Opp</th><th className="r">Streak</th><th className="r">Ranked</th><th className="c">AP</th><th>Postseason</th><th className="r">Class</th></tr></thead>
              <tbody>
                {[...p.rows].reverse().map(({ h, x, live }) => {
                  const c = csum.get(h.coachId);
                  const gp = Math.max(1, h.w + h.l);
                  return (
                    <tr key={h.season} className={h.coachId === g.user.coachId ? 'me' : ''}>
                      <td className="b">{seasonLabel(h.season)}{live && <span className="tiny muted"> · now</span>}</td>
                      <td className="small">{c ? <span className="link" onClick={() => open({ kind: 'coach', id: c.id })}>{c.first[0]}. {c.last}</span> : '—'}</td>
                      <td className="r num">{h.w}-{h.l}</td><td className="r mono muted">{h.cw}-{h.cl}{h.confChamp ? ' 👑' : ''}{h.confTourneyChamp ? ' ✂️' : ''}</td>
                      <td className="r mono">{x ? `${wl(x.hw, x.hl)} · ${wl(x.aw + x.nw, x.al + x.nl)}` : '—'}</td><td className="r mono">{x ? wl(x.rw, x.rl) : '—'}</td>
                      <td className="r mono">{x ? `${f1(x.pf / gp)} · ${f1(x.pa / gp)}` : '—'}</td><td className="r">{x?.st || '—'}</td>
                      <td className="r small">{x?.wk ? `${x.wk} wk${x.hi ? ` · peak #${x.hi}` : ''}` : '—'}</td><td className="c">{h.apFinal ? <span className="rank">{h.apFinal}</span> : '—'}</td>
                      <td>{h.postseason ? <span className={POST_CLS(h.postseason)}>{h.postseason}</span> : <span className="dim">{live ? 'in progress' : '—'}</span>}{h.ncaaSeed ? <span className="tiny muted"> ({h.ncaaSeed}{x && x.tw + x.tl ? `, ${wl(x.tw, x.tl)}` : ''})</span> : null}</td>
                      <td className="r">{x?.cr ? `#${x.cr}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid g2" style={{ gap: 16, marginTop: 18 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Head Coaches</div>
            {[...hc.entries()].reverse().map(([cid, e]) => {
              const c = csum.get(cid);
              return (
                <div key={cid} className="row click" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)', cursor: c ? 'pointer' : undefined }} onClick={() => c && open({ kind: 'coach', id: cid })}>
                  {c && <CoachAvatar g={g} c={c} size={30} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="small b">{c ? `${c.first} ${c.last}` : 'Former coach'}{c?.isUser ? ' (You)' : ''}</div>
                    <div className="tiny muted">{seasonLabel(e.from)}{e.to !== e.from ? ` to ${seasonLabel(e.to)}` : ''} · {plural(e.n, 'season')}</div>
                  </div>
                  <span className="small num">{wl(e.w, e.l)}</span>
                  <span className="tiny muted" style={{ width: 120, textAlign: 'right' }}>{e.bids} NCAA{e.f4 ? ` · ${e.f4} F4` : ''}{e.titles ? ` · ${e.titles} 🏆` : ''}</span>
                </div>
              );
            })}
            {!hc.size && <div className="small muted">No completed seasons yet.</div>}
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Pros Produced</div>
            {picks.slice(0, 8).map((d) => (
              <div key={`${d.season}-${d.pick}`} className="row" style={{ padding: '5px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="num" style={{ width: 34, color: d.round === 1 ? 'var(--gold)' : 'var(--muted)' }}>#{d.pick}</span>
                <span className="small b" style={{ flex: 1 }}>{d.name} <span className="muted">· {d.pos}</span></span>
                <span className="tiny muted">{d.nbaTeam} · {d.season}</span>
              </div>
            ))}
            {!picks.length && <div className="small muted">Nobody drafted yet.</div>}
            {picks.length > 8 && <div className="tiny muted" style={{ marginTop: 6 }}>+{picks.length - 8} more</div>}
          </div>
        </div>
        {titles.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>National Championships</div>
            <div className="row wrap" style={{ gap: 6 }}>{titles.map((x) => <span key={x.year} className={`pill ${x.dynasty ? 'gold' : ''}`}>🏆 {x.year}</span>)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

const RUN_PTS: Record<string, number> = { Champion: 40, 'Runner-up': 24, 'Final Four': 16, 'Elite Eight': 9, 'Sweet 16': 5, 'Round of 32': 2.5, 'Round of 64': 1, 'First Four': 0.5 };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function CoachDetail({ id }: { id: string }) {
  const g = useGameState();
  const open = useGame((s) => s.open);
  const { coaches } = useSummaries(g);
  const c = coaches.find((x) => x.id === id);
  if (!c) return <div className="empty">This coach is no longer in the record book.</div>;
  const rank = coaches.indexOf(c) + 1;
  const team: Team | undefined = c.teamId ? g.teams[c.teamId] : c.exit ? g.teams[c.exit.lastTeam] : undefined;
  const vs = !c.isUser ? h2hCoach(g, c.id) : null;
  const stops = new Map<string, { w: number; l: number; n: number }>();
  for (const r of c.rows) { const e = stops.get(r.teamId) ?? { w: 0, l: 0, n: 0 }; e.w += r.h.w; e.l += r.h.l; e.n++; stops.set(r.teamId, e); }
  const done = c.rows.filter((r) => !r.live);
  const parts: [string, number][] = [
    ['Tournament runs', Math.round(done.reduce((s, r) => s + (RUN_PTS[r.h.postseason] ?? 0), 0) * 10) / 10],
    ['NCAA bids', c.bids],
    ['Conference titles', c.regTitles * 4 + c.tournTitles * 2],
    ['Top-25 finishes', done.reduce((s, r) => s + (r.h.apFinal ? (r.h.apFinal <= 10 ? 3 : 1) : 0), 0)],
    ['Winning', Math.round(done.reduce((s, r) => s + (r.h.w - r.h.l) * 0.12, 0) * 10) / 10],
    ['Coach of the Year', c.coy * 6],
    ['Players (POY, first-rounders)', Math.round((c.poy * 3 + c.firstRd * 0.6) * 10) / 10],
    ['Before the dynasty', Math.round(Math.max(0, c.preW * 0.1 - c.preL * 0.05) * 10) / 10],
  ];
  return (
    <div>
      <div className="hero" style={{ padding: '26px 30px 20px' }}>
        <TeamHeroBg team={team ?? { colors: ['#2a3550', '#9fb0cc'] }} />
        <div className="row gap-l" style={{ alignItems: 'center' }}>
          <CoachAvatar g={g} c={c} size={110} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow" style={{ color: 'rgba(255,255,255,.8)' }}>Coach Profile · {c.archetype} · Age {c.age}</div>
            <div className="h1" style={{ fontSize: 42 }}>{c.first} {c.last}{c.isUser ? <span style={{ fontSize: 22, opacity: 0.7 }}> (You)</span> : null}</div>
            <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>
              {team && c.active ? <span className="pill link" onClick={() => open({ kind: 'program', id: team.id })}><TeamLogo team={team} size={16} />&nbsp;{team.school}</span> : <span className="pill">{c.status}</span>}
              <span className={`pill ${tierCls(c.tier)}`}>{c.tier}</span>
              <span className="pill">Legacy rank <b>&nbsp;#{rank}</b>&nbsp;of {coaches.length}</span>
              {c.rep != null && <span className="pill">Reputation {Math.round(c.rep)}</span>}
              {vs && vs[0] + vs[1] > 0 && <span className="pill blue">Your record vs him: {wl(vs[0], vs[1])}</span>}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="num" style={{ fontSize: 46, lineHeight: 1 }}>{c.score}</div>
            <div className="tiny muted upper" style={{ letterSpacing: '.1em' }}>Legacy score</div>
          </div>
        </div>
      </div>
      <div style={{ padding: '6px 30px 26px' }}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 10, marginTop: 10 }}>
          <Tile label="Dynasty record" value={wl(c.w, c.l)} sub={`${pct(c.w, c.l)} · ${plural(c.seasons, 'season')}`} />
          <Tile label="Career record" value={wl(c.careerW, c.careerL)} sub={c.preW + c.preL ? `${wl(c.preW, c.preL)} before the dynasty` : 'all in the dynasty'} />
          <Tile label="Conference" value={wl(c.cw, c.cl)} sub={`${c.regTitles} reg. · ${c.tournTitles} tourn. titles`} />
          <Tile label="NCAA bids" value={c.bids} sub={c.bids ? `${wl(c.ncaaW, c.ncaaL)} in the tournament` : undefined} />
          <Tile label="Sweet 16s" value={c.s16} />
          <Tile label="Final Fours" value={c.f4} />
          <Tile label="Titles" value={c.titles} gold={c.titles > 0} />
          <Tile label="Coach of the Year" value={c.coy} gold={c.coy > 0} />
          <Tile label="Pros coached" value={c.draft} sub={`${c.firstRd} first-rounders`} />
          <Tile label="All-Americans" value={c.aa} sub={`${c.poy} Player${c.poy === 1 ? '' : 's'} of the Year`} />
        </div>

        <div className="grid g2" style={{ gap: 16, marginTop: 18 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Legacy Score Breakdown</div>
            {parts.map(([label, v]) => (
              <div key={label} className="row small" style={{ padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ flex: 1 }}>{label}</span><span className="num" style={{ color: v < 0 ? 'var(--bad)' : undefined }}>{v > 0 ? '+' : ''}{v}</span>
              </div>
            ))}
            <div className="tiny muted" style={{ marginTop: 6 }}>Tiers: Unproven, Rising (15), Proven (45), Elite (100), Hall of Famer (140), Legend (260).</div>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Coaching Stops</div>
            {[...stops.entries()].map(([tid, e]) => (
              <div key={tid} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                {g.teams[tid] && <TeamLogo team={g.teams[tid]} size={24} />}
                <span className="small b link" style={{ flex: 1 }} onClick={() => open({ kind: 'program', id: tid })}>{g.teams[tid]?.school ?? tid}</span>
                <span className="tiny muted">{plural(e.n, 'season')}</span>
                <span className="small num" style={{ width: 64, textAlign: 'right' }}>{wl(e.w, e.l)}</span>
              </div>
            ))}
            {!stops.size && <div className="small muted">No dynasty seasons yet.</div>}
          </div>
        </div>

        <div className="eyebrow" style={{ margin: '18px 0 8px' }}>Season by Season</div>
        {c.rows.length === 0 ? <div className="small muted">No seasons in the books yet.</div> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Season</th><th>School</th><th className="r">W-L</th><th className="r">Conf</th><th className="r">Finish</th><th>Postseason</th><th className="c">Seed</th><th className="c">AP</th><th className="r">Score</th></tr></thead>
              <tbody>
                {[...c.rows].reverse().map((r) => {
                  const t = g.teams[r.teamId];
                  return (
                    <tr key={`${r.season}-${r.teamId}`}>
                      <td className="b">{seasonLabel(r.season)}{r.live && <span className="tiny muted"> · now</span>}{r.coy && <span title="Coach of the Year"> 🧢</span>}</td>
                      <td>{t ? <TeamName team={t} showRank={false} logo={18} /> : r.teamId}</td>
                      <td className="r num">{r.h.w}-{r.h.l}</td>
                      <td className="r mono muted">{r.h.cw}-{r.h.cl}</td>
                      <td className="r">{r.h.confFinish ? `${r.h.confFinish}${r.h.confChamp ? ' 👑' : ''}` : '—'}{r.h.confTourneyChamp ? ' ✂️' : ''}</td>
                      <td>{r.h.postseason ? <span className={POST_CLS(r.h.postseason)}>{r.h.postseason}</span> : <span className="dim">{r.live ? 'in progress' : '—'}</span>}</td>
                      <td className="c mono">{r.h.ncaaSeed ?? '—'}</td>
                      <td className="c">{r.h.apFinal ? <span className="rank">{r.h.apFinal}</span> : '—'}</td>
                      <td className="r mono">{r.live ? '—' : f1(seasonScore(r.h))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ======================= Hall of Fame =======================
function HallOfFameBoard({ g, coaches }: { g: GameState; coaches: CoachSummary[] }) {
  const inductees = g.hof?.inductees ?? [];
  const classes = useMemo(() => {
    const by = new Map<number, typeof inductees>();
    for (const h of inductees) by.set(h.cls, [...(by.get(h.cls) ?? []), h]);
    return [...by.entries()].sort((a, b) => b[0] - a[0]);
  }, [inductees.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const me = coaches.find((c) => c.isUser);
  const pace = me ? Math.min(1, Math.max(me.score / HOF_COACH_SCORE, me.careerW / HOF_COACH_WINS)) : 0;
  const shows = [...(g.awardsShows ?? [])].reverse();
  const mine = inductees.filter((h) => h.teamId === g.user.teamId);
  return (
    <div className="grid g-main" style={{ alignItems: 'start' }}>
      <div className="col" style={{ gap: 16 }}>
        {classes.length === 0 ? (
          <div className="card"><Empty>The Hall of Fame opens its doors at the first Awards Night, at the end of this season.</Empty></div>
        ) : classes.map(([cls, list]) => (
          <div key={cls} className="card">
            <div className="card-head"><div className="h3">Class of {cls + 1}</div><span className="tiny muted">{list.length} inductee{list.length === 1 ? '' : 's'}{list.some((h) => h.id.startsWith('legend:')) ? ' · charter class' : ''}</span></div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {list.map((h) => <Plaque key={h.kind + h.id} g={g} h={h} />)}
            </div>
          </div>
        ))}
      </div>
      <div className="col" style={{ gap: 16 }}>
        <div className="card glow">
          <div className="card-head"><div className="h3">Your Hall of Fame Pace</div></div>
          {me && (
            <>
              <div className="row" style={{ gap: 12 }}>
                <CoachFace c={{ id: me.id, age: me.age, face: me.coach?.face }} size={56} team={g.teams[g.user.teamId]} />
                <div style={{ flex: 1 }}>
                  <div className="small">Legacy score <b>{me.score}</b> / {HOF_COACH_SCORE}</div>
                  <div className="small">Career wins <b>{me.careerW}</b> / {HOF_COACH_WINS}</div>
                </div>
                <div className="num" style={{ fontSize: 30 }}>{Math.round(pace * 100)}%</div>
              </div>
              <div className="heat-bar" style={{ width: '100%', height: 10, marginTop: 10 }}><i style={{ width: `${Math.max(3, pace * 100)}%`, background: 'linear-gradient(90deg,#8a6d3b,#f6c94c)' }} /></div>
              <div className="tiny muted" style={{ marginTop: 8 }}>Coaches get in a year after they retire with a Legacy Score of {HOF_COACH_SCORE} (Hall of Famer tier) or {HOF_COACH_WINS} career wins. {pace >= 1 ? 'You’re a lock.' : 'Titles and Final Fours move the needle fastest.'}</div>
            </>
          )}
        </div>
        <div className="card">
          <div className="card-head"><div className="h3">How Players Get In</div></div>
          <div className="small muted" style={{ lineHeight: 1.5 }}>Once their college careers are over, players are judged on their hardware: National Player of the Year (40), First Team All-American (15 each), Final Four MOP (12), Defensive Player of the Year (8), plus a retired jersey (15). {HOF_PLAYER_BAR} gets you in. Up to three players and two coaches go in each year.</div>
          {mine.length > 0 && <div className="small" style={{ marginTop: 10 }}>From {g.teams[g.user.teamId].school}: <b>{mine.map((h) => h.name).join(', ')}</b></div>}
        </div>
        <div className="card">
          <div className="card-head"><div className="h3">Awards Night</div><span className="tiny muted">Replay any show</span></div>
          {shows.length === 0 && <div className="small muted">The first Awards Night happens when the season ends.</div>}
          {shows.map((s) => {
            const poy = s.categories.find((c) => c.key === 'poy');
            const w = poy?.nominees[poy.winner];
            return (
              <div key={s.season} className="row" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)', gap: 10 }}>
                <span className="b" style={{ width: 70 }}>{seasonLabel(s.season)}</span>
                <span className="small muted ellipsis" style={{ flex: 1 }}>{w ? `POY: ${w.name}` : ''}</span>
                <button className="btn sm" onClick={() => replayAwardsNight(s.season)}>▶ Replay</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
