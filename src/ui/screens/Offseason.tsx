import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, animate } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { PlayerFace, CoachFace, TeamLogo, TeamName, Ovr, Stars, Section, Empty, Gauge, useSorted, fmtMoneyShort, TeamHeroBg, Confetti } from '../components/common';
import { retentionDecision, portalOffer } from '../../engine/offseason';
import { nilAvailable, playerValue } from '../../engine/nil';
import { draftScore, fmtHeight } from '../../engine/player';
import { EXPECTATIONS } from '../../engine/coach';
import { seasonLabel } from '../../engine/calendar';
import { teamPlayers, ROSTER_MAX } from '../../engine/team';
import type { GameState, Player, PortalOffer } from '../../engine/types';
import { sfx } from '../sound';

const PHASE_TITLES: Partial<Record<GameState['phase'], [string, string]>> = {
  seasonEnd: ['Season Review', 'Awards, evaluations and the coaching carousel'],
  declarations: ['Draft Declarations', 'Seniors move on. Stars test the waters.'],
  portal: ['Transfer Portal', 'Retain your guys. Raid everyone else’s.'],
  signing: ['Signing Day', 'Your incoming class arrives on campus'],
  draft: ['NBA Draft', 'Two rounds. Sixty dreams.'],
  progression: ['Summer Development', 'Who put in the work?'],
};

export function OffseasonScreen() {
  const g = useGameState();
  const title = PHASE_TITLES[g.phase];
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">{seasonLabel(g.season)} Offseason</div>
          <div className="h1">{title ? title[0] : 'Portal & Offseason'}</div>
          <div className="muted" style={{ marginTop: 6 }}>{title ? title[1] : 'The portal and offseason open after the national championship.'}</div>
        </div>
        <div className="spacer" />
        <PhaseSteps phase={g.phase} />
      </div>
      {g.phase === 'seasonEnd' && <SeasonEnd />}
      {g.phase === 'declarations' && <Declarations />}
      {g.phase === 'portal' && <Portal />}
      {g.phase === 'signing' && <Signing />}
      {g.phase === 'draft' && <Draft />}
      {g.phase === 'progression' && <Progression />}
      {!title && <InSeasonPreview />}
    </div>
  );
}

const STEPS: [GameState['phase'], string][] = [
  ['seasonEnd', 'Review'], ['declarations', 'Declare'], ['portal', 'Portal'], ['signing', 'Signing'], ['draft', 'Draft'], ['progression', 'Develop'],
];
function PhaseSteps({ phase }: { phase: GameState['phase'] }) {
  const idx = STEPS.findIndex(([p]) => p === phase);
  return (
    <div className="row" style={{ gap: 4 }}>
      {STEPS.map(([p, l], i) => (
        <div key={p} className="row" style={{ gap: 4 }}>
          <div style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', background: i === idx ? 'var(--accent)' : i < idx ? 'rgba(34,211,143,.15)' : 'rgba(255,255,255,.05)', color: i === idx ? 'var(--accent-ink)' : i < idx ? 'var(--good)' : 'var(--dim)' }}>{i < idx ? '✓ ' : ''}{l}</div>
          {i < STEPS.length - 1 && <span className="dim">›</span>}
        </div>
      ))}
    </div>
  );
}

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

// ---------------- In-season preview ----------------
function InSeasonPreview() {
  const g = useGameState();
  const open = useGame((s) => s.open);
  const team = g.teams[g.user.teamId];
  const roster = teamPlayers(g, team.id);
  const seniors = roster.filter((p) => p.elig <= 1 && !p.redshirting);
  const prospects = useMemo(() => {
    const all = Object.values(g.players).filter((p) => p.teamId).map((p) => ({ p, s: draftScore(p) })).sort((a, b) => b.s - a.s);
    const rank = new Map(all.map((x, i) => [x.p.id, i + 1]));
    return roster.map((p) => ({ p, r: rank.get(p.id) ?? 999 })).filter((x) => x.r <= 75).sort((a, b) => a.r - b.r);
  }, [g, roster]);
  const returning = roster.length - seniors.length;
  return (
    <div className="grid g3">
      <Section title="Roster Outlook">
        <div className="grid g2" style={{ gap: 10 }}>
          <div className="stat-tile"><div className="l">Returning</div><div className="v">{returning}</div></div>
          <div className="stat-tile"><div className="l">Graduating</div><div className="v">{seniors.length}</div></div>
          <div className="stat-tile"><div className="l">Commits</div><div className="v">{Object.values(g.recruits).filter((r) => r.committed === team.id).length}</div></div>
          <div className="stat-tile"><div className="l">Open Spots</div><div className="v">{Math.max(0, ROSTER_MAX - returning - Object.values(g.recruits).filter((r) => r.committed === team.id).length)}</div></div>
        </div>
        <div className="tiny muted" style={{ marginTop: 12 }}>The offseason runs: Season Review → Draft Declarations → Transfer Portal (3 windows) → Signing Day → NBA Draft → Summer Development.</div>
      </Section>
      <Section title="Out of Eligibility">
        {seniors.length === 0 ? <Empty>No departing seniors.</Empty> : seniors.map((p) => (
          <PlayerLine key={p.id} p={p} onClick={() => open({ kind: 'player', id: p.id })} right={<span className="pill">{p.cls}</span>} />
        ))}
      </Section>
      <Section title="NBA Draft Watch">
        {prospects.length === 0 ? <Empty>No projected draft picks on the roster.</Empty> : prospects.map(({ p, r }) => (
          <PlayerLine key={p.id} p={p} onClick={() => open({ kind: 'player', id: p.id })} right={<span className={`pill ${r <= 14 ? 'gold' : r <= 30 ? 'accent' : ''}`}>{r <= 14 ? 'Lottery' : r <= 30 ? '1st Rd' : r <= 60 ? '2nd Rd' : 'Fringe'} · #{r}</span>} />
        ))}
      </Section>
    </div>
  );
}

function PlayerLine({ p, right, onClick, teamId }: { p: Player; right?: ReactNode; onClick?: () => void; teamId?: string }) {
  const g = useGameState();
  const team = g.teams[teamId ?? p.teamId ?? g.user.teamId];
  return (
    <div className="row" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', cursor: onClick ? 'pointer' : undefined }} onClick={onClick}>
      <PlayerFace p={p} size={38} team={team} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="b ellipsis">{p.first} {p.last}</div>
        <div className="tiny muted">{p.pos} · {p.cls} · {fmtHeight(p.height)}</div>
      </div>
      <Ovr v={p.ovr} size="sm" />
      {right}
    </div>
  );
}

// ---------------- Season end ----------------
function SeasonEnd() {
  const g = useGameState();
  const acceptJob = useGame((s) => s.acceptJob);
  const toast = useGame((s) => s.toast);
  const os = g.offseason;
  const team = g.teams[g.user.teamId];
  const coach = g.coaches[g.user.coachId];
  const champ = g.champions.find((c) => c.season === g.season);
  const champTeam = champ ? g.teams[champ.teamId] : undefined;
  const userChamp = champ?.teamId === team.id;
  const awards = g.awards.filter((a) => a.season === g.season);
  const major = awards.filter((a) => ['National Player of the Year', 'Coach of the Year', 'Freshman of the Year', 'Defensive Player of the Year', 'Final Four Most Outstanding Player'].includes(a.name));
  const aa = [1, 2, 3].map((n) => awards.filter((a) => a.name === `All-American ${['First', 'Second', 'Third'][n - 1]} Team`));
  const confPoy = awards.find((a) => a.name.endsWith('Player of the Year') && a.name !== 'National Player of the Year' && g.teams[a.teamId]?.conf === team.conf);
  const achieved = os?.achieved ?? 0;
  const delta = os?.securityDelta ?? 0;
  const [confetti] = useState(userChamp);

  return (
    <div className="col" style={{ gap: 16 }}>
      {confetti && <Confetti colors={[team.colors[0], team.colors[1], '#f6c94c', '#ffffff']} count={260} />}
      {g.user.fired && (
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="card" style={{ borderColor: 'rgba(255,93,93,.6)', background: 'linear-gradient(135deg, rgba(255,93,93,.22), var(--panel))' }}>
          <div className="row gap-l">
            <div style={{ fontSize: 46 }}>📉</div>
            <div style={{ flex: 1 }}>
              <div className="h2 bad">You've been fired</div>
              <div className="muted">{team.school} has decided to go in a different direction. Accept one of the offers below to keep your career alive.</div>
            </div>
          </div>
        </motion.div>
      )}

      {champTeam && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card flush">
          <div className="hero" style={{ padding: '24px 28px' }}>
            <TeamHeroBg team={champTeam} intensity={1.2} />
            <div className="row gap-l">
              <motion.div initial={{ rotate: -20, scale: 0.5 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 12, delay: 0.2 }}>
                <TeamLogo team={champTeam} size={96} />
              </motion.div>
              <div style={{ flex: 1 }}>
                <div className="eyebrow gold">🏆 {seasonLabel(g.season)} National Champions</div>
                <div className="h1" style={{ fontSize: 46, marginTop: 4 }}>{champTeam.school}</div>
                <div className="muted">Defeated {g.teams[champ!.runnerUp]?.school} {champ!.score} · {champTeam.record.w}-{champTeam.record.l}</div>
              </div>
              <div style={{ fontSize: 64, filter: 'drop-shadow(0 0 20px #f6c94c)' }}>🏆</div>
            </div>
          </div>
        </motion.div>
      )}

      <div className="grid g-main">
        <Section title="AD Evaluation" glow>
          <div className="row gap-l" style={{ alignItems: 'flex-start' }}>
            <CoachFace c={coach} size={96} team={team} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, lineHeight: 1.6 }}>{os?.summary}</div>
              <div className="grid g2 mt" style={{ gap: 10 }}>
                <div className="stat-tile"><div className="l">Goal</div><div className="b" style={{ marginTop: 6 }}>{EXPECTATIONS[g.user.expectationLevel]}</div></div>
                <div className="stat-tile"><div className="l">Achieved</div><div className="b" style={{ marginTop: 6 }}>{EXPECTATIONS[Math.min(6, Math.floor(achieved))]}{achieved >= 6.5 ? ' (and then some)' : ''}</div></div>
              </div>
              <div className="row mt">
                <span className={`pill ${achieved >= g.user.expectationLevel ? 'good' : 'bad'}`} style={{ fontSize: 13 }}>{achieved >= g.user.expectationLevel ? '✓ Expectations met' : '✗ Fell short'}</span>
                <motion.span className={`num ${delta >= 0 ? 'good' : 'bad'}`} style={{ fontSize: 22 }} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.6, type: 'spring' }}>
                  {delta >= 0 ? '+' : ''}{delta} job security
                </motion.span>
              </div>
            </div>
            <Gauge value={coach.jobSecurity} label="Job Security" size={110} />
          </div>
        </Section>
        <Section title="Coaching Carousel">
          {(os?.carousel.length ?? 0) === 0 ? <Empty>A quiet spring on the coaching market.</Empty> : (
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              {os!.carousel.map((c, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 20) * 0.04 }} className="small" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
                  {/fires|retires/.test(c) ? '🔥 ' : '🤝 '}{c}
                </motion.div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {g.user.offers.length > 0 && (
        <Section title={g.user.fired ? 'Job Offers — Choose Your Next Stop' : 'Job Offers'} glow={g.user.fired}>
          <div className="grid g3">
            {g.user.offers.map((o, i) => {
              const t = g.teams[o.teamId];
              if (!t) return null;
              const conf = g.conferences.find((c) => c.id === t.conf);
              return (
                <motion.div key={o.teamId} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="card flush">
                  <div className="hero" style={{ padding: 18 }}>
                    <TeamHeroBg team={t} />
                    <div className="row"><TeamLogo team={t} size={54} /><div><div className="h3">{t.school}</div><div className="tiny muted">{t.mascot} · {conf?.short}</div></div></div>
                  </div>
                  <div style={{ padding: 16 }}>
                    <div className="kv small">
                      <span>Prestige</span><span><Stars n={Math.max(1, Math.round(t.prestige / 20))} /></span>
                      <span>Salary</span><span className="b">{fmtMoneyShort(o.salary)}/yr</span>
                      <span>Length</span><span>{o.years} years</span>
                      <span>Last season</span><span>{t.history.length ? `${t.history[t.history.length - 1].w}-${t.history[t.history.length - 1].l}` : '—'}</span>
                    </div>
                    <div className="small muted" style={{ marginTop: 10, minHeight: 40 }}>"{o.pitch}"</div>
                    <button className="btn primary block mt" onClick={() => {
                      if (!g.user.fired && !confirm(`Leave ${team.school} for ${t.school}?`)) return;
                      sfx.fanfare();
                      acceptJob(t.id);
                      toast(`Welcome to ${t.school}, Coach!`, 'good');
                    }}>Accept {t.school} Job</button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </Section>
      )}

      <Section title={`${seasonLabel(g.season)} National Awards`}>
        <div className="grid g4" style={{ gap: 12 }}>
          {major.map((a, i) => <AwardCard key={a.name} a={a} i={i} big />)}
          {confPoy && <AwardCard a={confPoy} i={major.length} big />}
        </div>
        {aa.map((list, n) => list.length > 0 && (
          <div key={n} className="mt">
            <div className="eyebrow" style={{ marginBottom: 8 }}>All-American {['First', 'Second', 'Third'][n]} Team</div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
              {list.map((a, i) => <AwardCard key={a.playerId} a={a} i={major.length + n * 5 + i} />)}
            </div>
          </div>
        ))}
      </Section>
    </div>
  );
}

function AwardCard({ a, i, big }: { a: GameState['awards'][number]; i: number; big?: boolean }) {
  const g = useGameState();
  const open = useGame((s) => s.open);
  const t = g.teams[a.teamId];
  const p = a.playerId ? g.players[a.playerId] : undefined;
  const c = a.coachId ? g.coaches[a.coachId] : undefined;
  const mine = a.teamId === g.user.teamId;
  return (
    <motion.div initial={{ opacity: 0, y: 24, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.15 + i * 0.07, type: 'spring', stiffness: 220, damping: 20 }}
      className={`card ${mine ? 'glow' : ''}`} style={{ padding: big ? 16 : 12, textAlign: 'center', cursor: p ? 'pointer' : undefined, background: big ? `radial-gradient(circle at 50% 0%, rgba(246,201,76,.18), var(--panel) 70%)` : undefined }}
      onClick={() => p && open({ kind: 'player', id: p.id })}>
      {big && <div className="tiny b gold upper" style={{ marginBottom: 8, letterSpacing: '.1em' }}>{a.name}</div>}
      <div style={{ display: 'grid', placeItems: 'center' }}>
        {p ? <PlayerFace p={p} size={big ? 84 : 56} team={t} /> : c ? <CoachFace c={c} size={big ? 84 : 56} team={t} /> : <TeamLogo team={t} size={56} />}
      </div>
      <div className="b ellipsis" style={{ marginTop: 6 }}>{p ? `${p.first} ${p.last}` : c ? `${c.first} ${c.last}` : '—'}</div>
      <div className="tiny muted row" style={{ justifyContent: 'center', gap: 5 }}><TeamLogo team={t} size={14} />{t?.school}</div>
      {p && p.stats.gp > 0 && <div className="tiny dim" style={{ marginTop: 3 }}>{(p.stats.pts / p.stats.gp).toFixed(1)} ppg · {((p.stats.orb + p.stats.drb) / p.stats.gp).toFixed(1)} rpg · {(p.stats.ast / p.stats.gp).toFixed(1)} apg</div>}
    </motion.div>
  );
}

// ---------------- Declarations ----------------
function Declarations() {
  const g = useGameState();
  const open = useGame((s) => s.open);
  const os = g.offseason!;
  const uid = g.user.teamId;
  const grads = os.graduating.map((id) => g.players[id]).filter((p) => p && p.teamId === uid);
  const early = os.declared.map((id) => g.players[id]).filter((p) => p && p.teamId === uid);
  const national = os.declared.map((id) => g.players[id]).filter(Boolean).sort((a, b) => (a.draftStock || 999) - (b.draftStock || 999)).slice(0, 20);
  return (
    <div className="grid g3">
      <Section title={`Graduating Seniors (${grads.length})`}>
        {grads.length === 0 ? <Empty>No seniors leaving.</Empty> : grads.map((p, i) => (
          <motion.div key={p.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}>
            <PlayerLine p={p} onClick={() => open({ kind: 'player', id: p.id })} right={<span className="pill">🎓 {p.career.length} yrs</span>} />
          </motion.div>
        ))}
      </Section>
      <Section title={`Early Entrants (${early.length})`}>
        {early.length === 0 ? <Empty>Everyone's coming back. Big win.</Empty> : early.map((p, i) => (
          <motion.div key={p.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}>
            <PlayerLine p={p} onClick={() => open({ kind: 'player', id: p.id })} right={<span className="pill gold">Proj #{p.draftStock || '—'}</span>} />
          </motion.div>
        ))}
        <div className="tiny muted" style={{ marginTop: 10 }}>Every player you send to the league raises your program's prestige and your reputation on the recruiting trail.</div>
      </Section>
      <Section title="Top National Early Entrants">
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {national.map((p) => (
            <div key={p.id} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <span className="num dim" style={{ width: 26 }}>{p.draftStock || '—'}</span>
              <PlayerFace p={p} size={30} team={p.teamId ? g.teams[p.teamId] : undefined} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="small b ellipsis">{p.first} {p.last}</div>
                <div className="tiny muted">{p.pos} · {p.cls}</div>
              </div>
              {p.teamId && <TeamLogo team={g.teams[p.teamId]} size={22} />}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ---------------- Portal ----------------
type RetState = { ask: number; resolved: boolean; staying?: boolean; prob?: number };

function Portal() {
  const g = useGameState();
  const mutate = useGame((s) => s.mutate);
  const toast = useGame((s) => s.toast);
  const open = useGame((s) => s.open);
  const ps = g.portal;
  const uid = g.user.teamId;
  const team = g.teams[uid];
  const [pos, setPos] = useState('');
  const [minOvr, setMinOvr] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [nil, setNil] = useState(0);
  const [promise, setPromise] = useState<PortalOffer['promise']>(null);

  const retention = Object.entries(g.user.retention) as [string, RetState][];
  const pool = useMemo(() => (ps?.pool ?? []).map((id) => g.players[id]).filter((p) => p && (!pos || p.pos === pos) && p.ovr >= minOvr), [ps?.pool, g.players, pos, minOvr]); // eslint-disable-line react-hooks/exhaustive-deps
  const myOffers = useMemo(() => Object.entries(ps?.offers ?? {}).flatMap(([pid, list]) => list.filter((o) => o.teamId === uid).map((o) => ({ pid, o }))).filter((x) => ps?.pool.includes(x.pid)), [ps, uid, g.portal?.round]); // eslint-disable-line react-hooks/exhaustive-deps
  const pendingNil = myOffers.reduce((s, x) => s + (x.pid === sel ? 0 : x.o.nil), 0);
  const avail = Math.max(0, nilAvailable(g, uid) - pendingNil);
  const commits = Object.values(g.recruits).filter((r) => r.committed === uid).length;
  const { sorted, th } = useSorted(pool, { key: 'ovr', dir: -1 }, {
    ovr: (p) => p.ovr, pot: (p) => p.pot, name: (p) => p.last, pos: (p) => p.pos, ask: (p) => ps?.asks[p.id] ?? 0, offers: (p) => ps?.offers[p.id]?.length ?? 0, cls: (p) => p.cls,
  });
  const selP = sel ? g.players[sel] : undefined;

  useEffect(() => {
    if (!sel || !ps) return;
    const existing = ps.offers[sel]?.find((o) => o.teamId === uid);
    setNil(existing?.nil ?? Math.min(ps.asks[sel] ?? 0, Math.max(0, nilAvailable(g, uid) - pendingNil)));
    setPromise(existing?.promise ?? null);
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ps) return <Empty>The portal is not open.</Empty>;

  const submit = () => {
    if (!selP) return;
    let res = { ok: false, msg: '' };
    mutate((gg) => { res = portalOffer(gg, selP.id, Math.round(nil), promise); });
    toast(res.ok ? `Offer sent to ${selP.first} ${selP.last}.` : res.msg, res.ok ? 'good' : 'bad');
    if (res.ok) sfx.whoosh();
  };

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid g4">
        <div className="stat-tile"><div className="l">Portal Window</div><div className="v">{ps.round === 0 ? 'Opening' : `${Math.min(ps.round + 1, ps.maxRounds)} / ${ps.maxRounds}`}</div><div className="bar thin mt"><i style={{ width: `${(ps.round / ps.maxRounds) * 100}%` }} /></div></div>
        <div className="stat-tile"><div className="l">Roster</div><div className="v">{team.roster.length}<span className="muted" style={{ fontSize: 16 }}> / {ROSTER_MAX}</span></div><div className="tiny muted">+{commits} signees incoming</div></div>
        <div className="stat-tile"><div className="l">NIL Available</div><div className="v">{fmtMoneyShort(nilAvailable(g, uid))}</div><div className="tiny muted">{fmtMoneyShort(pendingNil)} in pending offers</div></div>
        <div className="stat-tile"><div className="l">In the Portal</div><div className="v">{ps.pool.length}</div><div className="tiny muted">{ps.log.length} committed so far</div></div>
      </div>

      {retention.length > 0 && (
        <Section title="Retention Meetings" right={<span className="tiny muted">{ps.round === 0 ? 'Unresolved players decide when the first window opens' : 'Decisions are final'}</span>}>
          <div className="grid g3">
            {retention.map(([id, r], i) => {
              const p = g.players[id];
              if (!p) return null;
              const gone = r.resolved && r.staying === false;
              return (
                <motion.div key={id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }} className="card" style={{ padding: 14, borderColor: r.resolved ? (r.staying ? 'rgba(34,211,143,.5)' : 'rgba(255,93,93,.4)') : 'color-mix(in srgb, var(--accent) 45%, transparent)' }}>
                  <div className="row">
                    <PlayerFace p={p} size={56} team={team} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="b ellipsis link" onClick={() => open({ kind: 'player', id })}>{p.first} {p.last}</div>
                      <div className="tiny muted">{p.pos} · {p.cls} · Morale {Math.round(p.morale)}</div>
                      <div className="tiny">Wants <b>{fmtMoneyShort(r.ask)}</b>/yr <span className="muted">(now {fmtMoneyShort(p.nil?.amount ?? 0)})</span></div>
                    </div>
                    <Ovr v={p.ovr} />
                  </div>
                  {!r.resolved && ps.round === 0 ? (
                    <div className="row wrap gap-s mt">
                      <button className="btn sm primary" onClick={() => { let m = ''; mutate((gg) => { m = retentionDecision(gg, id, 'pay'); }); toast(m, m.includes('Not enough') ? 'bad' : 'good'); }}>Pay {fmtMoneyShort(r.ask)}</button>
                      <button className="btn sm" onClick={() => { let m = ''; mutate((gg) => { m = retentionDecision(gg, id, 'promise'); }); toast(m, m.includes('staying') ? 'good' : 'bad'); }}>Promise starter role</button>
                      <button className="btn sm ghost" onClick={() => { let m = ''; mutate((gg) => { m = retentionDecision(gg, id, 'release'); }); toast(m); }}>Let him go</button>
                    </div>
                  ) : (
                    <div className={`pill mt ${r.staying ? 'good' : gone ? 'bad' : ''}`}>{r.staying ? '✓ Staying' : gone ? 'Entering portal' : 'Undecided'}</div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </Section>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 340px', alignItems: 'start' }}>
        <Section title="Portal Market" right={
          <div className="row">
            <select className="select" style={{ width: 110 }} value={pos} onChange={(e) => setPos(e.target.value)}>
              <option value="">All pos</option>{['PG', 'SG', 'SF', 'PF', 'C'].map((x) => <option key={x}>{x}</option>)}
            </select>
            <select className="select" style={{ width: 120 }} value={minOvr} onChange={(e) => setMinOvr(+e.target.value)}>
              {[0, 55, 60, 65, 70, 75, 80].map((v) => <option key={v} value={v}>{v ? `${v}+ OVR` : 'Any OVR'}</option>)}
            </select>
          </div>
        }>
          {ps.pool.length === 0 ? <Empty>The portal is empty.</Empty> : (
            <div className="table-wrap" style={{ maxHeight: 520 }}>
              <table className="table">
                <thead><tr><th></th>{th('name', 'Player')}{th('pos', 'Pos')}{th('cls', 'Yr')}{th('ovr', 'OVR', 'c')}{th('pot', 'POT', 'c')}<th>From</th>{th('ask', 'Ask', 'r')}{th('offers', 'Offers', 'c')}</tr></thead>
                <tbody>
                  {sorted.slice(0, 150).map((p) => {
                    const from = g.teams[ps.from[p.id]];
                    const mine = ps.offers[p.id]?.some((o) => o.teamId === uid);
                    return (
                      <tr key={p.id} className={`click ${sel === p.id ? 'me' : ''}`} onClick={() => setSel(p.id)}>
                        <td style={{ width: 40 }}><PlayerFace p={p} size={30} team={from} /></td>
                        <td><span className="b">{p.first} {p.last}</span>{mine && <span className="pill accent" style={{ marginLeft: 6, fontSize: 9 }}>OFFERED</span>}</td>
                        <td>{p.pos}</td>
                        <td>{p.cls}</td>
                        <td className="c"><Ovr v={p.ovr} size="sm" /></td>
                        <td className="c muted num">{p.pot}</td>
                        <td>{from ? <span className="row" style={{ gap: 6 }}><TeamLogo team={from} size={18} /><span className="small">{from.abbr}</span></span> : '—'}</td>
                        <td className="r">{fmtMoneyShort(ps.asks[p.id] ?? 0)}</td>
                        <td className="c">{ps.offers[p.id]?.length ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <div className="col" style={{ gap: 16, position: 'sticky', top: 0 }}>
          <>
            {selP ? (
              <motion.div key={selP.id} className="card glow" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                <div className="row">
                  <PlayerFace p={selP} size={64} team={g.teams[ps.from[selP.id]]} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="b link ellipsis" onClick={() => open({ kind: 'player', id: selP.id })}>{selP.first} {selP.last}</div>
                    <div className="tiny muted">{selP.pos} · {selP.cls} · {fmtHeight(selP.height)} · {selP.archetype}</div>
                    <div className="tiny muted">From <TeamName team={g.teams[ps.from[selP.id]]} showRank={false} /></div>
                  </div>
                  <Ovr v={selP.ovr} size="lg" />
                </div>
                <div className="kv small mt">
                  <span>Asking</span><span className="b">{fmtMoneyShort(ps.asks[selP.id] ?? 0)}/yr</span>
                  <span>Market value</span><span>{fmtMoneyShort(playerValue(g, selP))}</span>
                  <span>Competing offers</span><span>{(ps.offers[selP.id] ?? []).filter((o) => o.teamId !== uid).length}</span>
                  {selP.stats.gp > 0 && <><span>Last season</span><span>{(selP.stats.pts / selP.stats.gp).toFixed(1)} ppg · {((selP.stats.orb + selP.stats.drb) / selP.stats.gp).toFixed(1)} rpg</span></>}
                </div>
                <div className="divider" />
                <label className="field">NIL offer: <b style={{ color: 'var(--text)', fontSize: 16 }}>{fmtMoneyShort(nil)}/yr</b>
                  <input type="range" min={0} max={Math.max(avail, 1000)} step={Math.max(1000, Math.round(avail / 200 / 1000) * 1000)} value={Math.min(nil, avail)} onChange={(e) => setNil(+e.target.value)} />
                </label>
                <div className="row tiny muted" style={{ justifyContent: 'space-between' }}><span>$0</span><span>Max {fmtMoneyShort(avail)}</span></div>
                <label className="field mt">Role promise
                  <select className="select" value={promise ?? ''} onChange={(e) => setPromise((e.target.value || null) as PortalOffer['promise'])}>
                    <option value="">No promise</option>
                    <option value="rotation">Rotation minutes</option>
                    <option value="starter">Starting role</option>
                    <option value="star">Featured star</option>
                  </select>
                </label>
                <button className="btn primary block mt" disabled={team.roster.length >= ROSTER_MAX || nil > avail} onClick={submit}>
                  {ps.offers[selP.id]?.some((o) => o.teamId === uid) ? 'Update Offer' : 'Make Offer'}
                </button>
                {team.roster.length >= ROSTER_MAX && <div className="tiny bad" style={{ marginTop: 6 }}>Your roster is full.</div>}
                <div className="tiny muted" style={{ marginTop: 8 }}>Broken promises tank morale. Players decide over the remaining portal windows.</div>
              </motion.div>
            ) : (
              <motion.div key="none" className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><Empty>Select a player to make an offer.</Empty></motion.div>
            )}
          </>
          <Section title={`Your Offers (${myOffers.length})`}>
            {myOffers.length === 0 ? <div className="small muted">No active offers.</div> : myOffers.map(({ pid, o }) => {
              const p = g.players[pid];
              return p ? (
                <div key={pid} className="row small" style={{ padding: '5px 0', cursor: 'pointer' }} onClick={() => setSel(pid)}>
                  <PlayerFace p={p} size={26} team={g.teams[ps.from[pid]]} />
                  <span className="ellipsis" style={{ flex: 1 }}>{p.first} {p.last}</span>
                  <span className="b">{fmtMoneyShort(o.nil)}</span>
                  {o.promise && <span className="pill" style={{ fontSize: 9 }}>{o.promise}</span>}
                </div>
              ) : null;
            })}
          </Section>
          <Section title="Portal Wire">
            {ps.log.length === 0 ? <div className="small muted">No commitments yet.</div> : (
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {ps.log.slice(0, 40).map((l, i) => (
                  <motion.div key={l + i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="tiny" style={{ padding: '4px 0', borderBottom: '1px solid var(--line)' }}>🔁 {l}</motion.div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

// ---------------- Signing ----------------
function Signing() {
  const g = useGameState();
  const open = useGame((s) => s.open);
  const team = g.teams[g.user.teamId];
  const signed = (g.offseason?.signed ?? []).map((id) => g.players[id]).filter(Boolean);
  const rankOf = (p: Player) => {
    const h = p.history.find((x) => x.includes('overall'));
    const m = h?.match(/No\. (\d+) overall/);
    return m ? +m[1] : null;
  };
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid g4">
        <div className="stat-tile"><div className="l">Signees</div><div className="v">{signed.length}</div></div>
        <div className="stat-tile"><div className="l">Avg Stars</div><div className="v">{signed.length ? (signed.reduce((s, p) => s + p.stars, 0) / signed.length).toFixed(1) : '—'}</div></div>
        <div className="stat-tile"><div className="l">Roster</div><div className="v">{team.roster.length} / {ROSTER_MAX}</div></div>
        <div className="stat-tile"><div className="l">Best Prospect</div><div className="v" style={{ fontSize: 20 }}>{signed.length ? `${[...signed].sort((a, b) => b.pot - a.pot)[0].last}` : '—'}</div></div>
      </div>
      <Section title={`${team.school} Class of ${g.season + 1}`}>
        {signed.length === 0 ? <Empty>No high school signees this cycle. The portal is your friend.</Empty> : (
          <div className="grid g4">
            {signed.map((p, i) => {
              const r = rankOf(p);
              return (
                <motion.div key={p.id} initial={{ opacity: 0, rotateY: 90 }} animate={{ opacity: 1, rotateY: 0 }} transition={{ delay: i * 0.15, duration: 0.5 }}
                  className="card hover" style={{ textAlign: 'center', background: `linear-gradient(180deg, ${team.colors[0]}44, var(--panel))` }} onClick={() => open({ kind: 'player', id: p.id })}>
                  <div style={{ display: 'grid', placeItems: 'center' }}><PlayerFace p={p} size={96} team={team} /></div>
                  <div className="b" style={{ marginTop: 8 }}>{p.first} {p.last}</div>
                  <div className="tiny muted">{p.pos} · {fmtHeight(p.height)} · {p.hometown}{p.country === 'USA' ? `, ${p.state}` : ''}</div>
                  <div style={{ marginTop: 6 }}><Stars n={p.stars} /></div>
                  <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
                    <Ovr v={p.ovr} size="sm" /><span className="tiny muted">POT {p.pot}</span>
                    {r && <span className="pill gold">#{r}</span>}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

// ---------------- Draft ----------------
function Draft() {
  const g = useGameState();
  const picks = g.draft.filter((d) => d.season === g.season + 1).sort((a, b) => a.pick - b.pick);
  const uid = g.user.teamId;
  const mine = picks.filter((d) => d.teamId === uid);
  const [round, setRound] = useState<1 | 2>(1);
  const shown = picks.filter((d) => d.round === round);
  const [confetti] = useState(mine.length > 0);
  const team = g.teams[uid];
  return (
    <div className="col" style={{ gap: 16 }}>
      {confetti && <Confetti colors={[team.colors[0], team.colors[1], '#ffffff']} count={120} />}
      {mine.length > 0 && (
        <Section title="Your Pros" glow>
          <div className="row wrap gap-l">
            {mine.map((d) => (
              <motion.div key={d.playerId} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="row">
                <div className="num gold" style={{ fontSize: 34 }}>#{d.pick}</div>
                <div><div className="b">{d.name}</div><div className="tiny muted">{d.pos} · {d.nbaTeam}</div></div>
              </motion.div>
            ))}
          </div>
          <div className="tiny muted mt">Draft picks boost your program prestige and coaching reputation — recruits notice.</div>
        </Section>
      )}
      <Section title={`${g.season + 1} NBA Draft`} right={
        <div className="seg">
          <button className={round === 1 ? 'on' : ''} onClick={() => setRound(1)}>Round 1</button>
          <button className={round === 2 ? 'on' : ''} onClick={() => setRound(2)}>Round 2</button>
        </div>
      }>
        {picks.length === 0 ? <Empty>No picks recorded.</Empty> : (
          <div className="grid g3" style={{ gap: 10 }}>
            {shown.map((d, i) => {
              const college = g.teams[d.teamId];
              const isMine = d.teamId === uid;
              return (
                <motion.div key={`${round}-${d.pick}`} initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: i * 0.05, type: 'spring', stiffness: 260, damping: 24 }}
                  className={`card ${isMine ? 'glow' : ''}`} style={{ padding: 12, background: isMine ? 'color-mix(in srgb, var(--accent) 14%, var(--panel))' : undefined }}>
                  <div className="row">
                    <div className="num" style={{ fontSize: 30, width: 46, color: d.pick <= 14 ? 'var(--gold)' : 'var(--text)' }}>{d.pick}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="tiny muted upper b">{d.nbaTeam}</div>
                      <div className="b ellipsis">{d.name}</div>
                      <div className="tiny muted">{d.pos}{college ? ` · ${college.school}` : ''}</div>
                    </div>
                    {college && <TeamLogo team={college} size={30} />}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

// ---------------- Progression ----------------
function Progression() {
  const g = useGameState();
  const open = useGame((s) => s.open);
  const team = g.teams[g.user.teamId];
  const prog = g.offseason?.progression ?? {};
  const rows = teamPlayers(g, team.id).map((p) => ({ p, d: prog[p.id] ?? 0 })).sort((a, b) => b.d - a.d);
  const total = rows.reduce((s, r) => s + r.d, 0);
  const best = rows[0];
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid g4">
        <div className="stat-tile"><div className="l">Team OVR Gain</div><div className={`v ${total >= 0 ? 'good' : 'bad'}`}>{total >= 0 ? '+' : ''}{total}</div></div>
        <div className="stat-tile"><div className="l">Biggest Jump</div><div className="v" style={{ fontSize: 20 }}>{best && best.d > 0 ? `${best.p.last} +${best.d}` : '—'}</div></div>
        <div className="stat-tile"><div className="l">Roster</div><div className="v">{rows.length}</div></div>
        <div className="stat-tile"><div className="l">Dev Skill</div><div className="v">{g.coaches[g.user.coachId]?.skills.development ?? 0}/10</div></div>
      </div>
      <Section title="Development Report">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th></th><th>Player</th><th>Pos</th><th>Class</th><th className="c">OVR</th><th className="c">Change</th><th className="c">POT</th></tr></thead>
            <tbody>
              {rows.map(({ p, d }, i) => (
                <tr key={p.id} className="click row-in" style={{ animationDelay: `${Math.min(i * 60, 900)}ms` }} onClick={() => open({ kind: 'player', id: p.id })}>
                  <td style={{ width: 44 }}><PlayerFace p={p} size={34} team={team} /></td>
                  <td className="b">{p.first} {p.last}{p.career.length === 0 && <span className="pill blue" style={{ marginLeft: 6, fontSize: 9 }}>NEW</span>}</td>
                  <td>{p.pos}</td>
                  <td>{p.cls}</td>
                  <td className="c"><span className="num" style={{ fontSize: 20 }}><CountUp from={p.ovr - d} to={p.ovr} delay={0.3 + i * 0.06} /></span></td>
                  <td className="c">
                    <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.2 + i * 0.06, type: 'spring', stiffness: 400 }}
                      className={`pill ${d > 0 ? 'good' : d < 0 ? 'bad' : ''}`} style={{ fontSize: 12 }}>{d > 0 ? `▲ +${d}` : d < 0 ? `▼ ${d}` : '—'}</motion.span>
                  </td>
                  <td className="c muted num">{p.pot}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
