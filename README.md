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
- **Prestige moves, the league doesn't inflate.** Every season, programs are ranked by rating plus their NCAA run, and each one's prestige drifts toward the prestige that rank held when the dynasty began. A low-major that keeps winning climbs and a blue blood that slumps slides, but the league keeps the spread it started with. Older saves whose prestige already drifted up ease back down gradually, losing about a tenth of the excess each season.
- All players, coaches and media members are **fictional** and procedurally generated.
- **Conference realignment** (a setting chosen with difficulty when you start a dynasty; change it later in Settings → Preferences):
  - **Off**: conferences stay exactly as they are
  - **Realistic**: every few years a wave hits. Conferences invite strong programs from the tier below (within reach of their footprint), a power program occasionally jumps to a richer league, and leagues that lose members backfill from below.
  - **Chaos**: superconferences of up to 20, power programs jumping ship, and a shake-up almost every year
  - moves are announced when the season ends (news, the Standings tracker, the radio show, the press) and take effect before the next Scheduling Office opens
  - if **your school is invited**, your AD asks you to accept or decline. If you don't answer, the AD accepts. Moving up means a bigger NIL pool and prestige; your old conference rivals take it personally.
  - your first season in a new league opens with a "Welcome to the ..." moment and a media-day question. Newcomers get a NEW badge in the standings.
  - each season's conference is saved in team histories, so past conference champions stay correct
  - the Ivy, SWAC and MEAC stay out of it. Small leagues get extra non-conference games so everyone plays a full schedule.
  - older saves start with realignment off

### 🏀 The game engine
- A **possession-by-possession simulation**, tuned to real D-I averages: about 72 PPG, about 35% from three, about 67 possessions per game, realistic upset rates.
- **The Playbook**: 10 offenses and 9 defenses, each with its own strengths, weaknesses and personnel needs.
  - **Offenses**: Balanced, Motion, Pace & Space, Inside-Out, Dribble Drive, Five-Out Bombs, Princeton, Flex, Spread Pick-and-Roll, Star Iso.
  - **Defenses**: Man-to-Man, Pack Line, 2-3 Zone, 1-3-1 Trap, Matchup Zone, Full-Court Press, Switch Everything, Denial Man, Box-and-One.
  - **Personnel fit (0–100)** measures how your roster's strengths suit each scheme, compared to its own talent level, so even a smaller program can be a perfect fit. Each scheme explains your fit, e.g. "Bigs who can pass" or "2.5 knockdown shooters". A great fit is worth a few points a game, and a bad one costs you.
  - **Installation**: your players have to learn a system.
    - A change in the offseason is installed by tip-off.
    - Switching mid-season starts it partly installed and costs points until practice catches up. Game Prep weeks and your Tactics skill speed it up.
  - **Counters**: certain schemes beat others. Some examples:
    - Box-and-One smothers Star Iso.
    - Inside-Out feasts on Switch Everything.
    - Princeton burns Denial Man.
    - Five-Out shoots over Pack Line and zones.
    - The Next Opponent card and the pregame report show your edges and suggest counters.
  - **Coaching tendencies**: offensive rebounding (crash vs. get back), shot profile (paint vs. threes), ball pressure and help defense, plus a **go-to scorer**.
  - AI coaches choose schemes that fit their rosters and their own preferences, so every program plays differently.
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
  - **Honest commit odds.** Every recruit shows **"If he decided today"**: his interest in each school and the real percentage chance he picks it. The weekly decision uses exactly those numbers, so a 10-point lead is about 84% and a 20-point lead about 96%.
  - **Preview before you offer**: drag the NIL slider or change the role promise and watch your odds move. Every call or visit tells you how much it moved them.
  - **Warnings when a lead won't count**:
    - you lead but haven't offered
    - you're out of scholarships
    - a rival is pulling away for an early commitment
    - a school he likes more hasn't offered yet
    - he won't commit until someone reaches 55 interest
  - A **scholarship counter** shows next season's open spots, returning players, commits and offers out.
  - **Commitment ceremonies**: hats on the table, a drumroll, and the reveal. Afterwards you see the final odds and why he chose, e.g. "NIL money ($2.25M vs $120K) and pro development".
  - Prospects whose decision date falls after the season pick on **Signing Day**, using the same odds. Your signees always join your roster, even if the portal filled it.
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

### 🏗️ Program building: facilities and boosters
- **Program Fund**, a separate pot from NIL, filled at the end of every season by annual donations, booster gifts and NCAA Tournament payouts (from $150K for the First Four up to $4M for a title). Every program starts with one year of donations.
- **Seven facilities**, each with five levels. Upgrades take one season to open, or two for levels 4 and 5. Costs scale with the program, and you can run two projects at once.
  - 🏋️ Practice Facility: player development
  - 🏟️ Arena & Fan Experience: home-crowd energy, preseason hype, donations
  - 🩺 Sports Science & Medicine: injury risk and fatigue
  - 🛋️ Players' Lounge & Locker Room: weekly morale, cheaper retention asks, motivation
  - 🎥 Film & Analytics Suite: tactics (installs and game plans), defense
  - 🎯 Recruiting Center: recruiting hours, relationship gains, portal pull
  - 🎓 Academic Center: academic appeal with recruits, fewer eligibility scares
- **Only your upgrades count.** What you inherit is already part of the school's prestige, so a low-major that builds can close the gap. Your upgrades also raise the school's facilities rating, which recruits and transfers notice.
- **Boosters** (3–6 per school), each with a personality:
  - Lifer, Win-Now, Old Guard, Flashy or Academic
  - a mood that rises and falls with your season
  - a pet project, and matching gifts when you build it
  - one thank-you call per season each
- **Booster requests** in your Office, each with strings attached:
  - naming rights ("the Hunt Family Arena")
  - money for their pet project (break your promise and they remember)
  - courtside seats for clients
  - a nephew who wants a roster spot
  - ultimatums during losing streaks
- **Move money to NIL**: send fund money to this season's NIL pool (20% lost to fees, and the old guard won't love it)
- ribbon-cutting celebrations when facilities open, a media-day question, and a ledger of every dollar
- **Facilities arms race** (a setting chosen with difficulty when you start a dynasty, on by default; change it later in Settings → Preferences; older saves start with it off):
  - AI programs raise money and build too. Big markets, winners, tournament teams and programs whose prestige has outrun their buildings break ground most often.
  - every facility ages a little each year, yours included, so standing still means falling behind
  - AI projects only move the facilities rating that recruits and transfers see; they don't change games
  - the Facilities page ranks your conference by facilities rating, with each school's change since the race began, and lists who broke ground last offseason
  - offseason headlines for big projects, flagged when a conference foe or rival builds

### 🧩 Locker room & chemistry
- **Team chemistry (0–100)** for every program, from Toxic to Brotherhood. It moves a little each week toward a target built from:
  - your captains (good captains help; a diva or hothead wearing the C hurts)
  - leaders and glue guys on the roster, and divas and hotheads
  - team mood, and players unhappy with their role or minutes
  - continuity (how much of the rotation is back) and how many transfers are still learning each other
  - recent results, the head coach's motivation skill, and what you've done in the locker room
- **What it does:** a small edge in every rating, a bigger one late in close games, steadier morale, and fewer (or more) players heading for the portal. AI teams have chemistry too, so it isn't a free bonus.
- **Name your captains** each preseason (or let your staff pick). Every player gets a captain grade, from Natural Leader to Wrong Guy. Passing over seniors for a freshman stings, and stripping a captain mid-season crushes him.
- **Locker-room dilemmas** in your Office:
  - a player who wants a bigger role (promise him minutes and the staff checks whether you kept your word)
  - a freshman outplaying a senior starter
  - curfew, class and social-media trouble, and a diva's cryptic tweets
  - two locker rooms (transfers vs. returners)
  - a captain who has checked out
  - a star's NBA buzz, a viral bench celebration, a prank war and requests from the players
  - players-only meetings after losing streaks, which go well or badly depending on your captains
- moments that need no decision, like a captain calling out the team or a player organizing a team bowling night
- **Senior Night** after your last home game, with a celebration for your seniors
- **The Locker Room page:**
  - a chemistry gauge, the season trend and what's driving it
  - every player's group (returner, transfer, newcomer), role, minutes against what he expected, and mood
  - the captain picker, the groups in the room, a season log and past captains
- chemistry shows up on the dashboard, the pregame screen, at press conferences ("Is your locker room fractured?") and on Full Court Fanatics

### 🏀 Pros from your program
- **Every drafted player gets a pro career.** He develops toward his ceiling, then declines with age. He plays in the NBA, the G League or overseas, and he can be traded, become a star or a bust, and eventually retire.
- **Honors:** All-Star nods, All-NBA teams, MVPs, Rookie of the Year and NBA titles, plus career scoring and earnings
- **In the League** (Program History): every pro your school has produced, with status, honors and career numbers, and a national **NBA Pipeline** ranking of schools by former players on NBA rosters
- **Recruiting:** recruits who care about going pro weigh your NBA pipeline, and their decision reasons say so ("the NBA pipeline: 6 vs 2 former players in the league")
- offseason headlines when your alumni make an All-Star team, win a title or retire, and a pro check-in on Full Court Fanatics
- older saves rebuild pro careers from their draft history

### 🏋️ Player development
- **A development plan for every player.** Pick one of seven focuses:
  - Balanced
  - Shooting
  - Attack the Rim
  - Playmaking
  - Lockdown D
  - Protect the Paint
  - Weight Room
- Each plan steers growth toward three ratings, and weak ratings grow fastest. You see the projected summer gain for the plan (e.g. "3PT +7 · MID +5 · FT +6 · OVR +3"), plus your staff's pick.
- **Spotlight** up to three players for 30% more growth.
- If you have a Player Development coach on staff, they draft plans for new arrivals.
- **Weekly practice plan** during the season, each with a trade-off:
  - **Standard:** no edge, no cost.
  - **Skill Development:** in-season growth along each player's plan, but less game prep.
  - **Game Prep:** a tactics bonus in that week's games.
  - **Conditioning:** lasting stamina, but a higher injury risk.
  - **Recovery:** injuries heal faster and morale lifts.
  - **Compete Week:** fast growth, but morale and injury costs.
- **Player goals.** Every rotation player wants something:
  - minutes
  - a starting job he was promised
  - points
  - a tournament run before he graduates
  - a better NBA draft projection
- You can track each goal's progress live. At season's end, players who hit their goals are happier and far less likely to transfer. Those who missed are more likely to look around.
- **Summer Development** is its own offseason step: set plans and spotlights, run the workouts, then watch the reveal:
  - each player's overall counting up
  - his focus ratings before and after
  - 🚀 breakouts and ⏸ stalls
  - NBA draft stock moving
  - players who grow into a new role, like a center who comes back a Stretch Big
- Breakouts make the news and come up at Media Day.
- AI programs develop the classic way, based on potential, age, minutes, coaching skill and traits such as Gym Rat or Raw.

### 📺 Immersion
- **Press conferences**:
  - an introductory presser (including when you change jobs), media day, postgame after big wins and bad losses, **Selection Sunday**, and end of season
  - **Over 100 question templates** that react to the moment, with several phrasings each. Questions you've heard recently are held back, so pressers don't repeat.
  - **Longer-term questions**:
    - last season's finish and who knocked you out of March
    - who left for the draft or the portal, and who arrived
    - your record over your whole tenure
    - tournament droughts
    - contract talk and the hot seat
    - job rumors when other schools come calling
  - **Game-specific questions**:
    - comebacks and blown leads
    - hot and cold shooting, turnovers, free throws, the bench
    - rematches, and revenge games against last year's NCAA opponent
    - the conference race and bubble talk
    - senior night, career milestones, a transfer facing his old team
  - **The media remembers what you said.** Bold claims like "Clear your calendars for April", "We're winning the league" or "He's an All-American" get read back to you later, quote and all, when you deliver or fall short.
  - **A cast of reporters**: your program's own beat writer, local TV, national insiders, a columnist, an analytics writer, student radio and the visiting team's beat writer, each with their own kind of question
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
- **Full Court Fanatics**, a weekly fan radio show on the fictional 98.7 The Hoop (sidebar → **Fan Radio**):
  - two hosts: **Big Sal**, who brings hot takes, bad takes and an uncle with opinions, and **Dex "The Professor"**, who brings good takes, numbers and random info
  - a new episode every week of the season, built from your league:
    - the poll: new No. 1s, risers and fallers, overrated and underrated teams by the NET
    - the week's upsets, thrillers, blowouts and best individual games
    - your team: results, your best player, your defense, what you told the press, the hot seat and your next game
    - the Player of the Year race, the nation's leading scorer, freshmen and stat leaders
    - the recruiting trail, Championship Week bubble talk, and bracket talk all through March
    - program traditions and history, and entries from the record book
    - the Hot Take Hotline, with callers from your town and around the country
  - **Locks of the Week**: both hosts pick a game, the results are read on air the next week, and a season-long lock standings board keeps score
  - **Preseason predictions** (champion, sleeper, bust, Player of the Year) go on the record and are graded in the season finale
  - offseason specials: the season finale, the portal, Signing Day and draft night
  - each episode plays line by line. Words appear as the hosts speak, and the speaker's booth lights up. Takes are labeled (🔥 hot, 🗑️ bad, 🎯 good, 💡 random info, 🔒 lock).
  - controls: 1×, 1.5×, 2× and 3× speed, pause (Space), next line (→), skip segment, jump to any segment, read the full transcript, and an archive of the last 12 episodes
  - a quiet toast and a **NEW** badge on the sidebar when an episode airs. Older saves get a first episode the next time they load.
- **Media hub**: auto-written game recaps, upset alerts, commitment and portal news, awards and draft coverage, plus **Courtside**, a fictional social feed of fans, insiders, analysts, haters and recruits.
- **Polls and postseason**:
  - AP Top 25 voting with momentum, NET-style ratings, Wins Above Bubble, and weekly **Bracketology**
  - all 32 conference tournaments, Selection Sunday with S-curve seeding and the First Four, and a full bracket view
- **The Selection Sunday Show**, an animated TV-style bracket reveal:
  - a cold open with the studio crew, then the four No. 1 seeds flipping in
  - each region revealed matchup by matchup, with your region saved for last
  - a "Waiting on…" ticker that builds suspense until your name is called, then confetti and your first opponent
  - the First Four, Last Four In and First Four Out, and heartbreak if you just miss
  - a result card with your seed, first opponent, likely second-round matchup, the No. 1 seeds and the conferences with the most bids
  - **1×, 2× and 4× speed**, pause (Space), next (→) and **skip** (Esc), plus a **replay** button on the Bracket page
  - your Selection Sunday press conference follows the show
- **Awards**:
  - National POY, All-American teams, Freshman of the Year, DPOY, Coach of the Year, conference POYs and Final Four MOP
  - added with Awards Night: **Sixth Man of the Year**, **Most Improved Player**, **Transfer of the Year**, **Performance of the Year**, **Upset of the Year** and **Game of the Year**
- **Awards Night**, an animated awards show at the end of every season:
  - for each award: the nominees flip in, the envelope opens, and the winner gets the spotlight and confetti. If it's your player or you, there's a "YOURS!" celebration.
  - the All-America First Team revealed one by one (Second and Third Teams listed), then the National Player of the Year with extra suspense
  - closes with the **Hall of Fame** class and a recap: every winner, your program's haul, and your Hall of Fame pace
  - 1×, 2× and 4× speed, pause (Space), next (→) and skip (Esc). Your season-end press conference follows the show. Replay any show from Program History or the Hall of Fame.
- **Hall of Fame** (Programs & Coaches → Hall of Fame):
  - the first ceremony opens with a charter class of legends from the most storied programs
  - after that, players get in once their careers are over, on their hardware (National POY, All-American teams, Final Four MOP, DPOY, a retired jersey)
  - coaches get in a year after retiring, with a Legacy Score of 140 or 650 career wins
  - up to three players and two coaches each year, shown on bronze plaques by class
  - a tracker shows how close you are to your own plaque
- **Rivalries 2.0** (sidebar → **Rivalries**):
  - every rivalry has **heat** (Lukewarm, Heated, Bitter, Blood Feud). Close games, upsets, ranked showdowns, conference tournament and NCAA meetings, and snapped streaks heat it up. When one side dominates or the teams stop meeting, it cools off.
  - about 100 historic rivalries never die; they cool back toward their traditional level
  - **new rivalries are born** from:
    - NCAA Tournament grudges
    - conference powers that keep meeting with the league on the line
    - your games that keep coming down to the wire
    - a coach leaving one school for another (yours included: your old school becomes a rival)
    - star transfers, and recruiting wars you lose
  - born rivalries get generated names (like "The Battle for Texas" or "The Lawson Bowl") and **fade** if they go cold
  - **series records, streaks, meeting history and biggest wins** for every rivalry, plus a heat-by-season chart
  - **rivalry trophies** go to the winner of every meeting. Yours hang on the History screen, and taking one back triggers a celebration.
  - rivalry games are louder (home crowd boost scales with heat). Wins bring hype, morale and job security; losing streaks to a rival cost you.
  - **Rivalry Week**:
    - headlines when the hottest rivalries meet
    - a banner on the Rivalries page and a rivalry strip on the dashboard and pregame screens
    - a Rivalry Corner on the radio show, with trash-talking callers from the rival town
  - the press asks about trophies, streaks, new rivalries and facing your old school
  - hot born rivalries get scheduled as non-conference games, and they show up in your Scheduling Office
- **Programs & Coaches** (sidebar), a stats hub for the whole league since your dynasty began:
  - **Program leaderboards** with five views:
    - Overview: seasons, W-L, NCAA bids, Sweet 16s, Final Fours, titles, weeks at No. 1, pros produced
    - Postseason: NCAA W-L, Elite Eights, runner-ups, all-time titles including real pre-2026 titles, conference regular-season and tournament titles
    - Polls & Top 25: weeks ranked, weeks at No. 1, preseason No. 1s, final Top 25 and Top 10 finishes, record vs AP Top 25 teams
    - Talent: players drafted, first-rounders, lottery picks, All-Americans, Players of the Year, average recruiting class rank, top-10 classes, retired jerseys
    - Home & Road: home and road records, points scored and allowed, longest win streak, biggest win
  - every program has a **Program Stats** page:
    - 16 stat tiles and its best season, longest streak and biggest win
    - season by season: home/away splits, record vs the Top 25, scoring, streaks, weeks ranked and peak rank, AP finish, NCAA result and record, recruiting class rank
    - every head coach the program has had, the pros it produced, every national title, and your record against it
  - **Coach rankings** to settle who's best:
    - every active head coach, plus the retired and fired ones, ranked by a **Legacy Score** built from tournament runs, bids, conference titles, Top-25 finishes, winning, Coach of the Year awards, star players and pre-dynasty wins
    - tiers: Unproven, Rising, Proven, Elite, Hall of Famer, Legend
    - a podium, where you rank, the winningest active coach, the most titles and the best win %
    - each **Coach Profile** shows dynasty and career records, NCAA record, Final Fours, titles, COY awards, pros coached, a Legacy Score breakdown, coaching stops, season by season, and your head-to-head record against him
  - the season in progress counts toward records and scores. Sortable columns, conference filter and search. Open it from the sidebar, the History screen, any Team page or your Coach Career page.
- **Program history**: championship banners, a season-by-season table, a trophy case, award winners and draft picks.
- **Program lore** for **71 of the best-known programs** (blue bloods, the big conferences, famous Cinderellas):
  - real traditions, fan bases, student sections and arena nicknames, plus each program's national titles through the 2025–26 season. No real players are named.
  - pre-dynasty title banners hang in your rafters from day one, and the History screen and Team page count every title
  - a **Ring of Honor** of fictional legends for each of these programs, with jerseys, eras, nicknames and a line about each
  - home crowds get a broadcast line at tip-off in the pregame and the play-by-play, and a signature send-off when the home team has a game in hand (the Rock Chalk Chant in Lawrence, "C-A-T-S! Cats! Cats! Cats!" at Rupp, the Gator Chomp, and more)
  - media-day and introductory press questions about the program's titles, its crowd and its legends
  - the team picker shows each program's identity and title count, and your recruiting pitch sells your titles, your building and your retired jerseys
  - other schools have no generated lore yet; their story is whatever your dynasty writes
- **Retired jerseys at any school**: when a great player leaves, his school retires his number. A National Player of the Year or a two-time First Team All-American always goes up. Anyone else needs two strong claims (an All-American year, starring for a national champion, Final Four MOP, two conference POYs, or 2,300 points). Each retirement makes the news. It gets a jersey night the next season, with a hype bump and a press question if he played for you. Nobody new can wear the number.
- **Record Book** with **League Records** and **Program Records**, kept from the first season of your dynasty:
  - **Single Game:**
    - player records: points, rebounds, assists, steals, blocks, threes
    - team records: points, margin of victory, threes
    - each entry shows the opponent and the full stat line
  - **Single Season:**
    - player records: points and PPG, rebounds and RPG, assists and APG, steals, blocks, threes, FG%
    - team records: wins, win %, points per game, fewest points allowed
  - **All-Time:**
    - career leaders: points, rebounds, assists, steals, blocks, threes, games, PPG
    - program totals: titles, Final Fours, Sweet 16s, NCAA appearances, conference titles, wins
  - Top-10 lists for the league and every program you've coached, plus the record holder for every other program.
  - When a record falls you get a headline. If it's one of your players, the press asks you about it.
  - Open it from the sidebar, or from **Program History → Program Record Book**.
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
  data/        Static data: 2026-27 conferences, 365 teams, rivalries, name pools, hometowns, program lore (lore.ts)
  engine/      Pure TypeScript game logic (no React)
    sim.ts         possession-based game engine (fast + live play-by-play modes)
    schemes.ts     the playbook: offensive/defensive schemes, roster fit, counters, installation, AI scheme choice
    season.ts      daily/weekly loop, results, polls, recruiting ticks, events
    schedule.ts    non-conference + conference schedule generation, MTEs, rivalries
    rankings.ts    SRS/NET ratings, WAB, AP poll, NCAA field selection & seeding
    postseason.ts  conference tournaments + 68-team bracket
    recruiting.ts  class generation, interest model, honest commit odds, decisions & reasons, AI recruiting, user actions
    nil.ts         NIL budgets, valuations, deals
    offseason.ts   awards, carousel, declarations, signing day, draft
    development.ts player development: plans, spotlight, weekly practice, goals, summer workouts
    records.ts     league and program record books: single game, single season, career, team
    legacy.ts      program legacy: Ring of Honor legends, jersey retirements, jersey nights, recruiting pitch
    portal.ts      transfer portal: retention, entry waves, odds, bidding wars, calls, decisions, grades
    press.ts       press conferences: question pools, reporters, media memory and follow-ups
    radio.ts       Full Court Fanatics: weekly fan radio episodes, locks, predictions, offseason specials
    pstats.ts      program and coach stats: per-season tracking, retired/fired coaches, head-to-head, summaries and scores
    rivalry.ts     Rivalries 2.0: heat, series, trophies, born/faded rivalries, rivalry week
    awards.ts      season awards, Awards Night show data, Hall of Fame inductions
    realignment.ts conference realignment: waves of moves, invitations, backfill, applying moves
    facilities.ts  program building: the program fund, facilities, boosters and their requests
    chemistry.ts   locker room: team chemistry, captains, dilemmas, promises, Senior Night
    pros.ts        pro careers for drafted players, the NBA pipeline
    events.ts / media.ts   story events, news & social
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
