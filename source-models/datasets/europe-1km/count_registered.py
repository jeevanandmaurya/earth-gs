import json, struct, pathlib, collections
ds = pathlib.Path(r'D:\\Programming\\Artificial Intelligence\\earth-gs\\source-models\\datasets\\europe-1km')
def names(path):
    out = set()
    with open(path, 'rb') as f:
        (num,) = struct.unpack('<Q', f.read(8))
        for _ in range(num):
            struct.unpack('<I', f.read(4)); f.read(32); f.read(24); struct.unpack('<I', f.read(4))
            name = b''
            while True:
                ch = f.read(1)
                if ch == b'\x00': break
                name += ch
            (npts,) = struct.unpack('<Q', f.read(8)); f.read(npts*24)
            out.add(name.decode())
    return out
reg = names(ds / 'sfm' / 'sparse' / '0' / 'images.bin')
print('registered cameras:', len(reg), 'of 720')
views = json.loads((ds / 'poses.json').read_text())['views']
count = collections.Counter(); total = collections.Counter()
for v in views:
    key = '%.0fN,%.0fE' % (v['focus'][0], v['focus'][1]); total[key] += 1
    if v['image'] in reg: count[key] += 1
for k in total: print('focus %-12s registered %3d of %d' % (k, count[k], total[k]))