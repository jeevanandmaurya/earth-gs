import base64, json, pathlib, sys, time
from playwright.sync_api import sync_playwright
DS = pathlib.Path(r'D:\\Programming\\Artificial Intelligence\\earth-gs-data\\datasets\\europe-1km')
FOCUS = '43,-2;43,22;43,42;52,-2;52,22;52,42;61,-2;61,22;61,42'
PER = 80
N = PER * 9
t0 = time.time()
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', args=['--use-angle=d3d11', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 2048, 'height': 2048})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    url = 'http://127.0.0.1:8800/source-models/render/patch.html?size=2048&per=' + str(PER) + '&alt_km=2700&tilt_deg=25&glb=/source-models/regions/europe/europe_patch.glb&focus=' + FOCUS
    pg.goto(url, wait_until='load')
    pg.wait_for_function('window.ready === true', timeout=600000)
    print('views to render:', N, flush=True)
    poses = []
    for i in range(N):
        d = pg.evaluate('renderView(' + str(i) + ')')
        name = 'frame_%04d.png' % i
        (DS / 'images' / name).write_bytes(base64.b64decode(d['image'].split(',')[1]))
        poses.append({'image': name, 'position': d['position'], 'focus': d['focus'], 'target': d['target']})
        if (i + 1) % 40 == 0 or i == 0:
            print('[%d/%d] rendered  (%d s)' % (i + 1, N, time.time() - t0), flush=True)
    (DS / 'poses.json').write_text(json.dumps({'radius_units': 500.0, 'alt_km': 2700, 'views': poses}, indent=2))
    b.close()
    print('errors:', errs or 'none', flush=True)
    print('FINISHED', N, 'views in', round(time.time() - t0), 's', flush=True)