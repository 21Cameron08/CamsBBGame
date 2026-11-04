import { create } from 'zustand';
import type { BoxScore, GameState, ScheduledGame } from '../engine/types';
import { createWorld, type NewGameOptions } from '../engine/world';
import { processDay, nextDay, userGameToday, applyGameResult, simGame, isRivalry } from '../engine/season';
import { advanceOffseason, takeJob } from '../engine/offseason';
import { GameSim } from '../engine/sim';
import { simSetup } from '../engine/team';
import { spread } from '../engine/rankings';
import { RNG, rng, setRng, clamp } from '../engine/rng';
import { listSaves, readSave, writeSave, deleteSave as delSave, allTeamMods, type SaveMeta, validateSave, getPrefs, setPrefs, type Prefs } from './persistence';
import { initLogos } from '../ui/logos';
import { setSoundEnabled } from '../ui/sound';
import { migrateStaff } from '../engine/staff';
import { migratePortal } from '../engine/portal';
import { ensureDevelopment } from '../engine/development';
import { recordBook } from '../engine/records';
import { playbookState } from '../engine/schemes';
import { loreOf } from '../data/lore';
import { ensureRadio } from '../engine/radio';
import { ensurePstats } from '../engine/pstats';

export type Screen =
  | 'home' | 'roster' | 'staff' | 'schedule' | 'recruiting' | 'portal' | 'nil' | 'rankings' | 'standings' | 'bracket'
  | 'media' | 'stats' | 'coach' | 'inbox' | 'offseason' | 'settings' | 'history' | 'development' | 'records' | 'radio' | 'programs';

export type Modal =
  | { kind: 'player'; id: string }
  | { kind: 'recruit'; id: string }
  | { kind: 'team'; id: string }
  | { kind: 'box'; gameId: string }
  | { kind: 'pregame'; gameId: string }
  | { kind: 'program'; id: string }
  | { kind: 'coach'; id: string };

export interface Toast { id: number; text: string; kind: 'info' | 'good' | 'bad' }

export interface LiveSession {
  game: ScheduledGame;
  sim: GameSim;
  userSide: 0 | 1;
  spread: number;
}

interface Store {
  game: GameState | null;
  tick: number;
  screen: Screen;
  screenArg?: string;
  modal: Modal | null;
  toasts: Toast[];
  busy: { label: string; progress: number } | null;
  live: LiveSession | null;
  saves: SaveMeta[];
  prefs: Prefs;
  booted: boolean;
  init(): Promise<void>;
  newGame(o: Omit<NewGameOptions, 'overrides'>): Promise<void>;
  load(id: string): Promise<void>;
  loadState(g: GameState): Promise<void>;
  save(): Promise<void>;
  deleteSave(id: string): Promise<void>;
  quit(): void;
  mutate(fn: (g: GameState) => void, opts?: { save?: boolean }): void;
  nav(s: Screen, arg?: string): void;
  open(m: Modal): void;
  close(): void;
  toast(text: string, kind?: Toast['kind']): void;
  setPrefs(p: Partial<Prefs>): void;
  startLive(): void;
  finishLive(box: BoxScore): void;
  abandonLive(): void;
  quickSimUserGame(): void;
  advance(mode: 'day' | 'nextGame' | 'week' | 'phase' | 'season'): Promise<void>;
  continueOffseason(): Promise<void>;
  acceptJob(teamId: string): void;
  dismissMoment(): void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let toastId = 1;
const yieldUI = () => new Promise<void>((r) => setTimeout(r, 0));

export const useGame = create<Store>((set, get) => ({
  game: null,
  tick: 0,
  screen: 'home',
  modal: null,
  toasts: [],
  busy: null,
  live: null,
  saves: [],
  prefs: { sound: true, reduceMotion: false },
  booted: false,

  async init() {
    const [saves, prefs] = await Promise.all([listSaves(), getPrefs()]);
    setSoundEnabled(prefs.sound);
    set({ saves, prefs, booted: true });
    void initLogos();
  },

  async newGame(o) {
    set({ busy: { label: 'Building the college basketball universe…', progress: 0.2 } });
    await yieldUI();
    const overrides = await allTeamMods();
    const g = createWorld({ ...o, overrides });
    set({ game: g, tick: 1, screen: 'home', busy: null, modal: null, live: null });
    await get().save();
  },

  async load(id) {
    set({ busy: { label: 'Loading dynasty…', progress: 0.5 } });
    const g = await readSave(id);
    if (!g) { set({ busy: null }); get().toast('Save not found.', 'bad'); return; }
    await get().loadState(g);
  },

  async loadState(g) {
    if (!validateSave(g)) { get().toast('That file is not a valid save.', 'bad'); set({ busy: null }); return; }
    const r = new RNG(1);
    r.state = g.rngState || Date.now();
    setRng(r);
    migratePortal(g);
    const migrated = migrateStaff(g);
    ensureDevelopment(g);
    ensurePstats(g);
    ensureRadio(g);
    recordBook(g);
    playbookState(g);
    if (migrated) g.version = Math.max(g.version, 2);
    set({ game: g, tick: get().tick + 1, screen: 'home', busy: null, modal: null, live: null });
    if (migrated) {
      get().toast('New: your Coaching Staff has arrived — check the Staff page.', 'good');
      void get().save();
    }
  },

  async save() {
    const g = get().game;
    if (!g) return;
    g.rngState = rng.state;
    try {
      await writeSave(g);
      set({ saves: await listSaves() });
    } catch (e) {
      console.error(e);
      get().toast('Autosave failed (storage full?) — export your save from Settings.', 'bad');
    }
  },

  async deleteSave(id) {
    await delSave(id);
    set({ saves: await listSaves() });
  },

  quit() {
    void get().save();
    set({ game: null, screen: 'home', modal: null, live: null });
  },

  mutate(fn, opts) {
    const g = get().game;
    if (!g) return;
    fn(g);
    set({ tick: get().tick + 1 });
    if (opts?.save !== false) {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => void get().save(), 1500);
    }
  },

  nav(s, arg) { set({ screen: s, screenArg: arg, modal: null }); },
  open(m) { set({ modal: m }); },
  close() { set({ modal: null }); },
  toast(text, kind = 'info') {
    const t = { id: toastId++, text, kind };
    set({ toasts: [...get().toasts, t].slice(-4) });
    setTimeout(() => set({ toasts: get().toasts.filter((x) => x.id !== t.id) }), 3800);
  },
  setPrefs(p) {
    const prefs = { ...get().prefs, ...p };
    setSoundEnabled(prefs.sound);
    set({ prefs });
    void setPrefs(prefs);
  },

  startLive() {
    const g = get().game;
    if (!g) return;
    const game = userGameToday(g);
    if (!game) return;
    const home = g.teams[game.home], away = g.teams[game.away];
    const rv = isRivalry(game.home, game.away);
    const sim = new GameSim(simSetup(g, home), simSetup(g, away), {
      neutral: game.neutral, pbp: true, crowd: clamp(home.hype / 100 + (rv ? 0.25 : 0), 0, 1), tourney: game.type === 'ncaa',
      flavor: (() => { const l = loreOf(home.id); return l ? { crowd: l.crowd, closer: l.closer } : undefined; })(),
    });
    const userSide = game.home === g.user.teamId ? 0 : 1;
    sim.userTeam = userSide;
    set({ live: { game, sim, userSide, spread: spread(g, game.home, game.away, game.neutral) }, modal: null });
  },

  finishLive(box) {
    const { live } = get();
    if (!live) return;
    get().mutate((g) => {
      const game = g.schedule.find((x) => x.id === live.game.id);
      if (game && !game.played) applyGameResult(g, game, box);
    });
    set({ live: null });
  },

  abandonLive() { set({ live: null }); },

  quickSimUserGame() {
    get().mutate((g) => {
      const game = userGameToday(g);
      if (game) applyGameResult(g, game, simGame(g, game));
    });
    set({ modal: null });
  },

  async advance(mode) {
    const g = get().game;
    if (!g || get().busy) return;
    if (!['preseason', 'regular', 'confTourney', 'selection', 'ncaa'].includes(g.phase)) {
      await get().continueOffseason();
      return;
    }
    const startPhase = g.phase;
    const startWeek = g.calendar[g.day]?.week ?? 0;
    const autoUser = mode === 'week' || mode === 'phase' || mode === 'season';
    let days = 0;
    const maxDays = mode === 'day' ? 1 : 80;
    const showBusy = mode !== 'day';
    try {
    while (days < maxDays) {
      const ug = userGameToday(g);
      if (ug && !ug.played) {
        if (!autoUser) break; // stop so the user can play (or quick-sim) their game
        applyGameResult(g, ug, simGame(g, ug));
        g.user.press = null; // skip pressers during bulk sims
      }
      processDay(g);
      nextDay(g);
      days++;
      if (showBusy) {
        set({ busy: { label: `Simulating · ${g.calendar[g.day]?.label ?? ''}`, progress: Math.min(0.98, days / (mode === 'week' ? 3 : mode === 'nextGame' ? 4 : 40)) }, tick: get().tick + 1 });
        await yieldUI();
      }
      const phase = g.phase as GameState['phase'];
      if (phase === 'selection' || phase === 'seasonEnd') break;
      if (mode === 'day') break;
      if (mode === 'nextGame' && userGameToday(g)) break;
      if (mode === 'week' && (g.calendar[g.day]?.week ?? 0) !== startWeek) break;
      if (mode === 'phase' && phase !== startPhase) break;
      if (mode !== 'season' && g.inbox.some((i) => !i.resolved && i.priority && i.day === g.day)) break;
    }
    } catch (e) {
      console.error('Advance failed', e);
      get().toast(`Simulation error: ${(e as Error).message}`, 'bad');
    } finally {
      set({ busy: null, tick: get().tick + 1 });
    }
    await get().save();
  },

  async continueOffseason() {
    const g = get().game;
    if (!g) return;
    if (g.phase === 'seasonEnd' && g.user.fired && g.user.offers.length) {
      get().toast('You were fired — accept a job offer to continue.', 'bad');
      return;
    }
    const poach = g.phase === 'seasonEnd' && g.inbox.find((i) => !i.resolved && i.choices.some((c) => c.staffPoach));
    if (poach) {
      set({ screen: 'inbox', screenArg: poach.id });
      get().toast(`${poach.from} needs an answer about the ${poach.subject.split(' wants')[0]} job before you move on.`, 'bad');
      return;
    }
    set({ busy: { label: g.phase === 'portal' ? (g.portal?.day ? `Portal day ${g.portal.day} — decisions coming in…` : 'Opening the portal window…') : 'Processing offseason…', progress: 0.5 } });
    await yieldUI();
    try {
      advanceOffseason(g);
    } catch (e) {
      console.error('Offseason step failed', e);
      get().toast(`Offseason error: ${(e as Error).message}`, 'bad');
    }
    set({ busy: null, tick: get().tick + 1, screen: g.phase === 'preseason' ? 'home' : 'offseason' });
    await get().save();
  },

  acceptJob(teamId) {
    get().mutate((g) => takeJob(g, teamId));
  },

  dismissMoment() {
    get().mutate((g) => {
      const m = g.user.moments.shift();
      // the Selection Sunday presser waits until the show is over
      if (m?.kind === 'selection' && m.press && !g.user.press) g.user.press = m.press;
    }, { save: false });
  },
}));

/** Selector helper: re-render on tick */
export function useTick() { return useGame((s) => s.tick); }
export function useGameState(): GameState {
  useTick();
  return useGame.getState().game!;
}
