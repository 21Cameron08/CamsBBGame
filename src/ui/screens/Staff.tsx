import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { StaffFace, CoachFace, TeamLogo, TeamName, Ovr, Tabs, Section, Bar, AnimatedNumber, fmtMoneyShort, Empty, Confetti } from '../components/common';
import type { GameState, StaffMember, StaffRole } from '../../engine/types';
import {
  STAFF_ROLES, ROLE_INFO, TRAIT_INFO, staffImpact, staffGrade, staffPayroll, staffAvailable, candidateInterest, interestLabel,
  hireStaff, fireStaff, extendStaff, memberEffectText, salaryAsk,
} from '../../engine/staff';
import { roundMoney } from '../../engine/player';
import { STATE_NAMES } from '../../data/places';
import { ratingColor } from '../color';
import { sfx } from '../sound';

type Tab = 'staff' | 'market' | 'tree';

export function StaffScreen() {
  const g = useGameState();
  const [tab, setTab] = useState<Tab>('staff');
  const [roleFilter, setRoleFilter] = useState<StaffRole | ''>('');
  const [justHired, setJustHired] = useState<string | null>(null);
  const st = g.staff;
  const team = g.teams[g.user.teamId];
  if (!st) return <Empty>Your coaching staff is being assembled…</Empty>;
  const payroll = staffPayroll(st);
  const avail = staffAvailable(st);
  const grade = staffGrade(st);
  const impact = staffImpact(g);
  const vacancies = STAFF_ROLES.filter((r) => !st.members.some((m) => m.role === r));
  const findFor = (r: StaffRole) => { setRoleFilter(r); setTab('market'); };
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">{team.school} · Basketball operations</div>
          <h1 className="h1" style={{ marginTop: 6 }}>Coaching Staff</h1>
        </div>
        <div className="spacer" />
        <Tabs id="staff" value={tab} onChange={setTab} tabs={[
          { id: 'staff', label: <>Your Staff{vacancies.length ? <span className="pill bad" style={{ marginLeft: 6, padding: '1px 7px' }}>{vacancies.length} open</span> : null}</> },
          { id: 'market', label: `Hiring Market (${st.market.length})` },
          { id: 'tree', label: `Coaching Tree (${st.tree.length})` },
        ]} />
      </div>

      <div className="grid mb" style={{ gridTemplateColumns: '170px minmax(0, 1fr) minmax(0, 1.35fr)' }}>
        <div className="card glow" style={{ textAlign: 'center' }}>
          <div className="eyebrow">Staff Grade</div>
          <motion.div key={grade} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 15 }}
            className="num" style={{ fontSize: 64, lineHeight: 1.05, color: grade.startsWith('A') ? 'var(--good)' : grade.startsWith('B') ? 'var(--gold)' : grade.startsWith('C') ? 'var(--warn)' : 'var(--bad)' }}>{grade}</motion.div>
          <div className="tiny muted">{st.members.length}/6 roles filled</div>
        </div>
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="eyebrow">Staff Pool</div>
            <span className="tiny muted">resets each season</span>
          </div>
          <div className="row" style={{ alignItems: 'baseline', gap: 8, margin: '6px 0 8px' }}>
            <span className="num" style={{ fontSize: 30, color: avail < 0 ? 'var(--bad)' : undefined }}><AnimatedNumber value={avail} format={fmtMoneyShort} /></span>
            <span className="muted small">available of {fmtMoneyShort(st.budget)}</span>
          </div>
          <Bar v={payroll} max={st.budget} className="thick" color={avail < 0 ? 'var(--bad)' : 'var(--accent)'} />
          <div className="tiny muted" style={{ marginTop: 6 }}>Payroll {fmtMoneyShort(payroll - st.buyouts)}{st.buyouts ? ` · Buyouts ${fmtMoneyShort(st.buyouts)}` : ''}</div>
        </div>
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 8 }}>What your staff gives you</div>
          <div className="row wrap gap-s">
            {impact.map((c, i) => (
              <motion.span key={c.label} className={`pill ${c.good ? 'good' : 'bad'}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>{c.icon} {c.label}</motion.span>
            ))}
            {!impact.length && <span className="small muted">No staff, no edge. Hire some help.</span>}
          </div>
        </div>
      </div>

      {tab === 'staff' && (
        <div className="grid g3">
          {STAFF_ROLES.map((r, i) => {
            const m = st.members.find((x) => x.role === r);
            return m ? <MemberCard key={m.id} g={g} m={m} i={i} highlight={justHired === m.id} onReplace={() => findFor(r)} /> : <VacantCard key={r} role={r} i={i} onFind={() => findFor(r)} />;
          })}
        </div>
      )}
      {tab === 'market' && <Market g={g} roleFilter={roleFilter} setRoleFilter={setRoleFilter} onHired={(id) => { setJustHired(id); setTab('staff'); }} />}
      {tab === 'tree' && <Tree g={g} />}
      {justHired && <Confetti colors={[team.colors[0], team.colors[1], '#ffffff']} count={90} duration={2600} />}
    </div>
  );
}

function Pips({ v, color }: { v: number; color: string }) {
  return <div className="bar thin" style={{ width: 70 }}><i style={{ width: `${v}%`, background: color }} /></div>;
}

function MemberCard({ g, m, i, highlight, onReplace }: { g: GameState; m: StaffMember; i: number; highlight: boolean; onReplace: () => void }) {
  const { mutate, toast } = useGame.getState();
  const team = g.teams[g.user.teamId];
  const info = ROLE_INFO[m.role];
  const [confirmFire, setConfirmFire] = useState(false);
  return (
    <motion.div className={`card ${highlight ? 'glow' : ''}`} initial={{ opacity: 0, y: 16, rotateX: -8 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ delay: i * 0.06, type: 'spring', stiffness: 200, damping: 20 }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="row tiny upper b muted" style={{ letterSpacing: '.14em' }}>
        <span style={{ fontSize: 15 }}>{info.icon}</span>{info.title}
        <div className="spacer" />
        {m.release && <span className="pill bad">Leaving after season</span>}
        {m.years <= 1 && !m.release && <span className="pill gold">Expiring</span>}
      </div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <StaffFace m={m} size={84} team={team} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="b" style={{ fontSize: 17 }}>{m.first} {m.last}</div>
          <div className="tiny muted">Age {m.age} · {m.seasons} season{m.seasons === 1 ? '' : 's'} on staff</div>
          <div className="row wrap gap-s" style={{ marginTop: 6 }}>
            <span className="pill accent" title={TRAIT_INFO[m.trait]}>{m.trait}</span>
            {m.pipeline && <span className="pill blue" title="Bigger recruiting gains with prospects from this state">📍 {STATE_NAMES[m.pipeline] ?? m.pipeline}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <Ovr v={m.rating} />
          <div className="tiny dim" style={{ marginTop: 3 }}>RTG</div>
        </div>
      </div>
      <div className="small" style={{ color: ratingColor(m.rating) }}>{memberEffectText(m)}</div>
      <div className="row tiny muted" style={{ gap: 14 }}>
        <span className="row" style={{ gap: 6 }}>Loyalty <Pips v={m.loyalty} color="var(--good)" /></span>
        <span className="row" style={{ gap: 6 }}>Ambition <Pips v={m.ambition} color="var(--warn)" /></span>
      </div>
      <div className="divider" style={{ margin: '2px 0' }} />
      <div className="row">
        <div><div className="num" style={{ fontSize: 18 }}>{fmtMoneyShort(m.salary)}<span className="tiny muted"> /yr</span></div><div className="tiny muted">{m.years} yr{m.years === 1 ? '' : 's'} left</div></div>
        <div className="spacer" />
        {!confirmFire ? (
          <>
            <button className="btn sm" title="+2 years, 10% raise, loyalty up" onClick={() => {
              let r = { ok: false, msg: '' };
              mutate((gg) => { r = extendStaff(gg, m.id); });
              toast(r.msg, r.ok ? 'good' : 'bad');
              if (r.ok) sfx.swish();
            }}>Extend</button>
            <button className="btn sm" onClick={onReplace}>Replace</button>
            <button className="btn sm danger" onClick={() => setConfirmFire(true)}>Fire</button>
          </>
        ) : (
          <>
            <span className="tiny bad">Buyout {fmtMoneyShort(roundMoney(m.salary * 0.5))}?</span>
            <button className="btn sm ghost" onClick={() => setConfirmFire(false)}>Cancel</button>
            <button className="btn sm danger" onClick={() => {
              let r = { ok: false, msg: '' };
              mutate((gg) => { r = fireStaff(gg, m.id); });
              toast(r.msg, r.ok ? 'info' : 'bad');
            }}>Confirm</button>
          </>
        )}
      </div>
    </motion.div>
  );
}

function VacantCard({ role, i, onFind }: { role: StaffRole; i: number; onFind: () => void }) {
  const info = ROLE_INFO[role];
  return (
    <motion.div className="card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
      style={{ border: '2px dashed var(--line-2)', background: 'rgba(255,255,255,.015)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', minHeight: 290, gap: 10 }}>
      <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 2.4, repeat: Infinity }} style={{ fontSize: 46, filter: 'grayscale(.3)' }}>{info.icon}</motion.div>
      <div className="h3">{info.title}</div>
      <div className="pill bad">Vacant</div>
      <div className="small muted" style={{ maxWidth: 260 }}>{info.desc}</div>
      <button className="btn primary" onClick={onFind}>Find a {info.short} →</button>
    </motion.div>
  );
}

const OFFER_LEVELS = [{ id: 0, label: 'Ask', mul: 1 }, { id: 1, label: '+15%', mul: 1.15 }, { id: 2, label: '+25%', mul: 1.25 }];

function Market({ g, roleFilter, setRoleFilter, onHired }: { g: GameState; roleFilter: StaffRole | ''; setRoleFilter: (r: StaffRole | '') => void; onHired: (id: string) => void }) {
  const st = g.staff!;
  const list = useMemo(() => st.market.filter((m) => !roleFilter || m.role === roleFilter).sort((a, b) => b.rating - a.rating), [st.market, roleFilter, g]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <div className="card row wrap" style={{ marginBottom: 14 }}>
        <div className="seg">
          <button className={!roleFilter ? 'on' : ''} onClick={() => setRoleFilter('')}>All roles</button>
          {STAFF_ROLES.map((r) => <button key={r} className={roleFilter === r ? 'on' : ''} onClick={() => setRoleFilter(r)}>{ROLE_INFO[r].icon} {ROLE_INFO[r].short}</button>)}
        </div>
        <div className="spacer" />
        <span className="small muted">Pool available: <b style={{ color: 'var(--text)' }}>{fmtMoneyShort(staffAvailable(st))}</b></span>
      </div>
      {roleFilter && <div className="small muted" style={{ margin: '-4px 0 12px' }}>{ROLE_INFO[roleFilter].icon} <b style={{ color: 'var(--text)' }}>{ROLE_INFO[roleFilter].title}:</b> {ROLE_INFO[roleFilter].desc}</div>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))' }}>
        {list.map((c, i) => <CandidateCard key={c.id} g={g} c={c} i={i} onHired={onHired} />)}
      </div>
      {!list.length && <Empty>No candidates for this role right now. The market refreshes every offseason.</Empty>}
    </div>
  );
}

function CandidateCard({ g, c, i, onHired }: { g: GameState; c: StaffMember; i: number; onHired: (id: string) => void }) {
  const { mutate, toast } = useGame.getState();
  const team = g.teams[g.user.teamId];
  const [level, setLevel] = useState(0);
  const [years, setYears] = useState(3);
  const ask = c.ask ?? salaryAsk(c.rating, c.role);
  const offer = roundMoney(ask * OFFER_LEVELS[level].mul);
  const interest = candidateInterest(g, c, offer);
  const il = interestLabel(interest);
  const current = g.staff!.members.find((m) => m.role === c.role);
  const affordable = staffAvailable(g.staff!) + (current ? current.salary * 0.5 : 0) - offer >= 0;
  const [shake, setShake] = useState(0);
  return (
    <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={shake ? { x: [0, -8, 8, -5, 5, 0], opacity: 1, y: 0 } : { opacity: 1, y: 0 }} transition={{ delay: shake ? 0 : Math.min(i * 0.03, 0.4) }} key={shake}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <StaffFace m={c} size={64} team={team} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tiny upper b muted" style={{ letterSpacing: '.12em' }}>{ROLE_INFO[c.role].icon} {ROLE_INFO[c.role].short}</div>
          <div className="b" style={{ fontSize: 16 }}>{c.first} {c.last}</div>
          <div className="tiny muted">Age {c.age}{c.history.length ? ` · ${c.history[c.history.length - 1]}` : ''}</div>
        </div>
        <Ovr v={c.rating} />
      </div>
      <div className="row wrap gap-s" style={{ marginTop: 8 }}>
        <span className="pill accent" title={TRAIT_INFO[c.trait]}>{c.trait}</span>
        {c.pipeline && <span className="pill blue">📍 {STATE_NAMES[c.pipeline] ?? c.pipeline}</span>}
        <span className={`pill ${il.cls}`}>{il.label}</span>
      </div>
      <div className="small" style={{ marginTop: 8, color: ratingColor(c.rating) }}>{memberEffectText(c)}</div>
      <div className="divider" />
      <div className="row" style={{ gap: 8 }}>
        <div className="seg">{OFFER_LEVELS.map((o) => <button key={o.id} className={level === o.id ? 'on' : ''} onClick={() => setLevel(o.id)}>{o.label}</button>)}</div>
        <div className="seg">{[2, 3, 4].map((y) => <button key={y} className={years === y ? 'on' : ''} onClick={() => setYears(y)}>{y}y</button>)}</div>
        <div className="spacer" />
        <span className="num" style={{ fontSize: 18 }}>{fmtMoneyShort(offer)}</span>
      </div>
      <div className="bar thin" style={{ marginTop: 8 }} title="Interest at this offer"><i style={{ width: `${interest}%`, background: interest >= 50 ? 'var(--good)' : interest >= 35 ? 'var(--warn)' : 'var(--bad)' }} /></div>
      <div className="row" style={{ marginTop: 10 }}>
        <span className="tiny muted">{current ? `Replaces ${current.first} ${current.last} (${current.rating})` : 'Fills a vacancy'}</span>
        <div className="spacer" />
        <button className="btn primary sm" disabled={!affordable} title={affordable ? '' : 'Not enough in the staff pool'} onClick={() => {
          let r = { ok: false, msg: '' };
          mutate((gg) => { r = hireStaff(gg, c.id, offer, years); });
          toast(r.msg, r.ok ? 'good' : 'bad');
          if (r.ok) { sfx.fanfare(); onHired(c.id); } else { sfx.rim(); setShake((s) => s + 1); }
        }}>{affordable ? (current ? 'Hire & replace' : 'Hire') : 'Over budget'}</button>
      </div>
    </motion.div>
  );
}

function Tree({ g }: { g: GameState }) {
  const st = g.staff!;
  const coach = g.coaches[g.user.coachId];
  const team = g.teams[g.user.teamId];
  const open = useGame((s) => s.open);
  return (
    <Section title="Your Coaching Tree">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <CoachFace c={coach} size={110} team={team} />
        <div className="h2" style={{ marginTop: 6 }}>Coach {coach.first} {coach.last}</div>
        <div className="small muted">{coach.careerW}-{coach.careerL} career · {coach.trophies.length} trophies</div>
        {st.tree.length > 0 && <div style={{ width: 2, height: 28, background: 'var(--line-2)', margin: '10px 0 0' }} />}
      </div>
      {st.tree.length === 0 ? (
        <Empty>No branches yet. Hire ambitious assistants, help them grow — and one day they'll run their own programs.</Empty>
      ) : (
        <div style={{ borderTop: '2px solid var(--line-2)', paddingTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
          {st.tree.map((e, i) => {
            const c = g.coaches[e.coachId];
            const t = g.teams[e.teamId];
            const stillThere = c && c.teamId === e.teamId;
            return (
              <motion.div key={e.staffId} className="card hover" style={{ textAlign: 'center' }} initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} onClick={() => c?.teamId && open({ kind: 'team', id: c.teamId })}>
                <div className="row" style={{ justifyContent: 'center' }}>{c ? <CoachFace c={c} size={74} team={c.teamId ? g.teams[c.teamId] : t} /> : <StaffFace m={{ id: e.staffId, age: 45 }} size={74} team={t} />}</div>
                <div className="b" style={{ marginTop: 6 }}>{e.name}</div>
                <div className="tiny muted">Your former {ROLE_INFO[e.role].short} · left {e.season}</div>
                <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
                  {c?.teamId ? <><TeamLogo team={g.teams[c.teamId]} size={22} /><TeamName team={g.teams[c.teamId]} /></> : <span className="dim small">Out of coaching</span>}
                </div>
                {c && <div className="tiny muted" style={{ marginTop: 4 }}>{stillThere ? 'Head coach' : 'Now'} · {c.careerW}-{c.careerL}</div>}
              </motion.div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
