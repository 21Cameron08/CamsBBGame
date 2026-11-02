// Tiny synthesized sound kit (WebAudio) — no audio files needed.
let ctx: AudioContext | null = null;
let enabled = true;
export function setSoundEnabled(v: boolean) { enabled = v; }
function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}
function noise(c: AudioContext, dur: number): AudioBufferSourceNode {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  return src;
}
function env(c: AudioContext, g: GainNode, peak: number, a: number, dcy: number) {
  const t = c.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy);
}
export const sfx = {
  click() {
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.value = 880;
    env(c, g, 0.05, 0.002, 0.05);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.08);
  },
  swish() {
    const c = ac(); if (!c) return;
    const n = noise(c, 0.35), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.frequency.setValueAtTime(3200, c.currentTime); f.frequency.exponentialRampToValueAtTime(900, c.currentTime + 0.3); f.Q.value = 1.2;
    env(c, g, 0.16, 0.01, 0.3);
    n.connect(f).connect(g).connect(c.destination); n.start();
  },
  rim() {
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(420, c.currentTime); o.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.12);
    env(c, g, 0.05, 0.002, 0.14);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.2);
  },
  buzzer() {
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = 196; o2.type = 'square'; o2.frequency.value = 202;
    const t = c.currentTime;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.03); g.gain.setValueAtTime(0.12, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
    o.connect(g); o2.connect(g); g.connect(c.destination);
    o.start(); o2.start(); o.stop(t + 1.1); o2.stop(t + 1.1);
  },
  crowd(intensity = 1) {
    const c = ac(); if (!c) return;
    const n = noise(c, 2.2), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.value = 1100;
    const t = c.currentTime;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09 * intensity, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
    n.connect(f).connect(g).connect(c.destination); n.start();
  },
  whoosh() {
    const c = ac(); if (!c) return;
    const n = noise(c, 0.5), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.Q.value = 0.8; f.frequency.setValueAtTime(300, c.currentTime); f.frequency.exponentialRampToValueAtTime(3000, c.currentTime + 0.35);
    env(c, g, 0.08, 0.05, 0.4);
    n.connect(f).connect(g).connect(c.destination); n.start();
  },
  camera() {
    const c = ac(); if (!c) return;
    const n = noise(c, 0.08), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'highpass'; f.frequency.value = 2500;
    env(c, g, 0.07, 0.001, 0.06);
    n.connect(f).connect(g).connect(c.destination); n.start();
  },
  fanfare() {
    const c = ac(); if (!c) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((fq, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = fq;
      const t = c.currentTime + i * 0.12;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.55);
    });
  },
  drum() {
    const c = ac(); if (!c) return;
    for (let i = 0; i < 10; i++) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = 90;
      const t = c.currentTime + i * 0.13;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.14);
    }
  },
};
