import { useEffect, useRef, useState } from 'react';
import { motion, animate } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { PlayerFace, Ovr, Tabs, Section, Empty } from '../components/common';
import { teamPlayers } from '../../engine/team';
import { RATING_LABELS, type DevFocus, type DevReportRow, type GameState, type Player, type PracticeFocus, type RatingKey } from '../../engine/types';
import {
  FOCUS_INFO, FOCUS_ORDER, PRACTICE_INFO, PRACTICE_ORDER, SPOTLIGHT_MAX, GOAL_ICON,
  devState, goalStatus, isNewcomer, planOf, projectFocus, recommendFocus, summerDone, devSkillFor,
} from '../../engine/development';
import { sfx } from '../sound';

const SHORT: Partial<Record<RatingKey, string>> = { tp: '3PT', mid: 'MID', ft: 'FT', ins: 'FIN', ath: 'ATH', spd: 'SPD', pas: 'PASS', hdl: 'HDL', iq: 'IQ', perD: 'PERD', stl: 'STL', sta: 'STA', intD: 'INTD', blk: 'BLK', reb: 'REB', str: 'STR' };
const sh = (k: RatingKey) => SHORT[k] ?? RATING_LABELS[k];
const IN_SEASON = ['preseason', 'regular', 'confTourney', 'selection', 'ncaa'];

type Tab = 'plans' | 'practice' | 'report';

export function DevelopmentScreen() {
  const g = useGameState();
  const dv = devState(g);
  const [tab, setTab] = useState<Tab>('plans');
  const inSeason = IN_SEASON.includes(g.phase);
  const pr = PRACTICE_INFO[dv.practice];
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Development skill {devSkillFor(g).toFixed(1)} · {dv.spotlight.length}/{SPOTLIGHT_MAX} spotlight players</div>
          <h1 className="h1" style={{ marginTop: 6 }}>Player Development</h1>
        </div>
        <div className="spacer" />
        {inSeason && <button className="hours-chip" style={{ cursor: 'pointer' }} onClick={() => setTab('practice')}>{pr.icon} This week: <b>{pr.label}</b></button>}
        <Tabs id="dev" value={tab} onChange={setTab} tabs={[{ id: 'plans', label: 'Plans & Goals' }, { id: 'practice', label: 'Practice' }, { id: 'report', label: 'Summer Report' }]} />
      </div>
      {tab === 'plans' && <PlansBoard g={g} />}
      {tab === 'practice' && <PracticePanel g={g} />}
      {tab === 'report' && (dv.summer?.done ? <SummerReport rows={dv.summer.rows} g={g} /> : <Empty>No summer report yet. Plans pay off after the season, in the offseason's Summer Development step.</Empty>)}
    </div>
  );
}

// ---------------- Plans ----------------
export function PlansBoard({ g, summer }: { g: GameState; summer?: boolean }) {
  const dv = devState(g);
  const { mutate, toast } = useGame.getState();
  const players = teamPlayers(g, g.user.teamId).sort((a, b) => b.ovr - a.ovr);
  const applyStaff = () => {
    mutate((gg) => { const d = devState(gg); for (const p of teamPlayers(gg, gg.user.teamId)) d.plans[p.id] = recommendFocus(gg, p); });
    toast('Staff recommendations applied.', 'good');
    sfx.click();
  };
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="card dev-intro">
        <div className="row wrap" style={{ gap: 18 }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div className="b">{summer ? 'Set each player’s summer plan, then run workouts.' : 'Every player has a development plan and a personal goal.'}</div>
            <div className="small muted" style={{ marginTop: 4 }}>
              Plans steer summer growth (and in-season growth during skill or compete weeks) toward three ratings. Weak ratings grow fastest. <b style={{ color: 'var(--text)' }}>⭐ Spotlight</b> up to {SPOTLIGHT_MAX} players for 30% more growth.
              {!summer && <> Goals are judged at season's end: players who hit theirs are happier and less likely to transfer.</>}
            </div>
          </div>
          <button className="btn" onClick={applyStaff}>🧑‍🏫 Use staff recommendations</button>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))' }}>
        {players.map((p, i) => <PlanCard key={p.id} g={g} p={p} i={i} summer={summer} spotlightFull={dv.spotlight.length >= SPOTLIGHT_MAX} />)}
      </div>
    </div>
  );
}

function PlanCard({ g, p, i, summer, spotlightFull }: { g: GameState; p: Player; i: number; summer?: boolean; spotlightFull: boolean }) {
  const { mutate, open, toast } = useGame.getState();
  const dv = devState(g);
  const focus = planOf(g, p.id);
  const spot = dv.spotlight.includes(p.id);
  const fresh = isNewcomer(p);
  const proj = fresh ? null : projectFocus(g, p, focus);
  const rec = fresh ? null : recommendFocus(g, p);
  const goal = dv.goalsSeason === g.season ? dv.goals[p.id] : undefined;
  const gs = goal ? goalStatus(g, p, goal) : null;
  const gains = dv.seasonGains[p.id];
  const setFocus = (f: DevFocus) => { mutate((gg) => { devState(gg).plans[p.id] = f; }); sfx.click(); };
  const toggleSpot = () => {
    if (!spot && spotlightFull) { toast(`Only ${SPOTLIGHT_MAX} spotlight players. Remove one first.`, 'bad'); return; }
    mutate((gg) => { const d = devState(gg); d.spotlight = spot ? d.spotlight.filter((x) => x !== p.id) : [...d.spotlight, p.id]; });
    sfx.click();
  };
  return (
    <motion.div className={`card dev-card ${spot ? 'spot' : ''}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ cursor: 'pointer' }} onClick={() => open({ kind: 'player', id: p.id })}><PlayerFace p={p} size={52} team={g.teams[g.user.teamId]} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}><span className="b ellipsis" style={{ cursor: 'pointer' }} onClick={() => open({ kind: 'player', id: p.id })}>{p.first} {p.last}</span>{p.injury && <span className="pill bad" style={{ fontSize: 9 }}>🩹 {p.injury.games}g</span>}{fresh && <span className="pill blue" style={{ fontSize: 9 }}>NEW</span>}</div>
          <div className="tiny muted">{p.pos} · {p.cls} · {p.archetype} · age {p.age}</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <Ovr v={p.ovr} size="sm" />
          <span className="tiny muted">→ <b style={{ color: 'var(--text)' }}>{p.pot}</b></span>
          <button className={`dev-star ${spot ? 'on' : ''}`} title={spot ? 'Remove from spotlight' : 'Spotlight: 30% more growth'} onClick={toggleSpot}>{spot ? '⭐' : '☆'}</button>
        </div>
      </div>
      <div className="dev-focus-row">
        {FOCUS_ORDER.map((f) => (
          <button key={f} className={`dev-focus ${focus === f ? 'on' : ''}`} title={`${FOCUS_INFO[f].label}: ${FOCUS_INFO[f].desc}`} onClick={() => setFocus(f)}>
            <span>{FOCUS_INFO[f].icon}</span>{focus === f && <span className="lbl">{FOCUS_INFO[f].label}</span>}
            {rec === f && <i className="rec" title="Staff recommendation">★</i>}
          </button>
        ))}
      </div>
      <div className="tiny" style={{ marginTop: 6, minHeight: 16 }}>
        {fresh
          ? <span className="muted">{summer ? 'Just arrived: his first summer is orientation. The plan starts with in-season practice.' : 'Freshman: the plan drives in-season practice gains.'}</span>
          : <span className="muted">{summer ? 'This summer' : 'Next summer'} ≈ {proj!.changes.map(([k, d]) => <b key={k} className={d > 0 ? 'good' : ''} style={{ marginRight: 6 }}>{sh(k)} {d >= 0 ? '+' : ''}{d}</b>)} · OVR <b className={proj!.ovr > 0 ? 'good' : ''}>{proj!.ovr >= 0 ? '+' : ''}{proj!.ovr}</b>{rec && rec !== focus && <span className="dim"> · staff pick: {FOCUS_INFO[rec].icon} {FOCUS_INFO[rec].label}</span>}</span>}
      </div>
      {goal && gs && (
        <div className={`dev-goal ${gs.status}`}>
          <div className="row" style={{ gap: 8 }}>
            <span>{GOAL_ICON[goal.kind]}</span>
            <span className="small b" style={{ flex: 1 }}>{summer && <span className="muted" style={{ fontWeight: 600 }}>Last season: </span>}{goal.label}</span>
            <span className={`pill ${gs.status === 'met' || gs.status === 'onTrack' ? 'good' : gs.status === 'pending' ? '' : 'bad'}`} style={{ fontSize: 10 }}>{gs.status === 'onTrack' ? 'On track' : gs.status === 'behind' ? 'Behind' : gs.status === 'pending' ? 'Not started' : gs.status === 'met' ? 'Met' : 'Missed'}</span>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 5 }}>
            <div className="bar thin" style={{ flex: 1 }}><motion.i initial={{ width: 0 }} animate={{ width: `${gs.pct * 100}%` }} transition={{ duration: 0.8 }} style={{ background: gs.status === 'behind' || gs.status === 'missed' ? 'var(--gold)' : 'var(--good)' }} /></div>
            <span className="tiny muted">{gs.text}</span>
          </div>
        </div>
      )}
      {gains && Object.keys(gains).length > 0 && (
        <div className="tiny" style={{ marginTop: 6 }}>📈 This season: {Object.entries(gains).map(([k, v]) => <b key={k} className="good" style={{ marginRight: 6 }}>{sh(k as RatingKey)} +{v}</b>)}</div>
      )}
    </motion.div>
  );
}

// ---------------- Practice ----------------
function pills(pf: (typeof PRACTICE_INFO)[PracticeFocus]): { t: string; good: boolean }[] {
  const out: { t: string; good: boolean }[] = [];
  if (pf.growth) out.push({ t: `Plan growth ×${pf.growth}`, good: true });
  if (pf.tactics) out.push({ t: `Game tactics ${pf.tactics > 0 ? '+' : ''}${pf.tactics}`, good: pf.tactics > 0 });
  if (pf.injury !== 1) out.push({ t: `Injury risk ${pf.injury < 1 ? '−' : '+'}${Math.round(Math.abs(1 - pf.injury) * 100)}%`, good: pf.injury < 1 });
  if (pf.stamina !== 1) out.push({ t: pf.stamina < 1 ? 'Fresher legs' : 'Heavier legs', good: pf.stamina < 1 });
  if (pf.morale) out.push({ t: `Morale ${pf.morale > 0 ? '+' : ''}${pf.morale}/wk`, good: pf.morale > 0 });
  return out;
}
const EXTRA: Partial<Record<PracticeFocus, string>> = { conditioning: 'Stamina +0.3/wk', recovery: 'Injuries heal a game faster' };

function PracticePanel({ g }: { g: GameState }) {
  const dv = devState(g);
  const { mutate } = useGame.getState();
  const inSeason = IN_SEASON.includes(g.phase);
  const total = Object.values(dv.practiceLog).reduce((a, b) => a + (b ?? 0), 0);
  const set = (f: PracticeFocus) => { mutate((gg) => { devState(gg).practice = f; }); sfx.click(); };
  const leaders = Object.entries(dv.seasonGains).map(([id, gs]) => ({ p: g.players[id], n: Object.values(gs).reduce((a, b) => a + (b ?? 0), 0) })).filter((x) => x.p && x.p.teamId === g.user.teamId).sort((a, b) => b.n - a.n).slice(0, 5);
  return (
    <div className="grid g-main">
      <div className="col" style={{ gap: 14 }}>
        <div className="card">
          <div className="b">Weekly practice plan</div>
          <div className="small muted" style={{ marginTop: 4 }}>The plan applies every week until you change it. Effects on games happen that week; growth lands when the week ends. {!inSeason && 'Practice resumes when the season starts.'}</div>
        </div>
        <div className="grid g2">
          {PRACTICE_ORDER.map((f, i) => {
            const pf = PRACTICE_INFO[f];
            const on = dv.practice === f;
            return (
              <motion.button key={f} className={`card dev-practice ${on ? 'on' : ''}`} onClick={() => set(f)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} whileHover={{ y: -2 }}>
                <div className="row" style={{ gap: 10 }}>
                  <span style={{ fontSize: 28 }}>{pf.icon}</span>
                  <div style={{ flex: 1, textAlign: 'left' }}><div className="b">{pf.label}</div>{on && <div className="tiny" style={{ color: 'var(--accent)' }}>● This week's plan</div>}</div>
                </div>
                <div className="small muted" style={{ textAlign: 'left', margin: '8px 0' }}>{pf.desc}</div>
                <div className="row wrap gap-s">
                  {pills(pf).map((x) => <span key={x.t} className={`pill ${x.good ? 'good' : 'bad'}`} style={{ fontSize: 10 }}>{x.t}</span>)}
                  {EXTRA[f] && <span className="pill good" style={{ fontSize: 10 }}>{EXTRA[f]}</span>}
                  {f === 'balanced' && <span className="pill" style={{ fontSize: 10 }}>No trade-offs</span>}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
      <div className="col" style={{ gap: 14 }}>
        <Section title="This Season">
          {total === 0 ? <div className="small muted">No practice weeks logged yet.</div> : (
            <div className="col" style={{ gap: 6 }}>
              {PRACTICE_ORDER.filter((f) => dv.practiceLog[f]).map((f) => (
                <div key={f} className="row" style={{ gap: 8 }}>
                  <span style={{ width: 22 }}>{PRACTICE_INFO[f].icon}</span>
                  <span className="small" style={{ width: 130 }}>{PRACTICE_INFO[f].label}</span>
                  <div className="bar thin" style={{ flex: 1 }}><i style={{ width: `${((dv.practiceLog[f] ?? 0) / total) * 100}%`, background: 'var(--accent)' }} /></div>
                  <span className="tiny muted" style={{ width: 40, textAlign: 'right' }}>{dv.practiceLog[f]} wk</span>
                </div>
              ))}
            </div>
          )}
        </Section>
        <Section title="Biggest In-Season Gains">
          {leaders.length === 0 ? <div className="small muted">Skill and Compete weeks grow players during the season, along their plans.</div> : leaders.map(({ p, n }) => (
            <div key={p.id} className="row" style={{ gap: 8, padding: '4px 0' }}>
              <PlayerFace p={p} size={30} team={g.teams[g.user.teamId]} />
              <span className="small b" style={{ flex: 1 }}>{p.first} {p.last}</span>
              <span className="tiny muted">{FOCUS_INFO[planOf(g, p.id)].icon}</span>
              <span className="pill good" style={{ fontSize: 10 }}>+{n} rating pts</span>
            </div>
          ))}
        </Section>
      </div>
    </div>
  );
}

// ---------------- Summer report ----------------
function CountUp({ from, to, delay = 0 }: { from: number; to: number; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = String(from);
    const c = animate(from, to, { duration: 1.2, delay, ease: [0.2, 0.8, 0.2, 1], onUpdate: (v) => { el.textContent = String(Math.round(v)); } });
    return () => c.stop();
  }, [from, to, delay]);
  return <span ref={ref}>{from}</span>;
}

function draftLabel(r: number) {
  return r <= 14 ? 'Lottery' : r <= 30 ? '1st round' : r <= 60 ? '2nd round' : 'Undrafted';
}

export function SummerReport({ rows, g, animateIn = true }: { rows: DevReportRow[]; g: GameState; animateIn?: boolean }) {
  const open = useGame((s) => s.open);
  const team = g.teams[g.user.teamId];
  const dev = rows.filter((r) => r.tag !== 'newcomer');
  const total = dev.reduce((s, r) => s + (r.after - r.before), 0);
  const best = dev[0];
  const breakouts = dev.filter((r) => r.tag === 'breakout').length;
  const newRoles = dev.filter((r) => r.archetypeTo).length;
  const d0 = animateIn ? 0.3 : 0;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid g4">
        <div className="stat-tile"><div className="l">Team OVR Gain</div><div className={`v ${total >= 0 ? 'good' : 'bad'}`}>{total >= 0 ? '+' : ''}{total}</div></div>
        <div className="stat-tile"><div className="l">Biggest Jump</div><div className="v" style={{ fontSize: 20 }}>{best && best.after > best.before ? `${best.name.split(' ').slice(-1)[0]} +${best.after - best.before}` : '—'}</div></div>
        <div className="stat-tile"><div className="l">Breakouts</div><div className="v">{breakouts}</div></div>
        <div className="stat-tile"><div className="l">New Roles</div><div className="v">{newRoles}</div></div>
      </div>
      <div className="col" style={{ gap: 8 }}>
        {rows.map((r, i) => {
          const p = g.players[r.id];
          const d = r.after - r.before;
          const delay = d0 + Math.min(i * 0.08, 1.2);
          return (
            <motion.div key={r.id} className={`card dev-report-row ${r.tag ?? ''}`} initial={animateIn ? { opacity: 0, x: -16 } : false} animate={{ opacity: 1, x: 0 }} transition={{ delay }}
              onClick={() => p && open({ kind: 'player', id: r.id })} style={{ cursor: p ? 'pointer' : 'default' }}>
              <div className="row" style={{ gap: 12 }}>
                {p ? <PlayerFace p={p} size={46} team={team} /> : <div style={{ width: 46 }} />}
                <div style={{ width: 190, minWidth: 0 }}>
                  <div className="b ellipsis">{r.name}{r.spotlight && <span title="Spotlight"> ⭐</span>}</div>
                  <div className="tiny muted">{r.pos} · now {r.cls} · {FOCUS_INFO[r.focus].icon} {FOCUS_INFO[r.focus].label}</div>
                </div>
                <div className="num" style={{ fontSize: 26, width: 92, textAlign: 'center' }}>
                  <span className="dim" style={{ fontSize: 16 }}>{r.before}→</span><CountUp from={r.before} to={r.after} delay={delay + 0.2} />
                </div>
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: delay + 1.1, type: 'spring', stiffness: 400 }} className={`pill ${d > 0 ? 'good' : d < 0 ? 'bad' : ''}`} style={{ fontSize: 12, width: 58, justifyContent: 'center' }}>
                  {r.tag === 'newcomer' ? 'NEW' : d > 0 ? `▲ +${d}` : d < 0 ? `▼ ${d}` : '—'}
                </motion.span>
                <div className="row wrap" style={{ flex: 1, gap: 6 }}>
                  {r.tag === 'newcomer'
                    ? <span className="tiny muted">Arrived this summer. Development starts with the season.</span>
                    : Object.entries(r.changes).map(([k, v]) => v && (
                      <span key={k} className="dev-chg"><span className="muted">{sh(k as RatingKey)}</span> {v[0]}→<b className={v[1] > v[0] ? 'good' : ''}>{v[1]}</b></span>
                    ))}
                </div>
                <div className="col" style={{ alignItems: 'flex-end', gap: 4, minWidth: 140 }}>
                  {r.tag === 'breakout' && <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: delay + 1.3 }} className="pill gold">🚀 Breakout</motion.span>}
                  {r.tag === 'stalled' && <span className="pill bad">⏸ Stalled</span>}
                  {r.archetypeTo && <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: delay + 1.4 }} className="pill blue">✨ Now a {r.archetypeTo}</motion.span>}
                  {r.draftBefore != null && r.draftAfter != null && draftLabel(r.draftBefore) !== draftLabel(r.draftAfter) && (
                    <span className={`pill ${r.draftAfter < r.draftBefore ? 'good' : 'bad'}`}>🏀 {draftLabel(r.draftBefore)} → {draftLabel(r.draftAfter)}</span>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/** Offseason step: plan the summer, then reveal the results */
export function SummerDevelopment() {
  const g = useGameState();
  const dv = devState(g);
  const done = summerDone(g);
  if (done && dv.summer?.season === g.season && dv.summer.rows.length) return <SummerReport rows={dv.summer.rows} g={g} />;
  if (done) return <Empty>Summer workouts are complete.</Empty>;
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="card glow row wrap" style={{ gap: 16 }}>
        <div style={{ fontSize: 40 }}>☀️</div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="h3">Summer workouts start when you're ready</div>
          <div className="small muted">Lock in each player's plan and your spotlight players, then run workouts from the top bar. Results are revealed right here.</div>
        </div>
        <button className="btn gold lg" onClick={() => { sfx.whoosh(); void useGame.getState().continueOffseason(); }}>🏋️ Run Summer Workouts</button>
      </div>
      <PlansBoard g={g} summer />
    </div>
  );
}
