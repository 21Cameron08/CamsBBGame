import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { PlayerFace, Stars, Tabs, TeamLogo, TeamName, Section, Ovr, Empty, fmtMoneyShort } from '../components/common';
import { RECRUIT_ACTIONS, PRIORITY_LABELS, topPriorities, scoutedValue, classRankings, userRecruitAction, schoolEntry, recruitOutlook, withRecruitCache, openSpots, lastRecruitWeek, decisionSummary, type RecruitActionKey, type RecruitOutlook, type RecruitOdds } from '../../engine/recruiting';
import { teamPlayers, ROSTER_MAX } from '../../engine/team';
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
  const inSeason = ['preseason', 'regular', 'confTourney', 'selection', 'ncaa'].includes(g.phase);
  if (!inSeason || r.decisionWeek > lastRecruitWeek(g)) return { label: 'Signing Day', cls: inSeason ? '' : 'gold' };
  const weeksLeft = r.decisionWeek - (g.calendar[g.day]?.week ?? 0);
  if (weeksLeft <= 0) return { label: 'Deciding soon', cls: 'gold' };
  return { label: `Decision in ~${weeksLeft} wk`, cls: '' };
}

/** Run a recruiting action and toast how it moved your odds */
export function recruitActWithOdds(r: Recruit, a: RecruitActionKey) {
  const { mutate, toast, game } = useGame.getState();
  if (!game) return;
  const before = withRecruitCache(game, () => recruitOutlook(game, r));
  let res = { ok: false, msg: '' };
  mutate((gg) => { res = userRecruitAction(gg, r.id, a); });
  if (!res.ok) { toast(res.msg, 'bad'); return; }
  sfx.click();
  if (a === 'scout') { toast(res.msg, 'good'); return; }
  const g2 = useGame.getState().game!;
  const after = withRecruitCache(g2, () => recruitOutlook(g2, g2.recruits[r.id]));
  const pct = (p: number) => `${Math.round(p * 100)}%`;
  const delta = after.mine?.offered && after.mine.room && after.odds.filter((o) => o.p > 0).length > 1
    ? ` Your odds ${pct(before.userP)} → ${pct(after.userP)}.`
    : ` Interest ${Math.round(before.mine?.interest ?? 0)} → ${Math.round(after.mine?.interest ?? 0)}${after.mine?.offered ? '' : ' (offer him to turn it into odds)'}.`;
  toast(res.msg + delta, 'good');
}

/** Next season's scholarship picture for a team */
export function scholarshipPicture(g: GameState) {
  const uid = g.user.teamId;
  const returning = teamPlayers(g, uid).filter((p) => p.elig > 1).length;
  const commits = Object.values(g.recruits).filter((r) => r.committed === uid).length;
  const offers = Object.values(g.recruits).filter((r) => !r.committed && schoolEntry(r, uid)?.offered).length;
  return { open: openSpots(g, uid), returning, commits, offers };
}

const pctTxt = (p: number) => (p > 0 && p < 0.005 ? '<1%' : `${Math.round(p * 100)}%`);

/** One school's row: interest bar + real commit odds */
export function OddsRow({ g, o, logo = 18, nameW = 100 }: { g: GameState; o: RecruitOdds; logo?: number; nameW?: number }) {
  const t = g.teams[o.teamId];
  const me = o.teamId === g.user.teamId;
  return (
    <div className="row rec-odds-row" style={{ gap: 8 }}>
      <TeamLogo team={t} size={logo} />
      <span className={`small ellipsis ${me ? 'b' : ''}`} style={{ width: nameW }}>{t.school}</span>
      <div className="bar" style={{ flex: 1 }} title={`Interest ${Math.round(o.interest)}/100`}><motion.i initial={{ width: 0 }} animate={{ width: `${o.interest}%` }} transition={{ duration: 0.8 }} style={{ background: me ? 'var(--accent)' : teamAccent(t.colors), opacity: me ? 1 : 0.6 }} /></div>
      <span className="num tiny muted" style={{ width: 22, textAlign: 'right' }} title="Interest">{Math.round(o.interest)}</span>
      {o.p > 0
        ? <span className={`num small rec-pct ${me ? 'me' : ''}`} title="Chance he picks this school if he decided today">{pctTxt(o.p)}</span>
        : <span className="tiny dim rec-pct" title={o.offered ? 'No scholarships left for next season' : 'Has not offered, so he cannot pick them'}>{o.offered ? 'full' : 'no offer'}</span>}
    </div>
  );
}

export function OutlookWarnings({ out, max = 9 }: { out: RecruitOutlook; max?: number }) {
  if (!out.warnings.length) return null;
  const list = [...out.warnings].sort((a, b) => (a.level === b.level ? 0 : a.level === 'bad' ? -1 : 1)).slice(0, max);
  return (
    <div className="col" style={{ gap: 4 }}>
      {list.map((w, i) => <div key={i} className={`rec-warn ${w.level}`}>{w.level === 'bad' ? '⚠️' : '💡'} {w.text}</div>)}
    </div>
  );
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
  const outlooks = withRecruitCache(g, () => new Map(list.map((r) => [r.id, recruitOutlook(g, r)])));
  const sp = scholarshipPicture(g);
  return (
    <div className="col" style={{ gap: 14 }}>
      <ScholarshipStrip g={g} sp={sp} />
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
        <AnimatePresence>
          {list.map((r, i) => <BoardCard key={r.id} g={g} r={r} i={i} out={outlooks.get(r.id)!} />)}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ScholarshipStrip({ g, sp }: { g: GameState; sp: ReturnType<typeof scholarshipPicture> }) {
  const tone = sp.open === 0 ? 'bad' : sp.offers > sp.open ? 'gold' : 'good';
  return (
    <div className={`card rec-strip tone-${tone}`}>
      <div className="row wrap" style={{ gap: 18 }}>
        <div className="row" style={{ gap: 10 }}>
          <div className="rec-strip-num num">{sp.open}</div>
          <div><div className="b">Scholarship{sp.open === 1 ? '' : 's'} open for {g.season + 1}-{String((g.season + 2) % 100).padStart(2, '0')}</div>
            <div className="tiny muted">{ROSTER_MAX} max · {sp.returning} returning · {sp.commits} commit{sp.commits === 1 ? '' : 's'} · {sp.offers} offer{sp.offers === 1 ? '' : 's'} out</div></div>
        </div>
        <div className="spacer" />
        <div className="small muted" style={{ maxWidth: 520 }}>
          {sp.open === 0
            ? <>⚠️ <b style={{ color: 'var(--text)' }}>You're full.</b> Recruits can't commit to you until a spot opens, and your outstanding offers can't land.</>
            : sp.offers > sp.open
              ? <>💡 More offers than spots: once {sp.open} commit{sp.open === 1 ? 's' : ''}, the rest of your offers stop counting.</>
              : <>Percentages are the <b style={{ color: 'var(--text)' }}>real odds</b> he picks each school if he decided today. Only schools that have offered can be picked.</>}
        </div>
      </div>
    </div>
  );
}

function BoardCard({ g, r, i, out }: { g: GameState; r: Recruit; i: number; out: RecruitOutlook }) {
  const { open } = useGame.getState();
  const user = g.teams[g.user.teamId];
  const mine = schoolEntry(r, user.id);
  const st = statusOf(g, r);
  const top = out.odds.slice(0, 4);
  if (out.mine && !top.includes(out.mine)) top[top.length === 4 ? 3 : top.length] = out.mine;
  const act = (a: RecruitActionKey) => recruitActWithOdds(r, a);
  const decided = r.committed ? r.decision : undefined;
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
        <div className="col" style={{ alignItems: 'flex-end', gap: 4 }}>
          <span className={`pill ${st.cls}`}>{st.label}</span>
          {!r.committed && <YourOdds out={out} />}
        </div>
      </div>
      <div className="row wrap gap-s" style={{ marginTop: 10 }}>
        {topPriorities(r.priorities).map((k) => <span key={k} className="pill">{PRIORITY_LABELS[k]}</span>)}
        {mine?.offered && <span className="pill accent">Offered {mine.nilOffer ? fmtMoneyShort(mine.nilOffer) : ''}</span>}
        {mine?.visited && <span className="pill good">Visited</span>}
      </div>
      {decided ? (
        <div className={`rec-verdict ${decided.userStatus === 'won' ? 'good' : 'bad'}`} style={{ marginTop: 10 }}>{decisionSummary(g, decided)}</div>
      ) : !r.committed && (
        <>
          <div className="row" style={{ marginTop: 10, marginBottom: 4 }}>
            <span className="tiny upper muted b" style={{ letterSpacing: '.1em', flex: 1 }}>If he decided today</span>
            <span className="tiny dim">interest · odds</span>
          </div>
          <div className="col" style={{ gap: 5 }}>
            {top.map((o) => <OddsRow key={o.teamId} g={g} o={o} />)}
            {!mine && <div className="tiny muted">You're not on his list yet. Reach out to get in the mix.</div>}
            {top.length > 0 && !out.odds.some((o) => o.p > 0) && <div className="tiny muted">Nobody has offered yet, so he can't commit anywhere.</div>}
          </div>
          <div style={{ marginTop: 8 }}><OutlookWarnings out={out} max={2} /></div>
        </>
      )}
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
          <button className={`btn sm ${mine?.offered ? '' : 'primary'}`} onClick={() => open({ kind: 'recruit', id: r.id })}>{mine?.offered ? 'Edit offer' : '✉️ Offer'}</button>
        </div>
      )}
    </motion.div>
  );
}

/** Big "your odds" badge */
export function YourOdds({ out, big }: { out: RecruitOutlook; big?: boolean }) {
  const m = out.mine;
  if (!m) return null;
  if (!m.offered || !m.room) return <span className={`rec-you ${big ? 'big' : ''} off`} title={!m.offered ? 'Offer him to have a chance' : 'No scholarships left'}>{!m.offered ? 'No offer' : 'No room'}</span>;
  const p = out.userP;
  const only = out.odds.filter((o) => o.p > 0).length === 1;
  const tone = p >= 0.6 ? 'good' : p >= 0.3 ? 'gold' : 'bad';
  if (only) return <span className={`rec-you ${big ? 'big' : ''} gold`} title="You're the only school that has offered. If he decided today he'd pick you, but rivals can still offer.">Only offer</span>;
  return <motion.span key={Math.round(p * 100)} initial={{ scale: 1.25 }} animate={{ scale: 1 }} className={`rec-you ${big ? 'big' : ''} ${tone}`} title="Your real chance if he decided today">You {pctTxt(p)}</motion.span>;
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
            <thead><tr><th>Rk</th><th></th><th>Prospect</th><th>Pos</th><th>Ht</th><th>Hometown</th><th className="c">OVR*</th><th className="c">POT*</th><th>Wants</th><th>Leader</th><th className="c" title="Your real chance if he decided today">You</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {withRecruitCache(g, () => list.slice(0, limit).map((r) => ({ r, out: schoolEntry(r, user.id) && !r.committed ? recruitOutlook(g, r) : undefined }))).map(({ r, out }) => {
                const lead = out?.leader ? { teamId: out.leader.teamId } : r.schools[0];
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
                    <td className="c">{out ? <YourOdds out={out} /> : <span className="dim">—</span>}</td>
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
