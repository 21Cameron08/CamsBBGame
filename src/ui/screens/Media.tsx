import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { TeamLogo, PlayerFace, CoachFace, PersonFace, AnimatedNumber, Section, Empty } from '../components/common';
import type { GameState, NewsItem, SocialPost } from '../../engine/types';

const KIND_META: Record<NewsItem['kind'], { label: string; icon: string; color: string }> = {
  recap: { label: 'Recaps', icon: '🏀', color: '#4da3ff' },
  upset: { label: 'Upsets', icon: '⚡', color: '#ff5d5d' },
  rank: { label: 'Polls', icon: '📊', color: '#f6c94c' },
  recruit: { label: 'Recruiting', icon: '🎯', color: '#22d38f' },
  portal: { label: 'Portal', icon: '🔁', color: '#b388ff' },
  coach: { label: 'Coaching', icon: '🧢', color: '#f5a524' },
  injury: { label: 'Injuries', icon: '🩹', color: '#ff8a80' },
  award: { label: 'Awards', icon: '🏅', color: '#f6c94c' },
  draft: { label: 'Draft', icon: '🎟️', color: '#80deea' },
  nil: { label: 'NIL', icon: '💰', color: '#22d38f' },
  feature: { label: 'Features', icon: '📰', color: '#e9eef7' },
  bracket: { label: 'Bracket', icon: '🗂️', color: '#ff9f43' },
  milestone: { label: 'Milestones', icon: '🔥', color: '#ff7043' },
  user: { label: 'Your Program', icon: '⭐', color: 'var(--accent)' },
};

const CSS = `
.md-chip { border: 1px solid var(--line); background: rgba(255,255,255,.04); color: var(--muted); padding: 5px 11px; border-radius: 999px; font-size: 12px; font-weight: 700; cursor: pointer; transition: all .15s; }
.md-chip:hover { color: var(--text); border-color: var(--line-2); }
.md-chip.on { background: var(--accent); color: var(--accent-ink); border-color: transparent; }
.md-news { display: grid; grid-template-columns: 48px 1fr; gap: 12px; padding: 13px 0; border-bottom: 1px solid var(--line); }
.md-news:last-child { border-bottom: 0; }
.md-post { padding: 13px 16px; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 42px 1fr; gap: 11px; transition: background .15s; }
.md-post:hover { background: rgba(255,255,255,.025); }
.md-act { display: inline-flex; align-items: center; gap: 5px; color: var(--muted); font-size: 12px; cursor: pointer; user-select: none; }
.md-act:hover { color: var(--text); }
.md-act.liked { color: #ff5c8a; }
`;

function NewsAvatar({ g, n, size = 44 }: { g: GameState; n: NewsItem; size?: number }) {
  const team = n.teams[0] ? g.teams[n.teams[0]] : undefined;
  if (n.personId) {
    if (n.personKind === 'coach') {
      const c = g.coaches[n.personId];
      if (c) return <CoachFace c={c} size={size} team={c.teamId ? g.teams[c.teamId] : team} />;
    } else {
      const p = g.players[n.personId] ?? g.recruits[n.personId];
      if (p) {
        const pt = 'teamId' in p && p.teamId ? g.teams[p.teamId] : team;
        return <PlayerFace p={p} size={size} team={pt} />;
      }
    }
  }
  if (team) return <TeamLogo team={team} size={size} />;
  const m = KIND_META[n.kind];
  return <div style={{ width: size, height: size, borderRadius: size / 2, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.06)', fontSize: size * 0.45 }}>{m.icon}</div>;
}

export function MediaScreen() {
  const g = useGameState();
  return (
    <div>
      <style>{CSS}</style>
      <div className="page-head">
        <div>
          <div className="eyebrow">Around College Hoops</div>
          <h1 className="h1">Media & Social</h1>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <NewsFeed g={g} />
        <SocialFeed g={g} />
      </div>
    </div>
  );
}

function NewsFeed({ g }: { g: GameState }) {
  const open = useGame((s) => s.open);
  const [kind, setKind] = useState<'all' | 'mine' | NewsItem['kind']>('all');
  const [limit, setLimit] = useState(40);
  const kinds = useMemo(() => {
    const set = new Set(g.news.map((n) => n.kind));
    return (Object.keys(KIND_META) as NewsItem['kind'][]).filter((k) => set.has(k));
  }, [g.news, g.news.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => g.news.filter((n) => kind === 'all' || (kind === 'mine' ? n.teams.includes(g.user.teamId) : n.kind === kind)), [g.news, g.news.length, kind, g.user.teamId]); // eslint-disable-line react-hooks/exhaustive-deps
  const featured = list.find((n) => n.important) ?? list[0];
  const rest = list.filter((n) => n !== featured).slice(0, limit);
  const ft = featured?.teams[0] ? g.teams[featured.teams[0]] : undefined;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row wrap gap-s">
        <button className={`md-chip ${kind === 'all' ? 'on' : ''}`} onClick={() => setKind('all')}>All</button>
        <button className={`md-chip ${kind === 'mine' ? 'on' : ''}`} onClick={() => setKind('mine')}>⭐ My Program</button>
        {kinds.map((k) => <button key={k} className={`md-chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{KIND_META[k].icon} {KIND_META[k].label}</button>)}
      </div>
      {!featured && <Section><Empty>No news yet.</Empty></Section>}
      {featured && (
        <>
          <motion.div key={featured.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '22px 22px 18px', position: 'relative', background: ft ? `linear-gradient(125deg, ${ft.colors[0]}, ${ft.colors[0]}44 60%, transparent)` : 'linear-gradient(125deg, #1b2740, transparent)' }}>
              <div style={{ position: 'absolute', right: 18, top: 16, opacity: 0.25 }}>{ft && <TeamLogo team={ft} size={110} />}</div>
              <div className="row" style={{ gap: 8, marginBottom: 10 }}>
                <span className="pill" style={{ background: 'rgba(0,0,0,.35)' }}>{KIND_META[featured.kind].icon} {KIND_META[featured.kind].label}</span>
                {featured.important && <span className="pill gold">TOP STORY</span>}
                <span className="tiny" style={{ opacity: 0.8 }}>{featured.date}</span>
              </div>
              <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
                <NewsAvatar g={g} n={featured} size={84} />
                <div style={{ minWidth: 0, maxWidth: 560 }}>
                  <div className="h2" style={{ fontSize: 28, lineHeight: 1.05 }}>{featured.headline}</div>
                  <div style={{ marginTop: 10, opacity: 0.92, lineHeight: 1.55 }}>{featured.body}</div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
      {rest.length > 0 && (
        <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
          {rest.map((n, i) => (
            <motion.div key={n.id} className="md-news" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.025 }}>
              <div style={{ cursor: n.personId ? 'pointer' : undefined }} onClick={() => {
                if (n.personId && n.personKind === 'player' && g.players[n.personId]) open({ kind: 'player', id: n.personId });
                else if (n.personId && n.personKind === 'recruit' && g.recruits[n.personId]) open({ kind: 'recruit', id: n.personId });
                else if (n.teams[0]) open({ kind: 'team', id: n.teams[0] });
              }}><NewsAvatar g={g} n={n} /></div>
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 7, marginBottom: 3 }}>
                  <span className="tiny b" style={{ color: KIND_META[n.kind].color }}>{KIND_META[n.kind].icon} {KIND_META[n.kind].label.toUpperCase()}</span>
                  <span className="tiny dim">{n.date}</span>
                  {n.teams.includes(g.user.teamId) && <span className="pill accent" style={{ fontSize: 10, padding: '0 7px' }}>YOU</span>}
                </div>
                <div className="b" style={{ fontSize: 14.5, lineHeight: 1.3 }}>{n.headline}</div>
                <div className="small muted" style={{ marginTop: 3, lineHeight: 1.5 }}>{n.body}</div>
              </div>
            </motion.div>
          ))}
          {list.length - 1 > limit && (
            <div style={{ padding: 12, textAlign: 'center' }}>
              <button className="btn sm" onClick={() => setLimit((l) => l + 40)}>Load more</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function fmtCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}

function PostAvatar({ g, p }: { g: GameState; p: SocialPost }) {
  const team = p.teamId ? g.teams[p.teamId] : undefined;
  if (p.personId) {
    const pl = g.players[p.personId] ?? g.recruits[p.personId];
    if (pl && (p.kind === 'player' || p.kind === 'recruit')) {
      const pt = 'teamId' in pl && pl.teamId ? g.teams[pl.teamId] : team;
      return <PlayerFace p={pl} size={42} team={pt} />;
    }
  }
  if (p.kind === 'school' && team) return <TeamLogo team={team} size={42} />;
  const colors: [string, string] | undefined = (p.kind === 'fan' || p.kind === 'hater') && team ? team.colors : undefined;
  return <PersonFace seed={p.handle} size={42} role={p.kind === 'analyst' ? 'coach' : 'staff'} colors={colors} />;
}

function SocialFeed({ g }: { g: GameState }) {
  const [filter, setFilter] = useState<'all' | 'mine' | 'insider'>('all');
  const [limit, setLimit] = useState(40);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [reposted, setReposted] = useState<Record<string, boolean>>({});
  const list = useMemo(() => g.social.filter((p) => filter === 'all' || (filter === 'mine' ? p.teamId === g.user.teamId : p.kind === 'insider' || p.kind === 'analyst')), [g.social, g.social.length, filter, g.user.teamId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="card flush" style={{ position: 'sticky', top: 0 }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)', background: 'linear-gradient(180deg, rgba(255,255,255,.04), transparent)' }}>
        <div className="row">
          <div style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #ff5c8a, #f07a24)', fontWeight: 900, fontFamily: 'var(--font-display)', fontSize: 18 }}>C</div>
          <div>
            <div className="b" style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '.04em', lineHeight: 1 }}>COURTSIDE</div>
            <div className="tiny muted">What the hoops world is saying</div>
          </div>
          <div className="spacer" />
          <span className="dot pulse" style={{ background: '#ff5c8a' }} /><span className="tiny b" style={{ color: '#ff5c8a' }}>LIVE</span>
        </div>
        <div className="row gap-s" style={{ marginTop: 12 }}>
          {([['all', 'For You'], ['mine', 'Your Fans'], ['insider', 'Insiders']] as const).map(([k, l]) => (
            <button key={k} className={`md-chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ maxHeight: 'calc(100vh - 290px)', overflowY: 'auto' }}>
        {list.length === 0 && <Empty>Quiet on the timeline… for now.</Empty>}
        {list.slice(0, limit).map((p, i) => {
          const team = p.teamId ? g.teams[p.teamId] : undefined;
          const like = liked[p.id], rp = reposted[p.id];
          return (
            <motion.div key={p.id} className="md-post" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
              <PostAvatar g={g} p={p} />
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
                  <span className="b small">{p.name}</span>
                  {p.verified && <span title="Verified" style={{ display: 'inline-grid', placeItems: 'center', width: 15, height: 15, borderRadius: 8, background: '#4da3ff', color: '#fff', fontSize: 9, fontWeight: 900 }}>✓</span>}
                  <span className="tiny dim">@{p.handle}</span>
                  <span className="tiny dim">· {g.calendar[p.day]?.label.split(' · ')[0] ?? ''}</span>
                  {team && <span style={{ marginLeft: 'auto' }}><TeamLogo team={team} size={16} /></span>}
                </div>
                <div style={{ marginTop: 3, fontSize: 13.5, lineHeight: 1.45, wordBreak: 'break-word' }}>{p.text}</div>
                <div className="row" style={{ gap: 22, marginTop: 8 }}>
                  <span className="md-act">💬 <span>{fmtCount(Math.round(p.likes * 0.06))}</span></span>
                  <span className={`md-act ${rp ? 'liked' : ''}`} style={rp ? { color: '#22d38f' } : undefined} onClick={() => setReposted((s) => ({ ...s, [p.id]: !s[p.id] }))}>
                    🔁 <AnimatedNumber value={p.reposts + (rp ? 1 : 0)} format={fmtCount} duration={0.4} />
                  </span>
                  <motion.span whileTap={{ scale: 1.4 }} className={`md-act ${like ? 'liked' : ''}`} onClick={() => setLiked((s) => ({ ...s, [p.id]: !s[p.id] }))}>
                    {like ? '❤️' : '🤍'} <AnimatedNumber value={p.likes + (like ? 1 : 0)} format={fmtCount} duration={0.4} />
                  </motion.span>
                </div>
              </div>
            </motion.div>
          );
        })}
        {list.length > limit && (
          <div style={{ padding: 12, textAlign: 'center' }}>
            <button className="btn sm" onClick={() => setLimit((l) => l + 40)}>Load more</button>
          </div>
        )}
      </div>
    </div>
  );
}
