import json, struct, pathlib
import numpy as np
root = pathlib.Path(__file__).resolve().parent
img_bytes = (root / 'bluemarble_2to1.jpg').read_bytes()
R = 500.0
LAT_N, LON_N = 360, 720            # grid resolution (degrees per cell: 0.5 lat, 0.5 lon)
lat = np.linspace(90, -90, LAT_N + 1)          # top (north) first, matching the image rows
lon = np.linspace(-180, 180, LON_N + 1)
LA, LO = np.meshgrid(lat, lon, indexing='ij')
la, lo = np.radians(LA), np.radians(LO)
# same convention as the globe's latLonToVec: phi = lon + 180, theta = 90 - lat
phi = lo + np.pi; theta = np.pi / 2 - la
pos = np.stack([-np.cos(phi) * np.sin(theta), np.cos(theta), np.sin(phi) * np.sin(theta)], -1) * R
uv = np.stack([(LO + 180) / 360, (90 - LA) / 180], -1)   # glTF: v = 0 at the top of the image
pos = pos.reshape(-1, 3).astype('<f4')
uv = uv.reshape(-1, 2).astype('<f4')
idx = []
for i in range(LAT_N):
    for j in range(LON_N):
        a = i * (LON_N + 1) + j; b = a + LON_N + 1
        idx += [a, b, a + 1, a + 1, b, b + 1]
idx = np.array(idx, dtype='<u4')
# binary buffer: indices, positions, uvs, image
def pad(b, n=4):
    return b + b'\x00' * ((n - len(b) % n) % n)
chunks = []; views = []; accs = []
def add_view(data, target=None):
    off = sum(len(c) for c in chunks)
    chunks.append(pad(data))
    v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
    if target: v['target'] = target
    views.append(v); return len(views) - 1
vi = add_view(idx.tobytes(), 34963)
vp = add_view(pos.tobytes(), 34962)
vu = add_view(uv.tobytes(), 34962)
vimg = add_view(img_bytes)
accs.append({'bufferView': vi, 'componentType': 5125, 'count': int(idx.size), 'type': 'SCALAR', 'max': [int(idx.max())], 'min': [int(idx.min())]})
accs.append({'bufferView': vp, 'componentType': 5126, 'count': int(pos.shape[0]), 'type': 'VEC3', 'max': pos.max(0).tolist(), 'min': pos.min(0).tolist()})
accs.append({'bufferView': vu, 'componentType': 5126, 'count': int(uv.shape[0]), 'type': 'VEC2', 'max': uv.max(0).tolist(), 'min': uv.min(0).tolist()})
binary = b''.join(chunks)
gltf = {
  'asset': {'version': '2.0', 'generator': 'earth-gs build_globe_glb.py (NASA Blue Marble, cloud-free, 2:1)'},
  'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0}],
  'meshes': [{'primitives': [{'attributes': {'POSITION': 1, 'TEXCOORD_0': 2}, 'indices': 0, 'material': 0, 'mode': 4}]}],
  'materials': [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0.0, 'roughnessFactor': 1.0}, 'doubleSided': False}],
  'textures': [{'source': 0}], 'images': [{'bufferView': vimg, 'mimeType': 'image/jpeg'}],
  'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(binary)}],
}
js = json.dumps(gltf, separators=(',', ':')).encode()
js += b' ' * ((4 - len(js) % 4) % 4)
total = 12 + 8 + len(js) + 8 + len(binary)
out = root / 'earth-bluemarble-2to1.glb'
with open(out, 'wb') as f:
    f.write(struct.pack('<4sII', b'glTF', 2, total))
    f.write(struct.pack('<I4s', len(js), b'JSON') + js)
    f.write(struct.pack('<I4s', len(binary), b'BIN\x00') + binary)
print('wrote', out.name, round(out.stat().st_size / 1e6, 1), 'MB | vertices', pos.shape[0], '| triangles', idx.size // 3)