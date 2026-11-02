// Name pools for procedurally generated players, coaches, and media.
// Mixed, modern American-college-roster flavor plus international pools.

export const FIRST_NAMES: string[] = `Aaron Abdul Adrian Ahmad Aiden AJ Alex Alijah Amari Andre Andrew Anthony Antonio Ar'Mon Armani Austin Avery
Bennett Blake Bo Bradley Brandon Braylon Brayden Brennan Brice Bronny Bryce Caleb Calvin Cam Camden Carlos Carson Carter Cason
Chance Chase Chris Christian Cole Collin Colton Connor Cooper Corey Cormac Curtis Dalen Dallas Damarion Damian Damon Dante Darius
Darnell Darryl DaShawn David Davion Dawson Deandre Declan Dejon Demarcus Demetrius Deontae Derek Derrick Desmond Devin Dexter Dillon
Dominic Donovan Drew Dwayne Dylan Eli Elijah Elliot Emanuel Emmanuel Eric Ethan Evan Ezra Finn Gabe Garrett Gavin Grant Hakeem
Hayden Hudson Hunter Ian Isaac Isaiah Ismael Jabari Jace Jackson Jacob Jaden Jahmir Jakobe Jalen Jamal Jamari Jameer James Jamir
Jared Jarrett Jase Jason Javon Jay Jaylen Jaylin Jayden Jeremiah Jermaine Jerome Jett Jordan Joel Johnny Jonah Jonas Jordan Josh
Joshua Josiah Juan JuJu Julian Justin Kadin Kai Kaleb Kam Kameron Karim Keegan Keion Keith Kellen Kendall Kendrick Kenny Keon
Kevin Khalil Khamari King Kobe Kody Kris Kyle Kylan Kyree Lamar Landon Lance Langston Lawson Leon Liam Logan Lonnie Lorenzo Luca
Lucas Luke Malachi Malik Marcus Mario Mark Marquis Mason Matt Max Micah Michael Miles Milan Mookie Myles Nasir Nate Nathan Nick
Nico Noah Nolan Omar Owen Parker Patrick Payton Preston Quentin Quincy Quinten RJ Rashad Ray Reed Reggie Rhys Ricky Riley Robert
Rodney Roman Ryan Ryder Sam Santiago Saquan Sean Seth Shamar Shane Silas Spencer Stephon Sterling Tae Talen Tanner Terrance Terrell
Tevin Theo Tim Tony Trae Travis Trayce Tre Trent Trevon Tristan Ty Tyler Tyrese Tyson Victor Vince Walker Wes Will Xavier Zach
Zaire Zion Kasen Jahlil Dior Mekhi Trey Quinn Bryson Jaylon Taj Ahmir Amare Cayden Daylen Elias Ronan Mateo Kingston Jeremy Isaiah`
  .split(/\s+/).filter(Boolean);

export const LAST_NAMES: string[] = `Adams Alexander Allen Anderson Armstrong Atkins Bailey Baker Banks Barnes Bates Battle Bell Bennett Berry Bishop
Black Blackwell Boone Bowman Boyd Bradley Brewer Brooks Brown Bryant Burke Burns Butler Byrd Caldwell Campbell Carr Carter Chambers
Chandler Chapman Clark Cobb Coleman Collins Cook Cooper Copeland Cox Crawford Cross Cunningham Curry Daniels Davidson Davis Dawson
Dean Dixon Douglas Duncan Dunn Edwards Ellis Evans Fields Fisher Fleming Fletcher Ford Foster Fowler Franklin Freeman Fuller
Gaines Garner Garrett Gibson Gilbert Gilmore Gordon Graham Grant Graves Gray Green Greene Griffin Hairston Hall Hamilton Hammond
Hampton Harper Harris Hart Hawkins Hayes Haynes Henderson Henry Hicks Hill Hines Holland Holloway Holmes Hood Hopkins Horton
Howard Hudson Hughes Hunt Hunter Ingram Jackson James Jefferson Jenkins Johnson Jones Jordan Keller Kelly Kennedy King Knight
Lambert Lane Lawson Lee Lewis Little Livingston Long Love Lyons Mack Maddox Marshall Martin Mason Matthews Maxwell McCall McCoy
McDaniel McGee McKenzie McKinney McNeil Meadows Miles Miller Mitchell Monroe Moore Morgan Morris Moss Murphy Murray Myers Nash
Nelson Newton Nichols Norman Norris Oliver Owens Palmer Parker Patterson Payne Pearson Perkins Perry Peters Phillips Pierce Porter
Powell Price Pruitt Quarles Ramsey Randall Ray Reed Reese Reid Rhodes Rice Richards Richardson Riley Rivers Roberts Robinson
Rogers Ross Russell Sanders Scott Sharp Shaw Simmons Simpson Sims Singleton Smith Snow Spencer Stanley Steele Stephens Stewart
Stokes Stone Sullivan Sutton Tate Taylor Terry Thomas Thompson Tillman Townsend Tucker Turner Underwood Vaughn Wade Walker Wallace
Walton Ward Ware Warren Washington Waters Watkins Watson Weaver Webb Wells West Wheeler White Whitfield Wilkins Williams Willis
Wilson Winston Wise Wood Woods Wright Young Bridges Okafor Mbeki Nwosu Adebayo Diallo Traore Kone Mensah Okoro Achiuwa Bamba
Gallagher Kowalski Novak Lindqvist Rossi Moretti Romero Hernandez Martinez Garcia Lopez Rodriguez Gonzalez Ortiz Castillo Vega
Morales Reyes Cruz Flores Rivera Sullivan O'Brien Murphy McCarthy Kearney Fitzgerald Schmidt Muller Fischer Weber Wagner Becker
Hoffman Klein Wolfe Zimmerman Kim Park Nguyen Tran Chen Liu Patel Shah Singh Khan Ali Hassan Ibrahim Yusuf Abdi Mohamed Farah
Thornton Whitaker Pritchard Langford Ashby Calloway Beasley Mayfield Dorsey Gentry Hargrove Lockhart Merritt Rollins Sheppard
Stallworth Tolliver Vick Wilder Yancey Boykin Burrell Cheatham Dupree Fairley Givens Hollins Ivory Joyner Kirkland Lattimore
Mosley Noble Odom Pettiford Redmond Swanson Tatum Upshaw Varner Whitlock Battle Grier Bey Moody Stroud Hightower Strickland`
  .split(/\s+/).filter(Boolean);

export interface IntlPool { country: string; first: string[]; last: string[]; weight: number; }
export const INTL_POOLS: IntlPool[] = [
  { country: 'Canada', weight: 6, first: ['Liam', 'Ethan', 'Jamal', 'Olivier', 'Shai', 'Andrew', 'Bennedict', 'Zach', 'Elijah', 'Luguentz', 'RJ', 'Trey'], last: ['Tremblay', 'Gagnon', 'Roy', 'Boucher', 'Nembhard', 'Murray', 'Brooks', 'Edey', 'Mathurin', 'Dort', 'Alexander', 'Barrett'] },
  { country: 'Australia', weight: 4, first: ['Josh', 'Dyson', 'Jock', 'Matisse', 'Lachlan', 'Will', 'Tyrese', 'Jack', 'Mitch', 'Angus'], last: ['Giddey', 'Daniels', 'Landale', 'Thybulle', 'Exum', 'Ingles', 'McVeigh', 'Creek', 'Bairstow', 'Kay'] },
  { country: 'France', weight: 4, first: ['Victor', 'Théo', 'Hugo', 'Mathis', 'Rudy', 'Zaccharie', 'Bilal', 'Ousmane', 'Nolan', 'Tidjane'], last: ['Dubois', 'Laurent', 'Moreau', 'Lefèvre', 'Coulibaly', 'Risacher', 'Sarr', 'Traoré', 'Diabaté', 'Fontaine'] },
  { country: 'Serbia', weight: 3, first: ['Nikola', 'Luka', 'Bogdan', 'Stefan', 'Marko', 'Aleksa', 'Filip', 'Vasilije'], last: ['Jović', 'Petrović', 'Marković', 'Nikolić', 'Đorđević', 'Stojanović', 'Ilić', 'Pavlović'] },
  { country: 'Lithuania', weight: 2, first: ['Domantas', 'Jonas', 'Rokas', 'Matas', 'Arnas', 'Tadas', 'Mantas'], last: ['Kazlauskas', 'Jankūnas', 'Butkevičius', 'Žukauskas', 'Petrauskas', 'Grigonis'] },
  { country: 'Spain', weight: 3, first: ['Pau', 'Sergio', 'Álvaro', 'Hugo', 'Juan', 'Santi', 'Izan', 'Rubén'], last: ['García', 'Fernández', 'López', 'Martínez', 'Sánchez', 'Navarro', 'Abrines', 'Almansa'] },
  { country: 'Nigeria', weight: 4, first: ['Chukwuemeka', 'Oluwaseun', 'Emeka', 'Ifeanyi', 'Tobi', 'Femi', 'Chidi', 'Kelechi', 'Ikenna', 'Ayo'], last: ['Okafor', 'Okeke', 'Adeyemi', 'Okonkwo', 'Nwankwo', 'Eze', 'Obi', 'Adebayo', 'Okoro', 'Achebe'] },
  { country: 'Senegal', weight: 2, first: ['Mamadou', 'Cheikh', 'Moustapha', 'Ibrahima', 'Pape', 'Babacar'], last: ['Diop', 'Ndiaye', 'Fall', 'Sow', 'Gueye', 'Diallo'] },
  { country: 'Germany', weight: 3, first: ['Franz', 'Moritz', 'Jonas', 'Lukas', 'Johannes', 'Ariel', 'Tristan', 'Niklas'], last: ['Wagner', 'Schröder', 'Hartenstein', 'Bonga', 'Theis', 'Obst', 'Lo', 'Krämer'] },
  { country: 'Greece', weight: 1, first: ['Giannis', 'Nikos', 'Kostas', 'Georgios', 'Dimitris'], last: ['Papadopoulos', 'Papanikolaou', 'Kalaitzakis', 'Sloukas', 'Mitoglou'] },
  { country: 'Croatia', weight: 1, first: ['Dario', 'Ivica', 'Mario', 'Ante', 'Luka'], last: ['Šarić', 'Zubac', 'Hezonja', 'Bogdanović', 'Ivanović'] },
  { country: 'Latvia', weight: 1, first: ['Kristaps', 'Dāvis', 'Rolands', 'Artūrs'], last: ['Porziņģis', 'Bertāns', 'Šmits', 'Žagars'] },
  { country: 'Finland', weight: 1, first: ['Lauri', 'Miro', 'Elias', 'Sasu'], last: ['Markkanen', 'Little', 'Valtonen', 'Salin'] },
  { country: 'Cameroon', weight: 2, first: ['Joel', 'Pascal', 'Christian', 'Yves', 'Ulrich'], last: ['Embiid', 'Siakam', 'Koloko', 'Mbah', 'Ngando'] },
  { country: 'South Sudan', weight: 1, first: ['Wenyen', 'Khaman', 'Nuni', 'Majok', 'Akuel'], last: ['Gabriel', 'Maluach', 'Omot', 'Deng', 'Kuany'] },
  { country: 'Dominican Republic', weight: 1, first: ['Karl', 'Al', 'Andrés', 'Ángel', 'Jean'], last: ['Feliz', 'Horford', 'Delgado', 'Montero', 'Núñez'] },
  { country: 'Puerto Rico', weight: 1, first: ['José', 'Isaiah', 'Carlos', 'Jorge'], last: ['Alvarado', 'Piñeiro', 'Arroyo', 'Barea'] },
  { country: 'Brazil', weight: 1, first: ['Gui', 'Bruno', 'Rafael', 'Lucas', 'Matheus'], last: ['Santos', 'Caboclo', 'Silva', 'Oliveira', 'Souza'] },
  { country: 'Italy', weight: 1, first: ['Simone', 'Nico', 'Gabriele', 'Danilo', 'Marco'], last: ['Fontecchio', 'Mannion', 'Procida', 'Gallinari', 'Spagnolo'] },
  { country: 'Japan', weight: 1, first: ['Rui', 'Yuta', 'Kai', 'Haruto'], last: ['Hachimura', 'Watanabe', 'Tominaga', 'Kawamura'] },
  { country: 'New Zealand', weight: 1, first: ['Steven', 'Tai', 'Hyrum', 'Finn'], last: ['Adams', 'Webster', 'Harris', 'Delany'] },
  { country: 'Great Britain', weight: 1, first: ['OG', 'Luol', 'Jeremy', 'Ben', 'Tariq'], last: ['Anunoby', 'Deng', 'Sochan', 'Walker', 'Okon'] },
  { country: 'Turkey', weight: 1, first: ['Alperen', 'Cedi', 'Ömer', 'Furkan'], last: ['Şengün', 'Osman', 'Yurtseven', 'Korkmaz'] },
  { country: 'Mali', weight: 1, first: ['Moussa', 'Sékou', 'Oumar', 'Bakary'], last: ['Diabaté', 'Doumbouya', 'Ballo', 'Koné'] },
];

export const MEDIA_OUTLETS = [
  'Hoops Insider', 'The Bracket Report', 'CBB Wire', 'Courtside Daily', 'The Athletic Wire', 'Full Court Press',
  'Hardwood Weekly', 'The Field of 68 Network', 'March Today', 'Rim & Rafters', 'The Paint Podcast', 'Box Score Media',
];
export const TV_NETWORKS = ['THN', 'THN2', 'SportsNet One', 'SportsNet Two', 'Gridiron & Hardwood Network', 'Prime Hoops', 'CourtVision+', 'National Hoops TV', 'Big Stage Sports', 'Streaming Exclusive'];
export const NBA_TEAMS = [
  'Atlanta', 'Boston', 'Brooklyn', 'Charlotte', 'Chicago', 'Cleveland', 'Dallas', 'Denver', 'Detroit', 'Golden State',
  'Houston', 'Indiana', 'LA Clippers', 'LA Lakers', 'Memphis', 'Miami', 'Milwaukee', 'Minnesota', 'New Orleans', 'New York',
  'Oklahoma City', 'Orlando', 'Philadelphia', 'Phoenix', 'Portland', 'Sacramento', 'San Antonio', 'Toronto', 'Utah', 'Washington',
];
