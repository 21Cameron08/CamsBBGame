import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useGame, useGameState } from '../../store/gameStore';
import { Section, TeamLogo, PlayerFace, Tabs, GeneratedBadge } from '../components/common';
import { downloadJson, readJsonFile, validateSave, getTeamMods, setTeamMods, type TeamMods } from '../../store/persistence';
import { saveUploadedLogo, removeUploadedLogo, uploadedLogoIds, fileToDataUrl, LOGO_DIR, onLogosChanged } from '../logos';
import { TEAMS } from '../../data/teams';
import type { GameState, Team } from '../../engine/types';
import { teamAccent } from '../color';

type Tab = 'saves' | 'prefs' | 'logos' | 'editor';

export function SettingsScreen() {
  const [tab, setTab] = useState<Tab>('saves');
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Front Office</div>
          <div className="h1">Settings & Mods</div>
          <div className="muted" style={{ marginTop: 6 }}>Saves, preferences, custom logos and team edits.</div>
        </div>
        <div className="spacer" />
        <Tabs id="settings" value={tab} onChange={setTab} tabs={[
          { id: 'saves', label: '💾 Saves' }, { id: 'prefs', label: '🎛️ Preferences' }, { id: 'logos', label: '🖼️ Logos & Files' }, { id: 'editor', label: '🎨 Team Editor' },
        ]} />
      </div>
      {tab === 'saves' && <Saves />}
      {tab === 'prefs' && <Prefs />}
      {tab === 'logos' && <Logos />}
      {tab === 'editor' && <TeamEditor />}
    </div>
  );
}

// ---------------- Saves ----------------
function Saves() {
  const g = useGameState();
  const { mutate, save, quit, loadState, toast, saves, load, deleteSave } = useGame();
  const [name, setName] = useState(g.saveName);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="grid g2">
      <Section title="Current Dynasty">
        <label className="field">Save name
          <div className="row">
            <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            <button className="btn" disabled={!name.trim() || name === g.saveName} onClick={() => { mutate((gg) => { gg.saveName = name.trim(); }); toast('Renamed.', 'good'); }}>Rename</button>
          </div>
        </label>
        <div className="row wrap mt">
          <button className="btn primary" onClick={async () => { await save(); toast('Dynasty saved.', 'good'); }}>💾 Save Now</button>
          <button className="btn" onClick={() => { downloadJson(`${g.saveName.replace(/[^\w\- ]+/g, '').trim() || 'dynasty'}.json`, g); toast('Save exported.', 'good'); }}>⬇️ Export Save File</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>⬆️ Import Save File</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const data = await readJsonFile<GameState>(f);
              if (!validateSave(data)) throw new Error('invalid');
              if (!confirm(`Load "${data.saveName}"? Unsaved progress in this dynasty will be autosaved first.`)) return;
              await save();
              await loadState(data);
              toast(`Loaded ${data.saveName}.`, 'good');
            } catch { toast('That file is not a valid Courtside Dynasty save.', 'bad'); }
          }} />
        </div>
        <div className="divider" />
        <div className="tiny muted">Saves live in your browser (IndexedDB) and autosave after every sim. Export a file to back up or move a dynasty between devices.</div>
        <button className="btn danger mt" onClick={() => { if (confirm('Save and quit to the title screen?')) quit(); }}>⏏ Quit to Title</button>
      </Section>
      <Section title="All Saves">
        {saves.length === 0 ? <div className="muted small">No saves yet.</div> : saves.map((s) => (
          <div key={s.id} className="row" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <TeamLogo team={{ id: s.teamId, abbr: s.school.slice(0, 4).toUpperCase(), colors: s.colors }} size={30} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="b ellipsis">{s.name}{s.id === g.saveId && <span className="pill accent" style={{ marginLeft: 6, fontSize: 9 }}>CURRENT</span>}</div>
              <div className="tiny muted">{s.school} · {s.season} · {s.record} · {new Date(s.updatedAt).toLocaleString()}</div>
            </div>
            {s.id !== g.saveId && <button className="btn sm" onClick={async () => { await save(); await load(s.id); }}>Load</button>}
            {s.id !== g.saveId && <button className="btn sm ghost" onClick={() => { if (confirm(`Delete "${s.name}"?`)) void deleteSave(s.id); }}>🗑</button>}
          </div>
        ))}
      </Section>
    </div>
  );
}

// ---------------- Preferences ----------------
function Toggle({ on, onChange, label, desc }: { on: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <div className="row" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)', cursor: 'pointer' }} onClick={() => onChange(!on)}>
      <div style={{ flex: 1 }}>
        <div className="b">{label}</div>
        {desc && <div className="tiny muted">{desc}</div>}
      </div>
      <div style={{ width: 46, height: 26, borderRadius: 13, background: on ? 'var(--accent)' : 'rgba(255,255,255,.12)', position: 'relative', transition: 'background .2s' }}>
        <motion.div layout transition={{ type: 'spring', stiffness: 600, damping: 32 }} style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: 10, background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,.4)' }} />
      </div>
    </div>
  );
}

function Prefs() {
  const g = useGameState();
  const prefs = useGame((s) => s.prefs);
  const setPrefs = useGame((s) => s.setPrefs);
  const mutate = useGame((s) => s.mutate);
  return (
    <div className="grid g2">
      <Section title="Gameplay">
        <Toggle on={g.settings.autoPress} onChange={(v) => mutate((gg) => { gg.settings.autoPress = v; })} label="Press conference after every game" desc="Off: pressers trigger after big wins, bad losses, rivalries, streaks and tournament games." />
        <div className="row" style={{ padding: '12px 0' }}>
          <div style={{ flex: 1 }}><div className="b">Difficulty</div><div className="tiny muted">Set when the dynasty was created.</div></div>
          <span className="pill accent upper">{g.settings.difficulty}</span>
        </div>
      </Section>
      <Section title="Audio & Visual">
        <Toggle on={prefs.sound} onChange={(v) => setPrefs({ sound: v })} label="Sound effects" desc="Synthesized swishes, buzzers, crowd roars and camera flashes." />
        <Toggle on={prefs.reduceMotion} onChange={(v) => setPrefs({ reduceMotion: v })} label="Reduce motion" desc="Tones down celebratory animations." />
      </Section>
    </div>
  );
}

// ---------------- Logos ----------------
function useLogoVersion() {
  const [v, setV] = useState(0);
  useEffect(() => onLogosChanged(() => setV((x) => x + 1)) as () => void, []);
  return v;
}

function Logos() {
  const g = useGameState();
  const toast = useGame((s) => s.toast);
  const [q, setQ] = useState('');
  const [onlyCustom, setOnlyCustom] = useState(false);
  const v = useLogoVersion();
  const uploaded = useMemo(() => new Set(uploadedLogoIds()), [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const teams = useMemo(() => Object.values(g.teams)
    .filter((t) => (!q || `${t.school} ${t.mascot} ${t.id}`.toLowerCase().includes(q.toLowerCase())) && (!onlyCustom || uploaded.has(t.id)))
    .sort((a, b) => a.school.localeCompare(b.school)), [g.teams, q, onlyCustom, uploaded]);
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef<string>('');
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid g2">
        <Section title="Drop-in Logo Files">
          <div className="small" style={{ lineHeight: 1.7 }}>
            Put image files in <code className="kbd">public/assets/logos/</code> named by team id:
            <div style={{ margin: '8px 0', padding: 10, borderRadius: 8, background: 'rgba(0,0,0,.35)', fontFamily: 'monospace', fontSize: 12 }}>
              public/assets/logos/duke.svg<br />public/assets/logos/north-carolina.png<br />public/assets/logos/texas-am.webp
            </div>
            Supported: <b>.svg</b>, <b>.png</b>, <b>.webp</b>. Optionally add <code className="kbd">manifest.json</code> (an array of filenames) to skip probing for missing files. Currently served from <code className="kbd">{LOGO_DIR}</code>.
          </div>
        </Section>
        <Section title="Custom Team Data Files">
          <div className="small" style={{ lineHeight: 1.7 }}>
            Override names, colors, prestige and more for new dynasties with <code className="kbd">public/mods/teams.json</code>:
            <div style={{ margin: '8px 0', padding: 10, borderRadius: 8, background: 'rgba(0,0,0,.35)', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre' }}>{`{
  "duke": { "mascot": "Devils", "colors": ["#001A57", "#FFFFFF"] },
  "indiana": { "prestige": 95 }
}`}</div>
            Or use the <b>Team Editor</b> tab, which saves mods in your browser and can export/import the same JSON format.
          </div>
        </Section>
      </div>
      <Section title={`Upload Logos (${uploaded.size} custom)`} right={
        <div className="row">
          <label className="row small muted" style={{ gap: 6, cursor: 'pointer' }}><input type="checkbox" checked={onlyCustom} onChange={(e) => setOnlyCustom(e.target.checked)} /> Custom only</label>
          <input className="input" style={{ width: 240 }} placeholder="Search teams…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      }>
        <input ref={fileRef} type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f || !target.current) return;
          try {
            const url = await fileToDataUrl(f, 256);
            await saveUploadedLogo(target.current, url);
            toast(`Logo saved for ${g.teams[target.current]?.school}.`, 'good');
          } catch { toast('Could not read that image.', 'bad'); }
        }} />
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
          {teams.slice(0, 240).map((t) => (
            <div key={t.id} className="card" style={{ padding: 10 }}>
              <div className="row">
                <TeamLogo team={t} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="b small ellipsis">{t.school}</div>
                  <div className="tiny dim ellipsis" style={{ fontFamily: 'monospace' }}>{t.id}</div>
                </div>
              </div>
              <div className="row mt" style={{ gap: 6 }}>
                <button className="btn sm" style={{ flex: 1 }} onClick={() => { target.current = t.id; fileRef.current?.click(); }}>Upload</button>
                {uploaded.has(t.id) && <button className="btn sm ghost" onClick={async () => { await removeUploadedLogo(t.id); toast('Custom logo removed.'); }}>Remove</button>}
              </div>
            </div>
          ))}
        </div>
        {teams.length > 240 && <div className="tiny muted mt">Showing 240 of {teams.length} — search to narrow down.</div>}
      </Section>
    </div>
  );
}

// ---------------- Team editor ----------------
function TeamEditor() {
  const g = useGameState();
  const mutate = useGame((s) => s.mutate);
  const toast = useGame((s) => s.toast);
  const [teamId, setTeamId] = useState(g.user.teamId);
  const team = g.teams[teamId];
  const [school, setSchool] = useState(team.school);
  const [mascot, setMascot] = useState(team.mascot);
  const [abbr, setAbbr] = useState(team.abbr);
  const [c1, setC1] = useState(team.colors[0]);
  const [c2, setC2] = useState(team.colors[1]);
  const [mods, setMods] = useState<TeamMods>({});
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { void getTeamMods().then(setMods); }, []);
  useEffect(() => {
    const t = g.teams[teamId];
    setSchool(t.school); setMascot(t.mascot); setAbbr(t.abbr); setC1(t.colors[0]); setC2(t.colors[1]);
  }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview: Pick<Team, 'id' | 'abbr' | 'colors'> = { id: teamId, abbr: abbr || team.abbr, colors: [c1, c2] };
  const samplePlayer = g.players[team.roster[0]];
  const def = TEAMS.find((t) => t.id === teamId);
  const sorted = useMemo(() => Object.values(g.teams).sort((a, b) => a.school.localeCompare(b.school)), [g.teams]);
  const valid = school.trim() && mascot.trim() && abbr.trim();

  const apply = () => {
    mutate((gg) => {
      const t = gg.teams[teamId];
      t.school = school.trim(); t.mascot = mascot.trim(); t.abbr = abbr.trim().toUpperCase().slice(0, 5); t.colors = [c1, c2];
    });
    toast(`${school} updated in this dynasty.`, 'good');
  };
  const saveMod = async () => {
    const next: TeamMods = { ...mods, [teamId]: { ...(mods[teamId] ?? {}), school: school.trim(), mascot: mascot.trim(), abbr: abbr.trim().toUpperCase().slice(0, 5), colors: [c1, c2] } };
    await setTeamMods(next);
    setMods(next);
    toast('Saved as a mod for future dynasties.', 'good');
  };
  const resetDefaults = () => {
    if (!def) return;
    setSchool(def.school); setMascot(def.mascot); setAbbr(def.abbr); setC1(def.colors[0]); setC2(def.colors[1]);
  };

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 360px', alignItems: 'start' }}>
      <div className="col" style={{ gap: 16 }}>
        <Section title="Edit Team">
          <label className="field">Team
            <select className="select" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {sorted.map((t) => <option key={t.id} value={t.id}>{t.school} ({t.id})</option>)}
            </select>
          </label>
          <div className="grid g3 mt">
            <label className="field">School name<input className="input" value={school} maxLength={32} onChange={(e) => setSchool(e.target.value)} /></label>
            <label className="field">Mascot<input className="input" value={mascot} maxLength={32} onChange={(e) => setMascot(e.target.value)} /></label>
            <label className="field">Abbreviation<input className="input" value={abbr} maxLength={5} onChange={(e) => setAbbr(e.target.value.toUpperCase())} /></label>
          </div>
          <div className="grid g2 mt">
            <label className="field">Primary color
              <div className="row"><input type="color" value={c1} onChange={(e) => setC1(e.target.value)} style={{ width: 52, height: 36, border: 0, background: 'none', cursor: 'pointer' }} /><input className="input" value={c1} onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && setC1(e.target.value)} /></div>
            </label>
            <label className="field">Secondary color
              <div className="row"><input type="color" value={c2} onChange={(e) => setC2(e.target.value)} style={{ width: 52, height: 36, border: 0, background: 'none', cursor: 'pointer' }} /><input className="input" value={c2} onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && setC2(e.target.value)} /></div>
            </label>
          </div>
          <div className="row wrap mt">
            <button className="btn primary" disabled={!valid} onClick={apply}>Apply to This Dynasty</button>
            <button className="btn" disabled={!valid} onClick={() => void saveMod()}>Save as Mod for New Dynasties</button>
            <button className="btn ghost" onClick={resetDefaults}>Reset to real-world defaults</button>
          </div>
        </Section>
        <Section title={`Saved Mods (${Object.keys(mods).length})`} right={
          <div className="row">
            <button className="btn sm" onClick={() => downloadJson('teams.json', mods)}>⬇️ Export JSON</button>
            <button className="btn sm" onClick={() => fileRef.current?.click()}>⬆️ Import JSON</button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const data = await readJsonFile<TeamMods | { teams: TeamMods }>(f);
                const m = (data && typeof data === 'object' && 'teams' in data ? (data as { teams: TeamMods }).teams : data) as TeamMods;
                if (!m || typeof m !== 'object') throw new Error('bad');
                const merged = { ...mods, ...m };
                await setTeamMods(merged);
                setMods(merged);
                toast(`Imported ${Object.keys(m).length} team mods.`, 'good');
              } catch { toast('Invalid mods file.', 'bad'); }
            }} />
          </div>
        }>
          {Object.keys(mods).length === 0 ? <div className="small muted">No mods saved. Mods apply when you start a new dynasty.</div> : (
            <div className="col gap-s">
              {Object.entries(mods).map(([id, m]) => (
                <div key={id} className="row small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                  <GeneratedBadge team={{ id, abbr: m.abbr ?? g.teams[id]?.abbr ?? id.slice(0, 3).toUpperCase(), colors: (m.colors as [string, string]) ?? g.teams[id]?.colors ?? ['#333', '#fff'] }} size={26} />
                  <span className="b">{m.school ?? g.teams[id]?.school ?? id}</span>
                  <span className="muted ellipsis" style={{ flex: 1 }}>{Object.keys(m).join(', ')}</span>
                  <button className="btn sm ghost" onClick={async () => { const next = { ...mods }; delete next[id]; await setTeamMods(next); setMods(next); }}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
      <div className="card flush" style={{ position: 'sticky', top: 0 }}>
        <div style={{ padding: 22, textAlign: 'center', background: `linear-gradient(160deg, ${c1}, #0b1220 85%)` }}>
          <motion.div key={`${c1}${c2}${abbr}`} initial={{ scale: 0.85, rotate: -6 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 16 }}>
            <TeamLogo team={preview} size={110} />
          </motion.div>
          <div className="h2" style={{ marginTop: 10 }}>{school || '—'}</div>
          <div className="muted">{mascot || '—'}</div>
        </div>
        <div style={{ padding: 18 }}>
          <div className="row" style={{ justifyContent: 'center', gap: 16 }}>
            {samplePlayer && <PlayerFace p={samplePlayer} size={96} team={{ colors: [c1, c2] }} />}
            <div className="col gap-s">
              <span className="pill" style={{ background: c1, color: '#fff', borderColor: c2 }}>{abbr || 'ABBR'}</span>
              <span className="pill" style={{ background: c2, color: c1 }}>{mascot || 'Mascot'}</span>
              <span className="pill" style={{ borderColor: teamAccent([c1, c2]), color: teamAccent([c1, c2]) }}>UI accent</span>
            </div>
          </div>
          <div className="tiny muted mt">Generated badge shown unless a custom logo is uploaded or dropped into the logos folder.</div>
        </div>
      </div>
    </div>
  );
}
