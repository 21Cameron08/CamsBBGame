// Online league server. Bundled into api/league.js (npm run build:api) so the game engine runs
// on Vercel. Storage is abstracted so the same code runs against Vercel Blob in production and an
// in-memory store in tests.
//
// A league is two blobs:  leagues/<ID>/state.json.gz  (the shared world) and  leagues/<ID>/meta.json
// (members, ready flags, turn number). Members play their turn on their own device and submit;
// the server merges only what that coach owns, so friends can play at the same time. When everyone
// is ready (or the commissioner says so) the server sims one week, or one offseason step.
import { gzipSync, gunzipSync } from 'node:zlib';
import type { GameState, Recruit } from '../src/engine/types';
import { processDay, nextDay } from '../src/engine/season';
import { advanceOffseason, takeJob } from '../src/engine/offseason';
import { addHumanCoach } from '../src/engine/world';
import { ensureLeague, humanCoachIds, isHuman, switchHuman } from '../src/engine/league';
import { ARCHETYPE_INFO } from '../src/engine/coach';
import type { CoachArchetype } from '../src/engine/types';

// ---------------- storage ----------------
export interface Stored { body: Uint8Array; etag: string }
export interface Store {
  get(path: string): Promise<Stored | null>;
  /** write; with ifMatch, fails (returns false) if someone else wrote first */
  put(path: string, body: Uint8Array | string, ifMatch?: string): Promise<boolean>;
}

// ---------------- league metadata ----------------
export interface Member { coachId: string; name: string; teamId: string; token: string; ready: boolean; joined: number }
export interface Meta {
  id: string; name: string; created: number; commissioner: string;
  /** bumps every time the server advances; submissions must be based on the current turn */
  version: number;
  label: string; phase: string; season: number;
  members: Member[];
  lastAdvanced?: number;
  log: { at: number; text: string }[];
}
const IN_SEASON = ['preseason', 'regular', 'confTourney', 'selection', 'ncaa'];
const ID_RE = /^[A-Z0-9]{6}$/;
const TOKEN_RE = /^[a-z0-9]{24}$/;
const MAX_MEMBERS = 8;
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const rand = (n: number, a = ALPHA) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => a[b % a.length]).join('');
const newToken = () => rand(24, 'abcdefghijklmnopqrstuvwxyz0123456789');

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const fail = (msg: string, status = 400) => json({ error: msg }, status);
const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

async function loadMeta(store: Store, id: string): Promise<{ meta: Meta; etag: string } | null> {
  const r = await store.get(`leagues/${id}/meta.json`);
  return r ? { meta: JSON.parse(dec(r.body)) as Meta, etag: r.etag } : null;
}
async function loadState(store: Store, id: string): Promise<{ state: GameState; etag: string } | null> {
  const r = await store.get(`leagues/${id}/state.json.gz`);
  return r ? { state: JSON.parse(dec(gunzipSync(r.body))) as GameState, etag: r.etag } : null;
}
const packState = (s: GameState) => new Uint8Array(gzipSync(enc(JSON.stringify(s)), { level: 6 }));
const publicMeta = (m: Meta) => ({ ...m, members: m.members.map(({ token: _t, ...rest }) => rest) });
function labelOf(s: GameState) {
  const day = s.calendar[s.day]?.label ?? '';
  const phase = ({ preseason: 'Preseason', regular: 'Regular season', confTourney: 'Championship Week', selection: 'Selection Sunday', ncaa: 'NCAA Tournament', seasonEnd: 'Season over', declarations: 'NBA Draft declarations', portal: 'Transfer portal', signing: 'Signing day', draft: 'NBA Draft', progression: 'Summer workouts', scheduling: 'Scheduling' } as Record<string, string>)[s.phase] ?? s.phase;
  return IN_SEASON.includes(s.phase) ? `${phase} · ${day}` : s.phase === 'portal' && s.portal?.day ? `${phase} · day ${s.portal.day}` : phase;
}
function syncMeta(meta: Meta, s: GameState) {
  meta.phase = s.phase; meta.season = s.season; meta.label = labelOf(s);
  for (const m of meta.members) {
    const c = s.coaches[m.coachId];
    if (c?.teamId) m.teamId = c.teamId;
  }
}
function note(meta: Meta, text: string) { meta.log = [{ at: Date.now(), text }, ...meta.log].slice(0, 50); }

// ---------------- merging a member's turn ----------------
/** copy into the server's world only what this coach owns */
export function mergeTurn(S: GameState, U: GameState, coachId: string): string | null {
  if (U.user.coachId !== coachId) return 'That save belongs to a different coach.';
  switchHuman(S, coachId);
  const team = S.user.teamId;
  if (U.user.teamId !== team) return 'Your school changed. Reload the league.';
  // his per-coach state
  S.user = U.user; S.inbox = U.inbox; S.staff = U.staff; S.development = U.development; S.locker = U.locker;
  S.scheduling = U.scheduling; S.radio = U.radio; S.playbook = U.playbook;
  if (S.portal && U.portal) Object.assign(S.portal, { hours: U.portal.hours, hoursMax: U.portal.hoursMax, calls: U.portal.calls, lastResults: U.portal.lastResults });
  // his program, coach and roster
  const oldRoster = new Set(S.teams[team].roster);
  S.teams[team] = U.teams[team];
  S.coaches[coachId] = U.coaches[coachId];
  for (const id of S.teams[team].roster) if (U.players[id]) S.players[id] = U.players[id];
  for (const id of oldRoster) if (!S.teams[team].roster.includes(id)) { if (U.players[id]) S.players[id] = U.players[id]; else delete S.players[id]; }
  if (U.build?.[team]) (S.build ??= {})[team] = U.build[team];
  // his recruiting effort
  for (const [id, r] of Object.entries(S.recruits)) {
    const ur: Recruit | undefined = U.recruits[id];
    if (!ur) continue;
    const mine = ur.schools.find((x) => x.teamId === team);
    r.schools = [...r.schools.filter((x) => x.teamId !== team), ...(mine ? [mine] : [])];
  }
  // his portal pursuit
  if (S.portal && U.portal) {
    for (const [id, e] of Object.entries(S.portal.entries)) {
      const ue = U.portal.entries[id];
      if (!ue) continue;
      e.offers = [...e.offers.filter((o) => o.teamId !== team), ...ue.offers.filter((o) => o.teamId === team)];
      if (ue.rel?.[team] != null) e.rel[team] = ue.rel[team];
      if (ue.visits?.includes(team) && !e.visits.includes(team)) e.visits.push(team);
    }
  }
  return null;
}

/** one turn: a week of the season, or one offseason step */
export function runTurn(S: GameState): string {
  if (IN_SEASON.includes(S.phase)) {
    const startWeek = S.calendar[S.day]?.week ?? 0;
    for (let d = 0; d < 30; d++) {
      processDay(S);
      nextDay(S);
      if (S.phase === 'selection' || S.phase === 'seasonEnd') break;
      if ((S.calendar[S.day]?.week ?? 0) !== startWeek) break;
    }
    return labelOf(S);
  }
  if (S.phase === 'seasonEnd') {
    // fired coaches pick a new job before the offseason moves on
    for (const c of humanCoachIds(S)) {
      switchHuman(S, c);
      if (S.user.fired && S.user.offers.length) return `waiting:${c}`;
    }
  }
  advanceOffseason(S);
  return labelOf(S);
}

// ---------------- the API ----------------
export function leagueHandlers(store: Store) {
  /** load, change and save the world and the metadata, retrying if someone else saved first */
  async function update(id: string, fn: (s: GameState, meta: Meta) => Response | null): Promise<Response> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const st = await loadState(store, id), mt = await loadMeta(store, id);
      if (!st || !mt) return fail('No league with that code.', 404);
      const res = fn(st.state, mt.meta);
      if (res && res.status >= 400) return res;
      syncMeta(mt.meta, st.state);
      if (!(await store.put(`leagues/${id}/state.json.gz`, packState(st.state), st.etag))) continue;
      await store.put(`leagues/${id}/meta.json`, JSON.stringify(mt.meta));
      return res ?? json({ ok: true, meta: publicMeta(mt.meta) });
    }
    return fail('The league is busy. Try again in a moment.', 409);
  }
  const member = (meta: Meta, token: string | null) => (token && TOKEN_RE.test(token) ? meta.members.find((m) => m.token === token) : undefined);

  return {
    async handle(request: Request): Promise<Response> {
      const u = new URL(request.url);
      const action = u.searchParams.get('action') ?? '';
      const id = (u.searchParams.get('league') ?? '').toUpperCase();
      const token = u.searchParams.get('token');
      try {
        // start a league from the commissioner's dynasty
        if (action === 'create' && request.method === 'POST') {
          const name = (decodeURIComponent(request.headers.get('x-league-name') ?? '') || 'Online League').slice(0, 40);
          const s = JSON.parse(dec(gunzipSync(new Uint8Array(await request.arrayBuffer())))) as GameState;
          if (!s?.teams || !s.user?.teamId) return fail('That is not a dynasty save.');
          if (s.league && s.league.humans.length > 1) return fail('That dynasty is already an online league.');
          ensureLeague(s);
          let lid = rand(6);
          for (let i = 0; i < 5 && (await store.get(`leagues/${lid}/meta.json`)); i++) lid = rand(6);
          const c = s.coaches[s.user.coachId];
          const me: Member = { coachId: s.user.coachId, name: `${c.first} ${c.last}`, teamId: s.user.teamId, token: newToken(), ready: false, joined: Date.now() };
          const meta: Meta = { id: lid, name, created: Date.now(), commissioner: me.coachId, version: 1, label: '', phase: '', season: s.season, members: [me], log: [] };
          note(meta, `${me.name} started the league with ${s.teams[me.teamId].school}.`);
          syncMeta(meta, s);
          await store.put(`leagues/${lid}/state.json.gz`, packState(s));
          await store.put(`leagues/${lid}/meta.json`, JSON.stringify(meta));
          return json({ league: lid, token: me.token, coachId: me.coachId, meta: publicMeta(meta) });
        }
        if (!ID_RE.test(id)) return fail('League codes are 6 letters and numbers.');

        if (action === 'meta') {
          const mt = await loadMeta(store, id);
          if (!mt) return fail('No league with that code.', 404);
          const me = member(mt.meta, token);
          return json({ meta: publicMeta(mt.meta), me: me ? me.coachId : null });
        }

        if (action === 'join' && request.method === 'POST') {
          const body = await request.json() as { teamId?: string; coach?: { first?: string; last?: string; age?: number; archetype?: string } };
          const teamId = String(body.teamId ?? '');
          const co = body.coach ?? {};
          const first = String(co.first ?? '').trim().slice(0, 20), last = String(co.last ?? '').trim().slice(0, 20);
          const archetype = (String(co.archetype ?? 'Recruiter') in ARCHETYPE_INFO ? co.archetype : 'Recruiter') as CoachArchetype;
          if (!first || !last) return fail('Enter your coach’s name.');
          let out: Member | undefined;
          const res = await update(id, (s, meta) => {
            if (meta.members.length >= MAX_MEMBERS) return fail(`Leagues hold up to ${MAX_MEMBERS} coaches.`);
            if (!s.teams[teamId]) return fail('Pick a school.');
            if (isHuman(s, teamId)) return fail(`${s.teams[teamId].school} already has a coach in this league.`);
            const coachId = addHumanCoach(s, teamId, { first, last, age: Math.max(28, Math.min(70, Number(co.age) || 40)), archetype });
            out = { coachId, name: `${first} ${last}`, teamId, token: newToken(), ready: false, joined: Date.now() };
            meta.members.push(out);
            note(meta, `${out.name} joined as head coach at ${s.teams[teamId].school}.`);
            return null;
          });
          if (res.status >= 400 || !out) return res;
          return json({ token: out.token, coachId: out.coachId, meta: (await res.json()).meta });
        }

        const mt = await loadMeta(store, id);
        if (!mt) return fail('No league with that code.', 404);
        const me = member(mt.meta, token);
        if (!me) return fail('You are not a member of this league.', 403);

        // download the world, with you as the coach at the keyboard
        if (action === 'state') {
          const st = await loadState(store, id);
          if (!st) return fail('No league with that code.', 404);
          switchHuman(st.state, me.coachId);
          return new Response(packState(st.state), { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store', 'x-version': String(mt.meta.version) } });
        }

        // upload your turn
        if (action === 'submit' && request.method === 'POST') {
          const base = Number(u.searchParams.get('base'));
          const ready = u.searchParams.get('ready') === '1';
          const U = JSON.parse(dec(gunzipSync(new Uint8Array(await request.arrayBuffer())))) as GameState;
          return update(id, (s, meta) => {
            if (base !== meta.version) return fail('The league has moved on since you loaded it. Reload to get the latest week.', 409);
            const err = mergeTurn(s, U, me.coachId);
            if (err) return fail(err, 409);
            const m = meta.members.find((x) => x.coachId === me.coachId)!;
            m.ready = ready;
            return null;
          });
        }

        if (action === 'ready' && request.method === 'POST') {
          const ready = u.searchParams.get('ready') === '1';
          return update(id, (_s, meta) => { meta.members.find((x) => x.coachId === me.coachId)!.ready = ready; return null; });
        }

        // take a job offer after being fired (or a better job)
        if (action === 'job' && request.method === 'POST') {
          const teamId = u.searchParams.get('teamId') ?? '';
          return update(id, (s, meta) => {
            switchHuman(s, me.coachId);
            if (!s.user.offers.some((o) => o.teamId === teamId)) return fail('That job isn’t on the table.');
            if (isHuman(s, teamId)) return fail('Another coach in the league already has that job.');
            takeJob(s, teamId);
            note(meta, `${me.name} took the ${s.teams[teamId].school} job.`);
            return null;
          });
        }

        // play the next week (or offseason step)
        if (action === 'advance' && request.method === 'POST') {
          const allReady = mt.meta.members.every((m) => m.ready);
          if (!allReady && me.coachId !== mt.meta.commissioner) return fail('Waiting on every coach to click Ready (or the commissioner).', 403);
          let label = '';
          const res = await update(id, (s, meta) => {
            const out = runTurn(s);
            if (out.startsWith('waiting:')) {
              const who = meta.members.find((m) => m.coachId === out.slice(8));
              return fail(`Waiting on ${who?.name ?? 'a coach'} to accept a job offer.`, 409);
            }
            label = out;
            meta.version++;
            meta.lastAdvanced = Date.now();
            for (const m of meta.members) m.ready = false;
            note(meta, `Advanced to ${out}.`);
            return null;
          });
          if (res.status >= 400) return res;
          return json({ ok: true, label, meta: (await res.json()).meta });
        }

        return fail('Unknown action.');
      } catch (e) {
        return fail(`League server error: ${(e as Error).message}`, 500);
      }
    },
  };
}
