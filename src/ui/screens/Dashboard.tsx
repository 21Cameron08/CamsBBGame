import { motion } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { TeamLogo, TeamName, PlayerFace, Ovr, Gauge, Section, Bar, Stars, fmtMoneyShort, PersonFace, CoachFace, AnimatedNumber, TeamHeroBg, StaffFace } from '../components/common';
import { STAFF_ROLES, ROLE_INFO, staffGrade } from '../../engine/staff';
import { userGameToday, nextUserGame, playerPerGame, isRivalry } from '../../engine/season';
import { spread, confStandings } from '../../engine/rankings';
import { normCdf } from '../../engine/sim';
import { teamPlayers } from '../../engine/team';
import { committedNil } from '../../engine/nil';
import { classRankings } from '../../engine/recruiting';
import { seasonLabel } from '../../engine/calendar';
import type { GameState, ScheduledGame } from '../../engine/types';
import { teamAccent } from '../color';
import { PRACTICE_INFO, PRACTICE_ORDER, goalStatus } from '../../engine/development';

const IN_SEASON_PHASES = ['preseason', 'regular', 'confTourney', 'selection', 'ncaa'];

function PracticeCard({ g }: { g: GameState }) {
  const { nav, mutate } = useGame.getState();
  const dv = g.development!;
  const goals = Object.entries(dv.goalsSeason === g.season ? dv.goals : {}).map(([id, gl]) => (g.players[id] ? goalStatus(g, g.players[id], gl).status : 'pending'));
  const on = goals.filter((x) => x === 'onTrack' || x === 'met').length;
  return (
    <Section title="Practice & Development" right={<button className="btn sm ghost" onClick={() => nav('development')}>Development →</button>}>
      <div className="row wrap" style={{ gap: 4 }}>
        {PRACTICE_ORDER.map((f) => (
          <button key={f} className={`dev-focus ${dv.practice === f ? 'on' : ''}`} title={`${PRACTICE_INFO[f].label}: ${PRACTICE_INFO[f].desc}`} onClick={() => mutate((gg) => { gg.development!.practice = f; })}>
            <span>{PRACTICE_INFO[f].icon}</span>{dv.practice === f && <span className="lbl">{PRACTICE_INFO[f].label}</span>}
          </button>
        ))}
      </div>
      <div className="row tiny muted" style={{ marginTop: 10 }}>
        <span>Player goals on track: <b style={{ color: 'var(--text)' }}>{on}/{goals.length}</b></span>
        <div className="spacer" />
        <span>{dv.spotlight.length ? `⭐ ${dv.spotlight.length} spotlight` : 'No spotlight players yet'}</span>
      </div>
    </Section>
  );
}

export function Dashboard() {
  const g = useGameState();
  const user = g.teams[g.user.teamId];
  const coach = g.coaches[g.user.coachId];
  const players = teamPlayers(g, user.id).sort((a, b) => b.ovr - a.ovr);
  const chem = players.reduce((s, p) => s + p.morale, 0) / Math.max(1, players.length);
  const conf = g.conferences.find((c) => c.id === user.conf)!;
  const standings = confStandings(g, user.conf);
  const myConfRank = standings.findIndex((t) => t.id === user.id) + 1;
  const lastGame = [...g.schedule].filter((x) => x.played && (x.home === user.id || x.away === user.id)).sort((a, b) => b.day - a.day)[0];
  const commits = Object.values(g.recruits).filter((r) => r.committed === user.id).sort((a, b) => a.rank - b.rank);
  const cr = classRankings(g);
  const classRank = cr.findIndex((c) => c.teamId === user.id) + 1;
  const nilUsed = committedNil(g, user.id);
  const unresolved = g.inbox.filter((i) => !i.resolved);
  const { nav, open } = useGame.getState();
  const inSeason = ['preseason', 'regular', 'confTourney', 'selection', 'ncaa'].includes(g.phase);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">{seasonLabel(g.season)} · Coach {coach.last}'s Office</div>
          <h1 className="h1" style={{ marginTop: 6 }}>{user.school} <span style={{ color: 'var(--accent)' }}>{user.mascot}</span></h1>
        </div>
        <div className="spacer" />
        <div className="pill gold">🎯 AD Goal: {g.user.expectation}</div>
      </div>

      <div className="grid g-main">
        <div className="col" style={{ gap: 16 }}>
          {inSeason ? <NextGameCard g={g} /> : <OffseasonCard g={g} />}
          <div className="grid g2">
            <Section title="Last Result" right={lastGame && g.boxScores[lastGame.id] ? <button className="btn sm" onClick={() => open({ kind: 'box', gameId: lastGame.id })}>Box score</button> : null}>
              {lastGame ? <LastGame g={g} game={lastGame} /> : <div className="muted small">No games played yet.</div>}
            </Section>
            <Section title="Program Pulse">
              <div className="row" style={{ justifyContent: 'space-around' }}>
                <Gauge value={user.hype} label="Fan Hype" color="var(--accent)" size={84} />
                <Gauge value={coach.jobSecurity} label="Job Security" size={84} />
                <Gauge value={chem} label="Chemistry" size={84} color={chem > 70 ? 'var(--good)' : chem > 50 ? 'var(--warn)' : 'var(--bad)'} />
              </div>
            </Section>
          </div>
          <Section title="Team Leaders" right={<button className="btn sm ghost" onClick={() => nav('roster')}>Full roster →</button>}>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 10 }}>
              {players.slice(0, 5).map((p, i) => {
                const pg = playerPerGame(p);
                return (
                  <motion.div key={p.id} className="card hover" style={{ padding: 10, textAlign: 'center' }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} onClick={() => open({ kind: 'player', id: p.id })}>
                    <PlayerFace p={p} size={74} team={user} />
                    <div className="b ellipsis small" style={{ marginTop: 6 }}>{p.first[0]}. {p.last}</div>
                    <div className="tiny muted">{p.pos} · {p.cls}{p.injury ? ' · 🩹' : ''}</div>
                    <div className="row" style={{ justifyContent: 'center', marginTop: 6 }}><Ovr v={p.ovr} size="sm" /></div>
                    <div className="tiny muted" style={{ marginTop: 6 }}>{p.stats.gp ? `${pg.ppg.toFixed(1)} / ${pg.rpg.toFixed(1)} / ${pg.apg.toFixed(1)}` : '—'}</div>
                  </motion.div>
                );
              })}
            </div>
          </Section>
          <Section title="Headlines" right={<button className="btn sm ghost" onClick={() => nav('media')}>Media hub →</button>}>
            {g.news.slice(0, 6).map((n, i) => (
              <motion.div key={n.id} className="news-item" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                <div className="row">
                  {n.important && <span className="pill accent">●</span>}
                  <div className="b" style={{ flex: 1 }}>{n.headline}</div>
                  <span className="tiny dim">{n.date.split(' · ')[0]}</span>
                </div>
                <div className="small muted" style={{ marginTop: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.body}</div>
              </motion.div>
            ))}
          </Section>
        </div>

        <div className="col" style={{ gap: 16 }}>
          <Section glow>
            <div className="row">
              <TeamLogo team={user} size={56} />
              <div style={{ flex: 1 }}>
                <div className="h2">{user.record.w}-{user.record.l}</div>
                <div className="small muted">{user.record.cw}-{user.record.cl} in the {conf.short} · {myConfRank ? `${ordinal(myConfRank)} place` : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="eyebrow">AP</div>
                <div className="num" style={{ fontSize: 30, color: user.apRank ? 'var(--gold)' : 'var(--dim)' }}>{user.apRank ? `#${user.apRank}` : 'NR'}</div>
              </div>
            </div>
            <div className="grid g3" style={{ marginTop: 14, gap: 8 }}>
              <div className="stat-tile"><div className="l">NET</div><div className="v">{user.net || '—'}</div></div>
              <div className="stat-tile"><div className="l">Rating</div><div className="v">{user.rating > 0 ? '+' : ''}{user.rating.toFixed(1)}</div></div>
              <div className="stat-tile"><div className="l">Streak</div><div className="v" style={{ color: user.record.streak > 0 ? 'var(--good)' : user.record.streak < 0 ? 'var(--bad)' : undefined }}>{user.record.streak > 0 ? `W${user.record.streak}` : user.record.streak < 0 ? `L${-user.record.streak}` : '—'}</div></div>
            </div>
          </Section>

          {unresolved.length > 0 && (
            <motion.div className="card hover" onClick={() => nav('inbox')} initial={{ scale: 0.98 }} animate={{ scale: 1 }} style={{ borderColor: 'rgba(255,93,93,.4)' }}>
              <div className="row">
                <PersonFace seed={unresolved[0].from} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="tiny upper b bad">{unresolved.length} decision{unresolved.length > 1 ? 's' : ''} waiting</div>
                  <div className="b ellipsis">{unresolved[0].subject}</div>
                  <div className="tiny muted">{unresolved[0].from} · {unresolved[0].fromRole}</div>
                </div>
                <span className="pill bad">Open</span>
              </div>
            </motion.div>
          )}

          {g.staff && (
            <Section title="Coaching Staff" right={<button className="btn sm ghost" onClick={() => nav('staff')}>Staff →</button>}>
              <div className="row" style={{ justifyContent: 'space-between', gap: 6 }}>
                {STAFF_ROLES.map((r) => {
                  const m = g.staff!.members.find((x) => x.role === r);
                  return (
                    <div key={r} style={{ textAlign: 'center', cursor: 'pointer', flex: 1, minWidth: 0 }} onClick={() => nav('staff')} title={m ? `${m.first} ${m.last} · ${ROLE_INFO[r].title} (${m.rating})` : `${ROLE_INFO[r].title} — vacant`}>
                      {m ? <StaffFace m={m} size={44} team={user} /> : <div style={{ width: 44, height: 44, borderRadius: 22, border: '2px dashed var(--bad)', display: 'grid', placeItems: 'center', margin: '0 auto', fontSize: 18 }}>{ROLE_INFO[r].icon}</div>}
                      <div className="tiny muted ellipsis" style={{ marginTop: 3 }}>{ROLE_INFO[r].short}</div>
                    </div>
                  );
                })}
              </div>
              <div className="row tiny muted" style={{ marginTop: 10 }}>
                <span>Staff grade <b style={{ color: 'var(--text)' }}>{staffGrade(g.staff)}</b></span>
                <div className="spacer" />
                {g.staff.members.length < 6 ? <span className="bad b">{6 - g.staff.members.length} vacant role{6 - g.staff.members.length > 1 ? 's' : ''}</span> : <span className="good">Fully staffed</span>}
              </div>
            </Section>
          )}

          {IN_SEASON_PHASES.includes(g.phase) && g.development && <PracticeCard g={g} />}

          <Section title="NIL & Rev-Share" right={<button className="btn sm ghost" onClick={() => nav('nil')}>NIL office →</button>}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="num" style={{ fontSize: 26 }}><AnimatedNumber value={nilUsed} format={fmtMoneyShort} /></span>
              <span className="muted small">of {fmtMoneyShort(user.nilBudget)} pool</span>
            </div>
            <Bar v={nilUsed} max={user.nilBudget} className="thick" color={nilUsed > user.nilBudget ? 'var(--bad)' : 'var(--accent)'} />
            <div className="tiny muted" style={{ marginTop: 8 }}>{fmtMoneyShort(Math.max(0, user.nilBudget - nilUsed))} available for retention, recruits & the portal</div>
          </Section>

          <Section title={`Class of ${g.season + 1}`} right={<button className="btn sm ghost" onClick={() => nav('recruiting')}>Recruiting →</button>}>
            <div className="row" style={{ marginBottom: 10 }}>
              <div className="stat-tile" style={{ flex: 1 }}><div className="l">Commits</div><div className="v">{commits.length}</div></div>
              <div className="stat-tile" style={{ flex: 1 }}><div className="l">Class Rank</div><div className="v">{classRank ? `#${classRank}` : '—'}</div></div>
              <div className="stat-tile" style={{ flex: 1 }}><div className="l">On Board</div><div className="v">{g.user.board.length}</div></div>
            </div>
            {commits.slice(0, 4).map((r) => (
              <div key={r.id} className="row" style={{ padding: '6px 0', cursor: 'pointer' }} onClick={() => open({ kind: 'recruit', id: r.id })}>
                <PlayerFace p={r} size={34} team={user} />
                <div style={{ flex: 1, minWidth: 0 }}><div className="small b ellipsis">{r.first} {r.last}</div><div className="tiny muted">{r.pos} · #{r.rank} nationally</div></div>
                <Stars n={r.stars} />
              </div>
            ))}
            {!commits.length && <div className="small muted">No commitments yet. Build your board and start offering.</div>}
          </Section>

          <Section title={`${conf.short} Standings`} right={<button className="btn sm ghost" onClick={() => nav('standings')}>All →</button>}>
            <table className="table">
              <tbody>
                {standings.slice(0, 8).map((t, i) => (
                  <tr key={t.id} className={t.id === user.id ? 'me' : ''}>
                    <td className="dim" style={{ width: 20 }}>{i + 1}</td>
                    <td><TeamName team={t} logo={20} /></td>
                    <td className="r num">{t.record.cw}-{t.record.cl}</td>
                    <td className="r muted small">{t.record.w}-{t.record.l}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="Courtside Feed">
            {g.social.slice(0, 4).map((s) => (
              <div key={s.id} className="row" style={{ alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <PersonFace seed={s.handle} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="small"><b>{s.name}</b>{s.verified && <span style={{ color: 'var(--blue)' }}> ✔</span>} <span className="dim">@{s.handle}</span></div>
                  <div className="small">{s.text}</div>
                  <div className="tiny dim">♥ {s.likes.toLocaleString()} · ⟲ {s.reposts.toLocaleString()}</div>
                </div>
              </div>
            ))}
          </Section>
        </div>
      </div>
    </div>
  );
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function NextGameCard({ g }: { g: GameState }) {
  const user = g.teams[g.user.teamId];
  const today = userGameToday(g);
  const next = today ?? nextUserGame(g);
  const { open } = useGame.getState();
  const coach = g.coaches[g.user.coachId];
  if (!next) {
    const bracket = g.phase === 'ncaa' ? g.ncaa : g.phase === 'confTourney' ? g.confTourneys[user.conf] : null;
    const alive = !!bracket && !bracket.champion && bracket.rounds.some((r) => r.some((x) => !x.winner && x.teams.includes(user.id)));
    const inField = !!g.ncaa && g.ncaa.seeds[user.id] != null;
    const title = g.phase === 'selection' ? 'Selection Sunday — the bracket is about to drop'
      : alive ? 'Waiting on your next opponent'
      : g.phase === 'ncaa' ? (inField ? 'Your tournament run is over' : 'March Madness is underway without you')
      : g.phase === 'confTourney' ? 'Your conference tournament is over'
      : 'No upcoming games';
    const sub = g.phase === 'selection' ? 'Hit "Reveal the Bracket" to find out your fate.'
      : alive ? 'Advance a day — your next game appears once the other half of the bracket finishes.'
      : 'Keep simming to watch the rest of the postseason, then the offseason begins.';
    return (
      <div className="card glow" style={{ padding: 26 }}>
        <div className="eyebrow">Season Status</div>
        <div className="h2" style={{ marginTop: 6 }}>{title}</div>
        <div className="muted" style={{ marginTop: 6 }}>{sub}</div>
        {(g.phase === 'ncaa' || g.phase === 'confTourney') && <button className="btn primary" style={{ marginTop: 14 }} onClick={() => useGame.getState().nav('bracket')}>Open the bracket →</button>}
      </div>
    );
  }
  const home = g.teams[next.home], away = g.teams[next.away];
  const isHome = next.home === user.id;
  const opp = isHome ? away : home;
  const sp = spread(g, next.home, next.away, next.neutral);
  const userSpread = isHome ? sp : -sp;
  const wp = normCdf(userSpread / 11);
  const rv = isRivalry(home.id, away.id);
  const oppCoach = g.coaches[opp.coachId];
  const cal = g.calendar[next.day];
  return (
    <motion.div className="card glow" style={{ padding: 0, overflow: 'hidden' }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="hero" style={{ padding: '22px 26px' }}>
        <div className="hero-bg" style={{ background: `linear-gradient(110deg, ${user.colors[0]}cc 0%, #0b1220 48%, #0b1220 52%, ${opp.colors[0]}cc 100%)` }} />
        <div className="row" style={{ marginBottom: 14 }}>
          <span className={`pill ${today ? 'gold' : ''}`}>{today ? '🔴 GAME DAY' : 'NEXT UP'}</span>
          <span className="pill">{cal?.label.split(' · ')[0]}</span>
          {next.tv && <span className="pill">📺 {next.tv}</span>}
          {rv && <span className="pill bad">🔥 {rv.name ?? 'Rivalry'}</span>}
          {next.event && <span className="pill accent">{next.event}</span>}
          <div className="spacer" />
          <span className="small muted">{next.neutral ? 'Neutral site' : isHome ? `${user.arena}` : `@ ${opp.arena}`}</span>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', gap: 20 }}>
          <MatchSide g={g} teamId={user.id} align="left" />
          <div style={{ textAlign: 'center' }}>
            <div className="num" style={{ fontSize: 46, lineHeight: 1, color: 'rgba(255,255,255,.85)' }}>{isHome || next.neutral ? 'VS' : '@'}</div>
            <div className="tiny muted" style={{ marginTop: 6 }}>Line: {userSpread === 0 ? 'PICK' : `${user.abbr} ${userSpread > 0 ? '-' : '+'}${Math.abs(userSpread)}`}</div>
          </div>
          <MatchSide g={g} teamId={opp.id} align="right" />
        </div>
        <div style={{ marginTop: 18 }}>
          <div className="row tiny b" style={{ justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ color: teamAccent(user.colors) }}>{user.abbr} {Math.round(wp * 100)}%</span>
            <span className="muted upper">Win probability</span>
            <span style={{ color: teamAccent(opp.colors) }}>{Math.round((1 - wp) * 100)}% {opp.abbr}</span>
          </div>
          <div style={{ display: 'flex', height: 8, borderRadius: 6, overflow: 'hidden', background: 'rgba(255,255,255,.08)' }}>
            <motion.div initial={{ width: '50%' }} animate={{ width: `${wp * 100}%` }} transition={{ duration: 1 }} style={{ background: teamAccent(user.colors) }} />
            <div style={{ flex: 1, background: teamAccent(opp.colors), opacity: 0.85 }} />
          </div>
        </div>
        <div className="row" style={{ marginTop: 18 }}>
          <CoachFace c={coach} size={34} team={user} />
          <span className="small muted">vs</span>
          {oppCoach && <CoachFace c={oppCoach} size={34} team={opp} />}
          <span className="small muted">{oppCoach ? `Coach ${oppCoach.last} (${oppCoach.careerW}-${oppCoach.careerL})` : ''}</span>
          <div className="spacer" />
          {today ? (
            <>
              <button className="btn" onClick={() => useGame.getState().quickSimUserGame()}>Quick Sim</button>
              <button className="btn gold lg" onClick={() => open({ kind: 'pregame', gameId: today.id })}>🏀 Go to Game Day</button>
            </>
          ) : (
            <button className="btn primary" onClick={() => void useGame.getState().advance('nextGame')}>Advance to game day →</button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function MatchSide({ g, teamId, align }: { g: GameState; teamId: string; align: 'left' | 'right' }) {
  const t = g.teams[teamId];
  return (
    <div className="row" style={{ flexDirection: align === 'left' ? 'row' : 'row-reverse', gap: 14, flex: 1, minWidth: 0 }}>
      <motion.div initial={{ x: align === 'left' ? -30 : 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 18 }}>
        <TeamLogo team={t} size={78} />
      </motion.div>
      <div style={{ textAlign: align, minWidth: 0 }}>
        <div className="h2 ellipsis">{t.apRank ? <span className="rank">{t.apRank}</span> : null}{t.school}</div>
        <div className="small muted">{t.record.w}-{t.record.l} · {g.conferences.find((c) => c.id === t.conf)?.short}</div>
        <div className="tiny dim">NET {t.net || '—'} · Rating {t.rating.toFixed(1)}</div>
      </div>
    </div>
  );
}

function LastGame({ g, game }: { g: GameState; game: ScheduledGame }) {
  const user = g.teams[g.user.teamId];
  const isHome = game.home === user.id;
  const us = isHome ? game.hs! : game.as!, them = isHome ? game.as! : game.hs!;
  const opp = g.teams[isHome ? game.away : game.home];
  const won = us > them;
  const potg = game.potg ? g.players[game.potg] : undefined;
  return (
    <div>
      <div className="row">
        <span className={`pill ${won ? 'good' : 'bad'}`} style={{ fontSize: 14, padding: '4px 12px' }}>{won ? 'W' : 'L'}</span>
        <span className="num" style={{ fontSize: 30 }}>{us}-{them}</span>
        <span className="muted">{isHome ? 'vs' : '@'}</span>
        <TeamName team={opp} logo={22} />
      </div>
      {potg && (
        <div className="row" style={{ marginTop: 12 }}>
          <PlayerFace p={potg} size={38} team={g.teams[potg.teamId ?? ''] ?? user} />
          <div className="small"><span className="muted">Player of the game:</span> <b>{potg.first} {potg.last}</b></div>
        </div>
      )}
    </div>
  );
}

function OffseasonCard({ g }: { g: GameState }) {
  const { nav } = useGame.getState();
  const labels: Partial<Record<GameState['phase'], [string, string]>> = {
    seasonEnd: ['Season Review', 'Awards, AD evaluation and the coaching carousel.'],
    declarations: ['Draft Declarations', 'Seniors move on and early entrants head to the NBA.'],
    portal: ['Transfer Portal Is Open', 'Keep your guys, then go shopping.'],
    signing: ['Signing Day', 'Your incoming class is officially on campus.'],
    draft: ['NBA Draft', 'See where your players landed.'],
    progression: ['Summer Development', 'Who made the leap?'],
    scheduling: ['Scheduling Office', 'Build next season’s non-conference slate.'],
  };
  const [t, d] = labels[g.phase] ?? ['Offseason', ''];
  const user = g.teams[g.user.teamId];
  return (
    <div className="card glow" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="hero" style={{ padding: 28 }}>
        <TeamHeroBg team={user} />
        <div className="eyebrow">Offseason</div>
        <div className="h1" style={{ marginTop: 8 }}>{t}</div>
        <div className="muted" style={{ marginTop: 8 }}>{d}</div>
        <button className="btn primary lg" style={{ marginTop: 18 }} onClick={() => nav('offseason')}>Open the Offseason Hub →</button>
      </div>
    </div>
  );
}
