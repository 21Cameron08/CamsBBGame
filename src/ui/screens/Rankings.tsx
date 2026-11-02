import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { TeamLogo, TeamName, Tabs, Section, Empty, useSorted } from '../components/common';
import { projectedAutoBids, selectField, netScore, REGIONS, type FieldEntry } from '../../engine/rankings';
import type { GameState, Team } from '../../engine/types';
import { seasonLabel } from '../../engine/calendar';

type Tab = 'ap' | 'net' | 'bracketology';

const IN_SEASON = ['preseason', 'regular', 'confTourney', 'selection'];

function confShort(g: GameState, t: Team) {
  return g.conferences.find((c) => c.id === t.conf)?.short ?? t.conf;
}

function Movement({ cur, prev }: { cur: number; prev: number | null }) {
  if (prev == null) return <span className="pill blue" style={{ fontSize: 10, padding: '1px 6px' }}>NEW</span>;
  const d = prev - cur;
  if (d === 0) return <span className="dim tiny">—</span>;
  return d > 0
    ? <span className="trend-up b small">▲{d}</span>
    : <span className="trend-down b small">▼{-d}</span>;
}

export function RankingsScreen() {
  const g = useGameState();
  const [tab, setTab] = useState<Tab>('ap');
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">{seasonLabel(g.season)} · National Picture</div>
          <h1 className="h1">Rankings</h1>
        </div>
        <div className="spacer" />
        <Tabs id="rank-tabs" value={tab} onChange={setTab} tabs={[
          { id: 'ap', label: 'AP Top 25' },
          { id: 'net', label: 'NET / Power' },
          { id: 'bracketology', label: 'Bracketology' },
        ]} />
      </div>
      {tab === 'ap' && <ApPoll g={g} />}
      {tab === 'net' && <NetTable g={g} />}
      {tab === 'bracketology' && <Bracketology g={g} />}
    </div>
  );
}

// ---------------- AP Poll ----------------
function ApPoll({ g }: { g: GameState }) {
  const polls = g.polls;
  const [idx, setIdx] = useState(Math.max(0, polls.length - 1));
  const pollIdx = Math.min(idx, Math.max(0, polls.length - 1));
  const poll = polls[pollIdx];
  const prevPoll = pollIdx > 0 ? polls[pollIdx - 1] : null;
  const latest = pollIdx === polls.length - 1;
  const open = useGame((s) => s.open);
  if (!poll) return <Section><Empty>No polls released yet.</Empty></Section>;
  const prevRank = (id: string): number | null => {
    if (latest) {
      const t = g.teams[id];
      return t.prevApRank ?? (prevPoll ? (prevPoll.ranks.indexOf(id) + 1 || null) : null);
    }
    if (!prevPoll) return null;
    const i = prevPoll.ranks.indexOf(id);
    return i >= 0 ? i + 1 : null;
  };
  const dropped = prevPoll ? prevPoll.ranks.filter((id) => !poll.ranks.includes(id)) : [];
  const others = Object.values(g.teams)
    .filter((t) => !poll.ranks.includes(t.id))
    .sort((a, b) => b.pollScore - a.pollScore)
    .slice(0, 8);
  return (
    <div className="grid g-main">
      <div className="card flush">
        <div className="row" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
          <div className="h3" style={{ flex: 1 }}>{poll.label}</div>
          <button className="btn sm ghost" disabled={pollIdx <= 0} onClick={() => setIdx(pollIdx - 1)}>‹ Prev</button>
          <select className="select" style={{ width: 230 }} value={pollIdx} onChange={(e) => setIdx(+e.target.value)}>
            {polls.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
          </select>
          <button className="btn sm ghost" disabled={pollIdx >= polls.length - 1} onClick={() => setIdx(pollIdx + 1)}>Next ›</button>
        </div>
        <div>
          {poll.ranks.map((id, i) => {
            const t = g.teams[id];
            if (!t) return null;
            const me = id === g.user.teamId;
            return (
              <motion.div key={`${pollIdx}-${id}`}
                initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.028, type: 'spring', stiffness: 260, damping: 26 }}
                className="rk-row" onClick={() => open({ kind: 'team', id })}
                style={{
                  display: 'grid', gridTemplateColumns: '54px 50px 46px 1fr 90px 80px 70px', alignItems: 'center', gap: 10,
                  padding: '9px 18px', borderBottom: '1px solid var(--line)', cursor: 'pointer',
                  background: me ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : i < 4 ? 'rgba(246,201,76,0.035)' : undefined,
                  borderLeft: `3px solid ${t.colors[0]}`,
                }}>
                <span className="num" style={{ fontSize: i < 10 ? 28 : 22, color: i === 0 ? 'var(--gold)' : 'var(--text)' }}>{i + 1}</span>
                <Movement cur={i + 1} prev={prevRank(id)} />
                <TeamLogo team={t} size={34} />
                <div style={{ minWidth: 0 }}>
                  <div className="b ellipsis" style={{ fontSize: 15 }}>{t.school} <span className="muted" style={{ fontWeight: 500 }}>{t.mascot}</span></div>
                  <div className="tiny muted">{confShort(g, t)}{me ? ' · YOUR TEAM' : ''}</div>
                </div>
                <span className="num" style={{ fontSize: 18 }}>{t.record.w}-{t.record.l}</span>
                <span className="small muted">NET {t.net || '—'}</span>
                <span className="small mono" style={{ textAlign: 'right' }}>{t.rating > 0 ? '+' : ''}{t.rating.toFixed(1)}</span>
              </motion.div>
            );
          })}
        </div>
      </div>
      <div className="col" style={{ gap: 16 }}>
        <Section title="Receiving Votes">
          {others.map((t) => (
            <div key={t.id} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <TeamLogo team={t} size={22} />
              <TeamName team={t} showRank={false} />
              <div className="spacer" />
              <span className="small muted">{t.record.w}-{t.record.l}</span>
            </div>
          ))}
        </Section>
        {dropped.length > 0 && (
          <Section title="Dropped Out">
            {dropped.map((id) => {
              const t = g.teams[id];
              return (
                <div key={id} className="row" style={{ padding: '6px 0' }}>
                  <span className="trend-down tiny b">▼</span>
                  <TeamLogo team={t} size={22} />
                  <TeamName team={t} showRank={false} />
                  <div className="spacer" />
                  <span className="small muted">was #{(prevPoll!.ranks.indexOf(id) + 1)}</span>
                </div>
              );
            })}
          </Section>
        )}
        <Section title="Conference Breakdown">
          {(() => {
            const counts: Record<string, number> = {};
            for (const id of poll.ranks) { const c = g.teams[id]?.conf; if (c) counts[c] = (counts[c] ?? 0) + 1; }
            const max = Math.max(1, ...Object.values(counts));
            return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([c, n]) => {
              const conf = g.conferences.find((x) => x.id === c);
              return (
                <div key={c} className="row" style={{ marginBottom: 6 }}>
                  <span className="small b" style={{ width: 80 }}>{conf?.short ?? c}</span>
                  <div style={{ flex: 1 }} className="bar"><motion.i initial={{ width: 0 }} animate={{ width: `${(n / max) * 100}%` }} transition={{ duration: 0.8 }} style={{ background: conf?.color }} /></div>
                  <span className="num" style={{ width: 20, textAlign: 'right' }}>{n}</span>
                </div>
              );
            });
          })()}
        </Section>
      </div>
    </div>
  );
}

// ---------------- NET table ----------------
function NetTable({ g }: { g: GameState }) {
  const open = useGame((s) => s.open);
  const [limit, setLimit] = useState(100);
  const rows = useMemo(() => Object.values(g.teams).filter((t) => t.net > 0).sort((a, b) => a.net - b.net), [g, g.day]); // eslint-disable-line react-hooks/exhaustive-deps
  const { sorted, th } = useSorted(rows, { key: 'net', dir: 1 }, {
    net: (t) => t.net,
    team: (t) => t.school,
    w: (t) => t.record.w - t.record.l,
    rating: (t) => t.rating,
    srs: (t) => t.srs,
    wab: (t) => t.wab,
    q1: (t) => t.record.q1w,
    power: (t) => t.power,
    score: (t) => netScore(t),
  });
  if (!rows.length) return <Section><Empty>NET rankings are computed once the season begins.</Empty></Section>;
  return (
    <div className="card flush">
      <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 230px)' }}>
        <table className="table">
          <thead>
            <tr>
              {th('net', 'NET', 'c')}
              {th('team', 'Team')}
              <th>Conf</th>
              {th('w', 'Record', 'r')}
              <th className="r">Conf</th>
              {th('rating', 'Rating', 'r')}
              {th('srs', 'SRS', 'r')}
              {th('wab', 'WAB', 'r')}
              {th('q1', 'Q1 W', 'r')}
              {th('power', 'Roster', 'r')}
              <th className="c">AP</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, limit).map((t) => (
              <tr key={t.id} className={`click ${t.id === g.user.teamId ? 'me' : ''}`} onClick={() => open({ kind: 'team', id: t.id })}>
                <td className="c num" style={{ fontSize: 16 }}>{t.net}</td>
                <td><span className="row" style={{ gap: 8 }}><TeamLogo team={t} size={22} /><span className="b">{t.school}</span></span></td>
                <td className="muted">{confShort(g, t)}</td>
                <td className="r mono">{t.record.w}-{t.record.l}</td>
                <td className="r mono muted">{t.record.cw}-{t.record.cl}</td>
                <td className="r mono" style={{ color: t.rating >= 0 ? 'var(--good)' : 'var(--bad)' }}>{t.rating > 0 ? '+' : ''}{t.rating.toFixed(1)}</td>
                <td className="r mono">{t.srs.toFixed(1)}</td>
                <td className="r mono" style={{ color: t.wab >= 0 ? 'var(--good)' : 'var(--muted)' }}>{t.wab > 0 ? '+' : ''}{t.wab.toFixed(1)}</td>
                <td className="r mono">{t.record.q1w}</td>
                <td className="r mono muted">{t.power.toFixed(1)}</td>
                <td className="c">{t.apRank ? <span className="rank">{t.apRank}</span> : <span className="dim">—</span>}</td>
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

// ---------------- Bracketology ----------------
function Bracketology({ g }: { g: GameState }) {
  const inSeason = IN_SEASON.includes(g.phase) && g.day > 0;
  const data = useMemo(() => {
    if (!inSeason && !g.ncaa) return null;
    const autos = projectedAutoBids(g);
    const field = selectField(g, autos);
    const autoSet = new Set(Object.values(autos));
    const fieldSet = new Set(field.map((e) => e.teamId));
    const atLargeSorted = Object.values(g.teams)
      .filter((t) => !autoSet.has(t.id))
      .sort((a, b) => b.rating * 0.55 + b.wab * 1.7 - (a.rating * 0.55 + a.wab * 1.7));
    const firstFourOut = atLargeSorted.filter((t) => !fieldSet.has(t.id)).slice(0, 4);
    const nextFour = atLargeSorted.filter((t) => !fieldSet.has(t.id)).slice(4, 8);
    const lastFourIn = field.filter((e) => e.firstFour && !e.auto);
    return { field, firstFourOut, nextFour, lastFourIn };
  }, [g, g.day, inSeason]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) {
    return (
      <Section>
        <Empty>
          <div className="h3" style={{ marginBottom: 6 }}>Bracketology is on hiatus</div>
          Projections return once the regular season tips off. It's {g.phase === 'preseason' ? 'the preseason' : 'the offseason'} right now.
        </Empty>
      </Section>
    );
  }
  const { field, firstFourOut, nextFour, lastFourIn } = data;
  const user = field.find((e) => e.teamId === g.user.teamId);
  const lines: FieldEntry[][] = [];
  for (let s = 1; s <= 16; s++) lines.push(field.filter((e) => e.seed === s).sort((a, b) => a.region - b.region));
  return (
    <div className="grid g-main">
      <div className="card">
        <div className="card-head">
          <div className="h3">Projected Field of 68</div>
          {user
            ? <span className="pill accent">You: No. {user.seed} seed · {REGIONS[user.region]}</span>
            : <span className="pill bad">You: Out of the field</span>}
        </div>
        <div className="small muted" style={{ marginBottom: 12 }}>Auto bids go to current conference leaders. {g.ncaa ? 'The official bracket has been revealed — see the Brackets screen.' : 'Updated after every game day.'}</div>
        <div className="col" style={{ gap: 6 }}>
          {lines.map((line, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className="row" style={{ gap: 8, padding: '6px 8px', borderRadius: 10, background: i < 4 ? 'rgba(246,201,76,0.05)' : 'rgba(255,255,255,0.025)' }}>
              <span className="num" style={{ width: 30, fontSize: 20, color: i === 0 ? 'var(--gold)' : 'var(--text)' }}>{i + 1}</span>
              <div className="grid" style={{ flex: 1, gridTemplateColumns: `repeat(${Math.max(4, line.length)}, minmax(0,1fr))`, gap: 6 }}>
                {line.map((e) => {
                  const t = g.teams[e.teamId];
                  const me = e.teamId === g.user.teamId;
                  return (
                    <div key={e.teamId} className="row" style={{ gap: 6, minWidth: 0, padding: '3px 6px', borderRadius: 7, background: me ? 'color-mix(in srgb, var(--accent) 22%, transparent)' : undefined, border: e.firstFour ? '1px dashed var(--line-2)' : '1px solid transparent' }}
                      title={`${t.school} · ${REGIONS[e.region]}${e.auto ? ' · auto bid' : ''}${e.firstFour ? ' · First Four' : ''}`}>
                      <TeamLogo team={t} size={20} />
                      <span className="small b ellipsis" style={{ flex: 1 }}>{t.school}</span>
                      {e.auto && <span className="tiny gold b">A</span>}
                      <span className="tiny dim">{REGIONS[e.region][0]}</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="col" style={{ gap: 16 }}>
        <BubbleList g={g} title="Last Four In" ids={lastFourIn.map((e) => e.teamId)} tone="good" />
        <BubbleList g={g} title="First Four Out" ids={firstFourOut.map((t) => t.id)} tone="bad" />
        <BubbleList g={g} title="Next Four Out" ids={nextFour.map((t) => t.id)} tone="muted" />
        <Section title="Bids by Conference">
          {(() => {
            const counts: Record<string, number> = {};
            for (const e of field) { const c = g.teams[e.teamId].conf; counts[c] = (counts[c] ?? 0) + 1; }
            return Object.entries(counts).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
              <div key={c} className="row" style={{ padding: '4px 0' }}>
                <span className="dot" style={{ background: g.conferences.find((x) => x.id === c)?.color }} />
                <span className="small b">{g.conferences.find((x) => x.id === c)?.short}</span>
                <div className="spacer" />
                <span className="num">{n}</span>
              </div>
            ));
          })()}
        </Section>
      </div>
    </div>
  );
}

function BubbleList({ g, title, ids, tone }: { g: GameState; title: string; ids: string[]; tone: 'good' | 'bad' | 'muted' }) {
  return (
    <Section title={<span className={tone === 'muted' ? '' : tone}>{title}</span>}>
      {ids.length === 0 && <div className="small muted">—</div>}
      {ids.map((id) => {
        const t = g.teams[id];
        return (
          <div key={id} className={`row`} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)', background: id === g.user.teamId ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : undefined }}>
            <TeamLogo team={t} size={24} />
            <TeamName team={t} />
            <div className="spacer" />
            <span className="small muted">{t.record.w}-{t.record.l} · NET {t.net}</span>
          </div>
        );
      })}
    </Section>
  );
}
