// Color helpers for team theming.
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [80, 80, 80];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
export function alpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
/** A version of the color that's readable as an accent on a dark background */
export function accentOnDark(hex: string): string {
  let c = hex;
  for (let i = 0; i < 6 && luminance(c) < 0.12; i++) c = mix(c, '#ffffff', 0.22);
  return c;
}
export function textOn(hex: string): string {
  return luminance(hex) > 0.45 ? '#0b0f17' : '#ffffff';
}
/** Pick the team color that works best as an accent on dark UI */
export function teamAccent(colors: [string, string]): string {
  const [p, s] = colors;
  const lp = luminance(p), ls = luminance(s);
  if (lp >= 0.08) return accentOnDark(p);
  // dark primary: use secondary if it's not plain white/near-white
  if (ls < 0.85 && ls > 0.08) return s;
  return accentOnDark(p);
}
export function ratingColor(v: number): string {
  if (v >= 85) return '#22e3a0';
  if (v >= 75) return '#7ddc4a';
  if (v >= 65) return '#e8cf3a';
  if (v >= 55) return '#f29b38';
  return '#f0605a';
}
