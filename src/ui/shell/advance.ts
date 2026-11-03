import type { GameState } from '../../engine/types';
import { userGameToday, nextUserGame } from '../../engine/season';
import { seasonLabel } from '../../engine/calendar';
import { decidingToday } from '../../engine/portal';
import { summerDone } from '../../engine/development';
import { useGame } from '../../store/gameStore';

export interface AdvanceAction { label: string; sub?: string; run: () => void; kind?: 'primary' | 'gold' }

export function advanceActions(g: GameState): { main: AdvanceAction; extra: AdvanceAction[] } {
  const st = useGame.getState();
  const user = g.teams[g.user.teamId];
  const sim = (m: Parameters<typeof st.advance>[0]) => () => void st.advance(m);
  const extras: AdvanceAction[] = [];
  switch (g.phase) {
    case 'preseason':
      return { main: { label: 'Start the Season', sub: 'Tip-off week', run: sim('day'), kind: 'primary' }, extra: [] };
    case 'regular':
    case 'confTourney':
    case 'ncaa': {
      const today = userGameToday(g);
      extras.push({ label: 'Sim 1 day', run: sim('day') }, { label: 'Sim 1 week', run: sim('week') }, { label: 'Sim to end of phase', run: sim('phase') });
      if (today) {
        const opp = g.teams[today.home === user.id ? today.away : today.home];
        return {
          main: { label: `Game Day vs ${opp.school}`, sub: today.event ?? (today.type === 'conf' ? 'Conference game' : 'Non-conference'), run: () => st.open({ kind: 'pregame', gameId: today.id }), kind: 'gold' },
          extra: [{ label: 'Quick sim this game', run: () => st.quickSimUserGame() }, ...extras],
        };
      }
      const next = nextUserGame(g);
      if (next) {
        const opp = g.teams[next.home === user.id ? next.away : next.home];
        return { main: { label: 'Advance to Next Game', sub: `${g.calendar[next.day]?.label.split(' · ')[0] ?? ''} vs ${opp.abbr}`, run: sim('nextGame'), kind: 'primary' }, extra: extras };
      }
      return { main: { label: g.phase === 'regular' ? 'Advance Day' : 'Sim Next Round', sub: g.calendar[g.day]?.label, run: sim('day'), kind: 'primary' }, extra: extras };
    }
    case 'selection':
      return {
        main: { label: 'Start the Tournament', sub: 'The First Four tips off', run: () => { st.nav('bracket'); void st.advance('day'); }, kind: 'gold' },
        extra: [{ label: '▶ Replay the Selection Show', run: () => replaySelectionShow() }],
      };
    case 'seasonEnd':
      return { main: { label: 'Continue: Draft Declarations', sub: 'Season review complete', run: () => void st.continueOffseason(), kind: 'primary' }, extra: [] };
    case 'declarations':
      return { main: { label: 'Open the Transfer Portal', sub: 'Retention meetings first', run: () => void st.continueOffseason(), kind: 'primary' }, extra: [] };
    case 'portal': {
      const d = g.portal?.day ?? 0, m = g.portal?.maxDays ?? 6;
      const deciding = decidingToday(g);
      if (d === 0) {
        const open = Object.values(g.user.retention).filter((r) => !r.resolved).length;
        return { main: { label: 'Open the Portal Window', sub: open ? `${open} unresolved meeting${open > 1 ? 's' : ''} decide now` : 'Day 1 of the window', run: () => void st.continueOffseason(), kind: 'gold' }, extra: [] };
      }
      return { main: { label: d >= m ? 'Final Decisions · Close Portal' : `End Day ${d} · Go to Day ${d + 1}`, sub: deciding ? `${deciding} of your targets decide tonight` : `Portal window · ${m - d} day${m - d === 1 ? '' : 's'} left`, run: () => void st.continueOffseason(), kind: d >= m ? 'gold' : 'primary' }, extra: [] };
    }
    case 'signing':
      return { main: { label: 'Continue: NBA Draft', sub: 'Signing day complete', run: () => void st.continueOffseason(), kind: 'primary' }, extra: [] };
    case 'draft':
      return { main: { label: 'Continue: Summer Development', sub: 'Draft complete', run: () => void st.continueOffseason(), kind: 'primary' }, extra: [] };
    case 'progression':
      if (!summerDone(g)) return { main: { label: 'Run Summer Workouts', sub: 'Development plans lock in', run: () => { st.nav('offseason'); void st.continueOffseason(); }, kind: 'gold' }, extra: [] };
      return { main: { label: 'Continue: Scheduling Office', sub: 'Build next year’s non-conference slate', run: () => void st.continueOffseason(), kind: 'primary' }, extra: [] };
    case 'scheduling': {
      const sc = g.scheduling;
      const used = sc ? sc.games.length + (sc.mte ? 2 : 0) : 12;
      return { main: { label: `Lock Schedule & Begin ${seasonLabel(g.season + 1)}`, sub: used < 12 ? `${12 - used} open date${12 - used > 1 ? 's' : ''} — staff will fill` : 'All 12 dates booked', run: () => void st.continueOffseason(), kind: 'gold' }, extra: [] };
    }
  }
  return { main: { label: 'Continue', run: sim('day') }, extra: [] };
}

export const PHASE_LABEL: Record<GameState['phase'], string> = {
  preseason: 'Preseason', regular: 'Regular Season', confTourney: 'Championship Week', selection: 'Selection Sunday', ncaa: 'March Madness',
  seasonEnd: 'Season Review', declarations: 'Draft Declarations', portal: 'Transfer Portal', signing: 'Signing Day', draft: 'NBA Draft', progression: 'Summer Development', scheduling: 'Scheduling Office',
};

/** Queue the Selection Sunday show again (no presser the second time) */
export function replaySelectionShow() {
  useGame.getState().mutate((g) => {
    if (!g.ncaa || g.user.moments.some((m) => m.kind === 'selection')) return;
    g.user.moments.unshift({ kind: 'selection', season: g.season, press: null });
  }, { save: false });
}
