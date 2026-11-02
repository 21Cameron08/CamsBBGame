import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { PlayerFace, Ovr, Tabs, Bar, Section, useSorted, fmtMoneyShort } from '../components/common';
import { teamPlayers, ROSTER_MAX } from '../../engine/team';
import { playerPerGame } from '../../engine/season';
import { fmtHeight, TRAIT_INFO } from '../../engine/player';
import { depthChart } from '../../engine/sim';
import { RATING_KEYS, RATING_LABELS, type DefStyle, type OffStyle, type Player } from '../../engine/types';
import { ratingColor } from '../color';
import { sfx } from '../sound';

export const OFF_STYLES: { id: OffStyle; label: string; icon: string; desc: string }[] = [
  { id: 'balanced', label: 'Balanced', icon: '⚖️', desc: 'Take what the defense gives you.' },
  { id: 'motion', label: 'Motion', icon: '🔄', desc: 'Ball movement, more assists, fewer turnovers.' },
  { id: 'pace', label: 'Pace & Space', icon: '⚡', desc: 'Run in transition, early threes.' },
  { id: 'post', label: 'Inside-Out', icon: '🏋️', desc: 'Feed the bigs, punish mismatches.' },
  { id: 'drive', label: 'Dribble Drive', icon: '🏃', desc: 'Attack the rim, draw fouls.' },
  { id: 'three', label: 'Bombs Away', icon: '🎯', desc: 'Hunt threes. Live and die by the arc.' },
];
export const DEF_STYLES: { id: DefStyle; label: string; icon: string; desc: string }[] = [
  { id: 'man', label: 'Man-to-Man', icon: '🛡️', desc: 'Solid fundamentals.' },
  { id: 'packline', label: 'Pack Line', icon: '🧱', desc: 'Wall off the paint, concede jumpers.' },
  { id: 'zone', label: '2-3 Zone', icon: '🕸️', desc: 'Protect the rim and boards, invite threes.' },
  { id: 'press', label: 'Full-Court Press', icon: '🔥', desc: 'Force turnovers; tiring, risky.' },
  { id: 'switch', label: 'Switch Everything', icon: '🔀', desc: 'Fewer breakdowns; needs versatility.' },
];

export function RosterScreen() {
  const g = useGameState();
  const [tab, setTab] = useState<'roster' | 'lineup' | 'ratings'>('roster');
  const user = g.teams[g.user.teamId];
  const players = teamPlayers(g, user.id);
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">{players.length}/{ROSTER_MAX} roster spots · {user.school}</div>
          <h1 className="h1" style={{ marginTop: 6 }}>Roster & Lineup</h1>
        </div>
        <div className="spacer" />
        <Tabs id="roster" value={tab} onChange={setTab} tabs={[{ id: 'roster', label: 'Roster' }, { id: 'lineup', label: 'Lineup & Strategy' }, { id: 'ratings', label: 'Ratings Matrix' }]} />
      </div>
      {tab === 'roster' && <RosterTable players={players} />}
      {tab === 'lineup' && <Lineup />}
      {tab === 'ratings' && <RatingsMatrix players={players} />}
    </div>
  );
}

function RosterTable({ players }: { players: Player[] }) {
  const g = useGameState();
  const user = g.teams[g.user.teamId];
  const open = useGame((s) => s.open);
  const { sorted, th } = useSorted(players, { key: 'ovr', dir: -1 }, {
    num: (p) => p.num, name: (p) => p.last, pos: (p) => ['PG', 'SG', 'SF', 'PF', 'C'].indexOf(p.pos), cls: (p) => ['FR', 'SO', 'JR', 'SR', 'GR'].indexOf(p.cls),
    ht: (p) => p.height, ovr: (p) => p.ovr, pot: (p) => p.pot, ppg: (p) => playerPerGame(p).ppg, rpg: (p) => playerPerGame(p).rpg, apg: (p) => playerPerGame(p).apg,
    mpg: (p) => playerPerGame(p).mpg, nil: (p) => p.nil?.amount ?? 0, morale: (p) => p.morale,
  });
  return (
    <div className="card flush">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th></th>{th('num', '#')}{th('name', 'Player')}{th('pos', 'Pos')}{th('cls', 'Yr')}{th('ht', 'Ht')}{th('ovr', 'OVR', 'c')}{th('pot', 'POT', 'c')}
              <th>Archetype</th>{th('mpg', 'MIN', 'r')}{th('ppg', 'PTS', 'r')}{th('rpg', 'REB', 'r')}{th('apg', 'AST', 'r')}{th('nil', 'NIL', 'r')}{th('morale', 'Morale')}<th>Traits</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => {
              const pg = playerPerGame(p);
              return (
                <tr key={p.id} className="click row-in" style={{ animationDelay: `${Math.min(i * 25, 400)}ms` }} onClick={() => open({ kind: 'player', id: p.id })}>
                  <td style={{ width: 44, padding: '4px 8px' }}><PlayerFace p={p} size={36} team={user} /></td>
                  <td className="num muted">{p.num}</td>
                  <td>
                    <div className="b">{p.first} {p.last}</div>
                    <div className="tiny muted">{p.hometown}{p.country === 'USA' ? `, ${p.state}` : ''}{p.transfers ? ' · Transfer' : ''}</div>
                  </td>
                  <td><span className="pill">{p.pos}</span></td>
                  <td>{p.cls}{p.redshirting ? <span className="pill blue" style={{ marginLeft: 4 }}>RS</span> : p.redshirted ? <span className="tiny dim"> (rs)</span> : ''}</td>
                  <td className="muted">{fmtHeight(p.height)}</td>
                  <td className="c"><Ovr v={p.ovr} size="sm" /></td>
                  <td className="c num" style={{ color: ratingColor(p.pot) }}>{p.pot}</td>
                  <td className="small muted">{p.archetype}</td>
                  <td className="r mono">{p.stats.gp ? pg.mpg.toFixed(1) : '—'}</td>
                  <td className="r mono b">{p.stats.gp ? pg.ppg.toFixed(1) : '—'}</td>
                  <td className="r mono">{p.stats.gp ? pg.rpg.toFixed(1) : '—'}</td>
                  <td className="r mono">{p.stats.gp ? pg.apg.toFixed(1) : '—'}</td>
                  <td className="r mono">{p.nil ? fmtMoneyShort(p.nil.amount) : <span className="bad small">None</span>}</td>
                  <td style={{ width: 90 }}><Bar v={p.morale} className="thin" color={p.morale > 70 ? 'var(--good)' : p.morale > 45 ? 'var(--warn)' : 'var(--bad)'} /></td>
                  <td>
                    {p.injury && <span className="pill bad" title={p.injury.type}>🩹 {p.injury.games}g</span>}
                    {p.traits.map((t) => <span key={t} title={`${TRAIT_INFO[t].label}: ${TRAIT_INFO[t].desc}`} style={{ marginRight: 3 }}>{TRAIT_INFO[t].icon}</span>)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Lineup() {
  const g = useGameState();
  const mutate = useGame((s) => s.mutate);
  const open = useGame((s) => s.open);
  const user = g.teams[g.user.teamId];
  const players = teamPlayers(g, user.id);
  const s = user.strategy;
  const chart = useMemo(() => depthChart(players, s), [players, s, g]); // eslint-disable-line react-hooks/exhaustive-deps
  const starters = chart.slice(0, 5);
  const manual = s.starters.length === 5;
  const toggleStarter = (id: string) => {
    mutate((gg) => {
      const st = gg.teams[gg.user.teamId].strategy;
      let cur = st.starters.length === 5 ? [...st.starters] : starters.map((p) => p.id);
      if (cur.includes(id)) return;
      // replace the starter at same position group, else the lowest-rated starter
      const p = gg.players[id];
      const same = cur.map((x) => gg.players[x]).filter((x) => x.pos === p.pos);
      const out = (same[0] ?? cur.map((x) => gg.players[x]).sort((a, b) => a.ovr - b.ovr)[0]).id;
      cur = cur.map((x) => (x === out ? id : x));
      st.starters = cur;
    });
    sfx.click();
  };
  return (
    <div className="grid g-main">
      <div className="col" style={{ gap: 16 }}>
        <Section title="Starting Five" right={<div className="row">{manual && <span className="pill accent">Manual</span>}<button className="btn sm" onClick={() => mutate((gg) => { gg.teams[gg.user.teamId].strategy.starters = []; })}>Auto (best 5)</button></div>}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 10 }}>
            {starters.map((p, i) => (
              <motion.div layout key={p.id} className="card hover" style={{ padding: 10, textAlign: 'center' }} onClick={() => open({ kind: 'player', id: p.id })} transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
                <div className="tiny upper b muted">{['PG', 'SG', 'SF', 'PF', 'C'][i]}</div>
                <PlayerFace p={p} size={70} team={user} />
                <div className="b small ellipsis">{p.last}</div>
                <div className="row" style={{ justifyContent: 'center', gap: 4 }}><span className="pill">{p.pos}</span><Ovr v={p.ovr} size="sm" /></div>
              </motion.div>
            ))}
          </div>
          <div className="small muted" style={{ marginTop: 12 }}>Bench (click a player to promote them into the starting five):</div>
          <div className="row wrap" style={{ marginTop: 8, gap: 8 }}>
            {chart.slice(5).map((p, i) => (
              <motion.button layout key={p.id} className="btn sm" onClick={() => toggleStarter(p.id)} style={{ opacity: i + 5 < s.rotation ? 1 : 0.55 }}>
                <PlayerFace p={p} size={22} team={user} bg="none" /> {p.last} <span className="pill">{p.pos}</span> <Ovr v={p.ovr} size="sm" />
              </motion.button>
            ))}
            {players.filter((p) => p.injury || p.redshirting).map((p) => (
              <span key={p.id} className="pill bad">{p.last} — {p.injury ? `🩹 ${p.injury.type} (${p.injury.games}g)` : 'Redshirting'}</span>
            ))}
          </div>
        </Section>
        <Section title="Offensive System">
          <div className="grid g3">
            {OFF_STYLES.map((o) => (
              <StyleCard key={o.id} on={s.offense === o.id} icon={o.icon} label={o.label} desc={o.desc} onClick={() => mutate((gg) => { gg.teams[gg.user.teamId].strategy.offense = o.id; })} />
            ))}
          </div>
        </Section>
        <Section title="Defensive Scheme">
          <div className="grid g3">
            {DEF_STYLES.map((o) => (
              <StyleCard key={o.id} on={s.defense === o.id} icon={o.icon} label={o.label} desc={o.desc} onClick={() => mutate((gg) => { gg.teams[gg.user.teamId].strategy.defense = o.id; })} />
            ))}
          </div>
        </Section>
      </div>
      <div className="col" style={{ gap: 16 }}>
        <Section title="Tempo">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            {['Grind', 'Patient', 'Normal', 'Up-tempo', 'Blitz'].map((l, i) => (
              <button key={l} className={`btn sm ${s.tempo === i + 1 ? 'primary' : ''}`} onClick={() => mutate((gg) => { gg.teams[gg.user.teamId].strategy.tempo = i + 1; })}>{l}</button>
            ))}
          </div>
          <div className="small muted" style={{ marginTop: 10 }}>Faster tempo = more possessions and variance, but tires your rotation.</div>
        </Section>
        <Section title="Rotation Depth">
          <div className="row">
            <input type="range" min={7} max={11} value={s.rotation} onChange={(e) => mutate((gg) => { gg.teams[gg.user.teamId].strategy.rotation = +e.target.value; }, { save: false })} />
            <span className="num" style={{ fontSize: 26, width: 30 }}>{s.rotation}</span>
          </div>
          <div className="small muted">Players in the regular rotation. Deeper benches handle presses and fatigue; shorter rotations ride your stars.</div>
          <div className="divider" />
          {chart.slice(0, s.rotation).map((p, i) => (
            <div key={p.id} className="row" style={{ padding: '4px 0' }}>
              <span className="num dim" style={{ width: 18 }}>{i + 1}</span>
              <PlayerFace p={p} size={26} team={user} bg="none" />
              <span className="small b" style={{ flex: 1 }}>{p.first[0]}. {p.last}</span>
              <span className="tiny muted">{p.pos}</span>
              <Ovr v={p.ovr} size="sm" />
            </div>
          ))}
        </Section>
      </div>
    </div>
  );
}

function StyleCard({ on, icon, label, desc, onClick }: { on: boolean; icon: string; label: string; desc: string; onClick: () => void }) {
  return (
    <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} className="card" onClick={() => { sfx.click(); onClick(); }}
      style={{ cursor: 'pointer', padding: 14, borderColor: on ? 'var(--accent)' : undefined, background: on ? 'color-mix(in srgb, var(--accent) 15%, var(--panel))' : undefined }}>
      <div className="row"><span style={{ fontSize: 22 }}>{icon}</span><span className="b">{label}</span>{on && <span className="pill accent" style={{ marginLeft: 'auto' }}>Active</span>}</div>
      <div className="tiny muted" style={{ marginTop: 6 }}>{desc}</div>
    </motion.div>
  );
}

function RatingsMatrix({ players }: { players: Player[] }) {
  const g = useGameState();
  const user = g.teams[g.user.teamId];
  const open = useGame((s) => s.open);
  const sorted = [...players].sort((a, b) => b.ovr - a.ovr);
  return (
    <div className="card flush">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Player</th><th className="c">OVR</th>{RATING_KEYS.map((k) => <th key={k} className="c" title={RATING_LABELS[k]}>{RATING_LABELS[k].slice(0, 6)}</th>)}</tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} className="click" onClick={() => open({ kind: 'player', id: p.id })}>
                <td><div className="row"><PlayerFace p={p} size={28} team={user} bg="none" /><span className="b small">{p.first[0]}. {p.last}</span><span className="tiny muted">{p.pos}</span></div></td>
                <td className="c"><Ovr v={p.ovr} size="sm" /></td>
                {RATING_KEYS.map((k) => (
                  <td key={k} className="c num" style={{ background: `${ratingColor(p.ratings[k])}${Math.round(18 + (p.ratings[k] - 40) * 0.6).toString(16).padStart(2, '0')}`, color: '#fff', fontSize: 13 }}>{p.ratings[k]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
