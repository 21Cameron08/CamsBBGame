import type { TeamDef } from './types';

// Every NCAA Division I men's basketball program for the 2026-27 season,
// grouped by conference (alignment effective July 1, 2026).
//
// Each row is a positional tuple to keep this file compact:
//   [id, school, fullName, mascot, abbr, city, state, lat, lng,
//    primaryColor, secondaryColor, prestige, arena, capacity,
//    market, academics, facilities]
type Row = [
  id: string,
  school: string,
  fullName: string,
  mascot: string,
  abbr: string,
  city: string,
  state: string,
  lat: number,
  lng: number,
  primary: string,
  secondary: string,
  prestige: number,
  arena: string,
  capacity: number,
  market: number,
  academics: number,
  facilities: number,
];

function conf(confId: string, rows: Row[]): TeamDef[] {
  return rows.map(
    ([id, school, fullName, mascot, abbr, city, state, lat, lng, primary, secondary, prestige, arena, capacity, market, academics, facilities]) => ({
      id,
      school,
      fullName,
      mascot,
      abbr,
      conf: confId,
      city,
      state,
      lat,
      lng,
      colors: [primary, secondary] as [string, string],
      prestige,
      arena,
      capacity,
      market,
      academics,
      facilities,
    }),
  );
}

export const TEAMS: TeamDef[] = [
  // ======================================================================
  // ACC (18)
  // ======================================================================
  ...conf('acc', [
    ['boston-college', 'Boston College', 'Boston College', 'Eagles', 'BC', 'Chestnut Hill', 'MA', 42.34, -71.17, '#98002E', '#BC9B6A', 52, 'Conte Forum', 8606, 6, 9, 6],
    ['california', 'Cal', 'University of California, Berkeley', 'Golden Bears', 'CAL', 'Berkeley', 'CA', 37.87, -122.26, '#003262', '#FDB515', 56, 'Haas Pavilion', 11858, 7, 10, 7],
    ['clemson', 'Clemson', 'Clemson University', 'Tigers', 'CLEM', 'Clemson', 'SC', 34.68, -82.84, '#F56600', '#522D80', 64, 'Littlejohn Coliseum', 9000, 7, 7, 8],
    ['duke', 'Duke', 'Duke University', 'Blue Devils', 'DUKE', 'Durham', 'NC', 36.0, -78.94, '#003087', '#FFFFFF', 98, 'Cameron Indoor Stadium', 9314, 10, 10, 10],
    ['florida-state', 'Florida State', 'Florida State University', 'Seminoles', 'FSU', 'Tallahassee', 'FL', 30.44, -84.3, '#782F40', '#CEB888', 68, 'Donald L. Tucker Center', 11500, 7, 7, 7],
    ['georgia-tech', 'Georgia Tech', 'Georgia Institute of Technology', 'Yellow Jackets', 'GT', 'Atlanta', 'GA', 33.78, -84.4, '#003057', '#B3A369', 58, 'McCamish Pavilion', 8600, 7, 9, 7],
    ['louisville', 'Louisville', 'University of Louisville', 'Cardinals', 'LOU', 'Louisville', 'KY', 38.21, -85.76, '#AD0000', '#000000', 87, 'KFC Yum! Center', 22090, 9, 6, 10],
    ['miami-fl', 'Miami', 'University of Miami', 'Hurricanes', 'MIA', 'Coral Gables', 'FL', 25.72, -80.28, '#005030', '#F47321', 62, 'Watsco Center', 7972, 8, 8, 7],
    ['nc-state', 'NC State', 'North Carolina State University', 'Wolfpack', 'NCST', 'Raleigh', 'NC', 35.79, -78.68, '#CC0000', '#000000', 72, 'Lenovo Center', 19700, 8, 7, 8],
    ['north-carolina', 'North Carolina', 'University of North Carolina at Chapel Hill', 'Tar Heels', 'UNC', 'Chapel Hill', 'NC', 35.9, -79.05, '#7BAFD4', '#13294B', 97, 'Dean E. Smith Center', 21750, 10, 9, 9],
    ['notre-dame', 'Notre Dame', 'University of Notre Dame', 'Fighting Irish', 'ND', 'Notre Dame', 'IN', 41.7, -86.24, '#0C2340', '#C99700', 64, 'Purcell Pavilion', 9149, 8, 10, 8],
    ['pittsburgh', 'Pitt', 'University of Pittsburgh', 'Panthers', 'PITT', 'Pittsburgh', 'PA', 40.44, -79.96, '#003594', '#FFB81C', 62, 'Petersen Events Center', 12508, 7, 8, 8],
    ['smu', 'SMU', 'Southern Methodist University', 'Mustangs', 'SMU', 'Dallas', 'TX', 32.84, -96.78, '#354CA1', '#CC0035', 54, 'Moody Coliseum', 7000, 8, 8, 8],
    ['stanford', 'Stanford', 'Stanford University', 'Cardinal', 'STAN', 'Stanford', 'CA', 37.43, -122.17, '#8C1515', '#FFFFFF', 58, 'Maples Pavilion', 7233, 7, 10, 7],
    ['syracuse', 'Syracuse', 'Syracuse University', 'Orange', 'SYR', 'Syracuse', 'NY', 43.04, -76.14, '#F76900', '#000E54', 85, 'JMA Wireless Dome', 33000, 8, 8, 8],
    ['virginia', 'Virginia', 'University of Virginia', 'Cavaliers', 'UVA', 'Charlottesville', 'VA', 38.03, -78.51, '#232D4B', '#F84C1E', 80, 'John Paul Jones Arena', 14593, 8, 9, 9],
    ['virginia-tech', 'Virginia Tech', 'Virginia Polytechnic Institute and State University', 'Hokies', 'VT', 'Blacksburg', 'VA', 37.23, -80.42, '#630031', '#CF4420', 56, 'Cassell Coliseum', 8925, 6, 7, 7],
    ['wake-forest', 'Wake Forest', 'Wake Forest University', 'Demon Deacons', 'WAKE', 'Winston-Salem', 'NC', 36.13, -80.28, '#000000', '#9E7E38', 62, 'Lawrence Joel Veterans Memorial Coliseum', 14665, 6, 9, 7],
  ]),

  // ======================================================================
  // Big Ten (18)
  // ======================================================================
  ...conf('big-ten', [
    ['illinois', 'Illinois', 'University of Illinois Urbana-Champaign', 'Fighting Illini', 'ILL', 'Champaign', 'IL', 40.1, -88.23, '#13294B', '#E84A27', 80, 'State Farm Center', 15544, 8, 8, 9],
    ['indiana', 'Indiana', 'Indiana University Bloomington', 'Hoosiers', 'IND', 'Bloomington', 'IN', 39.17, -86.52, '#990000', '#FFFFFF', 88, 'Simon Skjodt Assembly Hall', 17222, 9, 7, 9],
    ['iowa', 'Iowa', 'University of Iowa', 'Hawkeyes', 'IOWA', 'Iowa City', 'IA', 41.66, -91.55, '#000000', '#FFCD00', 66, 'Carver-Hawkeye Arena', 15400, 7, 7, 7],
    ['maryland', 'Maryland', 'University of Maryland', 'Terrapins', 'MD', 'College Park', 'MD', 38.99, -76.94, '#E03A3E', '#FFD520', 76, 'Xfinity Center', 17950, 8, 8, 8],
    ['michigan', 'Michigan', 'University of Michigan', 'Wolverines', 'MICH', 'Ann Arbor', 'MI', 42.27, -83.74, '#00274C', '#FFCB05', 85, 'Crisler Center', 12707, 10, 9, 9],
    ['michigan-state', 'Michigan State', 'Michigan State University', 'Spartans', 'MSU', 'East Lansing', 'MI', 42.73, -84.48, '#18453B', '#FFFFFF', 89, 'Breslin Center', 14797, 9, 7, 9],
    ['minnesota', 'Minnesota', 'University of Minnesota', 'Golden Gophers', 'MINN', 'Minneapolis', 'MN', 44.97, -93.23, '#7A0019', '#FFCC33', 54, 'Williams Arena', 14625, 7, 8, 6],
    ['nebraska', 'Nebraska', 'University of Nebraska-Lincoln', 'Cornhuskers', 'NEB', 'Lincoln', 'NE', 40.82, -96.7, '#E41C38', '#FFFFFF', 54, 'Pinnacle Bank Arena', 15147, 7, 7, 9],
    ['northwestern', 'Northwestern', 'Northwestern University', 'Wildcats', 'NW', 'Evanston', 'IL', 42.06, -87.68, '#4E2A84', '#FFFFFF', 50, 'Welsh-Ryan Arena', 7039, 6, 10, 8],
    ['ohio-state', 'Ohio State', 'The Ohio State University', 'Buckeyes', 'OSU', 'Columbus', 'OH', 40.0, -83.02, '#BB0000', '#666666', 78, 'Value City Arena', 18809, 10, 8, 9],
    ['oregon', 'Oregon', 'University of Oregon', 'Ducks', 'ORE', 'Eugene', 'OR', 44.05, -123.07, '#154733', '#FEE123', 70, 'Matthew Knight Arena', 12364, 9, 7, 10],
    ['penn-state', 'Penn State', 'The Pennsylvania State University', 'Nittany Lions', 'PSU', 'University Park', 'PA', 40.8, -77.86, '#041E42', '#FFFFFF', 50, 'Bryce Jordan Center', 15261, 7, 7, 7],
    ['purdue', 'Purdue', 'Purdue University', 'Boilermakers', 'PUR', 'West Lafayette', 'IN', 40.43, -86.92, '#000000', '#CEB888', 85, 'Mackey Arena', 14804, 8, 8, 9],
    ['rutgers', 'Rutgers', 'Rutgers University-New Brunswick', 'Scarlet Knights', 'RUTG', 'Piscataway', 'NJ', 40.52, -74.46, '#CC0033', '#000000', 52, "Jersey Mike's Arena", 8000, 7, 7, 7],
    ['ucla', 'UCLA', 'University of California, Los Angeles', 'Bruins', 'UCLA', 'Los Angeles', 'CA', 34.07, -118.45, '#2D68C4', '#F2A900', 95, 'Pauley Pavilion', 13800, 10, 9, 9],
    ['usc', 'USC', 'University of Southern California', 'Trojans', 'USC', 'Los Angeles', 'CA', 34.02, -118.29, '#990000', '#FFC72C', 62, 'Galen Center', 10258, 9, 9, 9],
    ['washington', 'Washington', 'University of Washington', 'Huskies', 'WASH', 'Seattle', 'WA', 47.65, -122.3, '#4B2E83', '#B7A57A', 60, 'Alaska Airlines Arena', 10000, 8, 8, 7],
    ['wisconsin', 'Wisconsin', 'University of Wisconsin-Madison', 'Badgers', 'WIS', 'Madison', 'WI', 43.07, -89.41, '#C5050C', '#FFFFFF', 76, 'Kohl Center', 17287, 8, 8, 8],
  ]),

  // ======================================================================
  // Big 12 (16)
  // ======================================================================
  ...conf('big-12', [
    ['arizona', 'Arizona', 'University of Arizona', 'Wildcats', 'ARIZ', 'Tucson', 'AZ', 32.23, -110.95, '#0C234B', '#AB0520', 88, 'McKale Center', 14644, 9, 7, 9],
    ['arizona-state', 'Arizona State', 'Arizona State University', 'Sun Devils', 'ASU', 'Tempe', 'AZ', 33.42, -111.93, '#8C1D40', '#FFC627', 54, 'Desert Financial Arena', 14198, 8, 6, 7],
    ['baylor', 'Baylor', 'Baylor University', 'Bears', 'BAY', 'Waco', 'TX', 31.55, -97.12, '#154734', '#FFB81C', 75, 'Foster Pavilion', 7000, 8, 7, 10],
    ['byu', 'BYU', 'Brigham Young University', 'Cougars', 'BYU', 'Provo', 'UT', 40.25, -111.65, '#002E5D', '#FFFFFF', 68, 'Marriott Center', 18987, 9, 7, 8],
    ['cincinnati', 'Cincinnati', 'University of Cincinnati', 'Bearcats', 'CIN', 'Cincinnati', 'OH', 39.13, -84.52, '#E00122', '#000000', 70, 'Fifth Third Arena', 12012, 7, 6, 8],
    ['colorado', 'Colorado', 'University of Colorado Boulder', 'Buffaloes', 'COLO', 'Boulder', 'CO', 40.01, -105.27, '#000000', '#CFB87C', 56, 'CU Events Center', 11064, 7, 7, 7],
    ['houston', 'Houston', 'University of Houston', 'Cougars', 'HOU', 'Houston', 'TX', 29.72, -95.34, '#C8102E', '#FFFFFF', 86, 'Fertitta Center', 7035, 9, 6, 9],
    ['iowa-state', 'Iowa State', 'Iowa State University', 'Cyclones', 'ISU', 'Ames', 'IA', 42.03, -93.65, '#C8102E', '#F1BE48', 72, 'Hilton Coliseum', 14267, 7, 7, 8],
    ['kansas', 'Kansas', 'University of Kansas', 'Jayhawks', 'KU', 'Lawrence', 'KS', 38.95, -95.25, '#0051BA', '#E8000D', 99, 'Allen Fieldhouse', 16300, 9, 7, 10],
    ['kansas-state', 'Kansas State', 'Kansas State University', 'Wildcats', 'KSU', 'Manhattan', 'KS', 39.19, -96.58, '#512888', '#FFFFFF', 62, 'Bramlage Coliseum', 11654, 7, 6, 7],
    ['oklahoma-state', 'Oklahoma State', 'Oklahoma State University', 'Cowboys', 'OKST', 'Stillwater', 'OK', 36.13, -97.07, '#FF7300', '#000000', 66, 'Gallagher-Iba Arena', 13611, 7, 6, 7],
    ['tcu', 'TCU', 'Texas Christian University', 'Horned Frogs', 'TCU', 'Fort Worth', 'TX', 32.71, -97.36, '#4D1979', '#FFFFFF', 56, 'Schollmaier Arena', 6800, 8, 7, 8],
    ['texas-tech', 'Texas Tech', 'Texas Tech University', 'Red Raiders', 'TTU', 'Lubbock', 'TX', 33.58, -101.85, '#CC0000', '#000000', 74, 'United Supermarkets Arena', 15098, 9, 6, 8],
    ['ucf', 'UCF', 'University of Central Florida', 'Knights', 'UCF', 'Orlando', 'FL', 28.6, -81.2, '#000000', '#BA9B37', 50, 'Addition Financial Arena', 10000, 7, 6, 7],
    ['utah', 'Utah', 'University of Utah', 'Utes', 'UTAH', 'Salt Lake City', 'UT', 40.76, -111.84, '#BE0000', '#FFFFFF', 62, 'Jon M. Huntsman Center', 15000, 7, 7, 7],
    ['west-virginia', 'West Virginia', 'West Virginia University', 'Mountaineers', 'WVU', 'Morgantown', 'WV', 39.65, -79.95, '#002855', '#EAAA00', 70, 'Hope Coliseum', 14000, 6, 6, 7],
  ]),

  // ======================================================================
  // SEC (16)
  // ======================================================================
  ...conf('sec', [
    ['alabama', 'Alabama', 'University of Alabama', 'Crimson Tide', 'BAMA', 'Tuscaloosa', 'AL', 33.21, -87.55, '#9E1B32', '#FFFFFF', 74, 'Coleman Coliseum', 15383, 9, 6, 9],
    ['arkansas', 'Arkansas', 'University of Arkansas', 'Razorbacks', 'ARK', 'Fayetteville', 'AR', 36.07, -94.18, '#9D2235', '#FFFFFF', 78, 'Bud Walton Arena', 19368, 9, 6, 9],
    ['auburn', 'Auburn', 'Auburn University', 'Tigers', 'AUB', 'Auburn', 'AL', 32.6, -85.49, '#0C2340', '#E87722', 76, 'Neville Arena', 9121, 8, 6, 9],
    ['florida', 'Florida', 'University of Florida', 'Gators', 'FLA', 'Gainesville', 'FL', 29.65, -82.35, '#0021A5', '#FA4616', 87, "Exactech Arena at the O'Connell Center", 10133, 9, 8, 9],
    ['georgia', 'Georgia', 'University of Georgia', 'Bulldogs', 'UGA', 'Athens', 'GA', 33.95, -83.37, '#BA0C2F', '#000000', 54, 'Stegeman Coliseum', 10523, 8, 7, 7],
    ['kentucky', 'Kentucky', 'University of Kentucky', 'Wildcats', 'UK', 'Lexington', 'KY', 38.03, -84.5, '#0033A0', '#FFFFFF', 99, 'Rupp Arena', 20545, 10, 6, 10],
    ['lsu', 'LSU', 'Louisiana State University', 'Tigers', 'LSU', 'Baton Rouge', 'LA', 30.41, -91.18, '#461D7C', '#FDD023', 66, 'Pete Maravich Assembly Center', 13215, 8, 6, 7],
    ['ole-miss', 'Ole Miss', 'University of Mississippi', 'Rebels', 'MISS', 'Oxford', 'MS', 34.36, -89.54, '#14213D', '#CE1126', 58, 'SJB Pavilion', 9500, 7, 6, 8],
    ['mississippi-state', 'Mississippi State', 'Mississippi State University', 'Bulldogs', 'MSST', 'Starkville', 'MS', 33.46, -88.79, '#660000', '#FFFFFF', 58, 'Humphrey Coliseum', 9100, 7, 6, 7],
    ['missouri', 'Missouri', 'University of Missouri', 'Tigers', 'MIZ', 'Columbia', 'MO', 38.94, -92.33, '#F1B82D', '#000000', 62, 'Mizzou Arena', 15061, 7, 7, 8],
    ['oklahoma', 'Oklahoma', 'University of Oklahoma', 'Sooners', 'OU', 'Norman', 'OK', 35.21, -97.45, '#841617', '#FFFFFF', 62, 'Lloyd Noble Center', 10967, 8, 6, 7],
    ['south-carolina', 'South Carolina', 'University of South Carolina', 'Gamecocks', 'SC', 'Columbia', 'SC', 34.0, -81.03, '#73000A', '#000000', 54, 'Colonial Life Arena', 18000, 7, 6, 8],
    ['tennessee', 'Tennessee', 'University of Tennessee', 'Volunteers', 'TENN', 'Knoxville', 'TN', 35.95, -83.93, '#FF8200', '#FFFFFF', 80, 'Food City Center', 21678, 9, 7, 9],
    ['texas', 'Texas', 'University of Texas at Austin', 'Longhorns', 'TEX', 'Austin', 'TX', 30.28, -97.73, '#BF5700', '#FFFFFF', 72, 'Moody Center', 10763, 10, 8, 10],
    ['texas-am', 'Texas A&M', 'Texas A&M University', 'Aggies', 'TAMU', 'College Station', 'TX', 30.62, -96.34, '#500000', '#FFFFFF', 64, 'Reed Arena', 12989, 10, 7, 8],
    ['vanderbilt', 'Vanderbilt', 'Vanderbilt University', 'Commodores', 'VAN', 'Nashville', 'TN', 36.14, -86.8, '#000000', '#CFAE70', 56, 'Memorial Gymnasium', 14316, 7, 10, 7],
  ]),

  // ======================================================================
  // Big East (11)
  // ======================================================================
  ...conf('big-east', [
    ['butler', 'Butler', 'Butler University', 'Bulldogs', 'BUT', 'Indianapolis', 'IN', 39.84, -86.17, '#13294B', '#FFFFFF', 66, 'Hinkle Fieldhouse', 9100, 6, 7, 8],
    ['creighton', 'Creighton', 'Creighton University', 'Bluejays', 'CREI', 'Omaha', 'NE', 41.27, -95.95, '#005CA9', '#FFFFFF', 70, 'CHI Health Center Omaha', 17560, 7, 7, 8],
    ['depaul', 'DePaul', 'DePaul University', 'Blue Demons', 'DEP', 'Chicago', 'IL', 41.92, -87.65, '#005EB8', '#E4002B', 50, 'Wintrust Arena', 10387, 7, 6, 7],
    ['georgetown', 'Georgetown', 'Georgetown University', 'Hoyas', 'GTWN', 'Washington', 'DC', 38.91, -77.07, '#041E42', '#8D817B', 74, 'Capital One Arena', 20356, 8, 10, 7],
    ['marquette', 'Marquette', 'Marquette University', 'Golden Eagles', 'MARQ', 'Milwaukee', 'WI', 43.04, -87.93, '#003366', '#FFCC00', 76, 'Fiserv Forum', 17500, 7, 7, 9],
    ['providence', 'Providence', 'Providence College', 'Friars', 'PROV', 'Providence', 'RI', 41.84, -71.44, '#000000', '#FFFFFF', 64, 'Amica Mutual Pavilion', 12400, 6, 7, 7],
    ['seton-hall', 'Seton Hall', 'Seton Hall University', 'Pirates', 'HALL', 'South Orange', 'NJ', 40.74, -74.25, '#004488', '#FFFFFF', 58, 'Prudential Center', 16514, 7, 6, 7],
    ['st-johns', "St. John's", "St. John's University", 'Red Storm', 'SJU', 'Queens', 'NY', 40.72, -73.79, '#D41041', '#FFFFFF', 76, 'Madison Square Garden', 19812, 9, 6, 8],
    ['uconn', 'UConn', 'University of Connecticut', 'Huskies', 'CONN', 'Storrs', 'CT', 41.81, -72.25, '#000E2F', '#FFFFFF', 96, 'Gampel Pavilion', 10167, 9, 7, 9],
    ['villanova', 'Villanova', 'Villanova University', 'Wildcats', 'NOVA', 'Villanova', 'PA', 40.04, -75.34, '#00205B', '#13B5EA', 89, 'Finneran Pavilion', 6501, 8, 8, 8],
    ['xavier', 'Xavier', 'Xavier University', 'Musketeers', 'XAV', 'Cincinnati', 'OH', 39.15, -84.47, '#0C2340', '#9EA2A2', 72, 'Cintas Center', 10250, 6, 7, 8],
  ]),

  // ======================================================================
  // American Conference (13)
  // ======================================================================
  ...conf('aac', [
    ['charlotte', 'Charlotte', 'University of North Carolina at Charlotte', '49ers', 'CLT', 'Charlotte', 'NC', 35.31, -80.73, '#005035', '#A49665', 38, 'Dale F. Halton Arena', 9105, 5, 5, 6],
    ['east-carolina', 'East Carolina', 'East Carolina University', 'Pirates', 'ECU', 'Greenville', 'NC', 35.61, -77.37, '#592A8A', '#FDC82F', 26, 'Minges Coliseum', 8000, 5, 5, 5],
    ['florida-atlantic', 'Florida Atlantic', 'Florida Atlantic University', 'Owls', 'FAU', 'Boca Raton', 'FL', 26.37, -80.1, '#003366', '#CC0000', 46, 'Eleanor R. Baldwin Arena', 3000, 5, 5, 5],
    ['memphis', 'Memphis', 'University of Memphis', 'Tigers', 'MEM', 'Memphis', 'TN', 35.12, -89.94, '#003087', '#898D8D', 75, 'FedExForum', 18119, 7, 5, 8],
    ['north-texas', 'North Texas', 'University of North Texas', 'Mean Green', 'UNT', 'Denton', 'TX', 33.21, -97.15, '#00853E', '#FFFFFF', 40, 'UNT Coliseum', 9792, 5, 5, 5],
    ['rice', 'Rice', 'Rice University', 'Owls', 'RICE', 'Houston', 'TX', 29.72, -95.4, '#00205B', '#C1C6C8', 24, 'Tudor Fieldhouse', 5208, 5, 10, 6],
    ['south-florida', 'South Florida', 'University of South Florida', 'Bulls', 'USF', 'Tampa', 'FL', 28.06, -82.41, '#006747', '#CFC493', 36, 'Yuengling Center', 10411, 6, 6, 7],
    ['temple', 'Temple', 'Temple University', 'Owls', 'TEM', 'Philadelphia', 'PA', 39.98, -75.16, '#9D2235', '#FFFFFF', 58, 'Liacouras Center', 10206, 6, 6, 6],
    ['tulane', 'Tulane', 'Tulane University', 'Green Wave', 'TUL', 'New Orleans', 'LA', 29.94, -90.12, '#006747', '#418FDE', 30, 'Devlin Fieldhouse', 4100, 5, 9, 5],
    ['tulsa', 'Tulsa', 'University of Tulsa', 'Golden Hurricane', 'TLSA', 'Tulsa', 'OK', 36.15, -95.95, '#002D72', '#C99700', 42, 'Reynolds Center', 8355, 5, 7, 6],
    ['uab', 'UAB', 'University of Alabama at Birmingham', 'Blazers', 'UAB', 'Birmingham', 'AL', 33.5, -86.81, '#1E6B52', '#F4C300', 46, 'Bartow Arena', 8508, 5, 6, 6],
    ['utsa', 'UTSA', 'University of Texas at San Antonio', 'Roadrunners', 'UTSA', 'San Antonio', 'TX', 29.58, -98.62, '#0C2340', '#F15A22', 20, 'UTSA Convocation Center', 4080, 5, 5, 5],
    ['wichita-state', 'Wichita State', 'Wichita State University', 'Shockers', 'WICH', 'Wichita', 'KS', 37.72, -97.29, '#FFCD00', '#000000', 60, 'Charles Koch Arena', 10506, 6, 5, 7],
  ]),

  // ======================================================================
  // Atlantic 10 (14)
  // ======================================================================
  ...conf('a-10', [
    ['davidson', 'Davidson', 'Davidson College', 'Wildcats', 'DAV', 'Davidson', 'NC', 35.5, -80.85, '#AC1A2F', '#000000', 50, 'John M. Belk Arena', 5295, 4, 9, 6],
    ['dayton', 'Dayton', 'University of Dayton', 'Flyers', 'DAY', 'Dayton', 'OH', 39.74, -84.18, '#CE1141', '#004B8D', 64, 'UD Arena', 13435, 6, 7, 8],
    ['duquesne', 'Duquesne', 'Duquesne University', 'Dukes', 'DUQ', 'Pittsburgh', 'PA', 40.44, -79.99, '#002D72', '#BA0C2F', 38, 'UPMC Cooper Fieldhouse', 4390, 5, 6, 7],
    ['fordham', 'Fordham', 'Fordham University', 'Rams', 'FOR', 'Bronx', 'NY', 40.86, -73.89, '#860038', '#FFFFFF', 30, 'Rose Hill Gymnasium', 3200, 6, 8, 4],
    ['george-mason', 'George Mason', 'George Mason University', 'Patriots', 'GMU', 'Fairfax', 'VA', 38.83, -77.31, '#006633', '#FFCC33', 50, 'EagleBank Arena', 10000, 6, 6, 6],
    ['george-washington', 'George Washington', 'The George Washington University', 'Revolutionaries', 'GW', 'Washington', 'DC', 38.9, -77.05, '#033C5A', '#AA9868', 38, 'Charles E. Smith Center', 5000, 7, 8, 6],
    ['la-salle', 'La Salle', 'La Salle University', 'Explorers', 'LAS', 'Philadelphia', 'PA', 40.04, -75.16, '#00205B', '#FFC72C', 36, 'John Glaser Arena', 3400, 4, 5, 5],
    ['loyola-chicago', 'Loyola Chicago', 'Loyola University Chicago', 'Ramblers', 'LUC', 'Chicago', 'IL', 42.0, -87.66, '#8A2432', '#FFC72C', 52, 'Joseph J. Gentile Arena', 4486, 6, 7, 6],
    ['rhode-island', 'Rhode Island', 'University of Rhode Island', 'Rams', 'URI', 'Kingston', 'RI', 41.48, -71.53, '#002147', '#75B2DD', 46, 'Ryan Center', 7657, 5, 6, 6],
    ['richmond', 'Richmond', 'University of Richmond', 'Spiders', 'RICH', 'Richmond', 'VA', 37.57, -77.54, '#990000', '#002967', 44, 'Robins Center', 7201, 5, 8, 7],
    ['saint-josephs', "Saint Joseph's", "Saint Joseph's University", 'Hawks', 'JOES', 'Philadelphia', 'PA', 40.0, -75.24, '#9E1B32', '#A2AAAD', 50, 'Hagan Arena', 4200, 5, 7, 5],
    ['saint-louis', 'Saint Louis', 'Saint Louis University', 'Billikens', 'SLU', 'St. Louis', 'MO', 38.64, -90.23, '#003DA5', '#FFFFFF', 55, 'Chaifetz Arena', 10600, 6, 7, 8],
    ['st-bonaventure', 'St. Bonaventure', 'St. Bonaventure University', 'Bonnies', 'SBU', 'St. Bonaventure', 'NY', 42.08, -78.48, '#5C2D19', '#FFFFFF', 42, 'Reilly Center', 5480, 3, 6, 5],
    ['vcu', 'VCU', 'Virginia Commonwealth University', 'Rams', 'VCU', 'Richmond', 'VA', 37.55, -77.45, '#000000', '#FFB300', 62, 'Stuart C. Siegel Center', 7637, 6, 6, 7],
  ]),

  // ======================================================================
  // Mountain West (10)
  // ======================================================================
  ...conf('mwc', [
    ['air-force', 'Air Force', 'United States Air Force Academy', 'Falcons', 'AF', 'USAF Academy', 'CO', 39.01, -104.88, '#003087', '#8A8D8F', 22, 'Clune Arena', 5858, 3, 9, 6],
    ['grand-canyon', 'Grand Canyon', 'Grand Canyon University', 'Antelopes', 'GCU', 'Phoenix', 'AZ', 33.51, -112.13, '#522398', '#FFFFFF', 52, 'Global Credit Union Arena', 7000, 6, 4, 8],
    ['hawaii', 'Hawaii', 'University of Hawaii at Manoa', 'Rainbow Warriors', 'HAW', 'Honolulu', 'HI', 21.3, -157.82, '#024731', '#FFFFFF', 32, 'SimpliFi Arena at Stan Sheriff Center', 10300, 4, 6, 6],
    ['nevada', 'Nevada', 'University of Nevada, Reno', 'Wolf Pack', 'NEV', 'Reno', 'NV', 39.55, -119.82, '#003366', '#807F84', 52, 'Lawlor Events Center', 11536, 5, 5, 6],
    ['new-mexico', 'New Mexico', 'University of New Mexico', 'Lobos', 'UNM', 'Albuquerque', 'NM', 35.08, -106.62, '#BA0C2F', '#A7A8AA', 60, 'The Pit', 15411, 6, 5, 7],
    ['san-jose-state', 'San Jose State', 'San Jose State University', 'Spartans', 'SJSU', 'San Jose', 'CA', 37.34, -121.88, '#0055A2', '#E5A823', 18, 'Provident Credit Union Event Center', 5000, 5, 5, 4],
    ['uc-davis', 'UC Davis', 'University of California, Davis', 'Aggies', 'UCD', 'Davis', 'CA', 38.54, -121.75, '#022851', '#FFBF00', 26, 'University Credit Union Center', 7600, 4, 8, 5],
    ['unlv', 'UNLV', 'University of Nevada, Las Vegas', "Runnin' Rebels", 'UNLV', 'Las Vegas', 'NV', 36.11, -115.14, '#CF0A2C', '#666666', 68, 'Thomas & Mack Center', 18776, 7, 5, 7],
    ['utep', 'UTEP', 'University of Texas at El Paso', 'Miners', 'UTEP', 'El Paso', 'TX', 31.77, -106.51, '#041E42', '#FF8200', 44, 'Don Haskins Center', 12222, 4, 5, 6],
    ['wyoming', 'Wyoming', 'University of Wyoming', 'Cowboys', 'WYO', 'Laramie', 'WY', 41.31, -105.57, '#492F24', '#FFC425', 40, 'Arena-Auditorium', 11612, 4, 5, 6],
  ]),

  // ======================================================================
  // West Coast Conference (10)
  // ======================================================================
  ...conf('wcc', [
    ['denver', 'Denver', 'University of Denver', 'Pioneers', 'DEN', 'Denver', 'CO', 39.68, -104.96, '#BA0C2F', '#A89968', 18, 'Hamilton Gymnasium', 2500, 5, 7, 6],
    ['loyola-marymount', 'LMU', 'Loyola Marymount University', 'Lions', 'LMU', 'Los Angeles', 'CA', 33.97, -118.42, '#AB0C2F', '#00346E', 36, 'Gersten Pavilion', 4156, 6, 7, 5],
    ['pacific', 'Pacific', 'University of the Pacific', 'Tigers', 'PAC', 'Stockton', 'CA', 37.98, -121.31, '#F47920', '#000000', 24, 'Alex G. Spanos Center', 6150, 4, 6, 5],
    ['pepperdine', 'Pepperdine', 'Pepperdine University', 'Waves', 'PEPP', 'Malibu', 'CA', 34.04, -118.71, '#00205C', '#E35205', 30, 'Firestone Fieldhouse', 3104, 5, 8, 5],
    ['portland', 'Portland', 'University of Portland', 'Pilots', 'PORT', 'Portland', 'OR', 45.57, -122.73, '#1E1656', '#FFFFFF', 24, 'Chiles Center', 4852, 5, 7, 5],
    ['saint-marys', "Saint Mary's", "Saint Mary's College of California", 'Gaels', 'SMC', 'Moraga', 'CA', 37.84, -122.11, '#06315B', '#D80024', 62, 'University Credit Union Pavilion', 3500, 5, 7, 6],
    ['san-diego', 'San Diego', 'University of San Diego', 'Toreros', 'USD', 'San Diego', 'CA', 32.77, -117.19, '#003B70', '#75BEE9', 28, 'Jenny Craig Pavilion', 5100, 5, 7, 6],
    ['san-francisco', 'San Francisco', 'University of San Francisco', 'Dons', 'SF', 'San Francisco', 'CA', 37.78, -122.45, '#00543C', '#FDBB30', 45, 'War Memorial Gymnasium at the Sobrato Center', 5300, 6, 7, 5],
    ['santa-clara', 'Santa Clara', 'Santa Clara University', 'Broncos', 'SCU', 'Santa Clara', 'CA', 37.35, -121.94, '#862633', '#FFFFFF', 42, 'Leavey Center', 4700, 6, 8, 5],
    ['seattle', 'Seattle U', 'Seattle University', 'Redhawks', 'SEA', 'Seattle', 'WA', 47.61, -122.32, '#AA0000', '#000000', 28, 'Redhawk Center', 999, 5, 7, 4],
  ]),

  // ======================================================================
  // Pac-12 (9) — rebuilt league, first season back
  // ======================================================================
  ...conf('pac-12', [
    ['boise-state', 'Boise State', 'Boise State University', 'Broncos', 'BSU', 'Boise', 'ID', 43.6, -116.2, '#0033A0', '#D64309', 54, 'ExtraMile Arena', 12480, 6, 5, 7],
    ['colorado-state', 'Colorado State', 'Colorado State University', 'Rams', 'CSU', 'Fort Collins', 'CO', 40.57, -105.08, '#1E4D2B', '#C8C372', 50, 'Moby Arena', 8745, 5, 6, 6],
    ['fresno-state', 'Fresno State', 'California State University, Fresno', 'Bulldogs', 'FRES', 'Fresno', 'CA', 36.81, -119.75, '#DB0032', '#002E6D', 40, 'Save Mart Center', 15544, 5, 5, 7],
    ['gonzaga', 'Gonzaga', 'Gonzaga University', 'Bulldogs', 'GONZ', 'Spokane', 'WA', 47.67, -117.4, '#041E42', '#C8102E', 88, 'McCarthey Athletic Center', 6000, 8, 7, 9],
    ['oregon-state', 'Oregon State', 'Oregon State University', 'Beavers', 'ORST', 'Corvallis', 'OR', 44.56, -123.28, '#DC4405', '#000000', 48, 'Gill Coliseum', 9604, 5, 6, 6],
    ['san-diego-state', 'San Diego State', 'San Diego State University', 'Aztecs', 'SDSU', 'San Diego', 'CA', 32.77, -117.07, '#A6192E', '#000000', 68, 'Viejas Arena', 12414, 7, 6, 8],
    ['texas-state', 'Texas State', 'Texas State University', 'Bobcats', 'TXST', 'San Marcos', 'TX', 29.89, -97.94, '#501214', '#8D734A', 26, 'Strahan Arena', 10000, 5, 5, 6],
    ['utah-state', 'Utah State', 'Utah State University', 'Aggies', 'USU', 'Logan', 'UT', 41.75, -111.81, '#0F2439', '#FFFFFF', 58, 'Dee Glen Smith Spectrum', 10270, 5, 5, 7],
    ['washington-state', 'Washington State', 'Washington State University', 'Cougars', 'WSU', 'Pullman', 'WA', 46.73, -117.16, '#981E32', '#5E6A71', 42, 'Beasley Coliseum', 11671, 5, 6, 6],
  ]),

  // ======================================================================
  // Missouri Valley (11)
  // ======================================================================
  ...conf('mvc', [
    ['belmont', 'Belmont', 'Belmont University', 'Bruins', 'BEL', 'Nashville', 'TN', 36.13, -86.79, '#002469', '#C8102E', 42, 'Curb Event Center', 5085, 5, 6, 6],
    ['bradley', 'Bradley', 'Bradley University', 'Braves', 'BRAD', 'Peoria', 'IL', 40.7, -89.62, '#A50000', '#FFFFFF', 46, 'Carver Arena', 11060, 4, 6, 6],
    ['drake', 'Drake', 'Drake University', 'Bulldogs', 'DRKE', 'Des Moines', 'IA', 41.6, -93.65, '#004477', '#FFFFFF', 48, 'Knapp Center', 6424, 4, 6, 6],
    ['evansville', 'Evansville', 'University of Evansville', 'Purple Aces', 'EVAN', 'Evansville', 'IN', 37.97, -87.53, '#4F2D7F', '#F47B20', 28, 'Ford Center', 11000, 3, 6, 6],
    ['illinois-state', 'Illinois State', 'Illinois State University', 'Redbirds', 'ILST', 'Normal', 'IL', 40.51, -88.99, '#CE1126', '#F9DD16', 38, 'CEFCU Arena', 10200, 4, 5, 6],
    ['indiana-state', 'Indiana State', 'Indiana State University', 'Sycamores', 'INST', 'Terre Haute', 'IN', 39.47, -87.41, '#00669A', '#FFFFFF', 40, 'Hulman Center', 9000, 4, 4, 6],
    ['murray-state', 'Murray State', 'Murray State University', 'Racers', 'MUR', 'Murray', 'KY', 36.62, -88.32, '#002148', '#ECAC00', 46, 'CFSB Center', 8602, 4, 5, 6],
    ['northern-iowa', 'Northern Iowa', 'University of Northern Iowa', 'Panthers', 'UNI', 'Cedar Falls', 'IA', 42.51, -92.46, '#4B116F', '#FFCC00', 44, 'McLeod Center', 6650, 4, 5, 6],
    ['southern-illinois', 'Southern Illinois', 'Southern Illinois University Carbondale', 'Salukis', 'SIU', 'Carbondale', 'IL', 37.71, -89.22, '#720000', '#FFFFFF', 40, 'Banterra Center', 8339, 4, 5, 6],
    ['uic', 'UIC', 'University of Illinois Chicago', 'Flames', 'UIC', 'Chicago', 'IL', 41.87, -87.65, '#001E62', '#D50032', 24, 'Credit Union 1 Arena', 6500, 5, 6, 5],
    ['valparaiso', 'Valparaiso', 'Valparaiso University', 'Beacons', 'VALP', 'Valparaiso', 'IN', 41.46, -87.04, '#613318', '#FFCC00', 34, 'Athletics-Recreation Center', 5000, 3, 6, 5],
  ]),

  // ======================================================================
  // Mid-American (12) — Northern Illinois left for the Horizon
  // ======================================================================
  ...conf('mac', [
    ['akron', 'Akron', 'University of Akron', 'Zips', 'AKR', 'Akron', 'OH', 41.08, -81.51, '#041E42', '#A89968', 42, 'James A. Rhodes Arena', 5500, 4, 5, 6],
    ['ball-state', 'Ball State', 'Ball State University', 'Cardinals', 'BALL', 'Muncie', 'IN', 40.2, -85.41, '#BA0C2F', '#FFFFFF', 32, 'Worthen Arena', 11500, 4, 5, 6],
    ['bowling-green', 'Bowling Green', 'Bowling Green State University', 'Falcons', 'BGSU', 'Bowling Green', 'OH', 41.38, -83.64, '#4F2C1D', '#FE5000', 26, 'Stroh Center', 4700, 4, 5, 6],
    ['buffalo', 'Buffalo', 'University at Buffalo', 'Bulls', 'BUFF', 'Buffalo', 'NY', 43.0, -78.79, '#005BBB', '#FFFFFF', 30, 'Alumni Arena', 6100, 4, 6, 5],
    ['central-michigan', 'Central Michigan', 'Central Michigan University', 'Chippewas', 'CMU', 'Mount Pleasant', 'MI', 43.59, -84.77, '#6A0032', '#FFC82E', 26, 'McGuirk Arena', 5300, 4, 5, 5],
    ['eastern-michigan', 'Eastern Michigan', 'Eastern Michigan University', 'Eagles', 'EMU', 'Ypsilanti', 'MI', 42.25, -83.62, '#006633', '#FFFFFF', 22, 'George Gervin GameAbove Center', 8800, 3, 4, 5],
    ['kent-state', 'Kent State', 'Kent State University', 'Golden Flashes', 'KENT', 'Kent', 'OH', 41.15, -81.34, '#002664', '#EAAB00', 40, 'Memorial Athletic and Convocation Center', 6327, 4, 5, 5],
    ['miami-oh', 'Miami (OH)', 'Miami University', 'RedHawks', 'MOH', 'Oxford', 'OH', 39.51, -84.73, '#C3142D', '#FFFFFF', 36, 'Millett Hall', 9200, 4, 7, 5],
    ['ohio', 'Ohio', 'Ohio University', 'Bobcats', 'OHIO', 'Athens', 'OH', 39.32, -82.1, '#00694E', '#FFFFFF', 40, 'Convocation Center', 13080, 4, 6, 6],
    ['toledo', 'Toledo', 'University of Toledo', 'Rockets', 'TOL', 'Toledo', 'OH', 41.66, -83.61, '#15397F', '#FFDA00', 34, 'Savage Arena', 7300, 4, 5, 6],
    ['umass', 'UMass', 'University of Massachusetts Amherst', 'Minutemen', 'MASS', 'Amherst', 'MA', 42.39, -72.53, '#881C1C', '#FFFFFF', 44, 'Mullins Center', 9493, 5, 7, 6],
    ['western-michigan', 'Western Michigan', 'Western Michigan University', 'Broncos', 'WMU', 'Kalamazoo', 'MI', 42.28, -85.61, '#6C4023', '#B5A167', 24, 'University Arena', 5421, 4, 5, 5],
  ]),

  // ======================================================================
  // Coastal Athletic Association (13)
  // ======================================================================
  ...conf('caa', [
    ['campbell', 'Campbell', 'Campbell University', 'Fighting Camels', 'CAMP', 'Buies Creek', 'NC', 35.41, -78.74, '#F58025', '#000000', 16, 'Gilbert Craig Gore Arena', 3100, 3, 5, 5],
    ['charleston', 'Charleston', 'College of Charleston', 'Cougars', 'COFC', 'Charleston', 'SC', 32.78, -79.94, '#800000', '#FFFFFF', 44, 'TD Arena', 5100, 5, 6, 6],
    ['drexel', 'Drexel', 'Drexel University', 'Dragons', 'DREX', 'Philadelphia', 'PA', 39.96, -75.19, '#07294D', '#FFC600', 30, 'Daskalakis Athletic Center', 2509, 5, 7, 5],
    ['elon', 'Elon', 'Elon University', 'Phoenix', 'ELON', 'Elon', 'NC', 36.1, -79.5, '#73000A', '#B59A57', 18, 'Schar Center', 5100, 4, 6, 6],
    ['hampton', 'Hampton', 'Hampton University', 'Pirates', 'HAMP', 'Hampton', 'VA', 37.02, -76.34, '#00539B', '#FFFFFF', 20, 'Hampton Convocation Center', 7200, 3, 6, 5],
    ['hofstra', 'Hofstra', 'Hofstra University', 'Pride', 'HOF', 'Hempstead', 'NY', 40.71, -73.6, '#003591', '#FFD100', 36, 'Mack Sports Complex', 5022, 5, 6, 6],
    ['monmouth', 'Monmouth', 'Monmouth University', 'Hawks', 'MONM', 'West Long Branch', 'NJ', 40.28, -74.0, '#041E42', '#FFFFFF', 26, 'OceanFirst Bank Center', 4100, 4, 5, 6],
    ['nc-at', 'North Carolina A&T', 'North Carolina A&T State University', 'Aggies', 'NCAT', 'Greensboro', 'NC', 36.08, -79.77, '#004684', '#FDB927', 20, 'Corbett Sports Center', 5700, 3, 5, 5],
    // note: Matthews Arena was demolished in 2026; Northeastern plays at Cabot Center until its new arena opens (2028).
    ['northeastern', 'Northeastern', 'Northeastern University', 'Huskies', 'NEU', 'Boston', 'MA', 42.34, -71.09, '#C8102E', '#000000', 32, 'Cabot Center', 1000, 5, 8, 4],
    ['stony-brook', 'Stony Brook', 'Stony Brook University', 'Seawolves', 'STBK', 'Stony Brook', 'NY', 40.91, -73.12, '#990000', '#16243E', 22, 'Island Federal Arena', 4160, 4, 7, 6],
    ['towson', 'Towson', 'Towson University', 'Tigers', 'TOW', 'Towson', 'MD', 39.39, -76.61, '#FFBB00', '#000000', 30, 'SECU Arena', 5200, 4, 5, 6],
    ['unc-wilmington', 'UNC Wilmington', 'University of North Carolina Wilmington', 'Seahawks', 'UNCW', 'Wilmington', 'NC', 34.23, -77.87, '#006666', '#FFD600', 38, 'Trask Coliseum', 5200, 4, 6, 5],
    ['william-mary', 'William & Mary', 'College of William & Mary', 'Tribe', 'WM', 'Williamsburg', 'VA', 37.27, -76.71, '#115740', '#B9975B', 18, 'Kaplan Arena', 8600, 4, 9, 5],
  ]),

  // ======================================================================
  // Conference USA (10) — Louisiana Tech (Sun Belt) and UTEP (MWC) departed
  // ======================================================================
  ...conf('cusa', [
    ['delaware', 'Delaware', 'University of Delaware', "Fightin' Blue Hens", 'DEL', 'Newark', 'DE', 39.68, -75.75, '#00539F', '#FFD200', 30, 'Bob Carpenter Center', 5000, 4, 7, 6],
    ['fiu', 'FIU', 'Florida International University', 'Panthers', 'FIU', 'Miami', 'FL', 25.76, -80.37, '#081E3F', '#B6862C', 18, 'Ocean Bank Convocation Center', 5000, 5, 5, 5],
    ['jacksonville-state', 'Jacksonville State', 'Jacksonville State University', 'Gamecocks', 'JVST', 'Jacksonville', 'AL', 33.82, -85.76, '#CC0000', '#FFFFFF', 20, 'Pete Mathews Coliseum', 5500, 3, 4, 5],
    ['kennesaw-state', 'Kennesaw State', 'Kennesaw State University', 'Owls', 'KENN', 'Kennesaw', 'GA', 34.04, -84.58, '#000000', '#FDBB30', 22, 'KSU Convocation Center', 4600, 5, 5, 6],
    ['liberty', 'Liberty', 'Liberty University', 'Flames', 'LIB', 'Lynchburg', 'VA', 37.35, -79.18, '#002D62', '#C41230', 40, 'Liberty Arena', 4000, 6, 4, 8],
    ['middle-tennessee', 'Middle Tennessee', 'Middle Tennessee State University', 'Blue Raiders', 'MTSU', 'Murfreesboro', 'TN', 35.85, -86.37, '#0066CC', '#FFFFFF', 42, 'Murphy Center', 11520, 4, 5, 6],
    ['missouri-state', 'Missouri State', 'Missouri State University', 'Bears', 'MOST', 'Springfield', 'MO', 37.2, -93.28, '#5E0009', '#FFFFFF', 38, 'Great Southern Bank Arena', 11000, 4, 5, 7],
    ['new-mexico-state', 'New Mexico State', 'New Mexico State University', 'Aggies', 'NMSU', 'Las Cruces', 'NM', 32.28, -106.75, '#8C0B42', '#FFFFFF', 44, 'Pan American Center', 12482, 4, 4, 6],
    ['sam-houston', 'Sam Houston', 'Sam Houston State University', 'Bearkats', 'SHSU', 'Huntsville', 'TX', 30.71, -95.55, '#F96302', '#FFFFFF', 24, 'Bernard G. Johnson Coliseum', 6100, 3, 4, 5],
    ['western-kentucky', 'Western Kentucky', 'Western Kentucky University', 'Hilltoppers', 'WKU', 'Bowling Green', 'KY', 36.99, -86.45, '#C60C30', '#FFFFFF', 50, 'E. A. Diddle Arena', 7326, 5, 5, 7],
  ]),

  // ======================================================================
  // Sun Belt (14) — Louisiana Tech returns, Texas State left for the Pac-12
  // ======================================================================
  ...conf('sun-belt', [
    ['app-state', 'App State', 'Appalachian State University', 'Mountaineers', 'APP', 'Boone', 'NC', 36.21, -81.68, '#000000', '#FFCC00', 24, 'Holmes Convocation Center', 8325, 4, 5, 6],
    ['arkansas-state', 'Arkansas State', 'Arkansas State University', 'Red Wolves', 'ARST', 'Jonesboro', 'AR', 35.84, -90.68, '#CC092F', '#000000', 22, 'First National Bank Arena', 10038, 4, 4, 6],
    ['coastal-carolina', 'Coastal Carolina', 'Coastal Carolina University', 'Chanticleers', 'CCU', 'Conway', 'SC', 33.79, -79.01, '#006F71', '#A27752', 18, 'HTC Center', 3212, 4, 4, 6],
    ['georgia-southern', 'Georgia Southern', 'Georgia Southern University', 'Eagles', 'GASO', 'Statesboro', 'GA', 32.42, -81.78, '#011E41', '#A3915F', 22, 'Hill Convocation Center', 5500, 4, 4, 7],
    ['georgia-state', 'Georgia State', 'Georgia State University', 'Panthers', 'GAST', 'Atlanta', 'GA', 33.75, -84.39, '#0039A6', '#FFFFFF', 28, 'GSU Convocation Center', 7500, 5, 5, 7],
    ['james-madison', 'James Madison', 'James Madison University', 'Dukes', 'JMU', 'Harrisonburg', 'VA', 38.44, -78.87, '#450084', '#CBB677', 32, 'Atlantic Union Bank Center', 8500, 5, 6, 7],
    ['louisiana', 'Louisiana', 'University of Louisiana at Lafayette', "Ragin' Cajuns", 'ULL', 'Lafayette', 'LA', 30.21, -92.02, '#CE181E', '#FFFFFF', 30, 'Cajundome', 11550, 4, 4, 6],
    ['louisiana-tech', 'Louisiana Tech', 'Louisiana Tech University', 'Bulldogs', 'LT', 'Ruston', 'LA', 32.53, -92.65, '#002F8B', '#E31B23', 38, 'Thomas Assembly Center', 8000, 4, 5, 5],
    ['marshall', 'Marshall', 'Marshall University', 'Thundering Herd', 'MRSH', 'Huntington', 'WV', 38.42, -82.42, '#00B140', '#FFFFFF', 28, 'Cam Henderson Center', 9048, 4, 5, 5],
    ['old-dominion', 'Old Dominion', 'Old Dominion University', 'Monarchs', 'ODU', 'Norfolk', 'VA', 36.89, -76.31, '#003057', '#7C878E', 40, 'Chartway Arena', 8472, 5, 5, 7],
    ['south-alabama', 'South Alabama', 'University of South Alabama', 'Jaguars', 'USA', 'Mobile', 'AL', 30.7, -88.18, '#00205B', '#BF0D3E', 24, 'Mitchell Center', 10041, 4, 4, 6],
    ['southern-miss', 'Southern Miss', 'University of Southern Mississippi', 'Golden Eagles', 'USM', 'Hattiesburg', 'MS', 31.33, -89.33, '#000000', '#FFAB00', 22, 'Reed Green Coliseum', 8095, 4, 4, 5],
    ['troy', 'Troy', 'Troy University', 'Trojans', 'TROY', 'Troy', 'AL', 31.8, -85.96, '#8A2432', '#B3B5B8', 20, 'Trojan Arena', 5200, 3, 4, 6],
    ['ul-monroe', 'ULM', 'University of Louisiana Monroe', 'Warhawks', 'ULM', 'Monroe', 'LA', 32.53, -92.07, '#840029', '#BA9B37', 12, 'Fant-Ewing Coliseum', 7085, 3, 4, 4],
  ]),

  // ======================================================================
  // Horizon League (12) — Northern Illinois joins
  // ======================================================================
  ...conf('horizon', [
    ['cleveland-state', 'Cleveland State', 'Cleveland State University', 'Vikings', 'CLEV', 'Cleveland', 'OH', 41.5, -81.68, '#006A4D', '#FFFFFF', 30, 'Wolstein Center', 13610, 4, 4, 5],
    ['detroit-mercy', 'Detroit Mercy', 'University of Detroit Mercy', 'Titans', 'DET', 'Detroit', 'MI', 42.41, -83.14, '#002D72', '#A6192E', 30, 'Calihan Hall', 7917, 4, 5, 4],
    ['green-bay', 'Green Bay', 'University of Wisconsin-Green Bay', 'Phoenix', 'GB', 'Green Bay', 'WI', 44.53, -87.92, '#006F44', '#FFFFFF', 28, 'Kress Events Center', 4018, 3, 4, 5],
    ['iu-indy', 'IU Indy', 'Indiana University Indianapolis', 'Jaguars', 'IUI', 'Indianapolis', 'IN', 39.77, -86.18, '#990000', '#FFD100', 12, 'Corteva Coliseum', 6500, 4, 5, 4],
    ['milwaukee', 'Milwaukee', 'University of Wisconsin-Milwaukee', 'Panthers', 'MILW', 'Milwaukee', 'WI', 43.08, -87.88, '#000000', '#FDB927', 30, 'UW-Milwaukee Panther Arena', 10783, 4, 5, 5],
    ['northern-illinois', 'Northern Illinois', 'Northern Illinois University', 'Huskies', 'NIU', 'DeKalb', 'IL', 41.93, -88.77, '#BA0C2F', '#000000', 22, 'NIU Convocation Center', 10000, 4, 5, 5],
    ['northern-kentucky', 'Northern Kentucky', 'Northern Kentucky University', 'Norse', 'NKU', 'Highland Heights', 'KY', 39.03, -84.46, '#000000', '#FFC72C', 24, 'Truist Arena', 9400, 4, 4, 6],
    ['oakland', 'Oakland', 'Oakland University', 'Golden Grizzlies', 'OAK', 'Rochester', 'MI', 42.67, -83.22, '#000000', '#B59A57', 34, "OU Credit Union O'rena", 4005, 4, 5, 5],
    ['purdue-fort-wayne', 'Purdue Fort Wayne', 'Purdue University Fort Wayne', 'Mastodons', 'PFW', 'Fort Wayne', 'IN', 41.12, -85.11, '#000000', '#CFB991', 16, 'Gates Sports Center', 2700, 3, 4, 4],
    ['robert-morris', 'Robert Morris', 'Robert Morris University', 'Colonials', 'RMU', 'Moon Township', 'PA', 40.52, -80.22, '#14234B', '#C8102E', 24, 'UPMC Events Center', 4000, 3, 4, 6],
    ['wright-state', 'Wright State', 'Wright State University', 'Raiders', 'WRST', 'Dayton', 'OH', 39.78, -84.06, '#046A38', '#CBA052', 32, 'Nutter Center', 10400, 4, 4, 6],
    ['youngstown-state', 'Youngstown State', 'Youngstown State University', 'Penguins', 'YSU', 'Youngstown', 'OH', 41.11, -80.65, '#C8102E', '#FFFFFF', 18, 'Beeghly Center', 6300, 3, 4, 5],
  ]),

  // ======================================================================
  // Ivy League (8)
  // ======================================================================
  ...conf('ivy', [
    ['brown', 'Brown', 'Brown University', 'Bears', 'BRWN', 'Providence', 'RI', 41.83, -71.4, '#4E3629', '#ED1C24', 18, 'Pizzitola Sports Center', 2800, 5, 10, 5],
    ['columbia', 'Columbia', 'Columbia University', 'Lions', 'CLMB', 'New York', 'NY', 40.81, -73.96, '#1D4F91', '#B9D9EB', 14, 'Levien Gymnasium', 2700, 6, 10, 4],
    ['cornell', 'Cornell', 'Cornell University', 'Big Red', 'COR', 'Ithaca', 'NY', 42.45, -76.48, '#B31B1B', '#FFFFFF', 26, 'Newman Arena', 4473, 5, 10, 5],
    ['dartmouth', 'Dartmouth', 'Dartmouth College', 'Big Green', 'DART', 'Hanover', 'NH', 43.7, -72.29, '#00693E', '#FFFFFF', 14, 'Leede Arena', 2100, 4, 10, 4],
    ['harvard', 'Harvard', 'Harvard University', 'Crimson', 'HARV', 'Boston', 'MA', 42.37, -71.12, '#A51C30', '#FFFFFF', 30, 'Lavietes Pavilion', 1636, 7, 10, 5],
    ['penn', 'Penn', 'University of Pennsylvania', 'Quakers', 'PENN', 'Philadelphia', 'PA', 39.95, -75.19, '#011F5B', '#990000', 38, 'The Palestra', 8722, 6, 10, 6],
    ['princeton', 'Princeton', 'Princeton University', 'Tigers', 'PRIN', 'Princeton', 'NJ', 40.35, -74.66, '#E77500', '#000000', 40, 'Jadwin Gymnasium', 6854, 6, 10, 6],
    ['yale', 'Yale', 'Yale University', 'Bulldogs', 'YALE', 'New Haven', 'CT', 41.31, -72.93, '#00356B', '#FFFFFF', 38, 'John J. Lee Amphitheater', 2532, 6, 10, 5],
  ]),

  // ======================================================================
  // Southern Conference (11) — Tennessee Tech joins from the OVC
  // ======================================================================
  ...conf('socon', [
    ['chattanooga', 'Chattanooga', 'University of Tennessee at Chattanooga', 'Mocs', 'UTC', 'Chattanooga', 'TN', 35.05, -85.3, '#00386B', '#E0AA0F', 34, 'McKenzie Arena', 10928, 4, 5, 6],
    ['etsu', 'ETSU', 'East Tennessee State University', 'Buccaneers', 'ETSU', 'Johnson City', 'TN', 36.3, -82.37, '#041E42', '#FFC72C', 34, 'Freedom Hall Civic Center', 6149, 4, 5, 6],
    ['furman', 'Furman', 'Furman University', 'Paladins', 'FUR', 'Greenville', 'SC', 34.93, -82.44, '#582C83', '#FFFFFF', 32, 'Timmons Arena', 2500, 4, 7, 5],
    ['mercer', 'Mercer', 'Mercer University', 'Bears', 'MER', 'Macon', 'GA', 32.83, -83.65, '#F76800', '#000000', 22, 'Hawkins Arena', 3200, 3, 6, 5],
    ['samford', 'Samford', 'Samford University', 'Bulldogs', 'SAM', 'Birmingham', 'AL', 33.46, -86.79, '#002649', '#C8102E', 28, 'Pete Hanna Center', 5000, 4, 6, 6],
    ['tennessee-tech', 'Tennessee Tech', 'Tennessee Technological University', 'Golden Eagles', 'TNTC', 'Cookeville', 'TN', 36.17, -85.51, '#4F2984', '#FFDD00', 18, 'Hooper Eblen Center', 9280, 3, 5, 5],
    ['the-citadel', 'The Citadel', 'The Citadel, The Military College of South Carolina', 'Bulldogs', 'CIT', 'Charleston', 'SC', 32.8, -79.96, '#002B5C', '#6CACE4', 8, 'McAlister Field House', 6000, 3, 6, 4],
    ['unc-greensboro', 'UNC Greensboro', 'University of North Carolina at Greensboro', 'Spartans', 'UNCG', 'Greensboro', 'NC', 36.07, -79.81, '#0F2044', '#FFB71B', 28, 'First Horizon Coliseum', 22000, 4, 5, 5],
    ['vmi', 'VMI', 'Virginia Military Institute', 'Keydets', 'VMI', 'Lexington', 'VA', 37.79, -79.44, '#AE122A', '#FFD619', 10, 'Cameron Hall', 5029, 2, 6, 4],
    ['western-carolina', 'Western Carolina', 'Western Carolina University', 'Catamounts', 'WCU', 'Cullowhee', 'NC', 35.31, -83.18, '#592C88', '#C1A875', 14, 'Ramsey Center', 7826, 3, 4, 5],
    ['wofford', 'Wofford', 'Wofford College', 'Terriers', 'WOF', 'Spartanburg', 'SC', 34.96, -81.94, '#886B25', '#000000', 30, 'Jerry Richardson Indoor Stadium', 3400, 3, 7, 5],
  ]),

  // ======================================================================
  // Summit League (8) — Denver left for the WCC
  // ======================================================================
  ...conf('summit', [
    ['kansas-city', 'Kansas City', 'University of Missouri-Kansas City', 'Roos', 'UMKC', 'Kansas City', 'MO', 39.03, -94.58, '#0067A5', '#FFC72C', 12, 'Swinney Recreation Center', 1500, 4, 5, 4],
    ['north-dakota', 'North Dakota', 'University of North Dakota', 'Fighting Hawks', 'UND', 'Grand Forks', 'ND', 47.92, -97.07, '#009A44', '#000000', 16, 'Betty Engelstad Sioux Center', 3300, 3, 5, 6],
    ['north-dakota-state', 'North Dakota State', 'North Dakota State University', 'Bison', 'NDSU', 'Fargo', 'ND', 46.9, -96.8, '#0A5640', '#FFC72A', 28, 'Scheels Center', 5460, 3, 5, 6],
    ['omaha', 'Omaha', 'University of Nebraska Omaha', 'Mavericks', 'OMA', 'Omaha', 'NE', 41.26, -96.01, '#D71920', '#000000', 16, 'Baxter Arena', 7898, 4, 5, 6],
    ['oral-roberts', 'Oral Roberts', 'Oral Roberts University', 'Golden Eagles', 'ORU', 'Tulsa', 'OK', 36.05, -95.95, '#002F6C', '#C5B783', 28, 'Mabee Center', 10154, 4, 4, 6],
    ['south-dakota', 'South Dakota', 'University of South Dakota', 'Coyotes', 'SDAK', 'Vermillion', 'SD', 42.79, -96.93, '#AD0000', '#FFFFFF', 16, 'Sanford Coyote Sports Center', 6000, 3, 5, 7],
    ['south-dakota-state', 'South Dakota State', 'South Dakota State University', 'Jackrabbits', 'SDST', 'Brookings', 'SD', 44.32, -96.78, '#0033A0', '#FFD100', 32, 'Frost Arena', 6500, 3, 5, 6],
    ['st-thomas', 'St. Thomas', 'University of St. Thomas', 'Tommies', 'STMN', 'St. Paul', 'MN', 44.94, -93.19, '#510C76', '#FFFFFF', 12, 'Lee & Penny Anderson Arena', 5500, 4, 7, 7],
  ]),

  // ======================================================================
  // Big West (12) — Hawaii & UC Davis left for the MWC; CBU, Utah Valley,
  // Sacramento State join. (UC San Diego leaves for the WCC in 2027.)
  // ======================================================================
  ...conf('big-west', [
    ['cal-baptist', 'Cal Baptist', 'California Baptist University', 'Lancers', 'CBU', 'Riverside', 'CA', 33.93, -117.43, '#002855', '#A27D2C', 18, 'Fowler Events Center', 5050, 4, 4, 7],
    ['cal-poly', 'Cal Poly', 'California Polytechnic State University', 'Mustangs', 'CP', 'San Luis Obispo', 'CA', 35.3, -120.66, '#154734', '#BD8B13', 12, 'Mott Athletics Center', 3032, 4, 7, 4],
    ['cal-state-bakersfield', 'CSU Bakersfield', 'California State University, Bakersfield', 'Roadrunners', 'CSUB', 'Bakersfield', 'CA', 35.35, -119.1, '#003DA5', '#FFC72C', 12, 'Icardo Center', 3500, 3, 4, 4],
    ['cal-state-fullerton', 'Cal State Fullerton', 'California State University, Fullerton', 'Titans', 'CSUF', 'Fullerton', 'CA', 33.88, -117.89, '#00274C', '#FF7900', 22, 'Titan Gym', 4000, 4, 5, 4],
    ['cal-state-northridge', 'CSUN', 'California State University, Northridge', 'Matadors', 'CSUN', 'Northridge', 'CA', 34.24, -118.53, '#D22030', '#000000', 14, 'Premier America Credit Union Arena', 2500, 4, 5, 4],
    ['long-beach-state', 'Long Beach State', 'California State University, Long Beach', 'Beach', 'LBSU', 'Long Beach', 'CA', 33.78, -118.11, '#000000', '#F6BD1E', 30, 'Walter Pyramid', 4200, 5, 5, 6],
    ['sacramento-state', 'Sacramento State', 'California State University, Sacramento', 'Hornets', 'SAC', 'Sacramento', 'CA', 38.56, -121.42, '#043927', '#C4B581', 14, 'Hornets Nest', 1012, 5, 4, 3],
    ['uc-irvine', 'UC Irvine', 'University of California, Irvine', 'Anteaters', 'UCI', 'Irvine', 'CA', 33.65, -117.84, '#0064A4', '#FFD200', 34, 'Bren Events Center', 5608, 5, 8, 5],
    ['uc-riverside', 'UC Riverside', 'University of California, Riverside', 'Highlanders', 'UCR', 'Riverside', 'CA', 33.97, -117.33, '#003DA5', '#FFB81C', 12, 'SRC Arena', 3168, 4, 6, 4],
    ['uc-san-diego', 'UC San Diego', 'University of California San Diego', 'Tritons', 'UCSD', 'La Jolla', 'CA', 32.88, -117.24, '#182B49', '#C69214', 24, 'LionTree Arena', 4200, 5, 9, 5],
    ['uc-santa-barbara', 'UC Santa Barbara', 'University of California, Santa Barbara', 'Gauchos', 'UCSB', 'Santa Barbara', 'CA', 34.41, -119.85, '#003660', '#FEBC11', 34, 'The Thunderdome', 5000, 5, 8, 5],
    ['utah-valley', 'Utah Valley', 'Utah Valley University', 'Wolverines', 'UVU', 'Orem', 'UT', 40.28, -111.71, '#275D38', '#FFFFFF', 22, 'UCCU Center', 8500, 4, 4, 6],
  ]),

  // ======================================================================
  // United Athletic Conference (9) — the renamed WAC
  // ======================================================================
  ...conf('uac', [
    ['abilene-christian', 'Abilene Christian', 'Abilene Christian University', 'Wildcats', 'ACU', 'Abilene', 'TX', 32.47, -99.71, '#4F2170', '#FFFFFF', 18, 'Moody Coliseum', 3600, 3, 5, 5],
    ['austin-peay', 'Austin Peay', 'Austin Peay State University', 'Governors', 'APSU', 'Clarksville', 'TN', 36.53, -87.35, '#C41E3A', '#FFFFFF', 22, 'F&M Bank Arena', 5500, 3, 4, 6],
    ['central-arkansas', 'Central Arkansas', 'University of Central Arkansas', 'Bears', 'UCA', 'Conway', 'AR', 35.08, -92.46, '#4F2D7F', '#A7A9AC', 10, 'Farris Center', 6000, 3, 4, 4],
    ['eastern-kentucky', 'Eastern Kentucky', 'Eastern Kentucky University', 'Colonels', 'EKU', 'Richmond', 'KY', 37.74, -84.29, '#861F41', '#FFFFFF', 22, 'Baptist Health Arena at Alumni Coliseum', 6500, 3, 4, 5],
    ['little-rock', 'Little Rock', 'University of Arkansas at Little Rock', 'Trojans', 'UALR', 'Little Rock', 'AR', 34.72, -92.34, '#6F263D', '#A2AAAD', 24, 'Jack Stephens Center', 5600, 4, 4, 5],
    ['north-alabama', 'North Alabama', 'University of North Alabama', 'Lions', 'UNA', 'Florence', 'AL', 34.81, -87.68, '#46166B', '#DB9F11', 12, 'Flowers Hall', 3500, 3, 4, 4],
    ['tarleton-state', 'Tarleton State', 'Tarleton State University', 'Texans', 'TAR', 'Stephenville', 'TX', 32.22, -98.22, '#4F2683', '#FFFFFF', 10, 'EECU Center', 5000, 3, 4, 6],
    ['ut-arlington', 'UT Arlington', 'University of Texas at Arlington', 'Mavericks', 'UTA', 'Arlington', 'TX', 32.73, -97.11, '#0064B1', '#F58025', 16, 'College Park Center', 7000, 4, 5, 6],
    // note: West Georgia is still in its D-II -> D-I transition (postseason-ineligible in 2027).
    ['west-georgia', 'West Georgia', 'University of West Georgia', 'Wolves', 'UWG', 'Carrollton', 'GA', 33.57, -85.1, '#0656A5', '#DA291C', 8, 'The Coliseum', 6475, 3, 4, 4],
  ]),

  // ======================================================================
  // ASUN (8) — five schools left for the UAC; West Florida joins as a
  // first-year D-I program
  // ======================================================================
  ...conf('asun', [
    ['bellarmine', 'Bellarmine', 'Bellarmine University', 'Knights', 'BELL', 'Louisville', 'KY', 38.22, -85.7, '#A6192E', '#A2AAAD', 10, 'Freedom Hall', 18252, 3, 6, 5],
    ['florida-gulf-coast', 'FGCU', 'Florida Gulf Coast University', 'Eagles', 'FGCU', 'Fort Myers', 'FL', 26.46, -81.77, '#00287A', '#00885A', 24, 'Alico Arena', 4633, 4, 4, 6],
    ['jacksonville', 'Jacksonville', 'Jacksonville University', 'Dolphins', 'JAX', 'Jacksonville', 'FL', 30.35, -81.61, '#004D3B', '#FFFFFF', 16, 'Swisher Gymnasium', 1500, 4, 5, 4],
    ['lipscomb', 'Lipscomb', 'Lipscomb University', 'Bisons', 'LIP', 'Nashville', 'TN', 36.11, -86.8, '#331E54', '#F4AA00', 20, 'Allen Arena', 5028, 4, 6, 6],
    ['north-florida', 'North Florida', 'University of North Florida', 'Ospreys', 'UNF', 'Jacksonville', 'FL', 30.27, -81.51, '#00246B', '#A2AAAD', 12, 'UNF Arena', 5800, 4, 5, 5],
    ['queens', 'Queens', 'Queens University of Charlotte', 'Royals', 'QUC', 'Charlotte', 'NC', 35.19, -80.83, '#002D62', '#A6820F', 8, 'Curry Arena', 1800, 4, 5, 4],
    ['stetson', 'Stetson', 'Stetson University', 'Hatters', 'STET', 'DeLand', 'FL', 29.04, -81.3, '#0A5640', '#FFFFFF', 12, 'Insight Credit Union Arena', 4400, 3, 6, 5],
    // note: West Florida began its D-II -> D-I transition in 2026-27 (postseason-ineligible).
    ['west-florida', 'West Florida', 'University of West Florida', 'Argonauts', 'UWF', 'Pensacola', 'FL', 30.55, -87.22, '#004C97', '#009A44', 6, 'UWF Field House', 1500, 3, 4, 3],
  ]),

  // ======================================================================
  // Metro Conference (13) — the renamed MAAC
  // ======================================================================
  ...conf('metro', [
    ['canisius', 'Canisius', 'Canisius University', 'Golden Griffins', 'CAN', 'Buffalo', 'NY', 42.93, -78.85, '#0E2244', '#FFB81C', 16, 'Koessler Athletic Center', 2196, 3, 5, 4],
    ['fairfield', 'Fairfield', 'Fairfield University', 'Stags', 'FAIR', 'Fairfield', 'CT', 41.16, -73.26, '#C8102E', '#FFFFFF', 18, 'Leo D. Mahoney Arena', 3500, 4, 7, 6],
    ['iona', 'Iona', 'Iona University', 'Gaels', 'IONA', 'New Rochelle', 'NY', 40.93, -73.79, '#6F2C3F', '#FFB81C', 36, 'Hynes Athletics Center', 2611, 4, 5, 4],
    ['manhattan', 'Manhattan', 'Manhattan University', 'Jaspers', 'MAN', 'Riverdale', 'NY', 40.89, -73.9, '#00703C', '#FFFFFF', 24, 'Draddy Gymnasium', 2345, 4, 6, 3],
    ['marist', 'Marist', 'Marist University', 'Red Foxes', 'MRST', 'Poughkeepsie', 'NY', 41.72, -73.93, '#C8102E', '#FFFFFF', 16, 'McCann Arena', 3200, 3, 6, 4],
    ['merrimack', 'Merrimack', 'Merrimack College', 'Warriors', 'MRMK', 'North Andover', 'MA', 42.67, -71.12, '#003768', '#F2A900', 12, 'Hammel Court', 1200, 3, 5, 4],
    ['mount-st-marys', "Mount St. Mary's", "Mount St. Mary's University", 'Mountaineers', 'MSM', 'Emmitsburg', 'MD', 39.68, -77.35, '#005596', '#FFFFFF', 16, 'Knott Arena', 3500, 3, 5, 4],
    ['niagara', 'Niagara', 'Niagara University', 'Purple Eagles', 'NIA', 'Lewiston', 'NY', 43.14, -79.04, '#582C83', '#FFFFFF', 16, 'Gallagher Center', 2400, 3, 5, 4],
    ['quinnipiac', 'Quinnipiac', 'Quinnipiac University', 'Bobcats', 'QUIN', 'Hamden', 'CT', 41.42, -72.89, '#0C2340', '#FFB81C', 14, 'M&T Bank Arena', 3570, 4, 6, 7],
    ['rider', 'Rider', 'Rider University', 'Broncs', 'RID', 'Lawrenceville', 'NJ', 40.28, -74.74, '#9E1B32', '#FFFFFF', 16, 'Alumni Gymnasium', 1650, 4, 5, 3],
    ['sacred-heart', 'Sacred Heart', 'Sacred Heart University', 'Pioneers', 'SHU', 'Fairfield', 'CT', 41.22, -73.24, '#CE1141', '#8A8D8F', 10, 'William H. Pitt Center', 2062, 3, 5, 5],
    ['saint-peters', "Saint Peter's", "Saint Peter's University", 'Peacocks', 'SPU', 'Jersey City', 'NJ', 40.73, -74.07, '#00478E', '#FFFFFF', 24, 'Run Baby Run Arena', 3200, 3, 5, 3],
    ['siena', 'Siena', 'Siena College', 'Saints', 'SIE', 'Loudonville', 'NY', 42.72, -73.75, '#006B54', '#FFC72C', 28, 'MVP Arena', 15229, 4, 6, 6],
  ]),

  // ======================================================================
  // Big Sky (11) — Southern Utah & Utah Tech join; Sacramento State left
  // ======================================================================
  ...conf('big-sky', [
    ['eastern-washington', 'Eastern Washington', 'Eastern Washington University', 'Eagles', 'EWU', 'Cheney', 'WA', 47.49, -117.58, '#A10022', '#000000', 22, 'Reese Court', 6000, 3, 4, 5],
    ['idaho', 'Idaho', 'University of Idaho', 'Vandals', 'IDHO', 'Moscow', 'ID', 46.73, -117.01, '#B5985A', '#000000', 16, 'ICCU Arena', 4200, 3, 5, 6],
    ['idaho-state', 'Idaho State', 'Idaho State University', 'Bengals', 'IDST', 'Pocatello', 'ID', 42.86, -112.43, '#F47920', '#000000', 12, 'Reed Gym', 3040, 3, 4, 4],
    ['montana', 'Montana', 'University of Montana', 'Grizzlies', 'MONT', 'Missoula', 'MT', 46.86, -113.98, '#70263D', '#A2AAAD', 30, 'Dahlberg Arena', 7500, 4, 5, 5],
    ['montana-state', 'Montana State', 'Montana State University', 'Bobcats', 'MTST', 'Bozeman', 'MT', 45.67, -111.05, '#003875', '#B9975B', 22, 'Worthington Arena', 7250, 4, 5, 6],
    ['northern-arizona', 'Northern Arizona', 'Northern Arizona University', 'Lumberjacks', 'NAU', 'Flagstaff', 'AZ', 35.18, -111.65, '#003466', '#FFC82E', 12, 'Rolle Activity Center', 2500, 3, 5, 4],
    ['northern-colorado', 'Northern Colorado', 'University of Northern Colorado', 'Bears', 'UNCO', 'Greeley', 'CO', 40.4, -104.7, '#013C65', '#F6B000', 16, 'Bank of Colorado Arena', 2992, 3, 4, 4],
    ['portland-state', 'Portland State', 'Portland State University', 'Vikings', 'PRST', 'Portland', 'OR', 45.51, -122.68, '#154734', '#FFFFFF', 14, 'Viking Pavilion', 3000, 4, 5, 5],
    ['southern-utah', 'Southern Utah', 'Southern Utah University', 'Thunderbirds', 'SUU', 'Cedar City', 'UT', 37.68, -113.07, '#C8102E', '#000000', 14, 'America First Event Center', 5300, 3, 4, 5],
    ['utah-tech', 'Utah Tech', 'Utah Tech University', 'Trailblazers', 'UTU', 'St. George', 'UT', 37.1, -113.57, '#BA1C21', '#003058', 6, 'Burns Arena', 4779, 3, 4, 5],
    ['weber-state', 'Weber State', 'Weber State University', 'Wildcats', 'WEB', 'Ogden', 'UT', 41.19, -111.94, '#492365', '#FFFFFF', 32, 'Dee Events Center', 11592, 4, 4, 6],
  ]),

  // ======================================================================
  // Southland (12)
  // ======================================================================
  ...conf('southland', [
    ['east-texas-am', 'East Texas A&M', 'East Texas A&M University', 'Lions', 'ETAM', 'Commerce', 'TX', 33.24, -95.91, '#00386C', '#FFC72C', 6, 'The Field House', 5000, 3, 4, 4],
    ['houston-christian', 'Houston Christian', 'Houston Christian University', 'Huskies', 'HCU', 'Houston', 'TX', 29.69, -95.52, '#00205B', '#F58025', 8, 'Sharp Gymnasium', 1000, 4, 4, 3],
    ['incarnate-word', 'Incarnate Word', 'University of the Incarnate Word', 'Cardinals', 'UIW', 'San Antonio', 'TX', 29.47, -98.47, '#CB333B', '#000000', 8, 'McDermott Convocation Center', 2000, 3, 4, 4],
    ['lamar', 'Lamar', 'Lamar University', 'Cardinals', 'LAM', 'Beaumont', 'TX', 30.04, -94.07, '#E31937', '#FFFFFF', 22, 'Montagne Center', 10080, 3, 4, 5],
    ['mcneese', 'McNeese', 'McNeese State University', 'Cowboys', 'MCN', 'Lake Charles', 'LA', 30.18, -93.22, '#005DAA', '#FFD204', 34, 'The Legacy Center', 4200, 5, 4, 6],
    ['new-orleans', 'New Orleans', 'University of New Orleans', 'Privateers', 'UNO', 'New Orleans', 'LA', 30.03, -90.07, '#005CA9', '#A2AAAD', 16, 'Lakefront Arena', 8933, 4, 4, 4],
    ['nicholls', 'Nicholls', 'Nicholls State University', 'Colonels', 'NICH', 'Thibodaux', 'LA', 29.79, -90.8, '#C41230', '#A2AAAD', 14, 'Stopher Gymnasium', 3800, 3, 4, 4],
    ['northwestern-state', 'Northwestern State', 'Northwestern State University', 'Demons', 'NWST', 'Natchitoches', 'LA', 31.75, -93.1, '#492F92', '#F47920', 14, 'Prather Coliseum', 3900, 3, 4, 4],
    ['southeastern-louisiana', 'Southeastern Louisiana', 'Southeastern Louisiana University', 'Lions', 'SELA', 'Hammond', 'LA', 30.52, -90.47, '#006341', '#FDB913', 12, 'University Center', 7500, 3, 4, 4],
    ['stephen-f-austin', 'Stephen F. Austin', 'Stephen F. Austin State University', 'Lumberjacks', 'SFA', 'Nacogdoches', 'TX', 31.62, -94.65, '#3F2A56', '#FFFFFF', 28, 'William R. Johnson Coliseum', 7203, 3, 4, 5],
    ['texas-am-corpus-christi', 'Texas A&M-Corpus Christi', 'Texas A&M University-Corpus Christi', 'Islanders', 'AMCC', 'Corpus Christi', 'TX', 27.71, -97.33, '#0067C5', '#007F3E', 14, 'American Bank Center', 8500, 3, 4, 5],
    ['ut-rio-grande-valley', 'UTRGV', 'University of Texas Rio Grande Valley', 'Vaqueros', 'UTRGV', 'Edinburg', 'TX', 26.31, -98.17, '#F05023', '#0A2240', 12, 'UTRGV Fieldhouse', 2500, 4, 4, 4],
  ]),

  // ======================================================================
  // Ohio Valley (9) — Little Rock (UAC) and Tennessee Tech (SoCon) left
  // ======================================================================
  ...conf('ovc', [
    ['eastern-illinois', 'Eastern Illinois', 'Eastern Illinois University', 'Panthers', 'EIU', 'Charleston', 'IL', 39.48, -88.18, '#004B83', '#8A8D8F', 12, 'Groniger Arena', 5400, 3, 4, 4],
    ['lindenwood', 'Lindenwood', 'Lindenwood University', 'Lions', 'LIN', 'St. Charles', 'MO', 38.79, -90.5, '#000000', '#B5A36A', 6, 'Robert F. Hyland Arena', 3270, 3, 4, 4],
    ['morehead-state', 'Morehead State', 'Morehead State University', 'Eagles', 'MORE', 'Morehead', 'KY', 38.19, -83.43, '#005EB8', '#FFCF00', 24, 'Ellis T. Johnson Arena', 6500, 3, 4, 4],
    ['siue', 'SIUE', 'Southern Illinois University Edwardsville', 'Cougars', 'SIUE', 'Edwardsville', 'IL', 38.79, -89.99, '#E21836', '#000000', 12, 'First Community Arena', 4000, 3, 5, 4],
    ['southeast-missouri', 'Southeast Missouri State', 'Southeast Missouri State University', 'Redhawks', 'SEMO', 'Cape Girardeau', 'MO', 37.31, -89.53, '#C8102E', '#000000', 14, 'Show Me Center', 7000, 3, 4, 5],
    ['southern-indiana', 'Southern Indiana', 'University of Southern Indiana', 'Screaming Eagles', 'USI', 'Evansville', 'IN', 37.96, -87.68, '#002D72', '#A6192E', 8, 'Screaming Eagles Arena', 4800, 3, 4, 5],
    ['tennessee-state', 'Tennessee State', 'Tennessee State University', 'Tigers', 'TNST', 'Nashville', 'TN', 36.17, -86.83, '#00539F', '#FFFFFF', 16, 'Gentry Center', 9100, 3, 4, 4],
    ['ut-martin', 'UT Martin', 'University of Tennessee at Martin', 'Skyhawks', 'UTM', 'Martin', 'TN', 36.34, -88.86, '#0E1D45', '#FF6720', 10, 'Elam Center', 4300, 3, 4, 4],
    ['western-illinois', 'Western Illinois', 'Western Illinois University', 'Leathernecks', 'WIU', 'Macomb', 'IL', 40.47, -90.68, '#663399', '#FFCC00', 10, 'Western Hall', 5139, 3, 4, 4],
  ]),

  // ======================================================================
  // Patriot League (10)
  // ======================================================================
  ...conf('patriot', [
    ['american', 'American', 'American University', 'Eagles', 'AMER', 'Washington', 'DC', 38.94, -77.09, '#C4122F', '#002F6C', 16, 'Bender Arena', 4500, 5, 7, 5],
    ['army', 'Army', 'United States Military Academy', 'Black Knights', 'ARMY', 'West Point', 'NY', 41.39, -73.96, '#000000', '#D4BF91', 10, 'Christl Arena', 5043, 3, 9, 5],
    ['boston-university', 'Boston University', 'Boston University', 'Terriers', 'BU', 'Boston', 'MA', 42.35, -71.11, '#CC0000', '#FFFFFF', 18, 'Case Gym', 1800, 5, 8, 4],
    ['bucknell', 'Bucknell', 'Bucknell University', 'Bison', 'BUCK', 'Lewisburg', 'PA', 40.95, -76.88, '#003865', '#E87722', 26, 'Sojka Pavilion', 4000, 4, 8, 5],
    ['colgate', 'Colgate', 'Colgate University', 'Raiders', 'COLG', 'Hamilton', 'NY', 42.82, -75.53, '#821019', '#FFFFFF', 24, 'Cotterell Court', 1750, 3, 9, 4],
    ['holy-cross', 'Holy Cross', 'College of the Holy Cross', 'Crusaders', 'HC', 'Worcester', 'MA', 42.24, -71.81, '#602D89', '#FFFFFF', 20, 'Hart Center', 3600, 3, 8, 4],
    ['lafayette', 'Lafayette', 'Lafayette College', 'Leopards', 'LAF', 'Easton', 'PA', 40.7, -75.21, '#98002E', '#FFFFFF', 12, 'Kirby Sports Center', 3500, 3, 8, 4],
    ['lehigh', 'Lehigh', 'Lehigh University', 'Mountain Hawks', 'LEH', 'Bethlehem', 'PA', 40.61, -75.38, '#653819', '#FFFFFF', 22, 'Stabler Arena', 5600, 3, 8, 5],
    ['loyola-md', 'Loyola (MD)', 'Loyola University Maryland', 'Greyhounds', 'LOY', 'Baltimore', 'MD', 39.35, -76.62, '#00573F', '#A2AAAD', 8, 'Reitz Arena', 2100, 4, 7, 4],
    ['navy', 'Navy', 'United States Naval Academy', 'Midshipmen', 'NAVY', 'Annapolis', 'MD', 38.98, -76.49, '#00205B', '#C5B783', 18, 'Alumni Hall', 5710, 3, 9, 5],
  ]),

  // ======================================================================
  // America East (9)
  // ======================================================================
  ...conf('america-east', [
    ['albany', 'Albany', 'University at Albany', 'Great Danes', 'ALB', 'Albany', 'NY', 42.69, -73.82, '#46166B', '#EEB211', 18, 'Broadview Center', 4538, 3, 5, 4],
    ['binghamton', 'Binghamton', 'Binghamton University', 'Bearcats', 'BING', 'Vestal', 'NY', 42.09, -75.97, '#005A43', '#FFFFFF', 8, 'Binghamton University Events Center', 5142, 3, 7, 5],
    ['bryant', 'Bryant', 'Bryant University', 'Bulldogs', 'BRY', 'Smithfield', 'RI', 41.92, -71.54, '#000000', '#C1A875', 14, 'Chace Athletic Center', 2400, 3, 5, 4],
    ['maine', 'Maine', 'University of Maine', 'Black Bears', 'ME', 'Orono', 'ME', 44.9, -68.67, '#003263', '#B0D7FF', 6, 'Memorial Gymnasium', 2000, 2, 5, 3],
    ['new-hampshire', 'New Hampshire', 'University of New Hampshire', 'Wildcats', 'UNH', 'Durham', 'NH', 43.14, -70.93, '#003591', '#FFFFFF', 6, 'Lundholm Gymnasium', 3500, 3, 6, 3],
    ['njit', 'NJIT', 'New Jersey Institute of Technology', 'Highlanders', 'NJIT', 'Newark', 'NJ', 40.74, -74.18, '#CC0000', '#071D49', 6, 'Wellness and Events Center', 3500, 4, 7, 5],
    ['umass-lowell', 'UMass Lowell', 'University of Massachusetts Lowell', 'River Hawks', 'UML', 'Lowell', 'MA', 42.65, -71.32, '#0067B1', '#C8102E', 8, 'Costello Athletic Center', 2100, 3, 5, 4],
    ['umbc', 'UMBC', 'University of Maryland, Baltimore County', 'Retrievers', 'UMBC', 'Baltimore', 'MD', 39.26, -76.71, '#000000', '#FDB515', 16, 'Chesapeake Employers Insurance Arena', 5000, 3, 6, 5],
    ['vermont', 'Vermont', 'University of Vermont', 'Catamounts', 'UVM', 'Burlington', 'VT', 44.48, -73.2, '#154734', '#FFC72C', 32, 'Patrick Gymnasium', 3266, 3, 6, 4],
  ]),

  // ======================================================================
  // Big South (9)
  // ======================================================================
  ...conf('big-south', [
    ['charleston-southern', 'Charleston Southern', 'Charleston Southern University', 'Buccaneers', 'CHSO', 'North Charleston', 'SC', 32.98, -80.07, '#002855', '#B9975B', 8, 'Buccaneer Field House', 881, 3, 4, 3],
    ['gardner-webb', 'Gardner-Webb', 'Gardner-Webb University', "Runnin' Bulldogs", 'GWEB', 'Boiling Springs', 'NC', 35.25, -81.67, '#BA0C2F', '#000000', 10, 'Paul Porter Arena', 3500, 3, 4, 4],
    ['high-point', 'High Point', 'High Point University', 'Panthers', 'HPU', 'High Point', 'NC', 35.97, -79.99, '#330072', '#FFFFFF', 30, 'Qubein Center', 4500, 6, 5, 8],
    ['longwood', 'Longwood', 'Longwood University', 'Lancers', 'LONG', 'Farmville', 'VA', 37.3, -78.4, '#002F6C', '#8A8D8F', 12, 'Joan Perry Brock Center', 3000, 3, 4, 5],
    ['presbyterian', 'Presbyterian', 'Presbyterian College', 'Blue Hose', 'PRE', 'Clinton', 'SC', 34.47, -81.88, '#0055A5', '#9D2235', 6, 'Templeton Center', 2000, 2, 5, 3],
    ['radford', 'Radford', 'Radford University', 'Highlanders', 'RAD', 'Radford', 'VA', 37.14, -80.55, '#C2011B', '#002855', 14, 'Dedmon Center', 3000, 3, 4, 4],
    ['unc-asheville', 'UNC Asheville', 'University of North Carolina Asheville', 'Bulldogs', 'UNCA', 'Asheville', 'NC', 35.62, -82.57, '#003DA5', '#FFFFFF', 14, 'Kimmel Arena', 3200, 3, 5, 4],
    ['usc-upstate', 'USC Upstate', 'University of South Carolina Upstate', 'Spartans', 'UPST', 'Spartanburg', 'SC', 34.99, -81.97, '#00703C', '#000000', 6, 'G. B. Hodge Center', 878, 2, 4, 3],
    ['winthrop', 'Winthrop', 'Winthrop University', 'Eagles', 'WIN', 'Rock Hill', 'SC', 34.94, -81.03, '#862633', '#FFC72C', 28, 'Winthrop Coliseum', 6100, 3, 4, 5],
  ]),

  // ======================================================================
  // SWAC (12)
  // ======================================================================
  ...conf('swac', [
    ['alabama-am', 'Alabama A&M', 'Alabama A&M University', 'Bulldogs', 'AAMU', 'Huntsville', 'AL', 34.78, -86.57, '#660000', '#FFFFFF', 6, 'Alabama A&M Events Center', 6000, 2, 3, 4],
    ['alabama-state', 'Alabama State', 'Alabama State University', 'Hornets', 'ALST', 'Montgomery', 'AL', 32.36, -86.3, '#000000', '#C99700', 10, 'Dunn-Oliver Acadome', 7400, 2, 3, 4],
    ['alcorn-state', 'Alcorn State', 'Alcorn State University', 'Braves', 'ALCN', 'Lorman', 'MS', 31.87, -91.14, '#46166B', '#E9A900', 8, 'Davey Whitney Complex', 7000, 2, 3, 3],
    ['arkansas-pine-bluff', 'Arkansas-Pine Bluff', 'University of Arkansas at Pine Bluff', 'Golden Lions', 'UAPB', 'Pine Bluff', 'AR', 34.24, -92.0, '#000000', '#E5A823', 4, 'H.O. Clemmons Arena', 4500, 2, 3, 3],
    ['bethune-cookman', 'Bethune-Cookman', 'Bethune-Cookman University', 'Wildcats', 'BCU', 'Daytona Beach', 'FL', 29.21, -81.03, '#6F263D', '#F2A900', 8, 'Moore Gymnasium', 3000, 2, 3, 3],
    ['florida-am', 'Florida A&M', 'Florida A&M University', 'Rattlers', 'FAMU', 'Tallahassee', 'FL', 30.42, -84.29, '#00843D', '#F47A20', 10, 'Al Lawson Center', 8470, 3, 4, 4],
    ['grambling', 'Grambling State', 'Grambling State University', 'Tigers', 'GRAM', 'Grambling', 'LA', 32.53, -92.71, '#000000', '#FFC72C', 10, 'Fredrick C. Hobdy Assembly Center', 7500, 2, 3, 3],
    ['jackson-state', 'Jackson State', 'Jackson State University', 'Tigers', 'JKST', 'Jackson', 'MS', 32.3, -90.21, '#002147', '#FFFFFF', 12, 'Williams Assembly Center', 8000, 3, 3, 4],
    ['mississippi-valley-state', 'Mississippi Valley State', 'Mississippi Valley State University', 'Delta Devils', 'MVSU', 'Itta Bena', 'MS', 33.49, -90.33, '#006341', '#CE1126', 4, 'Harrison HPER Complex', 6000, 1, 3, 2],
    ['prairie-view-am', 'Prairie View A&M', 'Prairie View A&M University', 'Panthers', 'PVAM', 'Prairie View', 'TX', 30.09, -95.99, '#4F2D7F', '#FDB913', 10, 'William J. Nicks Building', 6500, 2, 3, 3],
    ['southern', 'Southern', 'Southern University and A&M College', 'Jaguars', 'SOU', 'Baton Rouge', 'LA', 30.52, -91.19, '#005EB8', '#FFD100', 12, 'F. G. Clark Center', 7500, 2, 3, 3],
    ['texas-southern', 'Texas Southern', 'Texas Southern University', 'Tigers', 'TXSO', 'Houston', 'TX', 29.72, -95.36, '#860038', '#A2AAAD', 14, 'Health and Physical Education Arena', 8100, 3, 3, 4],
  ]),

  // ======================================================================
  // MEAC (8)
  // ======================================================================
  ...conf('meac', [
    ['coppin-state', 'Coppin State', 'Coppin State University', 'Eagles', 'COPP', 'Baltimore', 'MD', 39.31, -76.66, '#2E3192', '#FFC72C', 8, 'Physical Education Complex', 4100, 2, 3, 3],
    ['delaware-state', 'Delaware State', 'Delaware State University', 'Hornets', 'DSU', 'Dover', 'DE', 39.19, -75.54, '#C8102E', '#0067B1', 4, 'Memorial Hall', 1800, 2, 3, 3],
    ['howard', 'Howard', 'Howard University', 'Bison', 'HOW', 'Washington', 'DC', 38.92, -77.02, '#003A63', '#E51937', 16, 'Burr Gymnasium', 2700, 4, 6, 4],
    ['maryland-eastern-shore', 'Maryland Eastern Shore', 'University of Maryland Eastern Shore', 'Hawks', 'UMES', 'Princess Anne', 'MD', 38.21, -75.68, '#862633', '#A2AAAD', 4, 'Hytche Athletic Center', 5500, 2, 3, 3],
    ['morgan-state', 'Morgan State', 'Morgan State University', 'Bears', 'MORG', 'Baltimore', 'MD', 39.34, -76.58, '#004B8D', '#F28C28', 12, 'Hill Field House', 4250, 3, 4, 3],
    ['norfolk-state', 'Norfolk State', 'Norfolk State University', 'Spartans', 'NSU', 'Norfolk', 'VA', 36.85, -76.26, '#007A53', '#F3D03E', 22, 'Echols Hall', 4500, 3, 3, 4],
    ['north-carolina-central', 'NC Central', 'North Carolina Central University', 'Eagles', 'NCCU', 'Durham', 'NC', 35.97, -78.9, '#7A0019', '#A2AAAD', 14, 'McDougald-McLendon Arena', 3056, 3, 4, 4],
    ['south-carolina-state', 'South Carolina State', 'South Carolina State University', 'Bulldogs', 'SCST', 'Orangeburg', 'SC', 33.5, -80.85, '#841F27', '#0A2240', 8, 'SHM Memorial Center', 3200, 2, 3, 3],
  ]),

  // ======================================================================
  // NEC (9) — Saint Francis (PA) dropped to Division III
  // ======================================================================
  ...conf('nec', [
    ['central-connecticut', 'Central Connecticut', 'Central Connecticut State University', 'Blue Devils', 'CCSU', 'New Britain', 'CT', 41.69, -72.77, '#1B49A2', '#FFFFFF', 12, 'William H. Detrick Gymnasium', 2654, 3, 4, 3],
    ['chicago-state', 'Chicago State', 'Chicago State University', 'Cougars', 'CHST', 'Chicago', 'IL', 41.72, -87.61, '#006A4D', '#FFFFFF', 4, 'Jones Convocation Center', 7000, 3, 3, 4],
    ['fairleigh-dickinson', 'Fairleigh Dickinson', 'Fairleigh Dickinson University', 'Knights', 'FDU', 'Hackensack', 'NJ', 40.9, -74.03, '#72293C', '#FFFFFF', 14, 'Bogota Savings Bank Center', 5000, 3, 5, 4],
    ['le-moyne', 'Le Moyne', 'Le Moyne College', 'Dolphins', 'LEM', 'Syracuse', 'NY', 43.05, -76.09, '#006633', '#FFD100', 6, 'Ted Grant Court', 2000, 3, 5, 3],
    ['liu', 'LIU', 'Long Island University', 'Sharks', 'LIU', 'Brooklyn', 'NY', 40.69, -73.98, '#002F6C', '#FFC72C', 12, 'Steinberg Wellness Center', 2500, 4, 4, 4],
    ['mercyhurst', 'Mercyhurst', 'Mercyhurst University', 'Lakers', 'MERC', 'Erie', 'PA', 42.1, -80.05, '#00573F', '#002D72', 8, 'Mercyhurst Athletic Center', 1800, 2, 4, 3],
    ['new-haven', 'New Haven', 'University of New Haven', 'Chargers', 'NHVN', 'West Haven', 'CT', 41.29, -72.96, '#002D74', '#FFC72C', 4, 'Charger Gymnasium', 2000, 3, 4, 3],
    ['stonehill', 'Stonehill', 'Stonehill College', 'Skyhawks', 'STO', 'Easton', 'MA', 42.06, -71.08, '#2F2A6E', '#FFFFFF', 4, 'Merkert Gymnasium', 2000, 3, 5, 3],
    ['wagner', 'Wagner', 'Wagner College', 'Seahawks', 'WAG', 'Staten Island', 'NY', 40.62, -74.09, '#00483A', '#FFFFFF', 14, 'Spiro Sports Center', 2100, 3, 5, 3],
  ]),
];
