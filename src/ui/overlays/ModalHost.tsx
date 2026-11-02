import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { ModalFrame, PlayerFace, CoachFace, TeamLogo, TeamName, Ovr, Stars, RatingRow, Tabs, Bar, TeamHeroBg, fmtMoneyShort, Section, StaffFace } from '../components/common';
import type { BoxPlayer, BoxScore, GameState, Player, Recruit, RatingKey } from '../../engine/types';
import { RATING_LABELS } from '../../engine/types';
import { fmtHeight, TRAIT_INFO } from '../../engine/player';
import { playerPerGame, isRivalry } from '../../engine/season';
import { playerValue } from '../../engine/nil';
import { teamPlayers } from '../../engine/team';
import { spread } from '../../engine/rankings';
import { normCdf } from '../../engine/sim';
import { seasonLabel } from '../../engine/calendar';
import { RECRUIT_ACTIONS, PRIORITY_LABELS, scoutedValue, userRecruitAction, userOffer, pullOffer, schoolEntry, teamAppeal, type RecruitActionKey } from '../../engine/recruiting';
import { nilAvailable } from '../../engine/nil';
import { ratingColor, teamAccent } from '../color';
import { OFF_STYLES, DEF_STYLES } from '../screens/Roster';
import { statusOf } from '../screens/Recruiting';
import { sfx } from '../sound';

export function ModalHost() {
  const modal = useGame((s) => s.modal);
  const close = useGame((s) => s.close);
  useGame((s) => s.tick);
  return (
    <>
      {modal && (
        <ModalFrame key={modal.kind + ('id' in modal ? modal.id : modal.gameId)} onClose={close} narrow={false}>
          {modal.kind === 'player' && <PlayerModal id={modal.id} />}
          {modal.kind === 'recruit' && <RecruitModal id={modal.id} />}
          {modal.kind === 'team' && <TeamModal id={modal.id} />}
          {modal.kind === 'box' && <BoxModal gameId={modal.gameId} />}
          {modal.kind === 'pregame' && <PregameModal gameId={modal.gameId} />}
        </ModalFrame>
      )}
    </>
  );
}

const GROUPS: { label: string; keys: RatingKey[] }[] = [
  { label: 'Scoring', keys: ['ins', 'mid', 'tp', 'ft'] },
  { label: 'Playmaking', keys: ['pas', 'hdl', 'iq'] },
  { label: 'Defense', keys: ['perD', 'intD', 'stl', 'blk', 'reb'] },
  { label: 'Physical', keys: ['ath', 'spd', 'str', 'sta'] },
];

// ================= Player =================
function PlayerModal({ id }: { id: string }) {
  const g = useGameState();
  const p = g.players[id];
  const [tab, setTab] = useState<'ratings' | 'stats' | 'bio'>('ratings');
  if (!p) return <div className="empty">Player not found.</div>;
  const team = p.teamId ? g.teams[p.teamId] : undefined;
  const pg = playerPerGame(p);
  const isMine = p.teamId === g.user.teamId;
  const value = playerValue(g, p);
  return (
    <div>
      <div className="hero" style={{ padding: '28px 30px 22px' }}>
        {team && <TeamHeroBg team={team} />}
        <div className="row gap-l" style={{ alignItems: 'flex-end' }}>
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 20 }}>
            <PlayerFace p={p} size={170} team={team} bg="card" />
          </motion.div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row" style={{ gap: 8 }}>{team && <TeamLogo team={team} size={26} />}<span className="eyebrow" style={{ color: 'rgba(255,255,255,.8)' }}>{team?.school ?? 'Free agent'} · #{p.num}</span></div>
            <div className="h1" style={{ fontSize: 46, marginTop: 6 }}>{p.first} <span style={{ color: team ? teamAccent(team.colors) : undefined }}>{p.last}</span></div>
            <div className="row wrap" style={{ marginTop: 8 }}>
              <span className="pill">{p.pos}</span><span className="pill">{p.cls}{p.redshirted ? ' (RS)' : ''}</span><span className="pill">{fmtHeight(p.height)} · {p.weight} lbs</span>
              <span className="pill">{p.archetype}</span><span className="pill">🏠 {p.hometown}{p.country === 'USA' ? `, ${p.state}` : ''}</span><span className="pill">📱 {p.followers.toLocaleString()}</span>
              {p.injury && <span className="pill bad">🩹 {p.injury.type} · {p.injury.games} games</span>}
              {p.redshirting && <span className="pill blue">Redshirting</span>}
              {p.promise && <span className="pill gold">Promised: {p.promise}</span>}
            </div>
            <div className="row wrap gap-s" style={{ marginTop: 8 }}>
              {p.traits.map((t) => <span key={t} className={`pill ${TRAIT_INFO[t].good === true ? 'good' : TRAIT_INFO[t].good === false ? 'bad' : ''}`} title={TRAIT_INFO[t].desc}>{TRAIT_INFO[t].icon} {TRAIT_INFO[t].label}</span>)}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="eyebrow">OVR</div>
            <Ovr v={p.ovr} size="lg" />
            <div className="tiny muted" style={{ marginTop: 6 }}>POT <b style={{ color: ratingColor(p.pot) }}>{p.pot}</b></div>
          </div>
        </div>
      </div>
      <div style={{ padding: '0 30px 26px' }}>
        <div className="row" style={{ margin: '4px 0 16px' }}>
          <Tabs id="pm" value={tab} onChange={setTab} tabs={[{ id: 'ratings', label: 'Ratings' }, { id: 'stats', label: 'Stats' }, { id: 'bio', label: 'NIL & Bio' }]} />
          <div className="spacer" />
          <div className="row small">
            <div className="stat-tile" style={{ padding: '8px 12px' }}><div className="l">PPG</div><div className="v" style={{ fontSize: 22 }}>{pg.ppg.toFixed(1)}</div></div>
            <div className="stat-tile" style={{ padding: '8px 12px' }}><div className="l">RPG</div><div className="v" style={{ fontSize: 22 }}>{pg.rpg.toFixed(1)}</div></div>
            <div className="stat-tile" style={{ padding: '8px 12px' }}><div className="l">APG</div><div className="v" style={{ fontSize: 22 }}>{pg.apg.toFixed(1)}</div></div>
          </div>
        </div>
        {tab === 'ratings' && (
          <div className="grid g2">
            {GROUPS.map((gr) => (
              <div key={gr.label} className="card" style={{ padding: 14 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>{gr.label}</div>
                <div className="col" style={{ gap: 7 }}>{gr.keys.map((k) => <RatingRow key={k} label={RATING_LABELS[k]} v={p.ratings[k]} />)}</div>
              </div>
            ))}
          </div>
        )}
        {tab === 'stats' && (
          <div className="card flush">
            <table className="table">
              <thead><tr><th>Season</th><th>Team</th><th>Yr</th><th className="r">GP</th><th className="r">MIN</th><th className="r">PTS</th><th className="r">REB</th><th className="r">AST</th><th className="r">STL</th><th className="r">BLK</th><th className="r">FG%</th><th className="r">3P%</th><th className="r">FT%</th></tr></thead>
              <tbody>
                {[...p.career.map((c) => ({ ...c, cur: false })), ...(p.stats.gp ? [{ ...p.stats, season: g.season, teamId: p.teamId ?? '', cls: p.cls, ovr: p.ovr, cur: true }] : [])].map((c, i) => {
                  const gp = Math.max(1, c.gp);
                  return (
                    <tr key={i} className={c.cur ? 'me' : ''}>
                      <td>{seasonLabel(c.season)}</td><td><TeamName team={g.teams[c.teamId]} logo={16} short /></td><td>{c.cls}</td>
                      <td className="r">{c.gp}</td><td className="r">{(c.min / gp).toFixed(1)}</td><td className="r b">{(c.pts / gp).toFixed(1)}</td><td className="r">{((c.orb + c.drb) / gp).toFixed(1)}</td><td className="r">{(c.ast / gp).toFixed(1)}</td>
                      <td className="r">{(c.stl / gp).toFixed(1)}</td><td className="r">{(c.blk / gp).toFixed(1)}</td><td className="r">{c.fga ? ((c.fgm / c.fga) * 100).toFixed(1) : '—'}</td><td className="r">{c.tpa ? ((c.tpm / c.tpa) * 100).toFixed(1) : '—'}</td><td className="r">{c.fta ? ((c.ftm / c.fta) * 100).toFixed(1) : '—'}</td>
                    </tr>
                  );
                })}
                {!p.career.length && !p.stats.gp && <tr><td colSpan={13} className="muted">No college stats yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'bio' && (
          <div className="grid g2">
            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 8 }}>NIL</div>
              <div className="kv">
                <span>Current deal</span><span className="b">{p.nil ? `${fmtMoneyShort(p.nil.amount)}/yr · ${p.nil.years} yr` : 'None'}</span>
                <span>Market value</span><span>{fmtMoneyShort(value)}</span>
                <span>Social following</span><span>{p.followers.toLocaleString()}</span>
              </div>
              <div style={{ marginTop: 12 }}><div className="tiny muted" style={{ marginBottom: 4 }}>Morale</div><Bar v={p.morale} color={p.morale > 70 ? 'var(--good)' : p.morale > 45 ? 'var(--warn)' : 'var(--bad)'} /></div>
              {isMine && (
                <div className="row wrap" style={{ marginTop: 14 }}>
                  <button className="btn sm" onClick={() => useGame.getState().nav('nil')}>Renegotiate in NIL Office</button>
                  {!p.redshirted && !p.redshirting && p.stats.gp <= 4 && g.phase === 'regular' && (
                    <button className="btn sm" onClick={() => useGame.getState().mutate((gg) => { gg.players[p.id].redshirting = true; })}>Redshirt this season</button>
                  )}
                  {p.redshirting && p.stats.gp === 0 && <button className="btn sm" onClick={() => useGame.getState().mutate((gg) => { gg.players[p.id].redshirting = false; })}>Remove redshirt</button>}
                </div>
              )}
            </div>
            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 8 }}>Career Notes</div>
              <div className="col small" style={{ gap: 6 }}>
                <div>{'★'.repeat(p.stars)}<span className="dim">{'★'.repeat(5 - p.stars)}</span> recruit · Age {p.age}</div>
                {p.awards.map((a) => <div key={a} className="gold">🏅 {a}</div>)}
                {p.history.map((h, i) => <div key={i} className="muted">• {h}</div>)}
                {!p.history.length && !p.awards.length && <div className="muted">Nothing notable yet.</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ================= Recruit =================
function RecruitModal({ id }: { id: string }) {
  const g = useGameState();
  const r = g.recruits[id] as Recruit | undefined;
  const { mutate, toast } = useGame.getState();
  const user = g.teams[g.user.teamId];
  const mine = r ? schoolEntry(r, user.id) : undefined;
  const avail = nilAvailable(g, user.id);
  const [nil, setNil] = useState(mine?.nilOffer || Math.min(r?.nilAsk ?? 0, Math.max(0, avail)));
  const [promise, setPromise] = useState<Recruit['userPromise']>(r?.userPromise ?? null);
  if (!r) {
    const p = g.players[id];
    return p ? <PlayerModal id={id} /> : <div className="empty">This prospect has moved on.</div>;
  }
  const appeal = teamAppeal(g, r, user, nil, promise);
  const st = statusOf(g, r);
  const fuzzy = r.scouted < 100;
  const act = (a: RecruitActionKey) => {
    let res = { ok: false, msg: '' };
    mutate((gg) => { res = userRecruitAction(gg, r.id, a); });
    toast(res.msg, res.ok ? 'good' : 'bad');
    if (res.ok) sfx.click();
  };
  const onBoard = g.user.board.includes(r.id);
  const maxNil = Math.max(r.nilAsk * 2.2, 20000, nil);
  return (
    <div>
      <div className="hero" style={{ padding: '28px 30px 22px' }}>
        <TeamHeroBg team={r.committed ? g.teams[r.committed] : { colors: ['#2a3550', '#9fb0cc'] }} />
        <div className="row gap-l" style={{ alignItems: 'flex-end' }}>
          <PlayerFace p={r} size={160} team={r.committed ? g.teams[r.committed] : undefined} bg="card" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row"><Stars n={r.stars} /><span className="eyebrow" style={{ color: 'rgba(255,255,255,.8)' }}>No. {r.rank} overall · No. {r.posRank} {r.pos} · Class of {r.classYear}</span></div>
            <div className="h1" style={{ fontSize: 44, marginTop: 6 }}>{r.first} {r.last}</div>
            <div className="row wrap" style={{ marginTop: 8 }}>
              <span className="pill">{r.pos}</span><span className="pill">{fmtHeight(r.height)} · {r.weight} lbs</span><span className="pill">{r.archetype}</span>
              <span className="pill">🏠 {r.hometown}{r.type !== 'INTL' ? `, ${r.state}` : ''}</span><span className="pill blue">{r.type === 'HS' ? 'High School' : r.type === 'PREP' ? 'Prep School' : r.type === 'JUCO' ? 'JUCO' : 'International'}</span>
              <span className={`pill ${st.cls}`}>{st.label}</span>
            </div>
            {r.storyline && <div className="small" style={{ marginTop: 8, color: 'var(--gold)' }}>📰 {r.storyline}</div>}
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="eyebrow">{fuzzy ? 'Est. OVR' : 'OVR'}</div>
            <Ovr v={scoutedValue(r, r.ovr, 1)} size="lg" />
            <div className="tiny muted" style={{ marginTop: 6 }}>POT <b>{scoutedValue(r, r.pot, 2)}</b></div>
            <div className="tiny dim">Scouted {r.scouted}%</div>
          </div>
        </div>
      </div>
      <div style={{ padding: '6px 30px 26px' }} className="grid g2">
        <div className="col" style={{ gap: 14 }}>
          <div className="card">
            <div className="row" style={{ marginBottom: 10 }}><div className="eyebrow" style={{ flex: 1 }}>Scouting Report</div>{fuzzy && <button className="btn sm" disabled={g.user.hours < 3} onClick={() => act('scout')}>🔍 Scout (3h)</button>}</div>
            <div className="col" style={{ gap: 6 }}>
              {(['ins', 'mid', 'tp', 'pas', 'hdl', 'perD', 'intD', 'reb', 'ath', 'iq'] as RatingKey[]).map((k, i) => <RatingRow key={k} label={RATING_LABELS[k]} v={scoutedValue(r, r.ratings[k], i + 3)} />)}
            </div>
          </div>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 10 }}>What matters to him</div>
            {(Object.keys(r.priorities) as (keyof Recruit['priorities'])[]).sort((a, b) => r.priorities[b] - r.priorities[a]).map((k) => (
              <div key={k} className="row" style={{ gap: 10, marginBottom: 6 }}>
                <span className="small" style={{ width: 130 }}>{PRIORITY_LABELS[k]}</span>
                <div style={{ flex: 1 }}><Bar v={r.priorities[k]} max={0.3} color="var(--blue)" /></div>
                <span className="tiny muted" style={{ width: 70, textAlign: 'right' }}>You: {Math.round(appeal.parts[k])}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="col" style={{ gap: 14 }}>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 10 }}>Interest</div>
            {r.schools.length === 0 && <div className="small muted">No schools in the mix yet.</div>}
            {r.schools.map((s) => {
              const t = g.teams[s.teamId];
              const me = s.teamId === user.id;
              return (
                <div key={s.teamId} className="row" style={{ gap: 8, marginBottom: 6 }}>
                  <TeamLogo team={t} size={22} />
                  <span className={`small ellipsis ${me ? 'b' : ''}`} style={{ width: 120 }}>{t.school}</span>
                  <div className="bar" style={{ flex: 1 }}><motion.i initial={{ width: 0 }} animate={{ width: `${s.interest}%` }} style={{ background: me ? 'var(--accent)' : teamAccent(t.colors) }} /></div>
                  <span className="num" style={{ width: 26, textAlign: 'right' }}>{Math.round(s.interest)}</span>
                  <span className="tiny" style={{ width: 34 }}>{s.offered ? '✉️' : ''}{s.visited ? '✈️' : ''}</span>
                </div>
              );
            })}
          </div>
          {!r.committed || r.committed !== user.id ? (
            <div className="card glow">
              <div className="row" style={{ marginBottom: 10 }}>
                <div className="eyebrow" style={{ flex: 1 }}>Recruit Him</div>
                <button className="btn sm ghost" onClick={() => mutate((gg) => { gg.user.board = onBoard ? gg.user.board.filter((x) => x !== r.id) : [...gg.user.board, r.id]; })}>{onBoard ? '✓ On board' : '+ Add to board'}</button>
              </div>
              <div className="row wrap gap-s">
                {(['text', 'call', 'asst', 'hc', 'visit'] as RecruitActionKey[]).map((a) => {
                  const used = a === 'visit' ? !!mine?.visited : r.userWeek[a as 'text'];
                  return <button key={a} className="btn sm" disabled={!!r.committed && r.committed !== user.id && a === 'visit' || used || g.user.hours < RECRUIT_ACTIONS[a].hours} title={RECRUIT_ACTIONS[a].desc} onClick={() => act(a)}>{RECRUIT_ACTIONS[a].label} <span className="dim">{RECRUIT_ACTIONS[a].hours}h</span></button>;
                })}
              </div>
              <div className="divider" />
              <div className="row small" style={{ justifyContent: 'space-between' }}><span className="muted">NIL offer (asks ~{fmtMoneyShort(r.nilAsk)})</span><span className="num" style={{ fontSize: 20 }}>{fmtMoneyShort(nil)}</span></div>
              <input type="range" min={0} max={maxNil} step={maxNil > 1e6 ? 25000 : 1000} value={nil} onChange={(e) => setNil(+e.target.value)} />
              <div className="tiny muted">Available in your pool: {fmtMoneyShort(avail)}</div>
              <div className="row" style={{ marginTop: 10, gap: 8 }}>
                <span className="small muted">Role promise</span>
                <div className="seg">
                  {([null, 'rotation', 'starter', 'star'] as Recruit['userPromise'][]).map((pr) => <button key={String(pr)} className={promise === pr ? 'on' : ''} onClick={() => setPromise(pr)}>{pr ?? 'None'}</button>)}
                </div>
              </div>
              <div className="tiny muted" style={{ marginTop: 6 }}>Your pitch strength: <b style={{ color: 'var(--text)' }}>{Math.round(appeal.total)}</b>/100. Broken promises crush morale.</div>
              <div className="row" style={{ marginTop: 12 }}>
                {mine?.offered && <button className="btn danger sm" onClick={() => { mutate((gg) => pullOffer(gg, r.id)); toast('Offer pulled.'); }}>Pull offer</button>}
                <div className="spacer" />
                <button className="btn primary" onClick={() => {
                  if (nil > avail + (mine?.nilOffer ?? 0) && nil > 0) { toast('That would exceed your available NIL pool.', 'bad'); return; }
                  let res = { ok: false, msg: '' };
                  mutate((gg) => { res = userOffer(gg, r.id, nil, promise); });
                  toast(res.msg, 'good');
                  sfx.swish();
                }}>{mine?.offered ? 'Update Offer' : '✉️ Extend Scholarship Offer'}</button>
              </div>
            </div>
          ) : (
            <div className="card glow" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40 }}>✍️</div>
              <div className="h3">Committed to {user.school}</div>
              <div className="small muted">He signs in the spring and joins your roster next season.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ================= Team =================
function TeamModal({ id }: { id: string }) {
  const g = useGameState();
  const t = g.teams[id];
  const [tab, setTab] = useState<'roster' | 'schedule' | 'history'>('roster');
  const open = useGame((s) => s.open);
  if (!t) return null;
  const coach = g.coaches[t.coachId];
  const conf = g.conferences.find((c) => c.id === t.conf);
  const players = teamPlayers(g, t.id).sort((a, b) => b.ovr - a.ovr);
  const games = g.schedule.filter((x) => x.home === t.id || x.away === t.id).sort((a, b) => a.day - b.day);
  const off = OFF_STYLES.find((o) => o.id === t.strategy.offense), def = DEF_STYLES.find((o) => o.id === t.strategy.defense);
  return (
    <div>
      <div className="hero" style={{ padding: '30px 30px 24px' }}>
        <TeamHeroBg team={t} intensity={1.2} />
        <div className="row gap-l">
          <motion.div initial={{ scale: 0.7, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 15 }}><TeamLogo team={t} size={120} /></motion.div>
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ color: 'rgba(255,255,255,.8)' }}>{conf?.name} · {t.city}, {t.state}</div>
            <div className="h1" style={{ fontSize: 48, marginTop: 6 }}>{t.apRank ? <span className="rank">#{t.apRank} </span> : null}{t.school}</div>
            <div style={{ fontSize: 20, color: teamAccent(t.colors), fontWeight: 700 }}>{t.mascot}</div>
            <div className="row wrap" style={{ marginTop: 10 }}>
              <span className="pill">{t.record.w}-{t.record.l} ({t.record.cw}-{t.record.cl})</span><span className="pill">NET {t.net || '—'}</span><span className="pill">Rating {t.rating.toFixed(1)}</span>
              <span className="pill">🏟️ {t.arena}</span><span className="pill">{off?.icon} {off?.label}</span><span className="pill">{def?.icon} {def?.label}</span>
            </div>
          </div>
          {coach && (
            <div style={{ textAlign: 'center' }}>
              <CoachFace c={coach} size={96} team={t} />
              <div className="small b">{coach.isUser ? 'You' : `${coach.first} ${coach.last}`}</div>
              <div className="tiny muted">{coach.careerW}-{coach.careerL} career</div>
            </div>
          )}
        </div>
      </div>
      <div style={{ padding: '0 30px 26px' }}>
        <div style={{ margin: '4px 0 14px' }}><Tabs id="tm" value={tab} onChange={setTab} tabs={[{ id: 'roster', label: 'Roster' }, { id: 'schedule', label: 'Schedule' }, { id: 'history', label: 'History' }]} /></div>
        {tab === 'roster' && (
          <table className="table">
            <thead><tr><th></th><th>Player</th><th>Pos</th><th>Yr</th><th>Ht</th><th className="c">OVR</th><th className="r">PTS</th><th className="r">REB</th><th className="r">AST</th></tr></thead>
            <tbody>
              {players.map((p) => {
                const pg = playerPerGame(p);
                return (
                  <tr key={p.id} className="click" onClick={() => open({ kind: 'player', id: p.id })}>
                    <td style={{ padding: '3px 8px' }}><PlayerFace p={p} size={30} team={t} bg="none" /></td>
                    <td className="b">{p.first} {p.last}{p.injury ? ' 🩹' : ''}</td><td>{p.pos}</td><td>{p.cls}</td><td className="muted">{fmtHeight(p.height)}</td>
                    <td className="c"><Ovr v={p.ovr} size="sm" /></td><td className="r">{p.stats.gp ? pg.ppg.toFixed(1) : '—'}</td><td className="r">{p.stats.gp ? pg.rpg.toFixed(1) : '—'}</td><td className="r">{p.stats.gp ? pg.apg.toFixed(1) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {tab === 'schedule' && (
          <table className="table">
            <tbody>
              {games.map((x) => {
                const home = x.home === t.id;
                const opp = g.teams[home ? x.away : x.home];
                const us = home ? x.hs : x.as, them = home ? x.as : x.hs;
                return (
                  <tr key={x.id} className={g.boxScores[x.id] ? 'click' : ''} onClick={() => g.boxScores[x.id] && open({ kind: 'box', gameId: x.id })}>
                    <td className="small muted">{g.calendar[x.day]?.label.split(' · ')[0]}</td>
                    <td>{x.neutral ? 'vs' : home ? 'vs' : '@'}</td>
                    <td><TeamName team={opp} logo={18} /></td>
                    <td className="r">{x.played ? <span className={(us ?? 0) > (them ?? 0) ? 'good b' : 'bad b'}>{(us ?? 0) > (them ?? 0) ? 'W' : 'L'} {us}-{them}</span> : <span className="dim">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {tab === 'history' && (
          <table className="table">
            <thead><tr><th>Season</th><th className="r">Record</th><th className="r">Conf</th><th>Postseason</th><th className="r">AP</th></tr></thead>
            <tbody>
              {[...t.history].reverse().map((h) => (
                <tr key={h.season}><td>{seasonLabel(h.season)}</td><td className="r">{h.w}-{h.l}</td><td className="r">{h.cw}-{h.cl}</td><td>{h.postseason || '—'}{h.ncaaSeed ? ` (${h.ncaaSeed})` : ''}</td><td className="r">{h.apFinal ?? '—'}</td></tr>
              ))}
              {!t.history.length && <tr><td colSpan={5} className="muted">History begins this season. Prestige: {Math.round(t.prestige)}.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ================= Box score =================
export function BoxModal({ gameId }: { gameId: string }) {
  const g = useGameState();
  const box = g.boxScores[gameId];
  const game = g.schedule.find((x) => x.id === gameId);
  const [side, setSide] = useState<0 | 1>(game && game.away === g.user.teamId ? 1 : 0);
  if (!box || !game) return <div className="empty">Box score unavailable.</div>;
  const home = g.teams[box.home], away = g.teams[box.away];
  const hw = box.hs > box.as;
  return (
    <div>
      <div className="hero" style={{ padding: '26px 30px' }}>
        <div className="hero-bg" style={{ background: `linear-gradient(100deg, ${away.colors[0]}bb, #0b1220 45%, #0b1220 55%, ${home.colors[0]}bb)` }} />
        <div className="eyebrow" style={{ textAlign: 'center' }}>{game.event ?? (game.type === 'conf' ? 'Conference' : 'Non-conference')} · {g.calendar[game.day]?.label.split(' · ')[0]} · Final{box.ot ? ` (${box.ot > 1 ? box.ot : ''}OT)` : ''}</div>
        <div className="row" style={{ justifyContent: 'center', gap: 30, marginTop: 10 }}>
          <div className="row"><TeamLogo team={away} size={64} /><div><div className="h2"><TeamName team={away} /></div><div className="tiny muted">{away.record.w}-{away.record.l}</div></div></div>
          <div className="num" style={{ fontSize: 54, letterSpacing: '.02em' }}><span style={{ opacity: hw ? 0.55 : 1 }}>{box.as}</span><span className="dim" style={{ margin: '0 12px' }}>–</span><span style={{ opacity: hw ? 1 : 0.55 }}>{box.hs}</span></div>
          <div className="row"><div style={{ textAlign: 'right' }}><div className="h2"><TeamName team={home} /></div><div className="tiny muted">{home.record.w}-{home.record.l}</div></div><TeamLogo team={home} size={64} /></div>
        </div>
        <div className="tiny muted" style={{ textAlign: 'center', marginTop: 8 }}>Half: {away.abbr} {box.half[1]} – {home.abbr} {box.half[0]} · {box.poss} possessions</div>
      </div>
      <div style={{ padding: '6px 30px 26px' }}>
        {box.flow.length > 3 && <FlowChart box={box} g={g} />}
        <div className="row" style={{ margin: '14px 0' }}>
          <Tabs id="box" value={String(side) as '0' | '1'} onChange={(v) => setSide(+v as 0 | 1)} tabs={[{ id: '1', label: away.school }, { id: '0', label: home.school }]} />
          <div className="spacer" />
          {box.shots && box.shots.length > 0 && <ShotChart box={box} side={side} color={teamAccent((side === 0 ? home : away).colors)} />}
        </div>
        <BoxTable players={box.players[side]} />
      </div>
    </div>
  );
}

export function BoxTable({ players }: { players: BoxPlayer[] }) {
  const open = useGame((s) => s.open);
  const tot = players.reduce((a, p) => ({ pts: a.pts + p.pts, fgm: a.fgm + p.fgm, fga: a.fga + p.fga, tpm: a.tpm + p.tpm, tpa: a.tpa + p.tpa, ftm: a.ftm + p.ftm, fta: a.fta + p.fta, reb: a.reb + p.orb + p.drb, ast: a.ast + p.ast, stl: a.stl + p.stl, blk: a.blk + p.blk, tov: a.tov + p.tov, pf: a.pf + p.pf }), { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0 });
  return (
    <table className="table">
      <thead><tr><th>Player</th><th className="r">MIN</th><th className="r">PTS</th><th className="r">FG</th><th className="r">3PT</th><th className="r">FT</th><th className="r">REB</th><th className="r">AST</th><th className="r">STL</th><th className="r">BLK</th><th className="r">TO</th><th className="r">PF</th><th className="r">+/-</th></tr></thead>
      <tbody>
        {[...players].sort((a, b) => Number(b.starter) - Number(a.starter) || b.min - a.min).map((p) => (
          <tr key={p.id} className="click" onClick={() => open({ kind: 'player', id: p.id })}>
            <td><span className="b">{p.name}</span> <span className="tiny muted">{p.pos}{p.starter ? ' · S' : ''}</span></td>
            <td className="r">{p.min}</td><td className="r b">{p.pts}</td><td className="r">{p.fgm}-{p.fga}</td><td className="r">{p.tpm}-{p.tpa}</td><td className="r">{p.ftm}-{p.fta}</td>
            <td className="r">{p.orb + p.drb}</td><td className="r">{p.ast}</td><td className="r">{p.stl}</td><td className="r">{p.blk}</td><td className="r">{p.tov}</td><td className="r">{p.pf}</td>
            <td className={`r ${p.pm > 0 ? 'good' : p.pm < 0 ? 'bad' : ''}`}>{p.pm > 0 ? '+' : ''}{p.pm}</td>
          </tr>
        ))}
        <tr style={{ fontWeight: 800 }}><td>TEAM</td><td /><td className="r">{tot.pts}</td><td className="r">{tot.fgm}-{tot.fga}</td><td className="r">{tot.tpm}-{tot.tpa}</td><td className="r">{tot.ftm}-{tot.fta}</td><td className="r">{tot.reb}</td><td className="r">{tot.ast}</td><td className="r">{tot.stl}</td><td className="r">{tot.blk}</td><td className="r">{tot.tov}</td><td className="r">{tot.pf}</td><td /></tr>
        <tr className="tiny muted"><td colSpan={13}>FG {tot.fga ? ((tot.fgm / tot.fga) * 100).toFixed(1) : 0}% · 3PT {tot.tpa ? ((tot.tpm / tot.tpa) * 100).toFixed(1) : 0}% · FT {tot.fta ? ((tot.ftm / tot.fta) * 100).toFixed(1) : 0}%</td></tr>
      </tbody>
    </table>
  );
}

function FlowChart({ box, g }: { box: BoxScore; g: GameState }) {
  const W = 900, H = 120;
  const maxT = Math.max(2400, box.flow[box.flow.length - 1][0]);
  const margins = box.flow.map(([t, h, a]) => [t, h - a] as const);
  const maxM = Math.max(10, ...margins.map(([, m]) => Math.abs(m)));
  const pts = margins.map(([t, m]) => `${(t / maxT) * W},${H / 2 - (m / maxM) * (H / 2 - 8)}`).join(' ');
  const home = g.teams[box.home], away = g.teams[box.away];
  return (
    <div className="card" style={{ padding: 12, marginTop: 14 }}>
      <div className="row tiny muted" style={{ justifyContent: 'space-between' }}><span>▲ {home.abbr} leads</span><span className="upper b">Game flow</span><span>▼ {away.abbr} leads</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="rgba(255,255,255,.15)" />
        <line x1={W / 2} x2={W / 2} y1="0" y2={H} stroke="rgba(255,255,255,.08)" strokeDasharray="4 4" />
        <motion.polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2 }} />
      </svg>
    </div>
  );
}

export function ShotChart({ box, side, color, size = 220 }: { box: BoxScore; side: 0 | 1; color: string; size?: number }) {
  const shots = (box.shots ?? []).filter((s) => s.team === side);
  const sc = size / 50;
  return (
    <svg width={size} height={size * 0.8} viewBox={`0 0 ${size} ${size * 0.8}`} style={{ background: 'rgba(255,255,255,.03)', borderRadius: 10 }}>
      <g stroke="rgba(255,255,255,.25)" fill="none" strokeWidth="1.2">
        <rect x={(25 - 6) * sc} y={0} width={12 * sc} height={19 * sc} />
        <circle cx={25 * sc} cy={5.25 * sc} r={0.75 * sc} />
        <path d={`M ${3 * sc} 0 L ${3 * sc} ${9 * sc} A ${22.15 * sc} ${22.15 * sc} 0 0 0 ${47 * sc} ${9 * sc} L ${47 * sc} 0`} />
      </g>
      {shots.map((s, i) => s.made
        ? <circle key={i} cx={(25 + s.x) * sc} cy={s.y * sc} r={3.2} fill={color} opacity={0.9} />
        : <g key={i} stroke="rgba(255,255,255,.45)" strokeWidth="1.3"><line x1={(25 + s.x) * sc - 2.5} y1={s.y * sc - 2.5} x2={(25 + s.x) * sc + 2.5} y2={s.y * sc + 2.5} /><line x1={(25 + s.x) * sc + 2.5} y1={s.y * sc - 2.5} x2={(25 + s.x) * sc - 2.5} y2={s.y * sc + 2.5} /></g>)}
    </svg>
  );
}

// ================= Pregame =================
function PregameModal({ gameId }: { gameId: string }) {
  const g = useGameState();
  const game = g.schedule.find((x) => x.id === gameId);
  const { startLive, quickSimUserGame, mutate } = useGame.getState();
  const userId = g.user.teamId;
  const keys = useMemo(() => (game ? keysToGame(g, game.home === userId ? game.away : game.home) : []), [g, game, userId]);
  if (!game) return null;
  const user = g.teams[userId];
  const isHome = game.home === userId;
  const opp = g.teams[isHome ? game.away : game.home];
  const sp = spread(g, game.home, game.away, game.neutral);
  const userLine = isHome ? sp : -sp;
  const wp = normCdf(userLine / 11);
  const rv = isRivalry(game.home, game.away);
  const s = user.strategy;
  const topOpp = teamPlayers(g, opp.id).sort((a, b) => b.ovr - a.ovr).slice(0, 3);
  return (
    <div>
      <div className="hero" style={{ padding: '34px 30px 28px', minHeight: 300 }}>
        <div className="hero-bg" style={{ background: `linear-gradient(105deg, ${user.colors[0]} 0%, ${user.colors[0]}99 30%, #070b14 49.6%, #070b14 50.4%, ${opp.colors[0]}99 70%, ${opp.colors[0]} 100%)` }}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: [0, 0.4, 0.15] }} transition={{ duration: 1.4 }} style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 50%, #fff, transparent 40%)' }} />
        </div>
        <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
          <span className="pill gold">GAME DAY</span>{rv && <span className="pill bad">🔥 {rv.name ?? 'Rivalry Game'}</span>}{game.event && <span className="pill accent">{game.event}</span>}{game.tv && <span className="pill">📺 {game.tv}</span>}
        </div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 26, alignItems: 'center' }}>
          <motion.div initial={{ x: -200, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }} style={{ textAlign: 'center', flex: 1 }}>
            <TeamLogo team={user} size={130} />
            <div className="h2" style={{ marginTop: 8 }}>{user.apRank ? <span className="rank">#{user.apRank}</span> : null}{user.school}</div>
            <div className="small muted">{user.record.w}-{user.record.l}</div>
          </motion.div>
          <motion.div initial={{ scale: 3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.35, type: 'spring', stiffness: 300, damping: 12 }} className="num text-glow" style={{ fontSize: 80, fontStyle: 'italic' }}>VS</motion.div>
          <motion.div initial={{ x: 200, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }} style={{ textAlign: 'center', flex: 1 }}>
            <TeamLogo team={opp} size={130} />
            <div className="h2" style={{ marginTop: 8 }}>{opp.apRank ? <span className="rank">#{opp.apRank}</span> : null}{opp.school}</div>
            <div className="small muted">{opp.record.w}-{opp.record.l}</div>
          </motion.div>
        </div>
        <div className="tiny muted" style={{ textAlign: 'center', marginTop: 12 }}>{game.neutral ? 'Neutral site' : g.teams[game.home].arena} · Line: {userLine === 0 ? 'Pick’em' : `${user.abbr} ${userLine > 0 ? '-' : '+'}${Math.abs(userLine)}`} · Win prob {Math.round(wp * 100)}%</div>
      </div>
      <div style={{ padding: '6px 30px 28px' }} className="grid g2">
        <Section title="Scouting Report" right={(() => {
          const a = g.staff?.members.find((m) => m.role === 'assoc');
          return a ? <span className="row tiny muted" style={{ gap: 6 }}><StaffFace m={a} size={26} team={user} bg="none" />Prepared by {a.first} {a.last}</span> : <span className="tiny muted">Prepared by your video coordinator</span>;
        })()}>
          <div className="col" style={{ gap: 8 }}>
            {keys.map((k, i) => <motion.div key={i} className="small" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.1 }}>🔑 {k}</motion.div>)}
          </div>
          <div className="divider" />
          <div className="eyebrow" style={{ marginBottom: 8 }}>Players to watch</div>
          {topOpp.map((p) => <div key={p.id} className="row" style={{ padding: '3px 0' }}><PlayerFace p={p} size={30} team={opp} bg="none" /><span className="small b" style={{ flex: 1 }}>{p.first} {p.last}</span><span className="tiny muted">{p.pos} · {playerPerGame(p).ppg.toFixed(1)} ppg</span><Ovr v={p.ovr} size="sm" /></div>)}
        </Section>
        <Section title="Game Plan">
          <div className="eyebrow" style={{ marginBottom: 6 }}>Offense</div>
          <div className="row wrap gap-s">{OFF_STYLES.map((o) => <button key={o.id} className={`btn sm ${s.offense === o.id ? 'primary' : ''}`} onClick={() => mutate((gg) => { gg.teams[userId].strategy.offense = o.id; }, { save: false })}>{o.icon} {o.label}</button>)}</div>
          <div className="eyebrow" style={{ margin: '12px 0 6px' }}>Defense</div>
          <div className="row wrap gap-s">{DEF_STYLES.map((o) => <button key={o.id} className={`btn sm ${s.defense === o.id ? 'primary' : ''}`} onClick={() => mutate((gg) => { gg.teams[userId].strategy.defense = o.id; }, { save: false })}>{o.icon} {o.label}</button>)}</div>
          <div className="eyebrow" style={{ margin: '12px 0 6px' }}>Tempo</div>
          <div className="seg">{['Grind', 'Patient', 'Normal', 'Fast', 'Blitz'].map((l, i) => <button key={l} className={s.tempo === i + 1 ? 'on' : ''} onClick={() => mutate((gg) => { gg.teams[userId].strategy.tempo = i + 1; }, { save: false })}>{l}</button>)}</div>
          <div className="row" style={{ marginTop: 22 }}>
            <button className="btn" onClick={() => quickSimUserGame()}>⏩ Quick Sim</button>
            <div className="spacer" />
            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} className="btn gold xl" onClick={() => { sfx.buzzer(); startLive(); }}>🏀 Tip-Off</motion.button>
          </div>
        </Section>
      </div>
    </div>
  );
}

function keysToGame(g: GameState, oppId: string): string[] {
  const opp = g.teams[oppId];
  const ps = teamPlayers(g, oppId).filter((p) => !p.injury).sort((a, b) => b.ovr - a.ovr).slice(0, 8);
  const avg = (k: RatingKey) => ps.reduce((s, p) => s + p.ratings[k], 0) / Math.max(1, ps.length);
  const out: string[] = [];
  if (avg('tp') > 66) out.push(`${opp.school} can shoot it (${Math.round(avg('tp'))} avg 3PT rating). Run them off the line — a zone invites disaster.`);
  else out.push(`${opp.school} isn't a great shooting team. Pack the paint and make them win from deep.`);
  if (avg('reb') > 62) out.push(`They crash the glass hard. Box out or a zone will get punished on the boards.`);
  if (avg('hdl') < 58) out.push(`Their guards are loose with the ball — a full-court press could feast.`);
  if (avg('ath') > 68) out.push(`Elite athletes. Control tempo and limit transition chances.`);
  const off = OFF_STYLES.find((o) => o.id === opp.strategy.offense), def = DEF_STYLES.find((o) => o.id === opp.strategy.defense);
  out.push(`Expect ${off?.label.toLowerCase()} on offense and ${def?.label.toLowerCase()} on defense${opp.strategy.tempo >= 4 ? ', played at a fast pace' : opp.strategy.tempo <= 2 ? ', played at a crawl' : ''}.`);
  const hurt = teamPlayers(g, oppId).filter((p) => p.injury && p.ovr >= 65);
  if (hurt.length) out.push(`Injury report: ${hurt.map((p) => `${p.first} ${p.last} (out)`).join(', ')}.`);
  return out.slice(0, 5);
}

export type { Player };
