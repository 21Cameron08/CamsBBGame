import { useEffect, useRef } from 'react';
import { useGame, type Screen } from '../../store/gameStore';
import { SHOW, unheardCount } from '../../engine/radio';
import { TeamLogo, CoachFace } from '../components/common';

const ITEMS: { id: Screen; icon: string; label: string; section?: string }[] = [
  { id: 'home', icon: '🏠', label: 'Dashboard', section: 'Program' },
  { id: 'inbox', icon: '📨', label: 'Office' },
  { id: 'roster', icon: '👥', label: 'Roster & Lineup' },
  { id: 'development', icon: '🏋️', label: 'Player Development' },
  { id: 'staff', icon: '📋', label: 'Coaching Staff' },
  { id: 'schedule', icon: '📅', label: 'Schedule' },
  { id: 'recruiting', icon: '🎯', label: 'Recruiting', section: 'Build' },
  { id: 'offseason', icon: '🔁', label: 'Portal & Offseason' },
  { id: 'nil', icon: '💰', label: 'NIL Office' },
  { id: 'rankings', icon: '📊', label: 'Rankings', section: 'League' },
  { id: 'standings', icon: '🏆', label: 'Standings' },
  { id: 'bracket', icon: '🗂️', label: 'Brackets' },
  { id: 'stats', icon: '📈', label: 'Stat Leaders' },
  { id: 'records', icon: '📖', label: 'Record Book' },
  { id: 'programs', icon: '🏛️', label: 'Programs & Coaches' },
  { id: 'media', icon: '📰', label: 'Media & Social' },
  { id: 'radio', icon: '📻', label: 'Fan Radio' },
  { id: 'coach', icon: '🧢', label: 'Coach Career', section: 'You' },
  { id: 'history', icon: '📜', label: 'Program History' },
  { id: 'settings', icon: '⚙️', label: 'Settings & Mods' },
];

export function Sidebar() {
  const screen = useGame((s) => s.screen);
  const nav = useGame((s) => s.nav);
  const g = useGame((s) => s.game)!;
  useGame((s) => s.tick);
  const team = g.teams[g.user.teamId];
  const coach = g.coaches[g.user.coachId];
  const unread = g.inbox.filter((i) => !i.resolved).length;
  const staffOpen = g.staff ? 6 - g.staff.members.length : 0;
  const offseason = !['preseason', 'regular', 'confTourney', 'selection', 'ncaa'].includes(g.phase);
  const unheard = unheardCount(g);
  useRadioNotice(g);
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">🏀</div>
        <div className="brand-name">Courtside<small>Dynasty</small></div>
      </div>
      <nav className="nav">
        {ITEMS.map((it) => (
          <div key={it.id}>
            {it.section && <div className="nav-section">{it.section}</div>}
            <button className={`nav-item ${screen === it.id ? 'active' : ''}`} onClick={() => nav(it.id)}>
              <span className="nav-icon">{it.icon}</span>
              <span className="label">{it.label}</span>
              {it.id === 'inbox' && unread > 0 && <span className="nav-badge">{unread}</span>}
              {it.id === 'staff' && staffOpen > 0 && <span className="nav-badge" title="Vacant staff roles">{staffOpen}</span>}
              {it.id === 'offseason' && offseason && <span className="nav-badge soft pulse">LIVE</span>}
              {it.id === 'radio' && unheard > 0 && screen !== 'radio' && <span className="nav-badge soft" title={`${unheard} new episode${unheard > 1 ? 's' : ''}`}>NEW</span>}
              {it.id === 'skills' as Screen && coach.skillPoints > 0 && <span className="nav-badge">{coach.skillPoints}</span>}
              {it.id === 'coach' && coach.skillPoints > 0 && <span className="nav-badge" style={{ background: 'var(--gold)', color: '#111' }}>{coach.skillPoints}</span>}
            </button>
          </div>
        ))}
      </nav>
      <div className="side-foot row" style={{ cursor: 'pointer' }} onClick={() => nav('coach')}>
        <CoachFace c={coach} size={40} team={team} />
        <div className="label" style={{ minWidth: 0 }}>
          <div className="b ellipsis">Coach {coach.last}</div>
          <div className="tiny muted">Lvl {coach.level} · {coach.careerW}-{coach.careerL}</div>
        </div>
        <div className="spacer" />
        <TeamLogo team={team} size={26} />
      </div>
    </aside>
  );
}

/** A small, quiet heads-up when a new episode of the radio show airs */
function useRadioNotice(g: NonNullable<ReturnType<typeof useGame.getState>['game']>) {
  const busy = useGame((s) => !!s.busy);
  const screen = useGame((s) => s.screen);
  const aired = g.radio?.aired ?? 0;
  const seen = useRef({ g, aired });
  useEffect(() => {
    if (seen.current.g !== g) { seen.current = { g, aired }; return; } // a different save was loaded
    if (busy || aired <= seen.current.aired) return;
    const n = aired - seen.current.aired;
    seen.current.aired = aired;
    if (screen === 'radio') return;
    const ep = g.radio?.episodes[0];
    useGame.getState().toast(n > 1 ? `📻 ${n} new episodes of ${SHOW.name} are up` : `📻 New on ${SHOW.name}: “${ep?.title ?? 'this week’s show'}”`);
  }, [aired, busy, g, screen]);
}
