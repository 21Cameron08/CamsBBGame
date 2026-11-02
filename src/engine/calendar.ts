import type { CalendarDay, Phase } from './types';

// Day layout of a season (indices into GameState.calendar)
export const DAY_PRESEASON = 0;
export const NONCONF_DAYS = 16; // days 1..16
export const CONF_DAYS = 20; // days 17..36
export const FIRST_CONF_DAY = 1 + NONCONF_DAYS; // 17
export const LAST_REG_DAY = NONCONF_DAYS + CONF_DAYS; // 36
export const CT_FIRST = LAST_REG_DAY + 1; // 37
export const CT_LAST = CT_FIRST + 4; // 41
export const SELECTION_DAY = CT_LAST + 1; // 42
export const NCAA_FIRST = SELECTION_DAY + 1; // 43 First Four
export const NCAA_LAST = NCAA_FIRST + 6; // 49 Championship
export const NCAA_ROUND_NAMES = ['First Four', 'First Round', 'Second Round', 'Sweet 16', 'Elite Eight', 'Final Four', 'National Championship'];
export const FEAST_WEEK_DAYS = [7, 8];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmt(d: Date): string {
  return `${DOW[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

export function phaseForDay(day: number): Phase {
  if (day <= DAY_PRESEASON) return 'preseason';
  if (day <= LAST_REG_DAY) return 'regular';
  if (day <= CT_LAST) return 'confTourney';
  if (day === SELECTION_DAY) return 'selection';
  return 'ncaa';
}

export function buildCalendar(season: number): CalendarDay[] {
  // First Monday of November
  let d = new Date(Date.UTC(season, 10, 1));
  while (d.getUTCDay() !== 1) d = addDays(d, 1);
  const monday = d;
  const days: CalendarDay[] = [];
  const pre = new Date(Date.UTC(season, 9, 22));
  days.push({ day: 0, date: pre.toISOString().slice(0, 10), label: `${fmt(pre)} · Media Day`, week: 0, phase: 'preseason' });
  for (let i = 1; i <= LAST_REG_DAY; i++) {
    const week = Math.ceil(i / 2);
    const offset = (week - 1) * 7 + (i % 2 === 1 ? 1 : 5); // Tue / Sat
    const dt = addDays(monday, offset);
    days.push({ day: i, date: dt.toISOString().slice(0, 10), label: fmt(dt), week, phase: 'regular' });
  }
  // Conference tournaments: Tue..Sat of week 19
  const ctStart = addDays(monday, 18 * 7 + 1);
  for (let i = 0; i < 5; i++) {
    const dt = addDays(ctStart, i);
    days.push({ day: CT_FIRST + i, date: dt.toISOString().slice(0, 10), label: `${fmt(dt)} · Championship Week`, week: 19, phase: 'confTourney' });
  }
  const sel = addDays(ctStart, 5);
  days.push({ day: SELECTION_DAY, date: sel.toISOString().slice(0, 10), label: `${fmt(sel)} · Selection Sunday`, week: 19, phase: 'selection' });
  const ncaaOffsets = [2, 4, 6, 11, 13, 20, 22];
  for (let i = 0; i < 7; i++) {
    const dt = addDays(sel, ncaaOffsets[i]);
    days.push({ day: NCAA_FIRST + i, date: dt.toISOString().slice(0, 10), label: `${fmt(dt)} · ${NCAA_ROUND_NAMES[i]}`, week: 20 + Math.floor(i / 2), phase: 'ncaa' });
  }
  return days;
}

export function seasonLabel(season: number): string {
  return `${season}-${String((season + 1) % 100).padStart(2, '0')}`;
}
