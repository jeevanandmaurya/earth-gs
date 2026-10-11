# earth-gs

`earth-gs` is an open-source Earth visualization and Gaussian-splat pipeline project.  
It combines a browser globe viewer (`web/`) with data, pipeline, and tooling folders used to prepare and stream georegistered place chunks.

## Repository structure

- `web/` — Vite + PlayCanvas web app (globe, docs, settings pages)
- `pipeline/` — Python pipeline scripts and tests
- `worker/` — worker client utilities
- `registry/` — place/region registry data
- `tiles/` — tiling utilities
- `schemas/` — JSON schemas (for manifests and related data)
- `docs/` — project documentation (including licensing tiers)
- `source-models/` — source assets and conversion/training helpers
- `tools/` — helper scripts (including colab scripts)

## Requirements

- Python 3 with `pytest` available (from `requirements.txt`)
- Node.js + npm (for `web/`)

## Quick start

### Run pipeline tests

From repository root:

```bash
python -m pytest
```

### Run the web app

```bash
cd web
npm install
npm run dev
```

Open the app at:

- `http://127.0.0.1:5173/index.html` (globe)
- `http://127.0.0.1:5173/docs.html` (docs page)
- `http://127.0.0.1:5173/settings.html` (settings page)

### Web build and tests

```bash
cd web
npm test
npm run build
```

## Licensing guidance

See `docs/licensing/tiers.md` for source-data tier rules and publishing constraints.
