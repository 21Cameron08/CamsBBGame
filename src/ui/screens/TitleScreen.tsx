import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '../../store/gameStore';
import { TeamLogo, Stars, GeneratedBadge, fmtMoneyShort } from '../components/common';
import { Face, FACE_EDITOR_FIELDS, randomizeFace, cycleFaceField, type FaceConfig } from '../face';
import { TEAMS } from '../../data/teams';
import { loreOf } from '../../data/lore';
import { CONFERENCES } from '../../data/conferences';
import type { TeamDef } from '../../data/types';
import type { CoachArchetype, Settings } from '../../engine/types';
import { ARCHETYPE_INFO, SKILL_INFO } from '../../engine/coach';
import { nilBudgetFor } from '../../engine/team';
import { readJsonFile, validateSave } from '../../store/persistence';
import { teamAccent, textOn } from '../color';
import { Ball } from '../shell/Feedback';
import { sfx } from '../sound';
import type { GameState } from '../../engine/types';
import { REALIGN_INFO } from '../../engine/realignment';
import type { RealignMode } from '../../engine/types';
import { CloudSaves } from '../components/CloudSaves';

export function TitleScreen() {
  const [mode, setMode] = useState<'title' | 'new'>('title');
  return (
    <div style={{ position: 'relative', zIndex: 2, height: '100vh', overflow: 'auto' }}>
      <>
        {mode === 'title' ? <Title key="t" onNew={() => setMode('new')} /> : <NewDynasty key="n" onBack={() => setMode('title')} />}
      </>
    </div>
  );
}

function Title({ onNew }: { onNew: () => void }) {
  const saves = useGame((s) => s.saves);
  const load = useGame((s) => s.load);
  const loadState = useGame((s) => s.loadState);
  const del = useGame((s) => s.deleteSave);
  const toast = useGame((s) => s.toast);
  const [cloud, setCloud] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const showcase = useMemo(() => {
    const ids = ['duke', 'kentucky', 'kansas', 'north-carolina', 'uconn', 'ucla', 'gonzaga', 'houston', 'michigan-state', 'villanova', 'arizona', 'indiana', 'purdue', 'florida', 'auburn', 'baylor'];
    return ids.map((id) => TEAMS.find((t) => t.id === id)).filter(Boolean) as TeamDef[];
  }, []);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -20 }} style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 30 }}>
      <TitleBackdrop teams={showcase} />
      <div style={{ width: 'min(1060px, 100%)', position: 'relative' }}>
        <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1, type: 'spring', stiffness: 120, damping: 18 }} style={{ textAlign: 'center', marginBottom: 34 }}>
          <motion.div animate={{ y: [0, -14, 0], rotate: [0, 40, 0] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }} style={{ display: 'inline-block', marginBottom: 10 }}>
            <Ball size={70} />
          </motion.div>
          <div className="eyebrow" style={{ letterSpacing: '.5em', color: '#f6a35e' }}>2026–27 · Division I</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(54px, 9vw, 112px)', fontWeight: 900, lineHeight: 0.88, margin: '10px 0 0', letterSpacing: '0.01em', textTransform: 'uppercase', background: 'linear-gradient(180deg, #fff 30%, #ffb27a 100%)', WebkitBackgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 10px 40px rgba(240,122,36,.35))' }}>
            Courtside<br />Dynasty
          </h1>
          <div className="muted" style={{ fontSize: 17, marginTop: 14 }}>Modern college basketball. NIL. The portal. Press conferences. One shining moment.</div>
        </motion.div>
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="row" style={{ justifyContent: 'center', gap: 14, marginBottom: 34 }}>
          <button className="btn primary xl" style={{ '--accent': '#f07a24', '--accent-ink': '#fff' } as React.CSSProperties} onClick={() => { sfx.whoosh(); onNew(); }}>New Dynasty</button>
          {saves[0] && <button className="btn xl" onClick={() => void load(saves[0].id)}>Continue</button>}
          <button className="btn xl" onClick={() => fileRef.current?.click()}>Import Save</button>
          <button className="btn xl" onClick={() => setCloud(!cloud)}>☁️ Cloud Saves</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const data = await readJsonFile<GameState>(f);
              if (!validateSave(data)) throw new Error('bad');
              await loadState(data);
            } catch { toast('Could not read that save file.', 'bad'); }
            e.target.value = '';
          }} />
        </motion.div>
        {cloud && (
          <motion.div className="card" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 24, padding: 18 }}>
            <div className="h3" style={{ marginBottom: 10 }}>☁️ Cloud Saves</div>
            <CloudSaves />
          </motion.div>
        )}
        {saves.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}>
            <div className="eyebrow" style={{ marginBottom: 10, textAlign: 'center' }}>Your Dynasties</div>
            <div className="grid g3">
              {saves.map((s, i) => (
                <motion.div key={s.id} className="card hover" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.05 }} onClick={() => void load(s.id)} style={{ overflow: 'hidden' }}>
                  <div className="stripe" style={{ background: s.colors[0] }} />
                  <div className="row">
                    <TeamLogo team={{ id: s.teamId, abbr: s.school.slice(0, 4).toUpperCase(), colors: s.colors }} size={44} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="b ellipsis">{s.name}</div>
                      <div className="small muted ellipsis">{s.school} · Coach {s.coach.split(' ').slice(-1)}</div>
                      <div className="tiny dim">{s.season} · {s.record} · {new Date(s.updatedAt).toLocaleDateString()}</div>
                    </div>
                    <button className="btn ghost sm" title="Delete save" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${s.name}"? This cannot be undone.`)) void del(s.id); }}>🗑</button>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function TitleBackdrop({ teams }: { teams: TeamDef[] }) {
  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(900px 500px at 50% 0%, rgba(240,122,36,.28), transparent 70%)' }} />
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.08 }} preserveAspectRatio="xMidYMid slice" viewBox="0 0 940 500">
        <g fill="none" stroke="#fff" strokeWidth="2">
          <rect x="10" y="10" width="920" height="480" />
          <line x1="470" y1="10" x2="470" y2="490" />
          <circle cx="470" cy="250" r="60" />
          <path d="M10 40 H150 A210 210 0 0 1 150 460 H10" />
          <path d="M930 40 H790 A210 210 0 0 0 790 460 H930" />
          <rect x="10" y="190" width="190" height="120" />
          <rect x="740" y="190" width="190" height="120" />
        </g>
      </svg>
      {teams.map((t, i) => (
        <motion.div key={t.id} style={{ position: 'absolute', left: `${(i * 61) % 100}%`, top: `${(i * 37) % 100}%`, opacity: 0.1 }}
          animate={{ y: [0, -30, 0], rotate: [0, i % 2 ? 8 : -8, 0] }} transition={{ duration: 8 + (i % 5), repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 }}>
          <GeneratedBadge team={t} size={90} />
        </motion.div>
      ))}
    </div>
  );
}

// ================= New dynasty wizard =================
const TIERS = [
  { id: 0, label: 'All' },
  { id: 1, label: 'Power' },
  { id: 2, label: 'High Mid-Major' },
  { id: 3, label: 'Mid-Major' },
  { id: 4, label: 'Low-Major' },
];

function difficultyTag(p: number) {
  if (p >= 90) return { t: 'Blue Blood', c: 'gold', d: 'Title or bust. Every loss is a referendum.' };
  if (p >= 75) return { t: 'Power Program', c: 'accent', d: 'Expected to make deep March runs.' };
  if (p >= 55) return { t: 'Contender', c: 'blue', d: 'Bubble-to-bracket. Build momentum.' };
  if (p >= 35) return { t: 'Mid-Major', c: 'good', d: 'Win your league, bust some brackets.' };
  return { t: 'Rebuild', c: 'bad', d: 'Start from the bottom. Build a dynasty from scratch.' };
}

function NewDynasty({ onBack }: { onBack: () => void }) {
  const newGame = useGame((s) => s.newGame);
  const [step, setStep] = useState(0);
  const [first, setFirst] = useState('Cam');
  const [last, setLast] = useState('Lawson');
  const [age, setAge] = useState(38);
  const [alma, setAlma] = useState('');
  const [arch, setArch] = useState<CoachArchetype>('Recruiter');
  const [diff, setDiff] = useState<Settings['difficulty']>('pro');
  const [realign, setRealign] = useState<RealignMode>('realistic');
  const [race, setRace] = useState(true);
  const [face, setFace] = useState<FaceConfig>(() => randomizeFace({ role: 'coach', age: 38 }));
  const [teamId, setTeamId] = useState<string>('indiana');
  const [tier, setTier] = useState(0);
  const [conf, setConf] = useState('');
  const [q, setQ] = useState('');
  const team = TEAMS.find((t) => t.id === teamId)!;
  const colors = team.colors;
  const acc = teamAccent(colors);
  const style = { '--accent': acc, '--accent-ink': textOn(acc) } as React.CSSProperties;

  const list = useMemo(() => {
    return TEAMS.filter((t) => {
      const c = CONFERENCES.find((x) => x.id === t.conf);
      if (tier && c?.tier !== tier) return false;
      if (conf && t.conf !== conf) return false;
      if (q && !`${t.school} ${t.mascot} ${t.fullName}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    }).sort((a, b) => b.prestige - a.prestige);
  }, [tier, conf, q]);

  const start = async () => {
    sfx.fanfare();
    await newGame({ teamId, difficulty: diff, realignment: realign, facilityRace: race, coach: { first: first.trim() || 'Coach', last: last.trim() || 'Smith', age, archetype: arch, almaMater: alma || undefined, face: { ...face, role: 'coach', age } as unknown as Record<string, unknown> } });
  };

  return (
    <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} style={{ ...style, minHeight: '100vh', padding: '28px 34px 60px', position: 'relative' }}>
      <div style={{ position: 'fixed', inset: 0, background: `radial-gradient(900px 500px at 80% 0%, ${colors[0]}55, transparent 70%)`, pointerEvents: 'none', transition: 'background .5s' }} />
      <div className="row" style={{ marginBottom: 22, position: 'relative' }}>
        <button className="btn ghost" onClick={step === 0 ? onBack : () => setStep(step - 1)}>← Back</button>
        <div className="spacer" />
        {['Your Coach', 'Choose Your School', 'Sign the Contract'].map((l, i) => (
          <div key={l} className="row" style={{ gap: 8, opacity: i === step ? 1 : 0.45 }}>
            <span className="num" style={{ width: 26, height: 26, borderRadius: 13, display: 'grid', placeItems: 'center', background: i <= step ? 'var(--accent)' : 'rgba(255,255,255,.08)', color: i <= step ? 'var(--accent-ink)' : 'var(--muted)' }}>{i + 1}</span>
            <span className="b upper small">{l}</span>
            {i < 2 && <span className="dim" style={{ margin: '0 8px' }}>—</span>}
          </div>
        ))}
        <div className="spacer" />
      </div>
      <>
        {step === 0 && (
          <motion.div key="s0" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid" style={{ gridTemplateColumns: 'minmax(320px, 380px) 1fr', position: 'relative' }}>
            <div className="card" style={{ textAlign: 'center' }}>
              <motion.div key={JSON.stringify(face)} initial={{ scale: 0.96 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
                <Face face={face} size={240} primary={colors[0]} secondary={colors[1]} role="coach" background="card" />
              </motion.div>
              <div className="h2" style={{ marginTop: 10 }}>Coach {last || '—'}</div>
              <div className="muted small">{arch} · Age {age}</div>
              <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
                <button className="btn" onClick={() => { sfx.click(); setFace(randomizeFace({ role: 'coach', age })); }}>🎲 Randomize Face</button>
              </div>
              <div className="divider" />
              <div className="grid g2" style={{ gap: 6, textAlign: 'left' }}>
                {FACE_EDITOR_FIELDS.map((f) => (
                  <div key={f.key} className="row" style={{ gap: 4, background: 'rgba(255,255,255,.035)', borderRadius: 8, padding: '3px 4px' }}>
                    <button className="btn ghost sm" style={{ padding: '2px 7px' }} onClick={() => setFace(cycleFaceField(face, f.key, -1))}>‹</button>
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                      <div className="tiny dim upper" style={{ fontSize: 9 }}>{f.label}</div>
                      <div className="tiny b ellipsis">{f.names?.[face[f.key] as number] ?? `#${(face[f.key] as number) + 1}`}</div>
                    </div>
                    <button className="btn ghost sm" style={{ padding: '2px 7px' }} onClick={() => setFace(cycleFaceField(face, f.key, 1))}>›</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="col" style={{ gap: 16 }}>
              <div className="card">
                <div className="h3" style={{ marginBottom: 12 }}>Identity</div>
                <div className="grid g3">
                  <label className="field">First name<input className="input" value={first} onChange={(e) => setFirst(e.target.value)} maxLength={18} /></label>
                  <label className="field">Last name<input className="input" value={last} onChange={(e) => setLast(e.target.value)} maxLength={20} /></label>
                  <label className="field">Alma mater
                    <select className="select" value={alma} onChange={(e) => setAlma(e.target.value)}>
                      <option value="">— None —</option>
                      {[...TEAMS].sort((a, b) => a.school.localeCompare(b.school)).map((t) => <option key={t.id} value={t.id}>{t.school}</option>)}
                    </select>
                  </label>
                </div>
                <label className="field" style={{ marginTop: 12 }}>Age: <b style={{ color: 'var(--text)' }}>{age}</b>
                  <input type="range" min={28} max={66} value={age} onChange={(e) => setAge(+e.target.value)} />
                </label>
              </div>
              <div className="card">
                <div className="h3" style={{ marginBottom: 12 }}>Coaching Style</div>
                <div className="grid g3">
                  {(Object.keys(ARCHETYPE_INFO) as CoachArchetype[]).map((a) => {
                    const info = ARCHETYPE_INFO[a];
                    const on = a === arch;
                    return (
                      <motion.div key={a} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }} className="card" onClick={() => { sfx.click(); setArch(a); }} style={{ cursor: 'pointer', padding: 14, borderColor: on ? 'var(--accent)' : undefined, background: on ? 'color-mix(in srgb, var(--accent) 14%, var(--panel))' : undefined }}>
                        <div style={{ fontSize: 26 }}>{info.icon}</div>
                        <div className="b" style={{ marginTop: 4 }}>{a}</div>
                        <div className="tiny muted" style={{ marginTop: 4, minHeight: 34 }}>{info.desc}</div>
                        <div className="row wrap gap-s" style={{ marginTop: 8 }}>
                          {Object.entries(info.skills).map(([k, v]) => <span key={k} className="pill accent">{SKILL_INFO[k as keyof typeof SKILL_INFO].icon} +{v}</span>)}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
              <div className="card">
                <div className="h3" style={{ marginBottom: 12 }}>Difficulty</div>
                <div className="grid g3">
                  {([['rookie', 'Rookie', 'Patient AD, softer AI recruiting, no firing in your first 3 years.'], ['pro', 'Pro', 'The intended experience.'], ['legend', 'Legend', 'Cutthroat recruiting and an impatient fan base.']] as const).map(([id, l, d]) => (
                    <div key={id} className="card" onClick={() => setDiff(id)} style={{ cursor: 'pointer', padding: 14, borderColor: diff === id ? 'var(--accent)' : undefined }}>
                      <div className="b">{l}</div>
                      <div className="tiny muted">{d}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <div className="row" style={{ marginBottom: 12 }}><div className="h3" style={{ flex: 1 }}>Conference Realignment</div><span className="tiny muted">You can change this later in Settings</span></div>
                <div className="grid g3">
                  {(['off', 'realistic', 'chaos'] as RealignMode[]).map((id) => (
                    <div key={id} className="card" onClick={() => setRealign(id)} style={{ cursor: 'pointer', padding: 14, borderColor: realign === id ? 'var(--accent)' : undefined }}>
                      <div className="b">{id === 'off' ? '🔒' : id === 'realistic' ? '🗺️' : '🌪️'} {REALIGN_INFO[id].label}</div>
                      <div className="tiny muted">{REALIGN_INFO[id].desc}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <div className="row" style={{ marginBottom: 12 }}><div className="h3" style={{ flex: 1 }}>Facilities Arms Race</div><span className="tiny muted">You can change this later in Settings</span></div>
                <div className="grid g2">
                  {([[true, '🏗️ On', 'AI programs raise money and build too, and every facility ages a little each year. Stand still and rivals pass you on the recruiting trail.'], [false, '🧱 Off', 'Only you build. Everyone else keeps the facilities they started with.']] as const).map(([id, l, d]) => (
                    <div key={l} className="card" onClick={() => setRace(id)} style={{ cursor: 'pointer', padding: 14, borderColor: race === id ? 'var(--accent)' : undefined }}>
                      <div className="b">{l}</div>
                      <div className="tiny muted">{d}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="row"><div className="spacer" /><button className="btn primary lg" onClick={() => { sfx.whoosh(); setStep(1); }}>Next: Choose Your School →</button></div>
            </div>
          </motion.div>
        )}
        {step === 1 && (
          <motion.div key="s1" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid" style={{ gridTemplateColumns: '1fr 360px', position: 'relative', alignItems: 'start' }}>
            <div>
              <div className="row wrap" style={{ marginBottom: 14 }}>
                <div className="tabs">
                  {TIERS.map((t) => <button key={t.id} className={`tab ${tier === t.id ? 'active' : ''}`} onClick={() => { setTier(t.id); setConf(''); }}>{tier === t.id && <motion.div layoutId="tierbg" className="tab-bg" />}<span>{t.label}</span></button>)}
                </div>
                <select className="select" style={{ width: 220 }} value={conf} onChange={(e) => setConf(e.target.value)}>
                  <option value="">All conferences</option>
                  {CONFERENCES.filter((c) => !tier || c.tier === tier).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input className="input" style={{ width: 220 }} placeholder="Search schools…" value={q} onChange={(e) => setQ(e.target.value)} />
                <div className="spacer" />
                <span className="muted small">{list.length} programs</span>
              </div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
                {list.map((t) => {
                  const on = t.id === teamId;
                  return (
                    <motion.div key={t.id} layout className="card hover" onClick={() => { sfx.click(); setTeamId(t.id); }}
                      style={{ padding: 12, borderColor: on ? teamAccent(t.colors) : undefined, background: on ? `linear-gradient(135deg, ${t.colors[0]}55, var(--panel))` : undefined }}>
                      <div className="row">
                        <TeamLogo team={t} size={38} />
                        <div style={{ minWidth: 0 }}>
                          <div className="b ellipsis">{t.school}</div>
                          <div className="tiny muted ellipsis">{t.mascot} · {CONFERENCES.find((c) => c.id === t.conf)?.short}</div>
                        </div>
                      </div>
                      <div className="row" style={{ marginTop: 8, justifyContent: 'space-between' }}>
                        <Stars n={Math.max(1, Math.round(t.prestige / 20))} />
                        <span className="tiny muted">{loreOf(t.id)?.titles?.length ? <span style={{ color: 'var(--gold)' }}>🏆 {loreOf(t.id)!.titles!.length} · </span> : null}{t.state}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
            <SchoolPanel team={team} onNext={() => { sfx.whoosh(); setStep(2); }} />
          </motion.div>
        )}
        {step === 2 && (
          <motion.div key="s2" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} style={{ maxWidth: 760, margin: '30px auto', position: 'relative' }}>
            <div className="card glow" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="hero" style={{ background: `linear-gradient(135deg, ${colors[0]}, #0b1220 75%)`, padding: 30 }}>
                <div className="row gap-l">
                  <Face face={face} size={150} primary={colors[0]} secondary={colors[1]} role="coach" background="circle" />
                  <div>
                    <div className="eyebrow" style={{ color: 'rgba(255,255,255,.75)' }}>Official Offer Sheet</div>
                    <div className="h1" style={{ fontSize: 44, marginTop: 6 }}>{first} {last}</div>
                    <div style={{ fontSize: 18, marginTop: 6 }}>Head Men's Basketball Coach</div>
                    <div className="row" style={{ marginTop: 10 }}><TeamLogo team={team} size={36} /><span className="h2">{team.school} {team.mascot}</span></div>
                  </div>
                </div>
              </div>
              <div style={{ padding: 26 }}>
                <div className="kv" style={{ fontSize: 15 }}>
                  <span>Conference</span><span>{CONFERENCES.find((c) => c.id === team.conf)?.name}</span>
                  <span>Home Court</span><span>{team.arena} ({team.capacity.toLocaleString()})</span>
                  <span>Coaching Style</span><span>{ARCHETYPE_INFO[arch].icon} {arch}</span>
                  <span>Contract</span><span>5 years</span>
                  <span>NIL + Rev-Share Pool</span><span>~{fmtMoneyShort(nilBudgetFor(team, CONFERENCES.find((c) => c.id === team.conf)))} / yr</span>
                  <span>Difficulty</span><span className="upper b">{diff}</span>
                  <span>Realignment</span><span className="b">{REALIGN_INFO[realign].label}</span>
                  <span>Facilities Arms Race</span><span className="b">{race ? 'On' : 'Off'}</span>
                </div>
                <div className="row" style={{ marginTop: 26 }}>
                  <div className="muted small">Your introductory press conference starts the moment you sign.</div>
                  <div className="spacer" />
                  <button className="btn primary xl" onClick={() => void start()}>✍️ Sign & Start Dynasty</button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </>
    </motion.div>
  );
}

function SchoolPanel({ team, onNext }: { team: TeamDef; onNext: () => void }) {
  const conf = CONFERENCES.find((c) => c.id === team.conf);
  const tag = difficultyTag(team.prestige);
  const lore = loreOf(team.id);
  const titles = lore?.titles ?? [];
  return (
    <div style={{ position: 'sticky', top: 20 }}>
      <>
        <motion.div key={team.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 22, background: `linear-gradient(160deg, ${team.colors[0]}, #0b1220 85%)`, textAlign: 'center' }}>
            <motion.div initial={{ scale: 0.6, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}>
              <TeamLogo team={team} size={110} />
            </motion.div>
            <div className="h2" style={{ marginTop: 10 }}>{team.school}</div>
            <div className="muted">{team.mascot} · {team.city}, {team.state}</div>
            {lore && <div className="small" style={{ marginTop: 10, fontStyle: 'italic', opacity: 0.88, lineHeight: 1.35 }}>{lore.identity}</div>}
          </div>
          <div style={{ padding: 18 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
              <span className={`pill ${tag.c}`}>{tag.t}</span>
              <Stars n={Math.max(1, Math.round(team.prestige / 20))} />
            </div>
            <div className="small muted" style={{ marginBottom: 14 }}>{tag.d}</div>
            <div className="kv small">
              <span>Conference</span><span>{conf?.name}</span>
              <span>Prestige</span><span>{Math.round(team.prestige)}/100</span>
              <span>Arena</span><span>{team.arena}{lore?.arenaNick ? ` (${lore.arenaNick})` : ''}</span>
              {titles.length > 0 && <><span>Natl titles</span><span style={{ color: 'var(--gold)' }}>{titles.length} · last in {titles[titles.length - 1]}</span></>}
              {(lore?.students || lore?.fans) && <><span>{lore.students ? 'Students' : 'Fans'}</span><span>{lore.students ?? lore.fans}</span></>}
              <span>NIL pool</span><span>~{fmtMoneyShort(nilBudgetFor(team, conf))}</span>
              <span>Market</span><span>{'●'.repeat(Math.round(team.market / 2))}<span className="dim">{'●'.repeat(5 - Math.round(team.market / 2))}</span></span>
              <span>Academics</span><span>{'●'.repeat(Math.round(team.academics / 2))}<span className="dim">{'●'.repeat(5 - Math.round(team.academics / 2))}</span></span>
              <span>Facilities</span><span>{'●'.repeat(Math.round(team.facilities / 2))}<span className="dim">{'●'.repeat(5 - Math.round(team.facilities / 2))}</span></span>
            </div>
            <button className="btn primary lg block" style={{ marginTop: 18 }} onClick={onNext}>Take the {team.school} Job →</button>
          </div>
        </motion.div>
      </>
    </div>
  );
}
