import { memo, useId } from 'react';
import type { ReactNode } from 'react';
import {
  EYE_COLORS,
  HAIR_COLORS,
  SKIN_TONES,
  SUIT_COLORS,
  type FaceConfig,
  type FaceRole,
} from './faceGen';

export interface FaceProps {
  face: FaceConfig;
  /** rendered px (width = height). Default 96 */
  size?: number;
  /** team primary hex (jersey / polo / tie) */
  primary?: string;
  /** team secondary hex (trim, numbers) */
  secondary?: string;
  /** shown on the player jersey */
  jerseyNumber?: number | string;
  /** overrides face.role for clothing */
  role?: FaceRole;
  /** default 'circle' tinted with primary */
  background?: 'none' | 'circle' | 'card';
  className?: string;
  /** subtle bandage + medical badge overlay */
  injured?: boolean;
  /** accessible label; when omitted the SVG is aria-hidden */
  title?: string;
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

function toRgb(hex: string): RGB {
  let h = (hex || '').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (!/^[0-9a-fA-F]{6}/.test(h) || Number.isNaN(n)) return [110, 110, 120];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex([r, g, b]: RGB): string {
  const c = (x: number) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
function mix(a: string, b: string, t: number): string {
  const A = toRgb(a);
  const B = toRgb(b);
  return toHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}
function luminance(hex: string): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = toRgb(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Round numbers inside path templates to keep markup compact.
function P(strings: TemplateStringsArray, ...vals: number[]): string {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += String(Math.round(vals[i] * 100) / 100) + strings[i + 1];
  return out;
}

const idx = (v: number, n: number) => (Number.isFinite(v) ? Math.max(0, Math.min(n - 1, Math.round(v))) : 0);

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

interface Geo {
  top: number; // top of skull
  C: number; // temple line (center of cranium ellipse)
  ry: number; // cranium vertical radius
  w: number; // half width at temples / cheekbones
  jw: number; // half width at jaw corner
  jawY: number;
  cw: number; // half width of chin
  chinY: number;
  eyeY: number;
  browY: number;
  noseY: number;
  noseW: number;
  mouthY: number;
  mouthW: number;
  sbY: number; // sideburn bottom
  hcY: number; // hairline corner
  neckW: number;
}

const HEADS = [
  { top: 30, w: 36, jw: 27.5, jawY: 117, cw: 9.5, chinY: 135 }, // oval
  { top: 31, w: 38, jw: 31.5, jawY: 114, cw: 13.5, chinY: 133 }, // round
  { top: 30, w: 37, jw: 33, jawY: 121, cw: 15, chinY: 134.5 }, // square
  { top: 26.5, w: 35, jw: 28, jawY: 121, cw: 10.5, chinY: 138 }, // long
  { top: 30, w: 38, jw: 25.5, jawY: 115, cw: 7.5, chinY: 135 }, // heart
];
const WIDTH_DELTA = [-2.6, -1.3, 0, 1.3, 2.6];

const NOSES = [
  { w: 6.6, y: 104, tip: 1, hump: 0 }, // small
  { w: 7.6, y: 105, tip: 1.1, hump: 0 }, // medium
  { w: 8.7, y: 105.5, tip: 1.2, hump: 0 }, // broad
  { w: 9.9, y: 105, tip: 1.35, hump: 0 }, // wide
  { w: 7.2, y: 107.5, tip: 1.1, hump: 0 }, // long
  { w: 6.3, y: 106.5, tip: 0.85, hump: 1 }, // narrow
  { w: 8.4, y: 103.5, tip: 1.45, hump: 0 }, // button
];

function makeGeo(f: FaceConfig): Geo {
  const h = HEADS[idx(f.headShape, HEADS.length)];
  const dw = WIDTH_DELTA[idx(f.faceWidth, 5)];
  const nose = NOSES[idx(f.nose, NOSES.length)];
  const C = 70;
  const w = h.w + dw;
  const jw = h.jw + dw * 0.8;
  const eyeY = 86;
  const mouthY = Math.min(nose.y + 11.5, h.chinY - 16.5);
  return {
    top: h.top,
    C,
    ry: C - h.top,
    w,
    jw,
    jawY: h.jawY,
    cw: h.cw + dw * 0.3,
    chinY: h.chinY,
    eyeY,
    browY: eyeY - 9.8,
    noseY: nose.y,
    noseW: nose.w,
    mouthY,
    mouthW: 10 + (nose.w - 7.5) * 0.35 + idx(f.lips, 3) * 0.5,
    sbY: 87,
    hcY: [64, 63, 61][idx(f.hairline, 3)],
    neckW: [17, 18.8, 21][idx(f.build, 3)],
  };
}

function headPath(g: Geo, grow = 0): string {
  const w = g.w + grow;
  const jw = g.jw + grow;
  const cw = g.cw + grow * 0.6;
  const chin = g.chinY + grow;
  const { C, jawY } = g;
  const ry = g.ry + grow;
  return (
    P`M ${100 - w} ${C} A ${w} ${ry} 0 0 1 ${100 + w} ${C} ` +
    P`C ${100 + w} ${C + 20} ${100 + jw + 3} ${jawY - 12} ${100 + jw} ${jawY} ` +
    P`C ${100 + jw - 2.5} ${jawY + 9} ${100 + cw + 8} ${chin} ${100 + cw} ${chin} ` +
    P`Q 100 ${chin + 1.8} ${100 - cw} ${chin} ` +
    P`C ${100 - cw - 8} ${chin} ${100 - jw + 2.5} ${jawY + 9} ${100 - jw} ${jawY} ` +
    P`C ${100 - jw - 3} ${jawY - 12} ${100 - w} ${C + 20} ${100 - w} ${C} Z`
  );
}

/** hairline from right temple corner to left temple corner (continuation segment) */
function hairlineSeg(g: Geo, kind: number): string {
  const { w, top } = g;
  const R = 100 + w - 3.2;
  const L = 100 - w + 3.2;
  // y of the skull outline at horizontal offset dx from center
  const skullY = (dx: number) => g.C - g.ry * Math.sqrt(Math.max(0, 1 - (dx / w) * (dx / w)));
  if (kind === 1) {
    // mature: temples pulled back into a soft M (kept inside the skull outline)
    const dx = w - 12;
    const ry = skullY(dx) + 4.5;
    const cy = top + 17.5;
    return (
      P`C ${R - 0.5} ${ry + 12} ${100 + dx + 5} ${ry} ${100 + dx} ${ry} ` +
      P`C ${100 + dx - 7} ${ry} ${100 + 9} ${cy} ${100} ${cy} ` +
      P`C ${100 - 9} ${cy} ${100 - dx + 7} ${ry} ${100 - dx} ${ry} ` +
      P`C ${100 - dx - 5} ${ry} ${L + 0.5} ${ry + 12} ${L} ${g.hcY}`
    );
  }
  if (kind === 2) {
    // receding: deep temples, thin forelock
    const dx = w - 15.5;
    const ry = skullY(dx) + 4;
    const cy = Math.max(top + 12.5, ry + 2.5);
    return (
      P`C ${R - 1.5} ${ry + 14} ${100 + dx + 6} ${ry} ${100 + dx} ${ry} ` +
      P`C ${100 + dx - 6} ${ry} ${100 + 6} ${cy} ${100} ${cy} ` +
      P`C ${100 - 6} ${cy} ${100 - dx + 6} ${ry} ${100 - dx} ${ry} ` +
      P`C ${100 - dx - 6} ${ry} ${L + 1.5} ${ry + 14} ${L} ${g.hcY}`
    );
  }
  const cy = top + 20;
  return (
    P`C ${R - 0.5} ${top + 27} ${100 + w - 8} ${cy + 0.5} ${100 + 13} ${cy} ` +
    P`Q 100 ${cy - 1.4} ${100 - 13} ${cy} ` +
    P`C ${100 - w + 8} ${cy + 0.5} ${L + 0.5} ${top + 27} ${L} ${g.hcY}`
  );
}

/** Skull-hugging hair cap of thickness t, bounded by the hairline. */
function capPath(g: Geo, t: number, hairline: number, sb = g.sbY): string {
  const { w, C, ry } = g;
  const ts = t * 0.55;
  return (
    P`M ${100 - w + 3.2} ${sb} L ${100 - w - ts} ${sb} L ${100 - w - ts} ${C} ` +
    P`A ${w + ts} ${ry + t} 0 0 1 ${100 + w + ts} ${C} L ${100 + w + ts} ${sb} L ${100 + w - 3.2} ${sb} L ${100 + w - 3.2} ${g.hcY} ` +
    hairlineSeg(g, hairline) +
    ' Z'
  );
}

/** Dome over the top of the skull reaching down to yb at the sides. */
function domePath(g: Geo, t: number, yb: number, extraW = 0): string {
  const { w, top } = g;
  const W = w + extraW;
  return (
    P`M ${100 - W} ${yb} C ${100 - W - 0.5} ${top + 4} ${100 - W * 0.55} ${top - t} 100 ${top - t} ` +
    P`C ${100 + W * 0.55} ${top - t} ${100 + W + 0.5} ${top + 4} ${100 + W} ${yb} Z`
  );
}

/** Scalloped elliptical arc (a0→a1 in degrees, SVG orientation). Returns an open path starting with M. */
function bumpyArc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number, amp: number): string {
  let d = '';
  const rad = Math.PI / 180;
  for (let i = 0; i <= n; i++) {
    const a = (a0 + ((a1 - a0) * i) / n) * rad;
    const x = cx + rx * Math.cos(a);
    const y = cy + ry * Math.sin(a);
    if (i === 0) d += P`M ${x} ${y}`;
    else {
      const am = (a0 + ((a1 - a0) * (i - 0.5)) / n) * rad;
      const k = 1 + amp;
      d += P` Q ${cx + rx * k * Math.cos(am)} ${cy + ry * k * Math.sin(am)} ${x} ${y}`;
    }
  }
  return d;
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

interface Pal {
  skin: string;
  shadow: string;
  deep: string;
  lip: string;
  lipDark: string;
  hair: string;
  hairDark: string;
  hairLight: string;
  brow: string;
  part: string;
  eye: string;
  sclera: string;
  lash: string;
  light: number; // 0 light skin → 1 deep
}

function makePalette(f: FaceConfig): Pal {
  const st = idx(f.skinTone, SKIN_TONES.length);
  const skin = SKIN_TONES[st];
  const t = st / (SKIN_TONES.length - 1);
  const hc = idx(f.hairColor, HAIR_COLORS.length);
  const hair = HAIR_COLORS[hc];
  const isDarkHair = hc <= 2;
  const lipTarget = mix('#B8615C', '#4A2321', t);
  const lip = mix(skin, lipTarget, 0.42);
  const hairLight = isDarkHair ? mix(hair, '#9AA6B6', 0.32) : mix(hair, '#FFF4E0', 0.3);
  const brow = hc >= 9 ? mix(hair, '#3A3634', 0.35) : hc >= 5 ? mix(hair, '#3A2A1C', 0.3) : hair;
  return {
    skin,
    shadow: mix(skin, t > 0.6 ? '#1E0E08' : '#5A2E22', t > 0.6 ? 0.3 : 0.28),
    deep: mix(skin, '#1A0B07', t > 0.6 ? 0.55 : 0.5),
    lip,
    lipDark: mix(lip, '#2A0E0C', 0.22),
    hair,
    hairDark: mix(hair, '#000000', 0.38),
    hairLight,
    brow,
    part: mix(skin, hair, 0.35),
    eye: EYE_COLORS[idx(f.eyeColor, EYE_COLORS.length)],
    sclera: t > 0.6 ? '#E9E2D9' : '#F6F2EC',
    lash: '#1F140E',
    light: t,
  };
}

// ---------------------------------------------------------------------------
// Hair
// ---------------------------------------------------------------------------

interface HairOut {
  back: ReactNode;
  front: ReactNode;
}

function strand(d: string, c: Pal, wOuter: number, key: string | number, hi = true): ReactNode {
  return (
    <g key={key}>
      <path d={d} stroke={c.hairDark} strokeWidth={wOuter} strokeLinecap="round" fill="none" />
      <path d={d} stroke={c.hair} strokeWidth={wOuter - 1.6} strokeLinecap="round" fill="none" />
      {hi && <path d={d} stroke={c.hairLight} strokeWidth={1.1} strokeLinecap="round" fill="none" opacity={0.4} transform="translate(-0.9 -0.6)" />}
    </g>
  );
}

function renderHair(f: FaceConfig, g: Geo, c: Pal, id: (s: string) => string): HairOut {
  const style = idx(f.hairStyle, 24);
  const hl = idx(f.hairline, 3);
  const { w, top, C, sbY } = g;
  const url = (s: string) => `url(#${id(s)})`;
  const clipHair = url('hc');
  const shine = (
    <ellipse cx={100 - w * 0.36} cy={top + 12} rx={10} ry={5} fill="#FFFFFF" opacity={0.13} transform={P`rotate(-22 ${100 - w * 0.36} ${top + 12})`} />
  );
  const fadeCap = (t: number, grad: 'fl' | 'fh' | 'tp') => <path d={capPath(g, t, hl)} fill={url(grad)} />;
  const topHi = (o = 0.28) => (
    <path
      d={P`M ${100 - w * 0.62} ${top + 10} Q ${100 - w * 0.3} ${top - 1} ${100 + 4} ${top + 0.5}`}
      stroke={c.hairLight}
      strokeWidth={2.4}
      strokeLinecap="round"
      fill="none"
      opacity={o}
      clipPath={clipHair}
    />
  );

  switch (style) {
    case 0: // bald
      return {
        back: null,
        front: (
          <g>
            <path d={capPath(g, 0, 0)} fill={c.hair} opacity={0.06} />
            {shine}
          </g>
        ),
      };
    case 1: // buzz
      return {
        back: null,
        front: (
          <g>
            <path d={capPath(g, 1.2, hl)} fill={c.hair} opacity={0.86} />
            {topHi(0.18)}
          </g>
        ),
      };
    case 2: // crew cut
      return {
        back: null,
        front: (
          <g>
            {fadeCap(2.2, 'tp')}
            <path d={domePath(g, 4, C - 12, 1)} fill={c.hair} clipPath={clipHair} />
            <path
              d={P`M ${100 - 16} ${top + 21} Q ${100 - 4} ${top + 15} ${100 + 14} ${top + 19}`}
              stroke={c.hair}
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
              clipPath={clipHair}
            />
            {topHi(0.3)}
            <path d={P`M ${100 - 6} ${top + 6} Q ${100 + 6} ${top + 1} ${100 + 18} ${top + 6}`} stroke={c.hairDark} strokeWidth={1} fill="none" opacity={0.5} strokeLinecap="round" />
          </g>
        ),
      };
    case 3: // low fade
      return {
        back: null,
        front: (
          <g>
            {fadeCap(2, 'fl')}
            <path d={domePath(g, 3.2, C - 10, 0.5)} fill={c.hair} clipPath={clipHair} />
            {topHi(0.25)}
          </g>
        ),
      };
    case 4: // high fade
      return {
        back: null,
        front: (
          <g>
            {fadeCap(1, 'fh')}
            <path d={domePath(g, 4.5, C - 20, -1)} fill={c.hair} clipPath={clipHair} />
            {topHi(0.25)}
          </g>
        ),
      };
    case 5: {
      // waves
      const waves: ReactNode[] = [];
      for (let r = 0; r < 4; r++) {
        const y = top + 3 + r * 5.2;
        let d = P`M ${100 - w - 2} ${y + 3}`;
        for (let x = 100 - w - 2, k = 0; x < 100 + w + 2; x += 7, k++) {
          d += P` q 3.5 ${k % 2 ? 2.4 : -2.4} 7 0`;
        }
        waves.push(<path key={r} d={d} stroke={c.hairLight} strokeWidth={1.3} fill="none" opacity={0.42} />);
      }
      return {
        back: null,
        front: (
          <g>
            {fadeCap(2, 'fl')}
            <path d={domePath(g, 2.6, C - 12, 0.3)} fill={c.hair} clipPath={clipHair} />
            <g clipPath={url('cap')}>{waves}</g>
          </g>
        ),
      };
    }
    case 6: {
      // high-top
      const box =
        P`M ${100 - w + 0.5} ${C - 12} C ${100 - w} ${top + 4} ${100 - w - 1} ${top - 6} ${100 - w - 0.5} ${top - 11} Q ${100 - w} ${top - 16.5} ${100 - w + 6} ${top - 16.5} ` +
        P`L ${100 + w - 6} ${top - 17.5} Q ${100 + w} ${top - 17.5} ${100 + w + 0.5} ${top - 12} C ${100 + w + 1} ${top - 6} ${100 + w} ${top + 4} ${100 + w - 0.5} ${C - 12} Z`;
      return {
        back: null,
        front: (
          <g>
            {fadeCap(1, 'fh')}
            <path d={box} fill={c.hair} clipPath={clipHair} />
            <path d={P`M ${100 - w + 3.5} ${top - 11} L ${100 - w + 4} ${top + 6}`} stroke={c.hairLight} strokeWidth={2.4} opacity={0.2} strokeLinecap="round" />
            <path d={P`M ${100 - w + 6} ${top - 14} L ${100 + w - 8} ${top - 15}`} stroke={c.hairLight} strokeWidth={1.8} opacity={0.32} strokeLinecap="round" />
            <path d={P`M ${100 - 12} ${top - 10} l 0.5 9 M ${100 + 2} ${top - 11} l 0.4 10 M ${100 + 16} ${top - 11} l 0 8`} stroke={c.hairDark} strokeWidth={1.1} opacity={0.4} strokeLinecap="round" />
          </g>
        ),
      };
    }
    case 7: // short afro
    case 8: {
      // afro
      const big = style === 8;
      const rx = w + (big ? 15 : 6.5);
      const ry = g.ry + (big ? 15 : 8);
      const cy = C - (big ? 2 : 5);
      const yb = big ? 98 : sbY - 2;
      const n = big ? 22 : 17;
      const outline =
        bumpyArc(100, cy, rx, ry, big ? 150 : 165, big ? 390 : 375, n, big ? 0.045 : 0.05) +
        P` L ${100 + w - 4} ${yb} L ${100 - w + 4} ${yb} Z`;
      const texture: ReactNode[] = [];
      const pts = big
        ? [
            [-34, -26], [-18, -36], [2, -40], [20, -34], [34, -22], [-42, -6], [42, -8], [-8, -28], [12, -24], [-26, -14], [28, -10],
          ]
        : [
            [-26, -24], [-10, -32], [8, -32], [24, -24], [-34, -8], [34, -10], [0, -24],
          ];
      pts.forEach(([dx, dy], i) => {
        const x = 100 + dx;
        const y = C + dy;
        texture.push(
          <path key={i} d={P`M ${x - 2.6} ${y + 1} q 2.6 -3.4 5.2 0`} stroke={c.hairDark} strokeWidth={1.1} fill="none" opacity={0.5} strokeLinecap="round" />,
        );
      });
      return {
        back: (
          <g>
            <path d={outline} fill={c.hair} />
            <path d={bumpyArc(100, cy, rx - 1.5, ry - 1.5, 200, 260, 5, 0.05)} stroke={c.hairLight} strokeWidth={2.4} fill="none" opacity={0.28} strokeLinecap="round" />
          </g>
        ),
        front: (
          <g>
            <path d={capPath(g, 0, hl)} fill={c.hair} />
            <g clipPath={url('hc')}>{texture}</g>
          </g>
        ),
      };
    }
    case 9: {
      // twists
      const items: ReactNode[] = [];
      const rows = [
        { y: top + 4, n: 6, spread: w - 12, len: 9.5 },
        { y: top + 10, n: 7, spread: w - 5, len: 9.5 },
        { y: top + 17, n: 6, spread: w - 8, len: 8 },
      ];
      rows.forEach((row, ri) => {
        for (let i = 0; i < row.n; i++) {
          const u = row.n === 1 ? 0 : (i / (row.n - 1)) * 2 - 1; // -1..1
          const bx = 100 + u * row.spread;
          const by = row.y + Math.abs(u) * (ri === 2 ? 3 : 5);
          const ex = bx + u * 4.5;
          const ey = by - row.len + Math.abs(u) * 2.5;
          const d = P`M ${bx} ${by} Q ${bx + u * 1.2 + 1.4} ${(by + ey) / 2} ${ex} ${ey}`;
          items.push(strand(d, c, 7.4, `${ri}-${i}`));
        }
      });
      return {
        back: null,
        front: (
          <g>
            {fadeCap(1.4, 'fl')}
            <path d={domePath(g, 1, C - 14, -1)} fill={c.hair} clipPath={clipHair} />
            <g clipPath={url('hc')}>{items}</g>
          </g>
        ),
      };
    }
    case 10: {
      // short locs (hanging)
      const back: ReactNode[] = [];
      const front: ReactNode[] = [];
      for (const s of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          const x0 = 100 + s * (w - 6 - k * 5);
          const d = P`M ${x0} ${top + 8 + k * 2} Q ${100 + s * (w + 7 - k * 1.5)} ${C - 4} ${100 + s * (w + 4 - k * 1.5)} ${102 - k * 6}`;
          back.push(strand(d, c, 6.4, `b${s}${k}`, false));
        }
      }
      const fr = [-3, -2, -1, 0, 1, 2, 3];
      fr.forEach((i) => {
        const x0 = 100 + i * 4.5;
        const x1 = 100 + i * 9.2;
        const y1 = top + 21 + Math.abs(i) * 2.2 + (i === 0 ? 1 : 0);
        front.push(strand(P`M ${x0} ${top + 1} Q ${(x0 + x1) / 2 + i * 1.6} ${top + 4} ${x1} ${y1}`, c, 6.4, `f${i}`));
      });
      for (const s of [-1, 1]) {
        front.push(strand(P`M ${100 + s * (w - 9)} ${top + 6} Q ${100 + s * (w + 3)} ${top + 16} ${100 + s * (w + 1.5)} ${C + 12}`, c, 6.4, `s${s}`));
        front.push(strand(P`M ${100 + s * (w - 18)} ${top + 3} Q ${100 + s * (w - 2)} ${top + 10} ${100 + s * (w - 3)} ${top + 30}`, c, 6.4, `t${s}`));
      }
      return {
        back: <g>{back}</g>,
        front: (
          <g>
            <path d={capPath(g, 3, hl)} fill={c.hair} />
            {front}
          </g>
        ),
      };
    }
    case 11: {
      // locs gathered into a high bun
      const bcx = 100;
      const bcy = top - 8;
      const bun = bumpyArc(bcx, bcy, 16.5, 12, 0, 360, 10, 0.11) + ' Z';
      const loops: ReactNode[] = [];
      const arcs = [
        [-11, 2, -4, -10], [-5, 3, 3, -12], [2, 3, 10, -9], [8, 2, 13, -4], [-13, -3, -8, -12],
      ];
      arcs.forEach(([x0, y0, x1, y1], i) => {
        loops.push(
          <path key={i} d={P`M ${bcx + x0} ${bcy + y0} Q ${bcx + (x0 + x1) / 2 - 3} ${bcy + (y0 + y1) / 2 - 2} ${bcx + x1} ${bcy + y1}`} stroke={c.hairDark} strokeWidth={1.2} fill="none" opacity={0.6} strokeLinecap="round" />,
        );
      });
      const lines: ReactNode[] = [];
      for (let i = -3; i <= 3; i++) {
        lines.push(
          <path key={i} d={P`M ${100 + i * 9} ${top + 30} Q ${100 + i * 7} ${top + 10} ${100 + i * 1.2} ${top - 4}`} stroke={c.part} strokeWidth={1.1} fill="none" opacity={0.7} />,
        );
        lines.push(
          <path key={`h${i}`} d={P`M ${100 + i * 9 + 4.5} ${top + 30} Q ${100 + i * 7 + 3.5} ${top + 10} ${100 + i * 1.2 + 0.6} ${top - 4}`} stroke={c.hairLight} strokeWidth={1.5} fill="none" opacity={0.25} />,
        );
      }
      return {
        back: (
          <g>
            <path d={bun} fill={c.hair} stroke={c.hairDark} strokeWidth={1.2} strokeLinejoin="round" />
            {loops}
            <path d={P`M ${bcx - 9} ${bcy - 5} Q ${bcx - 3} ${bcy - 10} ${bcx + 4} ${bcy - 9}`} stroke={c.hairLight} strokeWidth={1.8} fill="none" opacity={0.35} strokeLinecap="round" />
          </g>
        ),
        front: (
          <g>
            <path d={capPath(g, 2.2, hl)} fill={c.hair} />
            <g clipPath={url('cap')}>{lines}</g>
            <path d={P`M ${100 - 8} ${top - 1.2} Q 100 ${top - 3.4} ${100 + 8} ${top - 1.2}`} stroke={c.hairDark} strokeWidth={3.2} fill="none" strokeLinecap="round" />
          </g>
        ),
      };
    }
    case 12: {
      // cornrows
      const rows: ReactNode[] = [];
      for (let i = -5; i <= 5; i++) {
        const d = P`M ${100 + i * 9} ${sbY + 4} Q ${100 + i * 7.6} ${top + 12} ${100 + i * 2.2} ${top - 10}`;
        rows.push(<path key={`p${i}`} d={d} stroke={c.part} strokeWidth={1.2} fill="none" opacity={0.85} />);
        const d2 = P`M ${100 + i * 9 + 4.4} ${sbY + 4} Q ${100 + i * 7.6 + 3.7} ${top + 12} ${100 + i * 2.2 + 1.1} ${top - 10}`;
        rows.push(<path key={`h${i}`} d={d2} stroke={c.hairLight} strokeWidth={1.6} fill="none" opacity={0.3} strokeDasharray="2.2 1.6" />);
      }
      return {
        back: null,
        front: (
          <g>
            <path d={capPath(g, 1.8, hl)} fill={c.hair} />
            <g clipPath={url('cap')}>{rows}</g>
          </g>
        ),
      };
    }
    case 13: {
      // box braids
      const back: ReactNode[] = [];
      const front: ReactNode[] = [];
      const braid = (d: string, key: string) => (
        <g key={key}>
          <path d={d} stroke={c.hairDark} strokeWidth={5.6} strokeLinecap="round" fill="none" />
          <path d={d} stroke={c.hair} strokeWidth={4} strokeLinecap="round" fill="none" />
          <path d={d} stroke={c.hairLight} strokeWidth={3} strokeLinecap="butt" fill="none" strokeDasharray="1.4 2.2" opacity={0.4} />
        </g>
      );
      for (const s of [-1, 1]) {
        for (let k = 0; k < 4; k++) {
          back.push(braid(P`M ${100 + s * (w - 10 + k * 3)} ${C - 18} Q ${100 + s * (w + 6 + k * 2.5)} ${C + 20} ${100 + s * (w + 3 + k * 4.5)} ${172}`, `b${s}${k}`));
        }
        front.push(braid(P`M ${100 + s * (w - 5)} ${C - 12} Q ${100 + s * (w + 3)} ${C + 18} ${100 + s * (w + 4)} ${166}`, `f${s}`));
        front.push(braid(P`M ${100 + s * (w - 9)} ${C - 18} Q ${100 + s * (w + 0.5)} ${C + 16} ${100 + s * (w + 9)} ${170}`, `g${s}`));
      }
      const parts: ReactNode[] = [];
      for (let i = -3; i <= 3; i++) {
        parts.push(<path key={i} d={P`M ${100 + i * 9.5} ${top + 30} Q ${100 + i * 8} ${top + 8} ${100 + i * 3} ${top - 6}`} stroke={c.part} strokeWidth={1.1} fill="none" opacity={0.75} />);
      }
      parts.push(<path key="h1" d={P`M ${100 - w} ${top + 12} Q 100 ${top + 4} ${100 + w} ${top + 12}`} stroke={c.part} strokeWidth={1} fill="none" opacity={0.6} />);
      return {
        back: <g>{back}</g>,
        front: (
          <g>
            <path d={capPath(g, 2, hl)} fill={c.hair} />
            <g clipPath={url('cap')}>{parts}</g>
            {front}
          </g>
        ),
      };
    }
    case 14: {
      // curly top
      const outline = bumpyArc(100, C - 13, w + 1.5, g.ry - 2, 178, 362, 13, 0.085) + P` L ${100 + w} ${C} L ${100 - w} ${C} Z`;
      const curls: ReactNode[] = [];
      const pts = [
        [-20, -42], [-4, -47], [12, -45], [-28, -30], [26, -32], [-12, -34], [4, -37], [17, -28], [-22, -21],
      ];
      pts.forEach(([dx, dy], i) => {
        const x = 100 + dx;
        const y = C + dy + 4;
        curls.push(<path key={i} d={P`M ${x - 3} ${y + 0.5} q 1 -3.6 4.4 -2.4 q 1.8 0.9 0.8 3`} stroke={i % 3 === 0 ? c.hairLight : c.hairDark} strokeWidth={1.2} fill="none" opacity={i % 3 === 0 ? 0.4 : 0.5} strokeLinecap="round" />);
      });
      return {
        back: null,
        front: (
          <g>
            {fadeCap(1.4, 'fl')}
            <g clipPath={clipHair}>
              <path d={outline} fill={c.hair} />
              {curls}
            </g>
          </g>
        ),
      };
    }
    case 15: {
      // textured crop with fringe
      let fringe = P`M ${100 - w + 0.5} ${C - 6} C ${100 - w - 0.5} ${top + 2} ${100 - w * 0.55} ${top - 4.5} 100 ${top - 4.5} C ${100 + w * 0.55} ${top - 4.5} ${100 + w + 0.5} ${top + 2} ${100 + w - 0.5} ${C - 6}`;
      fringe += P` L ${100 + w - 5} ${top + 22}`;
      const n = 9;
      for (let i = 1; i <= n; i++) {
        const x = 100 + w - 5 - ((2 * w - 10) * i) / n;
        const y = top + (i % 2 ? 26.5 : 21.5) + Math.sin(i * 1.7) * 0.6;
        fringe += P` L ${x} ${y}`;
      }
      fringe += ' Z';
      const strokes: ReactNode[] = [];
      for (let i = -3; i <= 3; i++) {
        strokes.push(<path key={i} d={P`M ${100 + i * 8 + 2} ${top + 6} L ${100 + i * 8 - 1.5} ${top + 20}`} stroke={c.hairDark} strokeWidth={1.1} opacity={0.5} strokeLinecap="round" />);
      }
      return {
        back: null,
        front: (
          <g>
            {fadeCap(1.4, 'fl')}
            <path d={fringe} fill={c.hair} strokeLinejoin="round" stroke={c.hair} strokeWidth={1} />
            {strokes}
            {topHi(0.3)}
          </g>
        ),
      };
    }
    case 16: {
      // side part
      const px = 100 - 13;
      const vol =
        P`M ${px} ${top + 19} C ${px + 8} ${top + 12} ${100 + 18} ${top + 13} ${100 + w - 1} ${top + 25} ` +
        P`L ${100 + w + 2} ${top + 8} L ${px} ${top - 6} Z`;
      return {
        back: null,
        front: (
          <g>
            {fadeCap(3.4, 'tp')}
            <path d={domePath(g, 4.5, C - 12, 1.4)} fill={c.hair} clipPath={clipHair} />
            <path d={vol} fill={c.hair} clipPath={hl ? clipHair : undefined} />
            <path d={P`M ${px} ${top + 19} Q ${px - 1.5} ${top + 8} ${px + 2} ${top - 2}`} stroke={c.part} strokeWidth={1.2} fill="none" strokeLinecap="round" />
            <path d={P`M ${px + 4} ${top + 13} C ${px + 12} ${top + 6} ${100 + 16} ${top + 7} ${100 + w - 4} ${top + 16}`} stroke={c.hairLight} strokeWidth={1.8} fill="none" opacity={0.35} strokeLinecap="round" />
            <path d={P`M ${px + 3} ${top + 5} C ${px + 12} ${top + 0} ${100 + 12} ${top + 1} ${100 + w - 8} ${top + 9}`} stroke={c.hairLight} strokeWidth={1.4} fill="none" opacity={0.25} strokeLinecap="round" />
            <path d={P`M ${px - 3} ${top + 8} Q ${100 - w + 6} ${top + 10} ${100 - w + 3} ${top + 22}`} stroke={c.hairDark} strokeWidth={1} fill="none" opacity={0.5} strokeLinecap="round" />
          </g>
        ),
      };
    }
    case 17: {
      // slick back
      const lines: ReactNode[] = [];
      for (let i = -3; i <= 3; i++) {
        lines.push(
          <path
            key={i}
            d={P`M ${100 + i * 8.5} ${top + 21 - Math.abs(i) * 0.5} Q ${100 + i * 7.5} ${top + 6} ${100 + i * 4} ${top - 4}`}
            stroke={i % 2 ? c.hairDark : c.hairLight}
            strokeWidth={i % 2 ? 1 : 1.6}
            fill="none"
            opacity={i % 2 ? 0.5 : 0.38}
            strokeLinecap="round"
          />,
        );
      }
      return {
        back: null,
        front: (
          <g>
            {fadeCap(3.5, 'tp')}
            <path d={domePath(g, 6, C - 10, 1.2)} fill={c.hair} clipPath={clipHair} />
            <g clipPath={clipHair}>{lines}</g>
          </g>
        ),
      };
    }
    case 18: {
      // pompadour
      const quiff =
        P`M ${100 - w + 1} ${C - 4} C ${100 - w} ${top + 2} ${100 - w + 9} ${top - 12} ${100 - 2} ${top - 13} ` +
        P`C ${100 + 14} ${top - 14} ${100 + w + 1} ${top - 5} ${100 + w - 0.5} ${C - 4} Z`;
      return {
        back: null,
        front: (
          <g>
            {fadeCap(1.8, 'fl')}
            <path d={quiff} fill={c.hair} clipPath={clipHair} />
            <path d={P`M ${100 - w + 8} ${top + 6} C ${100 - w + 10} ${top - 6} ${100 - 4} ${top - 10} ${100 + 12} ${top - 8}`} stroke={c.hairLight} strokeWidth={2} fill="none" opacity={0.35} strokeLinecap="round" />
            <path d={P`M ${100 - w + 14} ${top + 14} C ${100 - w + 16} ${top + 2} ${100 + 2} ${top - 4} ${100 + 18} ${top - 1}`} stroke={c.hairDark} strokeWidth={1.1} fill="none" opacity={0.45} strokeLinecap="round" />
          </g>
        ),
      };
    }
    case 19: {
      // flow (longer hair, swept back, tucked behind the ears)
      const W = w + 4.5;
      const mass =
        P`M ${100 - W} ${C - 6} A ${W} ${g.ry + 6} 0 0 1 ${100 + W} ${C - 6} ` +
        P`C ${100 + W + 1} ${C + 14} ${100 + W} ${C + 26} ${100 + W + 5} ${C + 38} ` +
        P`Q ${100 + W - 2} ${C + 42} ${100 + w - 6} ${C + 36} L ${100 - w + 6} ${C + 36} ` +
        P`Q ${100 - W + 2} ${C + 42} ${100 - W - 5} ${C + 38} C ${100 - W} ${C + 26} ${100 - W - 1} ${C + 14} ${100 - W} ${C - 6} Z`;
      const lock = (s: number) =>
        P`M ${100 + s * (w - 3.2)} ${g.hcY + 2} C ${100 + s * (w + 1)} ${C + 3} ${100 + s * (w + 4.5)} ${C + 7} ${100 + s * (w + 8)} ${C + 13} ` +
        P`L ${100 + s * (w + 9.5)} ${C + 5} C ${100 + s * (w + 7)} ${C - 6} ${100 + s * (w + 3)} ${C - 14} ${100 + s * (w - 2)} ${C - 18} Z`;
      const strandF =
        P`M ${100 - 4} ${top + 17} C ${100 - 11} ${top + 23} ${100 - 16} ${top + 29} ${100 - 17.5} ${top + 35} ` +
        P`C ${100 - 13} ${top + 29} ${100 - 8} ${top + 23} ${100 + 1} ${top + 19} Z`;
      return {
        back: (
          <g>
            <path d={mass} fill={c.hair} />
            <path d={mass} fill={c.hairDark} opacity={0.3} />
          </g>
        ),
        front: (
          <g>
            <path d={capPath(g, 3.5, hl)} fill={c.hair} />
            <path d={domePath(g, 7, C - 8, 2.5)} fill={c.hair} clipPath={clipHair} />
            <path d={lock(-1)} fill={c.hair} />
            <path d={lock(1)} fill={c.hair} />
            <path d={lock(1)} fill={c.hairDark} opacity={0.2} />
            <path d={strandF} fill={c.hair} />
            <path d={P`M ${100 - w + 5} ${top + 14} C ${100 - 14} ${top - 2} ${100 + 8} ${top - 6} ${100 + w - 4} ${top + 6}`} stroke={c.hairLight} strokeWidth={2} fill="none" opacity={0.35} strokeLinecap="round" />
            <path d={P`M ${100 - 6} ${top + 16} C ${100 - 2} ${top + 6} ${100 + 12} ${top + 3} ${100 + w - 2} ${top + 16}`} stroke={c.hairDark} strokeWidth={1.1} fill="none" opacity={0.45} strokeLinecap="round" />
            <path d={P`M ${100 - w + 8} ${top + 18} C ${100 - w + 10} ${top + 8} ${100 - 10} ${top + 4} ${100 - 2} ${top + 6}`} stroke={c.hairDark} strokeWidth={1} fill="none" opacity={0.4} strokeLinecap="round" />
          </g>
        ),
      };
    }
    case 20: {
      // man bun
      const lines: ReactNode[] = [];
      for (let i = -3; i <= 3; i++) {
        lines.push(<path key={i} d={P`M ${100 + i * 9} ${top + 24} Q ${100 + i * 7} ${top + 8} ${100 + i * 2} ${top - 2}`} stroke={i % 2 ? c.hairDark : c.hairLight} strokeWidth={1.2} fill="none" opacity={0.4} strokeLinecap="round" />);
      }
      return {
        back: (
          <g>
            <circle cx={100} cy={top - 5} r={10.5} fill={c.hair} stroke={c.hairDark} strokeWidth={1.2} />
            <path d={P`M ${100 - 6} ${top - 9} Q ${100 - 2} ${top - 14} ${100 + 4} ${top - 12}`} stroke={c.hairLight} strokeWidth={1.6} fill="none" opacity={0.4} strokeLinecap="round" />
          </g>
        ),
        front: (
          <g>
            <path d={capPath(g, 2, hl)} fill={c.hair} />
            <g clipPath={clipHair}>{lines}</g>
            <rect x={100 - 6.5} y={top - 3.4} width={13} height={3.6} rx={1.8} fill={c.hairDark} />
          </g>
        ),
      };
    }
    case 21: {
      // mohawk
      const strip =
        P`M ${100 - 11} ${top + 26} L ${100 - 13} ${top + 2} L ${100 - 11} ${top - 8} L ${100 - 6} ${top - 5} L ${100 - 3.5} ${top - 14} ` +
        P`L ${100 + 1} ${top - 7} L ${100 + 5} ${top - 15} L ${100 + 8} ${top - 5} L ${100 + 12} ${top - 7} L ${100 + 13} ${top + 2} L ${100 + 11} ${top + 26} Z`;
      return {
        back: null,
        front: (
          <g>
            <path d={capPath(g, 0.6, hl)} fill={c.hair} opacity={0.3} />
            <g clipPath={clipHair}>
              <path d={strip} fill={c.hair} stroke={c.hair} strokeWidth={2} strokeLinejoin="round" />
              <path d={P`M ${100 - 7} ${top + 18} L ${100 - 7} ${top - 2}`} stroke={c.hairLight} strokeWidth={1.6} opacity={0.32} strokeLinecap="round" />
            </g>
          </g>
        ),
      };
    }
    case 22: {
      // spiky
      let d = '';
      const n = 13;
      for (let i = 0; i <= n; i++) {
        const a = ((192 + (156 * i) / n) * Math.PI) / 180;
        const r = i % 2 ? 1.12 + (i % 4 === 1 ? 0.03 : 0) : 1.0;
        const x = 100 + (w + 1) * r * Math.cos(a);
        const y = C - 4 + (g.ry + 1) * r * Math.sin(a);
        d += i === 0 ? P`M ${x} ${y}` : P` L ${x} ${y}`;
      }
      d += P` L ${100 + w} ${C} L ${100 - w} ${C} Z`;
      return {
        back: null,
        front: (
          <g>
            {fadeCap(1.8, 'fl')}
            <g clipPath={clipHair}>
              <path d={d} fill={c.hair} stroke={c.hair} strokeWidth={1.6} strokeLinejoin="round" />
            </g>
            {topHi(0.3)}
          </g>
        ),
      };
    }
    case 23:
    default: {
      // balding (horseshoe)
      const side = (s: number) =>
        P`M ${100 + s * (w - 3.2)} ${sbY} L ${100 + s * (w + 1.4)} ${sbY} L ${100 + s * (w + 1.6)} ${C - 6} ` +
        P`C ${100 + s * (w + 1.2)} ${C - 16} ${100 + s * (w - 3)} ${C - 22} ${100 + s * (w - 7)} ${C - 21} ` +
        P`C ${100 + s * (w - 5)} ${C - 14} ${100 + s * (w - 3.5)} ${C - 8} ${100 + s * (w - 3.2)} ${sbY} Z`;
      return {
        back: null,
        front: (
          <g>
            <path d={capPath(g, 0.6, 2)} fill={c.hair} opacity={0.14} />
            <path d={side(-1)} fill={c.hair} />
            <path d={side(1)} fill={c.hair} />
            {shine}
          </g>
        ),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Facial features
// ---------------------------------------------------------------------------

const EYE_DX = 15.8;
const EYE_SHAPES = [
  { a: 7.4, hu: 4.0, hl: 2.7, tilt: 0.5, crease: 1, hood: 0 }, // almond
  { a: 7.0, hu: 4.7, hl: 3.3, tilt: 0, crease: 1, hood: 0 }, // round
  { a: 7.6, hu: 3.3, hl: 2.2, tilt: 0.2, crease: 0, hood: 0 }, // narrow
  { a: 7.4, hu: 3.8, hl: 2.7, tilt: -0.4, crease: 1, hood: 1 }, // hooded
  { a: 7.5, hu: 3.5, hl: 2.3, tilt: 1.5, crease: 0, hood: 0 }, // upturned
];

function Eye({ f, g, c, s, clipId }: { f: FaceConfig; g: Geo; c: Pal; s: number; clipId: string }) {
  const e = EYE_SHAPES[idx(f.eyeShape, EYE_SHAPES.length)];
  const ex = 100 + s * EYE_DX;
  const ey = g.eyeY;
  const ix = ex - s * e.a; // inner corner x
  const ox = ex + s * e.a; // outer corner x
  const iy = ey + 0.4;
  const oy = ey - e.tilt;
  const upper = P`M ${ix} ${iy} C ${ex - s * e.a * 0.55} ${ey - e.hu * 1.3} ${ex + s * e.a * 0.45} ${ey - e.hu * 1.35} ${ox} ${oy}`;
  const lower = P`C ${ex + s * e.a * 0.5} ${ey + e.hl * 1.25} ${ex - s * e.a * 0.5} ${ey + e.hl * 1.3} ${ix} ${iy} Z`;
  const shape = upper + ' ' + lower;
  const irisR = e.hu > 4.4 ? 3.9 : 3.65;
  return (
    <g>
      <clipPath id={clipId}>
        <path d={shape} />
      </clipPath>
      {/* socket shading */}
      <path d={P`M ${ix - s * 1} ${iy - 1} Q ${ex} ${ey - e.hu * 2.4 - 1.5} ${ox + s * 1.2} ${oy - 0.5}`} stroke={c.shadow} strokeWidth={2.4} opacity={0.18} fill="none" strokeLinecap="round" />
      <path d={shape} fill={c.sclera} />
      <g clipPath={`url(#${clipId})`}>
        <circle cx={ex + s * 0.3} cy={ey + 0.1} r={irisR} fill={c.eye} />
        <circle cx={ex + s * 0.3} cy={ey + 0.1} r={irisR} fill="none" stroke="#000" strokeOpacity={0.35} strokeWidth={0.6} />
        <circle cx={ex + s * 0.3} cy={ey + 0.1} r={1.75} fill="#0D0907" />
        <circle cx={ex + s * 0.3 - 1.3} cy={ey - 1.2} r={1} fill="#FFFFFF" opacity={0.9} />
        {/* lid shadow on eyeball */}
        <path d={upper + P` L ${ox} ${oy - 4} L ${ix} ${iy - 4} Z`} fill="#000" opacity={0.1} transform="translate(0 1.1)" />
        {e.hood ? <path d={upper + P` L ${ox} ${oy - 6} L ${ix} ${iy - 6} Z`} fill={c.skin} transform="translate(0 1.2)" /> : null}
      </g>
      <path d={upper} stroke={c.lash} strokeWidth={1.75} fill="none" strokeLinecap="round" transform={e.hood ? 'translate(0 1.1)' : undefined} />
      <path d={P`M ${ox - s * 0.6} ${oy + 0.2} l ${s * 1.6} ${-0.9}`} stroke={c.lash} strokeWidth={1.2} strokeLinecap="round" />
      <path d={P`M ${ox} ${oy} ` + lower.replace(' Z', '')} stroke={c.deep} strokeWidth={0.7} fill="none" opacity={0.35} />
      {e.crease ? (
        <path
          d={P`M ${ix + s * 1.4} ${iy - 3.2} C ${ex - s * e.a * 0.4} ${ey - e.hu * 1.3 - 2.6} ${ex + s * e.a * 0.4} ${ey - e.hu * 1.35 - 2.4} ${ox - s * 0.6} ${oy - 2}`}
          stroke={c.deep}
          strokeWidth={0.8}
          fill="none"
          opacity={0.32}
          strokeLinecap="round"
        />
      ) : null}
      {e.hood ? (
        <path d={P`M ${ix + s * 1} ${iy - 2.6} C ${ex - s * 2} ${ey - e.hu - 3} ${ex + s * 3} ${ey - e.hu - 3} ${ox + s * 1.6} ${oy - 0.5}`} stroke={c.shadow} strokeWidth={1.1} fill="none" opacity={0.55} strokeLinecap="round" />
      ) : null}
    </g>
  );
}

const BROWS = [
  { th: 3.0, arch: 1.8, tilt: 0.3, len: 15.5, taper: 0.5, drop: 0 }, // natural
  { th: 2.7, arch: 3.0, tilt: 0.4, len: 15.5, taper: 0.45, drop: 0.3 }, // arched
  { th: 2.1, arch: 2.3, tilt: 0.6, len: 15, taper: 0.5, drop: 0 }, // thin
  { th: 3.6, arch: 0.8, tilt: 0, len: 16.5, taper: 0.75, drop: 0 }, // straight thick
  { th: 3.2, arch: 1.2, tilt: 1.3, len: 15.5, taper: 0.55, drop: 1.7 }, // stern
  { th: 4.1, arch: 1.9, tilt: 0.2, len: 17, taper: 0.7, drop: 0.3 }, // bushy
];

function Brow({ f, g, c, s }: { f: FaceConfig; g: Geo; c: Pal; s: number }) {
  const b = BROWS[idx(f.eyebrows, BROWS.length)];
  const by = g.browY;
  const xi = 100 + s * 6.4;
  const yi = by + b.drop;
  const xo = 100 + s * (6.4 + b.len);
  const yo = by + 1.6 - b.tilt;
  const xp = 100 + s * (6.4 + b.len * 0.6);
  const yp = by - b.arch;
  const th = b.th;
  const d =
    P`M ${xi} ${yi - th * 0.55} ` +
    P`Q ${xi + s * b.len * 0.32} ${yp - th * 0.55} ${xp} ${yp - th * 0.45} ` +
    P`Q ${xp + s * b.len * 0.24} ${yp - th * 0.25} ${xo} ${yo} ` +
    P`Q ${xp + s * b.len * 0.2} ${yp + th * b.taper * 0.95} ${xp} ${yp + th * b.taper} ` +
    P`Q ${xi + s * b.len * 0.32} ${yp + th * 0.6} ${xi} ${yi + th * 0.5} ` +
    P`Q ${xi - s * 1.1} ${yi} ${xi} ${yi - th * 0.55} Z`;
  return <path d={d} fill={c.brow} />;
}

function Nose({ f, g, c }: { f: FaceConfig; g: Geo; c: Pal }) {
  const n = NOSES[idx(f.nose, NOSES.length)];
  const y = n.y;
  const w = n.w;
  const ey = g.eyeY;
  return (
    <g>
      {/* bridge shadow (light from upper-left) */}
      <path
        d={P`M ${100 + 2.4} ${ey + 1} C ${100 + 3.4 + n.hump} ${ey + 8} ${100 + w * 0.7} ${y - 9} ${100 + w * 0.82} ${y - 4} L ${100 + w * 0.42} ${y - 4.6} C ${100 + 1.8} ${y - 10} ${100 + 1.2 + n.hump * 0.6} ${ey + 8} ${100 + 0.8} ${ey + 1} Z`}
        fill={c.shadow}
        opacity={0.3}
      />
      {/* under-nose shadow */}
      <ellipse cx={100 + 0.8} cy={y + 2.2} rx={w * 0.75} ry={1.5} fill={c.shadow} opacity={0.28} />
      {/* wings & tip */}
      <path
        d={
          P`M ${100 - w} ${y - 4.8} C ${100 - w - 1.8} ${y - 2.2} ${100 - w + 0.6} ${y + 0.9} ${100 - w + 3.2} ${y + 0.1} ` +
          P`Q 100 ${y + 2.4 * n.tip} ${100 + w - 3.2} ${y + 0.1} C ${100 + w - 0.6} ${y + 0.9} ${100 + w + 1.8} ${y - 2.2} ${100 + w} ${y - 4.8}`
        }
        stroke={c.deep}
        strokeWidth={1.25}
        fill="none"
        opacity={0.5}
        strokeLinecap="round"
      />
      <ellipse cx={100 - w + 3.6} cy={y - 0.6} rx={1.55} ry={0.85} fill={c.deep} opacity={0.55} transform={P`rotate(20 ${100 - w + 3.6} ${y - 0.6})`} />
      <ellipse cx={100 + w - 3.6} cy={y - 0.6} rx={1.55} ry={0.85} fill={c.deep} opacity={0.55} transform={P`rotate(-20 ${100 + w - 3.6} ${y - 0.6})`} />
      <ellipse cx={100 - 1.2} cy={y - 3.8} rx={1.9} ry={1.4} fill="#FFFFFF" opacity={0.2} />
    </g>
  );
}

const EXPR = [
  { dl: 0, dr: 0, mid: 0.7, open: 0 }, // neutral
  { dl: -1.6, dr: -1.6, mid: 1.4, open: 0 }, // slight smile
  { dl: -2.4, dr: -2.4, mid: 1.6, open: 3.2 }, // smile
  { dl: 0.3, dr: -2.2, mid: 0.7, open: 0 }, // smirk
  { dl: 1, dr: 1, mid: -0.3, open: 0 }, // serious
];

function Mouth({ f, g, c }: { f: FaceConfig; g: Geo; c: Pal }) {
  const e = EXPR[idx(f.mouth, EXPR.length)];
  const fl = [0.72, 1, 1.32][idx(f.lips, 3)];
  const my = g.mouthY;
  const mw = g.mouthW;
  const Lx = 100 - mw;
  const Ly = my + e.dl;
  const Rx = 100 + mw;
  const Ry = my + e.dr;
  const ctrl = my + e.mid * 2 - (e.dl + e.dr) / 2;
  const line = P`M ${Lx} ${Ly} Q 100 ${ctrl} ${Rx} ${Ry}`;
  const back = P`Q 100 ${ctrl} ${Lx} ${Ly}`;
  const upper =
    P`M ${Lx} ${Ly} Q ${100 - mw * 0.5} ${my - 2.4 * fl + e.dl * 0.3} ${100 - 2.2} ${my - 2.6 * fl} ` +
    P`Q 100 ${my - 1.7 * fl} ${100 + 2.2} ${my - 2.6 * fl} Q ${100 + mw * 0.5} ${my - 2.4 * fl + e.dr * 0.3} ${Rx} ${Ry} ` +
    back +
    ' Z';
  const lowY = ctrl / 2 + my / 2 + e.open;
  const lower =
    P`M ${Lx + 0.6} ${Ly + 0.2} C ${100 - mw * 0.55} ${lowY + 4.6 * fl} ${100 + mw * 0.55} ${lowY + 4.6 * fl} ${Rx - 0.6} ${Ry + 0.2} ` +
    P`Q 100 ${ctrl + e.open * 2} ${Lx + 0.6} ${Ly + 0.2} Z`;
  const opening = e.open
    ? P`M ${Lx + 0.6} ${Ly + 0.2} Q 100 ${ctrl} ${Rx - 0.6} ${Ry + 0.2} Q 100 ${ctrl + e.open * 2} ${Lx + 0.6} ${Ly + 0.2} Z`
    : '';
  const teeth = e.open
    ? P`M ${Lx + 1.6} ${Ly + 0.3} Q 100 ${ctrl} ${Rx - 1.6} ${Ry + 0.3} L ${Rx - 2.4} ${Ry + 1.3} Q 100 ${ctrl + 2.6} ${Lx + 2.4} ${Ly + 1.3} Z`
    : '';
  return (
    <g>
      <ellipse cx={100 + 0.5} cy={lowY + 5.4 * fl + 2} rx={5} ry={1.5} fill={c.shadow} opacity={0.3} />
      <path d={lower} fill={c.lip} />
      <ellipse cx={100 - 1.6} cy={lowY + 2.2 * fl} rx={3.2} ry={0.9} fill="#FFFFFF" opacity={0.16} />
      {e.open ? <path d={opening} fill="#3A1A18" /> : null}
      {e.open ? <path d={teeth} fill="#F4EFE8" /> : null}
      <path d={upper} fill={c.lipDark} />
      <path d={line} stroke={c.deep} strokeWidth={1.25} fill="none" strokeLinecap="round" opacity={0.85} />
      {e.dl < -1 ? <path d={P`M ${Lx - 1.2} ${Ly - 1.8} q -1 1.6 0.2 3.2`} stroke={c.shadow} strokeWidth={0.9} fill="none" opacity={0.5} strokeLinecap="round" /> : null}
      {e.dr < -1 ? <path d={P`M ${Rx + 1.2} ${Ry - 1.8} q 1 1.6 -0.2 3.2`} stroke={c.shadow} strokeWidth={0.9} fill="none" opacity={0.5} strokeLinecap="round" /> : null}
    </g>
  );
}

function beardRegion(g: Geo, bulk: number, cheekY: number): string {
  const { w, jw, jawY, cw, chinY, noseY, mouthY } = g;
  const b = bulk;
  const top = 84;
  const ch = chinY + b;
  return (
    P`M ${100 - w - 0.3} ${top} C ${100 - w - b * 0.2} ${96} ${100 - jw - 3 - b} ${jawY - 8} ${100 - jw - b} ${jawY + b * 0.4} ` +
    P`C ${100 - jw + 2.5 - b * 0.4} ${jawY + 9 + b} ${100 - cw - 8} ${ch} ${100 - cw} ${ch} Q 100 ${ch + 1.8 + b * 0.3} ${100 + cw} ${ch} ` +
    P`C ${100 + cw + 8} ${ch} ${100 + jw - 2.5 + b * 0.4} ${jawY + 9 + b} ${100 + jw + b} ${jawY + b * 0.4} ` +
    P`C ${100 + jw + 3 + b} ${jawY - 8} ${100 + w + b * 0.2} ${96} ${100 + w + 0.3} ${top} ` +
    P`L ${100 + w - 4.5} ${top} C ${100 + w - 5} ${cheekY - 6} ${100 + jw - 5} ${cheekY} ${100 + 13.5} ${mouthY - 2} ` +
    P`C ${100 + 11.5} ${noseY + 1.5} ${100 + 6} ${noseY + 1.8} 100 ${noseY + 2.4} ` +
    P`C ${100 - 6} ${noseY + 1.8} ${100 - 11.5} ${noseY + 1.5} ${100 - 13.5} ${mouthY - 2} ` +
    P`C ${100 - jw + 5} ${cheekY} ${100 - w + 5} ${cheekY - 6} ${100 - w + 4.5} ${top} Z`
  );
}

function mustachePath(g: Geo): string {
  const { noseY, mouthY, mouthW } = g;
  const mw = mouthW + 0.8;
  const top = Math.max(noseY + 2.6, mouthY - 7.5);
  const bot = mouthY - 2.1;
  return (
    P`M ${100 - mw} ${mouthY + 1.4} C ${100 - mw + 0.6} ${top + 1.2} ${100 - 5} ${top - 0.2} 100 ${top + 0.8} ` +
    P`C ${100 + 5} ${top - 0.2} ${100 + mw - 0.6} ${top + 1.2} ${100 + mw} ${mouthY + 1.4} ` +
    P`C ${100 + mw - 1.6} ${bot + 0.4} ${100 + 5} ${bot - 0.2} 100 ${bot + 0.3} ` +
    P`C ${100 - 5} ${bot - 0.2} ${100 - mw + 1.6} ${bot + 0.4} ${100 - mw} ${mouthY + 1.4} Z`
  );
}

function goateePath(g: Geo): string {
  const { mouthY, chinY, cw } = g;
  const tw = 8.5; // half width under the lip corners
  const bw = Math.min(Math.max(cw - 1, 6.5), 9); // half width at chin
  const lip = mouthY + 4.6;
  return (
    P`M ${100 - tw} ${mouthY + 2.6} C ${100 - tw - 0.6} ${mouthY + 8} ${100 - bw - 1} ${chinY - 4} ${100 - bw + 1} ${chinY + 0.6} ` +
    P`Q 100 ${chinY + 3.6} ${100 + bw - 1} ${chinY + 0.6} C ${100 + bw + 1} ${chinY - 4} ${100 + tw + 0.6} ${mouthY + 8} ${100 + tw} ${mouthY + 2.6} ` +
    P`C ${100 + 5} ${lip + 2.4} ${100 + 2} ${lip + 0.6} 100 ${lip + 1.6} C ${100 - 2} ${lip + 0.6} ${100 - 5} ${lip + 2.4} ${100 - tw} ${mouthY + 2.6} Z`
  );
}

function FacialHair({ f, g, c, headClip, jawClip }: { f: FaceConfig; g: Geo; c: Pal; headClip: string; jawClip: string }) {
  const kind = idx(f.facialHair, 8);
  if (kind === 0) return null;
  const col = c.hair;
  switch (kind) {
    case 1: // stubble
      return <path d={beardRegion(g, 0, 104)} fill={mix(col, '#000000', 0.2)} opacity={c.light > 0.6 ? 0.34 : 0.22} clipPath={headClip} />;
    case 2: // mustache
      return <path d={mustachePath(g)} fill={col} opacity={f.age < 25 ? 0.85 : 1} />;
    case 3: // goatee
      return (
        <g>
          <path d={goateePath(g)} fill={col} />
          <path d={P`M ${100 - 3} ${g.chinY - 1} Q 100 ${g.chinY + 1} ${100 + 3} ${g.chinY - 1}`} stroke={c.hairLight} strokeWidth={1.2} opacity={0.3} fill="none" strokeLinecap="round" />
        </g>
      );
    case 4: // circle beard
      return (
        <g>
          <path d={beardRegion(g, 0, 104)} fill={mix(col, '#000000', 0.2)} opacity={c.light > 0.6 ? 0.22 : 0.14} clipPath={headClip} />
          <path d={mustachePath(g)} fill={col} />
          <path d={goateePath(g)} fill={col} />
          <path d={P`M ${100 - g.mouthW - 0.4} ${g.mouthY + 1} Q ${100 - g.mouthW - 0.8} ${g.mouthY + 4.5} ${100 - 8.2} ${g.mouthY + 6.5}`} stroke={col} strokeWidth={2.6} strokeLinecap="round" fill="none" />
          <path d={P`M ${100 + g.mouthW + 0.4} ${g.mouthY + 1} Q ${100 + g.mouthW + 0.8} ${g.mouthY + 4.5} ${100 + 8.2} ${g.mouthY + 6.5}`} stroke={col} strokeWidth={2.6} strokeLinecap="round" fill="none" />
        </g>
      );
    case 5: // chin strap
      return (
        <g clipPath={headClip}>
          <path d={headPath(g)} fill="none" stroke={col} strokeWidth={5.2} clipPath={jawClip} />
        </g>
      );
    case 6: // short beard
      return (
        <g>
          <path d={beardRegion(g, 1, 101)} fill={col} />
          <path d={mustachePath(g)} fill={col} />
          <path d={beardRegion(g, 1, 101)} fill={c.hairDark} opacity={0.18} clipPath={headClip} />
        </g>
      );
    case 7: // full beard
    default:
      return (
        <g>
          <path d={beardRegion(g, 4.5, 99)} fill={col} />
          <path d={mustachePath(g)} fill={col} />
          <path d={P`M ${100 - g.jw + 2} ${g.jawY + 4} Q ${100 - g.cw - 4} ${g.chinY + 6} 100 ${g.chinY + 6.5}`} stroke={c.hairLight} strokeWidth={1.4} fill="none" opacity={0.3} strokeLinecap="round" />
          <path d={P`M ${100 + 6} ${g.chinY + 3} Q ${100 + g.cw + 5} ${g.chinY + 1} ${100 + g.jw - 2} ${g.jawY + 2}`} stroke={c.hairDark} strokeWidth={1.2} fill="none" opacity={0.4} strokeLinecap="round" />
        </g>
      );
  }
}

function Wrinkles({ f, g, c }: { f: FaceConfig; g: Geo; c: Pal }) {
  const lvl = idx(f.wrinkles, 3);
  if (!lvl) return null;
  const n = NOSES[idx(f.nose, NOSES.length)];
  const op = 0.38;
  const items: ReactNode[] = [];
  for (const s of [-1, 1]) {
    items.push(
      <path
        key={`nl${s}`}
        d={P`M ${100 + s * (n.w + 1.8)} ${n.y - 4} Q ${100 + s * (n.w + 4.5)} ${n.y + 4} ${100 + s * (g.mouthW + 2.6)} ${g.mouthY + 3}`}
        stroke={c.shadow}
        strokeWidth={1.1}
        fill="none"
        opacity={op + 0.08}
        strokeLinecap="round"
      />,
    );
    const ox = 100 + s * (EYE_DX + 9.2);
    items.push(<path key={`cf${s}`} d={P`M ${ox} ${g.eyeY - 1} l ${s * 3} -1.4 M ${ox} ${g.eyeY + 1.2} l ${s * 3} 1.2`} stroke={c.shadow} strokeWidth={0.8} opacity={op} strokeLinecap="round" />);
    if (lvl > 1) {
      items.push(<path key={`ub${s}`} d={P`M ${100 + s * 10.5} ${g.eyeY + 4.8} Q ${100 + s * 15.5} ${g.eyeY + 7.4} ${100 + s * 21} ${g.eyeY + 4.6}`} stroke={c.shadow} strokeWidth={0.8} fill="none" opacity={op} strokeLinecap="round" />);
    }
  }
  if (lvl > 1) {
    const fy = g.browY - 9;
    items.push(<path key="f1" d={P`M ${100 - 13} ${fy} Q 100 ${fy - 2.2} ${100 + 13} ${fy}`} stroke={c.shadow} strokeWidth={0.9} fill="none" opacity={op} strokeLinecap="round" />);
    items.push(<path key="f2" d={P`M ${100 - 10} ${fy - 4.5} Q 100 ${fy - 6.5} ${100 + 10} ${fy - 4.5}`} stroke={c.shadow} strokeWidth={0.9} fill="none" opacity={op - 0.08} strokeLinecap="round" />);
    items.push(<path key="g1" d={P`M ${100 - 2.5} ${g.browY - 1} l 0.4 3.4`} stroke={c.shadow} strokeWidth={0.8} opacity={op} strokeLinecap="round" />);
  }
  return <g>{items}</g>;
}

function SkinDetail({ f, g, c }: { f: FaceConfig; g: Geo; c: Pal }) {
  const k = idx(f.skinDetail, 3);
  if (k === 1) {
    const col = mix(c.skin, '#7A3A1C', 0.42);
    const pts = [
      [-17, 96], [-13, 98.5], [-20, 99.5], [-10, 95.5], [-15, 101.5], [17, 96], [13, 98.5], [20, 99.5], [10, 95.5], [15, 101.5], [-3, 96], [3, 96.5], [0, 99],
    ];
    return (
      <g fill={col} opacity={0.55}>
        {pts.map(([x, y], i) => (
          <circle key={i} cx={100 + x} cy={y + (g.eyeY - 86)} r={0.75} />
        ))}
      </g>
    );
  }
  if (k === 2) return <circle cx={100 + 15} cy={g.mouthY - 5} r={1} fill={c.deep} opacity={0.7} />;
  return null;
}

function Ear({ f, g, c, s }: { f: FaceConfig; g: Geo; c: Pal; s: number }) {
  const k = [0.86, 1, 1.14][idx(f.ears, 3)];
  const x0 = 100 + s * (g.w - 2.6);
  const cy = g.eyeY + 6;
  const y = (dy: number) => cy + dy * k;
  const outer = P`M ${x0} ${y(-11)} C ${x0 + s * 9 * k} ${y(-17)} ${x0 + s * 11 * k} ${y(3)} ${x0 + s * 4.2 * k} ${y(12)} C ${x0 + s * 2} ${y(15)} ${x0 - s * 1} ${y(13)} ${x0 - s * 1} ${y(9)} Z`;
  const inner = P`M ${x0 + s * 1.6} ${y(-8)} C ${x0 + s * 7 * k} ${y(-11)} ${x0 + s * 7.6 * k} ${y(1)} ${x0 + s * 3.2 * k} ${y(7)}`;
  return (
    <g>
      <path d={outer} fill={c.skin} />
      {s > 0 ? <path d={outer} fill={c.shadow} opacity={0.22} /> : null}
      <path d={inner} stroke={c.shadow} strokeWidth={1.6} fill="none" opacity={0.55} strokeLinecap="round" />
      <path d={P`M ${x0 + s * 1.5} ${y(-2)} q ${s * 2.4} 1 ${s * 1.4} ${4.4}`} stroke={c.shadow} strokeWidth={1.2} fill="none" opacity={0.45} strokeLinecap="round" />
    </g>
  );
}

function Earrings({ f, g, s }: { f: FaceConfig; g: Geo; s: number }) {
  const n = idx(f.earrings, 3);
  if (n === 0 || (n === 1 && s < 0)) return null;
  const k = [0.86, 1, 1.14][idx(f.ears, 3)];
  const x = 100 + s * (g.w + 1.4 * k);
  const y = g.eyeY + 6 + 11.5 * k;
  return (
    <g>
      <circle cx={x} cy={y} r={1.9} fill="#E9EEF5" stroke="#8D97A3" strokeWidth={0.6} />
      <circle cx={x - 0.5} cy={y - 0.5} r={0.6} fill="#FFFFFF" />
    </g>
  );
}

function Glasses({ f, g }: { f: FaceConfig; g: Geo }) {
  const k = idx(f.glasses, 5);
  if (!k) return null;
  const ey = g.eyeY;
  const frame = k === 2 ? '#6A4424' : k === 3 ? '#8C8F96' : '#1C1C21';
  const sw = k === 3 ? 1.4 : 2.1;
  const lens = (s: number) => {
    const cx = 100 + s * EYE_DX;
    if (k === 3) return <circle key={s} cx={cx} cy={ey + 0.5} r={8.4} />;
    return <rect key={s} x={cx - 10} y={ey - 6} width={20} height={12.6} rx={3.6} />;
  };
  const arms = [-1, 1].map((s) => (
    <path key={`a${s}`} d={P`M ${100 + s * (k === 3 ? EYE_DX + 8.2 : EYE_DX + 9.8)} ${ey - 2} L ${100 + s * (g.w - 0.5)} ${ey - 3}`} stroke={frame} strokeWidth={sw} strokeLinecap="round" />
  ));
  const bridge = <path d={P`M ${100 - EYE_DX + 9.6} ${ey - 1.4} Q 100 ${ey - 4} ${100 + EYE_DX - 9.6} ${ey - 1.4}`} stroke={frame} strokeWidth={sw * 0.85} fill="none" strokeLinecap="round" />;
  const glare = [-1, 1].map((s) => (
    <path key={`g${s}`} d={P`M ${100 + s * EYE_DX - 5.4} ${ey + 3.6} L ${100 + s * EYE_DX - 0.6} ${ey - 3.6}`} stroke="#FFFFFF" strokeWidth={1.3} opacity={0.38} strokeLinecap="round" />
  ));
  if (k === 4) {
    // browline: heavy top bar, thin metal lower rim
    return (
      <g>
        {arms}
        <g fill="#FFFFFF" fillOpacity={0.1} stroke="#9A9DA3" strokeWidth={1}>
          {lens(-1)}
          {lens(1)}
        </g>
        {[-1, 1].map((s) => (
          <path key={`t${s}`} d={P`M ${100 + s * 6} ${ey - 4.6} Q ${100 + s * 6} ${ey - 6.8} ${100 + s * 9} ${ey - 6.6} L ${100 + s * 23.6} ${ey - 6.6} Q ${100 + s * 25.6} ${ey - 6.4} ${100 + s * 25.6} ${ey - 2.4}`} stroke={frame} strokeWidth={3.1} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {bridge}
        {glare}
      </g>
    );
  }
  return (
    <g>
      {arms}
      <g fill="#FFFFFF" fillOpacity={0.12} stroke={frame} strokeWidth={sw}>
        {lens(-1)}
        {lens(1)}
      </g>
      {bridge}
      {glare}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Body & clothing
// ---------------------------------------------------------------------------

interface Team {
  primary: string;
  secondary: string;
  primaryDark: string;
  primaryLight: string;
  accent: string; // readable secondary on primary
}

function makeTeam(primary?: string, secondary?: string): Team {
  const p = primary && /^#?[0-9a-fA-F]{3,6}$/.test(primary.trim()) ? (primary.startsWith('#') ? primary : `#${primary}`) : '#24467A';
  const s = secondary && /^#?[0-9a-fA-F]{3,6}$/.test(secondary.trim()) ? (secondary.startsWith('#') ? secondary : `#${secondary}`) : '#FFFFFF';
  let accent = s;
  if (contrast(p, s) < 1.9) accent = luminance(p) > 0.4 ? '#141414' : '#FFFFFF';
  return { primary: p, secondary: s, primaryDark: mix(p, '#000000', 0.32), primaryLight: mix(p, '#FFFFFF', 0.18), accent };
}

function torsoPath(g: Geo, build: number): string {
  const nw = g.neckW;
  const sw = [0, 4, 9][build];
  return (
    P`M ${100 - nw - 1} 132 C ${100 - nw - 3} 141 ${100 - nw - 12} 145 ${100 - nw - 28 - sw * 0.4} 148 ` +
    P`C ${44 - sw} 151 ${24 - sw} 157 ${15 - sw} 169 C ${9 - sw} 178 ${6 - sw} 190 ${5 - sw} 206 ` +
    P`L ${195 + sw} 206 C ${194 + sw} 190 ${191 + sw} 178 ${185 + sw} 169 C ${176 + sw} 157 ${156 + sw} 151 ${100 + nw + 28 + sw * 0.4} 148 ` +
    P`C ${100 + nw + 12} 145 ${100 + nw + 3} 141 ${100 + nw + 1} 132 Z`
  );
}

function neckPath(g: Geo): string {
  const nw = g.neckW;
  return P`M ${100 - nw} ${g.jawY - 14} L ${100 - nw - 0.4} 138 C ${100 - nw - 1} 146 ${100 - nw - 6} 150 ${100 - nw - 10} 153 L ${100 + nw + 10} 153 C ${100 + nw + 6} 150 ${100 + nw + 1} 146 ${100 + nw + 0.4} 138 L ${100 + nw} ${g.jawY - 14} Z`;
}

function Neck({ g, c, f, neckClip }: { g: Geo; c: Pal; f: FaceConfig; neckClip: string }) {
  const nw = g.neckW;
  const d = neckPath(g);
  return (
    <g>
      <path d={d} fill={c.skin} />
      <g clipPath={neckClip}>
        <path d={headPath(g)} fill={c.shadow} opacity={0.55} transform="translate(0 6.5)" />
        <rect x={100 + nw * 0.35} y={g.jawY - 14} width={nw} height={60} fill={c.shadow} opacity={0.18} />
      </g>
      {idx(f.build, 3) > 0 ? (
        <path d={P`M ${100 - 3} ${g.chinY + 11} q 3 2 6 0`} stroke={c.shadow} strokeWidth={1} opacity={0.25} fill="none" strokeLinecap="round" />
      ) : null}
    </g>
  );
}

function Jersey({ g, c, team, f, num, torsoClip }: { g: Geo; c: Pal; team: Team; f: FaceConfig; num?: string; torsoClip: string }) {
  const nw = g.neckW;
  const vneck = idx(f.outfit, 4) % 2 === 1;
  const sL = 100 - nw - 6; // strap inner (neck side)
  const sR = 100 + nw + 6;
  const oL = 100 - nw - 23;
  const oR = 100 + nw + 23;
  const neckline = vneck
    ? P`L ${sR} 141 L 100 169 L ${sL} 141`
    : P`L ${sR} 141 C ${sR - 1} 155 ${100 + 11} 163 100 163 C ${100 - 11} 163 ${sL + 1} 155 ${sL} 141`;
  const body =
    P`M ${sL} 141 L ${oL} 146.5 C ${oL - 2} 164 ${40} 178 ${33} 206 L ${167} 206 C ${160} 178 ${oR + 2} 164 ${oR} 146.5 ` + neckline + ' Z';
  const armL = P`M ${oL} 146.5 C ${oL - 2} 164 ${40} 178 ${33} 206`;
  const armR = P`M ${oR} 146.5 C ${oR + 2} 164 ${160} 178 ${167} 206`;
  const neckTrim = vneck ? P`M ${sL} 141 L 100 169 L ${sR} 141` : P`M ${sL} 141 C ${sL + 1} 155 ${100 - 11} 163 100 163 C ${100 + 11} 163 ${sR - 1} 155 ${sR} 141`;
  const n = num ?? '';
  const fs = n.length >= 2 ? 22 : 24;
  return (
    <g>
      {/* collarbone + deltoid shading on the skin */}
      <path d={P`M ${100 - nw - 4} 150 Q ${100 - nw - 16} 153 ${oL - 10} 152`} stroke={c.shadow} strokeWidth={1.3} fill="none" opacity={0.3} strokeLinecap="round" />
      <path d={P`M ${100 + nw + 4} 150 Q ${100 + nw + 16} 153 ${oR + 10} 152`} stroke={c.shadow} strokeWidth={1.3} fill="none" opacity={0.3} strokeLinecap="round" />
      <path d={P`M 150 152 C 172 158 184 170 188 206 L 206 206 L 206 150 Z`} fill={c.shadow} opacity={0.22} clipPath={torsoClip} />
      <path d={body} fill={team.primary} />
      <path d={P`M 128 150 C 140 168 150 186 152 206 L 167 206 C 160 178 ${oR + 2} 164 ${oR} 146.5 Z`} fill="#000000" opacity={0.14} />
      <path d={armL} stroke={team.secondary} strokeWidth={3.4} fill="none" />
      <path d={armR} stroke={team.secondary} strokeWidth={3.4} fill="none" />
      <path d={neckTrim} stroke={team.secondary} strokeWidth={3.8} fill="none" strokeLinejoin="round" />
      {n ? (
        <text
          x={100}
          y={vneck ? 190 : 188}
          textAnchor="middle"
          fontFamily="'Arial Black','Helvetica Neue',Arial,sans-serif"
          fontWeight={900}
          fontSize={fs}
          letterSpacing={-0.5}
          fill={team.accent}
          stroke={team.primaryDark}
          strokeWidth={1.2}
          paintOrder="stroke"
        >
          {n}
        </text>
      ) : null}
    </g>
  );
}

function SuitTop({ g, team, f, tie, skin, torsoClip }: { g: Geo; team: Team; f: FaceConfig; tie: boolean; skin: string; torsoClip: string }) {
  const nw = g.neckW;
  const suit = SUIT_COLORS[idx(f.suitColor, SUIT_COLORS.length)];
  const shirt = idx(f.suitColor, 5) % 2 === 1 ? '#DCE7F3' : '#F3F5F7';
  const lapel = mix(suit, '#FFFFFF', 0.07);
  const torso = torsoPath(g, idx(f.build, 3));
  const vL = 100 - nw - 4;
  const vR = 100 + nw + 4;
  return (
    <g>
      <path d={torso} fill={suit} />
      <path d={P`M 136 150 C 160 156 184 166 192 206 L 206 206 L 206 140 Z`} fill="#000000" opacity={0.18} clipPath={torsoClip} />
      {/* shirt V */}
      <path d={P`M ${vL} 136 L ${100 - 2} 206 L ${100 + 2} 206 L ${vR} 136 Z`} fill={shirt} />
      {!tie ? <path d={P`M ${100 - 7} 134 L 100 157 L ${100 + 7} 134 Z`} fill={skin} /> : null}
      {!tie ? <path d={P`M ${100 - 7} 134 L 100 157 L ${100 + 7} 134 Z`} fill="#000" opacity={0.12} /> : null}
      {tie ? (
        <g>
          <path d={P`M ${100 - 4.6} 144 L ${100 + 4.6} 144 L ${100 + 3.2} 152.5 L ${100 - 3.2} 152.5 Z`} fill={mix(team.primary, '#000000', 0.12)} />
          <path d={P`M ${100 - 3.2} 152.5 L ${100 + 3.2} 152.5 L ${100 + 7.2} 196 L 100 206 L ${100 - 7.2} 196 Z`} fill={team.primary} />
          <path d={P`M ${100 - 4.4} 166 L ${100 + 5.2} 158 M ${100 - 5.6} 180 L ${100 + 6.4} 170`} stroke={team.secondary} strokeWidth={2.2} opacity={0.55} />
        </g>
      ) : null}
      {/* collar */}
      <path d={P`M ${100 - nw - 0.5} 128 L ${100 - nw - 4.5} 139 L ${100 - 3} ${tie ? 152 : 158} L ${100 - 1} 144 Z`} fill={shirt} stroke="#000" strokeOpacity={0.12} strokeWidth={0.8} />
      <path d={P`M ${100 + nw + 0.5} 128 L ${100 + nw + 4.5} 139 L ${100 + 3} ${tie ? 152 : 158} L ${100 + 1} 144 Z`} fill={mix(shirt, '#000000', 0.06)} stroke="#000" strokeOpacity={0.12} strokeWidth={0.8} />
      {/* lapels */}
      <path d={P`M ${vL} 137 L ${100 - 2.5} 206 L ${100 - 11} 206 L ${vL - 13} 163 L ${vL - 8} 157.5 L ${vL - 9.5} 141 Z`} fill={lapel} stroke="#000" strokeOpacity={0.25} strokeWidth={0.8} />
      <path d={P`M ${vR} 137 L ${100 + 2.5} 206 L ${100 + 11} 206 L ${vR + 13} 163 L ${vR + 8} 157.5 L ${vR + 9.5} 141 Z`} fill={mix(lapel, '#000000', 0.12)} stroke="#000" strokeOpacity={0.25} strokeWidth={0.8} />
      {/* jacket button */}
      <circle cx={100 - 5} cy={199} r={1.6} fill={mix(suit, '#000000', 0.35)} />
    </g>
  );
}

function QuarterZip({ g, team, f, torsoClip }: { g: Geo; team: Team; f: FaceConfig; torsoClip: string }) {
  const nw = g.neckW;
  const torso = torsoPath(g, idx(f.build, 3));
  const col = team.primary;
  const collarOut = mix(col, '#000000', 0.08);
  const lining = team.secondary;
  return (
    <g>
      <path d={torso} fill={col} />
      <path d={P`M 136 150 C 160 156 184 166 192 206 L 206 206 L 206 140 Z`} fill="#000000" opacity={0.16} clipPath={torsoClip} />
      {/* raglan seams */}
      <path d={P`M ${100 - nw - 8} 146 Q 52 160 30 206`} stroke="#000" strokeOpacity={0.14} strokeWidth={1.2} fill="none" />
      <path d={P`M ${100 + nw + 8} 146 Q 148 160 170 206`} stroke="#000" strokeOpacity={0.14} strokeWidth={1.2} fill="none" />
      {/* zipper */}
      <path d={P`M 100 150 L 100 206`} stroke={mix(col, '#000000', 0.45)} strokeWidth={1.4} />
      {/* standing collar, half unzipped */}
      {[-1, 1].map((s) => (
        <g key={s}>
          <path
            d={P`M ${100 + s * (nw + 1)} 123 C ${100 + s * (nw + 4)} 127 ${100 + s * (nw + 6.5)} 136 ${100 + s * (nw + 7.5)} 144 L ${100 + s * 1} 156 L ${100 + s * 1} 148 L ${100 + s * 6.5} 135.5 C ${100 + s * 8} 131 ${100 + s * (nw - 3)} 128 ${100 + s * (nw - 1.5)} 123 Z`}
            fill={s < 0 ? collarOut : mix(collarOut, '#000000', 0.14)}
          />
          <path d={P`M ${100 + s * 1} 148 L ${100 + s * 6.5} 135.5`} stroke={lining} strokeWidth={1.8} strokeLinecap="round" />
          <path d={P`M ${100 + s * (nw - 1.5)} 123 L ${100 + s * (nw + 1)} 123`} stroke={mix(col, '#000000', 0.3)} strokeWidth={1.2} />
        </g>
      ))}
      <rect x={100 - 1.7} y={150} width={3.4} height={7.5} rx={1.2} fill={mix('#9AA0A8', lining, 0.25)} />
      {/* chest logo */}
      <circle cx={133} cy={170} r={3.4} fill={team.accent} />
      <circle cx={133} cy={170} r={1.4} fill={col} />
    </g>
  );
}

function Polo({ g, team, f, torsoClip }: { g: Geo; team: Team; f: FaceConfig; torsoClip: string }) {
  const nw = g.neckW;
  const torso = torsoPath(g, idx(f.build, 3));
  const col = team.primary;
  const collar = mix(col, '#000000', 0.1);
  return (
    <g>
      <path d={torso} fill={col} />
      <path d={P`M 136 150 C 160 156 184 166 192 206 L 206 206 L 206 140 Z`} fill="#000000" opacity={0.16} clipPath={torsoClip} />
      {/* placket */}
      <path d={P`M ${100 - 3.6} 141 L ${100 + 3.6} 141 L ${100 + 3.6} 172 L ${100 - 3.6} 172 Z`} fill={mix(col, '#000000', 0.08)} stroke="#000" strokeOpacity={0.15} strokeWidth={0.8} />
      <circle cx={100} cy={156} r={1.2} fill={team.accent} />
      <circle cx={100} cy={165} r={1.2} fill={team.accent} />
      {/* open V of skin is the neck; flat collar flaps */}
      <path d={P`M ${100 - nw - 1} 129 L ${100 - nw - 11} 141 L ${100 - 3} 152 L 100 141 Z`} fill={collar} />
      <path d={P`M ${100 + nw + 1} 129 L ${100 + nw + 11} 141 L ${100 + 3} 152 L 100 141 Z`} fill={mix(collar, '#000000', 0.12)} />
      <path d={P`M ${100 - nw - 11} 141 L ${100 - 3} 152 M ${100 + nw + 11} 141 L ${100 + 3} 152`} stroke={team.secondary} strokeWidth={1.4} />
      <circle cx={133} cy={170} r={3.4} fill={team.accent} />
      <circle cx={133} cy={170} r={1.4} fill={col} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

function Headband({ f, g, team, clip }: { f: FaceConfig; g: Geo; team: Team; clip: string }) {
  const k = idx(f.headband, 3);
  if (!k) return null;
  const col = k === 1 ? team.primary : '#F4F5F7';
  const edge = k === 1 ? team.secondary : team.primary;
  const by = g.top + 16;
  const w = g.w + 3;
  const d = P`M ${100 - w} ${by + 5} Q 100 ${by - 3.5} ${100 + w} ${by + 5} L ${100 + w} ${by + 13.5} Q 100 ${by + 5} ${100 - w} ${by + 13.5} Z`;
  return (
    <g clipPath={clip}>
      <path d={d} fill={col} />
      <path d={P`M ${100 - w} ${by + 13.5} Q 100 ${by + 5} ${100 + w} ${by + 13.5}`} stroke="#000" strokeOpacity={0.18} strokeWidth={1.4} fill="none" />
      <path d={P`M ${100 - w} ${by + 6.8} Q 100 ${by - 1.6} ${100 + w} ${by + 6.8}`} stroke="#FFF" strokeOpacity={0.25} strokeWidth={1.2} fill="none" />
      <rect x={100 + 12} y={by + 3.4} width={6} height={3} rx={1.5} fill={edge} />
    </g>
  );
}

function Bandage({ g }: { g: Geo }) {
  const x = 100 - 16;
  const y = g.browY - 8;
  return (
    <g transform={P`rotate(-24 ${x} ${y})`}>
      <rect x={x - 9} y={y - 3.2} width={18} height={6.4} rx={3.2} fill="#E8C9A2" stroke="#B89870" strokeWidth={0.6} />
      <rect x={x - 3.4} y={y - 2.4} width={6.8} height={4.8} rx={1.2} fill="#F3E3CC" />
      <circle cx={x - 6} cy={y - 0.8} r={0.4} fill="#B89870" />
      <circle cx={x - 6} cy={y + 0.9} r={0.4} fill="#B89870" />
      <circle cx={x + 6} cy={y - 0.8} r={0.4} fill="#B89870" />
      <circle cx={x + 6} cy={y + 0.9} r={0.4} fill="#B89870" />
    </g>
  );
}

function MedBadge() {
  return (
    <g>
      <circle cx={170} cy={30} r={19} fill="#FFFFFF" stroke="#D93A3A" strokeWidth={4} />
      <rect x={170 - 3.8} y={30 - 11} width={7.6} height={22} rx={1.4} fill="#D93A3A" />
      <rect x={170 - 11} y={30 - 3.8} width={22} height={7.6} rx={1.4} fill="#D93A3A" />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function FaceImpl({
  face,
  size = 96,
  primary,
  secondary,
  jerseyNumber,
  role,
  background = 'circle',
  className,
  injured,
  title,
}: FaceProps) {
  const rawId = useId();
  const uid = 'fc' + rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const id = (s: string) => `${uid}-${s}`;
  const url = (s: string) => `url(#${id(s)})`;

  const f = face;
  const r: FaceRole = role ?? f.role ?? 'player';
  const g = makeGeo(f);
  const c = makePalette(f);
  const team = makeTeam(primary, secondary);
  const hair = renderHair(f, g, c, id);
  const head = headPath(g);
  const build = idx(f.build, 3);
  const outfit = idx(f.outfit, 4);
  const num = jerseyNumber === undefined || jerseyNumber === null || jerseyNumber === '' ? undefined : String(jerseyNumber).slice(0, 2);

  const bgTop = mix(team.primary, '#FFFFFF', 0.74);
  const bgBot = mix(team.primary, '#FFFFFF', 0.52);

  let clothing: ReactNode;
  if (r === 'player') {
    clothing = <Jersey g={g} c={c} team={team} f={f} num={num} torsoClip={url('torso')} />;
  } else if (outfit === 1) {
    clothing = <QuarterZip g={g} team={team} f={f} torsoClip={url('torso')} />;
  } else if (outfit === 2) {
    clothing = <Polo g={g} team={team} f={f} torsoClip={url('torso')} />;
  } else {
    clothing = <SuitTop g={g} team={team} f={f} tie={outfit === 0} skin={c.skin} torsoClip={url('torso')} />;
  }

  const hasBlush = c.light < 0.5;

  const figure = (
    <g>
      {hair.back}
      {/* torso skin (visible for tank tops) */}
      <path d={torsoPath(g, build)} fill={c.skin} />
      <Neck g={g} c={c} f={f} neckClip={url('neck')} />
      {clothing}
      <Ear f={f} g={g} c={c} s={-1} />
      <Ear f={f} g={g} c={c} s={1} />
      <Earrings f={f} g={g} s={-1} />
      <Earrings f={f} g={g} s={1} />
      {/* head */}
      <path d={head} fill={c.skin} />
      <g clipPath={url('head')}>
        <rect x={100 - g.w - 4} y={g.top - 4} width={2 * g.w + 8} height={g.chinY - g.top + 10} fill={url('shade')} />
        <path
          d={P`M ${100 - g.jw - 2} ${g.jawY - 6} C ${100 - g.jw + 5} ${g.jawY + 8} ${100 - 8} ${g.chinY + 1} 100 ${g.chinY - 1} C ${100 + 8} ${g.chinY + 1} ${100 + g.jw - 5} ${g.jawY + 8} ${100 + g.jw + 2} ${g.jawY - 6} L ${100 + g.jw + 6} ${g.chinY + 6} L ${100 - g.jw - 6} ${g.chinY + 6} Z`}
          fill={c.shadow}
          opacity={0.16}
        />
        <ellipse cx={100 - 9} cy={g.top + 27} rx={18} ry={11} fill={url('hilite')} />
        <path d={P`M ${100 - g.w + 6} ${g.eyeY + 12} Q ${100 - g.w + 9} ${g.eyeY + 22} ${100 - g.jw + 6} ${g.jawY - 2}`} stroke={c.shadow} strokeWidth={3} opacity={0.08} fill="none" strokeLinecap="round" />
        <path d={P`M ${100 + g.w - 6} ${g.eyeY + 12} Q ${100 + g.w - 9} ${g.eyeY + 22} ${100 + g.jw - 6} ${g.jawY - 2}`} stroke={c.shadow} strokeWidth={4} opacity={0.14} fill="none" strokeLinecap="round" />
        {hasBlush ? (
          <g fill={url('blush')}>
            <ellipse cx={100 - 18} cy={g.eyeY + 13} rx={8} ry={5} />
            <ellipse cx={100 + 18} cy={g.eyeY + 13} rx={8} ry={5} />
          </g>
        ) : null}
      </g>
      <Wrinkles f={f} g={g} c={c} />
      <SkinDetail f={f} g={g} c={c} />
      <Eye f={f} g={g} c={c} s={-1} clipId={id('eyeL')} />
      <Eye f={f} g={g} c={c} s={1} clipId={id('eyeR')} />
      <Brow f={f} g={g} c={c} s={-1} />
      <Brow f={f} g={g} c={c} s={1} />
      <Nose f={f} g={g} c={c} />
      <FacialHair f={f} g={g} c={c} headClip={url('head')} jawClip={url('jaw')} />
      <Mouth f={f} g={g} c={c} />
      {hair.front}
      <Headband f={f} g={g} team={team} clip={url('hb')} />
      <Glasses f={f} g={g} />
      {injured ? <Bandage g={g} /> : null}
    </g>
  );

  const hc = idx(f.hairColor, HAIR_COLORS.length);
  const hairCol = HAIR_COLORS[hc];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ display: 'block', overflow: 'hidden' }}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <clipPath id={id('head')}>
          <path d={head} />
        </clipPath>
        <clipPath id={id('jaw')}>
          <rect x={0} y={g.eyeY - 2} width={200} height={80} />
        </clipPath>
        <clipPath id={id('torso')}>
          <path d={torsoPath(g, build)} />
        </clipPath>
        <clipPath id={id('hb')}>
          <path d={headPath(g, 2.4)} />
        </clipPath>
        <clipPath id={id('neck')}>
          <path d={neckPath(g)} />
        </clipPath>
        <clipPath id={id('hc')}>
          <path d={capPath(g, 40, idx(f.hairline, 3))} />
        </clipPath>
        <clipPath id={id('cap')}>
          <path d={capPath(g, 2.2, idx(f.hairline, 3))} />
        </clipPath>
        <clipPath id={id('bg')}>
          {background === 'card' ? <rect x={0} y={0} width={200} height={200} rx={18} /> : <circle cx={100} cy={100} r={100} />}
        </clipPath>
        <linearGradient id={id('shade')} x1={0} y1={0} x2={1} y2={0}>
          <stop offset={0} stopColor={c.shadow} stopOpacity={0.06} />
          <stop offset={0.42} stopColor={c.shadow} stopOpacity={0} />
          <stop offset={0.66} stopColor={c.shadow} stopOpacity={0.04} />
          <stop offset={1} stopColor={c.shadow} stopOpacity={0.34} />
        </linearGradient>
        <radialGradient id={id('hilite')}>
          <stop offset={0} stopColor="#FFFFFF" stopOpacity={0.12} />
          <stop offset={1} stopColor="#FFFFFF" stopOpacity={0} />
        </radialGradient>
        <radialGradient id={id('blush')}>
          <stop offset={0} stopColor="#E5735F" stopOpacity={0.2} />
          <stop offset={1} stopColor="#E5735F" stopOpacity={0} />
        </radialGradient>
        <linearGradient id={id('fl')} gradientUnits="userSpaceOnUse" x1={0} y1={g.C - 6} x2={0} y2={g.sbY + 1}>
          <stop offset={0} stopColor={hairCol} stopOpacity={1} />
          <stop offset={1} stopColor={hairCol} stopOpacity={0.2} />
        </linearGradient>
        <linearGradient id={id('fh')} gradientUnits="userSpaceOnUse" x1={0} y1={g.C - 22} x2={0} y2={g.C + 4}>
          <stop offset={0} stopColor={hairCol} stopOpacity={1} />
          <stop offset={1} stopColor={hairCol} stopOpacity={0.14} />
        </linearGradient>
        <linearGradient id={id('tp')} gradientUnits="userSpaceOnUse" x1={0} y1={g.C - 2} x2={0} y2={g.sbY + 1}>
          <stop offset={0} stopColor={hairCol} stopOpacity={1} />
          <stop offset={1} stopColor={hairCol} stopOpacity={0.62} />
        </linearGradient>
        <linearGradient id={id('bgc')} x1={0} y1={0} x2={0} y2={1}>
          <stop offset={0} stopColor={bgTop} />
          <stop offset={1} stopColor={bgBot} />
        </linearGradient>
        <linearGradient id={id('card')} x1={0} y1={0} x2={0.4} y2={1}>
          <stop offset={0} stopColor={mix(team.primary, '#000000', 0.3)} />
          <stop offset={1} stopColor={mix(team.primary, '#000000', 0.74)} />
        </linearGradient>
        <radialGradient id={id('glow')} cx={0.5} cy={0.4} r={0.5}>
          <stop offset={0} stopColor={mix(team.primary, '#FFFFFF', 0.4)} stopOpacity={0.6} />
          <stop offset={1} stopColor={mix(team.primary, '#FFFFFF', 0.4)} stopOpacity={0} />
        </radialGradient>
      </defs>
      {background === 'circle' ? <circle cx={100} cy={100} r={100} fill={url('bgc')} /> : null}
      {background === 'card' ? (
        <g clipPath={url('bg')}>
          <rect x={0} y={0} width={200} height={200} fill={url('card')} />
          <circle cx={100} cy={86} r={92} fill={url('glow')} />
          <path d="M 128 0 L 168 0 L 88 200 L 48 200 Z" fill={team.secondary} opacity={0.08} />
          <path d="M 176 0 L 192 0 L 112 200 L 96 200 Z" fill={team.secondary} opacity={0.06} />
        </g>
      ) : null}
      {background === 'none' ? figure : <g clipPath={url('bg')}>{figure}</g>}
      {injured ? <MedBadge /> : null}
    </svg>
  );
}

export const Face = memo(FaceImpl);
Face.displayName = 'Face';
