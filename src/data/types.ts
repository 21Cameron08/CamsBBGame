// Static (definition-level) data types for conferences & teams.
// These describe the *real-world* starting point of the universe. Runtime
// state (rosters, records, budgets...) lives in src/engine/types.ts.

export type ConfTier = 1 | 2 | 3 | 4;

export interface ConferenceDef {
  /** slug id, e.g. 'sec', 'big-ten', 'big-east', 'pac-12', 'wcc' */
  id: string;
  /** Full name, e.g. 'Southeastern Conference' */
  name: string;
  /** Short label, e.g. 'SEC', 'Big Ten', 'MWC' */
  short: string;
  /**
   * 1 = power / high-major (SEC, Big Ten, Big 12, ACC, Big East)
   * 2 = upper mid-major (AAC, A-10, MWC, WCC, Pac-12)
   * 3 = mid-major (MVC, MAC, CAA, CUSA, Sun Belt, Horizon, etc.)
   * 4 = low-major (SWAC, MEAC, NEC, etc.)
   */
  tier: ConfTier;
  /** UI accent color for chips/badges (hex). Not an official brand color. */
  color: string;
  /** Regular-season conference games per team (target). */
  confGames: number;
}

export interface TeamDef {
  /** kebab-case slug, unique, stable. Used for logo files: public/assets/logos/<id>.png|svg */
  id: string;
  /** Common short school name, e.g. 'Duke', 'North Carolina', 'Texas A&M', 'UConn' */
  school: string;
  /** Formal institution name, e.g. 'Duke University' */
  fullName: string;
  /** Mascot / nickname, e.g. 'Blue Devils' */
  mascot: string;
  /** 2–5 char uppercase abbreviation for scoreboards, e.g. 'DUKE', 'UNC', 'TAMU' */
  abbr: string;
  /** Conference id (ConferenceDef.id) for the 2026-27 season */
  conf: string;
  city: string;
  /** 2-letter US state / DC / province code */
  state: string;
  /** Approximate campus coordinates (used for recruiting proximity) */
  lat: number;
  lng: number;
  /** [primary, secondary] hex colors, e.g. ['#003087', '#FFFFFF'] */
  colors: [string, string];
  /** 1–100 historical basketball program prestige (blue bloods ~95+, low-majors ~10–30) */
  prestige: number;
  /** Home arena name */
  arena: string;
  /** Approximate arena capacity */
  capacity: number;
  /** 1–10 booster/NIL money + media market strength */
  market: number;
  /** 1–10 academic reputation */
  academics: number;
  /** 1–10 basketball facilities quality */
  facilities: number;
}

export interface RivalryDef {
  a: string; // team id
  b: string; // team id
  /** Optional rivalry name, e.g. 'Tobacco Road' */
  name?: string;
  /** 1–3 intensity */
  heat: 1 | 2 | 3;
}
