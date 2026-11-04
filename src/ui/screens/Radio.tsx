// Full Court Fanatics: the weekly fan radio show. Episodes play line by line, words appearing
// as the hosts "speak", with the speaker's booth lighting up. Archive, lock board and predictions.
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { PersonFace, TeamLogo, Empty } from '../components/common';
import type { GameState, RadioEpisode, RadioHost, RadioLine } from '../../engine/types';
import { HOSTS, SHOW, TAG_INFO, markHeard } from '../../engine/radio';

const KIND_ICON: Record<RadioEpisode['kind'], string> = { weekly: '📻', preview: '🔮', finale: '🏆', portal: '🔁', signing: '✍️', draft: '🎩' };
const KIND_LABEL: Record<RadioEpisode['kind'], string> = { weekly: 'Weekly show', preview: 'Season preview', finale: 'Season finale', portal: 'Portal special', signing: 'Signing Day special', draft: 'Draft special' };
const SPEEDS = [1, 1.5, 2, 3];

function loadSpeed() { try { const v = Number(localStorage.getItem('cd.radioSpeed')); return SPEEDS.includes(v) ? v : 1; } catch { return 1; } }
function saveSpeed(v: number) { try { localStorage.setItem('cd.radioSpeed', String(v)); } catch { /* private mode */ } }

/** milliseconds a line takes to "say" at 1x */
const speakMs = (text: string) => Math.min(9000, 380 + text.split(/\s+/).length * 235);

export function RadioScreen() {
  const g = useGameState();
  const { mutate } = useGame.getState();
  const eps = g.radio?.episodes ?? [];
  const [sel, setSel] = useState<string | null>(() => (eps.find((e) => !e.heard) ?? eps[0])?.id ?? null);
  const ep = eps.find((e) => e.id === sel) ?? eps[0];
  useEffect(() => {
    if (ep && !ep.heard) mutate((gg) => markHeard(gg, ep.id));
  }, [ep?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <RadioHero g={g} />
      {!ep ? <Empty>The show hasn't aired yet. New episodes drop every week of the season.</Empty> : (
        <div className="grid g-main" style={{ alignItems: 'start', marginTop: 18 }}>
          <Player key={ep.id} g={g} ep={ep} />
          <div className="col" style={{ gap: 16 }}>
            <EpisodeList eps={eps} sel={ep.id} onSel={setSel} />
            <LockBoard g={g} />
            <Predictions g={g} />
          </div>
        </div>
      )}
    </div>
  );
}

function RadioHero({ g }: { g: GameState }) {
  const rec = g.radio?.record;
  return (
    <div className="card radio-hero">
      <div className="radio-hero-bg" />
      <div className="row gap-l" style={{ position: 'relative', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="radio-logo">
          <div className="radio-logo-mic">🎙️</div>
          <div>
            <div className="radio-station">{SHOW.station} · {SHOW.slot}</div>
            <div className="radio-title">{SHOW.name}</div>
            <div className="small" style={{ opacity: 0.8 }}>{SHOW.tagline}</div>
          </div>
        </div>
        <div className="spacer" />
        {(['sal', 'dex'] as RadioHost[]).map((h) => (
          <div key={h} className="row" style={{ gap: 10 }}>
            <PersonFace seed={HOSTS[h].seed} size={58} role="coach" colors={HOSTS[h].colors} />
            <div style={{ maxWidth: 200 }}>
              <div className="b">{HOSTS[h].name}</div>
              <div className="tiny" style={{ color: HOSTS[h].colors[1] }}>“{HOSTS[h].nick}”</div>
              <div className="tiny muted" style={{ lineHeight: 1.3 }}>{HOSTS[h].bio}</div>
              {rec && rec[h][0] + rec[h][1] > 0 && <div className="tiny" style={{ marginTop: 2 }}>🔒 Locks <b>{rec[h][0]}-{rec[h][1]}</b></div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Booth({ host, active, speaking }: { host: RadioHost; active: boolean; speaking: boolean }) {
  const h = HOSTS[host];
  return (
    <div className={`radio-booth ${active ? 'on' : ''}`} style={{ ['--host' as string]: h.colors[0], ['--host2' as string]: h.colors[1] }}>
      <motion.div animate={active && speaking ? { y: [0, -4, 0], rotate: host === 'sal' ? [0, -2, 0] : [0, 1.5, 0] } : { y: 0, rotate: 0 }}
        transition={active && speaking ? { duration: 0.42, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }} className="radio-booth-face">
        <PersonFace seed={h.seed} size={92} role="coach" colors={h.colors} />
      </motion.div>
      <div className="b small" style={{ marginTop: 6 }}>{h.nick}</div>
      <Eq on={active && speaking} />
    </div>
  );
}

function Eq({ on }: { on: boolean }) {
  return <div className={`radio-eq ${on ? 'on' : ''}`}>{[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ animationDelay: `${i * 0.11}s` }} />)}</div>;
}

function Words({ text, perWord }: { text: string; perWord: number }) {
  const words = text.split(/\s+/);
  return (
    <>
      {words.map((w, i) => (
        <motion.span key={i} className="radio-word" initial={{ opacity: 0, y: 10, filter: 'blur(3px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ delay: (i * perWord) / 1000, duration: 0.22 }}>
          {w}{' '}
        </motion.span>
      ))}
    </>
  );
}

function Tag({ l }: { l: RadioLine }) {
  if (!l.tag) return null;
  const t = TAG_INFO[l.tag];
  return <span className={`radio-tag ${t.cls}`}>{t.icon} {t.label}</span>;
}

function speakerName(l: RadioLine) { return l.who === 'caller' ? l.caller ?? 'Caller' : HOSTS[l.who].nick; }

function Player({ g, ep }: { g: GameState; ep: RadioEpisode }) {
  const flat = useMemo(() => ep.segments.flatMap((s, si) => s.lines.map((l) => ({ ...l, si }))), [ep]);
  const firstOf = useMemo(() => ep.segments.map((_, si) => flat.findIndex((l) => l.si === si)), [ep, flat]);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(loadSpeed);
  const [speaking, setSpeaking] = useState(true);
  const feedRef = useRef<HTMLDivElement>(null);
  const done = pos >= flat.length;
  const cur = flat[Math.min(pos, flat.length - 1)];
  const say = cur ? speakMs(cur.text) / speed : 0;

  // advance line by line
  useEffect(() => {
    if (done || !cur) return;
    setSpeaking(true);
    const stop = setTimeout(() => setSpeaking(false), say);
    if (!playing) return () => clearTimeout(stop);
    const next = setTimeout(() => setPos((p) => p + 1), say + (cur.who !== flat[pos + 1]?.who ? 650 : 380) / speed);
    return () => { clearTimeout(stop); clearTimeout(next); };
  }, [pos, playing, speed, done]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' }); }, [pos]);

  // keyboard: space play/pause, right arrow next line
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (useGame.getState().modal || useGame.getState().live) return;
      if (e.code === 'Space') { e.preventDefault(); if (done) { setPos(0); setPlaying(true); } else setPlaying((p) => !p); }
      else if (e.key === 'ArrowRight') setPos((p) => Math.min(flat.length, p + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [done, flat.length]);

  const setSp = (v: number) => { setSpeed(v); saveSpeed(v); };
  const seg = cur ? ep.segments[cur.si] : undefined;
  const callerSeed = cur?.who === 'caller' ? cur.caller ?? 'caller' : '';
  return (
    <div className="card flush radio-player">
      <div style={{ padding: '16px 18px 10px' }}>
        <div className="row" style={{ gap: 10 }}>
          <span className={`radio-onair ${playing && !done ? 'live' : ''}`}>● ON AIR</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="tiny muted upper" style={{ letterSpacing: '.1em' }}>{KIND_ICON[ep.kind]} Episode {ep.no} · {KIND_LABEL[ep.kind]} · {ep.date}</div>
            <div className="h3 ellipsis" style={{ marginTop: 2 }}>{ep.title}</div>
          </div>
        </div>
        <div className="radio-segs">
          {ep.segments.map((s, si) => (
            <button key={si} className={`radio-seg ${cur && si === cur.si && !done ? 'on' : ''} ${(cur && si < cur.si) || done ? 'done' : ''}`} onClick={() => { setPos(firstOf[si]); setPlaying(true); }}>
              <span>{s.icon}</span> {s.title}
            </button>
          ))}
        </div>
      </div>

      <div className="radio-stage">
        <Booth host="sal" active={!done && cur?.who === 'sal'} speaking={speaking && playing} />
        <div className="radio-center">
          {done ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 34 }}>📻</div>
              <div className="b">That's the show.</div>
              <div className="small muted" style={{ marginTop: 4 }}>New episodes air every week of the season, plus specials in the offseason.</div>
              <button className="btn sm" style={{ marginTop: 10 }} onClick={() => { setPos(0); setPlaying(true); }}>↺ Play again</button>
            </div>
          ) : cur && (
            <div key={pos} className={`radio-bubble ${cur.who}`}>
              <div className="row" style={{ gap: 8, marginBottom: 6 }}>
                {cur.who === 'caller' && <span className="radio-phone"><PersonFace seed={callerSeed} size={30} role="player" />☎</span>}
                <span className="tiny upper b" style={{ letterSpacing: '.08em', color: cur.who === 'caller' ? 'var(--muted)' : HOSTS[cur.who].colors[1] }}>{cur.who === 'caller' ? `On the line · ${speakerName(cur)}` : speakerName(cur)}</span>
                <span className="spacer" />
                <Tag l={cur} />
              </div>
              <div className="radio-line"><Words text={cur.text} perWord={(speakMs(cur.text) - 380) / Math.max(1, cur.text.split(/\s+/).length) / speed} /></div>
            </div>
          )}
          {seg && !done && <div className="tiny muted" style={{ textAlign: 'center', marginTop: 8 }}>{seg.icon} {seg.title}</div>}
        </div>
        <Booth host="dex" active={!done && cur?.who === 'dex'} speaking={speaking && playing} />
      </div>

      <div className="row radio-controls">
        <button className="btn sm primary" onClick={() => { if (done) { setPos(0); setPlaying(true); } else setPlaying(!playing); }} style={{ minWidth: 92 }}>{done ? '↺ Replay' : playing ? '❚❚ Pause' : '▶ Play'}</button>
        <button className="btn sm" disabled={done} onClick={() => setPos((p) => Math.min(flat.length, p + 1))} title="Next line (→)">Next ›</button>
        <button className="btn sm" disabled={done} onClick={() => { const n = firstOf.find((f) => f > pos); setPos(n != null && n >= 0 ? n : flat.length); }}>Skip segment ⏭</button>
        <div className="seg">{SPEEDS.map((v) => <button key={v} className={speed === v ? 'on' : ''} onClick={() => setSp(v)}>{v}×</button>)}</div>
        <div className="spacer" />
        <button className="btn sm ghost" onClick={() => setPos(flat.length)}>Read full transcript</button>
      </div>
      <div className="progress-thin"><div style={{ width: `${Math.round((Math.min(pos, flat.length) / Math.max(1, flat.length)) * 100)}%` }} /></div>

      <div ref={feedRef} className="radio-feed">
        {pos === 0 && <div className="tiny muted" style={{ textAlign: 'center', padding: 10 }}>The transcript fills in as the show plays. Space to pause, → to skip ahead.</div>}
        {flat.slice(0, pos).map((l, i) => (
          <div key={i}>
            {(i === 0 || flat[i - 1].si !== l.si) && <div className="radio-feed-seg">{ep.segments[l.si].icon} {ep.segments[l.si].title}</div>}
            <div className={`radio-feed-line ${l.who}`}>
              <span className="radio-feed-who">{speakerName(l)}</span>
              <span>{l.text}</span>
              <Tag l={l} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EpisodeList({ eps, sel, onSel }: { eps: RadioEpisode[]; sel: string; onSel: (id: string) => void }) {
  return (
    <div className="card">
      <div className="card-head"><div className="h3">Episodes</div><span className="tiny muted">Last {eps.length}</span></div>
      <div className="col" style={{ gap: 6 }}>
        {eps.map((e) => (
          <button key={e.id} className={`radio-ep ${e.id === sel ? 'on' : ''}`} onClick={() => onSel(e.id)}>
            <span style={{ fontSize: 20 }}>{KIND_ICON[e.kind]}</span>
            <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
              <span className="small b ellipsis" style={{ display: 'block' }}>{e.title}</span>
              <span className="tiny muted">Ep. {e.no} · {e.date}</span>
            </span>
            {!e.heard && <span className="pill gold" style={{ fontSize: 10 }}>NEW</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function LockBoard({ g }: { g: GameState }) {
  const R = g.radio;
  if (!R) return null;
  const pending = R.locks.filter((l) => !l.result && l.season === g.season).slice(-2);
  const [sw, sl] = R.record.sal, [dw, dl] = R.record.dex;
  if (!pending.length && sw + sl + dw + dl === 0) return null;
  return (
    <div className="card">
      <div className="card-head"><div className="h3">🔒 Lock Board</div><span className="tiny muted">{g.season}-{String((g.season + 1) % 100).padStart(2, '0')}</span></div>
      <div className="row" style={{ gap: 10, marginBottom: pending.length ? 12 : 0 }}>
        {(['sal', 'dex'] as RadioHost[]).map((h) => {
          const [w, l] = R.record[h];
          const lead = h === 'sal' ? sw - dw : dw - sw;
          return (
            <div key={h} className="stat-tile" style={{ flex: 1, padding: '10px 12px', borderColor: lead > 0 ? 'rgba(246,201,76,.5)' : undefined }}>
              <div className="l">{HOSTS[h].nick}</div>
              <div className="v" style={{ fontSize: 24 }}>{w}-{l}{lead > 0 ? ' 👑' : ''}</div>
            </div>
          );
        })}
      </div>
      {pending.map((l, i) => {
        const pick = g.teams[l.pick], opp = g.teams[l.opp];
        return pick && opp ? (
          <div key={i} className="row small" style={{ padding: '5px 0', borderTop: '1px solid var(--line)' }}>
            <span className="tiny b" style={{ width: 62, color: HOSTS[l.who].colors[1] }}>{HOSTS[l.who].short}</span>
            <TeamLogo team={pick} size={20} /><span className="b">{pick.school}</span><span className="muted">over</span><span className="ellipsis">{opp.school}</span>
          </div>
        ) : null;
      })}
    </div>
  );
}

function Predictions({ g }: { g: GameState }) {
  const P = g.radio?.preds;
  if (!P || P.season !== g.season) return null;
  const row = (label: string, s?: string, d?: string, players = false) => {
    const name = (id?: string) => {
      if (!id) return '—';
      if (players) { const p = g.players[id]; return p ? `${p.first[0]}. ${p.last}` : 'Moved on'; }
      return g.teams[id]?.school ?? '—';
    };
    return (
      <tr key={label}><td className="tiny muted upper">{label}</td><td className="small">{!players && s && g.teams[s] && <TeamLogo team={g.teams[s]} size={16} />} {name(s)}</td><td className="small">{!players && d && g.teams[d] && <TeamLogo team={g.teams[d]} size={16} />} {name(d)}</td></tr>
    );
  };
  return (
    <div className="card">
      <div className="card-head"><div className="h3">🔮 On the Record</div><span className="tiny muted">Graded in the finale</span></div>
      <table className="table">
        <thead><tr><th></th><th>Sal</th><th>Dex</th></tr></thead>
        <tbody>
          {row('Champion', P.sal.title, P.dex.title)}
          {row('Sleeper', P.sal.sleeper, P.dex.sleeper)}
          {row('Bust', P.sal.bust, P.dex.bust)}
          {row('POY', P.sal.poy, P.dex.poy, true)}
        </tbody>
      </table>
    </div>
  );
}
