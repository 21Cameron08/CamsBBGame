// Vercel Function entry for the league server: Vercel Blob as storage.
// Built into api/league.js by `npm run build:api` (the engine is bundled in).
import { BlobPreconditionFailedError, get, put } from '@vercel/blob';
import { leagueHandlers, type Store } from './league';

const store: Store = {
  async get(path) {
    const r = await get(path, { access: 'private', useCache: false }).catch(() => null);
    if (!r || r.statusCode !== 200 || !r.stream) return null;
    return { body: new Uint8Array(await new Response(r.stream).arrayBuffer()), etag: r.blob.etag };
  },
  async put(path, body, ifMatch) {
    try {
      await put(path, typeof body === 'string' ? body : Buffer.from(body), {
        access: 'private', allowOverwrite: true, addRandomSuffix: false,
        contentType: typeof body === 'string' ? 'application/json' : 'application/octet-stream',
        ...(ifMatch ? { ifMatch } : {}),
      });
      return true;
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError) return false;
      throw e;
    }
  },
};

const h = leagueHandlers(store);
export function GET(request: Request) { return h.handle(request); }
export function POST(request: Request) { return h.handle(request); }
