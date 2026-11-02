// US hometowns for recruits, weighted toward basketball hotbeds.
export interface Place { city: string; state: string; lat: number; lng: number; w: number; }

const P = (city: string, state: string, lat: number, lng: number, w = 1): Place => ({ city, state, lat, lng, w });

export const PLACES: Place[] = [
  // California
  P('Los Angeles', 'CA', 34.05, -118.24, 6), P('Oakland', 'CA', 37.8, -122.27, 3), P('San Diego', 'CA', 32.72, -117.16, 2), P('Sacramento', 'CA', 38.58, -121.49, 2), P('Fresno', 'CA', 36.74, -119.79, 1), P('Long Beach', 'CA', 33.77, -118.19, 2), P('Santa Ana', 'CA', 33.75, -117.87, 2), P('Chatsworth', 'CA', 34.26, -118.6, 1),
  // Texas
  P('Houston', 'TX', 29.76, -95.37, 6), P('Dallas', 'TX', 32.78, -96.8, 5), P('San Antonio', 'TX', 29.42, -98.49, 3), P('Austin', 'TX', 30.27, -97.74, 2), P('Fort Worth', 'TX', 32.76, -97.33, 2), P('Arlington', 'TX', 32.74, -97.11, 1), P('Beaumont', 'TX', 30.08, -94.1, 1), P('Lubbock', 'TX', 33.58, -101.86, 1),
  // Florida
  P('Miami', 'FL', 25.76, -80.19, 4), P('Orlando', 'FL', 28.54, -81.38, 3), P('Jacksonville', 'FL', 30.33, -81.66, 3), P('Tampa', 'FL', 27.95, -82.46, 3), P('Montverde', 'FL', 28.6, -81.67, 2), P('Fort Lauderdale', 'FL', 26.12, -80.14, 2), P('Tallahassee', 'FL', 30.44, -84.28, 1),
  // Georgia
  P('Atlanta', 'GA', 33.75, -84.39, 6), P('Savannah', 'GA', 32.08, -81.09, 1), P('Macon', 'GA', 32.84, -83.63, 1), P('Augusta', 'GA', 33.47, -81.97, 1), P('Columbus', 'GA', 32.46, -84.99, 1),
  // Carolinas
  P('Charlotte', 'NC', 35.23, -80.84, 4), P('Raleigh', 'NC', 35.78, -78.64, 2), P('Greensboro', 'NC', 36.07, -79.79, 2), P('Durham', 'NC', 35.99, -78.9, 1), P('Fayetteville', 'NC', 35.05, -78.88, 1), P('Columbia', 'SC', 34.0, -81.03, 2), P('Charleston', 'SC', 32.78, -79.93, 1), P('Greenville', 'SC', 34.85, -82.4, 1),
  // Mid-Atlantic / DMV
  P('Washington', 'DC', 38.9, -77.04, 5), P('Baltimore', 'MD', 39.29, -76.61, 4), P('Silver Spring', 'MD', 38.99, -77.03, 2), P('Hyattsville', 'MD', 38.96, -76.95, 1), P('Richmond', 'VA', 37.54, -77.44, 2), P('Norfolk', 'VA', 36.85, -76.29, 2), P('Virginia Beach', 'VA', 36.85, -75.98, 1), P('Philadelphia', 'PA', 39.95, -75.17, 5), P('Pittsburgh', 'PA', 40.44, -79.99, 2), P('Camden', 'NJ', 39.93, -75.12, 1), P('Newark', 'NJ', 40.74, -74.17, 3), P('Paterson', 'NJ', 40.92, -74.17, 1), P('Trenton', 'NJ', 40.22, -74.76, 1), P('Wilmington', 'DE', 39.74, -75.55, 1),
  // New York / New England
  P('New York', 'NY', 40.71, -74.0, 6), P('Brooklyn', 'NY', 40.68, -73.94, 3), P('The Bronx', 'NY', 40.84, -73.86, 2), P('Queens', 'NY', 40.73, -73.79, 2), P('Buffalo', 'NY', 42.89, -78.88, 1), P('Rochester', 'NY', 43.16, -77.61, 1), P('Syracuse', 'NY', 43.05, -76.15, 1), P('Boston', 'MA', 42.36, -71.06, 2), P('Hartford', 'CT', 41.76, -72.69, 1), P('New Haven', 'CT', 41.31, -72.92, 1), P('Providence', 'RI', 41.82, -71.41, 1), P('Portland', 'ME', 43.66, -70.26, 0.4),
  // Midwest
  P('Chicago', 'IL', 41.88, -87.63, 6), P('Peoria', 'IL', 40.69, -89.59, 1), P('Detroit', 'MI', 42.33, -83.05, 4), P('Flint', 'MI', 43.01, -83.69, 1), P('Grand Rapids', 'MI', 42.96, -85.67, 1), P('Indianapolis', 'IN', 39.77, -86.16, 4), P('Fort Wayne', 'IN', 41.08, -85.14, 1), P('Gary', 'IN', 41.6, -87.35, 1), P('Columbus', 'OH', 39.96, -82.99, 2), P('Cleveland', 'OH', 41.5, -81.69, 3), P('Cincinnati', 'OH', 39.1, -84.51, 2), P('Akron', 'OH', 41.08, -81.52, 1), P('Dayton', 'OH', 39.76, -84.19, 1), P('Toledo', 'OH', 41.65, -83.54, 1), P('Milwaukee', 'WI', 43.04, -87.91, 2), P('Madison', 'WI', 43.07, -89.4, 1), P('Minneapolis', 'MN', 44.98, -93.27, 2), P('St. Louis', 'MO', 38.63, -90.2, 3), P('Kansas City', 'MO', 39.1, -94.58, 2), P('Omaha', 'NE', 41.26, -95.93, 1), P('Des Moines', 'IA', 41.59, -93.62, 1), P('Wichita', 'KS', 37.69, -97.34, 1), P('Sioux Falls', 'SD', 43.55, -96.73, 0.5), P('Fargo', 'ND', 46.88, -96.79, 0.4),
  // South
  P('Memphis', 'TN', 35.15, -90.05, 3), P('Nashville', 'TN', 36.16, -86.78, 3), P('Knoxville', 'TN', 35.96, -83.92, 1), P('Chattanooga', 'TN', 35.05, -85.31, 1), P('Louisville', 'KY', 38.25, -85.76, 2), P('Lexington', 'KY', 38.04, -84.5, 1), P('Birmingham', 'AL', 33.52, -86.8, 2), P('Mobile', 'AL', 30.69, -88.04, 1), P('Huntsville', 'AL', 34.73, -86.59, 1), P('Jackson', 'MS', 32.3, -90.18, 2), P('New Orleans', 'LA', 29.95, -90.07, 3), P('Baton Rouge', 'LA', 30.45, -91.19, 2), P('Shreveport', 'LA', 32.52, -93.75, 1), P('Little Rock', 'AR', 34.75, -92.29, 2), P('Oklahoma City', 'OK', 35.47, -97.52, 2), P('Tulsa', 'OK', 36.15, -95.99, 1),
  // Mountain / West
  P('Phoenix', 'AZ', 33.45, -112.07, 3), P('Tucson', 'AZ', 32.22, -110.97, 1), P('Las Vegas', 'NV', 36.17, -115.14, 3), P('Henderson', 'NV', 36.04, -114.98, 1), P('Denver', 'CO', 39.74, -104.99, 2), P('Salt Lake City', 'UT', 40.76, -111.89, 1), P('Albuquerque', 'NM', 35.08, -106.65, 1), P('Seattle', 'WA', 47.61, -122.33, 3), P('Tacoma', 'WA', 47.25, -122.44, 1), P('Spokane', 'WA', 47.66, -117.43, 1), P('Portland', 'OR', 45.52, -122.68, 2), P('Boise', 'ID', 43.62, -116.2, 0.5), P('Anchorage', 'AK', 61.22, -149.9, 0.2), P('Honolulu', 'HI', 21.31, -157.86, 0.3), P('Billings', 'MT', 45.78, -108.5, 0.3),
  P('Charleston', 'WV', 38.35, -81.63, 0.5),
];

export const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'D.C.', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

/** Great-circle distance in miles */
export function milesBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
