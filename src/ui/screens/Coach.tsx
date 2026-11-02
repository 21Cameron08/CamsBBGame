import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { CoachFace, Gauge, TeamLogo, TeamHeroBg, Section, Empty, AnimatedNumber, fmtMoneyShort } from '../components/common';
import { ARCHETYPE_INFO, SKILL_INFO, xpForLevel, EXPECTATIONS } from '../../engine/coach';
import type { CoachSkills, Trophy } from '../../engine/types';
import { seasonLabel } from '../../engine/calendar';
import { sfx } from '../sound';

const TROPHY_ICON: Record<Trophy['kind'], { icon: string; color: string; label: string }> = {
  natl: { icon: '🏆', color: '#f6c94c', label: 'National Title' },
  f4: { icon: '🏀', color: '#ff9a3c', label: 'Final Four' },
  e8: { icon: '🥈', color: '#c9d1df', label: 'Elite Eight' },
  s16: { icon: '🎟️', color: '#4da3ff', label: 'Sweet 16' },
  conf: { icon: '🛡️', color: '#22d38f', label: 'Conference Title' },
  ctourn: { icon: '✂️', color: '#b48cff', label: 'Conference Tournament' },
  coy: { icon: '🧢', color: '#ff7aa8', label: 'Coach of the Year' },
};

export function CoachScreen() {
  const g = useGameState();
  const mutate = useGame((s) => s.mutate);
  const toast = useGame((s) => s.toast);
  const coach = g.coaches[g.user.coachId];
  const team = g.teams[g.user.teamId];
  const [popped, setPopped] = useState<string | null>(null);
  if (!coach) return <Empty>No coach found.</Empty>;
  const need = xpForLevel(coach.level);
  const xpPct = Math.min(100, (coach.xp / need) * 100);
  const alma = coach.almaMater ? g.teams[coach.almaMater] : undefined;
  const winPct = coach.careerW + coach.careerL ? coach.careerW / (coach.careerW + coach.careerL) : 0;
  const arch = ARCHETYPE_INFO[coach.archetype];

  const upgrade = (k: keyof CoachSkills) => {
    if (coach.skillPoints <= 0 || coach.skills[k] >= 10) return;
    const next = coach.skills[k] + 1;
    mutate((gg) => {
      const c = gg.coaches[gg.user.coachId];
      if (c.skillPoints <= 0 || c.skills[k] >= 10) return;
      c.skills[k]++;
      c.skillPoints--;
      if (k === 'recruiting') {
        gg.user.hoursMax = 40 + c.skills.recruiting * 4;
      }
    });
    sfx.fanfare();
    setPopped(k);
    setTimeout(() => setPopped(null), 900);
    toast(`${SKILL_INFO[k].label} upgraded to ${next}!`, 'good');
  };

  const trophyCounts = coach.trophies.reduce<Record<string, number>>((m, t) => ((m[t.kind] = (m[t.kind] ?? 0) + 1), m), {});

  return (
    <div>
      <div className="card flush" style={{ marginBottom: 18 }}>
        <div className="hero" style={{ padding: '28px 30px' }}>
          <TeamHeroBg team={team} />
          <div className="row gap-l" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }}>
              <CoachFace c={coach} size={176} team={team} bg="card" />
            </motion.div>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div className="eyebrow">Head Coach · {team.school}</div>
              <div className="h1" style={{ marginTop: 6 }}>{coach.first} {coach.last}</div>
              <div className="row wrap" style={{ marginTop: 10 }}>
                <span className="pill accent">{arch.icon} {coach.archetype}</span>
                <span className="pill">Age {coach.age}</span>
                {alma && <span className="pill"><TeamLogo team={alma} size={14} /> {alma.school} alum</span>}
                {coach.hometown && <span className="pill">🏠 {coach.hometown}</span>}
              </div>
              <div style={{ marginTop: 16, maxWidth: 520 }}>
                <div className="row" style={{ marginBottom: 6 }}>
                  <span className="num" style={{ fontSize: 26 }}>LVL {coach.level}</span>
                  <span className="spacer" />
                  <span className="small muted"><AnimatedNumber value={coach.xp} /> / {need.toLocaleString()} XP</span>
                </div>
                <div className="bar thick">
                  <motion.i initial={{ width: 0 }} animate={{ width: `${xpPct}%` }} transition={{ duration: 1.2, ease: [0.2, 0.8, 0.2, 1] }} style={{ background: 'linear-gradient(90deg, var(--accent), var(--gold))', boxShadow: '0 0 14px var(--accent)' }} />
                </div>
                {coach.skillPoints > 0 && (
                  <motion.div className="pill gold" style={{ marginTop: 10 }} animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: Infinity, duration: 1.6 }}>
                    ★ {coach.skillPoints} skill point{coach.skillPoints > 1 ? 's' : ''} to spend
                  </motion.div>
                )}
              </div>
            </div>
            <div className="row gap-l">
              <Gauge value={coach.reputation} label="Reputation" />
              <Gauge value={coach.jobSecurity} label="Job Security" />
              <Gauge value={coach.mediaRep} label="Media" color="var(--blue)" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid g4 mb">
        <div className="stat-tile"><div className="l">Career Record</div><div className="v">{coach.careerW}-{coach.careerL}</div><div className="tiny muted">{(winPct * 100).toFixed(1)}% wins</div></div>
        <div className="stat-tile"><div className="l">Salary</div><div className="v">{fmtMoneyShort(coach.salary)}</div><div className="tiny muted">per year</div></div>
        <div className="stat-tile"><div className="l">Contract</div><div className="v">{coach.contractYears} yr{coach.contractYears === 1 ? '' : 's'}</div><div className="tiny muted">remaining</div></div>
        <div className="stat-tile"><div className="l">Seasons</div><div className="v">{coach.career.length}</div><div className="tiny muted">{coach.trophies.length} trophies</div></div>
      </div>

      <div className="grid g-main">
        <Section title="Skill Tree" right={<span className="pill gold">★ {coach.skillPoints} pts</span>}>
          <div className="grid g2" style={{ gap: 12 }}>
            {(Object.keys(SKILL_INFO) as (keyof CoachSkills)[]).map((k) => {
              const info = SKILL_INFO[k];
              const lvl = coach.skills[k];
              const can = coach.skillPoints > 0 && lvl < 10;
              return (
                <motion.div key={k} className="card" style={{ padding: 14, position: 'relative', overflow: 'hidden' }}
                  animate={popped === k ? { scale: [1, 1.05, 1], borderColor: ['rgba(255,255,255,.075)', 'var(--gold)', 'rgba(255,255,255,.075)'] } : {}}
                  transition={{ duration: 0.6 }}>
                  <div className="row">
                    <span style={{ fontSize: 22 }}>{info.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="b">{info.label}</div>
                      <div className="tiny muted">{info.desc}</div>
                    </div>
                    <span className="num" style={{ fontSize: 24, color: 'var(--accent)' }}>{lvl}</span>
                  </div>
                  <div className="row" style={{ gap: 3, marginTop: 10 }}>
                    {Array.from({ length: 10 }, (_, i) => (
                      <motion.span key={i} initial={false} animate={{ scale: popped === k && i === lvl - 1 ? [1, 1.7, 1] : 1 }} transition={{ duration: 0.5 }}
                        style={{ flex: 1, height: 8, borderRadius: 4, background: i < lvl ? 'linear-gradient(90deg, var(--accent), var(--gold))' : 'rgba(255,255,255,.08)', boxShadow: i < lvl ? '0 0 8px color-mix(in srgb, var(--accent) 60%, transparent)' : 'none' }} />
                    ))}
                  </div>
                  <button className="btn sm primary" style={{ marginTop: 10 }} disabled={!can} onClick={() => upgrade(k)}>
                    {lvl >= 10 ? 'Maxed' : 'Upgrade +1'}
                  </button>
                  <AnimatePresence>
                    {popped === k && (
                      <motion.div initial={{ opacity: 1, y: 0 }} animate={{ opacity: 0, y: -40 }} exit={{ opacity: 0 }} transition={{ duration: 0.9 }}
                        style={{ position: 'absolute', right: 16, top: 12, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 26, color: 'var(--gold)' }}>+1</motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </Section>

        <div className="col" style={{ gap: 16 }}>
          <Section title="AD Expectations">
            <div className="b" style={{ fontSize: 16 }}>{g.user.expectation || '—'}</div>
            <div className="col gap-s" style={{ marginTop: 12 }}>
              {EXPECTATIONS.map((e, i) => (
                <div key={e} className="row small" style={{ opacity: i === g.user.expectationLevel ? 1 : 0.45 }}>
                  <span className="dot" style={{ background: i === g.user.expectationLevel ? 'var(--accent)' : i < g.user.expectationLevel ? 'var(--good)' : 'rgba(255,255,255,.2)' }} />
                  <span className={i === g.user.expectationLevel ? 'b' : ''}>{e}</span>
                </div>
              ))}
            </div>
            <div className="divider" />
            <div className="tiny muted">Meet or beat the goal to raise job security. Miss it badly for two seasons and the AD will make a change.</div>
          </Section>

          <Section title="Trophy Case">
            {coach.trophies.length === 0 ? (
              <Empty>The shelf is empty — for now.</Empty>
            ) : (
              <>
                <div className="row wrap" style={{ marginBottom: 12 }}>
                  {Object.entries(trophyCounts).map(([k, n]) => (
                    <span key={k} className="pill" style={{ borderColor: TROPHY_ICON[k as Trophy['kind']].color }}>{TROPHY_ICON[k as Trophy['kind']].icon} {n}× {TROPHY_ICON[k as Trophy['kind']].label}</span>
                  ))}
                </div>
                <div className="grid g3" style={{ gap: 10 }}>
                  {coach.trophies.slice().reverse().map((t, i) => {
                    const tm = g.teams[t.teamId];
                    const ic = TROPHY_ICON[t.kind];
                    return (
                      <motion.div key={i} initial={{ opacity: 0, y: 12, rotateX: 40 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ delay: i * 0.05 }}
                        className="card" style={{ padding: 12, textAlign: 'center', background: `radial-gradient(circle at 50% 0%, ${ic.color}33, var(--panel) 70%)` }}>
                        <div style={{ fontSize: 30, filter: `drop-shadow(0 0 10px ${ic.color})` }}>{ic.icon}</div>
                        <div className="tiny b" style={{ marginTop: 4 }}>{t.label}</div>
                        <div className="tiny muted">{seasonLabel(t.season)}{tm ? ` · ${tm.abbr}` : ''}</div>
                      </motion.div>
                    );
                  })}
                </div>
              </>
            )}
          </Section>
        </div>
      </div>

      <Section title="Career History" className="mt">
        {coach.career.length === 0 ? (
          <Empty>Your first season is underway. History will be written here.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Season</th><th>Team</th><th className="r">W-L</th><th className="r">Conf</th><th className="c">Seed</th><th>Postseason</th></tr></thead>
              <tbody>
                {coach.career.slice().reverse().map((c) => {
                  const tm = g.teams[c.teamId];
                  return (
                    <tr key={`${c.season}-${c.teamId}`}>
                      <td className="num">{seasonLabel(c.season)}</td>
                      <td><span className="row" style={{ gap: 8 }}><TeamLogo team={tm} size={22} />{tm?.school ?? c.teamId}</span></td>
                      <td className="r num">{c.w}-{c.l}</td>
                      <td className="r num">{c.cw}-{c.cl}</td>
                      <td className="c">{c.seed ?? '—'}</td>
                      <td>{c.postseason ? <span className={`pill ${c.postseason === 'Champion' ? 'gold' : c.postseason === 'Final Four' || c.postseason === 'Runner-up' ? 'accent' : ''}`}>{c.postseason}</span> : <span className="dim">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
