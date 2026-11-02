import type { ConferenceDef } from './types';

// Division I men's basketball conferences for the 2026-27 season
// (alignment effective July 1, 2026). 32 conferences, no independents.
//
// Notable 2026-27 changes reflected here:
//  - Pac-12 rebuilt (9 teams) after a two-season hiatus.
//  - WAC rebranded as the United Athletic Conference (UAC).
//  - MAAC rebranded as the Metro Conference (membership unchanged).
//  - ACC and Big 12 both play 18-game league schedules; MAC moves to 22.
//
// `color` is a UI accent only, not an official brand color.
export const CONFERENCES: ConferenceDef[] = [
  // ---- Tier 1: power / high-major ----
  { id: 'acc', name: 'Atlantic Coast Conference', short: 'ACC', tier: 1, color: '#1D4ED8', confGames: 18 },
  { id: 'big-ten', name: 'Big Ten Conference', short: 'Big Ten', tier: 1, color: '#0EA5E9', confGames: 20 },
  { id: 'big-12', name: 'Big 12 Conference', short: 'Big 12', tier: 1, color: '#DC2626', confGames: 18 },
  { id: 'sec', name: 'Southeastern Conference', short: 'SEC', tier: 1, color: '#D4A017', confGames: 18 },
  { id: 'big-east', name: 'Big East Conference', short: 'Big East', tier: 1, color: '#9333EA', confGames: 20 },

  // ---- Tier 2: upper mid-major ----
  { id: 'aac', name: 'American Conference', short: 'American', tier: 2, color: '#0F766E', confGames: 18 },
  { id: 'a-10', name: 'Atlantic 10 Conference', short: 'A-10', tier: 2, color: '#EA580C', confGames: 18 },
  { id: 'mwc', name: 'Mountain West Conference', short: 'MWC', tier: 2, color: '#475569', confGames: 18 },
  { id: 'wcc', name: 'West Coast Conference', short: 'WCC', tier: 2, color: '#0891B2', confGames: 16 },
  { id: 'pac-12', name: 'Pac-12 Conference', short: 'Pac-12', tier: 2, color: '#1E3A8A', confGames: 16 },

  // ---- Tier 3: mid-major ----
  { id: 'mvc', name: 'Missouri Valley Conference', short: 'MVC', tier: 3, color: '#B45309', confGames: 20 },
  { id: 'mac', name: 'Mid-American Conference', short: 'MAC', tier: 3, color: '#15803D', confGames: 22 },
  { id: 'caa', name: 'Coastal Athletic Association', short: 'CAA', tier: 3, color: '#0369A1', confGames: 18 },
  { id: 'cusa', name: 'Conference USA', short: 'C-USA', tier: 3, color: '#BE185D', confGames: 18 },
  { id: 'sun-belt', name: 'Sun Belt Conference', short: 'Sun Belt', tier: 3, color: '#F59E0B', confGames: 18 },
  { id: 'horizon', name: 'Horizon League', short: 'Horizon', tier: 3, color: '#4F46E5', confGames: 20 },
  { id: 'ivy', name: 'Ivy League', short: 'Ivy', tier: 3, color: '#166534', confGames: 14 },
  { id: 'socon', name: 'Southern Conference', short: 'SoCon', tier: 3, color: '#854D0E', confGames: 20 },
  { id: 'summit', name: 'The Summit League', short: 'Summit', tier: 3, color: '#6D28D9', confGames: 14 },
  // note: 2026-27 Big West game count not confirmed (20 in 2025-26 with 11 teams).
  { id: 'big-west', name: 'Big West Conference', short: 'Big West', tier: 3, color: '#0284C7', confGames: 20 },
  { id: 'uac', name: 'United Athletic Conference', short: 'UAC', tier: 3, color: '#7C2D12', confGames: 16 },
  { id: 'asun', name: 'ASUN Conference', short: 'ASUN', tier: 3, color: '#65A30D', confGames: 14 },
  { id: 'metro', name: 'Metro Conference', short: 'Metro', tier: 3, color: '#DB2777', confGames: 20 },
  { id: 'big-sky', name: 'Big Sky Conference', short: 'Big Sky', tier: 3, color: '#2563EB', confGames: 20 },
  { id: 'southland', name: 'Southland Conference', short: 'Southland', tier: 3, color: '#9F1239', confGames: 22 },
  { id: 'ovc', name: 'Ohio Valley Conference', short: 'OVC', tier: 3, color: '#C2410C', confGames: 16 },
  { id: 'patriot', name: 'Patriot League', short: 'Patriot', tier: 3, color: '#1E293B', confGames: 18 },
  { id: 'america-east', name: 'America East Conference', short: 'AmEast', tier: 3, color: '#0D9488', confGames: 16 },
  { id: 'big-south', name: 'Big South Conference', short: 'Big South', tier: 3, color: '#A16207', confGames: 16 },

  // ---- Tier 4: low-major ----
  { id: 'swac', name: 'Southwestern Athletic Conference', short: 'SWAC', tier: 4, color: '#7E22CE', confGames: 18 },
  { id: 'meac', name: 'Mid-Eastern Athletic Conference', short: 'MEAC', tier: 4, color: '#B91C1C', confGames: 14 },
  { id: 'nec', name: 'Northeast Conference', short: 'NEC', tier: 4, color: '#334155', confGames: 16 },
];
