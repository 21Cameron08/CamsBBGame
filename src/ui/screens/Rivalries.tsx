// Rivalries 2.0: your rivals, the hottest rivalries in the country, rivalries born (and faded)
// during the dynasty, and a detail page for every rivalry with its series, trophy and history.
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { TeamLogo, Sparkline, Empty, Section } from '../components/common';
import type { GameState, Rivalry, RivalryMeeting } from '../../engine/types';
import { heatInfo, rivalryBook, rivalriesOf, nextMeeting, seriesFor, originLine, userRivalryThisWeek, BORN_AT } from '../../engine/rivalry';
import { seasonLabel } from '../../engine/calendar';
import { teamAccent } from '../color';

const TYPE_LABEL: Record<string, string> = { conf: 'Conference', nc: 'Non-conference', ctourn: 'Conf. tournament', ncaa: 'NCAA Tournament', exh: 'Exhibition' };

export function HeatMeter({ heat, size = 'md' }: { heat: number; size?: 'sm' | 'md' | 'lg' }) {
  const h = heatInfo(heat);
  const w = size === 'lg' ? 220 : size === 'sm' ? 70 : 120;
  return (
    <span className="row" style={{ gap: 6, display: 'inline-flex', alignItems: 'center' }} title={`Heat ${Math.round(heat)}/100`}>
      <span className="heat-bar" style={{ width: w, height: size === 'lg' ? 10 : 6 }}><i style={{ width: `${Math.max(4, Math.min(100, heat))}%` }} /></span>
      <span className={`heat-label ${h.cls}`} style={{ fontSize: size === 'lg' ? 14 : 11 }}>{'🔥'.repeat(h.flames)} {h.label}</span>
    </span>
  );
}

function lastLine(g: GameState, r: Rivalry, me: string) {
  const m = r.meetings[r.meetings.length - 1];
  if (!m) return null;
  const won = m.w === me;
  return <span className={won ? 'good' : 'bad'}>{won ? 'W' : 'L'} {m.ws}-{m.ls}</span>;
}

export function RivalryCard({ g, r, me, i = 0 }: { g: GameState; r: Rivalry; me: string; i?: number }) {
  const open = useGame((s) => s.open);
  const us = g.teams[me], them = g.teams[r.a === me ? r.b : r.a];
  const [w, l] = seriesFor(r, me);
  const nx = nextMeeting(g, r);
  const st = r.streak;
  return (
    <motion.div className="card hover riv-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} onClick={() => open({ kind: 'rivalry', id: r.key })}
      style={{ ['--c1' as string]: us.colors[0], ['--c2' as string]: them.colors[0] }}>
      <div className="riv-card-bg" />
      <div className="row" style={{ gap: 10, position: 'relative' }}>
        <TeamLogo team={us} size={42} />
        <span className="num muted" style={{ fontSize: 18 }}>vs</span>
        <TeamLogo team={them} size={42} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="b ellipsis">{r.name}</div>
          <div className="tiny muted ellipsis">{them.school} {them.mascot}{r.origin === 'born' ? ` · born ${r.since}` : ''}</div>
        </div>
      </div>
      <div style={{ marginTop: 10, position: 'relative' }}><HeatMeter heat={r.heat} /></div>
      <div className="row wrap" style={{ gap: 5, marginTop: 10, position: 'relative' }}>
        <span className="pill">Series <b>&nbsp;{w}-{l}</b></span>
        {st && st.n >= 2 && <span className={`pill ${st.t === me ? 'good' : 'bad'}`}>{st.t === me ? 'Won' : 'Lost'} {st.n} straight</span>}
        {r.meetings.length > 0 && <span className="pill">Last: {lastLine(g, r, me)}</span>}
        {r.trophy && <span className={`pill ${r.holder === me ? 'gold' : ''}`}>🏆 {r.trophy}{r.holder ? ` · ${r.holder === me && me === g.user.teamId ? 'yours' : g.teams[r.holder]?.abbr}` : ' · up for grabs'}</span>}
        {nx && <span className="pill blue">Next: {g.calendar[nx.day]?.label.split(' · ')[0]} {nx.neutral ? 'neutral' : nx.home === me ? 'home' : 'away'}</span>}
      </div>
    </motion.div>
  );
}

export function RivalriesScreen() {
  const g = useGameState();
  const open = useGame((s) => s.open);
  const me = g.user.teamId;
  const book = rivalryBook(g);
  const mine = rivalriesOf(g, me);
  const simmer = useMemo(() => Object.values(book.pairs).filter((r) => !r.active && !r.faded && (r.a === me || r.b === me) && r.heat >= 12).sort((a, b) => b.heat - a.heat).slice(0, 6), [g.day, g.season, me]); // eslint-disable-line react-hooks/exhaustive-deps
  const hottest = useMemo(() => Object.values(book.pairs).filter((r) => r.active && r.a !== me && r.b !== me).sort((a, b) => b.heat - a.heat).slice(0, 25), [g.day, g.season, me]); // eslint-disable-line react-hooks/exhaustive-deps
  const born = useMemo(() => Object.values(book.pairs).filter((r) => r.origin === 'born' && (r.active || r.faded)).sort((a, b) => b.since - a.since || b.heat - a.heat), [g.day, g.season]); // eslint-disable-line react-hooks/exhaustive-deps
  const week = userRivalryThisWeek(g);
  const trophies = mine.filter((r) => r.trophy && r.holder === me);
  const team = g.teams[me];
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card riv-hero">
        <div className="riv-hero-bg" style={{ background: `radial-gradient(900px 280px at 0% 0%, ${team.colors[0]}88, transparent 60%), radial-gradient(700px 260px at 100% 100%, rgba(255,90,40,.35), transparent 60%), linear-gradient(135deg, #1a0d0a, #0b1220 70%)` }} />
        <div className="row" style={{ position: 'relative', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="eyebrow" style={{ color: '#ffb27a' }}>Rivalries 2.0 · tracked since {seasonLabel(book.since)}</div>
            <div className="h1" style={{ fontSize: 42 }}>🔥 Rivalries</div>
            <div className="small" style={{ opacity: 0.85, maxWidth: 640 }}>Rivalries heat up with close games, upsets, ranked showdowns and March meetings, and cool off when one side dominates. New ones are born from tournament grudges, coaches switching schools, star transfers and recruiting wars. Trophies go to the winner of every meeting.</div>
          </div>
          <div className="spacer" />
          <div className="grid g3" style={{ gap: 10, minWidth: 330 }}>
            {[['Your rivals', mine.length], ['Trophies held', trophies.length], ['New rivalries (league)', born.filter((r) => r.active).length]].map(([l, v]) => (
              <div key={String(l)} className="stat-tile" style={{ padding: '10px 12px', background: 'rgba(0,0,0,.3)' }}><div className="l">{l}</div><div className="v" style={{ fontSize: 24 }}>{v}</div></div>
            ))}
          </div>
        </div>
      </div>

      {week && (
        <motion.div className="card riv-week" initial={{ scale: 0.98, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={() => open({ kind: 'rivalry', id: week.r.key })}>
          <span className="riv-week-tag">RIVALRY WEEK</span>
          <TeamLogo team={g.teams[week.g.away]} size={46} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="h3">{week.r.name}</div>
            <div className="small muted">{g.teams[week.g.away].school} at {g.teams[week.g.home].school} · {g.calendar[week.g.day]?.label}</div>
          </div>
          <HeatMeter heat={week.r.heat} />
          <TeamLogo team={g.teams[week.g.home]} size={46} />
        </motion.div>
      )}

      <Section title={`${team.school}'s Rivals`}>
        {mine.length === 0 ? <div className="small muted">No rivals yet. Play enough big games against the same school and one will find you.</div> : (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 12 }}>
            {mine.map((r, i) => <RivalryCard key={r.key} g={g} r={r} me={me} i={i} />)}
          </div>
        )}
        {simmer.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Simmering · could become rivalries at {BORN_AT}</div>
            <div className="col" style={{ gap: 6 }}>
              {simmer.map((r) => {
                const them = g.teams[r.a === me ? r.b : r.a];
                const [w, l] = seriesFor(r, me);
                return (
                  <div key={r.key} className="row small" style={{ gap: 10, padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
                    <TeamLogo team={them} size={22} /><span className="b" style={{ width: 180 }}>{them.school}</span>
                    <span className="heat-bar" style={{ width: 140, height: 6 }}><i style={{ width: `${(r.heat / BORN_AT) * 100}%`, background: 'linear-gradient(90deg,#8a6d3b,#f0a040)' }} /></span>
                    <span className="tiny muted">{Math.round(r.heat)} / {BORN_AT}</span>
                    <span className="spacer" />
                    {w + l > 0 && <span className="tiny muted">Recent meetings {w}-{l}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Section>

      <div className="grid g-main" style={{ alignItems: 'start' }}>
        <div className="card flush">
          <div className="card-head" style={{ padding: '16px 18px 0' }}><div className="h3">Hottest Rivalries in the Country</div></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>#</th><th>Rivalry</th><th>Heat</th><th className="r">Series</th><th>Trophy</th><th className="r">Last</th></tr></thead>
              <tbody>
                {hottest.map((r, i) => {
                  const A = g.teams[r.a], B = g.teams[r.b];
                  const m = r.meetings[r.meetings.length - 1];
                  return (
                    <tr key={r.key} className="click" onClick={() => open({ kind: 'rivalry', id: r.key })}>
                      <td className="muted mono">{i + 1}</td>
                      <td><span className="row" style={{ gap: 6 }}><TeamLogo team={A} size={18} /><TeamLogo team={B} size={18} /><span className="b ellipsis" style={{ maxWidth: 230 }}>{r.name}</span>{r.origin === 'born' && <span className="pill good" style={{ fontSize: 9.5, padding: '1px 6px' }}>NEW</span>}</span></td>
                      <td><HeatMeter heat={r.heat} size="sm" /></td>
                      <td className="r mono small">{A.abbr} {r.series[A.id] ?? 0}-{r.series[B.id] ?? 0}</td>
                      <td className="small">{r.trophy ? <span title={r.trophy}>🏆 {r.holder ? g.teams[r.holder]?.abbr : '—'}</span> : <span className="dim">—</span>}</td>
                      <td className="r small">{m ? `${g.teams[m.w]?.abbr} ${m.ws}-${m.ls}` : <span className="dim">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <Section title="Born in the Dynasty">
          {born.length === 0 && <div className="small muted">No new rivalries yet. Give it a March or two.</div>}
          {born.slice(0, 14).map((r) => (
            <div key={r.key} className="row click" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)', gap: 8, opacity: r.faded ? 0.55 : 1, cursor: 'pointer' }} onClick={() => open({ kind: 'rivalry', id: r.key })}>
              <TeamLogo team={g.teams[r.a]} size={22} /><TeamLogo team={g.teams[r.b]} size={22} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="small b ellipsis">{r.name}</div>
                <div className="tiny muted ellipsis">{r.faded ? 'Faded' : `Born ${r.since}`} · {r.reason}</div>
              </div>
              {!r.faded && <HeatMeter heat={r.heat} size="sm" />}
            </div>
          ))}
        </Section>
      </div>
    </div>
  );
}

function meetingLabel(m: RivalryMeeting) {
  return m.ev ? m.ev.replace(/ · .*\(/, ' (') : TYPE_LABEL[m.t] ?? '';
}

export function RivalryDetail({ id }: { id: string }) {
  const g = useGameState();
  const open = useGame((s) => s.open);
  const r = g.rivals?.pairs[id];
  if (!r) return <div className="empty">That rivalry has cooled off for good.</div>;
  const me = g.user.teamId;
  // you're always on the left
  const left = g.teams[r.b === me ? r.b : r.a];
  const right = g.teams[left.id === r.a ? r.b : r.a];
  const [lw, rw] = seriesFor(r, left.id);
  const nx = nextMeeting(g, r);
  const heatData = [...r.heatLog.map((x) => x[1]), Math.round(r.heat)];
  const h = heatInfo(r.heat);
  return (
    <div>
      <div className="hero" style={{ padding: '26px 30px 22px' }}>
        <div className="hero-bg" style={{ background: `linear-gradient(105deg, ${left.colors[0]} 0%, ${left.colors[0]}88 32%, #0b0d14 49.5%, #0b0d14 50.5%, ${right.colors[0]}88 68%, ${right.colors[0]} 100%)` }} />
        <div className="eyebrow" style={{ textAlign: 'center', color: '#ffd0a8' }}>{r.origin === 'historic' ? 'Historic rivalry' : r.faded ? 'Faded rivalry' : `Rivalry born ${r.since}`}</div>
        <div className="h1" style={{ textAlign: 'center', fontSize: 40, marginTop: 4 }}>{r.name}</div>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          <div style={{ textAlign: 'center', flex: 1, cursor: 'pointer' }} onClick={() => open({ kind: 'program', id: left.id })}>
            <TeamLogo team={left} size={104} />
            <div className="h3" style={{ marginTop: 6 }}>{left.school}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="num" style={{ fontSize: 64, lineHeight: 1 }}><span style={{ color: teamAccent(left.colors) }}>{lw}</span><span className="muted"> – </span><span style={{ color: teamAccent(right.colors) }}>{rw}</span></div>
            <div className="tiny muted upper" style={{ letterSpacing: '.12em' }}>Series since {r.since}</div>
            <div style={{ marginTop: 10 }}><HeatMeter heat={r.heat} size="lg" /></div>
          </div>
          <div style={{ textAlign: 'center', flex: 1, cursor: 'pointer' }} onClick={() => open({ kind: 'program', id: right.id })}>
            <TeamLogo team={right} size={104} />
            <div className="h3" style={{ marginTop: 6 }}>{right.school}</div>
          </div>
        </div>
      </div>
      <div style={{ padding: '12px 30px 26px' }}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
          <div className="stat-tile" style={{ padding: '10px 12px', borderColor: r.trophy ? 'rgba(246,201,76,.45)' : undefined }}>
            <div className="l">Trophy</div>
            {r.trophy ? <><div className="b" style={{ marginTop: 4, color: 'var(--gold)' }}>🏆 {r.trophy}</div><div className="tiny muted" style={{ marginTop: 3 }}>{r.holder ? `Held by ${g.teams[r.holder]?.school}` : 'Up for grabs'}</div></> : <div className="tiny muted" style={{ marginTop: 6 }}>Commissioned when the rivalry gets hot enough (or when you're in it).</div>}
          </div>
          <div className="stat-tile" style={{ padding: '10px 12px' }}><div className="l">Streak</div><div className="v" style={{ fontSize: 22 }}>{r.streak ? `${g.teams[r.streak.t]?.abbr} ${r.streak.n}` : '—'}</div></div>
          <div className="stat-tile" style={{ padding: '10px 12px' }}><div className="l">Meetings</div><div className="v" style={{ fontSize: 22 }}>{r.total}</div></div>
          <div className="stat-tile" style={{ padding: '10px 12px' }}><div className="l">Biggest win</div><div className="v" style={{ fontSize: 22 }}>{r.big ? `+${r.big.m}` : '—'}</div>{r.big && <div className="tiny muted" style={{ marginTop: 3 }}>{g.teams[r.big.w]?.school}, {seasonLabel(r.big.s)}</div>}</div>
          <div className="stat-tile" style={{ padding: '10px 12px' }}><div className="l">Heat</div><div className="v" style={{ fontSize: 22 }}>{Math.round(r.heat)}</div><div className="tiny muted" style={{ marginTop: 3 }}>{h.label}</div></div>
          {nx && <div className="stat-tile" style={{ padding: '10px 12px' }}><div className="l">Next meeting</div><div className="b" style={{ marginTop: 4 }}>{g.calendar[nx.day]?.label.split(' · ')[0]}</div><div className="tiny muted" style={{ marginTop: 3 }}>{nx.neutral ? 'Neutral site' : `at ${g.teams[nx.home].school}`}</div></div>}
        </div>
        <div className="small" style={{ marginTop: 12, opacity: 0.85 }}>{originLine(g, r)}</div>
        {heatData.length >= 2 && (
          <div className="row" style={{ gap: 12, marginTop: 12 }}>
            <span className="tiny muted upper" style={{ letterSpacing: '.1em' }}>Heat by season</span>
            <Sparkline data={heatData} w={260} h={34} color="#ff7a3d" />
          </div>
        )}
        <div className="eyebrow" style={{ margin: '18px 0 8px' }}>Meetings</div>
        {r.meetings.length === 0 ? <Empty>They haven't met since tracking began.</Empty> : (
          <table className="table">
            <thead><tr><th>Season</th><th>Game</th><th>Winner</th><th className="r">Score</th></tr></thead>
            <tbody>
              {[...r.meetings].reverse().map((m, i) => {
                const wt = g.teams[m.w];
                return (
                  <tr key={i}>
                    <td className="b">{seasonLabel(m.s)}</td>
                    <td className="small muted">{meetingLabel(m)}{m.t === 'ncaa' ? ' 🏀' : ''}</td>
                    <td><span className="row" style={{ gap: 6 }}><TeamLogo team={wt} size={18} /><span className="small b">{wt?.school}</span></span></td>
                    <td className="r num">{m.ws}-{m.ls}{m.ot ? ' OT' : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/** One-line rivalry summary for game previews */
export function RivalryStrip({ g, r, me }: { g: GameState; r: Rivalry; me: string }) {
  const [w, l] = seriesFor(r, me);
  const st = r.streak;
  return (
    <div className="riv-strip">
      <span className="riv-week-tag" style={{ fontSize: 10, padding: '3px 8px' }}>RIVALRY</span>
      <span className="b">{r.name}</span>
      <HeatMeter heat={r.heat} size="sm" />
      <span className="small">Series <b>{w}-{l}</b></span>
      {st && st.n >= 2 && <span className={`small ${st.t === me ? 'good' : 'bad'}`}>{st.t === me ? 'Won' : 'Lost'} {st.n} straight</span>}
      {r.trophy && <span className="small" style={{ color: r.holder === me ? 'var(--gold)' : undefined }}>🏆 {r.trophy}{r.holder ? ` (${r.holder === me && me === g.user.teamId ? 'yours' : g.teams[r.holder]?.abbr})` : ''}</span>}
      {r.meetings.length > 0 && <span className="small muted">Last: {lastLine(g, r, me)}</span>}
    </div>
  );
}
