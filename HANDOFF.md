# earth-gs handoff (for a new chat)

Project root: D:\Programming\Artificial Intelligence\earth-gs
Plan: plan.md (renderer = PlayCanvas, data rules, licence tiers A/B/C/D/Hold).

## User preferences (follow these)
- Keep the dev server running (http://127.0.0.1:5173/index.html) and check changes in the browser before reporting.
- Long jobs (downloads, training) run in a visible terminal window with progress.
- Do not make unnecessary decisions; ask when a choice matters.
- Back up rather than delete when asked to "backup".
- Keep the browser globe page light while training runs (earlier GPU driver resets under load).
- Show progress for training (status line on the globe) and live splat updates.

## Web app (web/)
- Vite multi-page: index.html (Globe), docs.html, settings.html. Shared shell in src/shell.js.
- src/globe.js: PlayCanvas renderer (pinned playcanvas 2.23.2). Gaussian splat layers: global Earth, place chunks, stand-in proxy. Mouse: left drag spins globe, right/shift drag tilts, wheel zooms toward cursor. Zoomed out (>1600 km) orbits Earth centre.
- src/geo.js (plain arrays), src/ply.js (encodes standard 3DGS PLY), src/chunks.js (.splat reader, manifest check), src/lod.js (view LOD 0-5 by km), src/ui.js, src/main.js (state, polling, time bar, share link).
- Live training output: /live/ route (vite plugin) serves source-models/live/ (earth-clouds.splat, status.json).
- Tests: npm test in web/ (16 passing). Build: npx vite build.
- package.json: astronomy-engine, lucide, playcanvas (deps); three + vite (dev).

## Known issues in web app
- Time bar (TIME pill) is blocked by the training status panel (bottom-left overlaps the toggle). Planned fix: move the training status to the top-left under the coordinate readout (top ~52px). NOT applied yet.
- Globe FPS is low while training uses the GPU (about 8 fps); 120-144 fps when idle.
- Brightness: splat colours are about 57 levels brighter than the source map on average (colour-space mismatch suspected; frames/training not yet checked).
- Old cloud model (not used now) had a latitude mismatch.

## Splat pipeline
- Source model now: source-models/earth-bluemarble-2to1.glb (built by source-models/build_globe_glb.py) using source-models/bluemarble_2to1.jpg (NASA Blue Marble, cloud-free, 4096x2048; verified at 9 known places). Geometry and UVs use the globe's latitude/longitude convention (frame = identity).
- Dataset in use: source-models/datasets/earth-2to1-hr (480 frames 2048px unlit, SfM 480/480 0.34 px, alignment residual 0.36 units, training run1 finished 12000 steps, 1,000,000-splat cap, PSNR 44.6). Final checkpoint published (757,778 splats shown).
- Older datasets moved to source-models/_backup_old_datasets (earth-clouds, earth-hr, earth-noclouds-hr, earth-flat-hr).
- Pipeline: render (source-models/render/orbit.html + render_hr.py, unlit) -> Spirula SfM (sfm auto) -> align.py (similarity to render poses) + frame.npz -> Spirula train centered-object -> watch.py (converts checkpoint PLY to app .splat, status.json). Watcher is NOT auto-started; restart it when training runs (args: ROOT RUN_DIR LOG DATASET_DIR [STEP_OFFSET]).
- Spirula CLI: D:\Downloads\spirula-2026.9.30-windows-vulkan-x86_64\spirula.exe. Flags used: --num-iterations, --cap-max, --steps-per-save, --disable-viewer 1, --init-ply (warm start; no optimizer resume).
- Accuracy measured: current splats align with the source map within about 1 degree (zero-shift correlation 0.89, 52k opaque splats).

## Satellite / imagery work
- Sentinel-2 via Earth Search STAC (open, no key): https://earth-search.aws.element84.com/v1/search (collection sentinel-2-l2a; props eo:cloud_cover, view:sun_elevation; sortby needs field "properties.eo:cloud_cover"; tile id is in scene id, e.g. S2B_32TQM_...).
- Test crop: source-models/satellite/colosseum/colosseum_true_colour_crop.png (+ PROVENANCE.json).
- Europe 100 m attempt: source-models/satellite/europe-100m/index.json (1077 tiles, clearest daytime scene per tile). Downloaded tiles are WRONG (UTM squares not reprojected, about 80% black). Needs rewrite: reproject to EPSG:4326, mask nodata, fill gaps from other scenes, mosaic, JPEG output. Downloader was stopped; 251 bad tiles remain in tiles/.
- NASA ISS (GAPE) photo API key requested but NOT received yet. Filter idea: sun elevation > 0 and cloud cover <= 10%.
- Blue Marble 1 km: NASA GIBS WMS works (layer BlueMarble_NextGeneration, native 500 m). Test: source-models/bluemarble-1km/test_med_1km.jpg (southern Europe, 4200x1300, complete, places correct). Full 1 km globe not built yet (plan: blocks via WMS GetMap, verify, then use as the Space/Sky level texture).

## Regions and countries (decided)
- Seven continental regions: North America (with Central America and Greenland), South America, Europe, Africa, Asia, Australia, Antarctica (Antarctica left out for now).
- Oceans: one global layer. Big islands get their own chunks (Madagascar, Japan, New Zealand); small islands go with the ocean layer.
- Boundaries: use real country borders (Natural Earth, public domain). Russia split at the Urals, approximated by the 60 E meridian (say so in output).
- Priority: 100 m for every continent first, then finer detail country by country.
- Start with Europe (Italy/Colosseum is the test site).

## Context for resolution questions
- Earth surface area ~510 million km2. Globe uses mean radius 6371 km.
- At 1 km: about 510 M pixels for the whole Earth (about 1.5-2.4 GB raw).
- Current globe: about 10 km per pixel.

## Open next steps (in order, unless the user says otherwise)
1. Decide: build the full 1 km Blue Marble globe (blocks), verify, and use as the Space/Sky texture.
2. Fix the time-bar overlap (move training status panel) and verify the time bar in the browser.
3. Rewrite the Europe Sentinel-2 download (reproject, mask, fill gaps, mosaic) and run it in a visible terminal.
4. Country and region split using Natural Earth borders.
5. Later: auto-start the watcher from the dev server, check splat brightness vs map, ISS filtering once the API key arrives.