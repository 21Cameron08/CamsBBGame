import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '../../store/gameStore';
import { TeamLogo } from '../components/common';
import { advanceActions, PHASE_LABEL } from './advance';
import { seasonLabel } from '../../engine/calendar';
import { sfx } from '../sound';

export function TopBar() {
  const g = useGame((s) => s.game)!;
  useGame((s) => s.tick);
  const busy = useGame((s) => s.busy);
  const team = g.teams[g.user.teamId];
  const conf = g.conferences.find((c) => c.id === team.conf);
  const { main, extra } = advanceActions(g);
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false); };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, []);
  const inSeason = ['regular', 'confTourney', 'ncaa', 'preseason'].includes(g.phase);
  return (
    <header className="topbar">
      <div className="tb-team">
        <TeamLogo team={team} size={42} />
        <div style={{ minWidth: 0 }}>
          <div className="name ellipsis">{team.apRank ? <span className="rank">#{team.apRank} </span> : null}{team.school} <span className="muted" style={{ fontWeight: 600 }}>{team.mascot}</span></div>
          <div className="sub">{team.record.w}-{team.record.l} · {team.record.cw}-{team.record.cl} {conf?.short} · NET {team.net || '—'}</div>
        </div>
      </div>
      <div className="spacer" />
      {inSeason && (
        <div className="hours-chip" title="Weekly recruiting hours">🎯 <span className="num" style={{ fontSize: 15 }}>{g.user.hours}</span><span className="muted">/ {g.user.hoursMax} hrs</span></div>
      )}
      <div className="tb-date">
        <div className="d">{g.calendar[g.day]?.label.split(' · ')[0] ?? ''}</div>
        <div className="p">{seasonLabel(g.season)} · {PHASE_LABEL[g.phase]}</div>
      </div>
      <div ref={ref} className="row" style={{ position: 'relative', gap: 0 }}>
        <button className={`btn ${main.kind === 'gold' ? 'gold' : 'primary'} lg btn-advance`} disabled={!!busy} onClick={() => { sfx.click(); main.run(); }} style={{ borderTopRightRadius: extra.length ? 0 : 12, borderBottomRightRadius: extra.length ? 0 : 12, minWidth: 210, flexDirection: 'column', gap: 0, alignItems: 'flex-start', padding: '7px 18px' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, letterSpacing: '.05em', textTransform: 'uppercase' }}>{main.label} ▸</span>
          {main.sub && <span style={{ fontSize: 11, opacity: 0.8, fontWeight: 600 }}>{main.sub}</span>}
        </button>
        {extra.length > 0 && (
          <button className={`btn ${main.kind === 'gold' ? 'gold' : 'primary'} lg`} style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeft: '1px solid rgba(0,0,0,.25)', alignSelf: 'stretch', padding: '0 10px' }} onClick={() => setMenu((m) => !m)} disabled={!!busy}>▾</button>
        )}
        <AnimatePresence>
          {menu && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="card" style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 40, padding: 6, minWidth: 220 }}>
              {extra.map((e) => (
                <button key={e.label} className="btn ghost block" style={{ justifyContent: 'flex-start' }} onClick={() => { setMenu(false); e.run(); }}>{e.label}</button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
