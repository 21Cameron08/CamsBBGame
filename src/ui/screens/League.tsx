// Online League: start a league from this dynasty, or play your turn in one — submit, ready up,
// and (for the commissioner) advance the week. Also the Join panel used on the title screen.
import { useCallback, useEffect, useState } from 'react';
import { useGame, useGameState } from '../../store/gameStore';
import { Section, TeamLogo } from '../components/common';
import type { CoachArchetype, GameState } from '../../engine/types';
import { ARCHETYPE_INFO } from '../../engine/coach';
import { TEAMS } from '../../data/teams';
import {
  advanceLeague, createLeague, downloadLeague, joinLeague, leagueMeta, mySessions, setReady, submitTurn,
  type LeagueMeta, type OnlineSession,
} from '../../store/online';

const errText = (e: unknown) => (e as Error).message;

/** download the latest week and load it as the current game */
async function openLeague(s: OnlineSession) {
  const { loadState, toast, save, game } = useGame.getState();
  if (game) await save();
  const g = await downloadLeague(s);
  await loadState(g);
  toast(`Loaded ${s.name}.`, 'good');
}

export function LeagueScreen() {
  const g = useGameState();
  const online = useGame((s) => s.online);
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Play with friends</div>
          <div className="h1">🌐 Online League</div>
          <div className="muted" style={{ marginTop: 6 }}>Everyone coaches a school in the same world. Make your moves, submit your turn, and the league advances a week once everyone is ready.</div>
        </div>
      </div>
      {online ? <LeagueHome g={g} s={online} /> : <StartLeague g={g} />}
    </div>
  );
}

function StartLeague({ g }: { g: GameState }) {
  const { toast } = useGame.getState();
  const [name, setName] = useState(`${g.coaches[g.user.coachId]?.last ?? 'Our'} League`);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      await useGame.getState().save();
      const s = await createLeague(g, name.trim() || 'Online League');
      await openLeague(s);
      useGame.getState().nav('league');
      toast(`League created. Share the code ${s.league} with your friends.`, 'good');
    } catch (e) { toast(errText(e), 'bad'); }
    setBusy(false);
  };
  return (
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <Section title="Start a league with this dynasty">
        <div className="small muted" style={{ marginBottom: 10 }}>Your dynasty becomes the league's world: you keep coaching {g.teams[g.user.teamId].school}, and friends join with a code and take over other schools. Your single-player save stays as it is.</div>
        <label className="field">League name<input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
        <button className="btn primary mt" disabled={busy} onClick={() => void create()}>{busy ? 'Creating…' : '🌐 Create league'}</button>
        <div className="tiny muted mt">Best started in the preseason, before the first game.</div>
      </Section>
      <Section title="Join a league">
        <JoinLeague />
      </Section>
    </div>
  );
}

function LeagueHome({ g, s }: { g: GameState; s: OnlineSession }) {
  const { toast } = useGame.getState();
  const [meta, setMeta] = useState<LeagueMeta | null>(null);
  const [busy, setBusy] = useState('');
  const refresh = useCallback(async () => {
    try { setMeta(await leagueMeta(s.league, s.token)); } catch (e) { toast(errText(e), 'bad'); }
  }, [s.league, s.token, toast]);
  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 20000); return () => clearInterval(t); }, [refresh]);

  const me = meta?.members.find((m) => m.coachId === s.coachId);
  const behind = !!meta && meta.version > s.version;
  const isComm = meta?.commissioner === s.coachId;
  const waiting = meta?.members.filter((m) => !m.ready) ?? [];
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (e) {
      toast(errText(e), 'bad');
      if ((e as Error & { status?: number }).status === 409) await refresh();
    }
    setBusy('');
  };
  const submit = (ready: boolean) => run('submit', async () => {
    await useGame.getState().save();
    setMeta(await submitTurn(s, g, ready));
    toast(ready ? 'Turn submitted. You’re ready.' : 'Turn saved to the league.', 'good');
  });
  const unready = () => run('ready', async () => { setMeta(await setReady(s, false)); });
  const load = () => run('load', async () => { await openLeague(s); });
  const advance = () => run('advance', async () => {
    if (waiting.length && !confirm(`Not everyone is ready (${waiting.map((m) => m.name).join(', ')}). Advance anyway?`)) return;
    const r = await advanceLeague(s);
    toast(`League advanced: ${r.label}`, 'good');
    await openLeague(s);
  });
  const copy = async () => { try { await navigator.clipboard.writeText(s.league); toast('League code copied.', 'good'); } catch { /* ignore */ } };

  return (
    <div className="grid g-main" style={{ alignItems: 'start' }}>
      <div className="col" style={{ gap: 16 }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className="h2">{meta?.name ?? s.name}</div>
              <div className="small muted">{meta?.label ?? '…'} · turn {meta?.version ?? s.version}</div>
            </div>
            <div className="col" style={{ alignItems: 'flex-end', gap: 4 }}>
              <span className="tiny muted">League code</span>
              <span className="num" style={{ fontSize: 24, letterSpacing: '.15em' }}>{s.league}</span>
              <button className="btn sm ghost" onClick={() => void copy()}>Copy code</button>
            </div>
          </div>
          <div className="divider" />
          {behind ? (
            <div className="row" style={{ gap: 10 }}>
              <div style={{ flex: 1 }} className="small b">🆕 The league has moved on to {meta!.label}. Load it to see what happened and make your next moves.</div>
              <button className="btn primary" disabled={!!busy} onClick={load}>{busy === 'load' ? 'Loading…' : 'Load the new week'}</button>
            </div>
          ) : (
            <div className="col" style={{ gap: 10 }}>
              <div className="small">{me?.ready ? `✅ You’re ready.${waiting.length ? ` Waiting on ${waiting.map((m) => m.name).join(', ')}.` : ' Everyone is ready.'}` : 'Make your moves this week (recruiting, lineup, NIL, your Office), then submit your turn.'}</div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button className="btn primary" disabled={!!busy} onClick={() => void submit(true)}>{busy === 'submit' ? 'Submitting…' : me?.ready ? '✅ Resubmit turn' : '✅ Submit turn & ready'}</button>
                {me?.ready && <button className="btn" disabled={!!busy} onClick={() => void unready()}>Not ready yet</button>}
                <button className="btn ghost" disabled={!!busy} onClick={() => void refresh()}>↻ Refresh</button>
                {isComm && <button className="btn gold" disabled={!!busy} onClick={() => void advance()}>{busy === 'advance' ? 'Simulating…' : waiting.length ? '▶ Force advance' : '▶ Advance the league'}</button>}
              </div>
              {isComm && <div className="tiny muted">You're the commissioner: you can advance once everyone is ready, or force it if someone's holding things up.</div>}
            </div>
          )}
        </div>
        <Section title="Coaches">
          {(meta?.members ?? []).map((m) => {
            const t = g.teams[m.teamId];
            return (
              <div key={m.coachId} className="row" style={{ gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                {t && <TeamLogo team={t} size={34} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="b">{m.name}{m.coachId === s.coachId && <span className="pill accent" style={{ marginLeft: 6, fontSize: 9 }}>YOU</span>}{m.coachId === meta?.commissioner && <span className="pill gold" style={{ marginLeft: 6, fontSize: 9 }}>COMMISSIONER</span>}</div>
                  <div className="tiny muted">{t ? `${t.school} · ${t.record.w}-${t.record.l}` : m.teamId}</div>
                </div>
                <span className={`pill ${m.ready ? 'good' : ''}`}>{m.ready ? '✅ Ready' : '⏳ Playing'}</span>
              </div>
            );
          })}
        </Section>
      </div>
      <div className="col" style={{ gap: 16 }}>
        <Section title="League Log">
          {(meta?.log ?? []).slice(0, 15).map((l, i) => (
            <div key={i} className="small" style={{ padding: '5px 0', borderBottom: '1px solid var(--line)' }}>
              <span className="tiny muted">{new Date(l.at).toLocaleString()}</span><div>{l.text}</div>
            </div>
          ))}
        </Section>
        <Section title="How a week works">
          <div className="tiny muted col" style={{ gap: 6 }}>
            <span>1. Load the new week. Your games, press conferences and news arrive.</span>
            <span>2. Make your moves: recruiting, lineup, practice, NIL and your Office.</span>
            <span>3. Submit your turn and click Ready. You can resubmit until the league advances.</span>
            <span>4. When everyone is ready, the commissioner advances. The server plays everyone's games.</span>
          </div>
        </Section>
      </div>
    </div>
  );
}

/** join a league with a code (title screen and League page) */
export function JoinLeague() {
  const { toast } = useGame.getState();
  const [code, setCode] = useState('');
  const [meta, setMeta] = useState<LeagueMeta | null>(null);
  const [teamId, setTeamId] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [arch, setArch] = useState<CoachArchetype>('Recruiter');
  const [busy, setBusy] = useState(false);
  const mine = mySessions();
  const look = async () => {
    setBusy(true);
    try { setMeta(await leagueMeta(code)); } catch (e) { toast(errText(e), 'bad'); setMeta(null); }
    setBusy(false);
  };
  const taken = new Set(meta?.members.map((m) => m.teamId) ?? []);
  const schools = [...TEAMS].filter((t) => !taken.has(t.id)).sort((a, b) => a.school.localeCompare(b.school));
  const join = async () => {
    if (!teamId || !first.trim() || !last.trim()) { toast('Pick a school and enter your coach’s name.', 'bad'); return; }
    setBusy(true);
    try {
      const s = await joinLeague(code, teamId, { first: first.trim(), last: last.trim(), age: 40, archetype: arch });
      await openLeague(s);
      useGame.getState().nav('league');
    } catch (e) { toast(errText(e), 'bad'); }
    setBusy(false);
  };
  return (
    <div className="col" style={{ gap: 10 }}>
      {mine.length > 0 && (
        <div className="col" style={{ gap: 6 }}>
          <div className="tiny muted upper">Your leagues</div>
          {mine.map((s) => (
            <div key={s.league} className="row" style={{ gap: 8 }}>
              <span className="b" style={{ flex: 1 }}>{s.name} <span className="tiny muted">· {s.league}</span></span>
              <button className="btn sm" onClick={() => void openLeague(s).catch((e) => toast(errText(e), 'bad'))}>Open</button>
            </div>
          ))}
          <div className="divider" />
        </div>
      )}
      <div className="row" style={{ gap: 8 }}>
        <input className="input" style={{ maxWidth: 160, textTransform: 'uppercase', letterSpacing: '.15em' }} placeholder="CODE" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <button className="btn" disabled={busy || code.length !== 6} onClick={() => void look()}>Find league</button>
      </div>
      {meta && (
        <div className="col" style={{ gap: 8 }}>
          <div className="small"><b>{meta.name}</b> · {meta.label} · {meta.members.length} coach{meta.members.length === 1 ? '' : 'es'}: {meta.members.map((m) => m.name).join(', ')}</div>
          <select className="select" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">Pick your school…</option>
            {schools.map((t) => <option key={t.id} value={t.id}>{t.school}</option>)}
          </select>
          <div className="row" style={{ gap: 8 }}>
            <input className="input" placeholder="First name" maxLength={20} value={first} onChange={(e) => setFirst(e.target.value)} />
            <input className="input" placeholder="Last name" maxLength={20} value={last} onChange={(e) => setLast(e.target.value)} />
          </div>
          <select className="select" value={arch} onChange={(e) => setArch(e.target.value as CoachArchetype)}>
            {(Object.keys(ARCHETYPE_INFO) as CoachArchetype[]).map((a) => <option key={a} value={a}>{ARCHETYPE_INFO[a].icon} {a}</option>)}
          </select>
          <button className="btn primary" disabled={busy} onClick={() => void join()}>{busy ? 'Joining…' : 'Join league'}</button>
        </div>
      )}
    </div>
  );
}
