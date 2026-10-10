// View levels of detail. The level follows the eye altitude above the surface, in metres.
// These are view levels. The place LOD (0 to 4) in the registry is the data quality of a place.
export const VIEW_LODS = [
  { level: 0, name: 'Space', minM: 1_000_000, range: '1,000 km and above', sees: 'The whole Earth, drawn from the basemap.' },
  { level: 1, name: 'Sky', minM: 100_000, range: '100 km to 1,000 km', sees: 'Continents, coastlines and weather systems.' },
  { level: 2, name: 'Air', minM: 10_000, range: '10 km to 100 km', sees: 'Regions. Airliners fly at about 10 km.' },
  { level: 3, name: 'City', minM: 1_000, range: '1 km to 10 km', sees: 'Whole cities and their skylines.' },
  { level: 4, name: 'Tower', minM: 100, range: '100 m to 1 km', sees: 'A single tower or block. The Burj Khalifa is 828 m tall.' },
  { level: 5, name: 'Street', minM: 0, range: 'below 100 m', sees: 'Streets, facades and people-scale detail.' },
];

/** The view level for an eye altitude in metres. */
export function lodForAltitude(altM) {
  return VIEW_LODS.find((l) => altM >= l.minM) ?? VIEW_LODS[VIEW_LODS.length - 1];
}