// In the League: the pros your program has produced, and the national NBA pipeline rankings.
import { useState } from 'react';
import { useGame } from '../../store/gameStore';
import { PlayerFace, Section, TeamLogo } from '../components/common';
import type { GameState, Team } from '../../engine/types';
import { proStatus, proTotals, prosOf } from '../../engine/pros';

const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M` : `$${Math.round(n / 1000)}K`);

export function InTheLeague({ g, team }: { g: GameState; team: Team }) {
  const open = useGame((s) => s.open);
  const [all, setAll] = useState(false);
  const pros = prosOf(g, team.id);
  const pipe = g.pros?.pipeline ?? {};
  const mine = pipe[team.id] ?? { nba: 0, allStars: 0, alumni: 0 };
  const rings = pros.reduce((s, c) => s + c.rings, 0);
  const earned = pros.reduce((s, c) => s + c.earnings, 0);
  const ranking = Object.entries(pipe).filter(([, x]) => x.nba > 0).sort((a, b) => b[1].nba - a[1].nba || b[1].allStars - a[1].allStars);
  const myRank = ranking.findIndex(([id]) => id === team.id) + 1;
  const shown = all ? pros : pros.slice(0, 12);
  return (
    <>
      <Section title="In the League" right={<span className="tiny muted">Pros from {team.school}</span>}>
        <div className="grid g3" style={{ gap: 8, marginBottom: 10 }}>
          {[['In the NBA now', mine.nba], ['All-Stars', mine.allStars], ['NBA rings', rings]].map(([l, v]) => (
            <div key={l} className="stat-tile" style={{ padding: '8px 10px' }}><div className="l">{l}</div><div className="v" style={{ fontSize: 22 }}>{v}</div></div>
          ))}
        </div>
        {!pros.length ? <div className="small muted">No pros yet. Every player you send to the draft gets a pro career you can follow here, and pro-minded recruits notice the pipeline.</div> : (
          <div className="col" style={{ gap: 2 }}>
            {shown.map((c) => {
              const t = proTotals(c);
              const st = proStatus(c);
              const nba = c.retired == null && c.log[c.log.length - 1]?.[1] === 0;
              return (
                <div key={c.id} className="row" style={{ gap: 10, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                  <PlayerFace p={{ id: c.id, num: c.num, injury: null }} size={38} team={team} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      <span className="small b">{c.name}</span>
                      <span className="tiny muted">{c.pos} · No. {c.pick} pick, {c.draft}</span>
                      {c.allStar > 0 && <span className="pill gold" style={{ fontSize: 9 }}>⭐ {c.allStar}× All-Star</span>}
                      {c.rings > 0 && <span className="pill gold" style={{ fontSize: 9 }}>💍 {c.rings} ring{c.rings > 1 ? 's' : ''}</span>}
                      {c.mvp > 0 && <span className="pill gold" style={{ fontSize: 9 }}>🏆 {c.mvp > 1 ? `${c.mvp}× ` : ''}MVP</span>}
                      {c.allNba > 0 && <span className="pill" style={{ fontSize: 9 }}>All-NBA ×{c.allNba}</span>}
                      {c.roy && <span className="pill" style={{ fontSize: 9 }}>Rookie of the Year</span>}
                      {c.bust && <span className="pill bad" style={{ fontSize: 9 }}>Bust</span>}
                    </div>
                    <div className="tiny muted">
                      {t.seasons ? `${t.nbaSeasons} NBA season${t.nbaSeasons === 1 ? '' : 's'}${t.nbaSeasons ? ` · ${t.ppg.toFixed(1)} ppg (best ${t.best.toFixed(1)})` : ''}${t.seasons > t.nbaSeasons ? ` · ${t.seasons - t.nbaSeasons} abroad or in the G League` : ''} · earned ${money(c.earnings)}` : 'Rookie season under way'}
                    </div>
                  </div>
                  <span className={`pill ${nba ? 'accent' : c.retired != null ? '' : 'soft'}`} style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{st}</span>
                </div>
              );
            })}
            {pros.length > 12 && <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${pros.length}`}</button>}
            <div className="tiny muted" style={{ marginTop: 6 }}>Alumni have earned {money(earned)} as pros.</div>
          </div>
        )}
      </Section>
      {ranking.length > 0 && (
        <Section title="NBA Pipeline" right={<span className="tiny muted">{myRank ? `${team.school} ranks ${myRank}${['th', 'st', 'nd', 'rd'][myRank % 100 > 10 && myRank % 100 < 14 ? 0 : myRank % 10] ?? 'th'}` : `${team.school} has no one in the league`}</span>}>
          {ranking.slice(0, 10).map(([id, x], i) => {
            const t = g.teams[id];
            if (!t) return null;
            return (
              <div key={id} className="row small" style={{ gap: 8, padding: '4px 6px', borderRadius: 8, cursor: 'pointer', background: id === team.id ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : undefined }} onClick={() => open({ kind: 'team', id })}>
                <span className="tiny muted num" style={{ width: 18 }}>{i + 1}</span>
                <TeamLogo team={t} size={20} />
                <span style={{ flex: 1 }} className="ellipsis">{t.school}</span>
                <span className="tiny muted">{x.allStars ? `${x.allStars} All-Star${x.allStars > 1 ? 's' : ''} · ` : ''}</span>
                <span className="num b">{x.nba}</span>
              </div>
            );
          })}
          <div className="tiny muted" style={{ marginTop: 6 }}>Former players on NBA rosters right now. Recruits who care about going pro weigh this.</div>
        </Section>
      )}
    </>
  );
}
