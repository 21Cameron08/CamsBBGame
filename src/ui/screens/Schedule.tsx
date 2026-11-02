import { motion } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { TeamLogo, TeamName, Section } from '../components/common';
import { spread } from '../../engine/rankings';
import { isRivalry } from '../../engine/season';
import { seasonLabel } from '../../engine/calendar';
import type { ScheduledGame } from '../../engine/types';

const TYPE_LABEL: Record<ScheduledGame['type'], string> = { nc: 'Non-Conf', conf: 'Conference', ctourn: 'Conf. Tournament', ncaa: 'NCAA Tournament', exh: 'Exhibition' };

export function ScheduleScreen() {
  const g = useGameState();
  const user = g.teams[g.user.teamId];
  const open = useGame((s) => s.open);
  const games = g.schedule.filter((x) => x.home === user.id || x.away === user.id).sort((a, b) => a.day - b.day);
  const months = new Map<string, ScheduledGame[]>();
  for (const x of games) {
    const d = g.calendar[x.day]?.date ?? '';
    const key = d ? new Date(d + 'T12:00:00Z').toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'Postseason';
    if (!months.has(key)) months.set(key, []);
    months.get(key)!.push(x);
  }
  const played = games.filter((x) => x.played);
  const r = user.record;
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">{seasonLabel(g.season)} schedule · {games.length} games</div>
          <h1 className="h1" style={{ marginTop: 6 }}>Schedule & Results</h1>
        </div>
        <div className="spacer" />
        <div className="row">
          <div className="stat-tile"><div className="l">Overall</div><div className="v">{r.w}-{r.l}</div></div>
          <div className="stat-tile"><div className="l">Home</div><div className="v">{r.hw}-{r.hl}</div></div>
          <div className="stat-tile"><div className="l">Away</div><div className="v">{r.aw}-{r.al}</div></div>
          <div className="stat-tile"><div className="l">Neutral</div><div className="v">{r.nw}-{r.nl}</div></div>
          <div className="stat-tile"><div className="l">PPG / OPP</div><div className="v" style={{ fontSize: 22 }}>{played.length ? (r.pf / played.length).toFixed(1) : '—'} / {played.length ? (r.pa / played.length).toFixed(1) : '—'}</div></div>
        </div>
      </div>
      {g.phase === 'scheduling' && (
        <div className="card glow mb row">
          <span style={{ fontSize: 26 }}>🗓️</span>
          <div style={{ flex: 1 }}><div className="b">You're building the {seasonLabel(g.season + 1)} non-conference schedule</div><div className="small muted">These are last season's results. Book next year's games in the Scheduling Office.</div></div>
          <button className="btn primary" onClick={() => useGame.getState().nav('offseason')}>Open Scheduling Office →</button>
        </div>
      )}
      {[...months.entries()].map(([m, list]) => (
        <Section key={m} title={m} className="mb">
          <div className="col" style={{ gap: 6 }}>
            {list.map((x, i) => {
              const isHome = x.home === user.id;
              const opp = g.teams[isHome ? x.away : x.home];
              const us = isHome ? x.hs : x.as, them = isHome ? x.as : x.hs;
              const won = x.played && (us ?? 0) > (them ?? 0);
              const today = x.day === g.day && !x.played;
              const sp = !x.played ? spread(g, x.home, x.away, x.neutral) : 0;
              const userLine = isHome ? sp : -sp;
              const rv = isRivalry(x.home, x.away);
              const hasBox = !!g.boxScores[x.id];
              return (
                <motion.div key={x.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.025, 0.4) }}
                  className="row" onClick={() => { if (hasBox) open({ kind: 'box', gameId: x.id }); else if (today) open({ kind: 'pregame', gameId: x.id }); }}
                  style={{ padding: '10px 12px', borderRadius: 12, background: today ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'rgba(255,255,255,.025)', border: `1px solid ${today ? 'var(--accent)' : 'var(--line)'}`, cursor: hasBox || today ? 'pointer' : 'default' }}>
                  <div style={{ width: 92 }}>
                    <div className="small b">{g.calendar[x.day]?.label.split(' · ')[0]}</div>
                    <div className="tiny dim">{TYPE_LABEL[x.type]}</div>
                  </div>
                  <span className="pill" style={{ width: 34, justifyContent: 'center' }}>{x.neutral ? 'N' : isHome ? 'H' : '@'}</span>
                  <TeamLogo team={opp} size={30} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="b ellipsis"><TeamName team={opp} /></div>
                    <div className="tiny muted ellipsis">{opp.record.w}-{opp.record.l} · {g.conferences.find((c) => c.id === opp.conf)?.short}{x.event ? ` · ${x.event}` : ''}</div>
                  </div>
                  {rv && <span className="pill bad">🔥 Rivalry</span>}
                  {x.tv && <span className="tiny muted" style={{ width: 120, textAlign: 'right' }}>📺 {x.tv}</span>}
                  <div style={{ width: 130, textAlign: 'right' }}>
                    {x.played ? (
                      <span className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                        <span className={`pill ${won ? 'good' : 'bad'}`}>{won ? 'W' : 'L'}</span>
                        <span className="num" style={{ fontSize: 18 }}>{us}-{them}{x.ot ? <span className="tiny muted"> OT</span> : ''}</span>
                      </span>
                    ) : today ? (
                      <span className="pill gold pulse">GAME DAY</span>
                    ) : (
                      <span className="small muted">{userLine === 0 ? 'PK' : `${userLine > 0 ? '-' : '+'}${Math.abs(userLine)}`}</span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </Section>
      ))}
    </div>
  );
}
