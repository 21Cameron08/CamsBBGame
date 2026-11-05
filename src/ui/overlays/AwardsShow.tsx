// Awards Night: an animated, skippable awards show at the end of every season. Each category
// reveals its nominees, opens the envelope and spotlights the winner; then the All-America team,
// the National Player of the Year and the Hall of Fame class. 1×/2×/4× speed, pause, next, skip.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { TeamLogo, PlayerFace, CoachFace, PersonFace, Confetti } from '../components/common';
import type { AwardCategory, AwardNominee, AwardsShowData, GameState, HofInductee, Player } from '../../engine/types';
import { seasonLabel } from '../../engine/calendar';
import { userHaul, HOF_COACH_SCORE, HOF_COACH_WINS } from '../../engine/awards';
import { coachSummaries } from '../../engine/pstats';
import { HOSTS } from '../../engine/radio';
import { Jersey } from '../components/Legacy';
import { teamAccent } from '../color';
import { sfx } from '../sound';

type Step =
  | { k: 'intro'; d: number }
  | { k: 'cat'; c: number; d: number }
  | { k: 'noms'; c: number; d: number }
  | { k: 'env'; c: number; d: number }
  | { k: 'win'; c: number; d: number }
  | { k: 'aa'; i: number; d: number }
  | { k: 'aaRest'; d: number }
  | { k: 'hofTitle'; d: number }
  | { k: 'hof'; i: number; d: number }
  | { k: 'final'; d: number };

const SPEEDS = [1, 2, 4];
function readSpeed(): number { try { const v = Number(localStorage.getItem('cd.showSpeed')); return SPEEDS.includes(v) ? v : 1; } catch { return 1; } }
function saveSpeed(v: number) { try { localStorage.setItem('cd.showSpeed', String(v)); } catch { /* storage unavailable */ } }

export function AwardsShow({ g, season, onDone, onHof }: { g: GameState; season: number; onDone: () => void; onHof: () => void }) {
  const show = useMemo(() => (g.awardsShows ?? []).find((s) => s.season === season), [g, season]);
  const uid = g.user.teamId;
  const isMine = (n?: AwardNominee) => !!n && (n.teamId === uid || n.id === g.user.coachId);

  const steps = useMemo<Step[]>(() => {
    if (!show) return [];
    const out: Step[] = [{ k: 'intro', d: 3400 }];
    const poy = show.categories.findIndex((c) => c.key === 'poy');
    show.categories.forEach((c, i) => {
      if (i === poy) return;
      pushCat(out, c, i, isMine(c.nominees[c.winner]));
    });
    if (show.allAmerica.first.length) {
      show.allAmerica.first.forEach((_, i) => out.push({ k: 'aa', i, d: i === 0 ? 1900 : 1100 }));
      out.push({ k: 'aaRest', d: 3600 });
    }
    if (poy >= 0) pushCat(out, show.categories[poy], poy, isMine(show.categories[poy].nominees[0]));
    if (show.hof.length) {
      out.push({ k: 'hofTitle', d: 2200 });
      show.hof.forEach((_, i) => out.push({ k: 'hof', i, d: 2800 }));
    }
    out.push({ k: 'final', d: Infinity });
    return out;
  }, [show]); // eslint-disable-line react-hooks/exhaustive-deps

  const [idx, setIdx] = useState(0);
  const [speed, setSpeed] = useState(readSpeed);
  const [paused, setPaused] = useState(false);
  const finalIdx = Math.max(0, steps.length - 1);
  const step = steps[Math.min(idx, finalIdx)];
  const next = useCallback(() => setIdx((i) => Math.min(i + 1, finalIdx)), [finalIdx]);
  const skip = useCallback(() => setIdx(finalIdx), [finalIdx]);

  useEffect(() => {
    if (!step || paused || !Number.isFinite(step.d)) return;
    const t = setTimeout(next, step.d / speed);
    return () => clearTimeout(t);
  }, [idx, step, speed, paused, next]);

  useEffect(() => {
    if (!step || !show) return;
    const quiet = speed >= 4;
    switch (step.k) {
      case 'intro': sfx.crowd(0.7); break;
      case 'cat': case 'aa': case 'hofTitle': if (!quiet || step.k !== 'aa') sfx.drum(); break;
      case 'noms': if (!quiet) sfx.whoosh(); break;
      case 'env': sfx.drum(); break;
      case 'win': if (isMine(show.categories[step.c].nominees[show.categories[step.c].winner])) { sfx.fanfare(); sfx.crowd(1.6); } else sfx.crowd(0.9); break;
      case 'hof': sfx.fanfare(); break;
    }
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'Escape') skip();
      else if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, skip]);

  if (!show || !step) {
    return <div className="ss-root aw-root"><div className="ss-bg" /><div className="ss-stage"><div className="ss-center"><div className="h2">Awards Night hasn't happened yet.</div><button className="btn primary" style={{ marginTop: 14 }} onClick={onDone}>Close</button></div></div></div>;
  }
  const user = g.teams[uid];
  const wonSoFar = steps.slice(0, idx + 1).filter((s) => s.k === 'win' && isMine(show.categories[s.c].nominees[show.categories[s.c].winner])).length
    + (steps.slice(0, idx + 1).filter((s) => s.k === 'aa').length ? show.allAmerica.first.slice(0, steps.slice(0, idx + 1).filter((s) => s.k === 'aa').length).filter((p) => p.teamId === uid).length : 0);
  const progress = Math.min(1, idx / Math.max(1, finalIdx));
  const segLabel = step.k === 'intro' ? 'Red carpet' : 'c' in step ? show.categories[step.c].title : step.k === 'aa' || step.k === 'aaRest' ? 'All-America Team' : step.k === 'hofTitle' || step.k === 'hof' ? 'Hall of Fame' : 'The winners';

  return (
    <div className="ss-root aw-root">
      <div className="ss-bg" />
      <div className="aw-spot left" /><div className="aw-spot right" />
      <div className="ss-hud">
        <div className="row" style={{ gap: 10 }}>
          <span className="ss-bug aw-bug">COURTSIDE <b>AWARDS</b></span>
          <span className="pill bad pulse">● LIVE</span>
          <span className="tiny muted upper b" style={{ letterSpacing: '.14em' }}>{segLabel}</span>
        </div>
        <div className="spacer" />
        <div className={`ss-status ${wonSoFar ? 'in' : ''}`}><TeamLogo team={user} size={20} /><span><b>{user.school}</b>: {wonSoFar ? `${wonSoFar} award${wonSoFar > 1 ? 's' : ''} tonight` : step.k === 'final' ? 'shut out tonight' : 'waiting…'}</span></div>
        <div className="ss-controls">
          <div className="seg">{SPEEDS.map((s) => <button key={s} className={speed === s ? 'on' : ''} onClick={() => { setSpeed(s); saveSpeed(s); }}>{s}×</button>)}</div>
          {step.k !== 'final' && (
            <>
              <button className="btn sm" title={paused ? 'Resume (Space)' : 'Pause (Space)'} onClick={() => setPaused((p) => !p)} style={{ minWidth: 70 }}>{paused ? '▶ Play' : '❚❚ Pause'}</button>
              <button className="btn sm" title="Next (→)" onClick={next}>Next ›</button>
              <button className="btn sm primary" title="Skip to the end (Esc)" onClick={skip}>Skip ⏭</button>
            </>
          )}
        </div>
      </div>
      <div className="ss-progress aw-progress"><motion.i animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.4 }} /></div>
      <div className="ss-stage">
        {step.k === 'intro' && <Intro season={show.season} />}
        {step.k === 'cat' && <CatCard key={`cat-${step.c}`} c={show.categories[step.c]} />}
        {(step.k === 'noms' || step.k === 'env' || step.k === 'win') && (
          <CategoryScene key={`scene-${step.c}`} g={g} c={show.categories[step.c]} phase={step.k} mine={isMine(show.categories[step.c].nominees[show.categories[step.c].winner])} speed={speed} />
        )}
        {(step.k === 'aa' || step.k === 'aaRest') && <AllAmerica key="aa" g={g} show={show} shown={step.k === 'aa' ? step.i + 1 : 5} rest={step.k === 'aaRest'} uid={uid} />}
        {step.k === 'hofTitle' && <HofTitle season={show.season} n={show.hof.length} />}
        {step.k === 'hof' && <HofPlaque key={`hof-${step.i}`} g={g} h={show.hof[step.i]} />}
        {step.k === 'final' && <Final g={g} show={show} onDone={onDone} onHof={onHof} />}
      </div>
      {paused && <div className="ss-paused">❚❚ Paused · press Space or Play to resume</div>}
    </div>
  );
}

function pushCat(out: Step[], c: AwardCategory, i: number, mine: boolean) {
  out.push({ k: 'cat', c: i, d: c.marquee ? 2600 : 1700 });
  out.push({ k: 'noms', c: i, d: 900 + c.nominees.length * 650 });
  out.push({ k: 'env', c: i, d: c.marquee ? 2800 : 1700 });
  out.push({ k: 'win', c: i, d: mine ? 5200 : c.marquee ? 4600 : 3200 });
}

// ---------------- scenes ----------------
function Intro({ season }: { season: number }) {
  const title = 'THE COURTSIDE AWARDS';
  return (
    <motion.div className="ss-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="ss-eyebrow aw-eyebrow" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>{seasonLabel(season)} · Live from the Grand Ballroom</motion.div>
      <div className="ss-title aw-title">
        {title.split('').map((ch, i) => <motion.span key={i} initial={{ opacity: 0, rotateX: 90, y: 20 }} animate={{ opacity: 1, rotateX: 0, y: 0 }} transition={{ delay: 0.3 + i * 0.035, type: 'spring', stiffness: 220, damping: 16 }}>{ch === ' ' ? ' ' : ch}</motion.span>)}
      </div>
      <motion.div className="row" style={{ justifyContent: 'center', gap: 28, marginTop: 26 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }}>
        {[{ seed: 'dana-whitfield-host', name: 'Dana Whitfield', role: 'Host' }, { seed: 'fcf-big-sal', name: 'Big Sal', role: 'Red carpet' }].map((h) => (
          <div key={h.seed} className="row" style={{ gap: 10 }}>
            <PersonFace seed={h.seed} size={54} role="coach" colors={h.seed === HOSTS.sal.seed ? HOSTS.sal.colors : undefined} />
            <div style={{ textAlign: 'left' }}><div className="b">{h.name}</div><div className="tiny muted">{h.role}</div></div>
          </div>
        ))}
      </motion.div>
      <motion.div className="ss-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8 }}>“Big Sal is already on the red carpet, and security is keeping a close eye on him.”</motion.div>
    </motion.div>
  );
}

function CatCard({ c }: { c: AwardCategory }) {
  return (
    <motion.div className="ss-center" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 18 }}>
      <motion.div style={{ fontSize: 72 }} initial={{ rotate: -20, scale: 0.4 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 12 }}>{c.icon}</motion.div>
      <div className="ss-eyebrow aw-eyebrow" style={{ marginTop: 6 }}>{c.marquee ? 'The biggest award of the night' : 'The nominees are…'}</div>
      <div className="ss-h aw-h" style={{ marginTop: 6 }}>{c.title}</div>
      <div className="ss-sub">{c.blurb}</div>
    </motion.div>
  );
}

function Avatar({ g, n, size }: { g: GameState; n: AwardNominee; size: number }) {
  const team = g.teams[n.teamId];
  if (n.kind === 'coach') return <CoachFace c={{ id: n.id, age: n.age ?? 50, face: g.coaches[n.id]?.face }} size={size} team={team} />;
  if (n.kind === 'game') return (
    <div className="row" style={{ gap: 6, justifyContent: 'center', height: size }}>
      <TeamLogo team={team} size={Math.round(size * 0.62)} />
      {n.oppId && g.teams[n.oppId] && <span style={{ opacity: 0.45, filter: 'grayscale(.6)' }}><TeamLogo team={g.teams[n.oppId]} size={Math.round(size * 0.42)} /></span>}
    </div>
  );
  return <PlayerFace p={{ id: n.id, num: n.num ?? 0, injury: null } as unknown as Player} size={size} team={team} />;
}

function NomCard({ g, n, i, state, mine, speed }: { g: GameState; n: AwardNominee; i: number; state: 'in' | 'wait' | 'win' | 'lose'; mine: boolean; speed: number }) {
  const team = g.teams[n.teamId];
  const acc = team ? teamAccent(team.colors) : '#f6c94c';
  return (
    <motion.div className={`aw-nom ${state}`} style={{ ['--acc' as string]: acc }}
      initial={{ opacity: 0, rotateY: 80, y: 20 }}
      animate={{ opacity: state === 'lose' ? 0.28 : 1, rotateY: 0, y: 0, scale: state === 'win' ? 1.08 : state === 'lose' ? 0.92 : 1 }}
      transition={{ delay: state === 'in' ? (i * 0.6) / speed : 0, type: 'spring', stiffness: 170, damping: 17 }}>
      {state === 'win' && <div className="aw-ribbon">{mine ? 'YOURS!' : 'WINNER'}</div>}
      <div style={{ display: 'grid', placeItems: 'center' }}><Avatar g={g} n={n} size={state === 'win' ? 104 : 84} /></div>
      <div className="b" style={{ marginTop: 8, fontSize: state === 'win' ? 18 : 15, lineHeight: 1.2 }}>{n.name}</div>
      <div className="row" style={{ justifyContent: 'center', gap: 6, marginTop: 4 }}>{team && <TeamLogo team={team} size={16} />}<span className="tiny muted">{n.sub ?? team?.school}</span></div>
      <div className="small" style={{ marginTop: 6, color: 'var(--gold)' }}>{n.line}</div>
    </motion.div>
  );
}

function CategoryScene({ g, c, phase, mine, speed }: { g: GameState; c: AwardCategory; phase: 'noms' | 'env' | 'win'; mine: boolean; speed: number }) {
  const w = c.nominees[c.winner];
  const team = g.teams[w.teamId];
  return (
    <div className="ss-center" style={{ position: 'relative' }}>
      {phase === 'win' && <Confetti colors={team ? [team.colors[0], team.colors[1], '#f6c94c', '#ffffff'] : ['#f6c94c', '#fff']} count={mine ? 260 : 120} duration={4200} />}
      <div className="ss-eyebrow aw-eyebrow">{c.icon} {c.title}</div>
      <div className="aw-env-row">
        {phase === 'env' && (
          <motion.div className="aw-envelope" initial={{ y: -30, opacity: 0, rotate: -6 }} animate={{ y: 0, opacity: 1, rotate: [0, -3, 3, -2, 2, 0] }} transition={{ duration: 1.2 }}>
            <span>✉️</span><div className="small b">And the award goes to…</div>
          </motion.div>
        )}
        {phase === 'win' && (
          <motion.div className="aw-winner-line" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 14 }}>
            {mine ? (w.kind === 'coach' ? 'THAT’S YOU, COACH!' : `${team?.school.toUpperCase()}!`) : w.name.toUpperCase()}
          </motion.div>
        )}
      </div>
      <div className="aw-noms">
        {c.nominees.map((n, i) => <NomCard key={n.id + i} g={g} n={n} i={i} speed={speed} mine={mine && i === c.winner} state={phase === 'noms' ? 'in' : phase === 'env' ? 'wait' : i === c.winner ? 'win' : 'lose'} />)}
      </div>
    </div>
  );
}

function AllAmerica({ g, show, shown, rest, uid }: { g: GameState; show: AwardsShowData; shown: number; rest: boolean; uid: string }) {
  return (
    <div className="ss-center">
      <div className="ss-eyebrow aw-eyebrow">🇺🇸 Consensus All-America</div>
      <div className="ss-h aw-h">First Team</div>
      <div className="aw-noms five" style={{ marginTop: 16 }}>
        {show.allAmerica.first.map((n, i) => i < shown ? (
          <motion.div key={n.id} className={`aw-nom ${n.teamId === uid ? 'win' : 'in'}`} style={{ ['--acc' as string]: g.teams[n.teamId] ? teamAccent(g.teams[n.teamId].colors) : '#f6c94c' }} initial={{ opacity: 0, y: 30, rotateX: 60 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ type: 'spring', stiffness: 170, damping: 16 }}>
            {n.teamId === uid && <div className="aw-ribbon">YOURS!</div>}
            <div style={{ display: 'grid', placeItems: 'center' }}><Avatar g={g} n={n} size={78} /></div>
            <div className="b small" style={{ marginTop: 6 }}>{n.name}</div>
            <div className="row" style={{ justifyContent: 'center', gap: 5, marginTop: 3 }}>{g.teams[n.teamId] && <TeamLogo team={g.teams[n.teamId]} size={14} />}<span className="tiny muted">{g.teams[n.teamId]?.school}</span></div>
            <div className="tiny" style={{ marginTop: 5, color: 'var(--gold)' }}>{n.line}</div>
          </motion.div>
        ) : <div key={i} className="aw-nom ghost">?</div>)}
      </div>
      {rest && (
        <motion.div className="grid g2" style={{ gap: 18, marginTop: 20, textAlign: 'left' }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {([['Second Team', show.allAmerica.second], ['Third Team', show.allAmerica.third]] as const).map(([label, list]) => (
            <div key={label} className="aw-list">
              <div className="eyebrow" style={{ marginBottom: 6 }}>{label}</div>
              {list.map((n) => <div key={n.id} className={`row small ${n.teamId === uid ? 'aw-mine' : ''}`} style={{ gap: 8, padding: '3px 0' }}>{g.teams[n.teamId] && <TeamLogo team={g.teams[n.teamId]} size={16} />}<b>{n.name}</b><span className="muted">{g.teams[n.teamId]?.school}</span></div>)}
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

function HofTitle({ season, n }: { season: number; n: number }) {
  return (
    <motion.div className="ss-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div style={{ fontSize: 70 }} initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 12 }}>🏛️</motion.div>
      <div className="ss-eyebrow aw-eyebrow">Enshrinement</div>
      <div className="ss-h aw-h">Hall of Fame · Class of {season + 1}</div>
      <div className="ss-sub">{n} new member{n === 1 ? '' : 's'} take their place among the greats.</div>
    </motion.div>
  );
}

export function Plaque({ g, h, big }: { g: GameState; h: HofInductee; big?: boolean }) {
  const team = g.teams[h.teamId];
  const legend = h.id.startsWith('legend:');
  return (
    <div className={`aw-plaque ${big ? 'big' : ''}`}>
      <div style={{ display: 'grid', placeItems: 'center' }}>
        {h.kind === 'coach' ? <CoachFace c={{ id: h.id, age: h.age ?? 65, face: g.coaches[h.id]?.face }} size={big ? 110 : 64} team={team} />
          : legend && team ? <Jersey team={team} num={h.num ?? 0} size={big ? 96 : 56} />
            : <PlayerFace p={{ id: h.id, num: h.num ?? 0, injury: null } as unknown as Player} size={big ? 110 : 64} team={team} />}
      </div>
      <div className="aw-plaque-name" style={{ fontSize: big ? 26 : 16 }}>{h.name}</div>
      <div className="row" style={{ justifyContent: 'center', gap: 6 }}>{team && <TeamLogo team={team} size={big ? 20 : 14} />}<span className="tiny">{team?.school}{h.years ? ` · ${h.years}` : ''}{h.kind === 'coach' ? ' · Coach' : h.pos ? ` · ${h.pos}` : ''}</span></div>
      <div className={big ? 'small' : 'tiny'} style={{ marginTop: 6, opacity: 0.85, lineHeight: 1.35 }}>{h.line}</div>
    </div>
  );
}

function HofPlaque({ g, h }: { g: GameState; h: HofInductee }) {
  return (
    <motion.div className="ss-center" style={{ display: 'grid', placeItems: 'center' }} initial={{ opacity: 0, y: 40, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 150, damping: 16 }}>
      <div className="ss-eyebrow aw-eyebrow" style={{ marginBottom: 12 }}>Inducted into the Hall of Fame</div>
      <Plaque g={g} h={h} big />
    </motion.div>
  );
}

function Final({ g, show, onDone, onHof }: { g: GameState; show: AwardsShowData; onDone: () => void; onHof: () => void }) {
  const haul = userHaul(g, show);
  const me = useMemo(() => coachSummaries(g).find((c) => c.isUser), [g]);
  const pace = me ? Math.min(1, Math.max(me.score / HOF_COACH_SCORE, me.careerW / HOF_COACH_WINS)) : 0;
  return (
    <motion.div className="ss-center" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} style={{ maxHeight: '100%', overflow: 'auto' }}>
      <div className="ss-eyebrow aw-eyebrow">{seasonLabel(show.season)} · The winners</div>
      <div className="aw-final-grid">
        {show.categories.map((c) => {
          const w = c.nominees[c.winner];
          const t = g.teams[w.teamId];
          return (
            <div key={c.key} className={`aw-final-cell ${w.teamId === g.user.teamId || w.id === g.user.coachId ? 'mine' : ''}`}>
              <span style={{ fontSize: 22 }}>{c.icon}</span>
              <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                <div className="tiny muted upper" style={{ letterSpacing: '.08em' }}>{c.title}</div>
                <div className="small b ellipsis">{w.name}</div>
              </div>
              {t && <TeamLogo team={t} size={22} />}
            </div>
          );
        })}
      </div>
      <div className="grid g2" style={{ gap: 14, marginTop: 16, textAlign: 'left' }}>
        <div className="aw-list">
          <div className="eyebrow" style={{ marginBottom: 6 }}>Your night</div>
          {haul.length ? haul.map((x) => <div key={x} className="small" style={{ padding: '2px 0' }}>🏅 {x}</div>) : <div className="small muted">Shut out this year. There's always next season.</div>}
        </div>
        <div className="aw-list">
          <div className="eyebrow" style={{ marginBottom: 6 }}>Your Hall of Fame pace</div>
          {me && <>
            <div className="small">Legacy <b>{me.score}</b> / {HOF_COACH_SCORE} · Career wins <b>{me.careerW}</b> / {HOF_COACH_WINS}</div>
            <div className="heat-bar" style={{ width: '100%', height: 8, marginTop: 8 }}><i style={{ width: `${Math.max(3, pace * 100)}%`, background: 'linear-gradient(90deg,#8a6d3b,#f6c94c)' }} /></div>
            <div className="tiny muted" style={{ marginTop: 6 }}>{pace >= 1 ? 'You’ve done enough. Your plaque is waiting when you hang it up.' : pace >= 0.6 ? 'On the doorstep. A deep March run or two gets you there.' : 'A long way to go. Titles move the needle fastest.'}</div>
          </>}
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'center', gap: 10, marginTop: 18 }}>
        <button className="btn" onClick={onHof}>🏛️ Hall of Fame</button>
        <button className="btn gold lg" onClick={onDone}>Continue</button>
      </div>
    </motion.div>
  );
}
