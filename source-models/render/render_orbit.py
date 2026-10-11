import base64, json, pathlib, sys
from playwright.sync_api import sync_playwright

N = int(sys.argv[1]) if len(sys.argv) > 1 else 120
root = pathlib.Path(sys.argv[2])
out = root / 'source-models' / 'datasets' / 'earth-clouds'
(out / 'images').mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1024, 'height': 1024})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'http://127.0.0.1:8800/source-models/render/orbit.html?n={N}', wait_until='load')
    pg.wait_for_function('window.ready === true', timeout=600000)
    poses = []
    radius = None
    for i in range(N):
        d = pg.evaluate(f'renderView({i})')
        radius = d['radius']
        name = f'frame_{i:04d}.png'
        (out / 'images' / name).write_bytes(base64.b64decode(d['image'].split(',')[1]))
        poses.append({'image': name, 'position': d['position']})
        if i % 20 == 0:
            print(f'rendered {i + 1}/{N}', flush=True)
    (out / 'poses.json').write_text(json.dumps({'radius_units': radius, 'views': poses}, indent=2))
    b.close()
    print('errors:', errs or 'none')
    print('images:', len(list((out / 'images').glob('*.png'))))