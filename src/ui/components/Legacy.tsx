// Program lore and the Ring of Honor: shared by the Team modal and the History screen.
import { motion } from 'framer-motion';
import type { GameState, Team } from '../../engine/types';
import { loreOf, ringOfHonor, preDynastyTitles, type Legend } from '../../engine/legacy';
import { useGame } from '../../store/gameStore';
import { inkOn, teamAccent } from '../color';

/** A hanging jersey in the team's colors */
export function Jersey({ team, num, size = 64 }: { team: Pick<Team, 'colors'>; num: number; size?: number }) {
  const [p, s] = team.colors;
  const w = size, h = size * 1.12;
  return (
    <svg width={w} height={h} viewBox="0 0 100 112" aria-hidden>
      <path d="M30 6 Q50 22 70 6 L84 12 Q86 30 96 36 L90 50 Q84 48 80 44 L80 106 Q50 112 20 106 L20 44 Q16 48 10 50 L4 36 Q14 30 16 12 Z" fill={p} stroke={s} strokeWidth="3" strokeLinejoin="round" />
      <path d="M30 6 Q50 22 70 6" fill="none" stroke={s} strokeWidth="6" strokeLinecap="round" />
      <path d="M84 12 Q86 30 96 36 M16 12 Q14 30 4 36" fill="none" stroke={s} strokeOpacity=".55" strokeWidth="2" />
      <text x="50" y="82" textAnchor="middle" fill={inkOn(p, s)} stroke={p} strokeWidth="1" fontFamily="var(--font-display)" fontWeight="900" fontSize={num >= 10 ? 44 : 50}>{num}</text>
    </svg>
  );
}

function LegendCard({ g, team, l, i }: { g: GameState; team: Team; l: Legend; i: number }) {
  const open = useGame((s) => s.open);
  const pid = l.playerId && g.players[l.playerId] ? l.playerId : undefined;
  return (
    <motion.div className="legend-card" initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, type: 'spring', stiffness: 160, damping: 16 }}
      style={{ cursor: pid ? 'pointer' : undefined, borderColor: l.dynasty ? 'rgba(246,201,76,.45)' : undefined }} onClick={() => pid && open({ kind: 'player', id: pid })}>
      <Jersey team={team} num={l.num} size={58} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="small b ellipsis">{l.name}</div>
        {l.nickname && <div className="tiny" style={{ color: teamAccent(team.colors) }}>“{l.nickname}”</div>}
        <div className="tiny muted">No. {l.num} · {l.pos} · {l.dynasty ? l.era : cap(l.era)}</div>
        <div className="tiny" style={{ marginTop: 3, lineHeight: 1.3, opacity: 0.85 }}>{l.line}</div>
        {l.dynasty && <span className="pill gold" style={{ marginTop: 5, fontSize: 10 }}>Retired in {l.season != null ? l.season + 1 : 'the dynasty'}</span>}
      </div>
    </motion.div>
  );
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Retired jerseys: the dynasty's first, then the program's older legends */
export function RingOfHonor({ g, team, empty }: { g: GameState; team: Team; empty?: string }) {
  const ring = ringOfHonor(g, team.id);
  if (!ring.length) return <div className="small muted" style={{ padding: '10px 0' }}>{empty ?? 'No jerseys hang in the rafters yet. A National Player of the Year, a First Team All-American or the star of a title team would change that.'}</div>;
  return <div className="legend-grid">{ring.map((l, i) => <LegendCard key={`${l.num}-${l.name}`} g={g} team={team} l={l} i={i} />)}</div>;
}

/** Every national title, pre-dynasty and dynasty, newest last */
export function allTitles(g: GameState, teamId: string): { year: number; dynasty: boolean }[] {
  const pre = preDynastyTitles(teamId).map((year) => ({ year, dynasty: false }));
  const dyn = g.champions.filter((c) => c.teamId === teamId).map((c) => ({ year: c.season + 1, dynasty: true }));
  return [...pre, ...dyn].sort((a, b) => a.year - b.year);
}

/** Identity, crowd, traditions and the title list */
export function ProgramStory({ g, team, showRing = true, showTitles = true }: { g: GameState; team: Team; showRing?: boolean; showTitles?: boolean }) {
  const lore = loreOf(team.id);
  const titles = allTitles(g, team.id);
  const accent = teamAccent(team.colors);
  return (
    <div className="col" style={{ gap: 16 }}>
      {lore ? (
        <div className="lore-identity" style={{ borderColor: accent }}>
          <div style={{ fontSize: 17, lineHeight: 1.4, fontStyle: 'italic' }}>{lore.identity}</div>
          <div className="row wrap" style={{ marginTop: 10, gap: 6 }}>
            {lore.fans && <span className="pill">📣 {lore.fans}</span>}
            {lore.students && <span className="pill">🎓 {lore.students}</span>}
            <span className="pill">🏟️ {lore.arenaNick ? `${lore.arenaNick} · ${team.arena}` : team.arena}</span>
          </div>
        </div>
      ) : (
        <div className="small muted">{titles.length || ringOfHonor(g, team.id).length ? `${team.school}’s story is being written in your dynasty.` : `${team.school}’s story is still being written. Win something worth remembering.`}</div>
      )}
      {showTitles && titles.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>National Championships · {titles.length}</div>
          <div className="row wrap" style={{ gap: 6 }}>
            {titles.map((t) => <span key={t.year} className={`pill ${t.dynasty ? 'gold' : ''}`} title={t.dynasty ? 'Won during your dynasty' : 'Before the dynasty'}>🏆 {t.year}</span>)}
          </div>
        </div>
      )}
      {lore && (
        <div className="grid g2" style={{ gap: 16 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Traditions</div>
            <div className="col" style={{ gap: 7 }}>
              {lore.traditions.map((t, i) => <div key={i} className="row small" style={{ gap: 8, alignItems: 'flex-start' }}><span style={{ color: accent }}>◆</span><span>{t}</span></div>)}
            </div>
          </div>
          {lore.moments && lore.moments.length > 0 && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Famous Moments</div>
              <div className="col" style={{ gap: 7 }}>
                {lore.moments.map((m, i) => <div key={i} className="row small" style={{ gap: 8, alignItems: 'flex-start' }}><span>📼</span><span>{m}</span></div>)}
              </div>
            </div>
          )}
        </div>
      )}
      {showRing && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Ring of Honor</div>
          <RingOfHonor g={g} team={team} />
        </div>
      )}
    </div>
  );
}
