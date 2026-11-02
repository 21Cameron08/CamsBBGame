import { useGame, type Screen } from '../../store/gameStore';
import { TeamLogo, CoachFace } from '../components/common';

const ITEMS: { id: Screen; icon: string; label: string; section?: string }[] = [
  { id: 'home', icon: '🏠', label: 'Dashboard', section: 'Program' },
  { id: 'inbox', icon: '📨', label: 'Office' },
  { id: 'roster', icon: '👥', label: 'Roster & Lineup' },
  { id: 'schedule', icon: '📅', label: 'Schedule' },
  { id: 'recruiting', icon: '🎯', label: 'Recruiting', section: 'Build' },
  { id: 'offseason', icon: '🔁', label: 'Portal & Offseason' },
  { id: 'nil', icon: '💰', label: 'NIL Office' },
  { id: 'rankings', icon: '📊', label: 'Rankings', section: 'League' },
  { id: 'standings', icon: '🏆', label: 'Standings' },
  { id: 'bracket', icon: '🗂️', label: 'Brackets' },
  { id: 'stats', icon: '📈', label: 'Stat Leaders' },
  { id: 'media', icon: '📰', label: 'Media & Social' },
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
  const offseason = !['preseason', 'regular', 'confTourney', 'selection', 'ncaa'].includes(g.phase);
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
              {it.id === 'offseason' && offseason && <span className="nav-badge soft pulse">LIVE</span>}
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
