export const STATUS = {
  ready: { label: 'ready', color: '#8fd3a6' },
  training: { label: 'training', color: '#6fc3ff' },
  queued: { label: 'queued', color: '#c9b68e' },
  'needs capture': { label: 'needs capture', color: '#e8745e' },
};

/** Display status: "ready" once every target detail level is reached, otherwise the registry status. */
export function statusOf(p) {
  if (p.targetLOD > 0 && p.achievedLOD >= p.targetLOD) return 'ready';
  return p.status in STATUS ? p.status : 'queued';
}

export function isValidPlace(p) {
  return (
    p &&
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    Number.isFinite(p.lat) &&
    Math.abs(p.lat) <= 90 &&
    Number.isFinite(p.lon) &&
    Math.abs(p.lon) <= 180
  );
}

/** Loads registry/places.json. Entries without valid coordinates are dropped (rule 2: real coordinates or it doesn't ship). */
export async function loadPlaces(url = './places.json') {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`places.json: HTTP ${res.status}`);
  const raw = await res.json();
  if (!Array.isArray(raw)) throw new Error('places.json must contain an array');
  const valid = raw.filter(isValidPlace);
  if (valid.length < raw.length) {
    console.warn(`earth-gs: dropped ${raw.length - valid.length} place(s) with invalid coordinates`);
  }
  return valid;
}

export function defaultPlace(places) {
  return [...places].sort((a, b) => b.achievedLOD - a.achievedLOD)[0] ?? null;
}

export function fmtCoord(v, pos, neg) {
  return `${Math.abs(v).toFixed(4)}°${v >= 0 ? pos : neg}`;
}

export function fmtDate(iso) {
  return iso ? iso.slice(0, 10) : '—';
}

export function fmtUTC(date) {
  return `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

/** Distance in metric or imperial units. */
export function fmtDistance(m, units = 'metric') {
  if (units === 'imperial') {
    const ft = m * 3.28084;
    return ft >= 5280 ? `${(m / 1609.344).toFixed(2)} mi` : `${ft.toFixed(0)} ft`;
  }
  return m >= 1000 ? `${(m / 1000).toFixed(3)} km` : `${m.toFixed(1)} m`;
}