// Splat chunks: one folder per place, registry/chunks/<place id>/.
// manifest.json describes the chunk. The splat file is raw .splat: 32 bytes per splat,
// little-endian: position xyz (float32 x3, metres in the chunk's local ENU frame),
// scale xyz (float32 x3, metres), colour rgba (uint8 x4), rotation (uint8 x4, not used yet).
export const SPLAT_BYTES = 32;
export const CHUNK_KEYS = ['id', 'bounds', 'ecefTransform', 'lod', 'bytes', 'hash', 'sources', 'metrics', 'configHash', 'captureTime', 'file'];

/** Returns a list of problems. An empty list means the manifest is usable. */
export function validateManifest(m) {
  if (!m || typeof m !== 'object') return ['manifest is not an object'];
  const errors = CHUNK_KEYS.filter((k) => !(k in m)).map((k) => `missing ${k}`);
  const t = m.ecefTransform;
  if (t) {
    if (!Number.isFinite(t.originLat) || Math.abs(t.originLat) > 90) errors.push('ecefTransform.originLat must be -90 to 90');
    if (!Number.isFinite(t.originLon) || Math.abs(t.originLon) > 180) errors.push('ecefTransform.originLon must be -180 to 180');
  }
  if (!Array.isArray(m.sources) || m.sources.length === 0) errors.push('sources must list at least one source');
  else if (m.sources.some((s) => !s.license || !['A', 'B', 'C', 'D', 'Hold'].includes(s.tier))) {
    errors.push('every source needs a licence and a tier');
  }
  return errors;
}

/** Reads a raw .splat buffer into typed arrays. */
export function parseSplatBuffer(buf) {
  if (buf.byteLength % SPLAT_BYTES !== 0) {
    throw new Error(`splat file is ${buf.byteLength} bytes, not a multiple of ${SPLAT_BYTES}`);
  }
  const n = buf.byteLength / SPLAT_BYTES;
  const dv = new DataView(buf);
  const positions = new Float32Array(n * 3);
  const scale3 = new Float32Array(n * 3);
  const quats = new Float32Array(n * 4);
  const colors = new Uint8Array(n * 4);
  const scales = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * SPLAT_BYTES;
    positions[i * 3] = dv.getFloat32(o, true);
    positions[i * 3 + 1] = dv.getFloat32(o + 4, true);
    positions[i * 3 + 2] = dv.getFloat32(o + 8, true);
    scale3[i * 3] = dv.getFloat32(o + 12, true);
    scale3[i * 3 + 1] = dv.getFloat32(o + 16, true);
    scale3[i * 3 + 2] = dv.getFloat32(o + 20, true);
    scales[i] = Math.max(scale3[i * 3], scale3[i * 3 + 1], scale3[i * 3 + 2]);
    colors[i * 4] = dv.getUint8(o + 24);
    colors[i * 4 + 1] = dv.getUint8(o + 25);
    colors[i * 4 + 2] = dv.getUint8(o + 26);
    colors[i * 4 + 3] = dv.getUint8(o + 27);
    // rotation is stored as (w, x, y, z), each as byte = q * 128 + 128
    for (let k = 0; k < 4; k++) quats[i * 4 + k] = (dv.getUint8(o + 28 + k) - 128) / 128;
  }
  return { count: n, positions, colors, scales, scale3, quats };
}

/**
 * Loads the chunk for a place. Returns null when the place has no chunk yet.
 * Throws if a chunk exists but is broken, so the UI can show the problem.
 */
export async function loadChunk(placeId, base = './chunks') {
  const mRes = await fetch(`${base}/${placeId}/manifest.json`, { cache: 'no-cache' });
  // Dev servers may answer unknown paths with an HTML page. Treat that as "no chunk".
  if (!mRes.ok || !(mRes.headers.get('content-type') || '').includes('json')) return null;
  const manifest = await mRes.json();
  const errors = validateManifest(manifest);
  if (errors.length) throw new Error(errors[0]);
  const sRes = await fetch(`${base}/${placeId}/${manifest.file}`);
  if (!sRes.ok) throw new Error(`splat file HTTP ${sRes.status}`);
  return { manifest, splats: parseSplatBuffer(await sRes.arrayBuffer()) };
}