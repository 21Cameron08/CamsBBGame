// server/entry.ts
import { BlobPreconditionFailedError, get, head as head2, put } from "@vercel/blob";

// server/league.ts
import { gzipSync, gunzipSync } from "node:zlib";

// src/engine/rng.ts
function hashString(str) {
  let h2 = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h2 = Math.imul(h2 ^ str.charCodeAt(i), 3432918353);
    h2 = h2 << 13 | h2 >>> 19;
  }
  h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507);
  h2 = Math.imul(h2 ^ h2 >>> 13, 3266489909);
  return (h2 ^= h2 >>> 16) >>> 0;
}
var RNG = class {
  s;
  constructor(seed = Date.now()) {
    this.s = typeof seed === "string" ? hashString(seed) : seed >>> 0;
    if (this.s === 0) this.s = 2654435769;
  }
  /** float in [0,1) */
  next() {
    let t = this.s += 1831565813;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  get state() {
    return this.s;
  }
  set state(v2) {
    this.s = v2 >>> 0;
  }
  /** int in [min, max] inclusive */
  int(min, max2) {
    return Math.floor(this.next() * (max2 - min + 1)) + min;
  }
  range(min, max2) {
    return this.next() * (max2 - min) + min;
  }
  chance(p) {
    return this.next() < p;
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** Standard normal via Box–Muller */
  normal(mean = 0, sd = 1) {
    let u = 0, v2 = 0;
    while (u === 0) u = this.next();
    while (v2 === 0) v2 = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v2);
  }
  weighted(items, weights) {
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    if (total <= 0) return items[Math.floor(this.next() * items.length)];
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= Math.max(0, weights[i]);
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  id(prefix = "") {
    return prefix + Math.floor(this.next() * 2 ** 32).toString(36) + Math.floor(this.next() * 2 ** 20).toString(36);
  }
};
var rng = new RNG(Date.now());
var clamp = (v2, lo, hi) => v2 < lo ? lo : v2 > hi ? hi : v2;

// src/engine/schemes.ts
var W = [1, 1, 1, 1, 1, 0.7, 0.55, 0.4];
var isBig = (p) => p.pos === "PF" || p.pos === "C";
function rotationOf(ps) {
  return ps.filter((p) => !p.injury && !p.redshirting).sort((a, b) => b.ovr - a.ovr).slice(0, 8);
}
function avg(top, f) {
  let s = 0, w = 0;
  top.forEach((p, i) => {
    s += f(p) * (W[i] ?? 0.3);
    w += W[i] ?? 0.3;
  });
  return w ? s / w : 0;
}
function wcount(top, pred) {
  let s = 0;
  top.forEach((p, i) => {
    if (pred(p)) s += W[i] ?? 0.3;
  });
  return s;
}
var max = (arr, f) => arr.reduce((m, p) => Math.max(m, f(p)), 0);
var sc = (v2, lo, hi) => clamp((v2 - lo) / (hi - lo) * 100, 0, 100);
var done = (score, notes) => ({ score: Math.round(clamp(score, 5, 99)), notes });
var note = (good, text) => ({ good, text });
function benchGap(top) {
  const st = top.slice(0, 5), bn = top.slice(5, 8);
  if (!bn.length) return -15;
  return bn.reduce((a, p) => a + p.ovr, 0) / bn.length - st.reduce((a, p) => a + p.ovr, 0) / st.length;
}
var offSkill = (p) => p.ratings.ins * 0.3 + p.ratings.mid * 0.2 + p.ratings.tp * 0.3 + p.ratings.hdl * 0.2;
function level(top) {
  return avg(top, (p) => {
    const r = p.ratings;
    return (r.ins + r.mid + r.tp + r.ft + r.pas + r.hdl + r.perD + r.intD + r.stl + r.blk + r.reb + r.ath + r.spd + r.str + r.sta + r.iq) / 16;
  });
}
var rel = (v2, L) => v2 - L;
var sgn = (v2) => `${v2 >= 0 ? "+" : ""}${Math.round(v2)}`;
var OFF_SCHEMES = [
  {
    id: "balanced",
    label: "Balanced",
    icon: "\u2696\uFE0F",
    desc: "Take what the defense gives you. A little of everything.",
    strengths: ["Works with any roster", "No glaring weakness to attack"],
    weaknesses: ["No real edge against anybody"],
    needs: "Nothing in particular",
    mix: { rim: 1, mid: 1, three: 1 },
    make: { rim: 0, mid: 0, three: 0 },
    pace: 0,
    tov: 0,
    ast: 0,
    orb: 0,
    foulDraw: 1,
    transition: 1,
    fit: () => done(58, [note(true, "Fits any roster, but never a great fit")])
  },
  {
    id: "motion",
    label: "Motion",
    icon: "\u{1F504}",
    desc: "Read-and-react: cut, screen, move the ball. Everybody touches it.",
    strengths: ["Shreds zones with ball movement", "Fewer turnovers, more assists"],
    weaknesses: ["Stalls if players can\u2019t pass or shoot", "Switching defenses blunt it"],
    needs: "Smart passers and shooters at most spots",
    mix: { rim: 1, mid: 0.95, three: 1.08 },
    make: { rim: 0, mid: 5e-3, three: 5e-3 },
    pace: -0.5,
    tov: -8e-3,
    ast: 0.07,
    orb: -0.01,
    foulDraw: 1,
    transition: 1,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top);
      const iq = rel(avg(top, (p) => p.ratings.pas * 0.5 + p.ratings.iq * 0.5), L), sh = wcount(top, (p) => p.ratings.tp >= L + 4);
      return done(sc(iq, -4, 10) * 0.6 + sc(sh, 1.5, 5) * 0.4, [note(iq >= 3, `Passing & IQ ${sgn(iq)} vs. team level`), note(sh >= 3, `${sh.toFixed(1)} weighted shooters`)]);
    }
  },
  {
    id: "pace",
    label: "Pace & Space",
    icon: "\u26A1",
    desc: "Push after every miss and make. Early offense, early threes.",
    strengths: ["Easy transition baskets", "Wears down thin benches"],
    weaknesses: ["Gives up offensive rebounds", "More turnovers"],
    needs: "Fast, fit athletes and a deep bench",
    mix: { rim: 1.08, mid: 0.8, three: 1.12 },
    make: { rim: 9e-3, mid: 0, three: 4e-3 },
    pace: 3,
    tov: 4e-3,
    ast: 0,
    orb: -0.02,
    foulDraw: 1,
    transition: 1.6,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top);
      const a = rel(avg(top, (p) => p.ratings.spd * 0.4 + p.ratings.ath * 0.4 + p.ratings.sta * 0.2), L), b = benchGap(top);
      return done(sc(a, -2, 12) * 0.65 + sc(b, -14, 0) * 0.35, [note(a >= 5, `Speed & athleticism ${sgn(a)} vs. team level`), note(b >= -7, b >= -7 ? "Bench can keep up" : "Bench drops off sharply")]);
    }
  },
  {
    id: "post",
    label: "Inside-Out",
    icon: "\u{1F3CB}\uFE0F",
    desc: "Pound it inside, then kick out when the defense collapses.",
    strengths: ["Draws fouls and gets bigs going", "Punishes switches and small lineups"],
    weaknesses: ["Packed paints (zone, pack line) clog it", "Slow, low-possession games"],
    needs: "A dominant post scorer and guards who can feed him",
    mix: { rim: 1.25, mid: 1, three: 0.82 },
    make: { rim: 3e-3, mid: 0, three: 4e-3 },
    pace: -1,
    tov: 0,
    ast: 0,
    orb: 0.012,
    foulDraw: 1.08,
    transition: 0.9,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top), bigs = top.filter(isBig), guards = top.filter((p) => !isBig(p));
      const b = rel(max(bigs, (p) => p.ratings.ins * 0.6 + p.ratings.str * 0.4), L), e = rel(avg(guards, (p) => p.ratings.pas), L);
      return done(sc(b, 2, 22) * 0.65 + sc(e, -4, 10) * 0.35, [note(b >= 12, `Post scorer ${sgn(b)} vs. team level`), note(e >= 3, `Entry passing ${sgn(e)}`)]);
    }
  },
  {
    id: "drive",
    label: "Dribble Drive",
    icon: "\u{1F3C3}",
    desc: "Spread the floor and attack the rim one-on-one.",
    strengths: ["Gets to the line", "Beats aggressive, pressuring defenses"],
    weaknesses: ["Pack line walls it off", "Needs shooters to keep driving lanes open"],
    needs: "Quick guards and wings who finish at the rim",
    mix: { rim: 1.3, mid: 0.85, three: 1 },
    make: { rim: 3e-3, mid: 0, three: 0 },
    pace: 0.5,
    tov: 4e-3,
    ast: -0.02,
    orb: 0,
    foulDraw: 1.12,
    transition: 1.1,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top), perim = top.filter((p) => p.pos !== "C");
      const d = rel(avg(perim, (p) => p.ratings.ins * 0.4 + p.ratings.spd * 0.3 + p.ratings.hdl * 0.3), L), sh = wcount(top, (p) => p.ratings.tp >= L + 4);
      return done(sc(d, -2, 12) * 0.7 + sc(sh, 1, 4) * 0.3, [note(d >= 5, `Downhill attackers ${sgn(d)} vs. team level`), note(sh >= 2.5, `Spacing: ${sh.toFixed(1)} shooters`)]);
    }
  },
  {
    id: "three",
    label: "Five-Out Bombs",
    icon: "\u{1F3AF}",
    desc: "Five shooters spread out. Hunt threes and live by the arc.",
    strengths: ["Punishes zones and pack lines", "Huge comeback potential"],
    weaknesses: ["Cold nights happen", "Gives up the glass"],
    needs: "Shooters everywhere, ideally a big who can step out",
    mix: { rim: 0.9, mid: 0.75, three: 1.38 },
    make: { rim: 6e-3, mid: 0, three: 4e-3 },
    pace: 0.5,
    tov: 0,
    ast: 0.02,
    orb: -0.02,
    foulDraw: 0.95,
    transition: 1.1,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top);
      const sh = wcount(top, (p) => p.ratings.tp >= L + 6), stretch = top.filter(isBig).some((p) => p.ratings.tp >= L);
      return done(sc(sh, 1, 4.5) * 0.78 + (stretch ? 22 : 0), [note(sh >= 3, `${sh.toFixed(1)} weighted knockdown shooters`), note(stretch, stretch ? "A big who can stretch the floor" : "No big can shoot: the paint stays crowded")]);
    }
  },
  {
    id: "princeton",
    label: "Princeton",
    icon: "\u2702\uFE0F",
    desc: "Backdoor cuts, high-post passing and patience. Brains over brawn.",
    strengths: ["Burns pressure and denial defenses", "Fewest turnovers, lots of layups", "Shortens games for underdogs"],
    weaknesses: ["Zones take away the backdoor", "Fewer possessions"],
    needs: "High-IQ passers at every spot, including the bigs",
    mix: { rim: 1.15, mid: 0.95, three: 1 },
    make: { rim: 9e-3, mid: 0, three: 3e-3 },
    pace: -2.5,
    tov: -0.012,
    ast: 0.09,
    orb: -0.02,
    foulDraw: 0.95,
    transition: 0.8,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top);
      const iq = rel(avg(top, (p) => p.ratings.iq), L), pas = rel(avg(top, (p) => p.ratings.pas), L), bp = rel(avg(top.filter(isBig), (p) => p.ratings.pas), L);
      return done(sc(iq, -2, 10) * 0.4 + sc(pas, -4, 8) * 0.35 + sc(bp, -14, 0) * 0.25, [note(iq >= 4, `Team IQ ${sgn(iq)} vs. team level`), note(pas >= 2, `Passing ${sgn(pas)}`), note(bp >= -7, `Bigs who can pass: ${sgn(bp)}`)]);
    }
  },
  {
    id: "flex",
    label: "Flex",
    icon: "\u{1F500}",
    desc: "Screen-the-screener continuity. Patient, physical, built for mid-range looks.",
    strengths: ["Grinds down man-to-man", "Gets versatile forwards open"],
    weaknesses: ["Switching defenses kill the screens", "Zones blunt it"],
    needs: "Forwards who can shoot, pass and finish",
    mix: { rim: 1.05, mid: 1.22, three: 0.9 },
    make: { rim: 0, mid: 0.014, three: 0 },
    pace: -1,
    tov: -5e-3,
    ast: 0.04,
    orb: 5e-3,
    foulDraw: 1,
    transition: 0.9,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top), fwd = top.filter((p) => p.pos === "SF" || p.pos === "PF");
      const f = rel(avg(fwd, (p) => p.ratings.mid * 0.4 + p.ratings.ins * 0.3 + p.ratings.pas * 0.3), L), iq = rel(avg(top, (p) => p.ratings.iq), L);
      return done(sc(f, -4, 8) * 0.6 + sc(iq, -2, 10) * 0.4, [note(f >= 2, `Versatile forwards ${sgn(f)} vs. team level`), note(iq >= 4, `Team IQ ${sgn(iq)}`)]);
    }
  },
  {
    id: "pnr",
    label: "Spread Pick-and-Roll",
    icon: "\u{1F501}",
    desc: "High ball screens all game: your best handler and a rolling or popping big.",
    strengths: ["Elite handlers feast", "Beats drop coverage and pack lines"],
    weaknesses: ["Switching defenses neutralize it", "Predictable if the handler is ordinary"],
    needs: "A star ball handler and a big who rolls hard or pops",
    mix: { rim: 1.12, mid: 0.98, three: 1.05 },
    make: { rim: 3e-3, mid: 2e-3, three: 2e-3 },
    pace: 0,
    tov: 3e-3,
    ast: 0.03,
    orb: 0,
    foulDraw: 1.06,
    transition: 1,
    fit: (ps) => {
      const top = rotationOf(ps).slice(0, 6), L = level(top);
      const h2 = rel(max(top, (p) => p.ratings.hdl * 0.5 + p.ratings.pas * 0.5), L), b = rel(max(top.filter(isBig), (p) => Math.max(p.ratings.ath * 0.5 + p.ratings.ins * 0.5, p.ratings.tp)), L);
      return done(sc(h2, 6, 22) * 0.6 + sc(b, 2, 16) * 0.4, [note(h2 >= 14, `Lead handler ${sgn(h2)} vs. team level`), note(b >= 9, `Roll or pop big ${sgn(b)}`)]);
    }
  },
  {
    id: "iso",
    label: "Star Iso",
    icon: "\u2B50",
    desc: "Clear out and let your best scorer go to work.",
    strengths: ["A true star becomes unstoppable", "Clutch shot creation"],
    weaknesses: ["Box-and-one and zones swarm the star", "Teammates go cold, few assists"],
    needs: "One scorer who is far better than everybody else",
    mix: { rim: 1, mid: 1.25, three: 0.96 },
    make: { rim: 0, mid: 6e-3, three: 0 },
    pace: -1,
    tov: -4e-3,
    ast: -0.1,
    orb: 0,
    foulDraw: 1.1,
    transition: 0.95,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top);
      const sorted = [...top].sort((a, b) => offSkill(b) - offSkill(a));
      const star = sorted[0] ? offSkill(sorted[0]) : 0, rest = sorted.slice(1, 5).reduce((a, p) => a + offSkill(p), 0) / Math.max(1, Math.min(4, sorted.length - 1));
      return done(sc(star - L, 2, 16) * 0.5 + sc(star - rest, 2, 12) * 0.5, [note(star - L >= 9, sorted[0] ? `${sorted[0].first} ${sorted[0].last} as the star (${sgn(star - L)})` : "No star"), note(star - rest >= 7, `Gap over the rest: ${Math.round(star - rest)}`)]);
    }
  }
];
var DEF_SCHEMES = [
  {
    id: "man",
    label: "Man-to-Man",
    icon: "\u{1F6E1}\uFE0F",
    desc: "Solid fundamentals. Guard your man, help when needed.",
    strengths: ["Holds up against everything", "Fewest weaknesses"],
    weaknesses: ["Exposes weak individual defenders"],
    needs: "Solid individual defenders",
    mix: { rim: 1, mid: 1, three: 1 },
    make: { rim: 0, mid: 0, three: 0 },
    tov: 0,
    steal: 0,
    foul: 0,
    shootFoul: 1,
    orbAllowed: 0,
    drain: 0,
    pace: 0,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top), d = rel(avg(top, (p) => p.ratings.perD * 0.6 + p.ratings.intD * 0.4), L);
      return done(sc(d, -6, 8) * 0.7 + 22, [note(d >= 1, `Individual defense ${sgn(d)} vs. team level`)]);
    }
  },
  {
    id: "packline",
    label: "Pack Line",
    icon: "\u{1F9F1}",
    desc: "Everybody inside the line. Wall off the paint, live with contested jumpers.",
    strengths: ["Kills dribble drive and post-ups", "Few fouls, few easy baskets"],
    weaknesses: ["Shooting teams light it up", "Concedes threes"],
    needs: "Disciplined, high-IQ defenders and a rim protector",
    mix: { rim: 0.82, mid: 1.1, three: 1.15 },
    make: { rim: -0.016, mid: 0, three: 6e-3 },
    tov: -4e-3,
    steal: -0.05,
    foul: -0.01,
    shootFoul: 0.88,
    orbAllowed: -0.01,
    drain: 0,
    pace: -0.5,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top);
      const d = rel(avg(top, (p) => p.ratings.perD), L), iq = rel(avg(top, (p) => p.ratings.iq), L), rp = rel(max(top.filter(isBig), (p) => p.ratings.intD * 0.6 + p.ratings.blk * 0.4), L);
      return done(sc(d, -4, 8) * 0.4 + sc(iq, -2, 10) * 0.3 + sc(rp, 2, 20) * 0.3, [note(d >= 2, `Perimeter D ${sgn(d)} vs. team level`), note(iq >= 4, `Discipline (IQ) ${sgn(iq)}`), note(rp >= 11, `Rim protector ${sgn(rp)}`)]);
    }
  },
  {
    id: "zone",
    label: "2-3 Zone",
    icon: "\u{1F578}\uFE0F",
    desc: "Protect the rim and the glass. Hides weak perimeter defenders.",
    strengths: ["Hides poor individual defenders", "Shuts down post-ups and drives"],
    weaknesses: ["Motion and shooting teams carve it up", "Gives up offensive rebounds"],
    needs: "Long bigs who block shots and rebound",
    mix: { rim: 0.86, mid: 1.05, three: 1.15 },
    make: { rim: -0.012, mid: 0.01, three: -0.016 },
    tov: -8e-3,
    steal: 0,
    foul: -0.01,
    shootFoul: 0.9,
    orbAllowed: 0.025,
    drain: -0.05,
    pace: -0.5,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top), bigs = top.filter(isBig);
      const rp = rel(max(bigs, (p) => p.ratings.intD * 0.6 + p.ratings.blk * 0.4), L), rb = rel(avg(bigs, (p) => p.ratings.reb), L), len = avg(top.slice(0, 5), (p) => p.height);
      return done(sc(rp, 2, 20) * 0.45 + sc(rb, 2, 18) * 0.3 + sc(len, 76.5, 80) * 0.25, [note(rp >= 11, `Rim protection ${sgn(rp)} vs. team level`), note(rb >= 10, `Bigs' rebounding ${sgn(rb)}`), note(len >= 78.3, `Length: ${Math.floor(len / 12)}'${Math.round(len % 12)}" avg starter`)]);
    }
  },
  {
    id: "zone131",
    label: "1-3-1 Trap",
    icon: "\u{1FAA4}",
    desc: "A long athlete at the top, traps on the wings. Chaos by design.",
    strengths: ["Forces turnovers and live-ball steals", "Unfamiliar look throws teams off"],
    weaknesses: ["Corner threes and offensive rebounds", "Tires your wings"],
    needs: "Long, active wings and quick guards",
    mix: { rim: 0.9, mid: 0.95, three: 1.2 },
    make: { rim: -4e-3, mid: -8e-3, three: 0.01 },
    tov: 0.018,
    steal: 0.08,
    foul: 5e-3,
    shootFoul: 1,
    orbAllowed: 0.035,
    drain: 0.06,
    pace: 1,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top), five = top.slice(0, 5);
      const act = rel(avg(five, (p) => p.ratings.stl * 0.5 + p.ratings.ath * 0.5), L), len = max(five.filter((p) => !isBig(p)), (p) => p.height), q2 = rel(avg(five, (p) => p.ratings.spd), L);
      return done(sc(act, -2, 10) * 0.45 + sc(len, 77, 81) * 0.3 + sc(q2, -4, 8) * 0.25, [note(act >= 4, `Active hands & athleticism ${sgn(act)} vs. team level`), note(len >= 79, `Length on the wing: ${Math.floor(len / 12)}'${len % 12}"`), note(q2 >= 2, `Quickness ${sgn(q2)}`)]);
    }
  },
  {
    id: "matchup",
    label: "Matchup Zone",
    icon: "\u{1F9E9}",
    desc: "Looks like a zone, plays like man. Hard to read, harder to beat.",
    strengths: ["Confuses motion and Princeton offenses", "Takes away open threes"],
    weaknesses: ["Breaks down without smart defenders", "Gives up some offensive boards"],
    needs: "High-IQ defenders who communicate",
    mix: { rim: 0.92, mid: 1.05, three: 1.04 },
    make: { rim: -4e-3, mid: 0, three: -5e-3 },
    tov: 3e-3,
    steal: 0,
    foul: -4e-3,
    shootFoul: 0.95,
    orbAllowed: 0.015,
    drain: 0,
    pace: 0,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top), iq = rel(avg(top, (p) => p.ratings.iq), L), d = rel(avg(top, (p) => p.ratings.perD * 0.5 + p.ratings.intD * 0.5), L);
      return done(sc(iq, -2, 10) * 0.6 + sc(d, -6, 6) * 0.4, [note(iq >= 4, `Team IQ ${sgn(iq)} vs. team level`), note(d >= 0, `Overall defense ${sgn(d)}`)]);
    }
  },
  {
    id: "press",
    label: "Full-Court Press",
    icon: "\u{1F525}",
    desc: "Pressure for 94 feet. Turn them over and run.",
    strengths: ["Feasts on shaky ball handlers", "Speeds up slower teams"],
    weaknesses: ["Gives up layups when broken", "Exhausting: needs a deep bench"],
    needs: "Quick, active athletes and depth",
    mix: { rim: 1.1, mid: 1, three: 1 },
    make: { rim: 0.03, mid: 0, three: 0 },
    tov: 0.022,
    steal: 0.04,
    foul: 0.02,
    shootFoul: 1.03,
    orbAllowed: 0,
    drain: 0.15,
    pace: 4,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top), a = rel(avg(top, (p) => p.ratings.spd * 0.4 + p.ratings.ath * 0.3 + p.ratings.stl * 0.3), L), b = benchGap(top), st = rel(avg(top, (p) => p.ratings.sta), L);
      return done(sc(a, -2, 10) * 0.5 + sc(b, -14, 0) * 0.3 + sc(st, -2, 12) * 0.2, [note(a >= 4, `Quickness & hands ${sgn(a)} vs. team level`), note(b >= -7, b >= -7 ? "Deep enough to rotate fresh legs" : "Bench drop-off: fatigue risk"), note(st >= 5, `Stamina ${sgn(st)}`)]);
    }
  },
  {
    id: "switch",
    label: "Switch Everything",
    icon: "\u{1F504}",
    desc: "Switch every screen. No breakdowns, if everybody can guard everybody.",
    strengths: ["Neutralizes pick-and-roll and flex screens", "Few open looks"],
    weaknesses: ["Post-ups and isolation mismatches", "Needs versatile defenders"],
    needs: "Versatile defenders of similar size",
    mix: { rim: 0.98, mid: 1.15, three: 0.96 },
    make: { rim: -4e-3, mid: 0, three: -6e-3 },
    tov: -4e-3,
    steal: 0,
    foul: 0,
    shootFoul: 1,
    orbAllowed: 5e-3,
    drain: 0,
    pace: 0,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top), five = top.slice(0, 5);
      const minV = rel(five.reduce((m, p) => Math.min(m, p.ratings.perD * 0.5 + p.ratings.intD * 0.5), 99), L), ath = rel(avg(five, (p) => p.ratings.ath), L);
      const hs = five.map((p) => p.height), spread2 = hs.length ? Math.max(...hs) - Math.min(...hs) : 8;
      return done(sc(minV, -16, -2) * 0.45 + sc(ath, -2, 10) * 0.25 + sc(10 - spread2, 0, 6) * 0.3, [note(minV >= -9, `Weakest link ${sgn(minV)} vs. team level`), note(ath >= 4, `Athleticism ${sgn(ath)}`), note(spread2 <= 6, `Size spread: ${spread2}"`)]);
    }
  },
  {
    id: "pressure",
    label: "Denial Man",
    icon: "\u{1F645}",
    desc: "Deny every pass, pressure every dribble, jump passing lanes.",
    strengths: ["Forces turnovers in the half court", "Disrupts timing and rhythm"],
    weaknesses: ["Backdoor cuts (Princeton) and drivers burn it", "Foul trouble"],
    needs: "Quick, tireless perimeter defenders",
    mix: { rim: 1.12, mid: 0.95, three: 0.92 },
    make: { rim: 0.015, mid: 0, three: -0.01 },
    tov: 0.014,
    steal: 0.05,
    foul: 0.012,
    shootFoul: 1.08,
    orbAllowed: 0,
    drain: 0.08,
    pace: 1,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top), perim = top.filter((p) => !isBig(p));
      const d = rel(avg(perim, (p) => p.ratings.perD * 0.5 + p.ratings.stl * 0.3 + p.ratings.spd * 0.2), L), st = rel(avg(top, (p) => p.ratings.sta), L);
      return done(sc(d, -2, 10) * 0.7 + sc(st, -2, 12) * 0.3, [note(d >= 4, `Perimeter pressure ${sgn(d)} vs. team level`), note(st >= 5, `Stamina ${sgn(st)}`)]);
    }
  },
  {
    id: "boxone",
    label: "Box-and-One",
    icon: "\u{1F3AF}",
    desc: "A four-man zone plus your best defender shadowing their star.",
    strengths: ["Takes the other team\u2019s star out of the game", "Wrecks Star Iso offenses"],
    weaknesses: ["Everyone else gets open looks", "Easy to beat if they have balance"],
    needs: "One lockdown perimeter defender and a rim protector",
    mix: { rim: 0.95, mid: 1, three: 1.08 },
    make: { rim: -4e-3, mid: 6e-3, three: 6e-3 },
    tov: 0,
    steal: 0,
    foul: 0,
    shootFoul: 0.95,
    orbAllowed: 0.015,
    drain: 0.02,
    pace: 0,
    fit: (ps) => {
      const top = rotationOf(ps), L = level(top), stopper = rel(max(top, (p) => p.ratings.perD), L), rp = rel(max(top.filter(isBig), (p) => p.ratings.intD * 0.6 + p.ratings.blk * 0.4), L);
      return done(sc(stopper, 6, 24) * 0.6 + sc(rp, 2, 20) * 0.4, [note(stopper >= 15, `Lockdown defender ${sgn(stopper)} vs. team level`), note(rp >= 11, `Rim protector ${sgn(rp)}`)]);
    }
  }
];
var CAL = {
  motion: [11, 44],
  pace: [22, 44],
  post: [30, 74],
  drive: [18, 51],
  three: [5, 66],
  princeton: [8, 40],
  flex: [13, 51],
  pnr: [16, 68],
  iso: [20, 85],
  man: [30, 52],
  packline: [17, 42],
  zone: [30, 82],
  zone131: [18, 59],
  matchup: [12, 37],
  press: [24, 43],
  switch: [18, 71],
  pressure: [15, 52],
  boxone: [18, 65]
};
for (const sch of [...OFF_SCHEMES, ...DEF_SCHEMES]) {
  const c = CAL[sch.id];
  if (!c) continue;
  const raw = sch.fit;
  sch.fit = (ps) => {
    const r = raw(ps);
    return { ...r, score: Math.round(clamp(30 + (r.score - c[0]) * 50 / (c[1] - c[0]), 5, 99)) };
  };
}
var OFF = Object.fromEntries(OFF_SCHEMES.map((s) => [s.id, s]));
var DEF = Object.fromEntries(DEF_SCHEMES.map((s) => [s.id, s]));
var COUNTERS = {
  motion: { zone: 0.014, zone131: 0.01, boxone: 8e-3, switch: -0.01, matchup: -8e-3 },
  pace: { press: 0.014, packline: 6e-3, zone: 4e-3, pressure: 4e-3, matchup: -4e-3 },
  post: { switch: 0.02, zone131: 8e-3, zone: -0.016, packline: -0.014, boxone: -4e-3 },
  drive: { pressure: 0.014, switch: 4e-3, packline: -0.016, zone: -0.01, matchup: -6e-3 },
  three: { packline: 0.016, zone: 0.012, zone131: 0.012, boxone: 6e-3, switch: -6e-3, pressure: -6e-3, matchup: -6e-3 },
  princeton: { pressure: 0.022, man: 3e-3, press: -8e-3, zone: -0.012, matchup: -0.012, zone131: -8e-3 },
  flex: { man: 6e-3, pressure: 8e-3, packline: 4e-3, switch: -0.014, zone: -0.012, zone131: -6e-3 },
  pnr: { packline: 0.01, man: 3e-3, zone: -4e-3, switch: -0.016, matchup: -4e-3 },
  iso: { switch: 0.01, boxone: -0.024, zone: -0.01, matchup: -6e-3, packline: -6e-3 }
};
function counterEdge(off, def) {
  return COUNTERS[off]?.[def] ?? 0;
}
var AI_FAMILIARITY = 90;
function fitEdge(fit) {
  return (fit - 58) * 35e-5;
}
function famPenalty(fam) {
  const gap = Math.max(0, 85 - fam);
  return { make: -gap * 13e-5, tov: gap * 2e-4 };
}
function playbookState(state) {
  if (!state.playbook) {
    const s = state.teams[state.user.teamId].strategy;
    const pb = { off: {}, def: {} };
    for (const o of OFF_SCHEMES) pb.off[o.id] = o.id === s.offense ? 90 : o.id === "balanced" ? 70 : 30;
    for (const d of DEF_SCHEMES) pb.def[d.id] = d.id === s.defense ? 90 : d.id === "man" ? 70 : 30;
    state.playbook = pb;
  }
  return state.playbook;
}
function weeklyInstall(state, opts) {
  const pb = playbookState(state);
  const s = state.teams[state.user.teamId].strategy;
  const gain = (8 + opts.tactics * 0.8) * (opts.gamePrep ? 1.6 : 1);
  for (const o of OFF_SCHEMES) pb.off[o.id] = clamp((pb.off[o.id] ?? 30) + (o.id === s.offense ? gain : -1.5), 20, 100);
  for (const d of DEF_SCHEMES) pb.def[d.id] = clamp((pb.def[d.id] ?? 30) + (d.id === s.defense ? gain : -1.5), 20, 100);
}
function seasonInstallReset(state) {
  const pb = playbookState(state);
  const s = state.teams[state.user.teamId].strategy;
  for (const k of Object.keys(pb.off)) pb.off[k] = clamp(Math.round((pb.off[k] ?? 30) * 0.85), 20, 100);
  for (const k of Object.keys(pb.def)) pb.def[k] = clamp(Math.round((pb.def[k] ?? 30) * 0.85), 20, 100);
  pb.off[s.offense] = clamp((pb.off[s.offense] ?? 30) + PRESEASON_INSTALL, 20, 100);
  pb.def[s.defense] = clamp((pb.def[s.defense] ?? 30) + PRESEASON_INSTALL, 20, 100);
}
var PRESEASON_INSTALL = 40;
function resetPlaybook(state) {
  state.playbook = void 0;
  playbookState(state);
}
function hash(s) {
  let h2 = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h2 ^= s.charCodeAt(i);
    h2 = Math.imul(h2, 16777619);
  }
  return h2 >>> 0;
}
function coachLean(coachId) {
  const h2 = hash(coachId);
  return { off: OFF_SCHEMES[h2 % OFF_SCHEMES.length].id, def: DEF_SCHEMES[(h2 >>> 8) % DEF_SCHEMES.length].id };
}
function chooseSchemes(ps, coachId, rand2 = Math.random) {
  const lean = coachId ? coachLean(coachId) : null;
  let bestO = "balanced", bo = -1, bestD = "man", bd = -1;
  for (const o of OFF_SCHEMES) {
    const v2 = o.fit(ps).score + (lean?.off === o.id ? 14 : 0) + rand2() * 8;
    if (v2 > bo) {
      bo = v2;
      bestO = o.id;
    }
  }
  for (const d of DEF_SCHEMES) {
    const v2 = d.fit(ps).score + (lean?.def === d.id ? 14 : 0) + rand2() * 8;
    if (v2 > bd) {
      bd = v2;
      bestD = d.id;
    }
  }
  const top = rotationOf(ps);
  const reb = avg(top, (p) => p.ratings.reb), tp = avg(top, (p) => p.ratings.tp), ins = avg(top, (p) => p.ratings.ins), stl = avg(top, (p) => p.ratings.stl);
  const rp = max(top.filter(isBig), (p) => p.ratings.intD * 0.6 + p.ratings.blk * 0.4);
  return {
    offense: bestO,
    defense: bestD,
    crash: reb >= 66 ? 1 : reb <= 56 ? -1 : 0,
    shotProfile: tp - ins >= 6 ? 1 : ins - tp >= 8 ? -1 : 0,
    pressure: stl >= 64 ? 1 : 0,
    help: rp >= 74 ? 0 : rp <= 62 ? 1 : 0
  };
}

// src/engine/sim.ts
var REG = 2400;
var HALF = 1200;
var OT = 300;
var MINUTES_BY_ROT = {
  7: [36, 35, 34, 33, 32, 18, 12],
  8: [35, 33, 32, 31, 29, 20, 12, 8],
  9: [34, 32, 31, 29, 28, 19, 13, 9, 5],
  10: [32, 30, 29, 28, 27, 18, 14, 10, 7, 5],
  11: [30, 29, 28, 27, 26, 17, 14, 11, 8, 6, 4]
};
function fmtClock(secsLeft) {
  const s = Math.max(0, Math.round(secsLeft));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
var isGuard = (p) => p === "PG" || p === "SG";
var isBig2 = (p) => p === "PF" || p === "C";
function pickLineup(ordered) {
  const out = [];
  let g = 0, b = 0, c = 0;
  for (const cand of ordered) {
    if (out.length >= 5) break;
    const pos = cand.p.pos;
    const ig = isGuard(pos), ib = isBig2(pos);
    if (ig && g >= 3) continue;
    if (ib && b >= 3) continue;
    if (pos === "C" && c >= 2) continue;
    const slotsLeft = 5 - out.length - 1;
    const needG = Math.max(0, 1 - g - (ig ? 1 : 0));
    const needB = Math.max(0, 1 - b - (ib ? 1 : 0));
    if (needG + needB > slotsLeft) continue;
    out.push(cand);
    if (ig) g++;
    if (ib) b++;
    if (pos === "C") c++;
  }
  for (const cand of ordered) {
    if (out.length >= 5) break;
    if (!out.includes(cand)) out.push(cand);
  }
  return out;
}
function depthChart(players, strategy) {
  const avail = players.filter((p) => !p.injury && !p.redshirting);
  const byOvr = [...avail].sort((a, b) => b.ovr - a.ovr);
  let starters = [];
  if (strategy && strategy.starters.length === 5) {
    starters = strategy.starters.map((id) => avail.find((p) => p.id === id)).filter(Boolean);
  }
  if (starters.length < 5) {
    const wrap = byOvr.map((p) => ({ p }));
    const keep = starters.map((p) => ({ p }));
    const rest = wrap.filter((w) => !starters.includes(w.p));
    starters = pickLineup([...keep, ...rest]).map((w) => w.p);
  }
  const order = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 };
  starters.sort((a, b) => order[a.pos] - order[b.pos]);
  const bench = byOvr.filter((p) => !starters.includes(p));
  return [...starters, ...bench];
}
function pickW(arr, w) {
  let total = 0;
  for (let i = 0; i < arr.length; i++) total += Math.max(0, w(arr[i]));
  let r = rng.next() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= Math.max(0, w(arr[i]));
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}
function offSkill2(r) {
  const best = Math.max(r.tp, r.ins, r.mid);
  return best * 0.4 + (r.tp + r.ins + r.mid) / 3 * 0.25 + r.hdl * 0.15 + r.iq * 0.2;
}
var GameSim = class {
  setups;
  neutral;
  pbp;
  crowd;
  tourney;
  flavor;
  closerSaid = false;
  t = 0;
  period = 1;
  periodEnd = HALF;
  score = [0, 0];
  poss = 0;
  teamFouls = [0, 0];
  timeouts = [4, 4];
  sp;
  court = [[], []];
  events = [];
  done = false;
  halfScore = [0, 0];
  flow = [[0, 0, 0]];
  possCount = [0, 0];
  runPts = [0, 0];
  lastSub = [-999, -999];
  mediaMarks = /* @__PURE__ */ new Set();
  shots = [];
  largestLead = [0, 0];
  pendingTO = [false, false];
  nextTransition = false;
  eid = 0;
  started = false;
  lastLeader = -1;
  /** strategies can be changed live */
  strategy;
  mods;
  constructor(home, away, opts = {}) {
    this.setups = [home, away];
    this.neutral = !!opts.neutral;
    this.pbp = !!opts.pbp;
    this.crowd = opts.crowd ?? 0.5;
    this.tourney = !!opts.tourney;
    this.flavor = this.neutral ? void 0 : opts.flavor;
    this.strategy = [{ ...home.strategy }, { ...away.strategy }];
    this.sp = [this.buildTeam(0), this.buildTeam(1)];
    this.mods = [this.computeMods(0), this.computeMods(1)];
    this.applyUsage(0);
    this.applyUsage(1);
    this.syncCourt(0);
    this.syncCourt(1);
    this.poss = rng.chance(0.5) ? 0 : 1;
  }
  buildTeam(i) {
    const s = this.setups[i];
    const chart = depthChart(s.players, s.strategy);
    const rot = clamp(s.strategy.rotation || 9, 7, 11);
    const mins = MINUTES_BY_ROT[rot];
    const motivation = s.coachMotivation;
    return chart.map((p, idx) => {
      const moraleMod = (p.morale - 65) * 0.06 + motivation * 0.15 + (s.chem ?? 0) * 0.9;
      const r = { ...p.ratings };
      for (const k of Object.keys(r)) r[k] = r[k] + moraleMod;
      let usage = Math.exp((offSkill2(r) - 60) * 0.042);
      if (p.traits.includes("diva")) usage *= 1.15;
      const box = {
        id: p.id,
        name: `${p.first} ${p.last}`,
        pos: p.pos,
        num: p.num,
        starter: idx < 5,
        min: 0,
        pts: 0,
        fgm: 0,
        fga: 0,
        tpm: 0,
        tpa: 0,
        ftm: 0,
        fta: 0,
        orb: 0,
        drb: 0,
        ast: 0,
        stl: 0,
        blk: 0,
        tov: 0,
        pf: 0,
        pm: 0
      };
      return {
        p,
        r,
        on: idx < 5,
        energy: 100,
        fouls: 0,
        secs: 0,
        target: mins[idx] ?? 0,
        depth: idx,
        usage,
        base: usage,
        box,
        out: false,
        short: `${p.first[0]}. ${p.last}`
      };
    });
  }
  /** Resolve schemes, fit, familiarity and tendencies for one team */
  computeMods(i) {
    const st = this.strategy[i], set = this.setups[i];
    const off = OFF[st.offense] ?? OFF.balanced, def = DEF[st.defense] ?? DEF.man;
    const famO = set.fam ? set.fam.off[off.id] ?? 30 : AI_FAMILIARITY;
    const famD = set.fam ? set.fam.def[def.id] ?? 30 : AI_FAMILIARITY;
    const pO = famPenalty(famO), pD = famPenalty(famD);
    let star = null;
    for (const x of this.sp?.[i] ?? []) if (!star || x.base > star.base) star = x;
    const t = (v2) => clamp(Math.round(v2 ?? 0), -2, 2);
    return {
      off,
      def,
      offExec: fitEdge(off.fit(set.players).score) + pO.make,
      offTov: pO.tov,
      defExec: -fitEdge(def.fit(set.players).score) * 0.875 - pD.make * 0.8,
      defTov: -pD.tov * 0.6,
      crash: t(st.crash),
      shotProfile: t(st.shotProfile),
      pressure: t(st.pressure),
      help: t(st.help),
      starId: star?.p.id ?? null
    };
  }
  /** Who gets the ball depends on the offense */
  applyUsage(i) {
    const st = this.strategy[i], m = this.mods[i], team = this.sp[i];
    const handler = team.reduce((b, x) => !b || x.r.hdl + x.r.pas > b.r.hdl + b.r.pas ? x : b, null);
    const roller = team.filter((x) => isBig2(x.p.pos)).reduce((b, x) => !b || Math.max(x.r.ath + x.r.ins, x.r.tp * 2) > Math.max(b.r.ath + b.r.ins, b.r.tp * 2) ? x : b, null);
    for (const x of team) {
      let u = x.base;
      const big = isBig2(x.p.pos);
      switch (m.off.id) {
        case "post":
          if (big) u *= 1.25;
          break;
        case "three":
          if (x.r.tp > 70) u *= 1.12;
          break;
        case "drive":
          if ((x.r.ins + x.r.spd) / 2 > 68) u *= 1.1;
          break;
        case "princeton":
          u = Math.pow(u, 0.7);
          break;
        case "motion":
          u = Math.pow(u, 0.85);
          break;
        case "flex":
          if (x.p.pos === "SF" || x.p.pos === "PF") u *= 1.12;
          break;
        case "pnr":
          if (x === handler) u *= 1.22;
          else if (x === roller) u *= 1.12;
          break;
        case "iso":
          u *= x.p.id === m.starId ? 1.5 : 0.92;
          break;
        case "pace":
          if (isGuard(x.p.pos)) u *= 1.05;
          break;
      }
      if (x.p.pos === "C" && m.off.id !== "post" && !(m.off.id === "pnr" && x === roller)) u *= 0.82;
      if (st.goTo && x.p.id === st.goTo) u *= 1.3;
      x.usage = u;
    }
  }
  // ---------------- public controls ----------------
  setStrategy(team, s) {
    this.strategy[team] = { ...this.strategy[team], ...s };
    this.mods[team] = this.computeMods(team);
    this.applyUsage(team);
  }
  callTimeout(team) {
    if (this.timeouts[team] <= 0 || this.done) return false;
    this.pendingTO[team] = true;
    return true;
  }
  onCourt(team) {
    return this.court[team];
  }
  syncCourt(team) {
    this.court[team] = this.sp[team].filter((x) => x.on);
  }
  get regulationOver() {
    return this.t >= REG;
  }
  get secsLeftInPeriod() {
    return Math.max(0, this.periodEnd - this.t);
  }
  get clockStr() {
    return fmtClock(this.secsLeftInPeriod);
  }
  periodLabel() {
    if (this.period === 1) return "1st";
    if (this.period === 2) return "2nd";
    return this.period === 3 ? "OT" : `${this.period - 2}OT`;
  }
  /** Simulate one possession; returns new events (pbp mode) */
  step() {
    if (this.done) return [];
    const start = this.events.length;
    if (!this.started) {
      this.started = true;
      const w = this.poss;
      if (this.flavor?.crowd) this.emit(-1, "media", this.flavor.crowd, { flavor: true });
      this.emit(-1, "jump", `Tip-off! ${this.setups[w].abbr} wins the opening tip.`);
    }
    this.possession();
    this.afterPossession();
    return this.events.slice(start);
  }
  run() {
    let guard = 0;
    while (!this.done && guard++ < 1e3) this.step();
    return this.boxScore();
  }
  // ---------------- internals ----------------
  emit(team, kind, text, extra = {}) {
    if (!this.pbp) return;
    this.events.push({
      id: this.eid++,
      t: this.t,
      period: this.period,
      clock: this.clockStr,
      team,
      kind,
      text,
      score: [this.score[0], this.score[1]],
      ...extra
    });
  }
  pace() {
    const tempoPace = (tp) => [0, 62.5, 66, 69, 72.5, 76][clamp(Math.round(tp), 1, 5)];
    const [a, b] = this.mods;
    return (tempoPace(this.strategy[0].tempo) + tempoPace(this.strategy[1].tempo)) / 2 + (a.off.pace + a.def.pace + b.off.pace + b.def.pace) / 2;
  }
  advance(dur) {
    const before = this.t;
    this.t += dur;
    for (const team of [0, 1]) {
      const m = this.mods[team];
      const tempoDrain = (1 + (this.strategy[team].tempo - 3) * 0.08 + m.def.drain + m.pressure * 0.04) * (this.setups[team].staminaMul ?? 1);
      for (const x of this.sp[team]) {
        if (x.on) {
          x.secs += dur;
          x.energy = clamp(x.energy - dur / 60 * (2.3 - x.r.sta * 0.012) * tempoDrain, 0, 100);
        } else {
          x.energy = clamp(x.energy + dur / 60 * 3.6, 0, 100);
        }
      }
    }
    if (this.period <= 2) {
      const base = (this.period - 1) * HALF;
      for (const m of [240, 480, 720, 960]) {
        const mark = base + m;
        if (before < mark && this.t >= mark) this.mediaMarks.add(mark);
      }
    }
  }
  trailingMargin(team) {
    return this.score[1 - team] - this.score[team];
  }
  finalPeriod() {
    return this.period >= 2;
  }
  possession() {
    const o = this.poss;
    const d = 1 - o;
    this.possCount[o]++;
    let putback = false;
    let transition = this.nextTransition;
    this.nextTransition = false;
    let shotClock = 30;
    for (let seg = 0; seg < 6; seg++) {
      const remaining = this.periodEnd - this.t;
      if (remaining <= 1) {
        this.t = this.periodEnd;
        return;
      }
      const lead = this.score[o] - this.score[d];
      if (this.finalPeriod() && remaining <= 40 && lead >= 1 && lead <= 9 && remaining > 3) {
        const dur2 = Math.min(remaining - 0.5, rng.range(2, 6));
        this.advance(dur2);
        const fouler = this.pickFouler(d, true);
        const shooter = this.pickFTShooter(o);
        this.commitFoul(d, fouler, `${fouler.short} fouls ${shooter.short} intentionally to stop the clock`);
        const res2 = this.shootFTs(o, shooter, 2);
        if (res2 === "orb") {
          putback = true;
          shotClock = 20;
          continue;
        }
        return;
      }
      const avgSec = 2400 / (2 * this.pace());
      let dur;
      if (putback) dur = rng.range(2, 7);
      else if (transition) dur = rng.range(4, 9);
      else dur = clamp(rng.normal(avgSec + 0.5, 5.2), 5, Math.min(shotClock, 30));
      const milk = this.finalPeriod() && lead > 0 && remaining < 70;
      if (milk && !putback) dur = Math.min(Math.max(dur, 24), shotClock - 1);
      if (this.finalPeriod() && lead < 0 && remaining < 60 && !putback) dur = Math.min(dur, rng.range(4, 10));
      let buzzer = false;
      if (dur >= remaining - 0.3) {
        dur = Math.max(0, remaining - rng.range(0.2, 1.5));
        buzzer = true;
      }
      this.advance(dur);
      shotClock -= dur;
      if (!buzzer && this.turnover(o, d, transition)) return;
      if (!buzzer && rng.chance(Math.max(0.03, 0.075 + this.mods[d].def.foul + this.mods[d].pressure * 8e-3))) {
        const fouler = this.pickFouler(d, false);
        this.commitFoul(d, fouler, `Foul on ${fouler.short}`);
        if (this.teamFouls[d] >= 7) {
          const shooter = this.pickShooter(o);
          const res2 = this.teamFouls[d] >= 10 ? this.shootFTs(o, shooter, 2) : this.shootFTs(o, shooter, 2, true);
          if (res2 === "orb") {
            putback = true;
            shotClock = 20;
            continue;
          }
          return;
        }
        shotClock = Math.max(shotClock, 20);
        continue;
      }
      const forceThree = this.finalPeriod() && lead >= -3 && lead <= -3 && remaining < 15;
      const res = this.shoot(o, d, { transition, putback, buzzer, forceThree });
      if (buzzer) {
        this.t = this.periodEnd;
        return;
      }
      if (res === "orb") {
        putback = true;
        transition = false;
        shotClock = 20;
        continue;
      }
      return;
    }
  }
  turnover(o, d, transition) {
    const on = this.onCourt(o), don = this.onCourt(d);
    let secN = 0, secD = 0, pressure = 0, fatigue = 0;
    for (const x of on) {
      secN += (x.r.hdl * 0.55 + x.r.pas * 0.2 + x.r.iq * 0.25) * x.usage;
      secD += x.usage;
      fatigue += Math.max(0, 70 - x.energy);
    }
    for (const x of don) pressure += x.r.stl * 0.5 + x.r.perD * 0.5;
    const sec = secN / secD;
    pressure /= don.length;
    fatigue /= on.length;
    let p = 0.16 + (pressure - sec) * 12e-4 + fatigue * 2e-3;
    const mo = this.mods[o], md = this.mods[d];
    p += md.def.tov + md.defTov + mo.off.tov + mo.offTov + md.pressure * 6e-3;
    if (transition) p += 0.02;
    if (!this.neutral) p += o === 0 ? -6e-3 : 6e-3;
    p -= this.setups[o].coachTactics * 15e-4;
    p -= (this.setups[o].chem ?? 0) * 6e-3;
    p += this.setups[d].pressure ?? 0;
    p = clamp(p, 0.07, 0.32);
    if (!rng.chance(p)) return false;
    const culprit = pickW(on, (x) => x.usage * (1.35 - x.r.hdl / 100));
    culprit.box.tov++;
    const pSteal = clamp(0.5 + (pressure - 60) * 8e-3 + md.def.steal + md.pressure * 0.04, 0.3, 0.75);
    if (rng.chance(pSteal)) {
      const thief = pickW(don, (x) => Math.exp((x.r.stl - 60) * 0.06));
      thief.box.stl++;
      this.nextTransition = rng.chance(0.55);
      if (this.pbp) this.emit(d, "steal", rng.pick([
        `${thief.short} picks the pocket of ${culprit.short}!`,
        `Steal by ${thief.short} \u2014 jumps the passing lane!`,
        `${culprit.short} loses it, ${thief.short} with the steal`
      ]), { pid: thief.p.id, big: this.nextTransition });
    } else {
      if (this.pbp) this.emit(o, "tov", rng.pick([
        `Turnover \u2014 ${culprit.short} travels`,
        `Offensive foul on ${culprit.short}`,
        `${culprit.short} throws it away`,
        `Shot clock violation on ${this.setups[o].abbr}`,
        `${culprit.short} steps out of bounds`,
        `Bad pass by ${culprit.short}`
      ]), { pid: culprit.p.id });
      this.deadBall();
    }
    this.runPts[d] += 0;
    return true;
  }
  pickShooter(o) {
    const boxed = this.mods[1 - o].def.id === "boxone" ? this.mods[o].starId : null;
    return pickW(this.onCourt(o), (x) => x.p.id === boxed ? x.usage * 0.7 : x.usage);
  }
  pickFTShooter(o) {
    const on = this.onCourt(o);
    if (rng.chance(0.6)) {
      let b = on[0];
      for (const x of on) if (x.r.ft > b.r.ft) b = x;
      return b;
    }
    return this.pickShooter(o);
  }
  pickFouler(d, intentional) {
    return pickW(this.onCourt(d), (x) => intentional ? 1 : (1.4 - x.r.perD / 100) * (x.p.traits.includes("hothead") ? 1.4 : 1) * (x.fouls >= 4 ? 0.3 : 1));
  }
  commitFoul(d, fouler, text) {
    fouler.fouls++;
    fouler.box.pf++;
    this.teamFouls[d]++;
    if (this.pbp) this.emit(d, "foul", text + (fouler.fouls >= 4 && fouler.fouls < 5 ? ` (${fouler.fouls} fouls)` : ""), { pid: fouler.p.id });
    if (fouler.fouls >= 5) {
      fouler.out = true;
      this.emit(d, "foul", `${fouler.short} has fouled out!`, { pid: fouler.p.id, big: true });
      if (fouler.on) this.forceSub(d, fouler);
    }
  }
  forceSub(team, outP) {
    const bench = this.sp[team].filter((x) => !x.on && !x.out);
    if (!bench.length) return;
    const sameType = bench.filter((x) => isBig2(x.p.pos) === isBig2(outP.p.pos));
    const pool = sameType.length ? sameType : bench;
    const inP = pool.sort((a, b) => b.p.ovr + b.energy * 0.1 - (a.p.ovr + a.energy * 0.1))[0];
    outP.on = false;
    inP.on = true;
    this.syncCourt(team);
    if (this.pbp) this.emit(team, "sub", `${inP.short} checks in for ${outP.short}`);
  }
  chooseType(x, o, d, ctx) {
    if (ctx.forceThree) return "three";
    if (ctx.putback) return rng.chance(0.82) ? "rim" : "mid";
    if (ctx.buzzer && this.periodEnd - this.t < 2.5) return "three";
    const r = x.r;
    const fin = r.ins * 0.6 + r.ath * 0.25 + r.str * 0.15;
    let wr = Math.exp((fin - 60) * 0.04) * 1;
    let wm = Math.exp((r.mid - 60) * 0.035) * 0.62;
    let wt = r.tp < 45 ? 0.02 : Math.exp((r.tp - 60) * 0.075) * 1.05;
    const mo = this.mods[o], md = this.mods[d];
    wr *= mo.off.id === "post" ? isBig2(x.p.pos) ? 1.35 : 1.05 : mo.off.mix.rim;
    wm *= mo.off.mix.mid;
    wt *= mo.off.mix.three;
    wr *= md.def.mix.rim;
    wm *= md.def.mix.mid;
    wt *= md.def.mix.three;
    wt *= 1 + 0.12 * mo.shotProfile;
    wr *= 1 - 0.07 * mo.shotProfile;
    wm *= 1 - 0.05 * mo.shotProfile;
    wt *= 1 + 0.06 * md.help;
    wr *= 1 - 0.05 * md.help;
    if (ctx.transition) {
      wr *= 1.8;
      wt *= 1.1;
    }
    return rng.weighted(["rim", "mid", "three"], [wr, wm, wt]);
  }
  matchup(x, d) {
    const don = this.onCourt(d);
    const same = don.filter((y) => y.p.pos === x.p.pos);
    if (same.length) return same[0];
    const sim = don.filter((y) => isBig2(y.p.pos) === isBig2(x.p.pos));
    return (sim.length ? sim : don)[0];
  }
  shoot(o, d, ctx) {
    const shooter = ctx.putback && rng.chance(0.65) ? pickW(this.onCourt(o), (x) => Math.exp((x.r.reb - 60) * 0.05)) : this.pickShooter(o);
    const type = this.chooseType(shooter, o, d, ctx);
    const def = this.matchup(shooter, d);
    const don = this.onCourt(d);
    const r = shooter.r;
    const remaining = this.periodEnd - this.t;
    const lead = this.score[o] - this.score[d];
    const mo = this.mods[o], md = this.mods[d];
    let p;
    if (type === "rim") {
      const fin = r.ins * 0.55 + r.ath * 0.25 + r.str * 0.2;
      let prot = 0;
      for (const y of don) prot = Math.max(prot, y.r.intD * 0.6 + y.r.blk * 0.4);
      const rimD = prot * 0.45 + (def.r.intD * 0.5 + def.r.perD * 0.5) * 0.55;
      p = 0.575 + (fin - rimD) * 26e-4;
      if (ctx.transition) p += 0.1;
      if (ctx.putback) p += 0.03;
      p += md.pressure * 6e-3 - md.help * 8e-3;
    } else if (type === "mid") {
      p = 0.385 + (r.mid - def.r.perD) * 21e-4;
    } else {
      p = 0.322 + (r.tp - (def.r.perD * 0.6 + 62 * 0.4)) * 26e-4;
      if (ctx.transition) p += 0.03;
      p += md.help * 6e-3;
    }
    p += mo.off.make[type] + md.def.make[type] + mo.offExec + md.defExec + counterEdge(mo.off.id, md.def.id);
    if (md.def.id === "boxone" && shooter.p.id === mo.starId) p -= 0.025;
    p += (r.iq - 65) * 6e-4;
    p += this.setups[o].coachTactics * 18e-4 - this.setups[d].coachTactics * 12e-4 - (this.setups[d].defBonus ?? 0);
    p -= Math.max(0, 72 - shooter.energy) * 22e-4;
    if (!this.neutral) p += (o === 0 ? 1 : -1) * (8e-3 + this.crowd * 8e-3);
    if (this.runPts[o] >= 7) p += 0.012;
    const clutchTime = this.finalPeriod() && remaining < 150 && Math.abs(lead) <= 6;
    if (clutchTime) {
      p += (this.setups[o].chem ?? 0) * 0.02;
      if (shooter.p.traits.includes("clutch")) p += 0.05;
      else p -= (70 - Math.min(70, r.iq)) * 1e-3;
    }
    if (ctx.buzzer && remaining < 2.5) p *= type === "three" ? 0.45 : 0.6;
    p = clamp(p, 0.08, 0.86);
    const three = type === "three";
    const dist2 = type === "rim" ? rng.range(0, 4) : type === "mid" ? rng.range(8, 19) : rng.range(22, 26.5);
    let pFoul = type === "rim" ? 0.215 + (r.ins + r.str - def.r.intD - def.r.str) * 1e-3 : type === "mid" ? 0.065 : 0.018;
    if (def.p.traits.includes("hothead")) pFoul *= 1.25;
    pFoul *= mo.off.foulDraw * md.def.shootFoul;
    if (!this.neutral) pFoul *= o === 0 ? 1.06 : 0.94;
    pFoul = clamp(pFoul, 5e-3, 0.3);
    const fouled = !ctx.buzzer && rng.chance(pFoul);
    const blocker = type !== "three" ? pickW(don, (y) => Math.exp((y.r.blk - 60) * 0.07)) : def;
    const pBlk = type === "rim" ? clamp(0.075 + (blocker.r.blk - r.ath * 0.5 - r.ins * 0.5 + 10) * 28e-4, 0.02, 0.2) : type === "mid" ? 0.03 : 8e-3;
    const loc = this.shotLoc(type, dist2);
    if (fouled) {
      this.commitFoul(d, def, `Shooting foul on ${def.short}`);
      const made2 = rng.chance(p * 0.42);
      if (made2) {
        this.recordFG(o, shooter, type, true, loc, d);
        if (this.pbp) this.emit(o, "make", `AND-ONE! ${shooter.short} ${this.makeText(shooter, type, null)} through the contact`, { pid: shooter.p.id, pts: three ? 3 : 2, shot: { ...loc, made: true, three }, big: true });
        const res2 = this.shootFTs(o, shooter, 1);
        return res2 === "orb" ? "orb" : res2 === "drb" ? "drb" : "made";
      }
      const res = this.shootFTs(o, shooter, three ? 3 : 2);
      return res === "orb" ? "orb" : res === "drb" ? "drb" : "ft";
    }
    if (type !== "three" && rng.chance(pBlk)) {
      blocker.box.blk++;
      this.recordFG(o, shooter, type, false, loc, d);
      if (this.pbp) this.emit(d, "block", rng.pick([`${blocker.short} SWATS ${shooter.short}!`, `Rejected! ${blocker.short} with the block`, `${blocker.short} protects the rim \u2014 blocked!`]), { pid: blocker.p.id, shot: { ...loc, made: false, three }, big: true });
      return this.rebound(o, d, 0.22);
    }
    const made = rng.chance(p);
    this.recordFG(o, shooter, type, made, loc, d);
    if (made) {
      let assister = null;
      const pAst = (type === "three" ? 0.8 : type === "rim" ? 0.5 : 0.36) + mo.off.ast - (ctx.putback ? 0.4 : 0);
      if (rng.chance(clamp(pAst, 0, 0.9))) {
        assister = pickW(this.onCourt(o), (y) => y === shooter ? 0 : Math.exp((y.r.pas - 60) * 0.07));
        assister.box.ast++;
      }
      const pts = three ? 3 : 2;
      const lateBig = this.finalPeriod() && remaining < 30 && Math.abs(this.score[o] - this.score[d]) <= 3;
      const buzzerBeater = ctx.buzzer && remaining < 3;
      if (this.pbp) {
        let text = `${shooter.short} ${this.makeText(shooter, type, assister)}`;
        if (buzzerBeater) text = `AT THE BUZZER! ${text}!`;
        this.emit(o, "make", text, { pid: shooter.p.id, pts, shot: { ...loc, made: true, three }, big: buzzerBeater || lateBig || type === "rim" && shooter.r.ath > 80 && rng.chance(0.3) });
      }
      this.deadBall();
      return "made";
    }
    if (this.pbp) this.emit(o, "miss", `${shooter.short} ${this.missText(type, dist2)}`, { pid: shooter.p.id, shot: { ...loc, made: false, three } });
    return this.rebound(o, d, 0);
  }
  shotLoc(type, dist2) {
    let ang;
    if (type === "three" && rng.chance(0.3)) {
      const side = rng.chance(0.5) ? -1 : 1;
      return { x: side * rng.range(21.5, 23.5), y: rng.range(1, 8) };
    }
    ang = rng.range(-Math.PI * 0.48, Math.PI * 0.48);
    const x = Math.sin(ang) * dist2;
    const y = 5.25 + Math.cos(ang) * dist2;
    return { x: clamp(x, -24.5, 24.5), y: clamp(y, 0.5, 40) };
  }
  makeText(x, type, ast) {
    const a = ast ? ` (${ast.short} assist)` : "";
    if (type === "rim") {
      if (x.r.ath > 74 && rng.chance(0.35)) {
        if (ast && rng.chance(0.4)) return `throws down the alley-oop from ${ast.short}!`;
        return rng.pick(["throws it down! \u{1F4A5}", "with a thunderous slam!", "hammers home the dunk!"]) + a;
      }
      return rng.pick(["finishes at the rim", "scores in the post", "with the layup", "converts the reverse layup", "drops in the floater", "muscles it in"]) + a;
    }
    if (type === "mid") return rng.pick(["hits the pull-up jumper", "drains the turnaround J", "knocks down the elbow jumper", "buries the fadeaway", "hits from mid-range"]) + a;
    return rng.pick(["drills the three! \u{1F3AF}", "BANG! From downtown", "hits from the corner", "cashes the triple", "splashes a deep three", "knocks down the open three"]) + a;
  }
  missText(type, dist2) {
    if (type === "rim") return rng.pick(["misses the layup", "can\u2019t finish at the rim", "layup rolls off", "misses in the paint"]);
    if (type === "mid") return `misses a ${Math.round(dist2)}-footer`;
    return rng.pick(["misses the three", "three rims out", "airballs from deep", "misses from beyond the arc"]);
  }
  recordFG(o, x, type, made, loc, d) {
    x.box.fga++;
    if (type === "three") x.box.tpa++;
    if (this.pbp) this.shots.push({ team: o, x: Math.round(loc.x * 10) / 10, y: Math.round(loc.y * 10) / 10, made, three: type === "three", pid: x.p.id });
    if (made) {
      x.box.fgm++;
      const pts = type === "three" ? 3 : 2;
      if (type === "three") x.box.tpm++;
      this.addPoints(o, x, pts);
    }
  }
  addPoints(o, x, pts) {
    const d = 1 - o;
    x.box.pts += pts;
    this.score[o] += pts;
    for (const y of this.onCourt(o)) y.box.pm += pts;
    for (const y of this.onCourt(d)) y.box.pm -= pts;
    this.runPts[o] += pts;
    this.runPts[d] = 0;
    const lead = this.score[o] - this.score[d];
    if (lead > this.largestLead[o]) this.largestLead[o] = lead;
    const leader = this.score[0] === this.score[1] ? -1 : this.score[0] > this.score[1] ? 0 : 1;
    this.lastLeader = leader;
    if (this.pbp) this.flow.push([Math.round(this.t), this.score[0], this.score[1]]);
  }
  shootFTs(o, x, n, oneAndOne = false) {
    const d = 1 - o;
    let p = clamp(x.r.ft / 100 * 0.95 + 0.035, 0.3, 0.95);
    const remaining = this.periodEnd - this.t;
    if (this.finalPeriod() && remaining < 60 && Math.abs(this.score[0] - this.score[1]) <= 5) {
      p += (x.p.traits.includes("clutch") ? 0.04 : -0.03) + (this.setups[o].chem ?? 0) * 0.015;
      if (!this.neutral && o === 1) p -= 0.015;
    }
    let lastMade = false;
    const total = n;
    for (let i = 0; i < n; i++) {
      const made = rng.chance(p);
      x.box.fta++;
      if (made) {
        x.box.ftm++;
        this.addPoints(o, x, 1);
        if (this.pbp) this.emit(o, "ft", `${x.short} makes free throw ${i + 1} of ${oneAndOne ? "1-and-1" : total}`, { pid: x.p.id, pts: 1 });
        if (oneAndOne && i === 0) n = 2;
      } else {
        if (this.pbp) this.emit(o, "ftmiss", `${x.short} misses free throw ${i + 1} of ${oneAndOne ? "1-and-1" : total}`, { pid: x.p.id });
        if (oneAndOne && i === 0) {
          lastMade = false;
          break;
        }
      }
      lastMade = made;
    }
    if (lastMade) {
      this.deadBall();
      return "made";
    }
    const res = this.rebound(o, d, -0.15);
    return res === "orb" ? "orb" : "drb";
  }
  rebound(o, d, mod) {
    const on = this.onCourt(o), don = this.onCourt(d);
    const rs = (arr) => {
      let s = 0;
      for (const x2 of arr) s += x2.r.reb * 0.7 + x2.r.str * 0.15 + x2.r.ath * 0.15;
      return s / arr.length;
    };
    let p = 0.295 + (rs(on) - rs(don)) * 2e-3 + mod;
    p += this.mods[o].off.orb + this.mods[d].def.orbAllowed + this.mods[o].crash * 0.022;
    p = clamp(p, 0.08, 0.5);
    if (rng.chance(p)) {
      const x2 = pickW(on, (y) => Math.exp((y.r.reb - 60) * 0.06));
      x2.box.orb++;
      if (this.pbp) this.emit(o, "oreb", `${x2.short} grabs the offensive rebound`, { pid: x2.p.id });
      return "orb";
    }
    const x = pickW(don, (y) => Math.exp((y.r.reb - 60) * 0.06));
    x.box.drb++;
    if (this.pbp) this.emit(d, "dreb", `${x.short} with the defensive board`, { pid: x.p.id });
    if (rng.chance(clamp(0.14 * this.mods[d].off.transition + this.mods[o].crash * 0.03, 0.02, 0.4))) this.nextTransition = true;
    return "drb";
  }
  deadBall() {
    for (const team of [0, 1]) {
      if (this.pendingTO[team] && this.timeouts[team] > 0) {
        this.pendingTO[team] = false;
        this.timeouts[team]--;
        this.runPts[1 - team] = 0;
        for (const x of this.sp[team]) x.energy = clamp(x.energy + 6, 0, 100);
        this.emit(team, "timeout", `Timeout, ${this.setups[team].name}.`);
        this.subs(team, true);
      }
    }
    for (const team of [0, 1]) {
      const opp = 1 - team;
      if (this.runPts[opp] >= 9 && this.timeouts[team] > 1 && !this.setupsIsUser(team) && this.t < REG - 120) {
        this.timeouts[team]--;
        this.runPts[opp] = 0;
        for (const x of this.sp[team]) x.energy = clamp(x.energy + 6, 0, 100);
        this.emit(team, "timeout", `${this.setups[team].abbr} calls timeout to stop a ${this.score[opp]}-${this.score[team]} run.`);
        this.subs(team, true);
      }
    }
    if (this.mediaMarks.size) {
      this.mediaMarks.clear();
      for (const team of [0, 1]) for (const x of this.sp[team]) x.energy = clamp(x.energy + 5, 0, 100);
      this.emit(-1, "media", `Media timeout \u2014 ${this.setups[0].abbr} ${this.score[0]}, ${this.setups[1].abbr} ${this.score[1]}`);
      this.subs(0, true);
      this.subs(1, true);
      return;
    }
    for (const team of [0, 1]) {
      if (this.t - this.lastSub[team] >= (this.pbp ? 50 : 70)) this.subs(team, false);
    }
  }
  userTeam = -1;
  setupsIsUser(team) {
    return this.userTeam === team;
  }
  subs(team, force) {
    this.lastSub[team] = this.t;
    const all = this.sp[team].filter((x) => !x.out && x.p.injury == null);
    if (all.length <= 5) return;
    const remaining = this.periodEnd - this.t;
    const margin = Math.abs(this.score[0] - this.score[1]);
    const late = this.period >= 2 && remaining < 240 && margin <= 12 || this.period >= 3;
    const garbage = this.period >= 2 && remaining < 330 && margin >= 22;
    const elapsedFrac = Math.min(this.t, REG) / REG;
    let avgOvr = 0;
    for (const x of all) avgOvr += x.p.ovr;
    avgOvr /= all.length;
    const prio = (x) => {
      if (garbage) return x.depth + (x.on ? 0.5 : 0) + x.energy * 0.01;
      const trouble = this.period === 1 && x.fouls >= 2 && remaining > 120 || this.period === 2 && x.fouls >= 3 && remaining > 600 || this.period === 2 && x.fouls >= 4 && remaining > 240;
      if (late) return x.p.ovr * 1 + x.energy * 0.12 - (x.fouls >= 4 ? 4 : 0) + (x.target > 0 ? 3 : -20);
      if (x.target <= 0) return -50 + x.p.ovr * 0.1;
      const expected = x.target * elapsedFrac;
      const deficit = expected - x.secs / 60;
      let s = deficit * 1 + (x.energy - 72) * 0.07 + (x.p.ovr - avgOvr) * 0.05;
      if (x.on) s += 0.9;
      if (trouble) s -= 8;
      return s;
    };
    const scored = all.map((x) => ({ x, s: prio(x) }));
    scored.sort((a, b) => b.s - a.s);
    const ordered = scored.map((o) => o.x);
    let same = true;
    for (let i = 0; i < 5; i++) if (!ordered[i].on) {
      same = false;
      break;
    }
    if (same && !force) return;
    const lineup = pickLineup(ordered);
    const changes = [];
    const outs = this.sp[team].filter((x) => x.on && !lineup.includes(x));
    const ins = lineup.filter((x) => !x.on);
    for (let i = 0; i < Math.min(outs.length, ins.length); i++) changes.push([ins[i], outs[i]]);
    for (const x of this.sp[team]) x.on = lineup.includes(x);
    this.syncCourt(team);
    if (changes.length && this.pbp) {
      const txt = changes.map(([a, b]) => `${a.short} in for ${b.short}`).join(" \xB7 ");
      this.emit(team, "sub", `Substitution ${this.setups[team].abbr}: ${txt}`);
    }
  }
  afterPossession() {
    this.poss = 1 - this.poss;
    if (this.flavor?.closer && !this.closerSaid && this.period === 2 && this.t >= REG - 180 && this.t < REG - 5 && this.score[0] - this.score[1] >= 12) {
      this.closerSaid = true;
      this.emit(-1, "media", this.flavor.closer, { flavor: true });
    }
    if (this.t >= this.periodEnd - 1) {
      this.endPeriod();
    }
  }
  endPeriod() {
    if (this.period === 1) {
      this.halfScore = [this.score[0], this.score[1]];
      this.emit(-1, "period", `End of 1st half: ${this.setups[0].abbr} ${this.score[0]}, ${this.setups[1].abbr} ${this.score[1]}`);
      this.period = 2;
      this.t = HALF;
      this.periodEnd = REG;
      this.teamFouls = [0, 0];
      for (const team of [0, 1]) {
        for (const x of this.sp[team]) x.energy = clamp(x.energy + 35, 0, 100);
        this.restartLineup(team);
      }
      this.poss = rng.chance(0.5) ? 0 : 1;
      return;
    }
    if (this.score[0] === this.score[1]) {
      this.emit(-1, "period", `End of ${this.periodLabel()} \u2014 tied at ${this.score[0]}. We're going to overtime!`, { big: true });
      this.period++;
      this.t = this.periodEnd;
      this.periodEnd += OT;
      this.timeouts = [Math.min(this.timeouts[0] + 1, 3), Math.min(this.timeouts[1] + 1, 3)];
      for (const team of [0, 1]) for (const x of this.sp[team]) x.energy = clamp(x.energy + 10, 0, 100);
      this.poss = rng.chance(0.5) ? 0 : 1;
      return;
    }
    this.done = true;
    const w = this.score[0] > this.score[1] ? 0 : 1;
    this.emit(-1, "final", `FINAL${this.period > 2 ? this.period === 3 ? "/OT" : `/${this.period - 2}OT` : ""}: ${this.setups[w].name} wins ${Math.max(...this.score)}-${Math.min(...this.score)}`, { big: true });
  }
  restartLineup(team) {
    const avail = this.sp[team].filter((x) => !x.out);
    const ordered = [...avail].sort((a, b) => a.depth - b.depth - (b.energy - a.energy) * 0.01);
    const lineup = pickLineup(ordered.filter((x) => x.fouls < 4).concat(ordered.filter((x) => x.fouls >= 4)));
    for (const x of this.sp[team]) x.on = lineup.includes(x);
    this.syncCourt(team);
    this.lastSub[team] = this.t;
  }
  boxScore() {
    const players = this.sp.map(
      (team) => team.filter((x) => x.secs > 0 || x.box.starter).map((x) => ({ ...x.box, min: Math.round(x.secs / 60) }))
    );
    return {
      gameId: "",
      home: this.setups[0].id,
      away: this.setups[1].id,
      hs: this.score[0],
      as: this.score[1],
      ot: Math.max(0, this.period - 2),
      poss: Math.round((this.possCount[0] + this.possCount[1]) / 2),
      players,
      half: this.halfScore,
      flow: this.flow,
      largestLead: this.largestLead,
      shots: this.shots
    };
  }
  /** Win probability for home team using score, time and a pregame spread (home margin) */
  winProb(pregameSpread) {
    const remaining = Math.max(0, REG - this.t) + (this.period > 2 ? this.periodEnd - this.t : 0);
    const frac = remaining / REG;
    const margin = this.score[0] - this.score[1];
    if (this.done) return margin > 0 ? 1 : 0;
    const mu = margin + pregameSpread * frac;
    const sd = Math.max(0.5, 11.5 * Math.sqrt(Math.max(frac, 5e-4)));
    return normCdf(mu / sd);
  }
};
function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const dd = 0.3989423 * Math.exp(-z * z / 2);
  let p = dd * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p;
}
function simulateGame(home, away, opts = {}) {
  const g = new GameSim(home, away, opts);
  return g.run();
}

// src/engine/types.ts
var RATING_KEYS = ["ins", "mid", "tp", "ft", "pas", "hdl", "perD", "intD", "stl", "blk", "reb", "ath", "spd", "str", "sta", "iq"];

// src/data/names.ts
var FIRST_NAMES = `Aaron Abdul Adrian Ahmad Aiden AJ Alex Alijah Amari Andre Andrew Anthony Antonio Ar'Mon Armani Austin Avery
Bennett Blake Bo Bradley Brandon Braylon Brayden Brennan Brice Bronny Bryce Caleb Calvin Cam Camden Carlos Carson Carter Cason
Chance Chase Chris Christian Cole Collin Colton Connor Cooper Corey Cormac Curtis Dalen Dallas Damarion Damian Damon Dante Darius
Darnell Darryl DaShawn David Davion Dawson Deandre Declan Dejon Demarcus Demetrius Deontae Derek Derrick Desmond Devin Dexter Dillon
Dominic Donovan Drew Dwayne Dylan Eli Elijah Elliot Emanuel Emmanuel Eric Ethan Evan Ezra Finn Gabe Garrett Gavin Grant Hakeem
Hayden Hudson Hunter Ian Isaac Isaiah Ismael Jabari Jace Jackson Jacob Jaden Jahmir Jakobe Jalen Jamal Jamari Jameer James Jamir
Jared Jarrett Jase Jason Javon Jay Jaylen Jaylin Jayden Jeremiah Jermaine Jerome Jett Jordan Joel Johnny Jonah Jonas Jordan Josh
Joshua Josiah Juan JuJu Julian Justin Kadin Kai Kaleb Kam Kameron Karim Keegan Keion Keith Kellen Kendall Kendrick Kenny Keon
Kevin Khalil Khamari King Kobe Kody Kris Kyle Kylan Kyree Lamar Landon Lance Langston Lawson Leon Liam Logan Lonnie Lorenzo Luca
Lucas Luke Malachi Malik Marcus Mario Mark Marquis Mason Matt Max Micah Michael Miles Milan Mookie Myles Nasir Nate Nathan Nick
Nico Noah Nolan Omar Owen Parker Patrick Payton Preston Quentin Quincy Quinten RJ Rashad Ray Reed Reggie Rhys Ricky Riley Robert
Rodney Roman Ryan Ryder Sam Santiago Saquan Sean Seth Shamar Shane Silas Spencer Stephon Sterling Tae Talen Tanner Terrance Terrell
Tevin Theo Tim Tony Trae Travis Trayce Tre Trent Trevon Tristan Ty Tyler Tyrese Tyson Victor Vince Walker Wes Will Xavier Zach
Zaire Zion Kasen Jahlil Dior Mekhi Trey Quinn Bryson Jaylon Taj Ahmir Amare Cayden Daylen Elias Ronan Mateo Kingston Jeremy Isaiah`.split(/\s+/).filter(Boolean);
var LAST_NAMES = `Adams Alexander Allen Anderson Armstrong Atkins Bailey Baker Banks Barnes Bates Battle Bell Bennett Berry Bishop
Black Blackwell Boone Bowman Boyd Bradley Brewer Brooks Brown Bryant Burke Burns Butler Byrd Caldwell Campbell Carr Carter Chambers
Chandler Chapman Clark Cobb Coleman Collins Cook Cooper Copeland Cox Crawford Cross Cunningham Curry Daniels Davidson Davis Dawson
Dean Dixon Douglas Duncan Dunn Edwards Ellis Evans Fields Fisher Fleming Fletcher Ford Foster Fowler Franklin Freeman Fuller
Gaines Garner Garrett Gibson Gilbert Gilmore Gordon Graham Grant Graves Gray Green Greene Griffin Hairston Hall Hamilton Hammond
Hampton Harper Harris Hart Hawkins Hayes Haynes Henderson Henry Hicks Hill Hines Holland Holloway Holmes Hood Hopkins Horton
Howard Hudson Hughes Hunt Hunter Ingram Jackson James Jefferson Jenkins Johnson Jones Jordan Keller Kelly Kennedy King Knight
Lambert Lane Lawson Lee Lewis Little Livingston Long Love Lyons Mack Maddox Marshall Martin Mason Matthews Maxwell McCall McCoy
McDaniel McGee McKenzie McKinney McNeil Meadows Miles Miller Mitchell Monroe Moore Morgan Morris Moss Murphy Murray Myers Nash
Nelson Newton Nichols Norman Norris Oliver Owens Palmer Parker Patterson Payne Pearson Perkins Perry Peters Phillips Pierce Porter
Powell Price Pruitt Quarles Ramsey Randall Ray Reed Reese Reid Rhodes Rice Richards Richardson Riley Rivers Roberts Robinson
Rogers Ross Russell Sanders Scott Sharp Shaw Simmons Simpson Sims Singleton Smith Snow Spencer Stanley Steele Stephens Stewart
Stokes Stone Sullivan Sutton Tate Taylor Terry Thomas Thompson Tillman Townsend Tucker Turner Underwood Vaughn Wade Walker Wallace
Walton Ward Ware Warren Washington Waters Watkins Watson Weaver Webb Wells West Wheeler White Whitfield Wilkins Williams Willis
Wilson Winston Wise Wood Woods Wright Young Bridges Okafor Mbeki Nwosu Adebayo Diallo Traore Kone Mensah Okoro Achiuwa Bamba
Gallagher Kowalski Novak Lindqvist Rossi Moretti Romero Hernandez Martinez Garcia Lopez Rodriguez Gonzalez Ortiz Castillo Vega
Morales Reyes Cruz Flores Rivera Sullivan O'Brien Murphy McCarthy Kearney Fitzgerald Schmidt Muller Fischer Weber Wagner Becker
Hoffman Klein Wolfe Zimmerman Kim Park Nguyen Tran Chen Liu Patel Shah Singh Khan Ali Hassan Ibrahim Yusuf Abdi Mohamed Farah
Thornton Whitaker Pritchard Langford Ashby Calloway Beasley Mayfield Dorsey Gentry Hargrove Lockhart Merritt Rollins Sheppard
Stallworth Tolliver Vick Wilder Yancey Boykin Burrell Cheatham Dupree Fairley Givens Hollins Ivory Joyner Kirkland Lattimore
Mosley Noble Odom Pettiford Redmond Swanson Tatum Upshaw Varner Whitlock Battle Grier Bey Moody Stroud Hightower Strickland`.split(/\s+/).filter(Boolean);
var INTL_POOLS = [
  { country: "Canada", weight: 6, first: ["Liam", "Ethan", "Jamal", "Olivier", "Shai", "Andrew", "Bennedict", "Zach", "Elijah", "Luguentz", "RJ", "Trey"], last: ["Tremblay", "Gagnon", "Roy", "Boucher", "Nembhard", "Murray", "Brooks", "Edey", "Mathurin", "Dort", "Alexander", "Barrett"] },
  { country: "Australia", weight: 4, first: ["Josh", "Dyson", "Jock", "Matisse", "Lachlan", "Will", "Tyrese", "Jack", "Mitch", "Angus"], last: ["Giddey", "Daniels", "Landale", "Thybulle", "Exum", "Ingles", "McVeigh", "Creek", "Bairstow", "Kay"] },
  { country: "France", weight: 4, first: ["Victor", "Th\xE9o", "Hugo", "Mathis", "Rudy", "Zaccharie", "Bilal", "Ousmane", "Nolan", "Tidjane"], last: ["Dubois", "Laurent", "Moreau", "Lef\xE8vre", "Coulibaly", "Risacher", "Sarr", "Traor\xE9", "Diabat\xE9", "Fontaine"] },
  { country: "Serbia", weight: 3, first: ["Nikola", "Luka", "Bogdan", "Stefan", "Marko", "Aleksa", "Filip", "Vasilije"], last: ["Jovi\u0107", "Petrovi\u0107", "Markovi\u0107", "Nikoli\u0107", "\u0110or\u0111evi\u0107", "Stojanovi\u0107", "Ili\u0107", "Pavlovi\u0107"] },
  { country: "Lithuania", weight: 2, first: ["Domantas", "Jonas", "Rokas", "Matas", "Arnas", "Tadas", "Mantas"], last: ["Kazlauskas", "Jank\u016Bnas", "Butkevi\u010Dius", "\u017Dukauskas", "Petrauskas", "Grigonis"] },
  { country: "Spain", weight: 3, first: ["Pau", "Sergio", "\xC1lvaro", "Hugo", "Juan", "Santi", "Izan", "Rub\xE9n"], last: ["Garc\xEDa", "Fern\xE1ndez", "L\xF3pez", "Mart\xEDnez", "S\xE1nchez", "Navarro", "Abrines", "Almansa"] },
  { country: "Nigeria", weight: 4, first: ["Chukwuemeka", "Oluwaseun", "Emeka", "Ifeanyi", "Tobi", "Femi", "Chidi", "Kelechi", "Ikenna", "Ayo"], last: ["Okafor", "Okeke", "Adeyemi", "Okonkwo", "Nwankwo", "Eze", "Obi", "Adebayo", "Okoro", "Achebe"] },
  { country: "Senegal", weight: 2, first: ["Mamadou", "Cheikh", "Moustapha", "Ibrahima", "Pape", "Babacar"], last: ["Diop", "Ndiaye", "Fall", "Sow", "Gueye", "Diallo"] },
  { country: "Germany", weight: 3, first: ["Franz", "Moritz", "Jonas", "Lukas", "Johannes", "Ariel", "Tristan", "Niklas"], last: ["Wagner", "Schr\xF6der", "Hartenstein", "Bonga", "Theis", "Obst", "Lo", "Kr\xE4mer"] },
  { country: "Greece", weight: 1, first: ["Giannis", "Nikos", "Kostas", "Georgios", "Dimitris"], last: ["Papadopoulos", "Papanikolaou", "Kalaitzakis", "Sloukas", "Mitoglou"] },
  { country: "Croatia", weight: 1, first: ["Dario", "Ivica", "Mario", "Ante", "Luka"], last: ["\u0160ari\u0107", "Zubac", "Hezonja", "Bogdanovi\u0107", "Ivanovi\u0107"] },
  { country: "Latvia", weight: 1, first: ["Kristaps", "D\u0101vis", "Rolands", "Art\u016Brs"], last: ["Porzi\u0146\u0123is", "Bert\u0101ns", "\u0160mits", "\u017Dagars"] },
  { country: "Finland", weight: 1, first: ["Lauri", "Miro", "Elias", "Sasu"], last: ["Markkanen", "Little", "Valtonen", "Salin"] },
  { country: "Cameroon", weight: 2, first: ["Joel", "Pascal", "Christian", "Yves", "Ulrich"], last: ["Embiid", "Siakam", "Koloko", "Mbah", "Ngando"] },
  { country: "South Sudan", weight: 1, first: ["Wenyen", "Khaman", "Nuni", "Majok", "Akuel"], last: ["Gabriel", "Maluach", "Omot", "Deng", "Kuany"] },
  { country: "Dominican Republic", weight: 1, first: ["Karl", "Al", "Andr\xE9s", "\xC1ngel", "Jean"], last: ["Feliz", "Horford", "Delgado", "Montero", "N\xFA\xF1ez"] },
  { country: "Puerto Rico", weight: 1, first: ["Jos\xE9", "Isaiah", "Carlos", "Jorge"], last: ["Alvarado", "Pi\xF1eiro", "Arroyo", "Barea"] },
  { country: "Brazil", weight: 1, first: ["Gui", "Bruno", "Rafael", "Lucas", "Matheus"], last: ["Santos", "Caboclo", "Silva", "Oliveira", "Souza"] },
  { country: "Italy", weight: 1, first: ["Simone", "Nico", "Gabriele", "Danilo", "Marco"], last: ["Fontecchio", "Mannion", "Procida", "Gallinari", "Spagnolo"] },
  { country: "Japan", weight: 1, first: ["Rui", "Yuta", "Kai", "Haruto"], last: ["Hachimura", "Watanabe", "Tominaga", "Kawamura"] },
  { country: "New Zealand", weight: 1, first: ["Steven", "Tai", "Hyrum", "Finn"], last: ["Adams", "Webster", "Harris", "Delany"] },
  { country: "Great Britain", weight: 1, first: ["OG", "Luol", "Jeremy", "Ben", "Tariq"], last: ["Anunoby", "Deng", "Sochan", "Walker", "Okon"] },
  { country: "Turkey", weight: 1, first: ["Alperen", "Cedi", "\xD6mer", "Furkan"], last: ["\u015Eeng\xFCn", "Osman", "Yurtseven", "Korkmaz"] },
  { country: "Mali", weight: 1, first: ["Moussa", "S\xE9kou", "Oumar", "Bakary"], last: ["Diabat\xE9", "Doumbouya", "Ballo", "Kon\xE9"] }
];
var TV_NETWORKS = ["THN", "THN2", "SportsNet One", "SportsNet Two", "Gridiron & Hardwood Network", "Prime Hoops", "CourtVision+", "National Hoops TV", "Big Stage Sports", "Streaming Exclusive"];
var NBA_TEAMS = [
  "Atlanta",
  "Boston",
  "Brooklyn",
  "Charlotte",
  "Chicago",
  "Cleveland",
  "Dallas",
  "Denver",
  "Detroit",
  "Golden State",
  "Houston",
  "Indiana",
  "LA Clippers",
  "LA Lakers",
  "Memphis",
  "Miami",
  "Milwaukee",
  "Minnesota",
  "New Orleans",
  "New York",
  "Oklahoma City",
  "Orlando",
  "Philadelphia",
  "Phoenix",
  "Portland",
  "Sacramento",
  "San Antonio",
  "Toronto",
  "Utah",
  "Washington"
];

// src/data/places.ts
var P = (city, state, lat, lng, w = 1) => ({ city, state, lat, lng, w });
var PLACES = [
  // California
  P("Los Angeles", "CA", 34.05, -118.24, 6),
  P("Oakland", "CA", 37.8, -122.27, 3),
  P("San Diego", "CA", 32.72, -117.16, 2),
  P("Sacramento", "CA", 38.58, -121.49, 2),
  P("Fresno", "CA", 36.74, -119.79, 1),
  P("Long Beach", "CA", 33.77, -118.19, 2),
  P("Santa Ana", "CA", 33.75, -117.87, 2),
  P("Chatsworth", "CA", 34.26, -118.6, 1),
  // Texas
  P("Houston", "TX", 29.76, -95.37, 6),
  P("Dallas", "TX", 32.78, -96.8, 5),
  P("San Antonio", "TX", 29.42, -98.49, 3),
  P("Austin", "TX", 30.27, -97.74, 2),
  P("Fort Worth", "TX", 32.76, -97.33, 2),
  P("Arlington", "TX", 32.74, -97.11, 1),
  P("Beaumont", "TX", 30.08, -94.1, 1),
  P("Lubbock", "TX", 33.58, -101.86, 1),
  // Florida
  P("Miami", "FL", 25.76, -80.19, 4),
  P("Orlando", "FL", 28.54, -81.38, 3),
  P("Jacksonville", "FL", 30.33, -81.66, 3),
  P("Tampa", "FL", 27.95, -82.46, 3),
  P("Montverde", "FL", 28.6, -81.67, 2),
  P("Fort Lauderdale", "FL", 26.12, -80.14, 2),
  P("Tallahassee", "FL", 30.44, -84.28, 1),
  // Georgia
  P("Atlanta", "GA", 33.75, -84.39, 6),
  P("Savannah", "GA", 32.08, -81.09, 1),
  P("Macon", "GA", 32.84, -83.63, 1),
  P("Augusta", "GA", 33.47, -81.97, 1),
  P("Columbus", "GA", 32.46, -84.99, 1),
  // Carolinas
  P("Charlotte", "NC", 35.23, -80.84, 4),
  P("Raleigh", "NC", 35.78, -78.64, 2),
  P("Greensboro", "NC", 36.07, -79.79, 2),
  P("Durham", "NC", 35.99, -78.9, 1),
  P("Fayetteville", "NC", 35.05, -78.88, 1),
  P("Columbia", "SC", 34, -81.03, 2),
  P("Charleston", "SC", 32.78, -79.93, 1),
  P("Greenville", "SC", 34.85, -82.4, 1),
  // Mid-Atlantic / DMV
  P("Washington", "DC", 38.9, -77.04, 5),
  P("Baltimore", "MD", 39.29, -76.61, 4),
  P("Silver Spring", "MD", 38.99, -77.03, 2),
  P("Hyattsville", "MD", 38.96, -76.95, 1),
  P("Richmond", "VA", 37.54, -77.44, 2),
  P("Norfolk", "VA", 36.85, -76.29, 2),
  P("Virginia Beach", "VA", 36.85, -75.98, 1),
  P("Philadelphia", "PA", 39.95, -75.17, 5),
  P("Pittsburgh", "PA", 40.44, -79.99, 2),
  P("Camden", "NJ", 39.93, -75.12, 1),
  P("Newark", "NJ", 40.74, -74.17, 3),
  P("Paterson", "NJ", 40.92, -74.17, 1),
  P("Trenton", "NJ", 40.22, -74.76, 1),
  P("Wilmington", "DE", 39.74, -75.55, 1),
  // New York / New England
  P("New York", "NY", 40.71, -74, 6),
  P("Brooklyn", "NY", 40.68, -73.94, 3),
  P("The Bronx", "NY", 40.84, -73.86, 2),
  P("Queens", "NY", 40.73, -73.79, 2),
  P("Buffalo", "NY", 42.89, -78.88, 1),
  P("Rochester", "NY", 43.16, -77.61, 1),
  P("Syracuse", "NY", 43.05, -76.15, 1),
  P("Boston", "MA", 42.36, -71.06, 2),
  P("Hartford", "CT", 41.76, -72.69, 1),
  P("New Haven", "CT", 41.31, -72.92, 1),
  P("Providence", "RI", 41.82, -71.41, 1),
  P("Portland", "ME", 43.66, -70.26, 0.4),
  // Midwest
  P("Chicago", "IL", 41.88, -87.63, 6),
  P("Peoria", "IL", 40.69, -89.59, 1),
  P("Detroit", "MI", 42.33, -83.05, 4),
  P("Flint", "MI", 43.01, -83.69, 1),
  P("Grand Rapids", "MI", 42.96, -85.67, 1),
  P("Indianapolis", "IN", 39.77, -86.16, 4),
  P("Fort Wayne", "IN", 41.08, -85.14, 1),
  P("Gary", "IN", 41.6, -87.35, 1),
  P("Columbus", "OH", 39.96, -82.99, 2),
  P("Cleveland", "OH", 41.5, -81.69, 3),
  P("Cincinnati", "OH", 39.1, -84.51, 2),
  P("Akron", "OH", 41.08, -81.52, 1),
  P("Dayton", "OH", 39.76, -84.19, 1),
  P("Toledo", "OH", 41.65, -83.54, 1),
  P("Milwaukee", "WI", 43.04, -87.91, 2),
  P("Madison", "WI", 43.07, -89.4, 1),
  P("Minneapolis", "MN", 44.98, -93.27, 2),
  P("St. Louis", "MO", 38.63, -90.2, 3),
  P("Kansas City", "MO", 39.1, -94.58, 2),
  P("Omaha", "NE", 41.26, -95.93, 1),
  P("Des Moines", "IA", 41.59, -93.62, 1),
  P("Wichita", "KS", 37.69, -97.34, 1),
  P("Sioux Falls", "SD", 43.55, -96.73, 0.5),
  P("Fargo", "ND", 46.88, -96.79, 0.4),
  // South
  P("Memphis", "TN", 35.15, -90.05, 3),
  P("Nashville", "TN", 36.16, -86.78, 3),
  P("Knoxville", "TN", 35.96, -83.92, 1),
  P("Chattanooga", "TN", 35.05, -85.31, 1),
  P("Louisville", "KY", 38.25, -85.76, 2),
  P("Lexington", "KY", 38.04, -84.5, 1),
  P("Birmingham", "AL", 33.52, -86.8, 2),
  P("Mobile", "AL", 30.69, -88.04, 1),
  P("Huntsville", "AL", 34.73, -86.59, 1),
  P("Jackson", "MS", 32.3, -90.18, 2),
  P("New Orleans", "LA", 29.95, -90.07, 3),
  P("Baton Rouge", "LA", 30.45, -91.19, 2),
  P("Shreveport", "LA", 32.52, -93.75, 1),
  P("Little Rock", "AR", 34.75, -92.29, 2),
  P("Oklahoma City", "OK", 35.47, -97.52, 2),
  P("Tulsa", "OK", 36.15, -95.99, 1),
  // Mountain / West
  P("Phoenix", "AZ", 33.45, -112.07, 3),
  P("Tucson", "AZ", 32.22, -110.97, 1),
  P("Las Vegas", "NV", 36.17, -115.14, 3),
  P("Henderson", "NV", 36.04, -114.98, 1),
  P("Denver", "CO", 39.74, -104.99, 2),
  P("Salt Lake City", "UT", 40.76, -111.89, 1),
  P("Albuquerque", "NM", 35.08, -106.65, 1),
  P("Seattle", "WA", 47.61, -122.33, 3),
  P("Tacoma", "WA", 47.25, -122.44, 1),
  P("Spokane", "WA", 47.66, -117.43, 1),
  P("Portland", "OR", 45.52, -122.68, 2),
  P("Boise", "ID", 43.62, -116.2, 0.5),
  P("Anchorage", "AK", 61.22, -149.9, 0.2),
  P("Honolulu", "HI", 21.31, -157.86, 0.3),
  P("Billings", "MT", 45.78, -108.5, 0.3),
  P("Charleston", "WV", 38.35, -81.63, 0.5)
];
function milesBetween(aLat, aLng, bLat, bLng) {
  const R = 3958.8;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h2 = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h2)));
}

// src/engine/player.ts
var W2 = {
  PG: { hdl: 14, pas: 14, tp: 12, mid: 7, ins: 7, ft: 3, perD: 10, stl: 5, iq: 12, spd: 8, ath: 4, reb: 2, str: 1, intD: 1 },
  SG: { tp: 16, mid: 10, ins: 9, ft: 4, hdl: 9, pas: 6, perD: 11, stl: 5, iq: 9, spd: 7, ath: 7, reb: 3, str: 2, intD: 2 },
  SF: { tp: 11, mid: 9, ins: 11, ft: 3, hdl: 6, pas: 6, perD: 11, stl: 4, iq: 9, ath: 9, spd: 5, reb: 7, str: 5, intD: 4 },
  PF: { ins: 14, mid: 7, tp: 6, ft: 2, pas: 4, hdl: 3, intD: 12, perD: 6, blk: 6, reb: 13, str: 10, ath: 8, iq: 7, spd: 2 },
  C: { ins: 15, mid: 3, tp: 3, ft: 2, pas: 4, hdl: 2, intD: 15, perD: 3, blk: 10, reb: 16, str: 12, ath: 7, iq: 6, spd: 2 }
};
var WN = {};
for (const pos of Object.keys(W2)) {
  const entries = Object.entries(W2[pos]);
  const sum = entries.reduce((s, [, v2]) => s + v2, 0);
  WN[pos] = entries.map(([k, v2]) => [k, v2 / sum]);
}
function ratingWeight(pos, k) {
  return WN[pos].find((x) => x[0] === k)?.[1] ?? 0.02;
}
function topRatings(pos, n = 3) {
  return [...WN[pos]].sort((a, b) => b[1] - a[1]).slice(0, n).map((x) => x[0]);
}
function calcOvr(r, pos) {
  let wavg = 0;
  const vals = [];
  for (const [k, w] of WN[pos]) {
    wavg += r[k] * w;
    if (w >= 0.09) vals.push(r[k]);
  }
  vals.sort((a, b) => b - a);
  const top = (vals[0] + vals[1] + (vals[2] ?? vals[1])) / 3;
  return Math.round(clamp(wavg * 0.78 + top * 0.22, 25, 99));
}
var POS_OFFSETS = {
  PG: { hdl: 12, pas: 12, tp: 3, spd: 9, iq: 4, reb: -14, blk: -16, intD: -14, str: -10, ins: -2, stl: 3 },
  SG: { hdl: 6, pas: 2, tp: 6, mid: 3, spd: 6, reb: -10, blk: -13, intD: -10, str: -7, stl: 2 },
  SF: { reb: -2, blk: -5, intD: -3, ath: 3 },
  PF: { reb: 9, intD: 8, blk: 7, str: 8, ins: 4, tp: -8, hdl: -10, pas: -6, spd: -5, perD: -4 },
  C: { reb: 13, intD: 12, blk: 12, str: 11, ins: 6, tp: -14, hdl: -16, pas: -8, spd: -9, perD: -8, mid: -6 }
};
var ARCH_OFFSETS = {
  "Floor General": { pas: 10, iq: 9, hdl: 6, ins: -4, ath: -3 },
  "Scoring Guard": { tp: 6, mid: 7, ins: 4, pas: -5, perD: -2 },
  "Combo Guard": { tp: 3, hdl: 3, pas: 2, mid: 3 },
  Slasher: { ins: 9, ath: 7, spd: 6, tp: -7, mid: -2 },
  Sharpshooter: { tp: 13, ft: 9, mid: 5, ath: -4, ins: -6, perD: -3 },
  "3&D Wing": { perD: 9, tp: 7, stl: 5, hdl: -5, ins: -3, mid: -2 },
  "Two-Way Wing": { perD: 6, ins: 3, tp: 3, ath: 4, mid: 2 },
  "Point Forward": { pas: 11, hdl: 7, iq: 5, tp: -2, intD: -2 },
  "Stretch Big": { tp: 14, mid: 7, ft: 6, intD: -5, reb: -4, str: -3, blk: -3 },
  "Post Scorer": { ins: 10, str: 5, mid: 3, ath: -3, spd: -3, perD: -2 },
  "Rim Runner": { ath: 11, ins: 7, spd: 5, tp: -12, mid: -8, ft: -8 },
  "Rim Protector": { blk: 13, intD: 11, ins: -3, tp: -10, mid: -4, pas: -3 },
  "Glass Cleaner": { reb: 13, str: 7, intD: 4, tp: -9, ins: -1, mid: -3 }
};
var ARCHETYPES_BY_POS = {
  PG: ["Floor General", "Scoring Guard", "Combo Guard", "Slasher"],
  SG: ["Sharpshooter", "Scoring Guard", "3&D Wing", "Slasher", "Combo Guard"],
  SF: ["Two-Way Wing", "3&D Wing", "Slasher", "Point Forward", "Sharpshooter"],
  PF: ["Stretch Big", "Post Scorer", "Rim Runner", "Glass Cleaner", "Two-Way Wing"],
  C: ["Rim Protector", "Post Scorer", "Glass Cleaner", "Rim Runner", "Stretch Big"]
};
var HEIGHT = { PG: [74, 1.7], SG: [76.5, 1.4], SF: [78.5, 1.3], PF: [80.5, 1.3], C: [83, 1.6] };
function emptyStats() {
  return { gp: 0, gs: 0, min: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0 };
}
function buildRatings(pos, arch, target, height) {
  const r = {};
  const hDelta = height - HEIGHT[pos][0];
  for (const k of RATING_KEYS) {
    let v2 = target + (POS_OFFSETS[pos][k] ?? 0) + (ARCH_OFFSETS[arch][k] ?? 0) + rng.normal(0, 5.5);
    if (k === "reb" || k === "blk" || k === "intD") v2 += hDelta * 1.6;
    if (k === "spd" || k === "hdl") v2 -= hDelta * 1.2;
    if (k === "sta") v2 = target + rng.normal(4, 7);
    if (k === "ft") v2 = v2 * 0.6 + (r.tp ?? target) * 0 + target * 0.4 + 4;
    r[k] = v2;
  }
  r.ft = (r.ft + r.tp * 0.5 + r.mid * 0.3) / 1.8 + 6;
  for (let i = 0; i < 4; i++) {
    for (const k of RATING_KEYS) r[k] = clamp(r[k], 20, 99);
    const o = calcOvr(r, pos);
    const diff = target - o;
    if (Math.abs(diff) < 0.5) break;
    for (const k of RATING_KEYS) r[k] += diff;
  }
  for (const k of RATING_KEYS) r[k] = Math.round(clamp(r[k], 20, 99));
  return r;
}
var TRAITS = [
  ["leader", 6],
  ["gymRat", 8],
  ["loyal", 8],
  ["mercenary", 7],
  ["diva", 4],
  ["clutch", 6],
  ["hometown", 4],
  ["raw", 6],
  ["coachable", 8],
  ["hothead", 4],
  ["influencer", 5],
  ["glue", 6],
  ["scholar", 5],
  ["injuryProne", 3]
];
function genTraits() {
  const n = rng.weighted([0, 1, 2], [35, 45, 20]);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = rng.weighted(TRAITS.map((x) => x[0]), TRAITS.map((x) => x[1]));
    if (!out.includes(t) && !(t === "loyal" && out.includes("mercenary")) && !(t === "mercenary" && out.includes("loyal"))) out.push(t);
  }
  return out;
}
function pickPlace() {
  return rng.weighted(PLACES, PLACES.map((p) => p.w));
}
function genName(intl = false) {
  if (intl) {
    const pool = rng.weighted(INTL_POOLS, INTL_POOLS.map((p) => p.weight));
    return { first: rng.pick(pool.first), last: rng.pick(pool.last), country: pool.country };
  }
  return { first: rng.pick(FIRST_NAMES), last: rng.pick(LAST_NAMES), country: "USA" };
}
var CLASS_ORDER = ["FR", "SO", "JR", "SR", "GR"];
var CLASS_AGE = { FR: 18, SO: 19, JR: 20, SR: 21, GR: 22 };
function randomPos() {
  return rng.weighted(["PG", "SG", "SF", "PF", "C"], [20, 22, 21, 20, 17]);
}
function genPlayer(o) {
  const pos = o.pos ?? randomPos();
  const arch = rng.pick(ARCHETYPES_BY_POS[pos]);
  const [hm, hsd] = HEIGHT[pos];
  const height = Math.round(clamp(rng.normal(hm, hsd), hm - 4, hm + 4));
  const weight = Math.round(185 + (height - 74) * 7.5 + rng.normal(0, 11) + (pos === "C" ? 12 : 0));
  const ratings = buildRatings(pos, arch, o.ovr, height);
  const ovr = calcOvr(ratings, pos);
  const intl = o.intl ?? rng.chance(0.07);
  const nm3 = genName(intl);
  const place2 = o.place ?? pickPlace();
  const clsIdx = CLASS_ORDER.indexOf(o.cls);
  const growth = o.cls === "FR" ? rng.range(6, 20) : o.cls === "SO" ? rng.range(4, 14) : o.cls === "JR" ? rng.range(2, 9) : rng.range(0, 4);
  const pot = Math.round(clamp(o.pot ?? ovr + growth, ovr, 99));
  const stars = o.stars ?? starsFromOvr(ovr - clsIdx * 3.5, pot);
  const traits = genTraits();
  const followers = genFollowers(stars, ovr, traits);
  const redshirted = clsIdx >= 1 && rng.chance(0.18);
  return {
    id: rng.id("p"),
    first: nm3.first,
    last: nm3.last,
    pos,
    archetype: arch,
    height,
    weight,
    hometown: intl ? nm3.country : place2.city,
    state: intl ? nm3.country : place2.state,
    country: nm3.country,
    age: CLASS_AGE[o.cls] + (redshirted ? 1 : 0) + (rng.chance(0.25) ? 1 : 0),
    cls: o.cls,
    elig: 4 - Math.min(3, clsIdx) - (o.cls === "GR" ? 0 : 0),
    redshirted,
    redshirting: false,
    ratings,
    ovr,
    pot,
    stars,
    traits,
    teamId: o.teamId,
    num: 0,
    morale: Math.round(rng.range(60, 85)),
    nil: null,
    followers,
    injury: null,
    stats: emptyStats(),
    career: [],
    history: [],
    promise: null,
    starts: 0,
    inPortal: false,
    transfers: 0,
    awards: []
  };
}
function starsFromOvr(freshOvr, pot) {
  const s = freshOvr * 0.55 + pot * 0.45;
  if (s >= 80) return 5;
  if (s >= 72) return 4;
  if (s >= 63) return 3;
  if (s >= 54) return 2;
  return 1;
}
function genFollowers(stars, ovr, traits) {
  let base = [800, 1500, 4e3, 12e3, 45e3, 18e4][stars] ?? 1e3;
  base *= Math.exp((ovr - 65) * 0.045);
  base *= Math.exp(rng.normal(0, 0.7));
  if (traits.includes("influencer")) base *= rng.range(4, 10);
  return Math.round(clamp(base, 150, 6e6));
}
function nilValue(p, market = 5) {
  let v2 = 2500 * Math.exp((p.ovr - 40) * 0.15);
  v2 *= 1 + Math.max(0, p.pot - p.ovr) * 0.025;
  v2 *= 1 + Math.min(3, p.followers / 4e5);
  v2 *= 0.75 + market * 0.05;
  if (p.traits.includes("mercenary")) v2 *= 1.2;
  if (p.traits.includes("loyal")) v2 *= 0.9;
  return roundMoney(clamp(v2, 0, 4e6));
}
function roundMoney(v2) {
  if (v2 >= 1e6) return Math.round(v2 / 25e3) * 25e3;
  if (v2 >= 1e5) return Math.round(v2 / 5e3) * 5e3;
  if (v2 >= 1e4) return Math.round(v2 / 1e3) * 1e3;
  return Math.round(v2 / 250) * 250;
}
function fmtMoney(v2) {
  const a = Math.abs(v2);
  const s = v2 < 0 ? "-" : "";
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, "")}M`;
  if (a >= 1e3) return `${s}$${Math.round(a / 1e3)}K`;
  return `${s}$${Math.round(a)}`;
}
function draftScore(p) {
  const youth2 = clamp(22 - p.age, -2, 4) * 1.6;
  const size = clamp(p.height - 77, -4, 6) * 0.35;
  return p.ovr * 0.55 + p.pot * 0.45 + youth2 + size;
}
function developPlayer(p, devSkill, minutesShare2) {
  const before = p.ovr;
  const room = Math.max(0, p.pot - p.ovr);
  const ageFactor = p.age <= 19 ? 1.15 : p.age <= 20 ? 1 : p.age <= 21 ? 0.8 : p.age <= 22 ? 0.6 : 0.4;
  let base = room * 0.32 * ageFactor + 0.8;
  base *= 1 + devSkill * 0.035;
  base *= 0.85 + Math.min(1, minutesShare2) * 0.3;
  if (p.traits.includes("gymRat")) base *= 1.25;
  if (p.traits.includes("coachable")) base *= 1.1;
  const sd = p.traits.includes("raw") ? 2.6 : 1.4;
  let delta = base + rng.normal(0, sd);
  delta = clamp(delta, -3, 14);
  const keys = WN[p.pos];
  const points = delta * 1.25;
  for (const k of RATING_KEYS) {
    const w = keys.find((x) => x[0] === k)?.[1] ?? 0.02;
    const jitter = rng.range(0.4, 1.6);
    p.ratings[k] = Math.round(clamp(p.ratings[k] + points * (0.55 + w * 6) * jitter * 0.75, 20, 99));
  }
  p.ovr = calcOvr(p.ratings, p.pos);
  p.pot = Math.round(clamp(p.pot + rng.normal(0, 2) - (p.age >= 22 ? 1 : 0), p.ovr, 99));
  return p.ovr - before;
}
function advanceClass(p) {
  if (p.redshirting) {
    p.redshirting = false;
    p.redshirted = true;
  } else {
    p.elig -= 1;
    const idx = CLASS_ORDER.indexOf(p.cls);
    p.cls = CLASS_ORDER[Math.min(4, idx + 1)];
  }
  if (p.elig <= 1 && p.cls !== "SR" && p.cls !== "GR") p.cls = "SR";
  if (p.cls === "SR" && p.elig < 1) p.cls = "GR";
  p.age += 1;
}
function recruitToPlayer(r, teamId) {
  return {
    id: r.id,
    first: r.first,
    last: r.last,
    pos: r.pos,
    archetype: r.archetype,
    height: r.height,
    weight: r.weight,
    hometown: r.hometown,
    state: r.state,
    country: r.country,
    age: r.age,
    cls: r.type === "JUCO" ? "JR" : "FR",
    elig: r.type === "JUCO" ? 2 : 4,
    redshirted: false,
    redshirting: false,
    ratings: { ...r.ratings },
    ovr: r.ovr,
    pot: r.pot,
    stars: r.stars,
    traits: [...r.traits],
    teamId,
    num: 0,
    morale: 80,
    nil: null,
    followers: r.followers,
    injury: null,
    stats: emptyStats(),
    career: [],
    history: [],
    promise: r.userPromise,
    starts: 0,
    inPortal: false,
    transfers: 0,
    awards: []
  };
}
var INJURY_TYPES = [
  ["Ankle sprain", 1, 4],
  ["Knee soreness", 1, 3],
  ["Hamstring strain", 2, 5],
  ["Concussion protocol", 1, 3],
  ["Broken finger", 3, 6],
  ["Back spasms", 1, 3],
  ["Foot fracture", 6, 14],
  ["Torn ACL", 30, 40],
  ["High ankle sprain", 3, 7],
  ["Wrist sprain", 1, 4],
  ["Illness", 1, 2],
  ["Groin strain", 2, 4],
  ["Shoulder sprain", 2, 6],
  ["Torn meniscus", 6, 12]
];
function randomInjury() {
  const w = INJURY_TYPES.map(([, a2]) => a2 >= 30 ? 0.4 : a2 >= 6 ? 1.2 : 4);
  const [type, a, b] = rng.weighted(INJURY_TYPES, w);
  return { type, games: rng.int(a, b) };
}
function teamOvr(players) {
  const sorted = players.filter((p) => !p.injury && !p.redshirting).map((p) => p.ovr).sort((a, b) => b - a);
  const w = [1.25, 1.2, 1.15, 1.1, 1.05, 0.8, 0.65, 0.5, 0.3, 0.15];
  let s = 0, ws = 0;
  for (let i = 0; i < w.length; i++) {
    const v2 = sorted[i] ?? 35;
    s += v2 * w[i];
    ws += w[i];
  }
  return s / ws;
}

// src/engine/coach.ts
var ARCHETYPE_INFO = {
  Recruiter: { desc: "Lives on the road. More recruiting hours and stronger pitches.", skills: { recruiting: 4, nil: 1 }, icon: "\u{1F4DE}" },
  Tactician: { desc: "X\u2019s and O\u2019s savant. Teams execute better in games.", skills: { tactics: 4, development: 1 }, icon: "\u{1F4CB}" },
  "Players Coach": { desc: "Players run through walls for you. Better morale & retention.", skills: { motivation: 4, portal: 1 }, icon: "\u{1F91D}" },
  Developer: { desc: "Turns 3-stars into pros. Faster player progression.", skills: { development: 4, tactics: 1 }, icon: "\u{1F4C8}" },
  Showman: { desc: "Owns the podium. Media, hype and NIL collectives love you.", skills: { media: 3, nil: 2 }, icon: "\u{1F3A4}" },
  "Portal King": { desc: "Master of the transfer market. Better portal pulls.", skills: { portal: 4, nil: 1 }, icon: "\u{1F501}" }
};
function xpForLevel(level2) {
  return Math.round(120 * Math.pow(level2, 1.45));
}
function blankSkills() {
  return { recruiting: 1, development: 1, tactics: 1, motivation: 1, nil: 1, media: 1, portal: 1 };
}
function genAICoach(prestige, teamId) {
  const rating = Math.round(clamp(prestige * 0.6 + 25 + rng.normal(0, 9), 20, 98));
  const s = (rating - 20) / 10;
  const skills = {
    recruiting: Math.round(clamp(s + rng.normal(0, 1.5), 0, 10)),
    development: Math.round(clamp(s + rng.normal(0, 1.5), 0, 10)),
    tactics: Math.round(clamp(s + rng.normal(0, 1.5), 0, 10)),
    motivation: Math.round(clamp(s + rng.normal(0, 1.5), 0, 10)),
    nil: Math.round(clamp(s + rng.normal(0, 1.5), 0, 10)),
    media: Math.round(clamp(s + rng.normal(0, 1.5), 0, 10)),
    portal: Math.round(clamp(s + rng.normal(0, 1.5), 0, 10))
  };
  const age = rng.int(36, 68);
  const yrs = rng.int(0, Math.max(1, age - 34));
  const w = Math.round(yrs * (14 + rating * 0.12));
  const l = Math.round(yrs * (30 - 14 - rating * 0.06));
  return {
    id: rng.id("c"),
    first: rng.pick(FIRST_NAMES),
    last: rng.pick(LAST_NAMES),
    age,
    teamId,
    isUser: false,
    archetype: rng.pick(Object.keys(ARCHETYPE_INFO)),
    rating,
    skills,
    xp: 0,
    level: 1,
    skillPoints: 0,
    reputation: clamp(rating + rng.normal(0, 6), 10, 99),
    salary: Math.round((2e5 + Math.exp(prestige * 0.05) * 3e4) / 1e4) * 1e4,
    contractYears: rng.int(1, 6),
    jobSecurity: rng.int(55, 85),
    mediaRep: 50,
    career: [],
    trophies: [],
    careerW: Math.max(0, w),
    careerL: Math.max(0, l)
  };
}
function gainXp(state, amount) {
  const c = state.coaches[state.user.coachId];
  if (!c) return 0;
  c.xp += Math.round(amount);
  let gained = 0;
  while (c.xp >= xpForLevel(c.level)) {
    c.xp -= xpForLevel(c.level);
    c.level++;
    c.skillPoints++;
    gained++;
    state.user.moments.push({ kind: "levelUp", level: c.level });
  }
  return gained;
}
function hoursForWeek(state) {
  const c = state.coaches[state.user.coachId];
  return 40 + (c ? c.skills.recruiting * 4 : 0) + staffEffects(state).hours;
}
var EXPECTATIONS = [
  "Show progress in conference play",
  "Finish in the top half of the conference",
  "Contend for a conference title",
  "Make the NCAA Tournament",
  "Win an NCAA Tournament game",
  "Reach the Sweet 16",
  "Make the Final Four"
];
function setExpectations(state) {
  const team = state.teams[state.user.teamId];
  const sorted = Object.values(state.teams).sort((a, b) => b.rating - a.rating);
  const rank = sorted.findIndex((t) => t.id === team.id) + 1;
  let lvl;
  if (rank <= 5 && team.prestige >= 85) lvl = 6;
  else if (rank <= 12) lvl = 5;
  else if (rank <= 25) lvl = 4;
  else if (rank <= 50) lvl = 3;
  else {
    const confTeams = sorted.filter((t) => t.conf === team.conf);
    const crank = confTeams.findIndex((t) => t.id === team.id) + 1;
    lvl = crank <= 2 ? 2 : crank <= Math.ceil(confTeams.length / 2) ? 1 : 0;
  }
  state.user.expectationLevel = lvl;
  state.user.expectation = EXPECTATIONS[lvl];
}
function achievedLevel(state, team, confFinish, confSize, confChamp, ncaa) {
  const order = ["", "First Four", "Round of 64", "Round of 32", "Sweet 16", "Elite Eight", "Final Four", "Runner-up", "Champion"];
  const idx = order.indexOf(ncaa);
  if (idx >= 6) return 6 + (idx - 6) * 0.5;
  if (idx >= 4) return 5 + (idx === 5 ? 0.5 : 0);
  if (idx === 3) return 4;
  if (idx >= 1) return 3;
  if (confChamp || confFinish <= 2) return 2;
  if (confFinish <= Math.ceil(confSize / 2)) return 1;
  return 0;
}

// src/engine/media.ts
var INSIDERS = [
  { name: "Marcus Bell", handle: "MarcusBellHoops", outlet: "Hoops Insider" },
  { name: "Dana Whitfield", handle: "DanaW_CBB", outlet: "The Bracket Report" },
  { name: "Trey Calloway", handle: "TreyCallowayCBB", outlet: "CBB Wire" },
  { name: "Nina Park", handle: "NinaParkReports", outlet: "Courtside Daily" },
  { name: "Rob Delgado", handle: "RobDelgadoHoops", outlet: "Full Court Press" },
  { name: "Kendra Ellis", handle: "KendraEllisCBB", outlet: "Hardwood Weekly" }
];
var ANALYSTS = [
  { name: "Coach Vic Moreno", handle: "CoachVicBaby", style: "hype" },
  { name: "Bracket Brad", handle: "BracketBrad", style: "bracket" },
  { name: "Lou Bertoli", handle: "LouBTakes", style: "contrarian" },
  { name: "The Paint Podcast", handle: "ThePaintPod", style: "pod" }
];
var RECRUITING_ANALYSTS = [
  { name: "Sam Okafor", handle: "SamOkaforRecruits", outlet: "Prep Hoops Central" },
  { name: "Jess Navarro", handle: "JessNavarroRecruiting", outlet: "The Recruiting Desk" }
];
var seq = 0;
var nid = (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
function addNews(state, n) {
  const cal = state.calendar[state.day];
  state.news.unshift({ id: nid("n"), season: state.season, day: state.day, date: cal?.label ?? "", ...n });
  if (state.news.length > 500) state.news.length = 500;
}
function addSocial(state, p) {
  const base = p.verified ? rng.int(800, 25e3) : rng.int(5, 2500);
  state.social.unshift({ id: nid("s"), season: state.season, day: state.day, likes: p.likes ?? base, reposts: p.reposts ?? Math.round(base * rng.range(0.05, 0.3)), ...p });
  if (state.social.length > 400) state.social.length = 400;
}
var fanHandle = (t) => rng.pick([`${t.abbr}Nation`, `${t.mascot.replace(/\s+/g, "")}Talk`, `${t.school.replace(/[^A-Za-z]/g, "")}Hoops`, `Real${t.abbr}Fan`, `${t.abbr}_Barstool`, `${t.mascot.replace(/\s+/g, "")}4Life`]);
var fanName = (t) => rng.pick([`${t.school} Nation`, `${t.mascot} Talk`, `${t.school} Hoops Fan`, `Die-hard ${t.abbr}`, `${t.school} Student Section`, `${t.mascot} Insider (fan)`]);
function bestPerformer(players) {
  const gs = (p) => p.pts + 0.4 * p.fgm - 0.7 * p.fga - 0.4 * (p.fta - p.ftm) + 0.7 * p.orb + 0.3 * p.drb + 0.7 * p.ast + p.stl + 0.7 * p.blk - p.tov;
  return [...players].sort((a, b) => gs(b) - gs(a))[0];
}
function statLine(p) {
  const parts = [`${p.pts} pts`];
  if (p.drb + p.orb >= 6) parts.push(`${p.drb + p.orb} reb`);
  if (p.ast >= 4) parts.push(`${p.ast} ast`);
  if (p.stl >= 3) parts.push(`${p.stl} stl`);
  if (p.blk >= 3) parts.push(`${p.blk} blk`);
  if (p.tpm >= 4) parts.push(`${p.tpm} threes`);
  return parts.join(", ");
}
function rankTag(t) {
  return t.apRank ? `No. ${t.apRank} ` : "";
}
function gameRecapNews(state, g, box) {
  const home = state.teams[g.home], away = state.teams[g.away];
  const homeWon = box.hs > box.as;
  const W3 = homeWon ? home : away, L = homeWon ? away : home;
  const ws = Math.max(box.hs, box.as), ls = Math.min(box.hs, box.as);
  const wBox = homeWon ? box.players[0] : box.players[1];
  const lBox = homeWon ? box.players[1] : box.players[0];
  const star = bestPerformer(wBox);
  const lstar = bestPerformer(lBox);
  const margin = ws - ls;
  const ot = box.ot ? box.ot === 1 ? " in overtime" : ` in ${box.ot}OT` : "";
  const verb = margin >= 25 ? rng.pick(["demolishes", "routs", "obliterates", "cruises past"]) : margin >= 12 ? rng.pick(["handles", "pulls away from", "rolls past", "downs"]) : margin <= 3 ? rng.pick(["edges", "survives", "outlasts", "holds off"]) : rng.pick(["beats", "tops", "takes down", "defeats"]);
  const headline = `${rankTag(W3)}${W3.school} ${verb} ${rankTag(L)}${L.school} ${ws}-${ls}${ot}`;
  const starName = star?.name ?? "The starters";
  const body = [
    `${starName} led the way with ${star ? statLine(star) : "a big night"} as ${W3.school} (${W3.record.w}-${W3.record.l}) ${verb} ${L.school} (${L.record.w}-${L.record.l})${g.event ? ` in the ${g.event}` : ""}${ot}.`,
    box.largestLead[homeWon ? 1 : 0] >= 10 ? `${L.school} led by as many as ${box.largestLead[homeWon ? 1 : 0]} before the ${W3.mascot} rallied.` : `${W3.school} led by as many as ${box.largestLead[homeWon ? 0 : 1]}.`,
    lstar ? `${lstar.name} paced ${L.school} with ${statLine(lstar)}.` : "",
    `The game was played at ${g.neutral ? "a neutral site" : home.arena} in front of ${g.neutral ? "a packed house" : `${Math.round(home.capacity * (0.75 + home.hype / 400)).toLocaleString()} fans`}.`
  ].filter(Boolean).join(" ");
  addNews(state, { kind: "recap", headline, body, teams: [g.home, g.away], important: g.home === state.user.teamId || g.away === state.user.teamId, personId: star?.id, personKind: "player" });
}
function upsetNews(state, g) {
  const home = state.teams[g.home], away = state.teams[g.away];
  const homeWon = (g.hs ?? 0) > (g.as ?? 0);
  const W3 = homeWon ? home : away, L = homeWon ? away : home;
  if (!L.apRank || W3.apRank && W3.apRank < L.apRank) return;
  const big = L.apRank <= 10 && !W3.apRank;
  const headline = big ? rng.pick([`STUNNER: ${W3.school} knocks off No. ${L.apRank} ${L.school}`, `Upset alert answered: ${W3.school} topples No. ${L.apRank} ${L.school}`, `${W3.school} storms the court after beating No. ${L.apRank} ${L.school}`]) : `${W3.school} takes down No. ${L.apRank} ${L.school}, ${Math.max(g.hs, g.as)}-${Math.min(g.hs, g.as)}`;
  addNews(state, { kind: "upset", headline, body: `${L.school} falls to ${L.record.w}-${L.record.l} after a ${Math.max(g.hs, g.as)}-${Math.min(g.hs, g.as)} loss to ${W3.school}${g.neutral ? " on a neutral floor" : homeWon ? " on the road" : " at home"}. Expect a tumble in next week\u2019s poll.`, teams: [W3.id, L.id], important: big });
  if (big && rng.chance(0.7)) {
    const a = rng.pick(ANALYSTS);
    addSocial(state, { handle: a.handle, name: a.name, verified: true, kind: "analyst", text: rng.pick([`${W3.school.toUpperCase()}!!! That's why we play the games, baby! \u{1F525}\u{1F3C0}`, `Nobody's safe this year. ${W3.school} over No. ${L.apRank} ${L.school}. Wow.`, `${L.school} fans, it's going to be a long bus ride home.`]), teamId: W3.id });
  }
}
function userGameSocial(state, g, box) {
  const user2 = state.teams[state.user.teamId];
  const isHome = g.home === user2.id;
  const us = isHome ? box.hs : box.as, them = isHome ? box.as : box.hs;
  const opp = state.teams[isHome ? g.away : g.home];
  const won = us > them;
  const myBox = isHome ? box.players[0] : box.players[1];
  const star = bestPerformer(myBox);
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const text = won ? rng.pick([
      `LET'S GOOOO ${user2.mascot.toUpperCase()} \u{1F525}\u{1F525} ${us}-${them}`,
      `${star?.name.split(" ")[1] ?? "Our guys"} is HIM. That's it. That's the tweet.`,
      `Coach ${state.coaches[state.user.coachId].last} has this thing rolling. ${user2.record.w}-${user2.record.l}!`,
      `Beat ${opp.school}. Love to see it. Book the tickets for March \u{1F39F}\uFE0F`,
      `That second half defense was disgusting (complimentary) \u{1F624}`,
      `Who's got next? ${user2.school} is coming.`
    ]) : rng.pick([
      `Ugh. Can't keep turning it over like that.`,
      `That was ugly. ${them}-${us} to ${opp.school}?? Fix it.`,
      `Somebody explain that rotation to me. I'll wait.`,
      `We'll bounce back. Still believe in this group. ${user2.record.w}-${user2.record.l}.`,
      `Free throws win games. We didn't make ours. \u{1F629}`,
      `Hot seat talk starting already lol relax people`
    ]);
    addSocial(state, { handle: fanHandle(user2), name: fanName(user2), verified: false, kind: "fan", text, teamId: user2.id });
  }
  if (!won && rng.chance(0.5)) {
    addSocial(state, { handle: fanHandle(opp), name: fanName(opp), verified: false, kind: "hater", text: rng.pick([`${user2.school} fans real quiet tonight \u{1F92B}`, `Overrated. Told y'all.`, `Thanks for the W, ${user2.school} \u{1F602}`]), teamId: opp.id });
  }
  if (star && star.pts >= 25) {
    const ins = rng.pick(INSIDERS);
    addSocial(state, { handle: ins.handle, name: ins.name, verified: true, kind: "insider", text: `${star.name} (${user2.school}) tonight: ${statLine(star)}. NBA scouts in the building took notice.`, teamId: user2.id, personId: star.id });
  }
}
function decisionLine(state, r, teamId) {
  const d = r.decision;
  if (!d) return "";
  const t = state.teams[teamId];
  const me = state.teams[state.user.teamId];
  const vs = d.vsId ? state.teams[d.vsId] : void 0;
  const why = d.why.join(" and ");
  if (d.userStatus === "won") return why && vs ? ` Sources say ${why} put ${t.school} over the top against ${vs.school}.` : "";
  if (d.userStatus === "noOffer") return ` ${me.school} was in the mix but never extended an offer.`;
  if (d.userStatus === "noRoom") return ` ${me.school} had no scholarships left to give.`;
  return ` ${me.school} finished as a finalist${why ? `; sources say ${why} tipped it to ${t.school}` : ""}.`;
}
function userCaresAbout(state, r) {
  const d = r.decision;
  if (!d) return false;
  return d.userStatus !== "noOffer" || state.user.board.includes(r.id);
}
function commitNews(state, r, teamId) {
  const t = state.teams[teamId];
  const isUser2 = teamId === state.user.teamId;
  const involved = userCaresAbout(state, r);
  const top = r.rank <= 150 || isUser2 || involved;
  if (!top) return;
  const stars = "\u2605".repeat(r.stars);
  const others = r.schools.filter((s) => s.teamId !== teamId).slice(0, 3).map((s) => state.teams[s.teamId]?.school).filter(Boolean);
  addNews(state, {
    kind: "recruit",
    headline: `${stars} ${r.pos} ${r.first} ${r.last} commits to ${t.school}`,
    body: `${r.first} ${r.last}, the No. ${r.rank} overall prospect in the class of ${r.classYear} (${r.hometown}${r.type === "INTL" ? "" : `, ${r.state}`}), committed to ${t.school}${others.length ? ` over ${others.join(", ")}` : ""}.${involved ? decisionLine(state, r, teamId) : ""} ${r.storyline ? r.storyline + ". " : ""}The ${fmtHt(r.height)} ${r.archetype.toLowerCase()} gives ${t.mascot} fans plenty to be excited about.`,
    teams: [teamId],
    important: isUser2 || r.rank <= 25 || involved,
    personId: r.id,
    personKind: "recruit"
  });
  const an = rng.pick(RECRUITING_ANALYSTS);
  if (r.rank <= 60 || isUser2) {
    addSocial(state, { handle: an.handle, name: an.name, verified: true, kind: "insider", text: `BREAKING: ${stars} ${r.first} ${r.last} (No. ${r.rank} nationally) has committed to ${t.school}. ${rng.pick(["Huge get.", "Major win on the trail.", "Did not see this one coming.", "Expected \u2014 the relationship there was strong."])}`, teamId, personId: r.id });
    addSocial(state, { handle: `${r.first}${r.last}${rng.int(1, 99)}`.replace(/[^A-Za-z0-9]/g, ""), name: `${r.first} ${r.last}`, verified: r.followers > 5e4, kind: "recruit", text: rng.pick([`100% COMMITTED \u{1F64F} #${t.abbr}`, `Home. \u{1F4AF} Thank you to every coach who recruited me. Let's work ${t.mascot}!`, `God's plan. ${t.school} let's get to work \u{1F3C0}`, `Committed. No more questions \u{1F624}`]), teamId, personId: r.id, likes: Math.round(r.followers * rng.range(0.02, 0.15)) });
  }
}
function signingNews(state, r) {
  const teamId = r.committed;
  if (!teamId) return;
  const t = state.teams[teamId];
  const isUser2 = teamId === state.user.teamId;
  const involved = userCaresAbout(state, r);
  if (!(r.rank <= 100 || isUser2 || involved)) return;
  addNews(state, {
    kind: "recruit",
    headline: `Signing Day: ${"\u2605".repeat(r.stars)} ${r.pos} ${r.first} ${r.last} picks ${t.school}`,
    body: `${r.first} ${r.last} (No. ${r.rank} overall) waited until Signing Day and chose ${t.school}.${involved ? decisionLine(state, r, teamId) : ""}`,
    teams: [teamId],
    important: isUser2 || involved,
    personId: r.id,
    personKind: "recruit"
  });
}
function fmtHt(inches) {
  return `${Math.floor(inches / 12)}-${inches % 12}`;
}
function pollNews(state, label, ranks) {
  const no1 = state.teams[ranks[0]];
  const user2 = state.teams[state.user.teamId];
  addNews(state, {
    kind: "rank",
    headline: `${label}: ${no1.school} ${no1.prevApRank === 1 ? "holds at" : "claims"} No. 1`,
    body: `Top five: ${ranks.slice(0, 5).map((id, i) => `${i + 1}. ${state.teams[id].school}`).join(", ")}.${user2.apRank ? ` ${user2.school} checks in at No. ${user2.apRank}.` : ""}`,
    teams: ranks.slice(0, 5),
    important: !!user2.apRank && user2.apRank !== user2.prevApRank
  });
}
function randomBuzz(state) {
  const teams = Object.values(state.teams).filter((t2) => t2.apRank).sort((a2, b) => a2.apRank - b.apRank);
  if (!teams.length) return;
  const t = rng.pick(teams.slice(0, 15));
  const a = rng.pick(ANALYSTS);
  const lines = a.style === "hype" ? [`${t.school} is a PTPer's dream, baby! Diaper dandy on that roster! \u{1F525}`, `Don't sleep on ${t.school}. Final Four material, AWESOME baby!`] : a.style === "bracket" ? [`Bracketology update: ${t.school} firmly on the ${Math.max(1, Math.ceil((t.apRank ?? 8) / 4))}-line this week.`, `Bubble watch: lots of movement this week. ${t.school} is safe. Others... not so much.`] : a.style === "contrarian" ? [`Hot take: ${t.school} is a paper tiger. First-weekend exit incoming.`, `Everyone loves ${t.school}. I'm not buying it.`] : [`New episode: we break down ${t.school}'s rotation and why their defense travels. \u{1F399}\uFE0F`];
  addSocial(state, { handle: a.handle, name: a.name, verified: true, kind: "analyst", text: rng.pick(lines), teamId: t.id });
}
function injuryNews(state, p, teamId) {
  const t = state.teams[teamId];
  if (!p.injury) return;
  const serious = p.injury.games >= 6;
  if (!serious && teamId !== state.user.teamId) return;
  addNews(state, {
    kind: "injury",
    headline: `${t.school}'s ${p.first} ${p.last} out ${p.injury.games >= 25 ? "for the season" : `${p.injury.games} game${p.injury.games > 1 ? "s" : ""}`} (${p.injury.type.toLowerCase()})`,
    body: `${t.school} will be without ${p.pos} ${p.first} ${p.last} (${p.stats.gp ? (p.stats.pts / p.stats.gp).toFixed(1) : "0.0"} ppg) after he suffered a ${p.injury.type.toLowerCase()}.`,
    teams: [teamId],
    important: teamId === state.user.teamId,
    personId: p.id,
    personKind: "player"
  });
}

// src/engine/league.ts
var KEYS = ["user", "inbox", "staff", "development", "locker", "scheduling", "radio", "playbook"];
function leagueOn(state) {
  return !!state.league && state.league.humans.length > 1;
}
function capture(state) {
  const d = {};
  for (const k of KEYS) d[k] = state[k];
  if (state.portal) d.portalUser = { hours: state.portal.hours, hoursMax: state.portal.hoursMax, calls: state.portal.calls, lastResults: state.portal.lastResults };
  if (state.offseason) d.osUser = { signed: state.offseason.signed, summary: state.offseason.summary, achieved: state.offseason.achieved, securityDelta: state.offseason.securityDelta };
  return d;
}
function restore(state, d) {
  for (const k of KEYS) state[k] = d[k];
  if (state.portal) {
    const p = d.portalUser ?? { hours: state.portal.hoursMax, hoursMax: state.portal.hoursMax, calls: [], lastResults: void 0 };
    Object.assign(state.portal, p);
  }
  if (state.offseason) Object.assign(state.offseason, d.osUser ?? { signed: [], summary: "", achieved: 0, securityDelta: 0 });
}
function humanCoachIds(state) {
  return state.league?.humans.map((h2) => h2.coachId) ?? [state.user.coachId];
}
function userFor(state, coachId) {
  if (coachId === state.user.coachId) return state.user;
  return state.league?.humans.find((h2) => h2.coachId === coachId)?.data?.user;
}
function humanTeamIds(state) {
  return humanCoachIds(state).map((c) => userFor(state, c)?.teamId).filter((t) => !!t);
}
function isHuman(state, teamId) {
  if (teamId === state.user.teamId) return true;
  if (!state.league) return false;
  return state.league.humans.some((h2) => userFor(state, h2.coachId)?.teamId === teamId);
}
function humanCoachOf(state, teamId) {
  if (teamId === state.user.teamId) return state.user.coachId;
  return state.league?.humans.find((h2) => userFor(state, h2.coachId)?.teamId === teamId)?.coachId;
}
function withHuman(state, coachId, fn) {
  const L = state.league;
  if (!L || coachId === state.user.coachId) return fn();
  const slot = L.humans.find((h2) => h2.coachId === coachId);
  if (!slot?.data) return fn();
  const prev = state.user.coachId;
  const prevSlot = L.humans.find((h2) => h2.coachId === prev);
  const mine = capture(state);
  if (prevSlot) prevSlot.data = mine;
  restore(state, slot.data);
  L.current = coachId;
  try {
    return fn();
  } finally {
    slot.data = capture(state);
    restore(state, mine);
    L.current = prev;
    if (prevSlot) prevSlot.data = void 0;
  }
}
function asTeam(state, teamId, fn) {
  const c = humanCoachOf(state, teamId);
  return c ? withHuman(state, c, fn) : fn();
}
function forEachHuman(state, fn) {
  const me = state.user.coachId;
  for (const c of [...humanCoachIds(state).filter((x) => x !== me), me]) {
    if (!humanCoachIds(state).includes(c)) continue;
    withHuman(state, c, () => fn(state.user.teamId, c));
  }
}
function switchHuman(state, coachId) {
  const L = state.league;
  if (!L || coachId === state.user.coachId) return;
  const slot = L.humans.find((h2) => h2.coachId === coachId);
  const mineSlot = L.humans.find((h2) => h2.coachId === state.user.coachId);
  if (!slot?.data || !mineSlot) return;
  mineSlot.data = capture(state);
  restore(state, slot.data);
  slot.data = void 0;
  L.current = coachId;
}
function ensureLeague(state) {
  return state.league ??= { humans: [{ coachId: state.user.coachId, name: coachName(state, state.user.coachId) }], current: state.user.coachId };
}
function coachName(state, coachId) {
  const c = state.coaches[coachId];
  return c ? `${c.first} ${c.last}` : "Coach";
}
function blankCoachData(teamId, coachId) {
  return {
    user: { teamId, coachId, hours: 0, hoursMax: 0, press: null, moments: [], board: [], expectation: "", expectationLevel: 0, offers: [], fired: false, retention: {}, scoutedTeams: [], achievements: [] },
    inbox: []
  };
}

// src/engine/facilities.ts
var FACILITY_KEYS = ["practice", "arena", "medical", "lounge", "film", "recruiting", "academic"];
var MAX_LEVEL = 5;
var FACILITIES = {
  practice: { name: "Practice Facility", icon: "\u{1F3CB}\uFE0F", desc: "Courts, weight room and shooting machines open around the clock.", base: 12e5, per: "+0.45 player development per upgrade" },
  arena: { name: "Arena & Fan Experience", icon: "\u{1F3DF}\uFE0F", desc: "Video board, student section, premium seats. Louder nights and bigger checks.", base: 25e5, per: "+3% home crowd energy, +1.5 preseason hype, +4% donations per upgrade" },
  medical: { name: "Sports Science & Medicine", icon: "\u{1FA7A}", desc: "Recovery suites, trainers and load monitoring.", base: 1e6, per: "\u22127% injury risk and \u22122% fatigue per upgrade" },
  lounge: { name: "Players\u2019 Lounge & Locker Room", icon: "\u{1F6CB}\uFE0F", desc: "Where the team lives. Happy players stay.", base: 6e5, per: "+morale every week, cheaper retention asks, +motivation" },
  film: { name: "Film & Analytics Suite", icon: "\u{1F3A5}", desc: "Tracking data, scouting video and a war room for game prep.", base: 5e5, per: "+0.45 tactics (faster installs, better game plans), tougher defense" },
  recruiting: { name: "Recruiting Center", icon: "\u{1F3AF}", desc: "A Hall of Champions built to sell your program on visits.", base: 8e5, per: "+1 recruiting hour/week, +3.5% relationship gains, +portal pull" },
  academic: { name: "Academic Center", icon: "\u{1F393}", desc: "Tutors, advisors and study halls.", base: 7e5, per: "+3 academic appeal with recruits, fewer eligibility scares" }
};
var COST_MUL = [0, 1, 2.2, 4, 7, 11];
function upgradeCost(key, toLevel, prestige = 60) {
  const scale = 0.35 + clamp(prestige, 0, 100) / 100 * 0.75;
  return Math.round(FACILITIES[key].base * (COST_MUL[toLevel] ?? 11) * scale / 5e4) * 5e4 || 5e4;
}
var BUSINESS = ["Motors", "Logistics", "Homes", "Capital", "Construction", "Energy", "Foods", "Insurance", "Realty", "Farms", "Media", "Medical Group", "Holdings", "Brewing"];
function hash2(s) {
  let h2 = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h2 ^= s.charCodeAt(i);
    h2 = Math.imul(h2, 16777619);
  }
  return h2 >>> 0;
}
function programBuild(state, teamId = state.user.teamId) {
  const all = state.build ??= {};
  if (all[teamId]) return all[teamId];
  const t = state.teams[teamId];
  const h2 = hash2(teamId);
  const lvl = (k, i) => {
    const base = k === "academic" ? t.academics : t.facilities;
    return clamp(Math.round((base - 1) / 9 * 4 + ((h2 >>> i * 3) % 3 - 1) * 0.6), 0, 4);
  };
  const levels = Object.fromEntries(FACILITY_KEYS.map((k, i) => [k, lvl(k, i)]));
  const pb = {
    teamId,
    fund: 0,
    levels,
    start: { ...levels },
    baseRating: t.facilities,
    projects: [],
    boosters: genBoosters(t),
    ledger: [],
    names: {}
  };
  all[teamId] = pb;
  pb.fund = Math.round(projectedDonations(state, pb) / 5e4) * 5e4;
  pb.ledger.push({ season: state.season, label: "Opening balance", amount: pb.fund });
  return pb;
}
var ensureBuild = (state) => {
  programBuild(state);
};
function genBoosters(t) {
  const n = 3 + Math.round(t.prestige / 30);
  const base = 6e4 * Math.exp(t.prestige * 0.022) * (0.6 + t.market * 0.08);
  const styles = ["loyal", "win-now", "old-guard", "flashy", "academic"];
  return Array.from({ length: n }, (_, i) => {
    const last = rng.pick(LAST_NAMES);
    return {
      id: rng.id("bst"),
      name: `${rng.pick(FIRST_NAMES)} ${last}`,
      business: `${last} ${rng.pick(BUSINESS)}`,
      style: styles[i % styles.length] === "loyal" && i > 0 ? rng.pick(styles) : styles[i % styles.length],
      capacity: Math.round(base * rng.range(0.5, 2.6) / 1e4) * 1e4,
      mood: rng.int(52, 72),
      pet: rng.pick(FACILITY_KEYS),
      given: 0
    };
  });
}
function bonus(pb, key) {
  return pb ? Math.max(0, pb.levels[key] - pb.start[key]) : 0;
}
function applyFacilities(state, e) {
  const pb = state.build?.[state.user.teamId];
  if (!pb) return;
  const b = (k) => bonus(pb, k);
  e.dev += 0.45 * b("practice");
  e.injury *= 1 - 0.07 * b("medical");
  e.stamina *= 1 - 0.02 * b("medical");
  e.morale += 0.12 * b("lounge");
  e.retentionMul *= 1 - 0.03 * b("lounge");
  e.motivation += 0.25 * b("lounge");
  e.tactics += 0.45 * b("film");
  e.defense += 12e-4 * b("film");
  e.relMul *= 1 + 0.035 * b("recruiting");
  e.hours += b("recruiting");
  e.portal += 0.35 * b("recruiting");
}
function facilityCrowd(state, homeId) {
  if (!isHuman(state, homeId)) return 0;
  return 0.03 * bonus(state.build?.[homeId], "arena");
}
function academicUpgrades(state) {
  return bonus(state.build?.[state.user.teamId], "academic");
}
function academicBonus(state, teamId) {
  if (!isHuman(state, teamId)) return 0;
  return 3 * bonus(state.build?.[teamId], "academic");
}
function syncRating(state, pb) {
  const t = state.teams[pb.teamId];
  if (!t) return;
  const ups = FACILITY_KEYS.filter((k) => k !== "academic").reduce((s, k) => s + bonus(pb, k), 0);
  t.facilities = clamp(Math.round((pb.baseRating + ups * 0.45) * 10) / 10, 1, 10);
}
function projectedDonations(state, pb) {
  const t = state.teams[pb.teamId];
  const base = 8e4 * Math.exp(t.prestige * 0.03) * (0.6 + t.market * 0.08) * (0.7 + t.hype / 100) * (1 + 0.04 * bonus(pb, "arena"));
  const boosters = pb.boosters.reduce((s, b) => s + b.capacity * (b.mood / 100), 0);
  return Math.round((base + boosters) / 1e4) * 1e4;
}
var PAYOUT = { "First Four": 15e4, "Round of 64": 3e5, "Round of 32": 6e5, "Sweet 16": 1e6, "Elite Eight": 15e5, "Final Four": 25e5, "Runner-up": 3e6, Champion: 4e6 };
var fmt = (n) => Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : `$${Math.round(n / 1e3)}K`;
function credit(pb, season, label, amount) {
  pb.fund += amount;
  pb.ledger.unshift({ season, label, amount });
  if (pb.ledger.length > 40) pb.ledger.length = 40;
}
function seasonDonations(state) {
  forEachHuman(state, () => humanDonations(state));
}
function humanDonations(state) {
  const uid = state.user.teamId;
  const pb = programBuild(state, uid);
  const t = state.teams[uid];
  const h2 = t.history.find((x) => x.season === state.season);
  if (!h2) return;
  const net = h2.w - h2.l;
  const tourney = h2.ncaaSeed != null;
  const rivalWins = Object.values(state.rivals?.pairs ?? {}).filter((r) => r.active && (r.a === uid || r.b === uid)).reduce((s, r) => s + r.meetings.filter((m) => m.s === state.season).reduce((x, m) => x + (m.w === uid ? 1 : -1), 0), 0);
  for (const b of pb.boosters) {
    let d = 0;
    switch (b.style) {
      case "win-now":
        d = net * 0.35 + (tourney ? 4 : -6) + (["Sweet 16", "Elite Eight", "Final Four", "Runner-up", "Champion"].includes(h2.postseason) ? 5 : 0);
        break;
      case "old-guard":
        d = rivalWins * 3 + (h2.confChamp ? 5 : 0) + (h2.confTourneyChamp ? 3 : 0) + net * 0.12;
        break;
      case "flashy":
        d = (h2.apFinal ? 8 - h2.apFinal * 0.3 : -4) + (t.hype - 50) * 0.08;
        break;
      case "academic":
        d = 1 + bonus(pb, "academic") * 1.5 + net * 0.08;
        break;
      default:
        d = 1 + net * 0.1;
    }
    if (b.promise && b.promise.season === state.season && !pb.projects.some((p) => p.key === b.promise.key && p.started === state.season) && !(pb.levels[b.promise.key] > pb.start[b.promise.key])) {
      d -= 25;
    }
    b.promise = void 0;
    b.mood = clamp(b.mood + d + (60 - b.mood) * 0.2, 5, 100);
  }
  const base = projectedDonations(state, pb) - pb.boosters.reduce((s, b) => s + b.capacity * (b.mood / 100), 0);
  credit(pb, state.season, "Annual fund donations", Math.round(base / 1e4) * 1e4);
  let boosterTotal = 0;
  for (const b of pb.boosters) {
    const gift = Math.round(b.capacity * (b.mood / 100) / 1e4) * 1e4;
    if (gift <= 0) continue;
    b.given += gift;
    boosterTotal += gift;
  }
  if (boosterTotal) credit(pb, state.season, `Booster gifts (${pb.boosters.length} boosters)`, boosterTotal);
  const pay = PAYOUT[h2.postseason] ?? 0;
  if (pay) credit(pb, state.season, `NCAA Tournament payout (${h2.postseason})`, pay);
  pb.lastDonations = Math.round(base + boosterTotal + pay);
  addNews(state, { kind: "user", headline: `${t.school} raises ${fmt(pb.lastDonations)} for the program fund`, body: `Donations, booster gifts${pay ? " and the NCAA Tournament payout" : ""} bring the fund to ${fmt(pb.fund)}. ${pb.boosters.filter((b) => b.mood < 35).length ? "A few boosters are grumbling." : "The boosters are happy."}`, teams: [uid], important: true });
}
function openFacilities(state) {
  for (const pb2 of Object.values(state.build ?? {})) {
    const done2 = pb2.projects.filter((p) => p.opens <= state.season);
    if (!done2.length) continue;
    pb2.projects = pb2.projects.filter((p) => p.opens > state.season);
    pb2.opened = { season: state.season, keys: done2.map((p) => p.key) };
    for (const p of done2) {
      pb2.levels[p.key] = Math.max(pb2.levels[p.key], p.level);
      if (isHuman(state, pb2.teamId)) asTeam(state, pb2.teamId, () => {
        const name2 = pb2.names[p.key] ?? FACILITIES[p.key].name;
        state.user.moments.push({ kind: "facility", teamId: pb2.teamId, key: p.key, level: p.level, name: name2 });
        addNews(state, { kind: "user", headline: `Ribbon cutting: ${state.teams[pb2.teamId].school} opens its level ${p.level} ${name2}`, body: FACILITIES[p.key].desc, teams: [pb2.teamId], important: true });
      });
    }
    syncRating(state, pb2);
  }
  const pb = state.build?.[state.user.teamId];
  if (pb) {
    const t = state.teams[pb.teamId];
    t.hype = clamp(t.hype + 1.5 * bonus(pb, "arena"), 0, 100);
  }
}
function boosterWeek(state) {
  if (state.phase !== "regular") return;
  const pb = programBuild(state);
  if (state.inbox.some((i) => i.id.startsWith("bst-") && !i.resolved)) return;
  if (!rng.chance(0.12)) return;
  const t = state.teams[pb.teamId];
  const b = rng.pick(pb.boosters);
  const last = b.name.split(" ").slice(-1)[0];
  const kinds = ["seats", "pet", "walkon"];
  const unnamed = FACILITY_KEYS.filter((k) => !pb.names[k] && pb.levels[k] >= 1);
  if (unnamed.length && b.capacity >= 3e5) kinds.push("naming", "naming");
  if (b.style === "win-now" && t.record.streak <= -3) kinds.push("demand", "demand", "demand");
  const kind = rng.pick(kinds);
  const id = `bst-${rng.id("")}`;
  const choice = (label, accept, extra = {}) => {
    const { amount, key, ...rest } = extra;
    return { label, effects: [], ...rest, booster: { id: b.id, action: kind, accept, ...amount ? { amount } : {}, ...key ? { key } : {} } };
  };
  let subject = "", body = "", choices = [];
  if (kind === "naming") {
    const key = rng.pick(unnamed);
    const amount = Math.round(b.capacity * 1.5 / 5e4) * 5e4;
    subject = `${b.name} wants their name on the ${FACILITIES[key].name}`;
    body = `"${fmt(amount)}, today, and it becomes the ${last} Family ${FACILITIES[key].name}. My grandkids would love it." ${b.name} (${b.business}) is one of our biggest supporters.`;
    choices = [choice(`Accept: the ${last} Family ${FACILITIES[key].name}`, true, { amount, key, hint: `+${fmt(amount)} to the fund`, result: `The ${last} Family ${FACILITIES[key].name}. The signage goes up next week.` }), choice("Decline: some things aren\u2019t for sale", false, { hint: `${b.name} is hurt`, result: `${b.name} took it personally.` })];
  } else if (kind === "pet") {
    const amount = Math.round(b.capacity * 0.9 / 5e4) * 5e4;
    subject = `${b.name} will fund the ${FACILITIES[b.pet].name}, with strings`;
    body = `"I'll send ${fmt(amount)} now. All I ask is that you break ground on the ${FACILITIES[b.pet].name} before the season's over." If you take the money and don't build it, ${b.name} won't forget.`;
    choices = [choice(`Take it and promise to build`, true, { amount, key: b.pet, hint: `+${fmt(amount)}; you must start that project this season`, result: `${fmt(amount)} is in the fund. Now build it.` }), choice("Decline: we set our own priorities", false, { hint: "Mood drops a little", result: `${b.name} understood. Mostly.` })];
  } else if (kind === "seats") {
    const amount = Math.round(b.capacity * 0.25 / 1e4) * 1e4;
    subject = `${b.name} wants courtside seats for clients`;
    body = `"A few of my clients want courtside for the next big home game. I'll make it worth your while: ${fmt(amount)}." The ticket office says it means bumping some longtime season-ticket holders.`;
    choices = [choice("Make it happen", true, { amount, hint: `+${fmt(amount)}; a little bad press`, effects: [{ kind: "mediaRep", delta: -1 }], result: "The clients loved it. The season-ticket holders did not." }), choice("Seats are for the fans", false, { hint: `${b.name} is annoyed; fans approve`, effects: [{ kind: "hype", delta: 2 }], result: "The fans heard about it, and they loved it." })];
  } else if (kind === "walkon") {
    const amount = Math.round(b.capacity * 0.8 / 5e4) * 5e4;
    subject = `${b.name}'s nephew wants a spot on the team`;
    body = `"My nephew can really play. Put him on the team as a walk-on and I'll write a check for ${fmt(amount)}." He can't really play.`;
    choices = [choice("Give him a spot at the end of the bench", true, { amount, hint: `+${fmt(amount)}; the locker room rolls its eyes`, effects: [{ kind: "morale", target: "team", delta: -3 }], result: "The nephew has a jersey. He has not touched the ball." }), choice("Roster spots are earned", false, { hint: `${b.name} is unhappy; your players respect it`, effects: [{ kind: "morale", target: "team", delta: 2 }], result: "Your players noticed. So did the booster." })];
  } else {
    subject = `${b.name} is losing patience`;
    body = `"${t.school} has lost ${-t.record.streak} straight. I don't give money to losers. Turn this around, or my checkbook closes."`;
    choices = [choice("\u201CWe\u2019ll turn it around. You have my word.\u201D", true, { hint: "Calms them for now; more pressure if it keeps going", result: `${b.name} will be watching the next few weeks.` }), choice("\u201CWith respect, you don\u2019t run this program.\u201D", false, { hint: `Mood drops; media likes the backbone`, effects: [{ kind: "mediaRep", delta: 2 }], result: `${b.name} didn't love that. The media did.` })];
  }
  state.inbox.unshift({ id, day: state.day, season: state.season, from: b.name, fromRole: `Booster \xB7 ${b.business}`, subject, body, choices, resolved: false });
}
var AGING = 0.08;
function facilityRaceOn(state) {
  return !!state.settings.facilityRace;
}
var PROJECT_NOUN = {
  practice: "practice facility",
  arena: "arena renovation",
  medical: "sports science center",
  lounge: "locker room makeover",
  film: "film and analytics suite",
  recruiting: "recruiting center",
  academic: "academic center"
};
function raceState(state) {
  const R = state.facRace ??= { base: {}, prestige: {}, log: [] };
  R.prestige ??= {};
  for (const t of Object.values(state.teams)) {
    if (!(t.id in R.base)) R.base[t.id] = t.facilities;
    if (!(t.id in R.prestige)) R.prestige[t.id] = t.prestige;
  }
  return R;
}
function aiFacilities(state) {
  if (!facilityRaceOn(state)) return;
  const R = raceState(state);
  const uid = state.user.teamId;
  const built = [];
  const teams = Object.values(state.teams);
  const shift = (t) => t.prestige - (R.prestige[t.id] ?? t.prestige);
  const avgShift = teams.reduce((s, t) => s + shift(t), 0) / Math.max(1, teams.length);
  for (const t of teams) {
    if (isHuman(state, t.id)) continue;
    t.facilities = clamp(Math.round((t.facilities - AGING) * 100) / 100, 1, 10);
    const target = clamp(R.base[t.id] + (shift(t) - avgShift) * 0.09, 1, 10);
    const recent = t.history.slice(-3);
    const games = recent.reduce((s, x) => s + x.w + x.l, 0);
    const form = games ? recent.reduce((s, x) => s + x.w, 0) / games - 0.5 : 0;
    const dancing = recent[recent.length - 1]?.ncaaSeed != null ? 0.03 : 0;
    const p = clamp(0.115 + (target - t.facilities) * 0.12 + (t.market - 5) * 8e-3 + form * 0.1 + dancing, 0.02, 0.5);
    if (!rng.chance(p)) continue;
    const key = rng.pick(FACILITY_KEYS);
    t.facilities = clamp(Math.round((t.facilities + rng.range(0.4, 0.9)) * 10) / 10, 1, 10);
    const level2 = clamp(Math.round((t.facilities - 1) / 9 * 4) + 1, 1, MAX_LEVEL);
    built.push({ season: state.season, teamId: t.id, key, cost: upgradeCost(key, level2, t.prestige), rating: t.facilities });
  }
  for (const hid of humanTeamIds(state)) {
    const pb = state.build?.[hid];
    if (pb) {
      pb.baseRating = clamp(Math.round((pb.baseRating - AGING) * 100) / 100, 1, 10);
      syncRating(state, pb);
    }
  }
  R.log = [...built.sort((a, b) => b.cost - a.cost), ...R.log].slice(0, 80);
  if (!built.length) return;
  const user2 = state.teams[uid];
  const rivals = new Set(Object.values(state.rivals?.pairs ?? {}).filter((r) => r.active && (r.a === uid || r.b === uid)).map((r) => r.a === uid ? r.b : r.a));
  const notable = built.filter((b) => state.teams[b.teamId].prestige >= 55 || state.teams[b.teamId].conf === user2.conf || rivals.has(b.teamId)).slice(0, 5);
  for (const b of [...notable].reverse()) {
    const t = state.teams[b.teamId];
    const close = t.conf === user2.conf || rivals.has(t.id);
    addNews(state, { kind: "feature", headline: `${t.school} breaks ground on a ${fmt(b.cost)} ${PROJECT_NOUN[b.key]}`, body: `${FACILITIES[b.key].desc} ${close ? `It's a shot across the bow for ${user2.school}.` : ""}`.trim(), teams: [t.id], important: close });
  }
  addNews(state, { kind: "feature", headline: `Facilities arms race: ${built.length} programs broke ground this year`, body: `The biggest projects: ${built.slice(0, 5).map((b) => `${state.teams[b.teamId].school} (${fmt(b.cost)} ${PROJECT_NOUN[b.key]})`).join(", ")}.`, teams: built.slice(0, 5).map((b) => b.teamId) });
}

// src/engine/staff.ts
var STAFF_ROLES = ["assoc", "recruiting", "defense", "development", "gm", "strength"];
var ROLE_INFO = {
  assoc: { title: "Associate Head Coach", short: "Assoc. HC", icon: "\u{1F9E0}", desc: "Your right hand on game day. Sharper in-game execution and a steadier locker room.", salaryMul: 1.3 },
  recruiting: { title: "Recruiting Coordinator", short: "Recruiting", icon: "\u{1F3AF}", desc: "More recruiting hours, stronger relationships, and a pipeline state where prospects listen.", salaryMul: 1.1 },
  defense: { title: "Defensive Coordinator", short: "Defense", icon: "\u{1F6E1}\uFE0F", desc: "Schemes that take away the opponent\u2019s best looks and force turnovers.", salaryMul: 1.1 },
  development: { title: "Player Development Coach", short: "Development", icon: "\u{1F4C8}", desc: "Turns summers into leaps. Bigger offseason rating jumps.", salaryMul: 1 },
  gm: { title: "General Manager", short: "GM", icon: "\u{1F4BC}", desc: "Runs roster strategy and donor relations. Bigger NIL pool, better portal pitches, cheaper retention.", salaryMul: 1.2 },
  strength: { title: "Strength & Conditioning", short: "S&C", icon: "\u{1F4AA}", desc: "Fresher legs late in games and fewer injuries.", salaryMul: 0.6 }
};
var TRAIT_INFO = {
  "Recruiting Ace": "Lives on the AAU circuit \u2014 extra recruiting pull.",
  "X&O Wizard": "Whiteboard genius \u2014 extra game-day impact.",
  "Players\u2019 Favorite": "Players love him \u2014 small morale boost.",
  Grinder: "Outworks everyone \u2014 steady, reliable.",
  "Former Pro": "Played in the league \u2014 recruits and pros listen.",
  "Rising Star": "Young and ambitious \u2014 improves fast, may leave fast.",
  "Old School": "Been there, done that \u2014 very loyal, slowly declining.",
  "Analytics Guru": "Numbers-driven edges in game planning.",
  Connector: "Knows everyone \u2014 donors, agents, high school coaches.",
  "Loyal Soldier": "Not going anywhere. Hard to poach."
};
var TRAITS2 = Object.keys(TRAIT_INFO);
function staffBudgetFor(prestige, market) {
  const b = 3e5 + Math.exp(prestige * 0.045) * 6e4 * (0.7 + market * 0.06);
  return Math.round(b / 25e3) * 25e3;
}
function salaryAsk(rating, role) {
  return roundMoney(12e3 * Math.exp(rating * 0.048) * ROLE_INFO[role].salaryMul);
}
function q(rating) {
  return clamp((rating - 35) / 55, -0.3, 1);
}
var statesWithRecruits = Array.from(new Set(PLACES.filter((p) => p.w >= 1).map((p) => p.state)));
function genStaff(role, level2) {
  const rating = Math.round(clamp(level2 + rng.normal(0, 9), 22, 97));
  const age = role === "strength" ? rng.int(27, 55) : rng.int(29, 64);
  let trait = rng.pick(TRAITS2);
  if (age < 36 && rng.chance(0.4)) trait = "Rising Star";
  if (age > 56 && rng.chance(0.4)) trait = "Old School";
  const ambitionBase = age < 40 ? 65 : age < 50 ? 50 : 30;
  const m = {
    id: rng.id("st"),
    first: rng.pick(FIRST_NAMES),
    last: rng.pick(LAST_NAMES),
    age,
    role,
    rating,
    trait,
    pipeline: role === "recruiting" || role === "assoc" && rng.chance(0.4) || trait === "Connector" ? rng.pick(statesWithRecruits) : null,
    salary: 0,
    years: rng.int(1, 4),
    loyalty: Math.round(clamp(rng.normal(trait === "Loyal Soldier" || trait === "Old School" ? 82 : 55, 14), 5, 99)),
    ambition: Math.round(clamp(rng.normal(trait === "Rising Star" ? 85 : ambitionBase, 14), 5, 99)),
    seasons: 0,
    history: []
  };
  m.ask = salaryAsk(rating, role);
  m.salary = m.ask;
  return m;
}
function genMarket(state) {
  const out = [];
  for (const role of STAFF_ROLES) {
    for (let i = 0; i < 6; i++) {
      const level2 = rng.weighted([82, 68, 55, 42, 30], [1, 2.5, 3, 2.2, 1.4]);
      out.push(genStaff(role, level2));
    }
  }
  return out.sort((a, b) => b.rating - a.rating);
}
function initStaff(state, opts = {}) {
  const team = state.teams[state.user.teamId];
  const budget = staffBudgetFor(team.prestige, team.market);
  const level2 = 40 + team.prestige * 0.38;
  const members = [];
  for (const role of STAFF_ROLES) {
    if (opts.vacantGM && role === "gm") continue;
    const m = genStaff(role, level2);
    m.history.push(`Joined ${team.school} staff`);
    members.push(m);
  }
  const target = opts.vacantGM ? budget - salaryAsk(Math.round(level2), "gm") * 1.1 : budget * 0.88;
  let total = members.reduce((s, m) => s + m.salary, 0);
  let guard = 0;
  while (total > target && guard++ < 60) {
    const top = [...members].sort((a, b) => b.salary - a.salary)[0];
    top.rating = Math.max(25, top.rating - 3);
    top.salary = salaryAsk(top.rating, top.role);
    total = members.reduce((s, m) => s + m.salary, 0);
  }
  const st = { members, market: [], budget, buyouts: 0, tree: [] };
  state.staff = st;
  st.market = genMarket(state);
  return st;
}
function staffWelcomeInbox(state, migrated = false) {
  const team = state.teams[state.user.teamId];
  state.inbox.unshift({
    id: `staffgm${state.season}${Date.now().toString(36)}`,
    day: state.day,
    season: state.season,
    from: "Athletic Director",
    fromRole: team.school,
    resolved: false,
    priority: true,
    subject: migrated ? "Meet your coaching staff" : "New position approved: General Manager",
    body: migrated ? `Coach, your assistants are now on the books \u2014 open the Coaching Staff page to meet them. Good news too: I've approved a brand-new General Manager position to run roster strategy and donor relations. Your staff pool is ${fmtMoney(state.staff.budget)} a year. Go hire someone great.` : `Every serious program has one now. I've approved a General Manager position to run roster strategy, the portal and donor relations. Your staff pool is ${fmtMoney(state.staff.budget)} a year \u2014 the hiring market is open.`,
    choices: [{ label: "Open the Coaching Staff page", effects: [], result: "Your staff awaits.", goto: "staff" }]
  });
}
var NO_EFFECTS = {
  tactics: 0,
  motivation: 0,
  defense: 0,
  pressure: 0,
  hours: 0,
  relMul: 1,
  pipeline: null,
  pipelineBonus: 1,
  dev: 0,
  nilMul: 1,
  portal: 0,
  retentionMul: 1,
  stamina: 1,
  injury: 1,
  morale: 0
};
function staffEffects(state, staffOnly = false) {
  const st = state.staff;
  if (!st) return NO_EFFECTS;
  const e = { ...NO_EFFECTS };
  for (const m of st.members) {
    const k = q(m.rating);
    const t = m.trait;
    switch (m.role) {
      case "assoc":
        e.tactics += 2.5 * k + (t === "X&O Wizard" || t === "Analytics Guru" ? 0.8 : 0);
        e.motivation += 2 * k + (t === "Players\u2019 Favorite" ? 0.8 : 0);
        if (m.pipeline && !e.pipeline) {
          e.pipeline = m.pipeline;
          e.pipelineBonus = 1.15;
        }
        break;
      case "recruiting":
        e.hours += Math.round(4 + 6 * k + (t === "Recruiting Ace" ? 3 : 0));
        e.relMul *= 1 + 0.15 * k + (t === "Recruiting Ace" || t === "Former Pro" ? 0.05 : 0);
        if (m.pipeline) {
          e.pipeline = m.pipeline;
          e.pipelineBonus = 1.3 + Math.max(0, k) * 0.2;
        }
        break;
      case "defense":
        e.defense += 0.0105 * k + (t === "X&O Wizard" || t === "Analytics Guru" ? 3e-3 : 0);
        e.pressure += 6e-3 * Math.max(0, k);
        break;
      case "development":
        e.dev += 3 * k + (t === "Grinder" || t === "Former Pro" ? 0.6 : 0);
        break;
      case "gm":
        e.nilMul *= 1 + 0.08 * k + (t === "Connector" ? 0.03 : 0);
        e.portal += 3 * k + (t === "Connector" ? 1 : 0);
        e.retentionMul *= 1 - 0.08 * k;
        break;
      case "strength":
        e.stamina *= 1 - 0.1 * k;
        e.injury *= 1 - 0.3 * k;
        break;
    }
    if (t === "Players\u2019 Favorite") e.morale += 0.3;
  }
  if (!staffOnly) applyFacilities(state, e);
  e.hours = Math.max(0, e.hours);
  return e;
}
function maybePoachStaff(state, vacancyTeamId) {
  const st = state.staff;
  if (!st) return null;
  const vac = state.teams[vacancyTeamId];
  const user2 = state.teams[state.user.teamId];
  if (!vac || vac.id === user2.id || vac.prestige > user2.prestige + 5) return null;
  if (state.inbox.some((i) => !i.resolved && i.choices.some((c) => c.staffPoach))) return null;
  const cands = st.members.filter((m2) => m2.role !== "strength" && m2.rating >= 60 && m2.ambition >= 45 && m2.seasons >= 1);
  if (!cands.length) return null;
  const m = cands.sort((a, b) => b.rating + b.ambition - (a.rating + a.ambition))[0];
  const p = clamp((m.ambition - m.loyalty * 0.5) / 100 + (m.rating - 60) / 120, 0.05, 0.75);
  if (!rng.chance(p)) return null;
  const counter = roundMoney(m.salary * 0.35);
  const item2 = {
    id: `poach${m.id}${state.season}`,
    day: state.day,
    season: state.season,
    resolved: false,
    priority: true,
    from: `${m.first} ${m.last}`,
    fromRole: ROLE_INFO[m.role].title,
    personId: m.id,
    personKind: "staff",
    subject: `${vac.school} wants me as their head coach`,
    body: `Coach, I need to tell you something. ${vac.school} offered me their head job. It's a real opportunity \u2014 but I love it here. If you want me to stay, I'd need a raise of about ${fmtMoney(counter)} and an extension. Either way, I'll always be grateful.`,
    choices: [
      { label: `Counter-offer (+${fmtMoney(counter)}/yr, 3-yr extension)`, hint: "Keep him; uses staff pool", effects: [], result: `${m.first} is staying. Loyalty earned.`, staffPoach: { staffId: m.id, teamId: vac.id, keep: true } },
      { label: "Give him your blessing", hint: "He leaves; your coaching tree grows (+reputation)", effects: [{ kind: "rep", delta: 2 }, { kind: "xp", delta: 40 }], result: `${m.first} ${m.last} is the new head coach at ${vac.school}. Your coaching tree grows.`, staffPoach: { staffId: m.id, teamId: vac.id, keep: false } }
    ]
  };
  state.inbox.unshift(item2);
  return item2;
}
function resolvePoach(state, staffId, teamId, keep) {
  const st = state.staff;
  const m = st?.members.find((x) => x.id === staffId);
  const team = state.teams[teamId];
  if (!st || !m || !team) return;
  if (keep) {
    const raise = roundMoney(m.salary * 0.35);
    m.salary += raise;
    m.years = Math.min(5, m.years + 3);
    m.loyalty = clamp(m.loyalty + 25, 0, 99);
    m.ambition = clamp(m.ambition - 15, 0, 99);
    m.history.push(`Turned down ${team.school} head job (${state.season})`);
    return;
  }
  st.members = st.members.filter((x) => x.id !== staffId);
  const prev = state.coaches[team.coachId];
  if (prev && !prev.isUser) delete state.coaches[prev.id];
  const c = genAICoach(team.prestige, team.id);
  c.id = m.id;
  c.first = m.first;
  c.last = m.last;
  c.age = m.age;
  c.rating = clamp(m.rating - 5, 20, 95);
  c.reputation = clamp(m.rating - 10, 10, 90);
  c.careerW = 0;
  c.careerL = 0;
  c.career = [];
  c.jobSecurity = 75;
  c.contractYears = 5;
  state.coaches[c.id] = c;
  team.coachId = c.id;
  team.coachChange = true;
  st.tree.push({ staffId: m.id, name: `${m.first} ${m.last}`, role: m.role, teamId: team.id, season: state.season, coachId: c.id });
  const user2 = state.teams[state.user.teamId];
  state.news.unshift({
    id: `n${Date.now().toString(36)}${m.id}`,
    season: state.season,
    day: state.day,
    date: state.calendar[state.day]?.label ?? "",
    kind: "coach",
    headline: `${team.school} hires ${user2.school} assistant ${m.first} ${m.last} as head coach`,
    body: `${m.first} ${m.last}, ${user2.school}'s ${ROLE_INFO[m.role].title.toLowerCase()}, gets his first head coaching job. Another branch on Coach ${state.coaches[state.user.coachId].last}'s coaching tree.`,
    teams: [team.id, user2.id],
    important: true,
    personId: c.id,
    personKind: "coach"
  });
}
function finalizePoaching(state) {
  for (const item2 of state.inbox) {
    if (item2.resolved) continue;
    const ch = item2.choices.find((c) => c.staffPoach && !c.staffPoach.keep);
    if (!ch || !ch.staffPoach) continue;
    item2.resolved = true;
    item2.chosen = item2.choices.indexOf(ch);
    resolvePoach(state, ch.staffPoach.staffId, ch.staffPoach.teamId, false);
  }
}
function staffSeasonEnd(state) {
  const st = state.staff;
  if (!st) return;
  const expiring = st.members.filter((m) => m.years <= 1);
  if (!expiring.length) return;
  state.inbox.unshift({
    id: `staffexp${state.season}`,
    day: state.day,
    season: state.season,
    resolved: false,
    from: "Director of Operations",
    fromRole: "Basketball Operations",
    subject: `${expiring.length} staff contract${expiring.length > 1 ? "s" : ""} expiring`,
    body: `${expiring.map((m) => `${m.first} ${m.last} (${ROLE_INFO[m.role].short}, ${m.rating} rating, ${fmtMoney(m.salary)})`).join("; ")}. Unless you say otherwise, we'll re-sign them for two more years with a modest raise.`,
    choices: [
      { label: "Re-sign everyone (default)", effects: [], result: "Contracts will be renewed for two years.", staffRenew: true },
      { label: "Let them all walk", hint: "Open the slots for new hires", effects: [], result: "They\u2019ll leave when the new season begins. The hiring market awaits.", staffRenew: false }
    ]
  });
}
function staffNewSeason(state) {
  const st = state.staff;
  if (!st) return;
  const team = state.teams[state.user.teamId];
  st.budget = staffBudgetFor(team.prestige, team.market);
  st.buyouts = 0;
  const keep = [];
  for (const m of st.members) {
    m.age++;
    m.seasons++;
    m.years--;
    const drift = m.age < 38 ? rng.int(0, 3) : m.age > 58 ? rng.int(-2, 0) : rng.int(-1, 2);
    m.rating = clamp(m.rating + drift + (m.trait === "Rising Star" ? 1 : 0), 15, 99);
    m.ambition = clamp(m.ambition + (m.rating >= 70 ? 3 : 0), 0, 99);
    if (m.years <= 0) {
      if (m.release) {
        m.history.push(`Contract expired at ${team.school} (${state.season})`);
        m.ask = salaryAsk(m.rating, m.role);
        st.market.push(m);
        continue;
      }
      m.years = 2;
      m.salary = roundMoney(m.salary * 1.08);
    }
    delete m.release;
    keep.push(m);
  }
  st.members = keep;
  const returning = st.market.filter(() => rng.chance(0.35)).slice(0, 10);
  st.market = [...returning, ...genMarket(state)].sort((a, b) => b.rating - a.rating);
  for (const m of st.market) m.ask = salaryAsk(m.rating, m.role);
}
function staffFollowCoach(state, newTeamId, oldSchool) {
  const st = state.staff;
  if (!st) return;
  const team = state.teams[newTeamId];
  st.budget = staffBudgetFor(team.prestige, team.market);
  for (const m of st.members) m.history.push(`Followed you from ${oldSchool} to ${team.school} (${state.season})`);
}

// src/engine/rankings.ts
var HOME_ADJ = 3.2;
var BUBBLE = 9;
function powerToPoints(power, mean) {
  return (power - mean) * 1.15;
}
function computeRatings(state) {
  const teams = Object.values(state.teams);
  const mean = teams.reduce((s, t) => s + t.power, 0) / teams.length;
  const games = state.schedule.filter((g) => g.played && g.type !== "exh");
  const byTeam = {};
  for (const t of teams) byTeam[t.id] = [];
  for (const g of games) {
    if (!state.teams[g.home] || !state.teams[g.away]) continue;
    const m = (g.hs ?? 0) - (g.as ?? 0);
    const site = g.neutral ? 0 : 1;
    byTeam[g.home].push({ opp: g.away, margin: m, site, won: m > 0 });
    byTeam[g.away].push({ opp: g.home, margin: -m, site: -site, won: m < 0 });
  }
  let R = {};
  for (const t of teams) R[t.id] = powerToPoints(t.power, mean);
  for (let it = 0; it < 25; it++) {
    const N = {};
    for (const t of teams) {
      const gl = byTeam[t.id];
      if (!gl.length) {
        N[t.id] = R[t.id];
        continue;
      }
      let s = 0;
      for (const g of gl) s += clamp(g.margin - g.site * HOME_ADJ, -28, 28) + R[g.opp];
      N[t.id] = s / gl.length;
    }
    const avg2 = Object.values(N).reduce((a, b) => a + b, 0) / teams.length;
    for (const k in N) N[k] -= avg2;
    R = N;
  }
  for (const t of teams) {
    const gp2 = byTeam[t.id].length;
    const prior = powerToPoints(t.power, mean);
    const k = 5;
    t.srs = Math.round(R[t.id] * 10) / 10;
    t.rating = Math.round((R[t.id] * gp2 + prior * k) / (gp2 + k) * 10) / 10;
  }
  for (const t of teams) {
    let wab = 0;
    for (const g of byTeam[t.id]) {
      const opp = state.teams[g.opp];
      const p = normCdf((BUBBLE + g.site * HOME_ADJ - opp.rating) / 11);
      wab += (g.won ? 1 : 0) - p;
    }
    t.wab = Math.round(wab * 100) / 100;
  }
  const sorted = [...teams].sort((a, b) => b.rating - a.rating);
  const top50 = new Set(sorted.slice(0, 50).map((t) => t.id));
  for (const t of teams) {
    t.record.q1w = byTeam[t.id].filter((g) => g.won && top50.has(g.opp)).length;
    t.record.q1l = byTeam[t.id].filter((g) => !g.won && !top50.has(g.opp) && state.teams[g.opp].rating < -2).length;
  }
  const net = [...teams].sort((a, b) => netScore(b) - netScore(a));
  net.forEach((t, i) => t.net = i + 1);
}
function netScore(t) {
  return t.rating + t.wab * 0.55;
}
function selectionScore(t) {
  return t.rating * 0.55 + t.wab * 1.7 + t.record.q1w * 0.4 - t.record.q1l * 0.8;
}
function runPoll(state, label) {
  const teams = Object.values(state.teams);
  const preseason = state.schedule.every((g) => !g.played);
  for (const t of teams) {
    const g = t.record.w + t.record.l;
    let cur;
    if (preseason || g === 0) {
      cur = t.rating * 1 + t.prestige * 0.06;
    } else {
      cur = t.rating * 0.7 + t.wab * 1.4 + t.record.w / g * 6 - t.record.l * 0.35 + t.prestige * 0.02;
    }
    t.pollScore = preseason || !t.pollScore ? cur : t.pollScore * 0.35 + cur * 0.65;
  }
  const ranked2 = [...teams].sort((a, b) => b.pollScore - a.pollScore);
  for (const t of teams) {
    t.prevApRank = t.apRank;
    t.apRank = null;
  }
  const top = ranked2.slice(0, 25);
  top.forEach((t, i) => t.apRank = i + 1);
  const week = state.calendar[state.day]?.week ?? 0;
  state.polls.push({ day: state.day, week, ranks: top.map((t) => t.id), label });
  return top.map((t) => t.id);
}
var REGIONS = ["East", "West", "South", "Midwest"];
function selectField(state, autoBids2) {
  const teams = Object.values(state.teams);
  const autoSet = new Set(Object.values(autoBids2));
  const autos = teams.filter((t) => autoSet.has(t.id));
  const atLarge = teams.filter((t) => !autoSet.has(t.id)).sort((a, b) => selectionScore(b) - selectionScore(a)).slice(0, 68 - autos.length);
  const lastFour = [...atLarge].sort((a, b) => selectionScore(a) - selectionScore(b)).slice(0, 4);
  const lowAutos = [...autos].sort((a, b) => selectionScore(a) - selectionScore(b)).slice(0, 4);
  const ffIds = new Set([...lastFour, ...lowAutos].map((t) => t.id));
  const direct = [...autos, ...atLarge].filter((t) => !ffIds.has(t.id)).sort((a, b) => selectionScore(b) - selectionScore(a));
  const lines = [];
  for (let s = 1; s <= 16; s++) {
    const n = s === 11 || s === 16 ? 2 : 4;
    for (let i = 0; i < n; i++) lines.push(s);
  }
  const out = [];
  const regionLoad = {};
  direct.forEach((t, i) => {
    const seed = lines[i];
    out.push({ teamId: t.id, seed, region: -1, auto: autoSet.has(t.id), firstFour: false, score: selectionScore(t) });
  });
  for (let s = 1; s <= 16; s++) {
    const group = out.filter((e) => e.seed === s);
    const order = s % 2 === 1 ? [0, 1, 2, 3] : [3, 2, 1, 0];
    const free = order.filter((r) => !(regionLoad[s] ?? []).includes(r));
    group.forEach((e, i) => {
      e.region = free[i % free.length];
      (regionLoad[s] ??= []).push(e.region);
    });
  }
  const ff11 = lastFour.sort((a, b) => selectionScore(b) - selectionScore(a));
  const ff16 = lowAutos.sort((a, b) => selectionScore(b) - selectionScore(a));
  const missing = (seed) => [0, 1, 2, 3].filter((r) => !out.some((e) => e.seed === seed && e.region === r));
  const m11 = missing(11), m16 = missing(16);
  ff11.forEach((t, i) => out.push({ teamId: t.id, seed: 11, region: m11[Math.floor(i / 2)] ?? 0, auto: false, firstFour: true, score: selectionScore(t) }));
  ff16.forEach((t, i) => out.push({ teamId: t.id, seed: 16, region: m16[Math.floor(i / 2)] ?? 0, auto: true, firstFour: true, score: selectionScore(t) }));
  return out;
}
function confPct(t) {
  const g = t.record.cw + t.record.cl;
  return g ? t.record.cw / g : 0.5;
}
function confStandings(state, confId) {
  return Object.values(state.teams).filter((t) => t.conf === confId).sort((a, b) => {
    const pa = confPct(a), pb = confPct(b);
    if (pb !== pa) return pb - pa;
    if (b.record.cw !== a.record.cw) return b.record.cw - a.record.cw;
    return b.rating - a.rating;
  });
}
function spread(state, homeId, awayId, neutral) {
  const h2 = state.teams[homeId], a = state.teams[awayId];
  return Math.round((h2.rating - a.rating + (neutral ? 0 : HOME_ADJ)) * 2) / 2;
}

// src/engine/development.ts
var FOCUS_INFO = {
  balanced: { label: "Balanced", icon: "\u2696\uFE0F", desc: "A little of everything, weighted toward what his position needs.", keys: [] },
  shooting: { label: "Shooting", icon: "\u{1F3AF}", desc: "Add range: three-point shooting, mid-range and free throws.", keys: ["tp", "mid", "ft"] },
  finishing: { label: "Attack the Rim", icon: "\u{1F4A5}", desc: "Finishing, explosiveness and first-step speed.", keys: ["ins", "ath", "spd"] },
  playmaking: { label: "Playmaking", icon: "\u{1F9E0}", desc: "Run the offense: passing, handles and feel for the game.", keys: ["pas", "hdl", "iq"] },
  perimeterD: { label: "Lockdown D", icon: "\u{1F512}", desc: "On-ball defense, active hands and a motor that never stops.", keys: ["perD", "stl", "sta"] },
  interior: { label: "Protect the Paint", icon: "\u{1F9F1}", desc: "Interior defense, shot blocking and rebounding.", keys: ["intD", "blk", "reb"] },
  strength: { label: "Weight Room", icon: "\u{1F3CB}\uFE0F", desc: "Strength, finishing through contact and owning the glass.", keys: ["str", "ins", "reb"] }
};
var FOCUS_ORDER = ["balanced", "shooting", "finishing", "playmaking", "perimeterD", "interior", "strength"];
var FOCUS_SHARE = 0.25;
var PRACTICE_INFO = {
  balanced: { label: "Standard Practice", icon: "\u{1F3C0}", desc: "A normal week: drills, scrimmage and film. No edge, no cost.", growth: 0, tactics: 0, injury: 1, stamina: 1, morale: 0 },
  skill: { label: "Skill Development", icon: "\u{1F6E0}\uFE0F", desc: "Individual work on every player's plan. Less time spent preparing for opponents.", growth: 1, tactics: -0.8, injury: 1, stamina: 1, morale: 0 },
  gameprep: { label: "Game Prep", icon: "\u{1F4CB}", desc: "Scout the opponent, walk through their sets and rehearse late-game situations.", growth: 0, tactics: 2, injury: 0.9, stamina: 1, morale: 0 },
  conditioning: { label: "Conditioning", icon: "\u{1F3C3}", desc: "Sprints and stamina work. Builds lasting stamina, but tired bodies get hurt more.", growth: 0, tactics: -0.4, injury: 1.15, stamina: 0.96, morale: -0.5 },
  recovery: { label: "Recovery Week", icon: "\u{1F6CC}", desc: "Light practice, film and treatment. Injured players heal faster and spirits lift.", growth: 0, tactics: -0.4, injury: 0.6, stamina: 0.93, morale: 1.2 },
  intense: { label: "Compete Week", icon: "\u{1F525}", desc: "Full-contact scrimmages and live drills. Players improve fast, but tempers and bodies wear thin.", growth: 1.6, tactics: 0.6, injury: 1.35, stamina: 1.05, morale: -1.5 }
};
var IN_SEASON = ["preseason", "regular", "confTourney", "selection", "ncaa"];
function devState(state) {
  if (!state.development) {
    state.development = { plans: {}, spotlight: [], practice: "balanced", practiceLog: {}, bank: {}, seasonGains: {}, goals: {}, goalsSeason: 0 };
  }
  return state.development;
}
function ensureDevelopment(state) {
  const dv = devState(state);
  if (IN_SEASON.includes(state.phase) && dv.goalsSeason !== state.season) {
    fillPlans(state);
    assignGoals(state);
  }
}
function planOf(state, id) {
  return state.development?.plans[id] ?? "balanced";
}
function isSpotlight(state, id) {
  return !!state.development?.spotlight.includes(id);
}
function devSkillFor(state) {
  const coach = state.coaches[state.user.coachId];
  return (coach?.skills.development ?? 4) + (state.staff ? staffEffects(state).dev : 0);
}
function hasDevCoach(state) {
  return !!state.staff?.members.some((m) => m.role === "development");
}
function isNewcomer(p) {
  return p.career.length === 0 && p.cls === "FR" && p.stats.gp === 0;
}
function minutesShare(p) {
  return p.stats.gp ? p.stats.min / Math.max(1, p.stats.gp) / 30 : 0.2;
}
function weakness(r) {
  return clamp(1.3 - (r - 45) / 90, 0.7, 1.3);
}
function youth(p) {
  return p.age <= 19 ? 1.2 : p.age <= 20 ? 1 : p.age <= 21 ? 0.8 : 0.6;
}
function summerGains(p, devSkill, share, focus, spotlight, random) {
  const room = Math.max(0, p.pot - p.ovr);
  const ageFactor = p.age <= 19 ? 1.15 : p.age <= 20 ? 1 : p.age <= 21 ? 0.8 : p.age <= 22 ? 0.6 : 0.4;
  let base = room * 0.32 * ageFactor + 0.8;
  base *= 1 + devSkill * 0.035;
  base *= 0.85 + Math.min(1, share) * 0.3;
  if (p.traits.includes("gymRat")) base *= 1.25;
  if (p.traits.includes("coachable")) base *= 1.1;
  if (spotlight) base *= 1.3;
  const sd = p.traits.includes("raw") ? 2.6 : 1.4;
  const delta = clamp(base + (random ? rng.normal(0, sd) : 0), -3, 14);
  const points = delta * 1.25;
  const gains = {};
  for (const k of RATING_KEYS) gains[k] = points * (0.55 + ratingWeight(p.pos, k) * 6) * (random ? rng.range(0.4, 1.6) : 1) * 0.75;
  const keys = FOCUS_INFO[focus].keys;
  if (keys.length && delta > 0) {
    let total = 0;
    for (const k of RATING_KEYS) total += gains[k];
    for (const k of RATING_KEYS) gains[k] *= 1 - FOCUS_SHARE;
    const cap3 = 3 + delta * 0.6;
    for (const k of keys) gains[k] += Math.min(cap3, total * FOCUS_SHARE / keys.length * weakness(p.ratings[k]));
  }
  return gains;
}
function focusKeys(p, focus) {
  return focus === "balanced" ? topRatings(p.pos, 3) : FOCUS_INFO[focus].keys;
}
function projectFocus(state, p, focus, spotlight = isSpotlight(state, p.id)) {
  const gains = summerGains(p, devSkillFor(state), minutesShare(p), focus, spotlight, false);
  const r = { ...p.ratings };
  for (const k of RATING_KEYS) r[k] = Math.round(clamp(r[k] + gains[k], 20, 99));
  return { changes: focusKeys(p, focus).map((k) => [k, r[k] - p.ratings[k]]), ovr: calcOvr(r, p.pos) - p.ovr };
}
function recommendFocus(state, p) {
  let best = "balanced", bestOvr = -99;
  for (const f of FOCUS_ORDER) {
    const o = projectFocus(state, p, f).ovr + (f === "balanced" ? 0.01 : 0);
    if (o > bestOvr) {
      bestOvr = o;
      best = f;
    }
  }
  return best;
}
var ARCH_NEWS = {
  "Stretch Big": "added a three-point shot",
  Sharpshooter: "turned into a knockdown shooter",
  "Point Forward": "became a playmaker",
  "Floor General": "took command of the offense",
  "Rim Protector": "became a shot-blocking force",
  "3&D Wing": "became a 3-and-D wing",
  Slasher: "became a downhill slasher",
  "Rim Runner": "became an above-the-rim finisher",
  "Glass Cleaner": "owns the glass now",
  "Post Scorer": "built a low-post game"
};
function maybeNewArchetype(p, focus) {
  const r = p.ratings, a = p.archetype, big = p.pos === "PF" || p.pos === "C", wing = p.pos === "SG" || p.pos === "SF";
  const pick = (x, ok) => ok && a !== x ? x : null;
  switch (focus) {
    case "shooting":
      return pick("Stretch Big", big && r.tp >= 60) ?? pick("Sharpshooter", wing && r.tp >= 78 && r.ft >= 72);
    case "playmaking":
      return pick("Point Forward", (p.pos === "SF" || p.pos === "PF") && r.pas >= 70 && r.hdl >= 62) ?? pick("Floor General", p.pos === "PG" && r.pas >= 78 && r.iq >= 72);
    case "interior":
      return pick("Rim Protector", big && r.blk >= 76 && r.intD >= 74);
    case "perimeterD":
      return pick("3&D Wing", wing && r.perD >= 76 && r.tp >= 62);
    case "finishing":
      return pick("Slasher", !big && r.ins >= 76 && r.ath >= 74) ?? pick("Rim Runner", big && r.ath >= 78 && r.ins >= 74);
    case "strength":
      return pick("Glass Cleaner", big && r.reb >= 80 && r.str >= 76) ?? pick("Post Scorer", big && r.ins >= 78 && r.str >= 75);
    default:
      return null;
  }
}
function nbaRankOf(state, p) {
  const mine = draftScore(p);
  let rank = 1;
  for (const o of Object.values(state.players)) if (o.teamId && o.id !== p.id && draftScore(o) > mine) rank++;
  return rank;
}
function fillPlans(state) {
  const dv = devState(state);
  const roster = teamPlayers(state, state.user.teamId);
  const ids = new Set(roster.map((p) => p.id));
  for (const id of Object.keys(dv.plans)) if (!ids.has(id)) delete dv.plans[id];
  dv.spotlight = dv.spotlight.filter((id) => ids.has(id));
  const auto = hasDevCoach(state);
  for (const p of roster) if (!dv.plans[p.id]) dv.plans[p.id] = auto && !isNewcomer(p) ? recommendFocus(state, p) : "balanced";
}
function beginSummer(state) {
  state.phase = "progression";
  const dv = devState(state);
  fillPlans(state);
  dv.summer = { season: state.season, done: false, rows: [] };
}
function summerDone(state) {
  const s = state.development?.summer;
  if (s && s.season === state.season) return s.done;
  return Object.keys(state.offseason?.progression ?? {}).length > 0;
}
function runSummer(state, aiToo = true) {
  const os = state.offseason;
  const dv = devState(state);
  const uid = state.user.teamId;
  const mine = teamPlayers(state, uid);
  const draftBefore = new Map(mine.filter((p) => p.elig > 1).map((p) => [p.id, nbaRankOf(state, p)]));
  const rows = [];
  for (const t of Object.values(state.teams)) {
    const coach = state.coaches[t.coachId];
    if (!isHuman(state, t.id)) {
      if (!aiToo) continue;
      const dev2 = coach ? coach.skills.development : 4;
      for (const p of teamPlayers(state, t.id)) {
        if (isNewcomer(p)) continue;
        developPlayer(p, dev2, minutesShare(p));
        advanceClass(p);
      }
      continue;
    }
    if (t.id !== uid) continue;
    const dev = devSkillFor(state);
    for (const p of teamPlayers(state, t.id)) {
      const focus = planOf(state, p.id);
      const spotlight = isSpotlight(state, p.id);
      const keys = focusKeys(p, focus);
      const beforeR = { ...p.ratings };
      const row = { id: p.id, name: `${p.first} ${p.last}`, pos: p.pos, cls: p.cls, focus, spotlight, before: p.ovr, after: p.ovr, pot: p.pot, changes: {} };
      if (isNewcomer(p)) {
        row.tag = "newcomer";
        os.progression[p.id] = 0;
        rows.push(row);
        continue;
      }
      const gains = summerGains(p, dev, minutesShare(p), focus, spotlight, true);
      for (const k of RATING_KEYS) p.ratings[k] = Math.round(clamp(p.ratings[k] + gains[k], 20, 99));
      p.ovr = calcOvr(p.ratings, p.pos);
      p.pot = Math.round(clamp(p.pot + rng.normal(0, 2) - (p.age >= 22 ? 1 : 0), p.ovr, 99));
      const arch = maybeNewArchetype(p, focus);
      if (arch) {
        row.archetypeFrom = p.archetype;
        row.archetypeTo = arch;
        p.archetype = arch;
        p.history.push(`Summer ${state.season + 1}: ${ARCH_NEWS[arch] ?? `became a ${arch}`}`);
      }
      advanceClass(p);
      row.after = p.ovr;
      row.pot = p.pot;
      row.cls = p.cls;
      for (const k of keys) row.changes[k] = [beforeR[k], p.ratings[k]];
      const d = row.after - row.before;
      os.progression[p.id] = d;
      if (d >= 6) row.tag = "breakout";
      else if (d <= 0 && p.age <= 21 && p.pot - p.ovr >= 8) row.tag = "stalled";
      rows.push(row);
    }
  }
  for (const row of rows) {
    const p = state.players[row.id];
    if (!p || !draftBefore.has(row.id)) continue;
    const before = draftBefore.get(row.id), after = nbaRankOf(state, p);
    if (before <= 90 || after <= 90) {
      row.draftBefore = before;
      row.draftAfter = after;
    }
  }
  rows.sort((a, b) => b.after - b.before - (a.after - a.before));
  dv.summer = { season: state.season, done: true, rows };
  summerNews(state, rows);
}
function summerNews(state, rows) {
  const team = state.teams[state.user.teamId];
  for (const r of rows.filter((x) => x.tag === "breakout").slice(0, 2)) {
    const p = state.players[r.id];
    if (!p) continue;
    addNews(state, { kind: "feature", headline: `${team.school}'s ${r.name} made a leap this summer`, body: `${r.name} went from ${r.before} to ${r.after} overall after a summer focused on ${FOCUS_INFO[r.focus].label.toLowerCase()}.${r.draftAfter && r.draftBefore && r.draftAfter < r.draftBefore && r.draftAfter <= 60 ? ` NBA scouts have noticed: he's climbed to No. ${r.draftAfter} on some big boards.` : ""}`, teams: [team.id], important: true, personId: p.id, personKind: "player" });
    if (rng.chance(0.7)) addSocial(state, { handle: "ThePaintPod", name: "The Paint Podcast", verified: true, kind: "analyst", text: `Whatever ${team.school} is doing in the gym, it's working. ${r.name} looks like a different player. \u{1F440}`, teamId: team.id, personId: p.id });
  }
  for (const r of rows.filter((x) => x.archetypeTo).slice(0, 2)) {
    const p = state.players[r.id];
    if (!p || r.tag === "breakout") continue;
    addNews(state, { kind: "feature", headline: `${r.name} ${ARCH_NEWS[r.archetypeTo] ?? `is now a ${r.archetypeTo}`}`, body: `A summer of ${FOCUS_INFO[r.focus].label.toLowerCase()} work changed ${r.name}'s game. ${team.school}'s staff now sees him as a ${r.archetypeTo}.`, teams: [team.id], personId: p.id, personKind: "player" });
  }
}
function bankGain(dv, p, k, amt) {
  const b = dv.bank[p.id] ??= {};
  b[k] = (b[k] ?? 0) + amt;
  let changed = false;
  while ((b[k] ?? 0) >= 1) {
    b[k] -= 1;
    if (p.ratings[k] >= 99) {
      b[k] = 0;
      break;
    }
    p.ratings[k] += 1;
    const sg = dv.seasonGains[p.id] ??= {};
    sg[k] = (sg[k] ?? 0) + 1;
    changed = true;
  }
  return changed;
}
function weeklyPractice(state) {
  if (!IN_SEASON.includes(state.phase) || state.day <= 0) return;
  const dv = devState(state);
  const pr = PRACTICE_INFO[dv.practice];
  dv.practiceLog[dv.practice] = (dv.practiceLog[dv.practice] ?? 0) + 1;
  const dev = devSkillFor(state);
  for (const p of teamPlayers(state, state.user.teamId)) {
    if (pr.morale) {
      let m = pr.morale;
      if (m < 0) m *= p.traits.includes("gymRat") ? 0 : p.traits.includes("coachable") ? 0.5 : p.traits.includes("diva") || p.traits.includes("hothead") ? 1.6 : 1;
      p.morale = clamp(p.morale + m, 0, 100);
    }
    if (dv.practice === "recovery" && p.injury) {
      p.injury.games -= 1;
      if (p.injury.games <= 0) p.injury = null;
    }
    if (p.injury) continue;
    let changed = false;
    if (pr.growth > 0) {
      const room = p.pot > p.ovr ? 1 : 0.25;
      const rate = 0.1 * pr.growth * youth(p) * room * (1 + dev * 0.03) * (isSpotlight(state, p.id) ? 1.3 : 1) * (p.traits.includes("gymRat") ? 1.2 : 1);
      for (const k of focusKeys(p, planOf(state, p.id))) changed = bankGain(dv, p, k, rate * weakness(p.ratings[k])) || changed;
    }
    if (dv.practice === "conditioning") changed = bankGain(dv, p, "sta", 0.3 * youth(p)) || changed;
    if (changed) p.ovr = calcOvr(p.ratings, p.pos);
  }
}
function practiceMods(state) {
  const dv = state.development;
  if (!dv || !IN_SEASON.includes(state.phase)) return { tactics: 0, stamina: 1, injury: 1 };
  const pr = PRACTICE_INFO[dv.practice];
  return { tactics: pr.tactics, stamina: pr.stamina, injury: pr.injury };
}
function devNewSeason(state) {
  const dv = devState(state);
  dv.bank = {};
  dv.seasonGains = {};
  dv.practiceLog = {};
  fillPlans(state);
  assignGoals(state);
}
var WIN_GOAL = {
  1: "Finish in the top half of the conference",
  2: "Contend for a conference title",
  3: "Make the NCAA Tournament",
  4: "Win an NCAA Tournament game",
  5: "Reach the Sweet 16",
  6: "Make the Final Four"
};
function assignGoals(state) {
  const dv = devState(state);
  dv.goals = {};
  dv.goalsSeason = state.season;
  const roster = teamPlayers(state, state.user.teamId).filter((p) => !p.redshirting).sort((a, b) => b.ovr - a.ovr);
  roster.forEach((p, rank) => {
    const nba = p.elig >= 1 ? nbaRankOf(state, p) : 999;
    let g;
    if (nba <= 45) g = nba <= 14 ? { kind: "pro", target: 14, label: "Stay a lottery-level prospect" } : { kind: "pro", target: 30, label: "Play his way into the first round" };
    else if (p.promise === "starter" || p.promise === "star") g = { kind: "starter", target: 50, label: "Start most games, as promised" };
    else if (p.elig <= 1 && rank < 9) {
      const lvl = clamp(state.user.expectationLevel - 1, 1, 6);
      g = { kind: "winning", target: lvl, label: WIN_GOAL[lvl] };
    } else if (rank < 5) {
      const t = [13, 11, 10, 9, 8][rank];
      g = { kind: "scoring", target: t, label: `Average ${t}+ points a game` };
    } else if (rank < 9) {
      const t = [17, 12, 8, 5][rank - 5];
      g = { kind: "minutes", target: t, label: `Earn ${t}+ minutes a game` };
    } else g = null;
    if (g) dv.goals[p.id] = { ...g, season: state.season };
  });
}
function evaluateGoals(state, achieved) {
  const dv = state.development;
  const out = { met: [], missed: [] };
  if (!dv || dv.goalsSeason !== state.season) return out;
  for (const [id, g] of Object.entries(dv.goals)) {
    const p = state.players[id];
    if (!p || p.teamId !== state.user.teamId || g.result) continue;
    const gp2 = Math.max(1, p.stats.gp);
    let met;
    switch (g.kind) {
      case "scoring":
        met = p.stats.gp >= 8 && p.stats.pts / gp2 >= g.target;
        break;
      case "minutes":
        met = p.stats.gp >= 8 && p.stats.min / gp2 >= g.target;
        break;
      case "starter":
        met = p.stats.gp >= 8 && p.stats.gs / gp2 * 100 >= g.target;
        break;
      case "pro":
        met = nbaRankOf(state, p) <= g.target;
        break;
      case "winning":
        met = achieved >= g.target;
        break;
    }
    g.result = met ? "met" : "missed";
    if (met) {
      p.morale = clamp(p.morale + 6, 0, 100);
      out.met.push(`${p.first} ${p.last}`);
    } else {
      const hit = p.traits.includes("diva") ? 10 : p.traits.includes("loyal") ? 4 : p.traits.includes("coachable") ? 5 : 7;
      p.morale = clamp(p.morale - hit, 0, 100);
      out.missed.push(`${p.first} ${p.last}`);
    }
  }
  const team = state.teams[state.user.teamId];
  const total = out.met.length + out.missed.length;
  if (total) {
    addNews(state, {
      kind: "user",
      headline: `Exit meetings: ${out.met.length} of ${total} ${team.mascot} hit their personal goals`,
      body: `${out.met.length ? `Goals met: ${out.met.slice(0, 6).join(", ")}${out.met.length > 6 ? " and more" : ""}. ` : ""}${out.missed.length ? `Came up short: ${out.missed.slice(0, 6).join(", ")}${out.missed.length > 6 ? " and more" : ""}. Players who missed their goals are more likely to test the transfer portal.` : "Everybody got what they came for. That kind of loyalty matters in the portal."}`,
      teams: [team.id],
      important: true
    });
  }
  return out;
}
function goalResult(state, id) {
  const dv = state.development;
  if (!dv || dv.goalsSeason !== state.season) return void 0;
  return dv.goals[id]?.result;
}

// src/data/lore.ts
var PROGRAM_LORE = {
  // ---------------- blue bloods ----------------
  kansas: {
    identity: "The cradle of the game: basketball\u2019s inventor was the program\u2019s first coach.",
    arenaNick: "The Phog",
    traditions: ["The Rock Chalk Chant, slow and haunting, when a win is in hand", "Fans wave the wheat after victories", "\u201CBeware of the Phog\u201D hangs in Allen Fieldhouse", "Students camp out for days for the best seats"],
    titles: [1952, 1988, 2008, 2022],
    moments: ["2022: rallied from 16 down at halftime, the biggest comeback in title-game history"],
    crowd: "Allen Fieldhouse is rocking. \u201CBeware of the Phog\u201D has never felt more literal.",
    closer: "Here comes the Rock Chalk Chant. It\u2019s over in Lawrence."
  },
  kentucky: {
    identity: "College basketball royalty with one of the most passionate fan bases in sports.",
    fans: "Big Blue Nation",
    traditions: ["Big Blue Madness tips off every season to a packed house", "\u201CC-A-T-S, Cats! Cats! Cats!\u201D fills Rupp Arena", "Big Blue Nation travels everywhere and takes over road arenas"],
    titles: [1948, 1949, 1951, 1958, 1978, 1996, 1998, 2012],
    crowd: "Big Blue Nation has filled Rupp Arena to the rafters.",
    closer: "\u201CC-A-T-S! Cats! Cats! Cats!\u201D Rupp Arena is celebrating."
  },
  duke: {
    identity: "An intimate gym, a national brand and the most famous student section in the country.",
    students: "Cameron Crazies",
    traditions: ["Students camp for weeks in Krzyzewskiville for the biggest games", "The Cameron Crazies, painted blue, bounce for the entire game", "Cameron Indoor Stadium seats barely 9,300, all of them on top of the court"],
    titles: [1991, 1992, 2001, 2010, 2015],
    crowd: "The Cameron Crazies are bouncing. Cameron Indoor is a furnace.",
    closer: "The Crazies are in full throat. Cameron is shaking."
  },
  "north-carolina": {
    identity: "Carolina blue, a basketball tradition as deep as any in the sport.",
    arenaNick: "The Dean Dome",
    traditions: ["Fans rush Franklin Street after the biggest wins", "Carolina blue, everywhere you look", "Banners for national titles and Final Fours line the Dean Dome"],
    titles: [1957, 1982, 1993, 2005, 2009, 2017],
    crowd: "A sea of Carolina blue inside the Dean Dome.",
    closer: "Somebody check on Franklin Street. Carolina fans are ready to rush it."
  },
  ucla: {
    identity: "The standard every dynasty is measured against: eleven national titles.",
    traditions: ["Ten titles in twelve seasons, including seven in a row (1967\u201373)", "An 88-game winning streak that stood as the sport\u2019s gold standard", "Pauley Pavilion\u2019s rafters are full of championship banners"],
    titles: [1964, 1965, 1967, 1968, 1969, 1970, 1971, 1972, 1973, 1975, 1995],
    crowd: "Pauley Pavilion, under all those banners.",
    closer: "The Bruins faithful are on their feet in Westwood."
  },
  indiana: {
    identity: "Hoosier Hysteria: in this state, basketball is a religion.",
    traditions: ["Hoosier Hysteria opens every season", "The candy-striped warm-up pants", "Assembly Hall\u2019s steep bleachers put the crowd right on top of you"],
    titles: [1940, 1953, 1976, 1981, 1987],
    moments: ["1976: 32-0, the last undefeated national champion in men\u2019s college basketball"],
    crowd: "Assembly Hall is full and loud. Hoosier Hysteria is alive.",
    closer: "Assembly Hall is roaring. Indiana basketball, the way it\u2019s supposed to be."
  },
  uconn: {
    identity: "A modern dynasty built in the Big East: six titles since 1999.",
    traditions: ["Splits home games between campus at Gampel and Hartford", "Back-to-back national champions in 2023 and 2024", "Built a winning machine out of a small state school"],
    titles: [1999, 2004, 2011, 2014, 2023, 2024],
    moments: ["2026: national runner-up"],
    crowd: "The Huskies faithful are packed in and loud.",
    closer: "The UConn crowd knows what winning looks like. They\u2019re celebrating."
  },
  villanova: {
    identity: "A small Philadelphia school with three national titles and two of the most famous finishes ever.",
    fans: "Nova Nation",
    traditions: ["1985: won the title as an 8 seed, shooting 79% in the final against a heavy favorite", "2016: won the title on a buzzer-beater", "Part of Philadelphia\u2019s Big 5"],
    titles: [1985, 2016, 2018],
    crowd: "Nova Nation is packed into the Pavilion.",
    closer: "Nova Nation is on its feet in the Pavilion."
  },
  "michigan-state": {
    identity: "Tough, physical and always ready for March.",
    students: "Izzone",
    traditions: ["The Izzone student section, all in green and white", "Rebounding wars and a reputation for March toughness", "Ten Final Four appearances"],
    titles: [1979, 2e3],
    crowd: "The Izzone is bouncing. Breslin Center is loud.",
    closer: "The Izzone is in full voice. Spartans have this one."
  },
  louisville: {
    identity: "A basketball-mad city with two national titles and one of the biggest arenas in the sport.",
    traditions: ["Packs the KFC Yum! Center, one of college basketball\u2019s largest homes", "Fierce in-state rivalry with Kentucky"],
    titles: [1980, 1986],
    crowd: "The KFC Yum! Center is a sea of red.",
    closer: "Louisville fans are celebrating downtown."
  },
  // ---------------- national powers ----------------
  arizona: {
    identity: "The desert\u2019s basketball powerhouse with a famously rowdy student section.",
    students: "ZonaZoo",
    traditions: ["The ZonaZoo student section fills McKale Center", "1997: won the title by beating three No. 1 seeds"],
    titles: [1997],
    moments: ["2026: reached the Final Four"],
    crowd: "The ZonaZoo is ready. McKale Center is rocking.",
    closer: "The ZonaZoo is in full voice. Bear Down."
  },
  gonzaga: {
    identity: "A small Jesuit school in Spokane that became a national power.",
    students: "Kennel Club",
    arenaNick: "The Kennel",
    traditions: ["The Kennel Club student section, inches from the court", "Went from Cinderella to perennial contender", "National runner-up in 2017 and 2021"],
    crowd: "The Kennel Club is ready. The Kennel is a tiny, deafening box.",
    closer: "The Kennel is shaking. Zags have it."
  },
  houston: {
    identity: "Defense, toughness and a high-flying legacy.",
    traditions: ["Phi Slama Jama: the high-flying teams of the early 1980s", "Back-to-back national runner-up in 1983 and 1984", "A defense-first identity built in the modern era"],
    moments: ["2025: national runner-up"],
    crowd: "Fertitta Center is loud and close. Houston fans love defense.",
    closer: "Fertitta Center is celebrating. Coogs win the fight."
  },
  florida: {
    identity: "Three national titles, including back-to-back champions with the same starting five.",
    students: "Rowdy Reptiles",
    arenaNick: "The O\u2019Dome",
    traditions: ["The Rowdy Reptiles student section", "The Gator Chomp from every corner of the arena", "Back-to-back champions in 2006 and 2007 with the same starting five"],
    titles: [2006, 2007, 2025],
    crowd: "The Rowdy Reptiles are chomping. The O\u2019Dome is loud.",
    closer: "The Gator Chomp is everywhere. Florida has this one."
  },
  purdue: {
    identity: "A Big Ten fixture with a history of great big men.",
    students: "Paint Crew",
    traditions: ["The Paint Crew student section, all in black and gold", "Mackey Arena\u2019s bowl traps the noise", "National runner-up in 2024"],
    crowd: "The Paint Crew is ready. Mackey Arena is deafening.",
    closer: "The Paint Crew is in full voice. Boiler Up."
  },
  syracuse: {
    identity: "The 2-3 zone, the Dome and a massive home crowd.",
    arenaNick: "The Dome",
    traditions: ["Plays in the largest on-campus arena in college basketball", "Built a long identity around the 2-3 zone", "Otto the Orange"],
    titles: [2003],
    crowd: "A huge crowd in the Dome. Syracuse basketball, big-time.",
    closer: "The Dome is roaring. Orange win this one."
  },
  michigan: {
    identity: "Two national titles and the Fab Five, the most famous freshman class ever.",
    students: "Maize Rage",
    traditions: ["The Maize Rage student section", "The Fab Five: the 1991 freshman class that changed the sport\u2019s style", "2026: won the title with a starting five made up entirely of transfers"],
    titles: [1989, 2026],
    crowd: "The Maize Rage is loud. Crisler Center is full.",
    closer: "The Maize Rage is celebrating. Go Blue."
  },
  illinois: {
    identity: "An Orange Krush, a domed arena and a fan base that waits for March.",
    students: "Orange Krush",
    traditions: ["The Orange Krush student section", "State Farm Center\u2019s distinctive dome", "National runner-up in 2005"],
    moments: ["2026: reached the Final Four"],
    crowd: "The Orange Krush is ready. The dome is loud.",
    closer: "The Orange Krush is in full voice. Illini win."
  },
  baylor: {
    identity: "Built itself into a national champion in the 2010s and \u201920s.",
    traditions: ["The \u201CSic \u2019em\u201D hand sign", "2021: won the national title, ending an undefeated opponent\u2019s perfect season"],
    titles: [2021],
    crowd: "Foster Pavilion is full. \u201CSic \u2019em\u201D signs everywhere.",
    closer: "Sic \u2019em, Bears. Baylor has it."
  },
  "texas-tech": {
    identity: "Lubbock toughness: the Red Raiders defend.",
    traditions: ["\u201CGuns Up\u201D from every seat in the arena", "National runner-up in 2019 after an overtime final"],
    crowd: "Guns Up in Lubbock. United Supermarkets Arena is loud.",
    closer: "Guns Up. Texas Tech has this one."
  },
  "iowa-state": {
    identity: "Hilton Magic: one of the toughest places to play in the country.",
    traditions: ["Hilton Magic: the late-game comebacks at Hilton Coliseum", "Cyclone fans travel and take over the Big 12 Tournament"],
    crowd: "Hilton Coliseum is packed. Here comes the Hilton Magic.",
    closer: "Hilton Magic strikes again."
  },
  virginia: {
    identity: "The pack line, patience and a title won one year after history\u2019s most famous upset.",
    traditions: ["A pack-line defense and a slow, deliberate pace", "2019: national champions, one year after losing to a No. 16 seed"],
    titles: [2019],
    crowd: "John Paul Jones Arena is full. Expect a grinder.",
    closer: "The Hoos fans are standing. Virginia has it locked down."
  },
  "nc-state": {
    identity: "The Cardiac Pack: famous for miracle runs.",
    traditions: ["1983: won the title on a last-second dunk in The Pit in Albuquerque", "1974: ended UCLA\u2019s run of seven straight titles on the way to a championship", "2024: reached the Final Four as an 11 seed after winning five tournament games in five days"],
    titles: [1974, 1983],
    crowd: "The Wolfpack faithful are loud. Never count this team out.",
    closer: "The Wolfpack crowd is celebrating. No cardiac finish needed tonight."
  },
  arkansas: {
    identity: "Forty Minutes of Hell and the Hog Call.",
    traditions: ["\u201CWoo Pig Sooie!\u201D The Hog Call shakes Bud Walton Arena", "\u201CForty Minutes of Hell\u201D: the full-court pressure of the 1990s champions"],
    titles: [1994],
    crowd: "Bud Walton Arena is shaking. Woo Pig Sooie!",
    closer: "Here comes the Hog Call. Woo Pig Sooie!"
  },
  auburn: {
    identity: "A football school that built a basketball power on the Plains.",
    traditions: ["Fans roll Toomer\u2019s Corner with toilet paper after big wins", "\u201CWar Eagle!\u201D", "Final Fours in 2019 and 2025"],
    crowd: "Neville Arena is loud. War Eagle!",
    closer: "Somebody grab the toilet paper. Toomer\u2019s Corner is getting rolled tonight."
  },
  tennessee: {
    identity: "Rocky Top and a fan base that fills one of the sport\u2019s biggest arenas.",
    traditions: ["\u201CRocky Top\u201D plays after every big run", "Fills one of the largest arenas in college basketball"],
    crowd: "A sea of orange. \u201CRocky Top\u201D is already playing.",
    closer: "\u201CRocky Top\u201D one more time. The Vols have it."
  },
  alabama: {
    identity: "A football school that turned its basketball program into a high-octane contender.",
    traditions: ["\u201CRoll Tide!\u201D from every corner of Coleman Coliseum", "2024: the program\u2019s first Final Four"],
    crowd: "Coleman Coliseum is loud. Roll Tide.",
    closer: "Roll Tide. Alabama has this one."
  },
  "ohio-state": {
    identity: "A Big Ten giant with a national title and a booming \u201CO-H! I-O!\u201D",
    arenaNick: "The Schott",
    traditions: ["\u201CO-H!\u201D \u201CI-O!\u201D echoes across the arena", "1960: national champions"],
    titles: [1960],
    crowd: "The Schott is full. \u201CO-H!\u201D \u201CI-O!\u201D",
    closer: "\u201CO-H!\u201D \u201CI-O!\u201D Buckeyes have it."
  },
  wisconsin: {
    identity: "Patient, efficient, fundamentally sound and dangerous in March.",
    traditions: ["A famously patient swing offense", "2015: ended an undefeated Kentucky team\u2019s perfect run in the Final Four"],
    titles: [1941],
    crowd: "The Kohl Center is full. The Badgers will make you defend.",
    closer: "The Kohl Center is celebrating. Badgers grind it out."
  },
  maryland: {
    identity: "Fear the Turtle.",
    traditions: ["\u201CFear the Turtle\u201D", "A rabid home crowd in College Park"],
    titles: [2002],
    crowd: "Xfinity Center is loud. Fear the Turtle.",
    closer: "Fear the Turtle. Maryland has it."
  },
  marquette: {
    identity: "A Milwaukee program with a national title and a big-time NBA arena.",
    traditions: ["Plays downtown in the Fiserv Forum", "1977: national champions"],
    titles: [1977],
    crowd: "Fiserv Forum is full of Golden Eagles fans.",
    closer: "Fiserv Forum is celebrating. Marquette has it."
  },
  georgetown: {
    identity: "Hoya Paranoia: the toughest program of the Big East\u2019s golden era.",
    traditions: ["\u201CHoya Saxa!\u201D", "Big East battles from the 1980s"],
    titles: [1984],
    crowd: "Capital One Arena is loud. Hoya Saxa!",
    closer: "Hoya Saxa! Georgetown has it."
  },
  // ---------------- big east, mid-major powers and famous runs ----------------
  creighton: {
    identity: "Omaha\u2019s team, with crowds that rank among the biggest in the country.",
    traditions: ["Regularly draws one of the largest home crowds in college basketball", "Plays downtown at CHI Health Center Omaha"],
    crowd: "A huge crowd in Omaha. Creighton draws like a blue blood.",
    closer: "Omaha is celebrating. Bluejays have it."
  },
  "st-johns": {
    identity: "New York\u2019s team, at home in Madison Square Garden.",
    traditions: ["Big games at the World\u2019s Most Famous Arena, Madison Square Garden", "Smaller games on campus at Carnesecca Arena", "A national runner-up in 1952"],
    crowd: "Madison Square Garden, and the city is here for the Johnnies.",
    closer: "The Garden is roaring for the Johnnies."
  },
  providence: {
    identity: "A small Big East school with a big-city atmosphere downtown.",
    arenaNick: "The Dunk",
    traditions: ["Home games downtown at \u201Cthe Dunk\u201D", "Final Fours in 1973 and 1987"],
    crowd: "The Dunk is full. Friars fans are ready.",
    closer: "The Dunk is celebrating."
  },
  xavier: {
    identity: "Cincinnati\u2019s Jesuit program and one half of the Crosstown Shootout.",
    traditions: ["The Crosstown Shootout with Cincinnati is one of the sport\u2019s fiercest rivalries", "A loud, packed Cintas Center"],
    crowd: "Cintas Center is packed. Musketeers fans are loud.",
    closer: "Cintas Center is celebrating. All for one."
  },
  butler: {
    identity: "The little school that played in back-to-back title games.",
    traditions: ["Hinkle Fieldhouse, where the finale of the movie \u201CHoosiers\u201D was filmed", "National runner-up in 2010 and 2011", "Butler Blue, the live bulldog mascot"],
    crowd: "Historic Hinkle Fieldhouse. There\u2019s no building like it.",
    closer: "Hinkle is roaring. Butler has it."
  },
  cincinnati: {
    identity: "Back-to-back national champions and the other half of the Crosstown Shootout.",
    traditions: ["Back-to-back national champions in 1961 and 1962", "The Crosstown Shootout with Xavier"],
    titles: [1961, 1962],
    crowd: "Fifth Third Arena is loud. Bearcats fans are ready.",
    closer: "Bearcats fans are celebrating."
  },
  unlv: {
    identity: "The Runnin\u2019 Rebels: Las Vegas flash and the most lopsided title game ever.",
    traditions: ["1990: won the title game by 30 points, the largest margin in championship history", "The Runnin\u2019 Rebels\u2019 fast-break style made them must-see TV"],
    titles: [1990],
    crowd: "The Thomas & Mack Center is full. Vegas is here.",
    closer: "The Runnin\u2019 Rebels crowd is celebrating."
  },
  "san-diego-state": {
    identity: "Defense, a great student section and a run to the 2023 title game.",
    students: "The Show",
    traditions: ["The Show student section", "National runner-up in 2023"],
    crowd: "The Show is ready. Viejas Arena is loud.",
    closer: "The Show is celebrating. Aztecs have it."
  },
  dayton: {
    identity: "A mid-major with major-conference crowds and the home of the First Four.",
    fans: "Flyer Faithful",
    traditions: ["Hosts the NCAA Tournament\u2019s First Four every March", "The Flyer Faithful fill UD Arena like few programs anywhere"],
    crowd: "UD Arena is packed. The Flyer Faithful are loud.",
    closer: "The Flyer Faithful are celebrating."
  },
  vcu: {
    identity: "Havoc: relentless pressure and a famous First Four to Final Four run.",
    arenaNick: "The Stu",
    traditions: ["\u201CHavoc\u201D: full-court pressure for 40 minutes", "The Peppas, one of the best pep bands in the country", "2011: went from the First Four to the Final Four"],
    crowd: "The Stu is shaking and the Peppas are rolling. Havoc time.",
    closer: "The Peppas are rolling. Havoc wins."
  },
  "wichita-state": {
    identity: "The Roundhouse, Shocker pride and a 35-0 start.",
    arenaNick: "The Roundhouse",
    traditions: ["2013: reached the Final Four as a 9 seed", "2014: started 35-0"],
    crowd: "The Roundhouse is full. Shocker fans are loud.",
    closer: "The Roundhouse is celebrating."
  },
  "loyola-chicago": {
    identity: "A 1963 national champion that helped change the sport, and a 2018 Cinderella.",
    traditions: ["1963: national champions; their meeting with Mississippi State became known as the \u201CGame of Change\u201D", "2018: reached the Final Four as an 11 seed, with a beloved 98-year-old team chaplain"],
    titles: [1963],
    crowd: "Gentile Arena is packed. Loyola fans believe.",
    closer: "The Ramblers crowd is celebrating."
  },
  "mississippi-state": {
    identity: "An SEC program with a place in history: the 1963 \u201CGame of Change\u201D.",
    traditions: ["1963: defied a state ban to play integrated Loyola Chicago in the \u201CGame of Change\u201D", "Cowbells, an SEC tradition that carries over from football"],
    crowd: "The cowbells are ringing in Humphrey Coliseum.",
    closer: "Cowbells everywhere. Mississippi State has it."
  },
  utep: {
    identity: "Texas Western, 1966: the title that changed college basketball.",
    traditions: ["1966: as Texas Western, won the national title with the first all-Black starting five in a championship game"],
    titles: [1966],
    crowd: "The Don Haskins Center is full. History lives in this building.",
    closer: "The Miners crowd is celebrating."
  },
  "new-mexico": {
    identity: "The Pit: an arena dug into the ground and one of the loudest buildings in the country.",
    traditions: ["The court sits 37 feet below street level", "The Pit hosted the 1983 national championship and its famous last-second finish"],
    crowd: "Welcome to The Pit. It\u2019s deafening down here.",
    closer: "The Pit is shaking. Lobos have it."
  },
  "oklahoma-state": {
    identity: "Two national titles and a historic old barn of an arena.",
    arenaNick: "Madison Square Garden of the Plains",
    traditions: ["Gallagher-Iba Arena, the \u201CMadison Square Garden of the Plains\u201D", "Back-to-back national champions in 1945 and 1946"],
    titles: [1945, 1946],
    crowd: "Gallagher-Iba Arena is loud. Cowboys fans are packed in.",
    closer: "Gallagher-Iba is celebrating."
  },
  "kansas-state": {
    identity: "Manhattan, Kansas, and a building nicknamed the Octagon of Doom.",
    arenaNick: "The Octagon of Doom",
    traditions: ["Bramlage Coliseum, \u201Cthe Octagon of Doom\u201D", "The Sunflower Showdown with Kansas"],
    crowd: "The Octagon of Doom is full. Wildcats fans are ready.",
    closer: "The Octagon of Doom is celebrating."
  },
  minnesota: {
    identity: "The Barn: a historic arena with a raised floor.",
    arenaNick: "The Barn",
    traditions: ["Williams Arena\u2019s famous raised floor", "\u201CThe Barn\u201D has hosted Gophers basketball since 1928"],
    crowd: "Welcome to The Barn. That raised floor never gets old.",
    closer: "The Barn is celebrating."
  },
  "west-virginia": {
    identity: "Mountaineer toughness and \u201CCountry Roads\u201D after every win.",
    traditions: ["Fans sing \u201CCountry Roads\u201D after wins", "National runner-up in 1959; Final Four in 2010"],
    crowd: "The Coliseum is loud in Morgantown.",
    closer: "Time for \u201CCountry Roads.\u201D The Mountaineers have it."
  },
  missouri: {
    identity: "An SEC program with a famously rowdy student section.",
    students: "Antlers",
    traditions: ["The Antlers, the notoriously rowdy student group"],
    crowd: "Mizzou Arena is loud and the Antlers are ready.",
    closer: "The Antlers are celebrating."
  },
  "notre-dame": {
    identity: "The school that ended UCLA\u2019s 88-game winning streak.",
    traditions: ["1974: ended UCLA\u2019s 88-game winning streak", "Purcell Pavilion on a famous campus"],
    crowd: "Purcell Pavilion is full. The Irish faithful are here.",
    closer: "The Irish faithful are celebrating."
  },
  "seton-hall": {
    identity: "A Big East mainstay in Newark that played for a title in 1989.",
    traditions: ["National runner-up in 1989, losing in overtime", "Home games at the Prudential Center in Newark"],
    crowd: "The Prudential Center is loud for the Pirates.",
    closer: "The Rock is celebrating. Pirates have it."
  },
  // ---------------- old champions ----------------
  oregon: {
    identity: "The first NCAA champion: the 1939 \u201CTall Firs\u201D.",
    traditions: ["1939: the Tall Firs won the very first NCAA Tournament", "Matthew Knight Arena\u2019s forest-themed floor"],
    titles: [1939],
    crowd: "Matthew Knight Arena is loud. Ducks fans are ready.",
    closer: "The Ducks crowd is celebrating."
  },
  stanford: {
    identity: "A 1942 national champion on one of the country\u2019s great campuses.",
    traditions: ["1942: national champions", "Maples Pavilion, home since 1969"],
    titles: [1942],
    crowd: "Maples Pavilion is full.",
    closer: "Maples is celebrating."
  },
  california: {
    identity: "Berkeley\u2019s 1959 national champions.",
    traditions: ["1959: national champions", "National runner-up in 1960"],
    titles: [1959],
    crowd: "Haas Pavilion is loud in Berkeley.",
    closer: "Haas Pavilion is celebrating. Go Bears."
  },
  utah: {
    identity: "The 1944 \u201CBlitz Kids\u201D, a young team that won it all.",
    traditions: ["1944: the Blitz Kids, a young team, won the national title"],
    titles: [1944],
    crowd: "The Huntsman Center is loud.",
    closer: "The Utes crowd is celebrating."
  },
  "holy-cross": {
    identity: "A tiny Jesuit college with a 1947 national title.",
    traditions: ["1947: national champions"],
    titles: [1947],
    crowd: "The Hart Center is full and loud.",
    closer: "The Crusaders crowd is celebrating."
  },
  "la-salle": {
    identity: "Philadelphia\u2019s 1954 national champion and a Big 5 member.",
    traditions: ["1954: national champions", "Part of Philadelphia\u2019s Big 5"],
    titles: [1954],
    crowd: "A Philly crowd in a Philly gym.",
    closer: "The Explorers crowd is celebrating."
  },
  "san-francisco": {
    identity: "Back-to-back national champions in the 1950s.",
    traditions: ["Back-to-back national champions in 1955 and 1956"],
    titles: [1955, 1956],
    crowd: "War Memorial Gym is loud.",
    closer: "The Dons crowd is celebrating."
  },
  // ---------------- giant-killers and Cinderellas ----------------
  princeton: {
    identity: "Birthplace of the Princeton offense: backdoor cuts and brains.",
    traditions: ["The \u201CPrinceton offense\u201D is named for this program", "1996: knocked out the defending national champion in the first round"],
    crowd: "Jadwin Gym is full. Watch for the backdoor cut.",
    closer: "The Tigers crowd is celebrating."
  },
  penn: {
    identity: "Home of the Palestra, the \u201CCathedral of College Basketball\u201D.",
    arenaNick: "The Cathedral of College Basketball",
    traditions: ["The Palestra, opened in 1927 and still one of the sport\u2019s great buildings", "Part of Philadelphia\u2019s Big 5", "A Final Four team in 1979"],
    crowd: "The Palestra. The Cathedral of College Basketball.",
    closer: "The Palestra is celebrating."
  },
  "saint-josephs": {
    identity: "The Hawk Will Never Die.",
    traditions: ["\u201CThe Hawk Will Never Die\u201D", "The Hawk mascot flaps its wings for the entire game", "Part of Philadelphia\u2019s Big 5"],
    crowd: "Hagan Arena is loud, and the Hawk is flapping.",
    closer: "The Hawk Will Never Die!"
  },
  davidson: {
    identity: "A small liberal arts college with a famous 2008 Elite Eight run.",
    traditions: ["2008: a 10 seed that reached the Elite Eight"],
    crowd: "Belk Arena is packed. Davidson fans believe.",
    closer: "The Wildcats crowd is celebrating."
  },
  "florida-gulf-coast": {
    identity: "Dunk City.",
    traditions: ["2013: \u201CDunk City\u201D, the first 15 seed to reach the Sweet 16"],
    crowd: "Welcome to Dunk City.",
    closer: "Dunk City is celebrating."
  },
  "george-mason": {
    identity: "The 2006 Cinderella that reached the Final Four as an 11 seed.",
    traditions: ["2006: reached the Final Four as an 11 seed"],
    crowd: "EagleBank Arena is loud. Patriots fans believe.",
    closer: "The Patriots crowd is celebrating."
  },
  umbc: {
    identity: "The first 16 seed to beat a No. 1 seed.",
    traditions: ["2018: became the first 16 seed to beat a No. 1 seed in the men\u2019s tournament"],
    crowd: "A loud crowd for the Retrievers.",
    closer: "The Retrievers crowd is celebrating."
  },
  "fairleigh-dickinson": {
    identity: "Giant-killers: the second 16 seed ever to topple a No. 1.",
    traditions: ["2023: became the second 16 seed to beat a No. 1 seed"],
    crowd: "A packed house for the Knights.",
    closer: "The Knights crowd is celebrating."
  },
  "saint-peters": {
    identity: "The Peacocks: the first 15 seed to reach the Elite Eight.",
    traditions: ["2022: the first 15 seed to reach the Elite Eight"],
    crowd: "A packed little gym for the Peacocks.",
    closer: "The Peacocks crowd is celebrating."
  },
  northwestern: {
    identity: "The long wait: a first NCAA Tournament bid in 2017.",
    traditions: ["2017: reached the NCAA Tournament for the first time in program history"],
    crowd: "Welsh-Ryan Arena is full.",
    closer: "The Wildcats crowd is celebrating."
  }
};
function loreOf(teamId) {
  return PROGRAM_LORE[teamId];
}

// src/engine/calendar.ts
var DAY_PRESEASON = 0;
var NONCONF_DAYS = 16;
var CONF_DAYS = 20;
var FIRST_CONF_DAY = 1 + NONCONF_DAYS;
var LAST_REG_DAY = NONCONF_DAYS + CONF_DAYS;
var CT_FIRST = LAST_REG_DAY + 1;
var CT_LAST = CT_FIRST + 4;
var SELECTION_DAY = CT_LAST + 1;
var NCAA_FIRST = SELECTION_DAY + 1;
var NCAA_LAST = NCAA_FIRST + 6;
var NCAA_ROUND_NAMES = ["First Four", "First Round", "Second Round", "Sweet 16", "Elite Eight", "Final Four", "National Championship"];
var FEAST_WEEK_DAYS = [7, 8];
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function fmt2(d) {
  return `${DOW[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
function addDays(d, n) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function phaseForDay(day) {
  if (day <= DAY_PRESEASON) return "preseason";
  if (day <= LAST_REG_DAY) return "regular";
  if (day <= CT_LAST) return "confTourney";
  if (day === SELECTION_DAY) return "selection";
  return "ncaa";
}
function buildCalendar(season) {
  let d = new Date(Date.UTC(season, 10, 1));
  while (d.getUTCDay() !== 1) d = addDays(d, 1);
  const monday = d;
  const days = [];
  const pre = new Date(Date.UTC(season, 9, 22));
  days.push({ day: 0, date: pre.toISOString().slice(0, 10), label: `${fmt2(pre)} \xB7 Media Day`, week: 0, phase: "preseason" });
  for (let i = 1; i <= LAST_REG_DAY; i++) {
    const week = Math.ceil(i / 2);
    const offset = (week - 1) * 7 + (i % 2 === 1 ? 1 : 5);
    const dt = addDays(monday, offset);
    days.push({ day: i, date: dt.toISOString().slice(0, 10), label: fmt2(dt), week, phase: "regular" });
  }
  const ctStart = addDays(monday, 18 * 7 + 1);
  for (let i = 0; i < 5; i++) {
    const dt = addDays(ctStart, i);
    days.push({ day: CT_FIRST + i, date: dt.toISOString().slice(0, 10), label: `${fmt2(dt)} \xB7 Championship Week`, week: 19, phase: "confTourney" });
  }
  const sel = addDays(ctStart, 5);
  days.push({ day: SELECTION_DAY, date: sel.toISOString().slice(0, 10), label: `${fmt2(sel)} \xB7 Selection Sunday`, week: 19, phase: "selection" });
  const ncaaOffsets = [2, 4, 6, 11, 13, 20, 22];
  for (let i = 0; i < 7; i++) {
    const dt = addDays(sel, ncaaOffsets[i]);
    days.push({ day: NCAA_FIRST + i, date: dt.toISOString().slice(0, 10), label: `${fmt2(dt)} \xB7 ${NCAA_ROUND_NAMES[i]}`, week: 20 + Math.floor(i / 2), phase: "ncaa" });
  }
  return days;
}
function seasonLabel(season) {
  return `${season}-${String((season + 1) % 100).padStart(2, "0")}`;
}

// src/engine/records.ts
var GAME_CATS = [
  { id: "pts", label: "Points", short: "PTS", floor: 20, notable: [40, 32], get: (b) => b.pts },
  { id: "reb", label: "Rebounds", short: "REB", floor: 10, notable: [20, 16], get: (b) => b.orb + b.drb },
  { id: "ast", label: "Assists", short: "AST", floor: 7, notable: [14, 12], get: (b) => b.ast },
  { id: "stl", label: "Steals", short: "STL", floor: 4, notable: [8, 6], get: (b) => b.stl },
  { id: "blk", label: "Blocks", short: "BLK", floor: 4, notable: [9, 7], get: (b) => b.blk },
  { id: "tpm", label: "3-Pointers Made", short: "3PM", floor: 5, notable: [10, 8], get: (b) => b.tpm }
];
var SEASON_CATS = [
  { id: "ppg", label: "Points Per Game", short: "PPG", fmt: 1, notable: [26, 22], get: (s) => s.gp >= 20 ? s.pts / s.gp : null },
  { id: "pts", label: "Points", short: "PTS", notable: [800, 650], get: (s) => s.pts },
  { id: "rpg", label: "Rebounds Per Game", short: "RPG", fmt: 1, notable: [13, 11], get: (s) => s.gp >= 20 ? (s.orb + s.drb) / s.gp : null },
  { id: "reb", label: "Rebounds", short: "REB", notable: [420, 350], get: (s) => s.orb + s.drb },
  { id: "apg", label: "Assists Per Game", short: "APG", fmt: 1, notable: [8.5, 7], get: (s) => s.gp >= 20 ? s.ast / s.gp : null },
  { id: "ast", label: "Assists", short: "AST", notable: [280, 230], get: (s) => s.ast },
  { id: "stl", label: "Steals", short: "STL", notable: [100, 80], get: (s) => s.stl },
  { id: "blk", label: "Blocks", short: "BLK", notable: [120, 95], get: (s) => s.blk },
  { id: "tpm", label: "3-Pointers Made", short: "3PM", notable: [130, 105], get: (s) => s.tpm },
  { id: "fgp", label: "Field Goal %", short: "FG%", fmt: "pct", notable: [0.66, 0.62], get: (s) => s.fga >= 200 ? s.fgm / s.fga : null }
];
var CAREER_CATS = [
  { id: "pts", label: "Points", short: "PTS", notable: [2600, 2e3], get: (s) => s.pts },
  { id: "reb", label: "Rebounds", short: "REB", notable: [1300, 1e3], get: (s) => s.orb + s.drb },
  { id: "ast", label: "Assists", short: "AST", notable: [850, 650], get: (s) => s.ast },
  { id: "stl", label: "Steals", short: "STL", notable: [330, 260], get: (s) => s.stl },
  { id: "blk", label: "Blocks", short: "BLK", notable: [380, 300], get: (s) => s.blk },
  { id: "tpm", label: "3-Pointers Made", short: "3PM", notable: [380, 300], get: (s) => s.tpm },
  { id: "gp", label: "Games Played", short: "GP", notable: [125, 115], get: (s) => s.gp },
  { id: "ppg", label: "Points Per Game", short: "PPG", fmt: 1, notable: [22, 19], get: (s) => s.gp >= 60 ? s.pts / s.gp : null }
];
var TEAM_GAME_CATS = [
  { id: "pts", label: "Points Scored", short: "PTS", floor: 90, notable: [125, 115] },
  { id: "margin", label: "Margin of Victory", short: "MOV", floor: 25, notable: [60, 50] },
  { id: "tpm", label: "3-Pointers Made", short: "3PM", floor: 12, notable: [21, 18] }
];
var TEAM_SEASON_CATS = [
  { id: "w", label: "Wins", short: "W" },
  { id: "pct", label: "Winning Percentage", short: "PCT", fmt: "pct" },
  { id: "ppg", label: "Points Per Game", short: "PPG", fmt: 1 },
  { id: "oppg", label: "Fewest Points Allowed", short: "OPP", fmt: 1, asc: true }
];
var CATS = { game: GAME_CATS, season: SEASON_CATS, career: CAREER_CATS, teamGame: TEAM_GAME_CATS, teamSeason: TEAM_SEASON_CATS };
var LEAGUE_N = 10;
var TRACKED_N = 10;
var OTHER_N = 1;
function fmtRec(cat, v2) {
  if (cat.fmt === "pct") return v2.toFixed(3).replace(/^0/, "");
  if (cat.fmt === 1) return v2.toFixed(1);
  return String(Math.round(v2));
}
function emptySet() {
  return { game: {}, season: {}, career: {}, teamGame: {}, teamSeason: {} };
}
function better(cat, a, b) {
  return cat.asc ? a < b : a > b;
}
function insert(list2, e, n, cat, dedupe) {
  if (dedupe) {
    const i = list2.findIndex(dedupe);
    if (i >= 0) list2.splice(i, 1);
  }
  if (list2.length >= n && !better(cat, e.v, list2[n - 1].v)) return -1;
  let pos = list2.length;
  while (pos > 0 && better(cat, e.v, list2[pos - 1].v)) pos--;
  list2.splice(pos, 0, e);
  if (list2.length > n) list2.length = n;
  return pos;
}
function recordBook(state) {
  if (!state.records) {
    const coach = state.coaches[state.user.coachId];
    const tracked = /* @__PURE__ */ new Set([state.user.teamId, ...coach?.career.map((c) => c.teamId) ?? []]);
    state.records = { since: state.season, league: emptySet(), programs: {}, tracked: [...tracked], recent: [] };
    backfill(state);
  }
  return state.records;
}
function trackProgram(state, teamId) {
  const rb = recordBook(state);
  if (!rb.tracked.includes(teamId)) rb.tracked.push(teamId);
}
function program(rb, teamId) {
  return rb.programs[teamId] ??= emptySet();
}
function nFor(rb, teamId) {
  return rb.tracked.includes(teamId) ? TRACKED_N : OTHER_N;
}
function place(c, scope, cat, e, teamId, dedupe) {
  const { rb } = c;
  const lg = rb.league[scope][cat.id] ??= [];
  const prevL = lg[0];
  const rl = insert(lg, { ...e, t: teamId }, LEAGUE_N, cat, dedupe);
  const pg = program(rb, teamId)[scope][cat.id] ??= [];
  const prevP = pg[0];
  const { t: _t, ...pe } = e;
  const keep = rb.tracked.includes(teamId);
  const rp = insert(pg, keep ? pe : { ...pe, x: void 0 }, nFor(rb, teamId), cat, dedupe);
  if (c.silent) return;
  const samePerson = (prev) => !!prev && !!e.p && prev.p === e.p;
  if (rl === 0 && prevL && !samePerson(prevL) && (!cat.notable || !better(cat, cat.notable[0], e.v))) report(c, { scope, cat: cat.id, level: "league", teamId, v: e.v, prev: prevL.v, prevName: prevL.n, n: e.n, p: e.p, season: e.s, day: c.day, gameId: c.gameId }, cat);
  else if (rp === 0 && prevP && !samePerson(prevP) && teamId === c.state.user.teamId && (!cat.notable || !better(cat, cat.notable[1], e.v))) report(c, { scope, cat: cat.id, level: "program", teamId, v: e.v, prev: prevP.v, prevName: prevP.n, n: e.n, p: e.p, season: e.s, day: c.day, gameId: c.gameId }, cat);
}
var SCOPE_WORD = { game: "single-game", season: "single-season", career: "career", teamGame: "single-game", teamSeason: "single-season" };
function report(c, b, cat) {
  const { state, rb } = c;
  rb.recent = [b, ...rb.recent].slice(0, 30);
  const t = state.teams[b.teamId];
  const what = `${SCOPE_WORD[b.scope]} ${cat.label.toLowerCase()} record`;
  const lvl = b.level === "league" ? "a new league" : `a new ${t.school}`;
  const isUser2 = b.teamId === state.user.teamId;
  addNews(state, {
    kind: "milestone",
    headline: `${b.n} sets ${lvl} ${what}: ${fmtRec(cat, b.v)}`,
    body: `${b.n} (${t.school}) now holds ${b.level === "league" ? "the league" : "the program"} ${what} with ${fmtRec(cat, b.v)}${b.prevName ? `, passing ${b.prevName} (${fmtRec(cat, b.prev ?? 0)})` : ""}. Record books date to ${seasonLabel(rb.since)}.`,
    teams: [b.teamId],
    important: isUser2 || b.level === "league",
    personId: b.p,
    personKind: b.p ? "player" : void 0
  });
  if (b.level === "league" && b.scope === "game") addSocial(state, { handle: "BoxScoreMedia", name: "Box Score Media", verified: true, kind: "analyst", text: `\u{1F4D6} HISTORY: ${b.n} just put up ${fmtRec(cat, b.v)} ${cat.label.toLowerCase()}. That's a new league single-game record.`, teamId: b.teamId, personId: b.p });
}
function statLineShort(b) {
  const reb = b.orb + b.drb;
  return `${b.pts} pts, ${reb} reb, ${b.ast} ast \xB7 ${b.fgm}-${b.fga} FG${b.tpa ? `, ${b.tpm}-${b.tpa} 3PT` : ""}`;
}
function recordGame(state, g, box, silent = false) {
  const rb = recordBook(state);
  const c = { state, rb, silent, day: g.day, gameId: g.id };
  const scores = [box.hs, box.as];
  const ids = [g.home, g.away];
  for (const side of [0, 1]) {
    const teamId = ids[side], oppId = ids[1 - side];
    if (!state.teams[teamId]) continue;
    for (const b of box.players[side]) {
      if (b.min <= 0) continue;
      for (const cat of GAME_CATS) {
        const v2 = cat.get(b);
        if (v2 < (cat.floor ?? 0)) continue;
        place(c, "game", cat, { v: v2, n: b.name, s: state.season, o: oppId, p: b.id, x: statLineShort(b) }, teamId);
      }
    }
    const tpm = box.players[side].reduce((a, b) => a + b.tpm, 0);
    const margin = scores[side] - scores[1 - side];
    const team = state.teams[teamId];
    const teamEntry = (v2) => ({ v: v2, n: team.school, s: state.season, o: oppId });
    for (const cat of TEAM_GAME_CATS) {
      const v2 = cat.id === "pts" ? scores[side] : cat.id === "margin" ? margin : tpm;
      if (v2 < (cat.floor ?? 0)) continue;
      place(c, "teamGame", cat, teamEntry(v2), teamId);
    }
  }
}
function sumLines(lines) {
  const s = { gp: 0, gs: 0, min: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0 };
  for (const l of lines) for (const k of Object.keys(s)) s[k] += l[k] ?? 0;
  return s;
}
function teamSeason(c, team, season, w, l, pf, pa) {
  const gp2 = w + l;
  if (!gp2) return;
  const vals = { w, pct: gp2 >= 25 ? w / gp2 : null, ppg: pf != null ? pf / gp2 : null, oppg: pa != null ? pa / gp2 : null };
  for (const cat of TEAM_SEASON_CATS) {
    const v2 = vals[cat.id];
    if (v2 == null) continue;
    place(c, "teamSeason", cat, { v: v2, n: team.school, s: season }, team.id, (x) => x.s === season && (x.t ?? team.id) === team.id && x.n === team.school);
  }
}
var SEASON_SCOPES = ["season", "career", "teamSeason"];
function snapshot(rb, teamId) {
  const m = /* @__PURE__ */ new Map();
  for (const sc2 of SEASON_SCOPES) for (const cat of CATS[sc2]) {
    m.set(`L:${sc2}:${cat.id}`, rb.league[sc2][cat.id]?.[0]);
    m.set(`P:${sc2}:${cat.id}`, rb.programs[teamId]?.[sc2][cat.id]?.[0]);
  }
  return m;
}
function reportChanges(c, before, teamId) {
  for (const sc2 of SEASON_SCOPES) for (const cat of CATS[sc2]) {
    for (const level2 of ["league", "program"]) {
      const prev = before.get(`${level2 === "league" ? "L" : "P"}:${sc2}:${cat.id}`);
      const now = level2 === "league" ? c.rb.league[sc2][cat.id]?.[0] : c.rb.programs[teamId]?.[sc2][cat.id]?.[0];
      if (!prev || !now || !better(cat, now.v, prev.v)) continue;
      if (now.p ? now.p === prev.p : now.s === prev.s && now.n === prev.n) continue;
      const bar = cat.notable?.[level2 === "league" ? 0 : 1];
      if (bar != null && better(cat, bar, now.v)) continue;
      report(c, { scope: sc2, cat: cat.id, level: level2, teamId: level2 === "league" ? now.t ?? teamId : teamId, v: now.v, prev: prev.v, prevName: prev.n, n: now.n, p: now.p, season: now.s, day: c.day }, cat);
    }
  }
}
function recordSeasonEnd(state, silent = false) {
  const rb = recordBook(state);
  const uid = state.user.teamId;
  const before = snapshot(rb, uid);
  const c = { state, rb, silent: true, day: state.day };
  const season = state.season;
  for (const p of Object.values(state.players)) {
    if (!p.teamId || !p.stats.gp) continue;
    const name2 = `${p.first} ${p.last}`;
    for (const cat of SEASON_CATS) {
      const v2 = cat.get(p.stats);
      if (v2 == null || v2 <= 0) continue;
      place(c, "season", cat, { v: v2, n: name2, s: season, p: p.id }, p.teamId, (x) => x.p === p.id && x.s === season);
    }
    careerFor(c, p.id, name2, p.teamId, p.career, season);
  }
  for (const t of Object.values(state.teams)) teamSeason(c, t, season, t.record.w, t.record.l, t.record.pf, t.record.pa);
  if (!silent) reportChanges({ ...c, silent: false }, before, uid);
}
function careerFor(c, id, name2, teamId, career, season) {
  const all = sumLines(career);
  const here = sumLines(career.filter((l) => l.teamId === teamId));
  for (const cat of CAREER_CATS) {
    const vl = cat.get(all), vp = cat.get(here);
    if (vl != null && vl > 0) insert(c.rb.league.career[cat.id] ??= [], { v: vl, n: name2, t: teamId, s: season, p: id }, LEAGUE_N, cat, (x) => x.p === id);
    if (vp != null && vp > 0) insert(program(c.rb, teamId).career[cat.id] ??= [], { v: vp, n: name2, s: season, p: id }, nFor(c.rb, teamId), cat, (x) => x.p === id);
  }
}
function backfill(state) {
  const rb = state.records;
  const c = { state, rb, silent: true, day: state.day };
  const done2 = (season) => season < state.season || !["preseason", "regular", "confTourney", "selection", "ncaa"].includes(state.phase);
  let first = state.season;
  for (const p of Object.values(state.players)) {
    const lines = p.career.filter((l) => done2(l.season));
    if (!lines.length) continue;
    const name2 = `${p.first} ${p.last}`;
    for (const l of lines) {
      first = Math.min(first, l.season);
      for (const cat of SEASON_CATS) {
        const v2 = cat.get(l);
        if (v2 == null || v2 <= 0) continue;
        place(c, "season", cat, { v: v2, n: name2, s: l.season, p: p.id }, l.teamId, (x) => x.p === p.id && x.s === l.season);
      }
    }
    const last = lines[lines.length - 1];
    for (const teamId of new Set(lines.map((l) => l.teamId))) careerFor(c, p.id, name2, teamId, lines, last.season);
  }
  for (const t of Object.values(state.teams)) {
    for (const h2 of t.history) {
      first = Math.min(first, h2.season);
      teamSeason(c, t, h2.season, h2.w, h2.l);
    }
  }
  for (const box of Object.values(state.boxScores)) {
    const g = state.schedule.find((x) => x.id === box.gameId);
    if (g) recordGame(state, g, box, true);
  }
  rb.since = first;
}
function recordsInGame(state, gameId) {
  return state.records?.recent.filter((r) => r.gameId === gameId) ?? [];
}

// src/engine/legacy.ts
function hash3(s) {
  let h2 = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h2 ^= s.charCodeAt(i);
    h2 = Math.imul(h2, 16777619);
  }
  return h2 >>> 0;
}
var NICKS = ["Smooth", "The Professor", "Big Shot", "The Wall", "Flash", "Ice", "Downtown", "The Engine", "Buckets", "Hammer", "Spider", "Bounce"];
var LINES = [
  "A four-year starter and still the fans\u2019 all-time favorite.",
  "The purest shooter anyone in this building has ever seen.",
  "A rim protector nobody wanted to challenge.",
  "Ran the point for four seasons and never missed a game.",
  "Scored in bunches and filled the building every night.",
  "The heart of some of the best teams in program history.",
  "A hometown kid who became a legend.",
  "Went on to a long pro career and never forgot where he came from.",
  "The toughest defender the program has ever had.",
  "Hit more big shots than anybody can count."
];
var POS = ["PG", "SG", "SF", "PF", "C"];
var ERAS = ["1960s", "1970s", "1980s", "1990s", "2000s", "2010s"];
var NUMS = [3, 4, 5, 10, 11, 12, 14, 15, 20, 21, 22, 23, 24, 25, 30, 31, 32, 33, 34, 35, 40, 41, 42, 44, 45, 50, 52, 55];
function historicLegends(teamId) {
  if (!loreOf(teamId)) return [];
  const h2 = hash3(`legends:${teamId}`);
  const n = 3 + h2 % 3;
  const out = [];
  const usedNums = /* @__PURE__ */ new Set();
  for (let i = 0; i < n; i++) {
    const k = hash3(`${teamId}:${i}`);
    let num = NUMS[k % NUMS.length];
    while (usedNums.has(num)) num = NUMS[(NUMS.indexOf(num) + 1) % NUMS.length];
    usedNums.add(num);
    out.push({
      name: `${FIRST_NAMES[(k >>> 3) % FIRST_NAMES.length]} ${LAST_NAMES[(k >>> 11) % LAST_NAMES.length]}`,
      num,
      pos: POS[(k >>> 5) % POS.length],
      era: `the ${ERAS[(k >>> 7) % ERAS.length]}`,
      nickname: (k >>> 13) % 3 === 0 ? NICKS[(k >>> 17) % NICKS.length] : void 0,
      line: LINES[(k >>> 19) % LINES.length],
      dynasty: false
    });
  }
  return out.sort((a, b) => a.era.localeCompare(b.era));
}
function retiredJerseys(state, teamId) {
  return state.legacy?.retired[teamId] ?? [];
}
function ringOfHonor(state, teamId) {
  const dyn = retiredJerseys(state, teamId).slice().reverse().map((r) => ({ name: r.name, num: r.num, pos: r.pos, era: r.years, line: r.why, dynasty: true, season: r.season, playerId: r.playerId }));
  return [...dyn, ...historicLegends(teamId)];
}
function retiredNumbers(state, teamId) {
  return /* @__PURE__ */ new Set([...historicLegends(teamId).map((l) => l.num), ...retiredJerseys(state, teamId).map((r) => r.num)]);
}
function retireJerseys(state, leaving) {
  const lg = state.legacy ??= { retired: {} };
  const rb = recordBook(state);
  for (const id of leaving) {
    const p = state.players[id];
    if (!p || !p.teamId) continue;
    const teamId = p.teamId;
    if ((lg.retired[teamId] ?? []).some((r) => r.playerId === id)) continue;
    const mine = state.awards.filter((a) => a.playerId === id && a.teamId === teamId);
    const strong = [], medium = [];
    const poy = mine.filter((a) => a.name === "National Player of the Year");
    if (poy.length) strong.push(`National Player of the Year (${poy.map((a) => a.season + 1).join(", ")})`);
    const aa1 = mine.filter((a) => a.name === "All-American First Team");
    if (aa1.length >= 2) strong.push(`${aa1.length}-time First Team All-American`);
    else if (aa1.length) medium.push("First Team All-American");
    const mop = mine.filter((a) => a.name === "Final Four Most Outstanding Player");
    if (mop.length) medium.push(`Final Four Most Outstanding Player (${mop.map((a) => a.season + 1).join(", ")})`);
    const cpoy = mine.filter((a) => / Player of the Year$/.test(a.name) && a.name !== "National Player of the Year" && a.name !== "Defensive Player of the Year");
    if (cpoy.length >= 2) medium.push(`${cpoy.length}-time ${cpoy[0].name}`);
    for (const c of state.champions.filter((x) => x.teamId === teamId)) {
      const s = c.season;
      const line = p.career.find((l) => l.season === s && l.teamId === teamId);
      if (!line || !line.gp) continue;
      const ppg2 = (o) => {
        const l = o.career.find((x) => x.season === s && x.teamId === teamId);
        return l && l.gp ? l.pts / l.gp : 0;
      };
      const best = Object.values(state.players).filter((o) => ppg2(o) > 0).sort((a, b) => ppg2(b) - ppg2(a))[0];
      if (best?.id === id) medium.push(`led the ${s + 1} national champions in scoring`);
    }
    const pts = p.career.filter((l) => l.teamId === teamId).reduce((n, l) => n + l.pts, 0);
    const leader = rb.programs[teamId]?.career.pts?.[0];
    if (pts >= 2300) medium.push(leader?.p === id ? `the program\u2019s career scoring leader (${pts.toLocaleString()} points)` : `${pts.toLocaleString()} career points`);
    if (!strong.length && medium.length < 2) continue;
    const list2 = lg.retired[teamId] ??= [];
    const seasons = p.career.filter((l) => l.teamId === teamId).map((l) => l.season);
    const first = Math.min(...seasons, state.season), last = Math.max(...seasons, state.season);
    const why = cap([...strong, ...medium].join("; "));
    list2.push({ playerId: id, name: `${p.first} ${p.last}`, num: p.num, pos: p.pos, years: `${first}\u2013${String((last + 1) % 100).padStart(2, "0")}`, why, season: state.season });
    const t = state.teams[teamId];
    addNews(state, {
      kind: "feature",
      headline: `${t.school} will retire ${p.first} ${p.last}\u2019s No. ${p.num}`,
      body: `${p.first} ${p.last}\u2019s No. ${p.num} is going to the rafters at ${t.arena}. ${why}.`,
      teams: [teamId],
      important: teamId === state.user.teamId,
      personId: id,
      personKind: "player"
    });
  }
}
function jerseyNights(state) {
  for (const [teamId, list2] of Object.entries(state.legacy?.retired ?? {})) {
    const t = state.teams[teamId];
    if (!t) continue;
    for (const r of list2.filter((x) => x.season === state.season - 1)) {
      const user2 = teamId === state.user.teamId;
      t.hype = Math.min(100, t.hype + (user2 ? 3 : 1));
      addNews(state, {
        kind: "feature",
        headline: `Jersey night at ${t.arena}: ${r.name}\u2019s No. ${r.num} goes to the rafters`,
        body: `${t.school} will raise ${r.name}\u2019s No. ${r.num} before a home game this season. ${r.why}. No ${t.mascot} will wear it again.`,
        teams: [teamId],
        important: user2,
        personId: r.playerId,
        personKind: "player"
      });
    }
  }
}
var cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// src/engine/chemistry.ts
var CHEM_NEUTRAL = 60;
var BOOST_CAP = 15;
function chemLabel(c) {
  if (c >= 82) return { label: "Brotherhood", tone: "good", icon: "\u{1F525}", desc: "They would run through a wall for each other." };
  if (c >= 68) return { label: "Tight", tone: "good", icon: "\u{1F91D}", desc: "A close group that plays for each other." };
  if (c >= 54) return { label: "Solid", tone: "", icon: "\u{1F642}", desc: "No problems you can see from the outside." };
  if (c >= 40) return { label: "Shaky", tone: "gold", icon: "\u{1F62C}", desc: "A few cracks. Losing streaks will find them." };
  if (c >= 26) return { label: "Fractured", tone: "bad", icon: "\u{1F494}", desc: "Cliques, sulking and finger-pointing." };
  return { label: "Toxic", tone: "bad", icon: "\u2620\uFE0F", desc: "The locker room has turned on itself." };
}
function chemEdge(chem) {
  return clamp(((chem ?? CHEM_NEUTRAL) - CHEM_NEUTRAL) / 32, -1, 1);
}
function lockerGroup(p, teamId) {
  if (p.career.some((c) => c.teamId === teamId)) return "returner";
  if (p.history.some((h2) => h2.startsWith("Transferred") && h2.includes(" to "))) return "transfer";
  return p.cls === "FR" ? "freshman" : "returner";
}
function roleOf(p, rank) {
  if (p.redshirting) return { role: "Redshirt", min: 0 };
  if (p.promise === "star") return { role: "Star", min: 30 };
  if (p.promise === "starter" || rank < 5) return { role: "Starter", min: 24 };
  if (rank < 8) return { role: "Rotation", min: 12 };
  if (rank < 10) return { role: "Spot minutes", min: 5 };
  return { role: "Bench", min: 0 };
}
var mpgOf = (p) => p.stats.gp ? p.stats.min / p.stats.gp : 0;
var isSenior = (p) => (p.cls === "SR" || p.cls === "GR") && p.elig <= 1;
var posGroup = (p) => p.pos === "PG" || p.pos === "SG" ? "g" : p.pos === "SF" ? "w" : "b";
var name = (p) => `${p.first} ${p.last}`;
function captainScore(p, teamId) {
  const t = p.traits;
  let s = 0;
  if (t.includes("leader")) s += 3;
  if (t.includes("coachable")) s += 1;
  if (t.includes("glue")) s += 1;
  if (t.includes("loyal")) s += 0.5;
  if (t.includes("scholar")) s += 0.3;
  if (t.includes("diva")) s -= 2.5;
  if (t.includes("hothead")) s -= 2;
  if (t.includes("mercenary")) s -= 0.7;
  s += { FR: -1.5, SO: -0.3, JR: 0.8, SR: 1.8, GR: 1.5 }[p.cls];
  s += Math.min(2, p.career.filter((c) => c.teamId === teamId).length * 0.6);
  s += (p.morale - 60) / 25;
  s += (p.ovr - 62) / 14;
  return Math.round(s * 10) / 10;
}
function captainGrade(score) {
  if (score >= 5.5) return { label: "Natural leader", tone: "good" };
  if (score >= 3.5) return { label: "Respected voice", tone: "good" };
  if (score >= 1.5) return { label: "Solid choice", tone: "" };
  if (score >= 0) return { label: "Unproven", tone: "gold" };
  return { label: "Wrong guy", tone: "bad" };
}
function autoCaptains(state, team) {
  return teamPlayers(state, team.id).filter((p) => !p.redshirting).sort((a, b) => captainScore(b, team.id) - captainScore(a, team.id)).slice(0, 2);
}
function captainsOf(state, team) {
  if (team.id !== state.user.teamId) return isHuman(state, team.id) ? asTeam(state, team.id, () => captainsOf(state, team)) : autoCaptains(state, team);
  const L = state.locker;
  if (!L || L.teamId !== team.id) return [];
  return L.captains.map((id) => state.players[id]).filter((p) => !!p && p.teamId === team.id);
}
function locker(state) {
  const uid = state.user.teamId;
  let L = state.locker;
  if (!L || L.teamId !== uid) {
    L = state.locker = { teamId: uid, season: state.season, trend: [], captains: [], boost: 0, log: [], doorOpen: [], promised: {}, pastCaptains: L?.pastCaptains ?? [] };
  }
  if (L.season !== state.season) {
    const names = L.captains.map((id) => state.players[id]).filter(Boolean).map((p) => name(p));
    if (names.length && !L.pastCaptains.some((x) => x.season === L.season && x.teamId === L.teamId)) L.pastCaptains.unshift({ season: L.season, teamId: L.teamId, names });
    L.pastCaptains = L.pastCaptains.slice(0, 30);
    Object.assign(L, { season: state.season, trend: [], captains: [], captainsBy: void 0, boost: 0, doorOpen: [], promised: {}, lastEventWeek: void 0, lastMeetingWeek: void 0, askedCaptains: void 0, cool: {} });
  }
  return L;
}
function lockerLog(state, icon, text, delta, playerId) {
  const L = locker(state);
  const e = { season: state.season, day: state.day, icon, text };
  if (delta) e.delta = Math.round(delta * 10) / 10;
  if (playerId) e.playerId = playerId;
  L.log = [e, ...L.log].slice(0, 60);
}
function bump(state, delta) {
  const L = locker(state);
  L.boost = clamp(L.boost + delta, -BOOST_CAP, BOOST_CAP);
  const t = state.teams[state.user.teamId];
  t.chem = Math.round(clamp((t.chem ?? CHEM_NEUTRAL) + delta * 0.6, 0, 100) * 10) / 10;
}
function recentByTeam(state, n) {
  const out = {};
  const played = state.schedule.filter((g) => g.played && g.type !== "exh").sort((a, b) => b.day - a.day);
  for (const g of played) {
    const hw = (g.hs ?? 0) > (g.as ?? 0);
    for (const [id, won] of [[g.home, hw], [g.away, !hw]]) {
      const a = out[id] ??= [];
      if (a.length < n) a.push(won);
    }
  }
  return out;
}
function chemFactors(state, team, recent) {
  const isUser2 = team.id === state.user.teamId;
  const ps = teamPlayers(state, team.id).filter((p) => !p.redshirting);
  const F = [];
  const add = (key, label, v2) => {
    if (Math.abs(v2) >= 0.05) F.push({ key, label, value: Math.round(v2 * 10) / 10 });
  };
  const plural3 = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (!ps.length) return { target: CHEM_NEUTRAL, factors: [] };
  const caps = captainsOf(state, team);
  if (caps.length) add("captains", `Captains: ${caps.map((p) => p.last).join(" & ")}`, caps.reduce((s, p) => s + clamp((captainScore(p, team.id) - 2) * 1.4, -4, 5), 0));
  else if (isUser2) add("captains", "No captains named", -3);
  const leaders = ps.filter((p) => p.traits.includes("leader") && !caps.includes(p)).length;
  add("leaders", `${plural3(leaders, "other leader")} in the room`, Math.min(3, leaders * 1.5));
  const glue = ps.filter((p) => p.traits.includes("glue")).length;
  add("glue", plural3(glue, "glue guy"), Math.min(4.5, glue * 1.5));
  const divas = ps.filter((p) => p.traits.includes("diva"));
  const sour = divas.filter((p) => p.morale < 50).length;
  add("divas", sour ? `${plural3(divas.length, "diva")}, ${sour} unhappy` : plural3(divas.length, "diva"), divas.reduce((s, p) => s + (p.morale < 50 ? -3.5 : -1), 0));
  const hot = ps.filter((p) => p.traits.includes("hothead")).length;
  add("hotheads", plural3(hot, "hothead"), -hot);
  const avg2 = ps.reduce((s, p) => s + p.morale, 0) / ps.length;
  add("mood", `Team mood (${Math.round(avg2)})`, (avg2 - 65) * 0.3);
  const unhappy = ps.filter((p) => p.morale < 40).length;
  add("unhappy", `${plural3(unhappy, "unhappy player")}`, -2.5 * unhappy);
  const sorted = [...ps].sort((a, b) => b.ovr - a.ovr);
  const frustrated = sorted.filter((p, i) => p.stats.gp >= 3 && mpgOf(p) + 6 < roleOf(p, i).min).length;
  add("roles", `${frustrated} unhappy with ${frustrated === 1 ? "his" : "their"} role`, -Math.min(6, frustrated * 1.5));
  const top = sorted.slice(0, 8);
  const ret = top.filter((p) => lockerGroup(p, team.id) === "returner").length / Math.max(1, top.length);
  add("continuity", `${Math.round(ret * 100)}% of the rotation is back`, ret * 12 - 6);
  const transfers = ps.filter((p) => lockerGroup(p, team.id) === "transfer").length;
  if (transfers > 3) add("transfers", `${transfers} transfers still learning each other`, -(transfers - 3) * 1.5);
  const res = (recent ?? recentByTeam(state, 6))[team.id] ?? [];
  if (res.length) {
    const w = res.filter(Boolean).length;
    add("winning", `Last ${res.length} games: ${w}-${res.length - w}`, (w - (res.length - w)) * 1);
  }
  const coach = state.coaches[team.coachId];
  let mot = coach ? coach.skills.motivation : 5;
  if (isUser2 && state.staff) mot += staffEffects(state).motivation;
  add("coach", "Coach\u2019s motivation", (mot - 5) * 0.8);
  if (isUser2 && state.locker?.teamId === team.id) add("moments", "Locker-room moments", state.locker.boost);
  const sum = F.reduce((s, f) => s + f.value, 0);
  return { target: Math.round(clamp(52 + sum, 8, 96) * 10) / 10, factors: F.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)) };
}
function chemistryWeek(state, week) {
  const recent = recentByTeam(state, 6);
  for (const t of Object.values(state.teams)) {
    const { target } = isHuman(state, t.id) ? asTeam(state, t.id, () => chemFactors(state, t, recent)) : chemFactors(state, t, recent);
    t.chem = t.chem == null ? target : Math.round((t.chem + (target - t.chem) * 0.3) * 10) / 10;
  }
  for (const p of Object.values(state.players)) {
    if (!p.teamId) continue;
    const c = state.teams[p.teamId]?.chem ?? CHEM_NEUTRAL;
    p.morale = clamp(p.morale + (c - CHEM_NEUTRAL) * 0.03, 0, 100);
  }
}
function lockerTick(state, week) {
  if (!["preseason", "regular", "confTourney", "selection", "ncaa"].includes(state.phase)) return;
  const L = locker(state);
  L.boost = Math.round(L.boost * 0.85 * 10) / 10;
  lockerWeek(state, L, week);
  L.trend.push(state.teams[state.user.teamId].chem ?? CHEM_NEUTRAL);
  if (L.trend.length > 30) L.trend = L.trend.slice(-30);
}
function chemistrySeasonEnd(state) {
  for (const t of Object.values(state.teams)) {
    const h2 = t.history[t.history.length - 1];
    if (h2 && h2.season === state.season && t.chem != null) h2.chem = Math.round(t.chem);
  }
  forEachHuman(state, () => rememberCaptains(state));
}
function rememberCaptains(state) {
  const L = state.locker;
  if (!L || L.teamId !== state.user.teamId || L.season !== state.season) return;
  const names = L.captains.map((id) => state.players[id]).filter(Boolean).map((p) => name(p));
  if (names.length && !L.pastCaptains.some((x) => x.season === L.season && x.teamId === L.teamId)) L.pastCaptains.unshift({ season: L.season, teamId: L.teamId, names });
}
function chemistryNewSeason(state) {
  for (const t of Object.values(state.teams)) t.chem = (isHuman(state, t.id) ? asTeam(state, t.id, () => chemFactors(state, t, {})) : chemFactors(state, t, {})).target;
  forEachHuman(state, () => {
    const L = locker(state);
    L.trend = [state.teams[state.user.teamId].chem ?? CHEM_NEUTRAL];
    captainsInbox(state, L);
  });
}
function portalChemMul(chem) {
  return clamp(1 + (CHEM_NEUTRAL - (chem ?? CHEM_NEUTRAL)) * 0.012, 0.8, 1.4);
}
function captainsInbox(state, L) {
  if (L.captains.length || L.askedCaptains === state.season) return;
  const team = state.teams[state.user.teamId];
  const best = autoCaptains(state, team);
  if (!best.length) return;
  L.askedCaptains = state.season;
  const desc = best.map((p) => `${name(p)} (${p.cls}, ${captainGrade(captainScore(p, team.id)).label.toLowerCase()})`).join(" and ");
  state.inbox.unshift(item(state, {
    subject: "Who wears the C this year?",
    body: `Every team needs a voice in the huddle. The staff likes ${desc}. Good captains steady the locker room when the season gets hard; the wrong pick can split it. If you don't choose before the games start, the staff will.`,
    choices: [
      { label: `Name ${best.map((p) => p.last).join(" and ")}`, hint: "The staff\u2019s picks", effects: [], locker: { kind: "captains", ids: best.map((p) => p.id) }, result: `${best.map((p) => p.last).join(" and ")} will wear the C.` },
      { label: "I\u2019ll pick them myself", hint: "Opens the Locker Room", effects: [], goto: "locker", result: "Head to the Locker Room to name your captains." }
    ],
    priority: true
  }));
}
var seq2 = 0;
function item(state, o) {
  return { id: `lk${state.season}${state.day}${(seq2++).toString(36)}`, day: state.day, season: state.season, resolved: false, from: o.from ?? "Your staff", fromRole: "Locker Room", subject: o.subject, body: o.body, choices: o.choices, personId: o.personId, personKind: o.personId ? "player" : void 0, priority: o.priority };
}
var GENS = [
  // a player wants more minutes
  { w: 4, gen: (s, L, team) => {
    const ps = teamPlayers(s, team.id).filter((p2) => !p2.redshirting).sort((a, b) => b.ovr - a.ovr);
    const c = ps.map((p2, i) => ({ p: p2, r: roleOf(p2, i) })).filter(({ p: p2, r: r2 }) => p2.stats.gp >= 4 && mpgOf(p2) + 5 < r2.min && p2.morale < 62 && !L.promised[p2.id] && !L.doorOpen.includes(p2.id));
    if (!c.length) return null;
    const { p, r } = rng.weighted(c, c.map((x) => x.p.traits.includes("diva") ? 3 : 1));
    const quote = rng.pick([`I came here to play, Coach. I'm not getting a chance.`, `Tell me what I have to do. I'll do it. I just need minutes.`, `My family keeps asking why I'm not playing. I don't have an answer.`, `I know I can help this team. Let me prove it.`]);
    const coachable = p.traits.includes("coachable");
    return item(s, {
      subject: `${name(p)} wants a bigger role`,
      personId: p.id,
      body: `${p.last} expected ${r.role.toLowerCase()} minutes (about ${r.min} a game) and he's averaging ${mpgOf(p).toFixed(1)}. He asked to meet. "${quote}"`,
      choices: [
        { label: "Tell him to earn it in practice", hint: coachable ? "He\u2019s coachable; he\u2019ll respond" : "He won\u2019t love it", effects: [{ kind: "morale", target: p.id, delta: coachable ? 2 : -5 }, { kind: "chem", delta: 1 }], result: coachable ? `"Yes sir." He was first in the gym the next morning.` : `He nodded, but he's not happy.` },
        { label: "Promise him a bigger role", hint: "He\u2019s thrilled. Keep your word in the next few games.", effects: [{ kind: "morale", target: p.id, delta: 12 }], locker: { kind: "promise", playerId: p.id }, result: `"That's all I wanted, Coach." The staff will be watching his minutes.` },
        { label: "Tell him he\u2019s free to look elsewhere", hint: "He\u2019ll enter the portal after the season", effects: [{ kind: "morale", target: p.id, delta: -18 }, { kind: "chem", delta: 1 }], locker: { kind: "door", playerId: p.id }, result: `Honest, and it stung. He'll finish the season and then move on.` }
      ]
    });
  } },
  // a freshman is outplaying a senior starter
  { w: 3, gen: (s, L, team) => {
    const all = teamPlayers(s, team.id);
    const starters = depthChart(all, team.strategy).slice(0, 5);
    for (const f of rng.shuffle(all.filter((p) => p.cls === "FR" && !p.redshirting && !starters.includes(p)))) {
      const sr = starters.find((p) => (p.cls === "SR" || p.cls === "GR") && posGroup(p) === posGroup(f) && f.ovr >= p.ovr + 2);
      if (!sr) continue;
      const soft = sr.traits.includes("coachable") || sr.traits.includes("leader");
      const cap3 = L.captains.includes(sr.id);
      return item(s, {
        subject: `${f.last} is pushing ${sr.last} for a starting spot`,
        personId: f.id,
        body: `Freshman ${name(f)} (${f.ovr}) has outplayed senior ${name(sr)} (${sr.ovr}) in practice for two weeks${cap3 ? `, and ${sr.last} is one of your captains` : ""}. The whole team is watching what you do.`,
        choices: [
          { label: `Start ${f.last}`, hint: soft ? `${sr.last} will handle it like a pro` : `${sr.last} won\u2019t take it well`, effects: [{ kind: "morale", target: f.id, delta: 8 }, { kind: "morale", target: sr.id, delta: soft ? -4 : -12 }, { kind: "chem", delta: cap3 ? -4 : soft ? 1 : -2 }], locker: { kind: "start", playerId: f.id, benchId: sr.id }, result: soft ? `${sr.last} was the first one to congratulate him.` : `${sr.last} skipped the team dinner.` },
          { label: `${sr.last} keeps his spot`, hint: "Seniority; the freshman waits", effects: [{ kind: "morale", target: f.id, delta: f.traits.includes("diva") ? -10 : -6 }, { kind: "morale", target: sr.id, delta: 4 }, { kind: "chem", delta: 1 }], result: `${f.last} will get his turn. The seniors appreciate it.` },
          { label: "Split the minutes", hint: "Nobody\u2019s thrilled, nobody\u2019s crushed", effects: [{ kind: "morale", target: f.id, delta: -2 }, { kind: "morale", target: sr.id, delta: -2 }, { kind: "chem", delta: 1 }], result: "A time-share it is. Both of them want the job." }
        ]
      });
    }
    return null;
  } },
  // an off-court incident
  { w: 1.2, gen: (s, L, team) => {
    const ps = teamPlayers(s, team.id).filter((p2) => !p2.injury);
    if (!ps.length) return null;
    const p = rng.weighted(ps, ps.map((x) => (x.traits.includes("hothead") ? 3 : x.traits.includes("diva") ? 1.5 : 1) * (x.cls === "FR" ? 1.3 : 1) * (L.captains.includes(x.id) ? 0.4 : 1)));
    const what = rng.weighted([
      ["missed curfew on the last road trip", "Curfew"],
      ["skipped two classes this week", "Academics"],
      ["showed up late for the team flight", "Team rules"],
      ["posted something he shouldn\u2019t have", "Social media"],
      ["got into a shouting match with a teammate at practice", "Conduct"]
    ], [2, 2, 2, p.traits.includes("influencer") ? 4 : 1, p.traits.includes("hothead") ? 4 : 1]);
    const starter = depthChart(teamPlayers(s, team.id), team.strategy).slice(0, 5).includes(p);
    const leak = rng.chance(0.3);
    return item(s, {
      subject: `${name(p)}: ${what[1].toLowerCase()} problem`,
      personId: p.id,
      body: `${name(p)} ${what[0]}. ${starter ? "He\u2019s a starter, and " : ""}your players know about it. They\u2019re waiting to see if the rules apply to everyone.`,
      choices: [
        { label: "Suspend him for a game", hint: "Consistency; the room respects it", effects: [{ kind: "suspend", target: p.id, games: 1, reason: what[1] }, { kind: "morale", target: p.id, delta: -6 }, { kind: "chem", delta: 2 }, { kind: "mediaRep", delta: 1 }], result: `He sits one game. Nobody else is late for anything.` },
        { label: "Handle it internally", hint: starter ? "Teammates may see a double standard" : "Quiet, but people talk", effects: [{ kind: "morale", target: p.id, delta: 1 }, { kind: "chem", delta: starter ? -3 : -1 }, ...leak ? [{ kind: "mediaRep", delta: -2 }, { kind: "security", delta: -1 }] : []], result: leak ? `It leaked anyway. Now the beat writers are asking questions.` : `It stays in the building.` },
        { label: "6 a.m. sprints with the walk-ons", hint: "Old school", effects: [{ kind: "morale", target: p.id, delta: p.traits.includes("hothead") ? -6 : -3 }, { kind: "chem", delta: 1 }], result: `He threw up twice. Message received.` }
      ]
    });
  } },
  // the diva wants the ball
  { w: 2, gen: (s, L, team) => {
    const p = teamPlayers(s, team.id).find((x) => x.traits.includes("diva") && x.morale < 56 && x.stats.gp >= 3);
    if (!p) return null;
    const coach = s.coaches[s.user.coachId];
    const talk = rng.chance(clamp(0.35 + (coach?.skills.motivation ?? 5) * 0.05, 0.2, 0.9));
    return item(s, {
      subject: `${name(p)} is posting cryptic tweets`,
      personId: p.id,
      body: `"Some people don't see it. That's on them." ${p.last} has ${mpgOf(p) ? `${(p.stats.pts / Math.max(1, p.stats.gp)).toFixed(1)} points a game and ` : ""}a lot to say online. His teammates have noticed.`,
      choices: [
        { label: "Run more plays for him", hint: "He\u2019s happy; teammates notice", effects: [{ kind: "morale", target: p.id, delta: 10 }, { kind: "chem", delta: -3 }], result: `He's smiling again. The bigs are not.` },
        { label: "Sit down and talk it out", hint: "Depends on your motivation skill", effects: talk ? [{ kind: "morale", target: p.id, delta: 5 }, { kind: "chem", delta: 1 }] : [{ kind: "morale", target: p.id, delta: -2 }], result: talk ? "He deleted the tweets and apologized to the team." : `He nodded through the whole thing and tweeted again that night.` },
        { label: "Bench him for a game", hint: "A statement; he\u2019ll be furious", effects: [{ kind: "suspend", target: p.id, games: 1, reason: "Coach\u2019s decision" }, { kind: "morale", target: p.id, delta: -12 }, { kind: "chem", delta: 3 }], result: "He watched from the end of the bench. The rest of the team got the message." }
      ]
    });
  } },
  // two locker rooms: transfers and returners
  { w: 2, gen: (s, L, team) => {
    const ps = teamPlayers(s, team.id).filter((p) => !p.redshirting);
    const tr = ps.filter((p) => lockerGroup(p, team.id) === "transfer"), re = ps.filter((p) => lockerGroup(p, team.id) === "returner");
    if (tr.length < 3 || re.length < 3) return null;
    const avg2 = (a) => a.reduce((x, p) => x + p.morale, 0) / a.length;
    const gap = avg2(re) - avg2(tr);
    if (Math.abs(gap) < 6) return null;
    const [sad, glad, sadLabel] = gap < 0 ? [re, tr, "returners"] : [tr, re, "transfers"];
    return item(s, {
      subject: "Two locker rooms",
      body: gap < 0 ? `The returners say they feel like strangers in their own gym. The transfers sit together, eat together and get most of the shots.` : `The transfers say the returners never let them in. They sit at their own table and talk about "how we used to do it."`,
      choices: [
        { label: "Team retreat (10 hours)", hint: "Costs recruiting hours this week", effects: [{ kind: "hours", delta: -10 }, { kind: "chem", delta: 6 }, ...sad.map((p) => ({ kind: "morale", target: p.id, delta: 3 }))], result: "A ropes course, a campfire and a lot of bad singing. It worked." },
        { label: "Pair every newcomer with a returner", hint: "Costs 4 hours", effects: [{ kind: "hours", delta: -4 }, { kind: "chem", delta: 3 }], result: "Road-trip roommates are now mixed. It\u2019s slowly getting better." },
        { label: "Remind them it\u2019s a meritocracy", hint: `The ${sadLabel} won\u2019t like it`, effects: [...sad.map((p) => ({ kind: "morale", target: p.id, delta: -4 })), ...glad.map((p) => ({ kind: "morale", target: p.id, delta: 2 })), { kind: "chem", delta: -2 }], result: "The best players play. The divide is still there." }
      ]
    });
  } },
  // the star's NBA buzz
  { w: 2, gen: (s, L, team) => {
    const star = teamPlayers(s, team.id).filter((p) => p.stats.gp >= 5 && p.ovr >= 72).sort((a, b) => b.ovr - a.ovr)[0];
    if (!star || star.stats.pts / star.stats.gp < 14) return null;
    const leader = star.traits.includes("leader") || star.traits.includes("coachable");
    return item(s, {
      subject: `NBA scouts are everywhere ${star.last} goes`,
      personId: star.id,
      body: `There were 14 NBA scouts at the last game, and every postgame question is about ${name(star)}'s draft stock. A few teammates have joked they feel like extras in his documentary.`,
      choices: [
        { label: "Shut down the NBA talk", hint: "Team first; he may bristle", effects: [{ kind: "morale", target: star.id, delta: leader ? -1 : -5 }, { kind: "chem", delta: 2 }, { kind: "mediaRep", delta: -1 }], result: "No more draft questions at pressers. The beat writers grumbled." },
        { label: "Embrace it: it helps recruiting", hint: "Recruits notice; teammates notice too", effects: [{ kind: "recruitInterest", delta: 3 }, { kind: "morale", target: star.id, delta: 4 }, { kind: "chem", delta: -2 }], result: "Every recruit on campus this month heard about the scouts." },
        { label: `Let ${star.last} address the team`, hint: leader ? "He\u2019s a leader; it could help" : "Risky if he says the wrong thing", effects: leader ? [{ kind: "chem", delta: 4 }, { kind: "morale", target: "team", delta: 2 }] : [{ kind: "chem", delta: rng.chance(0.5) ? 2 : -2 }], result: leader ? `"I don't get any of this without you guys." The room went quiet, then loud.` : `He said all the right things. Mostly.` }
      ]
    });
  } },
  // the bench went viral
  { w: 1.4, gen: (s, L, team) => {
    if (team.record.streak < 3) return null;
    const bench = teamPlayers(s, team.id).sort((a, b) => a.ovr - b.ovr)[0];
    if (!bench) return null;
    return item(s, {
      subject: "Your bench celebration went viral",
      personId: bench.id,
      body: `${name(bench)} and the end of the bench have a new routine for every big shot, and the clip has two million views. Opposing fans hate it. Your players love it.`,
      choices: [
        { label: "Love it. Keep it going", hint: "Chemistry and hype", effects: [{ kind: "chem", delta: 2 }, { kind: "hype", delta: 3 }, { kind: "morale", target: bench.id, delta: 5 }], result: "They added choreography. There are now T-shirts." },
        { label: "Tone it down; act like you\u2019ve been there", hint: "Old school", effects: [{ kind: "chem", delta: -1 }, { kind: "mediaRep", delta: 2 }], result: "They toned it down. A little." }
      ]
    });
  } },
  // a prank war
  { w: 1.2, gen: (s, L, team) => {
    const ps = teamPlayers(s, team.id);
    if (ps.length < 6) return null;
    const a = rng.pick(ps), b = rng.pick(ps.filter((x) => x.id !== a.id));
    const pr = rng.pick([`filled ${b.last}'s car with packing peanuts`, `replaced ${b.last}'s shampoo with ketchup`, `put ${b.last}'s mattress in the shower`, `changed ${b.last}'s ringtone to a rival's fight song`]);
    return item(s, {
      subject: "The prank war is escalating",
      personId: a.id,
      body: `It started small. Then ${a.last} ${pr}. Now ${b.last} is planning revenge and half the team has picked sides. Your trainer says it's mostly harmless.`,
      choices: [
        { label: "Let them have fun", hint: "Usually bonds a team", effects: [{ kind: "chem", delta: 2 }, { kind: "morale", target: "team", delta: 1 }], result: "The revenge involved a goat. Nobody will tell you more." },
        { label: "End it before someone gets hurt", hint: "Safe and a little boring", effects: [{ kind: "chem", delta: -1 }], result: "Peace was declared. Suspiciously quickly." },
        { label: "Join in", hint: "Bold; it could go either way", effects: rng.chance(0.6) ? [{ kind: "chem", delta: 4 }, { kind: "morale", target: "team", delta: 3 }] : [{ kind: "chem", delta: -1 }, { kind: "mediaRep", delta: -1 }], result: "You filled the team bus with balloons. Legend status, or close to it." }
      ]
    });
  } },
  // the players ask for something
  { w: 1.2, gen: (s, L, team) => {
    const caps = captainsOf(s, team);
    const ask = rng.pick([
      ["a team trip to an NBA game", "They\u2019ve never seen a game together outside of practice.", 8],
      ["new music in the locker room", "They are tired of your playlist. They were polite about it.", 0],
      ["a Thanksgiving dinner for players who can\u2019t go home", "Half the roster can\u2019t fly home for the break.", 4],
      ["throwback uniforms for the rivalry game", "They found a picture of the 1990s set and won\u2019t stop talking about it.", 2]
    ]);
    return item(s, {
      subject: `The players have a request: ${ask[0]}`,
      from: caps[0] ? name(caps[0]) : "Your staff",
      personId: caps[0]?.id,
      body: `${caps[0] ? `${name(caps[0])} came by your office on behalf of the team.` : "A few players came by your office."} They'd like ${ask[0]}. ${ask[1]}`,
      choices: [
        { label: "Make it happen", hint: ask[2] ? `Costs ${ask[2]} recruiting hours` : "Easy yes", effects: [...ask[2] ? [{ kind: "hours", delta: -ask[2] }] : [], { kind: "chem", delta: ask[2] ? 3 : 2 }, { kind: "morale", target: "team", delta: 2 }, ...caps[0] ? [{ kind: "morale", target: caps[0].id, delta: 3 }] : []], result: "Done. The group chat was all exclamation points." },
        { label: "Not this year", hint: "They\u2019ll get over it", effects: [{ kind: "chem", delta: -1 }], result: "They took it fine. Mostly." }
      ]
    });
  } },
  // a captain has checked out
  { w: 3, gen: (s, L) => {
    const p = L.captains.map((id) => s.players[id]).find((x) => x && x.morale < 40);
    if (!p) return null;
    return item(s, {
      subject: `Your captain has checked out`,
      personId: p.id,
      body: `${name(p)} has been quiet in huddles and late to film. Players are noticing that the guy wearing the C doesn't seem to care.`,
      choices: [
        { label: "Strip the captaincy", hint: "Bold; he\u2019ll be crushed", effects: [{ kind: "morale", target: p.id, delta: -15 }, { kind: "chem", delta: p.traits.includes("diva") ? 1 : -2 }], locker: { kind: "strip", playerId: p.id }, result: `${p.last} handed the C back. Name a new captain in the Locker Room.` },
        { label: "Give him time", hint: "The room is watching", effects: [{ kind: "chem", delta: -2 }], result: "You let it ride. For now." },
        { label: "Heart-to-heart (3 hours)", hint: "Costs recruiting hours", effects: [{ kind: "hours", delta: -3 }, { kind: "morale", target: p.id, delta: 9 }], result: `Turns out it was stuff at home. He's back.` }
      ]
    });
  } }
];
function lockerWeek(state, L, week) {
  const team = state.teams[state.user.teamId];
  const inSeason = state.phase === "regular" || state.phase === "confTourney" || state.phase === "preseason";
  if (!inSeason) {
    L.promised = {};
    return;
  }
  if (!L.captains.length) {
    if (L.askedCaptains !== state.season) captainsInbox(state, L);
    else if (state.phase !== "preseason") {
      const best = autoCaptains(state, team);
      if (best.length) {
        L.captains = best.map((p) => p.id);
        L.captainsBy = "staff";
        for (const it of state.inbox) if (!it.resolved && it.fromRole === "Locker Room" && it.subject.startsWith("Who wears")) it.resolved = true;
        lockerLog(state, "\xA9\uFE0F", `Your staff named ${best.map(name).join(" and ")} captain${best.length > 1 ? "s" : ""}`);
      }
    }
  }
  if (state.phase === "preseason") return;
  for (const [id, pr] of Object.entries(L.promised)) {
    const p = state.players[id];
    if (!p || p.teamId !== team.id) {
      delete L.promised[id];
      continue;
    }
    const games = p.stats.gp - pr.gp;
    if (games < 4) continue;
    const since = (p.stats.min - pr.min) / games, before = pr.gp ? pr.min / pr.gp : 0;
    delete L.promised[id];
    if (since >= before + 5) {
      p.morale = clamp(p.morale + 5, 0, 100);
      bump(state, 2);
      lockerLog(state, "\u2705", `You kept your word: ${name(p)} is up to ${since.toFixed(1)} minutes a game`, 2, p.id);
    } else {
      p.morale = clamp(p.morale - 15, 0, 100);
      bump(state, -4);
      lockerLog(state, "\u{1F494}", `You broke your promise to ${name(p)} (${since.toFixed(1)} minutes a game since)`, -4, p.id);
    }
  }
  const st = team.record.streak;
  const caps = captainsOf(state, team);
  const leaderCap = caps.find((p) => p.traits.includes("leader"));
  if (st === -2 && leaderCap && rng.chance(0.5)) {
    bump(state, 3);
    lockerLog(state, "\u{1F4E3}", `${name(leaderCap)} called out the team after practice`, 3, leaderCap.id);
  } else if ((team.chem ?? CHEM_NEUTRAL) >= 50 && rng.chance(0.1)) {
    const ps = teamPlayers(state, team.id);
    const host = rng.weighted(ps, ps.map((p) => p.traits.includes("leader") || p.traits.includes("glue") ? 3 : p.traits.includes("influencer") ? 2 : 1));
    const what = rng.pick(["a team bowling night", "a Madden tournament", "dinner at his family\u2019s place", "a karaoke night", "a pickup game against the football team", "a team trip to the movies"]);
    bump(state, 2);
    lockerLog(state, "\u{1F3B3}", `${name(host)} organized ${what}`, 2, host.id);
  }
  if (L.lastEventWeek != null && week - L.lastEventWeek < 2) return;
  if (state.inbox.filter((i) => !i.resolved).length >= 4) return;
  if (st <= -3 && (L.lastMeetingWeek == null || week - L.lastMeetingWeek >= 4)) {
    const ev = meeting(state, team, caps, -st);
    state.inbox.unshift(ev);
    L.lastEventWeek = week;
    L.lastMeetingWeek = week;
    return;
  }
  if (!rng.chance(0.65)) return;
  const cool = L.cool ??= {};
  for (let i = 0; i < 4; i++) {
    const gi = rng.weighted(GENS.map((_, j) => j), GENS.map((x) => x.w));
    const ev = GENS[gi].gen(state, L, team, week);
    if (!ev) continue;
    const key = `${gi}:${ev.personId ?? ""}`;
    if ((cool[key] ?? -99) > week || (cool[`g${gi}`] ?? -99) > week) continue;
    cool[key] = week + 8;
    cool[`g${gi}`] = week + 6;
    state.inbox.unshift(ev);
    L.lastEventWeek = week;
    return;
  }
}
function meeting(state, team, caps, losses) {
  const capAvg = caps.length ? caps.reduce((s, p) => s + captainScore(p, team.id), 0) / caps.length : -1;
  const okCaps = caps.length > 0 && rng.chance(clamp(0.3 + capAvg * 0.09, 0.12, 0.88));
  const coach = state.coaches[state.user.coachId];
  const okCoach = rng.chance(clamp(0.35 + (coach?.skills.motivation ?? 5) * 0.05, 0.2, 0.9));
  const capNames = caps.map((p) => p.last).join(" and ");
  return item(state, {
    subject: `${losses} straight losses: time for a meeting?`,
    body: `The bus ride home was silent. Your staff thinks the team needs to clear the air before this gets worse.${caps.length ? ` Your captains are ${caps.map(name).join(" and ")}.` : " You haven\u2019t named captains."}`,
    choices: [
      { label: "Let the captains hold a players-only meeting", hint: caps.length ? `Depends on ${capNames}` : "Nobody to lead it", effects: okCaps ? [{ kind: "chem", delta: 7 }, { kind: "morale", target: "team", delta: 3 }] : [{ kind: "chem", delta: -4 }, { kind: "morale", target: "team", delta: -2 }], result: okCaps ? `${caps[0].last} stood up and said what needed saying. Players walked out of that room together.` : caps.length ? `It turned into a shouting match. ${capNames} lost the room.` : "With nobody leading it, it turned into a gripe session." },
      { label: "Run the meeting yourself", hint: "Depends on your motivation skill", effects: okCoach ? [{ kind: "chem", delta: 4 }, { kind: "morale", target: "team", delta: 2 }] : [{ kind: "chem", delta: -1 }], result: okCoach ? "You kept it short and honest. They bought in." : "They heard you. Whether they listened is another question." },
      { label: "Cancel practice: team bowling night (6 hours)", hint: "Costs recruiting hours; a sure lift", effects: [{ kind: "hours", delta: -6 }, { kind: "chem", delta: 3 }, { kind: "morale", target: "team", delta: 4 }], result: "Your walk-on bowled a 212. Nobody has stopped talking about it." }
    ]
  });
}
function seniorNight(state, g) {
  const uid = state.user.teamId;
  if (g.home !== uid || g.neutral || g.type !== "conf" && g.type !== "nc") return;
  const L = locker(state);
  if (L.seniorNight === state.season) return;
  if (state.schedule.some((x) => !x.played && x.home === uid && !x.neutral && (x.type === "conf" || x.type === "nc"))) return;
  L.seniorNight = state.season;
  const seniors = teamPlayers(state, uid).filter(isSenior);
  if (!seniors.length) return;
  for (const p of seniors) p.morale = clamp(p.morale + 6, 0, 100);
  bump(state, 3);
  const team = state.teams[uid];
  const names = seniors.map(name);
  lockerLog(state, "\u{1F339}", `Senior Night: ${names.join(", ")} took their last bow at ${team.arena}`, 3);
  addNews(state, { kind: "feature", headline: `${team.school} honors ${seniors.length} senior${seniors.length > 1 ? "s" : ""} on Senior Night`, body: `${names.join(", ")} ${seniors.length > 1 ? "were" : "was"} honored before tipoff at ${team.arena}.`, teams: [uid] });
  state.user.moments.push({ kind: "seniorNight", teamId: uid, players: seniors.map((p) => p.id), oppId: g.away });
}
function portalLockerMul(state, p, team) {
  let m = portalChemMul(team.chem);
  if (isHuman(state, team.id) && asTeam(state, team.id, () => state.locker?.teamId === team.id && state.locker.captains.includes(p.id))) m *= 0.7;
  return m;
}
function doorOpen(state, playerId) {
  const t = state.players[playerId]?.teamId;
  if (!t || !isHuman(state, t)) return false;
  return asTeam(state, t, () => !!state.locker && state.locker.teamId === t && state.locker.doorOpen.includes(playerId));
}

// src/engine/team.ts
var ROSTER_MAX = 15;
var ROSTER_MIN = 12;
function emptyRecord() {
  return { w: 0, l: 0, cw: 0, cl: 0, hw: 0, hl: 0, aw: 0, al: 0, nw: 0, nl: 0, streak: 0, pf: 0, pa: 0, poss: 0, q1w: 0, q1l: 0 };
}
function teamPlayers(state, teamId) {
  const t = state.teams[teamId];
  if (!t) return [];
  return t.roster.map((id) => state.players[id]).filter(Boolean);
}
function refreshPower(state, team) {
  const ps = teamPlayers(state, team.id);
  const coach = state.coaches[team.coachId];
  team.power = Math.round((teamOvr(ps) + (coach ? (coach.skills.tactics - 5) * 0.25 : 0)) * 10) / 10;
  return team.power;
}
function confTierOf(state, team) {
  return state.conferences.find((c) => c.id === team.conf)?.tier ?? 3;
}
function nilBudgetFor(team, conf2, hype = 50) {
  const tierMul = conf2 ? [0, 1.6, 1, 0.6, 0.4][conf2.tier] : 0.6;
  let b = 2e4 * Math.exp(team.prestige * 0.065) * (0.6 + team.market * 0.08) * tierMul;
  b *= 0.85 + hype / 333;
  return Math.round(b / 25e3) * 25e3 || 15e3;
}
function autoStrategy(players, coach) {
  const pick = chooseSchemes(players, coach?.id, () => rng.range(0, 1));
  const fast = pick.offense === "pace" || pick.defense === "press" || pick.defense === "zone131";
  const slow = pick.offense === "princeton" || pick.offense === "post" && pick.defense === "packline";
  const tempo = fast ? rng.int(4, 5) : slow ? rng.int(2, 3) : rng.int(2, 4);
  const deep = pick.defense === "press" || pick.defense === "pressure" || pick.offense === "pace";
  return { ...pick, tempo, starters: [], rotation: deep ? 10 : 9 };
}
function assignNumbers(state, team) {
  const used = /* @__PURE__ */ new Set();
  const ps = teamPlayers(state, team.id);
  for (const p of ps) if (p.num > 0 && !used.has(p.num)) used.add(p.num);
  else p.num = 0;
  for (const n of retiredNumbers(state, team.id)) used.add(n);
  const pool = [0, 1, 2, 3, 4, 5, 10, 11, 12, 13, 14, 15, 20, 21, 22, 23, 24, 25, 30, 31, 32, 33, 34, 35, 40, 41, 42, 43, 44, 45, 50, 51, 52, 55, 3, 7, 8, 9];
  for (const p of ps) {
    if (p.num > 0) continue;
    const opts = pool.filter((n) => n > 0 && !used.has(n));
    p.num = opts.length ? rng.pick(opts) : rng.int(1, 99);
    used.add(p.num);
  }
}
function simSetup(state, team) {
  const coach = state.coaches[team.coachId];
  const players = teamPlayers(state, team.id).filter((p) => !p.injury && !p.redshirting);
  const base = {
    id: team.id,
    abbr: team.abbr,
    name: team.school,
    players,
    strategy: team.strategy,
    coachTactics: coach ? coach.skills.tactics : 5,
    coachMotivation: coach ? coach.skills.motivation : 5,
    chem: chemEdge(team.chem)
  };
  if (team.id !== state.user.teamId) return isHuman(state, team.id) ? asTeam(state, team.id, () => simSetup(state, team)) : base;
  const pb = playbookState(state);
  base.fam = { off: pb.off, def: pb.def };
  const pm = practiceMods(state);
  if (!state.staff) return { ...base, coachTactics: base.coachTactics + pm.tactics, staminaMul: pm.stamina };
  const e = staffEffects(state);
  return { ...base, coachTactics: base.coachTactics + e.tactics + pm.tactics, coachMotivation: base.coachMotivation + e.motivation, defBonus: e.defense, pressure: e.pressure, staminaMul: e.stamina * pm.stamina };
}
function updateHype(team, won, big) {
  const d = won ? big ? 4 : 1.2 : big ? -3 : -1.5;
  team.hype = clamp(team.hype + d, 5, 100);
}

// src/data/rivalries.ts
var RIVALRIES = [
  // ---- ACC ----
  { a: "duke", b: "north-carolina", name: "Tobacco Road", heat: 3 },
  { a: "north-carolina", b: "nc-state", heat: 2 },
  { a: "duke", b: "nc-state", heat: 2 },
  { a: "virginia", b: "virginia-tech", name: "Commonwealth Clash", heat: 2 },
  { a: "california", b: "stanford", heat: 2 },
  { a: "clemson", b: "south-carolina", heat: 1 },
  { a: "georgia-tech", b: "georgia", heat: 1 },
  { a: "florida-state", b: "florida", heat: 1 },
  { a: "pittsburgh", b: "west-virginia", name: "Backyard Brawl", heat: 2 },
  // ---- SEC ----
  { a: "kentucky", b: "louisville", name: "Battle of the Bluegrass", heat: 3 },
  { a: "kentucky", b: "tennessee", heat: 2 },
  { a: "kentucky", b: "florida", heat: 2 },
  { a: "alabama", b: "auburn", heat: 2 },
  { a: "ole-miss", b: "mississippi-state", heat: 2 },
  { a: "texas", b: "texas-am", name: "Lone Star Showdown", heat: 2 },
  { a: "texas", b: "oklahoma", name: "Red River Rivalry", heat: 2 },
  { a: "tennessee", b: "vanderbilt", heat: 1 },
  { a: "illinois", b: "missouri", name: "Braggin' Rights", heat: 3 },
  // ---- Big Ten ----
  { a: "indiana", b: "purdue", heat: 3 },
  { a: "michigan", b: "michigan-state", heat: 3 },
  { a: "michigan", b: "ohio-state", heat: 2 },
  { a: "indiana", b: "kentucky", heat: 2 },
  { a: "wisconsin", b: "marquette", name: "I-94 Rivalry", heat: 2 },
  { a: "iowa", b: "iowa-state", name: "Cy-Hawk Series", heat: 2 },
  { a: "ucla", b: "usc", name: "Crosstown Rivalry", heat: 2 },
  { a: "oregon", b: "oregon-state", heat: 2 },
  { a: "washington", b: "washington-state", heat: 2 },
  { a: "rutgers", b: "seton-hall", name: "Garden State Hardwood Classic", heat: 2 },
  // ---- Big 12 ----
  { a: "kansas", b: "missouri", name: "Border War", heat: 3 },
  { a: "kansas", b: "kansas-state", name: "Sunflower Showdown", heat: 2 },
  { a: "arizona", b: "arizona-state", name: "Duel in the Desert", heat: 2 },
  { a: "byu", b: "utah", name: "Holy War", heat: 3 },
  { a: "oklahoma", b: "oklahoma-state", name: "Bedlam", heat: 2 },
  { a: "colorado", b: "colorado-state", name: "Rocky Mountain Showdown", heat: 2 },
  { a: "baylor", b: "tcu", heat: 1 },
  { a: "arizona", b: "ucla", heat: 2 },
  { a: "ucf", b: "south-florida", heat: 1 },
  // ---- Big East ----
  { a: "villanova", b: "saint-josephs", name: "Holy War", heat: 3 },
  { a: "cincinnati", b: "xavier", name: "Crosstown Shootout", heat: 3 },
  { a: "georgetown", b: "syracuse", heat: 3 },
  { a: "uconn", b: "syracuse", heat: 2 },
  { a: "uconn", b: "villanova", heat: 2 },
  { a: "uconn", b: "st-johns", heat: 2 },
  { a: "villanova", b: "georgetown", heat: 2 },
  { a: "st-johns", b: "georgetown", heat: 2 },
  { a: "providence", b: "rhode-island", heat: 2 },
  { a: "villanova", b: "penn", heat: 1 },
  // ---- Mid-majors: A-10 / AAC / Philly Big 5 ----
  { a: "vcu", b: "richmond", name: "Capital City Classic", heat: 3 },
  { a: "vcu", b: "old-dominion", heat: 2 },
  { a: "dayton", b: "xavier", heat: 2 },
  { a: "dayton", b: "vcu", heat: 2 },
  { a: "george-mason", b: "george-washington", name: "Revolutionary Rivalry", heat: 2 },
  { a: "saint-josephs", b: "temple", heat: 2 },
  { a: "saint-josephs", b: "la-salle", heat: 2 },
  { a: "louisville", b: "memphis", heat: 2 },
  { a: "tulsa", b: "oral-roberts", name: "Mayor's Cup", heat: 2 },
  // ---- West: Pac-12 / MWC / WCC / Big West ----
  { a: "gonzaga", b: "saint-marys", heat: 2 },
  { a: "new-mexico", b: "new-mexico-state", name: "Rio Grande Rivalry", heat: 3 },
  { a: "new-mexico", b: "unlv", heat: 2 },
  { a: "unlv", b: "nevada", name: "Battle for Nevada", heat: 2 },
  { a: "utep", b: "new-mexico-state", name: "Battle of I-10", heat: 2 },
  { a: "san-francisco", b: "santa-clara", heat: 1 },
  { a: "loyola-marymount", b: "pepperdine", heat: 1 },
  { a: "uc-irvine", b: "long-beach-state", name: "Black and Blue Rivalry", heat: 2 },
  { a: "uc-santa-barbara", b: "cal-poly", name: "Blue-Green Rivalry", heat: 2 },
  { a: "montana", b: "montana-state", name: "Brawl of the Wild", heat: 2 },
  // ---- Midwest mid-majors ----
  { a: "north-dakota", b: "north-dakota-state", heat: 2 },
  { a: "south-dakota", b: "south-dakota-state", name: "South Dakota Showdown", heat: 2 },
  { a: "bradley", b: "illinois-state", heat: 2 },
  { a: "belmont", b: "lipscomb", name: "Battle of the Boulevard", heat: 3 },
  { a: "belmont", b: "murray-state", heat: 2 },
  { a: "milwaukee", b: "green-bay", heat: 2 },
  { a: "detroit-mercy", b: "oakland", heat: 2 },
  { a: "akron", b: "kent-state", heat: 3 },
  { a: "ohio", b: "miami-oh", name: "Battle of the Bricks", heat: 2 },
  { a: "toledo", b: "bowling-green", name: "Battle of I-75", heat: 2 },
  { a: "central-michigan", b: "western-michigan", heat: 2 },
  // ---- South / Southeast mid-majors ----
  { a: "western-kentucky", b: "middle-tennessee", name: "100 Miles of Hate", heat: 2 },
  { a: "georgia-state", b: "georgia-southern", name: "Modern Day Hate", heat: 2 },
  { a: "james-madison", b: "old-dominion", name: "Royal Rivalry", heat: 2 },
  { a: "louisiana", b: "ul-monroe", heat: 2 },
  { a: "mcneese", b: "lamar", heat: 2 },
  { a: "stephen-f-austin", b: "sam-houston", heat: 2 },
  { a: "eastern-kentucky", b: "morehead-state", heat: 1 },
  { a: "jacksonville", b: "north-florida", name: "River City Rumble", heat: 2 },
  { a: "charleston", b: "unc-wilmington", heat: 1 },
  // ---- Northeast / academies ----
  { a: "army", b: "navy", name: "Star Series", heat: 3 },
  { a: "lehigh", b: "lafayette", heat: 2 },
  { a: "harvard", b: "yale", heat: 2 },
  { a: "penn", b: "princeton", heat: 2 },
  { a: "iona", b: "manhattan", heat: 2 },
  // ---- HBCU classics ----
  { a: "grambling", b: "southern", heat: 2 },
  { a: "jackson-state", b: "alcorn-state", heat: 2 },
  { a: "alabama-am", b: "alabama-state", heat: 2 },
  { a: "florida-am", b: "bethune-cookman", heat: 2 },
  { a: "texas-southern", b: "prairie-view-am", heat: 2 },
  { a: "norfolk-state", b: "hampton", name: "Battle of the Bay", heat: 2 },
  { a: "nc-at", b: "north-carolina-central", heat: 2 },
  { a: "howard", b: "hampton", name: "The Real HU", heat: 2 }
];

// src/engine/rivalry.ts
var BORN_AT = 40;
var FADE_AT = 20;
var TROPHY_AT = 72;
var IN_SEASON2 = ["preseason", "regular", "confTourney", "selection", "ncaa"];
var HEAT = [
  { min: 80, label: "Blood Feud", flames: 4, cls: "bad" },
  { min: 60, label: "Bitter", flames: 3, cls: "accent" },
  { min: 40, label: "Heated", flames: 2, cls: "gold" },
  { min: -Infinity, label: "Lukewarm", flames: 1, cls: "" }
];
var heatInfo = (h2) => HEAT.find((x) => h2 >= x.min);
var TROPHIES = [
  "The Crosstown Cowbell",
  "The Old Bleacher",
  "The Brass Buzzer",
  "The Granite Ball",
  "The Hometown Hoop",
  "The Chipped Mug",
  "The Silver Spike",
  "The Mascot Head",
  "The Ref\u2019s Whistle",
  "The Bronze Sneaker",
  "The Oak Plank",
  "The Golden Gavel",
  "The Iron Hoop",
  "The Brass Whistle",
  "The Golden Net",
  "The Old Leather Ball",
  "The Copper Kettle",
  "The Hardwood Bell",
  "The Bronze Backboard",
  "The Silver Sneaker",
  "The Painted Rim",
  "The Bragging Rights Belt",
  "The Old Scoreboard",
  "The Lucky Penny",
  "The Rusty Whistle",
  "The Shot Clock",
  "The Golden Ladder",
  "The Heritage Cup",
  "The Border Lantern",
  "The Pewter Pitcher",
  "The Hall Pass",
  "The Silver Clipboard",
  "The Iron Kettle",
  "The Old Floorboard",
  "The Twine Trophy",
  "The Courtside Crown"
];
var STATES = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "the District"
};
function hash4(s) {
  let h2 = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h2 ^= s.charCodeAt(i);
    h2 = Math.imul(h2, 16777619);
  }
  return h2 >>> 0;
}
var pairKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
var other = (r, id) => r.a === id ? r.b : r.a;
function rivalryBook(state) {
  if (state.rivals) return state.rivals;
  const book2 = { pairs: {}, since: state.season };
  state.rivals = book2;
  for (const rv of RIVALRIES) {
    const a = state.teams[rv.a], b = state.teams[rv.b];
    if (!a || !b) continue;
    const key = pairKey(a.id, b.id);
    if (book2.pairs[key]) continue;
    const base = rv.heat ?? 1;
    const floor = 30 + base * 15;
    book2.pairs[key] = {
      key,
      a: a.id,
      b: b.id,
      name: rv.name ?? `${a.school}\u2013${b.school}`,
      origin: "historic",
      since: state.season,
      heat: floor + 5,
      floor,
      active: true,
      series: {},
      meetings: [],
      total: 0,
      heatLog: []
    };
    if (base >= 3 || a.id === state.user.teamId || b.id === state.user.teamId) giveTrophy(book2, book2.pairs[key]);
  }
  if (IN_SEASON2.includes(state.phase)) {
    for (const g of state.schedule.filter((x) => x.played && x.hs != null).sort((x, y) => x.day - y.day)) {
      const r = book2.pairs[pairKey(g.home, g.away)];
      if (r) record(state, r, g);
    }
  }
  return book2;
}
function giveTrophy(book2, r) {
  if (r.trophy) return;
  const used = new Set(Object.values(book2.pairs).map((x) => x.trophy).filter(Boolean));
  const start = hash4(r.key) % TROPHIES.length;
  for (let i = 0; i < TROPHIES.length; i++) {
    const t = TROPHIES[(start + i) % TROPHIES.length];
    if (!used.has(t)) {
      r.trophy = t;
      return;
    }
  }
  const ADJ = ["Old", "Golden", "Iron", "Silver", "Bronze", "Painted", "Rusty", "Copper", "Brass", "Pewter", "Oak", "Granite"];
  const OBJ = ["Bucket", "Bell", "Whistle", "Net", "Ladder", "Lantern", "Clipboard", "Sneaker", "Ball", "Rim", "Kettle", "Scoreboard", "Horn", "Stool"];
  for (let i = 0; i < ADJ.length * OBJ.length; i++) {
    const k = (start + i * 7) % (ADJ.length * OBJ.length);
    const t = `The ${ADJ[k % ADJ.length]} ${OBJ[Math.floor(k / ADJ.length)]}`;
    if (!used.has(t)) {
      r.trophy = t;
      return;
    }
  }
  r.trophy = `The ${r.name.replace(/^The /, "")} Cup`;
}
function rivalryOf(state, a, b) {
  const r = state.rivals?.pairs[pairKey(a, b)];
  if (r?.active) return r;
  if (!state.rivals) {
    const rv = RIVALRIES.find((x) => x.a === a && x.b === b || x.a === b && x.b === a);
    if (rv) return { key: pairKey(a, b), a, b, name: rv.name ?? "Rivalry", origin: "historic", since: state.season, heat: 30 + (rv.heat ?? 1) * 15, floor: 0, active: true, series: {}, meetings: [], total: 0, heatLog: [] };
  }
  return void 0;
}
function rivalriesOf(state, teamId, includeSimmering = false) {
  return Object.values(rivalryBook(state).pairs).filter((r) => (r.a === teamId || r.b === teamId) && (r.active || includeSimmering && !r.faded && r.heat >= 12)).sort((x, y) => y.heat - x.heat);
}
function rivalCrowd(state, a, b) {
  const r = rivalryOf(state, a, b);
  return r ? 0.1 + r.heat / 100 * 0.25 : 0;
}
function seriesFor(r, teamId) {
  return [r.series[teamId] ?? 0, r.series[other(r, teamId)] ?? 0];
}
function makePair(state, a, b) {
  const book2 = rivalryBook(state);
  const key = pairKey(a, b);
  return book2.pairs[key] ??= { key, a: key.split("|")[0], b: key.split("|")[1], name: "", origin: "born", since: state.season, heat: 0, floor: 0, active: false, series: {}, meetings: [], total: 0, heatLog: [] };
}
function bornName(state, r, kind, detail) {
  const A2 = state.teams[r.a], B = state.teams[r.b];
  const taken = new Set(Object.values(state.rivals?.pairs ?? {}).filter((x) => x.active).map((x) => x.name));
  const h2 = hash4(r.key);
  const opts = [];
  if (kind === "coach" && detail) opts.push(`The ${detail} Bowl`, `The ${detail} Grudge Match`);
  if (A2.state === B.state && STATES[A2.state]) opts.push(`The Battle for ${STATES[A2.state]}`, `The ${STATES[A2.state]} Showdown`);
  if (kind === "ncaa") opts.push(`The March Grudge`, `The Bracket Feud`);
  opts.push(`The ${A2.mascot}\u2013${B.mascot} Feud`, `The ${A2.city}\u2013${B.city} Series`);
  const free = opts.filter((o) => !taken.has(o));
  return free.length ? free[h2 % Math.min(free.length, 2)] : `${A2.school}\u2013${B.school}`;
}
function addHeat(state, a, b, amount, why) {
  if (!state.teams[a] || !state.teams[b] || a === b || amount <= 0) return;
  const r = makePair(state, a, b);
  r.heat = clamp(r.heat + amount, 0, 100);
  if (!r.active && r.heat >= BORN_AT) {
    r.active = true;
    r.faded = false;
    r.since = state.season;
    r.reason = why.text;
    r.name = r.name && r.origin === "historic" ? r.name : bornName(state, r, why.kind, why.detail);
    const A2 = state.teams[r.a], B = state.teams[r.b];
    const user2 = r.a === state.user.teamId || r.b === state.user.teamId;
    addNews(state, {
      kind: "feature",
      headline: `A rivalry is born: ${r.name}`,
      body: `${A2.school} and ${B.school} have a new rivalry on their hands. ${why.text} Fans on both sides have noticed.`,
      teams: [r.a, r.b],
      important: user2
    });
  }
  if (r.active && r.heat >= TROPHY_AT && !r.trophy) {
    giveTrophy(rivalryBook(state), r);
    if (r.a === state.user.teamId || r.b === state.user.teamId) addNews(state, { kind: "feature", headline: `${r.name} gets a trophy: ${r.trophy}`, body: `Student governments at ${state.teams[r.a].school} and ${state.teams[r.b].school} commissioned ${r.trophy}. It goes to the winner of every meeting.`, teams: [r.a, r.b], important: true });
  }
}
function record(state, r, g) {
  const homeWon = (g.hs ?? 0) > (g.as ?? 0);
  const w = homeWon ? g.home : g.away;
  const ws = Math.max(g.hs ?? 0, g.as ?? 0), ls = Math.min(g.hs ?? 0, g.as ?? 0);
  if (r.meetings.some((m) => m.s === state.season && m.d === g.day)) return null;
  const prevStreak = r.streak ? { ...r.streak } : void 0;
  r.series[w] = (r.series[w] ?? 0) + 1;
  r.total++;
  r.streak = r.streak?.t === w ? { t: w, n: r.streak.n + 1 } : { t: w, n: 1 };
  r.meetings.push({ s: state.season, d: g.day, w, ws, ls, t: g.type, ...g.ot ? { ot: true } : {}, ...g.event ? { ev: g.event } : {} });
  const keep = r.active || r.faded ? 14 : 4;
  if (r.meetings.length > keep) r.meetings.splice(0, r.meetings.length - keep);
  if (!r.big || ws - ls > r.big.m) r.big = { m: ws - ls, w, s: state.season };
  return { w, ws, ls, prevStreak };
}
function rivalryResult(state, g, preRankHome, preRankAway) {
  if (g.type === "exh" || g.hs == null || g.as == null) return;
  const book2 = rivalryBook(state);
  const key = pairKey(g.home, g.away);
  const uid = state.user.teamId;
  const userGame = g.home === uid || g.away === uid;
  const homeWon = g.hs > g.as;
  const margin = Math.abs(g.hs - g.as);
  const close = margin <= 3 || !!g.ot;
  const wRank = homeWon ? preRankHome : preRankAway, lRank = homeWon ? preRankAway : preRankHome;
  const bothRanked = !!preRankHome && !!preRankAway;
  const upset = !!lRank && (!wRank || wRank - lRank >= 10);
  const seeds = state.ncaa?.seeds;
  const wId = homeWon ? g.home : g.away, lId = homeWon ? g.away : g.home;
  const seedUpset = g.type === "ncaa" && seeds && seeds[wId] != null && seeds[lId] != null && seeds[wId] - seeds[lId] >= 4;
  const late = g.type === "ncaa" && /Final Four|Championship/i.test(g.event ?? "");
  let r = book2.pairs[key];
  if (r?.active) {
    const res = record(state, r, g);
    if (!res) return;
    let d = 1;
    if (close) d += 3;
    if (bothRanked) d += 4;
    else if (upset) d += 5;
    if (g.type === "ncaa") d += 12 + (late ? 6 : 0);
    else if (g.type === "ctourn") d += 5;
    if (res.prevStreak && res.prevStreak.n >= 3 && res.prevStreak.t !== res.w) d += 5;
    if (r.streak && r.streak.n >= 5) d -= 4;
    if (margin >= 25) d -= 3;
    r.heat = clamp(r.heat + d, 0, 100);
    if ((r.heat >= TROPHY_AT || userGame) && !r.trophy) giveTrophy(book2, r);
    const prevHolder = r.holder;
    if (r.trophy) r.holder = res.w;
    if (userGame) userRivalryEffects(state, r, res.w === uid, prevHolder, res.prevStreak);
    else if (r.trophy && prevHolder && prevHolder !== res.w && r.heat >= 70) {
      addNews(state, { kind: "feature", headline: `${state.teams[res.w].school} takes back ${r.trophy}`, body: `${state.teams[res.w].school} beat ${state.teams[other(r, res.w)].school} ${res.ws}-${res.ls}${r.name ? ` in ${r.name}` : ""} to reclaim ${r.trophy}.`, teams: [r.a, r.b] });
    }
    return;
  }
  let inc = 0;
  let kind = "game";
  let text = "";
  const A2 = state.teams[g.home], B = state.teams[g.away];
  if (g.type === "ncaa") {
    inc += 16 + (seedUpset ? 10 : 0) + (close ? 6 : 0) + (late ? 8 : 0);
    kind = "ncaa";
    text = `It started in March: ${state.teams[wId].school} beat ${state.teams[lId].school} ${Math.max(g.hs, g.as)}-${Math.min(g.hs, g.as)} in the NCAA Tournament${seedUpset ? ", a stunning upset" : ""}.`;
  } else if (g.type === "ctourn") {
    inc += 6 + (close ? 4 : 0) + (bothRanked ? 4 : 0) + (/Championship|Final/i.test(g.event ?? "") ? 4 : 0);
    text = `Their conference tournament meetings have gotten nasty.`;
  } else if (g.type === "conf") {
    if (bothRanked) inc += 7;
    if (close && (preRankHome || preRankAway)) inc += 4;
    text = `Year after year, their conference games have decided the league.`;
  }
  if (userGame) {
    if (g.type === "conf") inc += 3;
    if (close) inc += 5;
    if (lRank || wRank) inc += 2;
    text ||= `Every game between ${A2.school} and ${B.school} seems to come down to the wire.`;
  }
  if (inc < 4 && !r) return;
  if (!inc) {
    if (r) record(state, r, g);
    return;
  }
  r = makePair(state, g.home, g.away);
  record(state, r, g);
  addHeat(state, g.home, g.away, inc, { kind, text });
}
function userRivalryEffects(state, r, won, prevHolder, prevStreak) {
  const uid = state.user.teamId;
  const me = state.teams[uid], opp = state.teams[other(r, uid)];
  const coach = state.coaches[state.user.coachId];
  const weight = r.heat / 100;
  me.hype = clamp(me.hype + (won ? 3 + weight * 5 : -(2 + weight * 3)), 0, 100);
  if (coach) coach.jobSecurity = clamp(coach.jobSecurity + (won ? 1 + weight * 1.5 : -(0.5 + weight * 1.5)), 0, 100);
  for (const pid of me.roster) {
    const p = state.players[pid];
    if (p) p.morale = clamp(p.morale + (won ? 2 : -2) * (0.5 + weight), 0, 100);
  }
  const [w, l] = seriesFor(r, uid);
  const snapped = won && prevStreak && prevStreak.t !== uid && prevStreak.n >= 3;
  const reclaimed = won && r.trophy && prevHolder && prevHolder !== uid;
  if (!won && r.streak && r.streak.t !== uid && r.streak.n >= 3 && coach) coach.jobSecurity = clamp(coach.jobSecurity - 1.5, 0, 100);
  if (reclaimed || snapped || won && r.heat >= 80 && rng.chance(0.5)) {
    state.user.moments.push({
      kind: "rivalry",
      key: r.key,
      teamId: uid,
      oppId: opp.id,
      label: reclaimed ? `${r.trophy} is coming home` : snapped ? `Streak snapped` : `${r.name} belongs to ${me.school}`,
      sub: `${me.school} beats ${opp.school}${snapped ? `, ending a ${prevStreak.n}-game losing streak in the series` : ""}. Series since ${r.since}: ${w}-${l}.`,
      ...r.trophy ? { trophy: r.trophy } : {}
    });
  }
}
function rivalryCoachMove(state, fromId, toId, last, isUser2) {
  if (!isUser2 && Math.max(state.teams[fromId]?.prestige ?? 0, state.teams[toId]?.prestige ?? 0) < 55) return;
  addHeat(state, fromId, toId, isUser2 ? 55 : 30, { kind: "coach", detail: last, text: `Coach ${last} left ${state.teams[fromId]?.school} for ${state.teams[toId]?.school}, and ${state.teams[fromId]?.school} fans haven't forgiven him.` });
}
function rivalryTransfer(state, fromId, toId, name2, userInvolved) {
  addHeat(state, fromId, toId, userInvolved ? 14 : 10, { kind: "portal", text: `${name2} transferred from ${state.teams[fromId]?.school} to ${state.teams[toId]?.school}.` });
}
function rivalryRecruit(state, winnerId, name2, stars) {
  addHeat(state, state.user.teamId, winnerId, stars >= 5 ? 9 : 6, { kind: "recruiting", text: `${state.teams[winnerId]?.school} beat ${state.teams[state.user.teamId]?.school} for ${name2}, and the recruiting wars have turned personal.` });
}
function rivalrySeasonEnd(state) {
  const book2 = rivalryBook(state);
  const uid = state.user.teamId;
  for (const [key, r] of Object.entries(book2.pairs)) {
    if (r.active || r.faded) {
      r.heatLog.push([state.season, Math.round(r.heat)]);
      if (r.heatLog.length > 30) r.heatLog.shift();
    }
    if (r.active && r.origin === "historic") r.heat = r.heat + (r.floor - r.heat) * 0.35;
    else if (r.active) {
      const met = r.meetings.some((m) => m.s === state.season);
      r.heat = r.heat * (met ? 0.88 : 0.75) - 3;
      if (r.heat < FADE_AT) {
        r.active = false;
        r.faded = true;
        if (r.a === uid || r.b === uid) addNews(state, { kind: "feature", headline: `${r.name} has cooled off`, body: `${state.teams[r.a].school} and ${state.teams[r.b].school} haven't given fans much to fight about lately.`, teams: [r.a, r.b] });
      }
    } else {
      r.heat *= 0.7;
      if (r.heat < 10 && !r.faded) delete book2.pairs[key];
    }
  }
}
function rivalryWeek(state) {
  const book2 = rivalryBook(state);
  const wk = state.calendar[state.day]?.week ?? 0;
  if (book2.weekNews === wk + state.season * 100) return;
  const games = state.schedule.filter((g) => !g.played && state.calendar[g.day]?.week === wk);
  const hot = games.map((g) => ({ g, r: rivalryOf(state, g.home, g.away) })).filter((x) => x.r && x.r.heat >= 65).sort((a, b) => b.r.heat - a.r.heat);
  const user2 = hot.find((x) => x.g.home === state.user.teamId || x.g.away === state.user.teamId);
  if (hot.length >= 3 || user2 && user2.r.heat >= 70) {
    book2.weekNews = wk + state.season * 100;
    addNews(state, {
      kind: "feature",
      headline: `Rivalry Week: ${hot.slice(0, 3).map((x) => x.r.name).join(", ")}`,
      body: `Circle these: ${hot.slice(0, 5).map((x) => `${state.teams[x.g.away].school} at ${state.teams[x.g.home].school} (${x.r.name}, ${heatInfo(x.r.heat).label.toLowerCase()})`).join("; ")}.`,
      teams: hot.slice(0, 3).flatMap((x) => [x.g.home, x.g.away]),
      important: !!user2
    });
  }
}
function userRivalryThisWeek(state) {
  const uid = state.user.teamId;
  const wk = state.calendar[state.day]?.week ?? 0;
  for (const g of state.schedule.filter((x) => !x.played && (x.home === uid || x.away === uid) && x.day >= state.day && (state.calendar[x.day]?.week ?? -1) <= wk + 0).sort((a, b) => a.day - b.day)) {
    const r = rivalryOf(state, g.home, g.away);
    if (r) return { g, r };
  }
  return void 0;
}

// src/engine/scheduling.ts
var NONCONF_SLOTS = 12;
var HOME_ADJ2 = 3.2;
var EVENT_POOL = [
  { name: "Maui Shootout", location: "Lahaina, HI", tier: 1 },
  { name: "Paradise Island Classic", location: "Nassau, Bahamas", tier: 1 },
  { name: "Vegas Hardwood Showcase", location: "Las Vegas, NV", tier: 2 },
  { name: "Empire Classic", location: "New York, NY", tier: 2 },
  { name: "Wooden Legacy Classic", location: "Anaheim, CA", tier: 2 },
  { name: "Sunshine Slam", location: "Orlando, FL", tier: 3 },
  { name: "Canc\xFAn Challenge", location: "Canc\xFAn, Mexico", tier: 3 },
  { name: "Charleston Invitational", location: "Charleston, SC", tier: 3 },
  { name: "Myrtle Beach Showcase", location: "Myrtle Beach, SC", tier: 4 },
  { name: "Northern Lights Classic", location: "Anchorage, AK", tier: 4 }
];
var TIER_PRESTIGE = { 1: 80, 2: 64, 3: 45, 4: 25 };
var TIER_MIN = { 1: 62, 2: 45, 3: 22, 4: 0 };
var NEUTRAL_SHOWCASES = ["Holiday Hoops Showcase", "Hall of Fame Series", "Hardwood Classic", "Capital City Clash", "Coast to Coast Challenge", "Rivals Weekend"];
function user(state) {
  return state.teams[state.user.teamId];
}
function userRivalryGames(state, season) {
  const me = user(state);
  const out = [];
  for (const rv of RIVALRIES) {
    if (rv.a !== me.id && rv.b !== me.id) continue;
    const a = state.teams[rv.a], b = state.teams[rv.b];
    if (!a || !b || a.conf === b.conf) continue;
    const homeFirst = (season + (a.id < b.id ? 0 : 1)) % 2 === 0;
    const homeId = homeFirst ? a.id : b.id;
    const oppId = me.id === a.id ? b.id : a.id;
    out.push({ oppId, site: homeId === me.id ? "home" : "away", guarantee: 0, locked: "rivalry", event: rv.name });
  }
  for (const r of rivalriesOf(state, me.id)) {
    if (r.origin !== "born" || r.heat < 55) continue;
    const oppId = r.a === me.id ? r.b : r.a;
    const opp = state.teams[oppId];
    if (!opp || opp.conf === me.conf || out.some((x) => x.oppId === oppId)) continue;
    const homeFirst = (season + (me.id < oppId ? 0 : 1)) % 2 === 0;
    out.push({ oppId, site: homeFirst ? "home" : "away", guarantee: 0, locked: "rivalry", event: r.name });
  }
  return out;
}
function openScheduling(state) {
  state.phase = "scheduling";
  const next = state.season + 1;
  const prevOblig = state.scheduling?.obligations ?? [];
  const teams = Object.values(state.teams);
  for (const t of teams) refreshPower(state, t);
  const mean = teams.reduce((s, t) => s + t.power, 0) / teams.length;
  const proj = {};
  for (const t of teams) proj[t.id] = Math.round(powerToPoints(t.power, mean) * 10) / 10;
  const projRank = {};
  [...teams].sort((a, b) => proj[b.id] - proj[a.id]).forEach((t, i) => projRank[t.id] = i + 1);
  const me = user(state);
  const games = [];
  for (const rg of userRivalryGames(state, next)) games.push(rg);
  for (const o of prevOblig.filter((x) => x.season === next)) {
    if (!state.teams[o.oppId] || games.some((x) => x.oppId === o.oppId)) continue;
    games.push({ oppId: o.oppId, site: o.site, guarantee: 0, locked: "return", event: "Home-and-home series" });
  }
  state.scheduling = {
    season: next,
    mtes: genEvents(state, games.map((x) => x.oppId)),
    mte: void 0,
    games,
    droppedRivals: [],
    proj,
    projRank,
    obligations: prevOblig.filter((x) => x.season > state.season),
    locked: false
  };
}
function genEvents(state, exclude) {
  const me = user(state);
  const used = /* @__PURE__ */ new Set([me.id, ...exclude]);
  const others = Object.values(state.teams).filter((t) => t.conf !== me.conf);
  const pick = rng.shuffle([...EVENT_POOL]);
  const chosen = [
    ...pick.filter((e) => e.tier <= 2).slice(0, 3),
    ...pick.filter((e) => e.tier >= 3).slice(0, 3)
  ];
  const out = [];
  for (const e of chosen.sort((a, b) => a.tier - b.tier)) {
    const target = TIER_PRESTIGE[e.tier];
    const field = [];
    const cands = rng.shuffle(others.filter((t) => !used.has(t.id) && Math.abs(t.prestige - target) < 14));
    for (const t of cands) {
      if (field.length >= 3) break;
      if (field.some((f) => state.teams[f].conf === t.conf)) continue;
      field.push(t.id);
      used.add(t.id);
    }
    if (field.length === 3) out.push({ name: e.name, location: e.location, tier: e.tier, field, minPrestige: TIER_MIN[e.tier] });
  }
  return out;
}
function slotsUsed(sc2) {
  return sc2.games.length + (sc2.mte ? 2 : 0);
}
function canAttend(state, ev) {
  return user(state).prestige >= ev.minPrestige;
}
function offerStatus(state, oppId, site, series) {
  const me = user(state);
  const opp = state.teams[oppId];
  const sc2 = state.scheduling;
  if (!opp || opp.id === me.id) return { ok: false, label: "Unavailable", guarantee: 0 };
  if (opp.conf === me.conf) return { ok: false, label: "Conference opponent", guarantee: 0 };
  if (sc2 && (sc2.games.some((x) => x.oppId === oppId) || sc2.mte && sc2.mtes.find((m) => m.name === sc2.mte)?.field.includes(oppId))) return { ok: false, label: "Already scheduled", guarantee: 0 };
  const diff = me.prestige - opp.prestige;
  const g = (host) => roundMoney(55e3 + host.prestige * 800);
  if (series) {
    if (site === "neutral") return { ok: false, label: "Series are home-and-home", guarantee: 0 };
    if (Math.abs(diff) <= 25) return { ok: true, label: "Agrees to a home-and-home", guarantee: 0 };
    return { ok: false, label: diff > 0 ? "They\u2019d rather take a payday" : "Won\u2019t commit to a return trip", guarantee: 0 };
  }
  if (site === "home") {
    const strong = (sc2?.projRank[oppId] ?? 999) <= 50 && opp.prestige >= 55;
    if (diff >= 12 && strong) return Math.abs(diff) <= 25 ? { ok: false, label: "Contender \u2014 only as a home-and-home", guarantee: 0, seriesOnly: true } : { ok: false, label: "Contender \u2014 won\u2019t do a one-off road trip", guarantee: 0 };
    if (diff >= 12) return { ok: true, label: `Buy game \xB7 you pay ${fmtMoney(g(me))}`, guarantee: -g(me) };
    if (diff > -25) return { ok: false, label: "Only as a home-and-home", guarantee: 0, seriesOnly: true };
    return { ok: false, label: "Won\u2019t come to your gym", guarantee: 0 };
  }
  if (site === "away") {
    if (diff <= -12) return { ok: true, label: `Payday \xB7 they pay you ${fmtMoney(g(opp))}`, guarantee: g(opp) };
    if (diff >= 25) return { ok: true, label: "Thrilled to host you", guarantee: 0 };
    return { ok: true, label: "Agrees to host", guarantee: 0 };
  }
  if (Math.abs(diff) <= 30) return { ok: true, label: "Agrees to a neutral-site game", guarantee: 0 };
  return { ok: false, label: "Mismatch \u2014 no neutral site wants it", guarantee: 0 };
}
function bookGame(state, oppId, site, series) {
  const sc2 = state.scheduling;
  if (!sc2 || sc2.locked) return { ok: false, msg: "Scheduling is closed." };
  if (slotsUsed(sc2) >= NONCONF_SLOTS) return { ok: false, msg: `Your ${NONCONF_SLOTS} non-conference dates are full.` };
  const st = offerStatus(state, oppId, site, series);
  const opp = state.teams[oppId];
  if (!st.ok) return { ok: false, msg: `${opp?.school ?? "They"}: ${st.label}.` };
  sc2.games.push({ oppId, site, series: series || void 0, guarantee: st.guarantee, event: site === "neutral" ? rng.pick(NEUTRAL_SHOWCASES) : void 0 });
  const where = site === "home" ? "at home" : site === "away" ? "on the road" : "at a neutral site";
  return { ok: true, msg: `Booked: ${opp.school} ${where}${series ? " (home-and-home)" : ""}.` };
}
function autoFill(state) {
  const sc2 = state.scheduling;
  if (!sc2 || sc2.locked) return 0;
  const me = user(state);
  let added = 0;
  if (sc2.mte === void 0) {
    const ok = sc2.mtes.filter((m) => canAttend(state, m)).sort((a, b) => Math.abs(TIER_PRESTIGE[a.tier] - me.prestige) - Math.abs(TIER_PRESTIGE[b.tier] - me.prestige));
    if (ok[0] && slotsUsed(sc2) + 2 <= NONCONF_SLOTS) sc2.mte = ok[0].name;
    else sc2.mte = null;
  }
  const hasGM = !!state.staff?.members.some((m) => m.role === "gm");
  const all = Object.values(state.teams).filter((t) => t.conf !== me.conf && t.id !== me.id);
  const tryBook = (pool, site, series, n) => {
    let k = 0;
    for (const t of rng.shuffle([...pool])) {
      if (k >= n || slotsUsed(sc2) >= NONCONF_SLOTS) break;
      if (offerStatus(state, t.id, site, series).ok) {
        bookGame(state, t.id, site, series);
        k++;
        added++;
      }
    }
  };
  const marquee = sc2.games.filter((x) => (sc2.projRank[x.oppId] ?? 999) <= 40).length;
  const peers = all.filter((t) => Math.abs(t.prestige - me.prestige) <= 15 && (sc2.projRank[t.id] ?? 999) <= Math.max(60, (sc2.projRank[me.id] ?? 100) + 30));
  const wantMarquee = Math.max(0, (hasGM ? 3 : 2) - marquee);
  tryBook(peers, "neutral", false, Math.ceil(wantMarquee / 2));
  tryBook(peers, rng.chance(0.5) ? "home" : "away", true, Math.floor(wantMarquee / 2));
  if (me.prestige < 45) tryBook(all.filter((t) => t.prestige - me.prestige >= 15), "away", false, 2);
  const cupcakes = all.filter((t) => me.prestige - t.prestige >= 12 && (hasGM ? (sc2.projRank[t.id] ?? 0) < 250 : true));
  tryBook(cupcakes, "home", false, NONCONF_SLOTS);
  tryBook(all, "away", false, NONCONF_SLOTS);
  return added;
}
function quadrant(rank, site) {
  const [a, b, c] = site === "home" ? [30, 75, 160] : site === "neutral" ? [50, 100, 200] : [75, 135, 240];
  return rank <= a ? 1 : rank <= b ? 2 : rank <= c ? 3 : 4;
}
function resumeMetrics(state) {
  const sc2 = state.scheduling;
  const me = user(state);
  const myR = sc2.proj[me.id] ?? 0;
  const items = [];
  for (const g of sc2.games) items.push({ r: sc2.proj[g.oppId] ?? 0, rank: sc2.projRank[g.oppId] ?? 200, site: g.site, weight: 1 });
  const ev = sc2.mte ? sc2.mtes.find((m) => m.name === sc2.mte) : void 0;
  if (ev) for (const f of ev.field) items.push({ r: sc2.proj[f] ?? 0, rank: sc2.projRank[f] ?? 200, site: "neutral", weight: 2 / 3 });
  const q2 = [0, 0, 0, 0, 0];
  let exp = 0, wsum = 0, oppSum = 0;
  for (const it of items) {
    const adj = it.site === "home" ? HOME_ADJ2 : it.site === "away" ? -HOME_ADJ2 : 0;
    exp += normCdf((myR - it.r + adj) / 11) * it.weight;
    q2[quadrant(it.rank, it.site)] += it.weight;
    oppSum += (it.r - adj * 0.5) * it.weight;
    wsum += it.weight;
  }
  const avgOpp = wsum ? oppSum / wsum : 0;
  const all = Object.values(sc2.proj).sort((a, b) => a - b);
  const below = all.filter((v2) => v2 < avgOpp).length;
  const sosPct = Math.round(below / Math.max(1, all.length) * 100);
  const sosLabel = sosPct >= 85 ? "Brutal" : sosPct >= 70 ? "Tough" : sosPct >= 50 ? "Solid" : sosPct >= 28 ? "Soft" : "Cupcake";
  const netGuarantee = sc2.games.reduce((s, g) => s + g.guarantee, 0);
  const marqueeHome = sc2.games.filter((g) => g.site === "home" && (sc2.projRank[g.oppId] ?? 999) <= 25).length;
  const contender = (sc2.projRank[me.id] ?? 200) <= 40;
  let hype = Math.min(9, marqueeHome * 3);
  if (sosLabel === "Cupcake") hype -= 3;
  let verdict, tone = "neutral";
  const games = Math.round(wsum);
  if (games < NONCONF_SLOTS) {
    verdict = `${NONCONF_SLOTS - games} open date${NONCONF_SLOTS - games > 1 ? "s" : ""} \u2014 your staff will fill them if you lock now.`;
  } else if (contender && (sosLabel === "Cupcake" || sosLabel === "Soft")) {
    verdict = "Analysts will call this soft. The committee rewards teams that test themselves.";
    tone = "bad";
  } else if (contender && q2[1] >= 3) {
    verdict = "A real gauntlet. Win a couple of these and you\u2019re building a top-seed r\xE9sum\xE9.";
    tone = "good";
  } else if (!contender && sosLabel === "Brutal") {
    verdict = "Bold. You could take some lumps \u2014 but every upset here is a r\xE9sum\xE9 builder.";
    tone = "neutral";
  } else if (!contender && q2[4] >= 6) {
    verdict = "Plenty of winnable games. Expect a good record \u2014 just not much of a r\xE9sum\xE9.";
    tone = "neutral";
  } else {
    verdict = "A balanced slate: some marquee chances and plenty of wins on the table.";
    tone = "good";
  }
  return { games, avgOpp, sosPct, sosLabel, q1: Math.round(q2[1] * 10) / 10, q2: Math.round(q2[2] * 10) / 10, q3: Math.round(q2[3] * 10) / 10, q4: Math.round(q2[4] * 10) / 10, expWins: Math.round(exp * 10) / 10, expLosses: Math.round((wsum - exp) * 10) / 10, netGuarantee, marqueeHome, hype, verdict, verdictTone: tone };
}
function lockScheduling(state) {
  const sc2 = state.scheduling;
  if (!sc2 || sc2.locked) return 0;
  const filled = slotsUsed(sc2) < NONCONF_SLOTS ? autoFill(state) : 0;
  sc2.locked = true;
  for (const g of sc2.games) {
    if (g.series && g.site !== "neutral") sc2.obligations.push({ oppId: g.oppId, site: g.site === "home" ? "away" : "home", season: sc2.season + 1 });
  }
  return filled;
}
function applyScheduleEffects(state) {
  const sc2 = state.scheduling;
  if (!sc2 || sc2.season !== state.season || !sc2.locked) return;
  const me = user(state);
  const m = resumeMetrics(state);
  me.nilBudget = Math.max(0, me.nilBudget + m.netGuarantee);
  me.hype = clamp(me.hype + m.hype, 5, 100);
  const top = sc2.games.map((g) => ({ g, rank: sc2.projRank[g.oppId] ?? 999 })).sort((a, b) => a.rank - b.rank).slice(0, 4).map(({ g }) => `${g.site === "away" ? "at " : g.site === "neutral" ? "vs " : ""}${state.teams[g.oppId].school}`);
  state.news.unshift({
    id: `nsched${state.season}`,
    season: state.season,
    day: state.day,
    date: state.calendar[state.day]?.label ?? "",
    kind: "user",
    headline: `${me.school} unveils ${m.sosLabel.toLowerCase()} non-conference schedule`,
    body: `${me.school}'s slate features ${top.join(", ")}${sc2.mte ? `, plus the ${sc2.mte}` : ""}. Projected: ${m.q1} Quad 1 chances, ~${m.expWins}-${m.expLosses} expected record.${m.netGuarantee ? ` Game guarantees: ${m.netGuarantee > 0 ? "+" : ""}${fmtMoney(m.netGuarantee)} to the NIL pool.` : ""}`,
    teams: [me.id],
    important: true
  });
}
function reservedTeams(state) {
  const sc2 = state.scheduling;
  const out = /* @__PURE__ */ new Set();
  if (!sc2 || sc2.season !== state.season || !sc2.locked) return out;
  out.add(state.user.teamId);
  const ev = sc2.mte ? sc2.mtes.find((m) => m.name === sc2.mte) : void 0;
  if (ev) for (const f of ev.field) out.add(f);
  return out;
}

// src/engine/schedule.ts
var NONCONF_GAMES = 12;
var MIN_TOTAL_GAMES = 26;
var MTE_EVENTS = [
  "Maui Shootout",
  "Paradise Island Classic",
  "Vegas Hardwood Showcase",
  "Empire Classic",
  "Sunshine Slam",
  "Canc\xFAn Challenge",
  "Wooden Legacy Classic",
  "Charleston Invitational",
  "Myrtle Beach Showcase",
  "Cayman Hoops Classic",
  "Fort Myers Tip-Off",
  "Portland Phil Classic",
  "Hall of Fame Invitational",
  "Jersey Mike\u2019s Jamboree",
  "Alaska Northern Lights Classic",
  "Bahamas Breakers Invitational"
];
function confTier(state, t) {
  return state.conferences.find((c) => c.id === t.conf)?.tier ?? 3;
}
function pickTV(state, home, away) {
  const top = Math.max(home.prestige, away.prestige);
  if (top >= 80) return rng.pick(TV_NETWORKS.slice(0, 6));
  if (top >= 55) return rng.pick(TV_NETWORKS.slice(2, 9));
  return rng.pick(["Streaming Exclusive", "Conference Network+", "CourtVision+"]);
}
function generateSchedule(state) {
  confCache.clear();
  const games = [];
  const teams = Object.values(state.teams);
  const byId = state.teams;
  const played = /* @__PURE__ */ new Set();
  const key = (a, b) => a < b ? a + "|" + b : b + "|" + a;
  const homeCount = {};
  const gameCount = {};
  const busy = {};
  for (let d = 1; d <= NONCONF_DAYS + CONF_DAYS; d++) busy[d] = /* @__PURE__ */ new Set();
  for (const t of teams) {
    homeCount[t.id] = 0;
    gameCount[t.id] = 0;
  }
  let gid = 0;
  const add = (day, home, away, type, neutral = false, event) => {
    games.push({ id: `g${state.season}-${gid++}`, day, home, away, neutral, type, event, played: false, tv: pickTV(state, byId[home], byId[away]) });
    busy[day].add(home);
    busy[day].add(away);
    played.add(key(home, away));
    if (!neutral) homeCount[home]++;
    gameCount[home]++;
    gameCount[away]++;
  };
  const confs = state.conferences;
  for (const conf2 of confs) {
    const ids = rng.shuffle(teams.filter((t) => t.conf === conf2.id).map((t) => t.id));
    const n = ids.length;
    if (n < 2) continue;
    const list2 = n % 2 === 1 ? [...ids, "__BYE__"] : [...ids];
    const m = list2.length;
    const roundsA = [];
    const arr = [...list2];
    for (let r = 0; r < m - 1; r++) {
      const round = [];
      for (let i = 0; i < m / 2; i++) {
        const a = arr[i], b = arr[m - 1 - i];
        if (a === "__BYE__" || b === "__BYE__") continue;
        round.push((r + i) % 2 === 0 ? [a, b] : [b, a]);
      }
      roundsA.push(round);
      arr.splice(1, 0, arr.pop());
    }
    const roundsB = roundsA.map((r) => r.map(([h2, a]) => [a, h2]));
    rng.shuffle(roundsA);
    rng.shuffle(roundsB);
    const target = Math.min(conf2.confGames || 18, 22);
    const perRound = n % 2 === 1 ? (n - 1) / n : 1;
    let roundsNeeded = Math.round(target / perRound);
    const all = [...roundsA, ...roundsB];
    roundsNeeded = Math.min(roundsNeeded, all.length, CONF_DAYS);
    const chosen = all.slice(0, roundsNeeded);
    const dayIdx = [];
    for (let i = 0; i < chosen.length; i++) {
      dayIdx.push(FIRST_CONF_DAY + Math.round(i * (CONF_DAYS - 1) / Math.max(1, chosen.length - 1)));
    }
    if (chosen.length === 1) dayIdx[0] = FIRST_CONF_DAY;
    chosen.forEach((round, i) => {
      for (const [h2, a] of round) add(dayIdx[i], h2, a, "conf");
    });
  }
  const planned = /* @__PURE__ */ new Set();
  forEachHuman(state, () => {
    const sc2 = state.scheduling;
    const uid = state.user.teamId;
    const planActive = !!sc2 && sc2.season === state.season && sc2.locked;
    if (planActive && sc2) {
      planned.add(uid);
      const ev = sc2.mte ? sc2.mtes.find((m) => m.name === sc2.mte) : void 0;
      const [d1, d2] = FEAST_WEEK_DAYS;
      if (ev && ev.field.every((id) => byId[id])) {
        const [a, b, c] = ev.field;
        const second = rng.chance(0.5) ? b : c;
        const third = second === b ? c : b;
        add(d1, uid, a, "nc", true, ev.name);
        add(d1, b, c, "nc", true, ev.name);
        add(d2, uid, second, "nc", true, ev.name);
        add(d2, a, third, "nc", true, ev.name);
      }
      const order = (x) => x.locked === "rivalry" ? 3 : x.site === "neutral" || x.series ? 2 : 1;
      const plan = [...sc2.games].filter((x) => byId[x.oppId] && byId[x.oppId].conf !== byId[uid].conf).sort((x, y) => order(x) - order(y));
      const free = [];
      for (let d = 1; d <= NONCONF_DAYS; d++) if (!busy[d].has(uid)) free.push(d);
      const usedDays = /* @__PURE__ */ new Set();
      plan.forEach((x, i) => {
        const ideal = free[Math.round(i * (free.length - 1) / Math.max(1, plan.length - 1))];
        const day = [ideal, ...free].find((d) => d != null && !usedDays.has(d) && !busy[d].has(x.oppId) && !busy[d].has(uid));
        if (day == null) return;
        usedDays.add(day);
        if (x.site === "home") add(day, uid, x.oppId, "nc", false, x.event);
        else if (x.site === "away") add(day, x.oppId, uid, "nc", false, x.event);
        else add(day, uid, x.oppId, "nc", true, x.event);
      });
    }
  });
  const reserved = /* @__PURE__ */ new Set();
  forEachHuman(state, () => {
    for (const x of reservedTeams(state)) reserved.add(x);
  });
  for (const rv of RIVALRIES) {
    const a = byId[rv.a], b = byId[rv.b];
    if (!a || !b || a.conf === b.conf) continue;
    if (played.has(key(a.id, b.id))) continue;
    if (planned.has(rv.a) || planned.has(rv.b)) continue;
    const day = rng.int(9, NONCONF_DAYS);
    if (busy[day].has(a.id) || busy[day].has(b.id)) continue;
    const homeFirst = (state.season + (a.id < b.id ? 0 : 1)) % 2 === 0;
    add(day, homeFirst ? a.id : b.id, homeFirst ? b.id : a.id, "nc", false, rv.name);
  }
  for (const r of Object.values(state.rivals?.pairs ?? {})) {
    if (!r.active || r.origin !== "born" || r.heat < 55) continue;
    const a = byId[r.a], b = byId[r.b];
    if (!a || !b || a.conf === b.conf || played.has(key(a.id, b.id))) continue;
    if (planned.has(r.a) || planned.has(r.b)) continue;
    const day = rng.int(9, NONCONF_DAYS);
    if (busy[day].has(a.id) || busy[day].has(b.id)) continue;
    const homeFirst = (state.season + (a.id < b.id ? 0 : 1)) % 2 === 0;
    add(day, homeFirst ? a.id : b.id, homeFirst ? b.id : a.id, "nc", false, r.name);
  }
  const mtePool = rng.shuffle(teams.filter((t) => (confTier(state, t) <= 2 || t.prestige >= 50) && !reserved.has(t.id)));
  let podIdx = 0;
  for (let i = 0; i + 3 < mtePool.length && podIdx < MTE_EVENTS.length * 2; i += 4) {
    const pod = mtePool.slice(i, i + 4);
    const ev = MTE_EVENTS[podIdx % MTE_EVENTS.length];
    podIdx++;
    const [d1, d2] = FEAST_WEEK_DAYS;
    const pairs1 = [[pod[0], pod[1]], [pod[2], pod[3]]];
    const pairs2 = [[pod[0], pod[2]], [pod[1], pod[3]]];
    for (const [x, y] of pairs1) if (x.conf !== y.conf && !busy[d1].has(x.id) && !busy[d1].has(y.id) && !played.has(key(x.id, y.id))) add(d1, x.id, y.id, "nc", true, ev);
    for (const [x, y] of pairs2) if (x.conf !== y.conf && !busy[d2].has(x.id) && !busy[d2].has(y.id) && !played.has(key(x.id, y.id))) add(d2, x.id, y.id, "nc", true, ev);
  }
  const tierOf2 = {};
  for (const t of teams) tierOf2[t.id] = confTier(state, t);
  const quota = {};
  for (const t of teams) quota[t.id] = Math.max(NONCONF_GAMES, Math.min(NONCONF_DAYS - 1, MIN_TOTAL_GAMES - confGamesOf(games, t.id)));
  for (let day = 1; day <= NONCONF_DAYS; day++) {
    const remainingDays = NONCONF_DAYS - day + 1;
    const avail = teams.filter((t) => !busy[day].has(t.id) && gameCount[t.id] - confGamesOf(games, t.id) < quota[t.id]);
    const want = rng.shuffle(avail.filter((t) => {
      const need = quota[t.id] - (gameCount[t.id] - confGamesOf(games, t.id));
      return rng.chance(Math.min(1, need / remainingDays + 0.05));
    }));
    const used = /* @__PURE__ */ new Set();
    for (const t of want) {
      if (used.has(t.id)) continue;
      let best = null;
      let bestW = -1;
      for (let tries = 0; tries < 14; tries++) {
        const c = want[rng.int(0, want.length - 1)];
        if (c.id === t.id || used.has(c.id) || c.conf === t.conf || played.has(key(c.id, t.id))) continue;
        const tdiff = Math.abs(tierOf2[c.id] - tierOf2[t.id]);
        let w = 1 + (tdiff >= 2 ? 1.6 : 0) + (tierOf2[c.id] === 1 && tierOf2[t.id] === 1 ? 0.5 : 0) + (c.state === t.state ? 1.2 : 0);
        w *= rng.range(0.5, 1.5);
        if (w > bestW) {
          bestW = w;
          best = c;
        }
      }
      if (!best) continue;
      used.add(t.id);
      used.add(best.id);
      let home = t, away = best;
      const pdiff = t.prestige - best.prestige;
      if (Math.abs(pdiff) > 15) {
        if (pdiff < 0) {
          home = best;
          away = t;
        }
        if (rng.chance(0.08)) [home, away] = [away, home];
      } else if (homeCount[best.id] < homeCount[t.id]) {
        home = best;
        away = t;
      }
      add(day, home.id, away.id, "nc");
    }
  }
  games.sort((a, b) => a.day - b.day);
  return games;
}
var confCache = /* @__PURE__ */ new Map();
function confGamesOf(games, id) {
  const k = id;
  if (confCache.has(k)) return confCache.get(k);
  let n = 0;
  for (const g of games) if (g.type === "conf" && (g.home === id || g.away === id)) n++;
  confCache.set(k, n);
  return n;
}

// src/engine/postseason.ts
function seedOrder(size) {
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2;
    const next = [];
    for (const s of order) next.push(s, n + 1 - s);
    order = next;
  }
  return order;
}
var gseq = 0;
function newGameId(state, prefix) {
  return `${prefix}${state.season}-${Date.now().toString(36)}${(gseq++).toString(36)}`;
}
function setupConfTourneys(state) {
  state.confTourneys = {};
  for (const conf2 of state.conferences) {
    const standings = confStandings(state, conf2.id);
    if (standings.length < 2) continue;
    let size = standings.length;
    if (conf2.id === "ivy") size = 4;
    if (size > 16) size = 16;
    if (conf2.id === "big-ten" || conf2.id === "acc") size = Math.min(size, 15);
    const teams = standings.slice(0, size);
    const bsize = 2 ** Math.ceil(Math.log2(size));
    const nRounds = Math.log2(bsize);
    const order = seedOrder(bsize);
    const rounds = [];
    for (let r = 0; r < nRounds; r++) {
      const games = [];
      const n = bsize / 2 ** (r + 1);
      for (let i = 0; i < n; i++) games.push({ id: `${conf2.id}-${r}-${i}`, round: r, slot: i, seeds: [null, null], teams: [null, null], winner: null });
      rounds.push(games);
    }
    const seeds = {};
    teams.forEach((t, i) => seeds[t.id] = i + 1);
    for (let i = 0; i < bsize / 2; i++) {
      const sa = order[2 * i], sb = order[2 * i + 1];
      const g = rounds[0][i];
      g.seeds = [sa <= size ? sa : null, sb <= size ? sb : null];
      g.teams = [sa <= size ? teams[sa - 1].id : null, sb <= size ? teams[sb - 1].id : null];
    }
    const startDay = CT_LAST - (nRounds - 1);
    const dayForRound = Array.from({ length: nRounds }, (_, r) => Math.max(CT_FIRST, startDay + r));
    const roundNames = Array.from({ length: nRounds }, (_, r) => {
      const left = nRounds - r;
      return left === 1 ? "Championship" : left === 2 ? "Semifinals" : left === 3 ? "Quarterfinals" : `Round ${r + 1}`;
    });
    const bracket = { name: `${conf2.short} Tournament`, confId: conf2.id, rounds, champion: null, seeds, dayForRound, roundNames };
    for (const g of rounds[0]) {
      if (g.teams[0] && !g.teams[1]) setWinner(bracket, g, g.teams[0]);
      else if (!g.teams[0] && g.teams[1]) setWinner(bracket, g, g.teams[1]);
    }
    state.confTourneys[conf2.id] = bracket;
    scheduleReady(state, bracket, `${conf2.short} Tournament`, "ctourn");
  }
}
function setWinner(b, g, winner, score) {
  g.winner = winner;
  if (score) g.score = score;
  const r = g.round;
  if (g.feed) {
    const [slot, side2] = g.feed;
    const ng2 = b.rounds[1][slot];
    ng2.teams[side2] = winner;
    ng2.seeds[side2] = b.seeds[winner] ?? null;
    return;
  }
  if (r + 1 >= b.rounds.length) {
    b.champion = winner;
    return;
  }
  const ng = b.rounds[r + 1][g.slot >> 1];
  const side = g.slot & 1;
  ng.teams[side] = winner;
  ng.seeds[side] = b.seeds[winner] ?? null;
}
function scheduleReady(state, b, event, type) {
  b.rounds.forEach((games, r) => {
    for (const g of games) {
      if (g.winner || g.gameId || !g.teams[0] || !g.teams[1]) continue;
      const [a, c] = g.teams;
      const sa = g.seeds[0] ?? 99, sc2 = g.seeds[1] ?? 99;
      const home = sa <= sc2 ? a : c, away = home === a ? c : a;
      const sg = {
        id: newGameId(state, type === "ncaa" ? "n" : "c"),
        day: b.dayForRound[r],
        home,
        away,
        neutral: true,
        type,
        event: `${event} \xB7 ${b.roundNames[r]}${g.region ? ` (${g.region})` : ""}`,
        round: r,
        played: false,
        tv: type === "ncaa" ? r >= 5 ? "THN" : rng.pick(["THN", "SportsNet One", "Big Stage Sports", "National Hoops TV"]) : pickTV(state, state.teams[home], state.teams[away])
      };
      g.gameId = sg.id;
      state.schedule.push(sg);
    }
  });
}
function advanceBrackets(state) {
  const byId = new Map(state.schedule.map((g) => [g.id, g]));
  const process = (b, event, type) => {
    for (const games of b.rounds) {
      for (const g of games) {
        if (g.winner || !g.gameId) continue;
        const sg = byId.get(g.gameId);
        if (!sg || !sg.played) continue;
        const homeWon = (sg.hs ?? 0) > (sg.as ?? 0);
        const w = homeWon ? sg.home : sg.away;
        const score = g.teams[0] === sg.home ? [sg.hs, sg.as] : [sg.as, sg.hs];
        setWinner(b, g, w, score);
      }
    }
    scheduleReady(state, b, event, type);
  };
  for (const b of Object.values(state.confTourneys)) process(b, b.name, "ctourn");
  if (state.ncaa) process(state.ncaa, "NCAA Tournament", "ncaa");
}
function autoBids(state) {
  const res = {};
  for (const [cid, b] of Object.entries(state.confTourneys)) if (b.champion) res[cid] = b.champion;
  return res;
}
var R64_ORDER = [[1, 16], [8, 9], [5, 12], [4, 13], [6, 11], [3, 14], [7, 10], [2, 15]];
function buildNcaa(state) {
  const field = selectField(state, autoBids(state));
  const seeds = {};
  for (const e of field) seeds[e.teamId] = e.seed;
  const rounds = [];
  const sizes = [4, 32, 16, 8, 4, 2, 1];
  sizes.forEach((n, r) => {
    const games = [];
    for (let i = 0; i < n; i++) games.push({ id: `ncaa-${r}-${i}`, round: r, slot: i, seeds: [null, null], teams: [null, null], winner: null });
    rounds.push(games);
  });
  for (let r = 1; r <= 4; r++) for (const g of rounds[r]) g.region = REGIONS[Math.floor(g.slot / (rounds[r].length / 4))];
  for (let reg = 0; reg < 4; reg++) {
    R64_ORDER.forEach(([sa, sb], m) => {
      const g = rounds[1][reg * 8 + m];
      const a = field.find((e) => e.region === reg && e.seed === sa && !e.firstFour);
      const b = field.find((e) => e.region === reg && e.seed === sb && !e.firstFour);
      g.seeds = [sa, sb];
      g.teams = [a?.teamId ?? null, b?.teamId ?? null];
    });
  }
  const ff = field.filter((e) => e.firstFour);
  let ffi = 0;
  for (const seed of [11, 16]) {
    for (let reg = 0; reg < 4; reg++) {
      const pair = ff.filter((e) => e.seed === seed && e.region === reg);
      if (pair.length !== 2) continue;
      const g = rounds[0][ffi++];
      if (!g) continue;
      g.seeds = [seed, seed];
      g.teams = [pair[0].teamId, pair[1].teamId];
      g.region = REGIONS[reg];
      const m = R64_ORDER.findIndex(([a, b]) => a === seed || b === seed);
      const side = R64_ORDER[m][0] === seed ? 0 : 1;
      g.feed = [reg * 8 + m, side];
    }
  }
  const dayForRound = NCAA_ROUND_NAMES.map((_, i) => NCAA_FIRST + i);
  state.ncaa = { name: "NCAA Tournament", rounds, champion: null, seeds, regions: REGIONS, dayForRound, roundNames: NCAA_ROUND_NAMES };
  const outside = Object.values(state.teams).filter((t) => seeds[t.id] == null).sort((a, b) => selectionScore(b) - selectionScore(a));
  state.ncaa.show = {
    overall: field.filter((e) => e.seed === 1).sort((a, b) => b.score - a.score).map((e) => e.teamId),
    auto: field.filter((e) => e.auto).map((e) => e.teamId),
    lastIn: field.filter((e) => e.firstFour && !e.auto).sort((a, b) => b.score - a.score).map((e) => e.teamId),
    firstOut: outside.slice(0, 4).map((t) => t.id),
    nextOut: outside.slice(4, 8).map((t) => t.id)
  };
  scheduleReady(state, state.ncaa, "NCAA Tournament", "ncaa");
  return field;
}
var NCAA_EXIT_LABEL = ["First Four", "Round of 64", "Round of 32", "Sweet 16", "Elite Eight", "Final Four", "Runner-up"];
function ncaaResult(state, teamId) {
  const b = state.ncaa;
  if (!b || b.seeds[teamId] == null) return "";
  if (b.champion === teamId) return "Champion";
  let last = -1;
  b.rounds.forEach((games, r) => {
    for (const g of games) if (g.teams.includes(teamId)) last = Math.max(last, r);
  });
  if (last < 0) return "";
  return NCAA_EXIT_LABEL[last] ?? "";
}

// src/engine/pros.ts
function prosState(state) {
  return state.pros ??= { list: {}, champs: [], pipeline: {} };
}
function addPro(state, p, pick, nbaTeam, collegeId) {
  const P2 = prosState(state);
  P2.list[p.id] = {
    id: p.id,
    name: `${p.first} ${p.last}`,
    pos: p.pos,
    num: p.num,
    college: collegeId,
    draft: state.season + 1,
    pick,
    team: nbaTeam,
    ovr: clamp(Math.round(p.ovr - 6 + rng.normal(0, 2)), 40, 95),
    peak: clamp(Math.round(Math.max(p.ovr, p.pot) + rng.normal(0, 6)), 50, 99),
    age: p.age + 1,
    log: [],
    allStar: 0,
    allNba: 0,
    rings: 0,
    mvp: 0,
    earnings: 0
  };
}
function ensurePros(state, through) {
  if (state.pros) return;
  const last = through ?? (["preseason", "regular", "confTourney", "selection", "ncaa"].includes(state.phase) ? state.season - 1 : state.season);
  const P2 = prosState(state);
  const firstSeason = Math.min(...state.draft.map((d) => d.season), state.season + 1);
  for (const d of state.draft) {
    const base = 78 - d.pick * 0.28 + rng.normal(0, 3);
    P2.list[d.playerId] = {
      id: d.playerId,
      name: d.name,
      pos: d.pos,
      num: rng.int(0, 35),
      college: d.teamId,
      draft: d.season,
      pick: d.pick,
      team: d.nbaTeam,
      ovr: clamp(Math.round(base - 6), 40, 95),
      peak: clamp(Math.round(base + 2 + rng.normal(0, 6)), 50, 99),
      age: 21,
      log: [],
      allStar: 0,
      allNba: 0,
      rings: 0,
      mvp: 0,
      earnings: 0
    };
  }
  for (let s = firstSeason; s <= last; s++) proSeason(state, s, true);
}
var salary = (c, lvl, rookie) => lvl === 0 ? rookie ? Math.max(12e5, 12e6 - c.pick * 35e4) : Math.max(12e5, (c.ovr - 62) * 19e5) : lvl === 1 ? 5e4 : 45e4;
function proSeason(state, season, quiet = false) {
  const P2 = prosState(state);
  const uid = state.user.teamId;
  const champ = rng.pick(NBA_TEAMS);
  P2.champs = [{ season, team: champ }, ...P2.champs.filter((x) => x.season !== season)].slice(0, 60);
  const active = Object.values(P2.list).filter((c) => c.retired == null && c.draft <= season);
  let best;
  let roy;
  const notes = [];
  for (const c of active) {
    if (c.log.some((x) => x[0] === season)) continue;
    const rookie = c.log.length === 0;
    if (!rookie) c.age++;
    const grow = c.age <= 25 ? (c.peak - c.ovr) * rng.range(0.15, 0.4) : c.age <= 29 ? rng.range(-1, 1.5) : -rng.range(1, 3.5) - Math.max(0, c.age - 32) * 0.8;
    c.ovr = clamp(Math.round(c.ovr + grow + rng.normal(0, 1.5)), 35, 99);
    const age = c.age;
    if (age >= 34 && rng.chance((age - 33) * 0.22) || c.ovr < 50 && !rookie || c.log.length >= 3 && c.ovr < 56 && rng.chance(0.35)) {
      c.retired = season;
      const hl = c.allStar >= 3 || c.rings >= 2;
      if (c.college === uid || hl) notes.push({ c, text: `${c.name} (${state.teams[c.college]?.school ?? "college"}) retires after ${c.log.length} pro season${c.log.length === 1 ? "" : "s"}${c.allStar ? `, ${c.allStar}\xD7 All-Star` : ""}${c.rings ? `, ${c.rings} ring${c.rings > 1 ? "s" : ""}` : ""}`, big: hl });
      continue;
    }
    const lvl = c.ovr >= 66 || rookie && c.pick <= 30 && c.ovr >= 58 ? 0 : c.ovr >= 60 ? 1 : 2;
    if (lvl === 0 && c.log.length && rng.chance(0.14)) c.team = rng.pick(NBA_TEAMS.filter((t) => t !== c.team));
    const ppg2 = Math.round(clamp(lvl === 0 ? (c.ovr - 62) * 0.95 + rng.normal(0, 2) : lvl === 1 ? (c.ovr - 50) * 0.9 + rng.normal(0, 2) : (c.ovr - 45) * 0.8 + rng.normal(0, 2), 1, 36) * 10) / 10;
    const entry = [season, lvl, ppg2];
    c.log.push(entry);
    c.earnings += salary(c, lvl, rookie);
    if (lvl !== 0) continue;
    if (c.ovr >= 80 && rng.chance(clamp((c.ovr - 83) / 6, 0.03, 0.95))) {
      c.allStar++;
      entry.push("AS");
      notes.push({ c, text: `${c.name} is an NBA All-Star${c.allStar > 1 ? ` for the ${ord(c.allStar)} time` : ""}`, big: c.allStar === 1 });
    }
    if (c.ovr >= 88 && rng.chance(clamp((c.ovr - 87) / 5, 0.1, 0.9))) {
      c.allNba++;
      entry.push("ANBA");
    }
    if (c.team === champ) {
      c.rings++;
      entry.push("RING");
      notes.push({ c, text: `${c.name} wins an NBA title with ${champ}`, big: true });
    }
    if (!best || c.ovr > best.ovr) best = c;
    if (rookie && (!roy || c.ovr + ppg2 > roy.ovr + (roy.log[roy.log.length - 1]?.[2] ?? 0))) roy = c;
    if (c.pick <= 10 && c.log.length === 3 && c.ovr < 66) c.bust = true;
  }
  for (const c of active) if (c.pick <= 10 && !c.bust && c.log.length === 3 && c.log[2][1] !== 0) c.bust = true;
  if (best && best.ovr >= 92 && rng.chance(0.45)) {
    best.mvp++;
    best.log[best.log.length - 1].push("MVP");
    notes.push({ c: best, text: `${best.name} wins NBA MVP`, big: true });
  }
  if (roy) {
    roy.roy = season;
    roy.log[roy.log.length - 1].push("ROY");
    notes.push({ c: roy, text: `${roy.name} is NBA Rookie of the Year`, big: true });
  }
  refreshPipeline(state);
  if (quiet) return;
  const seen = /* @__PURE__ */ new Set();
  for (const n of notes.sort((a, b) => Number(b.c.college === uid) - Number(a.c.college === uid))) {
    const mine = n.c.college === uid;
    if (!mine && !n.big) continue;
    if (!mine && n.text.includes("NBA title")) {
      if (seen.has("title")) continue;
      seen.add("title");
    }
    if (seen.size >= 6 || seen.has(n.c.id + n.text)) continue;
    seen.add(n.c.id + n.text);
    const school = state.teams[n.c.college]?.school;
    addNews(state, { kind: "draft", headline: mine ? `Former ${state.teams[uid].mascot.replace(/s$/, "")} ${n.text.replace(n.c.name, n.c.name)}` : n.text, body: `${n.c.name}${school ? ` played his college ball at ${school}` : ""} and was the No. ${n.c.pick} pick in the ${n.c.draft} draft.`, teams: n.c.college ? [n.c.college] : [], important: mine });
  }
}
function refreshPipeline(state) {
  const P2 = prosState(state);
  const pipe = {};
  for (const c of Object.values(P2.list)) {
    if (!c.college) continue;
    const x = pipe[c.college] ??= { nba: 0, allStars: 0, alumni: 0 };
    x.alumni++;
    const last = c.log[c.log.length - 1];
    if (c.retired == null && last && last[1] === 0) x.nba++;
    if (c.allStar) x.allStars++;
  }
  P2.pipeline = pipe;
}
function pipelineBonus(state, teamId) {
  const x = state.pros?.pipeline[teamId];
  return x ? Math.min(18, x.nba * 2.5 + x.allStars * 1.5) : 0;
}
function nbaCount(state, teamId) {
  return state.pros?.pipeline[teamId]?.nba ?? 0;
}
function prosOf(state, teamId) {
  return Object.values(state.pros?.list ?? {}).filter((c) => c.college === teamId).sort((a, b) => Number(a.retired != null) - Number(b.retired != null) || b.allStar - a.allStar || b.rings - a.rings || b.ovr - a.ovr);
}
function proTotals(c) {
  const nba = c.log.filter((x) => x[1] === 0);
  return { seasons: c.log.length, nbaSeasons: nba.length, ppg: nba.length ? nba.reduce((s, x) => s + x[2], 0) / nba.length : 0, best: Math.max(0, ...nba.map((x) => x[2])) };
}
var ord = (n) => {
  const s = ["th", "st", "nd", "rd"], m = n % 100;
  return n + (s[(m - 20) % 10] || s[m] || s[0]);
};

// src/engine/recruiting.ts
var PRIORITY_KEYS = ["nil", "pt", "prestige", "proximity", "coach", "pro", "academics", "winning"];
var STORYLINES = [
  "Son of a former NBA player",
  "Reclassified up a year",
  "Grew 4 inches since last summer",
  "Viral mixtape star with millions of views",
  "State Player of the Year",
  "Led his team to a state title",
  "Overseas pro looking to play college ball",
  "Former football recruit",
  "Twin brother is also a D-I prospect",
  "Played for a famous prep powerhouse",
  "Late bloomer climbing the rankings",
  "Coming back from injury",
  "Grandfather played at a blue blood",
  "Top student in his class",
  "Elite AAU circuit standout",
  "Former G League Ignite camp invitee"
];
function genPriorities(type, stars, traits) {
  const p = { nil: 0, pt: 0, prestige: 0, proximity: 0, coach: 0, pro: 0, academics: 0, winning: 0 };
  for (const k of PRIORITY_KEYS) p[k] = rng.range(0.3, 1);
  if (stars >= 4) {
    p.pro += 0.5;
    p.nil += 0.3;
    p.prestige += 0.2;
  }
  if (stars <= 2) {
    p.pt += 0.4;
    p.prestige -= 0.1;
  }
  if (type === "INTL") {
    p.proximity = 0.1;
    p.pro += 0.3;
  }
  if (type === "JUCO") {
    p.pt += 0.4;
    p.nil += 0.2;
  }
  if (traits.includes("mercenary")) p.nil += 0.8;
  if (traits.includes("hometown")) p.proximity += 1;
  if (traits.includes("scholar")) p.academics += 0.8;
  const sum = PRIORITY_KEYS.reduce((s, k) => s + Math.max(0.05, p[k]), 0);
  for (const k of PRIORITY_KEYS) p[k] = Math.max(0.05, p[k]) / sum;
  return p;
}
function generateClass(state, classYear) {
  const out = [];
  const N = 1350;
  for (let i = 0; i < N; i++) {
    const rankPct = i / N;
    const type = i < 40 ? rng.chance(0.08) ? "INTL" : rng.chance(0.06) ? "PREP" : "HS" : rng.weighted(["HS", "JUCO", "INTL", "PREP"], [80, 9, 6, 5]);
    const q2 = 1 - Math.pow(rankPct, 0.55);
    let ovr = Math.round(44 + q2 * 30 + rng.normal(0, 2.5));
    let pot = Math.round(ovr + 10 + q2 * 12 + rng.normal(0, 4));
    if (type === "JUCO") {
      ovr += 4;
      pot -= 4;
    }
    if (type === "INTL") {
      pot += rng.int(-3, 6);
    }
    const pos = randomPos();
    const arch = rng.pick(ARCHETYPES_BY_POS[pos]);
    const hm = { PG: 74, SG: 76.5, SF: 78.5, PF: 80.5, C: 83 };
    const height = Math.round(clamp(rng.normal(hm[pos], 1.5), hm[pos] - 4, hm[pos] + 4));
    const ratings = buildRatings(pos, arch, ovr, height);
    ovr = calcOvr(ratings, pos);
    pot = clamp(Math.max(pot, ovr + 2), ovr, 99);
    const intl = type === "INTL";
    const nm3 = genName(intl);
    const place2 = pickPlace();
    const traits = genTraits();
    const r = {
      id: rng.id("r"),
      first: nm3.first,
      last: nm3.last,
      pos,
      archetype: arch,
      height,
      weight: Math.round(185 + (height - 74) * 7.5 + rng.normal(0, 10)),
      hometown: intl ? nm3.country : place2.city,
      state: intl ? nm3.country : place2.state,
      country: nm3.country,
      age: type === "JUCO" ? 20 : type === "INTL" ? rng.int(18, 20) : rng.chance(0.3) ? 19 : 18,
      ratings,
      ovr,
      pot,
      stars: 0,
      traits,
      num: 0,
      followers: 0,
      injury: null,
      history: [],
      awards: [],
      type,
      rank: 0,
      posRank: 0,
      priorities: genPriorities(type, 3, traits),
      schools: [],
      committed: null,
      committedWeek: null,
      signed: false,
      scouted: 0,
      nilAsk: 0,
      decisionWeek: rng.int(3, 26),
      userWeek: { call: false, text: false, asst: false, hc: false, visit: false, scout: 0 },
      userPromise: null,
      classYear,
      storyline: rng.chance(0.12) ? rng.pick(STORYLINES) : void 0,
      lat: intl ? 40 : place2.lat,
      lng: intl ? -40 : place2.lng
    };
    out.push(r);
  }
  const comp = (r) => r.ovr * 0.45 + r.pot * 0.55 + rng.normal(0, 1.2);
  const scored = out.map((r) => ({ r, s: comp(r) })).sort((a, b) => b.s - a.s);
  const posCount = {};
  scored.forEach(({ r }, i) => {
    r.rank = i + 1;
    posCount[r.pos] = (posCount[r.pos] ?? 0) + 1;
    r.posRank = posCount[r.pos];
    r.stars = i < 28 ? 5 : i < 140 ? 4 : i < 520 ? 3 : i < 1050 ? 2 : 1;
    r.priorities = genPriorities(r.type, r.stars, r.traits);
    r.followers = genFollowers(r.stars, r.ovr, r.traits);
    r.nilAsk = askFor(r);
    if (r.stars >= 4) r.decisionWeek = rng.int(6, 30);
  });
  return scored.map((x) => x.r);
}
function askFor(r) {
  const v2 = nilValue({ ovr: Math.round(r.ovr * 0.5 + r.pot * 0.5), pot: r.pot, followers: r.followers, traits: r.traits, stars: r.stars }, 6);
  return roundMoney(v2 * (0.6 + r.priorities.nil * 2));
}
function recruitLatLng(r) {
  return [r.lat ?? 38, r.lng ?? -90];
}
var depthCache = null;
function buildDepthCache(state) {
  depthCache = /* @__PURE__ */ new Map();
  for (const t of Object.values(state.teams)) {
    const byPos = { PG: [], SG: [], SF: [], PF: [], C: [] };
    let count = 0;
    for (const id of t.roster) {
      const p = state.players[id];
      if (!p || p.elig <= 1) continue;
      byPos[p.pos].push(p.ovr);
      count++;
    }
    depthCache.set(t.id, { byPos, count });
  }
}
function teamAppeal(state, r, team, nilOffer = 0, promise = null) {
  const coach = state.coaches[team.coachId];
  const [lat, lng] = recruitLatLng(r);
  const miles = r.type === "INTL" ? 1500 : milesBetween(lat, lng, team.lat, team.lng);
  const bar = r.ovr + (r.pot - r.ovr) * 0.3;
  let ahead = 0, rosterCount = 0;
  const dc = depthCache?.get(team.id);
  if (dc) {
    for (const o of dc.byPos[r.pos]) if (o + 2 >= bar) ahead++;
    rosterCount = dc.count;
  } else {
    const roster = teamPlayers(state, team.id).filter((p) => p.elig > 1);
    ahead = roster.filter((p) => p.pos === r.pos && p.ovr + 2 >= bar).length;
    rosterCount = roster.length;
  }
  let pt = clamp(100 - ahead * 28 - Math.max(0, rosterCount - 10) * 4, 5, 100);
  if (promise === "star") pt = Math.max(pt, 100);
  else if (promise === "starter") pt = Math.max(pt, 85);
  else if (promise === "rotation") pt = Math.max(pt, 60);
  const ask = Math.max(1, r.nilAsk);
  const nil = clamp(nilOffer / ask * 70 + (team.nilBudget > ask * 3 ? 10 : 0), 0, 100);
  const tierBoost = [0, 12, 4, 0, -6][confTierOf(state, team)] ?? 0;
  const parts = {
    nil,
    pt,
    prestige: clamp(team.prestige + tierBoost, 0, 100),
    proximity: clamp(100 - miles / 12, 0, 100),
    coach: clamp((coach?.reputation ?? 50) * 0.8 + (coach ? coach.skills.recruiting * 2 : 10) + (isHuman(state, team.id) && asTeam(state, team.id, () => !!state.staff && staffPipelineState(state) === r.state) ? 12 : 0), 0, 100),
    pro: clamp(team.prestige * 0.6 + (coach ? coach.skills.development * 4 : 20) + (team.facilities ?? 5) * 2 + pipelineBonus(state, team.id), 0, 100),
    academics: clamp(team.academics * 10 + academicBonus(state, team.id), 0, 100),
    winning: clamp(50 + team.rating * 2.2 + (team.record.w - team.record.l) * 1.5, 0, 100)
  };
  let total = 0;
  for (const k of PRIORITY_KEYS) total += parts[k] * r.priorities[k];
  const levelGap = r.stars * 18 - team.prestige;
  if (levelGap > 20) total -= (levelGap - 20) * 0.5;
  return { total: clamp(total, 0, 100), parts };
}
var pipeCache = null;
function staffPipelineState(state) {
  if (!pipeCache || pipeCache.s !== state || !depthCache) pipeCache = { s: state, v: staffEffects(state).pipeline };
  return pipeCache.v;
}
function schoolEntry(r, teamId) {
  return r.schools.find((s) => s.teamId === teamId);
}
function ensureSchool(r, teamId) {
  let s = schoolEntry(r, teamId);
  if (!s) {
    s = { teamId, interest: 0, offered: false, nilOffer: 0, visited: false, rel: 0 };
    r.schools.push(s);
  }
  return s;
}
function interestOf(state, r, s, promise) {
  const team = state.teams[s.teamId];
  if (!team) return 0;
  const isUser2 = s.teamId === state.user.teamId;
  const pr = isUser2 ? promise !== void 0 ? promise : r.userPromise : null;
  const appeal2 = teamAppeal(state, r, team, s.nilOffer, pr).total;
  return clamp(appeal2 * 0.55 + s.rel * 0.5 + (s.offered ? 5 : 0), 0, 100);
}
function addRel(s, pts) {
  s.rel = clamp(s.rel + pts * (1 - s.rel / 110), 0, 100);
}
function seedInterest(state) {
  buildDepthCache(state);
  const teams = Object.values(state.teams);
  for (const r of Object.values(state.recruits)) {
    if (r.committed) continue;
    const cands = [];
    for (let i = 0; i < 40; i++) {
      const t = rng.pick(teams);
      const fit = 100 - Math.abs(r.stars * 18 - t.prestige) * 1.2;
      if (fit < 20 && rng.chance(0.85)) continue;
      cands.push({ t, a: teamAppeal(state, r, t).total + fit * 0.3 + rng.normal(0, 8) });
    }
    cands.sort((a, b) => b.a - a.a);
    const seen = /* @__PURE__ */ new Set();
    for (const c of cands) {
      if (seen.has(c.t.id)) continue;
      seen.add(c.t.id);
      const s = ensureSchool(r, c.t.id);
      s.rel = rng.range(0, 15);
      if (seen.size >= 6) break;
    }
    for (const s of r.schools) s.interest = interestOf(state, r, s);
  }
  depthCache = null;
}
var commitCache = null;
function openSpots(state, teamId) {
  const dc = depthCache?.get(teamId);
  const returning = dc ? dc.count : teamPlayers(state, teamId).filter((p) => p.elig > 1).length;
  const commits = commitCache ? commitCache.get(teamId) ?? 0 : Object.values(state.recruits).filter((r) => r.committed === teamId).length;
  return Math.max(0, ROSTER_MAX - returning - commits);
}
function buildCommitCache(state) {
  commitCache = /* @__PURE__ */ new Map();
  for (const r of Object.values(state.recruits)) if (r.committed) commitCache.set(r.committed, (commitCache.get(r.committed) ?? 0) + 1);
}
function aiRecruitingWeek(state, week) {
  buildDepthCache(state);
  buildCommitCache(state);
  const recruits = Object.values(state.recruits).filter((r) => !r.committed);
  const byStars = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  const offersBy = /* @__PURE__ */ new Map();
  for (const r of recruits) {
    byStars[r.stars].push(r);
    for (const s of r.schools) if (s.offered) {
      const l = offersBy.get(s.teamId);
      if (l) l.push(r);
      else offersBy.set(s.teamId, [r]);
    }
  }
  for (const team of Object.values(state.teams)) {
    if (isHuman(state, team.id) && !state.settings.autoRecruit) continue;
    const coach = state.coaches[team.coachId];
    const open = openSpots(state, team.id);
    const offers = offersBy.get(team.id) ?? [];
    const wantOffers = Math.min(14, open * 3 + 1);
    if (open > 0 && offers.length < wantOffers) {
      const lvl = team.prestige;
      const starPool = lvl >= 88 ? [5, 4] : lvl >= 72 ? [4, 5, 3] : lvl >= 58 ? [4, 3] : lvl >= 40 ? [3, 2] : lvl >= 22 ? [2, 3, 1] : [2, 1];
      for (let k = 0; k < wantOffers - offers.length; k++) {
        const stars = rng.weighted(starPool, starPool.map((_, i) => 1 / (i + 1)));
        const pool = byStars[stars];
        if (!pool.length) continue;
        let best = null, bestS = -1e9;
        for (let i = 0; i < 6; i++) {
          const r = rng.pick(pool);
          if (r.committed) continue;
          const [lat, lng] = recruitLatLng(r);
          const miles = milesBetween(lat, lng, team.lat, team.lng);
          const s = -miles / 300 + rng.normal(0, 1) + (schoolEntry(r, team.id) ? 2 : 0);
          if (s > bestS) {
            bestS = s;
            best = r;
          }
        }
        if (best) {
          const s = ensureSchool(best, team.id);
          if (!s.offered) {
            s.offered = true;
            s.nilOffer = roundMoney(Math.min(best.nilAsk * rng.range(0.6, 1.1), team.nilBudget * 0.16));
          }
        }
      }
    }
    const effort = 3 + team.prestige / 25 + (coach ? coach.skills.recruiting * 0.5 : 2);
    for (const r of offers) {
      const s = schoolEntry(r, team.id);
      addRel(s, effort * rng.range(0.5, 1.4) * (state.settings.difficulty === "legend" ? 1.2 : state.settings.difficulty === "rookie" ? 0.8 : 1));
      if (!s.visited && week >= 4 && rng.chance(0.08)) {
        s.visited = true;
        addRel(s, 12);
      }
    }
  }
  depthCache = null;
  commitCache = null;
}
var spotsCache = /* @__PURE__ */ new Map();
function openSpotsCached(state, teamId) {
  if (!commitCache) return openSpots(state, teamId);
  if (!spotsCache.has(teamId)) spotsCache.set(teamId, openSpots(state, teamId));
  return spotsCache.get(teamId);
}
var COMMIT_TEMP = 6;
function recruitOdds(state, r, preview, roomFn) {
  const uid = state.user.teamId;
  const hasRoom = roomFn ?? ((id) => openSpotsCached(state, id) > 0);
  const schools = [...r.schools];
  if (preview && !schools.some((s) => s.teamId === uid)) schools.push({ teamId: uid, interest: 0, offered: false, nilOffer: 0, visited: false, rel: 0 });
  const rows = schools.filter((s) => state.teams[s.teamId]).map((s) => {
    let entry = s, promise;
    if (preview && s.teamId === uid) {
      const rel2 = s.offered ? s.rel : clamp(s.rel + 6 * (1 - s.rel / 110), 0, 100);
      entry = { ...s, offered: true, nilOffer: Math.max(0, Math.round(preview.nil)), rel: rel2 };
      promise = preview.promise;
    }
    return { teamId: s.teamId, interest: interestOf(state, r, entry, promise), p: 0, offered: entry.offered, room: hasRoom(s.teamId) };
  });
  const elig = rows.filter((x) => x.offered && x.room);
  if (elig.length) {
    const max2 = Math.max(...elig.map((x) => x.interest));
    let tot = 0;
    for (const x of elig) {
      x.p = Math.exp((x.interest - max2) / COMMIT_TEMP);
      tot += x.p;
    }
    for (const x of elig) x.p /= tot;
  }
  return rows.sort((a, b) => b.p - a.p || b.interest - a.interest);
}
function earlyReady(top, second) {
  return top >= 82 && top - second >= 12;
}
var FACTOR_LABEL = {
  nil: "NIL money",
  pt: "playing time",
  prestige: "program prestige",
  proximity: "staying close to home",
  coach: "the head coach",
  pro: "pro development",
  academics: "academics",
  winning: "winning right now",
  rel: "the relationship"
};
function decisionFactors(state, r, aId, bId) {
  const ta = state.teams[aId], tb = state.teams[bId];
  const sa = schoolEntry(r, aId), sb = schoolEntry(r, bId);
  if (!ta || !tb) return [];
  const uid = state.user.teamId;
  const pa = teamAppeal(state, r, ta, sa?.nilOffer ?? 0, aId === uid ? r.userPromise : null).parts;
  const pb = teamAppeal(state, r, tb, sb?.nilOffer ?? 0, bId === uid ? r.userPromise : null).parts;
  const out = [];
  for (const k of PRIORITY_KEYS) {
    const edge = (pa[k] - pb[k]) * r.priorities[k] * 0.55;
    let label = FACTOR_LABEL[k];
    if (k === "nil" && (sa?.nilOffer || sb?.nilOffer)) label = `NIL money (${fmtMoney(sa?.nilOffer ?? 0)} vs ${fmtMoney(sb?.nilOffer ?? 0)})`;
    if (k === "proximity" && r.type !== "INTL") {
      const [lat, lng] = recruitLatLng(r);
      label = `staying close to home (${Math.round(milesBetween(lat, lng, ta.lat, ta.lng))} mi vs ${Math.round(milesBetween(lat, lng, tb.lat, tb.lng))} mi)`;
    }
    if (k === "pro" && Math.abs(ta.facilities - tb.facilities) >= 1) label = `player development and facilities (${ta.facilities.toFixed(1)} vs ${tb.facilities.toFixed(1)})`;
    if (k === "pro" && Math.abs(nbaCount(state, ta.id) - nbaCount(state, tb.id)) >= 2) label = `the NBA pipeline (${nbaCount(state, ta.id)} vs ${nbaCount(state, tb.id)} former players in the league)`;
    if (k === "prestige") {
      const ga = r.stars * 18 - ta.prestige, gb = r.stars * 18 - tb.prestige;
      out.push({ key: k, edge: edge + ((gb > 20 ? (gb - 20) * 0.5 : 0) - (ga > 20 ? (ga - 20) * 0.5 : 0)) * 0.55, label });
      continue;
    }
    out.push({ key: k, edge, label });
  }
  out.push({ key: "rel", edge: ((sa?.rel ?? 0) - (sb?.rel ?? 0)) * 0.5, label: FACTOR_LABEL.rel });
  return out.filter((f) => f.edge > 0.6).sort((a, b) => b.edge - a.edge);
}
function buildDecision(state, r, teamId, odds, week) {
  const uid = state.user.teamId;
  const mine = odds.find((o) => o.teamId === uid);
  if (!mine) return void 0;
  const won = teamId === uid;
  const runnerUp = odds.find((o) => o.teamId !== teamId && o.p > 0) ?? odds.find((o) => o.teamId !== teamId);
  const vsId = won ? runnerUp?.teamId ?? null : uid;
  const why = vsId ? decisionFactors(state, r, teamId, vsId).slice(0, 2).map((f) => f.label) : [];
  const winner = odds.find((o) => o.teamId === teamId);
  return {
    week,
    teamId,
    odds: odds.filter((o, i) => o.p > 0 && (i < 5 || o.teamId === uid || o.teamId === teamId)).map((o) => ({ teamId: o.teamId, p: Math.round(o.p * 1e3) / 1e3 })),
    userP: Math.round(mine.p * 1e3) / 1e3,
    userStatus: won ? "won" : !mine.offered ? "noOffer" : !mine.room ? "noRoom" : "lost",
    vsId,
    why,
    userInterest: Math.round(mine.interest),
    winnerInterest: Math.round(winner?.interest ?? 0)
  };
}
function decideRecruits(state, week) {
  buildDepthCache(state);
  buildCommitCache(state);
  spotsCache.clear();
  const committed = [];
  try {
    for (const r of Object.values(state.recruits)) {
      r.userWeek = { call: false, text: false, asst: false, hc: false, visit: false, scout: r.userWeek.scout };
      if (r.committed) continue;
      const odds = recruitOdds(state, r);
      for (const s of r.schools) s.interest = odds.find((o) => o.teamId === s.teamId)?.interest ?? s.interest;
      const elig = odds.filter((o) => o.p > 0).sort((a, b) => b.interest - a.interest);
      if (!elig.length) continue;
      const top = elig[0].interest;
      const second = elig[1]?.interest ?? 0;
      const ready = week >= r.decisionWeek && top >= 55 || earlyReady(top, second) || week >= 32;
      if (!ready) continue;
      if (!rng.chance(week >= r.decisionWeek ? 0.55 : 0.25)) continue;
      const choice = rng.weighted(elig, elig.map((o) => o.p));
      r.committed = choice.teamId;
      r.committedWeek = week;
      r.decision = buildDecision(state, r, choice.teamId, odds, week);
      committed.push(r);
      commitCache.set(choice.teamId, (commitCache.get(choice.teamId) ?? 0) + 1);
      spotsCache.delete(choice.teamId);
    }
  } finally {
    spotsCache.clear();
    depthCache = null;
    commitCache = null;
  }
  return committed;
}
function refreshRecruitInterest(state) {
  buildDepthCache(state);
  const uid = state.user.teamId;
  try {
    for (const r of Object.values(state.recruits)) {
      if (r.committed) continue;
      for (const s of r.schools) s.interest = interestOf(state, r, s);
      r.schools.sort((a, b) => b.interest - a.interest);
      if (r.schools.length > 10) {
        const mine = r.schools.find((s) => s.teamId === uid);
        r.schools = r.schools.slice(0, 10);
        if (mine && !r.schools.includes(mine)) r.schools.push(mine);
      }
    }
  } finally {
    depthCache = null;
  }
}
function signingDayDecisions(state, roomFor) {
  const out = [];
  const pending = /* @__PURE__ */ new Map();
  for (const r of Object.values(state.recruits)) if (r.committed) pending.set(r.committed, (pending.get(r.committed) ?? 0) + 1);
  const room = (id) => roomFor(id) - (pending.get(id) ?? 0) > 0;
  const recruits = Object.values(state.recruits).filter((r) => !r.committed).sort((a, b) => a.rank - b.rank);
  buildDepthCache(state);
  try {
    for (const r of recruits) {
      const odds = recruitOdds(state, r, void 0, room);
      const elig = odds.filter((o) => o.p > 0);
      if (!elig.length) continue;
      const choice = rng.weighted(elig, elig.map((o) => o.p));
      r.committed = choice.teamId;
      r.committedWeek = 0;
      r.decision = buildDecision(state, r, choice.teamId, odds, 0);
      pending.set(choice.teamId, (pending.get(choice.teamId) ?? 0) + 1);
      out.push(r);
    }
  } finally {
    depthCache = null;
  }
  return out;
}
function classScore(recruits) {
  const vals = recruits.map((r) => 100 - Math.min(99, r.rank / 14) + r.stars * 6).sort((a, b) => b - a);
  let s = 0;
  vals.forEach((v2, i) => s += v2 * Math.pow(0.85, i));
  return Math.round(s * 10) / 10;
}
function classRankings(state) {
  const by = {};
  for (const r of Object.values(state.recruits)) if (r.committed) (by[r.committed] ??= []).push(r);
  return Object.entries(by).map(([teamId, rs]) => ({ teamId, score: classScore(rs), count: rs.length, avgStars: rs.reduce((s, r) => s + r.stars, 0) / rs.length })).sort((a, b) => b.score - a.score);
}
function seedUserBoard(state, n = 8) {
  const team = state.teams[state.user.teamId];
  const existing = state.user.board.filter((id) => state.recruits[id]);
  const chosen = new Set(existing);
  const all = Object.values(state.recruits).filter((r) => !r.committed);
  const interested = all.filter((r) => schoolEntry(r, team.id)).sort((a, b) => a.rank - b.rank);
  for (const r of interested) {
    if (chosen.size >= n / 2) break;
    chosen.add(r.id);
  }
  const targetStars = team.prestige >= 85 ? 5 : team.prestige >= 68 ? 4 : team.prestige >= 45 ? 3 : 2;
  const fits = all.filter((r) => !chosen.has(r.id) && Math.abs(r.stars - targetStars) <= (targetStars === 5 ? 1 : 0)).map((r) => ({ r, d: milesBetween(r.lat, r.lng, team.lat, team.lng) + rng.range(0, 400) })).sort((a, b) => a.d - b.d);
  for (const f of fits) {
    if (chosen.size >= n) break;
    chosen.add(f.r.id);
  }
  state.user.board = [...chosen];
}

// src/engine/events.ts
var seq3 = 0;
function mk(state, o) {
  return { id: `ev${Date.now().toString(36)}${(seq3++).toString(36)}`, day: state.day, season: state.season, resolved: false, ...o };
}
var pickPlayer = (ps, f = () => true) => {
  const c = ps.filter(f);
  return c.length ? rng.pick(c) : null;
};
var booster = () => `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
var GENERATORS = [
  {
    w: 3,
    phase: ["regular", "preseason"],
    gen: (s) => {
      const team = s.teams[s.user.teamId];
      const amt = roundMoney(team.nilBudget * rng.range(0.06, 0.15) + 5e4);
      const b = booster();
      return mk(s, {
        from: b,
        fromRole: "Mega-Booster",
        subject: "A generous offer\u2026 with strings",
        body: `${b}, one of the program's biggest donors, wants to drop ${fmtMoney(amt)} into the collective. The catch: he wants a seat at the table on recruiting decisions and "a little more playing time" for a walk-on who happens to be his nephew.`,
        choices: [
          { label: "Take the money", hint: "NIL budget up, team morale down", effects: [{ kind: "nilBudget", delta: amt }, { kind: "morale", target: "team", delta: -4 }, { kind: "mediaRep", delta: -2 }], result: `The check clears. The locker room noticed the nephew's new jersey.` },
          { label: "Take it, no strings", hint: "Partial money; booster annoyed", effects: [{ kind: "nilBudget", delta: Math.round(amt * 0.4) }, { kind: "security", delta: -2 }], result: `He grumbled, but gave a smaller gift anyway.` },
          { label: "Politely decline", hint: "Integrity respected", effects: [{ kind: "morale", target: "team", delta: 2 }, { kind: "mediaRep", delta: 2 }, { kind: "security", delta: -1 }], result: `Your players respect the stance. The booster's golf buddies do not.` }
        ],
        priority: true
      });
    }
  },
  {
    w: 4,
    phase: ["regular"],
    gen: (s) => {
      const ps = teamPlayers(s, s.user.teamId);
      const p = pickPlayer(ps, (x) => x.stats.gp > 2 && x.ovr >= 55);
      if (!p) return null;
      const views = rng.int(2, 15);
      return mk(s, {
        from: "Sports Information Director",
        fromRole: "Media Relations",
        subject: `${p.first} ${p.last} just went viral`,
        body: `A clip of ${p.first} ${p.last}'s highlight from the last game has ${views}M views across platforms. Brands are calling. How do you want to handle it?`,
        personId: p.id,
        personKind: "player",
        choices: [
          { label: "Lean in \u2014 media blitz", hint: "Followers & hype up, small focus risk", effects: [{ kind: "followers", target: p.id, delta: views * 25e3 }, { kind: "hype", delta: 4 }, { kind: "morale", target: p.id, delta: 4 }, { kind: "morale", target: "team", delta: -1 }], result: `${p.last}'s follower count explodes. Teammates roll their eyes a bit.` },
          { label: "Let him enjoy it", hint: "Balanced", effects: [{ kind: "followers", target: p.id, delta: views * 12e3 }, { kind: "morale", target: p.id, delta: 3 }], result: `He's having fun with it. No harm done.` },
          { label: "Stay humble \u2014 team first", hint: "Team morale up", effects: [{ kind: "morale", target: "team", delta: 2 }, { kind: "morale", target: p.id, delta: p.traits.includes("diva") ? -6 : 0 }], result: `The message is received loud and clear.` }
        ]
      });
    }
  },
  {
    w: 3,
    phase: ["regular"],
    gen: (s) => {
      const ps = teamPlayers(s, s.user.teamId).sort((a, b) => b.ovr - a.ovr);
      const p = pickPlayer(ps.slice(0, 6), (x) => !!x.nil);
      if (!p) return null;
      const val = nilValue(p, s.teams[s.user.teamId].market);
      const ask = roundMoney(Math.max(val, (p.nil?.amount ?? 0) * 1.35));
      return mk(s, {
        from: `${p.first} ${p.last}'s agent`,
        fromRole: "Player Representation",
        subject: "Contract talk mid-season",
        body: `${p.first}'s representation says other programs have "made it known" what he'd be worth in the portal. They want his NIL bumped from ${fmtMoney(p.nil?.amount ?? 0)} to ${fmtMoney(ask)} \u2014 now.`,
        personId: p.id,
        personKind: "player",
        choices: [
          { label: `Pay him (${fmtMoney(ask)})`, hint: "Uses NIL budget; he\u2019s happy", effects: [{ kind: "morale", target: p.id, delta: 12 }, { kind: "nilBudget", delta: -(ask - (p.nil?.amount ?? 0)) }], result: `Deal done. ${p.first} is locked in.` },
          { label: "Promise to revisit in the offseason", hint: "Small morale hit", effects: [{ kind: "morale", target: p.id, delta: -5 }], result: `They'll wait \u2014 for now.` },
          { label: "Refuse \u2014 tampering is tampering", hint: "Big morale hit, media respect", effects: [{ kind: "morale", target: p.id, delta: -14 }, { kind: "mediaRep", delta: 3 }], result: `Things are frosty. Watch for the portal in April.` }
        ],
        priority: true
      });
    }
  },
  {
    w: 3,
    phase: ["regular"],
    gen: (s) => {
      const ps = teamPlayers(s, s.user.teamId);
      const p = pickPlayer(ps, (x) => !x.traits.includes("scholar"));
      if (!p) return null;
      if (rng.chance(0.15 * academicUpgrades(s))) return null;
      return mk(s, {
        from: "Academic Advisor",
        fromRole: "Academic Support",
        subject: `${p.first} ${p.last} \u2014 eligibility concern`,
        body: `${p.first} is failing a required class. If his grade doesn't improve before finals he could be ruled ineligible. We can assign mandatory tutoring, but it will cut into his practice time.`,
        personId: p.id,
        personKind: "player",
        choices: [
          { label: "Mandatory tutoring", hint: "Costs 8 recruiting hours of staff time", effects: [{ kind: "hours", delta: -8 }, { kind: "mediaRep", delta: 1 }], result: `He passes with a B-. Crisis averted.` },
          { label: "Sit him until grades improve", hint: "Misses 2 games; morale dip", effects: [{ kind: "injury", target: p.id, games: 2 }, { kind: "morale", target: p.id, delta: -5 }, { kind: "morale", target: "team", delta: 2 }], result: `He sits two games and gets the message.` },
          (() => {
            const ok = rng.chance(0.5);
            return { label: "He'll figure it out", hint: "Risky", effects: ok ? [] : [{ kind: "injury", target: p.id, games: 5 }, { kind: "security", delta: -3 }], result: ok ? "He pulled it out. Phew." : `He was ruled academically ineligible for several games.` };
          })()
        ]
      });
    }
  },
  {
    w: 2,
    phase: ["regular"],
    gen: (s) => {
      const ps = teamPlayers(s, s.user.teamId);
      const a = pickPlayer(ps, (x) => x.traits.includes("diva") || x.traits.includes("hothead")) ?? pickPlayer(ps);
      const b = pickPlayer(ps, (x) => x.id !== a?.id);
      if (!a || !b) return null;
      return mk(s, {
        from: "Team Captain",
        fromRole: "Locker Room",
        subject: "Locker room tension",
        body: `${a.first} ${a.last} and ${b.first} ${b.last} got into it at practice \u2014 words were exchanged over shots and minutes. The team is watching how you handle it.`,
        choices: [
          { label: "Team meeting \u2014 clear the air", hint: "Team morale and chemistry +", effects: [{ kind: "morale", target: "team", delta: 3 }, { kind: "morale", target: a.id, delta: -2 }, { kind: "chem", delta: 2 }], result: `Hugs all around. Mostly.` },
          { label: `Back ${a.last}`, hint: `${a.last} +, ${b.last} \u2212`, effects: [{ kind: "morale", target: a.id, delta: 8 }, { kind: "morale", target: b.id, delta: -10 }, { kind: "chem", delta: -1 }], result: `${b.last} isn't thrilled.` },
          { label: `Back ${b.last}`, hint: `${b.last} +, ${a.last} \u2212`, effects: [{ kind: "morale", target: b.id, delta: 8 }, { kind: "morale", target: a.id, delta: -10 }, { kind: "chem", delta: -1 }], result: `${a.last} is sulking.` },
          { label: "Suspend both for a half", hint: "Discipline; media respect", effects: [{ kind: "morale", target: a.id, delta: -4 }, { kind: "morale", target: b.id, delta: -4 }, { kind: "mediaRep", delta: 3 }, { kind: "morale", target: "team", delta: 1 }, { kind: "chem", delta: 1 }], result: `Message sent: nobody is bigger than the team.` }
        ]
      });
    }
  },
  {
    w: 2,
    phase: ["regular"],
    gen: (s) => {
      const team = s.teams[s.user.teamId];
      if (!team.apRank || team.apRank > 15) return null;
      return mk(s, {
        from: "Hoops Saturday Live",
        fromRole: "National TV",
        subject: "The big pregame show is coming to campus!",
        body: `The nation's top college hoops pregame show wants to broadcast live from ${team.arena} before your next home game. It's a circus \u2014 but recruits love it.`,
        choices: [
          { label: "Roll out the red carpet", hint: "Hype & recruiting boost", effects: [{ kind: "hype", delta: 8 }, { kind: "recruitInterest", delta: 4 }, { kind: "morale", target: "team", delta: -1 }], result: `The student section shows up at 5 a.m. with signs. Legendary.` },
          { label: "Keep it low-key", hint: "Small boost, focus maintained", effects: [{ kind: "hype", delta: 3 }, { kind: "morale", target: "team", delta: 2 }], result: `A great day without the distractions.` }
        ]
      });
    }
  },
  {
    w: 3,
    phase: ["regular"],
    gen: (s) => {
      const staff = (s.staff?.members ?? []).filter((m2) => m2.role !== "strength" && m2.ambition >= 40 && m2.rating >= 55);
      if (!staff.length) return null;
      const m = rng.pick(staff);
      const school = rng.pick(Object.values(s.teams).filter((t) => t.id !== s.user.teamId && t.prestige < s.teams[s.user.teamId].prestige + 10)).school;
      const role = { assoc: "Associate Head Coach", recruiting: "Recruiting Coordinator", defense: "Defensive Coordinator", development: "Player Development Coach", gm: "General Manager", strength: "Strength Coach" }[m.role];
      return mk(s, {
        from: `${m.first} ${m.last}`,
        fromRole: role,
        subject: `${school} has been calling me`,
        body: `Coach, heads up \u2014 ${school}'s AD reached out about a bigger role. I haven't said yes to anything. I just want to know where I stand with you.`,
        personId: m.id,
        personKind: "staff",
        choices: [
          { label: "Give him a 10% raise", hint: "Uses staff pool; big loyalty boost", effects: [{ kind: "staff", staffId: m.id, salaryPct: 0.1, loyalty: 18, ambition: -6 }], result: `${m.first} is all-in. "I'm not going anywhere, Coach."` },
          { label: "Tell him he\u2019s the future here", hint: "Free; small loyalty boost, ambition grows", effects: [{ kind: "staff", staffId: m.id, loyalty: 6, ambition: 6 }], result: `He appreciated it. You'll want to keep an eye on this one.` },
          { label: '"Do what\u2019s best for your family"', hint: "Loyalty drops \u2014 likely gone this spring", effects: [{ kind: "staff", staffId: m.id, loyalty: -14, ambition: 12 }, { kind: "mediaRep", delta: 1 }], result: `He nodded. The writing may be on the wall.` }
        ]
      });
    }
  },
  {
    w: 2,
    phase: ["regular"],
    gen: (s) => {
      const ps = teamPlayers(s, s.user.teamId);
      const p = pickPlayer(ps, (x) => !!x.injury && x.injury.games >= 2 && x.ovr >= 60);
      if (!p) return null;
      return mk(s, {
        from: "Head Athletic Trainer",
        fromRole: "Sports Medicine",
        subject: `${p.first} ${p.last} wants to play through it`,
        body: `${p.first} (${p.injury.type.toLowerCase()}) is begging to play this week. Medically, he's not 100%. Rushing him back risks a setback.`,
        personId: p.id,
        personKind: "player",
        choices: [
          (() => {
            const bad = rng.chance(0.35);
            return { label: "Clear him to play", hint: "Back now; re-injury risk", effects: bad ? [{ kind: "injury", target: p.id, games: p.injury.games + 4 }, { kind: "morale", target: p.id, delta: -6 }] : [{ kind: "injury", target: p.id, games: 0 }, { kind: "morale", target: p.id, delta: 6 }], result: bad ? `He tweaked it again in warmups. Setback.` : `He's back \u2014 and he looks great.` };
          })(),
          { label: "Follow the medical timeline", hint: "Safe", effects: [{ kind: "morale", target: p.id, delta: -2 }, { kind: "mediaRep", delta: 1 }], result: `He's frustrated but will be healthy for the stretch run.` }
        ]
      });
    }
  },
  {
    w: 2,
    phase: ["regular", "preseason"],
    gen: (s) => {
      const team = s.teams[s.user.teamId];
      return mk(s, {
        from: "Collective Director",
        fromRole: `${team.school} NIL Collective`,
        subject: "Donor drive weekend?",
        body: `We want to host a donor gala and a youth camp this weekend. You'd need to give up a practice day and a chunk of your recruiting calendar, but the collective could raise real money.`,
        choices: [
          { label: "Do the gala and the camp", hint: "+NIL budget, \u2212hours, \u2212practice", effects: [{ kind: "nilBudget", delta: roundMoney(team.nilBudget * 0.08 + 4e4) }, { kind: "hours", delta: -12 }, { kind: "morale", target: "team", delta: -1 }], result: `Big night. The collective is flush.` },
          { label: "Just the gala", hint: "Smaller boost", effects: [{ kind: "nilBudget", delta: roundMoney(team.nilBudget * 0.04 + 15e3) }, { kind: "hours", delta: -5 }], result: "You shook a lot of hands." },
          { label: "Not this week", hint: "No change", effects: [], result: "Maybe next time." }
        ]
      });
    }
  },
  {
    w: 2,
    phase: ["regular"],
    gen: (s) => {
      const ps = teamPlayers(s, s.user.teamId).filter((p2) => p2.cls === "FR" && p2.stats.gp <= 3 && !p2.redshirting);
      const p = pickPlayer(ps);
      if (!p) return null;
      return mk(s, {
        from: "Director of Player Personnel",
        fromRole: "Staff",
        subject: `Redshirt ${p.first} ${p.last}?`,
        body: `${p.first} (${p.ovr} OVR, ${p.pot} POT) has barely played. We could redshirt him to preserve a year of eligibility and let him develop.`,
        personId: p.id,
        personKind: "player",
        choices: [
          { label: "Redshirt him", hint: "Out for the season; extra year", effects: [{ kind: "morale", target: p.id, delta: -3 }], result: `${p.first} will redshirt this season.` },
          { label: "Keep him active", hint: "No change", effects: [{ kind: "morale", target: p.id, delta: 2 }], result: "He stays available." }
        ]
      });
    }
  }
];
function maybeWeeklyEvent(state) {
  const pending = state.inbox.filter((i) => !i.resolved).length;
  if (pending >= 3) return null;
  if (!rng.chance(0.42)) return null;
  const phase = state.phase === "preseason" ? "preseason" : state.phase === "regular" ? "regular" : "any";
  const pool = GENERATORS.filter((g) => g.phase.includes(phase) || g.phase.includes("any"));
  for (let i = 0; i < 4; i++) {
    const g = rng.weighted(pool, pool.map((x) => x.w));
    const ev = g.gen(state);
    if (ev) {
      if (ev.subject.startsWith("Redshirt") && ev.personId) {
        ev.choices[0].redshirt = ev.personId;
      }
      state.inbox.unshift(ev);
      return ev;
    }
  }
  return null;
}
function welcomeInbox(state) {
  const team = state.teams[state.user.teamId];
  const ad = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
  state.inbox.unshift(mk(state, {
    from: ad,
    fromRole: "Athletic Director",
    subject: `Welcome to ${team.school}, Coach`,
    body: `Welcome aboard. Our expectation for this season: ${state.user.expectation.toLowerCase()}. Your basketball NIL + revenue-share pool is ${fmtMoney(team.nilBudget)} this year. Recruit hard, keep our players happy, and win. My door is always open.`,
    choices: [
      { label: "Let's get to work.", effects: [{ kind: "security", delta: 1 }], result: "The AD nods approvingly." },
      { label: "Ask for a bigger NIL pool", hint: "Small chance of more money", effects: rng.chance(0.4) ? [{ kind: "nilBudget", delta: roundMoney(team.nilBudget * 0.1) }] : [{ kind: "security", delta: -1 }], result: "We will see what we can do." }
    ],
    priority: true
  }));
}

// src/engine/realignment.ts
var MAX = { 1: 18, 2: 14, 3: 14, 4: 12 };
var MAX_CHAOS = { 1: 20, 2: 16, 3: 14, 4: 12 };
var MIN = { 1: 10, 2: 9, 3: 8, 4: 7 };
var PRESTIGE_FOR = { 1: 55, 2: 40, 3: 25, 4: 0 };
var LOCKED = /* @__PURE__ */ new Set(["ivy", "swac", "meac"]);
var REACH = { 1: 24, 2: 16, 3: 12, 4: 10 };
function realignMode(state) {
  return state.settings.realignment ?? "off";
}
function book(state) {
  return state.realign ??= { moves: [] };
}
function pendingMoves(state) {
  return (state.realign?.moves ?? []).filter((m) => m.status === "pending");
}
function newcomer(state, teamId) {
  return (state.realign?.moves ?? []).some((m) => m.teamId === teamId && m.status === "done" && m.effective === state.season);
}
function info(state, membership) {
  const out = /* @__PURE__ */ new Map();
  for (const c of state.conferences) out.set(c.id, { c, members: [], size: 0, lat: 0, lng: 0, prestige: 0 });
  for (const t of Object.values(state.teams)) {
    const ci = out.get(membership[t.id]);
    if (!ci) continue;
    ci.members.push(t);
  }
  for (const ci of out.values()) {
    ci.size = ci.members.length;
    if (!ci.size) continue;
    ci.lat = ci.members.reduce((s, t) => s + t.lat, 0) / ci.size;
    ci.lng = ci.members.reduce((s, t) => s + t.lng, 0) / ci.size;
    ci.prestige = ci.members.reduce((s, t) => s + t.prestige, 0) / ci.size;
  }
  return out;
}
var dist = (t, ci) => Math.hypot(t.lat - ci.lat, (t.lng - ci.lng) * 0.8);
function recentForm(t) {
  const h2 = t.history.slice(-3);
  return h2.length ? h2.reduce((s, x) => s + x.rating, 0) / h2.length : t.rating;
}
function appeal(t, ci) {
  return t.prestige + recentForm(t) * 1.5 + t.market * 2 - dist(t, ci) * 2.2 + rng.normal(0, 4);
}
function planRealignment(state) {
  const mode = realignMode(state);
  if (mode === "off") return;
  const B = book(state);
  if (pendingMoves(state).length) return;
  if (!rng.chance(mode === "chaos" ? 0.85 : 0.4)) return;
  const max2 = mode === "chaos" ? MAX_CHAOS : MAX;
  const membership = {};
  for (const t of Object.values(state.teams)) membership[t.id] = t.conf;
  const moving = /* @__PURE__ */ new Set();
  const moves = [];
  const effective = state.season + 1;
  const move = (t, to, kind, reason) => {
    const from = membership[t.id];
    moves.push({ id: rng.id("rl"), teamId: t.id, from, to, season: state.season, effective, kind, reason, status: "pending", userChoice: t.id === state.user.teamId || void 0 });
    membership[t.id] = to;
    moving.add(t.id);
  };
  const raids = mode === "chaos" ? rng.int(2, 5) : rng.chance(0.3) ? 2 : 1;
  for (let i = 0; i < raids; i++) {
    const ci = info(state, membership);
    const raiders = [...ci.values()].filter((x) => x.size > 0 && x.size < max2[x.c.tier] && x.c.tier <= 3 && !LOCKED.has(x.c.id));
    if (!raiders.length) break;
    const raider = rng.weighted(raiders, raiders.map((x) => [0, 5, 3, 1.5, 0][x.c.tier] ?? 1));
    const lateral = raider.c.tier === 1 && rng.chance(mode === "chaos" ? 0.45 : 0.15);
    const fromTier = lateral ? raider.c.tier : raider.c.tier + 1;
    const pool = Object.values(state.teams).filter((t) => {
      if (moving.has(t.id) || membership[t.id] === raider.c.id) return false;
      const own = ci.get(membership[t.id]);
      if (!own || own.c.tier !== fromTier || LOCKED.has(own.c.id) || own.size - 1 < MIN[own.c.tier] - (mode === "chaos" ? 1 : 0)) return false;
      if (dist(t, raider) > REACH[raider.c.tier] * (mode === "chaos" ? 1.25 : 1)) return false;
      if (t.prestige < PRESTIGE_FOR[raider.c.tier]) return false;
      if (lateral && !(raider.prestige > own.prestige + 2 && dist(t, raider) < dist(t, own))) return false;
      return true;
    });
    if (!pool.length) continue;
    const pick = pool.map((t) => ({ t, a: appeal(t, raider) })).sort((x, y) => y.a - x.a).slice(0, 3);
    const chosen = rng.weighted(pick, pick.map((_, k) => [5, 3, 2][k])).t;
    const fromName = state.conferences.find((c) => c.id === membership[chosen.id])?.short ?? "";
    move(chosen, raider.c.id, lateral ? "lateral" : "up", lateral ? `${raider.c.short} poaches ${chosen.school} from the ${fromName}: more money, a better footprint.` : `${raider.c.short} adds ${chosen.school} from the ${fromName} to grow its brand.`);
  }
  for (let pass = 0; pass < 4; pass++) {
    const ci = info(state, membership);
    const short = [...ci.values()].filter((x) => x.size > 0 && x.size < MIN[x.c.tier] && x.c.tier <= 3 && !LOCKED.has(x.c.id));
    if (!short.length) break;
    for (const x of short) {
      const need = MIN[x.c.tier] - x.size;
      for (let k = 0; k < need; k++) {
        const below = Object.values(state.teams).filter((t) => {
          const own = ci.get(membership[t.id]);
          return !moving.has(t.id) && own?.c.tier === x.c.tier + 1 && !LOCKED.has(own.c.id) && own.size - 1 >= MIN[own.c.tier] - 1 && dist(t, x) <= REACH[x.c.tier] * 1.4;
        });
        const qualified = below.filter((t) => t.prestige >= PRESTIGE_FOR[x.c.tier] - 5);
        const pool = qualified.length ? qualified : below;
        if (!pool.length) break;
        const best = pool.map((t) => ({ t, a: appeal(t, x) })).sort((p, q2) => q2.a - p.a)[0].t;
        move(best, x.c.id, "backfill", `The ${x.c.short} backfills after losing members, adding ${best.school}.`);
      }
    }
  }
  if (!moves.length) return;
  B.moves.push(...moves);
  announce(state, moves);
}
function announce(state, moves) {
  const conf2 = (id) => state.conferences.find((c) => c.id === id);
  const uid = state.user.teamId;
  const userConf = state.teams[uid].conf;
  for (const m of moves) {
    const t = state.teams[m.teamId];
    if (m.userChoice) continue;
    addNews(state, {
      kind: "feature",
      headline: `BREAKING: ${t.school} is leaving the ${conf2(m.from)?.short} for the ${conf2(m.to)?.short}`,
      body: `${m.reason} The move takes effect in ${m.effective}-${String((m.effective + 1) % 100).padStart(2, "0")}.`,
      teams: [m.teamId],
      important: m.from === userConf || m.to === userConf
    });
  }
  addNews(state, { kind: "feature", headline: `Realignment: ${moves.length} school${moves.length > 1 ? "s" : ""} on the move`, body: moves.map((m) => `${state.teams[m.teamId].school}: ${conf2(m.from)?.short} \u2192 ${conf2(m.to)?.short}`).join("; ") + ".", teams: moves.map((m) => m.teamId).slice(0, 5) });
  const mine = moves.find((m) => m.userChoice);
  if (mine) {
    const to = conf2(mine.to), from = conf2(mine.from);
    const up = to.tier < from.tier, side = to.tier === from.tier;
    state.inbox.unshift({
      id: `realign-${mine.id}`,
      day: state.day,
      season: state.season,
      from: "Athletic Director",
      fromRole: "Administration",
      resolved: false,
      priority: true,
      subject: `The ${to.short} wants ${state.teams[uid].school}`,
      body: `We've received a formal invitation to join the ${to.name}, starting next season. ${up ? `It's a step up: bigger TV money, a bigger NIL pool, tougher games every night.` : side ? `It's a lateral move, but the money and the footprint are better.` : `It's a different neighborhood, and the travel will be brutal.`} The board will follow your lead. If you don't weigh in before we build next year's schedule, I'm accepting.`,
      choices: [
        { label: `Accept: we're joining the ${to.short}`, hint: up ? "Bigger NIL pool and prestige, tougher conference" : "New conference next season", effects: [{ kind: "hype", delta: 6 }], realign: { moveId: mine.id, accept: true }, result: `It's done: ${state.teams[uid].school} joins the ${to.short} next season.` },
        { label: `Decline: we're staying in the ${from.short}`, hint: "Loyalty pleases the old guard", effects: [{ kind: "mediaRep", delta: 3 }, { kind: "security", delta: 2 }], realign: { moveId: mine.id, accept: false }, result: `${state.teams[uid].school} is staying in the ${from.short}.` }
      ]
    });
    addNews(state, { kind: "user", headline: `Report: the ${to.short} has invited ${state.teams[uid].school}`, body: `Sources say ${state.teams[uid].school} has an offer to join the ${to.name}. A decision is expected before the summer.`, teams: [uid], important: true });
  }
}
function applyRealignment(state) {
  const due = pendingMoves(state).filter((m) => m.effective <= state.season + 1);
  if (!due.length) return;
  const conf2 = (id) => state.conferences.find((c) => c.id === id);
  const uid = state.user.teamId;
  for (const m of due) {
    const item2 = state.inbox.find((i) => i.id === `realign-${m.id}` && !i.resolved);
    if (item2) {
      item2.resolved = true;
      item2.chosen = 0;
    }
    const t = state.teams[m.teamId];
    if (!t) {
      m.status = "declined";
      continue;
    }
    const from = conf2(m.from), to = conf2(m.to);
    if (!from || !to) {
      m.status = "declined";
      continue;
    }
    for (const r of rivalriesOf(state, t.id)) {
      const other2 = r.a === t.id ? r.b : r.a;
      if (state.teams[other2]?.conf === m.from) addHeat(state, t.id, other2, 8, { kind: "game", text: `${t.school} left the ${from.short}, and its old rivals took it personally.` });
    }
    t.conf = m.to;
    t.prestige = clamp(t.prestige + (to.tier < from.tier ? 3 : to.tier > from.tier ? -3 : 1), 1, 99);
    if (to.tier < from.tier) t.hype = clamp(t.hype + 6, 0, 100);
    m.status = "done";
    if (t.id === uid) state.user.moments.push({ kind: "conference", teamId: uid, from: m.from, to: m.to });
  }
  const done2 = due.filter((m) => m.status === "done");
  if (done2.length) addNews(state, { kind: "feature", headline: `It's official: realignment takes effect`, body: done2.map((m) => `${state.teams[m.teamId].school} is now in the ${conf2(m.to)?.short}`).join("; ") + ".", teams: done2.map((m) => m.teamId).slice(0, 5), important: done2.some((m) => m.teamId === uid || state.teams[uid].conf === m.to || m.from === state.teams[uid].conf) });
}

// src/engine/press.ts
var ROLE_LABEL = {
  beat: "Beat writer",
  national: "National insider",
  tv: "Local TV",
  student: "Student radio",
  analytics: "Analytics",
  columnist: "Columnist",
  opp: "Visiting beat writer"
};
var PAPERS = ["Courier", "Tribune", "Herald", "Gazette", "Ledger", "Press", "Star", "Journal", "Register", "Times"];
var COLUMNISTS = [
  { name: "Bill Hargrove", outlet: "The Athletic Wire" },
  { name: "Tasha Whitlock", outlet: "The Morning Ledger" },
  { name: "Greg Lindqvist", outlet: "Full Court Press" }
];
var ANALYSTS2 = [
  { name: "Priya Natarajan", outlet: "Hoops Insider Analytics" },
  { name: "Sam Okafor", outlet: "The Bracket Report" },
  { name: "Jonah Feld", outlet: "Box Score Media" }
];
function hash5(s) {
  let h2 = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h2 ^= s.charCodeAt(i);
    h2 = Math.imul(h2, 16777619);
  }
  return h2 >>> 0;
}
function localName(seed) {
  const h2 = hash5(seed);
  return `${FIRST_NAMES[h2 % FIRST_NAMES.length]} ${LAST_NAMES[(h2 >>> 9) % LAST_NAMES.length]}`;
}
function beatWriter(t) {
  const h2 = hash5(`beat:${t.id}`);
  return { reporter: localName(`beat:${t.id}`), outlet: `The ${t.city} ${PAPERS[h2 % PAPERS.length]}` };
}
function reporterFor(role, team, opp) {
  switch (role) {
    case "beat":
      return beatWriter(team);
    case "opp":
      return beatWriter(opp ?? team);
    case "tv": {
      const h2 = hash5(`tv:${team.id}`);
      return { reporter: localName(`tv:${team.id}`), outlet: `${["Channel 4", "Channel 7", "Channel 11", "Channel 13", "News 9", "Fox 5"][h2 % 6]} Sports` };
    }
    case "student":
      return { reporter: localName(`student:${team.id}:${rng.int(0, 2)}`), outlet: `${team.school} Student Radio` };
    case "analytics": {
      const a = rng.pick(ANALYSTS2);
      return { reporter: a.name, outlet: a.outlet };
    }
    case "columnist": {
      const c = rng.pick(COLUMNISTS);
      return { reporter: c.name, outlet: c.outlet };
    }
    default: {
      const i = rng.pick(INSIDERS);
      return { reporter: i.name, outlet: i.outlet };
    }
  }
}
var A = (tone, text, effects, claim) => claim ? { tone, text, effects, claim } : { tone, text, effects };
var v = (...xs) => rng.pick(xs);
var cap2 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
var ord2 = (n) => {
  const s = ["th", "st", "nd", "rd"], m = n % 100;
  return n + (s[(m - 20) % 10] || s[m] || s[0]);
};
var nm = (p) => `${p.first} ${p.last}`;
var plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
var list = (xs) => xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
function makeQ(team, o, text, answers) {
  const r = reporterFor(o.role, team, o.opp);
  const out = { ...r, text, answers, role: o.role === "opp" && o.opp ? `${o.opp.abbr} beat writer` : ROLE_LABEL[o.role] };
  if (o.tag) out.tag = o.tag;
  if (o.quote) out.quote = o.quote;
  return out;
}
function pressMemory(state) {
  if (!state.user.pressMemory) state.user.pressMemory = { asked: [], claims: [] };
  return state.user.pressMemory;
}
function recency(state, key) {
  const a = pressMemory(state).asked.find((x) => x.key === key);
  if (!a) return 1;
  if (a.season === state.season) return state.day - a.day < 10 ? 0.05 : 0.2;
  if (a.season === state.season - 1) return 0.6;
  return 1;
}
function choose(state, cands, n) {
  const out = [];
  const topics = /* @__PURE__ */ new Set();
  for (const c of cands.filter((x) => x.lead).sort((a, b) => b.w - a.w)) {
    if (out.length >= n) break;
    if (topics.has(c.topic)) continue;
    out.push(c);
    topics.add(c.topic);
  }
  let pool = cands.filter((c) => !c.lead && !topics.has(c.topic) && c.w > 0);
  while (out.length < n && pool.length) {
    const c = rng.weighted(pool, pool.map((x) => x.w * recency(state, x.key)));
    out.push(c);
    topics.add(c.topic);
    pool = pool.filter((x) => !topics.has(x.topic));
  }
  const mem = pressMemory(state);
  const qs = [];
  for (const c of out) {
    mem.asked = [{ key: c.key, season: state.season, day: state.day }, ...mem.asked.filter((a) => a.key !== c.key)].slice(0, 150);
    c.onAsk?.();
    qs.push({ ...c.build(), key: c.key });
  }
  return qs;
}
function openClaims(state, kinds, f = () => true) {
  return pressMemory(state).claims.filter((c) => !c.followed && kinds.includes(c.kind) && f(c));
}
function quoteOf(state, c) {
  const said = c.said ?? c.season;
  return { text: c.text, when: said === state.season ? cap2(c.when) : `${cap2(c.when)}, ${seasonLabel(said)}` };
}
var IN_SEASON3 = ["preseason", "regular", "confTourney", "selection", "ncaa"];
function ctxFor(state) {
  const team = state.teams[state.user.teamId];
  const coach = state.coaches[state.user.coachId];
  const players = teamPlayers(state, team.id).sort((a, b) => b.ovr - a.ovr);
  const hist = team.history;
  const inSeason = IN_SEASON3.includes(state.phase);
  const prior = hist.filter((h2) => inSeason ? h2.season < state.season : h2.season <= state.season);
  const last = prior[prior.length - 1];
  const mem = pressMemory(state);
  const recap = mem.recap && mem.recap.season === state.season - 1 && mem.recap.teamId === team.id ? mem.recap : void 0;
  let drought = 0;
  for (let i = prior.length - 1; i >= 0; i--) {
    if (prior[i].ncaaSeed != null) break;
    drought++;
  }
  return {
    state,
    team,
    coach,
    uid: team.id,
    conf: state.conferences.find((c) => c.id === team.conf),
    players,
    star: players[0],
    tenure: coach.career.filter((c) => c.teamId === team.id && c.season < state.season).length,
    last,
    recap,
    drought: prior.length >= 2 ? drought : 0
  };
}
function nbaRank(state, p) {
  const mine = draftScore(p);
  let rank = 1;
  for (const o of Object.values(state.players)) if (o.teamId && o.id !== p.id && draftScore(o) > mine) rank++;
  return rank;
}
function nbaLabel(rank) {
  return rank <= 5 ? "a top-five pick" : rank <= 14 ? "a lottery pick" : rank <= 30 ? "a first-round pick" : "a second-round pick";
}
function selectionRank(state, teamId) {
  const sorted = Object.values(state.teams).sort((a, b) => selectionScore(b) - selectionScore(a));
  return sorted.findIndex((t) => t.id === teamId) + 1;
}
function rivalOf(state, a, b) {
  return rivalryOf(state, a, b);
}
function confName(c) {
  return c.conf?.short ?? "league";
}
function postseasonPhrase(h2) {
  if (!h2.postseason) return h2.ncaaSeed ? "in the NCAA Tournament" : "without an NCAA bid";
  if (h2.postseason === "Champion") return "with a national championship";
  if (h2.postseason === "Runner-up") return "in the national championship game";
  return `in the ${h2.postseason}`;
}
var DEEP = ["Final Four", "Runner-up", "Champion"];
function loreCands(state, c, kind) {
  const { team } = c;
  const lore = loreOf(team.id);
  const out = [];
  const dyn = state.champions.filter((x) => x.teamId === team.id).map((x) => x.season + 1);
  const titles = [...lore?.titles ?? [], ...dyn].sort((a, b) => a - b);
  const lastTitle = titles[titles.length - 1];
  const nowYear = state.season + 1;
  if (titles.length) {
    const drought = nowYear - lastTitle;
    out.push({
      key: `${kind}.lore.titles`,
      topic: "tradition",
      w: kind === "intro" ? 9 : 5,
      lead: kind === "intro",
      build: () => makeQ(team, { role: kind === "intro" ? "columnist" : "national", tag: "Program history" }, kind === "intro" ? v(`${team.school} has ${plural(titles.length, "national championship")}. Some coaches call that kind of history a burden. Is it?`, `There are ${plural(titles.length, "national title banner")} hanging in ${team.arena}. How do you live up to that?`) : drought >= 15 ? `${team.school}'s last national title came in ${lastTitle}. That's ${drought} years. Is this the team that ends the wait?` : drought <= 2 ? `This program won it all in ${lastTitle}. How do you keep the standard from slipping?` : v(`${plural(titles.length, "national championship banner")} hang in this building. Does this group have what it takes to add another?`, `The last banner went up in ${lastTitle}. What's missing between this team and the next one?`), [
        A("confident", kind === "intro" ? `It's the reason I took the job. You come here to hang banners, and that's what we're going to do.` : `We have the pieces. I expect us to be playing on the last weekend.`, [{ kind: "hype", delta: 6 }, { kind: "recruitInterest", delta: 2 }, { kind: "security", delta: -2 }], { kind: "deepRun" }),
        A("humble", `Those banners were earned by great teams. Nobody hands you one. We have to earn our own.`, [{ kind: "mediaRep", delta: 3 }, { kind: "security", delta: 2 }]),
        A("praise", `That's why you come to ${team.school}. You don't run from that history. You embrace it, and you show it to every recruit who walks in.`, [{ kind: "hype", delta: 3 }, { kind: "recruitInterest", delta: 3 }])
      ])
    });
  }
  const crowd = lore?.students ? `the ${lore.students}` : lore?.fans ?? (lore?.arenaNick ? `the crowd at ${lore.arenaNick}` : void 0);
  if (lore && crowd) {
    const place2 = lore.arenaNick ?? team.arena;
    out.push({
      key: `${kind}.lore.crowd`,
      topic: "crowd",
      w: kind === "intro" ? 6 : 4,
      build: () => makeQ(team, { role: kind === "intro" ? "tv" : "student" }, kind === "intro" ? `What's your message to ${crowd}?` : v(`What does ${crowd} mean for this team on a big night?`, `Opponents talk about how hard it is to play in ${place2}. Is that a real advantage?`), [
        A("praise", `They're the best in the country, and they're worth points every night. We feel them.`, [{ kind: "hype", delta: 5 }, { kind: "mediaRep", delta: 2 }]),
        A("joke", `I've told our guys: if you can't get fired up in ${place2}, check your pulse.`, [{ kind: "hype", delta: 3 }, { kind: "mediaRep", delta: 3 }]),
        A("confident", kind === "intro" ? `Fill it up. We're going to give you a team worth screaming for.` : `It's a fortress, and we intend to keep it that way.`, [{ kind: "hype", delta: 6 }, { kind: "morale", target: "team", delta: 2 }])
      ])
    });
  }
  if (kind === "md") {
    const fresh2 = retiredJerseys(state, team.id).filter((r) => r.season === state.season - 1).pop();
    const coachedHim = fresh2 && state.players[fresh2.playerId]?.career.some((l) => l.teamId === team.id && state.coaches[state.user.coachId].career.some((cc) => cc.teamId === team.id && cc.season === l.season));
    if (fresh2) {
      out.push({
        key: "md.lore.retire",
        topic: "legend",
        w: coachedHim ? 10 : 6,
        lead: !!coachedHim,
        build: () => makeQ(team, { role: "beat", tag: "Ring of Honor" }, coachedHim ? `${fresh2.name}'s No. ${fresh2.num} goes up in the rafters this season. What will that night mean to you?` : `${fresh2.name}'s No. ${fresh2.num} is being retired this season. What does a player like that mean to a program?`, [
          A("praise", `He gave everything to this place. Seeing that jersey up there is going to be emotional for all of us.`, [{ kind: "mediaRep", delta: 4 }, { kind: "hype", delta: 3 }]),
          A("confident", `Every recruit who walks in is going to look up and see what's possible here.`, [{ kind: "recruitInterest", delta: 4 }, { kind: "hype", delta: 2 }]),
          A("joke", `I told him if he wants it to stay up there, he has to come back and guard our scout team.`, [{ kind: "hype", delta: 3 }, { kind: "mediaRep", delta: 3 }])
        ])
      });
    } else {
      const legends = ringOfHonor(state, team.id);
      if (legends.length && c.star) {
        const leg = rng.pick(legends);
        const star = c.star;
        out.push({
          key: "md.lore.legend",
          topic: "legend",
          w: 4,
          build: () => makeQ(team, { role: "columnist", tag: "Ring of Honor" }, `${leg.name}${leg.nickname ? ` ("${leg.nickname}")` : ""} wore No. ${leg.num} here in ${leg.era}, and it hangs in the rafters now. Does this roster have anyone who could join him?`, [
            A("confident", `${nm(star)} has that kind of talent. If he keeps working, I wouldn't bet against it.`, [{ kind: "morale", target: star.id, delta: 6 }, { kind: "hype", delta: 3 }], { kind: "allAmerican", subject: star.id }),
            A("humble", `Those jerseys take years to earn. Nobody gets up there on talent alone.`, [{ kind: "mediaRep", delta: 3 }, { kind: "morale", target: "team", delta: 1 }]),
            A("praise", `Guys like ${leg.name.split(" ")[1] ?? leg.name} built this place. Our players know the history, and they know what's expected.`, [{ kind: "hype", delta: 2 }, { kind: "recruitInterest", delta: 2 }])
          ])
        });
      }
    }
  }
  return out;
}
function introPresser(state, opts = {}) {
  const c = ctxFor(state);
  const { team, coach } = c;
  const from = opts.fromTeamId ? state.teams[opts.fromTeamId] : void 0;
  const yearsAtOld = from ? coach.career.filter((x) => x.teamId === from.id).length : 0;
  const cands = [];
  cands.push({
    key: "intro.why",
    topic: "why",
    w: 10,
    lead: true,
    build: () => makeQ(team, { role: "beat" }, from && !opts.fired ? v(`You leave ${from.school} after ${plural(yearsAtOld, "season")}. Why ${team.school}, and why now?`, `Coach, ${from.school} fans are stunned this morning. What made ${team.school} the job you couldn't turn down?`) : from && opts.fired ? v(`Coach, a few weeks ago you were let go at ${from.school}. What made ${team.school} the right place to start over?`, `It's been a whirlwind few weeks since ${from.school}. Why is ${team.school} the right fit?`) : v(`Coach, welcome to ${team.school}. What made this the right job for you?`, `Coach, why ${team.school}? What sold you on this place?`, `You had options. Why did you choose ${team.school}?`), [
      A("humble", v(`This place has a proud history. I'm just grateful for the opportunity and ready to work.`, `The people. From the first phone call, it felt like home. I'm honored to be here.`), [{ kind: "mediaRep", delta: 4 }, { kind: "security", delta: 2 }]),
      A("confident", v(`We didn't come here to rebuild. We came here to win, and win big.`, `I believe you can win big here, right away. I wouldn't have come otherwise.`), [{ kind: "hype", delta: 8 }, { kind: "security", delta: -2 }, { kind: "recruitInterest", delta: 3 }], { kind: "beatExpect" }),
      A("joke", v(`Honestly? The barbecue. And the fans. Mostly the barbecue.`, `My wife said yes before I did. I just signed where she told me to.`), [{ kind: "hype", delta: 4 }, { kind: "mediaRep", delta: 3 }])
    ])
  });
  const leftClaim = from ? openClaims(state, ["notLeaving"], (x) => x.teamId === from.id && x.season >= state.season)[0] : void 0;
  if (leftClaim) {
    cands.push({
      key: "intro.notLeaving",
      topic: "loyalty",
      w: 12,
      lead: true,
      onAsk: () => {
        leftClaim.followed = true;
      },
      build: () => makeQ(team, { role: "columnist", tag: "Follow-up", quote: quoteOf(state, leftClaim) }, `Not long ago you told us you weren't going anywhere. What changed?`, [
        A("humble", `I meant it when I said it. Then a once-in-a-lifetime opportunity came along, and I owe it to my family to take it.`, [{ kind: "mediaRep", delta: 1 }, { kind: "hype", delta: 2 }]),
        A("joke", `I wasn't going anywhere... until I was. That's coaching.`, [{ kind: "mediaRep", delta: -1 }, { kind: "hype", delta: 3 }]),
        A("deflect", `I'm focused on ${team.school}. That's all I'm going to say about it.`, [{ kind: "mediaRep", delta: -3 }])
      ])
    });
  }
  if (from) {
    cands.push({
      key: opts.fired ? "intro.fired" : "intro.oldFans",
      topic: "past",
      w: 7,
      build: () => opts.fired ? makeQ(team, { role: "national", tag: "Your past" }, `What did you learn from how things ended at ${from.school}?`, [
        A("humble", `A lot. I made mistakes, and I own them. I'm a better coach today because of it.`, [{ kind: "mediaRep", delta: 4 }, { kind: "security", delta: 2 }]),
        A("fiery", `That I'm going to prove some people very wrong.`, [{ kind: "hype", delta: 5 }, { kind: "morale", target: "team", delta: 2 }, { kind: "mediaRep", delta: -1 }]),
        A("deflect", `That chapter's closed. I'm only looking forward.`, [{ kind: "mediaRep", delta: -1 }])
      ]) : makeQ(team, { role: "national", tag: "Your past" }, `What's your message to ${from.school} fans who feel let down this morning?`, [
        A("praise", `Thank you. Those were some of the best years of my life, and those players will always be family.`, [{ kind: "mediaRep", delta: 3 }]),
        A("humble", `I understand the frustration. I hope in time they'll see this was right for everyone.`, [{ kind: "mediaRep", delta: 2 }]),
        A("confident", `I'm a ${team.mascot} now. All in. That's my message.`, [{ kind: "hype", delta: 5 }, { kind: "mediaRep", delta: -2 }])
      ])
    });
  }
  if (coach.almaMater && (coach.almaMater === team.id || coach.almaMater === team.school)) {
    cands.push({
      key: "intro.home",
      topic: "home",
      w: 9,
      build: () => makeQ(team, { role: "tv" }, `You played here. What does it mean to come home and lead this program?`, [
        A("humble", `Everything. I walked these halls as a player. Now I get to give back to the place that made me.`, [{ kind: "hype", delta: 6 }, { kind: "mediaRep", delta: 3 }]),
        A("fiery", `I know what this program should be, because I lived it. We're going to get it back there.`, [{ kind: "hype", delta: 8 }, { kind: "security", delta: -1 }]),
        A("joke", `Same gym, same locker room. Thankfully, they upgraded the showers.`, [{ kind: "hype", delta: 4 }, { kind: "mediaRep", delta: 3 }])
      ])
    });
  }
  if (c.last) {
    const h2 = c.last;
    const good = DEEP.includes(h2.postseason) || h2.postseason === "Elite Eight" || h2.postseason === "Sweet 16" || h2.w - h2.l >= 8;
    const middling = !good && h2.w > h2.l && h2.ncaaSeed != null;
    cands.push({
      key: good ? "intro.inheritGood" : middling ? "intro.inheritMid" : "intro.inherit",
      topic: "program",
      w: 8,
      lead: true,
      build: () => middling ? makeQ(team, { role: "beat", tag: "Last season" }, `This program went ${h2.w}-${h2.l} and made the tournament last year. What's the next step?`, [
        A("confident", `The second weekend, and beyond. We're not here to just make the field.`, [{ kind: "hype", delta: 5 }, { kind: "security", delta: -2 }], { kind: "beatExpect" }),
        A("humble", `Build on what's here. There's a good foundation, and I want to respect it.`, [{ kind: "mediaRep", delta: 3 }, { kind: "security", delta: 2 }]),
        A("fiery", `Good isn't the goal. We're chasing great.`, [{ kind: "hype", delta: 4 }, { kind: "morale", target: "team", delta: 1 }])
      ]) : good ? makeQ(team, { role: "beat", tag: "Last season" }, `You're taking over a team that went ${h2.w}-${h2.l} and finished ${postseasonPhrase(h2)}. Is the pressure on to keep it going?`, [
        A("confident", `Pressure is a privilege. We're going to build on it, not just maintain it.`, [{ kind: "hype", delta: 5 }, { kind: "security", delta: -1 }], { kind: "tourney" }),
        A("humble", `My predecessor did a great job. My job is to honor that and keep growing.`, [{ kind: "mediaRep", delta: 4 }, { kind: "security", delta: 2 }]),
        A("deflect", `Last year's team was last year's team. This is a new group.`, [{ kind: "mediaRep", delta: -1 }])
      ]) : makeQ(team, { role: "beat", tag: "Last season" }, `This program went ${h2.w}-${h2.l} last year${h2.ncaaSeed ? "" : " and missed the NCAA Tournament"}. How quickly can you turn it around?`, [
        A("confident", `We'll be dancing in March. Hold me to it.`, [{ kind: "hype", delta: 8 }, { kind: "security", delta: -3 }], { kind: "tourney" }),
        A("humble", `It'll take time to do it right. I'm here to build something that lasts.`, [{ kind: "security", delta: 3 }, { kind: "mediaRep", delta: 2 }]),
        A("fiery", `Losing stops now. Everybody in that locker room will feel the difference on day one.`, [{ kind: "hype", delta: 5 }, { kind: "morale", target: "team", delta: -1 }])
      ])
    });
  } else {
    cands.push({
      key: "intro.timeline",
      topic: "program",
      w: 6,
      build: () => makeQ(team, { role: "columnist" }, `What's a fair timeline to judge your work here?`, [
        A("confident", `Judge me in year one. I don't believe in rebuilding years.`, [{ kind: "hype", delta: 6 }, { kind: "security", delta: -3 }], { kind: "beatExpect" }),
        A("humble", `Give us three years. By then you'll know exactly who we are.`, [{ kind: "security", delta: 4 }, { kind: "mediaRep", delta: 2 }]),
        A("joke", `Judge me after I learn where the parking lot is.`, [{ kind: "mediaRep", delta: 3 }, { kind: "hype", delta: 2 }])
      ])
    });
  }
  cands.push({
    key: "intro.nil",
    topic: "nil",
    w: 6,
    build: () => makeQ(team, { role: "national" }, v(`How will you approach NIL and the transfer portal?`, `College basketball runs on NIL and the portal now. What's your philosophy?`), [
      A("confident", `We're going to be aggressive. Our collective is going to be one of the best in the country.`, [{ kind: "nilBudget", delta: 15e4 }, { kind: "hype", delta: 3 }]),
      A("humble", `Relationships first. The money matters, but development and culture matter more.`, [{ kind: "mediaRep", delta: 3 }, { kind: "recruitInterest", delta: 2 }]),
      A("deflect", `We'll be smart. I'm not going to get into specifics today.`, [{ kind: "mediaRep", delta: -1 }])
    ])
  });
  cands.push({
    key: "intro.fans",
    topic: "fans",
    w: 5,
    build: () => makeQ(team, { role: "tv" }, v(`What's your message to the fan base?`, `What do you want ${team.school} fans to know about you?`), [
      A("fiery", `Pack the gym. Every night. Make this the toughest place to play in America.`, [{ kind: "hype", delta: 7 }]),
      A("humble", `Be patient with us, and I promise we'll give you a team you're proud of.`, [{ kind: "security", delta: 3 }, { kind: "hype", delta: 2 }]),
      A("confident", `Clear your calendars for the first weekend in April.`, [{ kind: "hype", delta: 10 }, { kind: "security", delta: -4 }], { kind: "deepRun" })
    ])
  });
  if (c.star) {
    const s = c.star;
    cands.push({
      key: "intro.star",
      topic: "roster",
      w: 6,
      build: () => makeQ(team, { role: "beat" }, `${nm(s)} is the best player on this roster. Have you talked to him about sticking around?`, [
        A("praise", `We've talked. He's a big part of what we're building, and I told him that.`, [{ kind: "morale", target: s.id, delta: 7 }]),
        A("humble", `Every player in that room starts with a clean slate, including him.`, [{ kind: "morale", target: "team", delta: 2 }, { kind: "morale", target: s.id, delta: -3 }]),
        A("deflect", `I'll keep those conversations private.`, [{ kind: "mediaRep", delta: -1 }])
      ])
    });
  }
  cands.push({
    key: "intro.recruit",
    topic: "recruiting",
    w: 5,
    build: () => makeQ(team, { role: "beat" }, `What's your pitch to the top prospects in ${team.state}?`, [
      A("confident", `Stay home and build something special. You don't have to leave to win.`, [{ kind: "recruitInterest", delta: 3 }, { kind: "hype", delta: 2 }]),
      A("humble", `We'll develop you, we'll care about you, and we'll get you ready for the next level.`, [{ kind: "recruitInterest", delta: 2 }, { kind: "mediaRep", delta: 2 }]),
      A("joke", `I already know where every gym in this state is. I'm coming for you.`, [{ kind: "recruitInterest", delta: 2 }, { kind: "hype", delta: 2 }])
    ])
  });
  cands.push({
    key: "intro.style",
    topic: "style",
    w: 4,
    build: () => makeQ(team, { role: "tv" }, `What will your teams look like on the floor?`, [
      A("fiery", `We're going to guard. Every possession, for 40 minutes. That's non-negotiable.`, [{ kind: "morale", target: "team", delta: 1 }, { kind: "mediaRep", delta: 2 }]),
      A("confident", `Fast and fun. Fans are going to love watching us play.`, [{ kind: "hype", delta: 5 }]),
      A("humble", `We'll fit the system to our players, not the other way around.`, [{ kind: "morale", target: "team", delta: 3 }])
    ])
  });
  cands.push(...loreCands(state, c, "intro"));
  return { id: rng.id("pc"), title: "Introductory Press Conference", context: `You are introduced as the new head coach of ${team.school}. The cameras are rolling.`, when: "at your introductory press conference", questions: choose(state, cands, 4) };
}
function mediaDayPresser(state) {
  const c = ctxFor(state);
  const { team, coach } = c;
  const cands = [];
  const rank = team.apRank;
  cands.push({
    key: "md.poll",
    topic: "poll",
    w: 10,
    lead: true,
    build: () => makeQ(team, { role: "national" }, rank ? v(`The preseason poll has you at No. ${rank}. Your reaction?`, `No. ${rank} in the preseason AP poll. Does that number mean anything to you?`, `Voters put you at No. ${rank} to start the year. Too high, too low, or just right?`) : v(`The preseason poll doesn't have ${team.school} ranked. Your reaction?`, `Nobody has you in the preseason Top 25. Does that bother you?`), rank ? [
      A("humble", `Rankings in October don't mean anything. We haven't done anything yet.`, [{ kind: "mediaRep", delta: 3 }, { kind: "morale", target: "team", delta: 2 }]),
      A("confident", `We belong there. Honestly, we should be higher.`, [{ kind: "hype", delta: 6 }, { kind: "morale", target: "team", delta: 3 }, { kind: "security", delta: -2 }], { kind: "rankedHigher", subject: String(rank) }),
      A("deflect", `I'll let you guys worry about the polls.`, [{ kind: "mediaRep", delta: -1 }])
    ] : [
      A("fiery", `Good. Keep sleeping on us. We'll remember who wasn't on board.`, [{ kind: "morale", target: "team", delta: 5 }, { kind: "hype", delta: 5 }]),
      A("humble", `We have to earn it. That's fine with me.`, [{ kind: "mediaRep", delta: 3 }]),
      A("joke", `I checked twice. Thought it was a typo.`, [{ kind: "hype", delta: 3 }, { kind: "mediaRep", delta: 2 }])
    ])
  });
  cands.push({
    key: "md.expect",
    topic: "expect",
    w: 6,
    build: () => makeQ(team, { role: "beat" }, v(`Your AD has said the goal is to "${state.user.expectation.toLowerCase()}". Is that fair?`, `What are the expectations for this group? The AD's goal is "${state.user.expectation.toLowerCase()}".`), [
      A("confident", `We'll exceed that. This roster is built for March.`, [{ kind: "hype", delta: 6 }, { kind: "security", delta: -3 }], { kind: "beatExpect" }),
      A("humble", `That's fair. We'll take it one day at a time.`, [{ kind: "security", delta: 2 }]),
      A("deflect", `My expectations are internal. They stay in the locker room.`, [{ kind: "mediaRep", delta: -1 }, { kind: "morale", target: "team", delta: 1 }])
    ])
  });
  const h2 = c.last;
  const ran = !!h2 && h2.coachId === coach.id;
  if (h2 && ran) {
    const elim = c.recap?.elim ? state.teams[c.recap.elim.oppId] : void 0;
    const exceeded = c.recap?.achieved != null && c.recap.expectationLevel != null && c.recap.achieved > c.recap.expectationLevel;
    if (h2.postseason === "Champion") {
      cands.push({
        key: "md.ls.defend",
        topic: "lastSeason",
        w: 11,
        lead: true,
        build: () => makeQ(team, { role: "columnist", tag: "Last season" }, v(`You're the defending national champions. How do you handle being everybody's biggest game?`, `Last April you cut down the nets. How do you keep this group hungry?`), [
          A("confident", `We're not defending anything. We're going to go take another one.`, [{ kind: "hype", delta: 6 }, { kind: "morale", target: "team", delta: 3 }], { kind: "deepRun" }),
          A("humble", `That banner belongs to last year's team. This group hasn't won anything yet.`, [{ kind: "mediaRep", delta: 4 }, { kind: "morale", target: "team", delta: 2 }]),
          A("joke", `I'm still finding confetti in my car. Ask me again in November.`, [{ kind: "mediaRep", delta: 3 }, { kind: "hype", delta: 3 }])
        ])
      });
    } else if (DEEP.includes(h2.postseason)) {
      cands.push({
        key: "md.ls.f4",
        topic: "lastSeason",
        w: 10,
        lead: true,
        build: () => makeQ(team, { role: "columnist", tag: "Last season" }, `Last season ended ${postseasonPhrase(h2)}. Is anything short of that a disappointment now?`, [
          A("confident", `That's the standard now. We expect to be playing on the last weekend.`, [{ kind: "hype", delta: 6 }, { kind: "security", delta: -2 }], { kind: "deepRun" }),
          A("humble", `Every season is its own journey. We'll measure this team on its own terms.`, [{ kind: "mediaRep", delta: 3 }, { kind: "security", delta: 2 }]),
          A("fiery", `We came up short. That's the only thing anybody in our building remembers.`, [{ kind: "morale", target: "team", delta: 3 }, { kind: "hype", delta: 3 }])
        ])
      });
    } else if (h2.ncaaSeed != null && h2.ncaaSeed <= 4 && ["First Four", "Round of 64", "Round of 32"].includes(h2.postseason)) {
      cands.push({
        key: "md.ls.upset",
        topic: "lastSeason",
        w: 11,
        lead: true,
        build: () => makeQ(team, { role: "beat", tag: "Last season" }, `Last March you were a No. ${h2.ncaaSeed} seed and went out in the ${h2.postseason}${elim ? ` to ${elim.school}` : ""}. How much has that stuck with this group?`, [
          A("fiery", `Every day. We've watched that film more than I'd like to admit. It's fuel.`, [{ kind: "morale", target: "team", delta: 4 }, { kind: "hype", delta: 3 }]),
          A("humble", `It hurt. But one game doesn't define a season, and it won't define this one.`, [{ kind: "mediaRep", delta: 3 }, { kind: "morale", target: "team", delta: 2 }]),
          A("confident", `We'll be back in March, and we'll be ready this time.`, [{ kind: "hype", delta: 5 }, { kind: "security", delta: -2 }], { kind: "tourney" }),
          A("deflect", `That's last year. I'm not going to relive it today.`, [{ kind: "mediaRep", delta: -2 }])
        ])
      });
    } else if (h2.ncaaSeed == null) {
      cands.push({
        key: "md.ls.missed",
        topic: "lastSeason",
        w: 9,
        lead: true,
        build: () => makeQ(team, { role: "beat", tag: "Last season" }, v(`You went ${h2.w}-${h2.l} last year and missed the tournament. What has to change?`, `No NCAA bid last season at ${h2.w}-${h2.l}. Is this a tournament team?`), [
          A("confident", `This is a tournament team. Write it down.`, [{ kind: "hype", delta: 6 }, { kind: "security", delta: -2 }], { kind: "tourney" }),
          A("humble", `We got better in the offseason, but we have to prove it. Nobody owes us anything.`, [{ kind: "mediaRep", delta: 3 }, { kind: "security", delta: 1 }]),
          A("fiery", `Toughness. We lost too many close games. That's on me, and we've attacked it.`, [{ kind: "morale", target: "team", delta: 2 }, { kind: "security", delta: 2 }])
        ])
      });
    } else {
      cands.push({
        key: "md.ls.tourney",
        topic: "lastSeason",
        w: 7,
        lead: true,
        build: () => makeQ(team, { role: "beat", tag: "Last season" }, exceeded ? `Last year you beat expectations and finished ${postseasonPhrase(h2)}. Can you take another step?` : `Last season ended ${postseasonPhrase(h2)}${elim ? ` against ${elim.school}` : ""}. What's the next step for this program?`, [
          A("confident", `The next step is the second weekend. We have the pieces.`, [{ kind: "hype", delta: 5 }, { kind: "security", delta: -2 }], { kind: "beatExpect" }),
          A("humble", `Get back to the tournament, then make some noise. One thing at a time.`, [{ kind: "mediaRep", delta: 3 }, { kind: "security", delta: 1 }]),
          A("praise", `Our returning guys learned what March takes. That experience is priceless.`, [{ kind: "morale", target: "team", delta: 3 }])
        ])
      });
    }
  } else if (h2) {
    cands.push({
      key: "md.ls.inherit",
      topic: "lastSeason",
      w: 8,
      lead: true,
      build: () => makeQ(team, { role: "beat", tag: "Last season" }, h2.w - h2.l >= 8 ? `You inherit a team that went ${h2.w}-${h2.l} last year. How much will you change?` : `This program went ${h2.w}-${h2.l} last year before you arrived. What did you see on film that you want to change?`, [
        A("fiery", `Effort. Some nights it wasn't there. That's over.`, [{ kind: "morale", target: "team", delta: -2 }, { kind: "hype", delta: 3 }]),
        A("humble", `There's a lot of talent here. We're just going to play to our strengths.`, [{ kind: "morale", target: "team", delta: 3 }]),
        A("confident", `Honestly? Not much. This group is closer than people think.`, [{ kind: "hype", delta: 4 }, { kind: "morale", target: "team", delta: 2 }], { kind: "beatExpect" })
      ])
    });
  }
  const recap = c.recap;
  const gone = [...recap?.drafted ?? [], ...recap?.transfersOut ?? []];
  if (recap && gone.length) {
    const top = recap.drafted?.[0];
    cands.push({
      key: "md.departures",
      topic: "roster",
      w: 7,
      build: () => makeQ(team, { role: "beat", tag: "Offseason" }, top ? `You lost ${top} to the NBA Draft${recap.transfersOut?.length ? ` and ${plural(recap.transfersOut.length, "player")} to the portal` : ""}. How do you replace that production?` : `You lost ${list((recap.transfersOut ?? []).slice(0, 3))} to the transfer portal. How much did those departures hurt?`, [
        A("confident", `We reloaded. Wait until you see who's stepping up.`, [{ kind: "hype", delta: 4 }, { kind: "morale", target: "team", delta: 3 }]),
        A("humble", `You don't replace guys like that with one player. It's going to take everybody.`, [{ kind: "mediaRep", delta: 3 }, { kind: "morale", target: "team", delta: 2 }]),
        A("praise", `We're proud of those guys. That's what this program does: it sends players to the next level.`, [{ kind: "recruitInterest", delta: 2 }, { kind: "mediaRep", delta: 2 }])
      ])
    });
  }
  const arrivals = (recap?.transfersIn ?? []).map((x) => state.players[x.id]).filter((p) => !!p && p.teamId === team.id);
  if (arrivals.length) {
    const best = [...arrivals].sort((a, b) => b.ovr - a.ovr)[0];
    const fromSchool = recap?.transfersIn?.find((x) => x.id === best.id)?.from;
    cands.push({
      key: "md.newcomers",
      topic: "newcomers",
      w: 7,
      build: () => makeQ(team, { role: "tv", tag: "Offseason" }, arrivals.length > 1 ? `You added ${list(arrivals.slice(0, 3).map(nm))} from the portal. Who should fans be most excited about?` : `${nm(best)} comes over from ${fromSchool ?? "the portal"}. What does he bring?`, [
        A("praise", `${best.first}. He's a winner, and he's going to change how we play.`, [{ kind: "morale", target: best.id, delta: 7 }, { kind: "hype", delta: 3 }]),
        A("humble", `They all have to earn it in practice. Nobody walked in here with a starting job.`, [{ kind: "morale", target: "team", delta: 2 }]),
        A("confident", `We had the best portal haul in the ${confName(c)}. I'll say that.`, [{ kind: "hype", delta: 5 }, { kind: "mediaRep", delta: -1 }])
      ])
    });
  }
  const fresh2 = c.players.filter((p) => p.cls === "FR" && !p.redshirting).sort((a, b) => b.ovr - a.ovr)[0];
  if (fresh2 && fresh2.stars >= 3) {
    cands.push({
      key: "md.freshman",
      topic: "newcomers",
      w: 6,
      build: () => makeQ(team, { role: "beat" }, `${nm(fresh2)} arrives as a ${fresh2.stars}-star freshman. Is he ready to contribute right away?`, [
        A("confident", `He'll start from day one. He's that good.`, [{ kind: "morale", target: fresh2.id, delta: 8 }, { kind: "hype", delta: 3 }, { kind: "morale", target: "team", delta: -1 }], { kind: "freshStar", subject: fresh2.id }),
        A("humble", `He's talented, but freshmen have to earn it. He'll get his chances.`, [{ kind: "morale", target: "team", delta: 2 }]),
        A("joke", `He's ready. His jump shot's ready. His dorm room? Not so much.`, [{ kind: "mediaRep", delta: 3 }, { kind: "morale", target: fresh2.id, delta: 3 }])
      ])
    });
  }
  const summer = state.development?.summer;
  if (summer?.done && summer.season === state.season - 1) {
    const leap = summer.rows.find((r) => (r.tag === "breakout" || r.archetypeTo) && state.players[r.id]?.teamId === team.id);
    if (leap) {
      const lp = state.players[leap.id];
      cands.push({
        key: leap.archetypeTo ? "md.newRole" : "md.leap",
        topic: "leap",
        w: 8,
        build: () => makeQ(team, { role: "beat", tag: "Offseason" }, leap.archetypeTo ? `${leap.name} spent the summer on ${FOCUS_INFO[leap.focus].label.toLowerCase()} and came back as a ${leap.archetypeTo.toLowerCase()}. What did you see from him?` : `${leap.name} went from ${leap.before} to ${leap.after} overall this summer. What changed?`, [
          A("praise", `He lived in the gym. First one in, last one out, all summer long. He earned every bit of it.`, [{ kind: "morale", target: lp.id, delta: 6 }, { kind: "followers", target: lp.id, delta: 6e3 }]),
          A("confident", `Wait until you see him in a real game. People aren't ready.`, [{ kind: "hype", delta: 5 }, { kind: "morale", target: lp.id, delta: 3 }]),
          A("humble", `Credit our player development staff. They had a plan for him, and he bought in.`, [{ kind: "mediaRep", delta: 3 }, { kind: "recruitInterest", delta: 2 }])
        ])
      });
    }
  }
  const yearN = c.tenure + 1;
  if (coach.jobSecurity < 38 && c.tenure >= 1) {
    cands.push({
      key: "md.hotseat",
      topic: "tenure",
      w: 9,
      build: () => makeQ(team, { role: "columnist" }, v(`There's been plenty of talk about your job security this offseason. Do you feel the pressure?`, `Fair or not, a lot of people see this as a make-or-break year for you. Do you?`), [
        A("fiery", `I don't coach scared. Never have. We're going to win and the noise will go away.`, [{ kind: "hype", delta: 4 }, { kind: "morale", target: "team", delta: 2 }, { kind: "mediaRep", delta: -1 }]),
        A("humble", `It's a results business, and I accept that. I believe in this group.`, [{ kind: "mediaRep", delta: 4 }, { kind: "security", delta: 2 }]),
        A("deflect", `I don't read any of that. Next question.`, [{ kind: "mediaRep", delta: -3 }])
      ])
    });
  } else if (coach.contractYears <= 1 && c.tenure >= 1) {
    cands.push({
      key: "md.contract",
      topic: "tenure",
      w: 6,
      build: () => makeQ(team, { role: "national" }, `You're entering the final year of your contract. Any talks about an extension?`, [
        A("humble", `I'll let the results do the talking. Everything else takes care of itself.`, [{ kind: "security", delta: 2 }, { kind: "mediaRep", delta: 2 }]),
        A("confident", `I think we've earned one. We'll see where it goes.`, [{ kind: "security", delta: -2 }, { kind: "hype", delta: 2 }]),
        A("deflect", `That's between me and the AD.`, [{ kind: "mediaRep", delta: -1 }])
      ])
    });
  } else if (yearN >= 2) {
    cands.push({
      key: yearN === 2 ? "md.year2" : yearN >= 6 ? "md.longTenure" : "md.yearN",
      topic: "tenure",
      w: 5,
      build: () => makeQ(team, { role: "beat" }, yearN === 2 ? `Year two. What's the biggest difference from where you were 12 months ago?` : yearN >= 6 ? `This is year ${yearN} for you at ${team.school}. Do you ever think about what comes next?` : `Year ${yearN} at ${team.school}. Is this the year it all comes together?`, yearN >= 6 ? [
        A("humble", `This is home. I want to retire here, if they'll have me that long.`, [{ kind: "security", delta: 3 }, { kind: "hype", delta: 3 }], { kind: "notLeaving" }),
        A("confident", `What comes next is a banner. That's all I think about.`, [{ kind: "hype", delta: 5 }], { kind: "deepRun" }),
        A("joke", `What comes next is the nine o'clock practice. Nothing past that.`, [{ kind: "mediaRep", delta: 3 }])
      ] : [
        A("confident", `The culture's in place. Now it's about winning big.`, [{ kind: "hype", delta: 5 }, { kind: "security", delta: -1 }], { kind: "beatExpect" }),
        A("humble", `We're further along than last year, but we're not done building.`, [{ kind: "mediaRep", delta: 3 }, { kind: "security", delta: 1 }]),
        A("praise", `The players have bought in completely. That's the difference.`, [{ kind: "morale", target: "team", delta: 4 }])
      ])
    });
  }
  const stint = coach.career.filter((x) => x.teamId === team.id && x.season < state.season);
  if (stint.length >= 2) {
    const w = stint.reduce((a, x) => a + x.w, 0), l = stint.reduce((a, x) => a + x.l, 0);
    const bids = stint.filter((x) => x.seed != null).length;
    const recent = stint.slice(-3).map((x) => x.w);
    const rising = recent.length >= 3 && recent[2] > recent[1] && recent[1] > recent[0];
    cands.push({
      key: rising ? "md.buildRising" : "md.build",
      topic: "build",
      w: 6,
      build: () => makeQ(team, { role: "columnist", tag: "Big picture" }, rising ? `You've won ${list(recent.map(String))} games the last three seasons. Is this the year the climb pays off?` : `In ${plural(stint.length, "season")} here you're ${w}-${l}${bids ? ` with ${plural(bids, "NCAA appearance")}` : " without an NCAA bid"}. How would you assess the build so far?`, [
        A("confident", rising ? `That's the plan. Every year we've gotten better. This is the year it shows up in March.` : `We're right where I want to be. The best is coming.`, [{ kind: "hype", delta: 5 }, { kind: "security", delta: -1 }], { kind: "beatExpect" }),
        A("humble", `We're not where we want to be yet. But the foundation is real, and it's built to last.`, [{ kind: "mediaRep", delta: 3 }, { kind: "security", delta: 2 }]),
        A("praise", `I'm proud of the players who believed in us early. They built this.`, [{ kind: "morale", target: "team", delta: 3 }, { kind: "recruitInterest", delta: 1 }])
      ])
    });
  }
  if (c.drought >= 3) {
    cands.push({
      key: "md.drought",
      topic: "drought",
      w: 7,
      build: () => makeQ(team, { role: "columnist" }, `It's been ${c.drought} years since ${team.school} made the NCAA Tournament. Fans are restless. Is this the year?`, [
        A("confident", `Yes. The drought ends this season.`, [{ kind: "hype", delta: 8 }, { kind: "security", delta: -3 }], { kind: "tourney" }),
        A("humble", `I understand the frustration. All I can promise is we'll compete every night.`, [{ kind: "mediaRep", delta: 3 }, { kind: "security", delta: 1 }]),
        A("fiery", `Nobody's more tired of hearing about it than me. Let's go fix it.`, [{ kind: "hype", delta: 4 }, { kind: "morale", target: "team", delta: 2 }])
      ])
    });
  }
  const sc2 = state.scheduling;
  if (sc2 && sc2.season === state.season && sc2.locked) {
    const m = resumeMetrics(state);
    const top = [...sc2.games].sort((a, b) => (sc2.projRank[a.oppId] ?? 999) - (sc2.projRank[b.oppId] ?? 999)).slice(0, 2).map((x) => state.teams[x.oppId].school);
    if (m.sosLabel === "Brutal" || m.sosLabel === "Tough") {
      cands.push({
        key: "md.sched.tough",
        topic: "schedule",
        w: 6,
        build: () => makeQ(team, { role: "national" }, `You loaded up the non-conference schedule: ${top.join(" and ")}${sc2.mte ? `, plus the ${sc2.mte}` : ""}. Why take on that gauntlet?`, [
          A("confident", `We want the best. March prep starts in November.`, [{ kind: "hype", delta: 4 }, { kind: "morale", target: "team", delta: 2 }]),
          A("humble", `It'll test us. We're going to learn a lot about who we are.`, [{ kind: "mediaRep", delta: 3 }]),
          A("joke", `Ask me again after I've watched the film from those games.`, [{ kind: "mediaRep", delta: 2 }, { kind: "hype", delta: 1 }])
        ])
      });
    } else if (m.sosLabel === "Soft" || m.sosLabel === "Cupcake") {
      cands.push({
        key: "md.sched.soft",
        topic: "schedule",
        w: 6,
        build: () => makeQ(team, { role: "analytics" }, `Critics are calling your non-conference schedule soft. Your response?`, [
          A("fiery", `Ask the committee in March. We'll be just fine.`, [{ kind: "hype", delta: 2 }, { kind: "security", delta: -1 }]),
          A("humble", `Fair critique. We're young, and building confidence early matters.`, [{ kind: "mediaRep", delta: 2 }, { kind: "morale", target: "team", delta: 2 }]),
          A("deflect", `You play who's available. Next question.`, [{ kind: "mediaRep", delta: -2 }])
        ])
      });
    } else {
      cands.push({
        key: "md.sched",
        topic: "schedule",
        w: 3,
        build: () => makeQ(team, { role: "beat" }, `Walk us through your approach to the non-conference schedule this year.`, [
          A("confident", `Enough big games to get us battle-tested, enough home games to build momentum.`, [{ kind: "mediaRep", delta: 2 }, { kind: "hype", delta: 2 }]),
          A("humble", `Our staff did a great job. It's balanced, and it'll prepare us for league play.`, [{ kind: "mediaRep", delta: 3 }])
        ])
      });
    }
  }
  const rivalGame = state.schedule.filter((g) => (g.home === team.id || g.away === team.id) && rivalOf(state, g.home, g.away)).sort((a, b) => a.day - b.day)[0];
  const rvRec = rivalGame ? rivalOf(state, rivalGame.home, rivalGame.away) : void 0;
  if (rivalGame && rvRec?.origin === "born" && rvRec.reason?.includes(`Coach ${coach.last} left`)) {
    const old = state.teams[rivalGame.home === team.id ? rivalGame.away : rivalGame.home];
    const there = rivalGame.home === old.id;
    cands.push({
      key: "md.oldSchool",
      topic: "rival",
      w: 12,
      lead: true,
      build: () => makeQ(team, { role: "national", tag: "Rivalry" }, there ? `You go back to ${old.arena} this season to face ${old.school}, your old school. What kind of reception are you expecting?` : `${old.school}, your old school, comes to town this season. Is that one circled?`, [
        A("humble", `I have a lot of love for the people there. But when the ball goes up, I coach ${team.school}.`, [{ kind: "mediaRep", delta: 4 }]),
        A("joke", `I'm bringing earplugs. And maybe a helmet.`, [{ kind: "hype", delta: 4 }, { kind: "mediaRep", delta: 3 }]),
        A("fiery", `Circled, underlined and highlighted. We want that one.`, [{ kind: "hype", delta: 7 }, { kind: "morale", target: "team", delta: 2 }, { kind: "mediaRep", delta: -2 }])
      ])
    });
  } else if (rivalGame && rvRec?.origin === "born") {
    const rv = state.teams[rivalGame.home === team.id ? rivalGame.away : rivalGame.home];
    cands.push({
      key: "md.newRival",
      topic: "rival",
      w: 8,
      build: () => makeQ(team, { role: "beat", tag: "Rivalry" }, `${rvRec.name} didn't exist a few years ago. ${rvRec.reason ?? ""} Now it's one of the hottest games on your schedule. How did it get here?`, [
        A("fiery", `They know what they did. Our guys haven't forgotten.`, [{ kind: "hype", delta: 6 }, { kind: "morale", target: "team", delta: 2 }]),
        A("humble", `Rivalries are earned. ${rv.school} is a great program, and these games have been great for both schools.`, [{ kind: "mediaRep", delta: 4 }]),
        A("joke", `I think the fans like it more than the coaches do. My blood pressure certainly does not.`, [{ kind: "hype", delta: 4 }, { kind: "mediaRep", delta: 3 }])
      ])
    });
  } else if (rivalGame) {
    const rv = state.teams[rivalGame.home === team.id ? rivalGame.away : rivalGame.home];
    const name2 = rvRec?.name;
    cands.push({
      key: "md.rival",
      topic: "rival",
      w: 6,
      build: () => makeQ(team, { role: "tv" }, `Fans already have ${state.calendar[rivalGame.day]?.date ? "the date" : "it"} circled: ${rv.school}${name2 ? `, ${name2}` : ""}. How much do your guys talk about that game?`, [
        A("fiery", `Every day. That's the one. Everybody in this building knows it.`, [{ kind: "hype", delta: 6 }, { kind: "morale", target: "team", delta: 2 }]),
        A("humble", `It's a great rivalry, and we respect them. But it's one game on the schedule.`, [{ kind: "mediaRep", delta: 3 }]),
        A("joke", `I'm not allowed to say their name in my house. My kids won't let me.`, [{ kind: "hype", delta: 4 }, { kind: "mediaRep", delta: 2 }])
      ])
    });
  }
  if (c.conf) {
    const st = Object.values(state.teams).filter((t) => t.conf === team.conf && t.id !== team.id).sort((a, b) => b.rating - a.rating);
    const fav = st[0];
    if (fav) {
      cands.push({
        key: "md.conf",
        topic: "conf",
        w: 5,
        build: () => makeQ(team, { role: "beat" }, `Who's the team to beat in the ${confName(c)} this year?`, [
          A("confident", `Us. We're winning the league.`, [{ kind: "hype", delta: 6 }, { kind: "morale", target: "team", delta: 2 }, { kind: "security", delta: -2 }], { kind: "confTitle" }),
          A("praise", `${fav.school} until somebody knocks them off. They've earned that.`, [{ kind: "mediaRep", delta: 3 }]),
          A("humble", `This league is a gauntlet. Anybody can beat anybody on a given night.`, [{ kind: "mediaRep", delta: 2 }])
        ])
      });
    }
  }
  if (c.star) {
    const s = c.star;
    cands.push({
      key: "md.star",
      topic: "star",
      w: 6,
      build: () => makeQ(team, { role: "tv" }, v(`${nm(s)} is getting a lot of preseason buzz. What makes him special?`, `Talk about ${nm(s)}. What's his ceiling this year?`), [
        A("praise", `He's the hardest worker I've ever coached. All-American, no question.`, [{ kind: "morale", target: s.id, delta: 8 }, { kind: "followers", target: s.id, delta: 15e3 }], { kind: "allAmerican", subject: s.id }),
        A("humble", `He's talented, but this is a team. Nobody's bigger than the program.`, [{ kind: "morale", target: "team", delta: 3 }, { kind: "morale", target: s.id, delta: s.traits.includes("diva") ? -6 : 0 }]),
        A("joke", `His shoe deal is bigger than my salary, so... a lot of things.`, [{ kind: "hype", delta: 3 }, { kind: "mediaRep", delta: 3 }])
      ])
    });
    const r = nbaRank(state, s);
    if (r <= 30 && s.elig > 1) {
      cands.push({
        key: "md.nba",
        topic: "nba",
        w: 5,
        build: () => makeQ(team, { role: "national" }, `NBA scouts have ${nm(s)} projected as ${nbaLabel(r)}. Is this his last college season?`, [
          A("praise", `If it is, we'll celebrate it. Our job is to get him ready for that moment.`, [{ kind: "recruitInterest", delta: 2 }, { kind: "morale", target: s.id, delta: 4 }]),
          A("humble", `He's focused on this team, and so am I. We'll talk about the draft in April.`, [{ kind: "mediaRep", delta: 3 }, { kind: "morale", target: "team", delta: 1 }]),
          A("joke", `I'm trying to talk him into a fifth year. So far it's not going well.`, [{ kind: "mediaRep", delta: 3 }])
        ])
      });
    }
  }
  const nilRank = Object.values(state.teams).filter((t) => t.conf === team.conf).sort((a, b) => b.nilBudget - a.nilBudget).findIndex((t) => t.id === team.id) + 1;
  cands.push({
    key: "md.nil",
    topic: "nil",
    w: 3,
    build: () => makeQ(team, { role: "national" }, `Your NIL pool is about ${fmtMoney(team.nilBudget)}, ${ord2(nilRank)} in the ${confName(c)}. Can you compete with the big spenders?`, nilRank <= 3 ? [
      A("confident", `Our fans and donors have stepped up. We'll compete with anybody.`, [{ kind: "hype", delta: 3 }, { kind: "recruitInterest", delta: 2 }]),
      A("humble", `The money helps, but players come here to develop and win.`, [{ kind: "mediaRep", delta: 3 }])
    ] : [
      A("fiery", `We'll outwork the money. We always have.`, [{ kind: "morale", target: "team", delta: 2 }, { kind: "hype", delta: 2 }]),
      A("confident", `Donors, if you're watching: call me. We need you.`, [{ kind: "nilBudget", delta: 9e4 }, { kind: "mediaRep", delta: -1 }]),
      A("humble", `We have to be smarter than everybody else, and we will be.`, [{ kind: "mediaRep", delta: 2 }])
    ])
  });
  const ratingRank = Object.values(state.teams).sort((a, b) => b.rating - a.rating).findIndex((t) => t.id === team.id) + 1;
  cands.push({
    key: "md.models",
    topic: "analytics",
    w: 3,
    build: () => makeQ(team, { role: "analytics" }, `The computer models project you around No. ${ratingRank} nationally. Do you trust the numbers?`, [
      A("humble", `Numbers tell you a lot. They don't measure heart. We'll find out.`, [{ kind: "mediaRep", delta: 2 }]),
      A("confident", `The models will be updating their projections soon. Upward.`, [{ kind: "hype", delta: 4 }]),
      A("joke", `I don't trust anything that can't run a full-court drill.`, [{ kind: "mediaRep", delta: 3 }, { kind: "hype", delta: 1 }])
    ])
  });
  cands.push(funQuestion(state, team, "md"));
  const opened = state.build?.[team.id]?.opened;
  if (opened && opened.season === state.season && opened.keys.length) {
    const k = opened.keys[0];
    const nm22 = state.build[team.id].names[k] ?? FACILITIES[k].name;
    cands.push({
      key: "md.facility",
      topic: "facility",
      w: 7,
      build: () => makeQ(team, { role: "beat", tag: "Program building" }, `The new ${nm22} just opened. How much of a difference will it make?`, [
        A("confident", `A big one. Recruits walk in and their eyes get wide. Our guys feel it every day.`, [{ kind: "recruitInterest", delta: 3 }, { kind: "hype", delta: 3 }]),
        A("praise", `Credit our boosters and our administration. They backed this program in a big way.`, [{ kind: "mediaRep", delta: 3 }]),
        A("joke", `I've been sleeping there. Don't tell my wife.`, [{ kind: "hype", delta: 3 }, { kind: "mediaRep", delta: 3 }])
      ])
    });
  }
  if (newcomer(state, team.id) && c.conf) {
    const prev = team.history[team.history.length - 1]?.conf;
    const old = state.conferences.find((x) => x.id === prev);
    const tougher = old && c.conf.tier < old.tier;
    cands.push({
      key: "md.newConf",
      topic: "conference",
      w: 12,
      lead: true,
      build: () => makeQ(team, { role: "national", tag: "Realignment" }, tougher ? `First season in the ${c.conf.short}. Is ${team.school} ready for this every night?` : `New league, new road trips. What does the move to the ${c.conf.short} mean for ${team.school}?`, [
        A("confident", `We didn't come here to be a member. We came here to win it.`, [{ kind: "hype", delta: 7 }, { kind: "security", delta: -2 }], { kind: "confTitle" }),
        A("humble", `It's a big step. We'll take our lumps, learn fast, and earn our place.`, [{ kind: "mediaRep", delta: 4 }, { kind: "security", delta: 2 }]),
        A("joke", `I've been studying the league's road trips. I'm mostly excited about the airport food.`, [{ kind: "hype", delta: 3 }, { kind: "mediaRep", delta: 3 }])
      ])
    });
  }
  cands.push(...loreCands(state, c, "md"));
  const portalClaim = openClaims(state, ["portalSplash", "retention"], (x) => x.teamId === team.id && x.season === state.season)[0];
  if (portalClaim && recap) {
    const ins = recap.transfersIn?.length ?? 0, outs = recap.transfersOut?.length ?? 0;
    const delivered = portalClaim.kind === "portalSplash" ? ins >= 2 || /A/.test(recap.portalGrade ?? "") : outs <= 1;
    cands.push({
      key: "md.portalClaim",
      topic: "followup",
      w: 9,
      onAsk: () => {
        portalClaim.followed = true;
      },
      build: () => makeQ(team, { role: "beat", tag: "Follow-up", quote: quoteOf(state, portalClaim) }, portalClaim.kind === "portalSplash" ? delivered ? `You promised big names out of the portal, and you landed ${plural(ins, "transfer")}. Did you get everything you wanted?` : `You said you were going shopping in the portal. You brought in ${ins === 0 ? "nobody" : plural(ins, "player")}. What happened?` : delivered ? `You said retention came first, and you kept this group together. How did you pull that off?` : `You said retention came first, but ${plural(outs, "player")} left through the portal. What went wrong?`, delivered ? [
        A("confident", `I told you. We do what we say around here.`, [{ kind: "hype", delta: 4 }, { kind: "mediaRep", delta: 1 }]),
        A("humble", `Credit our staff. They worked around the clock.`, [{ kind: "mediaRep", delta: 3 }])
      ] : [
        A("humble", `That's fair. It didn't go the way we planned, and that's on me.`, [{ kind: "mediaRep", delta: 4 }, { kind: "security", delta: 1 }]),
        A("deflect", `The portal's unpredictable. We like the group we have.`, [{ kind: "mediaRep", delta: -2 }]),
        A("fiery", `The guys who wanted to be here are here. That's who I want.`, [{ kind: "morale", target: "team", delta: 4 }, { kind: "mediaRep", delta: -1 }])
      ])
    });
  }
  {
    const ps = teamPlayers(state, team.id);
    const tr = ps.filter((p) => lockerGroup(p, team.id) === "transfer").length;
    const fresh3 = ps.filter((p) => lockerGroup(p, team.id) === "freshman").length;
    const back = ps.length - tr - fresh3;
    if (tr + fresh3 >= 6) {
      cands.push({ key: "md.newFaces", topic: "chemistry", w: 8, build: () => makeQ(team, { role: "beat", tag: "Locker room" }, `You have ${tr + fresh3} new faces${tr ? `, ${tr} of them transfers` : ""}. How do you build chemistry that fast?`, [
        A("confident", `Winning builds chemistry. We'll have plenty of both.`, [{ kind: "hype", delta: 3 }, { kind: "chem", delta: 1 }]),
        A("humble", `It takes time. The older guys have to bring the new ones along, and they've been great.`, [{ kind: "chem", delta: 2 }, { kind: "mediaRep", delta: 1 }]),
        A("joke", `Mandatory karaoke. Nobody's a stranger after you've heard them sing.`, [{ kind: "chem", delta: 1 }, { kind: "mediaRep", delta: 2 }])
      ]) });
    } else if (back >= 9) {
      cands.push({ key: "md.continuity", topic: "chemistry", w: 6, build: () => makeQ(team, { role: "beat", tag: "Locker room" }, `${back} players are back from last year's team. How much does that continuity matter?`, [
        A("confident", `It's our biggest edge. These guys know each other's games cold.`, [{ kind: "chem", delta: 1 }, { kind: "hype", delta: 2 }]),
        A("humble", `It helps, but nothing carries over automatically. We still have to build it again.`, [{ kind: "chem", delta: 2 }, { kind: "mediaRep", delta: 1 }])
      ]) });
    }
  }
  return { id: rng.id("pc"), title: "Preseason Media Day", context: `Media day at ${team.arena}. A wall of cameras awaits.`, when: "at Media Day", questions: choose(state, cands, 5) };
}
function funQuestion(state, team, prefix) {
  const opts = [
    { k: "playlist", q: `Student section wants to know: what's on the pregame playlist?`, a: [
      A("joke", `Mostly my assistants' music. I lost a bet in July and I'm still paying for it.`, [{ kind: "hype", delta: 3 }, { kind: "mediaRep", delta: 2 }]),
      A("praise", `The players run the aux cord. I trust them with that more than I trust them with a zone.`, [{ kind: "morale", target: "team", delta: 3 }]),
      A("deflect", `I'm an old-school guy. Silence and film.`, [{ kind: "mediaRep", delta: 1 }])
    ] },
    { k: "dancer", q: `Who's the best dancer on the team?`, a: [
      A("joke", `Not me. Definitely not me. There's video and I've had it destroyed.`, [{ kind: "hype", delta: 3 }, { kind: "mediaRep", delta: 3 }]),
      A("praise", `Ask the guys. I think they'd all say themselves.`, [{ kind: "morale", target: "team", delta: 2 }])
    ] },
    { k: "student", q: `What do you want to say to the student section?`, a: [
      A("fiery", `Be loud. Be early. Be the sixth man. We feed off you.`, [{ kind: "hype", delta: 6 }]),
      A("joke", `First 500 students get free pizza from my own pocket. Don't tell the AD.`, [{ kind: "hype", delta: 7 }, { kind: "nilBudget", delta: -5e3 }]),
      A("humble", `Thank you. You make this place special.`, [{ kind: "hype", delta: 3 }, { kind: "mediaRep", delta: 2 }])
    ] },
    { k: "superstition", q: `Any game-day superstitions we should know about?`, a: [
      A("joke", `Same tie every game we win. It's getting pretty rough.`, [{ kind: "hype", delta: 3 }, { kind: "mediaRep", delta: 2 }]),
      A("humble", `Preparation is the only superstition I believe in.`, [{ kind: "mediaRep", delta: 2 }])
    ] },
    { k: "karaoke", q: `Rumor has it the team did karaoke on a road trip. Who's the best singer?`, a: [
      A("joke", `I'll take the fifth. Some things stay on the bus.`, [{ kind: "hype", delta: 2 }, { kind: "morale", target: "team", delta: 2 }, { kind: "mediaRep", delta: 2 }]),
      A("praise", `Our managers, honestly. They carried the whole night.`, [{ kind: "morale", target: "team", delta: 3 }])
    ] }
  ];
  const o = rng.pick(opts);
  return { key: `${prefix}.fun.${o.k}`, topic: "fun", w: 2.5, build: () => makeQ(team, { role: "student" }, o.q, o.a) };
}
function sumBox(ps) {
  const s = { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, tov: 0, bench: 0 };
  for (const p of ps) {
    s.pts += p.pts;
    s.fgm += p.fgm;
    s.fga += p.fga;
    s.tpm += p.tpm;
    s.tpa += p.tpa;
    s.ftm += p.ftm;
    s.fta += p.fta;
    s.reb += p.orb + p.drb;
    s.tov += p.tov;
    if (!p.starter) s.bench += p.pts;
  }
  return s;
}
function postgamePresser(state, g, box) {
  const c = ctxFor(state);
  const { team } = c;
  const home = g.home === team.id;
  const opp = state.teams[home ? g.away : g.home];
  if (!opp) return null;
  const us = home ? box.hs : box.as, them = home ? box.as : box.hs;
  const margin = us - them;
  const won = margin > 0;
  const mine = home ? box.players[0] : box.players[1];
  const theirs = home ? box.players[1] : box.players[0];
  const ts = sumBox(mine), os = sumBox(theirs);
  const best = [...mine].sort((a, b) => b.pts - a.pts)[0];
  const starP = best ? state.players[best.id] : void 0;
  const worstBox = [...mine].filter((p) => p.min >= 15).sort((a, b) => a.pts - a.fga * 0.6 - (b.pts - b.fga * 0.6))[0];
  const worst = worstBox ? state.players[worstBox.id] : void 0;
  const upsetWin = won && !!opp.apRank && (!team.apRank || team.apRank > opp.apRank);
  const badLoss = !won && !opp.apRank && team.rating - opp.rating > 6;
  const rv = rivalOf(state, g.home, g.away);
  const rvStreak = rv?.streak;
  const rvLast = rv?.meetings[rv.meetings.length - 1];
  const rvSeries = rv ? [rv.series[team.id] ?? 0, rv.series[opp.id] ?? 0] : [0, 0];
  const prevHolder = rv && rv.meetings.length >= 2 ? rv.meetings[rv.meetings.length - 2].w : void 0;
  const ncaa = g.type === "ncaa", ctourn = g.type === "ctourn";
  const tourney = ncaa || ctourn;
  const big = !!opp.apRank || !!rv || tourney;
  const ot = box.ot > 0;
  const oppLead = home ? box.largestLead[1] : box.largestLead[0];
  const ourLead = home ? box.largestLead[0] : box.largestLead[1];
  const halfUs = home ? box.half[0] : box.half[1], halfThem = home ? box.half[1] : box.half[0];
  const when = `after the ${opp.school} game`;
  const cands = [];
  const pts = (n2) => `${n2}-point`;
  if (won) {
    if (ncaa) {
      cands.push({ key: "pg.ncaaW", topic: "result", w: 10, lead: true, build: () => makeQ(team, { role: "national" }, v(`You're moving on in the NCAA Tournament. What won you this game?`, `Survive and advance. How did you get it done against ${opp.school}?`), [
        A("praise", `Our guys refused to lose. You could see it in their eyes in the huddle.`, [{ kind: "morale", target: "team", delta: 4 }, { kind: "hype", delta: 3 }]),
        A("humble", `Credit ${opp.school}. They made us earn every bucket. We just made one more play.`, [{ kind: "mediaRep", delta: 4 }]),
        A("confident", `We're not here to be happy with one win. We came to cut down nets.`, [{ kind: "hype", delta: 6 }, { kind: "morale", target: "team", delta: 3 }], { kind: "deepRun" })
      ]) });
    } else if (upsetWin) {
      cands.push({ key: "pg.upsetW", topic: "result", w: 10, lead: true, build: () => makeQ(team, { role: "national" }, v(`Coach, that's a statement win over No. ${opp.apRank} ${opp.school}. Does this change how people see ${team.school}?`, `Beating a top-${opp.apRank <= 10 ? 10 : 25} team. Is this the win that puts ${team.school} on the map?`), [
        A("confident", `It should. We've been saying it all year: we're a top-tier team.`, [{ kind: "hype", delta: 8 }, { kind: "morale", target: "team", delta: 4 }, { kind: "recruitInterest", delta: 3 }]),
        A("humble", `It's one win. We'll enjoy it tonight and get back to work tomorrow.`, [{ kind: "mediaRep", delta: 4 }, { kind: "security", delta: 2 }]),
        A("praise", `Credit to ${opp.school}. Hall of Fame program. Our guys just made a couple more plays.`, [{ kind: "mediaRep", delta: 5 }])
      ]) });
    } else if (rv && rv.trophy && prevHolder && prevHolder !== team.id && rvLast?.w === team.id) {
      cands.push({ key: "pg.rivalTrophy", topic: "result", w: 12, lead: true, build: () => makeQ(team, { role: "beat", tag: "Rivalry" }, `${rv.trophy} is coming back to ${team.school}. Where's it going to sit?`, [
        A("fiery", `Right in the middle of our locker room, where everybody has to walk past it.`, [{ kind: "hype", delta: 8 }, { kind: "morale", target: "team", delta: 4 }]),
        A("joke", `My office. I might sleep next to it tonight.`, [{ kind: "hype", delta: 6 }, { kind: "mediaRep", delta: 3 }]),
        A("humble", `It belongs to our fans and our students. They earned it as much as the players did.`, [{ kind: "mediaRep", delta: 4 }, { kind: "hype", delta: 4 }])
      ]) });
    } else if (rv && rvStreak && rvStreak.t === team.id && rvStreak.n >= 3) {
      cands.push({ key: "pg.rivalStreak", topic: "result", w: 11, lead: true, build: () => makeQ(team, { role: "columnist", tag: "Rivalry" }, `That's ${rvStreak.n} straight over ${opp.school}. Is this still a rivalry?`, [
        A("humble", `Absolutely. Every one of those games was a fight. ${opp.school} will be back.`, [{ kind: "mediaRep", delta: 4 }]),
        A("fiery", `Ask them. We're just taking care of business.`, [{ kind: "hype", delta: 7 }, { kind: "mediaRep", delta: -2 }]),
        A("joke", `I hope so. I'd hate to lose the best-attended game on our schedule.`, [{ kind: "hype", delta: 4 }, { kind: "mediaRep", delta: 2 }])
      ]) });
    } else if (rv) {
      cands.push({ key: "pg.rivalW", topic: "result", w: 10, lead: true, build: () => makeQ(team, { role: "beat" }, `You beat ${opp.school}${rv.name ? ` in ${rv.name}` : ""}. ${rvSeries[0] + rvSeries[1] > 1 ? `The series since ${rv.since} is ${rvSeries[0]}-${rvSeries[1]}. ` : ""}What does this one mean to your fan base?`, [
        A("fiery", `Everything. Our fans live for this game, and so do I.`, [{ kind: "hype", delta: 8 }, { kind: "morale", target: "team", delta: 3 }]),
        A("humble", `It's a great rivalry. We'll enjoy it, but it's still one win in the standings.`, [{ kind: "mediaRep", delta: 3 }, { kind: "hype", delta: 3 }]),
        A("joke", `My dad called before I got to the podium. That's how much it means.`, [{ kind: "hype", delta: 5 }, { kind: "mediaRep", delta: 2 }])
      ]) });
    } else if (ot || margin <= 3) {
      cands.push({ key: "pg.closeW", topic: "result", w: 9, lead: true, build: () => makeQ(team, { role: "tv" }, ot ? `Overtime! How did your guys find a way?` : v(`A ${pts(margin)} win that went down to the wire. How did you close it out?`, `That one came down to the last possession. What did you tell them in the final timeout?`), [
        A("praise", `Toughness. When it got tight, we got tougher. I love this group.`, [{ kind: "morale", target: "team", delta: 4 }]),
        A("humble", `We got lucky, honestly. We have to close games better than that.`, [{ kind: "mediaRep", delta: 3 }, { kind: "security", delta: 1 }]),
        A("joke", `I told them to win. They listened. Great coaching.`, [{ kind: "mediaRep", delta: 3 }, { kind: "hype", delta: 2 }])
      ]) });
    } else if (margin >= 20) {
      cands.push({ key: "pg.blowoutW", topic: "result", w: 8, lead: true, build: () => makeQ(team, { role: "beat" }, v(`A ${pts(margin)} win. Is that as complete a game as you've played?`, `You were in control from the opening tip. What clicked tonight?`, `That one was over early. Did anything worry you?`, `Everybody got in tonight. How valuable are games like this?`), [
        A("praise", `That's the best we've shared the ball all year. Everybody ate.`, [{ kind: "morale", target: "team", delta: 4 }]),
        A("humble", `We'll take it, but the film will show plenty of things we need to fix.`, [{ kind: "mediaRep", delta: 2 }, { kind: "security", delta: 1 }]),
        A("confident", `That's who we are when we play our game. Not many teams can hang with that.`, [{ kind: "hype", delta: 5 }])
      ]) });
    } else {
      cands.push({ key: "pg.win", topic: "result", w: 8, lead: true, build: () => makeQ(team, { role: "beat" }, v(`A ${pts(margin)} win tonight over ${opp.school}. What did you like?`, `What was the difference tonight against ${opp.school}?`, `Solid win. What's your takeaway?`, `${team.record.w}-${team.record.l} now. What did tonight tell you about this team?`, `Walk us through how you pulled away from ${opp.school}.`), [
        A("praise", v(`Our defense. We were connected for 40 minutes. That's who we want to be.`, `How hard we played. When we play that hard, we're tough to beat.`, `The ball movement. Nobody cared who scored.`), [{ kind: "morale", target: "team", delta: 3 }]),
        A("humble", v(`We won, but we left a lot out there. Plenty to clean up on film.`, `Good, not great. We're still a work in progress.`), [{ kind: "security", delta: 1 }, { kind: "mediaRep", delta: 2 }]),
        A("joke", v(`I liked the final score. Everything else we'll talk about at practice.`, `I liked that I didn't have to call a timeout in the last four minutes.`), [{ kind: "mediaRep", delta: 3 }, { kind: "hype", delta: 1 }])
      ]) });
    }
  } else {
    if (ncaa) {
      cands.push({ key: "pg.ncaaL", topic: "result", w: 10, lead: true, build: () => makeQ(team, { role: "beat" }, v(`The season is over. What will you remember about this team?`, `Coach, what do you say to this group after a season-ending loss like that?`), [
        A("praise", `Their heart. This group laid the foundation for something big.`, [{ kind: "morale", target: "team", delta: 5 }, { kind: "recruitInterest", delta: 2 }]),
        A("humble", `It hurts. We'll learn from it and be back.`, [{ kind: "mediaRep", delta: 3 }, { kind: "security", delta: 1 }]),
        A("fiery", `I told them to remember this feeling. Next March, we use it.`, [{ kind: "morale", target: "team", delta: 2 }, { kind: "hype", delta: 3 }])
      ]) });
    } else if (badLoss) {
      cands.push({ key: "pg.badL", topic: "result", w: 10, lead: true, build: () => makeQ(team, { role: "columnist" }, v(`Coach, a loss to ${opp.school}: that's going to hurt the r\xE9sum\xE9. What happened?`, `That's a loss you can't afford in March. How do you explain it?`), [
        A("fiery", `We were soft. Flat-out soft. That's on me, and it will not happen again.`, [{ kind: "morale", target: "team", delta: -2 }, { kind: "security", delta: 2 }, { kind: "hype", delta: 1 }], { kind: "neverAgain", subject: opp.id }),
        A("deflect", `Give ${opp.school} credit. They played well. We'll watch the film.`, [{ kind: "mediaRep", delta: 1 }]),
        A("humble", `I didn't have them ready. I take full responsibility.`, [{ kind: "morale", target: "team", delta: 3 }, { kind: "security", delta: -1 }, { kind: "mediaRep", delta: 3 }])
      ]) });
    } else if (rv && rvStreak && rvStreak.t === opp.id && rvStreak.n >= 3) {
      cands.push({ key: "pg.rivalLStreak", topic: "result", w: 12, lead: true, build: () => makeQ(team, { role: "columnist", tag: "Rivalry" }, `That's ${rvStreak.n} straight losses to ${opp.school}. Your fans are getting restless. What's going wrong in this series?`, [
        A("fiery", `Nothing I'm going to say up here. But it ends. I promise you it ends.`, [{ kind: "hype", delta: 4 }, { kind: "morale", target: "team", delta: 2 }, { kind: "security", delta: -1 }], { kind: "neverAgain", subject: opp.id }),
        A("humble", `They've been better than us in these games. That's on me to fix.`, [{ kind: "mediaRep", delta: 4 }, { kind: "security", delta: -2 }]),
        A("deflect", `Every game is its own game. I'm not into streaks.`, [{ kind: "mediaRep", delta: -2 }, { kind: "security", delta: -1 }])
      ]) });
    } else if (rv) {
      cands.push({ key: "pg.rivalL", topic: "result", w: 10, lead: true, build: () => makeQ(team, { role: "beat" }, rv.trophy && rvLast?.w === opp.id && prevHolder === team.id ? `${rv.trophy} goes home with ${opp.school}. How long will this one sting?` : `A loss to ${opp.school}. How long will this one sting?`, [
        A("fiery", `Until we get them back. And we will.`, [{ kind: "hype", delta: 4 }, { kind: "morale", target: "team", delta: 2 }]),
        A("humble", `It hurts. Our fans deserved better, and I'll own that.`, [{ kind: "mediaRep", delta: 4 }, { kind: "security", delta: -1 }]),
        A("deflect", `It's one game. We have a lot of season left.`, [{ kind: "mediaRep", delta: -1 }])
      ]) });
    } else if (margin <= -20) {
      cands.push({ key: "pg.blowoutL", topic: "result", w: 9, lead: true, build: () => makeQ(team, { role: "beat" }, v(`A ${pts(-margin)} loss. Is there anything positive to take from tonight?`, `That one got away from you early. What went wrong?`), [
        A("fiery", `No. Nothing. We got embarrassed, and everybody in that locker room should feel it.`, [{ kind: "morale", target: "team", delta: -3 }, { kind: "security", delta: 1 }]),
        A("humble", `They were better than us tonight in every way. I have to get us ready.`, [{ kind: "mediaRep", delta: 3 }]),
        A("praise", `Our guys kept fighting when it would have been easy to quit. I'll take that.`, [{ kind: "morale", target: "team", delta: 3 }])
      ]) });
    } else if (ot || margin >= -3) {
      cands.push({ key: "pg.closeL", topic: "result", w: 9, lead: true, build: () => makeQ(team, { role: "tv" }, ot ? `A loss in overtime. What did you tell them in the locker room?` : `A ${pts(-margin)} loss that came down to the final possession. How do you process that?`, [
        A("humble", `We were right there. We have to execute better in those moments, starting with me.`, [{ kind: "mediaRep", delta: 3 }, { kind: "morale", target: "team", delta: 2 }]),
        A("praise", `I'm proud of the fight. We'll win plenty of those this year.`, [{ kind: "morale", target: "team", delta: 4 }]),
        A("fiery", `Close doesn't count. I'm sick of close.`, [{ kind: "morale", target: "team", delta: -1 }, { kind: "hype", delta: 2 }])
      ]) });
    } else {
      cands.push({ key: "pg.loss", topic: "result", w: 8, lead: true, build: () => makeQ(team, { role: "beat" }, v(`Tough ${pts(-margin)} loss to ${opp.school}. What's the message to the locker room?`, `What was the difference tonight?`, `Coach, where did this one get away from you?`, `What did you see from ${opp.school} that you didn't expect?`, `${team.record.w}-${team.record.l} after tonight. What do you need to fix first?`), [
        A("humble", `Keep the faith. We're close. We have to finish games.`, [{ kind: "morale", target: "team", delta: 3 }]),
        A("fiery", `Nobody in that room should be happy. Practice is going to be... spirited.`, [{ kind: "morale", target: "team", delta: -2 }, ...c.star ? [{ kind: "rating", target: c.star.id, key: "perD", delta: 1 }] : []]),
        A("deflect", `We'll move on. Next game.`, [{ kind: "mediaRep", delta: -2 }])
      ]) });
    }
  }
  const peak = openClaims(state, ["peaking"], (x) => x.season === state.season && x.teamId === team.id && state.day - x.day <= 14)[0];
  if (peak && !won) {
    cands.push({ key: "pg.peakFollow", topic: "followup", w: 12, onAsk: () => {
      peak.followed = true;
    }, build: () => makeQ(team, { role: "columnist", tag: "Follow-up", quote: quoteOf(state, peak) }, `Not long ago you said this team hadn't peaked yet. What do you make of tonight?`, [
      A("confident", `I still believe it. One game doesn't change what this team is.`, [{ kind: "hype", delta: 2 }, { kind: "mediaRep", delta: -1 }]),
      A("joke", `Well, I didn't say which direction.`, [{ kind: "mediaRep", delta: 3 }]),
      A("humble", `Tonight was humbling. We have work to do.`, [{ kind: "mediaRep", delta: 3 }, { kind: "morale", target: "team", delta: 1 }])
    ]) });
  }
  const never = openClaims(state, ["neverAgain"], (x) => x.season === state.season && x.teamId === team.id)[0];
  if (never && badLoss && never.day < state.day) {
    cands.push({ key: "pg.neverFollow", topic: "followup", w: 13, onAsk: () => {
      never.followed = true;
    }, build: () => makeQ(team, { role: "columnist", tag: "Follow-up", quote: quoteOf(state, never) }, `After the ${state.teams[never.subject ?? ""]?.school ?? "last"} loss you said it would not happen again. It happened again. Why?`, [
      A("humble", `You're right to ask. I said it, and I didn't deliver. I have to be better.`, [{ kind: "mediaRep", delta: 4 }, { kind: "security", delta: -1 }]),
      A("fiery", `Because some guys didn't listen. That changes now, and lineups will reflect it.`, [{ kind: "morale", target: "team", delta: -4 }, { kind: "security", delta: 1 }]),
      A("deflect", `Different game, different circumstances.`, [{ kind: "mediaRep", delta: -3 }])
    ]) });
  }
  const winPct = team.record.w / Math.max(1, team.record.w + team.record.l);
  const struggling = team.record.streak <= -3 || badLoss && winPct < 0.65;
  const bigTalk = openClaims(state, ["deepRun", "beatExpect", "tourney", "confTitle"], (x) => x.season === state.season && x.teamId === team.id)[0];
  if (bigTalk && struggling && !tourney) {
    cands.push({ key: "pg.claimFollow", topic: "followup", w: 11, onAsk: () => {
      bigTalk.followed = true;
    }, build: () => makeQ(team, { role: "columnist", tag: "Follow-up", quote: quoteOf(state, bigTalk) }, team.record.streak <= -3 ? `That's ${-team.record.streak} straight losses, and you're ${team.record.w}-${team.record.l}. Do you still stand by what you said?` : `After a loss like tonight, ${team.record.w}-${team.record.l} on the year, do you still stand by what you said?`, [
      A("confident", `Every word. Talk to me in March.`, [{ kind: "hype", delta: 3 }, { kind: "security", delta: -2 }, { kind: "morale", target: "team", delta: 2 }]),
      A("humble", `Maybe I got ahead of myself. Right now we need to win one game.`, [{ kind: "mediaRep", delta: 4 }, { kind: "security", delta: 1 }]),
      A("deflect", `I'm not going to look backward tonight.`, [{ kind: "mediaRep", delta: -2 }])
    ]) });
  }
  if (starP && best && best.pts >= 15 && won) {
    const transferFrom = starP.history.some((h2) => h2.startsWith(`Transferred from ${opp.school} to`));
    const dd = best.pts >= 10 && best.orb + best.drb >= 10;
    const variant = transferFrom ? "revenge" : best.pts >= 30 ? "30" : starP.cls === "FR" ? "fresh" : dd ? "dd" : "base";
    cands.push({
      key: `pg.star.${variant}`,
      topic: "star",
      w: transferFrom ? 9 : 6,
      build: () => makeQ(team, { role: variant === "revenge" ? "opp" : "tv", opp, tag: variant === "revenge" ? "Storyline" : void 0 }, variant === "revenge" ? `${nm(starP)} had ${best.pts} against his old team. Did that one mean a little more to him?` : variant === "30" ? `${nm(starP)} went for ${best.pts}. Have you seen him shoot like that before?` : variant === "fresh" ? `${best.pts} points from a freshman. Is ${starP.first} ahead of schedule?` : variant === "dd" ? `${nm(starP)} with a double-double: ${best.pts} and ${best.orb + best.drb}. What does he give you that doesn't show up in the box score?` : v(`${nm(starP)} was terrific tonight. Talk about his performance.`, `${nm(starP)} had ${best.pts}. What's clicking for him right now?`, `${best.pts} points from ${starP.first}. Is he playing the best basketball of his career?`, `How much of tonight's game plan ran through ${nm(starP)}?`), [
        A("praise", variant === "revenge" ? `You'd have to ask him, but I saw the look in his eye at shootaround.` : `He's a special player. Kid's a pro and he plays like one.`, [{ kind: "morale", target: starP.id, delta: 6 }, { kind: "followers", target: starP.id, delta: 8e3 }]),
        A("humble", `He made winning plays, but his teammates found him. It's a team win.`, [{ kind: "morale", target: "team", delta: 2 }]),
        A("fiery", `He can be better. He knows it. We're going to keep pushing him.`, [{ kind: "morale", target: starP.id, delta: starP.traits.includes("coachable") ? 3 : -4 }, { kind: "rating", target: starP.id, key: "iq", delta: 1 }])
      ])
    });
  }
  if (!won && worst) {
    cands.push({ key: "pg.worst", topic: "struggle", w: 5, build: () => makeQ(team, { role: "beat" }, v(`${nm(worst)} struggled tonight. Are you considering lineup changes?`, `${nm(worst)} went ${worstBox.fgm}-for-${worstBox.fga}. What's going on with him?`, `How do you get ${worst.first} going again?`, `${nm(worst)} looked frustrated out there. Is his confidence an issue?`), [
      A("praise", v(`I've got total confidence in him. He'll bounce back.`, `He's one of the hardest workers we have. Shots will fall.`), [{ kind: "morale", target: worst.id, delta: 6 }]),
      A("fiery", `Everybody's minutes are up for grabs. Nobody is guaranteed anything.`, [{ kind: "morale", target: worst.id, delta: -8 }, { kind: "morale", target: "team", delta: 1 }]),
      A("deflect", `I'm not going to talk about individual guys tonight.`, [{ kind: "mediaRep", delta: -1 }])
    ]) });
  }
  const freshStar = openClaims(state, ["freshStar"], (x) => x.season === state.season && !!x.subject && state.players[x.subject]?.teamId === team.id)[0];
  if (freshStar && state.day >= 12) {
    const p = state.players[freshStar.subject];
    const ppg2 = p.stats.gp ? p.stats.pts / p.stats.gp : 0;
    cands.push({ key: "pg.freshFollow", topic: "followup", w: 4, onAsk: () => {
      freshStar.followed = true;
    }, build: () => makeQ(team, { role: "beat", tag: "Follow-up", quote: quoteOf(state, freshStar) }, ppg2 >= 11 ? `You said ${p.first} would start from day one. He's averaging ${ppg2.toFixed(1)} points. Is he exceeding even your expectations?` : `You were high on ${nm(p)} in the preseason. He's at ${ppg2.toFixed(1)} points a game. Is the freshman adjustment harder than you expected?`, ppg2 >= 11 ? [
      A("confident", `No. This is exactly who I said he was.`, [{ kind: "morale", target: p.id, delta: 5 }, { kind: "hype", delta: 2 }]),
      A("praise", `He's a worker. He earned every bit of it.`, [{ kind: "morale", target: p.id, delta: 4 }, { kind: "morale", target: "team", delta: 1 }])
    ] : [
      A("praise", `He'll be fine. Freshmen take time. I believe in him completely.`, [{ kind: "morale", target: p.id, delta: 6 }]),
      A("humble", `I probably put too much on him too early. That's on me.`, [{ kind: "mediaRep", delta: 3 }, { kind: "morale", target: p.id, delta: 2 }])
    ]) });
  }
  const injured = c.players.slice(0, 8).find((p) => p.injury && p.injury.games > 0);
  if (injured) {
    cands.push({ key: "pg.injury", topic: "injury", w: 4, build: () => makeQ(team, { role: "tv" }, `Any update on ${nm(injured)}? How much are you missing him?`, [
      A("humble", `Day to day. We'll be smart with him. His long-term health comes first.`, [{ kind: "mediaRep", delta: 3 }, { kind: "morale", target: injured.id, delta: 3 }]),
      A("praise", `You can't replace a guy like that. The others have to step up, and they are.`, [{ kind: "morale", target: "team", delta: 2 }]),
      A("deflect", `I don't talk about injuries.`, [{ kind: "mediaRep", delta: -2 }])
    ]) });
  }
  const tp = ts.tpa ? ts.tpm / ts.tpa : 0;
  if (ts.tpa >= 15 && tp >= 0.45) {
    cands.push({ key: "pg.hot", topic: "shooting", w: 4, build: () => makeQ(team, { role: "analytics" }, `You made ${ts.tpm} of ${ts.tpa} from three. Is that sustainable, or was it just one of those nights?`, [
      A("confident", `We have shooters. When we move the ball, that's what happens.`, [{ kind: "hype", delta: 3 }, { kind: "morale", target: "team", delta: 2 }]),
      A("joke", `I'd like to take credit for it, but I can't shoot. Never could.`, [{ kind: "mediaRep", delta: 3 }]),
      A("humble", `Some nights the rim looks like an ocean. We can't count on it.`, [{ kind: "mediaRep", delta: 2 }])
    ]) });
  } else if (ts.tpa >= 15 && tp <= 0.25) {
    cands.push({ key: "pg.cold", topic: "shooting", w: 4, build: () => makeQ(team, { role: "analytics" }, `${ts.tpm} for ${ts.tpa} from three. ${won ? "How do you win shooting like that?" : "Were those the shots you wanted?"}`, won ? [
      A("praise", `Defense travels. When shots aren't falling, you get stops. Proud of that.`, [{ kind: "morale", target: "team", delta: 3 }]),
      A("joke", `We'll be in the gym early tomorrow. Very early.`, [{ kind: "mediaRep", delta: 2 }])
    ] : [
      A("humble", `Good looks, they just didn't fall. Keep shooting.`, [{ kind: "morale", target: "team", delta: 3 }]),
      A("fiery", `No. We settled. We fell in love with the three and got away from what works.`, [{ kind: "morale", target: "team", delta: -1 }, { kind: "mediaRep", delta: 1 }])
    ]) });
  }
  if (ts.tov >= 17) {
    cands.push({ key: "pg.tov", topic: "details", w: 4, build: () => makeQ(team, { role: "beat" }, `${ts.tov} turnovers tonight. What's behind the sloppiness?`, [
      A("fiery", `Careless. Unacceptable. We'll fix it, and they won't enjoy how.`, [{ kind: "morale", target: "team", delta: -2 }, { kind: "mediaRep", delta: 1 }]),
      A("humble", `Some of that is their pressure. Some of it's us. We have to value the ball.`, [{ kind: "mediaRep", delta: 2 }])
    ]) });
  } else if (!won && Math.abs(margin) <= 6 && ts.fta - ts.ftm >= 7) {
    cands.push({ key: "pg.ft", topic: "details", w: 5, build: () => makeQ(team, { role: "beat" }, `You missed ${ts.fta - ts.ftm} free throws in a ${pts(-margin)} loss. Is that the story of the game?`, [
      A("humble", `Free throws cost us. That's just the truth. We'll shoot a lot of them this week.`, [{ kind: "mediaRep", delta: 3 }]),
      A("deflect", `There were 40 minutes of plays. You can't pin it on one thing.`, [{ kind: "mediaRep", delta: -1 }, { kind: "morale", target: "team", delta: 2 }])
    ]) });
  } else if (Math.abs(ts.reb - os.reb) >= 12) {
    const outr = ts.reb > os.reb;
    cands.push({ key: outr ? "pg.boardsW" : "pg.boardsL", topic: "details", w: 3, build: () => makeQ(team, { role: "beat" }, outr ? `You out-rebounded ${opp.school} ${ts.reb}-${os.reb}. Was that the plan?` : `${opp.school} beat you on the glass, ${os.reb}-${ts.reb}. What happened?`, outr ? [
      A("praise", `Effort plays. Our bigs were relentless.`, [{ kind: "morale", target: "team", delta: 3 }]),
      A("confident", `That's our identity. Nobody's going to out-tough us.`, [{ kind: "hype", delta: 3 }])
    ] : [
      A("fiery", `They wanted it more. That's the only explanation, and it's not acceptable.`, [{ kind: "morale", target: "team", delta: -2 }]),
      A("humble", `They're big and physical. We have to do a better job boxing out.`, [{ kind: "mediaRep", delta: 2 }])
    ]) });
  }
  if (ts.bench >= 28 || ts.bench <= 4 && mine.length > 6) {
    const deep = ts.bench >= 28;
    cands.push({ key: deep ? "pg.benchBig" : "pg.benchNone", topic: "depth", w: 3, build: () => makeQ(team, { role: "beat" }, deep ? `Your bench scored ${ts.bench}. How big was that?` : `Your bench scored ${ts.bench} points. Are you worried about depth?`, deep ? [
      A("praise", `Huge. Those guys practice hard every day and they were ready.`, [{ kind: "morale", target: "team", delta: 4 }]),
      A("confident", `We're 10 deep. Not many teams can say that.`, [{ kind: "hype", delta: 3 }])
    ] : [
      A("humble", `We need more from the second unit, and I need to find the right combinations.`, [{ kind: "mediaRep", delta: 2 }]),
      A("fiery", `Guys coming off the bench need to bring energy. It wasn't there.`, [{ kind: "morale", target: "team", delta: -2 }])
    ]) });
  }
  if (won && oppLead >= 10) {
    cands.push({ key: "pg.comeback", topic: "flow", w: 7, build: () => makeQ(team, { role: "tv" }, `You were down ${oppLead} at one point. What changed?`, [
      A("praise", `Our guys never blinked. Nobody panicked. That's character.`, [{ kind: "morale", target: "team", delta: 5 }]),
      A("humble", `We dug ourselves a hole. I'm glad we climbed out, but we can't do that every night.`, [{ kind: "mediaRep", delta: 3 }]),
      A("joke", `I got some gray hairs tonight. Thanks, guys.`, [{ kind: "mediaRep", delta: 3 }, { kind: "hype", delta: 2 }])
    ]) });
  } else if (!won && ourLead >= 10) {
    cands.push({ key: "pg.blown", topic: "flow", w: 7, build: () => makeQ(team, { role: "beat" }, `You led by ${ourLead}. How did it slip away?`, [
      A("humble", `We stopped attacking. We played not to lose. That's on me.`, [{ kind: "mediaRep", delta: 3 }, { kind: "security", delta: -1 }]),
      A("fiery", `We got comfortable. You can't get comfortable against anybody.`, [{ kind: "morale", target: "team", delta: -2 }]),
      A("deflect", `They made shots. Sometimes that happens.`, [{ kind: "mediaRep", delta: -2 }])
    ]) });
  } else if (won && halfUs < halfThem) {
    cands.push({ key: "pg.halftime", topic: "flow", w: 4, build: () => makeQ(team, { role: "tv" }, `You trailed at the half. What was said in the locker room?`, [
      A("fiery", `Not much that I can repeat on TV.`, [{ kind: "hype", delta: 3 }, { kind: "mediaRep", delta: 2 }]),
      A("praise", `The players said it before I could. Our leaders took over.`, [{ kind: "morale", target: "team", delta: 4 }])
    ]) });
  }
  if (!won && Math.abs(margin) <= 5) {
    cands.push({ key: "pg.refs", topic: "refs", w: 2.5, build: () => makeQ(team, { role: "national" }, `There were a couple of tough calls down the stretch. What did you think of the officiating?`, [
      A("fiery", `I'll get fined if I say what I think. Watch the tape and decide for yourself.`, [{ kind: "morale", target: "team", delta: 3 }, { kind: "mediaRep", delta: -3 }, { kind: "security", delta: -1 }]),
      A("humble", `The officials didn't lose that game. We did.`, [{ kind: "mediaRep", delta: 4 }]),
      A("joke", `I thought they were great. Next question, before I change my mind.`, [{ kind: "mediaRep", delta: 2 }])
    ]) });
  }
  if (c.last && c.last.coachId === c.coach.id && state.day >= 5 && state.day <= 24 && g.type !== "ncaa") {
    const lh = c.last;
    const better2 = team.record.w - team.record.l > 2 && lh.w - lh.l < 6;
    const worse = team.record.l - team.record.w >= 1 && lh.w - lh.l >= 6;
    if (better2 || worse) {
      cands.push({ key: better2 ? "pg.lastYearUp" : "pg.lastYearDown", topic: "compare", w: 5, build: () => makeQ(team, { role: "beat", tag: "Last season" }, better2 ? `Last season ended ${lh.w}-${lh.l}${lh.ncaaSeed ? "" : " without a tournament bid"}. You're ${team.record.w}-${team.record.l} now. What's different about this group?` : `This team won ${lh.w} games last year. You're ${team.record.w}-${team.record.l} now. Why hasn't it carried over?`, better2 ? [
        A("praise", `Chemistry. These guys genuinely like each other, and it shows on the floor.`, [{ kind: "morale", target: "team", delta: 4 }]),
        A("confident", `We're older and tougher. Last year taught us how to win close games.`, [{ kind: "hype", delta: 4 }]),
        A("humble", `It's early. Ask me again in February.`, [{ kind: "mediaRep", delta: 3 }])
      ] : [
        A("humble", `We lost a lot from last year's team, and we're still finding our identity. I have to speed that up.`, [{ kind: "mediaRep", delta: 3 }, { kind: "security", delta: 1 }]),
        A("fiery", `Some guys think last year's wins come back automatically. They don't.`, [{ kind: "morale", target: "team", delta: -2 }, { kind: "hype", delta: 1 }]),
        A("deflect", `Last year doesn't matter. Different team.`, [{ kind: "mediaRep", delta: -1 }])
      ]) });
    }
  }
  const rematch = state.schedule.find((x) => x.played && x.id !== g.id && x.day < g.day && (x.home === team.id && x.away === opp.id || x.home === opp.id && x.away === team.id));
  if (rematch && rematch.hs != null && rematch.as != null) {
    const ru = rematch.home === team.id ? rematch.hs : rematch.as, rt = rematch.home === team.id ? rematch.as : rematch.hs;
    const lostFirst = ru < rt;
    cands.push({ key: "pg.rematch", topic: "rematch", w: 7, build: () => makeQ(team, { role: "opp", opp, tag: "Rematch" }, lostFirst ? won ? `They beat you ${rt}-${ru} the first time. What changed?` : `That's two losses to ${opp.school} this season. What do they do that gives you trouble?` : won ? `That's a season sweep of ${opp.school}. What's the key against them?` : `You won the first meeting ${ru}-${rt}. Why was tonight different?`, [
      A("praise", won ? `Our guys took that first game personally. You could see it.` : `They're well coached. They made adjustments and we didn't.`, [{ kind: "mediaRep", delta: 3 }, { kind: "morale", target: "team", delta: 2 }]),
      A("confident", won ? `We know exactly who they are now. That's going to keep happening.` : `If we see them again, it'll be different. Promise you that.`, [{ kind: "hype", delta: 4 }]),
      A("deflect", `Every game's different. I don't put much into the first one.`, [{ kind: "mediaRep", delta: -1 }])
    ]) });
  }
  if (c.recap?.elim?.oppId === opp.id && !ncaa) {
    const elim = c.recap.elim;
    cands.push({ key: "pg.revenge", topic: "rematch", w: 9, build: () => makeQ(team, { role: "national", tag: "Last season" }, won ? `${opp.school} ended your season in the ${elim.round} last year. How much did that motivate tonight?` : `${opp.school} ended your season last March, and they beat you again tonight. Are they in your heads?`, won ? [
      A("fiery", `We didn't say it out loud. We didn't have to.`, [{ kind: "hype", delta: 6 }, { kind: "morale", target: "team", delta: 3 }]),
      A("humble", `Different year, different team. But I won't pretend it doesn't feel good.`, [{ kind: "mediaRep", delta: 3 }, { kind: "hype", delta: 2 }])
    ] : [
      A("fiery", `No. And the next time we see them, we'll prove it.`, [{ kind: "hype", delta: 3 }, { kind: "morale", target: "team", delta: 2 }]),
      A("humble", `They're a great team. We have to be better. Simple as that.`, [{ kind: "mediaRep", delta: 3 }])
    ]) });
  }
  if (g.type === "conf" && team.record.cw + team.record.cl >= 5 && c.conf) {
    const st = confStandings(state, team.conf);
    const pos = st.findIndex((t) => t.id === team.id) + 1;
    const leader = st[0];
    const gb = (leader.record.cw - leader.record.cl - (team.record.cw - team.record.cl)) / 2;
    const left = state.schedule.filter((x) => !x.played && x.type === "conf" && (x.home === team.id || x.away === team.id)).length;
    cands.push({ key: pos === 1 ? "pg.confLead" : gb <= 2 ? "pg.confChase" : "pg.confBack", topic: "conf", w: pos <= 3 ? 6 : 3, build: () => makeQ(team, { role: "beat" }, pos === 1 ? `You're ${team.record.cw}-${team.record.cl} and alone at the top of the ${confName(c)}${left ? ` with ${left} league games left` : ""}. Can anybody catch you?` : gb <= 2 ? `You're ${gb === 0 ? "tied for first" : `${gb} game${gb === 1 ? "" : "s"} back of ${leader.school}`} in the ${confName(c)}. Is a league title realistic?` : `You're ${ord2(pos)} in the ${confName(c)}, ${gb} games back. What's the goal from here?`, pos <= 2 || gb <= 2 ? [
      A("confident", `We're winning this league. Nobody's taking it from us.`, [{ kind: "hype", delta: 5 }, { kind: "morale", target: "team", delta: 2 }], { kind: "confTitle" }),
      A("humble", `We don't look at the standings. One game at a time is a clich\xE9 because it works.`, [{ kind: "mediaRep", delta: 3 }]),
      A("praise", `This league is brutal. Being in the race at all says a lot about our guys.`, [{ kind: "morale", target: "team", delta: 3 }])
    ] : [
      A("humble", `Get better every day and be playing our best in March.`, [{ kind: "mediaRep", delta: 3 }, { kind: "security", delta: 1 }]),
      A("fiery", `Win every game left. That's the only goal I care about.`, [{ kind: "morale", target: "team", delta: 2 }, { kind: "hype", delta: 2 }])
    ]) });
  }
  if (g.type !== "ncaa" && state.day >= 22 && state.user.expectationLevel >= 2) {
    const sr = selectionRank(state, team.id);
    if (sr <= 70) {
      const seed = Math.ceil(sr / 4);
      const label = sr <= 36 ? `a projected No. ${seed} seed` : sr <= 46 ? "just on the right side of the bubble" : sr <= 56 ? "squarely on the bubble" : "on the outside looking in";
      cands.push({ key: sr <= 36 ? "pg.bracketSafe" : "pg.bubble", topic: "bracket", w: sr > 36 && sr <= 56 ? 7 : 4, build: () => makeQ(team, { role: "analytics" }, `Bracketologists have you ${label}. ${sr <= 36 ? "Do you pay attention to seeding?" : "How much are you thinking about the bubble?"}`, sr <= 36 ? [
        A("confident", `We want to be on the top line. That's the goal.`, [{ kind: "hype", delta: 4 }], { kind: "tourney" }),
        A("humble", `I don't look at it. Win games and the seed takes care of itself.`, [{ kind: "mediaRep", delta: 3 }])
      ] : [
        A("confident", `We'll be dancing. I'm not worried.`, [{ kind: "hype", delta: 4 }, { kind: "security", delta: -1 }], { kind: "tourney" }),
        A("humble", `We control our own destiny. Win and we'll be fine.`, [{ kind: "mediaRep", delta: 3 }]),
        A("fiery", `Every game's a tournament game for us now. The guys know it.`, [{ kind: "morale", target: "team", delta: 3 }])
      ]) });
    }
  }
  if (team.record.streak >= 4 || team.record.streak <= -3) {
    const sk = team.record.streak;
    cands.push({ key: sk > 0 ? "pg.streakW" : "pg.streakL", topic: "streak", w: 6, build: () => makeQ(team, { role: "beat" }, sk > 0 ? v(`That's ${sk} straight wins. Is this team peaking?`, `${sk} in a row. What's driving this run?`, `Nobody's beaten you in ${sk} games. Does this team feel different?`) : v(`That's ${-sk} losses in a row. Is there any concern about the direction of the program?`, `${-sk} straight losses. How do you stop the bleeding?`, `How is the locker room holding up through ${-sk} straight losses?`), sk > 0 ? [
      A("confident", `We haven't peaked. That's the scary part.`, [{ kind: "hype", delta: 5 }, { kind: "morale", target: "team", delta: 2 }], { kind: "peaking" }),
      A("humble", `Streaks are fun but they end. Stay present.`, [{ kind: "mediaRep", delta: 3 }]),
      A("praise", `Our older guys. They've set the tone in practice every day.`, [{ kind: "morale", target: "team", delta: 3 }])
    ] : [
      A("fiery", `Concern? No. Anger? Yes. We'll fix it.`, [{ kind: "security", delta: 1 }, { kind: "morale", target: "team", delta: -1 }]),
      A("humble", `Of course. It's my job to get it turned around and I will.`, [{ kind: "mediaRep", delta: 3 }, { kind: "security", delta: 2 }]),
      A("deflect", `Ask me in March.`, [{ kind: "mediaRep", delta: -3 }, { kind: "security", delta: -2 }])
    ]) });
  }
  if (ctourn) {
    cands.push({ key: won ? "pg.ctW" : "pg.ctL", topic: "march", w: 6, build: () => makeQ(team, { role: "national" }, won ? `You're moving on in the ${g.event ?? "conference tournament"}. How do you keep the legs fresh?` : `Your conference tournament is over. Have you done enough for Selection Sunday?`, won ? [
      A("confident", `Legs don't matter in March. Hearts do.`, [{ kind: "hype", delta: 3 }, { kind: "morale", target: "team", delta: 2 }]),
      A("humble", `Ice baths and film. Survive and advance.`, [{ kind: "mediaRep", delta: 2 }])
    ] : [
      A("confident", `Our r\xE9sum\xE9 speaks for itself. We'll be in.`, [{ kind: "hype", delta: 3 }, { kind: "mediaRep", delta: -1 }], { kind: "tourney" }),
      A("humble", `It's out of our hands now. We'll watch on Sunday like everybody else.`, [{ kind: "mediaRep", delta: 3 }])
    ]) });
  }
  const homeLeft = state.schedule.some((x) => !x.played && x.home === team.id && !x.neutral && (x.type === "conf" || x.type === "nc") && x.day > g.day);
  const seniors = c.players.filter((p) => p.elig <= 1 && !p.redshirting).slice(0, 3);
  if (home && !g.neutral && g.type === "conf" && !homeLeft && seniors.length) {
    cands.push({ key: "pg.seniorNight", topic: "senior", w: 8, build: () => makeQ(team, { role: "tv", tag: "Senior Night" }, `Senior night for ${list(seniors.map(nm))}. What will you remember about them?`, [
      A("praise", `They're the reason this program is where it is. I'll miss them more than they know.`, [{ kind: "morale", target: "team", delta: 5 }, { kind: "hype", delta: 3 }]),
      A("humble", `It's emotional. Coaches aren't supposed to cry at the podium, but I came close.`, [{ kind: "mediaRep", delta: 4 }, { kind: "hype", delta: 2 }])
    ]) });
  }
  const broke = recordsInGame(state, g.id).filter((r) => r.teamId === team.id)[0];
  if (broke) {
    const cat = (broke.scope === "teamGame" ? TEAM_GAME_CATS : GAME_CATS).find((x) => x.id === broke.cat);
    const bp = broke.p ? state.players[broke.p] : void 0;
    if (cat) {
      cands.push({ key: "pg.record", topic: "record", w: 14, build: () => makeQ(team, { role: "tv", tag: "Record" }, bp ? `${nm(bp)} just set a new ${broke.level === "league" ? "league" : "program"} single-game record with ${fmtRec(cat, broke.v)} ${cat.label.toLowerCase()}${broke.prevName ? `, passing ${broke.prevName}` : ""}. Did you know he was close?` : `That's a new ${broke.level === "league" ? "league" : "program"} record: ${fmtRec(cat, broke.v)} ${cat.label.toLowerCase()} in a game. What does that say about this team?`, bp ? [
        A("praise", `Somebody told me with about two minutes left. That's history, and he earned every bit of it.`, [{ kind: "morale", target: bp.id, delta: 8 }, { kind: "followers", target: bp.id, delta: 2e4 }, { kind: "hype", delta: 3 }]),
        A("humble", `His teammates kept finding him. That record belongs to everybody in that locker room.`, [{ kind: "morale", target: "team", delta: 3 }, { kind: "mediaRep", delta: 2 }]),
        A("joke", `I told him to keep shooting. Clearly I'm a genius.`, [{ kind: "mediaRep", delta: 3 }, { kind: "hype", delta: 2 }])
      ] : [
        A("confident", `When we're clicking, we can do things nobody else in the country can do.`, [{ kind: "hype", delta: 5 }]),
        A("humble", `Nights like this don't happen often. We'll enjoy it and get back to work.`, [{ kind: "mediaRep", delta: 3 }])
      ]) });
    }
  }
  if (won && state.coaches[state.user.coachId].careerW % 50 === 0 && state.coaches[state.user.coachId].careerW > 0) {
    const w = state.coaches[state.user.coachId].careerW;
    cands.push({ key: "pg.milestone", topic: "milestone", w: 9, build: () => makeQ(team, { role: "tv", tag: "Milestone" }, `That's career win No. ${w}. What does that number mean to you?`, [
      A("humble", `It means I've been lucky to coach a lot of great players. They won those games.`, [{ kind: "mediaRep", delta: 4 }, { kind: "morale", target: "team", delta: 3 }]),
      A("joke", `It means I'm getting old. Somebody get me a chair.`, [{ kind: "mediaRep", delta: 3 }, { kind: "hype", delta: 2 }])
    ]) });
  }
  if (home && !g.neutral && (big || team.hype >= 70) && won) {
    cands.push({ key: "pg.crowd", topic: "crowd", w: 3, build: () => makeQ(team, { role: "student" }, `That crowd tonight. How much did the student section help?`, [
      A("praise", `They were the sixth man. I could barely hear my own huddle. Best fans in the country.`, [{ kind: "hype", delta: 5 }]),
      A("joke", `I owe them pizza. I said that last time too. I really need to start paying up.`, [{ kind: "hype", delta: 4 }, { kind: "mediaRep", delta: 2 }])
    ]) });
    cands.push({ key: "pg.recruits", topic: "recruiting", w: 3, build: () => makeQ(team, { role: "beat" }, `There were some big-time recruits in the building tonight. What do you hope they saw?`, [
      A("confident", `A program on the rise and the best home crowd in the country.`, [{ kind: "recruitInterest", delta: 3 }, { kind: "hype", delta: 2 }]),
      A("humble", `I can't talk about recruits. But I hope everybody in the building had fun.`, [{ kind: "mediaRep", delta: 2 }, { kind: "recruitInterest", delta: 1 }])
    ]) });
  }
  if (g.event && !tourney) {
    cands.push({ key: "pg.event", topic: "crowd", w: 3, build: () => makeQ(team, { role: "national" }, `How much did the atmosphere at the ${g.event} add to tonight?`, [
      A("praise", `Unreal. These are the games you play college basketball for.`, [{ kind: "hype", delta: 3 }, { kind: "recruitInterest", delta: 1 }]),
      A("humble", `Fun environment, but it's still 40 minutes of basketball.`, [{ kind: "mediaRep", delta: 1 }])
    ]) });
  }
  cands.push({ key: "pg.opp", topic: "opp", w: 1.5, build: () => makeQ(team, { role: "opp", opp }, won ? v(`What makes ${opp.school} such a tough matchup?`, `How did you game-plan for ${opp.school}'s best player?`, `What did you see on film from ${opp.school} that worried you?`) : v(`What did ${opp.school} do that gave you the most trouble?`, `Was ${opp.school} better than you expected?`, `How does ${opp.school} stack up against the best teams you've seen?`), [
    A("praise", `${opp.school} is well coached and they play hard. ${won ? "We had to earn that one." : "They deserved it tonight."}`, [{ kind: "mediaRep", delta: 3 }]),
    A("humble", won ? `They make you defend for a full shot clock. That wears on you.` : `Their pace. We never got comfortable.`, [{ kind: "mediaRep", delta: 2 }])
  ]) });
  if (!tourney) {
    cands.push({ key: "pg.nil", topic: "nil", w: 1.2, build: () => makeQ(team, { role: "national" }, v(`Any update on NIL? Fans want to know if the collective is doing enough.`, `Is your collective keeping up with the programs you're recruiting against?`), [
      A("confident", `Our collective is going to make some noise. Donors, call me.`, [{ kind: "nilBudget", delta: 75e3 }, { kind: "mediaRep", delta: -1 }]),
      A("humble", `Our fans and donors have been incredible. We're grateful.`, [{ kind: "nilBudget", delta: 3e4 }, { kind: "mediaRep", delta: 2 }]),
      A("deflect", `That's a question for the collective, not me.`, [{ kind: "mediaRep", delta: -1 }])
    ]) });
  }
  if (team.apRank && won && team.record.w >= 8 && !tourney) {
    cands.push({ key: "pg.poll", topic: "poll", w: 2.5, build: () => makeQ(team, { role: "national" }, `You're ${team.record.w}-${team.record.l} and ranked No. ${team.apRank}. Do you deserve to be higher?`, [
      A("confident", `Put us against anybody in the country. We'll find out.`, [{ kind: "hype", delta: 4 }, { kind: "mediaRep", delta: -1 }]),
      A("humble", `Polls don't matter until the last one. We're fine where we are.`, [{ kind: "mediaRep", delta: 3 }])
    ]) });
  }
  if (state.day > 3 && won && !tourney) {
    const f = funQuestion(state, team, "pg");
    f.w = 1.5;
    cands.push(f);
  }
  {
    const chem = team.chem ?? 60;
    const caps = captainsOf(state, team);
    if (!won && chem < 42) {
      cands.push({ key: "pg.fractured", topic: "chemistry", w: 7, build: () => makeQ(team, { role: "columnist", tag: "Locker room" }, v(`There's talk that your locker room is ${chemLabel(chem).label.toLowerCase()}. Is that true?`, `From the outside it looks like this team isn't playing for each other. Is something going on in that locker room?`, `Are your players still listening to you?`), [
        A("humble", `We have work to do, on the floor and off it. That starts with me.`, [{ kind: "chem", delta: 2 }, { kind: "mediaRep", delta: 2 }]),
        A("deflect", `Our locker room is fine. Next question.`, [{ kind: "mediaRep", delta: -2 }]),
        A("fiery", `Anybody who isn't all in can find the door. I mean that.`, [{ kind: "chem", delta: -2 }, { kind: "morale", target: "team", delta: -2 }, { kind: "hype", delta: 2 }]),
        ...caps.length ? [A("praise", `${caps.map((p) => p.last).join(" and ")} have been great. Our leaders will get us through this.`, [{ kind: "chem", delta: 2 }, ...caps.map((p) => ({ kind: "morale", target: p.id, delta: 4 }))])] : []
      ]) });
    } else if (won && chem >= 75 && !tourney) {
      cands.push({ key: "pg.brotherhood", topic: "chemistry", w: 2.5, build: () => makeQ(team, { role: "beat", tag: "Locker room" }, v(`This team looks like it genuinely likes each other. Where does that come from?`, `Your bench was going crazy all night. What's the vibe in that locker room?`), [
        A("praise", caps.length ? `Start with ${caps.map((p) => p.last).join(" and ")}. Our captains set the tone every day.` : `The older guys. They set the tone every day.`, [{ kind: "chem", delta: 1 }, ...caps.map((p) => ({ kind: "morale", target: p.id, delta: 3 }))]),
        A("joke", `They're all scared of our trainer. Nothing brings people together like a common enemy.`, [{ kind: "mediaRep", delta: 2 }, { kind: "chem", delta: 1 }]),
        A("humble", `It's the best group I've coached. I'm lucky.`, [{ kind: "morale", target: "team", delta: 2 }, { kind: "mediaRep", delta: 1 }])
      ]) });
    }
  }
  const n = big || cands.some((x) => x.topic === "followup") ? 4 : 3;
  const title = won ? upsetWin ? "Postgame: Statement Win" : rv ? "Postgame: Rivalry Win" : ncaa ? "Postgame: Survive and Advance" : "Postgame Press Conference" : badLoss ? "Postgame: Damage Control" : ncaa ? "Postgame: Season Over" : "Postgame Press Conference";
  return {
    id: rng.id("pc"),
    title,
    context: `${team.school} ${us}, ${opp.school} ${them}${ot ? ` (${box.ot > 1 ? `${box.ot}OT` : "OT"})` : ""}${g.event ? ` \xB7 ${g.event}` : ""}`,
    when,
    questions: choose(state, cands, n).filter((x) => x.answers.length)
  };
}
function selectionPresser(state, field) {
  const c = ctxFor(state);
  const { team } = c;
  const me = field.find((e) => e.teamId === team.id);
  const sr = selectionRank(state, team.id);
  if (!me && sr > 60 && state.user.expectationLevel < 3) return null;
  const cands = [];
  const region = me ? REGIONS[me.region] ?? "its" : "";
  const r1 = state.ncaa?.rounds.flatMap((r) => r).find((bg) => bg.teams.includes(team.id) && bg.round <= 1);
  const firstOppId = r1?.teams.find((t) => t && t !== team.id) ?? null;
  const firstOpp = firstOppId ? state.teams[firstOppId] : void 0;
  const expectedSeed = team.apRank ? Math.ceil(team.apRank / 4) : null;
  if (me) {
    const disrespect = expectedSeed != null && me.seed - expectedSeed >= 2;
    cands.push({ key: disrespect ? "ss.disrespect" : me.firstFour ? "ss.firstFour" : "ss.seed", topic: "seed", w: 10, lead: true, build: () => makeQ(team, { role: "national" }, disrespect ? `You're ranked No. ${team.apRank} but got a No. ${me.seed} seed. Do you feel disrespected by the committee?` : me.firstFour ? `You're in, but you're headed to the First Four. Your reaction?` : v(`A No. ${me.seed} seed in the ${region} Region. Your reaction when you saw your name?`, `No. ${me.seed} seed, ${region} Region. What went through your mind?`), disrespect ? [
      A("fiery", `Disrespected? Yes. And my guys saw it too. Somebody's going to pay for it.`, [{ kind: "morale", target: "team", delta: 5 }, { kind: "hype", delta: 4 }, { kind: "mediaRep", delta: -2 }]),
      A("humble", `The seed doesn't matter. You have to beat good teams no matter where they put you.`, [{ kind: "mediaRep", delta: 4 }]),
      A("joke", `I'll be sending the committee a fruit basket. A very small one.`, [{ kind: "mediaRep", delta: 3 }, { kind: "hype", delta: 2 }])
    ] : [
      A("praise", `Pure joy. Watching my players' faces when our name came up, that's why you do this.`, [{ kind: "morale", target: "team", delta: 4 }, { kind: "hype", delta: 4 }]),
      A("confident", `Happy to be in, but we're not here to just be here. We're here to make a run.`, [{ kind: "hype", delta: 6 }, { kind: "morale", target: "team", delta: 2 }], { kind: "deepRun" }),
      A("humble", `Grateful. A lot of good teams are sitting at home tonight.`, [{ kind: "mediaRep", delta: 4 }])
    ]) });
  } else {
    cands.push({ key: "ss.snub", topic: "seed", w: 10, lead: true, build: () => makeQ(team, { role: "national" }, `Your name wasn't called. Was the committee wrong?`, [
      A("fiery", `Absolutely. Look at our r\xE9sum\xE9 and tell me with a straight face we're not a tournament team.`, [{ kind: "morale", target: "team", delta: 3 }, { kind: "mediaRep", delta: -3 }, { kind: "hype", delta: 2 }]),
      A("humble", `We left the door open. We didn't win enough games. That's on us, and on me.`, [{ kind: "mediaRep", delta: 4 }, { kind: "security", delta: 1 }]),
      A("deflect", `I'm not going to criticize the committee. It's a tough job.`, [{ kind: "mediaRep", delta: 2 }])
    ]) });
    cands.push({ key: "ss.next", topic: "future", w: 6, build: () => makeQ(team, { role: "beat" }, `What does this team need to do this offseason to make sure this doesn't happen again?`, [
      A("confident", `Get tougher, get deeper, and get back. We'll be dancing next year.`, [{ kind: "hype", delta: 4 }], { kind: "tourney" }),
      A("humble", `Look in the mirror, starting with me. Then get to work.`, [{ kind: "mediaRep", delta: 3 }, { kind: "security", delta: 1 }])
    ]) });
  }
  if (firstOpp) {
    cands.push({ key: "ss.opp", topic: "opp", w: 7, build: () => makeQ(team, { role: "opp", opp: firstOpp }, `You'll open against ${firstOpp.school}${firstOpp.apRank ? `, ranked No. ${firstOpp.apRank}` : ""}. What do you know about them?`, [
      A("praise", `They're dangerous. Well coached, and they won't be scared of anybody.`, [{ kind: "mediaRep", delta: 3 }]),
      A("confident", `I know they've got their hands full with us.`, [{ kind: "hype", delta: 4 }, { kind: "mediaRep", delta: -1 }]),
      A("joke", `I know where they're from and that's about it. Give me 24 hours and a pot of coffee.`, [{ kind: "mediaRep", delta: 3 }])
    ]) });
  }
  if (me && !me.firstFour) {
    const pods = { 1: 8, 16: 8, 8: 1, 9: 1, 4: 5, 13: 5, 5: 4, 12: 4, 3: 6, 14: 6, 6: 3, 11: 3, 2: 7, 15: 7, 7: 2, 10: 2 };
    const r2 = field.find((e) => e.region === me.region && e.seed === pods[me.seed]);
    if (r2) {
      const t2 = state.teams[r2.teamId];
      cands.push({ key: "ss.path", topic: "path", w: 5, build: () => makeQ(team, { role: "analytics" }, `A win would likely set up No. ${r2.seed} seed ${t2.school}. Have you looked that far ahead?`, [
        A("humble", `Not for a second. We have one game on our schedule right now.`, [{ kind: "mediaRep", delta: 3 }]),
        A("confident", `I've looked at the whole bracket. I like our path.`, [{ kind: "hype", delta: 4 }], { kind: "deepRun" })
      ]) });
    }
  }
  const h2 = c.last;
  if (h2 && h2.coachId === c.coach.id) {
    const elim = c.recap?.elim ? state.teams[c.recap.elim.oppId] : void 0;
    cands.push({ key: h2.ncaaSeed ? "ss.lastMarch" : "ss.lastMissed", topic: "history", w: 6, build: () => makeQ(team, { role: "beat", tag: "Last season" }, h2.ncaaSeed ? `Last March ended ${postseasonPhrase(h2)}${elim ? ` against ${elim.school}` : ""}. What's different about this team?` : `You missed the tournament last year. ${me ? "What does it mean to get back?" : "Is this one harder to take?"}`, [
      A("praise", `This group is tougher. They've been through it together.`, [{ kind: "morale", target: "team", delta: 4 }]),
      A("confident", `We're older, deeper, and hungrier. Watch.`, [{ kind: "hype", delta: 4 }]),
      A("humble", `Every March is different. We'll find out together.`, [{ kind: "mediaRep", delta: 3 }])
    ]) });
  }
  if (me) {
    cands.push({ key: "ss.expect", topic: "expect", w: 4, build: () => makeQ(team, { role: "beat" }, `The goal at the start of the year was to "${state.user.expectation.toLowerCase()}". Does that weigh on you this week?`, [
      A("confident", `We set that bar for a reason. We'll clear it.`, [{ kind: "hype", delta: 3 }, { kind: "security", delta: -1 }], { kind: "beatExpect" }),
      A("humble", `I don't think about it. I think about our first game.`, [{ kind: "mediaRep", delta: 2 }])
    ]) });
    cands.push({ key: "ss.bracket", topic: "fun", w: 4, build: () => makeQ(team, { role: "student" }, `Did you fill out a bracket? Who do you have winning it all?`, [
      A("confident", `Us. Every bracket in my house has us cutting down the nets.`, [{ kind: "hype", delta: 6 }, { kind: "morale", target: "team", delta: 2 }], { kind: "deepRun" }),
      A("joke", `My daughter filled mine out. She picked teams by mascot. She'll probably win the pool.`, [{ kind: "mediaRep", delta: 4 }, { kind: "hype", delta: 2 }]),
      A("humble", `I'll fill one out when we're done playing.`, [{ kind: "mediaRep", delta: 2 }])
    ]) });
    const tourneyClaim = openClaims(state, ["tourney"], (x) => x.teamId === team.id && x.season === state.season)[0];
    if (tourneyClaim) {
      cands.push({ key: "ss.claimDelivered", topic: "followup", w: 9, onAsk: () => {
        tourneyClaim.followed = true;
      }, build: () => makeQ(team, { role: "columnist", tag: "Follow-up", quote: quoteOf(state, tourneyClaim) }, `You said this team would be dancing. Here you are. Does it feel good to be right?`, [
        A("confident", `I never doubted it. Not for a second.`, [{ kind: "hype", delta: 4 }, { kind: "mediaRep", delta: 1 }]),
        A("praise", `The players made me right. All credit to them.`, [{ kind: "morale", target: "team", delta: 4 }, { kind: "mediaRep", delta: 2 }])
      ]) });
    }
  }
  const seniors = c.players.filter((p) => p.elig <= 1 && !p.redshirting).slice(0, 2);
  if (seniors.length) {
    cands.push({ key: "ss.seniors", topic: "seniors", w: 4, build: () => makeQ(team, { role: "tv" }, `This is the last March for ${list(seniors.map(nm))}. How do you think they'll handle it?`, [
      A("praise", `They've been waiting their whole careers for this. They'll lead us.`, [{ kind: "morale", target: "team", delta: 4 }]),
      A("humble", `It's emotional for them. I just want them to enjoy every minute.`, [{ kind: "mediaRep", delta: 3 }, { kind: "morale", target: "team", delta: 2 }])
    ]) });
  }
  return { id: rng.id("pc"), title: "Selection Sunday", context: me ? `${team.school} is a No. ${me.seed} seed in the ${region} Region.` : `${team.school} is left out of the field of 68.`, when: "on Selection Sunday", questions: choose(state, cands, 4) };
}
function seasonEndPresser(state, summary) {
  const c = ctxFor(state);
  const { team, coach } = c;
  const os = state.offseason;
  const h2 = team.history[team.history.length - 1];
  const achieved = os?.achieved ?? 0;
  const goal = state.user.expectationLevel;
  const cands = [];
  const invite = pendingMoves(state).find((m) => m.teamId === team.id && m.userChoice);
  if (invite) {
    const to = state.conferences.find((x) => x.id === invite.to);
    cands.push({
      key: "se.invite",
      topic: "conference",
      w: 14,
      lead: true,
      build: () => makeQ(team, { role: "national", tag: "Realignment" }, `Reports say the ${to?.short} has invited ${team.school}. Will you be in the ${to?.short} next season?`, [
        A("confident", `If it's right for this program, we'll take that step. We belong at that level.`, [{ kind: "hype", delta: 5 }]),
        A("deflect", `That's a conversation for our administration. I coach basketball.`, [{ kind: "mediaRep", delta: -1 }]),
        A("humble", `We're proud of where we are. Whatever happens, our fans come first.`, [{ kind: "mediaRep", delta: 3 }, { kind: "security", delta: 1 }])
      ])
    });
  }
  const verdict = achieved > goal ? "over" : achieved === goal ? "met" : "under";
  cands.push({ key: `se.grade.${verdict}`, topic: "grade", w: 10, lead: true, build: () => makeQ(team, { role: "beat" }, verdict === "over" ? v(`The goal was to "${state.user.expectation.toLowerCase()}", and you blew past it. How would you grade this season?`, `You exceeded every expectation this year. What grade do you give it?`) : verdict === "met" ? `You hit your AD's goal of "${state.user.expectation.toLowerCase()}". How would you grade the season?` : v(`The goal was to "${state.user.expectation.toLowerCase()}", and you came up short. Is it fair to call this a disappointment?`, `This season didn't meet expectations. What went wrong?`), verdict === "under" ? [
    A("humble", `Yes. It's fair. I own it, and I'll fix it.`, [{ kind: "mediaRep", delta: 4 }, { kind: "security", delta: 2 }]),
    A("fiery", `Not good enough. The standard here is higher than this, and everybody will feel that this offseason.`, [{ kind: "security", delta: 2 }, { kind: "morale", target: "team", delta: -2 }]),
    A("deflect", `Injuries, bad bounces, close losses. A lot of things went against us.`, [{ kind: "mediaRep", delta: -3 }, { kind: "security", delta: -2 }])
  ] : [
    A("confident", `A-minus. We exceeded what anybody outside our building thought.`, [{ kind: "hype", delta: 3 }]),
    A("humble", `Incomplete. We have a long way to go.`, [{ kind: "mediaRep", delta: 3 }, { kind: "security", delta: 1 }]),
    A("praise", `An A for the players. They gave me everything. My grade is a little lower.`, [{ kind: "morale", target: "team", delta: 4 }, { kind: "mediaRep", delta: 2 }])
  ]) });
  const delivered = (cl) => {
    switch (cl.kind) {
      case "deepRun":
        return DEEP.includes(h2?.postseason ?? "");
      case "tourney":
        return h2?.ncaaSeed != null;
      case "beatExpect":
        return achieved > goal;
      case "confTitle":
        return !!(h2?.confChamp || h2?.confTourneyChamp);
      case "rankedHigher":
        return h2?.apFinal != null && h2.apFinal < Number(cl.subject ?? 99);
      case "allAmerican":
        return state.awards.some((a) => a.season === state.season && a.playerId === cl.subject && /All-American/.test(a.name));
      case "freshStar": {
        const p = state.players[cl.subject ?? ""];
        return !!p && p.stats.gp > 0 && p.stats.pts / p.stats.gp >= 10;
      }
      default:
        return true;
    }
  };
  const claims = openClaims(state, ["deepRun", "tourney", "beatExpect", "confTitle", "rankedHigher", "allAmerican", "freshStar"], (x) => x.season === state.season && x.teamId === team.id);
  const focus = claims.find((x) => !delivered(x)) ?? claims[0];
  if (focus) {
    const ok = delivered(focus);
    const subject = focus.subject ? state.players[focus.subject] : void 0;
    const result2 = h2 ? `${h2.w}-${h2.l}${h2.postseason ? `, ${h2.postseason}` : h2.ncaaSeed ? "" : ", no NCAA bid"}` : "where you finished";
    cands.push({ key: "se.claimFollow", topic: "followup", w: 12, onAsk: () => {
      focus.followed = true;
    }, build: () => makeQ(team, { role: "columnist", tag: "Follow-up", quote: quoteOf(state, focus) }, ok ? focus.kind === "allAmerican" && subject ? `You called ${subject.first} an All-American in October, and he made it. Did you know?` : `You said it, and you backed it up: ${result2}. Was there ever a moment you doubted it?` : focus.kind === "allAmerican" && subject ? `You called ${nm(subject)} an All-American. He didn't make the team. Did you put too much on him?` : `You said that ${focus.when}. You finished ${result2}. What happened?`, ok ? [
      A("confident", `Never. I knew what we had in that locker room.`, [{ kind: "hype", delta: 5 }, { kind: "rep", delta: 2 }]),
      A("humble", `Plenty of moments. The players never doubted, and that's what matters.`, [{ kind: "mediaRep", delta: 4 }, { kind: "morale", target: "team", delta: 3 }])
    ] : [
      A("humble", `I said it and we didn't deliver. That's on me. You're right to hold me to it.`, [{ kind: "mediaRep", delta: 5 }, { kind: "security", delta: 1 }]),
      A("fiery", `I'd say it again. I believe in this program, and I'm not going to apologize for that.`, [{ kind: "hype", delta: 3 }, { kind: "mediaRep", delta: -2 }, { kind: "security", delta: -1 }]),
      A("deflect", `Things change over a season. I'm not going to relitigate October.`, [{ kind: "mediaRep", delta: -3 }])
    ]) });
  }
  const elim = pressMemory(state).recap?.season === state.season ? pressMemory(state).recap?.elim : void 0;
  if (elim) {
    const t = state.teams[elim.oppId];
    cands.push({ key: "se.march", topic: "march", w: 6, build: () => makeQ(team, { role: "national" }, `Looking back at the ${t?.school ?? "final"} loss in the ${elim.round}, what would you do differently?`, [
      A("humble", `A hundred things. I've watched it four times. We'll learn from it.`, [{ kind: "mediaRep", delta: 3 }, { kind: "security", delta: 1 }]),
      A("praise", `Not much. ${t?.school ?? "They"} played great. Sometimes you tip your cap.`, [{ kind: "mediaRep", delta: 3 }]),
      A("fiery", `I'd have had us tougher. We'll never be out-toughed in March again.`, [{ kind: "morale", target: "team", delta: 2 }, { kind: "hype", delta: 2 }])
    ]) });
  }
  const star = c.players.filter((p) => p.elig > 1).sort((a, b) => draftScore(b) - draftScore(a))[0];
  if (star) {
    const r = nbaRank(state, star);
    if (r <= 45) {
      cands.push({ key: "se.nba", topic: "nba", w: 8, build: () => makeQ(team, { role: "national" }, `Is ${nm(star)} coming back next year, or is he headed to the NBA? Scouts have him as ${nbaLabel(r)}.`, [
        A("praise", `Whatever he decides, we'll support him 100 percent. That's what we do for our guys.`, [{ kind: "recruitInterest", delta: 2 }, { kind: "morale", target: star.id, delta: 4 }, { kind: "mediaRep", delta: 2 }]),
        A("confident", `I think he'll be back. He has unfinished business here.`, [{ kind: "hype", delta: 4 }, { kind: "morale", target: star.id, delta: -2 }]),
        A("deflect", `That's his decision and his family's. I won't speak for him.`, [{ kind: "mediaRep", delta: 1 }])
      ]) });
    }
  }
  const seniors = c.players.filter((p) => p.elig <= 1 && !p.redshirting).sort((a, b) => b.ovr - a.ovr).slice(0, 3);
  if (seniors.length) {
    cands.push({ key: "se.seniors", topic: "seniors", w: 5, build: () => makeQ(team, { role: "tv" }, `${list(seniors.map(nm))} played ${seniors.length > 1 ? "their" : "his"} last game for ${team.school}. What will you remember?`, [
      A("praise", `How they showed up every single day. They set the standard for everyone after them.`, [{ kind: "morale", target: "team", delta: 4 }, { kind: "recruitInterest", delta: 1 }]),
      A("humble", `That's the hardest part of this job. Saying goodbye.`, [{ kind: "mediaRep", delta: 3 }])
    ]) });
  }
  const dvg = state.development;
  if (dvg && dvg.goalsSeason === state.season) {
    const unhappy = c.players.filter((p) => p.elig > 1 && dvg.goals[p.id]?.result === "missed" && (dvg.goals[p.id].kind === "minutes" || dvg.goals[p.id].kind === "starter")).sort((a, b) => b.ovr - a.ovr)[0];
    if (unhappy) {
      cands.push({ key: "se.unhappy", topic: "portalRisk", w: 6, build: () => makeQ(team, { role: "national" }, `${nm(unhappy)} wanted a bigger role this year and didn't get it. Are you worried he'll enter the portal?`, [
        A("humble", `I'll sit down with him this week. He's earned an honest conversation about next year.`, [{ kind: "morale", target: unhappy.id, delta: 6 }, { kind: "mediaRep", delta: 2 }]),
        A("confident", `His role grows next season. He knows that, and so does everybody in our building.`, [{ kind: "morale", target: unhappy.id, delta: 4 }, { kind: "morale", target: "team", delta: -1 }]),
        A("deflect", `Every player has to earn his minutes. That's how it works here.`, [{ kind: "morale", target: unhappy.id, delta: -4 }, { kind: "morale", target: "team", delta: 1 }])
      ]) });
    }
  }
  const offers = state.user.offers;
  if (offers.length) {
    const best = [...offers].sort((a, b) => state.teams[b.teamId].prestige - state.teams[a.teamId].prestige)[0];
    const t = state.teams[best.teamId];
    cands.push({ key: "se.job", topic: "job", w: 11, lead: t.prestige > team.prestige, build: () => makeQ(team, { role: "national" }, v(`Your name has come up for the ${t.school} job. Are you staying at ${team.school}?`, `There are reports ${t.school} wants to talk to you. Can you tell ${team.school} fans you're not going anywhere?`), [
      A("humble", `I'm not going anywhere. I love this place, and we have unfinished business.`, [{ kind: "security", delta: 4 }, { kind: "mediaRep", delta: 2 }, { kind: "hype", delta: 3 }], { kind: "notLeaving" }),
      A("confident", `It's flattering. I'll always listen. That's just good business.`, [{ kind: "rep", delta: 3 }, { kind: "security", delta: -5 }, { kind: "hype", delta: -3 }]),
      A("deflect", `I'm not going to comment on rumors.`, [{ kind: "mediaRep", delta: -2 }, { kind: "security", delta: -1 }])
    ]) });
  } else if (coach.jobSecurity < 30) {
    cands.push({ key: "se.hotseat", topic: "job", w: 9, build: () => makeQ(team, { role: "columnist" }, `Do you expect to be the coach here next season?`, [
      A("humble", `That's not my call. I've given everything I have, and I'd like the chance to finish the job.`, [{ kind: "mediaRep", delta: 4 }, { kind: "security", delta: 2 }]),
      A("fiery", `Yes. And we're going to make a lot of people eat their words.`, [{ kind: "hype", delta: 3 }, { kind: "mediaRep", delta: -2 }]),
      A("deflect", `I'm focused on the offseason. That's all I can control.`, [{ kind: "mediaRep", delta: -1 }])
    ]) });
  } else if (os && os.securityDelta >= 9) {
    cands.push({ key: "se.extension", topic: "job", w: 5, build: () => makeQ(team, { role: "beat" }, `There's talk of a contract extension after this season. Are you ready to commit long-term?`, [
      A("humble", `This is home. If they'll have me, I'm not going anywhere.`, [{ kind: "security", delta: 3 }, { kind: "hype", delta: 2 }], { kind: "notLeaving" }),
      A("joke", `I'm committed. My family just bought a house. We're stuck here now.`, [{ kind: "mediaRep", delta: 3 }, { kind: "hype", delta: 2 }])
    ]) });
  }
  cands.push({ key: "se.portal", topic: "portal", w: 6, build: () => makeQ(team, { role: "national" }, v(`What's the plan in the portal this spring?`, `The transfer portal opens soon. Are you buying or keeping your guys?`), [
    A("confident", `We're going shopping. Expect some big names.`, [{ kind: "nilBudget", delta: 1e5 }, { kind: "hype", delta: 3 }], { kind: "portalSplash" }),
    A("humble", `Retention first. We want our guys back.`, [{ kind: "morale", target: "team", delta: 5 }], { kind: "retention" }),
    A("deflect", `We'll evaluate everything. No sense tipping our hand.`, [{ kind: "mediaRep", delta: -1 }])
  ]) });
  const cr = classRankings(state);
  const ci = cr.findIndex((x) => x.teamId === team.id);
  if (ci >= 0) {
    const topCommit = Object.values(state.recruits).filter((r) => r.committed === team.id).sort((a, b) => a.rank - b.rank)[0];
    cands.push({ key: "se.class", topic: "recruiting", w: ci < 25 ? 6 : 3, build: () => makeQ(team, { role: "beat" }, `Your incoming class ranks No. ${ci + 1} nationally${topCommit ? `, led by ${topCommit.first} ${topCommit.last}` : ""}. How soon can they help?`, [
      A("confident", `Right away. This class is going to change our program.`, [{ kind: "hype", delta: 5 }, { kind: "recruitInterest", delta: 2 }]),
      A("humble", `They'll have to earn it like everybody else. But I love the group.`, [{ kind: "morale", target: "team", delta: 2 }, { kind: "mediaRep", delta: 2 }])
    ]) });
  }
  const prev = team.history.filter((x) => x.season < state.season).slice(-1)[0];
  if (prev && h2) {
    const dw = h2.w - prev.w;
    if (Math.abs(dw) >= 4) {
      cands.push({ key: dw > 0 ? "se.improved" : "se.declined", topic: "compare", w: 5, build: () => makeQ(team, { role: "beat", tag: "Last season" }, dw > 0 ? `${h2.w} wins this year, up ${dw} from last season. What was the biggest reason for the jump?` : `${h2.w} wins, down ${-dw} from last year. Why did this team take a step back?`, dw > 0 ? [
        A("praise", `Player development. Our returning guys got so much better.`, [{ kind: "morale", target: "team", delta: 4 }]),
        A("confident", `Culture. We know who we are now. And we're not done.`, [{ kind: "hype", delta: 4 }])
      ] : [
        A("humble", `We lost a lot of experience and I didn't adjust fast enough. I will.`, [{ kind: "mediaRep", delta: 4 }, { kind: "security", delta: 1 }]),
        A("deflect", `It was a transition year. We'll be back.`, [{ kind: "mediaRep", delta: -2 }])
      ]) });
    }
  }
  if (h2 && c.conf) {
    cands.push({ key: h2.confChamp ? "se.confChamp" : "se.conf", topic: "conf", w: h2.confChamp ? 6 : 2.5, build: () => makeQ(team, { role: "beat" }, h2.confChamp ? `You won the ${confName(c)} regular-season title. Where does that rank among your accomplishments?` : `You finished ${ord2(h2.confFinish)} in the ${confName(c)}. What separates you from the top of the league?`, h2.confChamp ? [
      A("praise", `Right at the top. Winning a league is a grind, and these guys did it.`, [{ kind: "morale", target: "team", delta: 4 }, { kind: "hype", delta: 3 }]),
      A("confident", `It's the first of many.`, [{ kind: "hype", delta: 5 }])
    ] : [
      A("humble", `Consistency. We beat good teams, then let games slip we should have won.`, [{ kind: "mediaRep", delta: 3 }]),
      A("fiery", `Toughness. And we'll get it.`, [{ kind: "morale", target: "team", delta: 2 }])
    ]) });
  }
  const stint = coach.career.filter((x) => x.teamId === team.id);
  if (stint.length >= 3) {
    const first = stint[0], now = stint[stint.length - 1];
    const bids = stint.filter((x) => x.seed != null).length;
    cands.push({ key: "se.build", topic: "build", w: 6, build: () => makeQ(team, { role: "columnist", tag: "Big picture" }, `That's ${plural(stint.length, "season")} at ${team.school}: ${first.w}-${first.l} in year one, ${now.w}-${now.l} this year${bids ? `, ${plural(bids, "NCAA bid")} along the way` : ""}. Where is this program compared to when you took over?`, [
      A("confident", `Light-years ahead. And the next chapter is the best one.`, [{ kind: "hype", delta: 5 }], { kind: "beatExpect" }),
      A("humble", `Better, but not finished. Not even close.`, [{ kind: "mediaRep", delta: 3 }, { kind: "security", delta: 2 }]),
      A("praise", `The players and staff deserve the credit. They bought in when it wasn't easy.`, [{ kind: "morale", target: "team", delta: 3 }, { kind: "mediaRep", delta: 2 }])
    ]) });
  }
  if (state.awards.some((a) => a.season === state.season && a.name === "Coach of the Year" && a.coachId === coach.id)) {
    cands.push({ key: "se.coy", topic: "award", w: 9, build: () => makeQ(team, { role: "national", tag: "Award" }, `You were named National Coach of the Year. What does that mean to you?`, [
      A("humble", `It's a staff award and a players' award. My name just happens to be on it.`, [{ kind: "mediaRep", delta: 5 }, { kind: "morale", target: "team", delta: 3 }]),
      A("joke", `I'll let my wife know. She still makes me take out the trash.`, [{ kind: "mediaRep", delta: 4 }, { kind: "hype", delta: 3 }])
    ]) });
  }
  cands.push({ key: "se.fans", topic: "fans", w: 3, build: () => makeQ(team, { role: "tv" }, `Message to ${team.school} fans heading into the offseason?`, [
    A("praise", `Thank you. You were incredible all year. We're building something.`, [{ kind: "hype", delta: 4 }, { kind: "mediaRep", delta: 2 }]),
    A("confident", `Renew those season tickets. Next year is going to be special.`, [{ kind: "hype", delta: 6 }, { kind: "security", delta: -1 }], { kind: "beatExpect" })
  ]) });
  return { id: rng.id("pc"), title: "End-of-Season Press Conference", context: summary, when: "at your end-of-season press conference", questions: choose(state, cands, 5) };
}
function pressSeasonEnd(state, achieved) {
  const mem = pressMemory(state);
  const uid = state.user.teamId;
  const lastNcaa = state.schedule.filter((g) => g.type === "ncaa" && g.played && (g.home === uid || g.away === uid)).sort((a, b) => b.day - a.day)[0];
  let elim;
  if (lastNcaa && lastNcaa.hs != null && lastNcaa.as != null) {
    const us = lastNcaa.home === uid ? lastNcaa.hs : lastNcaa.as, them = lastNcaa.home === uid ? lastNcaa.as : lastNcaa.hs;
    const h2 = state.teams[uid].history[state.teams[uid].history.length - 1];
    if (us < them) elim = { oppId: lastNcaa.home === uid ? lastNcaa.away : lastNcaa.home, round: h2?.postseason || "NCAA Tournament" };
  }
  mem.recap = { season: state.season, teamId: uid, expectation: state.user.expectation, expectationLevel: state.user.expectationLevel, achieved, elim };
}
function pressOffseasonRecap(state) {
  const mem = pressMemory(state);
  const uid = state.user.teamId;
  if (!mem.recap || mem.recap.season !== state.season) mem.recap = { season: state.season, teamId: uid };
  const r = mem.recap;
  if (r.teamId !== uid) return;
  r.drafted = state.draft.filter((d) => d.season === state.season + 1 && d.teamId === uid).sort((a, b) => a.pick - b.pick).map((d) => d.name);
  const ps = state.portal;
  if (ps) {
    const entries = Object.values(ps.entries);
    r.transfersOut = entries.filter((e) => e.from === uid && e.status === "committed" && e.to !== uid).map((e) => state.players[e.id]).filter(Boolean).map((p) => nm(p));
    r.transfersIn = entries.filter((e) => e.to === uid && e.from !== uid && e.status === "committed").map((e) => ({ id: e.id, name: state.players[e.id] ? nm(state.players[e.id]) : "", from: state.teams[e.from]?.school ?? "" })).filter((x) => x.name);
    r.portalGrade = ps.grades?.find((g) => g.teamId === uid)?.grade;
  }
  r.signees = (state.offseason?.signed ?? []).map((id) => state.players[id]).filter(Boolean).map((p) => nm(p));
}

// src/engine/nil.ts
function marketFor(state, teamId) {
  return state.teams[teamId]?.market ?? 5;
}
function playerValue(state, p) {
  return nilValue(p, p.teamId ? marketFor(state, p.teamId) : 5);
}
function nilSatisfaction(state, p) {
  const v2 = Math.max(1e3, playerValue(state, p));
  return (p.nil?.amount ?? 0) / v2;
}
function committedNil(state, teamId) {
  return teamPlayers(state, teamId).reduce((s, p) => s + (p.nil?.amount ?? 0), 0);
}
function allocateAiNil(state, team) {
  const ps = teamPlayers(state, team.id);
  const vals = ps.map((p) => Math.pow(playerValue(state, p), 0.9));
  const total = vals.reduce((a, b) => a + b, 0) || 1;
  const pool = team.nilBudget * 0.92;
  ps.forEach((p, i) => {
    const amt = roundMoney(Math.min(pool * (vals[i] / total), playerValue(state, p) * 1.15));
    p.nil = { amount: amt, years: 1 };
  });
}

// src/engine/portal.ts
var PORTAL_DAYS = 6;
var isUser = (state, teamId) => isHuman(state, teamId);
function hash6(s) {
  let h2 = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h2 ^= s.charCodeAt(i);
    h2 = Math.imul(h2, 16777619);
  }
  return (h2 >>> 0) / 4294967295;
}
function removeFromTeam(state, p, note3) {
  if (p.teamId) {
    const t = state.teams[p.teamId];
    if (t) t.roster = t.roster.filter((id) => id !== p.id);
  }
  p.history.push(note3);
  p.teamId = null;
}
function homeCoords(p) {
  if (p.country !== "USA") return null;
  const exact = PLACES.find((x) => x.city === p.hometown && x.state === p.state);
  const any = exact ?? PLACES.find((x) => x.state === p.state);
  return any ? [any.lat, any.lng] : null;
}
function reasonFor(state, p, team) {
  const mpg = p.stats.gp ? p.stats.min / p.stats.gp : 0;
  const roster = teamPlayers(state, team.id).sort((a, b) => b.ovr - a.ovr);
  const rank = roster.findIndex((x) => x.id === p.id);
  if (mpg < 12 && rank < 8 || mpg < 6) return "Playing time";
  if (nilSatisfaction(state, p) < 0.6) return "NIL money";
  if (team.coachChange) return "Coaching change";
  if (p.ovr >= 68 && team.prestige < 45 || p.ovr >= 74 && team.prestige < 65) return "Bigger stage";
  if (p.traits.includes("hometown")) return "Closer to home";
  return "Fresh start";
}
function prioritiesFor(p, reason) {
  const w = { nil: 0.2, pt: 0.2, win: 0.15, prestige: 0.15, home: 0.1, coach: 0.2 };
  if (reason === "Playing time") w.pt += 0.3;
  if (reason === "NIL money") w.nil += 0.35;
  if (reason === "Coaching change") {
    w.coach += 0.2;
    w.pt += 0.1;
  }
  if (reason === "Bigger stage") {
    w.prestige += 0.25;
    w.win += 0.15;
  }
  if (reason === "Closer to home") w.home += 0.4;
  if (reason === "Fresh start") {
    w.coach += 0.1;
    w.win += 0.1;
  }
  if (p.traits.includes("mercenary")) w.nil += 0.2;
  if (p.traits.includes("hometown")) w.home += 0.2;
  for (const k of Object.keys(w)) w[k] *= rng.range(0.85, 1.15);
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(w)) w[k] = w[k] / sum;
  return w;
}
function makeEntry(state, p, from, enterDay, reason, askMul) {
  return {
    id: p.id,
    from,
    ask: roundMoney(Math.max(5e3, playerValue(state, p) * rng.range(askMul[0], askMul[1]))),
    enterDay,
    decideDay: PORTAL_DAYS,
    stars: 2,
    rank: 999,
    reason,
    pri: prioritiesFor(p, reason),
    rel: {},
    offers: [],
    visits: [],
    top: null,
    status: "available",
    userCall: -1,
    userZoom: -1,
    known: false,
    seed: Math.floor(rng.next() * 1e9)
  };
}
function lastLine(p) {
  const c = p.career[p.career.length - 1];
  if (!c || !c.gp) return { ppg: 0, rpg: 0, apg: 0 };
  return { ppg: c.pts / c.gp, rpg: (c.orb + c.drb) / c.gp, apg: c.ast / c.gp };
}
function rankEntries(state, ps) {
  const list2 = Object.values(ps.entries);
  const score = (e) => {
    const p = state.players[e.id];
    return p ? p.ovr * 0.7 + p.pot * 0.3 + lastLine(p).ppg * 0.35 : 0;
  };
  list2.sort((a, b) => score(b) - score(a));
  const n = list2.length;
  list2.forEach((e, i) => {
    e.rank = i + 1;
    const pct = i / Math.max(1, n);
    e.stars = pct < 0.025 ? 5 : pct < 0.12 ? 4 : pct < 0.42 ? 3 : pct < 0.78 ? 2 : 1;
    const span = e.stars === 5 ? rng.int(2, 4) : e.stars === 4 ? rng.int(1, 4) : rng.int(1, 3);
    e.decideDay = clamp(e.enterDay + span, e.enterDay + 1, PORTAL_DAYS);
  });
}
function feed(ps, item2) {
  ps.feed.unshift({ day: item2.day ?? ps.day, ...item2 });
  if (ps.feed.length > 500) ps.feed.length = 500;
}
function portalHoursMax(state) {
  const c = state.coaches[state.user.coachId];
  return 24 + (c ? c.skills.portal * 2 : 0) + Math.round(staffEffects(state).portal * 2);
}
var RETENTION_QUOTES = {
  "Playing time": ["Coach, I played {mpg} minutes a night. I need to be on the floor.", "I didn\u2019t come here to watch. Where do I fit next year?"],
  "NIL money": ["Other schools are telling my people I\u2019m worth {value}. I\u2019m at {current}.", "I love it here, but I have to take care of my family."],
  "Coaching change": ["Everything changed when the staff turned over. I don\u2019t know where I stand.", "I committed to a different coach. Convince me."],
  "Bigger stage": ["I want to play on the biggest stage. I think I\u2019m ready.", "Pros are telling me I need to play at a higher level."],
  "Closer to home": ["My family needs me closer to home right now.", "I\u2019ve been homesick all year, Coach."],
  "Fresh start": ["I just think I need a fresh start.", "It hasn\u2019t felt right this year. I\u2019m thinking about my options."]
};
function openPortal(state) {
  state.phase = "portal";
  const os = state.offseason;
  const leaving = /* @__PURE__ */ new Set([...os.graduating, ...os.declared]);
  for (const id of leaving) {
    const p = state.players[id];
    if (p && p.teamId) removeFromTeam(state, p, os.graduating.includes(id) ? `Graduated (${seasonLabel(state.season)})` : `Declared for NBA Draft (${state.season + 1})`);
  }
  const ps = { day: 0, maxDays: PORTAL_DAYS, entries: {}, feed: [], hours: 0, hoursMax: 0, calls: [] };
  state.portal = ps;
  forEachHuman(state, () => {
    state.user.retention = {};
  });
  const waves = [1, 2, 3, 4, 5];
  for (const p of Object.values(state.players)) {
    if (!p.teamId) continue;
    const team = state.teams[p.teamId];
    const mpg = p.stats.gp ? p.stats.min / p.stats.gp : 0;
    const roster = teamPlayers(state, team.id).sort((a, b) => b.ovr - a.ovr);
    const rank = roster.findIndex((x) => x.id === p.id);
    let pr = 0.05;
    if (mpg < 12 && rank < 8) pr += 0.15;
    if (mpg < 6) pr += 0.14;
    if (p.morale < 55) pr += (55 - p.morale) / 100 * 0.9;
    if (nilSatisfaction(state, p) < 0.6) pr += p.traits.includes("mercenary") ? 0.22 : 0.1;
    if (team.coachChange) pr += 0.18;
    if (p.ovr >= 68 && team.prestige < 45) pr += 0.28;
    else if (p.ovr >= 74 && team.prestige < 65) pr += 0.16;
    if (isUser(state, team.id)) {
      const gr = goalResult(state, p.id);
      if (gr === "met") pr *= 0.6;
      else if (gr === "missed") pr += 0.08;
    }
    if (p.traits.includes("loyal")) pr *= 0.3;
    if (p.traits.includes("mercenary")) pr *= 1.35;
    if (p.traits.includes("hometown")) pr *= 0.8;
    const coach = state.coaches[team.coachId];
    if (coach) pr *= 1 - coach.skills.portal * 0.03 - coach.skills.motivation * 0.02;
    pr *= portalLockerMul(state, p, team);
    pr = clamp(pr, 0, 0.85);
    if (doorOpen(state, p.id)) pr = 0.95;
    const reason = reasonFor(state, p, team);
    if (isUser(state, team.id)) {
      if (pr >= 0.2) asTeam(state, team.id, () => {
        const ask = roundMoney(Math.max(playerValue(state, p) * rng.range(1, 1.35), (p.nil?.amount ?? 0) * 1.15) * staffEffects(state).retentionMul);
        const quote = rng.pick(RETENTION_QUOTES[reason]).replace("{mpg}", mpg.toFixed(1)).replace("{value}", fmtMoney(playerValue(state, p))).replace("{current}", fmtMoney(p.nil?.amount ?? 0));
        state.user.retention[p.id] = { ask, resolved: false, prob: pr, reason, quote };
      });
      continue;
    }
    if (!rng.chance(pr)) continue;
    const day = rng.weighted(waves, [55, 20, 12, 8, 5]);
    ps.entries[p.id] = makeEntry(state, p, team.id, day, reason, [0.85, 1.25]);
    removeFromTeam(state, p, `Entered transfer portal from ${team.school}`);
    p.inPortal = true;
  }
  rankEntries(state, ps);
  forEachHuman(state, () => {
    ps.hoursMax = portalHoursMax(state);
    ps.hours = ps.hoursMax;
  });
  const n = Object.keys(state.user.retention).length;
  feed(ps, { kind: "open", text: `The portal window opens soon. ${n ? `${n} of your players want to talk first.` : "Your locker room is locked in \u2014 nobody asked for a meeting."}`, big: true });
}
function finalizeRetention(state) {
  const ps = state.portal;
  const team = state.teams[state.user.teamId];
  for (const [id, r] of Object.entries(state.user.retention)) {
    const p = state.players[id];
    if (!p || p.teamId !== team.id) continue;
    let leaves;
    if (r.resolved) leaves = !r.staying;
    else {
      leaves = rng.chance(r.prob ?? 0.3);
      r.resolved = true;
      r.staying = !leaves;
    }
    if (!leaves) continue;
    ps.entries[id] = makeEntry(state, p, team.id, 1, r.reason ?? "Fresh start", [0.9, 1.3]);
    removeFromTeam(state, p, `Entered transfer portal from ${team.school}`);
    p.inPortal = true;
    addNews(state, { kind: "portal", headline: `${p.first} ${p.last} enters the transfer portal`, body: `${p.first} ${p.last} will leave ${team.school}. Reason cited: ${(r.reason ?? "a fresh start").toLowerCase()}.`, teams: [team.id], important: true, personId: p.id, personKind: "player" });
  }
  rankEntries(state, ps);
}
function teamScore(state, e, teamId, offer) {
  const p = state.players[e.id];
  const t = state.teams[teamId];
  if (!p || !t) return -999;
  const w = e.pri;
  const nilS = offer ? clamp(offer.nil / Math.max(1, e.ask) * 100, 0, 150) : 0;
  const roster = teamPlayers(state, teamId);
  const ahead = roster.filter((x) => x.pos === p.pos && x.ovr >= p.ovr - 1).length;
  let pt = clamp(100 - ahead * 32 - Math.max(0, roster.length - 11) * 3, 5, 100);
  if (offer?.promise === "star") pt = 100;
  else if (offer?.promise === "starter") pt = Math.max(pt, 88);
  else if (offer?.promise === "rotation") pt = Math.max(pt, 65);
  const winS = clamp(50 + (t.rating ?? 0) * 2.2, 0, 100);
  const home = homeCoords(p);
  const homeS = home ? clamp(100 - milesBetween(home[0], home[1], t.lat, t.lng) / 12, 0, 100) : 45;
  const coach = state.coaches[t.coachId];
  let coachS = (e.rel[teamId] ?? 0) + (coach ? coach.skills.portal * 3 + (coach.reputation - 50) * 0.3 : 0);
  if (isUser(state, teamId)) coachS += asTeam(state, teamId, () => staffEffects(state).portal) * 2;
  coachS = clamp(coachS, 0, 110);
  let s = w.nil * nilS + w.pt * pt + w.win * winS + w.prestige * t.prestige + w.home * homeS + w.coach * coachS;
  if ((offer?.years ?? 1) >= 2) s += 2;
  if (teamId === e.from) s -= 8;
  if (p.traits.includes("mercenary")) s += (nilS - 100) * 0.1;
  s += (hash6(`${e.seed}:${teamId}`) - 0.5) * 12;
  return s;
}
var signeeCache = null;
function signeeCount(state, teamId) {
  const n = Object.keys(state.recruits).length;
  if (!signeeCache || signeeCache.recs !== state.recruits || signeeCache.n !== n) {
    const map = /* @__PURE__ */ new Map();
    for (const r of Object.values(state.recruits)) if (r.committed) map.set(r.committed, (map.get(r.committed) ?? 0) + 1);
    signeeCache = { recs: state.recruits, n, map };
  }
  return signeeCache.map.get(teamId) ?? 0;
}
function rosterRoom(state, teamId) {
  const t = state.teams[teamId];
  return t ? ROSTER_MAX - t.roster.length - signeeCount(state, teamId) : 0;
}
var TEMP = 5;
function entryOdds(state, e, extra) {
  const offers = [...e.offers.filter((o) => !extra || o.teamId !== extra.teamId), ...extra ? [extra] : []].filter((o) => state.teams[o.teamId] && rosterRoom(state, o.teamId) > 0);
  if (!offers.length) return [];
  const sc2 = offers.map((o) => ({ teamId: o.teamId, nil: o.nil, score: teamScore(state, e, o.teamId, o) }));
  const max2 = Math.max(...sc2.map((x) => x.score));
  const ex = sc2.map((x) => Math.exp((x.score - max2) / TEMP));
  const tot = ex.reduce((a, b) => a + b, 0);
  return sc2.map((x, i) => ({ ...x, p: ex[i] / tot })).sort((a, b) => b.p - a.p);
}
function userOffer(state, e) {
  return e.offers.find((o) => o.teamId === state.user.teamId);
}
function visibleEntries(state) {
  const ps = state.portal;
  if (!ps) return [];
  return Object.values(ps.entries).filter((e) => e.enterDay <= ps.day && state.players[e.id]);
}
function aiDay(state) {
  const ps = state.portal;
  const avail = visibleEntries(state).filter((e) => e.status === "available");
  const byTeam = /* @__PURE__ */ new Map();
  for (const e of avail) for (const o of e.offers) {
    const l = byTeam.get(o.teamId);
    if (l) l.push(e);
    else byTeam.set(o.teamId, [e]);
  }
  const recruitCommits = /* @__PURE__ */ new Map();
  for (const r of Object.values(state.recruits)) if (r.committed) recruitCommits.set(r.committed, (recruitCommits.get(r.committed) ?? 0) + 1);
  const leaks = [];
  const visits = [];
  for (const t of Object.values(state.teams)) {
    if (isUser(state, t.id) && !state.settings.autoRecruit) continue;
    const open = ROSTER_MAX - t.roster.length - (recruitCommits.get(t.id) ?? 0);
    const mine = byTeam.get(t.id) ?? [];
    if (open <= 0) {
      for (const e of mine) e.offers = e.offers.filter((o) => o.teamId !== t.id);
      continue;
    }
    const pending = mine.reduce((s, e) => s + (e.offers.find((o) => o.teamId === t.id)?.nil ?? 0), 0);
    let budget = t.nilBudget - committedNil(state, t.id) - pending;
    for (const e of mine) {
      e.rel[t.id] = clamp((e.rel[t.id] ?? 0) + rng.range(3, 7), 0, 100);
      if (!e.visits.includes(t.id) && e.stars >= 3 && rng.chance(0.18)) {
        e.visits.push(t.id);
        e.rel[t.id] = clamp((e.rel[t.id] ?? 0) + 16, 0, 100);
        if (e.stars >= 4) visits.push({ e, t });
      }
      const o = e.offers.find((x) => x.teamId === t.id);
      const odds = entryOdds(state, e);
      const cap3 = e.ask * 1.6;
      if (e.stars >= 3 && odds[0] && odds[0].teamId !== t.id && budget > 0 && o.nil < cap3 && rng.chance(0.35)) {
        const bump2 = roundMoney(Math.min(o.nil * rng.range(0.1, 0.22) + 5e3, budget, cap3 - o.nil));
        if (bump2 > 0) {
          o.nil += bump2;
          budget -= bump2;
          if (e.stars >= 4) leaks.push({ e, t, text: `Sources: ${t.school} has upped its NIL offer to ${state.players[e.id].first} ${state.players[e.id].last} \u2014 now around ${fmtMoney(o.nil)}.` });
        }
      }
    }
    const maxActive = open * 2 + 1;
    let slots = Math.min(2, maxActive - mine.length);
    if (slots <= 0 || budget < 8e3) continue;
    const lo = t.power - 9, hi = t.power + 5;
    const cands = avail.filter((e) => {
      const p = state.players[e.id];
      return p && p.ovr >= lo && p.ovr <= hi && e.from !== t.id && !e.offers.some((o) => o.teamId === t.id);
    });
    for (let k = 0; k < 6 && slots > 0 && cands.length; k++) {
      const e = cands.splice(rng.int(0, cands.length - 1), 1)[0];
      const p = state.players[e.id];
      const nil = roundMoney(Math.min(e.ask * rng.range(0.75, 1.2), budget * 0.5));
      if (nil < 2e3 && e.ask > 2e4) continue;
      e.offers.push({ teamId: t.id, nil, years: rng.chance(0.4) ? 2 : 1, promise: p.ovr > t.power + 1 ? "starter" : null, day: ps.day });
      e.rel[t.id] = clamp((e.rel[t.id] ?? 0) + rng.int(6, 14), 0, 100);
      budget -= nil;
      slots--;
      if (e.stars >= 4 && rng.chance(0.4)) leaks.push({ e, t, text: `${t.school} has offered ${p.first} ${p.last} (${state.teams[e.from]?.school ?? "portal"}). Deal reportedly in the ${fmtMoney(nil)} range.` });
    }
  }
  for (const v2 of rng.shuffle(visits).slice(0, 5)) {
    feed(ps, { kind: "visit", text: `${state.players[v2.e.id].first} ${state.players[v2.e.id].last} is on an official visit to ${v2.t.school}.`, playerId: v2.e.id, teamId: v2.t.id });
  }
  for (const l of leaks.slice(0, 8)) {
    const ins = rng.pick(INSIDERS);
    feed(ps, { kind: "leak", text: l.text, playerId: l.e.id, teamId: l.t.id, handle: ins.handle });
  }
}
function revealDay(state) {
  const ps = state.portal;
  const fresh2 = Object.values(ps.entries).filter((e) => e.enterDay === ps.day && state.players[e.id]);
  const notable = fresh2.filter((e) => e.stars >= 4 || e.from === state.user.teamId).sort((a, b) => a.rank - b.rank);
  if (ps.day === 1) feed(ps, { kind: "open", text: `\u{1F6A8} THE PORTAL IS OPEN \u2014 ${fresh2.length} players entered on day one.`, big: true });
  else if (fresh2.length) feed(ps, { kind: "enter", text: `${fresh2.length} more players hit the portal today.` });
  for (const e of notable.slice(0, 10)) {
    const p = state.players[e.id];
    const ll = lastLine(p);
    const from = state.teams[e.from];
    const late = ps.day >= 4 && e.stars >= 4;
    const ins = rng.pick(INSIDERS);
    feed(ps, {
      kind: late ? "withdraw" : "enter",
      text: late ? `${from.school}'s ${p.first} ${p.last} has withdrawn from the NBA Draft and entered the transfer portal. ${"\u2605".repeat(e.stars)}` : `${from.school} ${p.pos} ${p.first} ${p.last} (${ll.ppg.toFixed(1)} PPG) has entered the portal. ${"\u2605".repeat(e.stars)}`,
      playerId: e.id,
      teamId: e.from,
      big: e.stars === 5 || e.from === state.user.teamId,
      handle: ins.handle
    });
  }
}
function releaseTopLists(state) {
  const ps = state.portal;
  for (const e of visibleEntries(state)) {
    if (e.status !== "available" || e.top || e.stars < 3 || ps.day < e.enterDay + 1 || e.offers.length < 3) continue;
    const odds = entryOdds(state, e).slice(0, 5);
    e.top = odds.map((o) => o.teamId);
    const p = state.players[e.id];
    if (e.stars >= 4 || e.top.includes(state.user.teamId)) {
      feed(ps, { kind: "top", text: `${p.first} ${p.last} is down to ${e.top.length}: ${e.top.map((id) => state.teams[id].school).join(", ")}.`, playerId: e.id, big: e.top.includes(state.user.teamId) });
    }
  }
}
function makeCalls(state) {
  const ps = state.portal;
  ps.calls = [];
  const uid = state.user.teamId;
  const cands = [];
  for (const e of visibleEntries(state)) {
    if (e.status !== "available") continue;
    const mine = userOffer(state, e);
    if (!mine) continue;
    const odds = entryOdds(state, e);
    const me = odds.find((x) => x.teamId === uid);
    const rival = Math.max(0, ...e.offers.filter((o) => o.teamId !== uid).map((o) => o.nil));
    if (!me || me.p < 0.1 || me.p > 0.8 || rival <= mine.nil * 1.1) continue;
    cands.push({ e, rival, mine: mine.nil, p: me.p });
  }
  cands.sort((a, b) => b.e.stars - a.e.stars || a.e.rank - b.e.rank);
  for (const c of cands.slice(0, 3)) {
    const rivalTeam = c.e.offers.filter((o) => o.teamId !== uid).sort((a, b) => b.nil - a.nil)[0].teamId;
    ps.calls.push({ playerId: c.e.id, teamId: rivalTeam, rivalNil: c.rival, want: roundMoney(Math.max(c.mine * 1.05, c.rival * rng.range(0.9, 0.98))), day: ps.day });
  }
}
function commit(state, e, o) {
  const ps = state.portal;
  const p = state.players[e.id];
  const t = state.teams[o.teamId];
  const fromSchool = state.teams[e.from]?.school ?? "his previous school";
  p.teamId = t.id;
  p.inPortal = false;
  p.transfers++;
  p.nil = { amount: o.nil, years: o.years ?? 1 };
  p.promise = o.promise;
  p.morale = 76;
  p.num = 0;
  p.history.push(`Transferred from ${fromSchool} to ${t.school} (${state.season + 1})`);
  t.roster.push(p.id);
  e.status = "committed";
  e.to = t.id;
  e.dealNil = o.nil;
  const others = e.offers.filter((x) => x.teamId !== t.id).map((x) => state.teams[x.teamId]?.school).filter(Boolean).slice(0, 2);
  const userWon = isUser(state, t.id);
  const userInvolved = e.offers.some((x) => isUser(state, x.teamId)) || e.from === state.user.teamId;
  if ((e.stars >= 5 || userInvolved && e.stars >= 4) && e.from && e.from !== t.id) rivalryTransfer(state, e.from, t.id, `${p.first} ${p.last}`, userInvolved);
  if (e.stars >= 4 || userInvolved) {
    feed(ps, { kind: "commit", text: `${"\u2605".repeat(e.stars)} ${p.first} ${p.last} commits to ${t.school}${others.length ? ` over ${others.join(" and ")}` : ""}. (${fmtMoney(o.nil)} NIL)`, playerId: p.id, teamId: t.id, big: userWon || e.stars === 5 });
    addNews(state, { kind: "portal", headline: `${p.first} ${p.last} commits to ${t.school} out of the portal`, body: `The ${p.pos} from ${fromSchool} chose ${t.school}${others.length ? ` over ${others.join(" and ")}` : ""}. NIL deal reportedly worth ${fmtMoney(o.nil)}.`, teams: [t.id], important: userWon, personId: p.id, personKind: "player" });
  }
  if (userWon) asTeam(state, t.id, () => {
    gainXp(state, 15 + Math.max(0, p.ovr - 60) + e.stars * 4);
    state.coaches[state.user.coachId].reputation = clamp(state.coaches[state.user.coachId].reputation + (e.stars >= 4 ? 1 : 0.3), 0, 100);
  });
}
function processDecisions(state, final) {
  const ps = state.portal;
  const humans = humanTeamIds(state);
  const byHuman = new Map(humans.map((h2) => [h2, []]));
  let quiet = 0;
  for (const e of visibleEntries(state).sort((a, b) => a.rank - b.rank)) {
    if (e.status !== "available") continue;
    if (e.decideDay > ps.day && !final) continue;
    const odds = entryOdds(state, e);
    if (!odds.length) {
      if (!final) {
        e.decideDay = Math.min(ps.maxDays, ps.day + 1);
        continue;
      }
      e.status = "unsigned";
      const p = state.players[e.id];
      if (e.stars >= 3) feed(ps, { kind: "unsigned", text: `${p.first} ${p.last} never found a home and leaves Division I.`, playerId: e.id });
      p.inPortal = false;
      p.history.push("Went unsigned in the portal");
      delete state.players[e.id];
      continue;
    }
    const r = rng.next();
    let acc = 0;
    let pick = odds[0];
    for (const o of odds) {
      acc += o.p;
      if (r <= acc) {
        pick = o;
        break;
      }
    }
    const offer = e.offers.find((o) => o.teamId === pick.teamId);
    const involvedH = humans.filter((h2) => e.offers.some((o) => o.teamId === h2));
    const involved = involvedH.length > 0;
    commit(state, e, offer);
    for (const h2 of involvedH) byHuman.get(h2).push({ playerId: e.id, teamId: pick.teamId, won: pick.teamId === h2 });
    if (e.stars < 4 && !involved) quiet++;
  }
  if (quiet) feed(ps, { kind: "commit", text: `+ ${quiet} more portal commitments today.` });
  for (const h2 of humans) asTeam(state, h2, () => {
    const results = byHuman.get(h2) ?? [];
    ps.lastResults = results;
    if (results.length) state.user.moments.push({ kind: "portalDay", day: ps.day, results: results.slice(0, 8) });
  });
}
function grades(state) {
  const ps = state.portal;
  const score = {};
  for (const e of Object.values(ps.entries)) {
    const p = state.players[e.id];
    const val = (p ? p.ovr - 50 : 10) + e.stars * 4;
    if (e.status === "committed" && e.to) {
      const x = score[e.to] ??= { s: 0, n: 0 };
      x.s += val;
      x.n++;
      if (!x.best || e.rank < x.best.rank) x.best = e;
    }
    const y = score[e.from] ??= { s: 0, n: 0 };
    y.s -= val * 0.5;
  }
  const rows = Object.entries(score).map(([teamId, v2]) => ({ teamId, score: Math.round(v2.s * 10) / 10, count: v2.n, best: v2.best?.id }));
  rows.sort((a, b) => b.score - a.score);
  const n = rows.length;
  ps.grades = rows.map((r, i) => {
    const pct = i / Math.max(1, n);
    const grade = pct < 0.03 ? "A+" : pct < 0.1 ? "A" : pct < 0.2 ? "A-" : pct < 0.32 ? "B+" : pct < 0.45 ? "B" : pct < 0.58 ? "B-" : pct < 0.7 ? "C+" : pct < 0.8 ? "C" : pct < 0.9 ? "D" : "F";
    return { ...r, grade };
  });
  const winners = ps.grades.slice(0, 3).map((g) => state.teams[g.teamId].school);
  const mine = ps.grades.find((g) => g.teamId === state.user.teamId);
  addNews(state, { kind: "portal", headline: `Portal grades are in: ${winners.join(", ")} lead the way`, body: `The window has closed. ${state.teams[state.user.teamId].school} earned ${mine ? `a${/^[AF]/.test(mine.grade) ? "n" : ""} ${mine.grade} (${mine.count} addition${mine.count === 1 ? "" : "s"})` : "an incomplete \u2014 no portal activity"}.`, teams: ps.grades.slice(0, 3).map((g) => g.teamId), important: true });
  feed(ps, { kind: "close", text: `\u{1F512} The portal window is closed. Portal champions: ${winners.join(", ")}.`, big: true });
}
function advancePortalDay(state) {
  const ps = state.portal;
  ps.lastResults = [];
  if (ps.day === 0) {
    finalizeRetention(state);
    ps.day = 1;
  } else {
    const final = ps.day >= ps.maxDays;
    processDecisions(state, final);
    if (final) {
      grades(state);
      return "closed";
    }
    ps.day++;
  }
  revealDay(state);
  aiDay(state);
  releaseTopLists(state);
  forEachHuman(state, () => makeCalls(state));
  sortDayFeed(ps);
  forEachHuman(state, () => {
    if (state.portal !== ps) return;
    ps.hoursMax = portalHoursMax(state);
    ps.hours = ps.hoursMax;
  });
  return "open";
}
function sortDayFeed(ps) {
  const pri = { open: 0, close: 0, withdraw: 1, enter: 2, top: 3, user: 3, commit: 4, leak: 5, offer: 5, visit: 6, unsigned: 7 };
  const today = ps.feed.filter((f) => f.day === ps.day);
  const rest = ps.feed.filter((f) => f.day !== ps.day);
  today.sort((a, b) => pri[a.kind] - pri[b.kind]);
  ps.feed = [...today, ...rest];
}

// src/engine/radio.ts
var SHOW = { name: "Full Court Fanatics", station: "98.7 The Hoop", slot: "Monday nights", tagline: "Two guys. Zero chill. All takes." };
var KEEP = 12;
var IN_SEASON4 = ["preseason", "regular", "confTourney", "selection", "ncaa"];
function radioState(state) {
  return state.radio ??= { episodes: [], aired: 0, locks: [], record: { sal: [0, 0], dex: [0, 0] }, recordSeason: state.season, recent: [] };
}
var S = (text, tag) => tag ? { who: "sal", text, tag } : { who: "sal", text };
var D = (text, tag) => tag ? { who: "dex", text, tag } : { who: "dex", text };
var C = (caller, text, tag) => tag ? { who: "caller", caller, text, tag } : { who: "caller", caller, text };
var rec = (t) => `${t.record.w}-${t.record.l}`;
var gp = (t) => Math.max(1, t.record.w + t.record.l);
var ppg = (p) => p.stats.gp ? p.stats.pts / p.stats.gp : 0;
var f1 = (n) => n.toFixed(1);
var nm2 = (p) => `${p.first} ${p.last}`;
var ord3 = (n) => {
  const s = ["th", "st", "nd", "rd"], m = n % 100;
  return n + (s[(m - 20) % 10] || s[m] || s[0]);
};
var plural2 = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
var CLS = { FR: "freshman", SO: "sophomore", JR: "junior", SR: "senior", GR: "grad student" };
var POSN = { PG: "point guard", SG: "shooting guard", SF: "wing", PF: "forward", C: "center" };
var describe = (p) => `${CLS[p.cls] ?? ""} ${POSN[p.pos] ?? p.pos}`.trim();
function schoolOf(state, p) {
  const id = p.teamId ?? p.career[p.career.length - 1]?.teamId;
  return id ? state.teams[id] : void 0;
}
function fresh(c, key) {
  return !c.R.recent.includes(key);
}
function use(c, key) {
  c.R.recent.push(key);
  if (c.R.recent.length > 90) c.R.recent.splice(0, c.R.recent.length - 90);
}
function pickFresh(c, prefix, items) {
  const idx = items.map((_, i2) => i2).filter((i2) => fresh(c, `${prefix}${i2}`));
  const i = idx.length ? c.r.pick(idx) : Math.floor(c.r.next() * items.length);
  use(c, `${prefix}${i}`);
  return items[i];
}
function firstFresh(c, prefix, gens) {
  const order = c.r.shuffle(gens.map((_, i) => i));
  const freshFirst = [...order.filter((i) => fresh(c, `${prefix}${i}`)), ...order.filter((i) => !fresh(c, `${prefix}${i}`))];
  for (const i of freshFirst) {
    const out = gens[i](c);
    if (out && out.length) {
      use(c, `${prefix}${i}`);
      return out;
    }
  }
  return [];
}
function head(c, p, t) {
  c.heads.push({ p, t });
}
function ranked(state) {
  return Object.values(state.teams).filter((t) => t.apRank).sort((a, b) => a.apRank - b.apRank);
}
function byNet(state) {
  return Object.values(state.teams).filter((t) => t.net > 0).sort((a, b) => a.net - b.net);
}
function scorers(state, minGp = 3) {
  return Object.values(state.players).filter((p) => p.teamId && p.stats.gp >= minGp).sort((a, b) => ppg(b) - ppg(a));
}
function userStar(state, U) {
  const ps = teamPlayers(state, U.id);
  const withStats = ps.filter((p) => p.stats.gp > 0);
  return (withStats.length ? withStats.sort((a, b) => ppg(b) - ppg(a)) : ps.sort((a, b) => b.ovr - a.ovr))[0];
}
function lastWeek(state) {
  const wk = state.calendar[state.day]?.week ?? 0;
  const from = state.radio?.lastDay ?? state.calendar.findIndex((d) => d.week === wk - 1);
  return state.schedule.filter((g) => g.played && g.day >= Math.max(0, from) && g.day <= state.day && g.hs != null && g.as != null);
}
function result(state, g) {
  const homeWon = (g.hs ?? 0) > (g.as ?? 0);
  const w = state.teams[homeWon ? g.home : g.away], l = state.teams[homeWon ? g.away : g.home];
  const ws = Math.max(g.hs ?? 0, g.as ?? 0), ls = Math.min(g.hs ?? 0, g.as ?? 0);
  return { w, l, ws, ls, margin: ws - ls, score: `${ws}-${ls}`, ot: !!g.ot };
}
function upcoming(state) {
  const wk = state.calendar[state.day]?.week ?? 0;
  const inWeek = (w) => state.schedule.filter((g) => !g.played && g.day >= state.day && state.calendar[g.day]?.week === w);
  const now = inWeek(wk);
  return now.length >= 3 ? now : [...now, ...inWeek(wk + 1)];
}
function rivalryOf2(state, a, b) {
  return rivalryOf(state, a, b);
}
function callerName(c, local = 0.45) {
  const first = c.r.pick(FIRST_NAMES);
  const pool = ranked(c.state).slice(0, 25);
  const city = c.r.chance(local) || !pool.length ? c.U.city : c.r.pick(pool).city;
  return `${first} in ${city}`;
}
function month(c) {
  const d = c.state.calendar[c.state.day]?.date;
  return d ? ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][(/* @__PURE__ */ new Date(d + "T12:00:00")).getMonth()] : "the season";
}
var OPENERS = [
  () => [S(`Welcome back to ${SHOW.name} on ${SHOW.station}! Big Sal here, and I have been right about everything this week.`), D(`He has not. I'm Dex Holloway, and I have the receipts.`)],
  () => [S(`It's ${SHOW.name}! I'm Big Sal, and next to me is the only man alive who brings a spreadsheet to a tailgate.`), D(`It was laminated. For the rain.`)],
  () => [S(`Phones are lit, takes are hot, and the coffee is not. This is ${SHOW.name}.`), D(`I'm Dex. Somebody please fix the coffee machine.`)],
  () => [S(`We are LIVE! Big Sal and Dex. Two guys, zero chill.`), D(`One guy with zero chill. I'm extremely chill.`)],
  () => [D(`Good evening and welcome to ${SHOW.name}. I'm Dex Holloway, joined as always by Big Sal.`), S(`Joined? People tune in for ME, Dex.`), D(`People tune in for the traffic report after us.`)],
  (c) => [S(`${SHOW.name}, episode ${c.ep}! Can you believe they keep letting us do this?`), D(`Legally they have to. You signed a three-year deal.`)],
  () => [S(`Good evening, college basketball nation! Big Sal Moretti, coming to you from a chair that is way too small for me.`), D(`I'm Dex. We asked for a bigger chair. Management said no.`)],
  () => [D(`Welcome to ${SHOW.name}. Before we start: nothing Sal says tonight is financial advice.`), S(`Or basketball advice.`), D(`Correct.`)],
  () => [S(`Lock the doors, hide the children, it's ${SHOW.name}!`), D(`Please don't lock the doors. It's a fire code thing.`)]
];
var BANTER = [
  () => [S(`I tried a cold plunge this week.`), D(`How long did you last?`), S(`One foot. Then I called my mother.`)],
  () => [S(`My uncle Vinnie says the three-point line is a fad.`, "bad"), D(`It's been around for forty years, Sal.`), S(`Vinnie is a patient man.`)],
  () => [S(`Dex made a spreadsheet of my bad takes.`), D(`It has tabs.`), S(`It has TABS, people. Color-coded tabs.`)],
  () => [S(`I'm giving up carbs until somebody in this sport plays defense.`), D(`So, never.`), S(`I'm making an exception for garlic knots.`)],
  () => [D(`Did you watch any film this week, Sal?`), S(`I watched a movie about a dog who plays basketball. Same thing.`), D(`It is not the same thing.`)],
  (c) => {
    const t = ranked(c.state)[c.r.int(0, 4)];
    return t ? [S(`My barber says ${t.school} is a fraud.`, "hot"), D(`Is your barber on the selection committee?`), S(`He should be. That man has never been wrong about a fade or a fraud.`)] : null;
  },
  () => [S(`Producer Tony says we ran eight minutes over last week.`), D(`You did a nine-minute rant about free-throw routines.`), S(`And I'd do it again. Spin the ball ONCE and shoot it.`)],
  () => [D(`The mailbag was full this week.`), S(`Fan mail!`), D(`Mostly people asking you to apologize.`)],
  () => [S(`I bought a foam finger at the airport.`), D(`For which team?`), S(`Doesn't matter. I just like pointing at things.`)],
  () => [D(`I ran ten thousand simulations of the season this week.`), S(`And how many had me being right?`), D(`Four.`), S(`FOUR! I'll take it.`)],
  () => [S(`I got recognized at the grocery store!`), D(`By who?`), S(`The guy who calls in every week to say I'm an idiot. Lovely man. Great cart.`)],
  () => [S(`I started yoga.`), D(`Good for you.`), S(`The instructor asked me to stop yelling "AND ONE" every time I hold a pose.`)],
  (c) => {
    const [w, l] = c.R.record.sal;
    return w + l >= 3 ? [D(`Housekeeping: Sal's lock record this season is ${w}-${l}.`), S(`We agreed not to say that on air.`), D(`You agreed. I didn't.`)] : null;
  },
  (c) => {
    const ts = Object.values(c.state.teams).filter((t) => t.record.w + t.record.l > 0);
    if (ts.length < 50) return null;
    const avg2 = ts.reduce((s, t) => s + t.record.pf / gp(t), 0) / ts.length;
    return [D(`Random info to start the show: teams are scoring ${f1(avg2)} points a game this season.`, "info"), S(`That's it? I scored more than that in one church-league game in 1994.`), D(`You scored four points in that game. Your mother told me.`)];
  },
  (c) => {
    const t = c.r.pick(ranked(c.state).slice(0, 15).filter((x) => x.capacity > 9e3));
    return t ? [D(`${t.arena} holds ${t.capacity.toLocaleString()} people.`, "info"), S(`And I've been asked to leave it twice.`), D(`Three times.`), S(`The third one was a misunderstanding.`)] : null;
  },
  () => [S(`Dex, I have a new catchphrase.`), D(`Please don't.`), S(`"That's a bucket and a HALF!"`), D(`What does that mean?`), S(`It means a lot of buckets, Dex.`)],
  () => [S(`Somebody mailed me a slice of pizza.`), D(`That's concerning.`), S(`It was cold. I still ate it. Still better than the defense I watched this week.`)],
  () => [D(`Sal, you're wearing two different shoes.`), S(`It's called range, Dex. Like a stretch four.`)],
  () => [S(`I've been working out. Look at these forearms.`), D(`This is radio.`), S(`They can FEEL the forearms, Dex.`)],
  () => [D(`I've got a new stat this week: points per possession after a timeout.`), S(`I've got a new stat too: wings per possession.`), D(`That's not a stat.`), S(`It's a lifestyle.`)],
  (c) => {
    const m = month(c);
    return m === "November" ? [S(`It's November, Dex. The turkey's thawing and the takes are ready.`), D(`Feast Week. Neutral courts, island resorts, and Sal on a strict all-stuffing diet.`)] : m === "December" ? [S(`Happy holidays, everybody. Dex got me a calculator.`), D(`So you can check your lock record yourself.`)] : m === "January" ? [S(`Conference play, baby! No more cupcakes!`), D(`You love cupcakes.`), S(`On my plate, Dex. Not on the schedule.`)] : m === "February" ? [S(`February. Bubble season. My favorite time to panic about teams I don't even root for.`)] : m === "March" ? [S(`It's MARCH, Dex!`), D(`It is March.`), S(`Say it with feeling!`), D(`It is... March.`)] : null;
  }
];
function introSeg(c, open, debut = false) {
  const lines = [];
  if (debut) {
    lines.push(S(`Hello, hello, HELLO! This is the first-ever episode of ${SHOW.name} on ${SHOW.station}. I'm Big Sal Moretti!`));
    lines.push(D(`And I'm Dex Holloway. They gave us a radio show, Sal.`));
    lines.push(S(`They gave us a radio show, Dex. And nobody stopped them.`));
    lines.push(D(`Every week we'll talk polls, players, games and, unfortunately, Sal's opinions. Phone lines are open.`));
  } else {
    lines.push(...open ?? pickFresh(c, "open", OPENERS)(c));
    lines.push(...firstFresh(c, "banter", BANTER));
  }
  return { title: "Cold Open", icon: "\u{1F399}\uFE0F", lines };
}
function pollSeg(c) {
  const { state, r } = c;
  const top = ranked(state);
  if (top.length < 10) return null;
  const lines = [];
  const one = top[0];
  const newPoll = (c.R.pollCount ?? -1) !== state.polls.length;
  const wasNo1 = c.R.no1;
  c.R.pollCount = state.polls.length;
  c.R.no1 = one.id;
  if (!newPoll) {
    if (state.phase !== "confTourney") return null;
    lines.push(D(`No new poll this week. It's Championship Week, and ${one.school} is still No. 1 at ${rec(one)}.`), S(`Polls don't matter now, Dex. Survive and advance!`));
    return { title: "The Poll", icon: "\u{1F4CA}", lines };
  }
  if (one.record.w + one.record.l === 0) {
    lines.push(S(`${one.school} opens the season at No. 1. They haven't played a game and I'm already sick of them.`, "hot"), D(`That's a new record, even for you.`));
  } else if (wasNo1 && wasNo1 !== one.id) {
    lines.push(S(`New No. 1 in the country: ${one.school}! I called this. I called this in October.`, "hot"));
    const p = c.R.preds?.season === state.season ? c.R.preds.sal.title : void 0;
    lines.push(p && p !== one.id ? D(`In October you picked ${state.teams[p].school} to win it all.`) : D(`They're ${rec(one)} and No. ${one.net} in the NET. Hard to argue.`, "good"));
    if (p && p !== one.id) lines.push(S(`October Sal was a different man, Dex. A younger man.`));
    head(c, 6, `New No. 1: ${one.school}`);
  } else {
    lines.push(...r.pick([
      [S(`${one.school} is No. 1 again. Boring! Somebody beat these guys.`), D(`People have tried. They're ${rec(one)}.`)],
      [S(`${one.school} at the top of the poll. Fine. I don't like it, but fine.`), D(`${rec(one)}, No. ${one.net} in the NET. The numbers like them too.`, "good")],
      (() => {
        const nx = state.schedule.filter((g) => !g.played && g.day >= state.day && (g.home === one.id || g.away === one.id)).sort((a, b) => a.day - b.day)[0];
        const opp = nx ? state.teams[nx.home === one.id ? nx.away : nx.home] : void 0;
        return opp && opp.net > 120 ? [D(`${one.school} holds No. 1 at ${rec(one)}.`), S(`I'm saying it now: they lose this week.`, "bad"), D(`They play ${opp.school}. ${ord3(opp.net)} in the NET.`), S(`Trap game, Dex! Classic trap game!`)] : [D(`${one.school} holds No. 1 at ${rec(one)}.`), S(`I'm saying it now: they lose this week.`, "hot"), D(`Next up is ${opp ? opp.school : "a tough one"}. Could happen.`)];
      })()
    ]));
  }
  const risers = top.filter((t) => t.prevApRank && t.apRank < t.prevApRank).sort((a, b) => b.prevApRank - b.apRank - (a.prevApRank - a.apRank));
  const newcomers = top.filter((t) => !t.prevApRank);
  const riser = risers[0];
  if (riser && riser.prevApRank - riser.apRank >= 4) {
    lines.push(S(`Biggest jump this week: ${riser.school}, from ${riser.prevApRank} to ${riser.apRank}. That's a Final Four team. Put it in writing.`, "hot"));
    lines.push(r.pick([D(`Let's see them win a road game first.`), D(`They're up to ${ord3(riser.net)} in the NET. I'll allow it.`, "good"), D(`It's ${month(c)}, Sal.`)]));
    head(c, 3, `${riser.school} is rising`);
  } else if (newcomers.length) {
    const n = newcomers[0];
    lines.push(S(`Welcome to the poll, ${n.school}! No. ${n.apRank}! Get comfortable.`));
    lines.push(D(`${rec(n)}. First time in the Top 25 this season.`));
  }
  const fallers = top.filter((t) => t.prevApRank && t.apRank > t.prevApRank).sort((a, b) => b.apRank - b.prevApRank - (a.apRank - a.prevApRank));
  const fell = fallers[0];
  if (fell && fell.apRank - fell.prevApRank >= 4) {
    const bad = fell.apRank <= 15;
    lines.push(S(`${fell.school} drops from ${fell.prevApRank} to ${fell.apRank}. They're cooked. Done. Stick a fork in 'em.`, bad ? "bad" : "hot"));
    lines.push(D(bad ? `They're still a top-15 team, Sal. They lost a game.` : fell.record.streak <= -2 ? `They've dropped ${-fell.record.streak} straight. Fair to worry.` : `One bad week. The voters panicked.`, bad ? void 0 : "good"));
    head(c, 3, `Is ${fell.school} cooked?`);
  }
  const over = top.slice(0, 20).filter((t) => t !== fell && t !== riser && t.net - t.apRank >= 15).sort((a, b) => b.net - b.apRank - (a.net - a.apRank))[0];
  if (over) {
    lines.push(D(`${over.school} is No. ${over.apRank} in the poll and ${ord3(over.net)} in the NET. Somebody's lying.`, "good"));
    lines.push(...r.pick([[S(`The voters watch the games, Dex. You watch a spreadsheet.`, "bad")], [S(`I've been saying it for weeks!`), D(`You have not.`)], [S(`Frauds! I KNEW it!`, "hot"), D(`You had them in your top five last week.`)]]));
  }
  const under = byNet(state).slice(0, 18).find((t) => !t.apRank);
  if (under && fresh(c, `under:${under.id}`)) {
    use(c, `under:${under.id}`);
    lines.push(S(`Nobody is talking about ${under.school}. ${rec(under)}! I'm talking about them.`, "hot"));
    lines.push(D(`${ord3(under.net)} in the NET and not ranked. The voters are asleep.`, "good"));
  }
  return { title: "The Poll", icon: "\u{1F4CA}", lines };
}
function recapSeg(c) {
  const { state, r } = c;
  const games = lastWeek(state).filter((g) => fresh(c, `g:${g.id}`)).map((g) => ({ g, ...result(state, g) }));
  if (games.length < 5) return null;
  const cover = (g) => use(c, `g:${g.id}`);
  const lines = [];
  const ups = games.filter((x) => x.l.apRank && (!x.w.apRank || x.w.apRank - x.l.apRank >= 8)).sort((a, b) => (a.l.apRank ?? 99) - (b.l.apRank ?? 99));
  const up = ups[0];
  if (up) {
    lines.push(r.pick([
      S(`Did everybody see ${up.w.school} take down No. ${up.l.apRank} ${up.l.school}?! Storm the court! Storm it twice!`),
      S(`Upset of the week: ${up.w.school} over No. ${up.l.apRank} ${up.l.school}, ${up.score}. I need to lie down.`),
      S(`${up.w.school}! Beating No. ${up.l.apRank} ${up.l.school}! Somebody get those kids a parade!`)
    ]));
    const salHad = c.R.locks.find((l) => l.gameId === up.g.id && l.who === "sal");
    if (salHad && salHad.pick === up.l.id) {
      lines.push(D(`Sal had ${up.l.school} as his lock in that game.`));
      lines.push(S(`We're not talking about that, Dex.`));
    } else lines.push(D(`${up.score}${up.ot ? " in overtime" : ""}. ${up.w.school} is now ${rec(up.w)}.`));
    head(c, 5, `${up.w.school} shocks No. ${up.l.apRank} ${up.l.school}`);
    cover(up.g);
  }
  const close = games.filter((x) => x.margin <= 2 && (x.w.apRank || x.l.apRank) && x !== up)[0];
  if (close) {
    lines.push(D(`Best finish of the week: ${close.w.school} ${close.ws}, ${close.l.school} ${close.ls}${close.ot ? " in overtime" : ""}.`));
    lines.push(r.pick([S(`I aged three years watching that.`), S(`My heart can't take these. Keep them coming.`), S(`I spilled an entire plate of nachos on that last possession. Worth it.`)]));
    cover(close.g);
  }
  const blow = games.filter((x) => x.margin >= 30 && x.w.apRank).sort((a, b) => b.margin - a.margin)[0];
  if (blow) {
    lines.push(S(`${blow.w.school} beat ${blow.l.school} by ${blow.margin}. That's not a game, that's a crime scene.`));
    lines.push(r.pick([D(`${blow.score}. The walk-ons played the last eight minutes.`), D(`They shot it well. Very well. ${blow.ws} points.`)]));
    cover(blow.g);
  }
  let best;
  for (const x of games) {
    const box = state.boxScores[x.g.id];
    if (!box) continue;
    for (const side of [0, 1]) for (const p of box.players[side]) {
      if (!best || p.pts > best.pts) best = { name: p.name, pts: p.pts, team: state.teams[side === 0 ? x.g.home : x.g.away], opp: state.teams[side === 0 ? x.g.away : x.g.home] };
    }
  }
  if (best && best.pts >= 30) {
    lines.push(D(`Performance of the week: ${best.name} of ${best.team.school}, ${best.pts} points against ${best.opp.school}.`, "info"));
    lines.push(r.pick([S(`Give that young man the keys to the city.`), S(`${best.pts}! I've never scored ${best.pts} of anything. Not even wings.`), S(`Somebody check that kid's shoes. Something's in there.`)]));
    if (best.pts >= 38) head(c, 4, `${best.name} drops ${best.pts}`);
  }
  if (!lines.length) return null;
  return { title: "Around the Country", icon: "\u{1F30E}", lines };
}
function yoursSeg(c) {
  const { state, r, U, coach } = c;
  const lines = [];
  const star = userStar(state, U);
  const games = lastWeek(state).filter((g) => g.home === U.id || g.away === U.id).map((g) => result(state, g));
  const st = U.record.streak;
  const sec = coach.jobSecurity ?? 60;
  const title = `${U.school} Talk`;
  const ncaaField = state.ncaa ? Object.keys(state.ncaa.seeds) : [];
  const done2 = (state.phase === "ncaa" || state.phase === "selection") && (!ncaaField.includes(U.id) || !aliveTeams(state).includes(U.id));
  if (done2) {
    lines.push(ncaaField.includes(U.id) ? S(`${U.school}'s season is over at ${rec(U)}. They went down swinging. I'm proud of 'em.`) : S(`${U.school} finished ${rec(U)} and missed the dance. Long offseason for Coach ${coach.last}.`));
    if (star && star.stats.gp) lines.push(D(`${nm2(star)} finished at ${f1(ppg(star))} a game. ${star.cls === "SR" || star.cls === "GR" ? "His last season, too." : "The question is whether he comes back."}`));
    lines.push(S(r.pick([`Portal season is coming, Coach. Get the phone charged.`, `Next year. I'm already writing the takes.`, `Hold your heads up, ${U.mascot}.`])));
    return { title, icon: "\u{1F3E0}", lines };
  }
  const later = ["February", "March", "April"].includes(month(c));
  if (st >= 5) {
    lines.push(r.pick([
      S(`${U.school} has won ${st} straight. I'm booking a hotel for the Final Four. Two hotels. One for my takes.`, "hot"),
      S(`${st} in a row for ${U.school}! Coach ${coach.last} is a genius and I want him to coach my nephew's rec team.`)
    ]));
    head(c, 4, `${U.school} has won ${st} straight`);
  } else if (st <= -3) {
    lines.push(r.pick([
      S(`${U.school} has dropped ${-st} straight. Somebody check on Coach ${coach.last}. Bring soup.`),
      S(`${-st} straight losses for ${U.school}. I'm worried, Dex. I'm genuinely worried.`)
    ]));
    head(c, 4, `What's wrong with ${U.school}?`);
  } else if (U.apRank && U.apRank <= 10) {
    lines.push(S(`${U.school}, No. ${U.apRank} in the country. They look like a team that's playing in April.`, "hot"));
  } else if (U.apRank) {
    lines.push(S(`${U.school} is ranked ${U.apRank} and I think that's too low. Or too high. I'll know by Thursday.`));
  } else if (U.record.w > U.record.l) {
    lines.push(S(`Nobody respects ${U.school}. ${rec(U)}! I respect ${U.school}.`));
  } else if (U.record.w + U.record.l >= 4) {
    lines.push(S(`${U.school} is ${rec(U)}. That's either a rebuild or a disaster. ${later ? `I'm leaning disaster.` : `Ask me again in February.`}`, later ? "hot" : void 0));
  } else {
    lines.push(S(`Let's talk ${U.school}. Coach ${coach.last}, ${rec(U)}. I have FEELINGS about this team.`));
  }
  if (games.length) {
    const recent = games.slice(-3);
    const desc = recent.map((x) => x.w.id === U.id ? `beat ${x.l.school} ${x.score}` : `lost to ${x.w.school} ${x.score}`);
    lines.push(D(games.length > 3 ? `Busy week. Their last three: they ${desc.join(", ")}.` : `This week they ${desc.join(", then ")}.`));
    const bigWin = games.find((x) => x.w.id === U.id && x.l.apRank);
    const badLoss = games.find((x) => x.l.id === U.id && !x.w.apRank && x.w.net > 100);
    if (bigWin) lines.push(S(`Beating No. ${bigWin.l.apRank} ${bigWin.l.school}! That's a r\xE9sum\xE9 win, baby. Frame it.`));
    else if (badLoss) lines.push(S(`Losing to ${badLoss.w.school}? ${badLoss.w.school}?! I had to pull the car over.`, "hot"));
  }
  {
    const L = state.locker?.teamId === U.id ? state.locker : void 0;
    const from = state.radio?.lastDay ?? state.day - 7;
    const news = (L?.log ?? []).filter((e) => e.season === state.season && e.day > from && e.day <= state.day);
    const big = news.find((e) => ["\u{1F494}", "\u{1F4E3}", "\u{1F339}", "\u2705"].includes(e.icon)) ?? news.find((e) => e.icon === "\u{1F5DD}\uFE0F" && /suspend|bench/i.test(e.text));
    const chem = U.chem ?? 60;
    if (big?.icon === "\u{1F494}") {
      lines.push(S(`I'm hearing things out of that ${U.school} locker room, Dex. ${big.text}. That's not nothing.`, "hot"));
      lines.push(D(`Locker rooms remember that stuff. We'll see if it shows up on the floor.`));
    } else if (big?.icon === "\u{1F4E3}") {
      lines.push(D(`Word is ${big.text.replace(" called out the team after practice", "")} got in some faces at practice this week.`, "info"));
      lines.push(S(`Good! I want my captains yelling. Yell more!`));
    } else if (big?.icon === "\u{1F339}") {
      lines.push(S(`Senior Night at ${U.arena}! I cried, Dex. I'm not ashamed.`));
    } else if (big?.icon === "\u2705") {
      lines.push(D(`Credit Coach ${coach.last}: ${big.text.replace("You kept your word: ", "")}. He said he'd get him minutes and he did.`, "good"));
    } else if (big) {
      lines.push(D(`Discipline note out of ${U.school}: ${big.text.split(":")[0]}. Coach ${coach.last} isn't playing around.`, "info"));
    } else if (chem < 40 && U.record.w + U.record.l >= 4) {
      lines.push(S(`I'm hearing that ${U.school} locker room is ${chemLabel(chem).label.toLowerCase()}, Dex. Guys aren't talking to each other.`, "hot"));
      lines.push(D(`You can see it on the floor. Nobody's helping anybody up.`));
    } else if (chem >= 80 && U.record.w > U.record.l && r.chance(0.5)) {
      lines.push(D(`Have you watched ${U.school}'s bench? Those guys love each other. That matters in March.`, "good"));
    }
  }
  {
    const pro = prosOf(state, U.id).find((c2) => c2.retired == null && c2.log[c2.log.length - 1]?.[1] === 0);
    if (pro && r.chance(0.3)) {
      const t = proTotals(pro);
      lines.push(D(`Quick pro check: former ${U.mascot.replace(/s$/, "")} ${pro.name} is putting up ${pro.log[pro.log.length - 1][2].toFixed(1)} a game for ${pro.team}${pro.allStar ? `, and he's a ${pro.allStar}-time All-Star` : ""}.`, "info"));
      lines.push(S(t.ppg >= 15 ? `Coach ${coach.last} should put that on every recruiting brochure. Twice.` : `I knew he'd make it. I said so on this show. Probably.`));
    }
  }
  if (star && star.stats.gp >= 2) {
    const sh = star.stats.fga ? Math.round(star.stats.fgm / star.stats.fga * 100) : 0;
    lines.push(r.pick([
      D(`${nm2(star)} is carrying them: ${f1(ppg(star))} a night on ${sh}% shooting.`, "good"),
      D(`The engine is ${nm2(star)}. ${f1(ppg(star))} points, ${f1((star.stats.orb + star.stats.drb) / star.stats.gp)} boards a game.`)
    ]));
    lines.push(r.pick([
      S(`${star.last} should go pro tomorrow. Mid-season. Just leave. He's too good for this.`, "bad"),
      S(`${star.last} is an All-American. Write it down.`, "hot"),
      S(`I'd pay full price to watch ${star.last} do layup lines.`)
    ]));
  } else if (star) {
    lines.push(D(`The guy to watch is ${nm2(star)}, a ${describe(star)}.`));
  }
  if (U.record.w + U.record.l >= 5) {
    const off = U.record.pf / gp(U), def = U.record.pa / gp(U);
    lines.push(D(`They're scoring ${f1(off)} and allowing ${f1(def)}. ${def < 66 ? "That defense is real." : def > 76 ? "That defense has to get better." : off > 80 ? "That offense can really go." : "Pretty balanced."}`, "good"));
  }
  const claim = (state.user.pressMemory?.claims ?? []).filter((x) => x.teamId === U.id && x.season === state.season && fresh(c, `claim:${x.day}:${x.kind}`)).pop();
  if (claim && r.chance(0.6)) {
    use(c, `claim:${claim.day}:${claim.kind}`);
    lines.push(S(`And remember what Coach ${coach.last} said ${claim.when}: "${claim.text}"`));
    lines.push(r.pick([S(`I'm holding him to that. I wrote it on my fridge.`), D(`Bold. We'll see.`), D(`For the record, that quote is in my spreadsheet.`)]));
  }
  if (sec < 35 && U.record.w + U.record.l >= 6) {
    lines.push(D(`Word around town is the boosters are getting restless.`));
    lines.push(S(`Hot seat? Coach ${coach.last}'s seat is a stovetop, Dex.`, "hot"));
  } else if (sec > 88 && fresh(c, "secure") && U.record.w > U.record.l) {
    use(c, "secure");
    lines.push(S(`They should build Coach ${coach.last} a statue. Bronze. Life-size. Maybe bigger.`));
  }
  const next = state.schedule.filter((g) => !g.played && g.day >= state.day && (g.home === U.id || g.away === U.id)).sort((a, b) => a.day - b.day)[0];
  if (next) {
    const opp = state.teams[next.home === U.id ? next.away : next.home];
    const home = next.home === U.id && !next.neutral;
    const line = spread(state, next.home, next.away, next.neutral) * (next.home === U.id ? 1 : -1);
    const rv = rivalryOf2(state, U.id, opp.id);
    lines.push(D(`Next up: ${opp.apRank ? `No. ${opp.apRank} ` : ""}${opp.school}${home ? " at home" : next.neutral ? " on a neutral floor" : " on the road"}.${rv ? ` ${rv.name ?? "Rivalry game"}.` : ""} ${line > 0.5 ? `${U.school} by about ${Math.round(line)} in my numbers.` : line < -0.5 ? `${opp.school} by about ${Math.round(-line)} in my numbers.` : "Coin flip."}`));
    lines.push(r.pick([
      S(`${U.school} by twenty. Easy. I'm never wrong.`, line < -6 ? "bad" : "hot"),
      S(`I've got a bad feeling about this one. Trap game.`),
      rv ? S(`It's ${rv.name ?? "a rivalry game"}! Throw the records out! Throw the spreadsheet out too, Dex!`) : S(`${opp.school}? I've never trusted ${opp.mascot}. Never.`)
    ]));
  }
  return { title, icon: "\u{1F3E0}", lines };
}
function spotlightSeg(c) {
  const { state, r, U } = c;
  const sc2 = scorers(state, 4);
  if (sc2.length < 20) return null;
  const lines = [];
  const top = sc2[0];
  const tteam = state.teams[top.teamId];
  lines.push(D(`The nation's leading scorer: ${nm2(top)} of ${tteam.school}, ${f1(ppg(top))} a game.`, "info"));
  lines.push(r.pick([
    S(`Best player in the country and it's not close.`, "hot"),
    S(`Empty calories. Put him on a winning team and see what happens.`, tteam.record.w > tteam.record.l ? "bad" : "hot"),
    S(`I'd let that kid shoot in my living room.`)
  ]));
  const score = (p) => {
    const t = state.teams[p.teamId];
    const g = Math.max(1, p.stats.gp);
    return ppg(p) + (p.stats.orb + p.stats.drb) / g * 0.6 + p.stats.ast / g * 0.8 + t.record.w / gp(t) * 8;
  };
  const race = sc2.slice(0, 60).sort((a, b) => score(b) - score(a)).slice(0, 3);
  if (race.length === 3) {
    lines.push(D(`My Player of the Year ballot today: ${race.map((p, i) => `${i + 1}. ${nm2(p)}, ${state.teams[p.teamId].abbr}`).join(". ")}.`, "good"));
    lines.push(r.pick([
      S(`Wrong order. ${race[2].last} at No. 1. He passes the eye test, Dex. You don't even have eyes. You have a calculator.`, "hot"),
      S(`${race[0].last}. Fine. I agree. Don't get used to it.`),
      S(`Where's the big man love? Nobody votes for the guys who do the dirty work.`)
    ]));
    head(c, 2, `The Player of the Year race`);
  }
  const fr = sc2.find((p) => p.cls === "FR");
  if (fr && fresh(c, `fr:${fr.id}`)) {
    use(c, `fr:${fr.id}`);
    lines.push(S(`Freshman alert: ${nm2(fr)} at ${state.teams[fr.teamId].school}, ${f1(ppg(fr))} points a game. Eighteen years old! At eighteen I was getting cut from my JV team.`));
    lines.push(D(`Twice.`));
  }
  const mine = sc2.slice(0, 40).find((p) => p.teamId === U.id);
  if (mine) lines.push(D(`And from ${U.school}, ${nm2(mine)} is ${ord3(sc2.indexOf(mine) + 1)} in the country at ${f1(ppg(mine))}.`));
  return { title: "Player Spotlight", icon: "\u2B50", lines };
}
var CALLS = [
  (c, who) => {
    const l = lastWeek(c.state).filter((g) => g.home === c.U.id || g.away === c.U.id).map((g) => result(c.state, g)).find((x) => x.l.id === c.U.id);
    return l ? [C(who, `I've had it. We lost to ${l.w.school}. Fire everybody.`, "bad"), S(`Everybody? Even the mascot?`), C(who, `ESPECIALLY the mascot. He knows what he did.`), D(`For the record, ${c.U.school} is ${rec(c.U)}.`)] : null;
  },
  (c, who) => c.U.record.streak >= 3 ? [C(who, `Long-time listener, first-time caller. ${c.U.school} is winning the whole thing. I already bought the T-shirt.`, "hot"), S(`I love the energy!`), D(`It's ${month(c)}.`), C(who, `The shirt was nonrefundable, Dex.`)] : null,
  (c, who) => [C(who, `My dog picks games by which food bowl he walks to first. He's ${c.r.int(9, 14)}-${c.r.int(1, 4)} this year.`), D(`That's a better record than Sal's.`), S(`Hang up on this man. And the dog.`)],
  (_c, who) => [C(who, `Sal, you're wrong about everything.`), S(`Thank you for calling!`), C(who, `I mean it.`), S(`I know you do, sweetheart. Next caller.`)],
  (c, who) => {
    const t = ranked(c.state).slice(0, 12).find((x) => x.record.l >= 2);
    return t ? [C(who, `${t.school} is going undefeated.`, "bad"), D(`They have ${t.record.l} losses.`), C(who, `Starting now.`)] : null;
  },
  (_c, who) => [C(who, `Why don't they lower the rims so regular guys like me can dunk?`, "bad"), S(`You know what? I'm for it.`), D(`I'm hanging up on both of you.`)],
  (_c, who) => [C(who, `Is it true Dex has never been to a game in person?`), D(`I watch the play-by-play data. It's purer.`), S(`He's never smelled arena nachos, folks. Pray for him.`)],
  (c, who) => [C(who, `My wife says if ${c.U.school} makes the Final Four, we can name the baby after Coach ${c.coach.last}.`), S(`What if it's a girl?`), C(who, `Still ${c.coach.last}.`), S(`Beautiful. That's family.`)],
  (c, who) => {
    const p = scorers(c.state, 4)[0];
    return p ? [C(who, `${nm2(p)} is the best player I've ever seen, and I've been watching since they used peach baskets.`, "hot"), D(`He's averaging ${f1(ppg(p))}. He's good.`), S(`Peach baskets? How old are you?`), C(who, `Ninety-one. Don't change the subject.`)] : null;
  },
  (_c, who) => [C(who, `I want to defend the zone.`), S(`Nobody wants to hear this.`), C(who, `It's beautiful, Sal. It's like a hug, but for the paint.`), D(`That's... actually not bad.`, "good")],
  (c, who) => {
    const p = userStar(c.state, c.U);
    return p && p.stats.gp >= 3 ? [C(who, `${c.U.school} needs to get the ball to ${p.last} every single possession.`, "bad"), D(`He's already taking ${Math.round(p.stats.fga / Math.max(1, gp(c.U)) * 10) / 10} shots a game.`), C(who, `Make it a hundred.`)] : null;
  },
  (c, who) => {
    const r = rivalriesOf(c.state, c.U.id)[0];
    const o = r ? c.state.teams[r.a === c.U.id ? r.b : r.a] : void 0;
    return o ? [C(who, `I just want to say I can't stand ${o.school}. That's it. That's the call.`), S(`Beautiful. Thank you. Next caller.`)] : null;
  },
  (_c, who) => [C(who, `Sal, I named my fantasy team after you.`), S(`Aw! What's it called?`), C(who, `"Wrong Again."`)],
  (_c, who) => [C(who, `Every team should be allowed one player over forty.`, "bad"), S(`Are you over forty?`), C(who, `I'm available Tuesdays and Thursdays.`)],
  (c, who) => {
    const up = lastWeek(c.state).map((g) => result(c.state, g)).find((x) => x.l.apRank && !x.w.apRank);
    return up ? [C(`${who.split(" in ")[0]} in ${up.w.city}`, `${up.w.school} fan here. We stormed the court and I lost a shoe. Worth it.`), S(`Did you get the shoe back?`), C(`${who.split(" in ")[0]} in ${up.w.city}`, `No. If anybody finds a size 13 by the scorer's table, it's mine.`)] : null;
  },
  (c, who) => [C(who, `I think Coach ${c.coach.last} should run more. More running. Everybody running.`, "bad"), D(`Run what?`), C(who, `Just... running, Dex.`)],
  (_c, who) => [C(who, `Dex, what's the most important stat in basketball?`), D(`Points per possession, adjusted for opponent.`, "good"), S(`Wrong. It's heart.`), D(`Heart isn't tracked.`), S(`That's why you can't see it, Dex.`)],
  (_c, who) => [C(who, `I've been to every home game for thirty-one years.`), S(`Respect.`), C(who, `I just wanted to say that. Also my seats are terrible.`)]
];
function rivalrySeg(c) {
  const { state, r, U } = c;
  const lines = [];
  const opp = (rv) => state.teams[rv.a === U.id ? rv.b : rv.a];
  const wk = IN_SEASON4.includes(state.phase) ? userRivalryThisWeek(state) : void 0;
  if (wk && fresh(c, `rw:${wk.g.id}`)) {
    use(c, `rw:${wk.g.id}`);
    const rv = wk.r, o = opp(rv);
    const [w, l] = seriesFor(rv, U.id);
    const h2 = heatInfo(rv.heat);
    lines.push(S(r.pick([`It's RIVALRY WEEK, people! ${rv.name}! ${U.school} and ${o.school}!`, `Clear your schedules. ${rv.name} is this week, and I've been waiting all year.`, `${U.school}. ${o.school}. ${rv.name}. I'm already sweating.`]), "hot"));
    lines.push(D(`The heat meter says ${h2.label.toLowerCase()}. ${w + l ? `Since ${rv.since}, ${U.school} is ${w}-${l} in this series.` : `First meeting since we started keeping score.`}${rv.streak && rv.streak.n >= 2 ? ` ${state.teams[rv.streak.t].school} has won ${rv.streak.n} straight.` : ""}`, "info"));
    if (rv.trophy) lines.push(D(rv.holder ? `${rv.trophy} is sitting in ${state.teams[rv.holder].school}'s building right now.` : `${rv.trophy} is up for grabs.`), S(rv.holder && rv.holder !== U.id ? `Go get it back! Bring the trophy home!` : `Keep it right where it is!`));
    const caller = `${r.pick(FIRST_NAMES)} in ${o.city}`;
    const [call, reply] = r.pick([
      [`${o.school} fan here. Enjoy the week, because you're losing on Saturday.`, `Sir, this is a ${U.mascot} show. Respectfully, hang up.`],
      [`I just want everybody in ${U.city} to know we're coming. Bring tissues.`, `I love the confidence. I hate everything else about it.`],
      [`${U.school}? Overrated. Every year. I'll be at the game in my lucky shirt.`, `Lucky shirt! Has it been washed since 2009?`],
      [`I painted my dog in ${o.school} colors for this one.`, `Leave the dog out of this, sir. The dog is innocent.`]
    ]);
    lines.push(C(caller, call, "hot"));
    lines.push(S(reply));
    lines.push(S(r.pick([`${U.school} by double digits. Write it down.`, `I'm calling it now: ${U.school}, and the place goes crazy.`, `Gut says ${U.school}. Heart says ${U.school}. Stomach says nachos.`]), "hot"));
    head(c, 7, `Rivalry Week: ${rv.name}`);
    return { title: "Rivalry Corner", icon: "\u{1F525}", lines };
  }
  const since = state.radio?.lastDay ?? 0;
  const just = rivalriesOf(state, U.id).map((rv) => ({ rv, m: rv.meetings[rv.meetings.length - 1] })).find((x) => x.m && x.m.s === state.season && x.m.d >= since && fresh(c, `rr:${x.rv.key}:${x.m.d}`));
  if (just) {
    use(c, `rr:${just.rv.key}:${just.m.d}`);
    const rv = just.rv, o = opp(rv), won = just.m.w === U.id;
    const [w, l] = seriesFor(rv, U.id);
    lines.push(won ? S(r.pick([`${U.school} beat ${o.school}! ${just.m.ws}-${just.m.ls}! I'm still yelling!`, `Bragging rights! ${U.school} takes ${rv.name}, ${just.m.ws}-${just.m.ls}!`]), "hot") : S(r.pick([`${U.school} lost to ${o.school}. I need a minute. I need several minutes.`, `${o.school} wins ${rv.name}, ${just.m.ws}-${just.m.ls}. I'm not okay, Dex.`])));
    lines.push(D(`The series since ${rv.since} is ${w}-${l}${rv.streak && rv.streak.n >= 2 ? `, and ${state.teams[rv.streak.t].school} has won ${rv.streak.n} straight` : ""}.${rv.trophy && rv.holder ? ` ${rv.trophy} belongs to ${state.teams[rv.holder].school}.` : ""}`, "info"));
    if (!won) lines.push(C(`${r.pick(FIRST_NAMES)} in ${o.city}`, `Just calling to say hi. How's everybody in ${U.city} doing today?`, "hot"), S(`Click. Next caller. NEXT CALLER.`));
    head(c, 6, won ? `${U.school} wins ${rv.name}` : `${o.school} wins ${rv.name}`);
    return { title: "Rivalry Corner", icon: "\u{1F525}", lines };
  }
  const born = Object.values(state.rivals?.pairs ?? {}).filter((rv) => rv.active && rv.origin === "born" && rv.since >= state.season - 1 && fresh(c, `born:${rv.key}`)).sort((a, b) => Number(b.a === U.id || b.b === U.id) - Number(a.a === U.id || a.b === U.id) || b.heat - a.heat)[0];
  if (born) {
    use(c, `born:${born.key}`);
    const A2 = state.teams[born.a], B = state.teams[born.b];
    const mine = born.a === U.id || born.b === U.id;
    lines.push(D(`We have a new rivalry, folks: ${born.name}. ${A2.school} and ${B.school}.`, "info"));
    if (born.reason) lines.push(D(born.reason));
    lines.push(mine ? S(`And it involves US! I love it. I hate them already. I've hated them for minutes and it feels like years.`, "hot") : S(r.pick([`Beautiful. College basketball needs more people who can't stand each other.`, `Give it a trophy! Give it a trophy right now!`])));
    head(c, 5, `A rivalry is born: ${born.name}`);
    return { title: "Rivalry Corner", icon: "\u{1F525}", lines };
  }
  if (IN_SEASON4.includes(state.phase)) {
    const hot = upcoming(state).map((g) => ({ g, rv: rivalryOf2(state, g.home, g.away) })).filter((x) => x.rv && x.rv.heat >= 70).sort((a, b) => b.rv.heat - a.rv.heat)[0];
    if (hot && fresh(c, `hot:${hot.g.id}`)) {
      use(c, `hot:${hot.g.id}`);
      const h2 = state.teams[hot.g.home], a = state.teams[hot.g.away];
      lines.push(D(`Hottest rivalry game in the country this week: ${a.school} at ${h2.school}. ${hot.rv.name}. ${heatInfo(hot.rv.heat).label}.`, "info"));
      lines.push(S(r.pick([`I'd sell my car for a ticket to that one. Not a good car. But a car.`, `${h2.school} at home in that one? Forget it. That building will be shaking.`, `Upset alert! I don't know who the underdog is, but upset alert!`]), "hot"));
      return { title: "Rivalry Corner", icon: "\u{1F525}", lines };
    }
  }
  return null;
}
function realignSeg(c) {
  const { state, r, U } = c;
  const conf2 = (id) => state.conferences.find((x) => x.id === id)?.short ?? id;
  const pending = pendingMoves(state);
  const lines = [];
  if (pending.length && fresh(c, `rl:${state.season}`)) {
    use(c, `rl:${state.season}`);
    lines.push(S(r.pick([`REALIGNMENT, Dex! The map is moving again!`, `Commissioners are on the phones, and Big Sal is on the edge of his seat.`])));
    lines.push(D(`Here's what's been announced for next season: ${pending.slice(0, 4).map((m) => `${state.teams[m.teamId]?.school} from the ${conf2(m.from)} to the ${conf2(m.to)}`).join("; ")}.`, "info"));
    const mine = pending.find((m) => m.teamId === U.id);
    if (mine) lines.push(S(r.pick([`And ${U.school} has an invitation from the ${conf2(mine.to)}! Take the money! Take the money and the fancier chairs!`, `${U.school} to the ${conf2(mine.to)}? Coach ${c.coach.last}, think about the road trips! Then take it anyway!`]), "hot"), D(`Bigger checks, tougher nights. It's a real decision.`, "good"));
    else if (pending.some((m) => m.from === U.conf)) lines.push(S(`And somebody's leaving ${U.school}'s league. Good riddance! Don't let the door hit you!`, "hot"));
    else lines.push(S(r.pick([`Geography is dead, Dex. Dead!`, `In my day conferences made sense. My day was last Tuesday.`]), "hot"), D(`Follow the TV money and it all makes sense.`, "good"));
    head(c, 6, "Realignment Watch");
    return { title: "Realignment Watch", icon: "\u{1F5FA}\uFE0F", lines };
  }
  const fresh_ = (state.realign?.moves ?? []).filter((m) => m.status === "done" && m.effective === state.season);
  if (fresh_.length && fresh(c, `rlnew:${state.season}`)) {
    use(c, `rlnew:${state.season}`);
    const mine = fresh_.find((m) => m.teamId === U.id);
    lines.push(D(`New season, new map: ${fresh_.slice(0, 4).map((m) => `${state.teams[m.teamId]?.school} in the ${conf2(m.to)}`).join(", ")}.`, "info"));
    lines.push(mine ? S(`${U.school} in the ${conf2(mine.to)}! Welcome to the big time, baby! I already bought the T-shirt!`, "hot") : S(r.pick([`I give the newcomers one year before they're homesick.`, `Somebody's about to get a rude welcome in their new league.`]), "hot"));
    return { title: "New Neighbors", icon: "\u{1F5FA}\uFE0F", lines };
  }
  return null;
}
var LOCAL_CALLS = /* @__PURE__ */ new Set([0, 1, 7, 10, 11, 15]);
function hotlineSeg(c) {
  const lines = [S(c.r.pick([`Let's go to the phones. You're on ${SHOW.name}!`, `Phone lines are lit up. Line two, go ahead.`, `Hot Take Hotline is open. You're on the air.`]))];
  const n = c.r.chance(0.55) ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const home = callerName(c, 1), any = callerName(c);
    const call = firstFresh(c, "call", CALLS.map((f, k) => (cc) => f(cc, LOCAL_CALLS.has(k) ? home : any)));
    lines.push(...call);
  }
  return { title: "Hot Take Hotline", icon: "\u260E\uFE0F", lines };
}
function triviaSeg(c) {
  const { state, r, U } = c;
  const gens = [
    () => {
      const pool = [U, ...ranked(state).slice(0, 15)].filter((t2) => loreOf(t2.id));
      const t = pool.find((x) => fresh(c, `lore:${x.id}`)) ?? pool[0];
      const l = t ? loreOf(t.id) : void 0;
      if (!t || !l) return null;
      use(c, `lore:${t.id}`);
      const tr = r.pick(l.traditions);
      return [D(`Random info, ${t.school} edition. ${tr}.`, "info"), S(r.pick([`I'd go to that. I'd go to that tonight.`, `Chills. Actual chills.`, `We need that here. Why don't we have that here?`, `I tried that once and got escorted out.`]))];
    },
    () => {
      const pool = [U, ...ranked(state).slice(0, 15)].filter((t2) => loreOf(t2.id)?.moments?.length);
      const t = pool[0] && r.pick(pool);
      const m = t && loreOf(t.id).moments;
      if (!t || !m) return null;
      const mo = r.pick(m);
      const yr = /^(\d{4}): (.*)$/.exec(mo);
      return [D(yr ? `A little history. ${t.school}, ${yr[1]}: ${yr[2]}.` : `A little history from ${t.school}: ${mo}.`, "info"), S(`That's ${t.school} basketball. They don't make 'em like that anymore.`), D(`They might. That's kind of the point of the season.`)];
    },
    () => {
      const t = r.pick(ranked(state).slice(0, 20).filter((x) => loreOf(x.id)?.titles?.length));
      if (!t) return null;
      const ts = loreOf(t.id).titles;
      const dyn = state.champions.filter((x) => x.teamId === t.id).length;
      return [D(`${t.school} has ${plural2(ts.length + dyn, "national title")}, the last in ${dyn ? state.champions.filter((x) => x.teamId === t.id).pop().season + 1 : ts[ts.length - 1]}.`, "info"), S(r.pick([`And they act like it, Dex. They act like it.`, `I've won zero. But I've had zero chances.`]))];
    },
    () => {
      const rb = recordBook(state);
      const e = rb.league.game.pts?.[0];
      if (!e || e.v < 35) return null;
      return [D(`From the record book: the most points in a game since we started keeping track is ${e.v}, by ${e.n}${e.t ? ` of ${state.teams[e.t]?.school}` : ""}${e.o ? ` against ${state.teams[e.o]?.school}` : ""} in ${seasonLabel(e.s)}.`, "info"), S(`${e.v}! I've never had ${e.v} of anything. Except wings. Once. Bad night.`)];
    },
    () => {
      const ps = Object.values(state.players).filter((p) => p.teamId && p.stats.gp >= 5);
      if (ps.length < 50) return null;
      const k = r.pick(["tpm", "blk", "stl", "ast"]);
      const lead = ps.sort((a, b) => b.stats[k] - a.stats[k])[0];
      const label = { tpm: "made threes", blk: "blocked shots", stl: "steals", ast: "assists" }[k];
      return [D(`Most ${label} in the country this season: ${nm2(lead)} of ${state.teams[lead.teamId].school}, with ${lead.stats[k]}.`, "info"), S(r.pick([`Never heard of him. Love him already.`, `Get that man a sandwich and a scholarship.`, `I'd have him on my team. Do I have a team? I should have a team.`]))];
    },
    () => {
      const t = r.pick(Object.values(state.teams).filter((x) => x.record.w + x.record.l >= 5 && x.record.streak >= 6));
      return t ? [D(`Longest active win streak I can find: ${t.school}, ${t.record.streak} straight.`, "info"), S(`Don't say it out loud! You'll jinx it!`), D(`I'm a numbers guy, Sal. I don't believe in jinxes.`), S(`That's exactly what a jinx would say.`)] : null;
    }
  ];
  const lines = firstFresh(c, "trivia", gens);
  return lines.length ? { title: "Random Info with Dex", icon: "\u{1F4A1}", lines } : null;
}
function recruitingSeg(c) {
  const { state, U, r } = c;
  const cr = classRankings(state);
  if (cr.length < 5) return null;
  const top = state.teams[cr[0].teamId];
  const mineIdx = cr.findIndex((x) => x.teamId === U.id);
  const lines = [D(`On the recruiting trail, ${top.school} has the No. 1 class right now: ${plural2(cr[0].count, "commit")}.`, "info")];
  lines.push(S(r.pick([`Rich get richer, Dex. Rich get richer.`, `I'd commit to ${top.school}. Nobody asked me, but I would.`, `Classes don't win games. Except when they do. Which is always.`])));
  if (mineIdx >= 0) lines.push(D(`${U.school} sits at No. ${mineIdx + 1} with ${plural2(cr[mineIdx].count, "commit")}.`), mineIdx < 10 ? S(`Top ten class! The future's bright, people. Wear sunglasses.`) : S(`Gotta close stronger, Coach ${c.coach.last}. Get on the phone!`));
  else lines.push(S(`${U.school} doesn't have a commit yet. Coach ${c.coach.last}, the phone works both ways.`));
  return { title: "Recruiting Trail", icon: "\u{1F3AF}", lines };
}
function gradeLocks(c) {
  const { state, R } = c;
  const lines = [];
  const pending = R.locks.filter((l) => !l.result);
  let salGraded = 0;
  for (const l of pending) {
    const g = state.schedule.find((x) => x.id === l.gameId);
    if (!g) {
      l.result = "L";
      continue;
    }
    if (!g.played) continue;
    const res = result(state, g);
    l.result = res.w.id === l.pick ? "W" : "L";
    if (l.season === state.season) R.record[l.who][l.result === "W" ? 0 : 1]++;
    const pick = state.teams[l.pick], opp = state.teams[l.opp];
    if (l.who === "sal") {
      lines.push(D(`${salGraded++ ? "Sal also had" : `Last week Sal's lock was`} ${pick.school} over ${opp.school}.${l.result === "L" ? ` ${res.w.school} won ${res.score}.` : ""}`));
      lines.push(l.result === "W" ? S(c.r.pick([`And they WON, ${res.score}! Bow down! Kiss the ring!`, `${res.score}! Never in doubt! Okay, a little in doubt.`, `Cash it! Frame it! ${res.score}!`])) : S(c.r.pick([`The refs. I'm not saying any more than that.`, `My lock was correct. The players were wrong.`, `I'd like to formally protest the result of that game.`, `We had a bad connection on that one. Next.`])));
    } else {
      lines.push(l.result === "W" ? D(`My lock, ${pick.school}, got there, ${res.score}.`) : D(`My lock, ${pick.school}, lost ${res.score}. The model has been notified.`));
      if (l.result === "L") lines.push(S(`The model has been NOTIFIED! Ha! Put that on a T-shirt.`));
    }
  }
  return lines;
}
function locksSeg(c) {
  const { state, r, R, U } = c;
  const lines = gradeLocks(c);
  const taken = new Set(R.locks.map((l) => l.gameId));
  const games = upcoming(state).filter((g) => state.teams[g.home] && state.teams[g.away] && !taken.has(g.id));
  const interest = (g) => {
    const h2 = state.teams[g.home], a = state.teams[g.away];
    return (g.home === U.id || g.away === U.id ? 40 : 0) + (h2.apRank ? 30 - h2.apRank : 0) + (a.apRank ? 30 - a.apRank : 0) + (rivalryOf2(state, g.home, g.away) ? 15 : 0) - Math.abs(spread(state, g.home, g.away, g.neutral));
  };
  const top = games.sort((a, b) => interest(b) - interest(a)).slice(0, 4);
  if (top.length >= 2) {
    const dexG = top[0];
    const salG = r.chance(0.45) ? top[0] : top[1 + Math.floor(r.next() * (top.length - 1))];
    const dsp = spread(state, dexG.home, dexG.away, dexG.neutral);
    const dexPick = dsp >= 0 ? dexG.home : dexG.away, dexOpp = dexPick === dexG.home ? dexG.away : dexG.home;
    const ssp = spread(state, salG.home, salG.away, salG.neutral);
    const fav = ssp >= 0 ? salG.home : salG.away, dog = fav === salG.home ? salG.away : salG.home;
    const userIn = salG.home === U.id || salG.away === U.id;
    const salPick = userIn && r.chance(0.6) ? U.id : salG === dexG ? r.chance(0.6) ? dog : fav : r.chance(0.42) ? dog : fav;
    const salOpp = salPick === salG.home ? salG.away : salG.home;
    const sp = state.teams[salPick], so = state.teams[salOpp];
    const upset = salPick === dog && Math.abs(ssp) >= 4;
    lines.push(S(upset ? r.pick([`My lock of the week: ${sp.school} over ${so.school}. Upset special. Write it down. Tattoo it.`, `Lock of the week: ${sp.school} beats ${so.school}. Everybody's sleeping on them. Not Big Sal.`]) : r.pick([`My lock of the week: ${sp.school} over ${so.school}. Easy money.`, `Big Sal's lock: ${sp.school}. Over ${so.school}. Don't even watch the game.`]), "lock"));
    if (upset) lines.push(D(`${so.school} is favored by ${Math.round(Math.abs(ssp))} in my numbers.`), S(`Your numbers have never been to a gym, Dex.`));
    const conf2 = Math.round(Math.min(97, 50 + Math.abs(dsp) * 3.3));
    lines.push(D(`My lock: ${state.teams[dexPick].school} over ${state.teams[dexOpp].school}. About ${conf2} percent by the model.`, "lock"));
    if (salG === dexG) lines.push(salPick === dexPick ? S(`Great minds, Dex. Great minds.`) : S(`Same game, opposite sides. Loser buys lunch.`), ...salPick === dexPick ? [] : [D(`You already owe me four lunches.`)]);
    R.locks.push({ who: "sal", gameId: salG.id, pick: salPick, opp: salOpp, season: state.season }, { who: "dex", gameId: dexG.id, pick: dexPick, opp: dexOpp, season: state.season });
    if (R.locks.length > 40) R.locks.splice(0, R.locks.length - 40);
  }
  const [sw, sl] = R.record.sal, [dw, dl] = R.record.dex;
  if (sw + sl + dw + dl > 0) {
    lines.push(D(`Season lock standings: Dex ${dw}-${dl}, Sal ${sw}-${sl}.`));
    if (sw > dw + 2) lines.push(S(`Read it again! Slower! For the people in the back!`));
    else if (dw > sw + 2) lines.push(S(`It's a long season, Dex. A LONG season.`));
  }
  if (!lines.length) return null;
  return { title: "Locks of the Week", icon: "\u{1F512}", lines };
}
function outroSeg(c, extra) {
  const lines = [...extra ?? []];
  lines.push(...pickFresh(c, "outro", [
    [S(`That's the show! Stay loud, stay wrong, stay Fanatic!`), D(`And check the numbers.`)],
    [D(`That's all the time we have.`), S(`We had more time. Dex wasted it on stats.`), D(`Goodnight, everybody.`)],
    [S(`Big Sal, signing off. Call your mother. Hug your point guard.`), D(`In that order.`)],
    [D(`Thanks for listening to ${SHOW.name}.`), S(`Same time next week. I'll be right. He'll be boring.`)],
    [S(`We're out of here! Producer Tony, roll the music!`), D(`We don't have music. We've never had music.`), S(`Hum something, Tony!`)],
    [S(`That's ${SHOW.name}. If you disagree with me, you're wrong. Goodnight!`), D(`If you disagree with Sal, you're probably right. Goodnight.`)]
  ]));
  return { title: "Sign-Off", icon: "\u{1F4FB}", lines };
}
function aliveTeams(state) {
  const n = state.ncaa;
  if (!n) return [];
  const out = /* @__PURE__ */ new Set();
  for (const round of n.rounds) for (const g of round) if (g.winner) {
    for (const t of g.teams) if (t && t !== g.winner) out.add(t);
  }
  return Object.keys(n.seeds).filter((t) => !out.has(t));
}
function bracketSeg(c) {
  const { state, r, U } = c;
  const n = state.ncaa;
  if (!n) return null;
  const alive = aliveTeams(state).map((id) => state.teams[id]);
  const seed = (t) => n.seeds[t.id];
  const lines = [];
  if (alive.length >= 60) {
    const ones = alive.filter((t) => seed(t) === 1);
    lines.push(S(`The bracket is OUT, Dex! I've filled out eleven of them already.`), D(`How many have the same champion?`), S(`None. That's called diversification.`));
    if (ones.length) lines.push(D(`Your No. 1 seeds: ${ones.map((t) => t.school).join(", ")}.`));
    const cinderella = alive.filter((t) => seed(t) >= 11 && seed(t) <= 13).sort((a, b) => a.net - b.net)[0];
    if (cinderella) lines.push(S(`My Cinderella: No. ${seed(cinderella)} ${cinderella.school}. Sweet 16, minimum. Don't @ me.`, "hot"), D(`They're ${ord3(cinderella.net)} in the NET. That's not crazy, actually.`, "good"));
    const shaky = ones.sort((a, b) => b.net - a.net)[0];
    if (shaky) lines.push(S(`And ${shaky.school} goes down in the first weekend. Calling it.`, "hot"));
  } else if (alive.length === 2) {
    const [a, b] = alive;
    const sp = spread(state, a.id, b.id, true);
    const fav = sp >= 0 ? a : b, dog = fav === a ? b : a;
    lines.push(S(`It's the NATIONAL CHAMPIONSHIP, Dex! ${a.school} and ${b.school}! One game! All the marbles!`));
    lines.push(D(`My numbers have ${fav.school} by about ${Math.max(1, Math.round(Math.abs(sp)))}.`, "good"));
    lines.push(S(`${dog.school}. Gut call. My gut has been through a lot this season, but it's never been more sure.`, "hot"));
  } else {
    const low = alive.filter((t) => seed(t) >= 8).sort((a, b) => seed(b) - seed(a))[0];
    lines.push(D(alive.length === 4 ? `Final Four: ${alive.map((t) => t.school).join(", ")}.` : `${plural2(alive.length, "team")} left standing.`));
    if (low) lines.push(S(`And No. ${seed(low)} ${low.school} is still dancing! Somebody find that glass slipper!`), D(`Their next game is going to be very hard.`), S(`So was the last one, Dex!`));
    const favs = alive.sort((a, b) => seed(a) - seed(b) || a.net - b.net).slice(0, 2);
    if (favs.length === 2) lines.push(D(`The favorites by my numbers: ${favs[0].school} and ${favs[1].school}.`, "good"), S(r.pick([`Chalk is for sidewalks, Dex.`, `Boring. True, but boring.`])));
  }
  if (n.seeds[U.id] != null) {
    const out = !alive.some((t) => t.id === U.id);
    lines.push(out ? S(`And ${U.school}'s season is over. Tough way to go out. Hold your heads high.`) : D(`${U.school}, a No. ${n.seeds[U.id]} seed, is still alive.`));
    if (!out) lines.push(S(r.pick([`Cut down the nets, Coach ${c.coach.last}! I'll bring the ladder!`, `${U.school} is a team of destiny. I can feel it in my knees.`]), "hot"));
  } else if (state.phase !== "selection") {
    lines.push(D(`${U.school} isn't in the field this year.`), S(`Next year, Coach ${c.coach.last}. Next year.`));
  }
  head(c, alive.length >= 60 ? 6 : 5, alive.length >= 60 ? "Bracket reactions" : `${plural2(alive.length, "team")} left`);
  return { title: "Bracket Talk", icon: "\u{1F5C2}\uFE0F", lines };
}
function bubbleSeg(c) {
  const { state, U } = c;
  const nb = byNet(state);
  const bubble = nb.slice(38, 52).filter((t) => !t.apRank);
  if (!bubble.length) return null;
  const b = c.r.pick(bubble);
  const lines = [S(`It's Championship Week! ${b.school} is right on the bubble. They need to win two games or they're playing in the NIT.`, "hot"), D(`${ord3(b.net)} in the NET, ${rec(b)}. One win might do it. Might.`, "good")];
  const un = nb.findIndex((t) => t.id === U.id) + 1;
  if (un) lines.push(D(un <= 30 ? `${U.school} is ${ord3(un)} in the NET. They're dancing.` : un <= 55 ? `${U.school} is ${ord3(un)} in the NET. Sweaty.` : `${U.school} is ${ord3(un)} in the NET. They need the automatic bid.`), S(un <= 30 ? `Pack the bags!` : un <= 55 ? `I'm sweating for them, Dex. I'm sweating right now.` : `Win the conference tournament! It's that simple!`, un > 55 ? "hot" : void 0));
  head(c, 3, "Bubble watch");
  return { title: "Bubble Watch", icon: "\u{1FAE7}", lines };
}
function predictions(c) {
  const { state, r, U } = c;
  const top = ranked(state);
  const byPower = Object.values(state.teams).sort((a, b) => b.rating - a.rating);
  const dexTitle = byPower[0];
  const salPool = top.slice(1, 9);
  const salTitle = U.apRank && U.apRank <= 12 && r.chance(0.45) ? U : r.pick(salPool.length ? salPool : top);
  const sleepers = byPower.filter((t) => !t.apRank).slice(0, 15);
  const busts = top.slice(0, 15).map((t) => ({ t, gap: byPower.indexOf(t) + 1 - t.apRank })).sort((a, b) => b.gap - a.gap);
  const star = (t) => teamPlayers(state, t.id).sort((a, b) => b.ovr - a.ovr)[0];
  const best = top.slice(0, 10).map(star).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
  return {
    sal: { title: salTitle.id, sleeper: sleepers[r.int(4, Math.max(4, sleepers.length - 1))]?.id ?? sleepers[0]?.id, bust: top[r.int(0, 2)]?.id, poy: star(salTitle)?.id },
    dex: { title: dexTitle.id, sleeper: sleepers[0]?.id, bust: busts[0]?.t.id, poy: best[0]?.id }
  };
}
function previewEpisode(c, debut) {
  const { state, r, R, U, coach } = c;
  const segs = [introSeg(c, [S(`Season preview show! The polls are out, the takes are loaded, and I haven't slept.`), D(`Welcome to the ${seasonLabel(state.season)} preview edition of ${SHOW.name}. I'm Dex Holloway.`)], debut)];
  if (debut) segs[0].lines.push(D(`And since it's preseason, we're doing predictions. On the record. I'll grade them in April.`), S(`He's going to grade them, people. Like a teacher.`));
  const P2 = predictions(c);
  R.preds = { season: state.season, ...P2 };
  const T = (id) => id ? state.teams[id] : void 0;
  const Pn = (id) => id ? state.players[id] : void 0;
  const lines = [];
  const st = T(P2.sal.title), dt = T(P2.dex.title);
  lines.push(D(`Title picks. I'll go first: ${dt.school}. Best roster in the country by my numbers.`, "good"));
  lines.push(st.id === dt.id ? S(`Same! Don't make it weird.`) : st.id === U.id ? S(`${U.school}! Coach ${coach.last} cuts down the nets! I've never been more sure of anything.`, "hot") : S(`${st.school}. They're No. ${st.apRank ?? "\u2014"} in the poll and nobody believes in them. I believe.`, "hot"));
  const ss = T(P2.sal.sleeper), ds = T(P2.dex.sleeper);
  if (ss && ds) {
    lines.push(D(`Sleeper: ${ds.school}. Unranked, but the roster is legit.`, "good"));
    lines.push(S(ss.id === ds.id ? `Copycat! Fine. Same.` : `My sleeper is ${ss.school}. Mark my words. Sweet 16.`, ss.id === ds.id ? void 0 : "hot"));
  }
  const sb = T(P2.sal.bust), db = T(P2.dex.bust);
  if (sb && db) {
    lines.push(S(sb.apRank === 1 ? `Bust of the year: ${sb.school}. The No. 1 team in the preseason poll goes out in the first weekend.` : `Bust of the year: ${sb.school}. Ranked ${sb.apRank}, playing like ranked never.`, "hot"));
    lines.push(D(db.id === sb.id ? `I can't believe I agree with you.` : `I'll take ${db.school}. Ranked ${db.apRank}, and the numbers say that's generous.`, db.id === sb.id ? void 0 : "good"));
  }
  const sp = Pn(P2.sal.poy), dp = Pn(P2.dex.poy);
  if (sp && dp) {
    lines.push(D(`Player of the Year: ${nm2(dp)}, ${T(dp.teamId)?.school}.`));
    lines.push(S(sp.id === dp.id ? `Fine. Yes. Him.` : `${nm2(sp)}. ${T(sp.teamId)?.school}. He's going to have a SEASON.`, sp.id === dp.id ? void 0 : "hot"));
  }
  segs.push({ title: "Bold Predictions", icon: "\u{1F52E}", lines });
  head(c, 7, `${seasonLabel(state.season)} season preview`);
  const ul = [];
  const star = teamPlayers(state, U.id).sort((a, b) => b.ovr - a.ovr)[0];
  ul.push(D(`${U.school} ${U.apRank ? `opens at No. ${U.apRank}` : "is unranked to start the year"}. The AD's goal for Coach ${coach.last}: ${state.user.expectation.toLowerCase()}.`));
  ul.push(U.apRank && U.apRank <= 10 ? S(`Title or bust. Anything less and I'm calling in myself.`, "hot") : U.apRank ? S(`Ranked to start. I like it. I'll love it by Thanksgiving.`) : S(`Unranked? Disrespect! Remember this, ${U.mascot}. Remember who doubted you.`));
  if (star) ul.push(D(`Watch ${nm2(star)}, the ${describe(star)}. Best player on the roster.`), S(r.pick([`I've heard he dunks so hard the rim files a complaint.`, `${star.last}! Great name. Strong name. Sounds like a closer.`, `I've seen his highlight tape eleven times. Twelve. It's on in my car right now.`])));
  const mine = state.schedule.filter((g) => g.home === U.id || g.away === U.id);
  if (mine.length >= 20) {
    const exp = mine.reduce((sum, g) => sum + normCdf(spread(state, g.home, g.away, g.neutral) * (g.home === U.id ? 1 : -1) / 11), 0);
    const line = Math.round(exp * 2) / 2;
    ul.push(D(`My model projects ${f1(exp)} regular-season wins. Call it ${line}.`, "good"), S(r.pick([`Over. Smash the over.`, `Over. I always take the over. It's a lifestyle.`, line >= 22 ? `Under. Gasp! Yes, under. Somebody's gonna slip on a banana peel.` : `Over by five. Book it.`]), "hot"));
  }
  segs.push({ title: `${U.school} Preview`, icon: "\u{1F3E0}", lines: ul });
  const rs = rivalrySeg(c);
  if (rs) segs.push(rs);
  const rl = realignSeg(c);
  if (rl) segs.push(rl);
  const poll = ranked(state).slice(0, 5);
  if (poll.length === 5) segs.push({ title: "Preseason Top 5", icon: "\u{1F4CA}", lines: [D(`Your preseason top five: ${poll.map((t, i) => `${i + 1}. ${t.school}`).join(", ")}.`, "info"), S(r.pick([`I'd move ${poll[3].school} to No. 1 and I'd sleep like a baby.`, `${poll[0].school} at No. 1? In October? Bold, voters. Bold.`]), "hot")] });
  segs.push(outroSeg(c, [S(`Predictions are locked in. No take-backs.`), D(`I wrote them down. In pen.`)]));
  return segs;
}
function finaleEpisode(c) {
  const { state, r, R, U, coach } = c;
  const segs = [introSeg(c, [S(`The confetti's swept up, the nets are cut, and Big Sal is emotional.`), D(`Welcome to the season finale of ${SHOW.name}.`)])];
  const ch = state.champions.find((x) => x.season === state.season);
  if (ch) {
    const t = state.teams[ch.teamId], ru = state.teams[ch.runnerUp];
    const L = [S(`ONE SHINING MOMENT, Dex! ${t.school}! National champions!`), D(`${t.school} beat ${ru?.school ?? "their opponent"} ${ch.score} in the title game. ${rec(t)} on the year.`, "info")];
    L.push(t.id === U.id ? S(`${U.school}! Coach ${coach.last}! I'm crying on the air and I don't care who knows it!`) : S(r.pick([`Congratulations to them. I hate it. Congratulations.`, `They earned it. I'll say it once and never again.`])));
    segs.push({ title: "One Shining Moment", icon: "\u{1F3C6}", lines: L });
    head(c, 8, `${t.school} are national champions`);
  }
  const poy = state.awards.find((a) => a.season === state.season && a.name === "National Player of the Year");
  const P2 = R.preds?.season === state.season ? R.preds : void 0;
  if (P2) {
    const L = [D(`Time to grade the preseason predictions. I've been waiting all year.`), S(`I've been dreading it all year.`)];
    const finish = (id) => state.teams[id]?.history.find((h3) => h3.season === state.season);
    const how = (id) => {
      const h3 = finish(id);
      return !h3 ? "did something" : h3.postseason === "Champion" ? "won the whole thing" : h3.postseason ? `went out in the ${h3.postseason === "Runner-up" ? "title game" : h3.postseason}` : `went ${h3.w}-${h3.l} and missed the tournament`;
    };
    for (const who of ["sal", "dex"]) {
      const p = P2[who];
      const hit = ch && p.title === ch.teamId;
      const line = `${who === "sal" ? "Sal" : "Dex"} picked ${state.teams[p.title]?.school} to win it all. They ${how(p.title)}.`;
      L.push(who === "sal" ? D(line) : S(line));
      L.push(who === "sal" ? hit ? S(`NAILED IT! Get me a trophy! Get me two trophies!`) : S(r.pick([`I was a year early. Mark it down for next year.`, `Directionally correct.`])) : hit ? D(`The model was right. The model is always right.`) : D(`The model has been notified.`));
    }
    if (poy?.playerId) {
      const winner = poy.who ?? (state.players[poy.playerId] ? nm2(state.players[poy.playerId]) : "the winner");
      const sHit = P2.sal.poy === poy.playerId, dHit = P2.dex.poy === poy.playerId;
      L.push(D(`Player of the Year went to ${winner}. ${sHit && dHit ? "We both had him." : sHit ? "Sal had him. I did not." : dHit ? "I had him. Sal did not." : "Neither of us had him."}`));
      L.push(sHit ? S(`Write that in your spreadsheet, Professor! In BOLD!`) : S(`Awards are a popularity contest anyway.`));
    }
    segs.push({ title: "Grading Our Predictions", icon: "\u{1F4DD}", lines: L });
  }
  const h2 = U.history.find((x) => x.season === state.season);
  if (h2) {
    const grade = h2.postseason === "Champion" ? "A+" : DEEP2.includes(h2.postseason) ? "A" : ["Elite Eight", "Sweet 16"].includes(h2.postseason) ? "B+" : h2.ncaaSeed != null ? "B" : h2.w > h2.l ? "C" : h2.w * 2 > h2.l ? "D" : "F";
    const L = [D(`${U.school}'s season: ${h2.w}-${h2.l}${h2.postseason ? `, ${h2.postseason === "Champion" ? "national champions" : h2.postseason === "Runner-up" ? "national runner-up" : h2.postseason}` : ""}.`)];
    L.push(S(`My grade for Coach ${coach.last}: ${grade}.`, grade.startsWith("A") ? "good" : grade === "F" ? "hot" : void 0));
    L.push(grade.startsWith("A") ? D(`Hard to argue. Historic stuff.`) : grade === "F" ? D(`Harsh. Accurate, but harsh.`) : D(r.pick([`I'd say that's fair.`, `I'd go a half-grade higher. The numbers were better than the record.`])));
    segs.push({ title: `${U.school} Report Card`, icon: "\u{1F4CB}", lines: L });
  }
  const rl = realignSeg(c);
  if (rl) segs.push(rl);
  const [sw, sl] = R.record.sal, [dw, dl] = R.record.dex;
  const out = [];
  if (sw + sl + dw + dl > 0) {
    out.push(D(`Final lock standings: Dex ${dw}-${dl}, Sal ${sw}-${sl}.`));
    out.push(dw > sw ? S(`As per our bet, I'll be wearing a mascot costume on the portal show. Don't ask which mascot.`) : sw > dw ? S(`Dex has to read my takes in a British accent next week! Those are the rules!`) : S(`A tie! Nobody wins! America loses!`));
  }
  out.push(D(`Next up: the portal, the draft and signing day. We'll be here.`));
  segs.push(outroSeg(c, out));
  return segs;
}
function portalEpisode(c) {
  const { state, r, U, coach } = c;
  const segs = [introSeg(c, [S(`The portal is OPEN, Dex! It's the Wild West out there!`), D(`Welcome to the portal edition of ${SHOW.name}.`)])];
  const entries = Object.values(state.portal?.entries ?? {});
  const L = [];
  if (entries.length) {
    L.push(D(`${plural2(entries.length, "player")} in the portal already.`, "info"), S(`That's not a portal, that's a stampede.`));
    const best = entries.filter((e) => state.players[e.id]).sort((a, b) => a.rank - b.rank).slice(0, 2);
    const reacts = r.shuffle([`I'd give that kid my car. It's not a nice car, but it's a gesture.`, `Every coach in America just picked up the phone.`, `Somebody's collective is about to get very generous.`, `Come to my house, son. We have snacks.`]);
    best.forEach((e, i) => {
      const p = state.players[e.id], from = state.teams[e.from];
      L.push(D(i === 0 ? `The top name: ${nm2(p)} out of ${from?.school ?? "nowhere"}. Reason given: ${e.reason.toLowerCase()}.` : `Also out there: ${nm2(p)}, ${describe(p)}, from ${from?.school ?? "somewhere"}.`));
      L.push(S(reacts[i]));
    });
    const mine = entries.filter((e) => e.from === U.id);
    L.push(mine.length ? D(`${U.school} has ${plural2(mine.length, "player")} in the portal.`) : D(`Nobody from ${U.school} has entered. Yet.`));
    L.push(mine.length >= 3 ? S(`Coach ${coach.last} has to plug the holes. Get the shop vac!`, "hot") : S(`Good culture, Dex. You can't measure culture.`), D(`I could if they'd let me.`));
    head(c, 5, "The portal is open");
  } else {
    L.push(S(`Retention meetings are happening right now. Every coach in America is hugging somebody.`), D(`And making promises.`));
  }
  segs.push({ title: "Portal Madness", icon: "\u{1F501}", lines: L });
  const dec3 = state.offseason?.declared ?? [];
  if (dec3.length) {
    const top = dec3.map((id) => state.players[id]).filter((p) => p && p.draftStock && p.draftStock <= 14).slice(0, 2);
    if (top.length) segs.push({ title: "Leaving Early", icon: "\u{1F393}", lines: [D(`Early entries headed for the draft include ${top.map((p) => `${nm2(p)} of ${schoolOf(state, p)?.school ?? "his school"}`).join(" and ")}.`, "info"), S(`Go get your money, young men. Buy your mother a house. Buy me a sandwich.`)] });
  }
  segs.push(hotlineSeg(c));
  segs.push(outroSeg(c));
  return segs;
}
function signingEpisode(c) {
  const { state, r, U, coach } = c;
  const segs = [introSeg(c, [S(`Signing Day! The fax machines are humming!`), D(`Nobody uses fax machines, Sal.`), S(`In my heart they do.`)])];
  const cr = classRankings(state);
  const L = [];
  if (cr.length >= 3) {
    L.push(D(`Final class rankings: 1. ${state.teams[cr[0].teamId].school}, 2. ${state.teams[cr[1].teamId].school}, 3. ${state.teams[cr[2].teamId].school}.`, "info"));
    L.push(S(r.pick([`${state.teams[cr[0].teamId].school} is going to be a problem for the next four years. Or one. These days, one.`, `Rankings schmankings. Show me who can guard a ball screen.`])));
    const mi = cr.findIndex((x) => x.teamId === U.id);
    L.push(mi >= 0 ? D(`${U.school} finished with the No. ${mi + 1} class.`) : D(`${U.school} didn't sign anyone in this class.`));
    L.push(mi >= 0 && mi < 10 ? S(`Top ten! Coach ${coach.last} can RECRUIT, people!`) : mi >= 0 && mi < 30 ? S(`Solid. Not flashy. Like a good pair of sneakers.`) : S(`There's always the portal, Coach ${coach.last}. There's ALWAYS the portal.`, "hot"));
    const top = Object.values(state.recruits).filter((x) => x.committed).sort((a, b) => a.rank - b.rank)[0];
    if (top) L.push(D(`The No. 1 recruit in the country, ${top.first} ${top.last}, signed with ${state.teams[top.committed]?.school}.`), S(`Generational. I've never seen him play, but generational.`, "bad"));
    head(c, 5, "Signing Day special");
  }
  if (!L.length) L.push(S(`Quiet signing day. I refreshed my phone four hundred times.`), D(`Four hundred and twelve.`));
  head(c, 4, "Signing Day special");
  segs.push({ title: "Signing Day", icon: "\u270D\uFE0F", lines: L });
  segs.push(outroSeg(c));
  return segs;
}
function draftEpisode(c) {
  const { state, r, U } = c;
  const segs = [introSeg(c, [S(`Draft night, baby! Handshakes, hugs and very large suits!`), D(`Welcome to the draft edition of ${SHOW.name}.`)])];
  const picks = state.draft.filter((d) => d.season === state.season || d.season === state.season + 1).sort((a, b) => a.pick - b.pick);
  const L = [];
  if (picks.length) {
    const one = picks[0];
    L.push(D(`With the first pick, ${one.name} out of ${state.teams[one.teamId]?.school ?? "college"}, to ${one.nbaTeam}.`, "info"));
    L.push(S(r.pick([`Can't-miss prospect. I said that about my last three cars, but this time I mean it.`, `Great pick. Great kid. Great suit.`])));
    const mine = picks.filter((p) => p.teamId === U.id);
    L.push(mine.length ? D(`${U.school} had ${plural2(mine.length, "player")} drafted: ${mine.map((p) => `${p.name} at No. ${p.pick}`).join(", ")}.`) : D(`Nobody from ${U.school} heard their name this year.`));
    L.push(mine.length ? S(`That's a pipeline! Recruits, are you listening?`) : S(`Next year. Develop 'em, Coach.`));
    const byTeam = {};
    for (const p of picks.filter((x) => x.round === 1)) byTeam[p.teamId] = (byTeam[p.teamId] ?? 0) + 1;
    const fact = Object.entries(byTeam).sort((a, b) => b[1] - a[1])[0];
    if (fact && fact[1] >= 2) L.push(D(`${state.teams[fact[0]]?.school} had ${fact[1]} first-rounders.`, "info"), S(`Show-offs.`));
    head(c, 5, "Draft night");
  }
  segs.push({ title: "Draft Night", icon: "\u{1F3A9}", lines: L.length ? L : [S(`Draft's done. I cried twice. Once for joy.`)] });
  segs.push(outroSeg(c, [D(`That's it for the season, folks. We're off for the summer.`), S(`I'll be at the beach. Working on my takes. And my tan.`)]));
  return segs;
}
var DEEP2 = ["Final Four", "Runner-up", "Champion"];
function weeklyEpisode(c, debut) {
  const { state, r } = c;
  const segs = [introSeg(c, void 0, debut)];
  const add = (s) => {
    if (s && s.lines.length) segs.push(s);
  };
  if (state.phase === "selection" || state.phase === "ncaa") {
    add(bracketSeg(c));
    add(recapSeg(c));
    add(yoursSeg(c));
    add(rivalrySeg(c));
    add(spotlightSeg(c));
    add(hotlineSeg(c));
    add(locksSeg(c));
  } else {
    add(pollSeg(c));
    add(state.phase === "confTourney" ? bubbleSeg(c) : recapSeg(c));
    add(yoursSeg(c));
    add(rivalrySeg(c));
    const rotating = r.shuffle([() => spotlightSeg(c), () => hotlineSeg(c), () => triviaSeg(c), () => recruitingSeg(c), () => recapSeg(c)].slice(0, state.phase === "confTourney" ? 5 : 4));
    let n = 0;
    for (const f of rotating) {
      if (n >= 2) break;
      const s = f();
      if (s && s.lines.length && !segs.some((x) => x.title === s.title)) {
        segs.push(s);
        n++;
      }
    }
    if (!segs.some((s) => s.title === "Hot Take Hotline") && r.chance(0.6)) add(hotlineSeg(c));
    add(locksSeg(c));
  }
  segs.push(outroSeg(c));
  return segs;
}
var TITLE_FALLBACK = ["Takes, Takes and More Takes", "Sal Has Concerns", "The Professor Is In", "Phone Lines Are Open", "Nobody Asked, We Answered", "Big Sal vs. The Spreadsheet", "Overreaction Monday", "Hold My Spreadsheet"];
function airEpisode(state, kind, opts = {}) {
  const R = radioState(state);
  if (R.recordSeason !== state.season) {
    R.recordSeason = state.season;
    R.record = { sal: [0, 0], dex: [0, 0] };
  }
  const no = R.aired + 1;
  const r = new RNG(`radio:${state.user.teamId}:${state.season}:${state.day}:${no}:${kind}`);
  const c = { state, r, R, U: state.teams[state.user.teamId], coach: state.coaches[state.user.coachId], heads: [], ep: no };
  const segments = kind === "preview" ? previewEpisode(c, !!opts.debut) : kind === "finale" ? finaleEpisode(c) : kind === "portal" ? portalEpisode(c) : kind === "signing" ? signingEpisode(c) : kind === "draft" ? draftEpisode(c) : weeklyEpisode(c, !!opts.debut);
  if (opts.debut && kind !== "preview" && kind !== "weekly") segments[0].lines.unshift(S(`Hello, hello! This is the first-ever episode of ${SHOW.name} on ${SHOW.station}. I'm Big Sal!`), D(`And I'm Dex Holloway. They gave us a radio show, Sal.`));
  const best = c.heads.sort((a, b) => b.p - a.p)[0];
  const title = opts.debut ? "The First Episode" : best?.t ?? r.pick(TITLE_FALLBACK);
  const cal = state.calendar[state.day];
  const ep = {
    id: `fcf${state.season}-${no}`,
    no,
    kind,
    season: state.season,
    day: state.day,
    date: IN_SEASON4.includes(state.phase) ? cal?.label ?? "" : seasonLabel(state.season),
    phase: state.phase,
    title,
    segments
  };
  R.episodes.unshift(ep);
  if (R.episodes.length > KEEP) R.episodes.length = KEEP;
  R.aired = no;
  R.lastDay = IN_SEASON4.includes(state.phase) ? state.day : 0;
  return ep;
}
function radioWeekly(state) {
  if (!IN_SEASON4.includes(state.phase) || state.day <= 0) return;
  airEpisode(state, "weekly");
}
function radioOffseason(state, before) {
  const now = state.phase;
  const last = state.radio?.episodes[0];
  const already = (k) => last?.kind === k && last.season === state.season;
  if (now === "portal" && (state.portal?.day ?? 0) >= 1 && !already("portal")) airEpisode(state, "portal");
  else if (now === "draft" && before !== "draft" && !already("draft")) airEpisode(state, "draft");
  else if (now === "preseason" && before !== "preseason") airEpisode(state, "preview");
}

// src/engine/pstats.ts
var IN_SEASON5 = ["preseason", "regular", "confTourney", "selection", "ncaa"];
var FIELDS = ["s", "wk", "w1", "hi", "pre", "rw", "rl", "hw", "hl", "aw", "al", "nw", "nl", "pf", "pa", "st", "tw", "tl", "ctw", "ctl", "bm", "bo", "cr"];
var NULLABLE = /* @__PURE__ */ new Set(["hi", "pre", "cr"]);
function enc(x) {
  return FIELDS.map((k) => x[k] ?? null);
}
function dec(a) {
  const o = {};
  FIELDS.forEach((k, i) => {
    o[k] = a[i] ?? (NULLABLE.has(k) ? null : k === "bo" ? "" : 0);
  });
  return o;
}
function pstatsState(state) {
  return state.pstats ??= { since: state.season, seasons: {}, exits: {}, h2h: { coach: {}, team: {} } };
}
function progSeasons(state, teamId) {
  return (state.pstats?.seasons[teamId] ?? []).map(dec);
}
function liveExtras(state) {
  const polls = state.polls.filter((p) => p.week !== 99).sort((a, b) => a.day - b.day);
  const finalPoll2 = state.polls.find((p) => p.week === 99);
  const rankMaps = polls.map((p) => new Map(p.ranks.map((id, i) => [id, i + 1])));
  const preIdx = polls.findIndex((p) => /Preseason/i.test(p.label));
  const rankAt = (teamId, day) => {
    let idx = -1;
    for (let i = 0; i < polls.length; i++) if (polls[i].day <= day) idx = i;
    else break;
    return idx >= 0 ? rankMaps[idx].get(teamId) ?? null : null;
  };
  const games = {};
  for (const g of state.schedule) {
    if (!g.played || g.hs == null || g.as == null) continue;
    (games[g.home] ??= []).push(g);
    (games[g.away] ??= []).push(g);
  }
  const out = {};
  for (const t of Object.values(state.teams)) {
    const x = { s: state.season, wk: 0, w1: 0, hi: null, pre: null, rw: 0, rl: 0, hw: t.record.hw, hl: t.record.hl, aw: t.record.aw, al: t.record.al, nw: t.record.nw, nl: t.record.nl, pf: t.record.pf, pa: t.record.pa, st: 0, tw: 0, tl: 0, ctw: 0, ctl: 0, bm: 0, bo: "", cr: null };
    rankMaps.forEach((m) => {
      const r = m.get(t.id);
      if (!r) return;
      x.wk++;
      if (r === 1) x.w1++;
      x.hi = x.hi == null ? r : Math.min(x.hi, r);
    });
    if (preIdx >= 0) x.pre = rankMaps[preIdx].get(t.id) ?? null;
    const fr = finalPoll2?.ranks.indexOf(t.id) ?? -1;
    if (fr >= 0) x.hi = x.hi == null ? fr + 1 : Math.min(x.hi, fr + 1);
    let run = 0;
    for (const g of (games[t.id] ?? []).sort((a, b) => a.day - b.day)) {
      const home = g.home === t.id;
      const us = home ? g.hs : g.as, them = home ? g.as : g.hs;
      const won = us > them;
      const opp = home ? g.away : g.home;
      if (rankAt(opp, g.day)) {
        if (won) x.rw++;
        else x.rl++;
      }
      if (g.type === "ncaa") {
        if (won) x.tw++;
        else x.tl++;
      }
      if (g.type === "ctourn") {
        if (won) x.ctw++;
        else x.ctl++;
      }
      run = won ? run + 1 : 0;
      x.st = Math.max(x.st, run);
      if (won && us - them > x.bm) {
        x.bm = us - them;
        x.bo = opp;
      }
    }
    out[t.id] = x;
  }
  return out;
}
function finalizeProgramSeason(state) {
  const P2 = pstatsState(state);
  const userTeam = state.user.teamId;
  if ((P2.seasons[userTeam] ?? []).some((a) => a[0] === state.season)) return;
  const live = liveExtras(state);
  for (const [id, x] of Object.entries(live)) (P2.seasons[id] ??= []).push(enc(x));
  for (const g of state.schedule) {
    if (!g.played || g.hs == null || g.as == null || g.home !== userTeam && g.away !== userTeam) continue;
    const opp = g.home === userTeam ? g.away : g.home;
    const won = g.home === userTeam ? g.hs > g.as : g.as > g.hs;
    const ct = P2.h2h.team[opp] ??= [0, 0];
    ct[won ? 0 : 1]++;
    const oc = state.teams[opp]?.coachId;
    if (oc) {
      const cc = P2.h2h.coach[oc] ??= [0, 0];
      cc[won ? 0 : 1]++;
    }
  }
}
function recordClassRanks(state) {
  const P2 = pstatsState(state);
  classRankings(state).forEach((c, i) => {
    const list2 = P2.seasons[c.teamId];
    const row = list2?.find((a) => a[0] === state.season);
    if (row) row[FIELDS.indexOf("cr")] = i + 1;
  });
}
function coachExit(state, c, status, teamId) {
  const P2 = pstatsState(state);
  P2.exits[c.id] = { id: c.id, first: c.first, last: c.last, age: c.age, archetype: c.archetype, status, lastTeam: teamId, until: state.season, careerW: c.careerW, careerL: c.careerL };
}
var NCAA_WINS = { "First Four": 0, "Round of 64": 0, "Round of 32": 1, "Sweet 16": 2, "Elite Eight": 3, "Final Four": 4, "Runner-up": 5, Champion: 6 };
var S16 = ["Sweet 16", "Elite Eight", "Final Four", "Runner-up", "Champion"];
var F4 = ["Final Four", "Runner-up", "Champion"];
var POST_PTS = { Champion: 40, "Runner-up": 24, "Final Four": 16, "Elite Eight": 9, "Sweet 16": 5, "Round of 32": 2.5, "Round of 64": 1, "First Four": 0.5 };
function seasonScore(h2) {
  return (POST_PTS[h2.postseason] ?? 0) + (h2.ncaaSeed != null ? 1 : 0) + (h2.confChamp ? 4 : 0) + (h2.confTourneyChamp ? 2 : 0) + (h2.apFinal ? h2.apFinal <= 10 ? 3 : 1 : 0) + (h2.w - h2.l) * 0.12;
}
var TIERS = [
  { min: 260, label: "Legend", cls: "gold" },
  { min: 140, label: "Hall of Famer", cls: "gold" },
  { min: 100, label: "Elite", cls: "accent" },
  { min: 45, label: "Proven", cls: "blue" },
  { min: 15, label: "Rising", cls: "good" },
  { min: -Infinity, label: "Unproven", cls: "" }
];
var tierOf = (score) => TIERS.find((t) => score >= t.min);
function coachSummaries(state) {
  const P2 = state.pstats;
  const inSeason = IN_SEASON5.includes(state.phase);
  const byCoach = {};
  const coachOf = {};
  const coy = new Set(state.awards.filter((a) => a.name === "Coach of the Year" && a.coachId).map((a) => `${a.coachId}:${a.season}`));
  for (const t of Object.values(state.teams)) {
    for (const h2 of t.history) {
      if (!h2.coachId) continue;
      coachOf[`${t.id}:${h2.season}`] = h2.coachId;
      (byCoach[h2.coachId] ??= []).push({ season: h2.season, teamId: t.id, h: h2, coy: coy.has(`${h2.coachId}:${h2.season}`) });
    }
    if (inSeason && t.coachId && t.record.w + t.record.l > 0 && !t.history.some((h2) => h2.season === state.season)) {
      (byCoach[t.coachId] ??= []).push({ season: state.season, teamId: t.id, live: true, coy: false, h: { season: state.season, w: t.record.w, l: t.record.l, cw: t.record.cw, cl: t.record.cl, confFinish: 0, confChamp: false, confTourneyChamp: false, ncaaSeed: null, postseason: "", apFinal: null, coachId: t.coachId, rating: t.rating } });
      coachOf[`${t.id}:${state.season}`] = t.coachId;
    }
  }
  const draft = {};
  for (const d of state.draft) {
    const c = coachOf[`${d.teamId}:${d.season - 1}`];
    if (!c) continue;
    const e = draft[c] ??= { n: 0, first: 0 };
    e.n++;
    if (d.round === 1) e.first++;
  }
  const players = {};
  for (const a of state.awards) {
    if (!a.playerId) continue;
    const c = coachOf[`${a.teamId}:${a.season}`];
    if (!c) continue;
    const e = players[c] ??= { aa: 0, poy: 0 };
    if (a.name.startsWith("All-American")) e.aa++;
    if (a.name === "National Player of the Year") e.poy++;
  }
  const cache = /* @__PURE__ */ new Map();
  const seasonsOf = (teamId) => {
    let v2 = cache.get(teamId);
    if (!v2) {
      v2 = progSeasons(state, teamId);
      cache.set(teamId, v2);
    }
    return v2;
  };
  const ids = /* @__PURE__ */ new Set([...Object.keys(state.coaches).filter((id) => state.coaches[id].teamId || state.coaches[id].isUser), ...Object.keys(P2?.exits ?? {})]);
  const out = [];
  for (const id of ids) {
    const c = state.coaches[id];
    const ex = c ? void 0 : P2?.exits[id];
    if (!c && !ex) continue;
    const rows = (byCoach[id] ?? []).sort((a, b) => a.season - b.season);
    const S2 = {
      id,
      first: c?.first ?? ex.first,
      last: c?.last ?? ex.last,
      age: c?.age ?? ex.age,
      archetype: c?.archetype ?? ex.archetype,
      coach: c,
      exit: ex,
      isUser: !!c?.isUser,
      active: !!c,
      teamId: c?.teamId ?? null,
      status: c ? c.teamId ? state.teams[c.teamId]?.school ?? "" : "Free agent" : `${ex.status === "retired" ? "Retired" : "Fired"} ${ex.until + 1}`,
      rows,
      seasons: rows.length,
      w: 0,
      l: 0,
      pct: 0,
      careerW: c?.careerW ?? ex.careerW,
      careerL: c?.careerL ?? ex.careerL,
      preW: 0,
      preL: 0,
      cw: 0,
      cl: 0,
      regTitles: 0,
      tournTitles: 0,
      bids: 0,
      ncaaW: 0,
      ncaaL: 0,
      s16: 0,
      f4: 0,
      titles: 0,
      coy: rows.filter((r) => r.coy).length,
      draft: draft[id]?.n ?? 0,
      firstRd: draft[id]?.first ?? 0,
      aa: players[id]?.aa ?? 0,
      poy: players[id]?.poy ?? 0,
      schools: [...new Set(rows.map((r) => r.teamId))],
      best: null,
      score: 0,
      tier: "",
      rep: c ? c.reputation : null
    };
    for (const r of rows) {
      const h2 = r.h;
      S2.w += h2.w;
      S2.l += h2.l;
      S2.cw += h2.cw;
      S2.cl += h2.cl;
      if (r.live) {
        S2.score += (h2.w - h2.l) * 0.12;
        continue;
      }
      if (h2.confChamp) S2.regTitles++;
      if (h2.confTourneyChamp) S2.tournTitles++;
      if (h2.ncaaSeed != null) {
        S2.bids++;
        const x = seasonsOf(r.teamId).find((y) => y.s === h2.season);
        S2.ncaaW += x ? x.tw : NCAA_WINS[h2.postseason] ?? 0;
        S2.ncaaL += x ? x.tl : h2.postseason === "Champion" ? 0 : 1;
      }
      if (S16.includes(h2.postseason)) S2.s16++;
      if (F4.includes(h2.postseason)) S2.f4++;
      if (h2.postseason === "Champion") S2.titles++;
      S2.score += seasonScore(h2);
      if (!S2.best || seasonScore(h2) > seasonScore(S2.best.h)) S2.best = r;
    }
    S2.pct = S2.w + S2.l ? S2.w / (S2.w + S2.l) : 0;
    S2.preW = Math.max(0, S2.careerW - S2.w);
    S2.preL = Math.max(0, S2.careerL - S2.l);
    S2.score += S2.coy * 6 + S2.poy * 3 + S2.firstRd * 0.6 + Math.max(0, S2.preW * 0.1 - S2.preL * 0.05);
    S2.score = Math.round(S2.score * 10) / 10;
    S2.tier = tierOf(S2.score).label;
    out.push(S2);
  }
  return out;
}

// src/engine/awards.ts
function playerScore(p) {
  const g = Math.max(1, p.stats.gp);
  const s = p.stats;
  return (s.pts + (s.orb + s.drb) * 0.8 + s.ast * 1.1 + s.stl * 1.6 + s.blk * 1.4 - s.tov * 0.9 - (s.fga - s.fgm) * 0.45 - (s.fta - s.ftm) * 0.3) / g;
}
var f12 = (n) => n.toFixed(1);
var CLS2 = { FR: "Freshman", SO: "Sophomore", JR: "Junior", SR: "Senior", GR: "Grad" };
function statLine2(p) {
  const g = Math.max(1, p.stats.gp), s = p.stats;
  return `${f12(s.pts / g)} ppg \xB7 ${f12((s.orb + s.drb) / g)} rpg \xB7 ${f12(s.ast / g)} apg`;
}
function nomP(state, p, line, sub) {
  const t = state.teams[p.teamId];
  return { kind: "player", id: p.id, name: `${p.first} ${p.last}`, teamId: p.teamId, line: line ?? statLine2(p), sub: sub ?? `${CLS2[p.cls] ?? p.cls} ${p.pos} \xB7 ${t?.school ?? ""}`, num: p.num };
}
function runAwards(state) {
  const awards = [];
  const cats = [];
  const season = state.season;
  const all = Object.values(state.players).filter((p) => p.teamId && p.stats.gp >= 15);
  const teamBonus = (p) => {
    const t = state.teams[p.teamId];
    return t.rating * 0.12 + (t.apRank ? (26 - t.apRank) * 0.06 : 0);
  };
  const ranked2 = [...all].sort((a, b) => playerScore(b) + teamBonus(b) - (playerScore(a) + teamBonus(a)));
  const add = (name2, p) => {
    awards.push({ season, name: name2, playerId: p.id, teamId: p.teamId, who: `${p.first} ${p.last}` });
    p.awards.push(`${name2} (${seasonLabel(season)})`);
  };
  const cat = (key, title, icon, blurb, nominees, marquee = false) => {
    if (nominees.length) cats.push({ key, title, icon, blurb, nominees, winner: 0, marquee });
  };
  const ppg2 = (p) => p.stats.pts / Math.max(1, p.stats.gp);
  const lastLine2 = (p) => {
    const l = p.career[p.career.length - 1];
    return l && l.season === season - 1 && l.gp >= 10 ? l : void 0;
  };
  if (ranked2[0]) add("National Player of the Year", ranked2[0]);
  ranked2.slice(0, 5).forEach((p) => add("All-American First Team", p));
  ranked2.slice(5, 10).forEach((p) => add("All-American Second Team", p));
  ranked2.slice(10, 15).forEach((p) => add("All-American Third Team", p));
  const frs = ranked2.filter((p) => p.cls === "FR").slice(0, 4);
  if (frs[0]) add("Freshman of the Year", frs[0]);
  cat("fr", "Freshman of the Year", "\u{1F331}", "The best first-year player in the country.", frs.map((p) => nomP(state, p)));
  const bench = all.filter((p) => p.stats.gs / Math.max(1, p.stats.gp) <= 0.3 && ppg2(p) >= 6).sort((a, b) => playerScore(b) - playerScore(a)).slice(0, 4);
  if (bench[0]) add("Sixth Man of the Year", bench[0]);
  cat("sixth", "Sixth Man of the Year", "\u{1FA91}", "Came off the bench and changed games anyway.", bench.map((p) => nomP(state, p, `${statLine2(p)} \xB7 ${p.stats.gs} starts`)));
  const lineScore = (l) => (l.pts + (l.orb + l.drb) * 0.8 + l.ast * 1.1 + l.stl * 1.6 + l.blk * 1.4 - l.tov * 0.9 - (l.fga - l.fgm) * 0.45 - (l.fta - l.ftm) * 0.3) / Math.max(1, l.gp);
  const mip = all.map((p) => ({ p, l: lastLine2(p) })).filter((x) => x.l).map((x) => ({ ...x, d: playerScore(x.p) - lineScore(x.l) })).filter((x) => x.d > 2).sort((a, b) => b.d - a.d).slice(0, 4);
  if (mip[0]) add("Most Improved Player", mip[0].p);
  cat("mip", "Most Improved Player", "\u{1F4C8}", "The biggest jump from last season to this one.", mip.map((x) => nomP(state, x.p, `${f12(x.l.pts / Math.max(1, x.l.gp))} \u2192 ${f12(ppg2(x.p))} ppg`, `${CLS2[x.p.cls] ?? x.p.cls} ${x.p.pos} \xB7 ${state.teams[x.p.teamId].school}`)));
  const transfers = all.filter((p) => {
    const l = lastLine2(p);
    return l && l.teamId !== p.teamId;
  }).sort((a, b) => playerScore(b) + teamBonus(b) - (playerScore(a) + teamBonus(a))).slice(0, 4);
  if (transfers[0]) add("Transfer of the Year", transfers[0]);
  cat("transfer", "Transfer of the Year", "\u{1F501}", "New school, new jersey, same buckets.", transfers.map((p) => nomP(state, p, statLine2(p), `${state.teams[p.teamId].school} \xB7 from ${state.teams[lastLine2(p).teamId]?.school ?? "another school"}`)));
  const dScore = (p) => p.stats.stl * 1.5 + p.stats.blk * 1.6 + p.ratings.perD * 0.15 + p.ratings.intD * 0.15;
  const dpoy = [...all].sort((a, b) => dScore(b) - dScore(a)).slice(0, 4);
  if (dpoy[0]) add("Defensive Player of the Year", dpoy[0]);
  cat("dpoy", "Defensive Player of the Year", "\u{1F6E1}\uFE0F", "Nobody wanted to see him on the other end.", dpoy.map((p) => nomP(state, p, `${f12(p.stats.stl / Math.max(1, p.stats.gp))} spg \xB7 ${f12(p.stats.blk / Math.max(1, p.stats.gp))} bpg \xB7 ${f12((p.stats.orb + p.stats.drb) / Math.max(1, p.stats.gp))} rpg`)));
  const games = new Map(state.schedule.map((g) => [g.id, g]));
  const perfs = [];
  for (const [gid, box] of Object.entries(state.boxScores)) {
    const g = games.get(gid);
    if (!g || !g.played) continue;
    box.players.forEach((side, i) => {
      for (const b of side) {
        const p = state.players[b.id];
        if (!p || !p.teamId) continue;
        const reb = b.orb + b.drb;
        perfs.push({ p, pts: b.pts, reb, ast: b.ast, gs: b.pts + reb * 0.7 + b.ast * 0.8 + b.stl + b.blk - b.tov * 0.7, g, opp: i === 0 ? g.away : g.home });
      }
    });
  }
  const seen = /* @__PURE__ */ new Set();
  const topPerf = perfs.sort((a, b) => b.gs - a.gs).filter((x) => seen.has(x.p.id) ? false : (seen.add(x.p.id), true)).slice(0, 4);
  if (topPerf[0]) add("Performance of the Year", topPerf[0].p);
  cat("perf", "Performance of the Year", "\u{1F4A5}", "One night. One stat line. Everybody saw it.", topPerf.map((x) => nomP(state, x.p, `${x.pts} pts \xB7 ${x.reb} reb \xB7 ${x.ast} ast`, `vs ${state.teams[x.opp]?.school ?? ""}${x.g.type === "ncaa" ? " \xB7 NCAA Tournament" : ""} \xB7 ${state.calendar[x.g.day]?.label.split(" \xB7 ")[0] ?? ""}`)).map((n2, i) => ({ ...n2, oppId: topPerf[i].opp })));
  const n = state.ncaa;
  if (n) {
    const ups = n.rounds.flat().filter((bg) => bg.winner && bg.teams[0] && bg.teams[1]).map((bg) => {
      const w = bg.winner, l = bg.teams.find((t) => t !== w);
      return { bg, w, l, d: (n.seeds[w] ?? 0) - (n.seeds[l] ?? 0) };
    }).filter((x) => x.d >= 4).sort((a, b) => b.d - a.d || b.bg.round - a.bg.round).slice(0, 4);
    const score = (x) => {
      const sc2 = x.bg.score;
      if (!sc2) return "";
      const wi = x.bg.teams.indexOf(x.w);
      return `${sc2[wi]}-${sc2[1 - wi]}`;
    };
    if (ups[0]) awards.push({ season, name: "Upset of the Year", teamId: ups[0].w, who: `No. ${n.seeds[ups[0].w]} ${state.teams[ups[0].w].school} over No. ${n.seeds[ups[0].l]} ${state.teams[ups[0].l].school}` });
    cat("upset", "Upset of the Year", "\u{1F92F}", "Brackets everywhere, ruined.", ups.map((x) => ({
      kind: "game",
      id: x.bg.id,
      teamId: x.w,
      oppId: x.l,
      name: `No. ${n.seeds[x.w]} ${state.teams[x.w].school}`,
      line: `beat No. ${n.seeds[x.l]} ${state.teams[x.l].school} ${score(x)}`,
      sub: `NCAA Tournament \xB7 ${NCAA_ROUND_NAMES[x.bg.round] ?? "March"}`
    })));
  }
  const gScore = (g) => {
    const m = Math.abs((g.hs ?? 0) - (g.as ?? 0));
    const box = state.boxScores[g.id];
    const comeback = box ? (g.hs ?? 0) > (g.as ?? 0) ? box.largestLead[1] : box.largestLead[0] : 0;
    return (g.type === "ncaa" ? 10 + (g.round ?? 0) * 3 : g.type === "ctourn" ? 4 : box ? 3 : 0) + (g.ot ? 3 + 2 * g.ot : 0) + (m <= 1 ? 5 : m <= 3 ? 3 : m <= 5 ? 1 : 0) + comeback / 4;
  };
  const best = state.schedule.filter((g) => g.played && g.hs != null && (Math.abs(g.hs - (g.as ?? 0)) <= 5 || g.ot) && (g.type === "ncaa" || g.type === "ctourn" || state.boxScores[g.id])).sort((a, b) => gScore(b) - gScore(a)).slice(0, 4);
  if (best.length) {
    const desc = (g) => {
      const hw = (g.hs ?? 0) > (g.as ?? 0);
      const w = hw ? g.home : g.away, l = hw ? g.away : g.home;
      const box = state.boxScores[g.id];
      const cb = box ? hw ? box.largestLead[1] : box.largestLead[0] : 0;
      return { w, l, ws: Math.max(g.hs ?? 0, g.as ?? 0), ls: Math.min(g.hs ?? 0, g.as ?? 0), cb };
    };
    const d0 = desc(best[0]);
    awards.push({ season, name: "Game of the Year", teamId: d0.w, who: `${state.teams[d0.w].school} ${d0.ws}, ${state.teams[d0.l].school} ${d0.ls}${best[0].ot ? " (OT)" : ""}` });
    cat("game", "Game of the Year", "\u{1F3AC}", "The one you\u2019ll be telling people about.", best.map((g) => {
      const d = desc(g);
      return {
        kind: "game",
        id: g.id,
        teamId: d.w,
        oppId: d.l,
        name: `${state.teams[d.w].school} ${d.ws}, ${state.teams[d.l].school} ${d.ls}${g.ot ? ` (${g.ot > 1 ? `${g.ot}OT` : "OT"})` : ""}`,
        line: g.event ?? (g.type === "conf" ? "Conference play" : g.type === "ncaa" ? "NCAA Tournament" : "Regular season"),
        sub: d.cb >= 8 ? `${state.teams[d.w].school} came back from ${d.cb} down` : `${state.calendar[g.day]?.label.split(" \xB7 ")[0] ?? ""}`
      };
    }));
  }
  const teams = Object.values(state.teams);
  const coyScore = (t) => (t.record.w - t.record.l) * 0.6 + (t.rating - (t.power - 65) * 1.15);
  const coys = [...teams].filter((t) => state.coaches[t.coachId]).sort((a, b) => coyScore(b) - coyScore(a)).slice(0, 4);
  if (coys[0]) {
    const cc = state.coaches[coys[0].coachId];
    awards.push({ season, name: "Coach of the Year", coachId: coys[0].coachId, teamId: coys[0].id, who: `${cc.first} ${cc.last}` });
  }
  cat("coy", "Coach of the Year", "\u{1F9E2}", "Did the most with what he had.", coys.map((t) => {
    const c = state.coaches[t.coachId];
    return { kind: "coach", id: c.id, name: `${c.first} ${c.last}`, teamId: t.id, age: c.age, line: `${t.record.w}-${t.record.l}${t.apRank ? ` \xB7 No. ${t.apRank} in the final poll` : ""}`, sub: t.school };
  }));
  for (const c of state.conferences) {
    const b = ranked2.find((p) => state.teams[p.teamId].conf === c.id);
    if (b) add(`${c.short} Player of the Year`, b);
  }
  if (n?.champion) {
    const champs = teamPlayers(state, n.champion).filter((p) => p.stats.gp > 0).sort((a, b) => playerScore(b) - playerScore(a)).slice(0, 3);
    if (champs[0]) add("Final Four Most Outstanding Player", champs[0]);
    cat("mop", "Final Four Most Outstanding Player", "\u{1F3C6}", `The star of ${state.teams[n.champion].school}'s title run.`, champs.map((p) => nomP(state, p)));
  }
  cat("poy", "National Player of the Year", "\u{1F451}", "The best player in college basketball.", ranked2.slice(0, 4).map((p) => nomP(state, p, statLine2(p), `${CLS2[p.cls] ?? p.cls} ${p.pos} \xB7 ${state.teams[p.teamId].school}${state.teams[p.teamId].apRank ? ` (No. ${state.teams[p.teamId].apRank})` : ""}`)), true);
  const show = {
    season,
    categories: cats,
    allAmerica: { first: ranked2.slice(0, 5).map((p) => nomP(state, p)), second: ranked2.slice(5, 10).map((p) => nomP(state, p)), third: ranked2.slice(10, 15).map((p) => nomP(state, p)) },
    hof: []
  };
  return { awards, show };
}
var P_WEIGHTS = {
  "National Player of the Year": 40,
  "All-American First Team": 15,
  "All-American Second Team": 8,
  "All-American Third Team": 5,
  "Final Four Most Outstanding Player": 12,
  "Defensive Player of the Year": 8,
  "Freshman of the Year": 4,
  "Sixth Man of the Year": 3,
  "Most Improved Player": 2,
  "Transfer of the Year": 3,
  "Performance of the Year": 4
};
var HOF_PLAYER_BAR = 45;
var HOF_COACH_SCORE = 140;
var HOF_COACH_WINS = 650;
function hallOfFame(state) {
  return state.hof ??= { inductees: [] };
}
function inductHallOfFame(state) {
  const H = hallOfFame(state);
  const cls = state.season;
  const out = [];
  const done2 = new Set(H.inductees.map((i) => `${i.kind}:${i.id}`));
  if (!H.inductees.length) {
    const programs = Object.values(state.teams).filter((t) => loreOf(t.id)?.titles?.length).sort((a, b) => loreOf(b.id).titles.length - loreOf(a.id).titles.length || b.prestige - a.prestige).slice(0, 5);
    for (const t of programs) {
      const l = historicLegends(t.id)[0];
      if (!l) continue;
      out.push({ kind: "player", id: `legend:${t.id}:${l.num}`, name: l.name, teamId: t.id, cls, line: `Charter class. ${l.line}`, years: l.era.replace(/^the /, ""), num: l.num, pos: l.pos, score: 0 });
    }
  }
  const byPlayer = /* @__PURE__ */ new Map();
  for (const a of state.awards) {
    if (!a.playerId || done2.has(`player:${a.playerId}`)) continue;
    const w = P_WEIGHTS[a.name] ?? (/ Player of the Year$/.test(a.name) ? 3 : 0);
    if (!w) continue;
    const e = byPlayer.get(a.playerId) ?? { name: a.who ?? "Former player", teams: {}, score: 0, names: [], seasons: [] };
    e.score += w;
    e.names.push(a.name);
    e.seasons.push(a.season);
    e.teams[a.teamId] = (e.teams[a.teamId] ?? 0) + w;
    byPlayer.set(a.playerId, e);
  }
  const jerseys = /* @__PURE__ */ new Map();
  for (const [teamId, list2] of Object.entries(state.legacy?.retired ?? {})) for (const r of list2) jerseys.set(r.playerId, { teamId, num: r.num, pos: r.pos, years: r.years });
  const players = [...byPlayer.entries()].filter(([id]) => !state.players[id]?.teamId).map(([id, e]) => ({ id, e, score: e.score + (jerseys.has(id) ? 15 : 0) })).filter((x) => x.score >= HOF_PLAYER_BAR).sort((a, b) => b.score - a.score).slice(0, 3);
  for (const { id, e, score } of players) {
    const j = jerseys.get(id);
    const teamId = j?.teamId ?? Object.entries(e.teams).sort((a, b) => b[1] - a[1])[0][0];
    const count = (n) => e.names.filter((x) => x === n).length;
    const bits = [];
    if (count("National Player of the Year")) bits.push(`${count("National Player of the Year") > 1 ? `${count("National Player of the Year")}\xD7 ` : ""}National Player of the Year`);
    if (count("All-American First Team")) bits.push(`${count("All-American First Team") > 1 ? `${count("All-American First Team")}\xD7 ` : ""}First Team All-American`);
    if (count("Final Four Most Outstanding Player")) bits.push("Final Four MOP");
    if (count("Defensive Player of the Year")) bits.push("Defensive Player of the Year");
    if (j) bits.push(`No. ${j.num} retired`);
    const first = Math.min(...e.seasons), last = Math.max(...e.seasons);
    out.push({ kind: "player", id, name: e.name, teamId, cls, line: bits.slice(0, 3).join(" \xB7 ") || "Decorated college career", years: j?.years ?? (first === last ? seasonLabel(first) : `${first}\u2013${String((last + 1) % 100).padStart(2, "0")}`), num: j?.num, pos: j?.pos, score });
  }
  const coaches = coachSummaries(state).filter((c) => c.exit?.status === "retired" && c.exit.until < state.season && !done2.has(`coach:${c.id}`)).filter((c) => c.score >= HOF_COACH_SCORE || c.careerW >= HOF_COACH_WINS).sort((a, b) => b.score - a.score || b.careerW - a.careerW).slice(0, 2);
  for (const c of coaches) {
    const team = c.exit.lastTeam;
    out.push({
      kind: "coach",
      id: c.id,
      name: `${c.first} ${c.last}`,
      teamId: team,
      cls,
      age: c.age,
      score: c.score,
      line: `${c.careerW}-${c.careerL} career${c.titles ? ` \xB7 ${c.titles} national title${c.titles > 1 ? "s" : ""}` : ""}${c.f4 ? ` \xB7 ${c.f4} Final Four${c.f4 > 1 ? "s" : ""}` : ""}${c.coy ? ` \xB7 ${c.coy}\xD7 Coach of the Year` : ""}`
    });
  }
  if (out.length) {
    H.inductees.push(...out);
    addNews(state, {
      kind: "feature",
      headline: `Hall of Fame Class of ${cls + 1}: ${out.map((i) => i.name).join(", ")}`,
      body: `${out.length > 1 ? "They join" : "He joins"} college basketball's Hall of Fame. ${out.map((i) => `${i.name} (${state.teams[i.teamId]?.school ?? ""}): ${i.line}`).join(" ")}`,
      teams: [...new Set(out.map((i) => i.teamId))],
      important: out.some((i) => i.teamId === state.user.teamId || i.id === state.user.coachId)
    });
  }
  return out;
}
function stageAwardsNight(state, show) {
  show.hof = inductHallOfFame(state);
  state.awardsShows = [...(state.awardsShows ?? []).filter((s) => s.season !== show.season), show].slice(-6);
  const m = { kind: "awards", season: show.season, press: state.user.press };
  state.user.press = null;
  const firedAt = state.user.moments.findIndex((x) => x.kind === "fired");
  if (firedAt >= 0) state.user.moments.splice(firedAt, 0, m);
  else state.user.moments.push(m);
}

// src/data/teams.ts
function conf(confId, rows) {
  return rows.map(
    ([id, school, fullName, mascot, abbr, city, state, lat, lng, primary, secondary, prestige, arena, capacity, market, academics, facilities]) => ({
      id,
      school,
      fullName,
      mascot,
      abbr,
      conf: confId,
      city,
      state,
      lat,
      lng,
      colors: [primary, secondary],
      prestige,
      arena,
      capacity,
      market,
      academics,
      facilities
    })
  );
}
var TEAMS = [
  // ======================================================================
  // ACC (18)
  // ======================================================================
  ...conf("acc", [
    ["boston-college", "Boston College", "Boston College", "Eagles", "BC", "Chestnut Hill", "MA", 42.34, -71.17, "#98002E", "#BC9B6A", 52, "Conte Forum", 8606, 6, 9, 6],
    ["california", "Cal", "University of California, Berkeley", "Golden Bears", "CAL", "Berkeley", "CA", 37.87, -122.26, "#003262", "#FDB515", 56, "Haas Pavilion", 11858, 7, 10, 7],
    ["clemson", "Clemson", "Clemson University", "Tigers", "CLEM", "Clemson", "SC", 34.68, -82.84, "#F56600", "#522D80", 64, "Littlejohn Coliseum", 9e3, 7, 7, 8],
    ["duke", "Duke", "Duke University", "Blue Devils", "DUKE", "Durham", "NC", 36, -78.94, "#003087", "#FFFFFF", 98, "Cameron Indoor Stadium", 9314, 10, 10, 10],
    ["florida-state", "Florida State", "Florida State University", "Seminoles", "FSU", "Tallahassee", "FL", 30.44, -84.3, "#782F40", "#CEB888", 68, "Donald L. Tucker Center", 11500, 7, 7, 7],
    ["georgia-tech", "Georgia Tech", "Georgia Institute of Technology", "Yellow Jackets", "GT", "Atlanta", "GA", 33.78, -84.4, "#003057", "#B3A369", 58, "McCamish Pavilion", 8600, 7, 9, 7],
    ["louisville", "Louisville", "University of Louisville", "Cardinals", "LOU", "Louisville", "KY", 38.21, -85.76, "#AD0000", "#000000", 87, "KFC Yum! Center", 22090, 9, 6, 10],
    ["miami-fl", "Miami", "University of Miami", "Hurricanes", "MIA", "Coral Gables", "FL", 25.72, -80.28, "#005030", "#F47321", 62, "Watsco Center", 7972, 8, 8, 7],
    ["nc-state", "NC State", "North Carolina State University", "Wolfpack", "NCST", "Raleigh", "NC", 35.79, -78.68, "#CC0000", "#000000", 72, "Lenovo Center", 19700, 8, 7, 8],
    ["north-carolina", "North Carolina", "University of North Carolina at Chapel Hill", "Tar Heels", "UNC", "Chapel Hill", "NC", 35.9, -79.05, "#7BAFD4", "#13294B", 97, "Dean E. Smith Center", 21750, 10, 9, 9],
    ["notre-dame", "Notre Dame", "University of Notre Dame", "Fighting Irish", "ND", "Notre Dame", "IN", 41.7, -86.24, "#0C2340", "#C99700", 64, "Purcell Pavilion", 9149, 8, 10, 8],
    ["pittsburgh", "Pitt", "University of Pittsburgh", "Panthers", "PITT", "Pittsburgh", "PA", 40.44, -79.96, "#003594", "#FFB81C", 62, "Petersen Events Center", 12508, 7, 8, 8],
    ["smu", "SMU", "Southern Methodist University", "Mustangs", "SMU", "Dallas", "TX", 32.84, -96.78, "#354CA1", "#CC0035", 54, "Moody Coliseum", 7e3, 8, 8, 8],
    ["stanford", "Stanford", "Stanford University", "Cardinal", "STAN", "Stanford", "CA", 37.43, -122.17, "#8C1515", "#FFFFFF", 58, "Maples Pavilion", 7233, 7, 10, 7],
    ["syracuse", "Syracuse", "Syracuse University", "Orange", "SYR", "Syracuse", "NY", 43.04, -76.14, "#F76900", "#000E54", 85, "JMA Wireless Dome", 33e3, 8, 8, 8],
    ["virginia", "Virginia", "University of Virginia", "Cavaliers", "UVA", "Charlottesville", "VA", 38.03, -78.51, "#232D4B", "#F84C1E", 80, "John Paul Jones Arena", 14593, 8, 9, 9],
    ["virginia-tech", "Virginia Tech", "Virginia Polytechnic Institute and State University", "Hokies", "VT", "Blacksburg", "VA", 37.23, -80.42, "#630031", "#CF4420", 56, "Cassell Coliseum", 8925, 6, 7, 7],
    ["wake-forest", "Wake Forest", "Wake Forest University", "Demon Deacons", "WAKE", "Winston-Salem", "NC", 36.13, -80.28, "#000000", "#9E7E38", 62, "Lawrence Joel Veterans Memorial Coliseum", 14665, 6, 9, 7]
  ]),
  // ======================================================================
  // Big Ten (18)
  // ======================================================================
  ...conf("big-ten", [
    ["illinois", "Illinois", "University of Illinois Urbana-Champaign", "Fighting Illini", "ILL", "Champaign", "IL", 40.1, -88.23, "#13294B", "#E84A27", 80, "State Farm Center", 15544, 8, 8, 9],
    ["indiana", "Indiana", "Indiana University Bloomington", "Hoosiers", "IND", "Bloomington", "IN", 39.17, -86.52, "#990000", "#FFFFFF", 88, "Simon Skjodt Assembly Hall", 17222, 9, 7, 9],
    ["iowa", "Iowa", "University of Iowa", "Hawkeyes", "IOWA", "Iowa City", "IA", 41.66, -91.55, "#000000", "#FFCD00", 66, "Carver-Hawkeye Arena", 15400, 7, 7, 7],
    ["maryland", "Maryland", "University of Maryland", "Terrapins", "MD", "College Park", "MD", 38.99, -76.94, "#E03A3E", "#FFD520", 76, "Xfinity Center", 17950, 8, 8, 8],
    ["michigan", "Michigan", "University of Michigan", "Wolverines", "MICH", "Ann Arbor", "MI", 42.27, -83.74, "#00274C", "#FFCB05", 85, "Crisler Center", 12707, 10, 9, 9],
    ["michigan-state", "Michigan State", "Michigan State University", "Spartans", "MSU", "East Lansing", "MI", 42.73, -84.48, "#18453B", "#FFFFFF", 89, "Breslin Center", 14797, 9, 7, 9],
    ["minnesota", "Minnesota", "University of Minnesota", "Golden Gophers", "MINN", "Minneapolis", "MN", 44.97, -93.23, "#7A0019", "#FFCC33", 54, "Williams Arena", 14625, 7, 8, 6],
    ["nebraska", "Nebraska", "University of Nebraska-Lincoln", "Cornhuskers", "NEB", "Lincoln", "NE", 40.82, -96.7, "#E41C38", "#FFFFFF", 54, "Pinnacle Bank Arena", 15147, 7, 7, 9],
    ["northwestern", "Northwestern", "Northwestern University", "Wildcats", "NW", "Evanston", "IL", 42.06, -87.68, "#4E2A84", "#FFFFFF", 50, "Welsh-Ryan Arena", 7039, 6, 10, 8],
    ["ohio-state", "Ohio State", "The Ohio State University", "Buckeyes", "OSU", "Columbus", "OH", 40, -83.02, "#BB0000", "#666666", 78, "Value City Arena", 18809, 10, 8, 9],
    ["oregon", "Oregon", "University of Oregon", "Ducks", "ORE", "Eugene", "OR", 44.05, -123.07, "#154733", "#FEE123", 70, "Matthew Knight Arena", 12364, 9, 7, 10],
    ["penn-state", "Penn State", "The Pennsylvania State University", "Nittany Lions", "PSU", "University Park", "PA", 40.8, -77.86, "#041E42", "#FFFFFF", 50, "Bryce Jordan Center", 15261, 7, 7, 7],
    ["purdue", "Purdue", "Purdue University", "Boilermakers", "PUR", "West Lafayette", "IN", 40.43, -86.92, "#000000", "#CEB888", 85, "Mackey Arena", 14804, 8, 8, 9],
    ["rutgers", "Rutgers", "Rutgers University-New Brunswick", "Scarlet Knights", "RUTG", "Piscataway", "NJ", 40.52, -74.46, "#CC0033", "#000000", 52, "Jersey Mike's Arena", 8e3, 7, 7, 7],
    ["ucla", "UCLA", "University of California, Los Angeles", "Bruins", "UCLA", "Los Angeles", "CA", 34.07, -118.45, "#2D68C4", "#F2A900", 95, "Pauley Pavilion", 13800, 10, 9, 9],
    ["usc", "USC", "University of Southern California", "Trojans", "USC", "Los Angeles", "CA", 34.02, -118.29, "#990000", "#FFC72C", 62, "Galen Center", 10258, 9, 9, 9],
    ["washington", "Washington", "University of Washington", "Huskies", "WASH", "Seattle", "WA", 47.65, -122.3, "#4B2E83", "#B7A57A", 60, "Alaska Airlines Arena", 1e4, 8, 8, 7],
    ["wisconsin", "Wisconsin", "University of Wisconsin-Madison", "Badgers", "WIS", "Madison", "WI", 43.07, -89.41, "#C5050C", "#FFFFFF", 76, "Kohl Center", 17287, 8, 8, 8]
  ]),
  // ======================================================================
  // Big 12 (16)
  // ======================================================================
  ...conf("big-12", [
    ["arizona", "Arizona", "University of Arizona", "Wildcats", "ARIZ", "Tucson", "AZ", 32.23, -110.95, "#0C234B", "#AB0520", 88, "McKale Center", 14644, 9, 7, 9],
    ["arizona-state", "Arizona State", "Arizona State University", "Sun Devils", "ASU", "Tempe", "AZ", 33.42, -111.93, "#8C1D40", "#FFC627", 54, "Desert Financial Arena", 14198, 8, 6, 7],
    ["baylor", "Baylor", "Baylor University", "Bears", "BAY", "Waco", "TX", 31.55, -97.12, "#154734", "#FFB81C", 75, "Foster Pavilion", 7e3, 8, 7, 10],
    ["byu", "BYU", "Brigham Young University", "Cougars", "BYU", "Provo", "UT", 40.25, -111.65, "#002E5D", "#FFFFFF", 68, "Marriott Center", 18987, 9, 7, 8],
    ["cincinnati", "Cincinnati", "University of Cincinnati", "Bearcats", "CIN", "Cincinnati", "OH", 39.13, -84.52, "#E00122", "#000000", 70, "Fifth Third Arena", 12012, 7, 6, 8],
    ["colorado", "Colorado", "University of Colorado Boulder", "Buffaloes", "COLO", "Boulder", "CO", 40.01, -105.27, "#000000", "#CFB87C", 56, "CU Events Center", 11064, 7, 7, 7],
    ["houston", "Houston", "University of Houston", "Cougars", "HOU", "Houston", "TX", 29.72, -95.34, "#C8102E", "#FFFFFF", 86, "Fertitta Center", 7035, 9, 6, 9],
    ["iowa-state", "Iowa State", "Iowa State University", "Cyclones", "ISU", "Ames", "IA", 42.03, -93.65, "#C8102E", "#F1BE48", 72, "Hilton Coliseum", 14267, 7, 7, 8],
    ["kansas", "Kansas", "University of Kansas", "Jayhawks", "KU", "Lawrence", "KS", 38.95, -95.25, "#0051BA", "#E8000D", 99, "Allen Fieldhouse", 16300, 9, 7, 10],
    ["kansas-state", "Kansas State", "Kansas State University", "Wildcats", "KSU", "Manhattan", "KS", 39.19, -96.58, "#512888", "#FFFFFF", 62, "Bramlage Coliseum", 11654, 7, 6, 7],
    ["oklahoma-state", "Oklahoma State", "Oklahoma State University", "Cowboys", "OKST", "Stillwater", "OK", 36.13, -97.07, "#FF7300", "#000000", 66, "Gallagher-Iba Arena", 13611, 7, 6, 7],
    ["tcu", "TCU", "Texas Christian University", "Horned Frogs", "TCU", "Fort Worth", "TX", 32.71, -97.36, "#4D1979", "#FFFFFF", 56, "Schollmaier Arena", 6800, 8, 7, 8],
    ["texas-tech", "Texas Tech", "Texas Tech University", "Red Raiders", "TTU", "Lubbock", "TX", 33.58, -101.85, "#CC0000", "#000000", 74, "United Supermarkets Arena", 15098, 9, 6, 8],
    ["ucf", "UCF", "University of Central Florida", "Knights", "UCF", "Orlando", "FL", 28.6, -81.2, "#000000", "#BA9B37", 50, "Addition Financial Arena", 1e4, 7, 6, 7],
    ["utah", "Utah", "University of Utah", "Utes", "UTAH", "Salt Lake City", "UT", 40.76, -111.84, "#BE0000", "#FFFFFF", 62, "Jon M. Huntsman Center", 15e3, 7, 7, 7],
    ["west-virginia", "West Virginia", "West Virginia University", "Mountaineers", "WVU", "Morgantown", "WV", 39.65, -79.95, "#002855", "#EAAA00", 70, "Hope Coliseum", 14e3, 6, 6, 7]
  ]),
  // ======================================================================
  // SEC (16)
  // ======================================================================
  ...conf("sec", [
    ["alabama", "Alabama", "University of Alabama", "Crimson Tide", "BAMA", "Tuscaloosa", "AL", 33.21, -87.55, "#9E1B32", "#FFFFFF", 74, "Coleman Coliseum", 15383, 9, 6, 9],
    ["arkansas", "Arkansas", "University of Arkansas", "Razorbacks", "ARK", "Fayetteville", "AR", 36.07, -94.18, "#9D2235", "#FFFFFF", 78, "Bud Walton Arena", 19368, 9, 6, 9],
    ["auburn", "Auburn", "Auburn University", "Tigers", "AUB", "Auburn", "AL", 32.6, -85.49, "#0C2340", "#E87722", 76, "Neville Arena", 9121, 8, 6, 9],
    ["florida", "Florida", "University of Florida", "Gators", "FLA", "Gainesville", "FL", 29.65, -82.35, "#0021A5", "#FA4616", 87, "Exactech Arena at the O'Connell Center", 10133, 9, 8, 9],
    ["georgia", "Georgia", "University of Georgia", "Bulldogs", "UGA", "Athens", "GA", 33.95, -83.37, "#BA0C2F", "#000000", 54, "Stegeman Coliseum", 10523, 8, 7, 7],
    ["kentucky", "Kentucky", "University of Kentucky", "Wildcats", "UK", "Lexington", "KY", 38.03, -84.5, "#0033A0", "#FFFFFF", 99, "Rupp Arena", 20545, 10, 6, 10],
    ["lsu", "LSU", "Louisiana State University", "Tigers", "LSU", "Baton Rouge", "LA", 30.41, -91.18, "#461D7C", "#FDD023", 66, "Pete Maravich Assembly Center", 13215, 8, 6, 7],
    ["ole-miss", "Ole Miss", "University of Mississippi", "Rebels", "MISS", "Oxford", "MS", 34.36, -89.54, "#14213D", "#CE1126", 58, "SJB Pavilion", 9500, 7, 6, 8],
    ["mississippi-state", "Mississippi State", "Mississippi State University", "Bulldogs", "MSST", "Starkville", "MS", 33.46, -88.79, "#660000", "#FFFFFF", 58, "Humphrey Coliseum", 9100, 7, 6, 7],
    ["missouri", "Missouri", "University of Missouri", "Tigers", "MIZ", "Columbia", "MO", 38.94, -92.33, "#F1B82D", "#000000", 62, "Mizzou Arena", 15061, 7, 7, 8],
    ["oklahoma", "Oklahoma", "University of Oklahoma", "Sooners", "OU", "Norman", "OK", 35.21, -97.45, "#841617", "#FFFFFF", 62, "Lloyd Noble Center", 10967, 8, 6, 7],
    ["south-carolina", "South Carolina", "University of South Carolina", "Gamecocks", "SC", "Columbia", "SC", 34, -81.03, "#73000A", "#000000", 54, "Colonial Life Arena", 18e3, 7, 6, 8],
    ["tennessee", "Tennessee", "University of Tennessee", "Volunteers", "TENN", "Knoxville", "TN", 35.95, -83.93, "#FF8200", "#FFFFFF", 80, "Food City Center", 21678, 9, 7, 9],
    ["texas", "Texas", "University of Texas at Austin", "Longhorns", "TEX", "Austin", "TX", 30.28, -97.73, "#BF5700", "#FFFFFF", 72, "Moody Center", 10763, 10, 8, 10],
    ["texas-am", "Texas A&M", "Texas A&M University", "Aggies", "TAMU", "College Station", "TX", 30.62, -96.34, "#500000", "#FFFFFF", 64, "Reed Arena", 12989, 10, 7, 8],
    ["vanderbilt", "Vanderbilt", "Vanderbilt University", "Commodores", "VAN", "Nashville", "TN", 36.14, -86.8, "#000000", "#CFAE70", 56, "Memorial Gymnasium", 14316, 7, 10, 7]
  ]),
  // ======================================================================
  // Big East (11)
  // ======================================================================
  ...conf("big-east", [
    ["butler", "Butler", "Butler University", "Bulldogs", "BUT", "Indianapolis", "IN", 39.84, -86.17, "#13294B", "#FFFFFF", 66, "Hinkle Fieldhouse", 9100, 6, 7, 8],
    ["creighton", "Creighton", "Creighton University", "Bluejays", "CREI", "Omaha", "NE", 41.27, -95.95, "#005CA9", "#FFFFFF", 70, "CHI Health Center Omaha", 17560, 7, 7, 8],
    ["depaul", "DePaul", "DePaul University", "Blue Demons", "DEP", "Chicago", "IL", 41.92, -87.65, "#005EB8", "#E4002B", 50, "Wintrust Arena", 10387, 7, 6, 7],
    ["georgetown", "Georgetown", "Georgetown University", "Hoyas", "GTWN", "Washington", "DC", 38.91, -77.07, "#041E42", "#8D817B", 74, "Capital One Arena", 20356, 8, 10, 7],
    ["marquette", "Marquette", "Marquette University", "Golden Eagles", "MARQ", "Milwaukee", "WI", 43.04, -87.93, "#003366", "#FFCC00", 76, "Fiserv Forum", 17500, 7, 7, 9],
    ["providence", "Providence", "Providence College", "Friars", "PROV", "Providence", "RI", 41.84, -71.44, "#000000", "#FFFFFF", 64, "Amica Mutual Pavilion", 12400, 6, 7, 7],
    ["seton-hall", "Seton Hall", "Seton Hall University", "Pirates", "HALL", "South Orange", "NJ", 40.74, -74.25, "#004488", "#FFFFFF", 58, "Prudential Center", 16514, 7, 6, 7],
    ["st-johns", "St. John's", "St. John's University", "Red Storm", "SJU", "Queens", "NY", 40.72, -73.79, "#D41041", "#FFFFFF", 76, "Madison Square Garden", 19812, 9, 6, 8],
    ["uconn", "UConn", "University of Connecticut", "Huskies", "CONN", "Storrs", "CT", 41.81, -72.25, "#000E2F", "#FFFFFF", 96, "Gampel Pavilion", 10167, 9, 7, 9],
    ["villanova", "Villanova", "Villanova University", "Wildcats", "NOVA", "Villanova", "PA", 40.04, -75.34, "#00205B", "#13B5EA", 89, "Finneran Pavilion", 6501, 8, 8, 8],
    ["xavier", "Xavier", "Xavier University", "Musketeers", "XAV", "Cincinnati", "OH", 39.15, -84.47, "#0C2340", "#9EA2A2", 72, "Cintas Center", 10250, 6, 7, 8]
  ]),
  // ======================================================================
  // American Conference (13)
  // ======================================================================
  ...conf("aac", [
    ["charlotte", "Charlotte", "University of North Carolina at Charlotte", "49ers", "CLT", "Charlotte", "NC", 35.31, -80.73, "#005035", "#A49665", 38, "Dale F. Halton Arena", 9105, 5, 5, 6],
    ["east-carolina", "East Carolina", "East Carolina University", "Pirates", "ECU", "Greenville", "NC", 35.61, -77.37, "#592A8A", "#FDC82F", 26, "Minges Coliseum", 8e3, 5, 5, 5],
    ["florida-atlantic", "Florida Atlantic", "Florida Atlantic University", "Owls", "FAU", "Boca Raton", "FL", 26.37, -80.1, "#003366", "#CC0000", 46, "Eleanor R. Baldwin Arena", 3e3, 5, 5, 5],
    ["memphis", "Memphis", "University of Memphis", "Tigers", "MEM", "Memphis", "TN", 35.12, -89.94, "#003087", "#898D8D", 75, "FedExForum", 18119, 7, 5, 8],
    ["north-texas", "North Texas", "University of North Texas", "Mean Green", "UNT", "Denton", "TX", 33.21, -97.15, "#00853E", "#FFFFFF", 40, "UNT Coliseum", 9792, 5, 5, 5],
    ["rice", "Rice", "Rice University", "Owls", "RICE", "Houston", "TX", 29.72, -95.4, "#00205B", "#C1C6C8", 24, "Tudor Fieldhouse", 5208, 5, 10, 6],
    ["south-florida", "South Florida", "University of South Florida", "Bulls", "USF", "Tampa", "FL", 28.06, -82.41, "#006747", "#CFC493", 36, "Yuengling Center", 10411, 6, 6, 7],
    ["temple", "Temple", "Temple University", "Owls", "TEM", "Philadelphia", "PA", 39.98, -75.16, "#9D2235", "#FFFFFF", 58, "Liacouras Center", 10206, 6, 6, 6],
    ["tulane", "Tulane", "Tulane University", "Green Wave", "TUL", "New Orleans", "LA", 29.94, -90.12, "#006747", "#418FDE", 30, "Devlin Fieldhouse", 4100, 5, 9, 5],
    ["tulsa", "Tulsa", "University of Tulsa", "Golden Hurricane", "TLSA", "Tulsa", "OK", 36.15, -95.95, "#002D72", "#C99700", 42, "Reynolds Center", 8355, 5, 7, 6],
    ["uab", "UAB", "University of Alabama at Birmingham", "Blazers", "UAB", "Birmingham", "AL", 33.5, -86.81, "#1E6B52", "#F4C300", 46, "Bartow Arena", 8508, 5, 6, 6],
    ["utsa", "UTSA", "University of Texas at San Antonio", "Roadrunners", "UTSA", "San Antonio", "TX", 29.58, -98.62, "#0C2340", "#F15A22", 20, "UTSA Convocation Center", 4080, 5, 5, 5],
    ["wichita-state", "Wichita State", "Wichita State University", "Shockers", "WICH", "Wichita", "KS", 37.72, -97.29, "#FFCD00", "#000000", 60, "Charles Koch Arena", 10506, 6, 5, 7]
  ]),
  // ======================================================================
  // Atlantic 10 (14)
  // ======================================================================
  ...conf("a-10", [
    ["davidson", "Davidson", "Davidson College", "Wildcats", "DAV", "Davidson", "NC", 35.5, -80.85, "#AC1A2F", "#000000", 50, "John M. Belk Arena", 5295, 4, 9, 6],
    ["dayton", "Dayton", "University of Dayton", "Flyers", "DAY", "Dayton", "OH", 39.74, -84.18, "#CE1141", "#004B8D", 64, "UD Arena", 13435, 6, 7, 8],
    ["duquesne", "Duquesne", "Duquesne University", "Dukes", "DUQ", "Pittsburgh", "PA", 40.44, -79.99, "#002D72", "#BA0C2F", 38, "UPMC Cooper Fieldhouse", 4390, 5, 6, 7],
    ["fordham", "Fordham", "Fordham University", "Rams", "FOR", "Bronx", "NY", 40.86, -73.89, "#860038", "#FFFFFF", 30, "Rose Hill Gymnasium", 3200, 6, 8, 4],
    ["george-mason", "George Mason", "George Mason University", "Patriots", "GMU", "Fairfax", "VA", 38.83, -77.31, "#006633", "#FFCC33", 50, "EagleBank Arena", 1e4, 6, 6, 6],
    ["george-washington", "George Washington", "The George Washington University", "Revolutionaries", "GW", "Washington", "DC", 38.9, -77.05, "#033C5A", "#AA9868", 38, "Charles E. Smith Center", 5e3, 7, 8, 6],
    ["la-salle", "La Salle", "La Salle University", "Explorers", "LAS", "Philadelphia", "PA", 40.04, -75.16, "#00205B", "#FFC72C", 36, "John Glaser Arena", 3400, 4, 5, 5],
    ["loyola-chicago", "Loyola Chicago", "Loyola University Chicago", "Ramblers", "LUC", "Chicago", "IL", 42, -87.66, "#8A2432", "#FFC72C", 52, "Joseph J. Gentile Arena", 4486, 6, 7, 6],
    ["rhode-island", "Rhode Island", "University of Rhode Island", "Rams", "URI", "Kingston", "RI", 41.48, -71.53, "#002147", "#75B2DD", 46, "Ryan Center", 7657, 5, 6, 6],
    ["richmond", "Richmond", "University of Richmond", "Spiders", "RICH", "Richmond", "VA", 37.57, -77.54, "#990000", "#002967", 44, "Robins Center", 7201, 5, 8, 7],
    ["saint-josephs", "Saint Joseph's", "Saint Joseph's University", "Hawks", "JOES", "Philadelphia", "PA", 40, -75.24, "#9E1B32", "#A2AAAD", 50, "Hagan Arena", 4200, 5, 7, 5],
    ["saint-louis", "Saint Louis", "Saint Louis University", "Billikens", "SLU", "St. Louis", "MO", 38.64, -90.23, "#003DA5", "#FFFFFF", 55, "Chaifetz Arena", 10600, 6, 7, 8],
    ["st-bonaventure", "St. Bonaventure", "St. Bonaventure University", "Bonnies", "SBU", "St. Bonaventure", "NY", 42.08, -78.48, "#5C2D19", "#FFFFFF", 42, "Reilly Center", 5480, 3, 6, 5],
    ["vcu", "VCU", "Virginia Commonwealth University", "Rams", "VCU", "Richmond", "VA", 37.55, -77.45, "#000000", "#FFB300", 62, "Stuart C. Siegel Center", 7637, 6, 6, 7]
  ]),
  // ======================================================================
  // Mountain West (10)
  // ======================================================================
  ...conf("mwc", [
    ["air-force", "Air Force", "United States Air Force Academy", "Falcons", "AF", "USAF Academy", "CO", 39.01, -104.88, "#003087", "#8A8D8F", 22, "Clune Arena", 5858, 3, 9, 6],
    ["grand-canyon", "Grand Canyon", "Grand Canyon University", "Antelopes", "GCU", "Phoenix", "AZ", 33.51, -112.13, "#522398", "#FFFFFF", 52, "Global Credit Union Arena", 7e3, 6, 4, 8],
    ["hawaii", "Hawaii", "University of Hawaii at Manoa", "Rainbow Warriors", "HAW", "Honolulu", "HI", 21.3, -157.82, "#024731", "#FFFFFF", 32, "SimpliFi Arena at Stan Sheriff Center", 10300, 4, 6, 6],
    ["nevada", "Nevada", "University of Nevada, Reno", "Wolf Pack", "NEV", "Reno", "NV", 39.55, -119.82, "#003366", "#807F84", 52, "Lawlor Events Center", 11536, 5, 5, 6],
    ["new-mexico", "New Mexico", "University of New Mexico", "Lobos", "UNM", "Albuquerque", "NM", 35.08, -106.62, "#BA0C2F", "#A7A8AA", 60, "The Pit", 15411, 6, 5, 7],
    ["san-jose-state", "San Jose State", "San Jose State University", "Spartans", "SJSU", "San Jose", "CA", 37.34, -121.88, "#0055A2", "#E5A823", 18, "Provident Credit Union Event Center", 5e3, 5, 5, 4],
    ["uc-davis", "UC Davis", "University of California, Davis", "Aggies", "UCD", "Davis", "CA", 38.54, -121.75, "#022851", "#FFBF00", 26, "University Credit Union Center", 7600, 4, 8, 5],
    ["unlv", "UNLV", "University of Nevada, Las Vegas", "Runnin' Rebels", "UNLV", "Las Vegas", "NV", 36.11, -115.14, "#CF0A2C", "#666666", 68, "Thomas & Mack Center", 18776, 7, 5, 7],
    ["utep", "UTEP", "University of Texas at El Paso", "Miners", "UTEP", "El Paso", "TX", 31.77, -106.51, "#041E42", "#FF8200", 44, "Don Haskins Center", 12222, 4, 5, 6],
    ["wyoming", "Wyoming", "University of Wyoming", "Cowboys", "WYO", "Laramie", "WY", 41.31, -105.57, "#492F24", "#FFC425", 40, "Arena-Auditorium", 11612, 4, 5, 6]
  ]),
  // ======================================================================
  // West Coast Conference (10)
  // ======================================================================
  ...conf("wcc", [
    ["denver", "Denver", "University of Denver", "Pioneers", "DEN", "Denver", "CO", 39.68, -104.96, "#BA0C2F", "#A89968", 18, "Hamilton Gymnasium", 2500, 5, 7, 6],
    ["loyola-marymount", "LMU", "Loyola Marymount University", "Lions", "LMU", "Los Angeles", "CA", 33.97, -118.42, "#AB0C2F", "#00346E", 36, "Gersten Pavilion", 4156, 6, 7, 5],
    ["pacific", "Pacific", "University of the Pacific", "Tigers", "PAC", "Stockton", "CA", 37.98, -121.31, "#F47920", "#000000", 24, "Alex G. Spanos Center", 6150, 4, 6, 5],
    ["pepperdine", "Pepperdine", "Pepperdine University", "Waves", "PEPP", "Malibu", "CA", 34.04, -118.71, "#00205C", "#E35205", 30, "Firestone Fieldhouse", 3104, 5, 8, 5],
    ["portland", "Portland", "University of Portland", "Pilots", "PORT", "Portland", "OR", 45.57, -122.73, "#1E1656", "#FFFFFF", 24, "Chiles Center", 4852, 5, 7, 5],
    ["saint-marys", "Saint Mary's", "Saint Mary's College of California", "Gaels", "SMC", "Moraga", "CA", 37.84, -122.11, "#06315B", "#D80024", 62, "University Credit Union Pavilion", 3500, 5, 7, 6],
    ["san-diego", "San Diego", "University of San Diego", "Toreros", "USD", "San Diego", "CA", 32.77, -117.19, "#003B70", "#75BEE9", 28, "Jenny Craig Pavilion", 5100, 5, 7, 6],
    ["san-francisco", "San Francisco", "University of San Francisco", "Dons", "SF", "San Francisco", "CA", 37.78, -122.45, "#00543C", "#FDBB30", 45, "War Memorial Gymnasium at the Sobrato Center", 5300, 6, 7, 5],
    ["santa-clara", "Santa Clara", "Santa Clara University", "Broncos", "SCU", "Santa Clara", "CA", 37.35, -121.94, "#862633", "#FFFFFF", 42, "Leavey Center", 4700, 6, 8, 5],
    ["seattle", "Seattle U", "Seattle University", "Redhawks", "SEA", "Seattle", "WA", 47.61, -122.32, "#AA0000", "#000000", 28, "Redhawk Center", 999, 5, 7, 4]
  ]),
  // ======================================================================
  // Pac-12 (9) — rebuilt league, first season back
  // ======================================================================
  ...conf("pac-12", [
    ["boise-state", "Boise State", "Boise State University", "Broncos", "BSU", "Boise", "ID", 43.6, -116.2, "#0033A0", "#D64309", 54, "ExtraMile Arena", 12480, 6, 5, 7],
    ["colorado-state", "Colorado State", "Colorado State University", "Rams", "CSU", "Fort Collins", "CO", 40.57, -105.08, "#1E4D2B", "#C8C372", 50, "Moby Arena", 8745, 5, 6, 6],
    ["fresno-state", "Fresno State", "California State University, Fresno", "Bulldogs", "FRES", "Fresno", "CA", 36.81, -119.75, "#DB0032", "#002E6D", 40, "Save Mart Center", 15544, 5, 5, 7],
    ["gonzaga", "Gonzaga", "Gonzaga University", "Bulldogs", "GONZ", "Spokane", "WA", 47.67, -117.4, "#041E42", "#C8102E", 88, "McCarthey Athletic Center", 6e3, 8, 7, 9],
    ["oregon-state", "Oregon State", "Oregon State University", "Beavers", "ORST", "Corvallis", "OR", 44.56, -123.28, "#DC4405", "#000000", 48, "Gill Coliseum", 9604, 5, 6, 6],
    ["san-diego-state", "San Diego State", "San Diego State University", "Aztecs", "SDSU", "San Diego", "CA", 32.77, -117.07, "#A6192E", "#000000", 68, "Viejas Arena", 12414, 7, 6, 8],
    ["texas-state", "Texas State", "Texas State University", "Bobcats", "TXST", "San Marcos", "TX", 29.89, -97.94, "#501214", "#8D734A", 26, "Strahan Arena", 1e4, 5, 5, 6],
    ["utah-state", "Utah State", "Utah State University", "Aggies", "USU", "Logan", "UT", 41.75, -111.81, "#0F2439", "#FFFFFF", 58, "Dee Glen Smith Spectrum", 10270, 5, 5, 7],
    ["washington-state", "Washington State", "Washington State University", "Cougars", "WSU", "Pullman", "WA", 46.73, -117.16, "#981E32", "#5E6A71", 42, "Beasley Coliseum", 11671, 5, 6, 6]
  ]),
  // ======================================================================
  // Missouri Valley (11)
  // ======================================================================
  ...conf("mvc", [
    ["belmont", "Belmont", "Belmont University", "Bruins", "BEL", "Nashville", "TN", 36.13, -86.79, "#002469", "#C8102E", 42, "Curb Event Center", 5085, 5, 6, 6],
    ["bradley", "Bradley", "Bradley University", "Braves", "BRAD", "Peoria", "IL", 40.7, -89.62, "#A50000", "#FFFFFF", 46, "Carver Arena", 11060, 4, 6, 6],
    ["drake", "Drake", "Drake University", "Bulldogs", "DRKE", "Des Moines", "IA", 41.6, -93.65, "#004477", "#FFFFFF", 48, "Knapp Center", 6424, 4, 6, 6],
    ["evansville", "Evansville", "University of Evansville", "Purple Aces", "EVAN", "Evansville", "IN", 37.97, -87.53, "#4F2D7F", "#F47B20", 28, "Ford Center", 11e3, 3, 6, 6],
    ["illinois-state", "Illinois State", "Illinois State University", "Redbirds", "ILST", "Normal", "IL", 40.51, -88.99, "#CE1126", "#F9DD16", 38, "CEFCU Arena", 10200, 4, 5, 6],
    ["indiana-state", "Indiana State", "Indiana State University", "Sycamores", "INST", "Terre Haute", "IN", 39.47, -87.41, "#00669A", "#FFFFFF", 40, "Hulman Center", 9e3, 4, 4, 6],
    ["murray-state", "Murray State", "Murray State University", "Racers", "MUR", "Murray", "KY", 36.62, -88.32, "#002148", "#ECAC00", 46, "CFSB Center", 8602, 4, 5, 6],
    ["northern-iowa", "Northern Iowa", "University of Northern Iowa", "Panthers", "UNI", "Cedar Falls", "IA", 42.51, -92.46, "#4B116F", "#FFCC00", 44, "McLeod Center", 6650, 4, 5, 6],
    ["southern-illinois", "Southern Illinois", "Southern Illinois University Carbondale", "Salukis", "SIU", "Carbondale", "IL", 37.71, -89.22, "#720000", "#FFFFFF", 40, "Banterra Center", 8339, 4, 5, 6],
    ["uic", "UIC", "University of Illinois Chicago", "Flames", "UIC", "Chicago", "IL", 41.87, -87.65, "#001E62", "#D50032", 24, "Credit Union 1 Arena", 6500, 5, 6, 5],
    ["valparaiso", "Valparaiso", "Valparaiso University", "Beacons", "VALP", "Valparaiso", "IN", 41.46, -87.04, "#613318", "#FFCC00", 34, "Athletics-Recreation Center", 5e3, 3, 6, 5]
  ]),
  // ======================================================================
  // Mid-American (12) — Northern Illinois left for the Horizon
  // ======================================================================
  ...conf("mac", [
    ["akron", "Akron", "University of Akron", "Zips", "AKR", "Akron", "OH", 41.08, -81.51, "#041E42", "#A89968", 42, "James A. Rhodes Arena", 5500, 4, 5, 6],
    ["ball-state", "Ball State", "Ball State University", "Cardinals", "BALL", "Muncie", "IN", 40.2, -85.41, "#BA0C2F", "#FFFFFF", 32, "Worthen Arena", 11500, 4, 5, 6],
    ["bowling-green", "Bowling Green", "Bowling Green State University", "Falcons", "BGSU", "Bowling Green", "OH", 41.38, -83.64, "#4F2C1D", "#FE5000", 26, "Stroh Center", 4700, 4, 5, 6],
    ["buffalo", "Buffalo", "University at Buffalo", "Bulls", "BUFF", "Buffalo", "NY", 43, -78.79, "#005BBB", "#FFFFFF", 30, "Alumni Arena", 6100, 4, 6, 5],
    ["central-michigan", "Central Michigan", "Central Michigan University", "Chippewas", "CMU", "Mount Pleasant", "MI", 43.59, -84.77, "#6A0032", "#FFC82E", 26, "McGuirk Arena", 5300, 4, 5, 5],
    ["eastern-michigan", "Eastern Michigan", "Eastern Michigan University", "Eagles", "EMU", "Ypsilanti", "MI", 42.25, -83.62, "#006633", "#FFFFFF", 22, "George Gervin GameAbove Center", 8800, 3, 4, 5],
    ["kent-state", "Kent State", "Kent State University", "Golden Flashes", "KENT", "Kent", "OH", 41.15, -81.34, "#002664", "#EAAB00", 40, "Memorial Athletic and Convocation Center", 6327, 4, 5, 5],
    ["miami-oh", "Miami (OH)", "Miami University", "RedHawks", "MOH", "Oxford", "OH", 39.51, -84.73, "#C3142D", "#FFFFFF", 36, "Millett Hall", 9200, 4, 7, 5],
    ["ohio", "Ohio", "Ohio University", "Bobcats", "OHIO", "Athens", "OH", 39.32, -82.1, "#00694E", "#FFFFFF", 40, "Convocation Center", 13080, 4, 6, 6],
    ["toledo", "Toledo", "University of Toledo", "Rockets", "TOL", "Toledo", "OH", 41.66, -83.61, "#15397F", "#FFDA00", 34, "Savage Arena", 7300, 4, 5, 6],
    ["umass", "UMass", "University of Massachusetts Amherst", "Minutemen", "MASS", "Amherst", "MA", 42.39, -72.53, "#881C1C", "#FFFFFF", 44, "Mullins Center", 9493, 5, 7, 6],
    ["western-michigan", "Western Michigan", "Western Michigan University", "Broncos", "WMU", "Kalamazoo", "MI", 42.28, -85.61, "#6C4023", "#B5A167", 24, "University Arena", 5421, 4, 5, 5]
  ]),
  // ======================================================================
  // Coastal Athletic Association (13)
  // ======================================================================
  ...conf("caa", [
    ["campbell", "Campbell", "Campbell University", "Fighting Camels", "CAMP", "Buies Creek", "NC", 35.41, -78.74, "#F58025", "#000000", 16, "Gilbert Craig Gore Arena", 3100, 3, 5, 5],
    ["charleston", "Charleston", "College of Charleston", "Cougars", "COFC", "Charleston", "SC", 32.78, -79.94, "#800000", "#FFFFFF", 44, "TD Arena", 5100, 5, 6, 6],
    ["drexel", "Drexel", "Drexel University", "Dragons", "DREX", "Philadelphia", "PA", 39.96, -75.19, "#07294D", "#FFC600", 30, "Daskalakis Athletic Center", 2509, 5, 7, 5],
    ["elon", "Elon", "Elon University", "Phoenix", "ELON", "Elon", "NC", 36.1, -79.5, "#73000A", "#B59A57", 18, "Schar Center", 5100, 4, 6, 6],
    ["hampton", "Hampton", "Hampton University", "Pirates", "HAMP", "Hampton", "VA", 37.02, -76.34, "#00539B", "#FFFFFF", 20, "Hampton Convocation Center", 7200, 3, 6, 5],
    ["hofstra", "Hofstra", "Hofstra University", "Pride", "HOF", "Hempstead", "NY", 40.71, -73.6, "#003591", "#FFD100", 36, "Mack Sports Complex", 5022, 5, 6, 6],
    ["monmouth", "Monmouth", "Monmouth University", "Hawks", "MONM", "West Long Branch", "NJ", 40.28, -74, "#041E42", "#FFFFFF", 26, "OceanFirst Bank Center", 4100, 4, 5, 6],
    ["nc-at", "North Carolina A&T", "North Carolina A&T State University", "Aggies", "NCAT", "Greensboro", "NC", 36.08, -79.77, "#004684", "#FDB927", 20, "Corbett Sports Center", 5700, 3, 5, 5],
    // note: Matthews Arena was demolished in 2026; Northeastern plays at Cabot Center until its new arena opens (2028).
    ["northeastern", "Northeastern", "Northeastern University", "Huskies", "NEU", "Boston", "MA", 42.34, -71.09, "#C8102E", "#000000", 32, "Cabot Center", 1e3, 5, 8, 4],
    ["stony-brook", "Stony Brook", "Stony Brook University", "Seawolves", "STBK", "Stony Brook", "NY", 40.91, -73.12, "#990000", "#16243E", 22, "Island Federal Arena", 4160, 4, 7, 6],
    ["towson", "Towson", "Towson University", "Tigers", "TOW", "Towson", "MD", 39.39, -76.61, "#FFBB00", "#000000", 30, "SECU Arena", 5200, 4, 5, 6],
    ["unc-wilmington", "UNC Wilmington", "University of North Carolina Wilmington", "Seahawks", "UNCW", "Wilmington", "NC", 34.23, -77.87, "#006666", "#FFD600", 38, "Trask Coliseum", 5200, 4, 6, 5],
    ["william-mary", "William & Mary", "College of William & Mary", "Tribe", "WM", "Williamsburg", "VA", 37.27, -76.71, "#115740", "#B9975B", 18, "Kaplan Arena", 8600, 4, 9, 5]
  ]),
  // ======================================================================
  // Conference USA (10) — Louisiana Tech (Sun Belt) and UTEP (MWC) departed
  // ======================================================================
  ...conf("cusa", [
    ["delaware", "Delaware", "University of Delaware", "Fightin' Blue Hens", "DEL", "Newark", "DE", 39.68, -75.75, "#00539F", "#FFD200", 30, "Bob Carpenter Center", 5e3, 4, 7, 6],
    ["fiu", "FIU", "Florida International University", "Panthers", "FIU", "Miami", "FL", 25.76, -80.37, "#081E3F", "#B6862C", 18, "Ocean Bank Convocation Center", 5e3, 5, 5, 5],
    ["jacksonville-state", "Jacksonville State", "Jacksonville State University", "Gamecocks", "JVST", "Jacksonville", "AL", 33.82, -85.76, "#CC0000", "#FFFFFF", 20, "Pete Mathews Coliseum", 5500, 3, 4, 5],
    ["kennesaw-state", "Kennesaw State", "Kennesaw State University", "Owls", "KENN", "Kennesaw", "GA", 34.04, -84.58, "#000000", "#FDBB30", 22, "KSU Convocation Center", 4600, 5, 5, 6],
    ["liberty", "Liberty", "Liberty University", "Flames", "LIB", "Lynchburg", "VA", 37.35, -79.18, "#002D62", "#C41230", 40, "Liberty Arena", 4e3, 6, 4, 8],
    ["middle-tennessee", "Middle Tennessee", "Middle Tennessee State University", "Blue Raiders", "MTSU", "Murfreesboro", "TN", 35.85, -86.37, "#0066CC", "#FFFFFF", 42, "Murphy Center", 11520, 4, 5, 6],
    ["missouri-state", "Missouri State", "Missouri State University", "Bears", "MOST", "Springfield", "MO", 37.2, -93.28, "#5E0009", "#FFFFFF", 38, "Great Southern Bank Arena", 11e3, 4, 5, 7],
    ["new-mexico-state", "New Mexico State", "New Mexico State University", "Aggies", "NMSU", "Las Cruces", "NM", 32.28, -106.75, "#8C0B42", "#FFFFFF", 44, "Pan American Center", 12482, 4, 4, 6],
    ["sam-houston", "Sam Houston", "Sam Houston State University", "Bearkats", "SHSU", "Huntsville", "TX", 30.71, -95.55, "#F96302", "#FFFFFF", 24, "Bernard G. Johnson Coliseum", 6100, 3, 4, 5],
    ["western-kentucky", "Western Kentucky", "Western Kentucky University", "Hilltoppers", "WKU", "Bowling Green", "KY", 36.99, -86.45, "#C60C30", "#FFFFFF", 50, "E. A. Diddle Arena", 7326, 5, 5, 7]
  ]),
  // ======================================================================
  // Sun Belt (14) — Louisiana Tech returns, Texas State left for the Pac-12
  // ======================================================================
  ...conf("sun-belt", [
    ["app-state", "App State", "Appalachian State University", "Mountaineers", "APP", "Boone", "NC", 36.21, -81.68, "#000000", "#FFCC00", 24, "Holmes Convocation Center", 8325, 4, 5, 6],
    ["arkansas-state", "Arkansas State", "Arkansas State University", "Red Wolves", "ARST", "Jonesboro", "AR", 35.84, -90.68, "#CC092F", "#000000", 22, "First National Bank Arena", 10038, 4, 4, 6],
    ["coastal-carolina", "Coastal Carolina", "Coastal Carolina University", "Chanticleers", "CCU", "Conway", "SC", 33.79, -79.01, "#006F71", "#A27752", 18, "HTC Center", 3212, 4, 4, 6],
    ["georgia-southern", "Georgia Southern", "Georgia Southern University", "Eagles", "GASO", "Statesboro", "GA", 32.42, -81.78, "#011E41", "#A3915F", 22, "Hill Convocation Center", 5500, 4, 4, 7],
    ["georgia-state", "Georgia State", "Georgia State University", "Panthers", "GAST", "Atlanta", "GA", 33.75, -84.39, "#0039A6", "#FFFFFF", 28, "GSU Convocation Center", 7500, 5, 5, 7],
    ["james-madison", "James Madison", "James Madison University", "Dukes", "JMU", "Harrisonburg", "VA", 38.44, -78.87, "#450084", "#CBB677", 32, "Atlantic Union Bank Center", 8500, 5, 6, 7],
    ["louisiana", "Louisiana", "University of Louisiana at Lafayette", "Ragin' Cajuns", "ULL", "Lafayette", "LA", 30.21, -92.02, "#CE181E", "#FFFFFF", 30, "Cajundome", 11550, 4, 4, 6],
    ["louisiana-tech", "Louisiana Tech", "Louisiana Tech University", "Bulldogs", "LT", "Ruston", "LA", 32.53, -92.65, "#002F8B", "#E31B23", 38, "Thomas Assembly Center", 8e3, 4, 5, 5],
    ["marshall", "Marshall", "Marshall University", "Thundering Herd", "MRSH", "Huntington", "WV", 38.42, -82.42, "#00B140", "#FFFFFF", 28, "Cam Henderson Center", 9048, 4, 5, 5],
    ["old-dominion", "Old Dominion", "Old Dominion University", "Monarchs", "ODU", "Norfolk", "VA", 36.89, -76.31, "#003057", "#7C878E", 40, "Chartway Arena", 8472, 5, 5, 7],
    ["south-alabama", "South Alabama", "University of South Alabama", "Jaguars", "USA", "Mobile", "AL", 30.7, -88.18, "#00205B", "#BF0D3E", 24, "Mitchell Center", 10041, 4, 4, 6],
    ["southern-miss", "Southern Miss", "University of Southern Mississippi", "Golden Eagles", "USM", "Hattiesburg", "MS", 31.33, -89.33, "#000000", "#FFAB00", 22, "Reed Green Coliseum", 8095, 4, 4, 5],
    ["troy", "Troy", "Troy University", "Trojans", "TROY", "Troy", "AL", 31.8, -85.96, "#8A2432", "#B3B5B8", 20, "Trojan Arena", 5200, 3, 4, 6],
    ["ul-monroe", "ULM", "University of Louisiana Monroe", "Warhawks", "ULM", "Monroe", "LA", 32.53, -92.07, "#840029", "#BA9B37", 12, "Fant-Ewing Coliseum", 7085, 3, 4, 4]
  ]),
  // ======================================================================
  // Horizon League (12) — Northern Illinois joins
  // ======================================================================
  ...conf("horizon", [
    ["cleveland-state", "Cleveland State", "Cleveland State University", "Vikings", "CLEV", "Cleveland", "OH", 41.5, -81.68, "#006A4D", "#FFFFFF", 30, "Wolstein Center", 13610, 4, 4, 5],
    ["detroit-mercy", "Detroit Mercy", "University of Detroit Mercy", "Titans", "DET", "Detroit", "MI", 42.41, -83.14, "#002D72", "#A6192E", 30, "Calihan Hall", 7917, 4, 5, 4],
    ["green-bay", "Green Bay", "University of Wisconsin-Green Bay", "Phoenix", "GB", "Green Bay", "WI", 44.53, -87.92, "#006F44", "#FFFFFF", 28, "Kress Events Center", 4018, 3, 4, 5],
    ["iu-indy", "IU Indy", "Indiana University Indianapolis", "Jaguars", "IUI", "Indianapolis", "IN", 39.77, -86.18, "#990000", "#FFD100", 12, "Corteva Coliseum", 6500, 4, 5, 4],
    ["milwaukee", "Milwaukee", "University of Wisconsin-Milwaukee", "Panthers", "MILW", "Milwaukee", "WI", 43.08, -87.88, "#000000", "#FDB927", 30, "UW-Milwaukee Panther Arena", 10783, 4, 5, 5],
    ["northern-illinois", "Northern Illinois", "Northern Illinois University", "Huskies", "NIU", "DeKalb", "IL", 41.93, -88.77, "#BA0C2F", "#000000", 22, "NIU Convocation Center", 1e4, 4, 5, 5],
    ["northern-kentucky", "Northern Kentucky", "Northern Kentucky University", "Norse", "NKU", "Highland Heights", "KY", 39.03, -84.46, "#000000", "#FFC72C", 24, "Truist Arena", 9400, 4, 4, 6],
    ["oakland", "Oakland", "Oakland University", "Golden Grizzlies", "OAK", "Rochester", "MI", 42.67, -83.22, "#000000", "#B59A57", 34, "OU Credit Union O'rena", 4005, 4, 5, 5],
    ["purdue-fort-wayne", "Purdue Fort Wayne", "Purdue University Fort Wayne", "Mastodons", "PFW", "Fort Wayne", "IN", 41.12, -85.11, "#000000", "#CFB991", 16, "Gates Sports Center", 2700, 3, 4, 4],
    ["robert-morris", "Robert Morris", "Robert Morris University", "Colonials", "RMU", "Moon Township", "PA", 40.52, -80.22, "#14234B", "#C8102E", 24, "UPMC Events Center", 4e3, 3, 4, 6],
    ["wright-state", "Wright State", "Wright State University", "Raiders", "WRST", "Dayton", "OH", 39.78, -84.06, "#046A38", "#CBA052", 32, "Nutter Center", 10400, 4, 4, 6],
    ["youngstown-state", "Youngstown State", "Youngstown State University", "Penguins", "YSU", "Youngstown", "OH", 41.11, -80.65, "#C8102E", "#FFFFFF", 18, "Beeghly Center", 6300, 3, 4, 5]
  ]),
  // ======================================================================
  // Ivy League (8)
  // ======================================================================
  ...conf("ivy", [
    ["brown", "Brown", "Brown University", "Bears", "BRWN", "Providence", "RI", 41.83, -71.4, "#4E3629", "#ED1C24", 18, "Pizzitola Sports Center", 2800, 5, 10, 5],
    ["columbia", "Columbia", "Columbia University", "Lions", "CLMB", "New York", "NY", 40.81, -73.96, "#1D4F91", "#B9D9EB", 14, "Levien Gymnasium", 2700, 6, 10, 4],
    ["cornell", "Cornell", "Cornell University", "Big Red", "COR", "Ithaca", "NY", 42.45, -76.48, "#B31B1B", "#FFFFFF", 26, "Newman Arena", 4473, 5, 10, 5],
    ["dartmouth", "Dartmouth", "Dartmouth College", "Big Green", "DART", "Hanover", "NH", 43.7, -72.29, "#00693E", "#FFFFFF", 14, "Leede Arena", 2100, 4, 10, 4],
    ["harvard", "Harvard", "Harvard University", "Crimson", "HARV", "Boston", "MA", 42.37, -71.12, "#A51C30", "#FFFFFF", 30, "Lavietes Pavilion", 1636, 7, 10, 5],
    ["penn", "Penn", "University of Pennsylvania", "Quakers", "PENN", "Philadelphia", "PA", 39.95, -75.19, "#011F5B", "#990000", 38, "The Palestra", 8722, 6, 10, 6],
    ["princeton", "Princeton", "Princeton University", "Tigers", "PRIN", "Princeton", "NJ", 40.35, -74.66, "#E77500", "#000000", 40, "Jadwin Gymnasium", 6854, 6, 10, 6],
    ["yale", "Yale", "Yale University", "Bulldogs", "YALE", "New Haven", "CT", 41.31, -72.93, "#00356B", "#FFFFFF", 38, "John J. Lee Amphitheater", 2532, 6, 10, 5]
  ]),
  // ======================================================================
  // Southern Conference (11) — Tennessee Tech joins from the OVC
  // ======================================================================
  ...conf("socon", [
    ["chattanooga", "Chattanooga", "University of Tennessee at Chattanooga", "Mocs", "UTC", "Chattanooga", "TN", 35.05, -85.3, "#00386B", "#E0AA0F", 34, "McKenzie Arena", 10928, 4, 5, 6],
    ["etsu", "ETSU", "East Tennessee State University", "Buccaneers", "ETSU", "Johnson City", "TN", 36.3, -82.37, "#041E42", "#FFC72C", 34, "Freedom Hall Civic Center", 6149, 4, 5, 6],
    ["furman", "Furman", "Furman University", "Paladins", "FUR", "Greenville", "SC", 34.93, -82.44, "#582C83", "#FFFFFF", 32, "Timmons Arena", 2500, 4, 7, 5],
    ["mercer", "Mercer", "Mercer University", "Bears", "MER", "Macon", "GA", 32.83, -83.65, "#F76800", "#000000", 22, "Hawkins Arena", 3200, 3, 6, 5],
    ["samford", "Samford", "Samford University", "Bulldogs", "SAM", "Birmingham", "AL", 33.46, -86.79, "#002649", "#C8102E", 28, "Pete Hanna Center", 5e3, 4, 6, 6],
    ["tennessee-tech", "Tennessee Tech", "Tennessee Technological University", "Golden Eagles", "TNTC", "Cookeville", "TN", 36.17, -85.51, "#4F2984", "#FFDD00", 18, "Hooper Eblen Center", 9280, 3, 5, 5],
    ["the-citadel", "The Citadel", "The Citadel, The Military College of South Carolina", "Bulldogs", "CIT", "Charleston", "SC", 32.8, -79.96, "#002B5C", "#6CACE4", 8, "McAlister Field House", 6e3, 3, 6, 4],
    ["unc-greensboro", "UNC Greensboro", "University of North Carolina at Greensboro", "Spartans", "UNCG", "Greensboro", "NC", 36.07, -79.81, "#0F2044", "#FFB71B", 28, "First Horizon Coliseum", 22e3, 4, 5, 5],
    ["vmi", "VMI", "Virginia Military Institute", "Keydets", "VMI", "Lexington", "VA", 37.79, -79.44, "#AE122A", "#FFD619", 10, "Cameron Hall", 5029, 2, 6, 4],
    ["western-carolina", "Western Carolina", "Western Carolina University", "Catamounts", "WCU", "Cullowhee", "NC", 35.31, -83.18, "#592C88", "#C1A875", 14, "Ramsey Center", 7826, 3, 4, 5],
    ["wofford", "Wofford", "Wofford College", "Terriers", "WOF", "Spartanburg", "SC", 34.96, -81.94, "#886B25", "#000000", 30, "Jerry Richardson Indoor Stadium", 3400, 3, 7, 5]
  ]),
  // ======================================================================
  // Summit League (8) — Denver left for the WCC
  // ======================================================================
  ...conf("summit", [
    ["kansas-city", "Kansas City", "University of Missouri-Kansas City", "Roos", "UMKC", "Kansas City", "MO", 39.03, -94.58, "#0067A5", "#FFC72C", 12, "Swinney Recreation Center", 1500, 4, 5, 4],
    ["north-dakota", "North Dakota", "University of North Dakota", "Fighting Hawks", "UND", "Grand Forks", "ND", 47.92, -97.07, "#009A44", "#000000", 16, "Betty Engelstad Sioux Center", 3300, 3, 5, 6],
    ["north-dakota-state", "North Dakota State", "North Dakota State University", "Bison", "NDSU", "Fargo", "ND", 46.9, -96.8, "#0A5640", "#FFC72A", 28, "Scheels Center", 5460, 3, 5, 6],
    ["omaha", "Omaha", "University of Nebraska Omaha", "Mavericks", "OMA", "Omaha", "NE", 41.26, -96.01, "#D71920", "#000000", 16, "Baxter Arena", 7898, 4, 5, 6],
    ["oral-roberts", "Oral Roberts", "Oral Roberts University", "Golden Eagles", "ORU", "Tulsa", "OK", 36.05, -95.95, "#002F6C", "#C5B783", 28, "Mabee Center", 10154, 4, 4, 6],
    ["south-dakota", "South Dakota", "University of South Dakota", "Coyotes", "SDAK", "Vermillion", "SD", 42.79, -96.93, "#AD0000", "#FFFFFF", 16, "Sanford Coyote Sports Center", 6e3, 3, 5, 7],
    ["south-dakota-state", "South Dakota State", "South Dakota State University", "Jackrabbits", "SDST", "Brookings", "SD", 44.32, -96.78, "#0033A0", "#FFD100", 32, "Frost Arena", 6500, 3, 5, 6],
    ["st-thomas", "St. Thomas", "University of St. Thomas", "Tommies", "STMN", "St. Paul", "MN", 44.94, -93.19, "#510C76", "#FFFFFF", 12, "Lee & Penny Anderson Arena", 5500, 4, 7, 7]
  ]),
  // ======================================================================
  // Big West (12) — Hawaii & UC Davis left for the MWC; CBU, Utah Valley,
  // Sacramento State join. (UC San Diego leaves for the WCC in 2027.)
  // ======================================================================
  ...conf("big-west", [
    ["cal-baptist", "Cal Baptist", "California Baptist University", "Lancers", "CBU", "Riverside", "CA", 33.93, -117.43, "#002855", "#A27D2C", 18, "Fowler Events Center", 5050, 4, 4, 7],
    ["cal-poly", "Cal Poly", "California Polytechnic State University", "Mustangs", "CP", "San Luis Obispo", "CA", 35.3, -120.66, "#154734", "#BD8B13", 12, "Mott Athletics Center", 3032, 4, 7, 4],
    ["cal-state-bakersfield", "CSU Bakersfield", "California State University, Bakersfield", "Roadrunners", "CSUB", "Bakersfield", "CA", 35.35, -119.1, "#003DA5", "#FFC72C", 12, "Icardo Center", 3500, 3, 4, 4],
    ["cal-state-fullerton", "Cal State Fullerton", "California State University, Fullerton", "Titans", "CSUF", "Fullerton", "CA", 33.88, -117.89, "#00274C", "#FF7900", 22, "Titan Gym", 4e3, 4, 5, 4],
    ["cal-state-northridge", "CSUN", "California State University, Northridge", "Matadors", "CSUN", "Northridge", "CA", 34.24, -118.53, "#D22030", "#000000", 14, "Premier America Credit Union Arena", 2500, 4, 5, 4],
    ["long-beach-state", "Long Beach State", "California State University, Long Beach", "Beach", "LBSU", "Long Beach", "CA", 33.78, -118.11, "#000000", "#F6BD1E", 30, "Walter Pyramid", 4200, 5, 5, 6],
    ["sacramento-state", "Sacramento State", "California State University, Sacramento", "Hornets", "SAC", "Sacramento", "CA", 38.56, -121.42, "#043927", "#C4B581", 14, "Hornets Nest", 1012, 5, 4, 3],
    ["uc-irvine", "UC Irvine", "University of California, Irvine", "Anteaters", "UCI", "Irvine", "CA", 33.65, -117.84, "#0064A4", "#FFD200", 34, "Bren Events Center", 5608, 5, 8, 5],
    ["uc-riverside", "UC Riverside", "University of California, Riverside", "Highlanders", "UCR", "Riverside", "CA", 33.97, -117.33, "#003DA5", "#FFB81C", 12, "SRC Arena", 3168, 4, 6, 4],
    ["uc-san-diego", "UC San Diego", "University of California San Diego", "Tritons", "UCSD", "La Jolla", "CA", 32.88, -117.24, "#182B49", "#C69214", 24, "LionTree Arena", 4200, 5, 9, 5],
    ["uc-santa-barbara", "UC Santa Barbara", "University of California, Santa Barbara", "Gauchos", "UCSB", "Santa Barbara", "CA", 34.41, -119.85, "#003660", "#FEBC11", 34, "The Thunderdome", 5e3, 5, 8, 5],
    ["utah-valley", "Utah Valley", "Utah Valley University", "Wolverines", "UVU", "Orem", "UT", 40.28, -111.71, "#275D38", "#FFFFFF", 22, "UCCU Center", 8500, 4, 4, 6]
  ]),
  // ======================================================================
  // United Athletic Conference (9) — the renamed WAC
  // ======================================================================
  ...conf("uac", [
    ["abilene-christian", "Abilene Christian", "Abilene Christian University", "Wildcats", "ACU", "Abilene", "TX", 32.47, -99.71, "#4F2170", "#FFFFFF", 18, "Moody Coliseum", 3600, 3, 5, 5],
    ["austin-peay", "Austin Peay", "Austin Peay State University", "Governors", "APSU", "Clarksville", "TN", 36.53, -87.35, "#C41E3A", "#FFFFFF", 22, "F&M Bank Arena", 5500, 3, 4, 6],
    ["central-arkansas", "Central Arkansas", "University of Central Arkansas", "Bears", "UCA", "Conway", "AR", 35.08, -92.46, "#4F2D7F", "#A7A9AC", 10, "Farris Center", 6e3, 3, 4, 4],
    ["eastern-kentucky", "Eastern Kentucky", "Eastern Kentucky University", "Colonels", "EKU", "Richmond", "KY", 37.74, -84.29, "#861F41", "#FFFFFF", 22, "Baptist Health Arena at Alumni Coliseum", 6500, 3, 4, 5],
    ["little-rock", "Little Rock", "University of Arkansas at Little Rock", "Trojans", "UALR", "Little Rock", "AR", 34.72, -92.34, "#6F263D", "#A2AAAD", 24, "Jack Stephens Center", 5600, 4, 4, 5],
    ["north-alabama", "North Alabama", "University of North Alabama", "Lions", "UNA", "Florence", "AL", 34.81, -87.68, "#46166B", "#DB9F11", 12, "Flowers Hall", 3500, 3, 4, 4],
    ["tarleton-state", "Tarleton State", "Tarleton State University", "Texans", "TAR", "Stephenville", "TX", 32.22, -98.22, "#4F2683", "#FFFFFF", 10, "EECU Center", 5e3, 3, 4, 6],
    ["ut-arlington", "UT Arlington", "University of Texas at Arlington", "Mavericks", "UTA", "Arlington", "TX", 32.73, -97.11, "#0064B1", "#F58025", 16, "College Park Center", 7e3, 4, 5, 6],
    // note: West Georgia is still in its D-II -> D-I transition (postseason-ineligible in 2027).
    ["west-georgia", "West Georgia", "University of West Georgia", "Wolves", "UWG", "Carrollton", "GA", 33.57, -85.1, "#0656A5", "#DA291C", 8, "The Coliseum", 6475, 3, 4, 4]
  ]),
  // ======================================================================
  // ASUN (8) — five schools left for the UAC; West Florida joins as a
  // first-year D-I program
  // ======================================================================
  ...conf("asun", [
    ["bellarmine", "Bellarmine", "Bellarmine University", "Knights", "BELL", "Louisville", "KY", 38.22, -85.7, "#A6192E", "#A2AAAD", 10, "Freedom Hall", 18252, 3, 6, 5],
    ["florida-gulf-coast", "FGCU", "Florida Gulf Coast University", "Eagles", "FGCU", "Fort Myers", "FL", 26.46, -81.77, "#00287A", "#00885A", 24, "Alico Arena", 4633, 4, 4, 6],
    ["jacksonville", "Jacksonville", "Jacksonville University", "Dolphins", "JAX", "Jacksonville", "FL", 30.35, -81.61, "#004D3B", "#FFFFFF", 16, "Swisher Gymnasium", 1500, 4, 5, 4],
    ["lipscomb", "Lipscomb", "Lipscomb University", "Bisons", "LIP", "Nashville", "TN", 36.11, -86.8, "#331E54", "#F4AA00", 20, "Allen Arena", 5028, 4, 6, 6],
    ["north-florida", "North Florida", "University of North Florida", "Ospreys", "UNF", "Jacksonville", "FL", 30.27, -81.51, "#00246B", "#A2AAAD", 12, "UNF Arena", 5800, 4, 5, 5],
    ["queens", "Queens", "Queens University of Charlotte", "Royals", "QUC", "Charlotte", "NC", 35.19, -80.83, "#002D62", "#A6820F", 8, "Curry Arena", 1800, 4, 5, 4],
    ["stetson", "Stetson", "Stetson University", "Hatters", "STET", "DeLand", "FL", 29.04, -81.3, "#0A5640", "#FFFFFF", 12, "Insight Credit Union Arena", 4400, 3, 6, 5],
    // note: West Florida began its D-II -> D-I transition in 2026-27 (postseason-ineligible).
    ["west-florida", "West Florida", "University of West Florida", "Argonauts", "UWF", "Pensacola", "FL", 30.55, -87.22, "#004C97", "#009A44", 6, "UWF Field House", 1500, 3, 4, 3]
  ]),
  // ======================================================================
  // Metro Conference (13) — the renamed MAAC
  // ======================================================================
  ...conf("metro", [
    ["canisius", "Canisius", "Canisius University", "Golden Griffins", "CAN", "Buffalo", "NY", 42.93, -78.85, "#0E2244", "#FFB81C", 16, "Koessler Athletic Center", 2196, 3, 5, 4],
    ["fairfield", "Fairfield", "Fairfield University", "Stags", "FAIR", "Fairfield", "CT", 41.16, -73.26, "#C8102E", "#FFFFFF", 18, "Leo D. Mahoney Arena", 3500, 4, 7, 6],
    ["iona", "Iona", "Iona University", "Gaels", "IONA", "New Rochelle", "NY", 40.93, -73.79, "#6F2C3F", "#FFB81C", 36, "Hynes Athletics Center", 2611, 4, 5, 4],
    ["manhattan", "Manhattan", "Manhattan University", "Jaspers", "MAN", "Riverdale", "NY", 40.89, -73.9, "#00703C", "#FFFFFF", 24, "Draddy Gymnasium", 2345, 4, 6, 3],
    ["marist", "Marist", "Marist University", "Red Foxes", "MRST", "Poughkeepsie", "NY", 41.72, -73.93, "#C8102E", "#FFFFFF", 16, "McCann Arena", 3200, 3, 6, 4],
    ["merrimack", "Merrimack", "Merrimack College", "Warriors", "MRMK", "North Andover", "MA", 42.67, -71.12, "#003768", "#F2A900", 12, "Hammel Court", 1200, 3, 5, 4],
    ["mount-st-marys", "Mount St. Mary's", "Mount St. Mary's University", "Mountaineers", "MSM", "Emmitsburg", "MD", 39.68, -77.35, "#005596", "#FFFFFF", 16, "Knott Arena", 3500, 3, 5, 4],
    ["niagara", "Niagara", "Niagara University", "Purple Eagles", "NIA", "Lewiston", "NY", 43.14, -79.04, "#582C83", "#FFFFFF", 16, "Gallagher Center", 2400, 3, 5, 4],
    ["quinnipiac", "Quinnipiac", "Quinnipiac University", "Bobcats", "QUIN", "Hamden", "CT", 41.42, -72.89, "#0C2340", "#FFB81C", 14, "M&T Bank Arena", 3570, 4, 6, 7],
    ["rider", "Rider", "Rider University", "Broncs", "RID", "Lawrenceville", "NJ", 40.28, -74.74, "#9E1B32", "#FFFFFF", 16, "Alumni Gymnasium", 1650, 4, 5, 3],
    ["sacred-heart", "Sacred Heart", "Sacred Heart University", "Pioneers", "SHU", "Fairfield", "CT", 41.22, -73.24, "#CE1141", "#8A8D8F", 10, "William H. Pitt Center", 2062, 3, 5, 5],
    ["saint-peters", "Saint Peter's", "Saint Peter's University", "Peacocks", "SPU", "Jersey City", "NJ", 40.73, -74.07, "#00478E", "#FFFFFF", 24, "Run Baby Run Arena", 3200, 3, 5, 3],
    ["siena", "Siena", "Siena College", "Saints", "SIE", "Loudonville", "NY", 42.72, -73.75, "#006B54", "#FFC72C", 28, "MVP Arena", 15229, 4, 6, 6]
  ]),
  // ======================================================================
  // Big Sky (11) — Southern Utah & Utah Tech join; Sacramento State left
  // ======================================================================
  ...conf("big-sky", [
    ["eastern-washington", "Eastern Washington", "Eastern Washington University", "Eagles", "EWU", "Cheney", "WA", 47.49, -117.58, "#A10022", "#000000", 22, "Reese Court", 6e3, 3, 4, 5],
    ["idaho", "Idaho", "University of Idaho", "Vandals", "IDHO", "Moscow", "ID", 46.73, -117.01, "#B5985A", "#000000", 16, "ICCU Arena", 4200, 3, 5, 6],
    ["idaho-state", "Idaho State", "Idaho State University", "Bengals", "IDST", "Pocatello", "ID", 42.86, -112.43, "#F47920", "#000000", 12, "Reed Gym", 3040, 3, 4, 4],
    ["montana", "Montana", "University of Montana", "Grizzlies", "MONT", "Missoula", "MT", 46.86, -113.98, "#70263D", "#A2AAAD", 30, "Dahlberg Arena", 7500, 4, 5, 5],
    ["montana-state", "Montana State", "Montana State University", "Bobcats", "MTST", "Bozeman", "MT", 45.67, -111.05, "#003875", "#B9975B", 22, "Worthington Arena", 7250, 4, 5, 6],
    ["northern-arizona", "Northern Arizona", "Northern Arizona University", "Lumberjacks", "NAU", "Flagstaff", "AZ", 35.18, -111.65, "#003466", "#FFC82E", 12, "Rolle Activity Center", 2500, 3, 5, 4],
    ["northern-colorado", "Northern Colorado", "University of Northern Colorado", "Bears", "UNCO", "Greeley", "CO", 40.4, -104.7, "#013C65", "#F6B000", 16, "Bank of Colorado Arena", 2992, 3, 4, 4],
    ["portland-state", "Portland State", "Portland State University", "Vikings", "PRST", "Portland", "OR", 45.51, -122.68, "#154734", "#FFFFFF", 14, "Viking Pavilion", 3e3, 4, 5, 5],
    ["southern-utah", "Southern Utah", "Southern Utah University", "Thunderbirds", "SUU", "Cedar City", "UT", 37.68, -113.07, "#C8102E", "#000000", 14, "America First Event Center", 5300, 3, 4, 5],
    ["utah-tech", "Utah Tech", "Utah Tech University", "Trailblazers", "UTU", "St. George", "UT", 37.1, -113.57, "#BA1C21", "#003058", 6, "Burns Arena", 4779, 3, 4, 5],
    ["weber-state", "Weber State", "Weber State University", "Wildcats", "WEB", "Ogden", "UT", 41.19, -111.94, "#492365", "#FFFFFF", 32, "Dee Events Center", 11592, 4, 4, 6]
  ]),
  // ======================================================================
  // Southland (12)
  // ======================================================================
  ...conf("southland", [
    ["east-texas-am", "East Texas A&M", "East Texas A&M University", "Lions", "ETAM", "Commerce", "TX", 33.24, -95.91, "#00386C", "#FFC72C", 6, "The Field House", 5e3, 3, 4, 4],
    ["houston-christian", "Houston Christian", "Houston Christian University", "Huskies", "HCU", "Houston", "TX", 29.69, -95.52, "#00205B", "#F58025", 8, "Sharp Gymnasium", 1e3, 4, 4, 3],
    ["incarnate-word", "Incarnate Word", "University of the Incarnate Word", "Cardinals", "UIW", "San Antonio", "TX", 29.47, -98.47, "#CB333B", "#000000", 8, "McDermott Convocation Center", 2e3, 3, 4, 4],
    ["lamar", "Lamar", "Lamar University", "Cardinals", "LAM", "Beaumont", "TX", 30.04, -94.07, "#E31937", "#FFFFFF", 22, "Montagne Center", 10080, 3, 4, 5],
    ["mcneese", "McNeese", "McNeese State University", "Cowboys", "MCN", "Lake Charles", "LA", 30.18, -93.22, "#005DAA", "#FFD204", 34, "The Legacy Center", 4200, 5, 4, 6],
    ["new-orleans", "New Orleans", "University of New Orleans", "Privateers", "UNO", "New Orleans", "LA", 30.03, -90.07, "#005CA9", "#A2AAAD", 16, "Lakefront Arena", 8933, 4, 4, 4],
    ["nicholls", "Nicholls", "Nicholls State University", "Colonels", "NICH", "Thibodaux", "LA", 29.79, -90.8, "#C41230", "#A2AAAD", 14, "Stopher Gymnasium", 3800, 3, 4, 4],
    ["northwestern-state", "Northwestern State", "Northwestern State University", "Demons", "NWST", "Natchitoches", "LA", 31.75, -93.1, "#492F92", "#F47920", 14, "Prather Coliseum", 3900, 3, 4, 4],
    ["southeastern-louisiana", "Southeastern Louisiana", "Southeastern Louisiana University", "Lions", "SELA", "Hammond", "LA", 30.52, -90.47, "#006341", "#FDB913", 12, "University Center", 7500, 3, 4, 4],
    ["stephen-f-austin", "Stephen F. Austin", "Stephen F. Austin State University", "Lumberjacks", "SFA", "Nacogdoches", "TX", 31.62, -94.65, "#3F2A56", "#FFFFFF", 28, "William R. Johnson Coliseum", 7203, 3, 4, 5],
    ["texas-am-corpus-christi", "Texas A&M-Corpus Christi", "Texas A&M University-Corpus Christi", "Islanders", "AMCC", "Corpus Christi", "TX", 27.71, -97.33, "#0067C5", "#007F3E", 14, "American Bank Center", 8500, 3, 4, 5],
    ["ut-rio-grande-valley", "UTRGV", "University of Texas Rio Grande Valley", "Vaqueros", "UTRGV", "Edinburg", "TX", 26.31, -98.17, "#F05023", "#0A2240", 12, "UTRGV Fieldhouse", 2500, 4, 4, 4]
  ]),
  // ======================================================================
  // Ohio Valley (9) — Little Rock (UAC) and Tennessee Tech (SoCon) left
  // ======================================================================
  ...conf("ovc", [
    ["eastern-illinois", "Eastern Illinois", "Eastern Illinois University", "Panthers", "EIU", "Charleston", "IL", 39.48, -88.18, "#004B83", "#8A8D8F", 12, "Groniger Arena", 5400, 3, 4, 4],
    ["lindenwood", "Lindenwood", "Lindenwood University", "Lions", "LIN", "St. Charles", "MO", 38.79, -90.5, "#000000", "#B5A36A", 6, "Robert F. Hyland Arena", 3270, 3, 4, 4],
    ["morehead-state", "Morehead State", "Morehead State University", "Eagles", "MORE", "Morehead", "KY", 38.19, -83.43, "#005EB8", "#FFCF00", 24, "Ellis T. Johnson Arena", 6500, 3, 4, 4],
    ["siue", "SIUE", "Southern Illinois University Edwardsville", "Cougars", "SIUE", "Edwardsville", "IL", 38.79, -89.99, "#E21836", "#000000", 12, "First Community Arena", 4e3, 3, 5, 4],
    ["southeast-missouri", "Southeast Missouri State", "Southeast Missouri State University", "Redhawks", "SEMO", "Cape Girardeau", "MO", 37.31, -89.53, "#C8102E", "#000000", 14, "Show Me Center", 7e3, 3, 4, 5],
    ["southern-indiana", "Southern Indiana", "University of Southern Indiana", "Screaming Eagles", "USI", "Evansville", "IN", 37.96, -87.68, "#002D72", "#A6192E", 8, "Screaming Eagles Arena", 4800, 3, 4, 5],
    ["tennessee-state", "Tennessee State", "Tennessee State University", "Tigers", "TNST", "Nashville", "TN", 36.17, -86.83, "#00539F", "#FFFFFF", 16, "Gentry Center", 9100, 3, 4, 4],
    ["ut-martin", "UT Martin", "University of Tennessee at Martin", "Skyhawks", "UTM", "Martin", "TN", 36.34, -88.86, "#0E1D45", "#FF6720", 10, "Elam Center", 4300, 3, 4, 4],
    ["western-illinois", "Western Illinois", "Western Illinois University", "Leathernecks", "WIU", "Macomb", "IL", 40.47, -90.68, "#663399", "#FFCC00", 10, "Western Hall", 5139, 3, 4, 4]
  ]),
  // ======================================================================
  // Patriot League (10)
  // ======================================================================
  ...conf("patriot", [
    ["american", "American", "American University", "Eagles", "AMER", "Washington", "DC", 38.94, -77.09, "#C4122F", "#002F6C", 16, "Bender Arena", 4500, 5, 7, 5],
    ["army", "Army", "United States Military Academy", "Black Knights", "ARMY", "West Point", "NY", 41.39, -73.96, "#000000", "#D4BF91", 10, "Christl Arena", 5043, 3, 9, 5],
    ["boston-university", "Boston University", "Boston University", "Terriers", "BU", "Boston", "MA", 42.35, -71.11, "#CC0000", "#FFFFFF", 18, "Case Gym", 1800, 5, 8, 4],
    ["bucknell", "Bucknell", "Bucknell University", "Bison", "BUCK", "Lewisburg", "PA", 40.95, -76.88, "#003865", "#E87722", 26, "Sojka Pavilion", 4e3, 4, 8, 5],
    ["colgate", "Colgate", "Colgate University", "Raiders", "COLG", "Hamilton", "NY", 42.82, -75.53, "#821019", "#FFFFFF", 24, "Cotterell Court", 1750, 3, 9, 4],
    ["holy-cross", "Holy Cross", "College of the Holy Cross", "Crusaders", "HC", "Worcester", "MA", 42.24, -71.81, "#602D89", "#FFFFFF", 20, "Hart Center", 3600, 3, 8, 4],
    ["lafayette", "Lafayette", "Lafayette College", "Leopards", "LAF", "Easton", "PA", 40.7, -75.21, "#98002E", "#FFFFFF", 12, "Kirby Sports Center", 3500, 3, 8, 4],
    ["lehigh", "Lehigh", "Lehigh University", "Mountain Hawks", "LEH", "Bethlehem", "PA", 40.61, -75.38, "#653819", "#FFFFFF", 22, "Stabler Arena", 5600, 3, 8, 5],
    ["loyola-md", "Loyola (MD)", "Loyola University Maryland", "Greyhounds", "LOY", "Baltimore", "MD", 39.35, -76.62, "#00573F", "#A2AAAD", 8, "Reitz Arena", 2100, 4, 7, 4],
    ["navy", "Navy", "United States Naval Academy", "Midshipmen", "NAVY", "Annapolis", "MD", 38.98, -76.49, "#00205B", "#C5B783", 18, "Alumni Hall", 5710, 3, 9, 5]
  ]),
  // ======================================================================
  // America East (9)
  // ======================================================================
  ...conf("america-east", [
    ["albany", "Albany", "University at Albany", "Great Danes", "ALB", "Albany", "NY", 42.69, -73.82, "#46166B", "#EEB211", 18, "Broadview Center", 4538, 3, 5, 4],
    ["binghamton", "Binghamton", "Binghamton University", "Bearcats", "BING", "Vestal", "NY", 42.09, -75.97, "#005A43", "#FFFFFF", 8, "Binghamton University Events Center", 5142, 3, 7, 5],
    ["bryant", "Bryant", "Bryant University", "Bulldogs", "BRY", "Smithfield", "RI", 41.92, -71.54, "#000000", "#C1A875", 14, "Chace Athletic Center", 2400, 3, 5, 4],
    ["maine", "Maine", "University of Maine", "Black Bears", "ME", "Orono", "ME", 44.9, -68.67, "#003263", "#B0D7FF", 6, "Memorial Gymnasium", 2e3, 2, 5, 3],
    ["new-hampshire", "New Hampshire", "University of New Hampshire", "Wildcats", "UNH", "Durham", "NH", 43.14, -70.93, "#003591", "#FFFFFF", 6, "Lundholm Gymnasium", 3500, 3, 6, 3],
    ["njit", "NJIT", "New Jersey Institute of Technology", "Highlanders", "NJIT", "Newark", "NJ", 40.74, -74.18, "#CC0000", "#071D49", 6, "Wellness and Events Center", 3500, 4, 7, 5],
    ["umass-lowell", "UMass Lowell", "University of Massachusetts Lowell", "River Hawks", "UML", "Lowell", "MA", 42.65, -71.32, "#0067B1", "#C8102E", 8, "Costello Athletic Center", 2100, 3, 5, 4],
    ["umbc", "UMBC", "University of Maryland, Baltimore County", "Retrievers", "UMBC", "Baltimore", "MD", 39.26, -76.71, "#000000", "#FDB515", 16, "Chesapeake Employers Insurance Arena", 5e3, 3, 6, 5],
    ["vermont", "Vermont", "University of Vermont", "Catamounts", "UVM", "Burlington", "VT", 44.48, -73.2, "#154734", "#FFC72C", 32, "Patrick Gymnasium", 3266, 3, 6, 4]
  ]),
  // ======================================================================
  // Big South (9)
  // ======================================================================
  ...conf("big-south", [
    ["charleston-southern", "Charleston Southern", "Charleston Southern University", "Buccaneers", "CHSO", "North Charleston", "SC", 32.98, -80.07, "#002855", "#B9975B", 8, "Buccaneer Field House", 881, 3, 4, 3],
    ["gardner-webb", "Gardner-Webb", "Gardner-Webb University", "Runnin' Bulldogs", "GWEB", "Boiling Springs", "NC", 35.25, -81.67, "#BA0C2F", "#000000", 10, "Paul Porter Arena", 3500, 3, 4, 4],
    ["high-point", "High Point", "High Point University", "Panthers", "HPU", "High Point", "NC", 35.97, -79.99, "#330072", "#FFFFFF", 30, "Qubein Center", 4500, 6, 5, 8],
    ["longwood", "Longwood", "Longwood University", "Lancers", "LONG", "Farmville", "VA", 37.3, -78.4, "#002F6C", "#8A8D8F", 12, "Joan Perry Brock Center", 3e3, 3, 4, 5],
    ["presbyterian", "Presbyterian", "Presbyterian College", "Blue Hose", "PRE", "Clinton", "SC", 34.47, -81.88, "#0055A5", "#9D2235", 6, "Templeton Center", 2e3, 2, 5, 3],
    ["radford", "Radford", "Radford University", "Highlanders", "RAD", "Radford", "VA", 37.14, -80.55, "#C2011B", "#002855", 14, "Dedmon Center", 3e3, 3, 4, 4],
    ["unc-asheville", "UNC Asheville", "University of North Carolina Asheville", "Bulldogs", "UNCA", "Asheville", "NC", 35.62, -82.57, "#003DA5", "#FFFFFF", 14, "Kimmel Arena", 3200, 3, 5, 4],
    ["usc-upstate", "USC Upstate", "University of South Carolina Upstate", "Spartans", "UPST", "Spartanburg", "SC", 34.99, -81.97, "#00703C", "#000000", 6, "G. B. Hodge Center", 878, 2, 4, 3],
    ["winthrop", "Winthrop", "Winthrop University", "Eagles", "WIN", "Rock Hill", "SC", 34.94, -81.03, "#862633", "#FFC72C", 28, "Winthrop Coliseum", 6100, 3, 4, 5]
  ]),
  // ======================================================================
  // SWAC (12)
  // ======================================================================
  ...conf("swac", [
    ["alabama-am", "Alabama A&M", "Alabama A&M University", "Bulldogs", "AAMU", "Huntsville", "AL", 34.78, -86.57, "#660000", "#FFFFFF", 6, "Alabama A&M Events Center", 6e3, 2, 3, 4],
    ["alabama-state", "Alabama State", "Alabama State University", "Hornets", "ALST", "Montgomery", "AL", 32.36, -86.3, "#000000", "#C99700", 10, "Dunn-Oliver Acadome", 7400, 2, 3, 4],
    ["alcorn-state", "Alcorn State", "Alcorn State University", "Braves", "ALCN", "Lorman", "MS", 31.87, -91.14, "#46166B", "#E9A900", 8, "Davey Whitney Complex", 7e3, 2, 3, 3],
    ["arkansas-pine-bluff", "Arkansas-Pine Bluff", "University of Arkansas at Pine Bluff", "Golden Lions", "UAPB", "Pine Bluff", "AR", 34.24, -92, "#000000", "#E5A823", 4, "H.O. Clemmons Arena", 4500, 2, 3, 3],
    ["bethune-cookman", "Bethune-Cookman", "Bethune-Cookman University", "Wildcats", "BCU", "Daytona Beach", "FL", 29.21, -81.03, "#6F263D", "#F2A900", 8, "Moore Gymnasium", 3e3, 2, 3, 3],
    ["florida-am", "Florida A&M", "Florida A&M University", "Rattlers", "FAMU", "Tallahassee", "FL", 30.42, -84.29, "#00843D", "#F47A20", 10, "Al Lawson Center", 8470, 3, 4, 4],
    ["grambling", "Grambling State", "Grambling State University", "Tigers", "GRAM", "Grambling", "LA", 32.53, -92.71, "#000000", "#FFC72C", 10, "Fredrick C. Hobdy Assembly Center", 7500, 2, 3, 3],
    ["jackson-state", "Jackson State", "Jackson State University", "Tigers", "JKST", "Jackson", "MS", 32.3, -90.21, "#002147", "#FFFFFF", 12, "Williams Assembly Center", 8e3, 3, 3, 4],
    ["mississippi-valley-state", "Mississippi Valley State", "Mississippi Valley State University", "Delta Devils", "MVSU", "Itta Bena", "MS", 33.49, -90.33, "#006341", "#CE1126", 4, "Harrison HPER Complex", 6e3, 1, 3, 2],
    ["prairie-view-am", "Prairie View A&M", "Prairie View A&M University", "Panthers", "PVAM", "Prairie View", "TX", 30.09, -95.99, "#4F2D7F", "#FDB913", 10, "William J. Nicks Building", 6500, 2, 3, 3],
    ["southern", "Southern", "Southern University and A&M College", "Jaguars", "SOU", "Baton Rouge", "LA", 30.52, -91.19, "#005EB8", "#FFD100", 12, "F. G. Clark Center", 7500, 2, 3, 3],
    ["texas-southern", "Texas Southern", "Texas Southern University", "Tigers", "TXSO", "Houston", "TX", 29.72, -95.36, "#860038", "#A2AAAD", 14, "Health and Physical Education Arena", 8100, 3, 3, 4]
  ]),
  // ======================================================================
  // MEAC (8)
  // ======================================================================
  ...conf("meac", [
    ["coppin-state", "Coppin State", "Coppin State University", "Eagles", "COPP", "Baltimore", "MD", 39.31, -76.66, "#2E3192", "#FFC72C", 8, "Physical Education Complex", 4100, 2, 3, 3],
    ["delaware-state", "Delaware State", "Delaware State University", "Hornets", "DSU", "Dover", "DE", 39.19, -75.54, "#C8102E", "#0067B1", 4, "Memorial Hall", 1800, 2, 3, 3],
    ["howard", "Howard", "Howard University", "Bison", "HOW", "Washington", "DC", 38.92, -77.02, "#003A63", "#E51937", 16, "Burr Gymnasium", 2700, 4, 6, 4],
    ["maryland-eastern-shore", "Maryland Eastern Shore", "University of Maryland Eastern Shore", "Hawks", "UMES", "Princess Anne", "MD", 38.21, -75.68, "#862633", "#A2AAAD", 4, "Hytche Athletic Center", 5500, 2, 3, 3],
    ["morgan-state", "Morgan State", "Morgan State University", "Bears", "MORG", "Baltimore", "MD", 39.34, -76.58, "#004B8D", "#F28C28", 12, "Hill Field House", 4250, 3, 4, 3],
    ["norfolk-state", "Norfolk State", "Norfolk State University", "Spartans", "NSU", "Norfolk", "VA", 36.85, -76.26, "#007A53", "#F3D03E", 22, "Echols Hall", 4500, 3, 3, 4],
    ["north-carolina-central", "NC Central", "North Carolina Central University", "Eagles", "NCCU", "Durham", "NC", 35.97, -78.9, "#7A0019", "#A2AAAD", 14, "McDougald-McLendon Arena", 3056, 3, 4, 4],
    ["south-carolina-state", "South Carolina State", "South Carolina State University", "Bulldogs", "SCST", "Orangeburg", "SC", 33.5, -80.85, "#841F27", "#0A2240", 8, "SHM Memorial Center", 3200, 2, 3, 3]
  ]),
  // ======================================================================
  // NEC (9) — Saint Francis (PA) dropped to Division III
  // ======================================================================
  ...conf("nec", [
    ["central-connecticut", "Central Connecticut", "Central Connecticut State University", "Blue Devils", "CCSU", "New Britain", "CT", 41.69, -72.77, "#1B49A2", "#FFFFFF", 12, "William H. Detrick Gymnasium", 2654, 3, 4, 3],
    ["chicago-state", "Chicago State", "Chicago State University", "Cougars", "CHST", "Chicago", "IL", 41.72, -87.61, "#006A4D", "#FFFFFF", 4, "Jones Convocation Center", 7e3, 3, 3, 4],
    ["fairleigh-dickinson", "Fairleigh Dickinson", "Fairleigh Dickinson University", "Knights", "FDU", "Hackensack", "NJ", 40.9, -74.03, "#72293C", "#FFFFFF", 14, "Bogota Savings Bank Center", 5e3, 3, 5, 4],
    ["le-moyne", "Le Moyne", "Le Moyne College", "Dolphins", "LEM", "Syracuse", "NY", 43.05, -76.09, "#006633", "#FFD100", 6, "Ted Grant Court", 2e3, 3, 5, 3],
    ["liu", "LIU", "Long Island University", "Sharks", "LIU", "Brooklyn", "NY", 40.69, -73.98, "#002F6C", "#FFC72C", 12, "Steinberg Wellness Center", 2500, 4, 4, 4],
    ["mercyhurst", "Mercyhurst", "Mercyhurst University", "Lakers", "MERC", "Erie", "PA", 42.1, -80.05, "#00573F", "#002D72", 8, "Mercyhurst Athletic Center", 1800, 2, 4, 3],
    ["new-haven", "New Haven", "University of New Haven", "Chargers", "NHVN", "West Haven", "CT", 41.29, -72.96, "#002D74", "#FFC72C", 4, "Charger Gymnasium", 2e3, 3, 4, 3],
    ["stonehill", "Stonehill", "Stonehill College", "Skyhawks", "STO", "Easton", "MA", 42.06, -71.08, "#2F2A6E", "#FFFFFF", 4, "Merkert Gymnasium", 2e3, 3, 5, 3],
    ["wagner", "Wagner", "Wagner College", "Seahawks", "WAG", "Staten Island", "NY", 40.62, -74.09, "#00483A", "#FFFFFF", 14, "Spiro Sports Center", 2100, 3, 5, 3]
  ])
];

// src/engine/offseason.ts
var NCAA_BONUS = { Champion: 30, "Runner-up": 22, "Final Four": 18, "Elite Eight": 12, "Sweet 16": 8, "Round of 32": 4, "Round of 64": 1, "First Four": 0.5 };
function prestigeScale(state) {
  if (state.prestigeScale?.length) return state.prestigeScale;
  const def = new Map(TEAMS.map((d) => [d.id, d.prestige]));
  return state.prestigeScale = Object.values(state.teams).map((t) => def.get(t.id) ?? t.prestige).sort((a, b) => b - a);
}
function seasonPerformance(state, results) {
  const scale = prestigeScale(state);
  const ranked2 = Object.values(state.teams).map((t) => ({ t, score: t.rating * 1.6 + (NCAA_BONUS[results[t.id]] ?? 0) })).sort((a, b) => b.score - a.score || b.t.prestige - a.t.prestige);
  const out = {};
  const last = Math.max(1, ranked2.length - 1);
  ranked2.forEach(({ t }, i) => {
    out[t.id] = scale[Math.round(i * (scale.length - 1) / last)];
  });
  return out;
}
function finalPoll(state) {
  for (const t of Object.values(state.teams)) {
    const res = ncaaResult(state, t.id);
    t.pollScore = (t.pollScore || 0) + (NCAA_BONUS[res] ?? 0) * 0.9;
  }
  const ranked2 = Object.values(state.teams).sort((a, b) => b.pollScore - a.pollScore);
  if (state.ncaa?.champion) {
    const ch = ranked2.findIndex((t) => t.id === state.ncaa.champion);
    if (ch > 0) ranked2.unshift(ranked2.splice(ch, 1)[0]);
  }
  for (const t of Object.values(state.teams)) {
    t.prevApRank = t.apRank;
    t.apRank = null;
  }
  ranked2.slice(0, 25).forEach((t, i) => t.apRank = i + 1);
  state.polls.push({ day: state.day, week: 99, ranks: ranked2.slice(0, 25).map((t) => t.id), label: "Final AP Poll" });
}
function beginSeasonEnd(state) {
  state.phase = "seasonEnd";
  computeRatings(state);
  finalPoll(state);
  const { awards, show } = runAwards(state);
  state.awards.push(...awards);
  const user2 = state.teams[state.user.teamId];
  const coach = state.coaches[state.user.coachId];
  const confChamps = {};
  const confFinish = {};
  for (const c of state.conferences) {
    const st = confStandings(state, c.id);
    if (st[0]) confChamps[c.id] = st[0].id;
    st.forEach((t, i) => confFinish[t.id] = i + 1);
  }
  const results = Object.fromEntries(Object.values(state.teams).map((t) => [t.id, ncaaResult(state, t.id)]));
  const perfOf = seasonPerformance(state, results);
  for (const t of Object.values(state.teams)) {
    const res = results[t.id];
    const h2 = {
      season: state.season,
      w: t.record.w,
      l: t.record.l,
      cw: t.record.cw,
      cl: t.record.cl,
      confFinish: confFinish[t.id] ?? 0,
      confChamp: confChamps[t.conf] === t.id,
      confTourneyChamp: state.confTourneys[t.conf]?.champion === t.id,
      ncaaSeed: state.ncaa?.seeds[t.id] ?? null,
      postseason: res,
      apFinal: t.apRank,
      coachId: t.coachId,
      rating: t.rating,
      conf: t.conf
    };
    t.history.push(h2);
    t.prestige = Math.round(clamp(t.prestige + (perfOf[t.id] - t.prestige) * 0.1, 1, 99) * 10) / 10;
    const c = state.coaches[t.coachId];
    if (c) c.career.push({ season: state.season, teamId: t.id, w: t.record.w, l: t.record.l, cw: t.record.cw, cl: t.record.cl, postseason: res, seed: h2.ncaaSeed });
  }
  for (const p of Object.values(state.players)) {
    if (!p.teamId || p.stats.gp === 0) continue;
    p.career.push({ ...p.stats, season: state.season, teamId: p.teamId, cls: p.cls, ovr: p.ovr });
  }
  recordSeasonEnd(state);
  chemistrySeasonEnd(state);
  ensurePros(state, state.season - 1);
  proSeason(state, state.season);
  const reviews = /* @__PURE__ */ new Map();
  forEachHuman(state, (_t, cid) => {
    reviews.set(cid, userEvaluation(state, awards));
  });
  finalizeProgramSeason(state);
  rivalrySeasonEnd(state);
  planRealignment(state);
  seasonDonations(state);
  aiFacilities(state);
  const carousel = runCarousel(state);
  state.offseason = { graduating: [], declared: [], progression: {}, signed: [], carousel, summary: "", achieved: 0, securityDelta: 0 };
  forEachHuman(state, (_t, cid) => userSeasonWrap(state, reviews.get(cid), awards, show));
}
function userEvaluation(state, awards) {
  const user2 = state.teams[state.user.teamId];
  const coach = state.coaches[state.user.coachId];
  const uh = user2.history[user2.history.length - 1];
  const confSize = state.conferences.find((c) => c.id === user2.conf) ? confStandings(state, user2.conf).length : 10;
  const achieved = achievedLevel(state, user2, uh.confFinish, confSize, uh.confChamp || uh.confTourneyChamp, uh.postseason);
  const diff = achieved - state.user.expectationLevel;
  let losingRun = 0;
  for (let i = user2.history.length - 1; i >= 0; i--) {
    const h2 = user2.history[i];
    if (h2.coachId !== coach.id || h2.w >= h2.l) break;
    losingRun++;
  }
  const secDelta = Math.round(diff * 9 + (user2.record.w - user2.record.l) * 0.3) - (losingRun >= 2 ? Math.min(16, (losingRun - 1) * 4) : 0);
  coach.jobSecurity = clamp(coach.jobSecurity + secDelta, 0, 100);
  coach.reputation = clamp(coach.reputation + diff * 3 + (NCAA_BONUS[uh.postseason] ?? 0) * 0.25, 0, 100);
  coach.contractYears = Math.max(0, coach.contractYears - 1);
  gainXp(state, 60 + Math.max(0, diff) * 60 + (NCAA_BONUS[uh.postseason] ?? 0) * 8);
  const trophy = (kind, label) => coach.trophies.push({ season: state.season, kind, label, teamId: user2.id });
  if (uh.postseason === "Champion") trophy("natl", "National Champion");
  else if (uh.postseason === "Runner-up" || uh.postseason === "Final Four") trophy("f4", "Final Four");
  else if (uh.postseason === "Elite Eight") trophy("e8", "Elite Eight");
  else if (uh.postseason === "Sweet 16") trophy("s16", "Sweet 16");
  if (uh.confChamp) trophy("conf", `${state.conferences.find((c) => c.id === user2.conf)?.short} Regular Season Champion`);
  const coyAward = awards.find((a) => a.name === "Coach of the Year");
  if (coyAward?.coachId === coach.id) trophy("coy", "National Coach of the Year");
  let fired = false;
  const seasonsAtSchool = coach.career.filter((c) => c.teamId === user2.id).length;
  if (coach.jobSecurity < 12 && seasonsAtSchool >= 2) fired = true;
  if (coach.jobSecurity < 4) fired = true;
  if (state.settings.difficulty === "rookie" && seasonsAtSchool < 3) fired = false;
  if (!fired && diff >= 1 && coach.contractYears <= 2) {
    coach.contractYears += 3;
    coach.salary = Math.round(coach.salary * 1.25 / 1e4) * 1e4;
  }
  let notRenewed = false;
  if (!fired && coach.contractYears <= 0) {
    if (coach.jobSecurity >= 50 && losingRun < 3) coach.contractYears = 2;
    else if (state.settings.difficulty === "rookie" && seasonsAtSchool < 3) coach.contractYears = 1;
    else {
      fired = true;
      notRenewed = true;
    }
  }
  const summary = `${user2.school} finished ${user2.record.w}-${user2.record.l} (${user2.record.cw}-${user2.record.cl} conf, ${ordinal(uh.confFinish)} place)${uh.postseason ? ` \u2014 ${uh.postseason}` : ""}${uh.ncaaSeed ? ` as a No. ${uh.ncaaSeed} seed` : ""}. Goal: ${state.user.expectation}.`;
  return { fired, notRenewed, achieved, secDelta, summary, seasonsAtSchool };
}
function userSeasonWrap(state, r, awards, show) {
  const user2 = state.teams[state.user.teamId];
  const coach = state.coaches[state.user.coachId];
  const { fired, notRenewed, achieved, summary, seasonsAtSchool } = r;
  const secDelta = r.secDelta;
  state.user.fired = fired;
  state.user.offers = jobOffers(state, fired);
  if (fired) {
    state.user.moments.push({ kind: "fired" });
    addNews(state, { kind: "coach", headline: notRenewed ? `${user2.school} won't renew ${coach.first} ${coach.last}'s contract` : `${user2.school} parts ways with ${coach.first} ${coach.last}`, body: notRenewed ? `${coach.first} ${coach.last}'s contract is up after ${seasonsAtSchool} season${seasonsAtSchool > 1 ? "s" : ""}, and ${user2.school} has decided to go in a different direction.` : `After ${seasonsAtSchool} season${seasonsAtSchool > 1 ? "s" : ""}, ${user2.school} has fired head coach ${coach.first} ${coach.last}. The search begins immediately.`, teams: [user2.id], important: true, personId: coach.id, personKind: "coach" });
  }
  Object.assign(state.offseason, { summary, achieved, securityDelta: secDelta });
  staffSeasonEnd(state);
  evaluateGoals(state, achieved);
  pressSeasonEnd(state, achieved);
  state.user.press = fired ? null : seasonEndPresser(state, summary);
  for (const a of awards.filter((x) => x.name === "National Player of the Year" || x.name === "Coach of the Year" || x.name.startsWith("All-American First"))) {
    const t = state.teams[a.teamId];
    const who = a.playerId ? state.players[a.playerId] : a.coachId ? state.coaches[a.coachId] : null;
    if (!who) continue;
    if (a.name === "All-American First Team" && a.teamId !== user2.id) continue;
    addNews(state, { kind: "award", headline: `${who.first} ${who.last} (${t.school}) named ${a.name}`, body: `${who.first} ${who.last} of ${t.school} has been named ${a.name} for the ${seasonLabel(state.season)} season.`, teams: [t.id], important: a.teamId === user2.id || a.name === "National Player of the Year", personId: who.id, personKind: a.playerId ? "player" : "coach" });
  }
  stageAwardsNight(state, show);
  airEpisode(state, "finale");
}
function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v2 = n % 100;
  return n + (s[(v2 - 20) % 10] || s[v2] || s[0]);
}
function runCarousel(state) {
  const lines = [];
  const vacancies = [];
  for (const t of Object.values(state.teams)) {
    if (isHuman(state, t.id)) continue;
    const c = state.coaches[t.coachId];
    if (!c) {
      vacancies.push(t);
      continue;
    }
    c.age++;
    const recent = t.history.slice(-3);
    const expected = t.prestige;
    const perf = recent.reduce((s, h2) => s + clamp(50 + h2.rating * 1.6 + (NCAA_BONUS[h2.postseason] ?? 0), 0, 100), 0) / Math.max(1, recent.length);
    const gap = expected - perf;
    let pFire = gap > 12 ? 0.12 + (gap - 12) * 0.02 : 0;
    if (recent.length < 2) pFire *= 0.3;
    const retire = c.age >= 66 && rng.chance(0.25 + (c.age - 66) * 0.08);
    if (retire || rng.chance(clamp(pFire, 0, 0.6))) {
      lines.push(retire ? `${c.first} ${c.last} retires from ${t.school}` : `${t.school} fires ${c.first} ${c.last}`);
      if (t.prestige >= 50 || retire) addNews(state, { kind: "coach", headline: retire ? `${t.school}'s ${c.first} ${c.last} announces retirement` : `${t.school} fires head coach ${c.first} ${c.last}`, body: retire ? `After a long career, ${c.first} ${c.last} is stepping away.` : `${t.school} is making a change after ${recent.map((h2) => `${h2.w}-${h2.l}`).join(", ")} the past ${recent.length} seasons.`, teams: [t.id], personId: c.id, personKind: "coach" });
      coachExit(state, c, retire ? "retired" : "fired", t.id);
      c.teamId = null;
      t.coachId = "";
      t.coachChange = true;
      vacancies.push(t);
    }
  }
  vacancies.sort((a, b) => b.prestige - a.prestige);
  for (const t of vacancies) {
    if (isHuman(state, t.id)) continue;
    maybePoachStaff(state, t.id);
    const candidates = Object.values(state.coaches).filter((c) => c.teamId && !c.isUser && state.teams[c.teamId].prestige < t.prestige - 8 && c.reputation >= t.prestige * 0.75);
    let hire;
    if (candidates.length && rng.chance(0.7)) {
      hire = candidates.sort((a, b) => b.reputation + rng.normal(0, 6) - a.reputation)[0];
      const old = state.teams[hire.teamId];
      old.coachId = "";
      old.coachChange = true;
      rivalryCoachMove(state, old.id, t.id, hire.last, false);
      lines.push(`${t.school} hires ${hire.first} ${hire.last} away from ${old.school}`);
      if (t.prestige >= 45) addNews(state, { kind: "coach", headline: `${t.school} hires ${old.school}'s ${hire.first} ${hire.last}`, body: `${hire.first} ${hire.last} (${hire.careerW}-${hire.careerL} career) leaves ${old.school} for ${t.school}.`, teams: [t.id, old.id], personId: hire.id, personKind: "coach" });
      vacancies.push(old);
    } else {
      hire = genAICoach(t.prestige, t.id);
      state.coaches[hire.id] = hire;
      lines.push(`${t.school} hires ${hire.first} ${hire.last}`);
    }
    hire.teamId = t.id;
    t.coachId = hire.id;
    hire.jobSecurity = 70;
    hire.contractYears = rng.int(4, 6);
  }
  for (const t of Object.values(state.teams)) {
    if (!t.coachId && !isHuman(state, t.id)) {
      const c = genAICoach(t.prestige, t.id);
      state.coaches[c.id] = c;
      t.coachId = c.id;
    }
  }
  for (const [id, c] of Object.entries(state.coaches)) if (!c.teamId && !c.isUser) delete state.coaches[id];
  return lines;
}
function jobOffers(state, fired) {
  const coach = state.coaches[state.user.coachId];
  const user2 = state.teams[state.user.teamId];
  const changed = Object.values(state.teams).filter((t) => t.coachChange && t.id !== user2.id);
  const maxPrestige = coach.reputation + 12;
  let pool = changed.filter((t) => t.prestige <= maxPrestige && (fired || t.prestige > user2.prestige - 5));
  if (fired && pool.length < 2) {
    pool = Object.values(state.teams).filter((t) => t.id !== user2.id && t.prestige < Math.max(25, coach.reputation - 10)).sort(() => rng.next() - 0.5).slice(0, 3);
  }
  return pool.sort((a, b) => b.prestige - a.prestige).slice(0, 3).map((t) => ({
    teamId: t.id,
    salary: Math.round((2e5 + Math.exp(t.prestige * 0.05) * 32e3) / 1e4) * 1e4,
    years: rng.int(4, 6),
    pitch: rng.pick([
      `${t.school} wants a coach who can restore the program. The AD promises full support and a bigger NIL push.`,
      `A fresh start at ${t.school}. The fan base is starving for a winner.`,
      `${t.school}'s boosters have pooled money for a new collective. They want you to lead it.`
    ])
  }));
}
function takeJob(state, teamId) {
  const coach = state.coaches[state.user.coachId];
  const old = state.teams[state.user.teamId];
  const wasFired = state.user.fired;
  const nu = state.teams[teamId];
  const offer = state.user.offers.find((o) => o.teamId === teamId);
  const repl = genAICoach(old.prestige, old.id);
  state.coaches[repl.id] = repl;
  old.coachId = repl.id;
  old.coachChange = true;
  const prev = state.coaches[nu.coachId];
  if (prev && !prev.isUser) {
    coachExit(state, prev, "fired", nu.id);
    delete state.coaches[prev.id];
  }
  if (!wasFired) rivalryCoachMove(state, old.id, nu.id, coach.last, true);
  nu.coachId = coach.id;
  nu.coachChange = true;
  coach.teamId = nu.id;
  coach.jobSecurity = 70;
  if (offer) {
    coach.salary = offer.salary;
    coach.contractYears = offer.years;
  }
  state.user.teamId = nu.id;
  staffFollowCoach(state, nu.id, old.school);
  if (state.scheduling) state.scheduling.obligations = [];
  state.user.fired = false;
  state.user.offers = [];
  state.user.board = [];
  for (const r of Object.values(state.recruits)) r.userPromise = null;
  addNews(state, { kind: "coach", headline: `${nu.school} hires ${coach.first} ${coach.last}`, body: `${coach.first} ${coach.last} leaves ${old.school} to take over at ${nu.school}.`, teams: [nu.id, old.id], important: true, personId: coach.id, personKind: "coach" });
  state.user.moments.push({ kind: "title", label: `New Job: ${nu.school}`, teamId: nu.id });
  trackProgram(state, nu.id);
  programBuild(state, nu.id);
  resetPlaybook(state);
  state.user.press = introPresser(state, { fromTeamId: old.id, fired: wasFired });
}
function doDeclarations(state) {
  finalizePoaching(state);
  state.phase = "declarations";
  const os = state.offseason;
  const players = Object.values(state.players).filter((p) => p.teamId);
  const ranked2 = players.map((p) => ({ p, s: draftScore(p) })).sort((a, b) => b.s - a.s);
  ranked2.forEach(({ p }, i) => p.draftStock = i < 100 ? i + 1 : 0);
  for (const p of players) {
    const exhausted = p.elig <= 1 && !p.redshirting;
    const pick = p.draftStock ?? 0;
    if (exhausted) {
      os.graduating.push(p.id);
      continue;
    }
    if (pick > 0 && pick <= 60) {
      const prob = pick <= 10 ? 0.95 : pick <= 20 ? 0.8 : pick <= 35 ? 0.45 : 0.15;
      if (rng.chance(prob * (p.traits.includes("loyal") ? 0.7 : 1) * (nilSatisfaction(state, p) > 1.2 ? 0.75 : 1))) os.declared.push(p.id);
    }
  }
  retireJerseys(state, [...os.graduating, ...os.declared]);
  for (const id of os.declared.slice(0, 200)) {
    const p = state.players[id];
    const t = state.teams[p.teamId];
    if ((p.draftStock ?? 99) <= 15 || p.teamId === state.user.teamId) {
      addNews(state, { kind: "draft", headline: `${t.school}'s ${p.first} ${p.last} declares for the NBA Draft`, body: `${p.first} ${p.last} (${p.cls}, ${p.pos}) is projected as a ${p.draftStock && p.draftStock <= 14 ? "lottery pick" : p.draftStock && p.draftStock <= 30 ? "first-round pick" : "second-round pick"}.`, teams: [t.id], important: p.teamId === state.user.teamId, personId: p.id, personKind: "player" });
    }
  }
}
function removeFromTeam2(state, p, note3) {
  if (p.teamId) {
    const t = state.teams[p.teamId];
    if (t) t.roster = t.roster.filter((id) => id !== p.id);
  }
  p.history.push(note3);
  p.teamId = null;
}
function doSigning(state) {
  state.phase = "signing";
  const os = state.offseason;
  const recruits = Object.values(state.recruits).sort((a, b) => a.rank - b.rank);
  const roomFor = (teamId) => ROSTER_MAX - state.teams[teamId].roster.length;
  for (const r of signingDayDecisions(state, roomFor)) signingNews(state, r);
  for (const r of recruits) {
    if (r.committed) continue;
    if (r.stars <= 2 && rng.chance(0.6)) {
      const candidates = Object.values(state.teams).filter((t) => roomFor(t.id) > 1 && t.prestige < r.stars * 20 + 15);
      if (candidates.length) r.committed = rng.pick(candidates).id;
    }
  }
  airEpisode(state, "signing");
  recordClassRanks(state);
  for (const r of recruits) {
    if (!r.committed) {
      delete state.recruits[r.id];
      continue;
    }
    const t = state.teams[r.committed];
    if (!t || roomFor(t.id) <= 0 && !isHuman(state, t.id)) {
      delete state.recruits[r.id];
      continue;
    }
    const p = recruitToPlayer(r, t.id);
    const s = r.schools.find((x) => x.teamId === t.id);
    p.nil = { amount: s?.nilOffer ?? roundMoney(nilValue(p, t.market) * 0.6), years: 2 };
    p.history.push(`Signed with ${t.school} (Class of ${r.classYear}, No. ${r.rank} overall)`);
    state.players[p.id] = p;
    t.roster.push(p.id);
    if (isHuman(state, t.id)) asTeam(state, t.id, () => {
      state.offseason.signed.push(p.id);
    });
    delete state.recruits[r.id];
  }
  for (const t of Object.values(state.teams)) {
    while (t.roster.length < ROSTER_MIN) {
      const lvl = 44 + t.prestige * 0.18 + rng.normal(0, 3);
      const p = genPlayer({ ovr: Math.round(lvl), cls: "FR", teamId: t.id, stars: rng.chance(0.5) ? 1 : 2 });
      p.history.push(`Walk-on at ${t.school}`);
      p.nil = { amount: 0, years: 1 };
      state.players[p.id] = p;
      t.roster.push(p.id);
    }
    const all = teamPlayers(state, t.id);
    if (all.length > ROSTER_MAX) {
      const isUser2 = isHuman(state, t.id);
      const keep = new Set(isUser2 ? asTeam(state, t.id, () => [...state.offseason.signed]) : []);
      const cut = all.filter((p) => !keep.has(p.id)).sort((a, b) => a.ovr - b.ovr).slice(0, all.length - ROSTER_MAX);
      if (isUser2 && cut.length) addNews(state, { kind: "user", headline: `Roster crunch: ${t.school} releases ${cut.map((p) => `${p.first} ${p.last}`).join(", ")}`, body: `With the signing class arriving and only ${ROSTER_MAX} scholarships, ${t.school} let ${cut.length > 1 ? "its lowest-rated players" : "its lowest-rated player"} go to make room.`, teams: [t.id], important: true });
      for (const p of cut) {
        removeFromTeam2(state, p, "Released");
        delete state.players[p.id];
      }
    }
    assignNumbers(state, t);
  }
}
function doDraft(state) {
  state.phase = "draft";
  const os = state.offseason;
  const seniors = os.graduating.map((id) => state.players[id]).filter(Boolean).sort((a, b) => draftScore(b) - draftScore(a)).slice(0, 90);
  const pool = [...os.declared.map((id) => state.players[id]).filter(Boolean), ...seniors];
  const scored = pool.map((p) => ({ p, s: draftScore(p) + rng.normal(0, 2.2) })).sort((a, b) => b.s - a.s);
  const order = rng.shuffle([...NBA_TEAMS]);
  const picks = scored.slice(0, 58);
  let pickNo = 1;
  for (const { p } of picks) {
    if (pickNo === 9 || pickNo === 37) pickNo++;
    const teamId = p.career.length ? p.career[p.career.length - 1].teamId : "";
    state.draft.push({ season: state.season + 1, pick: pickNo, round: pickNo <= 30 ? 1 : 2, playerId: p.id, name: `${p.first} ${p.last}`, teamId, nbaTeam: order[(pickNo - 1) % 30], pos: p.pos });
    p.history.push(`Drafted No. ${pickNo} overall by ${order[(pickNo - 1) % 30]} (${state.season + 1})`);
    addPro(state, p, pickNo, order[(pickNo - 1) % 30], teamId);
    if (teamId) {
      const t = state.teams[teamId];
      if (t) t.prestige = clamp(t.prestige + (pickNo <= 14 ? 0.8 : pickNo <= 30 ? 0.4 : 0.15), 1, 99);
      if (isHuman(state, teamId)) asTeam(state, teamId, () => {
        gainXp(state, pickNo <= 14 ? 120 : pickNo <= 30 ? 70 : 30);
        state.coaches[state.user.coachId].reputation = clamp(state.coaches[state.user.coachId].reputation + (pickNo <= 30 ? 2 : 1), 0, 100);
      });
    }
    if (pickNo <= 5 || teamId === state.user.teamId) {
      addNews(state, { kind: "draft", headline: `${order[(pickNo - 1) % 30]} select ${p.first} ${p.last} at No. ${pickNo}`, body: `${p.first} ${p.last} (${state.teams[teamId]?.school ?? "college"}) goes ${pickNo <= 30 ? "in the first round" : "in the second round"} of the NBA Draft.`, teams: teamId ? [teamId] : [], important: teamId === state.user.teamId, personId: p.id, personKind: "player" });
    }
    pickNo++;
  }
  for (const [id, p] of Object.entries(state.players)) if (!p.teamId) delete state.players[id];
}
function newSeason(state) {
  applyRealignment(state);
  pressOffseasonRecap(state);
  state.season++;
  state.day = 0;
  state.phase = "preseason";
  state.calendar = buildCalendar(state.season);
  state.confTourneys = {};
  state.ncaa = null;
  state.portal = null;
  state.boxScores = {};
  state.polls = [];
  state.schedule = [];
  state.news = state.news.slice(0, 150);
  state.social = state.social.slice(0, 100);
  jerseyNights(state);
  for (const c of Object.values(state.coaches)) if (!c.isUser) c.contractYears = Math.max(0, c.contractYears - 1);
  forEachHuman(state, () => {
    state.coaches[state.user.coachId].age++;
  });
  for (const t of Object.values(state.teams)) {
    t.record = emptyRecord();
    t.apRank = null;
    t.prevApRank = null;
    t.pollScore = 0;
    t.srs = 0;
    t.wab = 0;
    t.coachChange = false;
    const conf2 = state.conferences.find((c) => c.id === t.conf);
    const coach = state.coaches[t.coachId];
    t.nilBudget = Math.round(nilBudgetFor(t, conf2, t.hype) * (1 + (coach?.skills.nil ?? 3) * 0.03) * (isHuman(state, t.id) ? asTeam(state, t.id, () => staffEffects(state).nilMul) : 1));
    t.hype = clamp(t.hype * 0.7 + 15, 5, 100);
    for (const p of teamPlayers(state, t.id)) {
      p.stats = emptyStats();
      p.starts = 0;
      p.draftStock = void 0;
      if (p.nil) {
        p.nil.years--;
        if (p.nil.years <= 0) p.nil = isHuman(state, t.id) ? null : p.nil;
      }
    }
    if (!isHuman(state, t.id)) {
      allocateAiNil(state, t);
      t.strategy = autoStrategy(teamPlayers(state, t.id), coach);
    } else {
      t.strategy.starters = t.strategy.starters.filter((id) => t.roster.includes(id));
      if (t.strategy.starters.length !== 5) t.strategy.starters = [];
    }
    refreshPower(state, t);
  }
  state.offseason = null;
  openFacilities(state);
  forEachHuman(state, () => {
    finalizePoaching(state);
    staffNewSeason(state);
  });
  state.schedule = generateSchedule(state);
  for (const r of generateClass(state, state.season + 1)) state.recruits[r.id] = r;
  computeRatings(state);
  forEachHuman(state, () => applyScheduleEffects(state));
  seedInterest(state);
  const ranks = runPoll(state, "Preseason AP Poll");
  addNews(state, { kind: "rank", headline: `Preseason AP Poll: ${state.teams[ranks[0]].school} opens at No. 1`, body: `The ${seasonLabel(state.season)} season tips off soon. Top five: ${ranks.slice(0, 5).map((id, i) => `${i + 1}. ${state.teams[id].school}`).join(", ")}.`, teams: ranks.slice(0, 5), important: true });
  chemistryNewSeason(state);
  forEachHuman(state, () => humanNewSeason(state));
}
function humanNewSeason(state) {
  state.inbox = state.inbox.filter((i) => !i.resolved).slice(0, 10);
  state.user.board = [];
  seedUserBoard(state);
  setExpectations(state);
  devNewSeason(state);
  seasonInstallReset(state);
  state.user.hoursMax = hoursForWeek(state);
  state.user.hours = state.user.hoursMax;
  state.user.press = mediaDayPresser(state);
  const user2 = state.teams[state.user.teamId];
  const unsigned = teamPlayers(state, user2.id).filter((p) => !p.nil);
  if (unsigned.length) {
    state.inbox.unshift({
      id: `nil${state.season}`,
      day: 0,
      season: state.season,
      from: "Collective Director",
      fromRole: "NIL Collective",
      resolved: false,
      priority: true,
      subject: `${unsigned.length} player${unsigned.length > 1 ? "s" : ""} need NIL deals`,
      body: `${unsigned.map((p) => `${p.first} ${p.last}`).join(", ")} ${unsigned.length > 1 ? "are" : "is"} without an NIL agreement for ${seasonLabel(state.season)}. Head to the NIL Office to get them signed \u2014 unpaid players lose morale fast.`,
      choices: [{ label: "On it \u2014 I\u2019ll handle it in the NIL Office.", effects: [] }, { label: "Have the collective auto-sign everyone at market value", hint: "Signs unsigned players, best first, within budget", effects: [], result: "The collective director got to work." }]
    });
    state.inbox[0].choices[1].autoNil = true;
  }
}
function advanceOffseason(state) {
  const before = state.phase;
  switch (state.phase) {
    case "seasonEnd":
      doDeclarations(state);
      break;
    case "declarations":
      openPortal(state);
      break;
    case "portal":
      if (advancePortalDay(state) === "closed") doSigning(state);
      break;
    case "signing":
      doDraft(state);
      break;
    case "draft":
      forEachHuman(state, () => beginSummer(state));
      break;
    case "progression": {
      let done2 = true;
      forEachHuman(state, () => {
        if (!summerDone(state)) done2 = false;
      });
      if (!done2) {
        let first = true;
        forEachHuman(state, () => {
          runSummer(state, first);
          first = false;
        });
      } else {
        applyRealignment(state);
        forEachHuman(state, () => openScheduling(state));
      }
      break;
    }
    case "scheduling":
      forEachHuman(state, () => {
        lockScheduling(state);
      });
      newSeason(state);
      break;
    default:
      break;
  }
  radioOffseason(state, before);
}

// src/engine/season.ts
function isUserGame(state, g) {
  return g.home === state.user.teamId || g.away === state.user.teamId;
}
function isRivalry(state, a, b) {
  return rivalryOf(state, a, b);
}
function gameScore(p) {
  return p.pts + 0.4 * p.fgm - 0.7 * p.fga - 0.4 * (p.fta - p.ftm) + 0.7 * p.orb + 0.3 * p.drb + p.stl + 0.7 * p.ast + 0.7 * p.blk - 0.4 * p.pf - p.tov;
}
function simGame(state, g) {
  const home = state.teams[g.home], away = state.teams[g.away];
  return simulateGame(simSetup(state, home), simSetup(state, away), {
    neutral: g.neutral,
    crowd: clamp(home.hype / 100 + rivalCrowd(state, g.home, g.away) + (g.neutral ? 0 : facilityCrowd(state, g.home)), 0, 1),
    tourney: g.type === "ncaa"
  });
}
function applyGameResult(state, g, box) {
  if (g.played) return;
  box.gameId = g.id;
  g.played = true;
  g.hs = box.hs;
  g.as = box.as;
  g.ot = box.ot;
  g.poss = box.poss;
  const home = state.teams[g.home], away = state.teams[g.away];
  const homeWon = box.hs > box.as;
  const isUser2 = isUserGame(state, g);
  const preSpread = spread(state, g.home, g.away, g.neutral);
  const preApH = home.apRank, preApA = away.apRank;
  for (const [t, won, pf, pa, side] of [[home, homeWon, box.hs, box.as, "h"], [away, !homeWon, box.as, box.hs, "a"]]) {
    const r = t.record;
    if (won) r.w++;
    else r.l++;
    if (g.type === "conf") {
      if (won) r.cw++;
      else r.cl++;
    }
    if (g.neutral) {
      if (won) r.nw++;
      else r.nl++;
    } else if (side === "h") {
      if (won) r.hw++;
      else r.hl++;
    } else {
      if (won) r.aw++;
      else r.al++;
    }
    r.streak = won ? r.streak > 0 ? r.streak + 1 : 1 : r.streak < 0 ? r.streak - 1 : -1;
    r.pf += pf;
    r.pa += pa;
    r.poss += box.poss;
    const coach = state.coaches[t.coachId];
    if (coach) {
      if (won) coach.careerW++;
      else coach.careerL++;
    }
    const big = !!(won ? side === "h" ? preApA : preApH : (side === "h" ? !preApA : !preApH) && t.apRank);
    updateHype(t, won, big || g.type === "ncaa");
  }
  let potg = null;
  const userInjuryMul = (state.staff ? staffEffects(state).injury : 1) * practiceMods(state).injury;
  box.players.forEach((side, i) => {
    const team = i === 0 ? home : away;
    const won = i === 0 ? homeWon : !homeWon;
    const roster = teamPlayers(state, team.id);
    for (const p of roster) {
      if (p.injury) {
        p.injury.games--;
        if (p.injury.games <= 0) p.injury = null;
      }
    }
    const sorted = [...roster].filter((p) => !p.redshirting).sort((a, b) => b.ovr - a.ovr);
    for (const bp of side) {
      const p = state.players[bp.id];
      if (!p) continue;
      const s = p.stats;
      if (bp.min > 0 || bp.starter) s.gp++;
      if (bp.starter) {
        s.gs++;
        p.starts++;
      }
      s.min += bp.min;
      s.pts += bp.pts;
      s.fgm += bp.fgm;
      s.fga += bp.fga;
      s.tpm += bp.tpm;
      s.tpa += bp.tpa;
      s.ftm += bp.ftm;
      s.fta += bp.fta;
      s.orb += bp.orb;
      s.drb += bp.drb;
      s.ast += bp.ast;
      s.stl += bp.stl;
      s.blk += bp.blk;
      s.tov += bp.tov;
      s.pf += bp.pf;
      if (won) {
        const gs = gameScore(bp);
        if (!potg || gs > potg.s) potg = { id: bp.id, s: gs };
      }
      const risk = bp.min / 40 * 55e-4 * (p.traits.includes("injuryProne") ? 2.5 : 1) * (team.id === state.user.teamId ? userInjuryMul : 1);
      if (!p.injury && rng.chance(risk)) {
        p.injury = randomInjury();
        injuryNews(state, p, team.id);
      }
      const rank = sorted.findIndex((x) => x.id === p.id);
      const expMin = roleOf(p, rank).min;
      let dm = won ? 0.8 : -0.8;
      if (bp.min + 6 < expMin) dm -= (p.traits.includes("diva") ? 2.2 : 1.1) * (p.promise ? 1.8 : 1);
      else if (bp.min > expMin + 4) dm += 0.6;
      if (p.traits.includes("leader")) dm += 0.2;
      p.morale = clamp(p.morale + dm, 0, 100);
      if (bp.pts >= 35 && !isUser2) {
        addNews(state, { kind: "milestone", headline: `${p.first} ${p.last} erupts for ${bp.pts} as ${team.school} ${won ? "wins" : "falls"}`, body: `${p.first} ${p.last} (${team.school}) finished with ${statLine(bp)}.`, teams: [team.id], personId: p.id, personKind: "player" });
      }
    }
  });
  if (potg) g.potg = potg.id;
  recordGame(state, g, box);
  rivalryResult(state, g, preApH, preApA);
  const notable = isUser2 || preApH && preApA || g.type === "ncaa";
  if (notable) {
    if (!isUser2) delete box.shots;
    state.boxScores[g.id] = box;
  }
  const pre = { preApH, preApA, preSpread };
  if (isUser2) userGameEffects(state, g, box, pre);
  else upsetNews(state, g);
  return pre;
}
function userGameEffects(state, g, box, pre) {
  const { preApH, preApA, preSpread } = pre;
  const homeWon = box.hs > box.as;
  {
    gameRecapNews(state, g, box);
    userGameSocial(state, g, box);
    const user2 = state.teams[state.user.teamId];
    const userHome = g.home === user2.id;
    const won = userHome ? homeWon : !homeWon;
    const opp = state.teams[userHome ? g.away : g.home];
    const oppRank = userHome ? preApA : preApH;
    const expectedMargin = userHome ? preSpread : -preSpread;
    let xp = won ? 10 : 2;
    if (won && oppRank) xp += 10 + Math.max(0, 26 - oppRank);
    if (g.type === "conf") xp += won ? 4 : 0;
    if (g.type === "ncaa") xp += won ? 50 : 10;
    if (g.type === "ctourn") xp += won ? 12 : 2;
    gainXp(state, xp);
    const coach = state.coaches[state.user.coachId];
    const surprise = (won ? 1 : -1) * (won ? Math.max(0, -expectedMargin) : Math.max(0, expectedMargin));
    coach.jobSecurity = clamp(coach.jobSecurity + (won ? 0.4 : -0.5) + surprise * 0.08, 0, 100);
    const big = !!oppRank || !!isRivalry(state, g.home, g.away) || g.type !== "nc" && g.type !== "conf" || Math.abs(user2.record.streak) >= 4 || !won && expectedMargin > 6 || won && expectedMargin < -5;
    if (state.settings.autoPress || big || rng.chance(0.3)) {
      state.user.press = postgamePresser(state, g, box);
    }
    state.user.moments.push({ kind: "win", gameId: g.id, big: won && (!!oppRank || g.type === "ncaa" || g.type === "ctourn") });
    seniorNight(state, g);
  }
}
function processDay(state, opts = {}) {
  const games = state.schedule.filter((g) => g.day === state.day && !g.played);
  for (const g of games) {
    if (opts.skipUser && isUserGame(state, g)) continue;
    playGame(state, g);
  }
  if (games.length) {
    if (state.phase === "confTourney" || state.phase === "ncaa") {
      advanceBrackets(state);
      tourneyNews(state);
    }
    computeRatings(state);
  }
}
function playGame(state, g, given) {
  const humans = leagueOn(state) ? [g.home, g.away].filter((t) => isHuman(state, t)) : [];
  if (!humans.length) {
    applyGameResult(state, g, given ?? simGame(state, g));
    return;
  }
  humans.sort((a) => a === state.user.teamId ? -1 : 1);
  let box, pre;
  asTeam(state, humans[0], () => {
    box = given ?? simGame(state, g);
    pre = applyGameResult(state, g, box);
  });
  if (humans[1] && box && pre) {
    const c = humanCoachOf(state, humans[1]);
    if (c) withHuman(state, c, () => userGameEffects(state, g, box, pre));
  }
}
function tourneyNews(state) {
  for (const b of Object.values(state.confTourneys)) {
    const final = b.rounds[b.rounds.length - 1][0];
    if (b.champion && final.gameId && state.schedule.find((g) => g.id === final.gameId)?.day === state.day) {
      const t = state.teams[b.champion];
      addNews(state, { kind: "feature", headline: `${t.school} wins the ${b.name}, punches ticket to the Big Dance`, body: `${t.school} (${t.record.w}-${t.record.l}) claimed the ${b.name} title${final.score ? ` with a ${Math.max(...final.score)}-${Math.min(...final.score)} win in the final` : ""}, earning an automatic bid to the NCAA Tournament.`, teams: [t.id], important: t.id === state.user.teamId });
      if (isHuman(state, t.id)) asTeam(state, t.id, () => {
        state.user.moments.push({ kind: "title", label: `${b.name} Champions`, teamId: t.id });
        gainXp(state, 120);
        const c = state.coaches[state.user.coachId];
        c.trophies.push({ season: state.season, kind: "ctourn", label: `${b.name} Champion`, teamId: t.id });
      });
    }
  }
  if (state.ncaa && state.phase === "ncaa") {
    const roundIdx = state.day - NCAA_FIRST;
    const roundName = NCAA_ROUND_NAMES[roundIdx];
    const games = state.ncaa.rounds[roundIdx] ?? [];
    const upsets = games.filter((g) => g.winner && g.seeds[0] != null && g.seeds[1] != null && (state.ncaa.seeds[g.winner] ?? 0) - Math.min(g.seeds[0], g.seeds[1]) >= 4);
    for (const g of upsets.slice(0, 3)) {
      const w = state.teams[g.winner];
      const loserId = g.teams.find((x) => x !== g.winner);
      const l = state.teams[loserId];
      addNews(state, { kind: "bracket", headline: `MADNESS: No. ${state.ncaa.seeds[w.id]} ${w.school} stuns No. ${state.ncaa.seeds[l.id]} ${l.school}`, body: `Brackets everywhere just took a hit. ${w.school} advances past ${l.school} in the ${roundName}${g.score ? `, ${Math.max(...g.score)}-${Math.min(...g.score)}` : ""}.`, teams: [w.id, l.id], important: true });
      addSocial(state, { handle: "BracketBrad", name: "Bracket Brad", verified: true, kind: "analyst", text: `Only ${rng.int(2, 9)}% of brackets had ${w.school} winning that one. Chaos. \u{1F525}\u{1F3C0} #MarchMadness`, teamId: w.id });
    }
    if (state.ncaa.champion && roundIdx === 6) {
      const ch = state.teams[state.ncaa.champion];
      const final = state.ncaa.rounds[6][0];
      const ru = state.teams[final.teams.find((x) => x !== ch.id)];
      addNews(state, { kind: "feature", headline: `${ch.school.toUpperCase()} ARE NATIONAL CHAMPIONS`, body: `${ch.school} cut down the nets after beating ${ru.school}${final.score ? ` ${Math.max(...final.score)}-${Math.min(...final.score)}` : ""} in the national championship game. One Shining Moment.`, teams: [ch.id, ru.id], important: true });
      state.champions.push({ season: state.season, teamId: ch.id, runnerUp: ru.id, score: final.score ? `${Math.max(...final.score)}-${Math.min(...final.score)}` : "" });
      if (isHuman(state, ch.id)) asTeam(state, ch.id, () => state.user.moments.push({ kind: "title", label: "National Champions", teamId: ch.id }));
    }
    for (const userId of humanTeamIds(state)) for (const g of games) {
      if (g.winner && g.teams.includes(userId) && g.winner !== userId) {
        addNews(state, { kind: "user", headline: `${state.teams[userId].school}'s season ends in the ${roundName}`, body: `The run is over. ${state.teams[userId].school} finishes ${state.teams[userId].record.w}-${state.teams[userId].record.l} with a ${NCAA_EXIT_LABEL[roundIdx]} exit.`, teams: [userId], important: true });
      }
    }
  }
}
function weeklyTick(state, week) {
  const inSeason = state.phase === "regular" || state.phase === "preseason";
  if (inSeason && state.day > 0 && state.day <= LAST_REG_DAY + 1) {
    const label = `AP Poll \xB7 Week ${week}`;
    const ranks = runPoll(state, label);
    pollNews(state, label, ranks);
  }
  forEachHuman(state, () => {
    weeklyPractice(state);
    if (state.day > 0 && ["regular", "confTourney", "ncaa"].includes(state.phase)) {
      const uc = state.coaches[state.user.coachId];
      weeklyInstall(state, { tactics: (uc?.skills.tactics ?? 5) + (state.staff ? staffEffects(state).tactics : 0), gamePrep: state.development?.practice === "gameprep" });
    }
  });
  const commits = decideRecruits(state, week);
  aiRecruitingWeek(state, week);
  refreshRecruitInterest(state);
  for (const r of commits) {
    commitNews(state, r, r.committed);
    if (r.decision?.userStatus === "lost" && r.stars >= 4 && r.committed) rivalryRecruit(state, r.committed, `${r.first} ${r.last}`, r.stars);
  }
  for (const p of Object.values(state.players)) {
    if (!p.teamId) continue;
    p.morale = clamp(p.morale + (65 - p.morale) * 0.04, 0, 100);
    if (p.stats.gp) p.followers = Math.round(p.followers * (1 + Math.min(0.04, p.stats.pts / p.stats.gp * 12e-4)));
  }
  if (rng.chance(0.7)) randomBuzz(state);
  chemistryWeek(state, week);
  forEachHuman(state, () => humanWeek(state, week, commits));
}
function humanWeek(state, week, commits) {
  const uid = state.user.teamId;
  for (const r of commits) {
    const userInvolved = r.schools.some((s) => s.teamId === uid && s.offered);
    if (userInvolved || r.committed === uid) {
      state.user.moments.push({ kind: "commit", recruitId: r.id, teamId: r.committed, others: [r.committed, ...userInvolved ? [uid] : [], ...r.decision?.odds.map((o) => o.teamId) ?? [], ...r.schools.map((s) => s.teamId)].filter((id, i, a) => a.indexOf(id) === i).slice(1, 4) });
      if (r.committed === uid) gainXp(state, 10 + r.stars * 6);
    }
  }
  state.user.hoursMax = hoursForWeek(state);
  state.user.hours = state.user.hoursMax;
  if (state.phase === "regular" || state.phase === "preseason") maybeWeeklyEvent(state);
  const staffMorale = state.staff ? staffEffects(state).morale : 0;
  for (const id of state.teams[uid].roster) {
    const p = state.players[id];
    if (!p) continue;
    if (staffMorale) p.morale = clamp(p.morale + staffMorale, 0, 100);
    if (!p.nil && p.ovr >= 55) p.morale = clamp(p.morale - 2, 0, 100);
  }
  lockerTick(state, week);
  boosterWeek(state);
  if (state.phase === "regular" || state.phase === "confTourney") rivalryWeek(state);
  radioWeekly(state);
}
function nextDay(state) {
  if (state.phase !== "preseason" && state.phase !== "regular" && state.phase !== "confTourney" && state.phase !== "selection" && state.phase !== "ncaa") return;
  const prevWeek = state.calendar[state.day]?.week ?? 0;
  if (state.day >= NCAA_LAST) {
    beginSeasonEnd(state);
    return;
  }
  state.day++;
  state.phase = phaseForDay(state.day);
  const week = state.calendar[state.day]?.week ?? prevWeek;
  if (state.day === CT_FIRST) {
    setupConfTourneys(state);
    addNews(state, { kind: "feature", headline: "Championship Week is here", body: "Thirty-two conference tournaments. Thirty-two automatic bids. Bubble teams, start sweating.", teams: [], important: true });
  }
  if (state.day === SELECTION_DAY) {
    computeRatings(state);
    const ranks = runPoll(state, "AP Poll \xB7 Final Regular Season");
    pollNews(state, "Final regular-season AP Poll", ranks);
    const field = buildNcaa(state);
    const user2 = field.find((e) => e.teamId === state.user.teamId);
    const ones = field.filter((e) => e.seed === 1).map((e) => state.teams[e.teamId].school);
    forEachHuman(state, () => {
      state.user.moments.push({ kind: "selection", season: state.season, press: selectionPresser(state, field) });
    });
    addNews(state, { kind: "bracket", headline: `The field of 68 is set \u2014 ${ones.join(", ")} earn No. 1 seeds`, body: `Selection Sunday delivered drama as the committee revealed the bracket. ${user2 ? `${state.teams[state.user.teamId].school} is in as a No. ${user2.seed} seed in the ${["East", "West", "South", "Midwest"][user2.region]} Region.` : `${state.teams[state.user.teamId].school} was left out of the field.`}`, teams: field.slice(0, 4).map((e) => e.teamId), important: true });
  }
  if (week > prevWeek) weeklyTick(state, week);
}

// src/engine/world.ts
function addHumanCoach(state, teamId, c) {
  const team = state.teams[teamId];
  if (!team) throw new Error(`Unknown team ${teamId}`);
  if (isHuman(state, teamId)) throw new Error(`${team.school} already has a human coach`);
  const L = ensureLeague(state);
  const displaced = state.coaches[team.coachId];
  if (displaced) delete state.coaches[displaced.id];
  const skills = blankSkills();
  for (const [k, v2] of Object.entries(ARCHETYPE_INFO[c.archetype].skills)) skills[k] += v2;
  const diffRep = state.settings.difficulty === "rookie" ? 10 : state.settings.difficulty === "legend" ? -10 : 0;
  const coach = {
    id: rng.id("c"),
    first: c.first,
    last: c.last,
    age: c.age,
    face: c.face,
    teamId,
    isUser: true,
    archetype: c.archetype,
    rating: 50,
    skills,
    xp: 0,
    level: 1,
    skillPoints: 2,
    reputation: clamp(Math.max(30, team.prestige * 0.7) + diffRep, 10, 90),
    salary: Math.round((2e5 + Math.exp(team.prestige * 0.05) * 3e4) / 1e4) * 1e4,
    contractYears: 5,
    jobSecurity: 70,
    mediaRep: 55,
    almaMater: c.almaMater,
    hometown: c.hometown,
    career: [],
    trophies: [],
    careerW: 0,
    careerL: 0
  };
  state.coaches[coach.id] = coach;
  team.coachId = coach.id;
  L.humans.push({ coachId: coach.id, name: `${c.first} ${c.last}`, data: blankCoachData(teamId, coach.id) });
  withHuman(state, coach.id, () => {
    seedUserBoard(state);
    setExpectations(state);
    initStaff(state, { vacantGM: true });
    state.user.hoursMax = hoursForWeek(state);
    state.user.hours = state.user.hoursMax;
    addNews(state, { kind: "coach", headline: `${team.school} names ${coach.first} ${coach.last} head coach`, body: `${team.school} has hired ${coach.first} ${coach.last} to lead the ${team.mascot}.`, teams: [teamId], important: true, personId: coach.id, personKind: "coach" });
    staffWelcomeInbox(state);
    welcomeInbox(state);
    ensureDevelopment(state);
    ensureBuild(state);
    chemistryNewSeason(state);
    state.user.press = introPresser(state);
    airEpisode(state, "preview", { debut: true });
  });
  return coach.id;
}

// server/league.ts
var IN_SEASON6 = ["preseason", "regular", "confTourney", "selection", "ncaa"];
var ID_RE = /^[A-Z0-9]{6}$/;
var TOKEN_RE = /^[a-z0-9]{24}$/;
var MAX_MEMBERS = 8;
var ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
var rand = (n, a = ALPHA) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => a[b % a.length]).join("");
var newToken = () => rand(24, "abcdefghijklmnopqrstuvwxyz0123456789");
var json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
var fail = (msg, status = 400) => json({ error: msg }, status);
var enc2 = (s) => new TextEncoder().encode(s);
var dec2 = (b) => new TextDecoder().decode(b);
async function loadMeta(store2, id) {
  const r = await store2.get(`leagues/${id}/meta.json`);
  return r ? { meta: JSON.parse(dec2(r.body)), etag: r.etag } : null;
}
async function loadState(store2, id) {
  const r = await store2.get(`leagues/${id}/state.json.gz`);
  return r ? { state: JSON.parse(dec2(gunzipSync(r.body))), etag: r.etag } : null;
}
var packState = (s) => new Uint8Array(gzipSync(enc2(JSON.stringify(s)), { level: 6 }));
var publicMeta = (m) => ({ ...m, members: m.members.map(({ token: _t, ...rest }) => rest) });
function labelOf(s) {
  const day = s.calendar[s.day]?.label ?? "";
  const phase = { preseason: "Preseason", regular: "Regular season", confTourney: "Championship Week", selection: "Selection Sunday", ncaa: "NCAA Tournament", seasonEnd: "Season over", declarations: "NBA Draft declarations", portal: "Transfer portal", signing: "Signing day", draft: "NBA Draft", progression: "Summer workouts", scheduling: "Scheduling" }[s.phase] ?? s.phase;
  return IN_SEASON6.includes(s.phase) ? `${phase} \xB7 ${day}` : s.phase === "portal" && s.portal?.day ? `${phase} \xB7 day ${s.portal.day}` : phase;
}
function syncMeta(meta, s) {
  meta.phase = s.phase;
  meta.season = s.season;
  meta.label = labelOf(s);
  for (const m of meta.members) {
    const c = s.coaches[m.coachId];
    if (c?.teamId) m.teamId = c.teamId;
  }
}
function note2(meta, text) {
  meta.log = [{ at: Date.now(), text }, ...meta.log].slice(0, 50);
}
function mergeTurn(S2, U, coachId) {
  if (U.user.coachId !== coachId) return "That save belongs to a different coach.";
  switchHuman(S2, coachId);
  const team = S2.user.teamId;
  if (U.user.teamId !== team) return "Your school changed. Reload the league.";
  S2.user = U.user;
  S2.inbox = U.inbox;
  S2.staff = U.staff;
  S2.development = U.development;
  S2.locker = U.locker;
  S2.scheduling = U.scheduling;
  S2.radio = U.radio;
  S2.playbook = U.playbook;
  if (S2.portal && U.portal) Object.assign(S2.portal, { hours: U.portal.hours, hoursMax: U.portal.hoursMax, calls: U.portal.calls, lastResults: U.portal.lastResults });
  const oldRoster = new Set(S2.teams[team].roster);
  S2.teams[team] = U.teams[team];
  S2.coaches[coachId] = U.coaches[coachId];
  for (const id of S2.teams[team].roster) if (U.players[id]) S2.players[id] = U.players[id];
  for (const id of oldRoster) if (!S2.teams[team].roster.includes(id)) {
    if (U.players[id]) S2.players[id] = U.players[id];
    else delete S2.players[id];
  }
  if (U.build?.[team]) (S2.build ??= {})[team] = U.build[team];
  for (const [id, r] of Object.entries(S2.recruits)) {
    const ur = U.recruits[id];
    if (!ur) continue;
    const mine = ur.schools.find((x) => x.teamId === team);
    r.schools = [...r.schools.filter((x) => x.teamId !== team), ...mine ? [mine] : []];
  }
  if (S2.portal && U.portal) {
    for (const [id, e] of Object.entries(S2.portal.entries)) {
      const ue = U.portal.entries[id];
      if (!ue) continue;
      e.offers = [...e.offers.filter((o) => o.teamId !== team), ...ue.offers.filter((o) => o.teamId === team)];
      if (ue.rel?.[team] != null) e.rel[team] = ue.rel[team];
      if (ue.visits?.includes(team) && !e.visits.includes(team)) e.visits.push(team);
    }
  }
  return null;
}
function runTurn(S2) {
  if (IN_SEASON6.includes(S2.phase)) {
    const startWeek = S2.calendar[S2.day]?.week ?? 0;
    for (let d = 0; d < 30; d++) {
      processDay(S2);
      nextDay(S2);
      if (S2.phase === "selection" || S2.phase === "seasonEnd") break;
      if ((S2.calendar[S2.day]?.week ?? 0) !== startWeek) break;
    }
    return labelOf(S2);
  }
  if (S2.phase === "seasonEnd") {
    for (const c of humanCoachIds(S2)) {
      switchHuman(S2, c);
      if (S2.user.fired && S2.user.offers.length) return `waiting:${c}`;
    }
  }
  advanceOffseason(S2);
  return labelOf(S2);
}
function leagueHandlers(store2) {
  async function update(id, fn) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const st = await loadState(store2, id), mt = await loadMeta(store2, id);
      if (!st || !mt) return fail("No league with that code.", 404);
      const res = fn(st.state, mt.meta);
      if (res && res.status >= 400) return res;
      syncMeta(mt.meta, st.state);
      if (!await store2.put(`leagues/${id}/state.json.gz`, packState(st.state), st.etag)) continue;
      await store2.put(`leagues/${id}/meta.json`, JSON.stringify(mt.meta));
      return res ?? json({ ok: true, meta: publicMeta(mt.meta) });
    }
    return fail("The league is busy. Try again in a moment.", 409);
  }
  const member = (meta, token) => token && TOKEN_RE.test(token) ? meta.members.find((m) => m.token === token) : void 0;
  return {
    async handle(request) {
      const u = new URL(request.url);
      const action = u.searchParams.get("action") ?? "";
      const id = (u.searchParams.get("league") ?? "").toUpperCase();
      const token = u.searchParams.get("token");
      try {
        if (action === "create" && request.method === "POST") {
          const name2 = (decodeURIComponent(request.headers.get("x-league-name") ?? "") || "Online League").slice(0, 40);
          const s = JSON.parse(dec2(gunzipSync(new Uint8Array(await request.arrayBuffer()))));
          if (!s?.teams || !s.user?.teamId) return fail("That is not a dynasty save.");
          if (s.league && s.league.humans.length > 1) return fail("That dynasty is already an online league.");
          ensureLeague(s);
          let lid = rand(6);
          for (let i = 0; i < 5 && await store2.get(`leagues/${lid}/meta.json`); i++) lid = rand(6);
          const c = s.coaches[s.user.coachId];
          const me2 = { coachId: s.user.coachId, name: `${c.first} ${c.last}`, teamId: s.user.teamId, token: newToken(), ready: false, joined: Date.now() };
          const meta = { id: lid, name: name2, created: Date.now(), commissioner: me2.coachId, version: 1, label: "", phase: "", season: s.season, members: [me2], log: [] };
          note2(meta, `${me2.name} started the league with ${s.teams[me2.teamId].school}.`);
          syncMeta(meta, s);
          await store2.put(`leagues/${lid}/state.json.gz`, packState(s));
          await store2.put(`leagues/${lid}/meta.json`, JSON.stringify(meta));
          return json({ league: lid, token: me2.token, coachId: me2.coachId, meta: publicMeta(meta) });
        }
        if (!ID_RE.test(id)) return fail("League codes are 6 letters and numbers.");
        if (action === "meta") {
          const mt2 = await loadMeta(store2, id);
          if (!mt2) return fail("No league with that code.", 404);
          const me2 = member(mt2.meta, token);
          return json({ meta: publicMeta(mt2.meta), me: me2 ? me2.coachId : null });
        }
        if (action === "join" && request.method === "POST") {
          const body = await request.json();
          const teamId = String(body.teamId ?? "");
          const co = body.coach ?? {};
          const first = String(co.first ?? "").trim().slice(0, 20), last = String(co.last ?? "").trim().slice(0, 20);
          const archetype = String(co.archetype ?? "Recruiter") in ARCHETYPE_INFO ? co.archetype : "Recruiter";
          if (!first || !last) return fail("Enter your coach\u2019s name.");
          let out;
          const res = await update(id, (s, meta) => {
            if (meta.members.length >= MAX_MEMBERS) return fail(`Leagues hold up to ${MAX_MEMBERS} coaches.`);
            if (!s.teams[teamId]) return fail("Pick a school.");
            if (isHuman(s, teamId)) return fail(`${s.teams[teamId].school} already has a coach in this league.`);
            const coachId = addHumanCoach(s, teamId, { first, last, age: Math.max(28, Math.min(70, Number(co.age) || 40)), archetype });
            out = { coachId, name: `${first} ${last}`, teamId, token: newToken(), ready: false, joined: Date.now() };
            meta.members.push(out);
            note2(meta, `${out.name} joined as head coach at ${s.teams[teamId].school}.`);
            return null;
          });
          if (res.status >= 400 || !out) return res;
          return json({ token: out.token, coachId: out.coachId, meta: (await res.json()).meta });
        }
        const mt = await loadMeta(store2, id);
        if (!mt) return fail("No league with that code.", 404);
        const me = member(mt.meta, token);
        if (!me) return fail("You are not a member of this league.", 403);
        if (action === "state") {
          const st = await loadState(store2, id);
          if (!st) return fail("No league with that code.", 404);
          switchHuman(st.state, me.coachId);
          return new Response(packState(st.state), { headers: { "content-type": "application/octet-stream", "cache-control": "no-store", "x-version": String(mt.meta.version) } });
        }
        if (action === "submit" && request.method === "POST") {
          const base = Number(u.searchParams.get("base"));
          const ready = u.searchParams.get("ready") === "1";
          const U = JSON.parse(dec2(gunzipSync(new Uint8Array(await request.arrayBuffer()))));
          return update(id, (s, meta) => {
            if (base !== meta.version) return fail("The league has moved on since you loaded it. Reload to get the latest week.", 409);
            const err = mergeTurn(s, U, me.coachId);
            if (err) return fail(err, 409);
            const m = meta.members.find((x) => x.coachId === me.coachId);
            m.ready = ready;
            return null;
          });
        }
        if (action === "ready" && request.method === "POST") {
          const ready = u.searchParams.get("ready") === "1";
          return update(id, (_s, meta) => {
            meta.members.find((x) => x.coachId === me.coachId).ready = ready;
            return null;
          });
        }
        if (action === "job" && request.method === "POST") {
          const teamId = u.searchParams.get("teamId") ?? "";
          return update(id, (s, meta) => {
            switchHuman(s, me.coachId);
            if (!s.user.offers.some((o) => o.teamId === teamId)) return fail("That job isn\u2019t on the table.");
            if (isHuman(s, teamId)) return fail("Another coach in the league already has that job.");
            takeJob(s, teamId);
            note2(meta, `${me.name} took the ${s.teams[teamId].school} job.`);
            return null;
          });
        }
        if (action === "advance" && request.method === "POST") {
          const allReady = mt.meta.members.every((m) => m.ready);
          if (!allReady && me.coachId !== mt.meta.commissioner) return fail("Waiting on every coach to click Ready (or the commissioner).", 403);
          let label = "";
          const res = await update(id, (s, meta) => {
            const out = runTurn(s);
            if (out.startsWith("waiting:")) {
              const who = meta.members.find((m) => m.coachId === out.slice(8));
              return fail(`Waiting on ${who?.name ?? "a coach"} to accept a job offer.`, 409);
            }
            label = out;
            meta.version++;
            meta.lastAdvanced = Date.now();
            for (const m of meta.members) m.ready = false;
            note2(meta, `Advanced to ${out}.`);
            return null;
          });
          if (res.status >= 400) return res;
          return json({ ok: true, label, meta: (await res.json()).meta });
        }
        return fail("Unknown action.");
      } catch (e) {
        return fail(`League server error: ${e.message}`, 500);
      }
    }
  };
}

// server/entry.ts
var store = {
  async get(path) {
    const h2 = await head2(path).catch(() => null);
    if (!h2) return null;
    const r = await get(path, { access: "private", useCache: false }).catch(() => null);
    if (!r || r.statusCode !== 200 || !r.stream) return null;
    return { body: new Uint8Array(await new Response(r.stream).arrayBuffer()), etag: h2.etag };
  },
  async put(path, body, ifMatch) {
    try {
      await put(path, typeof body === "string" ? body : Buffer.from(body), {
        access: "private",
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType: typeof body === "string" ? "application/json" : "application/octet-stream",
        ...ifMatch ? { ifMatch } : {}
      });
      return true;
    } catch (e) {
      if (!(e instanceof BlobPreconditionFailedError) || !ifMatch) throw e;
      const now = await head2(path).catch(() => null);
      if (now && now.etag !== ifMatch) return false;
      await put(path, typeof body === "string" ? body : Buffer.from(body), {
        access: "private",
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType: typeof body === "string" ? "application/json" : "application/octet-stream"
      });
      return true;
    }
  }
};
var h = leagueHandlers(store);
function GET(request) {
  return h.handle(request);
}
function POST(request) {
  return h.handle(request);
}
export {
  GET,
  POST
};
