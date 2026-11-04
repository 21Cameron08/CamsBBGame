import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '../../store/gameStore';
import { PlayerFace, TeamLogo, Stars, Confetti, CoachFace } from '../components/common';
import type { GameState, Moment, Team } from '../../engine/types';
import { mix } from '../color';
import { sfx } from '../sound';
import { decisionSummary } from '../../engine/recruiting';
import { SelectionShow } from './SelectionShow';

export function MomentHost() {
  const g = useGame((s) => s.game);
  useGame((s) => s.tick);
  const press = g?.user.press;
  const m = g?.user.moments[0];
  // 'win' moments are just markers for now — clear them silently
  useEffect(() => {
    if (m && m.kind === 'win') useGame.getState().dismissMoment();
  }, [m]);
  if (!g || !m || press || m.kind === 'win') return null;
  return (
    <>
      <MomentView key={JSON.stringify(m)} g={g} m={m} />
    </>
  );
}

function Shell({ children, onClose, colors }: { children: React.ReactNode; onClose?: () => void; colors?: [string, string] }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 75, display: 'grid', placeItems: 'center', background: colors ? `radial-gradient(900px 600px at 50% 40%, ${mix(colors[0], '#000', 0.3)}cc, rgba(3,5,10,.94))` : 'rgba(3,5,10,.9)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </motion.div>
  );
}

function MomentView({ g, m }: { g: GameState; m: Moment }) {
  const dismiss = useGame((s) => s.dismissMoment);
  const nav = useGame((s) => s.nav);
  switch (m.kind) {
    case 'commit': return <CommitCeremony g={g} m={m} onDone={dismiss} />;
    case 'selection': return <SelectionShow g={g} onDone={dismiss} onBracket={() => { dismiss(); nav('bracket'); }} />;
    case 'title': {
      const t = g.teams[m.teamId];
      return <TitleMoment team={t} label={m.label} onDone={dismiss} />;
    }
    case 'rivalry': {
      const t = g.teams[m.teamId], o = g.teams[m.oppId];
      return <RivalryMoment team={t} opp={o} label={m.label} sub={m.sub} trophy={m.trophy} onDone={dismiss} />;
    }
    case 'levelUp': {
      const c = g.coaches[g.user.coachId];
      return (
        <Shell onClose={dismiss}>
          <motion.div initial={{ scale: 0.7, y: 30 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} className="card glow" style={{ width: 420, textAlign: 'center', padding: 30 }}>
            <motion.div animate={{ rotate: [0, -8, 8, 0] }} transition={{ duration: 0.8 }} style={{ fontSize: 56 }}>⭐</motion.div>
            <div className="eyebrow">Coach Level Up</div>
            <div className="num" style={{ fontSize: 72, lineHeight: 1 }}>LVL {m.level}</div>
            <div className="muted" style={{ margin: '8px 0 18px' }}>+1 skill point. You have {c.skillPoints} to spend.</div>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="btn" onClick={dismiss}>Later</button>
              <button className="btn primary" onClick={() => { dismiss(); nav('coach'); }}>Spend points →</button>
            </div>
          </motion.div>
        </Shell>
      );
    }
    case 'award': {
      const p = g.players[m.personId];
      const c = g.coaches[m.personId];
      const t = g.teams[g.user.teamId];
      return (
        <Shell onClose={dismiss} colors={t.colors}>
          <Confetti colors={['#f6c94c', '#ffffff', t.colors[0]]} count={120} />
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="card glow" style={{ width: 460, textAlign: 'center', padding: 30 }}>
            <div style={{ fontSize: 50 }}>🏅</div>
            <div className="eyebrow gold">{m.label}</div>
            <div style={{ margin: '14px auto' }}>{p ? <PlayerFace p={p} size={150} team={t} /> : c ? <CoachFace c={c} size={150} team={t} /> : null}</div>
            <div className="h2">{p ? `${p.first} ${p.last}` : c ? `${c.first} ${c.last}` : ''}</div>
            <button className="btn primary" style={{ marginTop: 18 }} onClick={dismiss}>Continue</button>
          </motion.div>
        </Shell>
      );
    }
    case 'portalDay':
      return <PortalDayReveal g={g} m={m} onDone={dismiss} />;
    case 'fired':
      return (
        <Shell>
          <motion.div initial={{ scale: 1.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6 }} className="card" style={{ width: 520, textAlign: 'center', padding: 34, borderColor: 'rgba(255,93,93,.5)' }}>
            <div style={{ fontSize: 54 }}>📦</div>
            <div className="h1" style={{ color: 'var(--bad)' }}>You've Been Fired</div>
            <div className="muted" style={{ margin: '12px 0 20px' }}>The AD called you in this morning. Pack up the office — but this isn't the end. Other programs are calling.</div>
            <button className="btn primary lg" onClick={() => { dismiss(); nav('offseason'); }}>Review Job Offers</button>
          </motion.div>
        </Shell>
      );
    default:
      return null;
  }
}

function Cap({ team, size = 120 }: { team: Team; size?: number }) {
  const [p, s] = team.colors;
  return (
    <div style={{ position: 'relative', width: size, height: size * 0.8 }}>
      <svg width={size} height={size * 0.8} viewBox="0 0 120 96">
        <path d="M14 62 C14 26 38 10 62 10 C86 10 106 26 106 62 Z" fill={p} stroke={mix(p, '#000', 0.4)} strokeWidth="2" />
        <path d="M62 10 C58 26 56 44 56 62" stroke={mix(p, '#000', 0.3)} strokeWidth="1.5" fill="none" />
        <path d="M62 10 C70 26 76 44 78 62" stroke={mix(p, '#000', 0.3)} strokeWidth="1.5" fill="none" />
        <circle cx="62" cy="11" r="4" fill={s} />
        <path d="M6 62 H112 C112 72 100 80 60 80 C22 80 6 72 6 62 Z" fill={mix(p, '#000', 0.25)} stroke={mix(p, '#000', 0.5)} strokeWidth="2" />
      </svg>
      <div style={{ position: 'absolute', left: '50%', top: size * 0.17, transform: 'translateX(-50%)' }}><TeamLogo team={team} size={size * 0.34} /></div>
    </div>
  );
}

function CommitCeremony({ g, m, onDone }: { g: GameState; m: Extract<Moment, { kind: 'commit' }>; onDone: () => void }) {
  const r = g.recruits[m.recruitId];
  const [stage, setStage] = useState(0); // 0 intro, 1 drumroll, 2 reveal
  const chosen = g.teams[m.teamId];
  const isUser = m.teamId === g.user.teamId;
  const hatIds = Array.from(new Set([m.teamId, ...m.others])).slice(0, 4);
  // stable shuffle so the chosen hat isn't always first
  const hats = [...hatIds].sort((a, b) => ((a.length * 31 + (r?.rank ?? 1)) % 7) - ((b.length * 17 + (r?.rank ?? 1)) % 7));
  useEffect(() => {
    const t1 = setTimeout(() => { setStage(1); sfx.drum(); }, 900);
    const t2 = setTimeout(() => { setStage(2); if (isUser) { sfx.fanfare(); sfx.crowd(1.4); } else sfx.whoosh(); }, 2600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isUser]);
  if (!r || !chosen) { onDone(); return null; }
  return (
    <Shell colors={stage === 2 ? chosen.colors : undefined}>
      {stage === 2 && isUser && <Confetti colors={[chosen.colors[0], chosen.colors[1], '#ffffff']} />}
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={{ width: 'min(820px, 94vw)', textAlign: 'center' }}>
        <div className="pill bad pulse" style={{ marginBottom: 10 }}>● LIVE · Commitment Ceremony</div>
        <div className="row" style={{ justifyContent: 'center', gap: 10 }}><Stars n={r.stars} /><span className="muted small">No. {r.rank} overall · {r.pos} · {r.hometown}{r.type !== 'INTL' ? `, ${r.state}` : ''}</span></div>
        <div className="h1" style={{ fontSize: 50, margin: '6px 0 14px' }}>{r.first} {r.last}</div>
        <motion.div animate={stage === 1 ? { scale: [1, 1.03, 1] } : {}} transition={{ repeat: Infinity, duration: 0.5 }} style={{ display: 'inline-block' }}>
          <PlayerFace p={{ ...r, num: 0 }} size={190} team={stage === 2 ? chosen : undefined} />
        </motion.div>
        <div style={{ marginTop: -12, padding: '26px 30px 18px', borderRadius: 18, background: 'linear-gradient(180deg, #4a2f19, #2a190c)', border: '1px solid rgba(255,255,255,.12)', boxShadow: '0 30px 60px rgba(0,0,0,.6)', display: 'flex', justifyContent: 'center', gap: 26 }}>
          {hats.map((id, i) => {
            const t = g.teams[id];
            const win = id === m.teamId;
            return (
              <motion.div key={id} initial={{ y: 20, opacity: 0 }}
                animate={stage < 2 ? { y: stage === 1 ? [0, -4, 0] : 0, opacity: 1 } : win ? { y: -70, scale: 1.35, opacity: 1, rotate: [0, -6, 6, 0] } : { y: 20, opacity: 0.15, scale: 0.9 }}
                transition={stage === 1 ? { repeat: Infinity, duration: 0.4, delay: i * 0.1 } : { type: 'spring', stiffness: 200, damping: 14 }}
                style={{ textAlign: 'center', filter: stage === 2 && win ? `drop-shadow(0 0 24px ${chosen.colors[0]})` : undefined }}>
                <Cap team={t} size={110} />
                <div className="tiny b" style={{ marginTop: 4 }}>{t.school}</div>
              </motion.div>
            );
          })}
        </div>
        <AnimatePresence>
          {stage === 2 && (
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} style={{ marginTop: 22 }}>
              <div className="h1" style={{ fontSize: 40, color: isUser ? 'var(--good)' : '#fff' }}>{isUser ? `HE'S COMING TO ${chosen.school.toUpperCase()}!` : `${r.last} picks ${chosen.school}`}</div>
              <div className="muted" style={{ marginTop: 6 }}>{isUser ? 'The fan base is losing its mind. Welcome to the family.' : `Tough break. ${chosen.school} wins this battle on the trail.`}</div>
              {r.decision && r.decision.teamId === m.teamId && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} style={{ marginTop: 14 }}>
                  <div className="small" style={{ maxWidth: 560, margin: '0 auto', color: 'rgba(255,255,255,.85)' }}>{decisionSummary(g, r.decision)}</div>
                  {r.decision.odds.length > 1 && (
                    <div className="row wrap" style={{ justifyContent: 'center', gap: 6, marginTop: 10 }}>
                      <span className="tiny muted upper b" style={{ letterSpacing: '.1em' }}>Final odds</span>
                      {r.decision.odds.filter((o, i) => i < 3 || o.teamId === g.user.teamId || o.teamId === m.teamId).slice(0, 5).map((o, i) => {
                        const t = g.teams[o.teamId];
                        if (!t) return null;
                        return (
                          <motion.span key={o.teamId} className={`pill ${o.teamId === m.teamId ? (isUser ? 'good' : 'accent') : ''}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1 + i * 0.12 }}>
                            <TeamLogo team={t} size={14} /> {o.teamId === g.user.teamId ? 'You' : t.abbr} {Math.round(o.p * 100)}%
                          </motion.span>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              )}
              <button className="btn primary lg" style={{ marginTop: 16 }} onClick={onDone}>Continue</button>
            </motion.div>
          )}
        </AnimatePresence>
        {stage < 2 && <div className="muted" style={{ marginTop: 18 }}>{stage === 0 ? 'He steps up to the table…' : 'He reaches for a hat…'}</div>}
      </motion.div>
    </Shell>
  );
}

function TitleMoment({ team, label, onDone }: { team: Team; label: string; onDone: () => void }) {
  useEffect(() => { sfx.fanfare(); sfx.crowd(1.6); }, []);
  return (
    <Shell colors={team.colors} onClose={onDone}>
      <Confetti colors={[team.colors[0], team.colors[1], '#f6c94c', '#ffffff']} count={260} duration={6000} />
      <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 12 }} style={{ textAlign: 'center' }}>
        <motion.div animate={{ y: [0, -12, 0] }} transition={{ repeat: Infinity, duration: 2 }} style={{ fontSize: 90 }}>🏆</motion.div>
        <TeamLogo team={team} size={140} />
        <div className="num" style={{ fontSize: 'clamp(42px, 7vw, 86px)', lineHeight: 1, marginTop: 12, textShadow: `0 0 40px ${team.colors[0]}` }}>{label.toUpperCase()}</div>
        <div className="h2" style={{ marginTop: 8 }}>{team.school} {team.mascot}</div>
        <button className="btn gold lg" style={{ marginTop: 24 }} onClick={onDone}>Cut down the nets ✂️</button>
      </motion.div>
    </Shell>
  );
}

function PortalDayReveal({ g, m, onDone }: { g: GameState; m: Extract<Moment, { kind: 'portalDay' }>; onDone: () => void }) {
  const [shown, setShown] = useState(0);
  const team = g.teams[g.user.teamId];
  const wins = m.results.filter((r) => r.won).length;
  const all = shown >= m.results.length;
  useEffect(() => {
    sfx.drum();
    const id = setInterval(() => setShown((s) => {
      const n = s + 1;
      const r = m.results[n - 1];
      if (r) { if (r.won) sfx.swish(); else sfx.rim(); }
      if (n >= m.results.length) clearInterval(id);
      return n;
    }), 750);
    return () => clearInterval(id);
  }, [m]);
  useEffect(() => { if (all && wins) { sfx.fanfare(); sfx.crowd(1.2); } }, [all, wins]);
  return (
    <Shell colors={all && wins ? team.colors : undefined}>
      {all && wins > 0 && <Confetti colors={[team.colors[0], team.colors[1], '#ffffff']} count={70 + wins * 40} />}
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={{ width: 'min(900px, 94vw)', textAlign: 'center' }}>
        <div className="pill bad pulse" style={{ marginBottom: 10 }}>● Portal Decision Day {m.day}</div>
        <div className="h1" style={{ fontSize: 44, marginBottom: 18 }}>{all ? (wins ? `You landed ${wins} of ${m.results.length}!` : `Shut out — 0 of ${m.results.length}`) : 'The decisions are coming in…'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, m.results.length)}, minmax(0, 200px))`, justifyContent: 'center', gap: 14 }}>
          {m.results.map((r, i) => {
            const p = g.players[r.playerId];
            const t = g.teams[r.teamId];
            const flipped = i < shown;
            return (
              <div key={r.playerId} style={{ perspective: 900 }}>
                <motion.div animate={{ rotateY: flipped ? 180 : 0 }} transition={{ duration: 0.55, ease: [0.3, 0.7, 0.3, 1] }} style={{ position: 'relative', height: 220, transformStyle: 'preserve-3d' }}>
                  <div className="card" style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', display: 'grid', placeItems: 'center', padding: 12 }}>
                    <div>
                      {p && <PlayerFace p={p} size={96} />}
                      <div className="b" style={{ marginTop: 8 }}>{p ? `${p.first} ${p.last}` : 'Transfer'}</div>
                      <div className="num" style={{ fontSize: 40, color: 'var(--dim)' }}>?</div>
                    </div>
                  </div>
                  <div className="card" style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', display: 'grid', placeItems: 'center', padding: 12,
                    borderColor: r.won ? 'var(--good)' : 'rgba(255,93,93,.5)', background: r.won ? `linear-gradient(160deg, ${t?.colors[0] ?? '#222'}cc, var(--panel))` : undefined }}>
                    <div>
                      {t && <TeamLogo team={t} size={84} />}
                      <div className="b" style={{ marginTop: 8 }}>{p ? `${p.first} ${p.last}` : ''}</div>
                      <div className="small muted">{r.won ? 'is coming to' : 'picked'} {t?.school}</div>
                      <div className="num" style={{ fontSize: 26, marginTop: 4, color: r.won ? 'var(--good)' : 'var(--bad)' }}>{r.won ? 'WON' : 'LOST'}</div>
                    </div>
                  </div>
                </motion.div>
              </div>
            );
          })}
        </div>
        {all && <button className="btn primary lg" style={{ marginTop: 22 }} onClick={onDone}>Back to the portal</button>}
      </motion.div>
    </Shell>
  );
}

function RivalryMoment({ team, opp, label, sub, trophy, onDone }: { team: Team; opp: Team; label: string; sub: string; trophy?: string; onDone: () => void }) {
  useEffect(() => { sfx.fanfare(); sfx.crowd(1.4); }, []);
  return (
    <Shell colors={team.colors} onClose={onDone}>
      <Confetti colors={[team.colors[0], team.colors[1], '#ff8a3d', '#f6c94c']} count={200} duration={5000} />
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 170, damping: 13 }} style={{ textAlign: 'center', maxWidth: 760 }}>
        <div className="riv-week-tag" style={{ display: 'inline-block', marginBottom: 14 }}>RIVALRY WIN</div>
        <div className="row" style={{ justifyContent: 'center', gap: 26, alignItems: 'center' }}>
          <motion.div initial={{ x: -60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.15 }}><TeamLogo team={team} size={120} /></motion.div>
          <motion.div animate={{ y: [0, -10, 0], rotate: [0, -4, 4, 0] }} transition={{ repeat: Infinity, duration: 2.2 }} style={{ fontSize: 84 }}>🏆</motion.div>
          <motion.div initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 0.45 }} transition={{ delay: 0.15 }} style={{ filter: 'grayscale(.7)' }}><TeamLogo team={opp} size={90} /></motion.div>
        </div>
        {trophy && <div className="eyebrow" style={{ marginTop: 14, color: '#ffd27a' }}>{trophy}</div>}
        <div className="num" style={{ fontSize: 'clamp(34px, 6vw, 64px)', lineHeight: 1.02, marginTop: 6, textShadow: `0 0 36px ${team.colors[0]}` }}>{label.toUpperCase()}</div>
        <div className="muted" style={{ marginTop: 10 }}>{sub}</div>
        <button className="btn gold lg" style={{ marginTop: 22 }} onClick={onDone}>Hoist it 🏆</button>
      </motion.div>
    </Shell>
  );
}
