// Online leagues (client side): talk to the league server (api/league.js) and remember which
// leagues you belong to. Your membership key lives in this browser only.
import type { GameState } from '../engine/types';
import { gzip, gunzip } from './cloud';

export interface OnlineSession { league: string; token: string; coachId: string; name: string; version: number }
export interface LeagueMember { coachId: string; name: string; teamId: string; ready: boolean; joined: number }
export interface LeagueMeta {
  id: string; name: string; created: number; commissioner: string; version: number; label: string; phase: string; season: number;
  members: LeagueMember[]; lastAdvanced?: number; log: { at: number; text: string }[];
}

const KEY = 'cd.online';
export const saveIdFor = (league: string) => `online-${league}`;

function readAll(): Record<string, OnlineSession> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, OnlineSession>; } catch { return {}; }
}
function writeAll(all: Record<string, OnlineSession>) { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* ignore */ } }
export function sessionFor(saveId: string): OnlineSession | null { return readAll()[saveId] ?? null; }
export function rememberSession(s: OnlineSession) { const all = readAll(); all[saveIdFor(s.league)] = s; writeAll(all); }
export function forgetSession(league: string) { const all = readAll(); delete all[saveIdFor(league)]; writeAll(all); }
export function mySessions(): OnlineSession[] { return Object.values(readAll()); }

async function call(q: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try { res = await fetch(`/api/league?${q}`, init); } catch { throw new Error('Could not reach the league server. Check your connection.'); }
  if (!res.ok) {
    let msg = `League server error (${res.status})`;
    try { msg = (await res.json()).error ?? msg; } catch { if (res.status === 404) msg = 'Online leagues only work on the online version of the game.'; }
    const e = new Error(msg) as Error & { status?: number };
    e.status = res.status;
    throw e;
  }
  return res;
}

/** start a league from the dynasty you're playing */
export async function createLeague(g: GameState, name: string): Promise<OnlineSession> {
  const res = await call('action=create', { method: 'POST', body: await gzip(JSON.stringify(g)), headers: { 'content-type': 'application/octet-stream', 'x-league-name': encodeURIComponent(name) } });
  const j = await res.json() as { league: string; token: string; coachId: string; meta: LeagueMeta };
  const s: OnlineSession = { league: j.league, token: j.token, coachId: j.coachId, name: j.meta.name, version: j.meta.version };
  rememberSession(s);
  return s;
}
export async function joinLeague(code: string, teamId: string, coach: { first: string; last: string; age: number; archetype: string }): Promise<OnlineSession> {
  const league = code.trim().toUpperCase();
  const res = await call(`action=join&league=${league}`, { method: 'POST', body: JSON.stringify({ teamId, coach }), headers: { 'content-type': 'application/json' } });
  const j = await res.json() as { token: string; coachId: string; meta: LeagueMeta };
  const s: OnlineSession = { league, token: j.token, coachId: j.coachId, name: j.meta.name, version: j.meta.version };
  rememberSession(s);
  return s;
}
export async function leagueMeta(code: string, token?: string): Promise<LeagueMeta> {
  const res = await call(`action=meta&league=${code.trim().toUpperCase()}${token ? `&token=${token}` : ''}`);
  return (await res.json()).meta as LeagueMeta;
}
/** the latest week, with you as the coach at the keyboard */
export async function downloadLeague(s: OnlineSession): Promise<GameState> {
  const res = await call(`action=state&league=${s.league}&token=${s.token}`);
  const version = Number(res.headers.get('x-version') ?? s.version);
  const g = JSON.parse(await gunzip(await res.blob())) as GameState;
  g.saveId = saveIdFor(s.league);
  g.saveName = `🌐 ${s.name}`;
  rememberSession({ ...s, version });
  return g;
}
export async function submitTurn(s: OnlineSession, g: GameState, ready: boolean): Promise<LeagueMeta> {
  const res = await call(`action=submit&league=${s.league}&token=${s.token}&base=${s.version}&ready=${ready ? 1 : 0}`, { method: 'POST', body: await gzip(JSON.stringify(g)), headers: { 'content-type': 'application/octet-stream' } });
  return (await res.json()).meta as LeagueMeta;
}
export async function setReady(s: OnlineSession, ready: boolean): Promise<LeagueMeta> {
  const res = await call(`action=ready&league=${s.league}&token=${s.token}&ready=${ready ? 1 : 0}`, { method: 'POST' });
  return (await res.json()).meta as LeagueMeta;
}
export async function advanceLeague(s: OnlineSession): Promise<{ label: string; meta: LeagueMeta }> {
  const res = await call(`action=advance&league=${s.league}&token=${s.token}`, { method: 'POST' });
  return await res.json() as { label: string; meta: LeagueMeta };
}
export async function takeJobOnline(s: OnlineSession, teamId: string): Promise<void> {
  await call(`action=job&league=${s.league}&token=${s.token}&teamId=${encodeURIComponent(teamId)}`, { method: 'POST' });
}
