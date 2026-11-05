// Program building: a Program Fund (donations, booster gifts, tournament payouts) that you spend
// on seven facilities. Each upgrade takes a season or two to build and adds a lasting edge: player
// development, home crowd, injuries, morale, game prep, recruiting, academics. Boosters have
// personalities and moods, give more when they're happy, and come to you with requests that have
// strings attached. Only the upgrades you build give bonuses (what you inherit is already part of
// the school's prestige), so AI programs and old saves stay balanced.
import { clamp, rng } from './rng';
import type { Booster, BoosterStyle, FacilityKey, FacilityProject, GameState, InboxChoice, ProgramBuild, Team } from './types';
import type { StaffEffects } from './staff';
import { FIRST_NAMES, LAST_NAMES } from '../data/names';
import { addNews } from './media';

export const FACILITY_KEYS: FacilityKey[] = ['practice', 'arena', 'medical', 'lounge', 'film', 'recruiting', 'academic'];
export const MAX_LEVEL = 5;
export const MAX_PROJECTS = 2;

export const FACILITIES: Record<FacilityKey, { name: string; icon: string; desc: string; base: number; per: string }> = {
  practice: { name: 'Practice Facility', icon: '🏋️', desc: 'Courts, weight room and shooting machines open around the clock.', base: 1_200_000, per: '+0.45 player development per upgrade' },
  arena: { name: 'Arena & Fan Experience', icon: '🏟️', desc: 'Video board, student section, premium seats. Louder nights and bigger checks.', base: 2_500_000, per: '+3% home crowd energy, +1.5 preseason hype, +4% donations per upgrade' },
  medical: { name: 'Sports Science & Medicine', icon: '🩺', desc: 'Recovery suites, trainers and load monitoring.', base: 1_000_000, per: '−7% injury risk and −2% fatigue per upgrade' },
  lounge: { name: 'Players’ Lounge & Locker Room', icon: '🛋️', desc: 'Where the team lives. Happy players stay.', base: 600_000, per: '+morale every week, cheaper retention asks, +motivation' },
  film: { name: 'Film & Analytics Suite', icon: '🎥', desc: 'Tracking data, scouting video and a war room for game prep.', base: 500_000, per: '+0.45 tactics (faster installs, better game plans), tougher defense' },
  recruiting: { name: 'Recruiting Center', icon: '🎯', desc: 'A Hall of Champions built to sell your program on visits.', base: 800_000, per: '+1 recruiting hour/week, +3.5% relationship gains, +portal pull' },
  academic: { name: 'Academic Center', icon: '🎓', desc: 'Tutors, advisors and study halls.', base: 700_000, per: '+3 academic appeal with recruits, fewer eligibility scares' },
};
const COST_MUL = [0, 1, 2.2, 4, 7, 11];
/** construction costs scale with the program: a low-major's weight room isn't a blue blood's */
export function upgradeCost(key: FacilityKey, toLevel: number, prestige = 60) {
  const scale = 0.35 + (clamp(prestige, 0, 100) / 100) * 0.75;
  return Math.round((FACILITIES[key].base * (COST_MUL[toLevel] ?? 11) * scale) / 50_000) * 50_000 || 50_000;
}
/** seasons until it opens */
export function buildSeasons(toLevel: number) { return toLevel >= 4 ? 2 : 1; }

const STYLE_INFO: Record<BoosterStyle, { label: string; desc: string }> = {
  loyal: { label: 'Lifer', desc: 'Gives every year, rain or shine.' },
  'win-now': { label: 'Win-Now', desc: 'Writes bigger checks after big wins. Hates losing streaks.' },
  'old-guard': { label: 'Old Guard', desc: 'Cares about tradition, rivals and conference titles.' },
  flashy: { label: 'Flashy', desc: 'Loves rankings, buzz and seeing their name on things.' },
  academic: { label: 'Academic', desc: 'Values graduation, academics and doing it the right way.' },
};
export const boosterStyle = (s: BoosterStyle) => STYLE_INFO[s];
const BUSINESS = ['Motors', 'Logistics', 'Homes', 'Capital', 'Construction', 'Energy', 'Foods', 'Insurance', 'Realty', 'Farms', 'Media', 'Medical Group', 'Holdings', 'Brewing'];

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ---------------- state ----------------
export function programBuild(state: GameState, teamId = state.user.teamId): ProgramBuild {
  const all = (state.build ??= {});
  if (all[teamId]) return all[teamId];
  const t = state.teams[teamId];
  const h = hash(teamId);
  const lvl = (k: FacilityKey, i: number) => {
    const base = k === 'academic' ? t.academics : t.facilities;
    return clamp(Math.round(((base - 1) / 9) * 4 + (((h >>> (i * 3)) % 3) - 1) * 0.6), 0, 4);
  };
  const levels = Object.fromEntries(FACILITY_KEYS.map((k, i) => [k, lvl(k, i)])) as Record<FacilityKey, number>;
  const pb: ProgramBuild = {
    teamId, fund: 0, levels, start: { ...levels }, baseRating: t.facilities, projects: [], boosters: genBoosters(t), ledger: [], names: {},
  };
  all[teamId] = pb;
  pb.fund = Math.round(projectedDonations(state, pb) / 50_000) * 50_000;
  pb.ledger.push({ season: state.season, label: 'Opening balance', amount: pb.fund });
  return pb;
}
export const ensureBuild = (state: GameState) => { programBuild(state); };

function genBoosters(t: Team): Booster[] {
  const n = 3 + Math.round(t.prestige / 30);
  const base = 60_000 * Math.exp(t.prestige * 0.022) * (0.6 + t.market * 0.08);
  const styles: BoosterStyle[] = ['loyal', 'win-now', 'old-guard', 'flashy', 'academic'];
  return Array.from({ length: n }, (_, i) => {
    const last = rng.pick(LAST_NAMES);
    return {
      id: rng.id('bst'), name: `${rng.pick(FIRST_NAMES)} ${last}`, business: `${last} ${rng.pick(BUSINESS)}`,
      style: styles[i % styles.length] === 'loyal' && i > 0 ? rng.pick(styles) : styles[i % styles.length],
      capacity: Math.round((base * rng.range(0.5, 2.6)) / 10_000) * 10_000, mood: rng.int(52, 72), pet: rng.pick(FACILITY_KEYS), given: 0,
    };
  });
}

export function facilityLevel(state: GameState, key: FacilityKey): number {
  return state.build?.[state.user.teamId]?.levels[key] ?? 0;
}
/** upgrades you built over what you inherited */
function bonus(pb: ProgramBuild | undefined, key: FacilityKey) {
  return pb ? Math.max(0, pb.levels[key] - pb.start[key]) : 0;
}

// ---------------- effects ----------------
/** Layer facility upgrades onto the user's program effects (called from staffEffects) */
export function applyFacilities(state: GameState, e: StaffEffects) {
  const pb = state.build?.[state.user.teamId];
  if (!pb) return;
  const b = (k: FacilityKey) => bonus(pb, k);
  e.dev += 0.45 * b('practice');
  e.injury *= 1 - 0.07 * b('medical');
  e.stamina *= 1 - 0.02 * b('medical');
  e.morale += 0.12 * b('lounge');
  e.retentionMul *= 1 - 0.03 * b('lounge');
  e.motivation += 0.25 * b('lounge');
  e.tactics += 0.45 * b('film');
  e.defense += 0.0012 * b('film');
  e.relMul *= 1 + 0.035 * b('recruiting');
  e.hours += b('recruiting');
  e.portal += 0.35 * b('recruiting');
}
/** extra home-crowd energy from arena upgrades (user's home games) */
export function facilityCrowd(state: GameState, homeId: string): number {
  if (homeId !== state.user.teamId) return 0;
  return 0.03 * bonus(state.build?.[homeId], 'arena');
}
/** upgrades to the Academic Center (fewer eligibility scares) */
export function academicUpgrades(state: GameState): number {
  return bonus(state.build?.[state.user.teamId], 'academic');
}
/** academic appeal for recruits (user's program) */
export function academicBonus(state: GameState, teamId: string): number {
  if (teamId !== state.user.teamId) return 0;
  return 3 * bonus(state.build?.[teamId], 'academic');
}
/** the school's facilities rating (used by recruiting and the portal) follows your upgrades */
function syncRating(state: GameState, pb: ProgramBuild) {
  const t = state.teams[pb.teamId];
  if (!t) return;
  const ups = FACILITY_KEYS.filter((k) => k !== 'academic').reduce((s, k) => s + bonus(pb, k), 0);
  t.facilities = clamp(Math.round((pb.baseRating + ups * 0.45) * 10) / 10, 1, 10);
}

// ---------------- money ----------------
export function projectedDonations(state: GameState, pb: ProgramBuild): number {
  const t = state.teams[pb.teamId];
  const base = 80_000 * Math.exp(t.prestige * 0.03) * (0.6 + t.market * 0.08) * (0.7 + t.hype / 100) * (1 + 0.04 * bonus(pb, 'arena'));
  const boosters = pb.boosters.reduce((s, b) => s + b.capacity * (b.mood / 100), 0);
  return Math.round((base + boosters) / 10_000) * 10_000;
}
const PAYOUT: Record<string, number> = { 'First Four': 150_000, 'Round of 64': 300_000, 'Round of 32': 600_000, 'Sweet 16': 1_000_000, 'Elite Eight': 1_500_000, 'Final Four': 2_500_000, 'Runner-up': 3_000_000, Champion: 4_000_000 };
const fmt = (n: number) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : `$${Math.round(n / 1000)}K`);
export const fmtFund = fmt;

function credit(pb: ProgramBuild, season: number, label: string, amount: number) {
  pb.fund += amount;
  pb.ledger.unshift({ season, label, amount });
  if (pb.ledger.length > 40) pb.ledger.length = 40;
}

/** End of season: boosters react to the year, then the checks come in */
export function seasonDonations(state: GameState) {
  const uid = state.user.teamId;
  const pb = programBuild(state, uid);
  const t = state.teams[uid];
  const h = t.history.find((x) => x.season === state.season);
  if (!h) return;
  const net = h.w - h.l;
  const tourney = h.ncaaSeed != null;
  const rivalWins = Object.values(state.rivals?.pairs ?? {}).filter((r) => r.active && (r.a === uid || r.b === uid)).reduce((s, r) => s + r.meetings.filter((m) => m.s === state.season).reduce((x, m) => x + (m.w === uid ? 1 : -1), 0), 0);
  for (const b of pb.boosters) {
    let d = 0;
    switch (b.style) {
      case 'win-now': d = net * 0.35 + (tourney ? 4 : -6) + (['Sweet 16', 'Elite Eight', 'Final Four', 'Runner-up', 'Champion'].includes(h.postseason) ? 5 : 0); break;
      case 'old-guard': d = rivalWins * 3 + (h.confChamp ? 5 : 0) + (h.confTourneyChamp ? 3 : 0) + net * 0.12; break;
      case 'flashy': d = (h.apFinal ? 8 - h.apFinal * 0.3 : -4) + (t.hype - 50) * 0.08; break;
      case 'academic': d = 1 + bonus(pb, 'academic') * 1.5 + net * 0.08; break;
      default: d = 1 + net * 0.1;
    }
    if (b.promise && b.promise.season === state.season && !pb.projects.some((p) => p.key === b.promise!.key && p.started === state.season) && !(pb.levels[b.promise.key] > pb.start[b.promise.key])) {
      d -= 25; // you took the money and didn't build it
    }
    b.promise = undefined;
    b.mood = clamp(b.mood + d + (60 - b.mood) * 0.2, 5, 100);
  }
  const base = projectedDonations(state, pb) - pb.boosters.reduce((s, b) => s + b.capacity * (b.mood / 100), 0);
  credit(pb, state.season, 'Annual fund donations', Math.round(base / 10_000) * 10_000);
  let boosterTotal = 0;
  for (const b of pb.boosters) {
    const gift = Math.round((b.capacity * (b.mood / 100)) / 10_000) * 10_000;
    if (gift <= 0) continue;
    b.given += gift; boosterTotal += gift;
  }
  if (boosterTotal) credit(pb, state.season, `Booster gifts (${pb.boosters.length} boosters)`, boosterTotal);
  const pay = PAYOUT[h.postseason] ?? 0;
  if (pay) credit(pb, state.season, `NCAA Tournament payout (${h.postseason})`, pay);
  pb.lastDonations = Math.round(base + boosterTotal + pay);
  addNews(state, { kind: 'user', headline: `${t.school} raises ${fmt(pb.lastDonations)} for the program fund`, body: `Donations, booster gifts${pay ? ' and the NCAA Tournament payout' : ''} bring the fund to ${fmt(pb.fund)}. ${pb.boosters.filter((b) => b.mood < 35).length ? 'A few boosters are grumbling.' : 'The boosters are happy.'}`, teams: [uid], important: true });
}

// ---------------- building ----------------
export function canBuild(state: GameState, key: FacilityKey): { ok: boolean; why?: string; cost: number; level: number } {
  const pb = programBuild(state);
  const level = pb.levels[key] + 1;
  const cost = upgradeCost(key, level, state.teams[pb.teamId]?.prestige);
  if (pb.levels[key] >= MAX_LEVEL) return { ok: false, why: 'Maxed out', cost, level };
  if (pb.projects.some((p) => p.key === key)) return { ok: false, why: 'Under construction', cost, level };
  if (pb.projects.length >= MAX_PROJECTS) return { ok: false, why: `Only ${MAX_PROJECTS} projects at a time`, cost, level };
  if (pb.fund < cost) return { ok: false, why: `Need ${fmt(cost - pb.fund)} more`, cost, level };
  return { ok: true, cost, level };
}

export function startProject(state: GameState, key: FacilityKey): { ok: boolean; msg: string } {
  const chk = canBuild(state, key);
  if (!chk.ok) return { ok: false, msg: chk.why ?? 'Not now' };
  const pb = programBuild(state);
  const opens = state.season + buildSeasons(chk.level);
  pb.projects.push({ key, level: chk.level, cost: chk.cost, started: state.season, opens });
  credit(pb, state.season, `${FACILITIES[key].name}: level ${chk.level} construction`, -chk.cost);
  // the boosters who wanted this one are thrilled (and some match it)
  let matched = 0;
  for (const b of pb.boosters.filter((x) => x.pet === key)) {
    b.mood = clamp(b.mood + 15, 0, 100);
    const gift = Math.round((b.capacity * 0.25) / 10_000) * 10_000;
    b.given += gift; matched += gift;
  }
  if (matched) credit(pb, state.season, `Matching gifts for the ${FACILITIES[key].name}`, matched);
  const t = state.teams[pb.teamId];
  addNews(state, { kind: 'user', headline: `${t.school} breaks ground on ${pb.names[key] ?? `a new ${FACILITIES[key].name.toLowerCase()}`}`, body: `The ${fmt(chk.cost)} project opens in ${opens}-${String((opens + 1) % 100).padStart(2, '0')}.${matched ? ` Boosters chipped in ${fmt(matched)} in matching gifts.` : ''}`, teams: [t.id], important: true });
  return { ok: true, msg: `Construction started. Opens in ${opens}-${String((opens + 1) % 100).padStart(2, '0')}.${matched ? ` Boosters matched ${fmt(matched)}!` : ''}` };
}

/** New season: ribbon cuttings */
export function openFacilities(state: GameState) {
  for (const pb of Object.values(state.build ?? {})) {
    const done = pb.projects.filter((p) => p.opens <= state.season);
    if (!done.length) continue;
    pb.projects = pb.projects.filter((p) => p.opens > state.season);
    pb.opened = { season: state.season, keys: done.map((p) => p.key) };
    for (const p of done) {
      pb.levels[p.key] = Math.max(pb.levels[p.key], p.level);
      if (pb.teamId === state.user.teamId) {
        const name = pb.names[p.key] ?? FACILITIES[p.key].name;
        state.user.moments.push({ kind: 'facility', teamId: pb.teamId, key: p.key, level: p.level, name });
        addNews(state, { kind: 'user', headline: `Ribbon cutting: ${state.teams[pb.teamId].school} opens its level ${p.level} ${name}`, body: FACILITIES[p.key].desc, teams: [pb.teamId], important: true });
      }
    }
    syncRating(state, pb);
  }
  // a better arena starts the year louder
  const pb = state.build?.[state.user.teamId];
  if (pb) { const t = state.teams[pb.teamId]; t.hype = clamp(t.hype + 1.5 * bonus(pb, 'arena'), 0, 100); }
}

/** Send capital money to the NIL collective (20% is lost to fees and the boosters notice) */
export function moveToNil(state: GameState, amount: number): { ok: boolean; msg: string } {
  const pb = programBuild(state);
  const amt = Math.min(Math.round(amount / 50_000) * 50_000, pb.fund);
  if (amt <= 0) return { ok: false, msg: 'Nothing to move.' };
  credit(pb, state.season, 'Transferred to the NIL collective', -amt);
  const t = state.teams[pb.teamId];
  t.nilBudget += Math.round(amt * 0.8);
  for (const b of pb.boosters) if (b.style === 'academic' || b.style === 'old-guard') b.mood = clamp(b.mood - amt / 1_000_000, 0, 100);
  return { ok: true, msg: `${fmt(Math.round(amt * 0.8))} added to your NIL pool (20% lost to fees).` };
}

/** Thank-you call: once a season per booster */
export function callBooster(state: GameState, id: string): { ok: boolean; msg: string } {
  const pb = programBuild(state);
  const b = pb.boosters.find((x) => x.id === id);
  if (!b) return { ok: false, msg: 'Booster not found.' };
  if (b.called === state.season) return { ok: false, msg: `You already called ${b.name} this season.` };
  b.called = state.season;
  b.mood = clamp(b.mood + 6, 0, 100);
  if (b.mood >= 62 && rng.chance(0.45)) {
    const gift = Math.round((b.capacity * rng.range(0.1, 0.22)) / 10_000) * 10_000;
    b.given += gift;
    credit(pb, state.season, `Gift from ${b.name}`, gift);
    return { ok: true, msg: `${b.name} loved the call and sent ${fmt(gift)}.` };
  }
  return { ok: true, msg: `${b.name} appreciated the call.` };
}

// ---------------- booster requests ----------------
/** In season, now and then a booster comes to you with an offer that has strings attached */
export function boosterWeek(state: GameState) {
  if (state.phase !== 'regular') return;
  const pb = programBuild(state);
  if (state.inbox.some((i) => i.id.startsWith('bst-') && !i.resolved)) return;
  if (!rng.chance(0.12)) return;
  const t = state.teams[pb.teamId];
  const b = rng.pick(pb.boosters);
  const last = b.name.split(' ').slice(-1)[0];
  const kinds: ('naming' | 'pet' | 'seats' | 'walkon' | 'demand')[] = ['seats', 'pet', 'walkon'];
  const unnamed = FACILITY_KEYS.filter((k) => !pb.names[k] && pb.levels[k] >= 1);
  if (unnamed.length && b.capacity >= 300_000) kinds.push('naming', 'naming');
  if (b.style === 'win-now' && t.record.streak <= -3) kinds.push('demand', 'demand', 'demand');
  const kind = rng.pick(kinds);
  const id = `bst-${rng.id('')}`;
  const choice = (label: string, accept: boolean, extra: Partial<InboxChoice> & { amount?: number; key?: FacilityKey } = {}): InboxChoice => {
    const { amount, key, ...rest } = extra;
    return { label, effects: [], ...rest, booster: { id: b.id, action: kind, accept, ...(amount ? { amount } : {}), ...(key ? { key } : {}) } };
  };
  let subject = '', body = '', choices: InboxChoice[] = [];
  if (kind === 'naming') {
    const key = rng.pick(unnamed);
    const amount = Math.round((b.capacity * 1.5) / 50_000) * 50_000;
    subject = `${b.name} wants their name on the ${FACILITIES[key].name}`;
    body = `"${fmt(amount)}, today, and it becomes the ${last} Family ${FACILITIES[key].name}. My grandkids would love it." ${b.name} (${b.business}) is one of our biggest supporters.`;
    choices = [choice(`Accept: the ${last} Family ${FACILITIES[key].name}`, true, { amount, key, hint: `+${fmt(amount)} to the fund`, result: `The ${last} Family ${FACILITIES[key].name}. The signage goes up next week.` }), choice('Decline: some things aren’t for sale', false, { hint: `${b.name} is hurt`, result: `${b.name} took it personally.` })];
  } else if (kind === 'pet') {
    const amount = Math.round((b.capacity * 0.9) / 50_000) * 50_000;
    subject = `${b.name} will fund the ${FACILITIES[b.pet].name}, with strings`;
    body = `"I'll send ${fmt(amount)} now. All I ask is that you break ground on the ${FACILITIES[b.pet].name} before the season's over." If you take the money and don't build it, ${b.name} won't forget.`;
    choices = [choice(`Take it and promise to build`, true, { amount, key: b.pet, hint: `+${fmt(amount)}; you must start that project this season`, result: `${fmt(amount)} is in the fund. Now build it.` }), choice('Decline: we set our own priorities', false, { hint: 'Mood drops a little', result: `${b.name} understood. Mostly.` })];
  } else if (kind === 'seats') {
    const amount = Math.round((b.capacity * 0.25) / 10_000) * 10_000;
    subject = `${b.name} wants courtside seats for clients`;
    body = `"A few of my clients want courtside for the next big home game. I'll make it worth your while: ${fmt(amount)}." The ticket office says it means bumping some longtime season-ticket holders.`;
    choices = [choice('Make it happen', true, { amount, hint: `+${fmt(amount)}; a little bad press`, effects: [{ kind: 'mediaRep', delta: -1 }], result: 'The clients loved it. The season-ticket holders did not.' }), choice('Seats are for the fans', false, { hint: `${b.name} is annoyed; fans approve`, effects: [{ kind: 'hype', delta: 2 }], result: 'The fans heard about it, and they loved it.' })];
  } else if (kind === 'walkon') {
    const amount = Math.round((b.capacity * 0.8) / 50_000) * 50_000;
    subject = `${b.name}'s nephew wants a spot on the team`;
    body = `"My nephew can really play. Put him on the team as a walk-on and I'll write a check for ${fmt(amount)}." He can't really play.`;
    choices = [choice('Give him a spot at the end of the bench', true, { amount, hint: `+${fmt(amount)}; the locker room rolls its eyes`, effects: [{ kind: 'morale', target: 'team', delta: -3 }], result: 'The nephew has a jersey. He has not touched the ball.' }), choice('Roster spots are earned', false, { hint: `${b.name} is unhappy; your players respect it`, effects: [{ kind: 'morale', target: 'team', delta: 2 }], result: 'Your players noticed. So did the booster.' })];
  } else {
    subject = `${b.name} is losing patience`;
    body = `"${t.school} has lost ${-t.record.streak} straight. I don't give money to losers. Turn this around, or my checkbook closes."`;
    choices = [choice('“We’ll turn it around. You have my word.”', true, { hint: 'Calms them for now; more pressure if it keeps going', result: `${b.name} will be watching the next few weeks.` }), choice('“With respect, you don’t run this program.”', false, { hint: `Mood drops; media likes the backbone`, effects: [{ kind: 'mediaRep', delta: 2 }], result: `${b.name} didn't love that. The media did.` })];
  }
  state.inbox.unshift({ id, day: state.day, season: state.season, from: b.name, fromRole: `Booster · ${b.business}`, subject, body, choices, resolved: false });
}

export function resolveBooster(state: GameState, r: NonNullable<InboxChoice['booster']>) {
  const pb = programBuild(state);
  const b = pb.boosters.find((x) => x.id === r.id);
  if (!b) return;
  const last = b.name.split(' ').slice(-1)[0];
  if (r.accept) {
    if (r.amount) { b.given += r.amount; credit(pb, state.season, `Gift from ${b.name}`, r.amount); }
    if (r.action === 'naming' && r.key) { pb.names[r.key] = `${last} Family ${FACILITIES[r.key].name}`; b.mood = clamp(b.mood + 25, 0, 100); }
    if (r.action === 'pet' && r.key) { b.promise = { key: r.key, season: state.season }; b.mood = clamp(b.mood + 8, 0, 100); }
    if (r.action === 'seats' || r.action === 'walkon') b.mood = clamp(b.mood + 10, 0, 100);
    if (r.action === 'demand') b.mood = clamp(b.mood + 4, 0, 100);
  } else {
    b.mood = clamp(b.mood - (r.action === 'naming' ? 12 : r.action === 'walkon' ? 14 : r.action === 'demand' ? 15 : 6), 0, 100);
  }
}

export function facilityGrade(pb: ProgramBuild): string {
  const avg = FACILITY_KEYS.reduce((s, k) => s + pb.levels[k], 0) / FACILITY_KEYS.length;
  return avg >= 4.6 ? 'A+' : avg >= 4 ? 'A' : avg >= 3.4 ? 'B+' : avg >= 2.8 ? 'B' : avg >= 2.2 ? 'C+' : avg >= 1.6 ? 'C' : avg >= 1 ? 'D' : 'F';
}
export function underConstruction(pb: ProgramBuild, key: FacilityKey): FacilityProject | undefined {
  return pb.projects.find((p) => p.key === key);
}
