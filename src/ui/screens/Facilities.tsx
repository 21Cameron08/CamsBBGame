// Facilities & Boosters: the Program Fund, seven facilities to build, the boosters who pay for them,
// and the ledger. Upgrades take a season or two and add a lasting edge.
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { PersonFace, Section, TeamHeroBg, TeamLogo, TeamName } from '../components/common';
import type { FacilityKey, GameState } from '../../engine/types';
import {
  FACILITIES, FACILITY_KEYS, MAX_LEVEL, MAX_PROJECTS, buildSeasons, boosterStyle, callBooster, canBuild, facilityGrade, fmtFund,
  moveToNil, programBuild, projectedDonations, startProject, underConstruction, facilityRaceOn, PROJECT_NOUN,
} from '../../engine/facilities';
import { seasonLabel } from '../../engine/calendar';
import { ordinal } from '../../engine/awards';
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

      <ArmsRace g={g} />
    </div>
  );
}

/** where you stand: your conference by facilities rating, and who has been building */
function ArmsRace({ g }: { g: GameState }) {
  const open = useGame((s) => s.open);
  const on = facilityRaceOn(g);
  const uid = g.user.teamId;
  const me = g.teams[uid];
  const conf = g.conferences.find((c) => c.id === me.conf);
  const base = g.facRace?.base ?? {};
  const table = Object.values(g.teams).filter((t) => t.conf === me.conf).sort((a, b) => b.facilities - a.facilities || b.prestige - a.prestige);
  const myRank = table.findIndex((t) => t.id === uid) + 1;
  const national = Object.values(g.teams).filter((t) => t.facilities > me.facilities).length + 1;
  const log = g.facRace?.log ?? [];
  const lastSeason = log[0]?.season;
  const recent = log.filter((e) => e.season === lastSeason);
  const lastBuild = (id: string) => log.find((e) => e.teamId === id);
  const watch = recent.filter((e) => g.teams[e.teamId]?.conf === me.conf || g.teams[e.teamId]?.prestige >= 55).slice(0, 10);
  return (
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <Section title={`Facilities Arms Race · ${conf?.short ?? 'Conference'}`} right={on ? <span className="tiny muted">You're {ordinal(myRank)} of {table.length} here, {ordinal(national)} nationally</span> : <span className="pill" title="Turn it on in Settings → Preferences">Off</span>}>
        {!on && <div className="tiny muted" style={{ marginBottom: 8 }}>The arms race is off, so only you build and other programs keep the facilities they started with. Turn it on in Settings → Preferences.</div>}
        <div className="col" style={{ gap: 2 }}>
          {table.map((t, i) => {
            const d = on && t.id in base ? Math.round((t.facilities - base[t.id]) * 10) / 10 : 0;
            const lb = on ? lastBuild(t.id) : undefined;
            const mine = t.id === uid;
            return (
              <div key={t.id} className={`row race-row ${mine ? 'mine' : ''}`}>
                <span className="tiny muted num" style={{ width: 18, textAlign: 'right' }}>{i + 1}</span>
                <TeamLogo team={t} size={22} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <TeamName team={t} showRank={false} className={mine ? 'b' : ''} />
                  {lb && <div className="tiny muted ellipsis">{FACILITIES[lb.key].icon} {PROJECT_NOUN[lb.key]}, {seasonLabel(lb.season)}</div>}
                </div>
                <span className="heat-bar" style={{ width: 90, height: 6 }}><i style={{ width: `${t.facilities * 10}%`, background: mine ? 'var(--accent)' : 'linear-gradient(90deg,#6b7a99,#9fb0cc)', boxShadow: 'none' }} /></span>
                <span className="num" style={{ width: 34, textAlign: 'right' }}>{t.facilities.toFixed(1)}</span>
                {on && <span className={`tiny num ${d > 0 ? 'good' : d < 0 ? 'bad' : 'muted'}`} style={{ width: 36, textAlign: 'right' }} title="Change since the arms race began">{d > 0 ? '+' : d < 0 ? '−' : '±'}{Math.abs(d).toFixed(1)}</span>}
              </div>
            );
          })}
        </div>
      </Section>
      <Section title="Who's Building" right={lastSeason != null ? <span className="tiny muted">{recent.length} projects in {seasonLabel(lastSeason)}</span> : undefined}>
        {!on ? <div className="tiny muted">Nobody else breaks ground while the arms race is off.</div>
          : !watch.length ? <div className="tiny muted">No AI projects yet. Programs decide what to build at the end of each season: the rich, the winners and anyone falling behind their prestige build most.</div>
          : (
            <div className="col" style={{ gap: 6 }}>
              <div className="tiny muted">Every program's facilities age a little each year. AI projects only move the facilities rating recruits and transfers see.</div>
              {watch.map((e, i) => {
                const t = g.teams[e.teamId];
                const close = t.conf === me.conf;
                return (
                  <div key={i} className="row booster-row" style={{ padding: '6px 10px', cursor: 'pointer', borderColor: close ? 'rgba(246,201,76,.35)' : undefined }} onClick={() => open({ kind: 'team', id: t.id })}>
                    <span style={{ fontSize: 20 }}>{FACILITIES[e.key].icon}</span>
                    <TeamLogo team={t} size={24} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="small b ellipsis">{t.school}{close && <span className="pill gold" style={{ fontSize: 9, marginLeft: 6 }} title="In your conference">{conf?.short ?? 'Your conference'}</span>}</div>
                      <div className="tiny muted ellipsis">New {PROJECT_NOUN[e.key]} · facilities now {e.rating.toFixed(1)}</div>
                    </div>
                    <span className="num small">{fmtFund(e.cost)}</span>
                  </div>
                );
              })}
            </div>
          )}
      </Section>
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
