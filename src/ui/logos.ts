// Logo resolution: user-uploaded (IndexedDB) → public/assets/logos/<id>.(svg|png|webp) → generated badge.
import { get, set, del, keys } from 'idb-keyval';

const uploaded = new Map<string, string>(); // teamId -> data URL
const fileHits = new Map<string, string>(); // teamId -> resolved URL
const fileMiss = new Set<string>();
let manifest: Set<string> | null = null;
const listeners = new Set<() => void>();
export let logoVersion = 0;

export function onLogosChanged(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }
function bump() { logoVersion++; listeners.forEach((f) => f()); }

const BASE = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './';
export const LOGO_DIR = `${BASE}assets/logos/`;
const EXTS = ['svg', 'png', 'webp'];

export async function initLogos() {
  try {
    for (const k of await keys()) {
      if (typeof k === 'string' && k.startsWith('logo:')) {
        const v = await get<string>(k);
        if (v) uploaded.set(k.slice(5), v);
      }
    }
  } catch { /* ignore */ }
  // Optional manifest: public/assets/logos/manifest.json -> ["duke.png", ...] avoids probing
  try {
    const res = await fetch(`${LOGO_DIR}manifest.json`, { cache: 'no-cache' });
    if (res.ok) {
      const list = (await res.json()) as string[];
      manifest = new Set(list);
      for (const f of list) {
        const id = f.replace(/\.(svg|png|webp|jpg|jpeg)$/i, '');
        fileHits.set(id, `${LOGO_DIR}${f}`);
      }
    }
  } catch { /* no manifest */ }
  bump();
}

export function uploadedLogo(teamId: string): string | undefined { return uploaded.get(teamId); }
export function knownFileLogo(teamId: string): string | undefined { return fileHits.get(teamId); }
export function hasManifest() { return manifest != null; }

/** Probe for a logo file once (when no manifest). Resolves URL or null. */
const probing = new Map<string, Promise<string | null>>();
export function probeLogo(teamId: string): Promise<string | null> {
  if (fileHits.has(teamId)) return Promise.resolve(fileHits.get(teamId)!);
  if (fileMiss.has(teamId) || manifest) return Promise.resolve(null);
  if (probing.has(teamId)) return probing.get(teamId)!;
  const p = (async () => {
    for (const ext of EXTS) {
      const url = `${LOGO_DIR}${teamId}.${ext}`;
      const ok = await new Promise<boolean>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth > 0);
        img.onerror = () => resolve(false);
        img.src = url;
      });
      if (ok) { fileHits.set(teamId, url); return url; }
    }
    fileMiss.add(teamId);
    return null;
  })();
  probing.set(teamId, p);
  return p;
}

export async function saveUploadedLogo(teamId: string, dataUrl: string) {
  uploaded.set(teamId, dataUrl);
  await set(`logo:${teamId}`, dataUrl);
  bump();
}
export async function removeUploadedLogo(teamId: string) {
  uploaded.delete(teamId);
  await del(`logo:${teamId}`);
  bump();
}
export function uploadedLogoIds(): string[] { return [...uploaded.keys()]; }

export function fileToDataUrl(file: File, maxSize = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const src = String(reader.result);
      if (file.type === 'image/svg+xml') { resolve(src); return; }
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => resolve(src);
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}
