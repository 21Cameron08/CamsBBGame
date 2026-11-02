import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { PlayerFace, PersonFace, Empty, TeamLogo } from '../components/common';
import { resolveInbox } from '../../engine/season';
import { effectSummary } from '../../engine/coach';
import type { InboxItem } from '../../engine/types';
import { sfx } from '../sound';

export function InboxScreen() {
  const g = useGameState();
  const mutate = useGame((s) => s.mutate);
  const open = useGame((s) => s.open);
  const team = g.teams[g.user.teamId];
  const items = useMemo(() => {
    return [...g.inbox].sort((a, b) => {
      if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
      if (!!a.priority !== !!b.priority) return a.priority ? -1 : 1;
      if (a.season !== b.season) return b.season - a.season;
      return b.day - a.day;
    });
  }, [g.inbox, g.inbox.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selId, setSelId] = useState<string | null>(items[0]?.id ?? null);
  const [result, setResult] = useState<{ id: string; text: string; fx: string } | null>(null);
  const sel = items.find((i) => i.id === selId) ?? items[0];
  const unread = items.filter((i) => !i.resolved).length;

  const choose = (item: InboxItem, idx: number) => {
    let msg = '';
    mutate((gg) => { msg = resolveInbox(gg, item.id, idx); });
    sfx.click();
    setResult({ id: item.id, text: msg, fx: effectSummary(item.choices[idx].effects) });
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Head Coach's Office</div>
          <div className="h1">Inbox</div>
          <div className="muted" style={{ marginTop: 6 }}>{unread ? `${unread} decision${unread > 1 ? 's' : ''} waiting on you` : 'All caught up.'}</div>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="card"><Empty>No messages yet. Decisions will land here as the season unfolds.</Empty></div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(260px, 360px) 1fr', alignItems: 'start' }}>
          <div className="card flush" style={{ maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
            {items.map((it, i) => {
              const active = sel?.id === it.id;
              return (
                <motion.div key={it.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}
                  onClick={() => { setSelId(it.id); setResult(null); }}
                  style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)', cursor: 'pointer', position: 'relative', background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : undefined, opacity: it.resolved ? 0.6 : 1 }}>
                  {active && <motion.div layoutId="inbox-sel" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--accent)' }} />}
                  <div className="row" style={{ gap: 10 }}>
                    <Portrait item={it} size={38} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="row" style={{ gap: 6 }}>
                        {!it.resolved && <span className="dot" style={{ background: it.priority ? 'var(--bad)' : 'var(--accent)' }} />}
                        <span className={`small ellipsis ${it.resolved ? '' : 'b'}`}>{it.subject}</span>
                      </div>
                      <div className="tiny muted ellipsis">{it.from} · {it.fromRole}</div>
                    </div>
                    {it.priority && !it.resolved && <span className="pill bad" style={{ fontSize: 9 }}>URGENT</span>}
                  </div>
                </motion.div>
              );
            })}
          </div>
          <>
            {sel && (
              <motion.div key={sel.id} className="card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }} style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '22px 24px', background: `linear-gradient(135deg, ${team.colors[0]}44, transparent 70%)`, borderBottom: '1px solid var(--line)' }}>
                  <div className="row gap-l">
                    <Portrait item={sel} size={84} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="eyebrow">{sel.fromRole}</div>
                      <div className="b" style={{ fontSize: 16 }}>{sel.from}</div>
                      <div className="h2" style={{ marginTop: 6 }}>{sel.subject}</div>
                    </div>
                    {sel.personId && sel.personKind === 'player' && g.players[sel.personId] && (
                      <button className="btn sm" onClick={() => open({ kind: 'player', id: sel.personId! })}>View Player</button>
                    )}
                    <TeamLogo team={team} size={40} />
                  </div>
                </div>
                <div style={{ padding: 24 }}>
                  <div style={{ fontSize: 15, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{sel.body}</div>
                  <div className="divider" style={{ margin: '20px 0' }} />
                  {!sel.resolved ? (
                    <div className="col" style={{ gap: 10 }}>
                      <div className="eyebrow">Your decision</div>
                      {sel.choices.map((c, i) => (
                        <motion.button key={i} className="btn" whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}
                          style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '12px 16px', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}
                          onClick={() => choose(sel, i)}>
                          <span style={{ fontSize: 14 }}>{c.label}</span>
                          {(c.hint || c.effects.length > 0) && <span className="tiny muted" style={{ fontWeight: 500 }}>{c.hint ?? effectSummary(c.effects)}</span>}
                        </motion.button>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <div className="eyebrow" style={{ marginBottom: 8 }}>You chose</div>
                      <div className="pill accent" style={{ fontSize: 13, padding: '6px 12px' }}>✓ {sel.choices[sel.chosen ?? 0]?.label}</div>
                      <AnimatePresence>
                        {result && result.id === sel.id && (
                          <motion.div initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                            className="card glow" style={{ marginTop: 16, padding: 16 }}>
                            <div className="b" style={{ fontSize: 15 }}>{result.text}</div>
                            {result.fx && (
                              <div className="row wrap gap-s" style={{ marginTop: 10 }}>
                                {result.fx.split(' · ').map((f, i) => (
                                  <motion.span key={f} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.08 }}
                                    className={`pill ${/[+]/.test(f) ? 'good' : /-/.test(f) ? 'bad' : ''}`}>{f}</motion.span>
                                ))}
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                      {!(result && result.id === sel.id) && sel.choices[sel.chosen ?? 0]?.result && (
                        <div className="muted" style={{ marginTop: 12 }}>{sel.choices[sel.chosen ?? 0].result}</div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </>
        </div>
      )}
    </div>
  );
}

function Portrait({ item, size }: { item: InboxItem; size: number }) {
  const g = useGameState();
  const team = g.teams[g.user.teamId];
  if (item.personKind === 'player' && item.personId && g.players[item.personId]) {
    const p = g.players[item.personId];
    return <PlayerFace p={p} size={size} team={p.teamId ? g.teams[p.teamId] : team} />;
  }
  return <PersonFace seed={item.from} size={size} role="staff" colors={team.colors} />;
}
