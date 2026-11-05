// Locker Room: team chemistry and what drives it, your captains, every player's mood and role,
// the groups inside the room, and a log of what's happened this season.
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { PlayerFace, Section, Sparkline, TeamHeroBg } from '../components/common';
import type { GameState, LockerGroup, Player, Team } from '../../engine/types';
import {
  CHEM_NEUTRAL, GROUP_INFO, captainGrade, captainScore, captainsOf, chemFactors, chemImpact, chemLabel, lockerGroup, nameCaptains, roleOf,
} from '../../engine/chemistry';
import { TRAIT_INFO } from '../../engine/player';
import { seasonLabel } from '../../engine/calendar';
import { sfx } from '../sound';

export const moodOf = (m: number): [string, string] => (m >= 80 ? ['Fired up', 'good'] : m >= 65 ? ['Happy', 'good'] : m >= 50 ? ['Steady', ''] : m >= 35 ? ['Frustrated', 'gold'] : ['Miserable', 'bad']);
const moodColor = (m: number) => (m >= 65 ? 'linear-gradient(90deg,#1fa36f,#22d38f)' : m >= 50 ? 'linear-gradient(90deg,#6b7a99,#9fb0cc)' : m >= 35 ? 'linear-gradient(90deg,#d99a1e,#f6c94c)' : 'linear-gradient(90deg,#ff5d5d,#ff9b52)');
const mpg = (p: Player) => (p.stats.gp ? p.stats.min / p.stats.gp : 0);

/** a half-circle gauge for team chemistry */
export function ChemGauge({ chem, size = 190 }: { chem: number; size?: number }) {
  const r = size / 2 - 12, cx = size / 2, cy = size / 2;
  const f = Math.max(0, Math.min(1, chem / 100));
  const a = Math.PI * (1 - f);
  const x = cx + r * Math.cos(a), y = cy - r * Math.sin(a);
  const lab = chemLabel(chem);
  return (
    <div style={{ position: 'relative', width: size, height: size / 2 + 34 }}>
      <svg width={size} height={size / 2 + 14} viewBox={`0 0 ${size} ${size / 2 + 14}`}>
        <defs>
          <linearGradient id="chemg" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#ff4d4d" /><stop offset="40%" stopColor="#f6c94c" /><stop offset="70%" stopColor="#22d38f" /><stop offset="100%" stopColor="#3dd6ff" />
          </linearGradient>
        </defs>
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="14" strokeLinecap="round" />
        <motion.path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="url(#chemg)" strokeWidth="14" strokeLinecap="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: f }} transition={{ duration: 1.1, ease: 'easeOut' }} />
        <motion.circle r="7" fill="#fff" initial={{ cx: cx - r, cy }} animate={{ cx: x, cy: y }} transition={{ duration: 1.1, ease: 'easeOut' }} style={{ filter: 'drop-shadow(0 0 6px rgba(255,255,255,.7))' }} />
      </svg>
      <div style={{ position: 'absolute', left: 0, right: 0, top: size / 2 - 40, textAlign: 'center' }}>
        <div className="num" style={{ fontSize: 40, lineHeight: 1 }}>{Math.round(chem)}</div>
        <div className={`b ${lab.tone}`} style={{ fontSize: 15, marginTop: 4 }}>{lab.icon} {lab.label}</div>
      </div>
    </div>
  );
}

export function LockerRoomScreen() {
  const g = useGameState();
  const open = useGame((s) => s.open);
  const team = g.teams[g.user.teamId];
  const chem = team.chem ?? CHEM_NEUTRAL;
  const lab = chemLabel(chem);
  const imp = chemImpact(chem);
  const { target, factors } = chemFactors(g, team);
  const L = g.locker?.teamId === team.id ? g.locker : undefined;
  const trend = L?.trend ?? [];
  const ps = team.roster.map((id) => g.players[id]).filter(Boolean);
  const ranked = [...ps].filter((p) => !p.redshirting).sort((a, b) => b.ovr - a.ovr);
  const caps = captainsOf(g, team);
  const log = (L?.log ?? []).filter((e) => e.season === g.season);
  const dir = target - chem;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="hero" style={{ padding: '22px 26px 18px' }}>
          <TeamHeroBg team={team} />
          <div className="row" style={{ alignItems: 'center', gap: 26, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div className="eyebrow" style={{ color: 'rgba(255,255,255,.8)' }}>Locker Room · {team.school} · {seasonLabel(g.season)}</div>
              <div className="h1" style={{ fontSize: 42 }}>🧩 Locker Room</div>
              <div className="small" style={{ opacity: 0.88, maxWidth: 560 }}>{lab.desc} Chemistry comes from your captains, leaders, roles, continuity, mood and winning. It gives a small edge in every game and matters most late in close ones.</div>
              <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <span className="pill" title="Added to every player's ratings in games">{imp.ratings >= 0 ? '+' : ''}{imp.ratings} to every rating</span>
                <span className="pill" title="Shot and free-throw makes late in close games">{imp.clutch >= 0 ? '+' : ''}{imp.clutch}% in the clutch</span>
                <span className="pill" title="Chance that unhappy players enter the portal">Portal exits {imp.portal > 0 ? '+' : ''}{imp.portal}%</span>
              </div>
            </div>
            <div className="col" style={{ alignItems: 'center', gap: 2 }}>
              <ChemGauge chem={chem} />
              <div className="tiny" style={{ opacity: 0.85 }}>{Math.abs(dir) < 1 ? 'Holding steady' : dir > 0 ? `▲ Heading toward ${Math.round(target)}` : `▼ Sliding toward ${Math.round(target)}`}</div>
            </div>
            <div className="col" style={{ gap: 4, minWidth: 180 }}>
              <div className="tiny upper" style={{ opacity: 0.75 }}>This season</div>
              {trend.length > 1 ? <Sparkline data={trend} w={200} h={46} color="#fff" /> : <div className="tiny" style={{ opacity: 0.7, height: 46 }}>The trend fills in week by week.</div>}
              <div className="tiny" style={{ opacity: 0.75 }}>Captains: {caps.length ? caps.map((p) => p.last).join(' & ') : 'none yet'}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid g-main" style={{ alignItems: 'start' }}>
        <div className="col" style={{ gap: 16 }}>
          <Section title="The Room" right={<span className="tiny muted">Mood, role and minutes for every player</span>}>
            <div className="lk-table">
              <div className="lk-row lk-head tiny muted upper">
                <span /><span>Player</span><span>Group</span><span>Role · minutes</span><span>Mood</span>
              </div>
              {[...ps].sort((a, b) => b.ovr - a.ovr).map((p) => {
                const rank = ranked.indexOf(p);
                const role = roleOf(p, rank < 0 ? 99 : rank);
                const m = mpg(p);
                const short = p.stats.gp >= 3 && m + 6 < role.min;
                const [ml, mc] = moodOf(p.morale);
                const grp = lockerGroup(p, team.id);
                const cap = caps.includes(p);
                return (
                  <div key={p.id} className={`lk-row ${cap ? 'cap' : ''}`} onClick={() => open({ kind: 'player', id: p.id })}>
                    <PlayerFace p={p} size={38} team={team} />
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 6 }}>
                        <span className="b ellipsis">{p.first} {p.last}</span>
                        {cap && <span className="pill gold" style={{ fontSize: 9 }} title="Captain">© Captain</span>}
                        {L?.promised[p.id] && <span className="pill" style={{ fontSize: 9 }} title="You promised him a bigger role">Promised minutes</span>}
                        {L?.doorOpen.includes(p.id) && <span className="pill bad" style={{ fontSize: 9 }} title="You told him he can look elsewhere">Leaving</span>}
                      </div>
                      <div className="tiny muted ellipsis">{p.pos} · {p.cls} · {p.ovr} OVR {p.traits.map((t) => <span key={t} title={`${TRAIT_INFO[t].label}: ${TRAIT_INFO[t].desc}`} style={{ marginLeft: 3 }}>{TRAIT_INFO[t].icon}</span>)}</div>
                    </div>
                    <span className="tiny">{GROUP_INFO[grp].icon} {grp === 'freshman' && p.cls !== 'FR' ? 'Newcomer' : grp === 'freshman' ? 'Freshman' : grp === 'transfer' ? 'Transfer' : 'Returner'}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="tiny"><b>{role.role}</b>{role.min ? <span className="muted"> · expects ~{role.min}</span> : null}</div>
                      <div className="row" style={{ gap: 6 }}>
                        <span className="heat-bar" style={{ width: 90, height: 5 }}><i style={{ width: `${Math.min(100, (m / 36) * 100)}%`, background: short ? 'linear-gradient(90deg,#d99a1e,#f6c94c)' : 'linear-gradient(90deg,#3d7bff,#6aa1ff)', boxShadow: 'none' }} /></span>
                        <span className={`tiny num ${short ? 'gold' : 'muted'}`}>{p.stats.gp ? `${m.toFixed(1)} mpg` : p.redshirting ? 'redshirt' : 'no games yet'}</span>
                      </div>
                    </div>
                    <div>
                      <div className="row" style={{ gap: 6 }}>
                        <span className="heat-bar" style={{ width: 70, height: 6 }}><i style={{ width: `${p.morale}%`, background: moodColor(p.morale), boxShadow: 'none' }} /></span>
                        <span className={`tiny b ${mc}`}>{ml}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
          <Section title="Locker Room Log" right={<span className="tiny muted">{seasonLabel(g.season)}</span>}>
            {!log.length ? <div className="tiny muted">Nothing yet. Decisions you make in your Office, team meetings, suspensions, promises and Senior Night all land here.</div> : (
              <div className="col" style={{ gap: 2 }}>
                {log.slice(0, 24).map((e, i) => (
                  <motion.div key={`${e.day}-${i}`} className="row lk-log" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
                    <span style={{ fontSize: 18, width: 26, textAlign: 'center' }}>{e.icon}</span>
                    <span className="tiny muted" style={{ width: 70 }}>{g.calendar[e.day]?.label ?? ''}</span>
                    <span className="small" style={{ flex: 1 }}>{e.text}</span>
                    {e.delta ? <span className={`tiny num b ${e.delta > 0 ? 'good' : 'bad'}`}>{e.delta > 0 ? '+' : '−'}{Math.abs(e.delta)} chem</span> : null}
                  </motion.div>
                ))}
              </div>
            )}
          </Section>
        </div>

        <div className="col" style={{ gap: 16 }}>
          <Captains g={g} team={team} ps={ps} />
          <Section title="What's Driving It" right={<span className="tiny muted">Target {Math.round(target)}</span>}>
            <div className="col" style={{ gap: 5 }}>
              {factors.map((f) => (
                <div key={f.key} className="row small" style={{ gap: 8 }}>
                  <span style={{ flex: 1, minWidth: 0 }} className="ellipsis">{f.label}</span>
                  <span className="lk-fbar"><i className={f.value >= 0 ? 'pos' : 'neg'} style={{ width: `${Math.min(50, Math.abs(f.value) * 6)}%` }} /></span>
                  <span className={`num tiny ${f.value >= 0 ? 'good' : 'bad'}`} style={{ width: 36, textAlign: 'right' }}>{f.value > 0 ? '+' : '−'}{Math.abs(f.value)}</span>
                </div>
              ))}
              <div className="tiny muted" style={{ marginTop: 6 }}>Chemistry moves about a third of the way to its target each week. Decisions and moments fade slowly.</div>
            </div>
          </Section>
          <Groups g={g} team={team} ps={ps} />
          {L && L.pastCaptains.filter((x) => x.teamId === team.id).length > 0 && (
            <Section title="Past Captains">
              {L.pastCaptains.filter((x) => x.teamId === team.id).slice(0, 8).map((x) => (
                <div key={x.season} className="row small" style={{ padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
                  <span className="tiny muted" style={{ width: 62 }}>{seasonLabel(x.season)}</span>
                  <span style={{ flex: 1 }}>{x.names.join(' & ')}</span>
                </div>
              ))}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Captains({ g, team, ps }: { g: GameState; team: Team; ps: Player[] }) {
  const { mutate, toast } = useGame.getState();
  const caps = captainsOf(g, team);
  const cands = [...ps].filter((p) => !p.redshirting).sort((a, b) => captainScore(b, team.id) - captainScore(a, team.id));
  // with no captains yet, start from the staff's two picks
  const [sel, setSel] = useState<string[]>(caps.length ? caps.map((p) => p.id) : cands.slice(0, 2).map((p) => p.id));
  const [editing, setEditing] = useState(!caps.length);
  const midSeason = team.record.w + team.record.l > 0;
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 2 ? [s[1], id] : [...s, id]));
  const save = () => {
    let res = { ok: false, msg: '' };
    mutate((gg) => { res = nameCaptains(gg, sel); });
    toast(res.msg, res.ok ? 'good' : 'bad');
    if (res.ok) { sfx.fanfare(); setEditing(false); }
  };
  const dropping = caps.filter((p) => !sel.includes(p.id));
  return (
    <Section title="Captains" right={!editing && <button className="btn sm ghost" onClick={() => { setSel(caps.map((p) => p.id)); setEditing(true); }}>Change</button>}>
      {!editing ? (
        <div className="grid g2" style={{ gap: 10 }}>
          {caps.map((p) => {
            const sc = captainScore(p, team.id), gr = captainGrade(sc);
            return (
              <div key={p.id} className="card lk-cap" style={{ padding: 12, textAlign: 'center' }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <PlayerFace p={p} size={64} team={team} />
                  <span className="lk-c">C</span>
                </div>
                <div className="b ellipsis" style={{ marginTop: 6 }}>{p.first} {p.last}</div>
                <div className="tiny muted">{p.pos} · {p.cls}</div>
                <div className={`tiny b ${gr.tone}`} style={{ marginTop: 4 }}>{gr.label}</div>
              </div>
            );
          })}
          <div className="tiny muted" style={{ gridColumn: '1 / -1' }}>{g.locker?.captainsBy === 'staff' ? 'Picked by your staff. ' : ''}Captains lead team meetings, steady the room in losing streaks and are less likely to transfer.</div>
        </div>
      ) : (
        <div className="col" style={{ gap: 6 }}>
          <div className="tiny muted">Pick up to two. Leaders, upperclassmen and coachable players make the best captains; divas and hotheads the worst.{midSeason && caps.length ? ' Stripping a captain mid-season crushes him and costs chemistry.' : ''}</div>
          {cands.slice(0, 9).map((p) => {
            const sc = captainScore(p, team.id), gr = captainGrade(sc), on = sel.includes(p.id);
            return (
              <div key={p.id} className={`row lk-pick ${on ? 'on' : ''}`} onClick={() => toggle(p.id)}>
                <PlayerFace p={p} size={34} team={team} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="small b ellipsis">{p.first} {p.last} <span className="tiny muted">{p.pos} · {p.cls}</span>{!caps.length && cands.indexOf(p) < 2 && <span className="pill" style={{ fontSize: 9, marginLeft: 6 }}>Staff pick</span>}</div>
                  <div className="tiny ellipsis"><span className={gr.tone}>{gr.label}</span>{p.traits.filter((t) => ['leader', 'coachable', 'glue', 'diva', 'hothead'].includes(t)).map((t) => <span key={t} className="muted"> · {TRAIT_INFO[t].icon} {TRAIT_INFO[t].label}</span>)}</div>
                </div>
                <span className={`lk-check ${on ? 'on' : ''}`}>{on ? '©' : ''}</span>
              </div>
            );
          })}
          <div className="row" style={{ marginTop: 6 }}>
            {dropping.length > 0 && midSeason ? <span className="tiny bad">Strips {dropping.map((p) => p.last).join(' & ')}</span> : null}
            <div className="spacer" />
            {caps.length > 0 && <button className="btn sm ghost" onClick={() => setEditing(false)}>Cancel</button>}
            <button className="btn sm primary" disabled={!sel.length} onClick={save}>Name captain{sel.length > 1 ? 's' : ''}</button>
          </div>
        </div>
      )}
    </Section>
  );
}

function Groups({ g, team, ps }: { g: GameState; team: Team; ps: Player[] }) {
  const groups: LockerGroup[] = ['returner', 'transfer', 'freshman'];
  const totalMin = ps.reduce((s, p) => s + p.stats.min, 0);
  void g;
  return (
    <Section title="Groups" right={<span className="tiny muted">Cliques form when one group feels left out</span>}>
      <div className="grid g3" style={{ gap: 8 }}>
        {groups.map((k) => {
          const xs = ps.filter((p) => lockerGroup(p, team.id) === k);
          const avg = xs.length ? xs.reduce((s, p) => s + p.morale, 0) / xs.length : 0;
          const share = totalMin ? xs.reduce((s, p) => s + p.stats.min, 0) / totalMin : 0;
          const [ml, mc] = moodOf(avg);
          return (
            <div key={k} className="stat-tile" style={{ padding: '10px 10px' }}>
              <div className="l">{GROUP_INFO[k].icon} {GROUP_INFO[k].label}</div>
              <div className="v" style={{ fontSize: 22 }}>{xs.length}</div>
              <div className={`tiny b ${xs.length ? mc : 'muted'}`}>{xs.length ? ml : '—'}</div>
              <div className="tiny muted">{totalMin ? `${Math.round(share * 100)}% of minutes` : ' '}</div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/** compact card for the dashboard */
export function LockerCard({ g }: { g: GameState }) {
  const nav = useGame((s) => s.nav);
  const team = g.teams[g.user.teamId];
  const chem = team.chem ?? CHEM_NEUTRAL;
  const lab = chemLabel(chem);
  const L = g.locker?.teamId === team.id ? g.locker : undefined;
  const caps = captainsOf(g, team);
  const last = L?.log.find((e) => e.season === g.season);
  const trend = L?.trend ?? [];
  return (
    <Section title="Locker Room" right={<button className="btn sm ghost" onClick={() => nav('locker')}>Locker room →</button>}>
      <div className="row" style={{ gap: 12, cursor: 'pointer' }} onClick={() => nav('locker')}>
        <div style={{ textAlign: 'center', minWidth: 74 }}>
          <div className="num" style={{ fontSize: 30, lineHeight: 1 }}>{Math.round(chem)}</div>
          <div className={`tiny b ${lab.tone}`}>{lab.icon} {lab.label}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {trend.length > 1 && <Sparkline data={trend} w={150} h={28} />}
          <div className="tiny muted ellipsis">Captains: {caps.length ? caps.map((p) => p.last).join(' & ') : <span className="gold b">not named</span>}</div>
          {last && <div className="tiny ellipsis" style={{ marginTop: 2 }}>{last.icon} {last.text}</div>}
        </div>
      </div>
    </Section>
  );
}
