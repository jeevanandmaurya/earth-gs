import * as Astronomy from 'astronomy-engine';

// Coordinates, frames and sky positions as plain arrays [x, y, z]. One scene unit = one Earth radius.
export const DEG = Math.PI / 180;
export const EARTH_RADIUS_M = 6371008.8; // mean Earth radius

export function wrapLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

export const vecSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vecDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vecLen = (a) => Math.hypot(a[0], a[1], a[2]);
export const vecNorm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Latitude/longitude (degrees) to a point on a sphere. Texture convention: u = (lon+180)/360, north at top. */
export function latLonToVec(lat, lon, radius = 1) {
  const phi = (lon + 180) * DEG;
  const theta = (90 - lat) * DEG;
  const s = Math.sin(theta);
  return [-Math.cos(phi) * s * radius, Math.cos(theta) * radius, Math.sin(phi) * s * radius];
}

/** Inverse of latLonToVec. */
export function vecToLatLon(v) {
  const n = vecNorm(v);
  const lat = Math.asin(Math.max(-1, Math.min(1, n[1]))) / DEG;
  const lon = wrapLon(Math.atan2(n[2], -n[0]) / DEG - 180);
  return { lat, lon };
}

/** Local unit vectors at a surface point: up, east (increasing lon), north (increasing lat). */
export function frameAt(lat, lon) {
  const d = 0.001;
  const up = latLonToVec(lat, lon, 1);
  const east = vecNorm(vecSub(latLonToVec(lat, lon + d, 1), latLonToVec(lat, lon - d, 1)));
  const north = vecNorm(vecSub(latLonToVec(lat + d, lon, 1), latLonToVec(lat - d, lon, 1)));
  return { up: vecNorm(up), east, north };
}

/** Great-circle distance in metres between two {lat, lon} points (haversine). */
export function greatCircleMeters(a, b) {
  const p1 = a.lat * DEG;
  const p2 = b.lat * DEG;
  const dp = (b.lat - a.lat) * DEG;
  const dl = (b.lon - a.lon) * DEG;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Sun and Moon sub-points for one UTC instant. A body's sub-point is the place where it is
 * overhead: latitude = declination, longitude = RA minus Greenwich apparent sidereal time.
 */
export function skyAt(date) {
  const time = Astronomy.MakeTime(date);
  const observer = new Astronomy.Observer(0, 0, 0);
  const gastDeg = Astronomy.SiderealTime(time) * 15;
  const subPoint = (body) => {
    const eq = Astronomy.Equator(body, time, observer, true, true);
    return { lat: eq.dec, lon: wrapLon(eq.ra * 15 - gastDeg) };
  };
  return { date, gastDeg, sun: subPoint('Sun'), moon: subPoint('Moon') };
}

/** Altitude in degrees of a body (sub-point) above the horizon at a site. */
export function bodyElevation(lat, lon, body) {
  const s =
    Math.sin(lat * DEG) * Math.sin(body.lat * DEG) +
    Math.cos(lat * DEG) * Math.cos(body.lat * DEG) * Math.cos((lon - body.lon) * DEG);
  return Math.asin(Math.max(-1, Math.min(1, s))) / DEG;
}

/** Longitude of a star's sub-point for the current sidereal time. */
export function starLon(raHours, gastDeg) {
  return wrapLon(raHours * 15 - gastDeg);
}