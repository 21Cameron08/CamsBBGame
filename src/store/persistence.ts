// Save slots in IndexedDB + import/export of saves and mod files.
import { get, set, del } from 'idb-keyval';
import type { GameState } from '../engine/types';
import type { TeamDef } from '../data/types';
import { seasonLabel } from '../engine/calendar';

export interface SaveMeta {
  id: string;
  name: string;
  teamId: string;
  school: string;
  colors: [string, string];
  coach: string;
  season: string;
  phase: string;
  record: string;
  updatedAt: number;
}

const INDEX = 'saves:index';

export async function listSaves(): Promise<SaveMeta[]> {
  try {
    return ((await get<SaveMeta[]>(INDEX)) ?? []).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function metaFor(g: GameState): SaveMeta {
  const t = g.teams[g.user.teamId];
  const c = g.coaches[g.user.coachId];
  return {
    id: g.saveId, name: g.saveName, teamId: t.id, school: t.school, colors: t.colors,
    coach: `${c.first} ${c.last}`, season: seasonLabel(g.season), phase: g.phase,
    record: `${t.record.w}-${t.record.l}`, updatedAt: Date.now(),
  };
}

export async function writeSave(g: GameState): Promise<void> {
  g.updatedAt = Date.now();
  await set(`save:${g.saveId}`, g);
  const idx = (await listSaves()).filter((m) => m.id !== g.saveId);
  idx.unshift(metaFor(g));
  await set(INDEX, idx);
}

export async function readSave(id: string): Promise<GameState | undefined> {
  return get<GameState>(`save:${id}`);
}

export async function deleteSave(id: string): Promise<void> {
  await del(`save:${id}`);
  const idx = (await listSaves()).filter((m) => m.id !== id);
  await set(INDEX, idx);
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function readJsonFile<T = unknown>(file: File): Promise<T> {
  const text = await file.text();
  return JSON.parse(text) as T;
}

export function validateSave(x: unknown): x is GameState {
  const g = x as GameState;
  return !!g && typeof g === 'object' && typeof g.season === 'number' && !!g.teams && !!g.players && !!g.user && !!g.calendar;
}

// ---------------- Mods ----------------
export type TeamMods = Record<string, Partial<TeamDef>>;
const MODS_KEY = 'mods:teams';

export async function getTeamMods(): Promise<TeamMods> {
  try { return (await get<TeamMods>(MODS_KEY)) ?? {}; } catch { return {}; }
}
export async function setTeamMods(m: TeamMods) { await set(MODS_KEY, m); }

/** Optional file-based mod: public/mods/teams.json (same shape as TeamMods) */
export async function fetchPublicMods(): Promise<TeamMods> {
  try {
    const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './';
    const res = await fetch(`${base}mods/teams.json`, { cache: 'no-cache' });
    if (!res.ok) return {};
    const data = await res.json();
    return data && typeof data === 'object' ? (data.teams ?? data) as TeamMods : {};
  } catch {
    return {};
  }
}

export async function allTeamMods(): Promise<TeamMods> {
  const [pub, mine] = await Promise.all([fetchPublicMods(), getTeamMods()]);
  const out: TeamMods = { ...pub };
  for (const [k, v] of Object.entries(mine)) out[k] = { ...(out[k] ?? {}), ...v };
  return out;
}

export interface Prefs { sound: boolean; reduceMotion: boolean; }
export async function getPrefs(): Promise<Prefs> {
  try { return { sound: true, reduceMotion: false, ...((await get<Prefs>('prefs')) ?? {}) }; } catch { return { sound: true, reduceMotion: false }; }
}
export async function setPrefs(p: Prefs) { await set('prefs', p); }
