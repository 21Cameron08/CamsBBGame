import { useMemo, useState } from 'react';
import { replaySelectionShow } from '../shell/advance';
import { motion } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { TeamLogo, Tabs, Section, Empty, Confetti } from '../components/common';
import type { BracketGame, GameState, TourneyBracket } from '../../engine/types';
import { REGIONS } from '../../engine/rankings';
import { seasonLabel } from '../../engine/calendar';

type Tab = 'ncaa' | 'conf';

const CSS = `
.brk-scroll { overflow-x: auto; padding-bottom: 10px; }
.brk-card { width: 156px; border-radius: 9px; background: rgba(14,21,36,.92); border: 1px solid var(--line); overflow: hidden; font-size: 12px; box-shadow: 0 4px 14px rgba(0,0,0,.25); }
.brk-card.click { cursor: pointer; }
.brk-card.click:hover { border-color: var(--line-2); transform: translateY(-1px); }
.brk-card.mine { border-color: var(--accent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent), 0 6px 20px -6px var(--accent); }
.brk-line { display: grid; grid-template-columns: 18px 18px 1fr 26px; align-items: center; gap: 5px; height: 24px; padding: 0 7px; }
.brk-line + .brk-line { border-top: 1px solid var(--line); }
.brk-line .sd { font-family: var(--font-display); font-weight: 700; color: var(--muted); font-size: 12px; text-align: right; }
.brk-line .nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.brk-line .sc { font-family: var(--font-display); font-weight: 700; text-align: right; font-size: 13px; }
.brk-line.win .nm, .brk-line.win .sc { font-weight: 800; color: var(--text); }
.brk-line.lose { opacity: .42; }
.brk-line.me { background: color-mix(in srgb, var(--accent) 16%, transparent); }
.brk-col { display: flex; flex-direction: column; justify-content: space-around; gap: 8px; }
.brk-region { display: flex; gap: 14px; }
.brk-region.rev { flex-direction: row-reverse; }
.brk-rhead { font-family: var(--font-display); font-weight: 800; letter-spacing: .12em; text-transform: uppercase; font-size: 15px; margin-bottom: 8px; }
.brk-colhead { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); font-weight: 700; text-align: center; margin-bottom: 4px; }
`;

function shortName(g: GameState, id: string) {
  const t = g.teams[id];
  if (!t) return 'TBD';
  return t.school.length > 15 ? t.abbr : t.school;
}

function MatchCard({ g, game, b }: { g: GameState; game: BracketGame; b: TourneyBracket }) {
  const open = useGame((s) => s.open);
  const sg = game.gameId ? g.schedule.find((x) => x.id === game.gameId) : undefined;
  const box = game.gameId ? g.boxScores[game.gameId] : undefined;
  const mine = game.teams.includes(g.user.teamId);
  const scoreFor = (side: 0 | 1): number | null => {
    if (game.score) return game.score[side];
    if (sg?.played && game.teams[side]) return game.teams[side] === sg.home ? sg.hs ?? null : sg.as ?? null;
    return null;
  };
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className={`brk-card ${box ? 'click' : ''} ${mine ? 'mine' : ''}`}
      onClick={() => { if (box && game.gameId) open({ kind: 'box', gameId: game.gameId }); }}
      title={box ? 'View box score' : sg && !sg.played ? g.calendar[sg.day]?.label : undefined}>
      {[0, 1].map((side) => {
        const id = game.teams[side as 0 | 1];
        const t = id ? g.teams[id] : undefined;
        const won = !!game.winner && game.winner === id;
        const lost = !!game.winner && !!id && game.winner !== id;
        const seed = game.seeds[side as 0 | 1] ?? (id ? b.seeds[id] : null);
        const sc = scoreFor(side as 0 | 1);
        return (
          <div key={side} className={`brk-line ${won ? 'win' : ''} ${lost ? 'lose' : ''} ${id === g.user.teamId ? 'me' : ''}`}>
            <span className="sd">{seed ?? ''}</span>
            {t ? <TeamLogo team={t} size={16} /> : <span />}
            <span className="nm">{id ? shortName(g, id) : <span className="dim">{game.round === 1 && b.rounds[0]?.some((f) => f.feed?.[0] === game.slot && f.feed?.[1] === side) ? 'First Four' : 'TBD'}</span>}</span>
            <span className="sc">{sc ?? ''}</span>
          </div>
        );
      })}
    </motion.div>
  );
}

function Region({ g, b, reg, rev }: { g: GameState; b: TourneyBracket; reg: number; rev?: boolean }) {
  const cols = [1, 2, 3, 4].map((r) => {
    const n = b.rounds[r].length / 4;
    return b.rounds[r].slice(reg * n, reg * n + n);
  });
  return (
    <div>
      <div className="brk-rhead" style={{ textAlign: rev ? 'right' : 'left' }}>{REGIONS[reg]} Region</div>
      <div className={`brk-region ${rev ? 'rev' : ''}`}>
        {cols.map((games, ci) => (
          <div key={ci} className="brk-col" style={{ minHeight: 8 * 58 }}>
            {games.map((game) => <MatchCard key={game.id} g={g} game={game} b={b} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function BracketScreen() {
  const g = useGameState();
  const [tab, setTab] = useState<Tab>(g.ncaa || g.phase === 'selection' ? 'ncaa' : Object.keys(g.confTourneys).length ? 'conf' : 'ncaa');
  return (
    <div>
      <style>{CSS}</style>
      <div className="page-head">
        <div>
          <div className="eyebrow">{seasonLabel(g.season)} · Postseason</div>
          <h1 className="h1">Brackets</h1>
        </div>
        <div className="spacer" />
        {g.ncaa && <button className="btn sm" onClick={replaySelectionShow} title="Watch the Selection Sunday reveal again">▶ Selection Show</button>}
        <Tabs id="brk-tabs" value={tab} onChange={setTab} tabs={[{ id: 'ncaa', label: 'NCAA Tournament' }, { id: 'conf', label: 'Conference Tournaments' }]} />
      </div>
      {tab === 'ncaa' ? <NcaaBracket g={g} /> : <ConfBrackets g={g} />}
    </div>
  );
}

function NcaaBracket({ g }: { g: GameState }) {
  const nav = useGame((s) => s.nav);
  const b = g.ncaa;
  if (!b) {
    return (
      <Section>
        <Empty>
          <div style={{ fontSize: 42 }}>🗂️</div>
          <div className="h2" style={{ margin: '8px 0' }}>The field hasn't been revealed</div>
          <div className="muted" style={{ marginBottom: 14 }}>The 68-team bracket drops on Selection Sunday. Until then, check the projected field.</div>
          <button className="btn primary" onClick={() => nav('rankings')}>View Bracketology →</button>
        </Empty>
      </Section>
    );
  }
  const champ = b.champion ? g.teams[b.champion] : null;
  const f4 = b.rounds[5];
  const title = b.rounds[6][0];
  const userSeed = b.seeds[g.user.teamId];
  return (
    <div>
      {champ && <ChampionBanner g={g} id={champ.id} />}
      <div className="row wrap" style={{ marginBottom: 14 }}>
        {userSeed ? <span className="pill accent">{g.teams[g.user.teamId].school}: No. {userSeed} seed</span> : <span className="pill">{g.teams[g.user.teamId].school} did not make the field</span>}
        <span className="pill">68 teams · 67 games</span>
        <div className="spacer" />
        <span className="tiny muted">Click any completed game for the box score</span>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><div className="h3">First Four · Dayton</div></div>
        <div className="row wrap" style={{ gap: 12 }}>
          {b.rounds[0].map((game) => (
            <div key={game.id}>
              <div className="brk-colhead">{game.region} · {game.seeds[0]}-seeds</div>
              <MatchCard g={g} game={game} b={b} />
            </div>
          ))}
        </div>
      </div>
      <div className="card brk-scroll" style={{ padding: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 220px auto', gap: 22, minWidth: 1560, alignItems: 'center' }}>
          <div className="col" style={{ gap: 26 }}>
            <Region g={g} b={b} reg={0} />
            <Region g={g} b={b} reg={1} />
          </div>
          <div className="col" style={{ alignItems: 'center', gap: 18 }}>
            <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity }} style={{ fontSize: 64, filter: 'drop-shadow(0 8px 24px rgba(246,201,76,.45))' }}>🏆</motion.div>
            <div className="brk-rhead" style={{ color: 'var(--gold)' }}>Final Four</div>
            <div className="brk-colhead">East vs West</div>
            <MatchCard g={g} game={f4[0]} b={b} />
            <div className="brk-colhead" style={{ marginTop: 6 }}>National Championship</div>
            <div style={{ transform: 'scale(1.12)' }}><MatchCard g={g} game={title} b={b} /></div>
            <div className="brk-colhead" style={{ marginTop: 6 }}>South vs Midwest</div>
            <MatchCard g={g} game={f4[1]} b={b} />
            {champ && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.3 }} className="col" style={{ alignItems: 'center', gap: 6, marginTop: 10 }}>
                <TeamLogo team={champ} size={70} />
                <div className="h3 gold">{champ.school}</div>
                <div className="tiny upper muted b">National Champion</div>
              </motion.div>
            )}
          </div>
          <div className="col" style={{ gap: 26 }}>
            <Region g={g} b={b} reg={2} rev />
            <Region g={g} b={b} reg={3} rev />
          </div>
        </div>
      </div>
    </div>
  );
}

function ChampionBanner({ g, id }: { g: GameState; id: string }) {
  const t = g.teams[id];
  const mine = id === g.user.teamId;
  const final = g.ncaa?.rounds[6][0];
  const ru = final?.teams.find((x) => x && x !== id);
  return (
    <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
      {mine && <Confetti colors={[t.colors[0], t.colors[1], '#f6c94c', '#ffffff']} count={140} />}
      <div className="row" style={{ padding: '20px 24px', gap: 18, background: `linear-gradient(110deg, ${t.colors[0]}, ${t.colors[0]}55 55%, transparent)` }}>
        <motion.div initial={{ rotate: -20, scale: 0.4 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 180, damping: 10 }}>
          <TeamLogo team={t} size={84} />
        </motion.div>
        <div>
          <div className="eyebrow" style={{ color: 'rgba(255,255,255,.85)' }}>{seasonLabel(g.season)} National Champions</div>
          <div className="h1" style={{ fontSize: 46 }}>{t.school} {t.mascot}</div>
          <div className="small" style={{ opacity: 0.9 }}>
            {t.record.w}-{t.record.l} · No. {g.ncaa?.seeds[id]} seed{ru && final?.score ? ` · def. ${g.teams[ru].school} ${Math.max(...final.score)}-${Math.min(...final.score)}` : ''}
          </div>
        </div>
        <div className="spacer" />
        <div style={{ fontSize: 70 }}>🏆</div>
      </div>
    </motion.div>
  );
}

function ConfBrackets({ g }: { g: GameState }) {
  const ids = Object.keys(g.confTourneys);
  const userConf = g.teams[g.user.teamId].conf;
  const [confId, setConfId] = useState(ids.includes(userConf) ? userConf : ids[0]);
  const b = confId ? g.confTourneys[confId] : undefined;
  const champs = useMemo(() => Object.entries(g.confTourneys).filter(([, x]) => x.champion), [g, g.day]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ids.length || !b) {
    return (
      <Section>
        <Empty>
          <div style={{ fontSize: 42 }}>🏟️</div>
          <div className="h2" style={{ margin: '8px 0' }}>Championship Week hasn't started</div>
          <div className="muted">Conference tournaments begin after the regular season ends.</div>
        </Empty>
      </Section>
    );
  }
  const conf = g.conferences.find((c) => c.id === confId);
  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 280px', alignItems: 'start' }}>
      <div className="card">
        <div className="card-head">
          <div className="h3">{b.name}</div>
          <select className="select" style={{ width: 260 }} value={confId} onChange={(e) => setConfId(e.target.value)}>
            {ids.map((id) => <option key={id} value={id}>{g.conferences.find((c) => c.id === id)?.name ?? id}{id === userConf ? ' (yours)' : ''}</option>)}
          </select>
        </div>
        {b.champion && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="row" style={{ padding: '10px 14px', marginBottom: 14, borderRadius: 12, background: `linear-gradient(90deg, ${g.teams[b.champion].colors[0]}aa, transparent)` }}>
            <span style={{ fontSize: 26 }}>🏆</span>
            <TeamLogo team={g.teams[b.champion]} size={34} />
            <div>
              <div className="b">{g.teams[b.champion].school} wins the {conf?.short} Tournament</div>
              <div className="tiny muted">Automatic bid to the NCAA Tournament</div>
            </div>
          </motion.div>
        )}
        <div className="brk-scroll">
          <div className="row" style={{ alignItems: 'stretch', gap: 16, minWidth: b.rounds.length * 175 }}>
            {b.rounds.map((games, r) => (
              <div key={r} className="col" style={{ gap: 0 }}>
                <div className="brk-colhead">{b.roundNames[r]}</div>
                <div className="brk-col" style={{ flex: 1, minHeight: b.rounds[0].length * 60 }}>
                  {games.map((game) => (game.teams[0] || game.teams[1] || r > 0
                    ? <MatchCard key={game.id} g={g} game={game} b={b} />
                    : <div key={game.id} style={{ height: 49 }} />))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Section title="Auto Bids Clinched">
        {champs.length === 0 && <div className="small muted">No champions crowned yet.</div>}
        {champs.map(([cid, x]) => {
          const t = g.teams[x.champion!];
          return (
            <motion.div key={cid} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)', cursor: 'pointer' }} onClick={() => setConfId(cid)}>
              <span className="tiny b muted" style={{ width: 64 }}>{g.conferences.find((c) => c.id === cid)?.short}</span>
              <TeamLogo team={t} size={22} />
              <span className="small b ellipsis" style={{ flex: 1 }}>{t.school}</span>
              <span className="tiny muted">{t.record.w}-{t.record.l}</span>
            </motion.div>
          );
        })}
      </Section>
    </div>
  );
}
