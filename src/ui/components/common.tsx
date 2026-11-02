import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, animate, AnimatePresence } from 'framer-motion';
import type { Coach, Player, Recruit, Team } from '../../engine/types';
import { Face, generateFace, normalizeFace, type FaceConfig } from '../face';
import { knownFileLogo, onLogosChanged, probeLogo, uploadedLogo } from '../logos';
import { ratingColor, textOn, teamAccent, luminance, mix } from '../color';
import { useGame } from '../../store/gameStore';

// ---------------- Team logo ----------------
function hashStr(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

export function GeneratedBadge({ team, size }: { team: Pick<Team, 'id' | 'abbr' | 'colors'>; size: number }) {
  const [p, s0] = team.colors;
  const s = Math.abs(luminance(p) - luminance(s0)) < 0.08 ? (luminance(p) > 0.4 ? '#111111' : '#ffffff') : s0;
  const shape = hashStr(team.id) % 4;
  const id = `g${hashStr(team.id)}`;
  const txt = team.abbr.length > 4 ? team.abbr.slice(0, 4) : team.abbr;
  const fs = txt.length <= 2 ? 40 : txt.length === 3 ? 33 : 26;
  const dark = mix(p, '#000000', 0.35);
  const path = shape === 0
    ? 'M50 4 L90 16 L90 50 C90 74 72 88 50 96 C28 88 10 74 10 50 L10 16 Z'
    : shape === 1
      ? 'M50 4 A46 46 0 1 1 49.9 4 Z'
      : shape === 2
        ? 'M50 4 L90 27 L90 73 L50 96 L10 73 L10 27 Z'
        : 'M22 6 H78 A16 16 0 0 1 94 22 V78 A16 16 0 0 1 78 94 H22 A16 16 0 0 1 6 78 V22 A16 16 0 0 1 22 6 Z';
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label={team.abbr}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={mix(p, '#ffffff', 0.12)} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
      </defs>
      <path d={path} fill={`url(#${id})`} stroke={s} strokeWidth="5" />
      <path d={path} fill="none" stroke={dark} strokeWidth="1.5" transform="translate(50 50) scale(0.82) translate(-50 -50)" opacity="0.7" />
      <text x="50" y={50 + fs * 0.36} textAnchor="middle" fontFamily="'Barlow Condensed', 'Arial Narrow', sans-serif" fontWeight="900" fontSize={fs} fill={s} letterSpacing="0.5" style={{ paintOrder: 'stroke' }} stroke={dark} strokeWidth="1.2">{txt}</text>
    </svg>
  );
}

export function TeamLogo({ team, size = 32, className }: { team: Pick<Team, 'id' | 'abbr' | 'colors'> | undefined; size?: number; className?: string }) {
  const [, force] = useState(0);
  const [probed, setProbed] = useState<string | null>(null);
  useEffect(() => onLogosChanged(() => force((x) => x + 1)) as () => void, []);
  const id = team?.id ?? '';
  const up = id ? uploadedLogo(id) : undefined;
  const known = id ? knownFileLogo(id) : undefined;
  useEffect(() => {
    let alive = true;
    if (!id || up || known) return;
    void probeLogo(id).then((u) => { if (alive) setProbed(u); });
    return () => { alive = false; };
  }, [id, up, known]);
  if (!team) return <span style={{ width: size, height: size, display: 'inline-block' }} />;
  const src = up ?? known ?? probed;
  return (
    <span className={`logo-badge ${className ?? ''}`} style={{ width: size, height: size }}>
      {src ? <img src={src} alt={team.abbr} width={size} height={size} style={{ objectFit: 'contain', width: size, height: size, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.35))' }} /> : <GeneratedBadge team={team} size={size} />}
    </span>
  );
}

// ---------------- Faces ----------------
const faceCache = new Map<string, FaceConfig>();
function cachedFace(key: string, make: () => FaceConfig) {
  let f = faceCache.get(key);
  if (!f) {
    f = make();
    faceCache.set(key, f);
    if (faceCache.size > 4000) faceCache.delete(faceCache.keys().next().value as string);
  }
  return f;
}

export function PlayerFace({ p, size = 48, team, bg = 'circle' }: { p: Pick<Player, 'id' | 'num' | 'injury'> | Recruit; size?: number; team?: Pick<Team, 'colors'>; bg?: 'circle' | 'none' | 'card' }) {
  const face = cachedFace(`p:${p.id}`, () => generateFace(p.id, { role: 'player', age: 20 }));
  const colors = team?.colors ?? ['#3a4152', '#c9d1df'];
  return <Face face={face} size={size} primary={colors[0]} secondary={colors[1]} jerseyNumber={p.num || undefined} role="player" background={bg} injured={!!p.injury} />;
}

export function coachFaceConfig(c: Pick<Coach, 'id' | 'age' | 'face'>): FaceConfig {
  if (c.face) return normalizeFace(c.face as Partial<FaceConfig>, c.id);
  const bucket = Math.floor(c.age / 10) * 10 + 5;
  return cachedFace(`c:${c.id}:${bucket}`, () => generateFace(c.id, { role: 'coach', age: bucket }));
}

export function CoachFace({ c, size = 48, team, bg = 'circle' }: { c: Pick<Coach, 'id' | 'age' | 'face'>; size?: number; team?: Pick<Team, 'colors'>; bg?: 'circle' | 'none' | 'card' }) {
  const colors = team?.colors ?? ['#24467A', '#ffffff'];
  return <Face face={coachFaceConfig(c)} size={size} primary={colors[0]} secondary={colors[1]} role="coach" background={bg} />;
}

export function PersonFace({ seed, size = 40, role = 'staff', colors }: { seed: string; size?: number; role?: 'staff' | 'coach' | 'player'; colors?: [string, string] }) {
  const face = cachedFace(`s:${seed}:${role}`, () => generateFace(seed, { role, age: 30 + (hashStr(seed) % 30) }));
  return <Face face={face} size={size} primary={colors?.[0] ?? '#2a3346'} secondary={colors?.[1] ?? '#cfd6e3'} role={role} background="circle" />;
}

// ---------------- Ratings ----------------
export function Ovr({ v, size = 'md' }: { v: number; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={`ovr ${size === 'md' ? '' : size}`} style={{ background: ratingColor(v) }}>{Math.round(v)}</span>;
}

export function Stars({ n, max = 5 }: { n: number; max?: number }) {
  return (
    <span className="stars">
      {Array.from({ length: max }, (_, i) => <span key={i} className={i < n ? '' : 'off'}>★</span>)}
    </span>
  );
}

export function Bar({ v, max = 100, color, className }: { v: number; max?: number; color?: string; className?: string }) {
  return (
    <div className={`bar ${className ?? ''}`}>
      <i style={{ width: `${Math.max(0, Math.min(100, (v / max) * 100))}%`, background: color }} />
    </div>
  );
}

export function RatingRow({ label, v, prev }: { label: string; v: number; prev?: number }) {
  return (
    <div className="row" style={{ gap: 10 }}>
      <span className="small muted" style={{ width: 98 }}>{label}</span>
      <div style={{ flex: 1 }}><Bar v={v} color={ratingColor(v)} /></div>
      <span className="num" style={{ width: 26, textAlign: 'right', color: ratingColor(v) }}>{v}</span>
      {prev != null && prev !== v ? <span className={`tiny ${v > prev ? 'good' : 'bad'}`} style={{ width: 26 }}>{v > prev ? `+${v - prev}` : v - prev}</span> : prev != null ? <span style={{ width: 26 }} /> : null}
    </div>
  );
}

// ---------------- Animated number ----------------
export function AnimatedNumber({ value, format = (n: number) => Math.round(n).toLocaleString(), duration = 0.9 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctrl = animate(prev.current, value, {
      duration,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => { el.textContent = format(v); },
    });
    prev.current = value;
    return () => ctrl.stop();
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref}>{format(prev.current)}</span>;
}

// ---------------- Tabs ----------------
export function Tabs<T extends string>({ tabs, value, onChange, id }: { tabs: { id: T; label: React.ReactNode }[]; value: T; onChange: (v: T) => void; id: string }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.id} className={`tab ${value === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
          {value === t.id && <motion.div layoutId={`tab-${id}`} className="tab-bg" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------- Team name link ----------------
export function TeamName({ team, showRank = true, short = false, logo = 0, className }: { team: Team | undefined; showRank?: boolean; short?: boolean; logo?: number; className?: string }) {
  const open = useGame((s) => s.open);
  if (!team) return <span className="dim">TBD</span>;
  return (
    <span className={`row ${className ?? ''}`} style={{ gap: 7, display: 'inline-flex' }}>
      {logo > 0 && <TeamLogo team={team} size={logo} />}
      <span className="link" onClick={(e) => { e.stopPropagation(); open({ kind: 'team', id: team.id }); }}>
        {showRank && team.apRank ? <span className="rank">{team.apRank}</span> : null}
        {short ? team.abbr : team.school}
      </span>
    </span>
  );
}

// ---------------- Meter (radial) ----------------
export function Gauge({ value, label, color, size = 92, sub }: { value: number; label: string; color?: string; size?: number; sub?: string }) {
  const r = 38, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  const col = color ?? (value >= 66 ? 'var(--good)' : value >= 40 ? 'var(--warn)' : 'var(--bad)');
  return (
    <div style={{ width: size, textAlign: 'center' }}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} stroke="rgba(255,255,255,.08)" strokeWidth="9" fill="none" />
        <motion.circle cx="50" cy="50" r={r} stroke={col} strokeWidth="9" fill="none" strokeLinecap="round" transform="rotate(-90 50 50)"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct) }} transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }} />
        <text x="50" y="57" textAnchor="middle" fill="currentColor" fontFamily="var(--font-display)" fontWeight="800" fontSize="24">{Math.round(value)}</text>
      </svg>
      <div className="tiny upper muted b" style={{ marginTop: -4 }}>{label}</div>
      {sub && <div className="tiny dim">{sub}</div>}
    </div>
  );
}

// ---------------- Sparkline ----------------
export function Sparkline({ data, w = 120, h = 32, color = 'var(--accent)' }: { data: number[]; w?: number; h?: number; color?: string }) {
  if (data.length < 2) return <svg width={w} height={h} />;
  const min = Math.min(...data), max = Math.max(...data);
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - 3 - ((d - min) / Math.max(1e-6, max - min)) * (h - 6)}`).join(' ');
  return (
    <svg width={w} height={h}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ---------------- Modal frame ----------------
export function ModalFrame({ children, onClose, narrow }: { children: React.ReactNode; onClose: () => void; narrow?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <motion.div className="modal-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div className={`modal ${narrow ? 'narrow' : ''}`} initial={{ y: 30, scale: 0.97, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 20, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
        <button className="modal-x" onClick={onClose} aria-label="Close">×</button>
        {children}
      </motion.div>
    </motion.div>
  );
}

/** Hero background with team colors */
export function TeamHeroBg({ team, intensity = 1 }: { team: Pick<Team, 'colors'>; intensity?: number }) {
  const [p, s] = team.colors;
  const acc = teamAccent(team.colors);
  return (
    <div className="hero-bg" style={{
      background: `radial-gradient(700px 300px at 15% 0%, ${mix(p, '#000', 0.1)}${Math.round(200 * intensity).toString(16).padStart(2, '0')}, transparent 70%), radial-gradient(500px 260px at 100% 100%, ${acc}44, transparent 70%), linear-gradient(135deg, ${mix(p, '#05080f', 0.55)}, #0b1220 70%)`,
    }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 0.07, background: `repeating-linear-gradient(120deg, ${s} 0 2px, transparent 2px 22px)` }} />
    </div>
  );
}

export function useTeamTheme(team: Team | undefined) {
  useEffect(() => {
    if (!team) return;
    const root = document.documentElement;
    const acc = teamAccent(team.colors);
    root.style.setProperty('--accent', acc);
    root.style.setProperty('--accent-ink', textOn(acc));
    root.style.setProperty('--team1', team.colors[0]);
    root.style.setProperty('--team2', team.colors[1]);
  }, [team?.colors[0], team?.colors[1]]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ---------------- Confetti ----------------
export function Confetti({ colors, count = 160, duration = 4200 }: { colors: string[]; count?: number; duration?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    const W = (cv.width = window.innerWidth), H = (cv.height = window.innerHeight);
    const parts = Array.from({ length: count }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 16 - 4,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, w: 6 + Math.random() * 8, h: 4 + Math.random() * 6,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    let raf = 0;
    const start = performance.now();
    const loop = (t: number) => {
      const el = t - start;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.globalAlpha = Math.max(0, 1 - el / duration);
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
        ctx.restore();
      }
      if (el < duration) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [colors, count, duration]);
  return <canvas ref={ref} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 120 }} />;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Section({ title, right, children, className, glow }: { title?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string; glow?: boolean }) {
  return (
    <div className={`card ${glow ? 'glow' : ''} ${className ?? ''}`}>
      {(title || right) && <div className="card-head"><div className="h3">{title}</div>{right}</div>}
      {children}
    </div>
  );
}

export function Fade({ k, children }: { k: string | number; children: React.ReactNode }) {
  return (
    <>
      <motion.div key={k} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
        {children}
      </motion.div>
    </>
  );
}

export function useSorted<T>(rows: T[], initial: { key: string; dir: 1 | -1 }, getters: Record<string, (r: T) => number | string>) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => {
    const g = getters[sort.key];
    if (!g) return rows;
    return [...rows].sort((a, b) => {
      const va = g(a), vb = g(b);
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb)) * sort.dir;
      return ((va as number) - (vb as number)) * sort.dir;
    });
  }, [rows, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const th = (key: string, label: React.ReactNode, cls = '') => (
    <th className={`sortable ${cls}`} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}>
      {label}{sort.key === key ? (sort.dir === -1 ? ' ▾' : ' ▴') : ''}
    </th>
  );
  return { sorted, th };
}

export function Money({ v }: { v: number }) {
  return <span className="mono">{fmtMoneyShort(v)}</span>;
}
export function fmtMoneyShort(v: number) {
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1_000_000) return `${s}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M`;
  if (a >= 1_000) return `${s}$${Math.round(a / 1_000)}K`;
  return `${s}$${Math.round(a)}`;
}
