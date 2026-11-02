import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame, type Screen } from '../store/gameStore';
import { TitleScreen } from './screens/TitleScreen';
import { Sidebar } from './shell/Sidebar';
import { TopBar } from './shell/TopBar';
import { Ticker } from './shell/Ticker';
import { useTeamTheme } from './components/common';
import { Dashboard } from './screens/Dashboard';
import { RosterScreen } from './screens/Roster';
import { ScheduleScreen } from './screens/Schedule';
import { RecruitingScreen } from './screens/Recruiting';
import { NilScreen } from './screens/Nil';
import { RankingsScreen } from './screens/Rankings';
import { StandingsScreen } from './screens/Standings';
import { BracketScreen } from './screens/Bracket';
import { MediaScreen } from './screens/Media';
import { StatsScreen } from './screens/Stats';
import { CoachScreen } from './screens/Coach';
import { InboxScreen } from './screens/Inbox';
import { OffseasonScreen } from './screens/Offseason';
import { SettingsScreen } from './screens/Settings';
import { HistoryScreen } from './screens/History';
import { StaffScreen } from './screens/Staff';
import { ModalHost } from './overlays/ModalHost';
import { LiveGame } from './overlays/LiveGame';
import { PressConferenceView } from './overlays/PressConference';
import { MomentHost } from './overlays/Moments';
import { Toasts, BusyOverlay } from './shell/Feedback';

const SCREENS: Record<Screen, React.FC> = {
  home: Dashboard,
  roster: RosterScreen,
  staff: StaffScreen,
  schedule: ScheduleScreen,
  recruiting: RecruitingScreen,
  portal: OffseasonScreen,
  nil: NilScreen,
  rankings: RankingsScreen,
  standings: StandingsScreen,
  bracket: BracketScreen,
  media: MediaScreen,
  stats: StatsScreen,
  coach: CoachScreen,
  inbox: InboxScreen,
  offseason: OffseasonScreen,
  settings: SettingsScreen,
  history: HistoryScreen,
};

export default function App() {
  const booted = useGame((s) => s.booted);
  const hasGame = useGame((s) => !!s.game);
  const init = useGame((s) => s.init);
  useEffect(() => { void init(); }, [init]);
  if (!booted) return <div className="app-bg" />;
  return (
    <>
      <div className="app-bg" />
      <div className="grain" />
      {hasGame ? <GameShell /> : <TitleScreen />}
      <Toasts />
      <BusyOverlay />
    </>
  );
}

function GameShell() {
  const screen = useGame((s) => s.screen);
  const tick = useGame((s) => s.tick);
  const game = useGame((s) => s.game)!;
  const live = useGame((s) => s.live);
  const team = game.teams[game.user.teamId];
  useTeamTheme(team);
  void tick;
  const Comp = SCREENS[screen] ?? Dashboard;
  return (
    <>
      <div className="shell">
        <Sidebar />
        <TopBar />
        <main className="content" id="content">
          <>
            <motion.div key={screen} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
              <Comp />
            </motion.div>
          </>
        </main>
        <Ticker />
      </div>
      <ModalHost />
      {live && <LiveGame key={live.game.id} live={live} />}
      {!live && <PressConferenceView />}
      {!live && <MomentHost />}
    </>
  );
}
