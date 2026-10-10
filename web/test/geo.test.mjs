import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  latLonToVec, vecToLatLon, greatCircleMeters, skyAt, bodyElevation, frameAt, wrapLon, vecDot, vecLen,
} from '../src/geo.js';
import { statusOf, isValidPlace, defaultPlace, fmtDistance } from '../src/data.js';
import { lodForAltitude } from '../src/lod.js';
import { parseSplatBuffer, validateManifest, SPLAT_BYTES } from '../src/chunks.js';
import { encodePly } from '../src/ply.js';

const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('latLonToVec and vecToLatLon round-trip', () => {
  for (const [lat, lon] of [[0, 0], [41.8902, 12.4922], [-22.9519, -43.2105], [-89, 170], [60, -179.5]]) {
    const back = vecToLatLon(latLonToVec(lat, lon, 1));
    close(back.lat, lat, 1e-9, `lat for ${lat},${lon}`);
    close(wrapLon(back.lon - lon), 0, 1e-9, `lon for ${lat},${lon}`);
  }
});

test('coordinates match three.js SphereGeometry UVs, so a texture lines up', () => {
  const geo = new THREE.SphereGeometry(1, 48, 32);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  let worst = 0;
  for (let i = 0; i < pos.count; i++) {
    const v = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const lat = 90 - (1 - uv.getY(i)) * 180;
    const lon = uv.getX(i) * 360 - 180;
    worst = Math.max(worst, dist(latLonToVec(lat, lon, 1), v));
  }
  assert.ok(worst < 1e-5, `max vertex mismatch ${worst}`);
});

test('great-circle distance: known values', () => {
  close(greatCircleMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 90 }), (2 * Math.PI * 6371008.8) / 4, 1, 'quarter equator');
  const d = greatCircleMeters({ lat: 41.8902, lon: 12.4922 }, { lat: 26.8467, lon: 80.9462 });
  assert.ok(d > 6.25e6 && d < 6.4e6, `Rome-Lucknow ${d}`);
  assert.equal(greatCircleMeters({ lat: 10, lon: 10 }, { lat: 10, lon: 10 }), 0);
});

test('sun sub-point at June solstice noon UTC is near the Tropic of Cancer', () => {
  const sky = skyAt(new Date(Date.UTC(2026, 5, 21, 12, 0, 0)));
  close(sky.sun.lat, 23.44, 0.5, 'solstice declination');
  close(sky.sun.lon, 0, 2, 'subsolar lon at 12 UTC');
});

test('sun sub-point moves west: at 06:00 UTC it is near lon +90', () => {
  const sky = skyAt(new Date(Date.UTC(2026, 2, 20, 6, 0, 0)));
  close(sky.sun.lon, 90, 3, 'subsolar lon at 06 UTC');
  close(sky.sun.lat, 0, 1.5, 'equinox declination');
});

test('sunlit places have positive elevation, antipodes negative', () => {
  const sky = skyAt(new Date(Date.UTC(2026, 2, 20, 12, 0, 0)));
  assert.ok(bodyElevation(sky.sun.lat, sky.sun.lon, sky.sun) > 89.9, 'directly under the sun');
  assert.ok(bodyElevation(-sky.sun.lat, wrapLon(sky.sun.lon + 180), sky.sun) < -89.9, 'antipode');
});

test('frameAt gives orthonormal east, north, up', () => {
  const { up, east, north } = frameAt(35, -20);
  close(vecLen(up), 1, 1e-9, 'up unit');
  close(vecLen(east), 1, 1e-9, 'east unit');
  close(vecLen(north), 1, 1e-9, 'north unit');
  close(vecDot(up, east), 0, 1e-6, 'up.east');
  close(vecDot(up, north), 0, 1e-6, 'up.north');
  close(vecDot(east, north), 0, 1e-6, 'east.north');
  assert.ok(north[1] > 0, 'north points toward +y at mid latitudes');
});

test('status: ready only when all target levels are reached', () => {
  assert.equal(statusOf({ status: 'training', achievedLOD: 1, targetLOD: 4 }), 'training');
  assert.equal(statusOf({ status: 'training', achievedLOD: 4, targetLOD: 4 }), 'ready');
  assert.equal(statusOf({ status: 'weird', achievedLOD: 0, targetLOD: 4 }), 'queued');
});

test('places need finite, in-range coordinates', () => {
  assert.equal(isValidPlace({ id: 'a', name: 'A', lat: 10, lon: 20 }), true);
  assert.equal(isValidPlace({ id: 'a', name: 'A', lat: 91, lon: 20 }), false);
  assert.equal(isValidPlace({ id: 'a', name: 'A', lat: 10, lon: NaN }), false);
});

test('default place is the one with the most detail', () => {
  assert.equal(defaultPlace([{ id: 'x', achievedLOD: 0 }, { id: 'y', achievedLOD: 2 }]).id, 'y');
});

test('distance formatting: metric and imperial', () => {
  assert.equal(fmtDistance(827.5, 'metric'), '827.5 m');
  assert.equal(fmtDistance(2328287, 'metric'), '2328.287 km');
  assert.equal(fmtDistance(100, 'imperial'), '328 ft');
  assert.equal(fmtDistance(1609.344 * 10, 'imperial'), '10.00 mi');
});

test('view LOD follows the eye altitude in metres', () => {
  assert.equal(lodForAltitude(9_000_000).level, 0, 'space');
  assert.equal(lodForAltitude(500_000).level, 1, 'sky');
  assert.equal(lodForAltitude(50_000).level, 2, 'air');
  assert.equal(lodForAltitude(5_000).level, 3, 'city');
  assert.equal(lodForAltitude(900).level, 4, 'tower (default fly-to height)');
  assert.equal(lodForAltitude(50).level, 5, 'street');
});

test('.splat reader: positions, scale per axis, colour and rotation', () => {
  const buf = new ArrayBuffer(SPLAT_BYTES * 2);
  const dv = new DataView(buf);
  [1, 2, 3, 0.1, 0.4, 0.2].forEach((v, i) => dv.setFloat32(i * 4, v, true));
  [255, 128, 0, 255].forEach((v, i) => dv.setUint8(24 + i, v));
  [128, 128, 128, 255].forEach((v, i) => dv.setUint8(28 + i, v));
  const o = SPLAT_BYTES;
  [-5, 0, 7].forEach((v, i) => dv.setFloat32(o + i * 4, v, true));
  const s = parseSplatBuffer(buf);
  assert.equal(s.count, 2);
  assert.deepEqual([...s.positions.slice(0, 3)], [1, 2, 3]);
  assert.deepEqual([...s.positions.slice(3, 6)], [-5, 0, 7]);
  assert.equal(s.scales[0], Math.fround(0.4), 'largest axis');
  assert.deepEqual([...s.scale3.slice(0, 3)].map((v) => Math.round(v * 1e6) / 1e6), [0.1, 0.4, 0.2]);
  assert.deepEqual([...s.colors.slice(0, 4)], [255, 128, 0, 255]);
  close(s.quats[0], 0, 1e-9, 'w');
});

test('.splat reader rejects a file that is not whole records', () => {
  assert.throws(() => parseSplatBuffer(new ArrayBuffer(33)), /multiple of 32/);
});

test('chunk manifest: required keys, origin range and licences', () => {
  const good = {
    id: 'x', bounds: {}, ecefTransform: { originLat: 41.89, originLon: 12.49 }, lod: 1, bytes: 1, hash: 'h',
    sources: [{ uri: 'u', license: 'CC BY 4.0', tier: 'A' }], metrics: {}, configHash: 'c', captureTime: null, file: 'splats.splat',
  };
  assert.deepEqual(validateManifest(good), []);
  const noFile = { ...good };
  delete noFile.file;
  assert.ok(validateManifest(noFile).some((e) => e.includes('file')), 'missing file is reported');
  assert.ok(validateManifest({ ...good, ecefTransform: { originLat: 95, originLon: 0 } }).some((e) => e.includes('originLat')));
  assert.ok(validateManifest({ ...good, sources: [{ uri: 'u', tier: 'Hold' }] }).some((e) => e.includes('licence')));
});

test('PLY encoder: header and record count match, opacity is logit, scale is log', () => {
  const positions = new Float32Array([0.5, 0, 0, 0, 1, 0]);
  const scales = new Float32Array([0.01, 0.01, 0.01, 0.02, 0.02, 0.02]);
  const quats = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0]);
  const colors = new Float32Array([1, 0.5, 0, 0.5, 0, 0, 1, 1]);
  const buf = encodePly({ positions, scales, quats, colors });
  const text = new TextDecoder().decode(new Uint8Array(buf));
  assert.ok(text.includes('element vertex 2'));
  const header = text.slice(0, text.indexOf('end_header\n') + 11);
  const headerLen = new TextEncoder().encode(header).length;
  const dv = new DataView(buf);
  const at = (i) => dv.getFloat32(headerLen + i * 4, true);
  close(at(0), 0.5, 1e-6, 'x of splat 0');
  close(at(6), 0, 1e-5, 'opacity 0.5 is logit 0');
  close(at(7), Math.log(0.01), 1e-5, 'log scale');
});