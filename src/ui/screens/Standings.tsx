import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { TeamLogo, TeamName, Section } from '../components/common';
import { confStandings } from '../../engine/rankings';
import type { Team } from '../../engine/types';
import { seasonLabel } from '../../engine/calendar';

function streakStr(s: number) {
  if (s === 0) return '—';
  return s > 0 ? `W${s}` : `L${-s}`;
}
function pct(w: number, l: number) {
  const g = w + l;
  return g ? (w / g).toFixed(3).replace(/^0/, '') : '.000';
}

export function StandingsScreen() {
  const g = useGameState();
  const open = useGame((s) => s.open);
  const userConf = g.teams[g.user.teamId].conf;
  const [confId, setConfId] = useState(userConf);
  const conf = g.conferences.find((c) => c.id === confId) ?? g.conferences[0];
  const rows = useMemo(() => confStandings(g, conf.id), [g, g.day, conf.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const leader = rows[0];
  const leaders = useMemo(() => g.conferences.map((c) => ({ c, t: confStandings(g, c.id)[0] as Team | undefined })).filter((x) => x.t), [g, g.day]); // eslint-disable-line react-hooks/exhaustive-deps
  const tourney = g.confTourneys[conf.id];
  const gb = (t: Team) => {
    if (!leader) return '—';
    const d = ((leader.record.cw - t.record.cw) + (t.record.cl - leader.record.cl)) / 2;
    return d <= 0 ? '—' : d.toFixed(1).replace('.0', '');
  };
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">{seasonLabel(g.season)} · Conference Standings</div>
          <h1 className="h1">{conf.name}</h1>
        </div>
        <div className="spacer" />
        <select className="select" style={{ width: 280 }} value={conf.id} onChange={(e) => setConfId(e.target.value)}>
          {[...g.conferences].sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name)).map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.id === userConf ? ' (yours)' : ''}</option>
          ))}
        </select>
      </div>

      {leader && (
        <motion.div key={conf.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ marginBottom: 16, overflow: 'hidden', padding: 0 }}>
          <div className="row" style={{ padding: '16px 20px', gap: 16, background: `linear-gradient(110deg, ${leader.colors[0]}cc, transparent 70%)` }}>
            <motion.div initial={{ scale: 0.6, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 15 }}>
              <TeamLogo team={leader} size={64} />
            </motion.div>
            <div>
              <div className="eyebrow" style={{ color: 'rgba(255,255,255,.8)' }}>{g.phase === 'regular' || g.phase === 'preseason' ? 'Conference Leader' : 'Regular-Season Champion'}</div>
              <div className="h2">{leader.school} {leader.mascot}</div>
              <div className="small" style={{ opacity: 0.85 }}>{leader.record.cw}-{leader.record.cl} in conference · {leader.record.w}-{leader.record.l} overall</div>
            </div>
            <div className="spacer" />
            {tourney?.champion && (
              <div className="row" style={{ gap: 10 }}>
                <span style={{ fontSize: 30 }}>🏆</span>
                <div>
                  <div className="eyebrow">Tournament Champion</div>
                  <TeamName team={g.teams[tourney.champion]} logo={24} />
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}

      <div className="card flush" style={{ marginBottom: 20 }}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="c">#</th>
                <th>Team</th>
                <th className="r">Conf</th>
                <th className="r">Pct</th>
                <th className="r">GB</th>
                <th className="r">Overall</th>
                <th className="r">Home</th>
                <th className="r">Away</th>
                <th className="r">Neutral</th>
                <th className="c">Strk</th>
                <th className="r">PF/G</th>
                <th className="r">PA/G</th>
                <th className="r">Rating</th>
                <th className="r">NET</th>
                <th className="c">AP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => {
                const gp = Math.max(1, t.record.w + t.record.l);
                return (
                  <tr key={t.id} style={{ animationDelay: `${Math.min(i * 20, 400)}ms` }}
                    className={`click row-in ${t.id === g.user.teamId ? 'me' : ''}`} onClick={() => open({ kind: 'team', id: t.id })}>
                    <td className="c num" style={{ fontSize: 16, color: i === 0 ? 'var(--gold)' : undefined }}>{i + 1}</td>
                    <td><span className="row" style={{ gap: 8 }}><span style={{ width: 3, height: 22, borderRadius: 2, background: t.colors[0] }} /><TeamLogo team={t} size={24} /><span className="b">{t.school}</span></span></td>
                    <td className="r num" style={{ fontSize: 15 }}>{t.record.cw}-{t.record.cl}</td>
                    <td className="r mono muted">{pct(t.record.cw, t.record.cl)}</td>
                    <td className="r mono muted">{gb(t)}</td>
                    <td className="r mono">{t.record.w}-{t.record.l}</td>
                    <td className="r mono muted">{t.record.hw}-{t.record.hl}</td>
                    <td className="r mono muted">{t.record.aw}-{t.record.al}</td>
                    <td className="r mono muted">{t.record.nw}-{t.record.nl}</td>
                    <td className="c"><span className={t.record.streak > 0 ? 'good b' : t.record.streak < 0 ? 'bad b' : 'dim'}>{streakStr(t.record.streak)}</span></td>
                    <td className="r mono">{(t.record.pf / gp).toFixed(1)}</td>
                    <td className="r mono">{(t.record.pa / gp).toFixed(1)}</td>
                    <td className="r mono" style={{ color: t.rating >= 0 ? 'var(--good)' : 'var(--bad)' }}>{t.rating > 0 ? '+' : ''}{t.rating.toFixed(1)}</td>
                    <td className="r mono">{t.net || '—'}</td>
                    <td className="c">{t.apRank ? <span className="rank">{t.apRank}</span> : <span className="dim">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Section title="Around the Country · Conference Leaders">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
          {leaders.map(({ c, t }) => (
            <div key={c.id} className="row card hover" onClick={() => setConfId(c.id)}
              style={{ padding: '8px 10px', gap: 8, borderColor: c.id === conf.id ? 'var(--accent)' : undefined }}>
              <span className="dot" style={{ background: c.color }} />
              <span className="tiny b muted" style={{ width: 62 }}>{c.short}</span>
              <TeamLogo team={t} size={22} />
              <span className="small b ellipsis" style={{ flex: 1 }}>{t!.school}</span>
              <span className="tiny mono muted">{t!.record.cw}-{t!.record.cl}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
