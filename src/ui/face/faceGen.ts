// Procedural face generation for Courtside Dynasty.
//
// Pure TypeScript (no React). A FaceConfig is a small, JSON-serializable bag of
// integer "variant indices" (plus role/age metadata) that the <Face/> component
// turns into an SVG portrait. Every index is valid on its own, so an editor can
// cycle any field independently and the result always renders.
//
// generateFace(seed, opts) is deterministic for a given (seed, opts) pair.

export type FaceRole = 'player' | 'coach' | 'staff';

export interface FaceGenOptions {
  role?: FaceRole;
  /** 17–70. Drives facial hair odds, graying, receding hairline, wrinkles, glasses. */
  age?: number;
}

export interface FaceConfig {
  /** schema version, for future migrations */
  v: 1;
  /** default role used for clothing when <Face role> is not passed */
  role: FaceRole;
  age: number;

  skinTone: number; // 0–11, very light → very deep
  headShape: number; // 0–4  oval, round, square, long, heart
  faceWidth: number; // 0–4  narrow → wide
  build: number; // 0–2  slim, average, broad (neck + shoulders)
  ears: number; // 0–2  small, medium, large

  hairStyle: number; // 0–23 (see HAIR_STYLE_NAMES)
  hairColor: number; // 0–10 (see HAIR_COLORS)
  hairline: number; // 0–2  full, mature, receding

  facialHair: number; // 0–7 (see FACIAL_HAIR_NAMES)
  eyebrows: number; // 0–5
  eyeShape: number; // 0–4
  eyeColor: number; // 0–5
  nose: number; // 0–6
  mouth: number; // 0–4 expression
  lips: number; // 0–2 thin, medium, full
  wrinkles: number; // 0–2
  skinDetail: number; // 0–2 none, freckles, mole

  glasses: number; // 0–4
  headband: number; // 0–2 none, team color, white
  earrings: number; // 0–2 none, one stud, both
  outfit: number; // 0–3 coach/staff: suit+tie, quarter-zip, polo, blazer. player: 0/2 scoop, 1/3 v-neck
  suitColor: number; // 0–4
}

// ---------------------------------------------------------------------------
// Palettes & names (exported so editors can show swatches / labels)
// ---------------------------------------------------------------------------

export const SKIN_TONES: readonly string[] = [
  '#F8DCC9',
  '#F1CDB2',
  '#E8BD9B',
  '#DDAE88',
  '#CF9F78',
  '#C08A61',
  '#AD774F',
  '#986342',
  '#825136',
  '#6B412B',
  '#573423',
  '#45291C',
];

export const HAIR_COLORS: readonly string[] = [
  '#17130F', // black
  '#2A211B', // off-black
  '#3D2B20', // dark brown
  '#583A26', // brown
  '#7B573A', // light brown
  '#A07B4F', // dark blonde
  '#CDAA6E', // blonde
  '#7E3A20', // auburn
  '#B0562B', // ginger
  '#77736F', // salt & pepper
  '#C4C1BC', // silver
];

export const EYE_COLORS: readonly string[] = ['#2E1C12', '#4F321D', '#6F5A2E', '#4C6E44', '#4A78A3', '#6E808E'];

export const SUIT_COLORS: readonly string[] = ['#1E2A3D', '#32353B', '#16171A', '#575C66', '#3B2F2A'];

export const HEAD_SHAPE_NAMES = ['Oval', 'Round', 'Square', 'Long', 'Heart'] as const;
export const HAIR_STYLE_NAMES = [
  'Bald',
  'Buzz Cut',
  'Crew Cut',
  'Low Fade',
  'High Fade',
  'Waves',
  'High-Top',
  'Short Afro',
  'Afro',
  'Twists',
  'Short Locs',
  'Locs Up',
  'Cornrows',
  'Braids',
  'Curly Top',
  'Textured Crop',
  'Side Part',
  'Slick Back',
  'Pompadour',
  'Flow',
  'Man Bun',
  'Mohawk',
  'Spiky',
  'Balding',
] as const;
export const HAIR_COLOR_NAMES = [
  'Black',
  'Off-Black',
  'Dark Brown',
  'Brown',
  'Light Brown',
  'Dark Blonde',
  'Blonde',
  'Auburn',
  'Ginger',
  'Salt & Pepper',
  'Silver',
] as const;
export const FACIAL_HAIR_NAMES = [
  'None',
  'Stubble',
  'Mustache',
  'Goatee',
  'Circle Beard',
  'Chin Strap',
  'Short Beard',
  'Full Beard',
] as const;
export const EYE_SHAPE_NAMES = ['Almond', 'Round', 'Narrow', 'Hooded', 'Upturned'] as const;
export const EYE_COLOR_NAMES = ['Dark Brown', 'Brown', 'Hazel', 'Green', 'Blue', 'Gray'] as const;
export const EYEBROW_NAMES = ['Natural', 'Arched', 'Thin', 'Straight', 'Stern', 'Bushy'] as const;
export const NOSE_NAMES = ['Small', 'Medium', 'Broad', 'Wide', 'Long', 'Narrow', 'Button'] as const;
export const MOUTH_NAMES = ['Neutral', 'Slight Smile', 'Smile', 'Smirk', 'Serious'] as const;
export const GLASSES_NAMES = ['None', 'Black Frames', 'Tortoise', 'Round Wire', 'Browline'] as const;
export const OUTFIT_NAMES = ['Suit & Tie', 'Quarter-Zip', 'Polo', 'Blazer'] as const;

export const HAIR_STYLE_COUNT = HAIR_STYLE_NAMES.length;

export interface FaceEditorField {
  key: keyof FaceConfig;
  label: string;
  /** number of variants; valid values are 0..count-1 */
  count: number;
  /** optional display names per variant */
  names?: readonly string[];
}

export const FACE_EDITOR_FIELDS: FaceEditorField[] = [
  { key: 'skinTone', label: 'Skin Tone', count: SKIN_TONES.length },
  { key: 'headShape', label: 'Head Shape', count: 5, names: HEAD_SHAPE_NAMES },
  { key: 'faceWidth', label: 'Face Width', count: 5, names: ['Narrow', 'Slim', 'Average', 'Wide', 'Broad'] },
  { key: 'hairStyle', label: 'Hair Style', count: HAIR_STYLE_COUNT, names: HAIR_STYLE_NAMES },
  { key: 'hairColor', label: 'Hair Color', count: HAIR_COLORS.length, names: HAIR_COLOR_NAMES },
  { key: 'hairline', label: 'Hairline', count: 3, names: ['Full', 'Mature', 'Receding'] },
  { key: 'facialHair', label: 'Facial Hair', count: FACIAL_HAIR_NAMES.length, names: FACIAL_HAIR_NAMES },
  { key: 'eyebrows', label: 'Eyebrows', count: EYEBROW_NAMES.length, names: EYEBROW_NAMES },
  { key: 'eyeShape', label: 'Eyes', count: EYE_SHAPE_NAMES.length, names: EYE_SHAPE_NAMES },
  { key: 'eyeColor', label: 'Eye Color', count: EYE_COLORS.length, names: EYE_COLOR_NAMES },
  { key: 'nose', label: 'Nose', count: NOSE_NAMES.length, names: NOSE_NAMES },
  { key: 'mouth', label: 'Expression', count: MOUTH_NAMES.length, names: MOUTH_NAMES },
  { key: 'lips', label: 'Lips', count: 3, names: ['Thin', 'Medium', 'Full'] },
  { key: 'ears', label: 'Ears', count: 3, names: ['Small', 'Medium', 'Large'] },
  { key: 'wrinkles', label: 'Age Lines', count: 3, names: ['None', 'Light', 'Defined'] },
  { key: 'skinDetail', label: 'Skin Detail', count: 3, names: ['None', 'Freckles', 'Beauty Mark'] },
  { key: 'glasses', label: 'Glasses', count: GLASSES_NAMES.length, names: GLASSES_NAMES },
  { key: 'earrings', label: 'Earrings', count: 3, names: ['None', 'Stud', 'Both Ears'] },
  { key: 'headband', label: 'Headband', count: 3, names: ['None', 'Team Color', 'White'] },
  { key: 'build', label: 'Build', count: 3, names: ['Slim', 'Average', 'Broad'] },
  { key: 'outfit', label: 'Outfit', count: OUTFIT_NAMES.length, names: OUTFIT_NAMES },
  { key: 'suitColor', label: 'Suit Color', count: SUIT_COLORS.length, names: ['Navy', 'Charcoal', 'Black', 'Gray', 'Brown'] },
];

// ---------------------------------------------------------------------------
// Seeded RNG
// ---------------------------------------------------------------------------

/** 32-bit string hash (cyrb53 folded to 32 bits). */
export function hashSeed(seed: string | number): number {
  const str = String(seed);
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/** mulberry32 PRNG → floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;

function pickWeighted(rng: Rng, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  if (total <= 0) return 0;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r < 0) return i;
  }
  return weights.length - 1;
}

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** interpolate a [light, medium, deep] triple by skin darkness t∈[0,1] */
const bySkin = (tri: readonly [number, number, number], t: number) =>
  t < 0.5 ? lerp(tri[0], tri[1], t * 2) : lerp(tri[1], tri[2], (t - 0.5) * 2);

// ---------------------------------------------------------------------------
// Weight tables
// ---------------------------------------------------------------------------

// Skin tone distributions by role (kept broad on purpose — every tone appears).
const SKIN_WEIGHTS: Record<FaceRole, number[]> = {
  player: [3, 4, 4, 4, 4, 5, 6, 7, 8, 8, 7, 5],
  coach: [6, 7, 7, 6, 5, 5, 5, 5, 5, 4, 4, 3],
  staff: [6, 6, 6, 6, 5, 5, 5, 5, 5, 4, 4, 3],
};

// hair style: [light, medium, deep] base weights, young multiplier, older multiplier
const HAIR_STYLE_TABLE: [readonly [number, number, number], number, number][] = [
  /* Bald          */ [[2, 2, 4], 0.55, 1.6],
  /* Buzz Cut      */ [[4, 5, 8], 1, 1],
  /* Crew Cut      */ [[8, 5, 2], 0.6, 2],
  /* Low Fade      */ [[6, 8, 10], 1.2, 1],
  /* High Fade     */ [[3, 6, 8], 1.3, 0.5],
  /* Waves         */ [[0.2, 2, 8], 1.2, 0.8],
  /* High-Top      */ [[0.1, 0.5, 2], 1, 0.15],
  /* Short Afro    */ [[0.3, 2, 8], 1, 1],
  /* Afro          */ [[0.2, 1, 4], 1.3, 0.2],
  /* Twists        */ [[0.2, 1.5, 7], 1.5, 0.1],
  /* Short Locs    */ [[0.3, 1.5, 6], 1.4, 0.2],
  /* Locs Up       */ [[0.1, 1, 4], 1.4, 0.15],
  /* Cornrows      */ [[0.2, 1, 5], 1.4, 0.1],
  /* Braids        */ [[0.1, 0.8, 3], 1.3, 0.05],
  /* Curly Top     */ [[3, 5, 4], 1.5, 0.3],
  /* Textured Crop */ [[7, 5, 1], 1.5, 0.3],
  /* Side Part     */ [[7, 4, 1], 0.7, 2.2],
  /* Slick Back    */ [[4, 3, 0.5], 0.6, 1.6],
  /* Pompadour     */ [[3, 2, 0.5], 0.8, 1],
  /* Flow          */ [[5, 3, 0.3], 1.4, 0.3],
  /* Man Bun       */ [[2, 1.5, 0.3], 1.2, 0.15],
  /* Mohawk        */ [[1.5, 1.5, 1.2], 1.3, 0.05],
  /* Spiky         */ [[4, 3, 0.5], 1.3, 0.3],
  /* Balding       */ [[1, 1, 1], 0, 2.5],
];

// hair colors (non-gray) by [light, medium, deep]
const HAIR_COLOR_TABLE: readonly (readonly [number, number, number])[] = [
  [2, 8, 12], // black
  [3, 6, 6], // off-black
  [8, 6, 2], // dark brown
  [8, 3, 0.4], // brown
  [6, 1.5, 0.15], // light brown
  [4, 0.4, 0.05], // dark blonde
  [4, 0.2, 0.05], // blonde
  [2, 0.3, 0.05], // auburn
  [1.5, 0.1, 0.03], // ginger
];

const EYE_COLOR_TABLE: readonly (readonly [number, number, number])[] = [
  [3, 8, 14], // dark brown
  [6, 6, 4], // brown
  [4, 2, 0.3], // hazel
  [3, 1, 0.1], // green
  [6, 0.8, 0.05], // blue
  [2, 0.4, 0.05], // gray
];

// Hairstyles where a receding hairline reads oddly / is irrelevant.
const NO_RECEDE = new Set([0, 6, 8, 13, 15, 19, 23]);

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function defaultAge(role: FaceRole, rng: Rng): number {
  if (role === 'player') return Math.round(lerp(17.5, 23.5, rng()));
  if (role === 'coach') return Math.round(lerp(34, 68, Math.pow(rng(), 0.9)));
  return Math.round(lerp(27, 66, rng()));
}

export function generateFace(seed: string | number, opts: FaceGenOptions = {}): FaceConfig {
  const role: FaceRole = opts.role ?? 'player';
  const rng = mulberry32(hashSeed(seed) ^ 0x5f3759df);
  const age = Math.round(clamp(opts.age ?? defaultAge(role, rng), 17, 70));

  // 0 at 17–24, 1 at 65+
  const old = clamp((age - 28) / 37, 0, 1);
  const isPlayer = role === 'player';

  const skinTone = pickWeighted(rng, SKIN_WEIGHTS[role]);
  const st = skinTone / (SKIN_TONES.length - 1); // 0 light → 1 deep

  // --- head ---
  const headShape = pickWeighted(rng, [5, 3, 3.5, 2, 2]);
  const faceWidth = pickWeighted(rng, [1, 3, 4, 3, 1]);
  const build = isPlayer ? pickWeighted(rng, [1.5, 4, 3.5]) : pickWeighted(rng, [3, 4, 2]);
  const ears = pickWeighted(rng, [3, 5, 2]);

  // --- hair style (loosely correlated with skin tone, shifted by age) ---
  const styleWeights = HAIR_STYLE_TABLE.map(([tri, young, older]) => {
    const base = bySkin(tri, st);
    const ageMult = isPlayer ? young : lerp(1, older, 0.35 + 0.65 * old);
    return base * ageMult;
  });
  // keep "Balding" off young faces entirely
  if (age < 38) styleWeights[23] = 0;
  // every style keeps a tiny floor so the full set appears across a league
  const hairStyle = pickWeighted(
    rng,
    styleWeights.map((w, i) => (i === 23 && age < 38 ? 0 : Math.max(w, 0.05))),
  );

  // --- hair color ---
  const grayChance = clamp((age - 38) / 30, 0, 0.88);
  let hairColor: number;
  if (rng() < grayChance) {
    hairColor = rng() < lerp(0.85, 0.3, clamp((age - 45) / 22, 0, 1)) ? 9 : 10;
  } else {
    hairColor = pickWeighted(
      rng,
      HAIR_COLOR_TABLE.map((tri) => bySkin(tri, st)),
    );
  }

  // --- hairline ---
  let hairline = 0;
  if (!isPlayer && !NO_RECEDE.has(hairStyle)) {
    const r = rng();
    const p2 = clamp((age - 42) / 40, 0, 0.45);
    const p1 = clamp((age - 32) / 30, 0, 0.45);
    hairline = r < p2 ? 2 : r < p2 + p1 ? 1 : 0;
  } else if (isPlayer && rng() < 0.08 && !NO_RECEDE.has(hairStyle)) {
    hairline = 1;
  }

  // --- facial hair ---
  const facialHair = isPlayer
    ? pickWeighted(rng, [
        42,
        20,
        3 + (age - 17) * 0.6,
        8 + (age - 17),
        4 + (age - 17) * 0.8,
        6,
        2 + Math.max(0, age - 20) * 1.5,
        Math.max(0, age - 21) * 0.6,
      ])
    : pickWeighted(rng, [38, 12, 7, 6, 10, 3, 15, 8 + old * 4]);

  const eyebrows = pickWeighted(rng, [5, 3, 1.5, 3, 2.5, 2 + old * 3]);
  const eyeShape = pickWeighted(rng, [5, 3, 2.5, 1.5 + old * 3, 2]);
  const eyeColor = pickWeighted(
    rng,
    EYE_COLOR_TABLE.map((tri) => bySkin(tri, st)),
  );
  const nose = pickWeighted(rng, [
    bySkin([4, 2, 1], st),
    5,
    bySkin([1.5, 3, 5], st),
    bySkin([0.5, 2, 5], st),
    3,
    bySkin([3, 1.5, 0.5], st),
    2,
  ]);
  const mouth = isPlayer ? pickWeighted(rng, [5, 4, 1.5, 2.5, 3]) : pickWeighted(rng, [3, 5, 3, 1.5, 2]);
  const lips = pickWeighted(rng, [bySkin([4, 2, 0.5], st), 5, bySkin([1, 3, 6], st)]);

  let wrinkles = 0;
  if (!isPlayer) {
    const r = rng();
    wrinkles = r < clamp((age - 50) / 25, 0, 0.8) ? 2 : r < clamp((age - 36) / 18, 0, 0.95) ? 1 : 0;
  }

  const skinDetail = pickWeighted(rng, [14, bySkin([3, 1, 0.2], st), 1]);

  let glasses = 0;
  if (!isPlayer && rng() < 0.12 + 0.38 * old) glasses = 1 + pickWeighted(rng, [4, 2, 2, 1.5 + old * 2]);

  let headband = 0;
  if (isPlayer && rng() < 0.13) headband = rng() < 0.7 ? 1 : 2;

  let earrings = 0;
  const earChance = isPlayer ? 0.16 : role === 'coach' ? 0.025 : 0.05;
  if (rng() < earChance) earrings = rng() < 0.55 ? 2 : 1;

  let outfit: number;
  if (isPlayer) outfit = rng() < 0.6 ? 0 : 1;
  else if (role === 'coach') outfit = pickWeighted(rng, [5.5, 3, 1, 0.6]);
  else outfit = pickWeighted(rng, [1.5, 1, 4, 3]);

  const suitColor = pickWeighted(rng, [4, 3, 2, 1.5, 0.6]);

  return {
    v: 1,
    role,
    age,
    skinTone,
    headShape,
    faceWidth,
    build,
    ears,
    hairStyle,
    hairColor,
    hairline,
    facialHair,
    eyebrows,
    eyeShape,
    eyeColor,
    nose,
    mouth,
    lips,
    wrinkles,
    skinDetail,
    glasses,
    headband,
    earrings,
    outfit,
    suitColor,
  };
}

/** A fresh random face (non-deterministic seed). */
export function randomizeFace(opts?: FaceGenOptions): FaceConfig {
  const seed = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  return generateFace(seed, opts);
}

// ---------------------------------------------------------------------------
// Editor helpers
// ---------------------------------------------------------------------------

const FIELD_COUNT: Partial<Record<keyof FaceConfig, number>> = Object.fromEntries(
  FACE_EDITOR_FIELDS.map((f) => [f.key, f.count]),
);

/** Step a field by ±n with wrap-around, returning a new config. */
export function cycleFaceField(face: FaceConfig, key: keyof FaceConfig, delta: number): FaceConfig {
  const count = FIELD_COUNT[key];
  const cur = face[key];
  if (!count || typeof cur !== 'number') return face;
  const next = (((cur + delta) % count) + count) % count;
  return { ...face, [key]: next };
}

/** Fill in / clamp a possibly partial or stale config (e.g. from an old save). */
export function normalizeFace(input: Partial<FaceConfig> | null | undefined, fallbackSeed: string | number = 'face'): FaceConfig {
  const base = generateFace(fallbackSeed, { role: input?.role, age: input?.age });
  if (!input) return base;
  const out: FaceConfig = { ...base };
  for (const f of FACE_EDITOR_FIELDS) {
    const v = input[f.key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      (out as unknown as Record<string, number>)[f.key] = clamp(Math.round(v), 0, f.count - 1);
    }
  }
  if (input.role === 'player' || input.role === 'coach' || input.role === 'staff') out.role = input.role;
  if (typeof input.age === 'number' && Number.isFinite(input.age)) out.age = Math.round(clamp(input.age, 17, 70));
  return out;
}
