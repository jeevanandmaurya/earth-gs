"""Watches a Spirula training run and publishes each new checkpoint to the globe.

Usage: watch.py ROOT RUN_DIR LOG_FILE DATASET_DIR

Writes source-models/live/earth-clouds.splat (32-byte Gaussian splats, metres from the Earth's
centre, in the globe's frame) and source-models/live/status.json.
"""
import json, os, re, sys, time, pathlib
import numpy as np

ROOT, RUN, LOG, DS = (pathlib.Path(a) for a in sys.argv[1:5])
STEP_OFFSET = int(sys.argv[5]) if len(sys.argv) > 5 else 0   # steps already trained before this run
LIVE = ROOT / 'source-models' / 'live'
EARTH_M = 6371008.8
STEP_RE = re.compile(r'step\s+(\d+)/(\d+).*?splats\s+(\d+)')
PSNR_RE = re.compile(r'psnr=([\d.]+)')

al = np.load(DS / 'alignment.npz')
S, R_AL, T = float(al['s']), al['R'], al['t']
RF = np.load(DS / 'frame.npz')['Rf']                       # render frame -> globe frame
RADIUS_GLB = json.loads((DS / 'poses.json').read_text())['radius_units']
RT = RF @ R_AL                                             # SfM frame -> globe frame (rotation only)
REC = np.dtype([('p', '<f4', 3), ('s', '<f4', 3), ('c', 'u1', 4), ('q', 'u1', 4)])
C0 = 0.28209479177387814
MAX_SIGMA_M = 190_000   # 190 km: beyond this a splat covers too much of the screen
STALL_SECONDS = 120     # no new log lines for this long means the trainer has stopped


def rot_to_quat(M):
    w = np.sqrt(max(0.0, 1 + np.trace(M))) / 2
    return np.array([w, (M[2, 1] - M[1, 2]) / (4 * w), (M[0, 2] - M[2, 0]) / (4 * w), (M[1, 0] - M[0, 1]) / (4 * w)])


QT = rot_to_quat(RT)


def read_ply(path):
    with open(path, 'rb') as f:
        header = b''
        while True:
            line = f.readline()
            if not line:
                raise EOFError('header incomplete')
            header += line
            if line.strip() == b'end_header':
                break
        props, n = [], 0
        for line in header.decode().splitlines():
            if line.startswith('element vertex'):
                n = int(line.split()[-1])
            if line.startswith('property float'):
                props.append(line.split()[-1])
        dt = np.dtype([(p, '<f4') for p in props])
        body = f.read(n * dt.itemsize)
        if len(body) != n * dt.itemsize:
            raise EOFError('file still being written')
        return np.frombuffer(body, dtype=dt, count=n)


def convert(ply_path, out_path):
    d = read_ply(ply_path)
    pos = np.stack([d['x'], d['y'], d['z']], 1).astype(np.float64)
    scl = np.exp(np.stack([d['scale_0'], d['scale_1'], d['scale_2']], 1).astype(np.float64))
    alpha = 1 / (1 + np.exp(-d['opacity'].astype(np.float64)))
    q = np.stack([d['rot_0'], d['rot_1'], d['rot_2'], d['rot_3']], 1).astype(np.float64)
    q /= np.linalg.norm(q, axis=1, keepdims=True)

    P = (RF @ (S * (R_AL @ pos.T).T + T).T).T / RADIUS_GLB   # Earth radii, globe frame
    r = np.linalg.norm(P, axis=1)
    keep = (r < 1.5) & (alpha > 0.02)
    k = EARTH_M / np.median(r[keep]) if keep.any() else 1.0   # shell median -> real radius
    # Splats wider than MAX_SIGMA_M cover much of the screen, and their overdraw stalls the GPU.
    keep = keep & (scl.max(1) * S / RADIUS_GLB * k < MAX_SIGMA_M)
    w1, x1, y1, z1 = QT
    w2, x2, y2, z2 = q[keep, 0], q[keep, 1], q[keep, 2], q[keep, 3]
    qo = np.stack([w1*w2 - x1*x2 - y1*y2 - z1*z2, w1*x2 + x1*w2 + y1*z2 - z1*y2,
                   w1*y2 - x1*z2 + y1*w2 + z1*x2, w1*z2 + x1*y2 - y1*x2 + z1*w2], 1)
    rec = np.zeros(int(keep.sum()), dtype=REC)
    rec['p'] = (P[keep] * k).astype(np.float32)
    rec['s'] = (scl[keep] * S / RADIUS_GLB * k).astype(np.float32)
    rgb = np.clip((0.5 + C0 * np.stack([d['f_dc_0'], d['f_dc_1'], d['f_dc_2']], 1)) * 255, 0, 255)
    rec['c'][:, :3] = rgb[keep].astype(np.uint8)
    rec['c'][:, 3] = np.clip(alpha[keep] * 255, 0, 255).astype(np.uint8)
    rec['q'] = np.clip(qo * 128 + 128, 0, 255).astype(np.uint8)
    tmp = out_path.with_suffix('.tmp')
    tmp.write_bytes(rec.tobytes())
    os.replace(tmp, out_path)                                # the globe never reads a half-written file
    return int(keep.sum()), k


def latest_ckpt():
    best, best_step = None, -1
    for p in RUN.glob('step-*.ckpt'):
        m = re.search(r'step-(\d+)', p.name)
        if m and int(m.group(1)) > best_step and (p / 'splat.ply').exists():
            best, best_step = p / 'splat.ply', int(m.group(1))
    return best, best_step


def log_state():
    if not LOG.exists():
        return {}
    text = LOG.read_text(errors='ignore').splitlines()
    step = total = splats = psnr = None
    for line in text:
        m = STEP_RE.search(line)
        if m:
            step, total, splats = int(m.group(1)) + STEP_OFFSET, int(m.group(2)) + STEP_OFFSET, int(m.group(3))
            pm = PSNR_RE.search(line)
            psnr = float(pm.group(1)) if pm else psnr
    done = any('Training complete' in line for line in text)
    return {'step': step, 'total': total, 'splats': splats, 'psnr': psnr, 'done': done}


def write_status(s):
    tmp = LIVE / 'status.tmp'
    tmp.write_text(json.dumps(s))
    os.replace(tmp, LIVE / 'status.json')


def main():
    LIVE.mkdir(parents=True, exist_ok=True)
    version, converted, published = 0, -1, None
    print('watching', RUN, flush=True)
    while True:
        st = log_state()
        ply, step = latest_ckpt()
        if ply is not None and step != converted:
            try:
                n, k = convert(ply, LIVE / 'earth-clouds.splat')
                version += 1
                converted, published = step, n
                print(f'published step {step}: {n} splats, shell scale {k:.4f} (version {version})', flush=True)
            except (EOFError, ValueError) as e:
                print('waiting:', e, flush=True)
        stalled = LOG.exists() and time.time() - LOG.stat().st_mtime > STALL_SECONDS
        if st.get('done'):
            state = 'done'
        elif stalled and st.get('step'):
            state = 'stopped'
        else:
            state = 'training' if st.get('step') else 'starting'
        st.update({'version': version, 'converted_step': converted, 'published_splats': published,
                   'updated': time.time(), 'state': state})
        write_status(st)
        if st.get('done') and converted == step:
            print('training finished; last checkpoint published', flush=True)
            break
        time.sleep(2)


if __name__ == '__main__':
    main()