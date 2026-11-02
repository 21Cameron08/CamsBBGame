import type { RivalryDef } from './types';

// Notable college basketball rivalries. `heat`: 3 = marquee/bitter,
// 2 = strong regional or conference rivalry, 1 = mild/historic.
// Some pairs now sit in different conferences (e.g. Gonzaga–Saint Mary's)
// but remain natural non-conference rivals.
export const RIVALRIES: RivalryDef[] = [
  // ---- ACC ----
  { a: 'duke', b: 'north-carolina', name: 'Tobacco Road', heat: 3 },
  { a: 'north-carolina', b: 'nc-state', heat: 2 },
  { a: 'duke', b: 'nc-state', heat: 2 },
  { a: 'virginia', b: 'virginia-tech', name: 'Commonwealth Clash', heat: 2 },
  { a: 'california', b: 'stanford', heat: 2 },
  { a: 'clemson', b: 'south-carolina', heat: 1 },
  { a: 'georgia-tech', b: 'georgia', heat: 1 },
  { a: 'florida-state', b: 'florida', heat: 1 },
  { a: 'pittsburgh', b: 'west-virginia', name: 'Backyard Brawl', heat: 2 },

  // ---- SEC ----
  { a: 'kentucky', b: 'louisville', name: 'Battle of the Bluegrass', heat: 3 },
  { a: 'kentucky', b: 'tennessee', heat: 2 },
  { a: 'kentucky', b: 'florida', heat: 2 },
  { a: 'alabama', b: 'auburn', heat: 2 },
  { a: 'ole-miss', b: 'mississippi-state', heat: 2 },
  { a: 'texas', b: 'texas-am', name: 'Lone Star Showdown', heat: 2 },
  { a: 'texas', b: 'oklahoma', name: 'Red River Rivalry', heat: 2 },
  { a: 'tennessee', b: 'vanderbilt', heat: 1 },
  { a: 'illinois', b: 'missouri', name: "Braggin' Rights", heat: 3 },

  // ---- Big Ten ----
  { a: 'indiana', b: 'purdue', heat: 3 },
  { a: 'michigan', b: 'michigan-state', heat: 3 },
  { a: 'michigan', b: 'ohio-state', heat: 2 },
  { a: 'indiana', b: 'kentucky', heat: 2 },
  { a: 'wisconsin', b: 'marquette', name: 'I-94 Rivalry', heat: 2 },
  { a: 'iowa', b: 'iowa-state', name: 'Cy-Hawk Series', heat: 2 },
  { a: 'ucla', b: 'usc', name: 'Crosstown Rivalry', heat: 2 },
  { a: 'oregon', b: 'oregon-state', heat: 2 },
  { a: 'washington', b: 'washington-state', heat: 2 },
  { a: 'rutgers', b: 'seton-hall', name: 'Garden State Hardwood Classic', heat: 2 },

  // ---- Big 12 ----
  { a: 'kansas', b: 'missouri', name: 'Border War', heat: 3 },
  { a: 'kansas', b: 'kansas-state', name: 'Sunflower Showdown', heat: 2 },
  { a: 'arizona', b: 'arizona-state', name: 'Duel in the Desert', heat: 2 },
  { a: 'byu', b: 'utah', name: 'Holy War', heat: 3 },
  { a: 'oklahoma', b: 'oklahoma-state', name: 'Bedlam', heat: 2 },
  { a: 'colorado', b: 'colorado-state', name: 'Rocky Mountain Showdown', heat: 2 },
  { a: 'baylor', b: 'tcu', heat: 1 },
  { a: 'arizona', b: 'ucla', heat: 2 },
  { a: 'ucf', b: 'south-florida', heat: 1 },

  // ---- Big East ----
  { a: 'villanova', b: 'saint-josephs', name: 'Holy War', heat: 3 },
  { a: 'cincinnati', b: 'xavier', name: 'Crosstown Shootout', heat: 3 },
  { a: 'georgetown', b: 'syracuse', heat: 3 },
  { a: 'uconn', b: 'syracuse', heat: 2 },
  { a: 'uconn', b: 'villanova', heat: 2 },
  { a: 'uconn', b: 'st-johns', heat: 2 },
  { a: 'villanova', b: 'georgetown', heat: 2 },
  { a: 'st-johns', b: 'georgetown', heat: 2 },
  { a: 'providence', b: 'rhode-island', heat: 2 },
  { a: 'villanova', b: 'penn', heat: 1 },

  // ---- Mid-majors: A-10 / AAC / Philly Big 5 ----
  { a: 'vcu', b: 'richmond', name: 'Capital City Classic', heat: 3 },
  { a: 'vcu', b: 'old-dominion', heat: 2 },
  { a: 'dayton', b: 'xavier', heat: 2 },
  { a: 'dayton', b: 'vcu', heat: 2 },
  { a: 'george-mason', b: 'george-washington', name: 'Revolutionary Rivalry', heat: 2 },
  { a: 'saint-josephs', b: 'temple', heat: 2 },
  { a: 'saint-josephs', b: 'la-salle', heat: 2 },
  { a: 'louisville', b: 'memphis', heat: 2 },
  { a: 'tulsa', b: 'oral-roberts', name: "Mayor's Cup", heat: 2 },

  // ---- West: Pac-12 / MWC / WCC / Big West ----
  { a: 'gonzaga', b: 'saint-marys', heat: 2 },
  { a: 'new-mexico', b: 'new-mexico-state', name: 'Rio Grande Rivalry', heat: 3 },
  { a: 'new-mexico', b: 'unlv', heat: 2 },
  { a: 'unlv', b: 'nevada', name: 'Battle for Nevada', heat: 2 },
  { a: 'utep', b: 'new-mexico-state', name: 'Battle of I-10', heat: 2 },
  { a: 'san-francisco', b: 'santa-clara', heat: 1 },
  { a: 'loyola-marymount', b: 'pepperdine', heat: 1 },
  { a: 'uc-irvine', b: 'long-beach-state', name: 'Black and Blue Rivalry', heat: 2 },
  { a: 'uc-santa-barbara', b: 'cal-poly', name: 'Blue-Green Rivalry', heat: 2 },
  { a: 'montana', b: 'montana-state', name: 'Brawl of the Wild', heat: 2 },

  // ---- Midwest mid-majors ----
  { a: 'north-dakota', b: 'north-dakota-state', heat: 2 },
  { a: 'south-dakota', b: 'south-dakota-state', name: 'South Dakota Showdown', heat: 2 },
  { a: 'bradley', b: 'illinois-state', heat: 2 },
  { a: 'belmont', b: 'lipscomb', name: 'Battle of the Boulevard', heat: 3 },
  { a: 'belmont', b: 'murray-state', heat: 2 },
  { a: 'milwaukee', b: 'green-bay', heat: 2 },
  { a: 'detroit-mercy', b: 'oakland', heat: 2 },
  { a: 'akron', b: 'kent-state', heat: 3 },
  { a: 'ohio', b: 'miami-oh', name: 'Battle of the Bricks', heat: 2 },
  { a: 'toledo', b: 'bowling-green', name: 'Battle of I-75', heat: 2 },
  { a: 'central-michigan', b: 'western-michigan', heat: 2 },

  // ---- South / Southeast mid-majors ----
  { a: 'western-kentucky', b: 'middle-tennessee', name: '100 Miles of Hate', heat: 2 },
  { a: 'georgia-state', b: 'georgia-southern', name: 'Modern Day Hate', heat: 2 },
  { a: 'james-madison', b: 'old-dominion', name: 'Royal Rivalry', heat: 2 },
  { a: 'louisiana', b: 'ul-monroe', heat: 2 },
  { a: 'mcneese', b: 'lamar', heat: 2 },
  { a: 'stephen-f-austin', b: 'sam-houston', heat: 2 },
  { a: 'eastern-kentucky', b: 'morehead-state', heat: 1 },
  { a: 'jacksonville', b: 'north-florida', name: 'River City Rumble', heat: 2 },
  { a: 'charleston', b: 'unc-wilmington', heat: 1 },

  // ---- Northeast / academies ----
  { a: 'army', b: 'navy', name: 'Star Series', heat: 3 },
  { a: 'lehigh', b: 'lafayette', heat: 2 },
  { a: 'harvard', b: 'yale', heat: 2 },
  { a: 'penn', b: 'princeton', heat: 2 },
  { a: 'iona', b: 'manhattan', heat: 2 },

  // ---- HBCU classics ----
  { a: 'grambling', b: 'southern', heat: 2 },
  { a: 'jackson-state', b: 'alcorn-state', heat: 2 },
  { a: 'alabama-am', b: 'alabama-state', heat: 2 },
  { a: 'florida-am', b: 'bethune-cookman', heat: 2 },
  { a: 'texas-southern', b: 'prairie-view-am', heat: 2 },
  { a: 'norfolk-state', b: 'hampton', name: 'Battle of the Bay', heat: 2 },
  { a: 'nc-at', b: 'north-carolina-central', heat: 2 },
  { a: 'howard', b: 'hampton', name: 'The Real HU', heat: 2 },
];
