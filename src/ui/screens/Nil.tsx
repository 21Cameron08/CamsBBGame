import { useState } from 'react';
import { motion } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { PlayerFace, Ovr, Section, Bar, AnimatedNumber, fmtMoneyShort, TeamName } from '../components/common';
import { teamPlayers } from '../../engine/team';
import { committedNil, committedRecruitNil, playerValue, setUserNil, autoSignUnsigned } from '../../engine/nil';
import { roundMoney } from '../../engine/player';
import type { GameState, Player } from '../../engine/types';
import { sfx } from '../sound';

export function NilScreen() {
  const g = useGameState();
  const user = g.teams[g.user.teamId];
  const coach = g.coaches[g.user.coachId];
  const players = teamPlayers(g, user.id).sort((a, b) => (b.nil?.amount ?? 0) - (a.nil?.amount ?? 0));
  const roster = committedNil(g, user.id);
  const recruits = committedRecruitNil(g, user.id);
  const avail = user.nilBudget - roster;
  const revShare = Math.round(user.nilBudget * 0.45 / 25000) * 25000;
  const collective = user.nilBudget - revShare;
  const top = Object.values(g.players).filter((p) => p.teamId && p.nil).sort((a, b) => (b.nil!.amount) - (a.nil!.amount)).slice(0, 10);
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Revenue sharing + collective · {user.school}</div>
          <h1 className="h1" style={{ marginTop: 6 }}>NIL Office</h1>
        </div>
        <div className="spacer" />
        {players.some((p) => !p.nil) && (
          <button className="btn primary" onClick={() => {
            let n = 0;
            useGame.getState().mutate((gg) => { n = autoSignUnsigned(gg); });
            useGame.getState().toast(n ? `Signed ${n} player${n > 1 ? 's' : ''} at market value.` : 'No budget left to sign anyone.', n ? 'good' : 'bad');
            if (n) sfx.swish();
          }}>✍️ Auto-sign {players.filter((p) => !p.nil).length} unsigned</button>
        )}
      </div>
      <div className="grid g4 mb">
        <div className="card"><div className="eyebrow">Total Pool</div><div className="num" style={{ fontSize: 34 }}><AnimatedNumber value={user.nilBudget} format={fmtMoneyShort} /></div><div className="tiny muted">Rev-share ~{fmtMoneyShort(revShare)} · Collective ~{fmtMoneyShort(collective)}</div></div>
        <div className="card"><div className="eyebrow">Committed to Roster</div><div className="num" style={{ fontSize: 34 }}><AnimatedNumber value={roster} format={fmtMoneyShort} /></div><div className="tiny muted">{players.filter((p) => p.nil).length} active deals</div></div>
        <div className="card"><div className="eyebrow">Promised to Recruits</div><div className="num" style={{ fontSize: 34 }}><AnimatedNumber value={recruits} format={fmtMoneyShort} /></div><div className="tiny muted">Kicks in when they enroll</div></div>
        <div className="card glow"><div className="eyebrow">Available</div><div className="num" style={{ fontSize: 34, color: avail < 0 ? 'var(--bad)' : 'var(--good)' }}><AnimatedNumber value={avail} format={fmtMoneyShort} /></div><div className="tiny muted">NIL skill: {coach.skills.nil}/10</div></div>
      </div>
      <div className="card mb">
        <div className="row tiny muted" style={{ justifyContent: 'space-between', marginBottom: 6 }}><span>Pool usage</span><span>{Math.round((roster / Math.max(1, user.nilBudget)) * 100)}%</span></div>
        <div style={{ display: 'flex', height: 14, borderRadius: 8, overflow: 'hidden', background: 'rgba(255,255,255,.06)' }}>
          <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, (roster / user.nilBudget) * 100)}%` }} transition={{ duration: 1 }} style={{ background: 'var(--accent)' }} />
          <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, (recruits / user.nilBudget) * 100)}%` }} transition={{ duration: 1, delay: 0.2 }} style={{ background: 'var(--gold)', opacity: 0.8 }} />
        </div>
        <div className="row tiny" style={{ marginTop: 6, gap: 14 }}><span><span className="dot" style={{ background: 'var(--accent)' }} /> Roster</span><span><span className="dot" style={{ background: 'var(--gold)' }} /> Recruit promises</span></div>
      </div>
      <div className="grid g-main">
        <Section title="Player Deals">
          <table className="table">
            <thead><tr><th></th><th>Player</th><th className="c">OVR</th><th className="r">Market Value</th><th className="r">Current Deal</th><th>Satisfaction</th><th></th></tr></thead>
            <tbody>
              {players.map((p) => <DealRow key={p.id} g={g} p={p} />)}
            </tbody>
          </table>
        </Section>
        <div className="col" style={{ gap: 16 }}>
          <Section title="How NIL works here">
            <div className="small muted col" style={{ gap: 8 }}>
              <div>💵 Your pool combines school <b>revenue sharing</b> and booster <b>collective</b> money. Winning, fan hype and your NIL skill grow it each year.</div>
              <div>📉 Players compare their deal to their <b>market value</b>. Underpaid players lose morale and are portal risks in the spring.</div>
              <div>✍️ Recruit and portal offers count against the same pool once they sign.</div>
              <div>🎤 Press conferences and donor events can add money mid-season.</div>
            </div>
          </Section>
          <Section title="Highest-Paid in the Country">
            {top.map((p, i) => (
              <div key={p.id} className="row" style={{ padding: '5px 0' }}>
                <span className="num dim" style={{ width: 18 }}>{i + 1}</span>
                <PlayerFace p={p} size={28} team={g.teams[p.teamId!]} bg="none" />
                <div style={{ flex: 1, minWidth: 0 }}><div className="small b ellipsis">{p.first} {p.last}</div><div className="tiny"><TeamName team={g.teams[p.teamId!]} /></div></div>
                <span className="num">{fmtMoneyShort(p.nil!.amount)}</span>
              </div>
            ))}
          </Section>
        </div>
      </div>
    </div>
  );
}

function DealRow({ g, p }: { g: GameState; p: Player }) {
  const { mutate, toast, open } = useGame.getState();
  const user = g.teams[g.user.teamId];
  const value = playerValue(g, p);
  const cur = p.nil?.amount ?? 0;
  const [edit, setEdit] = useState(false);
  const [amt, setAmt] = useState(cur || value);
  const [yrs, setYrs] = useState(p.nil?.years ?? 1);
  const ratio = cur / Math.max(1000, value);
  const max = Math.max(value * 2, cur * 1.5, 50000);
  return (
    <>
      <tr>
        <td style={{ width: 40, padding: '4px 8px' }}><PlayerFace p={p} size={32} team={user} bg="none" /></td>
        <td><span className="link" onClick={() => open({ kind: 'player', id: p.id })}>{p.first} {p.last}</span><div className="tiny muted">{p.pos} · {p.cls}{p.traits.includes('mercenary') ? ' · 💰 Mercenary' : ''}{p.traits.includes('influencer') ? ' · 📱 Influencer' : ''}</div></td>
        <td className="c"><Ovr v={p.ovr} size="sm" /></td>
        <td className="r mono">{fmtMoneyShort(value)}</td>
        <td className="r mono b">{cur ? `${fmtMoneyShort(cur)} × ${p.nil!.years}y` : <span className="bad">Unsigned</span>}</td>
        <td style={{ width: 120 }}><Bar v={Math.min(1.5, ratio)} max={1.5} className="thin" color={ratio >= 1 ? 'var(--good)' : ratio >= 0.7 ? 'var(--warn)' : 'var(--bad)'} /><div className="tiny muted">{Math.round(ratio * 100)}% of value</div></td>
        <td><button className="btn sm" onClick={() => setEdit(!edit)}>{edit ? 'Close' : cur ? 'Renegotiate' : 'Sign'}</button></td>
      </tr>
      {edit && (
        <tr>
          <td colSpan={7} style={{ background: 'rgba(255,255,255,.03)' }}>
            <div className="row" style={{ gap: 16 }}>
              <span className="small muted">Annual</span>
              <input type="range" min={0} max={max} step={max > 1e6 ? 25000 : 1000} value={amt} onChange={(e) => setAmt(+e.target.value)} style={{ flex: 1 }} />
              <span className="num" style={{ width: 80, fontSize: 18 }}>{fmtMoneyShort(amt)}</span>
              <div className="seg">{[1, 2, 3].map((y) => <button key={y} className={yrs === y ? 'on' : ''} onClick={() => setYrs(y)}>{y} yr</button>)}</div>
              <button className="btn sm" onClick={() => setAmt(roundMoney(value))}>Match value</button>
              <button className="btn primary sm" onClick={() => {
                let r = { ok: false, msg: '' };
                mutate((gg) => { r = setUserNil(gg, p.id, amt, yrs); });
                toast(r.msg, r.ok ? 'good' : 'bad');
                if (r.ok) { sfx.swish(); setEdit(false); }
              }}>Sign deal</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
