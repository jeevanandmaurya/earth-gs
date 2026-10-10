"""Converts a 32-byte .splat (metres, globe frame) into a standard 3DGS PLY that PlayCanvas loads.
Positions and scales are in Earth radii (1 unit = Earth radius), as the globe scene uses."""
import sys, pathlib, numpy as np
EARTH_M = 6371008.8
src = pathlib.Path(sys.argv[1]); dst = pathlib.Path(sys.argv[2])
rec = np.frombuffer(src.read_bytes(), dtype=np.dtype([('p','<f4',3),('s','<f4',3),('c','u1',4),('q','u1',4)]))
n = len(rec)
p = rec['p'].astype(np.float64) / EARTH_M
s = np.maximum(rec['s'].astype(np.float64) / EARTH_M, 1e-9)
c = rec['c'].astype(np.float64) / 255.0
C0 = 0.28209479177387814
f_dc = (c[:, :3] - 0.5) / C0
a = np.clip(c[:, 3], 1e-4, 1 - 1e-4)
opacity = np.log(a / (1 - a))
q = (rec['q'].astype(np.float64) - 128) / 128.0
q /= np.linalg.norm(q, axis=1, keepdims=True)
props = ['x','y','z','f_dc_0','f_dc_1','f_dc_2','opacity','scale_0','scale_1','scale_2','rot_0','rot_1','rot_2','rot_3']
data = np.zeros((n, len(props)), dtype='<f4')
data[:, 0:3] = p
data[:, 3:6] = f_dc
data[:, 6] = opacity
data[:, 7:10] = np.log(s)
data[:, 10:14] = q
header = 'ply\nformat binary_little_endian 1.0\nelement vertex %d\n' % n + ''.join('property float %s\n' % k for k in props) + 'end_header\n'
dst.write_bytes(header.encode('ascii') + data.tobytes())
print('wrote', dst.name, n, 'splats,', round(dst.stat().st_size / 1e6, 1), 'MB')