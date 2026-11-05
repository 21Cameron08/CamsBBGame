// Cloud saves panel: your private cloud code, upload the current dynasty, and load or delete
// dynasties stored online. Used in Settings → Saves and on the title screen.
import { useEffect, useState } from 'react';
import { useGame } from '../../store/gameStore';
import { TeamLogo } from './common';
import type { GameState } from '../../engine/types';
import { validateSave } from '../../store/persistence';
import { cloudCode, deleteCloud, downloadCloud, listCloud, setCloudCode, uploadCloud, type CloudMeta } from '../../store/cloud';

export function CloudSaves({ current }: { current?: GameState | null }) {
  const { save, loadState, toast } = useGame.getState();
  const [code, setCode] = useState(() => cloudCode());
  const [list, setList] = useState<CloudMeta[] | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [linking, setLinking] = useState(false);
  const [entry, setEntry] = useState('');

  const refresh = async (c = code) => {
    setErr('');
    try { setList(await listCloud(c)); } catch (e) { setErr((e as Error).message); setList([]); }
  };
  useEffect(() => { void refresh(); }, [code]);

  const upload = async () => {
    if (!current) return;
    setBusy('upload'); setErr('');
    try {
      await save();
      const size = await uploadCloud(current, code);
      toast(`Uploaded to the cloud (${(size / 1048576).toFixed(1)} MB).`, 'good');
      await refresh();
    } catch (e) { setErr((e as Error).message); }
    setBusy('');
  };
  const load = async (m: CloudMeta) => {
    if (current && !confirm(`Load "${m.name}" from the cloud? This dynasty will be saved first.`)) return;
    setBusy(m.id); setErr('');
    try {
      const g = await downloadCloud(m.id, code);
      if (!validateSave(g)) throw new Error('That cloud save looks damaged.');
      if (current) await save();
      await loadState(g);
      toast(`Loaded ${m.name} from the cloud.`, 'good');
    } catch (e) { setErr((e as Error).message); }
    setBusy('');
  };
  const remove = async (m: CloudMeta) => {
    if (!confirm(`Delete "${m.name}" from the cloud? Saves on this device aren't affected.`)) return;
    setBusy(m.id);
    try { await deleteCloud(m.id, code); await refresh(); } catch (e) { setErr((e as Error).message); }
    setBusy('');
  };
  const link = () => {
    if (!setCloudCode(entry)) { setErr('Cloud codes are 8 to 16 letters and numbers.'); return; }
    setCode(cloudCode()); setLinking(false); setEntry('');
    toast('Linked. Showing the saves for that code.', 'good');
  };
  const copy = async () => { try { await navigator.clipboard.writeText(code); toast('Cloud code copied.', 'good'); } catch { /* ignore */ } };

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span className="tiny muted">Your cloud code</span>
        <span className="num" style={{ fontSize: 18, letterSpacing: '.12em' }}>{code}</span>
        <button className="btn sm ghost" onClick={() => void copy()}>Copy</button>
        <button className="btn sm ghost" onClick={() => setLinking(!linking)}>Use a code from another device</button>
      </div>
      {linking && (
        <div className="row" style={{ gap: 8 }}>
          <input className="input" style={{ maxWidth: 220, textTransform: 'uppercase' }} placeholder="Enter cloud code" value={entry} onChange={(e) => setEntry(e.target.value)} />
          <button className="btn sm primary" onClick={link}>Link</button>
        </div>
      )}
      <div className="tiny muted">Keep this code private: anyone with it can load or delete your cloud saves. Enter it on another device to pick up where you left off.</div>
      {current && <div><button className="btn primary" disabled={!!busy} onClick={() => void upload()}>{busy === 'upload' ? 'Uploading…' : '☁️ Upload this dynasty'}</button></div>}
      {err && <div className="small bad">{err}</div>}
      {list === null ? <div className="tiny muted">Checking the cloud…</div> : !list.length ? <div className="tiny muted">No cloud saves for this code yet.</div> : list.map((m) => (
        <div key={m.id} className="row" style={{ gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
          <TeamLogo team={{ id: m.teamId, abbr: m.school.slice(0, 4).toUpperCase(), colors: m.colors }} size={30} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="b ellipsis">{m.name}{current?.saveId === m.id && <span className="pill accent" style={{ marginLeft: 6, fontSize: 9 }}>THIS DYNASTY</span>}</div>
            <div className="tiny muted">{m.school} · {m.season} · {m.record} · uploaded {new Date(m.updatedAt).toLocaleString()} · {(m.size / 1048576).toFixed(1)} MB</div>
          </div>
          <button className="btn sm" disabled={!!busy} onClick={() => void load(m)}>{busy === m.id ? '…' : 'Load'}</button>
          <button className="btn sm ghost" disabled={!!busy} onClick={() => void remove(m)}>🗑</button>
        </div>
      ))}
    </div>
  );
}
