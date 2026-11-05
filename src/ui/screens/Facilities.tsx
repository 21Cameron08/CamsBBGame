// Facilities & Boosters: the Program Fund, seven facilities to build, the boosters who pay for them,
// and the ledger. Upgrades take a season or two and add a lasting edge.
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { PersonFace, Section, TeamHeroBg } from '../components/common';
import type { FacilityKey, GameState } from '../../engine/types';
import {
  FACILITIES, FACILITY_KEYS, MAX_LEVEL, MAX_PROJECTS, buildSeasons, boosterStyle, callBooster, canBuild, facilityGrade, fmtFund,
  moveToNil, programBuild, projectedDonations, startProject, underConstruction,
} from '../../engine/facilities';
import { seasonLabel } from '../../engine/calendar';
import { sfx } from '../sound';

const moodLabel = (m: number) => (m >= 85 ? ['Thrilled', 'good'] : m >= 65 ? ['Happy', 'good'] : m >= 45 ? ['Content', ''] : m >= 25 ? ['Restless', 'gold'] : ['Furious', 'bad']) as [string, string];

export function FacilitiesScreen() {
  const g = useGameState();
  const { mutate, toast } = useGame.getState();
  const pb = programBuild(g);
  const team = g.teams[pb.teamId];
  const [nilAmt, setNilAmt] = useState(0);
  const projected = projectedDonations(g, pb);
  const build = (k: FacilityKey) => {
    let res = { ok: false, msg: '' };
    mutate((gg) => { res = startProject(gg, k); });
    toast(res.msg, res.ok ? 'good' : 'bad');
    if (res.ok) sfx.fanfare();
  };
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="hero" style={{ padding: '24px 26px 20px' }}>
          <TeamHeroBg team={team} />
          <div className="row" style={{ alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
            <div>
              <div className="eyebrow" style={{ color: 'rgba(255,255,255,.8)' }}>Program Building · {team.school}</div>
              <div className="h1" style={{ fontSize: 42 }}>🏗️ Facilities &amp; Boosters</div>
              <div className="small" style={{ opacity: 0.85, maxWidth: 620 }}>Donations and booster gifts fill the Program Fund at the end of every season, plus NCAA Tournament payouts. Spend it on facilities that give you a lasting edge. Only the upgrades you build count; what you inherited is already part of the program's prestige.</div>
            </div>
            <div className="spacer" />
            <div className="grid g3" style={{ gap: 10, minWidth: 420 }}>
              {[
                ['Program Fund', fmtFund(pb.fund), `~${fmtFund(projected)} next year`],
                ['Facilities grade', facilityGrade(pb), `Recruiting rating ${team.facilities.toFixed(1)}/10`],
                ['Projects', `${pb.projects.length}/${MAX_PROJECTS}`, pb.projects.length ? 'Under construction' : 'Nothing building'],
              ].map(([l, v, sub]) => (
                <div key={l} className="stat-tile" style={{ padding: '10px 12px', background: 'rgba(0,0,0,.3)' }}>
                  <div className="l">{l}</div><div className="v" style={{ fontSize: 24 }}>{v}</div><div className="tiny muted" style={{ marginTop: 3 }}>{sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="fac-grid">
        {FACILITY_KEYS.map((k, i) => <FacilityCard key={k} g={g} k={k} i={i} onBuild={() => build(k)} />)}
      </div>

      <div className="grid g-main" style={{ alignItems: 'start' }}>
        <Section title="Boosters" right={<span className="tiny muted">Happy boosters give more. Keep your promises.</span>}>
          <div className="col" style={{ gap: 8 }}>
            {pb.boosters.map((b) => {
              const [ml, mc] = moodLabel(b.mood);
              const st = boosterStyle(b.style);
              const called = b.called === g.season;
              return (
                <div key={b.id} className="row booster-row">
                  <PersonFace seed={b.id} size={46} role="coach" colors={team.colors} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="row" style={{ gap: 8 }}><span className="b">{b.name}</span><span className="pill" title={st.desc} style={{ fontSize: 10 }}>{st.label}</span>{b.promise && <span className="pill gold" style={{ fontSize: 10 }} title="You took the money: break ground before the season ends">Promise: {FACILITIES[b.promise.key].name}</span>}</div>
                    <div className="tiny muted">{b.business} · wants the {FACILITIES[b.pet].icon} {FACILITIES[b.pet].name} · has given {fmtFund(b.given)}</div>
                    <div className="row" style={{ gap: 8, marginTop: 5 }}>
                      <span className="heat-bar" style={{ width: 160, height: 6 }}><i style={{ width: `${b.mood}%`, background: b.mood >= 65 ? 'linear-gradient(90deg,#1fa36f,#22d38f)' : b.mood >= 45 ? 'linear-gradient(90deg,#6b7a99,#9fb0cc)' : 'linear-gradient(90deg,#ff5d5d,#ff9b52)' }} /></span>
                      <span className={`tiny b ${mc}`}>{ml}</span>
                      <span className="tiny muted">~{fmtFund(b.capacity * b.mood / 100)}/yr</span>
                    </div>
                  </div>
                  <button className="btn sm" disabled={called} title={called ? 'Already called this season' : 'Once a season: lifts their mood, sometimes a gift'} onClick={() => { let res = { ok: false, msg: '' }; mutate((gg) => { res = callBooster(gg, b.id); }); toast(res.msg, res.ok ? 'good' : 'bad'); }}>{called ? '✓ Called' : '📞 Thank-you call'}</button>
                </div>
              );
            })}
          </div>
        </Section>
        <div className="col" style={{ gap: 16 }}>
          <Section title="Send to the NIL Collective">
            <div className="small muted" style={{ marginBottom: 8 }}>Need players now more than buildings? Move money to this season's NIL pool. 20% is lost to fees, and old-guard and academic boosters won't love it.</div>
            <div className="row small" style={{ justifyContent: 'space-between' }}><span className="muted">Amount</span><span className="num" style={{ fontSize: 20 }}>{fmtFund(nilAmt)}</span></div>
            <input type="range" min={0} max={Math.max(0, pb.fund)} step={50_000} value={Math.min(nilAmt, pb.fund)} onChange={(e) => setNilAmt(+e.target.value)} />
            <div className="row" style={{ marginTop: 8 }}>
              <span className="tiny muted">Adds {fmtFund(Math.round(nilAmt * 0.8))} to NIL</span>
              <div className="spacer" />
              <button className="btn sm" disabled={nilAmt <= 0} onClick={() => { let res = { ok: false, msg: '' }; mutate((gg) => { res = moveToNil(gg, nilAmt); }); toast(res.msg, res.ok ? 'good' : 'bad'); setNilAmt(0); }}>Transfer</button>
            </div>
          </Section>
          <Section title="Ledger">
            {pb.ledger.slice(0, 14).map((l, i) => (
              <div key={i} className="row small" style={{ padding: '5px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="tiny muted" style={{ width: 62 }}>{seasonLabel(l.season)}</span>
                <span style={{ flex: 1 }} className="ellipsis">{l.label}</span>
                <span className="num" style={{ color: l.amount >= 0 ? 'var(--good)' : 'var(--bad)' }}>{l.amount >= 0 ? '+' : '−'}{fmtFund(Math.abs(l.amount))}</span>
              </div>
            ))}
          </Section>
        </div>
      </div>
    </div>
  );
}

function FacilityCard({ g, k, i, onBuild }: { g: GameState; k: FacilityKey; i: number; onBuild: () => void }) {
  const pb = programBuild(g);
  const f = FACILITIES[k];
  const lvl = pb.levels[k], start = pb.start[k];
  const proj = underConstruction(pb, k);
  const chk = canBuild(g, k);
  const ups = Math.max(0, lvl - start);
  return (
    <motion.div className={`card fac-card ${proj ? 'building' : ''}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
      <div className="row" style={{ gap: 10 }}>
        <span className="fac-icon">{f.icon}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="b ellipsis">{pb.names[k] ?? f.name}</div>
          <div className="fac-pips">
            {Array.from({ length: MAX_LEVEL }, (_, n) => (
              <span key={n} className={`fac-pip ${n < start ? 'inherited' : n < lvl ? 'built' : proj && n === lvl ? 'pending' : ''}`} />
            ))}
            <span className="tiny muted" style={{ marginLeft: 6 }}>Level {lvl}</span>
          </div>
        </div>
      </div>
      <div className="tiny muted" style={{ marginTop: 8, minHeight: 30 }}>{f.desc}</div>
      <div className="tiny" style={{ marginTop: 6 }}><span className={ups ? 'good b' : 'muted'}>{ups ? `Your upgrades: +${ups}` : 'No upgrades yet'}</span><span className="muted"> · {f.per}</span></div>
      <div className="fac-foot">
        {proj ? <span className="small">🚧 Level {proj.level} opens in <b>{seasonLabel(proj.opens)}</b></span>
          : lvl >= MAX_LEVEL ? <span className="small good b">★ Maxed out</span>
          : <>
            <span className="small">Level {chk.level} · <b>{fmtFund(chk.cost)}</b> · opens {seasonLabel(g.season + buildSeasons(chk.level))}</span>
            <div className="spacer" />
            <button className="btn sm primary" disabled={!chk.ok} title={chk.why} onClick={onBuild}>{chk.ok ? 'Build' : chk.why}</button>
          </>}
      </div>
    </motion.div>
  );
}
