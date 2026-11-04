import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame, type LiveSession } from '../../store/gameStore';
import { TeamLogo, PlayerFace, Ovr, Confetti } from '../components/common';
import type { PlayEvent } from '../../engine/sim';
import type { BoxPlayer, Team } from '../../engine/types';
import { teamAccent, mix } from '../color';
import { schemeOptions } from '../screens/Playbook';
import { BoxTable, ShotChart } from './ModalHost';
import { sfx } from '../sound';

const SPEEDS = [
  { label: '1×', ms: 1150 },
  { label: '2×', ms: 560 },
  { label: '4×', ms: 260 },
  { label: '10×', ms: 70 },
];

// Court geometry (SVG units = 10 per foot), 94 x 50 ft
const CW = 940, CH = 500;
const BASKET_L = { x: 52.5, y: 250 }, BASKET_R = { x: 887.5, y: 250 };

interface Burst { id: number; text: string; color: string }
interface BallAnim { id: number; from: { x: number; y: number }; to: { x: number; y: number }; made: boolean; three: boolean; color: string }
interface Mark { x: number; y: number; made: boolean; color: string }

export function LiveGame({ live }: { live: LiveSession }) {
  const game = useGame((s) => s.game)!;
  const finishLive = useGame((s) => s.finishLive);
  const { sim, userSide } = live;
  const home = game.teams[live.game.home], away = game.teams[live.game.away];
  const teams: [Team, Team] = [home, away];
  const user = teams[userSide], opp = teams[1 - userSide];
  const [, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [feed, setFeed] = useState<PlayEvent[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [ball, setBall] = useState<BallAnim | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [wp, setWp] = useState<[number, number][]>([[0, 0.5]]);
  const [flash, setFlash] = useState<[number, number]>([0, 0]);
  const [shake, setShake] = useState(0);
  const [tab, setTab] = useState<'live' | 'box'>('live');
  const [boxSide, setBoxSide] = useState<0 | 1>(userSide);
  const [showFinal, setShowFinal] = useState(false);
  const idRef = useRef(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const colors: [string, string] = [teamAccent(home.colors), teamAccent(away.colors)];
  const spreadHome = live.spread;

  const attackRight = (team: 0 | 1) => {
    // home attacks right in the 1st half, left in the 2nd/OT
    const firstHalf = sim.period === 1;
    return team === 0 ? firstHalf : !firstHalf;
  };
  const toCourt = (team: 0 | 1, sx: number, sy: number) => {
    // shot coords: x across (-25..25), y from baseline (basket at 5.25)
    if (attackRight(team)) return { x: CW - sy * 10, y: 250 + sx * 10 };
    return { x: sy * 10, y: 250 - sx * 10 };
  };

  const processEvents = useCallback((evs: PlayEvent[], animate: boolean) => {
    if (!evs.length) return;
    setFeed((f) => [...evs.slice().reverse(), ...f].slice(0, 160));
    const newMarks: Mark[] = [];
    for (const e of evs) {
      if (e.shot && e.team !== -1) {
        const c = toCourt(e.team, e.shot.x, e.shot.y);
        newMarks.push({ ...c, made: e.shot.made, color: colors[e.team] });
      }
      if (e.kind === 'make' || e.kind === 'ft') {
        const t = e.team as 0 | 1;
        setFlash((f) => { const n = [...f] as [number, number]; n[t] = Date.now(); return n; });
      }
      if (animate && e.big) {
        let text = '';
        if (e.kind === 'block') text = 'REJECTED!';
        else if (e.kind === 'steal') text = 'STEAL!';
        else if (e.text.includes('BUZZER')) text = 'BUZZER BEATER!';
        else if (e.text.includes('AND-ONE')) text = 'AND-ONE!';
        else if (e.text.includes('alley-oop')) text = 'ALLEY-OOP!';
        else if (/slam|throws it down|dunk/i.test(e.text)) text = 'SLAM!';
        else if (e.kind === 'period' && e.text.includes('overtime')) text = 'OVERTIME!';
        else if (e.kind === 'foul' && e.text.includes('fouled out')) text = 'FOULED OUT';
        if (text) {
          const id = idRef.current++;
          setBursts((b) => [...b, { id, text, color: e.team === -1 ? '#fff' : colors[e.team] }]);
          setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1500);
          if (text === 'BUZZER BEATER!' || text === 'SLAM!' || text === 'REJECTED!') setShake((s) => s + 1);
          sfx.crowd(text === 'BUZZER BEATER!' ? 1.6 : 1);
        }
      }
      if (animate && e.kind === 'period') sfx.buzzer();
    }
    if (newMarks.length) setMarks((m) => [...m, ...newMarks].slice(-260));
    const lastShot = [...evs].reverse().find((e) => e.shot && e.team !== -1);
    if (animate && lastShot && lastShot.shot) {
      const t = lastShot.team as 0 | 1;
      const to = attackRight(t) ? BASKET_R : BASKET_L;
      const from = toCourt(t, lastShot.shot.x, lastShot.shot.y);
      setBall({ id: idRef.current++, from, to, made: lastShot.shot.made, three: lastShot.shot.three, color: colors[t] });
      setTimeout(() => { if (lastShot.shot!.made) sfx.swish(); else sfx.rim(); }, 380);
    }
    const p = sim.winProb(spreadHome);
    setWp((w) => [...w, [sim.t, userSide === 0 ? p : 1 - p]]);
  }, [sim, spreadHome, userSide]); // eslint-disable-line react-hooks/exhaustive-deps

  const stepOnce = useCallback((animate: boolean) => {
    const evs = sim.step();
    processEvents(evs, animate);
    setFrame((f) => f + 1);
    if (sim.done) { setPlaying(false); setTimeout(() => setShowFinal(true), animate ? 900 : 50); }
  }, [sim, processEvents]);

  useEffect(() => {
    if (!playing || sim.done) return;
    timer.current = setTimeout(() => stepOnce(speed < 3), SPEEDS[speed].ms);
    return () => { if (timer.current) clearTimeout(timer.current); };
  });

  const simTo = (target: 'half' | 'end') => {
    setPlaying(false);
    const all: PlayEvent[] = [];
    let guard = 0;
    const startPeriod = sim.period;
    while (!sim.done && guard++ < 600) {
      all.push(...sim.step());
      if (target === 'half' && sim.period > startPeriod) break;
    }
    processEvents(all, false);
    setFrame((f) => f + 1);
    if (sim.done) setTimeout(() => setShowFinal(true), 300);
    else setPlaying(true);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); setPlaying((p) => !p); }
      if (e.key === 't' || e.key === 'T') { if (sim.callTimeout(userSide)) useGame.getState().toast('Timeout called — it will be taken at the next dead ball.'); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [sim, userSide]);

  const box = useMemo(() => sim.boxScore(), [sim, feed.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const strat = sim.strategy[userSide];
  const curWp = wp[wp.length - 1]?.[1] ?? 0.5;
  const bonus = (t: 0 | 1) => sim.teamFouls[1 - t] >= 10 ? 'DBL BONUS' : sim.teamFouls[1 - t] >= 7 ? 'BONUS' : '';
  const potg = useMemo(() => {
    if (!sim.done) return null;
    const w = sim.score[0] > sim.score[1] ? 0 : 1;
    const gs = (p: BoxPlayer) => p.pts + 0.7 * (p.orb + p.drb) * 0.6 + 0.7 * p.ast + p.stl + 0.7 * p.blk - p.tov - 0.5 * (p.fga - p.fgm);
    const best = [...box.players[w]].sort((a, b) => gs(b) - gs(a))[0];
    return best ? { p: best, team: teams[w] } : null;
  }, [sim.done, box]); // eslint-disable-line react-hooks/exhaustive-deps

  const userWon = sim.done && sim.score[userSide] > sim.score[1 - userSide];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#04070d', display: 'grid', gridTemplateRows: 'auto 1fr auto', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(900px 400px at 0% 0%, ${away.colors[0]}44, transparent 60%), radial-gradient(900px 400px at 100% 0%, ${home.colors[0]}44, transparent 60%)`, pointerEvents: 'none' }} />
      {/* ---------- Scorebug ---------- */}
      <div style={{ position: 'relative', padding: '14px 22px 10px' }}>
        <div className="row" style={{ justifyContent: 'center', gap: 0 }}>
          <ScoreSide team={away} score={sim.score[1]} flashAt={flash[1]} align="left" timeouts={sim.timeouts[1]} fouls={sim.teamFouls[1]} bonus={bonus(1)} poss={sim.poss === 1 && !sim.done} />
          <div style={{ width: 170, textAlign: 'center', background: 'rgba(0,0,0,.55)', border: '1px solid var(--line-2)', padding: '8px 0', alignSelf: 'stretch', display: 'grid', placeItems: 'center' }}>
            <div>
              <div className="num" style={{ fontSize: 34, lineHeight: 1, color: sim.done ? 'var(--gold)' : '#fff' }}>{sim.done ? 'FINAL' : sim.clockStr}</div>
              <div className="tiny upper b muted" style={{ letterSpacing: '.2em', marginTop: 3 }}>{sim.done ? (sim.period > 2 ? (sim.period === 3 ? 'OT' : `${sim.period - 2}OT`) : '') : sim.periodLabel()}</div>
            </div>
          </div>
          <ScoreSide team={home} score={sim.score[0]} flashAt={flash[0]} align="right" timeouts={sim.timeouts[0]} fouls={sim.teamFouls[0]} bonus={bonus(0)} poss={sim.poss === 0 && !sim.done} />
        </div>
        <div className="row tiny muted" style={{ justifyContent: 'center', marginTop: 6, gap: 14 }}>
          <span>{live.game.event ?? (live.game.type === 'conf' ? 'Conference' : 'Non-conference')}</span>
          <span>📺 {live.game.tv}</span>
          <span>{live.game.neutral ? 'Neutral site' : home.arena}</span>
        </div>
      </div>

      {/* ---------- Main ---------- */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr) 340px', gap: 14, padding: '0 18px', minHeight: 0, position: 'relative' }}>
        {/* Left: on-court */}
        <div className="card" style={{ padding: 12, overflow: 'auto' }}>
          {[userSide, (1 - userSide) as 0 | 1].map((side) => (
            <div key={side} style={{ marginBottom: 12 }}>
              <div className="row" style={{ marginBottom: 6 }}><TeamLogo team={teams[side]} size={20} /><span className="b small upper">{teams[side].abbr} on the floor</span></div>
              {sim.court[side].map((x) => {
                const bp = box.players[side].find((b) => b.id === x.p.id);
                return (
                  <motion.div layout key={x.p.id} className="row" style={{ gap: 7, padding: '4px 0' }}>
                    <PlayerFace p={x.p} size={30} team={teams[side]} bg="none" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="small b ellipsis">{x.p.last} <span className="tiny muted">{x.p.pos}</span></div>
                      <div className="bar thin" style={{ marginTop: 3 }}><i style={{ width: `${x.energy}%`, background: x.energy > 70 ? 'var(--good)' : x.energy > 45 ? 'var(--warn)' : 'var(--bad)' }} /></div>
                    </div>
                    <span className="tiny mono" style={{ width: 70, textAlign: 'right' }}>{bp ? `${bp.pts}p ${bp.orb + bp.drb}r ${bp.ast}a` : ''}</span>
                    <span className={`tiny b ${x.fouls >= 4 ? 'bad' : 'dim'}`} style={{ width: 18 }}>{x.fouls ? `${x.fouls}F` : ''}</span>
                  </motion.div>
                );
              })}
            </div>
          ))}
          <div className="divider" />
          <div className="eyebrow" style={{ marginBottom: 6 }}>Team stats</div>
          <TeamCompare box={box} teams={teams} />
        </div>

        {/* Center: court */}
        <div className="col" style={{ minHeight: 0, gap: 10 }}>
          <div className="row" style={{ gap: 8 }}>
            <div className="seg"><button className={tab === 'live' ? 'on' : ''} onClick={() => setTab('live')}>Court</button><button className={tab === 'box' ? 'on' : ''} onClick={() => setTab('box')}>Box Score</button></div>
            <div className="spacer" />
            <span className="tiny muted">Space = pause · T = timeout</span>
          </div>
          {tab === 'live' ? (
            <motion.div key={shake} animate={shake ? { x: [0, -8, 8, -6, 6, -3, 0] } : {}} transition={{ duration: 0.45 }} style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--line-2)', boxShadow: '0 30px 80px rgba(0,0,0,.5)' }}>
              <Court home={home} away={away} marks={marks} ball={ball} sim={sim} attackRight={attackRight} colors={colors} />
              <AnimatePresence>
                {bursts.map((b) => (
                  <motion.div key={b.id} initial={{ scale: 0.3, opacity: 0, rotate: -6 }} animate={{ scale: 1, opacity: 1, rotate: -4 }} exit={{ scale: 1.6, opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 14 }}
                    style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
                    <div className="num" style={{ fontSize: 76, fontStyle: 'italic', color: '#fff', textShadow: `0 0 30px ${b.color}, 0 6px 0 ${mix(b.color, '#000', 0.5)}`, WebkitTextStroke: `2px ${b.color}` }}>{b.text}</div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          ) : (
            <div className="card" style={{ padding: 12, overflow: 'auto', flex: 1 }}>
              <div className="row" style={{ marginBottom: 8 }}>
                <div className="seg">{([1, 0] as const).map((s) => <button key={s} className={boxSide === s ? 'on' : ''} onClick={() => setBoxSide(s)}>{teams[s].school}</button>)}</div>
                <div className="spacer" />
                <ShotChart box={box} side={boxSide} color={colors[boxSide]} size={180} />
              </div>
              <BoxTable players={box.players[boxSide]} />
            </div>
          )}
          <WinProbChart wp={wp} user={user} opp={opp} cur={curWp} maxT={Math.max(2400, sim.periodEnd)} />
        </div>

        {/* Right: play by play */}
        <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="row" style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}><span className="h3" style={{ flex: 1 }}>Play-by-Play</span>{!sim.done && playing && <span className="pill bad pulse">● LIVE</span>}</div>
          <div style={{ overflow: 'auto', flex: 1, padding: '6px 10px' }}>
            <AnimatePresence initial={false}>
              {feed.map((e) => (
                <motion.div key={e.id} layout initial={{ opacity: 0, x: 20, height: 0 }} animate={{ opacity: 1, x: 0, height: 'auto' }} transition={{ duration: 0.25 }}
                  style={{ display: 'flex', gap: 8, padding: '6px 4px', borderBottom: '1px solid var(--line)', fontSize: 12.5, background: e.big ? 'rgba(255,255,255,.04)' : undefined }}>
                  <span className="mono dim" style={{ width: 36, flex: 'none' }}>{e.clock}</span>
                  <span style={{ width: 4, borderRadius: 2, flex: 'none', background: e.team === -1 ? 'var(--line-2)' : colors[e.team] }} />
                  <span style={{ flex: 1, fontWeight: e.big || e.kind === 'make' ? 700 : 400, color: e.kind === 'period' || e.kind === 'final' ? 'var(--gold)' : e.kind === 'sub' || e.kind === 'media' ? 'var(--muted)' : undefined }}>{e.text}</span>
                  {(e.kind === 'make' || e.kind === 'ft') && <span className="mono b" style={{ flex: 'none' }}>{e.score[1]}-{e.score[0]}</span>}
                </motion.div>
              ))}
            </AnimatePresence>
            {!feed.length && <div className="empty small">Players are taking the floor…</div>}
          </div>
        </div>
      </div>

      {/* ---------- Controls ---------- */}
      <div className="row" style={{ padding: '12px 18px', gap: 12, borderTop: '1px solid var(--line)', background: 'rgba(4,7,13,.9)', position: 'relative', flexWrap: 'wrap' }}>
        <button className="btn primary" style={{ minWidth: 92 }} disabled={sim.done} onClick={() => setPlaying((p) => !p)}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
        <div className="seg">{SPEEDS.map((s, i) => <button key={s.label} className={speed === i ? 'on' : ''} onClick={() => setSpeed(i)}>{s.label}</button>)}</div>
        <button className="btn sm" disabled={sim.done} onClick={() => stepOnce(true)}>Next play</button>
        <button className="btn sm" disabled={sim.done || sim.period >= 2} onClick={() => simTo('half')}>Sim to half</button>
        <button className="btn sm" disabled={sim.done} onClick={() => simTo('end')}>Sim to end</button>
        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--line)' }} />
        <button className="btn sm gold" disabled={sim.done || sim.timeouts[userSide] <= 0} onClick={() => { if (sim.callTimeout(userSide)) { sfx.buzzer(); useGame.getState().toast('Timeout! Your guys catch their breath and reset.'); } }}>⏱ Timeout ({sim.timeouts[userSide]})</button>
        <select className="select" style={{ width: 200 }} title="Offense (fit · installed · matchup)" value={strat.offense} onChange={(e) => { sim.setStrategy(userSide, { offense: e.target.value as typeof strat.offense }); setFrame((f) => f + 1); }}>
          {schemeOptions(game, 'off', sim.strategy[1 - userSide].defense).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <select className="select" style={{ width: 200 }} title="Defense (fit · installed · matchup)" value={strat.defense} onChange={(e) => { sim.setStrategy(userSide, { defense: e.target.value as typeof strat.defense }); setFrame((f) => f + 1); }}>
          {schemeOptions(game, 'def', sim.strategy[1 - userSide].offense).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <div className="seg">{['Grind', 'Slow', 'Norm', 'Fast', 'Blitz'].map((l, i) => <button key={l} className={strat.tempo === i + 1 ? 'on' : ''} onClick={() => { sim.setStrategy(userSide, { tempo: i + 1 }); setFrame((f) => f + 1); }}>{l}</button>)}</div>
        <div className="spacer" />
        {sim.done && <button className="btn primary lg" onClick={() => finishLive(sim.boxScore())}>Continue →</button>}
      </div>

      {/* ---------- Final overlay ---------- */}
      <AnimatePresence>
        {showFinal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'absolute', inset: 0, background: 'rgba(3,5,10,.82)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', zIndex: 5 }}>
            {userWon && <Confetti colors={[user.colors[0], user.colors[1], '#ffffff']} />}
            <motion.div initial={{ scale: 0.85, y: 30 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }} className="card" style={{ width: 'min(720px, 92vw)', padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '22px 26px', background: `linear-gradient(120deg, ${user.colors[0]}, #0b1220 70%)`, textAlign: 'center' }}>
                <motion.div initial={{ scale: 2.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 14 }} className="num" style={{ fontSize: 64, lineHeight: 1, color: userWon ? '#fff' : '#ffb4b4' }}>{userWon ? 'VICTORY' : 'DEFEAT'}</motion.div>
                <div className="row" style={{ justifyContent: 'center', gap: 22, marginTop: 14 }}>
                  <TeamLogo team={away} size={56} />
                  <div className="num" style={{ fontSize: 48 }}>{sim.score[1]} <span className="dim">–</span> {sim.score[0]}</div>
                  <TeamLogo team={home} size={56} />
                </div>
                {sim.period > 2 && <div className="pill gold" style={{ marginTop: 8 }}>{sim.period === 3 ? 'OVERTIME' : `${sim.period - 2} OVERTIMES`}</div>}
              </div>
              <div style={{ padding: 22 }}>
                {potg && (
                  <div className="row" style={{ marginBottom: 16 }}>
                    <PlayerFace p={{ id: potg.p.id, num: potg.p.num, injury: null }} size={74} team={potg.team} />
                    <div style={{ flex: 1 }}>
                      <div className="eyebrow">Player of the Game</div>
                      <div className="h2">{potg.p.name}</div>
                      <div className="muted">{potg.p.pts} PTS · {potg.p.orb + potg.p.drb} REB · {potg.p.ast} AST · {potg.p.fgm}-{potg.p.fga} FG</div>
                    </div>
                    {game.players[potg.p.id] && <Ovr v={game.players[potg.p.id].ovr} />}
                  </div>
                )}
                <TeamCompare box={box} teams={teams} wide />
                <div className="row" style={{ marginTop: 18 }}>
                  <button className="btn" onClick={() => { setShowFinal(false); setTab('box'); }}>View box score</button>
                  <div className="spacer" />
                  <button className="btn primary lg" onClick={() => finishLive(sim.boxScore())}>Continue to postgame →</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ScoreSide({ team, score, flashAt, align, timeouts, fouls, bonus, poss }: { team: Team; score: number; flashAt: number; align: 'left' | 'right'; timeouts: number; fouls: number; bonus: string; poss: boolean }) {
  const acc = teamAccent(team.colors);
  return (
    <div className="row" style={{ flexDirection: align === 'left' ? 'row' : 'row-reverse', gap: 14, padding: '8px 18px', minWidth: 380, justifyContent: 'space-between', background: `linear-gradient(${align === 'left' ? '90deg' : '270deg'}, ${team.colors[0]}, ${mix(team.colors[0], '#000', 0.55)})`, borderRadius: align === 'left' ? '14px 0 0 14px' : '0 14px 14px 0', border: '1px solid rgba(255,255,255,.12)' }}>
      <div className="row" style={{ flexDirection: align === 'left' ? 'row' : 'row-reverse', gap: 12 }}>
        <TeamLogo team={team} size={46} />
        <div style={{ textAlign: align }}>
          <div className="num" style={{ fontSize: 26, lineHeight: 1, color: '#fff' }}>{team.apRank ? <span style={{ fontSize: 16, color: 'var(--gold)' }}>{team.apRank} </span> : null}{team.abbr}</div>
          <div className="row tiny" style={{ gap: 4, justifyContent: align === 'left' ? 'flex-start' : 'flex-end', marginTop: 4 }}>
            {Array.from({ length: 4 }, (_, i) => <span key={i} style={{ width: 12, height: 4, borderRadius: 2, background: i < timeouts ? '#fff' : 'rgba(255,255,255,.2)' }} />)}
            <span style={{ color: 'rgba(255,255,255,.75)', marginLeft: 6 }}>F {fouls}</span>
            {bonus && <span className="b" style={{ color: 'var(--gold)', marginLeft: 4 }}>{bonus}</span>}
          </div>
        </div>
        {poss && <motion.span layoutId="poss-arrow" style={{ color: acc, fontSize: 14 }}>{align === 'left' ? '◀' : '▶'}</motion.span>}
      </div>
      <motion.div key={score} initial={{ scale: Date.now() - flashAt < 300 ? 1.35 : 1, color: Date.now() - flashAt < 300 ? '#ffe28a' : '#fff' }} animate={{ scale: 1, color: '#ffffff' }} transition={{ duration: 0.5 }} className="num" style={{ fontSize: 54, lineHeight: 1, minWidth: 80, textAlign: align === 'left' ? 'right' : 'left' }}>
        {score}
      </motion.div>
    </div>
  );
}

function Court({ home, away, marks, ball, sim, attackRight, colors }: { home: Team; away: Team; marks: Mark[]; ball: BallAnim | null; sim: NonNullable<ReturnType<typeof useGame.getState>['live']>['sim']; attackRight: (t: 0 | 1) => boolean; colors: [string, string] }) {
  const off = sim.poss;
  const right = attackRight(off);
  const bx = right ? BASKET_R.x : BASKET_L.x;
  const dir = right ? -1 : 1;
  // offensive formation (ft from basket)
  const form: [number, number][] = [[24, 0], [19, -15], [19, 15], [4, -21], [7, 6]];
  const seed = sim.events.length;
  const jit = (i: number) => ((Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453) % 1) * 18;
  const offPts = form.map(([d, lat], i) => ({ x: bx + dir * d * 10 + jit(i), y: 250 + lat * 10 + jit(i + 5) }));
  const defPts = offPts.map((p, i) => ({ x: p.x + (bx - p.x) * 0.22 + jit(i + 9) * 0.5, y: p.y + (250 - p.y) * 0.15 }));
  const homeName = home.school.toUpperCase();
  const lineC = 'rgba(255,255,255,.78)';
  const wood1 = '#c99a5b', wood2 = '#b9874a';
  return (
    <svg viewBox={`0 0 ${CW} ${CH}`} width="100%" style={{ display: 'block', background: wood1 }}>
      <defs>
        <pattern id="planks" width="940" height="22" patternUnits="userSpaceOnUse">
          <rect width="940" height="22" fill={wood1} />
          <rect y="11" width="940" height="11" fill={wood2} opacity=".35" />
          <line x1="0" y1="22" x2="940" y2="22" stroke="rgba(0,0,0,.08)" />
        </pattern>
        <radialGradient id="courtglow" cx="50%" cy="50%" r="60%"><stop offset="0" stopColor="#fff" stopOpacity=".18" /><stop offset="1" stopColor="#000" stopOpacity=".28" /></radialGradient>
      </defs>
      <rect width={CW} height={CH} fill="url(#planks)" />
      {/* paint & center */}
      <rect x="0" y="190" width="190" height="120" fill={home.colors[0]} opacity=".85" />
      <rect x="750" y="190" width="190" height="120" fill={home.colors[0]} opacity=".85" />
      <circle cx="470" cy="250" r="60" fill={home.colors[0]} opacity=".85" />
      <text x="470" y="262" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="900" fontSize="34" fill={home.colors[1]} opacity=".95">{home.abbr}</text>
      <text x="300" y="40" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="900" fontSize="26" fill={home.colors[0]} opacity=".35" letterSpacing="6">{homeName}</text>
      <text x="640" y="480" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="900" fontSize="26" fill={home.colors[0]} opacity=".35" letterSpacing="6">{home.mascot.toUpperCase()}</text>
      <g stroke={lineC} strokeWidth="3" fill="none">
        <rect x="2" y="2" width={CW - 4} height={CH - 4} />
        <line x1="470" y1="0" x2="470" y2={CH} />
        <circle cx="470" cy="250" r="60" />
        <rect x="0" y="190" width="190" height="120" /><rect x="750" y="190" width="190" height="120" />
        <circle cx="190" cy="250" r="60" /><circle cx="750" cy="250" r="60" />
        <path d={`M0 ${250 - 213} H 90 A 221.5 221.5 0 0 1 90 ${250 + 213} H 0`} />
        <path d={`M940 ${250 - 213} H 850 A 221.5 221.5 0 0 0 850 ${250 + 213} H 940`} />
        <path d="M52.5 210 A 40 40 0 0 1 52.5 290" /><path d="M887.5 210 A 40 40 0 0 0 887.5 290" />
      </g>
      {/* backboards & rims */}
      <line x1="40" y1="220" x2="40" y2="280" stroke="#fff" strokeWidth="5" />
      <line x1="900" y1="220" x2="900" y2="280" stroke="#fff" strokeWidth="5" />
      <circle cx={BASKET_L.x} cy={BASKET_L.y} r="9" stroke="#ff6a1a" strokeWidth="3.5" fill="none" />
      <circle cx={BASKET_R.x} cy={BASKET_R.y} r="9" stroke="#ff6a1a" strokeWidth="3.5" fill="none" />
      <rect width={CW} height={CH} fill="url(#courtglow)" />
      {/* shot marks */}
      {marks.map((m, i) => m.made
        ? <circle key={i} cx={m.x} cy={m.y} r="6" fill={m.color} stroke="#000" strokeOpacity=".3" opacity={0.25 + (i / marks.length) * 0.6} />
        : <g key={i} stroke={m.color} strokeWidth="2.5" opacity={0.2 + (i / marks.length) * 0.5}><line x1={m.x - 5} y1={m.y - 5} x2={m.x + 5} y2={m.y + 5} /><line x1={m.x + 5} y1={m.y - 5} x2={m.x - 5} y2={m.y + 5} /></g>)}
      {/* players */}
      {!sim.done && (
        <g>
          {[0, 1].map((side) => {
            const isOff = side === off;
            const pts = isOff ? offPts : defPts;
            return pts.map((p, i) => (
              <g key={`${side}-${i}`} style={{ transform: `translate(${p.x}px, ${p.y}px)`, transition: 'transform 0.75s cubic-bezier(.25,.8,.25,1)' }}>
                <circle r={isOff ? 16 : 15} fill={colors[side]} stroke={isOff ? '#fff' : 'rgba(0,0,0,.45)'} strokeWidth={isOff ? 2.5 : 2} opacity={isOff ? 1 : 0.88} />
                <text y="5" textAnchor="middle" fontSize="13" fontWeight="800" fill={isOff ? '#0b0f17' : '#fff'} fontFamily="var(--font-display)">{sim.court[side as 0 | 1][i]?.p.num ?? ''}</text>
              </g>
            ));
          })}
        </g>
      )}
      {/* ball */}
      <AnimatePresence>
        {ball && (
          <motion.g key={ball.id} initial={{ x: ball.from.x, y: ball.from.y, scale: 1, opacity: 1 }}
            animate={ball.made
              ? { x: [ball.from.x, (ball.from.x + ball.to.x) / 2, ball.to.x], y: [ball.from.y, (ball.from.y + ball.to.y) / 2 - 30, ball.to.y], scale: [1, 1.9, 0.8], opacity: [1, 1, 0] }
              : { x: [ball.from.x, (ball.from.x + ball.to.x) / 2, ball.to.x, ball.to.x + (ball.from.x - ball.to.x) * 0.25], y: [ball.from.y, (ball.from.y + ball.to.y) / 2 - 30, ball.to.y, ball.to.y + 60 * Math.sign(ball.from.y - 250 || 1)], scale: [1, 1.9, 1, 1], opacity: [1, 1, 1, 0] }}
            transition={{ duration: ball.made ? 0.7 : 0.95, ease: 'easeInOut' }}>
            <circle r="9" fill="#f07a24" stroke="#5a2a08" strokeWidth="2" />
            <path d="M-9 0 H9 M0 -9 V9" stroke="#5a2a08" strokeWidth="1.4" />
          </motion.g>
        )}
      </AnimatePresence>
      {ball?.made && (
        <motion.circle key={`r${ball.id}`} cx={ball.to.x} cy={ball.to.y} r="10" fill="none" stroke={ball.color} strokeWidth="4" initial={{ scale: 1, opacity: 0 }} animate={{ scale: [1, 4.5], opacity: [0, 0.9, 0] }} transition={{ delay: 0.6, duration: 0.6 }} style={{ transformOrigin: `${ball.to.x}px ${ball.to.y}px` }} />
      )}
      {ball?.made && (
        <motion.text key={`t${ball.id}`} x={ball.to.x + (ball.to.x > 470 ? -60 : 60)} y={ball.to.y - 40} textAnchor="middle" fontFamily="var(--font-display)" fontWeight="900" fontSize="40" fill="#fff" stroke={ball.color} strokeWidth="2" initial={{ opacity: 0, y: ball.to.y - 20 }} animate={{ opacity: [0, 1, 0], y: ball.to.y - 70 }} transition={{ delay: 0.6, duration: 1.1 }}>+{ball.three ? 3 : 2}</motion.text>
      )}
      {/* team labels */}
      <text x="20" y="490" fontSize="14" fontWeight="800" fill="rgba(0,0,0,.45)" fontFamily="var(--font-display)">◀ {attackRight(0) ? away.abbr : home.abbr} attacks</text>
      <text x="920" y="490" textAnchor="end" fontSize="14" fontWeight="800" fill="rgba(0,0,0,.45)" fontFamily="var(--font-display)">{attackRight(0) ? home.abbr : away.abbr} attacks ▶</text>
    </svg>
  );
}

function WinProbChart({ wp, user, opp, cur, maxT }: { wp: [number, number][]; user: Team; opp: Team; cur: number; maxT: number }) {
  const W = 800, H = 90;
  const pts = wp.map(([t, p]) => `${(t / maxT) * W},${H - p * H}`).join(' ');
  const area = `0,${H} ${pts} ${(wp[wp.length - 1][0] / maxT) * W},${H}`;
  const uc = teamAccent(user.colors), oc = teamAccent(opp.colors);
  return (
    <div className="card" style={{ padding: '10px 14px' }}>
      <div className="row tiny b" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: uc }}>{user.abbr} {Math.round(cur * 100)}%</span>
        <span className="upper muted">Win probability</span>
        <span style={{ color: oc }}>{Math.round((1 - cur) * 100)}% {opp.abbr}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        <defs><linearGradient id="wpg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={uc} stopOpacity=".45" /><stop offset="1" stopColor={uc} stopOpacity="0" /></linearGradient></defs>
        <rect width={W} height={H / 2} fill="rgba(255,255,255,.02)" />
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="rgba(255,255,255,.15)" strokeDasharray="4 4" />
        <line x1={W / 2} x2={W / 2} y1="0" y2={H} stroke="rgba(255,255,255,.08)" />
        <polygon points={area} fill="url(#wpg)" />
        <polyline points={pts} fill="none" stroke={uc} strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function TeamCompare({ box, teams, wide }: { box: ReturnType<NonNullable<ReturnType<typeof useGame.getState>['live']>['sim']['boxScore']>; teams: [Team, Team]; wide?: boolean }) {
  const tot = (side: 0 | 1) => box.players[side].reduce((a, p) => ({ fgm: a.fgm + p.fgm, fga: a.fga + p.fga, tpm: a.tpm + p.tpm, tpa: a.tpa + p.tpa, ftm: a.ftm + p.ftm, fta: a.fta + p.fta, reb: a.reb + p.orb + p.drb, ast: a.ast + p.ast, tov: a.tov + p.tov, stl: a.stl + p.stl, blk: a.blk + p.blk }), { fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, ast: 0, tov: 0, stl: 0, blk: 0 });
  const a = tot(1), h = tot(0);
  const pct = (m: number, n: number) => (n ? `${Math.round((m / n) * 100)}%` : '—');
  const rows: [string, string, string, number, number][] = [
    ['FG', `${a.fgm}-${a.fga}`, `${h.fgm}-${h.fga}`, a.fga ? a.fgm / a.fga : 0, h.fga ? h.fgm / h.fga : 0],
    ['3PT', `${a.tpm}-${a.tpa}`, `${h.tpm}-${h.tpa}`, a.tpa ? a.tpm / a.tpa : 0, h.tpa ? h.tpm / h.tpa : 0],
    ['FT', pct(a.ftm, a.fta), pct(h.ftm, h.fta), a.fta ? a.ftm / a.fta : 0, h.fta ? h.ftm / h.fta : 0],
    ['REB', `${a.reb}`, `${h.reb}`, a.reb, h.reb],
    ['AST', `${a.ast}`, `${h.ast}`, a.ast, h.ast],
    ['TO', `${a.tov}`, `${h.tov}`, h.tov, a.tov],
    ['STL', `${a.stl}`, `${h.stl}`, a.stl, h.stl],
  ];
  return (
    <div className="col" style={{ gap: 5 }}>
      <div className="row tiny b muted" style={{ justifyContent: 'space-between' }}><span>{teams[1].abbr}</span><span>{teams[0].abbr}</span></div>
      {rows.map(([l, av, hv, an, hn]) => {
        const tot2 = an + hn || 1;
        return (
          <div key={l}>
            <div className="row tiny" style={{ justifyContent: 'space-between' }}><span className="mono b">{av}</span><span className="muted">{l}</span><span className="mono b">{hv}</span></div>
            {wide !== false && (
              <div style={{ display: 'flex', height: 4, borderRadius: 3, overflow: 'hidden', background: 'rgba(255,255,255,.06)', marginTop: 2 }}>
                <div style={{ width: `${(an / tot2) * 100}%`, background: teamAccent(teams[1].colors) }} />
                <div style={{ flex: 1, background: teamAccent(teams[0].colors), opacity: 0.85 }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
