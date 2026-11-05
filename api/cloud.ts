// Cloud saves (Vercel Function). Saves are gzipped JSON in the private Blob store, filed under
// each player's private cloud code:  saves/<CODE>/<saveId>.json.gz  plus saves/<CODE>/index.json
//
//   GET    /api/cloud?code=CODE            list your cloud saves
//   GET    /api/cloud?code=CODE&id=SAVE    download one (gzipped)
//   POST   /api/cloud?code=CODE&id=SAVE    upload one (gzipped body, metadata in x-save-meta)
//   DELETE /api/cloud?code=CODE&id=SAVE    delete one
import { del, get, put } from '@vercel/blob';

const CODE = /^[A-Z0-9]{8,16}$/;
const ID = /^[A-Za-z0-9_-]{4,64}$/;
const MAX = 4.2 * 1024 * 1024; // function request bodies top out at 4.5 MB

interface Meta { id: string; name: string; school: string; season: string; record: string; teamId: string; colors: [string, string]; coach: string; updatedAt: number; size: number }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

function params(request: Request) {
  const u = new URL(request.url);
  const code = (u.searchParams.get('code') ?? '').toUpperCase();
  const id = u.searchParams.get('id') ?? '';
  return { code, id, okCode: CODE.test(code), okId: ID.test(id) };
}

async function readIndex(code: string): Promise<Meta[]> {
  const r = await get(`saves/${code}/index.json`, { access: 'private', useCache: false }).catch(() => null);
  if (!r || !r.stream) return [];
  try { return JSON.parse(await new Response(r.stream).text()) as Meta[]; } catch { return []; }
}
async function writeIndex(code: string, list: Meta[]) {
  await put(`saves/${code}/index.json`, JSON.stringify(list), { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json' });
}

export async function GET(request: Request) {
  const { code, id, okCode, okId } = params(request);
  if (!okCode) return json({ error: 'Bad cloud code' }, 400);
  if (!id) return json({ saves: (await readIndex(code)).sort((a, b) => b.updatedAt - a.updatedAt) });
  if (!okId) return json({ error: 'Bad save id' }, 400);
  const r = await get(`saves/${code}/${id}.json.gz`, { access: 'private', useCache: false }).catch(() => null);
  if (!r || !r.stream) return json({ error: 'Not found' }, 404);
  return new Response(r.stream, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const { code, id, okCode, okId } = params(request);
  if (!okCode || !okId) return json({ error: 'Bad cloud code or save id' }, 400);
  const body = await request.arrayBuffer();
  if (!body.byteLength) return json({ error: 'Empty save' }, 400);
  if (body.byteLength > MAX) return json({ error: 'This save is too big for cloud saves' }, 413);
  let meta: Partial<Meta> = {};
  try { meta = JSON.parse(decodeURIComponent(request.headers.get('x-save-meta') ?? '{}')); } catch { /* keep going without it */ }
  await put(`saves/${code}/${id}.json.gz`, body, { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/octet-stream' });
  const list = (await readIndex(code)).filter((m) => m.id !== id);
  list.unshift({
    id, name: String(meta.name ?? 'Dynasty').slice(0, 60), school: String(meta.school ?? ''), season: String(meta.season ?? ''), record: String(meta.record ?? ''),
    teamId: String(meta.teamId ?? ''), colors: (Array.isArray(meta.colors) ? meta.colors.slice(0, 2) : ['#333333', '#999999']) as [string, string],
    coach: String(meta.coach ?? ''), updatedAt: Date.now(), size: body.byteLength,
  });
  await writeIndex(code, list.slice(0, 50));
  return json({ ok: true, size: body.byteLength });
}

export async function DELETE(request: Request) {
  const { code, id, okCode, okId } = params(request);
  if (!okCode || !okId) return json({ error: 'Bad cloud code or save id' }, 400);
  await del(`saves/${code}/${id}.json.gz`).catch(() => undefined);
  await writeIndex(code, (await readIndex(code)).filter((m) => m.id !== id));
  return json({ ok: true });
}
