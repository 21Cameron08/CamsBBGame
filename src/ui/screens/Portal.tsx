import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { PlayerFace, TeamLogo, TeamName, Ovr, Stars, Section, Empty, Bar, fmtMoneyShort, PersonFace, AnimatedNumber } from '../components/common';
import type { GameState, PortalEntry, PortalOffer, PortalFeedItem, Pos } from '../../engine/types';
import {
  PORTAL_ACTIONS, retentionOdds, retentionChoose, entryOdds, userOffer, userNilRoom, visibleEntries, portalAction, portalMakeOffer,
  portalWithdraw, answerCall, type PortalActionKey,
} from '../../engine/portal';
import { teamPlayers, ROSTER_MAX } from '../../engine/team';
import { fmtHeight } from '../../engine/player';
import { teamAccent } from '../color';
import { sfx } from '../sound';

const REASON_ICON: Record<string, string> = { 'Playing time': '⏱️', 'NIL money': '💰', 'Coaching change': '🔄', 'Bigger stage': '🏟️', 'Closer to home': '🏠', 'Fresh start': '🌱' };
const PRI_LABEL: Record<string, string> = { nil: 'NIL money', pt: 'Playing time', win: 'Winning', prestige: 'Prestige', home: 'Close to home', coach: 'Relationships' };

function lastLine(g: GameState, id: string) {
  const p = g.players[id];
  const c = p?.career[p.career.length - 1];
  if (!c || !c.gp) return null;
  return { ppg: c.pts / c.gp, rpg: (c.orb + c.drb) / c.gp, apg: c.ast / c.gp, team: c.teamId };
}
const approx = (v: number) => (v >= 1e6 ? `~${fmtMoneyShort(Math.round(v / 50000) * 50000)}` : `~${fmtMoneyShort(Math.round(v / 5000) * 5000)}`);

export function PortalHub() {
  const g = useGameState();
  const ps = g.portal;
  if (!ps) return <Empty>The portal is not open.</Empty>;
  return (
    <div>
      <DayTracker g={g} />
      {ps.day === 0 ? <RetentionStage g={g} /> : <WindowStage g={g} />}
    </div>
  );
}

function DayTracker({ g }: { g: GameState }) {
  const ps = g.portal!;
  const team = g.teams[g.user.teamId];
  const recruits = Object.values(g.recruits).filter((r) => r.committed === team.id).length;
  const room = userNilRoom(g);
  return (
    <div className="card mb row wrap" style={{ gap: 16 }}>
      <div className="row" style={{ gap: 6 }}>
        <div className={`pill ${ps.day === 0 ? 'accent' : 'good'}`}>{ps.day === 0 ? 'Retention' : '✓ Retention'}</div>
        {Array.from({ length: ps.maxDays }, (_, i) => {
          const d = i + 1;
          const cur = d === ps.day;
          return (
            <motion.div key={d} animate={{ scale: cur ? 1.08 : 1 }} className={`pill ${cur ? 'accent' : d < ps.day ? 'good' : ''}`} style={{ opacity: d > ps.day ? 0.5 : 1 }}>
              {d === ps.maxDays ? '🔒 Deadline' : `Day ${d}`}
            </motion.div>
          );
        })}
      </div>
      <div className="spacer" />
      {ps.day > 0 && <div className="hours-chip">⏱ <span className="num" style={{ fontSize: 16 }}>{ps.hours}</span><span className="muted">/ {ps.hoursMax} hrs today</span></div>}
      <div className="hours-chip">👥 <span className="num" style={{ fontSize: 16 }}>{team.roster.length}</span><span className="muted">/ {ROSTER_MAX}{recruits ? ` (+${recruits} HS)` : ''}</span></div>
      <div className="hours-chip" title="NIL available after roster deals, recruit promises and your pending portal offers">💰 <span className="num" style={{ fontSize: 16, color: room < 0 ? 'var(--bad)' : undefined }}><AnimatedNumber value={room} format={fmtMoneyShort} /></span><span className="muted">NIL room</span></div>
    </div>
  );
}

// ================= Retention =================
function RetentionStage({ g }: { g: GameState }) {
  const meetings = Object.entries(g.user.retention);
  const ps = g.portal!;
  const team = g.teams[g.user.teamId];
  const dayOne = Object.values(ps.entries).filter((e) => e.enterDay === 1);
  const stars = dayOne.filter((e) => e.stars >= 4).length;
  const open = meetings.filter(([, r]) => !r.resolved).length;
  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', alignItems: 'start' }}>
      <Section title="Retention Meetings" right={<span className="tiny muted">{open ? `${open} unresolved — they decide when the window opens` : 'All meetings done'}</span>}>
        {meetings.length === 0 ? (
          <div className="empty"><div style={{ fontSize: 40 }}>🔐</div><div className="h3" style={{ marginTop: 8 }}>Locker room locked in</div><div className="small muted" style={{ marginTop: 6 }}>Nobody on {team.school}'s roster asked for a meeting. Time to go shopping.</div></div>
        ) : (
          <div className="col" style={{ gap: 12 }}>
            {meetings.map(([id, r], i) => <MeetingCard key={id} g={g} id={id} i={i} />)}
          </div>
        )}
      </Section>
      <div className="col" style={{ gap: 16 }}>
        <Section title="Window Preview">
          <div className="num" style={{ fontSize: 40, lineHeight: 1 }}>{dayOne.length}</div>
          <div className="small muted">players are expected to enter on day one{stars ? `, including ${stars} four- and five-star transfers` : ''}.</div>
          <div className="divider" />
          <div className="small col" style={{ gap: 6 }}>
            <div>📅 The window runs <b>{ps.maxDays} days</b>. More players enter in waves — some stars withdraw from the NBA draft mid-week.</div>
            <div>📞 Call, Zoom and host official visits to build relationships. Your <b>odds update live</b>.</div>
            <div>💸 Rivals raise their offers. Players will call you asking to match.</div>
            <div>⏰ Every player has a decision day. Miss it and he's gone.</div>
          </div>
        </Section>
        <NeedsBoard g={g} />
      </div>
    </div>
  );
}

function MeetingCard({ g, id, i }: { g: GameState; id: string; i: number }) {
  const r = g.user.retention[id];
  const p = g.players[id];
  const team = g.teams[g.user.teamId];
  const { mutate, toast } = useGame.getState();
  const [flash, setFlash] = useState<null | boolean>(null);
  if (!p) return null;
  const odds = retentionOdds(g, id);
  const choose = (c: 'pay' | 'promise' | 'talk' | 'release') => {
    let res = { ok: false, stayed: false, msg: '' };
    mutate((gg) => { res = retentionChoose(gg, id, c); });
    if (!res.ok) { if (res.msg) toast(res.msg, 'bad'); return; }
    setFlash(res.stayed);
    toast(res.msg, res.stayed ? 'good' : 'bad');
    if (res.stayed) sfx.fanfare(); else sfx.rim();
  };
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <motion.div className="card" initial={{ opacity: 0, x: -14 }} animate={flash === false ? { x: [0, -8, 8, -5, 5, 0], opacity: 1 } : { opacity: 1, x: 0 }} transition={{ delay: flash == null ? i * 0.08 : 0 }}
      style={{ position: 'relative', overflow: 'hidden', borderColor: r.resolved ? (r.staying ? 'rgba(34,211,143,.5)' : 'rgba(255,93,93,.45)') : undefined }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <PlayerFace p={p} size={76} team={team} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="b" style={{ fontSize: 17 }}>{p.first} {p.last}</span>
            <span className="pill">{p.pos} · {p.cls}</span><Ovr v={p.ovr} size="sm" />
            <span className="pill gold">{REASON_ICON[r.reason ?? 'Fresh start']} {r.reason}</span>
          </div>
          <div className="tiny muted" style={{ marginTop: 2 }}>Current NIL {fmtMoneyShort(p.nil?.amount ?? 0)} · Morale {Math.round(p.morale)} · Leave risk {Math.round((r.prob ?? 0.3) * 100)}%</div>
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.08 }}
            style={{ marginTop: 8, padding: '10px 12px', background: 'rgba(255,255,255,.05)', borderRadius: '4px 14px 14px 14px', fontStyle: 'italic' }}>
            “{r.quote ?? 'Coach, we need to talk.'}”
          </motion.div>
        </div>
      </div>
      {!r.resolved ? (
        <div className="row wrap gap-s" style={{ marginTop: 12 }}>
          <button className="btn sm primary" onClick={() => choose('pay')}>💰 Pay {fmtMoneyShort(r.ask)} <span style={{ opacity: 0.8 }}>· {pct(odds.pay)}</span></button>
          <button className="btn sm" onClick={() => choose('promise')}>🤝 Promise a starting role <span className="muted">· {pct(odds.promise)}</span></button>
          <button className="btn sm" onClick={() => choose('talk')}>🗣️ Heart-to-heart <span className="muted">· {pct(odds.talk)}</span></button>
          <button className="btn sm ghost" onClick={() => choose('release')}>👋 Let him go</button>
        </div>
      ) : (
        <AnimatePresence>
          <motion.div initial={{ scale: 2.2, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: -6 }} transition={{ type: 'spring', stiffness: 380, damping: 14 }}
            style={{ position: 'absolute', right: 18, bottom: 14, padding: '6px 14px', border: `3px solid ${r.staying ? 'var(--good)' : 'var(--bad)'}`, color: r.staying ? 'var(--good)' : 'var(--bad)', borderRadius: 8, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22, letterSpacing: '.08em' }}>
            {r.staying ? 'STAYING' : 'ENTERING PORTAL'}
          </motion.div>
        </AnimatePresence>
      )}
    </motion.div>
  );
}

// ================= Window =================
type Tab = 'board' | 'targets' | 'commits';
function WindowStage({ g }: { g: GameState }) {
  const ps = g.portal!;
  const [tab, setTab] = useState<Tab>('board');
  const [sel, setSel] = useState<string | null>(null);
  const uid = g.user.teamId;
  const all = visibleEntries(g);
  const targets = all.filter((e) => e.offers.some((o) => o.teamId === uid) || (e.rel[uid] ?? 0) > 0);
  useEffect(() => { if (sel && !g.portal?.entries[sel]) setSel(null); }, [g, sel]);
  return (
    <div>
      {ps.calls.length > 0 && <Calls g={g} />}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.75fr) minmax(360px, 1fr)', alignItems: 'start' }}>
        <div className="card flush">
          <div className="row" style={{ padding: '14px 16px 10px' }}>
            <div className="tabs">
              {([['board', `Big Board (${all.filter((e) => e.status === 'available').length})`], ['targets', `My Targets (${targets.length})`], ['commits', `Commitments (${all.filter((e) => e.status === 'committed').length})`]] as [Tab, string][]).map(([id, l]) => (
                <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{tab === id && <motion.div layoutId="ptab" className="tab-bg" />}<span>{l}</span></button>
              ))}
            </div>
          </div>
          {tab === 'commits' ? <Commits g={g} onSel={setSel} /> : <Board g={g} list={tab === 'targets' ? targets : all.filter((e) => e.status === 'available')} sel={sel} onSel={setSel} targets={tab === 'targets'} />}
        </div>
        <div className="col" style={{ gap: 16, position: 'sticky', top: 0 }}>
          {sel && g.portal?.entries[sel] ? <PlayerPanel g={g} e={g.portal.entries[sel]} onClose={() => setSel(null)} /> : (
            <>
              <Wire g={g} onSel={setSel} />
              <NeedsBoard g={g} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Calls({ g }: { g: GameState }) {
  const ps = g.portal!;
  const { mutate, toast } = useGame.getState();
  const team = g.teams[g.user.teamId];
  return (
    <div className="grid mb" style={{ gridTemplateColumns: `repeat(${Math.min(3, ps.calls.length)}, minmax(0, 1fr))` }}>
      <AnimatePresence>
        {ps.calls.map((c, i) => {
          const p = g.players[c.playerId];
          const e = ps.entries[c.playerId];
          const mine = e ? userOffer(g, e) : undefined;
          if (!p || !e || !mine) return null;
          const rival = g.teams[c.teamId];
          const act = (a: 'match' | 'half' | 'hold') => {
            let r = { ok: false, msg: '' };
            mutate((gg) => { r = answerCall(gg, c.playerId, a); });
            if (r.msg) toast(r.msg, r.ok ? (a === 'hold' ? 'info' : 'good') : 'bad');
            if (r.ok && a !== 'hold') sfx.swish();
          };
          return (
            <motion.div key={c.playerId} className="card glow" initial={{ opacity: 0, y: -16, rotate: -1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ delay: i * 0.1 }}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <motion.div animate={{ rotate: [0, -8, 8, -8, 0] }} transition={{ repeat: Infinity, duration: 1.6, repeatDelay: 1 }}><PlayerFace p={p} size={56} team={team} /></motion.div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="tiny upper b" style={{ color: 'var(--gold)', letterSpacing: '.14em' }}>📞 Incoming call</div>
                  <div className="b">{p.first} {p.last} <Stars n={e.stars} /></div>
                  <div className="small" style={{ marginTop: 4, fontStyle: 'italic' }}>“Coach, {rival.school} is at {fmtMoneyShort(c.rivalNil)}. Get to {fmtMoneyShort(c.want)} and I’m yours.”</div>
                  <div className="tiny muted">Your offer: {fmtMoneyShort(mine.nil)} · NIL room {fmtMoneyShort(userNilRoom(g, c.playerId))}</div>
                </div>
              </div>
              <div className="row wrap gap-s" style={{ marginTop: 10 }}>
                <button className="btn sm primary" onClick={() => act('match')}>Match {fmtMoneyShort(c.want)}</button>
                <button className="btn sm" onClick={() => act('half')}>Meet halfway</button>
                <button className="btn sm ghost" onClick={() => act('hold')}>Hold firm</button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function Board({ g, list, sel, onSel, targets }: { g: GameState; list: PortalEntry[]; sel: string | null; onSel: (id: string) => void; targets: boolean }) {
  const ps = g.portal!;
  const uid = g.user.teamId;
  const [pos, setPos] = useState<Pos | ''>('');
  const [stars, setStars] = useState(0);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'rank' | 'decide' | 'ask' | 'odds'>(targets ? 'decide' : 'rank');
  const [limit, setLimit] = useState(40);
  const rows = useMemo(() => {
    const filt = list.filter((e) => {
      const p = g.players[e.id];
      if (!p) return false;
      if (pos && p.pos !== pos) return false;
      if (stars && e.stars < stars) return false;
      if (q && !`${p.first} ${p.last}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
    const oddsOf = (e: PortalEntry) => entryOdds(g, e).find((o) => o.teamId === uid)?.p ?? -1;
    return filt.sort((a, b) => sort === 'rank' ? a.rank - b.rank : sort === 'decide' ? a.decideDay - b.decideDay || a.rank - b.rank : sort === 'ask' ? b.ask - a.ask : oddsOf(b) - oddsOf(a));
  }, [list, pos, stars, q, sort, g]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <div className="row wrap gap-s" style={{ padding: '0 16px 10px' }}>
        <div className="seg">{(['', 'PG', 'SG', 'SF', 'PF', 'C'] as (Pos | '')[]).map((x) => <button key={x || 'all'} className={pos === x ? 'on' : ''} onClick={() => setPos(x)}>{x || 'All'}</button>)}</div>
        <div className="seg">{[0, 3, 4, 5].map((s) => <button key={s} className={stars === s ? 'on' : ''} onClick={() => setStars(s)}>{s ? `${s}★+` : 'Any ★'}</button>)}</div>
        <input className="input" style={{ width: 160 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" style={{ width: 150 }} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="rank">Sort: Portal rank</option><option value="decide">Sort: Deciding soonest</option><option value="odds">Sort: Your odds</option><option value="ask">Sort: Asking NIL</option>
        </select>
      </div>
      <div style={{ maxHeight: 'calc(100vh - 330px)', overflowY: 'auto' }}>
        {rows.slice(0, limit).map((e, i) => <Row key={e.id} g={g} e={e} i={i} active={sel === e.id} onSel={onSel} />)}
        {!rows.length && <div className="empty small">{targets ? 'No targets yet. Call, Zoom or offer players from the Big Board.' : 'No players match.'}</div>}
        {limit < rows.length && <div className="center" style={{ padding: 12 }}><button className="btn sm" onClick={() => setLimit(limit + 40)}>Show more</button></div>}
      </div>
      <div className="tiny dim" style={{ padding: '8px 16px 12px' }}>Day {ps.day} of {ps.maxDays} · odds are honest: the % is his real chance if he decided right now.</div>
    </div>
  );
}

function Row({ g, e, i, active, onSel }: { g: GameState; e: PortalEntry; i: number; active: boolean; onSel: (id: string) => void }) {
  const ps = g.portal!;
  const p = g.players[e.id];
  const uid = g.user.teamId;
  const odds = entryOdds(g, e);
  const mine = odds.find((o) => o.teamId === uid);
  const lead = odds[0];
  const ll = lastLine(g, e.id);
  const from = g.teams[e.from];
  const decidesToday = e.decideDay <= ps.day || ps.day >= ps.maxDays;
  const { mutate, toast } = useGame.getState();
  const act = (a: PortalActionKey) => {
    let r = { ok: false, msg: '' };
    mutate((gg) => { r = portalAction(gg, e.id, a); });
    toast(r.msg, r.ok ? 'good' : 'bad');
    if (r.ok) sfx.click();
  };
  if (!p) return null;
  return (
    <div className="row-in" style={{ animationDelay: `${Math.min(i * 18, 360)}ms` }}>
      <div className="row" onClick={() => onSel(e.id)}
        style={{ padding: '9px 16px', borderTop: '1px solid var(--line)', cursor: 'pointer', background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : undefined, gap: 10 }}>
        <span className="num dim" style={{ width: 30, textAlign: 'right' }}>{e.rank}</span>
        <PlayerFace p={p} size={38} team={from} bg="none" />
        <div style={{ flex: 2, minWidth: 150 }}>
          <div className="small b ellipsis">{p.first} {p.last} <Stars n={e.stars} /></div>
          <div className="tiny muted ellipsis">{p.pos} · {p.cls} · {fmtHeight(p.height)} · {REASON_ICON[e.reason]} {e.reason}</div>
        </div>
        <div className="row" style={{ gap: 6, width: 112, minWidth: 0 }}>
          <TeamLogo team={from} size={20} />
          <span className="tiny muted ellipsis">{ll ? `${ll.ppg.toFixed(1)}p ${ll.rpg.toFixed(1)}r ${ll.apg.toFixed(1)}a` : '—'}</span>
        </div>
        <Ovr v={p.ovr} size="sm" />
        <span className="tiny mono" style={{ width: 52, textAlign: 'right' }}>{fmtMoneyShort(e.ask)}</span>
        <div style={{ width: 120 }}>
          {mine ? (
            <>
              <div className="row tiny" style={{ justifyContent: 'space-between' }}><span className="b" style={{ color: 'var(--accent)' }}>You {Math.round(mine.p * 100)}%</span>{lead && lead.teamId !== uid && <span className="muted">{g.teams[lead.teamId].abbr} {Math.round(lead.p * 100)}%</span>}</div>
              <div className="bar thin"><motion.i initial={false} animate={{ width: `${mine.p * 100}%` }} style={{ background: 'var(--accent)' }} /></div>
            </>
          ) : (() => {
            const shot = entryOdds(g, e, { teamId: uid, nil: e.ask, years: 1, promise: null }).find((o) => o.teamId === uid)?.p ?? 0;
            const col = shot >= 0.5 ? 'var(--good)' : shot >= 0.25 ? 'var(--gold)' : 'var(--bad)';
            return (
              <div title="Your odds if you offered his asking price right now">
                <div className="row tiny" style={{ justifyContent: 'space-between' }}><span style={{ color: col }} className="b">Your shot {Math.round(shot * 100)}%</span>{lead && <span className="muted">{g.teams[lead.teamId].abbr} leads</span>}</div>
                <div className="bar thin"><i style={{ width: `${shot * 100}%`, background: col, opacity: 0.6 }} /></div>
              </div>
            );
          })()}
        </div>
        <span className={`pill ${decidesToday ? 'bad pulse' : ''}`} style={{ width: 82, justifyContent: 'center' }}>{decidesToday ? 'Decides today' : `Day ${e.decideDay}`}</span>
        <div className="row" style={{ gap: 3 }} onClick={(ev) => ev.stopPropagation()}>
          {(Object.keys(PORTAL_ACTIONS) as PortalActionKey[]).map((a) => {
            const used = a === 'call' ? e.userCall === ps.day : a === 'zoom' ? e.userZoom === ps.day : e.visits.includes(uid);
            return <button key={a} className="btn sm ghost" style={{ padding: '3px 6px', opacity: used ? 0.3 : 1 }} disabled={used || ps.hours < PORTAL_ACTIONS[a].hours} title={`${PORTAL_ACTIONS[a].label} (${PORTAL_ACTIONS[a].hours}h): ${PORTAL_ACTIONS[a].desc}`} onClick={() => act(a)}>{PORTAL_ACTIONS[a].icon}</button>;
          })}
          <button className={`btn sm ${userOffer(g, e) ? '' : 'primary'}`} style={{ padding: '3px 8px' }} onClick={() => onSel(e.id)}>{userOffer(g, e) ? 'Edit' : 'Offer'}</button>
        </div>
      </div>
    </div>
  );
}

function PlayerPanel({ g, e, onClose }: { g: GameState; e: PortalEntry; onClose: () => void }) {
  const ps = g.portal!;
  const p = g.players[e.id];
  const uid = g.user.teamId;
  const from = g.teams[e.from];
  const mine = userOffer(g, e);
  const room = Math.max(0, userNilRoom(g, e.id));
  const [nil, setNil] = useState(mine?.nil ?? Math.min(e.ask, room));
  const [years, setYears] = useState(mine?.years ?? 1);
  const [promise, setPromise] = useState<PortalOffer['promise']>(mine?.promise ?? null);
  useEffect(() => { setNil(mine?.nil ?? Math.min(e.ask, room)); setYears(mine?.years ?? 1); setPromise(mine?.promise ?? null); }, [e.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const { mutate, toast, open } = useGame.getState();
  if (!p) return null;
  const odds = entryOdds(g, e);
  const preview = e.status === 'available' ? entryOdds(g, e, { teamId: uid, nil, years, promise }).find((o) => o.teamId === uid) : undefined;
  const ll = lastLine(g, e.id);
  const max = Math.max(e.ask * 2.5, nil, 25000);
  const act = (a: PortalActionKey) => {
    let r = { ok: false, msg: '' };
    mutate((gg) => { r = portalAction(gg, e.id, a); });
    toast(r.msg, r.ok ? 'good' : 'bad');
    if (r.ok) sfx.click();
  };
  const send = () => {
    let r = { ok: false, msg: '' };
    mutate((gg) => { r = portalMakeOffer(gg, e.id, nil, years, promise); });
    toast(r.msg, r.ok ? 'good' : 'bad');
    if (r.ok) sfx.swish(); else sfx.rim();
  };
  return (
    <motion.div key={e.id} className="card" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} style={{ padding: 0, overflow: 'hidden', maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
      <div style={{ padding: '16px 16px 12px', background: `linear-gradient(135deg, ${from.colors[0]}aa, transparent 70%)`, position: 'relative' }}>
        <button className="btn sm ghost" style={{ position: 'absolute', right: 8, top: 8 }} onClick={onClose}>✕</button>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ cursor: 'pointer' }} onClick={() => open({ kind: 'player', id: p.id })}><PlayerFace p={p} size={88} team={e.to ? g.teams[e.to] : from} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tiny upper b muted" style={{ letterSpacing: '.12em' }}>No. {e.rank} in the portal</div>
            <div className="h3" style={{ fontSize: 20 }}>{p.first} {p.last}</div>
            <Stars n={e.stars} />
            <div className="tiny muted">{p.pos} · {p.cls} · {p.elig} yr{p.elig === 1 ? '' : 's'} left · {fmtHeight(p.height)}</div>
            <div className="row tiny" style={{ gap: 6, marginTop: 4 }}><TeamLogo team={from} size={18} /> from <TeamName team={from} /></div>
          </div>
          <div style={{ textAlign: 'center' }}><Ovr v={p.ovr} /><div className="tiny dim">POT {p.pot}</div></div>
        </div>
        <div className="row wrap gap-s" style={{ marginTop: 10 }}>
          <span className="pill gold">{REASON_ICON[e.reason]} {e.reason}</span>
          {ll && <span className="pill">{ll.ppg.toFixed(1)} PPG · {ll.rpg.toFixed(1)} RPG · {ll.apg.toFixed(1)} APG</span>}
          <span className="pill">Asks {fmtMoneyShort(e.ask)}</span>
          {e.status === 'available' && <span className={`pill ${e.decideDay <= ps.day ? 'bad' : ''}`}>{e.decideDay <= ps.day || ps.day >= ps.maxDays ? 'Decides tonight' : `Decides day ${e.decideDay}`}</span>}
        </div>
      </div>
      <div style={{ padding: 16 }} className="col">
        {e.status === 'committed' && e.to && (
          <div className="row" style={{ padding: 12, borderRadius: 12, background: e.to === uid ? 'rgba(34,211,143,.12)' : 'rgba(255,255,255,.04)' }}>
            <TeamLogo team={g.teams[e.to]} size={36} />
            <div><div className="b">{e.to === uid ? 'Committed to you!' : `Committed to ${g.teams[e.to].school}`}</div><div className="tiny muted">{fmtMoneyShort(e.dealNil ?? 0)} NIL deal</div></div>
          </div>
        )}
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>What he wants</div>
          {e.known ? (
            (Object.keys(e.pri) as (keyof typeof e.pri)[]).sort((a, b) => e.pri[b] - e.pri[a]).map((k) => (
              <div key={k} className="row" style={{ gap: 8, marginBottom: 4 }}><span className="tiny" style={{ width: 100 }}>{PRI_LABEL[k]}</span><div style={{ flex: 1 }}><Bar v={e.pri[k]} max={0.45} className="thin" color="var(--blue)" /></div></div>
            ))
          ) : <div className="small muted">🔒 Call or Zoom with him to learn his priorities.</div>}
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Recruitment · {e.offers.length} offer{e.offers.length === 1 ? '' : 's'}</div>
          {odds.length === 0 && <div className="small muted">No offers yet. Be first.</div>}
          {odds.map((o) => {
            const t = g.teams[o.teamId];
            const me = o.teamId === uid;
            return (
              <div key={o.teamId} className="row" style={{ gap: 8, marginBottom: 6 }}>
                <TeamLogo team={t} size={22} />
                <span className={`small ellipsis ${me ? 'b' : ''}`} style={{ width: 96 }}>{t.school}</span>
                <div className="bar" style={{ flex: 1 }}><motion.i initial={{ width: 0 }} animate={{ width: `${o.p * 100}%` }} transition={{ duration: 0.7 }} style={{ background: me ? 'var(--accent)' : teamAccent(t.colors) }} /></div>
                <span className="num small" style={{ width: 36, textAlign: 'right' }}>{Math.round(o.p * 100)}%</span>
                <span className="tiny muted" style={{ width: 52, textAlign: 'right' }}>{me ? fmtMoneyShort(o.nil) : approx(o.nil)}</span>
                <span className="tiny" style={{ width: 16 }}>{e.visits.includes(o.teamId) ? '✈️' : ''}</span>
              </div>
            );
          })}
          {e.top && <div className="tiny muted">Top {e.top.length}: {e.top.map((id) => g.teams[id].abbr).join(', ')}</div>}
        </div>
        {e.status === 'available' && (
          <>
            <div className="row wrap gap-s">
              {(Object.keys(PORTAL_ACTIONS) as PortalActionKey[]).map((a) => {
                const used = a === 'call' ? e.userCall === ps.day : a === 'zoom' ? e.userZoom === ps.day : e.visits.includes(uid);
                return <button key={a} className="btn sm" disabled={used || ps.hours < PORTAL_ACTIONS[a].hours} title={PORTAL_ACTIONS[a].desc} onClick={() => act(a)}>{PORTAL_ACTIONS[a].icon} {PORTAL_ACTIONS[a].label} <span className="dim">{PORTAL_ACTIONS[a].hours}h</span></button>;
              })}
              <span className="tiny muted" style={{ alignSelf: 'center' }}>Relationship {Math.round(e.rel[uid] ?? 0)}</span>
            </div>
            <div className="card" style={{ padding: 12, background: 'rgba(255,255,255,.03)' }}>
              <div className="row small" style={{ justifyContent: 'space-between' }}><span className="muted">NIL per year</span><span className="num" style={{ fontSize: 20 }}>{fmtMoneyShort(nil)}</span></div>
              <input type="range" min={0} max={max} step={max > 1e6 ? 25000 : 1000} value={nil} onChange={(ev) => setNil(+ev.target.value)} />
              <div className="row tiny muted" style={{ justifyContent: 'space-between' }}><span>Ask {fmtMoneyShort(e.ask)}</span><span>Room {fmtMoneyShort(room)}</span></div>
              <div className="row wrap" style={{ marginTop: 8, gap: 8 }}>
                <div className="seg">{[1, 2].map((y) => <button key={y} className={years === y ? 'on' : ''} onClick={() => setYears(y)}>{y} yr</button>)}</div>
                <div className="seg">{([null, 'rotation', 'starter', 'star'] as PortalOffer['promise'][]).map((x) => <button key={String(x)} className={promise === x ? 'on' : ''} onClick={() => setPromise(x)}>{x ?? 'No promise'}</button>)}</div>
              </div>
              {preview && (
                <div className="row" style={{ marginTop: 10, gap: 8 }}>
                  <span className="small">Your odds with this offer:</span>
                  <motion.span key={Math.round(preview.p * 100)} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="num" style={{ fontSize: 22, color: preview.p >= 0.5 ? 'var(--good)' : preview.p >= 0.25 ? 'var(--gold)' : 'var(--bad)' }}>{Math.round(preview.p * 100)}%</motion.span>
                </div>
              )}
              <div className="row" style={{ marginTop: 10 }}>
                {mine && <button className="btn sm danger" onClick={() => { mutate((gg) => portalWithdraw(gg, e.id)); toast('Offer withdrawn.'); }}>Withdraw</button>}
                <div className="spacer" />
                <button className="btn primary" disabled={nil > room} onClick={send}>{nil > room ? 'Over NIL room' : mine ? 'Update offer' : 'Send offer'}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

const FEED_ICON: Record<PortalFeedItem['kind'], string> = { enter: '🚪', withdraw: '🏀', commit: '✍️', top: '📋', visit: '✈️', offer: '💰', leak: '👀', unsigned: '🫥', user: '⭐', open: '🚨', close: '🔒' };

function Wire({ g, onSel }: { g: GameState; onSel: (id: string) => void }) {
  const ps = g.portal!;
  const [limit, setLimit] = useState(30);
  return (
    <Section title="The Portal Wire" right={<span className="pill bad pulse">● LIVE</span>}>
      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        <AnimatePresence initial={false}>
          {ps.feed.slice(0, limit).map((f, i) => (
            <motion.div key={`${f.day}-${i}-${f.text.slice(0, 20)}`} layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              className="row" style={{ alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--line)', cursor: f.playerId ? 'pointer' : undefined }}
              onClick={() => f.playerId && ps.entries[f.playerId] && onSel(f.playerId)}>
              {f.handle ? <PersonFace seed={f.handle} size={28} /> : <span style={{ width: 28, textAlign: 'center', fontSize: 16 }}>{FEED_ICON[f.kind]}</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                {f.handle && <div className="tiny"><b>@{f.handle}</b> <span style={{ color: 'var(--blue)' }}>✔</span></div>}
                <div className="small" style={{ fontWeight: f.big ? 700 : 400, color: f.big ? 'var(--text)' : undefined }}>{f.text}</div>
              </div>
              {f.teamId && g.teams[f.teamId] && <TeamLogo team={g.teams[f.teamId]} size={20} />}
              <span className="tiny dim" style={{ width: 34, textAlign: 'right' }}>D{f.day}</span>
            </motion.div>
          ))}
        </AnimatePresence>
        {limit < ps.feed.length && <button className="btn sm ghost block" onClick={() => setLimit(limit + 40)}>Older…</button>}
      </div>
    </Section>
  );
}

function NeedsBoard({ g }: { g: GameState }) {
  const team = g.teams[g.user.teamId];
  const roster = teamPlayers(g, team.id);
  const recruits = Object.values(g.recruits).filter((r) => r.committed === team.id);
  const incoming = new Set(Object.values(g.portal?.entries ?? {}).filter((e) => e.to === team.id).map((e) => e.id));
  const open = ROSTER_MAX - roster.length - recruits.length;
  return (
    <Section title="Roster Needs" right={<span className={`pill ${open > 0 ? 'accent' : 'good'}`}>{open > 0 ? `${open} open spot${open > 1 ? 's' : ''}` : 'Roster full'}</span>}>
      {(['PG', 'SG', 'SF', 'PF', 'C'] as Pos[]).map((pos) => {
        const ps = roster.filter((p) => p.pos === pos).sort((a, b) => b.ovr - a.ovr);
        const rc = recruits.filter((r) => r.pos === pos);
        const thin = ps.length + rc.length <= 1;
        return (
          <div key={pos} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)', gap: 8 }}>
            <span className="pill" style={{ width: 38, justifyContent: 'center' }}>{pos}</span>
            <div className="row wrap" style={{ flex: 1, gap: 4 }}>
              {ps.map((p) => <span key={p.id} className={`pill ${incoming.has(p.id) ? 'good' : ''}`} title={p.cls}>{incoming.has(p.id) ? '🔁 ' : ''}{p.last} {p.ovr}</span>)}
              {rc.map((r) => <span key={r.id} className="pill blue">🎓 {r.last} {'★'.repeat(r.stars)}</span>)}
              {!ps.length && !rc.length && <span className="tiny dim">Nobody</span>}
            </div>
            {thin && <span className="pill bad">Need</span>}
          </div>
        );
      })}
    </Section>
  );
}

function Commits({ g, onSel }: { g: GameState; onSel: (id: string) => void }) {
  const ps = g.portal!;
  const [mine, setMine] = useState(false);
  const list = visibleEntries(g).filter((e) => e.status === 'committed' && (!mine || e.to === g.user.teamId || e.from === g.user.teamId)).sort((a, b) => a.rank - b.rank);
  return (
    <div>
      <div className="row" style={{ padding: '0 16px 10px' }}>
        <div className="seg"><button className={!mine ? 'on' : ''} onClick={() => setMine(false)}>Everyone</button><button className={mine ? 'on' : ''} onClick={() => setMine(true)}>My program</button></div>
      </div>
      <div style={{ maxHeight: 'calc(100vh - 330px)', overflowY: 'auto' }}>
        {list.slice(0, 120).map((e) => {
          const p = g.players[e.id];
          if (!p) return null;
          const to = g.teams[e.to!], from = g.teams[e.from];
          return (
            <div key={e.id} className="row" style={{ padding: '8px 16px', borderTop: '1px solid var(--line)', cursor: 'pointer' }} onClick={() => onSel(e.id)}>
              <span className="num dim" style={{ width: 30, textAlign: 'right' }}>{e.rank}</span>
              <PlayerFace p={p} size={34} team={to} bg="none" />
              <div style={{ flex: 1, minWidth: 0 }}><div className="small b ellipsis">{p.first} {p.last} <Stars n={e.stars} /></div><div className="tiny muted">{p.pos} · {fmtMoneyShort(e.dealNil ?? 0)}</div></div>
              <TeamLogo team={from} size={22} /><span className="dim">→</span><TeamLogo team={to} size={26} />
              <span className={`small b ellipsis ${e.to === g.user.teamId ? 'good' : ''}`} style={{ width: 120 }}>{to.school}</span>
            </div>
          );
        })}
        {!list.length && <div className="empty small">No commitments yet. Decision days start on day {Math.min(ps.maxDays, 2)}.</div>}
      </div>
    </div>
  );
}

/** Report card shown after the window closes (Signing Day screen) */
export function PortalReportCard({ g }: { g: GameState }) {
  const grades = g.portal?.grades;
  if (!grades?.length) return null;
  const mine = grades.find((x) => x.teamId === g.user.teamId);
  const color = (gr: string) => (gr.startsWith('A') ? 'var(--good)' : gr.startsWith('B') ? 'var(--gold)' : gr.startsWith('C') ? 'var(--warn)' : 'var(--bad)');
  return (
    <Section title="Portal Report Card" className="mb">
      <div className="row" style={{ gap: 24, alignItems: 'flex-start' }}>
        <div style={{ textAlign: 'center', minWidth: 140 }}>
          <div className="eyebrow">Your grade</div>
          <motion.div initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }} className="num" style={{ fontSize: 72, lineHeight: 1, color: mine ? color(mine.grade) : 'var(--dim)' }}>{mine?.grade ?? '—'}</motion.div>
          <div className="tiny muted">{mine ? `${mine.count} addition${mine.count === 1 ? '' : 's'}` : 'No activity'}</div>
        </div>
        <div style={{ flex: 1 }} className="grid g2">
          {grades.slice(0, 10).map((x, i) => (
            <motion.div key={x.teamId} className="row" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
              <span className="num dim" style={{ width: 20 }}>{i + 1}</span>
              <TeamLogo team={g.teams[x.teamId]} size={24} />
              <span className="small b ellipsis" style={{ flex: 1 }}>{g.teams[x.teamId].school}</span>
              <span className="tiny muted">{x.count} in</span>
              <span className="num" style={{ width: 30, textAlign: 'right', color: color(x.grade) }}>{x.grade}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}
