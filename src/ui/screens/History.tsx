import { useMemo } from 'react';
import { openRecords } from './Records';
import { motion } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { TeamLogo, TeamName, Section, Empty, CoachFace, TeamHeroBg } from '../components/common';
import type { GameState, Team, Trophy } from '../../engine/types';
import { seasonLabel } from '../../engine/calendar';
import { inkOn } from '../color';
import { loreOf, preDynastyTitles } from '../../engine/legacy';
import { ProgramStory, RingOfHonor } from '../components/Legacy';
import { rivalriesOf } from '../../engine/rivalry';
import { replayAwardsNight } from '../shell/advance';

const TROPHY_ICON: Record<Trophy['kind'], string> = { natl: '🏆', f4: '🥇', e8: '🎖️', s16: '🏅', conf: '🏟️', ctourn: '✂️', coy: '🧢' };

function postseasonClass(p: string) {
  if (p === 'Champion') return 'pill gold';
  if (p === 'Runner-up' || p === 'Final Four') return 'pill accent';
  if (p === 'Elite Eight' || p === 'Sweet 16') return 'pill blue';
  if (p) return 'pill good';
  return '';
}

interface BannerDef { key: string; season: number; title: string; sub: string; big: boolean }

function Banner({ team, b, i }: { team: Team; b: BannerDef; i: number }) {
  const [p, s] = team.colors;
  const ink = inkOn(p, s);
  const w = b.big ? 118 : 96, h = b.big ? 170 : 140;
  return (
    <motion.div initial={{ y: -60, opacity: 0, rotate: -4 }} animate={{ y: 0, opacity: 1, rotate: 0 }} transition={{ delay: i * 0.08, type: 'spring', stiffness: 120, damping: 11 }}
      style={{ transformOrigin: 'top center' }}>
      <motion.div animate={{ rotate: [0, 1.2, 0, -1.2, 0] }} transition={{ duration: 6 + (i % 3), repeat: Infinity, ease: 'easeInOut' }} style={{ transformOrigin: 'top center' }}>
        <svg width={w} height={h + 14} viewBox={`0 0 ${w} ${h + 14}`}>
          <line x1={w * 0.2} y1="0" x2={w * 0.2} y2="14" stroke="rgba(255,255,255,.35)" strokeWidth="1.5" />
          <line x1={w * 0.8} y1="0" x2={w * 0.8} y2="14" stroke="rgba(255,255,255,.35)" strokeWidth="1.5" />
          <rect x="2" y="12" width={w - 4} height="8" rx="2" fill="#2b2f38" />
          <path d={`M4 18 H${w - 4} V${h - 10} L${w / 2} ${h + 10} L4 ${h - 10} Z`} fill={p} stroke={s} strokeWidth="3" />
          <path d={`M10 24 H${w - 10} V${h - 14} L${w / 2} ${h + 2} L10 ${h - 14} Z`} fill="none" stroke={s} strokeOpacity=".45" strokeWidth="1.2" />
          <text x={w / 2} y={b.big ? 62 : 54} textAnchor="middle" fill={ink} fontFamily="var(--font-display)" fontWeight="900" fontSize={b.big ? 24 : 19} letterSpacing="1">{b.season + 1}</text>
          <foreignObject x="8" y={b.big ? 70 : 62} width={w - 16} height={h - (b.big ? 80 : 70)}>
            <div style={{ color: ink, fontFamily: 'var(--font-display)', fontWeight: 800, textTransform: 'uppercase', textAlign: 'center', fontSize: b.big ? 14 : 11.5, lineHeight: 1.05, letterSpacing: '.04em' }}>
              {b.title}
              <div style={{ fontSize: b.big ? 10 : 9, opacity: 0.8, marginTop: 4, fontWeight: 700 }}>{b.sub}</div>
            </div>
          </foreignObject>
        </svg>
      </motion.div>
    </motion.div>
  );
}

export function HistoryScreen() {
  const g = useGameState();
  const open = useGame((s) => s.open);
  const team = g.teams[g.user.teamId];
  const coach = g.coaches[g.user.coachId];
  const conf = g.conferences.find((c) => c.id === team.conf);

  const lore = loreOf(team.id);
  const preTitles = preDynastyTitles(team.id);
  const banners = useMemo<BannerDef[]>(() => {
    // titles won before the dynasty began (Banner shows season + 1 as the year)
    const out: BannerDef[] = preTitles.map((y) => ({ key: `p${y}`, season: y - 1, title: 'National Champions', sub: 'NCAA Tournament', big: true }));
    for (const h of team.history) {
      if (h.postseason === 'Champion') out.push({ key: `n${h.season}`, season: h.season, title: 'National Champions', sub: `${h.w}-${h.l}`, big: true });
      else if (h.postseason === 'Runner-up' || h.postseason === 'Final Four') out.push({ key: `f${h.season}`, season: h.season, title: 'Final Four', sub: h.postseason === 'Runner-up' ? 'National Runner-up' : `${h.w}-${h.l}`, big: false });
      if (h.confChamp) out.push({ key: `c${h.season}`, season: h.season, title: `${conf?.short ?? ''} Champions`, sub: 'Regular Season', big: false });
      if (h.confTourneyChamp) out.push({ key: `t${h.season}`, season: h.season, title: `${conf?.short ?? ''} Tournament`, sub: 'Champions', big: false });
    }
    return out.sort((a, b) => a.season - b.season || (b.big ? 1 : 0) - (a.big ? 1 : 0));
  }, [team.history, team.history.length, conf?.short, team.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => {
    const t = { w: 0, l: 0, ncaa: 0, s16: 0, f4: 0, titles: 0 };
    for (const h of team.history) {
      t.w += h.w; t.l += h.l;
      if (h.ncaaSeed != null) t.ncaa++;
      if (['Sweet 16', 'Elite Eight', 'Final Four', 'Runner-up', 'Champion'].includes(h.postseason)) t.s16++;
      if (['Final Four', 'Runner-up', 'Champion'].includes(h.postseason)) t.f4++;
      if (h.postseason === 'Champion') t.titles++;
    }
    return t;
  }, [team.history, team.history.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const myAwards = useMemo(() => g.awards.filter((a) => a.teamId === team.id).slice().reverse(), [g.awards, g.awards.length, team.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const myPicks = useMemo(() => g.draft.filter((d) => d.teamId === team.id).slice().reverse(), [g.draft, g.draft.length, team.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const champs = [...g.champions].reverse();

  return (
    <div>
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 18 }}>
        <div className="hero" style={{ padding: '26px 28px 20px' }}>
          <TeamHeroBg team={team} />
          <div className="row gap-l">
            <TeamLogo team={team} size={92} />
            <div>
              <div className="eyebrow" style={{ color: 'rgba(255,255,255,.8)' }}>Program History</div>
              <div className="h1" style={{ fontSize: 44 }}>{team.school} {team.mascot}</div>
              <div className="small" style={{ opacity: 0.85 }}>{team.arena} · {conf?.name} · Prestige {Math.round(team.prestige)}</div>
              <div className="row" style={{ marginTop: 10, gap: 8 }}>
                <button className="btn sm" onClick={() => openRecords('program')}>📖 Program Record Book</button>
                <button className="btn sm" onClick={() => open({ kind: 'program', id: team.id })}>📊 Program Stats</button>
                {(g.awardsShows ?? []).length > 0 && <button className="btn sm" onClick={() => replayAwardsNight(g.awardsShows![g.awardsShows!.length - 1].season)}>🏆 Replay Awards Night</button>}
              </div>
            </div>
            <div className="spacer" />
            <div className="grid g3" style={{ gap: 10, minWidth: 380 }}>
              {[
                ['Record', `${totals.w}-${totals.l}`],
                ['NCAA Bids', totals.ncaa],
                ['Natl Titles', totals.titles + preTitles.length, preTitles.length ? `${preTitles.length} before the dynasty` : ''],
                ['Sweet 16s', totals.s16],
                ['Final Fours', totals.f4],
                ['Draft Picks', myPicks.length],
              ].map(([l, v, sub]) => (
                <div key={String(l)} className="stat-tile" style={{ padding: '10px 12px', background: 'rgba(0,0,0,.28)' }} title={sub ? String(sub) : undefined}>
                  <div className="l">{l}</div>
                  <div className="v" style={{ fontSize: 24 }}>{v}</div>
                  {sub ? <div className="tiny muted" style={{ marginTop: 3 }}>{sub}</div> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: '6px 22px 22px', background: 'linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.15))', borderTop: '1px solid var(--line)' }}>
          <div className="eyebrow" style={{ margin: '12px 0 4px' }}>Hall of Champions · The Rafters</div>
          {banners.length === 0
            ? <div className="small muted" style={{ padding: '18px 0' }}>The rafters are empty. Win a conference title or make a Final Four to raise your first banner.</div>
            : <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>{banners.map((b, i) => <Banner key={b.key} team={team} b={b} i={i} />)}</div>}
          <div className="eyebrow" style={{ margin: '18px 0 8px' }}>Ring of Honor · Retired Jerseys</div>
          <RingOfHonor g={g} team={team} />
        </div>
      </div>

      <div className="grid g-main" style={{ alignItems: 'start' }}>
        <div className="col" style={{ gap: 16 }}>
          {lore && <Section title="Program Story"><ProgramStory g={g} team={team} showRing={false} showTitles={false} /></Section>}
          <div className="card flush">
            <div className="card-head" style={{ padding: '16px 18px 0' }}><div className="h3">Season by Season</div></div>
            {team.history.length === 0
              ? <Empty>Your first season is still being written.</Empty>
              : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Season</th><th>Coach</th><th className="r">Record</th><th className="r">Conf</th><th className="c">Finish</th><th>Postseason</th><th className="c">Seed</th><th className="c">AP</th><th className="r">Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...team.history].reverse().map((h) => {
                        const c = g.coaches[h.coachId];
                        return (
                          <tr key={h.season} className={h.coachId === coach.id ? 'me' : ''}>
                            <td className="b">{seasonLabel(h.season)}</td>
                            <td className="small">{c ? `${c.first[0]}. ${c.last}` : <span className="dim">—</span>}</td>
                            <td className="r num" style={{ fontSize: 15 }}>{h.w}-{h.l}</td>
                            <td className="r mono muted">{h.cw}-{h.cl}</td>
                            <td className="c">{h.confFinish ? `${h.confFinish}${h.confChamp ? ' 👑' : ''}` : '—'}{h.confTourneyChamp ? ' ✂️' : ''}</td>
                            <td>{h.postseason ? <span className={postseasonClass(h.postseason)}>{h.postseason}</span> : <span className="dim">—</span>}</td>
                            <td className="c mono">{h.ncaaSeed ?? '—'}</td>
                            <td className="c">{h.apFinal ? <span className="rank">{h.apFinal}</span> : <span className="dim">—</span>}</td>
                            <td className="r mono" style={{ color: h.rating >= 0 ? 'var(--good)' : 'var(--bad)' }}>{h.rating > 0 ? '+' : ''}{h.rating.toFixed(1)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
          </div>

          <div className="grid g2">
            <Section title="Award Winners">
              {myAwards.length === 0 && <div className="small muted">No major awards yet.</div>}
              {myAwards.slice(0, 30).map((a, i) => {
                const p = a.playerId ? g.players[a.playerId] : undefined;
                const c = a.coachId ? g.coaches[a.coachId] : undefined;
                const name = p ? `${p.first} ${p.last}` : c ? `Coach ${c.last}` : a.who ?? 'Former player';
                return (
                  <div key={i} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)', cursor: p ? 'pointer' : undefined }} onClick={() => p && open({ kind: 'player', id: p.id })}>
                    <span style={{ fontSize: 16 }}>🏅</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="small b ellipsis">{a.name}</div>
                      <div className="tiny muted">{name} · {seasonLabel(a.season)}</div>
                    </div>
                  </div>
                );
              })}
            </Section>
            <Section title="NBA Draft Picks">
              {myPicks.length === 0 && <div className="small muted">No pros produced yet. Develop talent to build the pipeline.</div>}
              {myPicks.slice(0, 30).map((d) => (
                <div key={`${d.season}-${d.pick}`} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                  <span className="num" style={{ width: 34, fontSize: 18, color: d.round === 1 ? 'var(--gold)' : 'var(--muted)' }}>#{d.pick}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="small b ellipsis">{d.name} <span className="muted">· {d.pos}</span></div>
                    <div className="tiny muted">{d.nbaTeam} · {d.season} Draft · Rd {d.round}</div>
                  </div>
                </div>
              ))}
            </Section>
          </div>
        </div>

        <div className="col" style={{ gap: 16 }}>
          {rivalriesOf(g, team.id).some((r) => r.trophy) && (
            <Section title="Rivalry Trophies" right={<button className="btn sm ghost" onClick={() => useGame.getState().nav('rivalries')}>Rivalries →</button>}>
              <div className="col" style={{ gap: 6 }}>
                {rivalriesOf(g, team.id).filter((r) => r.trophy).map((r) => {
                  const opp = g.teams[r.a === team.id ? r.b : r.a];
                  const mine = r.holder === team.id;
                  return (
                    <div key={r.key} className="row click" style={{ gap: 10, padding: '6px 8px', borderRadius: 10, cursor: 'pointer', background: mine ? 'rgba(246,201,76,.1)' : 'rgba(255,255,255,.03)', border: `1px solid ${mine ? 'rgba(246,201,76,.4)' : 'var(--line)'}` }} onClick={() => open({ kind: 'rivalry', id: r.key })}>
                      <span style={{ fontSize: 22, filter: mine ? undefined : 'grayscale(1) opacity(.5)' }}>🏆</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="small b ellipsis">{r.trophy}</div>
                        <div className="tiny muted ellipsis">vs {opp.school} · {r.name}</div>
                      </div>
                      <span className={`tiny b ${mine ? '' : 'muted'}`} style={{ color: mine ? 'var(--gold)' : undefined }}>{mine ? 'IN OUR CASE' : r.holder ? `Held by ${g.teams[r.holder]?.abbr}` : 'Up for grabs'}</span>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          <Section title="Your Trophy Case">
            <div className="row" style={{ marginBottom: 12 }}>
              <CoachFace c={coach} size={56} team={team} />
              <div>
                <div className="b">Coach {coach.first} {coach.last}</div>
                <div className="tiny muted">{coach.careerW}-{coach.careerL} career · {coach.trophies.length} trophies</div>
              </div>
            </div>
            {coach.trophies.length === 0
              ? <div className="small muted">Nothing on the shelf yet. Go win something.</div>
              : (
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
                  {[...coach.trophies].reverse().map((tr, i) => (
                    <motion.div key={i} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }}
                      className="col" style={{ alignItems: 'center', gap: 2, padding: '10px 6px', borderRadius: 12, background: tr.kind === 'natl' ? 'rgba(246,201,76,.12)' : 'rgba(255,255,255,.04)', border: `1px solid ${tr.kind === 'natl' ? 'rgba(246,201,76,.4)' : 'var(--line)'}`, textAlign: 'center' }}>
                      <span style={{ fontSize: 28 }}>{TROPHY_ICON[tr.kind]}</span>
                      <span className="tiny b" style={{ lineHeight: 1.15 }}>{tr.label}</span>
                      <span className="tiny dim">{seasonLabel(tr.season)} · {g.teams[tr.teamId]?.abbr}</span>
                    </motion.div>
                  ))}
                </div>
              )}
          </Section>

          <Section title="National Champions">
            {champs.length === 0 && <div className="small muted">The first champion of your dynasty will be crowned in April.</div>}
            {champs.map((c) => {
              const t = g.teams[c.teamId], ru = g.teams[c.runnerUp];
              const mine = c.teamId === team.id;
              return (
                <div key={c.season} className="row" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', background: mine ? 'rgba(246,201,76,.08)' : undefined }}>
                  <span className="num muted" style={{ width: 54 }}>{seasonLabel(c.season)}</span>
                  <TeamLogo team={t} size={28} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <TeamName team={t} showRank={false} />
                    <div className="tiny muted">def. {ru?.school ?? '—'} {c.score}</div>
                  </div>
                  <span style={{ fontSize: 18 }}>🏆</span>
                </div>
              );
            })}
          </Section>

          <RecentChampsByConf g={g} />
        </div>
      </div>
    </div>
  );
}

function RecentChampsByConf({ g }: { g: GameState }) {
  const team = g.teams[g.user.teamId];
  const confTeams = Object.values(g.teams).filter((t) => t.conf === team.conf);
  const rows = useMemo(() => {
    const seasons = new Set<number>();
    for (const t of confTeams) for (const h of t.history) seasons.add(h.season);
    return [...seasons].sort((a, b) => b - a).slice(0, 8).map((s) => ({
      s,
      reg: confTeams.find((t) => t.history.some((h) => h.season === s && h.confChamp)),
      tour: confTeams.find((t) => t.history.some((h) => h.season === s && h.confTourneyChamp)),
    }));
  }, [g.season, team.conf]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows.length) return null;
  return (
    <Section title={`${g.conferences.find((c) => c.id === team.conf)?.short ?? ''} Champions`}>
      <table className="table">
        <thead><tr><th>Season</th><th>Regular Season</th><th>Tournament</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.s}>
              <td className="muted">{seasonLabel(r.s)}</td>
              <td>{r.reg ? <TeamName team={r.reg} showRank={false} logo={18} /> : '—'}</td>
              <td>{r.tour ? <TeamName team={r.tour} showRank={false} logo={18} /> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
