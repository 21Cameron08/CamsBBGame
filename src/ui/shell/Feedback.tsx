import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '../../store/gameStore';

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="toasts">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} className={`toast ${t.kind}`} initial={{ opacity: 0, x: 40, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 40 }} layout>
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function Ball({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <defs><radialGradient id="ballg" cx="35%" cy="30%"><stop offset="0" stopColor="#ffb36b" /><stop offset="1" stopColor="#d55f12" /></radialGradient></defs>
      <circle cx="50" cy="50" r="46" fill="url(#ballg)" />
      <path d="M4 50h92M50 4v92M18 18c18 18 18 46 0 64M82 18c-18 18-18 46 0 64" stroke="#2a1405" strokeWidth="3.5" fill="none" opacity=".8" />
    </svg>
  );
}

export function BusyOverlay() {
  const busy = useGame((s) => s.busy);
  return (
    <>
      {busy && (
        <motion.div className="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
          <div className="card busy-card">
            <div className="ball-spin"><Ball /></div>
            <div className="h3" style={{ marginBottom: 12 }}>{busy.label}</div>
            <div className="bar"><i style={{ width: `${Math.round(busy.progress * 100)}%` }} /></div>
          </div>
        </motion.div>
      )}
    </>
  );
}
