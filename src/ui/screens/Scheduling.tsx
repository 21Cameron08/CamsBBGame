import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { TeamLogo, Section, AnimatedNumber, fmtMoneyShort, Empty, Gauge, Stars } from '../components/common';
import type { GameSite, GameState, PlannedGame } from '../../engine/types';
import { NONCONF_SLOTS, slotsUsed, offerStatus, bookGame, removeGame, restoreRival, chooseMte, autoFill, resumeMetrics, canAttend, userRivalryGames } from '../../engine/scheduling';
import { normCdf } from '../../engine/sim';
import { seasonLabel } from '../../engine/calendar';
import { teamAccent } from '../color';
import { sfx } from '../sound';

const TIER_LABEL = { 1: ['Elite field', 'gold'], 2: ['Strong field', 'accent'], 3: ['Mid-major field', 'blue'], 4: ['Small-school field', ''] } as const;
const SITE_LABEL: Record<GameSite, string> = { home: 'HOME', away: 'AWAY', neutral: 'NEUTRAL' };

function quad(rank: number, site: GameSite) {
  const [a, b, c] = site === 'home' ? [30, 75, 160] : site === 'neutral' ? [50, 100, 200] : [75, 135, 240];
  return rank <= a ? 1 : rank <= b ? 2 : rank <= c ? 3 : 4;
}
const QUAD_COLOR = ['', 'var(--good)', '#7ddc4a', 'var(--warn)', 'var(--bad)'];

export function SchedulingOffice() {
  const g = useGameState();
  const sc = g.scheduling;
  if (!sc) return <Empty>The Scheduling Office opens after summer development.</Empty>;
  const me = g.teams[g.user.teamId];
  const m = resumeMetrics(g);
  const used = slotsUsed(sc);
  const { mutate, toast } = useGame.getState();
  return (
    <div>
      <div className="row mb" style={{ alignItems: 'stretch', gap: 14 }}>
        <div className="card" style={{ flex: '1.3 1 0' }}>
          <div className="row"><div className="eyebrow" style={{ flex: 1 }}>{seasonLabel(sc.season)} non-conference dates</div><span className="num" style={{ fontSize: 20 }}>{used}/{NONCONF_SLOTS}</span></div>
          <div className="row" style={{ gap: 4, marginTop: 10 }}>
            {Array.from({ length: NONCONF_SLOTS }, (_, i) => (
              <motion.div key={i} initial={false} animate={{ background: i < used ? 'var(--accent)' : 'rgba(255,255,255,.08)', scaleY: i < used ? 1 : 0.7 }} style={{ flex: 1, height: 12, borderRadius: 4 }} />
            ))}
          </div>
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <button className="btn sm primary" disabled={used >= NONCONF_SLOTS} onClick={() => {
              let n = 0;
              mutate((gg) => { n = autoFill(gg); });
              toast(n ? `Your staff booked ${n} game${n > 1 ? 's' : ''}${g.staff?.members.some((x) => x.role === 'gm') ? ' (GM-approved slate)' : ''}.` : 'Staff couldn’t find more takers.', n ? 'good' : 'bad');
              if (n) sfx.swish();
            }}>🤖 Auto-fill open dates</button>
            <button className="btn sm ghost" disabled={!sc.games.some((x) => !x.locked)} onClick={() => mutate((gg) => { gg.scheduling!.games = gg.scheduling!.games.filter((x) => x.locked); })}>Clear booked games</button>
          </div>
        </div>
        <div className="card" style={{ flex: '0 0 auto', display: 'grid', placeItems: 'center', padding: '10px 16px' }}>
          {m.games >= 4
            ? <Gauge value={m.sosPct} label="Schedule Strength" sub={m.sosLabel} color={m.sosPct >= 70 ? 'var(--bad)' : m.sosPct >= 45 ? 'var(--gold)' : 'var(--good)'} size={88} />
            : <div style={{ width: 88, textAlign: 'center' }}><div className="num" style={{ fontSize: 30, color: 'var(--dim)' }}>—</div><div className="tiny upper b muted">Schedule Strength</div><div className="tiny dim">Too early</div></div>}
        </div>
        <div className="card" style={{ flex: '2 1 0' }}>
          <div className="grid g4" style={{ gap: 8 }}>
            <div className="stat-tile"><div className="l">Quad 1 chances</div><div className="v" style={{ color: 'var(--good)' }}><AnimatedNumber value={m.q1} format={(v) => v.toFixed(1).replace(/\.0$/, '')} /></div></div>
            <div className="stat-tile"><div className="l">Quad 4 risk</div><div className="v" style={{ color: m.q4 >= 5 ? 'var(--bad)' : undefined }}><AnimatedNumber value={m.q4} format={(v) => v.toFixed(1).replace(/\.0$/, '')} /></div></div>
            <div className="stat-tile"><div className="l">Proj. record</div><div className="v" style={{ fontSize: 24 }}>{m.expWins.toFixed(1)}–{m.expLosses.toFixed(1)}</div></div>
            <div className="stat-tile"><div className="l">Guarantees</div><div className="v" style={{ fontSize: 24, color: m.netGuarantee > 0 ? 'var(--good)' : m.netGuarantee < 0 ? 'var(--warn)' : undefined }}>{m.netGuarantee > 0 ? '+' : ''}{fmtMoneyShort(m.netGuarantee)}</div></div>
          </div>
          <motion.div key={m.verdict} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={`small ${m.verdictTone === 'good' ? 'good' : m.verdictTone === 'bad' ? 'bad' : 'muted'}`} style={{ marginTop: 10 }}>
            {m.verdictTone === 'good' ? '✅' : m.verdictTone === 'bad' ? '⚠️' : '🗒️'} {m.verdict}{m.hype ? ` Fan hype ${m.hype > 0 ? '+' : ''}${m.hype} at tip-off.` : ''}
          </motion.div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <div className="col" style={{ gap: 16 }}>
          <Events g={g} />
          <Slate g={g} />
        </div>
        <Finder g={g} myId={me.id} />
      </div>
    </div>
  );
}

function Events({ g }: { g: GameState }) {
  const sc = g.scheduling!;
  const { mutate, toast } = useGame.getState();
  const pick = (name: string | null) => {
    let r = { ok: false, msg: '' };
    mutate((gg) => { r = chooseMte(gg, name); });
    toast(r.msg, r.ok ? 'good' : 'bad');
    if (r.ok) sfx.click();
  };
  return (
    <Section title="Feast Week Event" right={<span className="tiny muted">2 neutral-site games · Thanksgiving week</span>}>
      <div className="grid g2" style={{ gap: 10 }}>
        {sc.mtes.map((ev) => {
          const on = sc.mte === ev.name;
          const ok = canAttend(g, ev);
          const [tl, tc] = TIER_LABEL[ev.tier];
          const avgRank = Math.round(ev.field.reduce((s, f) => s + (sc.projRank[f] ?? 200), 0) / ev.field.length);
          return (
            <motion.div key={ev.name} whileHover={ok ? { y: -2 } : {}} className="card" onClick={() => ok && pick(on ? null : ev.name)}
              style={{ padding: 12, cursor: ok ? 'pointer' : 'not-allowed', opacity: ok ? 1 : 0.5, borderColor: on ? 'var(--accent)' : undefined, background: on ? 'color-mix(in srgb, var(--accent) 14%, var(--panel))' : undefined }}>
              <div className="row"><span className="b" style={{ flex: 1 }}>{ev.name}</span>{on ? <span className="pill accent">✓ Entered</span> : <span className={`pill ${tc}`}>{tl}</span>}</div>
              <div className="tiny muted">📍 {ev.location} · field avg rank ~{avgRank}</div>
              <div className="row" style={{ marginTop: 8, gap: 10 }}>
                {ev.field.map((f) => (
                  <div key={f} className="row" style={{ gap: 4 }} title={`${g.teams[f].school} · projected No. ${sc.projRank[f]}`}>
                    <TeamLogo team={g.teams[f]} size={22} /><span className="tiny">{g.teams[f].abbr}</span>
                  </div>
                ))}
              </div>
              {!ok && <div className="tiny bad" style={{ marginTop: 6 }}>Invite only · program prestige {ev.minPrestige}+</div>}
            </motion.div>
          );
        })}
        <motion.div whileHover={{ y: -2 }} className="card" onClick={() => pick(null)} style={{ padding: 12, cursor: 'pointer', borderStyle: 'dashed', borderColor: sc.mte === null ? 'var(--accent)' : undefined }}>
          <div className="b">Skip Feast Week</div>
          <div className="tiny muted">Stay home and book two more games yourself.</div>
          {sc.mte === null && <span className="pill accent" style={{ marginTop: 8 }}>✓ Selected</span>}
        </motion.div>
      </div>
    </Section>
  );
}

function Slate({ g }: { g: GameState }) {
  const sc = g.scheduling!;
  const me = g.teams[g.user.teamId];
  const myR = sc.proj[me.id] ?? 0;
  const { mutate } = useGame.getState();
  const ev = sc.mte ? sc.mtes.find((x) => x.name === sc.mte) : undefined;
  const open = NONCONF_SLOTS - slotsUsed(sc);
  const dropped = userRivalryGames(g, sc.season).filter((x) => sc.droppedRivals.includes(x.oppId));
  const owedNext = sc.games.filter((x) => x.series);
  return (
    <Section title="Your Slate" right={<span className="tiny muted">Conference games are set by the league</span>}>
      <div className="col" style={{ gap: 6 }}>
        {ev && (
          <div className="row" style={{ padding: '9px 10px', borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)' }}>
            <span style={{ fontSize: 18 }}>🦃</span>
            <div style={{ flex: 1 }}><div className="small b">{ev.name}</div><div className="tiny muted">2 games vs {ev.field.map((f) => g.teams[f].abbr).join(' / ')} · {ev.location}</div></div>
            <span className="pill">NEUTRAL ×2</span>
          </div>
        )}
        <AnimatePresence initial={false}>
          {sc.games.map((x) => <GameRow key={x.oppId} g={g} x={x} myR={myR} />)}
        </AnimatePresence>
        {Array.from({ length: Math.max(0, open) }, (_, i) => (
          <div key={`open${i}`} className="row" style={{ padding: '9px 10px', borderRadius: 10, border: '1px dashed var(--line-2)', color: 'var(--dim)' }}>
            <span className="small">Open date</span><div className="spacer" /><span className="tiny">Book an opponent →</span>
          </div>
        ))}
      </div>
      {dropped.length > 0 && (
        <div className="row wrap gap-s" style={{ marginTop: 12 }}>
          <span className="tiny muted">Dropped rivalries:</span>
          {dropped.map((d) => <button key={d.oppId} className="btn sm" disabled={open <= 0} onClick={() => mutate((gg) => restoreRival(gg, d.oppId))}>↩ {g.teams[d.oppId].school}</button>)}
        </div>
      )}
      {owedNext.length > 0 && <div className="tiny muted" style={{ marginTop: 10 }}>🔁 Return games owed in {seasonLabel(sc.season + 1)}: {owedNext.map((x) => `${x.site === 'home' ? 'at ' : 'vs '}${g.teams[x.oppId].school}`).join(', ')}</div>}
    </Section>
  );
}

function GameRow({ g, x, myR }: { g: GameState; x: PlannedGame; myR: number }) {
  const sc = g.scheduling!;
  const opp = g.teams[x.oppId];
  const rank = sc.projRank[x.oppId] ?? 200;
  const adj = x.site === 'home' ? 3.2 : x.site === 'away' ? -3.2 : 0;
  const wp = normCdf((myR - (sc.proj[x.oppId] ?? 0) + adj) / 11);
  const qd = quad(rank, x.site);
  const { mutate } = useGame.getState();
  return (
    <motion.div layout initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30, height: 0 }} className="row"
      style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid var(--line)' }}>
      <span className="pill" style={{ width: 70, justifyContent: 'center' }}>{SITE_LABEL[x.site]}</span>
      <TeamLogo team={opp} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="small b ellipsis">{opp.school} <span className="tiny muted">proj. #{rank}</span></div>
        <div className="tiny muted ellipsis">
          {x.locked === 'rivalry' ? `🔥 ${x.event ?? 'Rivalry'}` : x.locked === 'return' ? '🔁 Return game (series)' : x.series ? 'Home-and-home · year 1' : x.event ?? (x.guarantee < 0 ? 'Buy game' : x.guarantee > 0 ? 'Guarantee game' : '')}
          {x.guarantee !== 0 && <span style={{ color: x.guarantee > 0 ? 'var(--good)' : 'var(--warn)' }}> · {x.guarantee > 0 ? '+' : ''}{fmtMoneyShort(x.guarantee)}</span>}
        </div>
      </div>
      <span className="pill" style={{ borderColor: QUAD_COLOR[qd], color: QUAD_COLOR[qd] }} title="Projected NCAA quadrant">Q{qd}</span>
      <span className="tiny mono" style={{ width: 38, textAlign: 'right', color: wp > 0.6 ? 'var(--good)' : wp < 0.4 ? 'var(--bad)' : undefined }}>{Math.round(wp * 100)}%</span>
      {x.locked === 'return' ? <span className="tiny dim" style={{ width: 28 }} title="Contracted">🔒</span> : (
        <button className="btn sm ghost" style={{ width: 28, padding: 4 }} title={x.locked === 'rivalry' ? 'Drop this rivalry game' : 'Remove'} onClick={() => mutate((gg) => removeGame(gg, x.oppId))}>✕</button>
      )}
    </motion.div>
  );
}

type Filter = 'marquee' | 'peers' | 'buy' | 'payday' | 'all';

function Finder({ g, myId }: { g: GameState; myId: string }) {
  const sc = g.scheduling!;
  const me = g.teams[myId];
  const [filter, setFilter] = useState<Filter>('marquee');
  const [q, setQ] = useState('');
  const [conf, setConf] = useState('');
  const [limit, setLimit] = useState(30);
  const { mutate, toast } = useGame.getState();
  const full = slotsUsed(sc) >= NONCONF_SLOTS;
  const list = useMemo(() => {
    const evField = sc.mte ? sc.mtes.find((x) => x.name === sc.mte)?.field ?? [] : [];
    return Object.values(g.teams).filter((t) => {
      if (t.id === me.id || t.conf === me.conf) return false;
      if (sc.games.some((x) => x.oppId === t.id) || evField.includes(t.id)) return false;
      if (conf && t.conf !== conf) return false;
      if (q && !`${t.school} ${t.mascot}`.toLowerCase().includes(q.toLowerCase())) return false;
      const r = sc.projRank[t.id] ?? 999;
      if (filter === 'marquee') return r <= 40;
      if (filter === 'peers') return Math.abs(t.prestige - me.prestige) <= 15;
      if (filter === 'buy') return offerStatus(g, t.id, 'home', false).guarantee < 0;
      if (filter === 'payday') return offerStatus(g, t.id, 'away', false).guarantee > 0;
      return true;
    }).sort((a, b) => (sc.projRank[a.id] ?? 999) - (sc.projRank[b.id] ?? 999));
  }, [g, sc.games, sc.mte, filter, q, conf, me]); // eslint-disable-line react-hooks/exhaustive-deps
  const book = (oppId: string, site: GameSite, series: boolean) => {
    let r = { ok: false, msg: '' };
    mutate((gg) => { r = bookGame(gg, oppId, site, series); });
    toast(r.msg, r.ok ? 'good' : 'bad');
    if (r.ok) sfx.swish(); else sfx.rim();
  };
  return (
    <Section title="Find Opponents" right={full ? <span className="pill good">All dates booked</span> : null}>
      <div className="row wrap gap-s" style={{ marginBottom: 10 }}>
        <div className="seg">
          {([['marquee', '⭐ Marquee'], ['peers', '🤝 Peers'], ['buy', '🏠 Buy games'], ['payday', '💵 Paydays'], ['all', 'All']] as [Filter, string][]).map(([id, l]) => (
            <button key={id} className={filter === id ? 'on' : ''} onClick={() => { setFilter(id); setLimit(30); }}>{l}</button>
          ))}
        </div>
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <input className="input" placeholder="Search schools…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" style={{ width: 170 }} value={conf} onChange={(e) => setConf(e.target.value)}>
          <option value="">All conferences</option>
          {g.conferences.filter((c) => c.id !== me.conf).map((c) => <option key={c.id} value={c.id}>{c.short}</option>)}
        </select>
      </div>
      <div className="tiny muted" style={{ marginBottom: 8 }}>
        {filter === 'marquee' && 'Projected top-40 teams. Big résumé chances — they’ll want a return trip to your place.'}
        {filter === 'peers' && 'Programs near your level. Home-and-homes and neutral-site games are easy to arrange.'}
        {filter === 'buy' && 'Smaller programs will come to your gym for a guarantee check. Easy wins, weak résumé.'}
        {filter === 'payday' && 'Bigger programs will pay you to visit. Tough road games — and money for your NIL pool.'}
        {filter === 'all' && 'Every non-conference program, sorted by projected strength.'}
      </div>
      <div className="col" style={{ gap: 6, maxHeight: 'calc(100vh - 330px)', overflowY: 'auto', paddingRight: 4 }}>
        {list.slice(0, limit).map((t) => {
          const st = { home: offerStatus(g, t.id, 'home', false), away: offerStatus(g, t.id, 'away', false), neutral: offerStatus(g, t.id, 'neutral', false), series: offerStatus(g, t.id, 'home', true) };
          const deal = st.home.ok && st.home.guarantee ? st.home.label : st.away.guarantee > 0 ? st.away.label : st.series.ok ? 'Open to a home-and-home' : st.home.label;
          return (
            <div key={t.id} className="row" style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid var(--line)' }}>
              <span className="num dim" style={{ width: 30, textAlign: 'right' }}>#{sc.projRank[t.id]}</span>
              <TeamLogo team={t} size={30} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="small b ellipsis" style={{ color: teamAccent(t.colors) === '#ffffff' ? undefined : undefined }}>{t.school}</div>
                <div className="tiny muted ellipsis">{g.conferences.find((c) => c.id === t.conf)?.short} · <Stars n={Math.max(1, Math.round(t.prestige / 20))} /> · {deal}</div>
              </div>
              <div className="row" style={{ gap: 4 }}>
                {(['home', 'away', 'neutral'] as GameSite[]).map((s) => (
                  <button key={s} className={`btn sm ${st[s].ok ? '' : 'ghost'}`} style={{ padding: '4px 8px', opacity: st[s].ok ? 1 : 0.45 }} disabled={full || !st[s].ok} title={st[s].label} onClick={() => book(t.id, s, false)}>
                    {s === 'home' ? '🏠' : s === 'away' ? '✈️' : '⚖️'}
                  </button>
                ))}
                <button className={`btn sm ${st.series.ok ? '' : 'ghost'}`} style={{ padding: '4px 8px', opacity: st.series.ok ? 1 : 0.45 }} disabled={full || !st.series.ok} title={st.series.ok ? 'Home-and-home: home this year, at their place next year' : st.series.label} onClick={() => book(t.id, 'home', true)}>H&H</button>
              </div>
            </div>
          );
        })}
        {!list.length && (
          <div className="empty small">
            {filter === 'payday' ? `Nobody pays a program like ${me.school} to visit — you're the one writing guarantee checks.`
              : filter === 'buy' ? `No one will take a one-off trip to ${me.school} right now. Try Peers for home-and-home series.`
              : 'No matches. Try another filter.'}
          </div>
        )}
        {limit < list.length && <button className="btn sm" onClick={() => setLimit(limit + 40)}>Show more</button>}
      </div>
      <div className="tiny dim" style={{ marginTop: 8 }}>🏠 home · ✈️ away · ⚖️ neutral site · H&H home-and-home (return game owed next year). Hover a button to see their answer.</div>
    </Section>
  );
}
