// Cloud saves: gzip a dynasty in the browser and keep it in the private Blob store (see api/cloud.ts),
// filed under a private cloud code that lives in this browser. Enter the same code on another
// device to see and load the same saves.
import type { GameState } from '../engine/types';
import { metaFor } from './persistence';

export interface CloudMeta { id: string; name: string; school: string; season: string; record: string; teamId: string; colors: [string, string]; coach: string; updatedAt: number; size: number }

const KEY = 'cd.cloudCode';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L

export function cloudCode(): string {
  try {
    const c = localStorage.getItem(KEY);
    if (c && /^[A-Z0-9]{8,16}$/.test(c)) return c;
  } catch { /* storage blocked: fall through to a session code */ }
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const code = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  try { localStorage.setItem(KEY, code); } catch { /* ignore */ }
  return code;
}
export function setCloudCode(code: string): boolean {
  const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{8,16}$/.test(c)) return false;
  try { localStorage.setItem(KEY, c); } catch { /* ignore */ }
  return true;
}

async function gzip(text: string): Promise<Blob> {
  const s = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(s).blob();
}
async function gunzip(data: Blob): Promise<string> {
  const s = data.stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(s).text();
}

async function call(method: string, query: string, init: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch(`/api/cloud?${query}`, { method, ...init });
  } catch {
    throw new Error('Could not reach the cloud. Check your connection.');
  }
  if (res.status === 404 && !query.includes('id=')) throw new Error('Cloud saves only work on the online version of the game.');
  if (!res.ok) {
    let msg = `Cloud error (${res.status})`;
    try { msg = (await res.json()).error ?? msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return res;
}

export async function listCloud(code = cloudCode()): Promise<CloudMeta[]> {
  const res = await call('GET', `code=${code}`);
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('json')) throw new Error('Cloud saves only work on the online version of the game.');
  return ((await res.json()).saves ?? []) as CloudMeta[];
}

export async function uploadCloud(g: GameState, code = cloudCode()): Promise<number> {
  const body = await gzip(JSON.stringify(g));
  if (body.size > 4.2 * 1024 * 1024) throw new Error('This dynasty is too big for cloud saves right now. Export a save file instead.');
  const meta = metaFor(g);
  await call('POST', `code=${code}&id=${encodeURIComponent(g.saveId)}`, {
    body, headers: { 'content-type': 'application/octet-stream', 'x-save-meta': encodeURIComponent(JSON.stringify(meta)) },
  });
  return body.size;
}

export async function downloadCloud(id: string, code = cloudCode()): Promise<GameState> {
  const res = await call('GET', `code=${code}&id=${encodeURIComponent(id)}`);
  return JSON.parse(await gunzip(await res.blob())) as GameState;
}

export async function deleteCloud(id: string, code = cloudCode()) {
  await call('DELETE', `code=${code}&id=${encodeURIComponent(id)}`);
}
