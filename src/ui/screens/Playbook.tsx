import { useState } from 'react';
import { motion } from 'framer-motion';
import { useGame } from '../../store/gameStore';
import { Section, TeamLogo, PlayerFace } from '../components/common';
import { teamPlayers } from '../../engine/team';
import { nextUserGame } from '../../engine/season';
import {
  OFF_SCHEMES, DEF_SCHEMES, OFF, DEF, TENDENCIES, counterEdge, edgeLabel, famOf, famPenalty, midSeason, setUserScheme, type FitResult, type TendencyKey,
} from '../../engine/schemes';
import type { DefStyle, GameState, OffStyle, Player } from '../../engine/types';
import { sfx } from '../sound';

const fitTone = (f: number) => (f >= 70 ? 'good' : f >= 45 ? 'gold' : 'bad');

type Side = 'off' | 'def';
interface Scheme { id: string; label: string; icon: string; desc: string; strengths: string[]; weaknesses: string[]; needs: string; fit: (ps: Player[]) => FitResult }

/** Pick and inspect offensive or defensive schemes */
export function SchemePicker({ g, side }: { g: GameState; side: Side }) {
  const { mutate, toast } = useGame.getState();
  const team = g.teams[g.user.teamId];
  const players = teamPlayers(g, team.id);
  const list: Scheme[] = side === 'off' ? OFF_SCHEMES : DEF_SCHEMES;
  const current = side === 'off' ? team.strategy.offense : team.strategy.defense;
  const [view, setView] = useState<string>(current);
  const sel = list.find((x) => x.id === view) ?? list[0];
  const fits = new Map(list.map((x) => [x.id, x.fit(players)]));
  const selFit = fits.get(sel.id)!;
  const fam = famOf(g, side, sel.id);
  const pen = famPenalty(fam);
  const mid = midSeason(g);
  const best = [...list].sort((a, b) => fits.get(b.id)!.score - fits.get(a.id)!.score)[0];
  const run = () => {
    mutate((gg) => setUserScheme(gg, side, sel.id as OffStyle & DefStyle));
    sfx.click();
    toast(mid && fam < 85 ? `${sel.label} is ${Math.round(fam)}% installed. Practice will get it game-ready.` : `${sel.label} is your ${side === 'off' ? 'offense' : 'defense'}.`, mid && fam < 60 ? 'bad' : 'good');
  };
  return (
    <div className="pb-wrap">
      <div className="pb-tiles">
        {list.map((x, i) => {
          const f = fits.get(x.id)!.score, fm = famOf(g, side, x.id);
          return (
            <motion.button key={x.id} className={`pb-tile ${x.id === current ? 'cur' : ''} ${x.id === view ? 'view' : ''}`} onClick={() => setView(x.id)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
              <div className="row" style={{ gap: 6 }}>
                <span style={{ fontSize: 18 }}>{x.icon}</span>
                <span className="small b ellipsis" style={{ flex: 1, textAlign: 'left' }}>{x.label}</span>
                {x.id === current && <span className="pill accent" style={{ fontSize: 9 }}>Active</span>}
              </div>
              <div className="row" style={{ gap: 6, marginTop: 6 }}>
                <span className={`pb-fit ${fitTone(f)}`} title="Personnel fit">{f}</span>
                <div className="bar thin" style={{ flex: 1 }} title={`Installed ${Math.round(fm)}%`}><i style={{ width: `${fm}%`, background: fm >= 85 ? 'var(--good)' : fm >= 55 ? 'var(--gold)' : 'var(--bad)' }} /></div>
              </div>
            </motion.button>
          );
        })}
      </div>
      <motion.div key={sel.id} className="pb-detail" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
        <div className="row" style={{ gap: 10 }}>
          <span style={{ fontSize: 30 }}>{sel.icon}</span>
          <div style={{ flex: 1 }}>
            <div className="h3">{sel.label}</div>
            <div className="small muted">{sel.desc}</div>
          </div>
          <div className="col" style={{ alignItems: 'flex-end', gap: 4 }}>
            <span className={`pb-fit big ${fitTone(selFit.score)}`}>{selFit.score}</span>
            <span className="tiny muted">roster fit</span>
          </div>
        </div>
        <div className="grid g2" style={{ gap: 10, marginTop: 12 }}>
          <div>{sel.strengths.map((t) => <div key={t} className="small" style={{ marginBottom: 3 }}>✅ {t}</div>)}</div>
          <div>{sel.weaknesses.map((t) => <div key={t} className="small" style={{ marginBottom: 3 }}>⚠️ {t}</div>)}</div>
        </div>
        <div className="tiny muted" style={{ marginTop: 8 }}>Needs: <b style={{ color: 'var(--text)' }}>{sel.needs}</b></div>
        <div className="pb-notes">
          <div className="tiny upper muted b" style={{ letterSpacing: '.12em', marginBottom: 4 }}>Your roster</div>
          {selFit.notes.map((n) => <div key={n.text} className={`small ${n.good ? 'good' : 'bad'}`}>{n.good ? '▲' : '▼'} {n.text}</div>)}
        </div>
        <div className="row" style={{ gap: 10, marginTop: 10 }}>
          <div style={{ flex: 1 }}>
            <div className="row tiny muted" style={{ justifyContent: 'space-between' }}><span>Installed</span><b style={{ color: 'var(--text)' }}>{Math.round(fam)}%</b></div>
            <div className="bar thin"><i style={{ width: `${fam}%`, background: fam >= 85 ? 'var(--good)' : fam >= 55 ? 'var(--gold)' : 'var(--bad)' }} /></div>
            <div className="tiny muted" style={{ marginTop: 3 }}>
              {fam >= 85 ? 'Game-ready. Your players know it cold.' : `Not fully installed: about ${(Math.abs(pen.make) * 100 * 1.5).toFixed(1)} fewer points per game until practice catches up.`}
            </div>
          </div>
          {sel.id === current
            ? <span className="pill good">✓ Your {side === 'off' ? 'offense' : 'defense'}</span>
            : <button className="btn primary" onClick={run}>{side === 'off' ? 'Run this offense' : 'Play this defense'}</button>}
        </div>
        {sel.id !== current && mid && fam < 85 && <div className="tiny" style={{ color: 'var(--gold)', marginTop: 6 }}>Mid-season switch: practice installs it each week (faster during Game Prep weeks). In the offseason, a new system installs for free.</div>}
        {best.id !== sel.id && <div className="tiny muted" style={{ marginTop: 6 }}>Best fit for your roster: <button className="linkish" onClick={() => setView(best.id)}>{best.icon} {best.label} ({fits.get(best.id)!.score})</button></div>}
      </motion.div>
    </div>
  );
}

/** Next opponent: how the schemes line up */
export function MatchupCard({ g }: { g: GameState }) {
  const next = nextUserGame(g);
  const uid = g.user.teamId;
  if (!next) return null;
  const opp = g.teams[next.home === uid ? next.away : next.home];
  const me = g.teams[uid];
  const oppPs = teamPlayers(g, opp.id), myPs = teamPlayers(g, uid);
  const myOff = me.strategy.offense, myDef = me.strategy.defense, theirOff = opp.strategy.offense, theirDef = opp.strategy.defense;
  const atk = edgeLabel(counterEdge(myOff, theirDef)), def = edgeLabel(-counterEdge(theirOff, myDef));
  const offIdeas = OFF_SCHEMES.map((o) => ({ o, v: counterEdge(o.id, theirDef) * 1000 + (o.fit(myPs).score - 55) * 0.25 })).sort((a, b) => b.v - a.v).slice(0, 2);
  const defIdeas = DEF_SCHEMES.map((d) => ({ d, v: -counterEdge(theirOff, d.id) * 1000 + (d.fit(myPs).score - 55) * 0.25 })).sort((a, b) => b.v - a.v).slice(0, 2);
  return (
    <Section title="Next Opponent" right={<span className="row tiny muted" style={{ gap: 6 }}><TeamLogo team={opp} size={18} />{opp.school}</span>}>
      <div className="pb-match">
        <div className="row" style={{ gap: 8 }}>
          <span className="tiny muted" style={{ width: 92 }}>Your offense</span>
          <b className="small" style={{ flex: 1 }}>{OFF[myOff].icon} {OFF[myOff].label}</b>
          <span className="tiny muted">vs</span>
          <b className="small" style={{ flex: 1, textAlign: 'right' }}>{DEF[theirDef].label} {DEF[theirDef].icon}</b>
          <span className={`pill ${atk.tone}`} style={{ fontSize: 10, width: 96, justifyContent: 'center' }}>{atk.text}</span>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 6 }}>
          <span className="tiny muted" style={{ width: 92 }}>Your defense</span>
          <b className="small" style={{ flex: 1 }}>{DEF[myDef].icon} {DEF[myDef].label}</b>
          <span className="tiny muted">vs</span>
          <b className="small" style={{ flex: 1, textAlign: 'right' }}>{OFF[theirOff].label} {OFF[theirOff].icon}</b>
          <span className={`pill ${def.tone}`} style={{ fontSize: 10, width: 96, justifyContent: 'center' }}>{def.text}</span>
        </div>
      </div>
      <div className="tiny muted" style={{ marginTop: 10 }}>
        Staff suggests: attack their {DEF[theirDef].label.toLowerCase()} with {offIdeas.map((x) => `${x.o.icon} ${x.o.label}`).join(' or ')}; defend their {OFF[theirOff].label.toLowerCase()} with {defIdeas.map((x) => `${x.d.icon} ${x.d.label}`).join(' or ')}.
      </div>
      <div className="tiny dim" style={{ marginTop: 4 }}>Their roster fit: {OFF[theirOff].fit(oppPs).score} offense · {DEF[theirDef].fit(oppPs).score} defense</div>
    </Section>
  );
}

/** Coaching tendencies and the go-to scorer */
export function TendencyPanel({ g }: { g: GameState }) {
  const { mutate } = useGame.getState();
  const team = g.teams[g.user.teamId];
  const s = team.strategy;
  const players = teamPlayers(g, team.id).filter((p) => !p.redshirting).sort((a, b) => b.ovr - a.ovr);
  const goTo = s.goTo ? g.players[s.goTo] : undefined;
  return (
    <Section title="Coaching Tendencies">
      <div className="col" style={{ gap: 14 }}>
        {TENDENCIES.map((t) => {
          const v = (s[t.key as TendencyKey] ?? 0) as number;
          return (
            <div key={t.key}>
              <div className="row" style={{ marginBottom: 4 }}><span className="small b" style={{ flex: 1 }}>{t.label}</span><span className="tiny muted">{v === 0 ? 'Neutral' : v > 0 ? `${t.hi}${v === 2 ? ' (max)' : ''}` : `${t.lo}${v === -2 ? ' (max)' : ''}`}</span></div>
              <div className="row" style={{ gap: 8 }}>
                <span className="tiny muted" style={{ width: 120, textAlign: 'right' }}>{t.lo}</span>
                <div className="seg" style={{ flex: 'none' }}>
                  {[-2, -1, 0, 1, 2].map((n) => <button key={n} className={v === n ? 'on' : ''} onClick={() => { mutate((gg) => { (gg.teams[gg.user.teamId].strategy as unknown as Record<string, number>)[t.key] = n; }); sfx.click(); }}>{n === 0 ? '•' : n > 0 ? '+'.repeat(n) : '−'.repeat(-n)}</button>)}
                </div>
                <span className="tiny muted" style={{ width: 120 }}>{t.hi}</span>
              </div>
              <div className="tiny dim" style={{ marginTop: 3 }}>{t.desc}</div>
            </div>
          );
        })}
        <div>
          <div className="small b" style={{ marginBottom: 4 }}>Go-To Scorer</div>
          <div className="row" style={{ gap: 8 }}>
            {goTo && <PlayerFace p={goTo} size={30} team={team} bg="none" />}
            <select className="select" value={s.goTo ?? ''} onChange={(e) => mutate((gg) => { gg.teams[gg.user.teamId].strategy.goTo = e.target.value || null; })}>
              <option value="">Nobody: share the ball</option>
              {players.slice(0, 8).map((p) => <option key={p.id} value={p.id}>{p.first} {p.last} ({p.pos}, {p.ovr})</option>)}
            </select>
          </div>
          <div className="tiny dim" style={{ marginTop: 3 }}>He gets about 30% more shots. Pairs naturally with Star Iso.</div>
        </div>
      </div>
    </Section>
  );
}

/** Compact scheme select used in the pregame plan and live game */
export function schemeOptions(g: GameState, side: Side, oppScheme?: OffStyle | DefStyle) {
  const myPs = teamPlayers(g, g.user.teamId);
  const list: Scheme[] = side === 'off' ? OFF_SCHEMES : DEF_SCHEMES;
  return list.map((x) => {
    const fit = x.fit(myPs).score, fam = Math.round(famOf(g, side, x.id));
    let edge = '';
    if (oppScheme) {
      const e = side === 'off' ? counterEdge(x.id as OffStyle, oppScheme as DefStyle) : -counterEdge(oppScheme as OffStyle, x.id as DefStyle);
      const l = edgeLabel(e);
      if (l.tone) edge = ` · ${l.tone === 'good' ? '▲' : '▼'} ${l.text}`;
    }
    return { id: x.id, label: `${x.icon} ${x.label} · fit ${fit}${fam < 85 ? ` · ${fam}% installed` : ''}${edge}` };
  });
}
export type { DefStyle, OffStyle };
