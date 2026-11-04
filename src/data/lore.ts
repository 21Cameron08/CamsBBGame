// Real program traditions and pre-dynasty history for the game's best-known programs.
// Facts only: national titles through the 2025-26 season, famous traditions, crowds and
// buildings. No real players are named (everyone on a roster in this game is fictional).

export interface ProgramLore {
  /** one-line identity */
  identity: string;
  /** what the fan base is called */
  fans?: string;
  /** student section */
  students?: string;
  /** what everybody calls the building */
  arenaNick?: string;
  /** signature traditions */
  traditions: string[];
  /** NCAA championships before the dynasty began */
  titles?: number[];
  /** famous pre-dynasty moments */
  moments?: string[];
  /** broadcast line at tip-off in this building */
  crowd?: string;
  /** what the building does when the home team has it won */
  closer?: string;
}

export const PROGRAM_LORE: Record<string, ProgramLore> = {
  // ---------------- blue bloods ----------------
  kansas: {
    identity: 'The cradle of the game: basketball’s inventor was the program’s first coach.',
    arenaNick: 'The Phog',
    traditions: ['The Rock Chalk Chant, slow and haunting, when a win is in hand', 'Fans wave the wheat after victories', '“Beware of the Phog” hangs in Allen Fieldhouse', 'Students camp out for days for the best seats'],
    titles: [1952, 1988, 2008, 2022],
    moments: ['2022: rallied from 16 down at halftime, the biggest comeback in title-game history'],
    crowd: 'Allen Fieldhouse is rocking. “Beware of the Phog” has never felt more literal.',
    closer: 'Here comes the Rock Chalk Chant. It’s over in Lawrence.',
  },
  kentucky: {
    identity: 'College basketball royalty with one of the most passionate fan bases in sports.',
    fans: 'Big Blue Nation',
    traditions: ['Big Blue Madness tips off every season to a packed house', '“C-A-T-S, Cats! Cats! Cats!” fills Rupp Arena', 'Big Blue Nation travels everywhere and takes over road arenas'],
    titles: [1948, 1949, 1951, 1958, 1978, 1996, 1998, 2012],
    crowd: 'Big Blue Nation has filled Rupp Arena to the rafters.',
    closer: '“C-A-T-S! Cats! Cats! Cats!” Rupp Arena is celebrating.',
  },
  duke: {
    identity: 'An intimate gym, a national brand and the most famous student section in the country.',
    students: 'Cameron Crazies',
    traditions: ['Students camp for weeks in Krzyzewskiville for the biggest games', 'The Cameron Crazies, painted blue, bounce for the entire game', 'Cameron Indoor Stadium seats barely 9,300, all of them on top of the court'],
    titles: [1991, 1992, 2001, 2010, 2015],
    crowd: 'The Cameron Crazies are bouncing. Cameron Indoor is a furnace.',
    closer: 'The Crazies are in full throat. Cameron is shaking.',
  },
  'north-carolina': {
    identity: 'Carolina blue, a basketball tradition as deep as any in the sport.',
    arenaNick: 'The Dean Dome',
    traditions: ['Fans rush Franklin Street after the biggest wins', 'Carolina blue, everywhere you look', 'Banners for national titles and Final Fours line the Dean Dome'],
    titles: [1957, 1982, 1993, 2005, 2009, 2017],
    crowd: 'A sea of Carolina blue inside the Dean Dome.',
    closer: 'Somebody check on Franklin Street. Carolina fans are ready to rush it.',
  },
  ucla: {
    identity: 'The standard every dynasty is measured against: eleven national titles.',
    traditions: ['Ten titles in twelve seasons, including seven in a row (1967–73)', 'An 88-game winning streak that stood as the sport’s gold standard', 'Pauley Pavilion’s rafters are full of championship banners'],
    titles: [1964, 1965, 1967, 1968, 1969, 1970, 1971, 1972, 1973, 1975, 1995],
    crowd: 'Pauley Pavilion, under all those banners.',
    closer: 'The Bruins faithful are on their feet in Westwood.',
  },
  indiana: {
    identity: 'Hoosier Hysteria: in this state, basketball is a religion.',
    traditions: ['Hoosier Hysteria opens every season', 'The candy-striped warm-up pants', 'Assembly Hall’s steep bleachers put the crowd right on top of you'],
    titles: [1940, 1953, 1976, 1981, 1987],
    moments: ['1976: 32-0, the last undefeated national champion in men’s college basketball'],
    crowd: 'Assembly Hall is full and loud. Hoosier Hysteria is alive.',
    closer: 'Assembly Hall is roaring. Indiana basketball, the way it’s supposed to be.',
  },
  uconn: {
    identity: 'A modern dynasty built in the Big East: six titles since 1999.',
    traditions: ['Splits home games between campus at Gampel and Hartford', 'Back-to-back national champions in 2023 and 2024', 'Built a winning machine out of a small state school'],
    titles: [1999, 2004, 2011, 2014, 2023, 2024],
    moments: ['2026: national runner-up'],
    crowd: 'The Huskies faithful are packed in and loud.',
    closer: 'The UConn crowd knows what winning looks like. They’re celebrating.',
  },
  villanova: {
    identity: 'A small Philadelphia school with three national titles and two of the most famous finishes ever.',
    fans: 'Nova Nation',
    traditions: ['1985: won the title as an 8 seed, shooting 79% in the final against a heavy favorite', '2016: won the title on a buzzer-beater', 'Part of Philadelphia’s Big 5'],
    titles: [1985, 2016, 2018],
    crowd: 'Nova Nation is packed into the Pavilion.',
    closer: 'Nova Nation is on its feet in the Pavilion.',
  },
  'michigan-state': {
    identity: 'Tough, physical and always ready for March.',
    students: 'Izzone',
    traditions: ['The Izzone student section, all in green and white', 'Rebounding wars and a reputation for March toughness', 'Ten Final Four appearances'],
    titles: [1979, 2000],
    crowd: 'The Izzone is bouncing. Breslin Center is loud.',
    closer: 'The Izzone is in full voice. Spartans have this one.',
  },
  louisville: {
    identity: 'A basketball-mad city with two national titles and one of the biggest arenas in the sport.',
    traditions: ['Packs the KFC Yum! Center, one of college basketball’s largest homes', 'Fierce in-state rivalry with Kentucky'],
    titles: [1980, 1986],
    crowd: 'The KFC Yum! Center is a sea of red.',
    closer: 'Louisville fans are celebrating downtown.',
  },
  // ---------------- national powers ----------------
  arizona: {
    identity: 'The desert’s basketball powerhouse with a famously rowdy student section.',
    students: 'ZonaZoo',
    traditions: ['The ZonaZoo student section fills McKale Center', '1997: won the title by beating three No. 1 seeds'],
    titles: [1997],
    moments: ['2026: reached the Final Four'],
    crowd: 'The ZonaZoo is ready. McKale Center is rocking.',
    closer: 'The ZonaZoo is in full voice. Bear Down.',
  },
  gonzaga: {
    identity: 'A small Jesuit school in Spokane that became a national power.',
    students: 'Kennel Club',
    arenaNick: 'The Kennel',
    traditions: ['The Kennel Club student section, inches from the court', 'Went from Cinderella to perennial contender', 'National runner-up in 2017 and 2021'],
    crowd: 'The Kennel Club is ready. The Kennel is a tiny, deafening box.',
    closer: 'The Kennel is shaking. Zags have it.',
  },
  houston: {
    identity: 'Defense, toughness and a high-flying legacy.',
    traditions: ['Phi Slama Jama: the high-flying teams of the early 1980s', 'Back-to-back national runner-up in 1983 and 1984', 'A defense-first identity built in the modern era'],
    moments: ['2025: national runner-up'],
    crowd: 'Fertitta Center is loud and close. Houston fans love defense.',
    closer: 'Fertitta Center is celebrating. Coogs win the fight.',
  },
  florida: {
    identity: 'Three national titles, including back-to-back champions with the same starting five.',
    students: 'Rowdy Reptiles',
    arenaNick: 'The O’Dome',
    traditions: ['The Rowdy Reptiles student section', 'The Gator Chomp from every corner of the arena', 'Back-to-back champions in 2006 and 2007 with the same starting five'],
    titles: [2006, 2007, 2025],
    crowd: 'The Rowdy Reptiles are chomping. The O’Dome is loud.',
    closer: 'The Gator Chomp is everywhere. Florida has this one.',
  },
  purdue: {
    identity: 'A Big Ten fixture with a history of great big men.',
    students: 'Paint Crew',
    traditions: ['The Paint Crew student section, all in black and gold', 'Mackey Arena’s bowl traps the noise', 'National runner-up in 2024'],
    crowd: 'The Paint Crew is ready. Mackey Arena is deafening.',
    closer: 'The Paint Crew is in full voice. Boiler Up.',
  },
  syracuse: {
    identity: 'The 2-3 zone, the Dome and a massive home crowd.',
    arenaNick: 'The Dome',
    traditions: ['Plays in the largest on-campus arena in college basketball', 'Built a long identity around the 2-3 zone', 'Otto the Orange'],
    titles: [2003],
    crowd: 'A huge crowd in the Dome. Syracuse basketball, big-time.',
    closer: 'The Dome is roaring. Orange win this one.',
  },
  michigan: {
    identity: 'Two national titles and the Fab Five, the most famous freshman class ever.',
    students: 'Maize Rage',
    traditions: ['The Maize Rage student section', 'The Fab Five: the 1991 freshman class that changed the sport’s style', '2026: won the title with a starting five made up entirely of transfers'],
    titles: [1989, 2026],
    crowd: 'The Maize Rage is loud. Crisler Center is full.',
    closer: 'The Maize Rage is celebrating. Go Blue.',
  },
  illinois: {
    identity: 'An Orange Krush, a domed arena and a fan base that waits for March.',
    students: 'Orange Krush',
    traditions: ['The Orange Krush student section', 'State Farm Center’s distinctive dome', 'National runner-up in 2005'],
    moments: ['2026: reached the Final Four'],
    crowd: 'The Orange Krush is ready. The dome is loud.',
    closer: 'The Orange Krush is in full voice. Illini win.',
  },
  baylor: {
    identity: 'Built itself into a national champion in the 2010s and ’20s.',
    traditions: ['The “Sic ’em” hand sign', '2021: won the national title, ending an undefeated opponent’s perfect season'],
    titles: [2021],
    crowd: 'Foster Pavilion is full. “Sic ’em” signs everywhere.',
    closer: 'Sic ’em, Bears. Baylor has it.',
  },
  'texas-tech': {
    identity: 'Lubbock toughness: the Red Raiders defend.',
    traditions: ['“Guns Up” from every seat in the arena', 'National runner-up in 2019 after an overtime final'],
    crowd: 'Guns Up in Lubbock. United Supermarkets Arena is loud.',
    closer: 'Guns Up. Texas Tech has this one.',
  },
  'iowa-state': {
    identity: 'Hilton Magic: one of the toughest places to play in the country.',
    traditions: ['Hilton Magic: the late-game comebacks at Hilton Coliseum', 'Cyclone fans travel and take over the Big 12 Tournament'],
    crowd: 'Hilton Coliseum is packed. Here comes the Hilton Magic.',
    closer: 'Hilton Magic strikes again.',
  },
  virginia: {
    identity: 'The pack line, patience and a title won one year after history’s most famous upset.',
    traditions: ['A pack-line defense and a slow, deliberate pace', '2019: national champions, one year after losing to a No. 16 seed'],
    titles: [2019],
    crowd: 'John Paul Jones Arena is full. Expect a grinder.',
    closer: 'The Hoos fans are standing. Virginia has it locked down.',
  },
  'nc-state': {
    identity: 'The Cardiac Pack: famous for miracle runs.',
    traditions: ['1983: won the title on a last-second dunk in The Pit in Albuquerque', '1974: ended UCLA’s run of seven straight titles on the way to a championship', '2024: reached the Final Four as an 11 seed after winning five tournament games in five days'],
    titles: [1974, 1983],
    crowd: 'The Wolfpack faithful are loud. Never count this team out.',
    closer: 'The Wolfpack crowd is celebrating. No cardiac finish needed tonight.',
  },
  arkansas: {
    identity: 'Forty Minutes of Hell and the Hog Call.',
    traditions: ['“Woo Pig Sooie!” The Hog Call shakes Bud Walton Arena', '“Forty Minutes of Hell”: the full-court pressure of the 1990s champions'],
    titles: [1994],
    crowd: 'Bud Walton Arena is shaking. Woo Pig Sooie!',
    closer: 'Here comes the Hog Call. Woo Pig Sooie!',
  },
  auburn: {
    identity: 'A football school that built a basketball power on the Plains.',
    traditions: ['Fans roll Toomer’s Corner with toilet paper after big wins', '“War Eagle!”', 'Final Fours in 2019 and 2025'],
    crowd: 'Neville Arena is loud. War Eagle!',
    closer: 'Somebody grab the toilet paper. Toomer’s Corner is getting rolled tonight.',
  },
  tennessee: {
    identity: 'Rocky Top and a fan base that fills one of the sport’s biggest arenas.',
    traditions: ['“Rocky Top” plays after every big run', 'Fills one of the largest arenas in college basketball'],
    crowd: 'A sea of orange. “Rocky Top” is already playing.',
    closer: '“Rocky Top” one more time. The Vols have it.',
  },
  alabama: {
    identity: 'A football school that turned its basketball program into a high-octane contender.',
    traditions: ['“Roll Tide!” from every corner of Coleman Coliseum', '2024: the program’s first Final Four'],
    crowd: 'Coleman Coliseum is loud. Roll Tide.',
    closer: 'Roll Tide. Alabama has this one.',
  },
  'ohio-state': {
    identity: 'A Big Ten giant with a national title and a booming “O-H! I-O!”',
    arenaNick: 'The Schott',
    traditions: ['“O-H!” “I-O!” echoes across the arena', '1960: national champions'],
    titles: [1960],
    crowd: 'The Schott is full. “O-H!” “I-O!”',
    closer: '“O-H!” “I-O!” Buckeyes have it.',
  },
  wisconsin: {
    identity: 'Patient, efficient, fundamentally sound and dangerous in March.',
    traditions: ['A famously patient swing offense', '2015: ended an undefeated Kentucky team’s perfect run in the Final Four'],
    titles: [1941],
    crowd: 'The Kohl Center is full. The Badgers will make you defend.',
    closer: 'The Kohl Center is celebrating. Badgers grind it out.',
  },
  maryland: {
    identity: 'Fear the Turtle.',
    traditions: ['“Fear the Turtle”', 'A rabid home crowd in College Park'],
    titles: [2002],
    crowd: 'Xfinity Center is loud. Fear the Turtle.',
    closer: 'Fear the Turtle. Maryland has it.',
  },
  marquette: {
    identity: 'A Milwaukee program with a national title and a big-time NBA arena.',
    traditions: ['Plays downtown in the Fiserv Forum', '1977: national champions'],
    titles: [1977],
    crowd: 'Fiserv Forum is full of Golden Eagles fans.',
    closer: 'Fiserv Forum is celebrating. Marquette has it.',
  },
  georgetown: {
    identity: 'Hoya Paranoia: the toughest program of the Big East’s golden era.',
    traditions: ['“Hoya Saxa!”', 'Big East battles from the 1980s'],
    titles: [1984],
    crowd: 'Capital One Arena is loud. Hoya Saxa!',
    closer: 'Hoya Saxa! Georgetown has it.',
  },
  // ---------------- big east, mid-major powers and famous runs ----------------
  creighton: {
    identity: 'Omaha’s team, with crowds that rank among the biggest in the country.',
    traditions: ['Regularly draws one of the largest home crowds in college basketball', 'Plays downtown at CHI Health Center Omaha'],
    crowd: 'A huge crowd in Omaha. Creighton draws like a blue blood.',
    closer: 'Omaha is celebrating. Bluejays have it.',
  },
  'st-johns': {
    identity: 'New York’s team, at home in Madison Square Garden.',
    traditions: ['Big games at the World’s Most Famous Arena, Madison Square Garden', 'Smaller games on campus at Carnesecca Arena', 'A national runner-up in 1952'],
    crowd: 'Madison Square Garden, and the city is here for the Johnnies.',
    closer: 'The Garden is roaring for the Johnnies.',
  },
  providence: {
    identity: 'A small Big East school with a big-city atmosphere downtown.',
    arenaNick: 'The Dunk',
    traditions: ['Home games downtown at “the Dunk”', 'Final Fours in 1973 and 1987'],
    crowd: 'The Dunk is full. Friars fans are ready.',
    closer: 'The Dunk is celebrating.',
  },
  xavier: {
    identity: 'Cincinnati’s Jesuit program and one half of the Crosstown Shootout.',
    traditions: ['The Crosstown Shootout with Cincinnati is one of the sport’s fiercest rivalries', 'A loud, packed Cintas Center'],
    crowd: 'Cintas Center is packed. Musketeers fans are loud.',
    closer: 'Cintas Center is celebrating. All for one.',
  },
  butler: {
    identity: 'The little school that played in back-to-back title games.',
    traditions: ['Hinkle Fieldhouse, where the finale of the movie “Hoosiers” was filmed', 'National runner-up in 2010 and 2011', 'Butler Blue, the live bulldog mascot'],
    crowd: 'Historic Hinkle Fieldhouse. There’s no building like it.',
    closer: 'Hinkle is roaring. Butler has it.',
  },
  cincinnati: {
    identity: 'Back-to-back national champions and the other half of the Crosstown Shootout.',
    traditions: ['Back-to-back national champions in 1961 and 1962', 'The Crosstown Shootout with Xavier'],
    titles: [1961, 1962],
    crowd: 'Fifth Third Arena is loud. Bearcats fans are ready.',
    closer: 'Bearcats fans are celebrating.',
  },
  unlv: {
    identity: 'The Runnin’ Rebels: Las Vegas flash and the most lopsided title game ever.',
    traditions: ['1990: won the title game by 30 points, the largest margin in championship history', 'The Runnin’ Rebels’ fast-break style made them must-see TV'],
    titles: [1990],
    crowd: 'The Thomas & Mack Center is full. Vegas is here.',
    closer: 'The Runnin’ Rebels crowd is celebrating.',
  },
  'san-diego-state': {
    identity: 'Defense, a great student section and a run to the 2023 title game.',
    students: 'The Show',
    traditions: ['The Show student section', 'National runner-up in 2023'],
    crowd: 'The Show is ready. Viejas Arena is loud.',
    closer: 'The Show is celebrating. Aztecs have it.',
  },
  dayton: {
    identity: 'A mid-major with major-conference crowds and the home of the First Four.',
    fans: 'Flyer Faithful',
    traditions: ['Hosts the NCAA Tournament’s First Four every March', 'The Flyer Faithful fill UD Arena like few programs anywhere'],
    crowd: 'UD Arena is packed. The Flyer Faithful are loud.',
    closer: 'The Flyer Faithful are celebrating.',
  },
  vcu: {
    identity: 'Havoc: relentless pressure and a famous First Four to Final Four run.',
    arenaNick: 'The Stu',
    traditions: ['“Havoc”: full-court pressure for 40 minutes', 'The Peppas, one of the best pep bands in the country', '2011: went from the First Four to the Final Four'],
    crowd: 'The Stu is shaking and the Peppas are rolling. Havoc time.',
    closer: 'The Peppas are rolling. Havoc wins.',
  },
  'wichita-state': {
    identity: 'The Roundhouse, Shocker pride and a 35-0 start.',
    arenaNick: 'The Roundhouse',
    traditions: ['2013: reached the Final Four as a 9 seed', '2014: started 35-0'],
    crowd: 'The Roundhouse is full. Shocker fans are loud.',
    closer: 'The Roundhouse is celebrating.',
  },
  'loyola-chicago': {
    identity: 'A 1963 national champion that helped change the sport, and a 2018 Cinderella.',
    traditions: ['1963: national champions; their meeting with Mississippi State became known as the “Game of Change”', '2018: reached the Final Four as an 11 seed, with a beloved 98-year-old team chaplain'],
    titles: [1963],
    crowd: 'Gentile Arena is packed. Loyola fans believe.',
    closer: 'The Ramblers crowd is celebrating.',
  },
  'mississippi-state': {
    identity: 'An SEC program with a place in history: the 1963 “Game of Change”.',
    traditions: ['1963: defied a state ban to play integrated Loyola Chicago in the “Game of Change”', 'Cowbells, an SEC tradition that carries over from football'],
    crowd: 'The cowbells are ringing in Humphrey Coliseum.',
    closer: 'Cowbells everywhere. Mississippi State has it.',
  },
  utep: {
    identity: 'Texas Western, 1966: the title that changed college basketball.',
    traditions: ['1966: as Texas Western, won the national title with the first all-Black starting five in a championship game'],
    titles: [1966],
    crowd: 'The Don Haskins Center is full. History lives in this building.',
    closer: 'The Miners crowd is celebrating.',
  },
  'new-mexico': {
    identity: 'The Pit: an arena dug into the ground and one of the loudest buildings in the country.',
    traditions: ['The court sits 37 feet below street level', 'The Pit hosted the 1983 national championship and its famous last-second finish'],
    crowd: 'Welcome to The Pit. It’s deafening down here.',
    closer: 'The Pit is shaking. Lobos have it.',
  },
  'oklahoma-state': {
    identity: 'Two national titles and a historic old barn of an arena.',
    arenaNick: 'Madison Square Garden of the Plains',
    traditions: ['Gallagher-Iba Arena, the “Madison Square Garden of the Plains”', 'Back-to-back national champions in 1945 and 1946'],
    titles: [1945, 1946],
    crowd: 'Gallagher-Iba Arena is loud. Cowboys fans are packed in.',
    closer: 'Gallagher-Iba is celebrating.',
  },
  'kansas-state': {
    identity: 'Manhattan, Kansas, and a building nicknamed the Octagon of Doom.',
    arenaNick: 'The Octagon of Doom',
    traditions: ['Bramlage Coliseum, “the Octagon of Doom”', 'The Sunflower Showdown with Kansas'],
    crowd: 'The Octagon of Doom is full. Wildcats fans are ready.',
    closer: 'The Octagon of Doom is celebrating.',
  },
  minnesota: {
    identity: 'The Barn: a historic arena with a raised floor.',
    arenaNick: 'The Barn',
    traditions: ['Williams Arena’s famous raised floor', '“The Barn” has hosted Gophers basketball since 1928'],
    crowd: 'Welcome to The Barn. That raised floor never gets old.',
    closer: 'The Barn is celebrating.',
  },
  'west-virginia': {
    identity: 'Mountaineer toughness and “Country Roads” after every win.',
    traditions: ['Fans sing “Country Roads” after wins', 'National runner-up in 1959; Final Four in 2010'],
    crowd: 'The Coliseum is loud in Morgantown.',
    closer: 'Time for “Country Roads.” The Mountaineers have it.',
  },
  missouri: {
    identity: 'An SEC program with a famously rowdy student section.',
    students: 'Antlers',
    traditions: ['The Antlers, the notoriously rowdy student group'],
    crowd: 'Mizzou Arena is loud and the Antlers are ready.',
    closer: 'The Antlers are celebrating.',
  },
  'notre-dame': {
    identity: 'The school that ended UCLA’s 88-game winning streak.',
    traditions: ['1974: ended UCLA’s 88-game winning streak', 'Purcell Pavilion on a famous campus'],
    crowd: 'Purcell Pavilion is full. The Irish faithful are here.',
    closer: 'The Irish faithful are celebrating.',
  },
  'seton-hall': {
    identity: 'A Big East mainstay in Newark that played for a title in 1989.',
    traditions: ['National runner-up in 1989, losing in overtime', 'Home games at the Prudential Center in Newark'],
    crowd: 'The Prudential Center is loud for the Pirates.',
    closer: 'The Rock is celebrating. Pirates have it.',
  },
  // ---------------- old champions ----------------
  oregon: {
    identity: 'The first NCAA champion: the 1939 “Tall Firs”.',
    traditions: ['1939: the Tall Firs won the very first NCAA Tournament', 'Matthew Knight Arena’s forest-themed floor'],
    titles: [1939],
    crowd: 'Matthew Knight Arena is loud. Ducks fans are ready.',
    closer: 'The Ducks crowd is celebrating.',
  },
  stanford: {
    identity: 'A 1942 national champion on one of the country’s great campuses.',
    traditions: ['1942: national champions', 'Maples Pavilion, home since 1969'],
    titles: [1942],
    crowd: 'Maples Pavilion is full.',
    closer: 'Maples is celebrating.',
  },
  california: {
    identity: 'Berkeley’s 1959 national champions.',
    traditions: ['1959: national champions', 'National runner-up in 1960'],
    titles: [1959],
    crowd: 'Haas Pavilion is loud in Berkeley.',
    closer: 'Haas Pavilion is celebrating. Go Bears.',
  },
  utah: {
    identity: 'The 1944 “Blitz Kids”, a young team that won it all.',
    traditions: ['1944: the Blitz Kids, a young team, won the national title'],
    titles: [1944],
    crowd: 'The Huntsman Center is loud.',
    closer: 'The Utes crowd is celebrating.',
  },
  'holy-cross': {
    identity: 'A tiny Jesuit college with a 1947 national title.',
    traditions: ['1947: national champions'],
    titles: [1947],
    crowd: 'The Hart Center is full and loud.',
    closer: 'The Crusaders crowd is celebrating.',
  },
  'la-salle': {
    identity: 'Philadelphia’s 1954 national champion and a Big 5 member.',
    traditions: ['1954: national champions', 'Part of Philadelphia’s Big 5'],
    titles: [1954],
    crowd: 'A Philly crowd in a Philly gym.',
    closer: 'The Explorers crowd is celebrating.',
  },
  'san-francisco': {
    identity: 'Back-to-back national champions in the 1950s.',
    traditions: ['Back-to-back national champions in 1955 and 1956'],
    titles: [1955, 1956],
    crowd: 'War Memorial Gym is loud.',
    closer: 'The Dons crowd is celebrating.',
  },
  // ---------------- giant-killers and Cinderellas ----------------
  princeton: {
    identity: 'Birthplace of the Princeton offense: backdoor cuts and brains.',
    traditions: ['The “Princeton offense” is named for this program', '1996: knocked out the defending national champion in the first round'],
    crowd: 'Jadwin Gym is full. Watch for the backdoor cut.',
    closer: 'The Tigers crowd is celebrating.',
  },
  penn: {
    identity: 'Home of the Palestra, the “Cathedral of College Basketball”.',
    arenaNick: 'The Cathedral of College Basketball',
    traditions: ['The Palestra, opened in 1927 and still one of the sport’s great buildings', 'Part of Philadelphia’s Big 5', 'A Final Four team in 1979'],
    crowd: 'The Palestra. The Cathedral of College Basketball.',
    closer: 'The Palestra is celebrating.',
  },
  'saint-josephs': {
    identity: 'The Hawk Will Never Die.',
    traditions: ['“The Hawk Will Never Die”', 'The Hawk mascot flaps its wings for the entire game', 'Part of Philadelphia’s Big 5'],
    crowd: 'Hagan Arena is loud, and the Hawk is flapping.',
    closer: 'The Hawk Will Never Die!',
  },
  davidson: {
    identity: 'A small liberal arts college with a famous 2008 Elite Eight run.',
    traditions: ['2008: a 10 seed that reached the Elite Eight'],
    crowd: 'Belk Arena is packed. Davidson fans believe.',
    closer: 'The Wildcats crowd is celebrating.',
  },
  'florida-gulf-coast': {
    identity: 'Dunk City.',
    traditions: ['2013: “Dunk City”, the first 15 seed to reach the Sweet 16'],
    crowd: 'Welcome to Dunk City.',
    closer: 'Dunk City is celebrating.',
  },
  'george-mason': {
    identity: 'The 2006 Cinderella that reached the Final Four as an 11 seed.',
    traditions: ['2006: reached the Final Four as an 11 seed'],
    crowd: 'EagleBank Arena is loud. Patriots fans believe.',
    closer: 'The Patriots crowd is celebrating.',
  },
  umbc: {
    identity: 'The first 16 seed to beat a No. 1 seed.',
    traditions: ['2018: became the first 16 seed to beat a No. 1 seed in the men’s tournament'],
    crowd: 'A loud crowd for the Retrievers.',
    closer: 'The Retrievers crowd is celebrating.',
  },
  'fairleigh-dickinson': {
    identity: 'Giant-killers: the second 16 seed ever to topple a No. 1.',
    traditions: ['2023: became the second 16 seed to beat a No. 1 seed'],
    crowd: 'A packed house for the Knights.',
    closer: 'The Knights crowd is celebrating.',
  },
  'saint-peters': {
    identity: 'The Peacocks: the first 15 seed to reach the Elite Eight.',
    traditions: ['2022: the first 15 seed to reach the Elite Eight'],
    crowd: 'A packed little gym for the Peacocks.',
    closer: 'The Peacocks crowd is celebrating.',
  },
  northwestern: {
    identity: 'The long wait: a first NCAA Tournament bid in 2017.',
    traditions: ['2017: reached the NCAA Tournament for the first time in program history'],
    crowd: 'Welsh-Ryan Arena is full.',
    closer: 'The Wildcats crowd is celebrating.',
  },
};

export function loreOf(teamId: string): ProgramLore | undefined {
  return PROGRAM_LORE[teamId];
}
