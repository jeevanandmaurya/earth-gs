import numpy as np, pathlib, struct, json
ds = pathlib.Path(r'D:\Programming\Artificial Intelligence\earth-gs\source-models\datasets\earth-2to1-hr')
def read_images_bin(path):
    out = {}
    with open(path, 'rb') as f:
        (num,) = struct.unpack('<Q', f.read(8))
        for _ in range(num):
            struct.unpack('<I', f.read(4))
            q = np.array(struct.unpack('<4d', f.read(32)))
            t = np.array(struct.unpack('<3d', f.read(24)))
            struct.unpack('<I', f.read(4))
            name = b''
            while True:
                ch = f.read(1)
                if ch == b'\x00': break
                name += ch
            (npts,) = struct.unpack('<Q', f.read(8))
            f.read(npts * 24)
            w, x, y, z = q / np.linalg.norm(q)
            R = np.array([[1-2*(y*y+z*z), 2*(x*y-w*z), 2*(x*z+w*y)],
                          [2*(x*y+w*z), 1-2*(x*x+z*z), 2*(y*z-w*x)],
                          [2*(x*z-w*y), 2*(y*z+w*x), 1-2*(x*x+y*y)]])
            out[name.decode()] = -R.T @ t
    return out
sfm = read_images_bin(ds / 'sfm' / 'sparse' / '0' / 'images.bin')
gt = json.loads((ds / 'poses.json').read_text())
A, B = [], []
for v in gt['views']:
    if v['image'] in sfm:
        A.append(sfm[v['image']]); B.append(v['position'])
A = np.array(A); B = np.array(B)
ma, mb = A.mean(0), B.mean(0)
Ac, Bc = A - ma, B - mb
U, S, Vt = np.linalg.svd(Bc.T @ Ac / len(A))
D = np.eye(3)
if np.linalg.det(U) * np.linalg.det(Vt) < 0: D[2, 2] = -1
Rm = U @ D @ Vt
s = np.trace(np.diag(S) @ D) / (Ac ** 2).sum() * len(A)
t = mb - s * Rm @ ma
resid = B - (s * (Rm @ A.T).T + t)
print('matched cameras:', len(A), 'of', len(gt['views']), '| scale', round(float(s), 3))
print('camera residual (units): mean', round(float(np.linalg.norm(resid, axis=1).mean()), 3), 'max', round(float(np.linalg.norm(resid, axis=1).max()), 3))
np.savez(ds / 'alignment.npz', s=s, R=Rm, t=t)
print('saved alignment.npz')