import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { PlayerFace, Stars, Tabs, TeamLogo, TeamName, Section, Ovr, Empty, fmtMoneyShort } from '../components/common';
import { RECRUIT_ACTIONS, PRIORITY_LABELS, topPriorities, scoutedValue, classRankings, userRecruitAction, schoolEntry, type RecruitActionKey } from '../../engine/recruiting';
import { fmtHeight } from '../../engine/player';
import type { GameState, Recruit } from '../../engine/types';
import { STATE_NAMES } from '../../data/places';
import { teamAccent } from '../color';
import { sfx } from '../sound';

type Tab = 'board' | 'search' | 'class' | 'rankings';

export function RecruitingScreen() {
  const g = useGameState();
  const [tab, setTab] = useState<Tab>('board');
  const user = g.teams[g.user.teamId];
  const commits = Object.values(g.recruits).filter((r) => r.committed === user.id);
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Class of {g.season + 1} · {Object.keys(g.recruits).length} prospects tracked</div>
          <h1 className="h1" style={{ marginTop: 6 }}>Recruiting War Room</h1>
        </div>
        <div className="spacer" />
        <label className="hours-chip" style={{ cursor: 'pointer' }} title="Your assistants recruit and work the portal for you (AI-level effort). You can still recruit on top of it.">
          <input type="checkbox" checked={!!g.settings.autoRecruit} onChange={(e) => useGame.getState().mutate((gg) => { gg.settings.autoRecruit = e.target.checked; })} />
          🤖 Staff auto-recruit
        </label>
        <div className="hours-chip" style={{ fontSize: 14 }}>🎯 <span className="num" style={{ fontSize: 22 }}>{g.user.hours}</span> <span className="muted">/ {g.user.hoursMax} hours this week</span></div>
        <Tabs id="rec" value={tab} onChange={setTab} tabs={[{ id: 'board', label: `My Board (${g.user.board.length})` }, { id: 'search', label: 'Prospect Search' }, { id: 'class', label: `My Class (${commits.length})` }, { id: 'rankings', label: 'Class Rankings' }]} />
      </div>
      {tab === 'board' && <Board g={g} onSearch={() => setTab('search')} />}
      {tab === 'search' && <Search g={g} />}
      {tab === 'class' && <MyClass g={g} commits={commits} />}
      {tab === 'rankings' && <ClassRankingsView g={g} />}
    </div>
  );
}

export function statusOf(g: GameState, r: Recruit): { label: string; cls: string } {
  if (r.committed === g.user.teamId) return { label: 'Committed to you', cls: 'good' };
  if (r.committed) return { label: `Committed: ${g.teams[r.committed]?.school}`, cls: 'bad' };
  const weeksLeft = r.decisionWeek - (g.calendar[g.day]?.week ?? 0);
  if (weeksLeft <= 0) return { label: 'Deciding soon', cls: 'gold' };
  return { label: `Decision in ~${weeksLeft} wk`, cls: '' };
}

function Board({ g, onSearch }: { g: GameState; onSearch: () => void }) {
  const ids = Array.from(new Set([...g.user.board, ...Object.values(g.recruits).filter((r) => schoolEntry(r, g.user.teamId)?.offered).map((r) => r.id)]));
  const list = ids.map((id) => g.recruits[id]).filter(Boolean).sort((a, b) => a.rank - b.rank);
  if (!list.length) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 50 }}>
        <div style={{ fontSize: 46 }}>📋</div>
        <div className="h2" style={{ marginTop: 10 }}>Your board is empty</div>
        <div className="muted" style={{ margin: '8px 0 18px' }}>Find prospects who fit your program, add them to your board, then call, visit and offer.</div>
        <button className="btn primary lg" onClick={onSearch}>Search Prospects →</button>
      </div>
    );
  }
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
      <AnimatePresence>
        {list.map((r, i) => <BoardCard key={r.id} g={g} r={r} i={i} />)}
      </AnimatePresence>
    </div>
  );
}

function BoardCard({ g, r, i }: { g: GameState; r: Recruit; i: number }) {
  const { open, mutate, toast } = useGame.getState();
  const user = g.teams[g.user.teamId];
  const mine = schoolEntry(r, user.id);
  const st = statusOf(g, r);
  const top = r.schools.slice(0, 4);
  const act = (a: RecruitActionKey) => {
    let res = { ok: false, msg: '' };
    mutate((gg) => { res = userRecruitAction(gg, r.id, a); });
    toast(res.msg, res.ok ? 'good' : 'bad');
    if (res.ok) sfx.click();
  };
  return (
    <motion.div layout className="card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}
      style={{ borderColor: r.committed === user.id ? 'rgba(34,211,143,.5)' : undefined }}>
      <div className="row" style={{ alignItems: 'flex-start', cursor: 'pointer' }} onClick={() => open({ kind: 'recruit', id: r.id })}>
        <PlayerFace p={r} size={62} team={r.committed ? g.teams[r.committed] : undefined} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}><span className="b ellipsis" style={{ fontSize: 16 }}>{r.first} {r.last}</span>{r.type !== 'HS' && <span className="pill blue">{r.type}</span>}</div>
          <div className="row" style={{ gap: 8 }}><Stars n={r.stars} /><span className="tiny muted">#{r.rank} · {r.pos} #{r.posRank}</span></div>
          <div className="tiny muted">{fmtHeight(r.height)} {r.archetype} · {r.hometown}{r.type !== 'INTL' ? `, ${r.state}` : ''}</div>
        </div>
        <span className={`pill ${st.cls}`}>{st.label}</span>
      </div>
      <div className="row wrap gap-s" style={{ marginTop: 10 }}>
        {topPriorities(r.priorities).map((k) => <span key={k} className="pill">{PRIORITY_LABELS[k]}</span>)}
        {mine?.offered && <span className="pill accent">Offered {mine.nilOffer ? fmtMoneyShort(mine.nilOffer) : ''}</span>}
        {mine?.visited && <span className="pill good">Visited</span>}
      </div>
      <div className="col" style={{ gap: 5, marginTop: 10 }}>
        {top.map((s) => {
          const t = g.teams[s.teamId];
          const isMe = s.teamId === user.id;
          return (
            <div key={s.teamId} className="row" style={{ gap: 8 }}>
              <TeamLogo team={t} size={18} />
              <span className={`small ellipsis ${isMe ? 'b' : ''}`} style={{ width: 100 }}>{t.school}</span>
              <div className="bar" style={{ flex: 1 }}><motion.i initial={{ width: 0 }} animate={{ width: `${s.interest}%` }} transition={{ duration: 0.8 }} style={{ background: isMe ? 'var(--accent)' : teamAccent(t.colors), opacity: isMe ? 1 : 0.6 }} /></div>
              <span className="num small" style={{ width: 24, textAlign: 'right' }}>{Math.round(s.interest)}</span>
              {s.offered && <span className="tiny" title="Offered">✉️</span>}
            </div>
          );
        })}
        {!mine && <div className="tiny muted">You're not on his list yet — reach out to get in the mix.</div>}
      </div>
      {!r.committed && (
        <div className="row wrap gap-s" style={{ marginTop: 12 }}>
          {(['text', 'call', 'asst', 'hc', 'visit'] as RecruitActionKey[]).map((a) => {
            const used = a === 'visit' ? !!mine?.visited : r.userWeek[a as 'text'];
            return (
              <button key={a} className="btn sm" disabled={used || g.user.hours < RECRUIT_ACTIONS[a].hours} title={RECRUIT_ACTIONS[a].desc} onClick={() => act(a)}>
                {RECRUIT_ACTIONS[a].label} <span className="dim">{RECRUIT_ACTIONS[a].hours}h</span>
              </button>
            );
          })}
          <button className="btn sm primary" onClick={() => open({ kind: 'recruit', id: r.id })}>{mine?.offered ? 'Edit offer' : 'Offer'}</button>
        </div>
      )}
    </motion.div>
  );
}

function Search({ g }: { g: GameState }) {
  const { open, mutate } = useGame.getState();
  const [pos, setPos] = useState('');
  const [stars, setStars] = useState(0);
  const [st, setSt] = useState('');
  const [type, setType] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(60);
  const user = g.teams[g.user.teamId];
  const list = useMemo(() => Object.values(g.recruits).filter((r) => {
    if (pos && r.pos !== pos) return false;
    if (stars && r.stars !== stars) return false;
    if (st && r.state !== st) return false;
    if (type && r.type !== type) return false;
    if (onlyOpen && r.committed) return false;
    if (q && !`${r.first} ${r.last} ${r.hometown}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }).sort((a, b) => a.rank - b.rank), [g, pos, stars, st, type, onlyOpen, q]);
  const states = useMemo(() => Array.from(new Set(Object.values(g.recruits).filter((r) => r.type !== 'INTL').map((r) => r.state))).sort(), [g]);
  return (
    <div>
      <div className="card row wrap" style={{ marginBottom: 14 }}>
        <input className="input" style={{ width: 200 }} placeholder="Search name or town…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" style={{ width: 120 }} value={pos} onChange={(e) => setPos(e.target.value)}><option value="">All positions</option>{['PG', 'SG', 'SF', 'PF', 'C'].map((p) => <option key={p}>{p}</option>)}</select>
        <select className="select" style={{ width: 120 }} value={stars} onChange={(e) => setStars(+e.target.value)}><option value={0}>All stars</option>{[5, 4, 3, 2, 1].map((s) => <option key={s} value={s}>{'★'.repeat(s)}</option>)}</select>
        <select className="select" style={{ width: 150 }} value={st} onChange={(e) => setSt(e.target.value)}><option value="">All states</option>{states.map((s) => <option key={s} value={s}>{STATE_NAMES[s] ?? s}</option>)}</select>
        <select className="select" style={{ width: 140 }} value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option><option value="HS">High School</option><option value="PREP">Prep</option><option value="JUCO">JUCO</option><option value="INTL">International</option></select>
        <label className="row small muted"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Uncommitted only</label>
        <div className="spacer" />
        <span className="small muted">{list.length} prospects</span>
      </div>
      <div className="card flush">
        <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 290px)' }}>
          <table className="table">
            <thead><tr><th>Rk</th><th></th><th>Prospect</th><th>Pos</th><th>Ht</th><th>Hometown</th><th className="c">OVR*</th><th className="c">POT*</th><th>Wants</th><th>Leader</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {list.slice(0, limit).map((r) => {
                const lead = r.schools[0];
                const st2 = statusOf(g, r);
                const onBoard = g.user.board.includes(r.id);
                return (
                  <tr key={r.id} className="click" onClick={() => open({ kind: 'recruit', id: r.id })}>
                    <td className="num">{r.rank}</td>
                    <td style={{ padding: '3px 6px' }}><PlayerFace p={r} size={32} bg="none" /></td>
                    <td><div className="b">{r.first} {r.last}</div><Stars n={r.stars} /></td>
                    <td><span className="pill">{r.pos}</span></td>
                    <td className="muted">{fmtHeight(r.height)}</td>
                    <td className="small muted">{r.hometown}{r.type !== 'INTL' ? `, ${r.state}` : ''} {r.type !== 'HS' && <span className="pill blue">{r.type}</span>}</td>
                    <td className="c"><Ovr v={scoutedValue(r, r.ovr, 1)} size="sm" /></td>
                    <td className="c num">{scoutedValue(r, r.pot, 2)}</td>
                    <td className="tiny muted">{topPriorities(r.priorities, 2).map((k) => PRIORITY_LABELS[k]).join(', ')}</td>
                    <td>{lead ? <TeamName team={g.teams[lead.teamId]} logo={18} short /> : <span className="dim">—</span>}</td>
                    <td><span className={`pill ${st2.cls}`}>{st2.label}</span></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className={`btn sm ${onBoard ? '' : 'primary'}`} onClick={() => mutate((gg) => {
                        const b = gg.user.board;
                        if (b.includes(r.id)) gg.user.board = b.filter((x) => x !== r.id);
                        else b.push(r.id);
                      })}>{onBoard ? '✓ Board' : '+ Board'}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {limit < list.length && <div className="center" style={{ padding: 14 }}><button className="btn" onClick={() => setLimit(limit + 80)}>Show more</button></div>}
        </div>
      </div>
      <div className="tiny dim" style={{ marginTop: 8 }}>* Ratings are scouting estimates. Scout a prospect (or visit him) to sharpen them. Your school: {user.school}.</div>
    </div>
  );
}

function MyClass({ g, commits }: { g: GameState; commits: Recruit[] }) {
  const open = useGame((s) => s.open);
  const user = g.teams[g.user.teamId];
  if (!commits.length) return <Empty>No commitments yet. They’ll show up here — with a ceremony — when prospects pick you.</Empty>;
  return (
    <div className="grid g4">
      {commits.sort((a, b) => a.rank - b.rank).map((r, i) => (
        <motion.div key={r.id} className="card hover" style={{ textAlign: 'center' }} initial={{ opacity: 0, rotateY: 90 }} animate={{ opacity: 1, rotateY: 0 }} transition={{ delay: i * 0.08 }} onClick={() => open({ kind: 'recruit', id: r.id })}>
          <PlayerFace p={r} size={96} team={user} />
          <div className="b" style={{ marginTop: 8 }}>{r.first} {r.last}</div>
          <Stars n={r.stars} />
          <div className="tiny muted">#{r.rank} overall · {r.pos} · {fmtHeight(r.height)}</div>
          <div className="tiny muted">{r.hometown}{r.type !== 'INTL' ? `, ${r.state}` : ''}</div>
          {schoolEntry(r, user.id)?.nilOffer ? <div className="pill accent" style={{ marginTop: 8 }}>NIL {fmtMoneyShort(schoolEntry(r, user.id)!.nilOffer)}</div> : null}
        </motion.div>
      ))}
    </div>
  );
}

function ClassRankingsView({ g }: { g: GameState }) {
  const rows = classRankings(g).slice(0, 40);
  return (
    <Section title={`Team Recruiting Rankings · Class of ${g.season + 1}`}>
      <table className="table">
        <thead><tr><th>Rk</th><th>Team</th><th className="r">Commits</th><th className="r">Avg ★</th><th className="r">Score</th><th>Top Commit</th></tr></thead>
        <tbody>
          {rows.map((c, i) => {
            const top = Object.values(g.recruits).filter((r) => r.committed === c.teamId).sort((a, b) => a.rank - b.rank)[0];
            return (
              <tr key={c.teamId} className={`row-in ${c.teamId === g.user.teamId ? 'me' : ''}`} style={{ animationDelay: `${Math.min(i * 20, 400)}ms` }}>
                <td className="num">{i + 1}</td>
                <td><TeamName team={g.teams[c.teamId]} logo={22} /></td>
                <td className="r num">{c.count}</td>
                <td className="r">{c.avgStars.toFixed(2)}</td>
                <td className="r num">{c.score.toFixed(1)}</td>
                <td className="small">{top ? <>{'★'.repeat(top.stars)} {top.first} {top.last} <span className="dim">#{top.rank}</span></> : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}
