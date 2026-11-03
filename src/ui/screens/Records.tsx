import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { Tabs, TeamLogo, Section, Empty } from '../components/common';
import { CATS, fmtRec, programTotals, recordBook, type RecCat } from '../../engine/records';
import { seasonLabel } from '../../engine/calendar';
import type { GameState, RecEntry, RecScope } from '../../engine/types';

type Level = 'league' | 'program';
type Kind = 'game' | 'season' | 'career';
const KIND_TEAM: Record<Kind, RecScope | null> = { game: 'teamGame', season: 'teamSeason', career: null };
const KIND_LABEL: Record<Kind, string> = { game: 'Single Game', season: 'Single Season', career: 'All-Time' };

function initialLevel(): Level {
  try {
    const v = sessionStorage.getItem('cd.recordsLevel');
    sessionStorage.removeItem('cd.recordsLevel');
    return v === 'program' ? 'program' : 'league';
  } catch { return 'league'; }
}

/** Open the record book on a given level (used by Program History) */
export function openRecords(level: Level) {
  try { sessionStorage.setItem('cd.recordsLevel', level); } catch { /* storage unavailable */ }
  useGame.getState().nav('records');
}

const shortSeason = (s: number) => `'${String(s % 100).padStart(2, '0')}-${String((s + 1) % 100).padStart(2, '0')}`;

export function RecordsScreen() {
  const g = useGameState();
  const rb = g.records ?? recordBook(g);
  const [level, setLevel] = useState<Level>(initialLevel);
  const [kind, setKind] = useState<Kind>('game');
  const [teamId, setTeamId] = useState(g.user.teamId);
  const teams = useMemo(() => Object.values(g.teams).sort((a, b) => a.school.localeCompare(b.school)), [g]);
  const tracked = rb.tracked.includes(teamId);
  const set = level === 'league' ? rb.league : rb.programs[teamId];
  const team = g.teams[teamId];
  const teamScope = KIND_TEAM[kind];
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Records since {seasonLabel(rb.since)} · the start of your dynasty</div>
          <h1 className="h1" style={{ marginTop: 6 }}>Record Book</h1>
        </div>
        <div className="spacer" />
        <Tabs id="rec-level" value={level} onChange={setLevel} tabs={[{ id: 'league', label: 'League Records' }, { id: 'program', label: 'Program Records' }]} />
      </div>
      <div className="row wrap" style={{ gap: 12, marginBottom: 16 }}>
        <Tabs id="rec-kind" value={kind} onChange={setKind} tabs={[{ id: 'game', label: 'Single Game' }, { id: 'season', label: 'Single Season' }, { id: 'career', label: 'All-Time' }]} />
        {level === 'program' && (
          <div className="row" style={{ gap: 8 }}>
            <TeamLogo team={team} size={28} />
            <select className="select" style={{ width: 230 }} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <optgroup label="Your programs">{rb.tracked.map((id) => g.teams[id]).filter(Boolean).map((t) => <option key={t.id} value={t.id}>{t.school}</option>)}</optgroup>
              <optgroup label="All programs">{teams.map((t) => <option key={t.id} value={t.id}>{t.school}</option>)}</optgroup>
            </select>
            {!tracked && <span className="tiny muted">Showing record holders. Full top-10 lists are kept for programs you've coached.</span>}
          </div>
        )}
      </div>

      <Section title={kind === 'career' ? 'Career Leaders' : `${KIND_LABEL[kind]} Player Records`}>
        <div className="grid rec-grid">
          {CATS[kind].map((cat, i) => (
            <RecordCard key={`${level}-${kind}-${teamId}-${cat.id}`} g={g} cat={cat} list={set?.[kind][cat.id] ?? []} league={level === 'league'} game={kind === 'game'} i={i} />
          ))}
        </div>
      </Section>

      <div style={{ height: 16 }} />
      {teamScope ? (
        <Section title={`${KIND_LABEL[kind]} Team Records`}>
          <div className="grid rec-grid">
            {CATS[teamScope].map((cat, i) => (
              <RecordCard key={`${level}-${teamScope}-${teamId}-${cat.id}`} g={g} cat={cat} list={set?.[teamScope][cat.id] ?? []} league={level === 'league'} game={kind === 'game'} team i={i} />
            ))}
          </div>
        </Section>
      ) : level === 'league' ? <LeagueAllTime g={g} /> : <ProgramAllTime g={g} teamId={teamId} />}
    </div>
  );
}

function RecordCard({ g, cat, list, league, game, team, i }: { g: GameState; cat: RecCat; list: RecEntry[]; league: boolean; game: boolean; team?: boolean; i: number }) {
  const open = useGame((s) => s.open);
  const uid = g.user.teamId;
  return (
    <motion.div className="card rec-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.4) }}>
      <div className="row" style={{ marginBottom: 8 }}>
        <div className="b" style={{ flex: 1 }}>{cat.label}</div>
        <span className="tiny muted upper b" style={{ letterSpacing: '.12em' }}>{cat.short}</span>
      </div>
      {list.length === 0 ? <div className="small muted" style={{ padding: '10px 0' }}>No record yet.</div> : (
        <div className="col" style={{ gap: 2 }}>
          {list.map((e, r) => {
            const tid = e.t ?? '';
            const t = league ? g.teams[tid] : undefined;
            const opp = e.o ? g.teams[e.o] : undefined;
            const exists = !!e.p && !!g.players[e.p];
            const mine = league ? tid === uid : false;
            const fresh = e.s === g.season;
            return (
              <div key={`${e.p ?? e.n}-${e.s}-${r}`} className={`rec-row ${r === 0 ? 'top' : ''} ${mine ? 'me' : ''}`} title={e.x}>
                <span className="rec-rank">{r + 1}</span>
                <span className="rec-val num">{fmtRec(cat, e.v)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={`small b ellipsis ${exists ? 'rec-link' : ''}`} onClick={() => exists && open({ kind: 'player', id: e.p! })}>{e.n}{fresh && <span className="pill good" style={{ fontSize: 9, marginLeft: 6 }}>NEW</span>}</div>
                  <div className="tiny muted ellipsis">
                    {t && <>{t.abbr} · </>}{shortSeason(e.s)}{game && opp ? ` · vs ${opp.abbr}` : ''}{e.x && game ? ` · ${e.x}` : ''}
                  </div>
                </div>
                {t && <TeamLogo team={t} size={20} />}
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

function LeagueAllTime({ g }: { g: GameState }) {
  const open = useGame((s) => s.open);
  const totals = useMemo(() => Object.values(g.teams).map((t) => programTotals(g, t)), [g]);
  const boards: { label: string; get: (x: ReturnType<typeof programTotals>) => number; fmt?: (x: ReturnType<typeof programTotals>) => string }[] = [
    { label: 'National Championships', get: (x) => x.titles },
    { label: 'Final Fours', get: (x) => x.f4 },
    { label: 'Sweet 16s', get: (x) => x.s16 },
    { label: 'NCAA Tournament Appearances', get: (x) => x.ncaa },
    { label: 'Conference Titles', get: (x) => x.confTitles },
    { label: 'Wins', get: (x) => x.w, fmt: (x) => `${x.w}-${x.l}` },
  ];
  return (
    <Section title="All-Time Program Records">
      <div className="grid rec-grid">
        {boards.map((b, i) => {
          const rows = totals.filter((x) => b.get(x) > 0).sort((a, c) => b.get(c) - b.get(a) || c.w - a.w).slice(0, 10);
          return (
            <motion.div key={b.label} className="card rec-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <div className="b" style={{ marginBottom: 8 }}>{b.label}</div>
              {rows.length === 0 ? <div className="small muted">No seasons completed yet.</div> : rows.map((x, r) => {
                const t = g.teams[x.teamId];
                return (
                  <div key={x.teamId} className={`rec-row ${r === 0 ? 'top' : ''} ${x.teamId === g.user.teamId ? 'me' : ''}`} style={{ cursor: 'pointer' }} onClick={() => open({ kind: 'team', id: x.teamId })}>
                    <span className="rec-rank">{r + 1}</span>
                    <span className="rec-val num">{b.fmt ? b.fmt(x) : b.get(x)}</span>
                    <span className="small b ellipsis" style={{ flex: 1 }}>{t.school}</span>
                    <TeamLogo team={t} size={20} />
                  </div>
                );
              })}
            </motion.div>
          );
        })}
      </div>
    </Section>
  );
}

function ProgramAllTime({ g, teamId }: { g: GameState; teamId: string }) {
  const t = g.teams[teamId];
  const x = programTotals(g, t);
  if (!x.seasons) return <Section title="All-Time Program Records"><Empty>No completed seasons yet. Program totals start after your first season.</Empty></Section>;
  const tiles: [string, string][] = [
    ['Record', `${x.w}-${x.l}`],
    ['Win %', (x.w / Math.max(1, x.w + x.l)).toFixed(3).replace(/^0/, '')],
    ['NCAA Appearances', String(x.ncaa)],
    ['Sweet 16s', String(x.s16)],
    ['Final Fours', String(x.f4)],
    ['National Titles', String(x.titles)],
    ['Conference Titles', String(x.confTitles)],
    ['Best Season', x.bestSeason != null ? `${x.bestW} wins · ${shortSeason(x.bestSeason)}` : '—'],
  ];
  return (
    <Section title={`${t.school} All-Time · ${x.seasons} season${x.seasons === 1 ? '' : 's'}`}>
      <div className="grid g4">
        {tiles.map(([l, v]) => <div key={l} className="stat-tile"><div className="l">{l}</div><div className="v" style={{ fontSize: v.length > 8 ? 20 : 30 }}>{v}</div></div>)}
      </div>
    </Section>
  );
}
