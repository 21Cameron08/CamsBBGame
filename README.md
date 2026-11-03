# 🏀 Courtside Dynasty

**A modern college basketball coaching dynasty sim.** Take over any of the **365 Division I programs** in their real **2026–27 conferences** and build a dynasty in today's game: NIL and revenue sharing, the transfer portal, recruiting wars, press conferences, social media, and the full 68-team NCAA Tournament.

Everything runs in the browser. There's no server and no account; saves live in your browser and can be exported to a file.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Production build: `npm run build`, then `npm run preview` (or host the `dist/` folder on any static host). There's an optional manual GitHub Pages workflow in `.github/workflows/deploy-pages.yml`.

---

## What's in the game

### 🧢 Your coach
- Create your coach with a **procedural face editor**: 22 features including skin tone, 24 hairstyles, facial hair, glasses and outfit.
- Pick an archetype: **Recruiter, Tactician, Players Coach, Developer, Showman, Portal King**. Each one starts you with different skills.
- Earn XP from wins, titles, commits and draft picks. Level up and spend points across 7 skills: Recruiting, Development, Tactics, Motivation, NIL Dealmaker, Media Savvy, Portal Whisperer.
- **Job security, reputation and media relations**:
  - Your AD sets an expectation every season ("Make the NCAA Tournament", "Reach the Sweet 16", and so on).
  - Overachieve to earn an extension; underachieve and you're on the hot seat.
  - Get fired and you'll have to pick up the pieces at another school.
- A **coaching carousel** runs every spring. AI coaches get fired, retire, or get poached by bigger jobs, and you get job offers too.

### 📋 Coaching staff
- **Six roles**: Associate Head Coach, Recruiting Coordinator, Defensive Coordinator, Player Development, General Manager and Strength & Conditioning.
- Each staffer has a rating, a trait (X&O Wizard, Recruiting Ace, Rising Star and more), loyalty, ambition and a contract.
- Their effects feed straight into the game:
  - game-day tactics and defense
  - recruiting hours and **pipeline states**
  - offseason development
  - the NIL pool, portal pitches and retention costs
  - fatigue and injuries
- **Hiring market**:
  - Offer the asking salary, +15% or +25%.
  - Candidates show how interested they are in your program.
  - Hires come out of a staff pool sized to your school.
  - Firing costs a buyout.
- **Poaching and your coaching tree**:
  - Strong, ambitious assistants get offered head coaching jobs.
  - Counter-offer to keep them, or give your blessing.
  - Those who leave become head coaches around the country and join your coaching tree.
- Expiring contracts come up for renewal each spring. Your Associate HC writes your pregame scouting reports.

### 🗓️ Non-conference scheduling
- Every offseason, the **Scheduling Office** lets you build next year's 12 non-conference dates. Conference play stays set by the league.
- **Feast Week events.** Pick a Thanksgiving-week tournament, from elite invite-only fields in Maui and the Bahamas down to small-school events. Or skip it.
- **Book games** at home, on the road, on a neutral site, or as a **home-and-home** series whose return game is locked in next year.
- **Opponents answer realistically:**
  - Contenders won't come to your gym without a return trip.
  - Smaller schools take **buy games** for a guarantee check.
  - Bigger programs will **pay you** to visit, and that money goes to your NIL pool.
- **A live résumé meter** shows strength of schedule, projected Quad 1 and Quad 4 games, expected record and net guarantees, plus a verdict on how the committee will view it.
- **Rivalry games** are pre-booked, but you can drop one.
- **Auto-fill** hands the open dates to your staff; a GM schedules smarter.
- **Your choices have consequences:** marquee home games build fan hype, money flows into your NIL pool, and the media asks about your slate at media day.

### 🏟️ Real schools, real 2026–27 conferences
- **365 programs** in **32 conferences**, using the realignment that takes effect July 2026:
  - the rebuilt Pac-12
  - an expanded Mountain West
  - Gonzaga and Texas State in the Pac-12
  - Louisiana Tech in the Sun Belt
  - the WAC renamed the UAC
  - the MAAC renamed the Metro
  - and the rest.
- Each school has real colors, arena, location, prestige, NIL market, academics and facilities. **About 100 real rivalries** get special billing.
- All players, coaches and media members are **fictional** and procedurally generated.

### 🏀 The game engine
- A **possession-by-possession simulation**, tuned to real D-I averages: about 72 PPG, about 35% from three, about 67 possessions per game, realistic upset rates.
- **Offensive systems**: Balanced, Motion, Pace & Space, Inside-Out, Dribble Drive, Bombs Away.
- **Defensive schemes**: Man, Pack Line, 2-3 Zone, Full-Court Press, Switch Everything.
- You also control tempo, rotation depth and the starting five.
- Fatigue, foul trouble, intentional fouling late, clutch shooters, home crowds, momentum runs, overtime and buzzer beaters are all modeled.
- **Live game view**:
  - An animated court with player markers, shot arcs and makes and misses.
  - Play-by-play with highlight bursts: SLAM!, REJECTED!, BUZZER BEATER!
  - A live win-probability chart, live box score and shot chart.
  - Timeouts and in-game strategy changes, at 1×/2×/4×/10× speed or sim to half or end.
- **Pregame matchup intro** with a scouting report, keys to the game, the betting line and your game plan.

### 💰 Modern college hoops
- **NIL + revenue sharing.** Every program has a pool sized by prestige, conference, market and fan hype.
  - Every player has a market value. Underpaid players lose morale and become portal risks.
  - Renegotiate deals, auto-sign at market value, and watch the national top-earners list.
- **Recruiting.** About 1,350 prospects per class (high school, prep, JUCO and international), with star ratings and national and position rankings.
  - Each prospect weighs what matters to him: NIL, playing time, prestige, proximity, coach relationship, pro development, academics, winning.
  - Spend weekly hours on texts, calls, assistant visits, in-home visits, official visits and scouting.
  - Make scholarship offers with NIL money and role promises. Break a promise and morale craters.
  - AI programs recruit against you all season.
  - **Commitment ceremonies**: hats on the table, a drumroll, and the reveal.
- **Transfer portal: a live six-day window.**
  - **Retention meetings first.** Each unhappy player tells you why he's leaving: playing time, NIL money, a bigger stage, a coaching change, or wanting to be closer to home. Pay him, promise a role, or have a heart-to-heart, with the odds of each option shown up front.
  - **Players enter in waves**, including stars who pull out of the NBA draft mid-week. Each one has portal stars, a big-board rank, his reasons and a decision day.
  - **Recruit each target**: call him to learn what he wants, do a staff Zoom, bring him in for an official visit, then offer NIL money, a one- or two-year deal and a role promise.
  - **Honest odds**: the percentage bars are each player's real chances against every rival school, and **Your shot** shows your odds before you even offer.
  - **Bidding wars**: rival schools raise their offers, and players call you asking you to match.
  - **The Portal Wire**: a live feed of entries, top-5 lists, visits, insider leaks and commitments.
  - **Decision Day reveals** flip over your wins and losses each night, and every program gets **portal grades** when the window closes.
  - The **Staff auto-recruit** toggle lets your assistants work the portal for you.
- **NBA Draft.** Early-entry decisions, then two rounds of picks. Producing pros boosts your program.
- **Player development** each summer depends on potential, age, minutes, coaching skill and traits such as Gym Rat or Raw.

### 📺 Immersion
- **Press conferences**:
  - an introductory presser, media day, postgame after big wins and bad losses, and end of season
  - reporters with faces, a typewriter effect on each question, camera flashes
  - your answers move morale, hype, job security, media relations, recruiting and even NIL money
- **Story events** in your Office:
  - boosters with strings attached
  - viral moments
  - agents asking for mid-season raises
  - academic eligibility scares
  - locker-room fights
  - the national pregame show coming to campus
  - assistants getting poached
  - redshirt decisions
  - injured players begging to play
- **Media hub**: auto-written game recaps, upset alerts, commitment and portal news, awards and draft coverage, plus **Courtside**, a fictional social feed of fans, insiders, analysts, haters and recruits.
- **Polls and postseason**:
  - AP Top 25 voting with momentum, NET-style ratings, Wins Above Bubble, and weekly **Bracketology**
  - all 32 conference tournaments, Selection Sunday with S-curve seeding and the First Four, and a full bracket view
- **Awards**: National POY, All-American teams, Freshman of the Year, DPOY, Coach of the Year, conference POYs, Final Four MOP.
- **Program history**: championship banners, a season-by-season table, a trophy case, award winners and draft picks.
- **Atmosphere**:
  - the whole UI re-themes to your school's colors
  - synthesized sound effects (swish, rim, buzzer, crowd)
  - confetti and title celebrations
  - a scrolling score ticker

---

## Custom logos & files

No logos ship with the game; they're trademarks of their schools. Teams without a logo get a generated badge in school colors. Add your own logos in either of two ways.

1. **Drop files in** `public/assets/logos/<team-id>.png|svg|webp`. For example: `duke.png`, `north-carolina.svg`, `texas-am.webp`. Team ids are the kebab-case slugs in `src/data/teams.ts`, and they're also listed in-game. See [`public/assets/logos/README.md`](public/assets/logos/README.md), including the optional `manifest.json`.
2. **Upload in-game**: **Settings & Mods → Logos & Files → Upload.** Uploads are stored in your browser and take priority over files.

**Team data mods.**
- Put a `public/mods/teams.json` file in place to override names, colors, prestige, arenas and more for new dynasties. See [`public/mods/README.md`](public/mods/README.md) and `teams.example.json`.
- Or use the in-game **Team Editor**, which can apply edits to your current dynasty and import or export the same JSON.

**Saves.** The game autosaves to your browser (IndexedDB). Use **Settings → Export Save File** to back up a dynasty or move it to another device, and **Import Save** on the title screen to load it.

---

## Project layout

```
src/
  data/        Static data: 2026-27 conferences, 365 teams, rivalries, name pools, hometowns
  engine/      Pure TypeScript game logic (no React)
    sim.ts         possession-based game engine (fast + live play-by-play modes)
    season.ts      daily/weekly loop, results, polls, recruiting ticks, events
    schedule.ts    non-conference + conference schedule generation, MTEs, rivalries
    rankings.ts    SRS/NET ratings, WAB, AP poll, NCAA field selection & seeding
    postseason.ts  conference tournaments + 68-team bracket
    recruiting.ts  class generation, interest model, AI recruiting, user actions
    nil.ts         NIL budgets, valuations, deals
    offseason.ts   awards, carousel, declarations, signing day, draft, development
    portal.ts      transfer portal: retention, entry waves, odds, bidding wars, calls, decisions, grades
    press.ts / events.ts / media.ts   press conferences, story events, news & social
    staff.ts       coaching staff: market, effects, contracts, poaching, coaching tree
    scheduling.ts  Scheduling Office: Feast Week events, booking rules, guarantees, series, résumé meter
    world.ts       new-dynasty creation
  store/       Zustand store, IndexedDB saves, mods
  ui/          React UI (screens, overlays, live game, face generator, logos, sound)
scripts/       Engine calibration (npm run sim:test) and full-season smoke test (npm run season:test)
```

## Dev scripts
- `npm run dev`: start the dev server.
- `npm run build`: typecheck, then production build.
- `npm run sim:test`: run thousands of games and print league-wide shooting, pace, turnover and margin stats (for tuning the engine).
- `npm run season:test`: simulate two full seasons and offseasons headless and print a report.

---

*Courtside Dynasty is a fan-made game and is not affiliated with the NCAA or any university. School names are used for identification only. All players, coaches, reporters and media outlets are fictional.*
