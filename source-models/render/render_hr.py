import base64, json, pathlib, sys, time
from playwright.sync_api import sync_playwright

root = pathlib.Path(sys.argv[1])
N = int(sys.argv[2])
SIZE = int(sys.argv[3])
out = root / 'source-models' / 'datasets' / sys.argv[4]
(out / 'images').mkdir(parents=True, exist_ok=True)
t0 = time.time()
with sync_playwright() as p:
    # real GPU (Direct3D 11) instead of software rendering
    if sys.platform == 'win32':
        b = p.chromium.launch(channel='chrome', args=['--use-angle=d3d11', '--ignore-gpu-blocklist'])
    else:
        # Linux (Colab): bundled Chromium through Vulkan; falls back to software GL if no GPU driver
        b = p.chromium.launch(args=['--use-angle=vulkan', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': SIZE, 'height': SIZE})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    glb = sys.argv[5] if len(sys.argv) > 5 else '/source-models/nasa-earth-with-clouds.glb'
    pg.goto(f'http://127.0.0.1:8800/source-models/render/orbit.html?n={N}&size={SIZE}&glb={glb}', wait_until='load')
    pg.wait_for_function('window.ready === true', timeout=600000)
    poses, radius = [], None
    for i in range(N):
        d = pg.evaluate(f'renderView({i})')
        radius = d['radius']
        name = f'frame_{i:04d}.png'
        (out / 'images' / name).write_bytes(base64.b64decode(d['image'].split(',')[1]))
        poses.append({'image': name, 'position': d['position']})
        if i % 60 == 0:
            print(f'rendered {i + 1}/{N}  ({time.time() - t0:.0f}s)', flush=True)
    (out / 'poses.json').write_text(json.dumps({'radius_units': radius, 'size': SIZE, 'views': poses}, indent=2))
    b.close()
    print('errors:', errs or 'none')
    print('frames:', len(list((out / 'images').glob('*.png'))), '| seconds:', round(time.time() - t0))