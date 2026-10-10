import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const page = (name) => fileURLToPath(new URL(name, import.meta.url));
const liveDir = fileURLToPath(new URL('../source-models/live', import.meta.url));
const mapDir = fileURLToPath(new URL('../source-models/bluemarble-1km/globe', import.meta.url));

/** Dev only: serve the live training output at /live/ (splats and status.json). */
function liveTraining() {
  return {
    name: 'live-training',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const base = req.url.startsWith('/live/') ? liveDir : req.url.startsWith('/map/') ? mapDir : null;
        if (!base) return next();
        const rel = decodeURIComponent(req.url.split('/').slice(2).join('/').split('?')[0]);
        const file = path.join(base, rel);
        if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
          res.statusCode = 404;
          return res.end();
        }
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  base: './',
  publicDir: '../registry',
  plugins: [liveTraining()],
  build: {
    outDir: '../dist-web',
    emptyOutDir: true,
    target: 'esnext',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        globe: page('./index.html'),
        docs: page('./docs.html'),
        settings: page('./settings.html'),
      },
      output: { manualChunks: { playcanvas: ['playcanvas'], astronomy: ['astronomy-engine'], lucide: ['lucide'] } },
    },
  },
});