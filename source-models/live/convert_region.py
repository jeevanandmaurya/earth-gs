"""Convert one regional training checkpoint (3DGS PLY) to the app's 32-byte .splat, in the globe frame.

Usage: convert_region.py DATASET_DIR CHECKPOINT_PLY OUT_SPLAT
Positions go through the alignment (SfM -> render frame), the render frame is the globe frame
(identity), and the result is in metres from the Earth's centre.
"""
import json, os, sys, pathlib
import numpy as np
DS = pathlib.Path(sys.argv[1]); PLY = pathlib.Path(sys.argv[2]); OUT = pathlib.Path(sys.argv[3])
EARTH_M = 6371008.8
al = np.load(DS / 'alignment.npz')
S, R_AL, T = float(al['s']), al['R'], al['t']
RADIUS_GLB = json.loads((DS / 'poses.json').read_text())['radius_units']
REC = np.dtype([('p', '<f4', 3), ('s', '<f4', 3), ('c', 'u1', 4), ('q', 'u1', 4)])
C0 = 0.28209479177387814
def rot_to_quat(M):
    w = np.sqrt(max(0.0, 1 + np.trace(M))) / 2
    return np.array([w, (M[2,1]-M[1,2])/(4*w), (M[0,2]-M[2,0])/(4*w), (M[1,0]-M[0,1])/(4*w)])
QR = rot_to_quat(R_AL)
with open(PLY, 'rb') as f:
    header = b''
    while True:
        line = f.readline(); header += line
        if line.strip() == b'end_header': break
    props, n = [], 0
    for line in header.decode().splitlines():
        if line.startswith('element vertex'): n = int(line.split()[-1])
        if line.startswith('property float'): props.append(line.split()[-1])
    dt = np.dtype([(p, '<f4') for p in props])
    d = np.frombuffer(f.read(n * dt.itemsize), dtype=dt, count=n)
pos = np.stack([d['x'], d['y'], d['z']], 1).astype(np.float64)
scl = np.exp(np.stack([d['scale_0'], d['scale_1'], d['scale_2']], 1).astype(np.float64))
alpha = 1 / (1 + np.exp(-d['opacity'].astype(np.float64)))
q = np.stack([d['rot_0'], d['rot_1'], d['rot_2'], d['rot_3']], 1).astype(np.float64)
q /= np.linalg.norm(q, axis=1, keepdims=True)
P = (S * (R_AL @ pos.T).T + T) / RADIUS_GLB
r = np.linalg.norm(P, axis=1)
keep = (r < 1.5) & (alpha > 0.02)
k = EARTH_M / np.median(r[keep]) if keep.any() else 1.0
sig = scl.max(1) * S / RADIUS_GLB * k
keep = keep & (sig < 190_000)
w1, x1, y1, z1 = QR
w2, x2, y2, z2 = q[keep, 0], q[keep, 1], q[keep, 2], q[keep, 3]
qo = np.stack([w1*w2 - x1*x2 - y1*y2 - z1*z2, w1*x2 + x1*w2 + y1*z2 - z1*y2, w1*y2 - x1*z2 + y1*w2 + z1*x2, w1*z2 + x1*y2 - y1*x2 + z1*w2], 1)
rec = np.zeros(int(keep.sum()), dtype=REC)
rec['p'] = (P[keep] * k).astype(np.float32)
rec['s'] = (scl[keep] * S / RADIUS_GLB * k).astype(np.float32)
rgb = np.clip((0.5 + C0 * np.stack([d['f_dc_0'], d['f_dc_1'], d['f_dc_2']], 1)) * 255, 0, 255)
rec['c'][:, :3] = rgb[keep].astype(np.uint8)
rec['c'][:, 3] = np.clip(alpha[keep] * 255, 0, 255).astype(np.uint8)
rec['q'] = np.clip(qo * 128 + 128, 0, 255).astype(np.uint8)
tmp = OUT.with_suffix('.tmp'); tmp.write_bytes(rec.tobytes()); os.replace(tmp, OUT)
print('wrote', OUT.name, int(keep.sum()), 'splats from', n, '| shell scale', round(k, 1))