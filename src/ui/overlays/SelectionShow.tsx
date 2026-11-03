import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { TeamLogo, PersonFace, Confetti } from '../components/common';
import { selectionShowData } from '../../engine/postseason';
import { seasonLabel } from '../../engine/calendar';
import type { BracketGame, GameState, Team } from '../../engine/types';
import { mix, teamAccent } from '../color';
import { sfx } from '../sound';

type Step =
  | { k: 'intro'; d: number }
  | { k: 'onesTitle'; d: number }
  | { k: 'one'; i: number; d: number }
  | { k: 'region'; r: number; i: number; d: number }
  | { k: 'userHit'; r: number; d: number }
  | { k: 'ff'; i: number; d: number }
  | { k: 'lastIn'; d: number }
  | { k: 'out'; d: number }
  | { k: 'final'; d: number };

const SPEEDS = [1, 2, 4];
const HOSTS = [
  { name: 'Dana Whitfield', role: 'Host' },
  { name: 'Coach Vic Moreno', role: 'Analyst' },
  { name: 'Bracket Brad', role: 'Bracketologist' },
];
const REGION_TINT: Record<string, string> = { East: '#4da3ff', West: '#f6c94c', South: '#ff6b6b', Midwest: '#22d38f' };

function readSpeed(): number {
  try { const v = Number(localStorage.getItem('cd.showSpeed')); return SPEEDS.includes(v) ? v : 1; } catch { return 1; }
}
function saveSpeed(v: number) {
  try { localStorage.setItem('cd.showSpeed', String(v)); } catch { /* storage unavailable */ }
}

interface Row { game: BracketGame; idx: number; ffA?: BracketGame; ffB?: BracketGame }

export function SelectionShow({ g, onDone, onBracket }: { g: GameState; onDone: () => void; onBracket: () => void }) {
  const b = g.ncaa;
  const data = useMemo(() => selectionShowData(g), [g]);
  const uid = g.user.teamId;
  const user = g.teams[uid];

  const model = useMemo(() => {
    if (!b || !data) return null;
    const r64 = b.rounds[1];
    const ff = b.rounds[0];
    const regions = (b.regions ?? ['East', 'West', 'South', 'Midwest']).map((name) => {
      const rows: Row[] = r64.map((game, idx) => ({ game, idx })).filter((x) => x.game.region === name).sort((a, c) => a.game.slot - c.game.slot)
        .map((row) => ({ ...row, ffA: ff.find((f) => f.feed && f.feed[0] === row.idx && f.feed[1] === 0), ffB: ff.find((f) => f.feed && f.feed[0] === row.idx && f.feed[1] === 1) }));
      return { name, rows };
    });
    const rowHas = (row: Row, id: string) => row.game.teams.includes(id) || !!row.ffA?.teams.includes(id) || !!row.ffB?.teams.includes(id);
    const userRegion = regions.findIndex((r) => r.rows.some((row) => rowHas(row, uid)));
    const order = regions.map((_, i) => i).filter((i) => i !== userRegion);
    if (userRegion >= 0) order.push(userRegion); // save the user's region for last
    const steps: Step[] = [{ k: 'intro', d: 3000 }, { k: 'onesTitle', d: 1500 }];
    data.overall.slice(0, 4).forEach((_, i) => steps.push({ k: 'one', i, d: 1400 }));
    for (const r of order) {
      steps.push({ k: 'region', r, i: -1, d: 1500 });
      regions[r].rows.forEach((row, i) => {
        steps.push({ k: 'region', r, i, d: 700 });
        if (rowHas(row, uid)) steps.push({ k: 'userHit', r, d: 4200 });
      });
    }
    ff.forEach((_, i) => steps.push({ k: 'ff', i, d: 1000 }));
    steps.push({ k: 'lastIn', d: 3400 }, { k: 'out', d: 3400 }, { k: 'final', d: Infinity });
    const userRow = userRegion >= 0 ? regions[userRegion].rows.find((row) => rowHas(row, uid)) : undefined;
    return { regions, steps, userRegion, userRow, ff };
  }, [b, data, uid]);

  const [idx, setIdx] = useState(0);
  const [speed, setSpeed] = useState(readSpeed);
  const [paused, setPaused] = useState(false);
  const steps = model?.steps ?? [];
  const step = steps[Math.min(idx, steps.length - 1)];
  const finalIdx = steps.length - 1;

  const next = useCallback(() => setIdx((i) => Math.min(i + 1, finalIdx)), [finalIdx]);
  const skip = useCallback(() => setIdx(finalIdx), [finalIdx]);

  useEffect(() => {
    if (!step || paused || !Number.isFinite(step.d)) return;
    const t = setTimeout(next, step.d / speed);
    return () => clearTimeout(t);
  }, [idx, step, speed, paused, next]);

  // sound design
  const inField = b?.seeds[uid] != null;
  useEffect(() => {
    if (!step) return;
    const quiet = speed >= 4;
    switch (step.k) {
      case 'intro': sfx.crowd(0.6); break;
      case 'onesTitle': sfx.drum(); break;
      case 'one': if (!quiet) sfx.whoosh(); break;
      case 'region': if (step.i < 0) sfx.drum(); else if (speed <= 2) sfx.swish(); break;
      case 'userHit': sfx.fanfare(); sfx.crowd(1.5); break;
      case 'ff': if (!quiet) sfx.whoosh(); break;
      case 'lastIn': sfx.drum(); break;
      case 'out': if (data?.firstOut.includes(uid) || data?.nextOut.includes(uid)) sfx.rim(); else if (!quiet) sfx.whoosh(); break;
      case 'final': if (inField) sfx.crowd(0.9); break;
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

  if (!b || !data || !model || !step) {
    return (
      <div className="ss-root"><div className="ss-center"><div className="h2">The bracket isn't out yet.</div><button className="btn primary" style={{ marginTop: 14 }} onClick={onDone}>Close</button></div></div>
    );
  }

  const rec = (t: Team) => `${t.record.w}-${t.record.l}`;
  const userSeed = b.seeds[uid];
  const hitIdx = steps.findIndex((s) => s.k === 'userHit');
  const outIdx = steps.findIndex((s) => s.k === 'out');
  const relevant = inField || data.firstOut.includes(uid) || data.nextOut.includes(uid) || g.user.expectationLevel >= 3;
  const revealedIn = inField && hitIdx >= 0 && idx >= hitIdx;
  const revealedOut = !inField && idx >= outIdx;
  const regionsDone = new Set(model.regions.map((_, r) => r).filter((r) => {
    const last = steps.reduce((acc, s, i) => (s.k === 'region' && s.r === r ? i : acc), -1);
    return idx > last;
  }));
  const userRegionName = model.userRegion >= 0 ? model.regions[model.userRegion].name : '';
  const progress = Math.min(1, idx / Math.max(1, finalIdx));
  const segLabel = step.k === 'intro' ? 'Cold open' : step.k === 'onesTitle' || step.k === 'one' ? 'No. 1 seeds' : step.k === 'region' || step.k === 'userHit' ? `${model.regions[step.r].name} Region` : step.k === 'ff' ? 'First Four' : step.k === 'lastIn' || step.k === 'out' ? 'The bubble' : 'Your result';

  return (
    <div className="ss-root">
      <div className="ss-bg" />
      <div className="ss-sweep" />
      {/* HUD */}
      <div className="ss-hud">
        <div className="row" style={{ gap: 10 }}>
          <span className="ss-bug">COURTSIDE <b>SELECTION SUNDAY</b></span>
          <span className="pill bad pulse">● LIVE</span>
          <span className="tiny muted upper b" style={{ letterSpacing: '.14em' }}>{segLabel}</span>
        </div>
        <div className="spacer" />
        {relevant && (
          <div className={`ss-status ${revealedIn ? 'in' : revealedOut ? 'out' : ''}`}>
            <TeamLogo team={user} size={20} />
            {revealedIn ? <span><b>{user.school}</b>: No. {userSeed} seed{userRegionName ? `, ${userRegionName}` : ''}</span>
              : revealedOut ? <span><b>{user.school}</b> is out</span>
                : <span>Waiting on <b>{user.school}</b>…</span>}
          </div>
        )}
        <div className="ss-controls">
          <div className="seg">
            {SPEEDS.map((s) => <button key={s} className={speed === s ? 'on' : ''} onClick={() => { setSpeed(s); saveSpeed(s); }}>{s}×</button>)}
          </div>
          {step.k !== 'final' && (
            <>
              <button className="btn sm" title={paused ? 'Resume (Space)' : 'Pause (Space)'} onClick={() => setPaused((p) => !p)} style={{ minWidth: 70 }}>{paused ? '▶ Play' : '❚❚ Pause'}</button>
              <button className="btn sm" title="Next (→)" onClick={next}>Next ›</button>
              <button className="btn sm primary" title="Skip to the end (Esc)" onClick={skip}>Skip ⏭</button>
            </>
          )}
        </div>
      </div>
      <div className="ss-progress"><motion.i animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.4 }} /></div>
      <div className="ss-regions-mini">
        {model.regions.map((r, i) => <span key={r.name} className={`ss-mini ${regionsDone.has(i) ? 'done' : step.k === 'region' && step.r === i ? 'now' : ''}`} style={{ ['--tint' as string]: REGION_TINT[r.name] ?? '#fff' }}>{r.name}{regionsDone.has(i) ? ' ✓' : ''}</span>)}
      </div>

      {/* Stage */}
      <div className="ss-stage">
        <>
          {step.k === 'intro' && <Intro key="intro" g={g} />}
          {(step.k === 'onesTitle' || step.k === 'one') && <Ones key="ones" g={g} ids={data.overall} shown={step.k === 'one' ? step.i + 1 : 0} rec={rec} regionOf={(id) => model.regions.find((r) => r.rows.some((row) => row.game.teams.includes(id)))?.name ?? ''} />}
          {(step.k === 'region' || step.k === 'userHit') && (
            <RegionScene key={`region-${step.r}`} g={g} name={model.regions[step.r].name} rows={model.regions[step.r].rows} shown={step.k === 'region' ? step.i + 1 : 8} uid={uid} auto={data.auto} rec={rec} />
          )}
          {step.k === 'ff' && <FirstFour key="ff" g={g} games={model.ff} shown={step.i + 1} uid={uid} rec={rec} />}
          {step.k === 'lastIn' && <Bubble key="lastIn" g={g} title="Last Four In" sub="The final at-large teams in the field" ids={data.lastIn} tone="in" uid={uid} rec={rec} />}
          {step.k === 'out' && <Bubble key="out" g={g} title="First Four Out" sub="So close. Their season continues elsewhere." ids={data.firstOut} tone="out" uid={uid} rec={rec} next={data.nextOut} />}
          {step.k === 'final' && <Final key="final" g={g} data={data} userRow={model.userRow} inField={inField} relevant={relevant} rec={rec} onDone={onDone} onBracket={onBracket} region={userRegionName} />}
        </>
        {step.k === 'userHit' && <UserHit key="hit" g={g} row={model.userRow} region={userRegionName} rec={rec} />}
      </div>
      {paused && <div className="ss-paused">❚❚ Paused · press Space or Play to resume</div>}
    </div>
  );
}

// ---------------- Scenes ----------------
function Intro({ g }: { g: GameState }) {
  const title = 'SELECTION SUNDAY';
  return (
    <motion.div className="ss-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
      <motion.div className="ss-eyebrow" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>{seasonLabel(g.season)} NCAA Tournament</motion.div>
      <div className="ss-title">
        {title.split('').map((ch, i) => (
          <motion.span key={i} initial={{ opacity: 0, y: 40, rotateX: -90 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ delay: 0.3 + i * 0.045, type: 'spring', stiffness: 260, damping: 18 }}>{ch === ' ' ? ' ' : ch}</motion.span>
        ))}
      </div>
      <motion.div className="ss-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>Sixty-eight teams. One bracket. Let's reveal the field.</motion.div>
      <div className="row" style={{ gap: 26, marginTop: 30, justifyContent: 'center' }}>
        {HOSTS.map((h, i) => (
          <motion.div key={h.name} style={{ textAlign: 'center' }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4 + i * 0.15 }}>
            <PersonFace seed={h.name} size={70} role="staff" />
            <div className="small b" style={{ marginTop: 6 }}>{h.name}</div>
            <div className="tiny muted">{h.role}</div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function Ones({ g, ids, shown, rec, regionOf }: { g: GameState; ids: string[]; shown: number; rec: (t: Team) => string; regionOf: (id: string) => string }) {
  return (
    <motion.div className="ss-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -20 }}>
      <motion.div className="ss-h" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>The No. 1 Seeds</motion.div>
      <div className="ss-ones">
        {ids.slice(0, 4).map((id, i) => {
          const t = g.teams[id];
          const on = i < shown;
          return (
            <div key={id} className={`ss-one ${on ? 'on' : ''}`} style={{ ['--c' as string]: teamAccent(t.colors) }}>
              {on ? (
                <motion.div initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 180, damping: 16 }} style={{ textAlign: 'center' }}>
                  <div style={{ height: 26, marginBottom: 8 }}>{i === 0 && <span className="pill gold">Overall No. 1</span>}</div>
                  <TeamLogo team={t} size={96} />
                  <div className="h3" style={{ marginTop: 10 }}>{t.school}</div>
                  <div className="tiny muted">{rec(t)} · {regionOf(id)} Region</div>
                </motion.div>
              ) : <div className="ss-q">?</div>}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function TeamLine({ g, id, seed, auto, uid, rec, label }: { g: GameState; id: string | null; seed: number | null; auto: string[]; uid: string; rec: (t: Team) => string; label?: string }) {
  const t = id ? g.teams[id] : undefined;
  const me = id === uid;
  return (
    <div className={`ss-line ${me ? 'me' : ''}`}>
      <span className="ss-seed">{seed ?? ''}</span>
      {t ? <TeamLogo team={t} size={26} /> : <span style={{ width: 26 }} />}
      <span className="ss-name ellipsis">{t ? t.school : label ?? 'TBD'}</span>
      {t && auto.includes(t.id) && <span className="ss-aq" title="Automatic bid: conference champion">AQ</span>}
      {t && <span className="ss-rec">{rec(t)}</span>}
    </div>
  );
}

function RegionScene({ g, name, rows, shown, uid, auto, rec }: { g: GameState; name: string; rows: Row[]; shown: number; uid: string; auto: string[]; rec: (t: Team) => string }) {
  const tint = REGION_TINT[name] ?? '#fff';
  const card = (row: Row, i: number) => {
    const on = i < shown;
    const [sa, sb] = row.game.seeds;
    const ffLabel = (f?: BracketGame) => (f ? `First Four: ${f.teams.map((x) => (x ? g.teams[x].abbr : '?')).join(' / ')}` : undefined);
    const hasMe = row.game.teams.includes(uid) || !!row.ffA?.teams.includes(uid) || !!row.ffB?.teams.includes(uid);
    return (
      <div key={row.game.id} className={`ss-match ${on ? 'on' : ''} ${on && hasMe ? 'me' : ''}`}>
        {on ? (
          <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
            <TeamLine g={g} id={row.game.teams[0]} seed={sa} auto={auto} uid={uid} rec={rec} label={ffLabel(row.ffA)} />
            <TeamLine g={g} id={row.game.teams[1]} seed={sb} auto={auto} uid={uid} rec={rec} label={ffLabel(row.ffB)} />
          </motion.div>
        ) : (
          <div className="ss-placeholder"><span>{sa}</span><span className="dim">vs</span><span>{sb}</span></div>
        )}
      </div>
    );
  };
  return (
    <motion.div className="ss-region" initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -60 }} transition={{ type: 'spring', stiffness: 160, damping: 22 }} style={{ ['--tint' as string]: tint }}>
      <div className="ss-region-head">
        <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.5 }} className="ss-region-bar" />
        <div className="ss-region-name">{name.toUpperCase()}</div>
        <div className="tiny muted upper b" style={{ letterSpacing: '.2em' }}>Region</div>
      </div>
      <div className="ss-region-grid">
        <div className="col" style={{ gap: 10 }}>{rows.slice(0, 4).map((row, i) => card(row, i))}</div>
        <div className="col" style={{ gap: 10 }}>{rows.slice(4, 8).map((row, i) => card(row, i + 4))}</div>
      </div>
    </motion.div>
  );
}

function UserHit({ g, row, region, rec }: { g: GameState; row?: Row; region: string; rec: (t: Team) => string }) {
  const uid = g.user.teamId;
  const t = g.teams[uid];
  const seed = g.ncaa?.seeds[uid];
  let opp: string | null | undefined = row?.game.teams.find((x) => x && x !== uid);
  const inFF = row && (row.ffA?.teams.includes(uid) || row.ffB?.teams.includes(uid));
  if (inFF) opp = (row.ffA?.teams.includes(uid) ? row.ffA : row.ffB)?.teams.find((x) => x && x !== uid);
  const o = opp ? g.teams[opp] : undefined;
  return (
    <motion.div className="ss-hit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ background: `radial-gradient(800px 500px at 50% 45%, ${mix(t.colors[0], '#000', 0.25)}ee, rgba(3,5,10,.92))` }}>
      <Confetti colors={[t.colors[0], t.colors[1], '#ffffff']} count={180} />
      <motion.div initial={{ scale: 0.3, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }}>
        <TeamLogo team={t} size={170} />
      </motion.div>
      <motion.div className="ss-hit-title" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 }}>{t.school.toUpperCase()} IS DANCING!</motion.div>
      <motion.div className="h2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>No. {seed} seed · {region} Region{inFF ? ' · First Four' : ''}</motion.div>
      {o && (
        <motion.div className="row" style={{ gap: 10, marginTop: 14, justifyContent: 'center' }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
          <span className="muted">{inFF ? 'First Four vs' : 'First up:'}</span><TeamLogo team={o} size={34} /><b>{o.school}</b><span className="muted">({rec(o)})</span>
        </motion.div>
      )}
    </motion.div>
  );
}

function FirstFour({ g, games, shown, uid, rec }: { g: GameState; games: BracketGame[]; shown: number; uid: string; rec: (t: Team) => string }) {
  return (
    <motion.div className="ss-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -20 }}>
      <div className="ss-h">The First Four</div>
      <div className="ss-sub" style={{ marginBottom: 18 }}>Four games in Dayton. Winners join the field.</div>
      <div className="ss-ff">
        {games.map((f, i) => (
          <div key={f.id} className={`ss-match ${i < shown ? 'on' : ''} ${f.teams.includes(uid) ? 'me' : ''}`}>
            {i < shown ? (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                <div className="tiny muted upper b" style={{ letterSpacing: '.14em', marginBottom: 4 }}>{f.region} · No. {f.seeds[0]} seeds</div>
                <TeamLine g={g} id={f.teams[0]} seed={f.seeds[0]} auto={[]} uid={uid} rec={rec} />
                <TeamLine g={g} id={f.teams[1]} seed={f.seeds[1]} auto={[]} uid={uid} rec={rec} />
              </motion.div>
            ) : <div className="ss-placeholder"><span className="dim">First Four</span></div>}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function Bubble({ g, title, sub, ids, tone, uid, rec, next }: { g: GameState; title: string; sub: string; ids: string[]; tone: 'in' | 'out'; uid: string; rec: (t: Team) => string; next?: string[] }) {
  const mineOut = tone === 'out' && (ids.includes(uid) || !!next?.includes(uid));
  return (
    <motion.div className="ss-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -20 }}>
      <div className={`ss-h ${tone}`}>{title}</div>
      <div className="ss-sub" style={{ marginBottom: 20 }}>{sub}</div>
      <div className="ss-bubble">
        {ids.map((id, i) => {
          const t = g.teams[id];
          return (
            <motion.div key={id} className={`ss-bubble-team ${tone} ${id === uid ? 'me' : ''}`} initial={{ opacity: 0, y: 30, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.25 + i * 0.35, type: 'spring', stiffness: 220, damping: 18 }}>
              <TeamLogo team={t} size={64} />
              <div className="b" style={{ marginTop: 8 }}>{t.school}</div>
              <div className="tiny muted">{rec(t)}</div>
            </motion.div>
          );
        })}
      </div>
      {next && next.length > 0 && (
        <motion.div className="row" style={{ gap: 10, marginTop: 18, justifyContent: 'center' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8 }}>
          <span className="tiny muted upper b" style={{ letterSpacing: '.14em' }}>Next four out</span>
          {next.map((id) => <span key={id} className={`pill ${id === uid ? 'bad' : ''}`}><TeamLogo team={g.teams[id]} size={14} /> {g.teams[id].abbr}</span>)}
        </motion.div>
      )}
      {mineOut && <motion.div className="ss-heartbreak" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.6 }}>💔 {g.teams[uid].school} just missed the cut.</motion.div>}
    </motion.div>
  );
}

function Final({ g, data, userRow, inField, relevant, rec, onDone, onBracket, region }: {
  g: GameState; data: NonNullable<ReturnType<typeof selectionShowData>>; userRow?: Row; inField: boolean; relevant: boolean; rec: (t: Team) => string; onDone: () => void; onBracket: () => void; region: string;
}) {
  const uid = g.user.teamId;
  const t = g.teams[uid];
  const b = g.ncaa!;
  const seed = b.seeds[uid];
  // first opponent and likely second-round opponent
  let opp: string | null | undefined = userRow?.game.teams.find((x) => x && x !== uid);
  const ffGame = userRow && (userRow.ffA?.teams.includes(uid) ? userRow.ffA : userRow.ffB?.teams.includes(uid) ? userRow.ffB : undefined);
  if (ffGame) opp = ffGame.teams.find((x) => x && x !== uid);
  let r2: string | null = null;
  if (userRow && !ffGame) {
    const pair = b.rounds[1][userRow.idx ^ 1];
    const cands = pair?.teams.filter((x): x is string => !!x) ?? [];
    r2 = cands.sort((a, c) => (b.seeds[a] ?? 99) - (b.seeds[c] ?? 99))[0] ?? null;
  }
  const confBids: Record<string, number> = {};
  for (const id of Object.keys(b.seeds)) { const c = g.teams[id].conf; confBids[c] = (confBids[c] ?? 0) + 1; }
  const topConfs = Object.entries(confBids).sort((a, c) => c[1] - a[1]).slice(0, 3);
  const confName = (id: string) => g.conferences.find((c) => c.id === id)?.short ?? id;
  const close = data.firstOut.includes(uid) ? 'First Four Out' : data.nextOut.includes(uid) ? 'Next Four Out' : null;
  return (
    <motion.div className="ss-final" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <div className="ss-final-card" style={{ background: `linear-gradient(135deg, ${mix(t.colors[0], '#000', inField ? 0.35 : 0.7)}, rgba(10,14,24,.95) 70%)` }}>
        {inField && <Confetti colors={[t.colors[0], t.colors[1], '#ffffff']} count={90} duration={3200} />}
        <div className="row" style={{ gap: 22, alignItems: 'center' }}>
          <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }}><TeamLogo team={t} size={120} /></motion.div>
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ color: 'rgba(255,255,255,.75)' }}>{t.school} · {rec(t)}</div>
            {inField ? (
              <>
                <div className="ss-final-title">No. {seed} seed · {region}</div>
                {opp && <div className="row" style={{ gap: 8, marginTop: 8 }}><span className="muted">{ffGame ? 'First Four vs' : 'First round vs'}</span><TeamLogo team={g.teams[opp]} size={26} /><b>No. {b.seeds[opp]} {g.teams[opp].school}</b><span className="muted">({rec(g.teams[opp])})</span></div>}
                {r2 && <div className="row tiny muted" style={{ gap: 6, marginTop: 6 }}>Likely second round: <TeamLogo team={g.teams[r2]} size={16} /> No. {b.seeds[r2]} {g.teams[r2].school}</div>}
              </>
            ) : (
              <>
                <div className="ss-final-title">{relevant ? 'Left out of the field' : 'Not this year'}</div>
                <div className="muted" style={{ marginTop: 6 }}>{close ? `${close}. So close.` : relevant ? 'The committee passed on your résumé.' : `${rec(t)} wasn't enough this season. Next year starts now.`}</div>
              </>
            )}
          </div>
        </div>
        <div className="divider" />
        <div className="row wrap" style={{ gap: 18 }}>
          <div>
            <div className="tiny muted upper b" style={{ letterSpacing: '.14em', marginBottom: 6 }}>No. 1 seeds</div>
            <div className="row" style={{ gap: 8 }}>{data.overall.slice(0, 4).map((id) => <span key={id} className="pill" title={g.teams[id].school}><TeamLogo team={g.teams[id]} size={16} /> {g.teams[id].abbr}</span>)}</div>
          </div>
          <div>
            <div className="tiny muted upper b" style={{ letterSpacing: '.14em', marginBottom: 6 }}>Most bids</div>
            <div className="row" style={{ gap: 8 }}>{topConfs.map(([c, n]) => <span key={c} className="pill">{confName(c)} · {n}</span>)}</div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 18, gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onBracket}>View the Bracket →</button>
          <button className="btn primary lg" onClick={onDone}>Continue</button>
        </div>
      </div>
    </motion.div>
  );
}
