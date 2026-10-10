// Encodes Gaussian splats as a standard 3D Gaussian Splatting PLY, the format PlayCanvas loads.
// Input units: positions and scales in scene units (1 = Earth radius), colours 0..1, alpha 0..1.

const C0 = 0.28209479177387814;

export function encodePly({ positions, scales, quats, colors }) {
  const n = positions.length / 3;
  const props = [
    'x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity',
    'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3',
  ];
  const header =
    'ply\nformat binary_little_endian 1.0\n' +
    `element vertex ${n}\n` +
    props.map((p) => `property float ${p}\n`).join('') +
    'end_header\n';
  const headerBytes = new TextEncoder().encode(header);
  const body = new Float32Array(n * props.length); // aligned on its own; copied in after the header
  const f = body;
  for (let i = 0; i < n; i++) {
    const o = i * props.length;
    f[o] = positions[i * 3];
    f[o + 1] = positions[i * 3 + 1];
    f[o + 2] = positions[i * 3 + 2];
    for (let k = 0; k < 3; k++) f[o + 3 + k] = (colors[i * 4 + k] - 0.5) / C0;
    const a = Math.min(1 - 1e-4, Math.max(1e-4, colors[i * 4 + 3]));
    f[o + 6] = Math.log(a / (1 - a));
    for (let k = 0; k < 3; k++) f[o + 7 + k] = Math.log(Math.max(scales[i * 3 + k], 1e-12));
    const w = quats[i * 4], x = quats[i * 4 + 1], y = quats[i * 4 + 2], z = quats[i * 4 + 3];
    const l = Math.hypot(w, x, y, z) || 1;
    f[o + 10] = w / l;
    f[o + 11] = x / l;
    f[o + 12] = y / l;
    f[o + 13] = z / l;
  }
  const buf = new ArrayBuffer(headerBytes.length + body.byteLength);
  new Uint8Array(buf).set(headerBytes, 0);
  new Uint8Array(buf).set(new Uint8Array(body.buffer), headerBytes.length);
  return buf;
}