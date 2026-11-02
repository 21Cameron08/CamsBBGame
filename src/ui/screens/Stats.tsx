import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { TeamLogo, PlayerFace, Tabs, Section, Empty, useSorted } from '../components/common';
import type { GameState, Player } from '../../engine/types';
import { seasonLabel } from '../../engine/calendar';

type Scope = 'all' | 'conf';
type View = 'players' | 'teams';

interface Leader { key: string; label: string; unit: string; val: (p: Player) => number; ok: (p: Player) => boolean; fmt: (v: number) => string }

const pg = (p: Player, v: number) => v / Math.max(1, p.stats.gp);
const LEADERS: Leader[] = [
  { key: 'ppg', label: 'Points', unit: 'PPG', val: (p) => pg(p, p.stats.pts), ok: () => true, fmt: (v) => v.toFixed(1) },
  { key: 'rpg', label: 'Rebounds', unit: 'RPG', val: (p) => pg(p, p.stats.orb + p.stats.drb), ok: () => true, fmt: (v) => v.toFixed(1) },
  { key: 'apg', label: 'Assists', unit: 'APG', val: (p) => pg(p, p.stats.ast), ok: () => true, fmt: (v) => v.toFixed(1) },
  { key: 'spg', label: 'Steals', unit: 'SPG', val: (p) => pg(p, p.stats.stl), ok: () => true, fmt: (v) => v.toFixed(1) },
  { key: 'bpg', label: 'Blocks', unit: 'BPG', val: (p) => pg(p, p.stats.blk), ok: () => true, fmt: (v) => v.toFixed(1) },
  { key: 'fg', label: 'Field Goal %', unit: 'FG%', val: (p) => p.stats.fgm / Math.max(1, p.stats.fga), ok: (p) => p.stats.fga >= Math.max(20, p.stats.gp * 4), fmt: (v) => (v * 100).toFixed(1) },
  { key: 'tp', label: '3-Point %', unit: '3P%', val: (p) => p.stats.tpm / Math.max(1, p.stats.tpa), ok: (p) => p.stats.tpa >= Math.max(12, p.stats.gp * 2), fmt: (v) => (v * 100).toFixed(1) },
  { key: 'ft', label: 'Free Throw %', unit: 'FT%', val: (p) => p.stats.ftm / Math.max(1, p.stats.fta), ok: (p) => p.stats.fta >= Math.max(10, p.stats.gp * 1.5), fmt: (v) => (v * 100).toFixed(1) },
];

export function StatsScreen() {
  const g = useGameState();
  const [scope, setScope] = useState<Scope>('all');
  const [view, setView] = useState<View>('players');
  const userConf = g.teams[g.user.teamId].conf;
  const confShort = g.conferences.find((c) => c.id === userConf)?.short ?? 'Conf';
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">{seasonLabel(g.season)} · Statistics</div>
          <h1 className="h1">Stat Leaders</h1>
        </div>
        <div className="spacer" />
        <Tabs id="stat-scope" value={scope} onChange={setScope} tabs={[{ id: 'all', label: 'National' }, { id: 'conf', label: confShort }]} />
        <Tabs id="stat-view" value={view} onChange={setView} tabs={[{ id: 'players', label: 'Players' }, { id: 'teams', label: 'Teams' }]} />
      </div>
      {view === 'players' ? <PlayerLeaders g={g} scope={scope} /> : <TeamStats g={g} scope={scope} />}
    </div>
  );
}

function PlayerLeaders({ g, scope }: { g: GameState; scope: Scope }) {
  const open = useGame((s) => s.open);
  const userConf = g.teams[g.user.teamId].conf;
  const pool = useMemo(() => {
    const maxGp = Math.max(0, ...Object.values(g.teams).map((t) => t.record.w + t.record.l));
    const minGp = Math.max(1, Math.floor(maxGp * 0.5));
    return Object.values(g.players).filter((p) => p.teamId && p.stats.gp >= minGp && (scope === 'all' || g.teams[p.teamId]?.conf === userConf));
  }, [g, g.day, scope, userConf]); // eslint-disable-line react-hooks/exhaustive-deps
  const boards = useMemo(() => LEADERS.map((L) => ({ L, rows: pool.filter(L.ok).map((p) => ({ p, v: L.val(p) })).sort((a, b) => b.v - a.v).slice(0, 10) })), [pool]);
  if (!pool.length) return <Section><Empty>No stats yet — leaders appear after the first games are played.</Empty></Section>;
  return (
    <div className="grid g2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))' }}>
      {boards.map(({ L, rows }, bi) => {
        const top = rows[0];
        const topTeam = top ? g.teams[top.p.teamId!] : undefined;
        return (
          <motion.div key={L.key} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: bi * 0.04 }} className="card flush">
            {top && topTeam && (
              <div className="row" style={{ padding: '14px 16px', gap: 14, cursor: 'pointer', background: `linear-gradient(110deg, ${topTeam.colors[0]}bb, transparent 75%)` }} onClick={() => open({ kind: 'player', id: top.p.id })}>
                <PlayerFace p={top.p} size={64} team={topTeam} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="eyebrow" style={{ color: 'rgba(255,255,255,.8)' }}>{L.label} Leader</div>
                  <div className="b ellipsis" style={{ fontSize: 16 }}>{top.p.first} {top.p.last}</div>
                  <div className="row tiny" style={{ gap: 6, opacity: 0.85 }}><TeamLogo team={topTeam} size={16} />{topTeam.school} · {top.p.pos} · {top.p.cls}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="num" style={{ fontSize: 40, lineHeight: 1 }}>{L.fmt(top.v)}</div>
                  <div className="tiny upper b muted">{L.unit}</div>
                </div>
              </div>
            )}
            <div style={{ padding: '4px 0' }}>
              {rows.slice(1).map(({ p, v }, i) => {
                const t = g.teams[p.teamId!];
                return (
                  <div key={p.id} className="row" onClick={() => open({ kind: 'player', id: p.id })}
                    style={{ padding: '5px 16px', cursor: 'pointer', gap: 9, background: p.teamId === g.user.teamId ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : undefined }}>
                    <span className="num muted" style={{ width: 18 }}>{i + 2}</span>
                    <span style={{ width: 3, height: 18, borderRadius: 2, background: t.colors[0] }} />
                    <span className="small b ellipsis" style={{ flex: 1 }}>{p.first[0]}. {p.last}</span>
                    <TeamLogo team={t} size={18} />
                    <span className="tiny muted" style={{ width: 44 }}>{t.abbr}</span>
                    <span className="num" style={{ width: 44, textAlign: 'right' }}>{L.fmt(v)}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function TeamStats({ g, scope }: { g: GameState; scope: Scope }) {
  const open = useGame((s) => s.open);
  const userConf = g.teams[g.user.teamId].conf;
  const rows = useMemo(() => Object.values(g.teams)
    .filter((t) => t.record.w + t.record.l > 0 && (scope === 'all' || t.conf === userConf))
    .map((t) => {
      const gp = t.record.w + t.record.l;
      const poss = Math.max(1, t.record.poss);
      return { t, gp, ppg: t.record.pf / gp, opp: t.record.pa / gp, margin: (t.record.pf - t.record.pa) / gp, pace: poss / gp, ortg: (t.record.pf / poss) * 100, drtg: (t.record.pa / poss) * 100 };
    }), [g, g.day, scope, userConf]); // eslint-disable-line react-hooks/exhaustive-deps
  type Row = (typeof rows)[number];
  const { sorted, th } = useSorted<Row>(rows, { key: 'margin', dir: -1 }, {
    team: (r) => r.t.school, w: (r) => r.t.record.w, ppg: (r) => r.ppg, opp: (r) => r.opp, margin: (r) => r.margin,
    pace: (r) => r.pace, ortg: (r) => r.ortg, drtg: (r) => -r.drtg, net: (r) => r.ortg - r.drtg,
  });
  const [limit, setLimit] = useState(75);
  if (!rows.length) return <Section><Empty>No games played yet.</Empty></Section>;
  return (
    <div className="card flush">
      <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 230px)' }}>
        <table className="table">
          <thead>
            <tr>
              <th className="c">#</th>
              {th('team', 'Team')}
              {th('w', 'W-L', 'r')}
              {th('ppg', 'PPG', 'r')}
              {th('opp', 'Opp PPG', 'r')}
              {th('margin', 'Margin', 'r')}
              {th('pace', 'Pace', 'r')}
              {th('ortg', 'Off Eff', 'r')}
              {th('drtg', 'Def Eff', 'r')}
              {th('net', 'Net Eff', 'r')}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, limit).map((r, i) => (
              <tr key={r.t.id} className={`click ${r.t.id === g.user.teamId ? 'me' : ''}`} onClick={() => open({ kind: 'team', id: r.t.id })}>
                <td className="c muted">{i + 1}</td>
                <td><span className="row" style={{ gap: 8 }}><TeamLogo team={r.t} size={22} /><span className="b">{r.t.apRank ? <span className="rank">{r.t.apRank}</span> : null}{r.t.school}</span></span></td>
                <td className="r mono">{r.t.record.w}-{r.t.record.l}</td>
                <td className="r mono">{r.ppg.toFixed(1)}</td>
                <td className="r mono">{r.opp.toFixed(1)}</td>
                <td className="r mono" style={{ color: r.margin >= 0 ? 'var(--good)' : 'var(--bad)' }}>{r.margin > 0 ? '+' : ''}{r.margin.toFixed(1)}</td>
                <td className="r mono muted">{r.pace.toFixed(1)}</td>
                <td className="r mono">{r.ortg.toFixed(1)}</td>
                <td className="r mono">{r.drtg.toFixed(1)}</td>
                <td className="r mono b" style={{ color: r.ortg - r.drtg >= 0 ? 'var(--good)' : 'var(--bad)' }}>{r.ortg - r.drtg > 0 ? '+' : ''}{(r.ortg - r.drtg).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {limit < sorted.length && (
        <div style={{ padding: 12, textAlign: 'center' }}>
          <button className="btn sm" onClick={() => setLimit((l) => l + 100)}>Show more ({sorted.length - limit} remaining)</button>
        </div>
      )}
    </div>
  );
}
