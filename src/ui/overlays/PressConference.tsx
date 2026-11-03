import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '../../store/gameStore';
import { CoachFace, PersonFace, TeamLogo } from '../components/common';
import { answerPress } from '../../engine/season';
import { effectSummary } from '../../engine/coach';
import type { PressQuestion } from '../../engine/types';
import { mix, teamAccent } from '../color';
import { sfx } from '../sound';

const TONE: Record<PressQuestion['answers'][number]['tone'], { icon: string; label: string }> = {
  confident: { icon: '😤', label: 'Confident' },
  humble: { icon: '🙏', label: 'Humble' },
  deflect: { icon: '🤐', label: 'Deflect' },
  fiery: { icon: '🔥', label: 'Fiery' },
  praise: { icon: '👏', label: 'Praise' },
  joke: { icon: '😄', label: 'Lighten up' },
};

const TAG_ICON: Record<string, string> = { Record: '📖', 'Follow-up': '🔁', 'Last season': '📅', 'Big picture': '🔭', Offseason: '🔄', Storyline: '📖', Rematch: '⚔️', 'Senior Night': '🎓', Milestone: '🏅', Award: '🏆', 'Your past': '🧳' };
const TAG_CLS: Record<string, string> = { Record: 'gold', 'Follow-up': 'gold', 'Last season': 'blue', Rematch: 'bad', Milestone: 'good', Award: 'good', 'Senior Night': 'accent' };

export function PressConferenceView() {
  const press = useGame((s) => s.game?.user.press ?? null);
  const g = useGame((s) => s.game);
  useGame((s) => s.tick);
  const [qi, setQi] = useState(0);
  const [answered, setAnswered] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [flashes, setFlashes] = useState<number[]>([]);
  useEffect(() => { setQi(0); setAnswered(null); }, [press?.id]);
  const q = press?.questions[qi];
  useEffect(() => {
    if (!q) return;
    setTyped('');
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setTyped(q.text.slice(0, i));
      if (i >= q.text.length) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [q]);
  useEffect(() => {
    if (!press) return;
    const id = setInterval(() => {
      if (Math.random() < 0.55) {
        const f = Date.now();
        setFlashes((x) => [...x.slice(-4), f]);
        sfx.camera();
      }
    }, 900);
    return () => clearInterval(id);
  }, [press]);
  const flashPos = useMemo(() => flashes.map((f) => ({ f, x: 5 + ((f * 7919) % 90), y: 55 + ((f * 104729) % 30) })), [flashes]);
  if (!press || !g || !q) return null;
  const team = g.teams[g.user.teamId];
  const coach = g.coaches[g.user.coachId];
  const done = qi >= press.questions.length - 1 && answered != null;
  const close = () => useGame.getState().mutate((gg) => { gg.user.press = null; });
  const choose = (idx: number) => {
    if (answered != null) return;
    setAnswered(idx);
    useGame.getState().mutate((gg) => answerPress(gg, qi, idx));
    sfx.click();
  };
  const acc = teamAccent(team.colors);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'fixed', inset: 0, zIndex: 70, background: '#05080f', overflow: 'hidden' }}>
      {/* step-and-repeat backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${mix(team.colors[0], '#000', 0.45)}, #05080f 85%)` }} />
      <div style={{ position: 'absolute', inset: '0 0 35% 0', display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 18, padding: 24, opacity: 0.16, transform: 'perspective(800px) rotateX(8deg)' }}>
        {Array.from({ length: 32 }, (_, i) => (
          <div key={i} style={{ display: 'grid', placeItems: 'center' }}>
            {i % 2 === 0 ? <TeamLogo team={team} size={58} /> : <span className="num" style={{ fontSize: 15, letterSpacing: '.2em', color: '#fff' }}>{i % 4 === 1 ? 'COURTSIDE' : team.abbr}</span>}
          </div>
        ))}
      </div>
      {/* camera flashes */}
      <AnimatePresence>
        {flashPos.map((p) => (
          <motion.div key={p.f} initial={{ opacity: 0.95, scale: 0.4 }} animate={{ opacity: 0, scale: 2.2 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}
            style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, width: 90, height: 90, borderRadius: '50%', background: 'radial-gradient(circle, #fff, rgba(255,255,255,0) 65%)', pointerEvents: 'none', zIndex: 3 }} />
        ))}
      </AnimatePresence>
      <div style={{ position: 'relative', zIndex: 2, height: '100%', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(420px, 560px)', gap: 30, padding: '40px 50px' }}>
        {/* Podium */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
          <div className="pill bad pulse" style={{ alignSelf: 'flex-start', fontSize: 12 }}>● LIVE · {press.title}</div>
          <div className="muted" style={{ alignSelf: 'flex-start', marginTop: 8 }}>{press.context}</div>
          <div style={{ flex: 1 }} />
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 16 }} style={{ position: 'relative' }}>
            <CoachFace c={coach} size={280} team={team} bg="none" />
            {/* microphones */}
            <svg width="160" height="120" style={{ position: 'absolute', left: '50%', bottom: -20, transform: 'translateX(-50%)' }}>
              {[30, 62, 94, 126].map((x, i) => <g key={x}><line x1={x} y1="40" x2={80} y2="120" stroke="#222" strokeWidth="4" /><rect x={x - 9} y={18 + (i % 2) * 8} width="18" height="28" rx="8" fill="#1a1a1a" stroke="#444" /><rect x={x - 11} y={38 + (i % 2) * 8} width="22" height="12" rx="3" fill={i === 1 ? acc : ['#c22', '#118', '#e80', '#1a6'][i]} /></g>)}
            </svg>
          </motion.div>
          <div style={{ width: 'min(520px, 100%)', height: 150, borderRadius: '18px 18px 0 0', background: `linear-gradient(180deg, ${team.colors[0]}, ${mix(team.colors[0], '#000', 0.6)})`, display: 'grid', placeItems: 'center', boxShadow: '0 -10px 40px rgba(0,0,0,.6)', border: '1px solid rgba(255,255,255,.15)' }}>
            <div className="row"><TeamLogo team={team} size={64} /><div><div className="num" style={{ fontSize: 30, color: team.colors[1] }}>{team.school.toUpperCase()}</div><div className="tiny upper b" style={{ letterSpacing: '.3em', color: 'rgba(255,255,255,.7)' }}>Men's Basketball</div></div></div>
          </div>
        </div>
        {/* Q&A */}
        <div className="col" style={{ justifyContent: 'center', gap: 16, background: 'linear-gradient(90deg, transparent, rgba(5,8,15,.85) 12%)', margin: '-40px -50px -40px 0', padding: '40px 50px 40px 40px' }}>
          <div className="row tiny muted upper b" style={{ letterSpacing: '.16em' }}>Question {qi + 1} of {press.questions.length}<div className="spacer" />
            {press.questions.map((_, i) => <span key={i} style={{ width: 26, height: 4, borderRadius: 2, background: i < qi || (i === qi && answered != null) ? 'var(--accent)' : 'rgba(255,255,255,.15)' }} />)}
          </div>
          <>
            <motion.div key={qi} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="card solid" style={{ padding: 22 }}>
              <div className="row" style={{ marginBottom: 12 }}>
                <PersonFace seed={q.reporter} size={52} />
                <div><div className="b">{q.reporter}</div><div className="tiny muted">{q.outlet}</div></div>
                <div className="spacer" />
                <div className="col" style={{ alignItems: 'flex-end', gap: 4 }}>
                  <span className="pill">🎙️ {q.role ?? 'Reporter'}</span>
                  {q.tag && <span className={`pill ${TAG_CLS[q.tag] ?? 'blue'}`}>{TAG_ICON[q.tag] ?? '📰'} {q.tag}</span>}
                </div>
              </div>
              {q.quote && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="press-quote">
                  <div className="tiny upper b" style={{ letterSpacing: '.12em', opacity: 0.75 }}>📼 You, {q.quote.when.charAt(0).toLowerCase() + q.quote.when.slice(1)}</div>
                  <div style={{ marginTop: 4 }}>“{q.quote.text}”</div>
                </motion.div>
              )}
              <div style={{ fontSize: 19, lineHeight: 1.45, minHeight: 84, fontWeight: 600 }}>“{typed}<span className="pulse">{typed.length < q.text.length ? '▍' : ''}</span>{typed.length >= q.text.length ? '”' : ''}</div>
            </motion.div>
          </>
          <div className="col" style={{ gap: 10 }}>
            {q.answers.map((a, i) => {
              const chosen = answered === i;
              const dim = answered != null && !chosen;
              return (
                <motion.button key={`${qi}-${i}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: dim ? 0.35 : 1, y: 0, scale: chosen ? 1.02 : 1 }} transition={{ delay: answered == null ? 0.3 + i * 0.08 : 0 }}
                  whileHover={answered == null ? { x: 6 } : {}} className="card solid" onClick={() => choose(i)}
                  style={{ textAlign: 'left', cursor: answered == null ? 'pointer' : 'default', padding: '14px 16px', borderColor: chosen ? 'var(--accent)' : undefined, color: 'var(--text)', fontSize: 14.5 }}>
                  <div className="row" style={{ alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 22 }}>{TONE[a.tone].icon}</span>
                    <div style={{ flex: 1 }}>
                      <div className="tiny upper b muted" style={{ letterSpacing: '.14em' }}>{TONE[a.tone].label}</div>
                      <div>“{a.text}”</div>
                      {chosen && a.effects.length > 0 && (
                        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="row wrap gap-s" style={{ marginTop: 8 }}>
                          {effectSummary(a.effects).split(' · ').map((s) => <span key={s} className={`pill ${/-/.test(s) && !/\+/.test(s) ? 'bad' : 'good'}`}>{s}</span>)}
                        </motion.div>
                      )}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
          <div className="row">
            <button className="btn ghost" onClick={() => { useGame.getState().mutate((gg) => { gg.coaches[gg.user.coachId].mediaRep = Math.max(0, gg.coaches[gg.user.coachId].mediaRep - 2); gg.user.press = null; }); }}>Skip presser (−media)</button>
            <div className="spacer" />
            {answered != null && !done && <button className="btn primary lg" onClick={() => { setQi(qi + 1); setAnswered(null); }}>Next question →</button>}
            {done && <button className="btn primary lg" onClick={() => { sfx.whoosh(); close(); }}>Leave the podium</button>}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
