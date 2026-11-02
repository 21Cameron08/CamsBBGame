import { useMemo } from 'react';
import { useGame } from '../../store/gameStore';

export function Ticker() {
  const g = useGame((s) => s.game)!;
  const tick = useGame((s) => s.tick);
  const items = useMemo(() => {
    const out: { key: string; node: JSX.Element }[] = [];
    const lastDay = Math.max(0, ...g.schedule.filter((x) => x.played).map((x) => x.day));
    const games = g.schedule.filter((x) => x.played && x.day === lastDay)
      .sort((a, b) => (Math.min(g.teams[a.home].apRank ?? 99, g.teams[a.away].apRank ?? 99)) - Math.min(g.teams[b.home].apRank ?? 99, g.teams[b.away].apRank ?? 99))
      .slice(0, 24);
    for (const x of games) {
      const h = g.teams[x.home], a = g.teams[x.away];
      const hw = (x.hs ?? 0) > (x.as ?? 0);
      out.push({
        key: x.id,
        node: (
          <span className="ticker-item">
            <span style={{ color: hw ? 'var(--muted)' : 'var(--text)', fontWeight: hw ? 500 : 800 }}>{a.apRank ? <span className="rank">{a.apRank}</span> : null}{a.abbr} {x.as}</span>
            <span className="dim">@</span>
            <span style={{ color: hw ? 'var(--text)' : 'var(--muted)', fontWeight: hw ? 800 : 500 }}>{h.apRank ? <span className="rank">{h.apRank}</span> : null}{h.abbr} {x.hs}</span>
            <span className="dim tiny">FINAL{x.ot ? `/${x.ot > 1 ? x.ot : ''}OT` : ''}</span>
          </span>
        ),
      });
    }
    for (const n of g.news.slice(0, 8)) out.push({ key: n.id, node: <span className="ticker-item"><b>●</b> {n.headline}</span> });
    return out;
  }, [g, tick]);
  if (!items.length) return <div className="ticker"><div className="ticker-label">Courtside</div><span className="muted small" style={{ paddingLeft: 16 }}>The season is about to tip off…</span></div>;
  return (
    <div className="ticker">
      <div className="ticker-label">Scores</div>
      <div style={{ overflow: 'hidden', flex: 1 }}>
        <div className="ticker-track">
          {items.map((i) => <span key={i.key}>{i.node}</span>)}
          {items.map((i) => <span key={i.key + '-2'}>{i.node}</span>)}
        </div>
      </div>
    </div>
  );
}
