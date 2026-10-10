import * as pc from 'playcanvas';
import {
  DEG, EARTH_RADIUS_M, frameAt, latLonToVec, starLon, vecToLatLon, vecNorm, vecSub, vecDot, vecLen,
  wrapLon,
} from './geo.js';
import { STATUS, statusOf } from './data.js';
import { encodePly } from './ply.js';

// Overlays sit about 30 m above the surface. A scene unit is one Earth radius.
const SURFACE_LIFT = 1 + 4e-6;
const R = EARTH_RADIUS_M;

const toVec = (a) => new pc.Vec3(a[0], a[1], a[2]);
const fromVec = (v) => [v.x, v.y, v.z];
const hex = (s) => {
  const n = parseInt(s.slice(1), 16);
  return new pc.Color(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Placeholder basemap (replace with real tiles). Drawn only where no splats are loaded. */
function basemapCanvas() {
  const W = 2048, H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const sea = g.createLinearGradient(0, 0, 0, H);
  sea.addColorStop(0, '#2b6291');
  sea.addColorStop(0.5, '#1f4f7a');
  sea.addColorStop(1, '#183f63');
  g.fillStyle = sea;
  g.fillRect(0, 0, W, H);
  g.lineWidth = 1.5;
  for (let lon = -180; lon <= 180; lon += 15) {
    const x = ((lon + 180) / 360) * W;
    g.strokeStyle = lon % 90 === 0 ? 'rgba(217,168,79,0.42)' : 'rgba(217,168,79,0.14)';
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const y = ((90 - lat) / 180) * H;
    g.strokeStyle = lat === 0 ? 'rgba(217,168,79,0.42)' : 'rgba(217,168,79,0.14)';
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
  }
  return c;
}

/** Local ground grid: 125 m fine lines, 500 m major lines, brass cross on the place. */
function groundCanvas() {
  const N = 512;
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const g = c.getContext('2d');
  g.clearRect(0, 0, N, N);
  for (let i = 0; i <= N; i += N / 32) {
    g.strokeStyle = 'rgba(200,225,250,0.18)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, N); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(N, i); g.stroke();
  }
  for (let i = 0; i <= N; i += N / 8) {
    g.strokeStyle = 'rgba(217,168,79,0.45)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, N); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(N, i); g.stroke();
  }
  g.strokeStyle = 'rgba(217,168,79,0.95)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(N / 2 - 14, N / 2); g.lineTo(N / 2 + 14, N / 2); g.stroke();
  g.beginPath(); g.moveTo(N / 2, N / 2 - 14); g.lineTo(N / 2, N / 2 + 14); g.stroke();
  return c;
}

function texFromCanvas(app, canvas) {
  const tex = new pc.Texture(app.graphicsDevice, { width: canvas.width, height: canvas.height, mipmaps: true, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR });
  tex.setSource(canvas);
  return tex;
}

/** Quaternion from three orthonormal columns (x, y, z axes). */
function quatFromColumns(x, y, z) {
  const m = new pc.Mat4();
  m.set([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, 0, 0, 0, 1]);
  return new pc.Quat().setFromMat4(m);
}

// Slerp between two unit directions
function slerp(a, b, t) {
  const d = Math.max(-1, Math.min(1, vecDot(a, b)));
  if (d > 0.99999) return vecNorm([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  const th = Math.acos(d);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
}
// Point interpolation: direction by slerp, radius geometrically (stays outside the globe)
function interpPoint(a, b, t) {
  const ra = Math.max(vecLen(a), 1e-9), rb = Math.max(vecLen(b), 1e-9);
  const d = slerp(vecNorm(a), vecNorm(b), t);
  const r = Math.exp(Math.log(ra) + (Math.log(rb) - Math.log(ra)) * t);
  return [d[0] * r, d[1] * r, d[2] * r];
}
// Rotate vector v about unit axis k by angle a (Rodrigues)
function rotate(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const kv = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
  const kd = vecDot(k, v);
  return [
    v[0] * c + kv[0] * s + k[0] * kd * (1 - c),
    v[1] * c + kv[1] * s + k[1] * kd * (1 - c),
    v[2] * c + kv[2] * s + k[2] * kd * (1 - c),
  ];
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const wrapHeading = (h) => (Math.round((((h % 360) + 360) % 360) * 10) / 10) % 360;

/**
 * The globe, rendered with PlayCanvas. Gaussian splats use the engine's sorted splat renderer.
 * Public methods match the previous renderer so the rest of the app is unchanged.
 */
export class Globe {
  constructor(host) {
    this.host = host;
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%';
    host.appendChild(this.canvas);

    this.app = new pc.Application(this.canvas, {
      graphicsDeviceOptions: { antialias: false, preferWebGpu: false },
    });
    this.app.setCanvasFillMode(pc.FILLMODE_NONE);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this.app.scene.ambientLight = new pc.Color(0.2, 0.24, 0.32);
    this.app.start();

    this.cam = new pc.Entity('camera');
    this.cam.addComponent('camera', {
      fov: 50,
      nearClip: 1e-6,
      farClip: 400,
      clearColor: new pc.Color(0.012, 0.02, 0.045),
    });
    this.app.root.addChild(this.cam);

    this.sun = new pc.Entity('sun');
    this.sun.addComponent('light', { type: 'directional', color: new pc.Color(1, 0.94, 0.85), intensity: 2.4, enabled: false });
    this.app.root.addChild(this.sun);

    this.frameHooks = [];
    this.placeObjs = new Map();
    this.selectedId = null;
    this.globalCount = 0;
    this.proxy = null;
    this.chunk = null;
    this.global = null;
    this.region = null; // a regional splat set (Europe), drawn over the 1 km basemap
    this.showGlobal = true;
    this.showRegion = false;
    this.ground = null;
    this.measure = null;
    this.flight = null;
    this.keys = new Set();
    this.dragging = null;
    this.tok = { chunk: 0, proxy: 0, global: 0, region: 0 };
    this.splatsVisible = true;

    this.target = latLonToVec(20, 0, 1);
    this.pos = latLonToVec(20, 0, 2.8);

    this._buildSpace();
    this._buildGlobe();

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(host);
    this.resize();
    this._bindInput();
    this.app.on('update', (dt) => this._frame(dt));
  }

  // ---------- construction ----------

  _material({ color = [1, 1, 1], emissive = null, opacity = 1, lighting = false, transparent = false } = {}) {
    const m = new pc.StandardMaterial();
    m.diffuse = new pc.Color(color[0], color[1], color[2]);
    if (emissive) m.emissive = new pc.Color(emissive[0], emissive[1], emissive[2]);
    m.useLighting = lighting;
    m.opacity = opacity;
    if (transparent) m.blendType = pc.BLEND_NORMAL;
    m.update();
    return m;
  }

  _sphere(radius, material) {
    const e = new pc.Entity('sphere');
    e.addComponent('render', { type: 'sphere', material });
    e.setLocalScale(radius * 2, radius * 2, radius * 2);
    this.app.root.addChild(e);
    return e;
  }

  _buildSpace() {
    // Stars: a point mesh placed by sidereal time
    const N = 3600;
    this.starRA = new Float32Array(N);
    this.starDec = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      this.starDec[i] = Math.asin(2 * Math.random() - 1) / DEG;
      this.starRA[i] = Math.random() * 24;
    }
    this.starPos = new Float32Array(N * 3);
    this.starMesh = new pc.Mesh(this.app.graphicsDevice);
    this.starMesh.setPositions(this.starPos);
    this.starMesh.update(pc.PRIMITIVE_POINTS);
    const starMat = new pc.StandardMaterial();
    starMat.emissive = new pc.Color(1, 1, 1);
    starMat.useLighting = false;
    starMat.update();
    const stars = new pc.Entity('stars');
    stars.addComponent('render', { meshInstances: [new pc.MeshInstance(this.starMesh, starMat)] });
    this.app.root.addChild(stars);

    this.sunDisc = this._sphere(1.41, this._material({ emissive: [1, 0.96, 0.84] }));
    this.moonDisc = this._sphere(0.2727, this._material({ emissive: [0.79, 0.82, 0.87] }));
  }

  _buildGlobe() {
    // The placeholder basemap is removed: only splats are drawn.

  }

  /** Show or hide every splat layer. */
  setSplatsVisible(on) {
    this.splatsVisible = on;
    for (const layer of [this.chunk, this.proxy]) {
      if (layer) layer.entity.enabled = on;
    }
    this._applyLayers();
  }

  _syncBasemap() {
    if (this.basemap) this.basemap.enabled = false;
  }
  /**
   * Basemap: the NASA Blue Marble world map in 100 blocks (10 x 10, 36 x 18 degrees each).
   * Every block is drawn at half size; the blocks nearest the camera switch to full 1 km size.
   */
  _buildBasemap() {
    this.mapBlocks = [];
    this.basemap = new pc.Entity('basemap');
    this.app.root.addChild(this.basemap);
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        const north = 90 - r * 18, south = north - 18, west = -180 + c * 36, east = west + 36;
        const mat = new pc.StandardMaterial();
        mat.useLighting = false;
        mat.cull = pc.CULLFACE_NONE;
        mat.emissive = new pc.Color(0.1, 0.2, 0.3); // dark ocean until the block arrives
        mat.update();
        const e = new pc.Entity(`map-${r}-${c}`);
        e.addComponent('render', { meshInstances: [new pc.MeshInstance(this._patchMesh(south, north, west, east, 36, 18), mat)] });
        this.basemap.addChild(e);
        const block = { r, c, mat, centre: latLonToVec(north - 9, west + 18, 1), high: false, lowTex: null, highTex: null, img: null };
        this.mapBlocks.push(block);
        this._loadBlockLow(block);
      }
    }
    this.mapHighCap = 12;
    this._mapCheckAt = 0;
  }

  /** A curved patch of the globe, with texture coordinates running from the top-left of the block. */
  _patchMesh(lat0, lat1, lon0, lon1, nx, ny) {
    const positions = [], uvs = [], indices = [];
    for (let j = 0; j <= ny; j++) {
      const lat = lat1 - ((lat1 - lat0) * j) / ny;
      for (let i = 0; i <= nx; i++) {
        const lon = lon0 + ((lon1 - lon0) * i) / nx;
        const p = latLonToVec(lat, lon, 1);
        positions.push(p[0], p[1], p[2]);
        uvs.push(i / nx, j / ny);
      }
    }
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i, b = a + nx + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const mesh = new pc.Mesh(this.app.graphicsDevice);
    mesh.setPositions(positions);
    mesh.setNormals(positions);
    mesh.setUvs(0, uvs);
    mesh.setIndices(indices);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    return mesh;
  }

  _blockUrl(b) {
    return `/map/block_r${String(b.r).padStart(2, '0')}_c${String(b.c).padStart(2, '0')}.jpg`;
  }

  _textureFromImage(img) {
    const tex = new pc.Texture(this.app.graphicsDevice, { width: img.width, height: img.height, mipmaps: true, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE });
    tex.setSource(img);
    return tex;
  }

  /** Load a block at half size (kept for the whole session). */
  _loadBlockLow(block) {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width / 2;
      canvas.height = img.height / 2;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      block.lowTex = this._textureFromImage(canvas);
      if (!block.high) this._applyBlockTexture(block);
    };
    img.onerror = () => console.warn('map block missing:', this._blockUrl(block));
    img.src = this._blockUrl(block);
  }

  _applyBlockTexture(block) {
    const tex = block.high && block.highTex ? block.highTex : block.lowTex;
    if (!tex) return;
    block.mat.emissiveMap = tex;
    block.mat.emissive = new pc.Color(1, 1, 1);
    block.mat.update();
  }

  /** Load a block at full 1 km size. */
  _loadBlockHigh(block) {
    if (block.loadingHigh) return;
    block.loadingHigh = true;
    const img = new Image();
    img.onload = () => {
      block.highTex = this._textureFromImage(img);
      block.loadingHigh = false;
      if (block.high) this._applyBlockTexture(block);
    };
    img.onerror = () => { block.loadingHigh = false; };
    img.src = this._blockUrl(block);
  }

  _dropBlockHigh(block) {
    if (block.highTex) {
      block.highTex.destroy();
      block.highTex = null;
    }
  }

  /** Once a second: blocks near the eye go to full size, the rest stay at half size. */
  _updateMapLod(now) {
    if (now - this._mapCheckAt < 1000 || !this.mapBlocks) return;
    this._mapCheckAt = now;
    const near = this.mapBlocks
      .map((b) => ({ b, d: vecLen(vecSub(this.pos, b.centre)) }))
      .filter((x) => x.d < 0.25)
      .sort((x, y) => x.d - y.d)
      .slice(0, this.mapHighCap)
      .map((x) => x.b);
    for (const b of this.mapBlocks) {
      const want = near.includes(b);
      if (want && !b.high) {
        b.high = true;
        this._loadBlockHigh(b);
        this._applyBlockTexture(b);
      } else if (!want && b.high) {
        b.high = false;
        this._applyBlockTexture(b);
        this._dropBlockHigh(b);
      }
    }
  }
  // ---------- camera ----------

  _applyCamera() {
    this.cam.setPosition(this.pos[0], this.pos[1], this.pos[2]);
    this.cam.lookAt(this.target[0], this.target[1], this.target[2]);
  }

  _bindInput() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      c.setPointerCapture(e.pointerId);
      this.dragging = { x: e.clientX, y: e.clientY, button: e.button, tilt: e.button === 2 || e.shiftKey };
      this.flight = null;
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.dragging.x;
      const dy = e.clientY - this.dragging.y;
      this.dragging.x = e.clientX;
      this.dragging.y = e.clientY;
      if (this.dragging.tilt && !this._far()) this._orbit(dx, dy);
      else this._spin(dx, dy);
    });
    const stop = (e) => {
      if (this.dragging && c.hasPointerCapture?.(e.pointerId)) c.releasePointerCapture(e.pointerId);
      this.dragging = null;
    };
    c.addEventListener('pointerup', stop);
    c.addEventListener('pointercancel', stop);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.flight = null;
      const k = Math.exp(e.deltaY * 0.0012);
      // zooming in moves the focus part of the way toward the point under the cursor
      if (k < 1 && !this._far()) {
        const hit = this.pickGlobe(e.clientX, e.clientY);
        if (hit) {
          const hv = latLonToVec(hit.lat, hit.lon, 1);
          this.target = vecNorm(slerp(this.target, hv, Math.min(0.5, 4 * (1 - k))));
        }
      }
      const off = vecSub(this.pos, this.target);
      const len = Math.min(8, Math.max(5e-6, vecLen(off) * k));
      const dir = vecNorm(off);
      this.pos = [this.target[0] + dir[0] * len, this.target[1] + dir[1] * len, this.target[2] + dir[2] * len];
      this._applyCamera();
    }, { passive: false });    window.addEventListener('keydown', (e) => this._onKey(e, true));
    window.addEventListener('keyup', (e) => this._onKey(e, false));
    window.addEventListener('blur', () => this.keys.clear());
  }

  _onKey(e, down) {
    if (e.target.matches?.('input, select, textarea')) {
      this.keys.clear();
      return;
    }
    const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyZ', 'KeyX', 'ShiftLeft', 'ShiftRight'];
    if (!codes.includes(e.code)) return;
    if (down) this.keys.add(e.code);
    else this.keys.delete(e.code);
  }

  /** True when the eye is far enough out to look at the Earth's centre (above about 1,600 km). */
  _far() {
    return (vecLen(this.pos) - 1) * R > 1.6e6;
  }

  /** Far view: orbit the camera around the Earth's centre, so the Earth turns about its own axis on screen. */
  _spinFar(dx, dy) {
    const k = 0.0045;
    this.pos = rotate(this.pos, [0, 1, 0], -dx * k);
    const n = vecNorm(this.pos);
    const axis = vecNorm(cross(n, [0, 1, 0]));
    if (vecLen(axis) > 0.5) {
      const tilted = rotate(this.pos, axis, dy * k);
      const nt = vecNorm(tilted);
      if (Math.abs(nt[1]) < 0.995) this.pos = tilted;
    }
    this.target = [0, 0, 0];
    this._applyCamera();
  }
  /** Left drag: turn the globe so the surface follows the pointer. */
  _spin(dx, dy) {
    if (this._far()) return this._spinFar(dx, dy);
    const dist = vecLen(vecSub(this.pos, this.target));
    const perPx = (dist * 2 * Math.tan(25 * DEG)) / Math.max(1, this.canvas.clientHeight);
    const yaw = -dx * perPx;
    const lat0 = vecToLatLon(this.target).lat;
    const pitch = -dy * perPx;
    this.pos = rotate(this.pos, [0, 1, 0], yaw);
    this.target = rotate(this.target, [0, 1, 0], yaw);
    const lon = vecToLatLon(this.target).lon;
    const east = frameAt(lat0, lon).east;
    const lat1 = vecToLatLon(this.target).lat;
    if (Math.abs(lat1 + pitch / DEG) < 89) {
      this.pos = rotate(this.pos, east, pitch);
      this.target = rotate(this.target, east, pitch);
    }
    this._applyCamera();
  }
  /** Orbit the camera around the focus point: horizontal drag turns, vertical drag tilts. */
  _orbit(dx, dy) {
    const up = this.target;
    let off = vecSub(this.pos, this.target);
    off = rotate(off, up, -dx * 0.0045);
    const axis = vecNorm(cross(up, off));
    const tilted = rotate(off, axis, dy * 0.0045);
    if (vecDot(vecNorm(tilted), up) > 0.02) off = tilted;
    this.pos = [this.target[0] + off[0], this.target[1] + off[1], this.target[2] + off[2]];
    this._applyCamera();
  }

  /** Camera pose from a focus point and eye altitude. heading: 0 = north, clockwise. pitch: -90 = down. */
  poseFor(lat, lon, eyeAltM, hd, pt) {
    const cl = Math.max(-89.9, Math.min(89.9, lat));
    const { up, east, north } = frameAt(cl, lon);
    const az = hd * DEG, el = pt * DEG;
    const look = vecNorm([
      north[0] * Math.cos(el) * Math.cos(az) + east[0] * Math.cos(el) * Math.sin(az) + up[0] * Math.sin(el),
      north[1] * Math.cos(el) * Math.cos(az) + east[1] * Math.cos(el) * Math.sin(az) + up[1] * Math.sin(el),
      north[2] * Math.cos(el) * Math.cos(az) + east[2] * Math.cos(el) * Math.sin(az) + up[2] * Math.sin(el),
    ]);
    const target = latLonToVec(cl, lon, 1);
    const eye = eyeAltM / R;
    const dist = eye / Math.max(0.12, -Math.sin(el));
    const pos = [target[0] - look[0] * dist, target[1] - look[1] * dist, target[2] - look[2] * dist];
    return { pos, target };
  }

  /** Current view as focus point, eye altitude, heading and pitch. Inverse of poseFor. */
  readPose() {
    const target = this.target;
    const pos = this.pos;
    const far = this._far();
    const surface = far ? vecNorm(pos) : target;
    const focus = vecToLatLon(surface);
    const { up, east, north } = frameAt(focus.lat, focus.lon);
    const look = vecNorm(vecSub(target, pos));
    const pt = Math.asin(Math.max(-1, Math.min(1, vecDot(look, up)))) / DEG;
    const hd = wrapHeading(Math.atan2(vecDot(look, east), vecDot(look, north)) / DEG);
    const alt = far ? (vecLen(pos) - 1) * R : Math.max(0, vecDot(vecSub(pos, target), up)) * R;
    return { lat: focus.lat, lon: focus.lon, alt, hd, pt, dist: vecLen(vecSub(pos, target)) };
  }

  flyTo({ lat, lon, alt = 900, hd = 0, pt = -40 }, { duration = 1700, instant = false } = {}) {
    const to = this.poseFor(lat, lon, alt, hd, pt);
    if (instant) {
      this.pos = to.pos;
      this.target = to.target;
      this._applyCamera();
      return;
    }
    this.flight = { from: { pos: this.pos, target: this.target }, to, t0: performance.now(), duration };
  }

  /** WASD pans relative to heading; Q/E turn; Z/X zoom. Shift runs. Returns true if the view moved. */
  _keyNav(dt) {
    const k = this.keys;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const turn = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
    const zoom = (k.has('KeyX') ? 1 : 0) - (k.has('KeyZ') ? 1 : 0);
    if (!f && !r && !turn && !zoom) return false;
    if (this._far()) {
      if (!zoom) return false;
      const kz = Math.exp(zoom * 1.2 * (k.has('ShiftLeft') || k.has('ShiftRight') ? 4 : 1) * dt);
      const d0 = vecLen(this.pos);
      const d1 = Math.min(8, Math.max(5e-6, d0 * kz));
      this.pos = vecNorm(this.pos).map((v) => v * d1);
      this._applyCamera();
      return true;
    }
    const run = k.has('ShiftLeft') || k.has('ShiftRight') ? 4 : 1;
    const pose = this.readPose();
    let { lat, lon, alt, hd } = pose;
    const pt = pose.pt;
    if (f || r) {
      const h = hd * DEG;
      const dn = (f * Math.cos(h) - r * Math.sin(h));
      const de = (f * Math.sin(h) + r * Math.cos(h));
      const len = Math.hypot(dn, de) || 1;
      const metres = Math.min(Math.max(alt, 20) * 0.6, 1e6) * run * dt;
      lat = Math.max(-89.9, Math.min(89.9, lat + ((dn / len) * metres / R) / DEG));
      const cos = Math.max(0.05, Math.cos(lat * DEG));
      lon = wrapLon(lon + (((de / len) * metres) / (R * cos)) / DEG);
    }
    if (turn) hd += turn * 90 * run * dt;
    if (zoom) alt = Math.min(6e7, Math.max(50, alt * Math.exp(zoom * 1.2 * run * dt)));
    const to = this.poseFor(lat, lon, alt, hd, pt);
    this.pos = to.pos;
    this.target = to.target;
    this._applyCamera();
    return true;
  }

  // ---------- scene content ----------

  resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.app.resizeCanvas(w, h);
    this.cam.camera.aspectRatio = w / h;
  }

  /** Space stays dark in both themes; the theme only changes the page around the globe. */
  setTheme() {}

  setSky(sky) {
    const sunV = latLonToVec(sky.sun.lat, sky.sun.lon, 1);
    this.sun.setPosition(sunV[0] * 12, sunV[1] * 12, sunV[2] * 12);
    this.sun.lookAt(0, 0, 0);
    this.sunDisc.setPosition(sunV[0] * 300, sunV[1] * 300, sunV[2] * 300);
    const mv = latLonToVec(sky.moon.lat, sky.moon.lon, 60.3);
    this.moonDisc.setPosition(mv[0], mv[1], mv[2]);
    for (let i = 0; i < this.starDec.length; i++) {
      const p = latLonToVec(this.starDec[i], starLon(this.starRA[i], sky.gastDeg), 350);
      this.starPos[i * 3] = p[0];
      this.starPos[i * 3 + 1] = p[1];
      this.starPos[i * 3 + 2] = p[2];
    }
    this.starMesh.setPositions(this.starPos);
    this.starMesh.update(pc.PRIMITIVE_POINTS);
  }

  setPlaces(places) {
    for (const o of this.placeObjs.values()) o.dot.destroy();
    this.placeObjs.clear();
    for (const place of places) {
      const color = hex(STATUS[statusOf(place)].color);
      const mat = new pc.StandardMaterial();
      mat.emissive = color;
      mat.useLighting = false;
      mat.update();
      const dot = this._sphere(1, mat);
      const p = latLonToVec(place.lat, place.lon, SURFACE_LIFT);
      dot.setPosition(p[0], p[1], p[2]);
      const f = frameAt(place.lat, place.lon);
      this.placeObjs.set(place.id, { place, dot, pos: p, color, east: f.east, north: f.north, up: f.up });
    }
  }

  setSelected(id) {
    this.selectedId = id;
  }

  /** A 4 km grid on the surface at a place. Fades in as the camera comes down. */
  setGround(place) {
    if (this.ground) {
      this.ground.destroy();
      this.ground = null;
    }
    if (!place) return;
    const { up, east, north } = frameAt(place.lat, place.lon);
    const mat = new pc.StandardMaterial();
    mat.emissiveMap = texFromCanvas(this.app, groundCanvas());
    mat.emissive = new pc.Color(1, 1, 1);
    mat.useLighting = false;
    mat.opacity = 0;
    mat.blendType = pc.BLEND_NORMAL;
    mat.update();
    const e = new pc.Entity('ground');
    e.addComponent('render', { type: 'plane', material: mat });
    const size = 4000 / R;
    const z = vecNorm(cross(east, up));
    e.setRotation(quatFromColumns(east, up, z));
    e.setPosition(up[0] * SURFACE_LIFT, up[1] * SURFACE_LIFT, up[2] * SURFACE_LIFT);
    e.setLocalScale(size, size, size);
    this.app.root.addChild(e);
    this.ground = e;
  }

  /** Load a PLY from memory as a Gaussian splat entity. */
  _loadSplats(name, buffer, { position = [0, 0, 0], rotation = null } = {}) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([buffer]));
      const asset = new pc.Asset(name, 'gsplat', { url, filename: `${name}.ply` });
      this.app.assets.add(asset);
      asset.ready(() => {
        URL.revokeObjectURL(url);
        const e = new pc.Entity(name);
        e.addComponent('gsplat', { asset });
        e.setPosition(position[0], position[1], position[2]);
        if (rotation) e.setRotation(rotation);
        e.enabled = this.splatsVisible;
        this.app.root.addChild(e);
        resolve({ entity: e, asset });
      });
      asset.on('error', (err) => {
        URL.revokeObjectURL(url);
        reject(new Error(String(err)));
      });
      this.app.assets.load(asset);
    });
  }

  _dropSplats(layer) {
    if (!layer) return;
    layer.entity.destroy();
    this.app.assets.remove(layer.asset);
    layer.asset.unload?.();
  }

  /** Draw a loaded place chunk: splats in its own east-north-up frame, placed on the globe. */
  setChunk(chunk) {
    const token = ++this.tok.chunk;
    const old = this.chunk;
    this.chunk = null;
    this._dropSplats(old);
    if (!chunk) return;
    const { manifest, splats: s } = chunk;
    const { originLat, originLon } = manifest.ecefTransform;
    const { up, east, north } = frameAt(originLat, originLon);
    const base = latLonToVec(originLat, originLon, 1);
    const n = s.count;
    const positions = new Float32Array(n * 3);
    const scales = new Float32Array(n * 3);
    const quats = new Float32Array(n * 4);
    const colors = new Float32Array(n * 4);
    for (let i = 0; i < n * 3; i++) positions[i] = s.positions[i] / R;
    for (let i = 0; i < n * 3; i++) scales[i] = s.scale3[i] / R;
    for (let i = 0; i < n * 4; i++) quats[i] = s.quats[i];
    for (let i = 0; i < n * 4; i++) colors[i] = s.colors[i] / 255;
    const buf = encodePly({ positions, scales, quats, colors });
    this._loadSplats('chunk', buf, { position: base, rotation: quatFromColumns(east, north, up) }).then((layer) => {
      if (token !== this.tok.chunk) return this._dropSplats(layer);
      this.chunk = layer;
    });
  }

  /** Stand-in geometry for a place with some detail level. PROXY in the UI; not captured data. */
  setProxy(place, count) {
    const token = ++this.tok.proxy;
    this._dropSplats(this.proxy);
    this.proxy = null;
    if (!place || !(place.achievedLOD > 0)) return;
    const rnd = mulberry32(hashString(place.id));
    const { up, east, north } = frameAt(place.lat, place.lon);
    const base = latLonToVec(place.lat, place.lon, 1);
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count * 3);
    const quats = new Float32Array(count * 4);
    const colors = new Float32Array(count * 4);
    const sigma = 4 / R;
    for (let i = 0; i < count; i++) {
      const r = 160 * Math.sqrt(rnd());
      const a = rnd() * Math.PI * 2;
      const x = r * Math.cos(a), y = r * Math.sin(a);
      const h = 2 + (rnd() < 0.3 ? 4 + rnd() * 28 : rnd() * 1.2);
      for (let k = 0; k < 3; k++) {
        positions[i * 3 + k] = base[k] + (east[k] * x + north[k] * y + up[k] * h) / R;
        scales[i * 3 + k] = sigma;
      }
      quats[i * 4] = 1;
      colors[i * 4] = 0.91; colors[i * 4 + 1] = 0.79; colors[i * 4 + 2] = 0.55; colors[i * 4 + 3] = 0.8;
    }
    const buf = encodePly({ positions, scales, quats, colors });
    this._loadSplats('proxy', buf).then((layer) => {
      if (token !== this.tok.proxy) return this._dropSplats(layer);
      this.proxy = layer;
    });
  }

  /** Earth-centred splat set (metres) in the globe's frame, in place of the placeholder basemap. */
  setGlobalSplats(s) {
    const token = ++this.tok.global;
    this._dropSplats(this.global);
    this.global = null;
    const n = s.count;
    const positions = new Float32Array(n * 3);
    const scales = new Float32Array(n * 3);
    const quats = new Float32Array(n * 4);
    const colors = new Float32Array(n * 4);
    for (let i = 0; i < n * 3; i++) positions[i] = s.positions[i] / R;
    for (let i = 0; i < n * 3; i++) scales[i] = s.scale3[i] / R;
    for (let i = 0; i < n * 4; i++) quats[i] = s.quats[i];
    for (let i = 0; i < n * 4; i++) colors[i] = s.colors[i] / 255;
    const buf = encodePly({ positions, scales, quats, colors });
    return this._loadSplats('earth', buf).then((layer) => {
      if (token !== this.tok.global) return this._dropSplats(layer);
      this.global = layer;
      this.globalCount = n;
      this._applyLayers();
    });
  }

  clearGlobalSplats() {
    this.tok.global++;
    this._dropSplats(this.global);
    this.global = null;
    this.globalCount = 0;
    this._syncBasemap();
  }

  /** Regional splat set (in the globe frame, metres from the Earth's centre), shown in 'updated' mode. */
  setRegionSplats(s) {
    const token = ++this.tok.region;
    this._dropSplats(this.region);
    this.region = null;
    const n = s.count;
    const positions = new Float32Array(n * 3);
    const scales = new Float32Array(n * 3);
    const quats = new Float32Array(n * 4);
    const colors = new Float32Array(n * 4);
    for (let i = 0; i < n * 3; i++) positions[i] = s.positions[i] / R;
    for (let i = 0; i < n * 3; i++) scales[i] = s.scale3[i] / R;
    for (let i = 0; i < n * 4; i++) quats[i] = s.quats[i];
    for (let i = 0; i < n * 4; i++) colors[i] = s.colors[i] / 255;
    const buf = encodePly({ positions, scales, quats, colors });
    return this._loadSplats('region', buf).then((layer) => {
      if (token !== this.tok.region) return this._dropSplats(layer);
      this.region = layer;
      this._applyLayers();
    });
  }

  /** Show the current global splats ('current') or the regional update over the 1 km basemap ('updated'). */
  setLayerMode(mode) {
    this.showGlobal = mode === 'current';
    this.showRegion = mode === 'updated';
    this._applyLayers();
  }

  hasRegion() {
    return Boolean(this.region);
  }

  _applyLayers() {
    if (this.global) this.global.entity.enabled = this.splatsVisible && this.showGlobal;
    if (this.region) this.region.entity.enabled = this.splatsVisible && this.showRegion;
    this._syncBasemap();
  }
  setMeasure(a, b) {
    this.measure = a ? { a, b } : null;
  }

  // ---------- picking and labels ----------

  /** Client position to canvas CSS pixels (what the camera's projection functions take). */
  _pixel(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return [clientX - rect.left, clientY - rect.top];
  }

  /** Screen position of a place, in CSS pixels of the canvas, and whether it faces the camera. */
  projectPlace(id) {
    const o = this.placeObjs.get(id);
    if (!o) return null;
    const facing = vecDot(o.up, vecSub(this.pos, o.pos)) > 0;
    const s = this.cam.camera.worldToScreen(toVec(o.pos), new pc.Vec3());
    const rect = this.canvas.getBoundingClientRect();
    const x = s.x;
    const y = s.y;
    const inside = x > -50 && y > -50 && x < rect.width + 50 && y < rect.height + 50;
    return { x, y, visible: facing && inside };
  }

  pickPlace(clientX, clientY, maxPx = 18) {
    const rect = this.canvas.getBoundingClientRect();
    let best = null;
    let bestD = maxPx;
    for (const [id] of this.placeObjs) {
      const p = this.projectPlace(id);
      if (!p || !p.visible) continue;
      const d = Math.hypot(rect.left + p.x - clientX, rect.top + p.y - clientY);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  /** Lat/lon under a screen point on the globe, or null if the ray misses. */
  pickGlobe(clientX, clientY) {
    const [px, py] = this._pixel(clientX, clientY);
    const near = this.cam.camera.screenToWorld(px, py, this.cam.camera.nearClip, new pc.Vec3());
    const far = this.cam.camera.screenToWorld(px, py, this.cam.camera.farClip, new pc.Vec3());
    const o = fromVec(near);
    const d = vecNorm(vecSub(fromVec(far), o));
    const b = 2 * vecDot(o, d);
    const c = vecDot(o, o) - 1;
    const disc = b * b - 4 * c;
    if (disc < 0) return null;
    const t0 = (-b - Math.sqrt(disc)) / 2;
    const t = t0 > 0 ? t0 : (-b + Math.sqrt(disc)) / 2;
    if (t < 0) return null;
    return vecToLatLon([o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t]);
  }

  // ---------- per frame ----------

  _frame(dt) {
    const now = performance.now();
    if (this.flight) {
      const f = this.flight;
      const t = Math.min(1, (now - f.t0) / f.duration);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.pos = interpPoint(f.from.pos, f.to.pos, e);
      this.target = interpPoint(f.from.target, f.to.target, e);
      if (t >= 1) this.flight = null;
      this._applyCamera();
    } else if (this.keys.size) {
      this._keyNav(Math.min(dt, 0.1));
    }

    if (!this.flight) {
      if (this._far()) {
        const t = vecLen(this.target);
        if (t > 1e-3) this.target = this.target.map((v) => v * 0.9);
        else this.target = [0, 0, 0];
      } else if (vecLen(this.target) < 0.5) {
        this.target = vecNorm(this.pos);
      }
    }

    this._updateMapLod(now);

    // near plane follows the altitude, so depth stays accurate
    const alt = Math.max(1e-7, vecLen(this.pos) - 1);
    const near = Math.max(1e-7, alt * 0.2);
    if (Math.abs(this.cam.camera.nearClip - near) > this.cam.camera.nearClip * 0.05) this.cam.camera.nearClip = near;

    // markers keep a constant on-screen size; rings are drawn as lines
    for (const [id, o] of this.placeObjs) {
      const d = vecLen(vecSub(this.pos, o.pos));
      const sel = id === this.selectedId;
      const s = d * (sel ? 0.0075 : 0.0055);
      o.dot.setLocalScale(s * 2, s * 2, s * 2);
      const pulse = 0.5 + 0.5 * Math.sin(now / 420);
      const rr = s * (sel ? 4.6 + 0.6 * pulse : 3.4);
      this._ring(o, rr, sel);
    }

    if (this.ground) {
      const altM = alt * R;
      this.ground.render.meshInstances[0].material.opacity = Math.max(0, Math.min(1, 1 - (altM - 3000) / 9000)) * 0.9;
      this.ground.render.meshInstances[0].material.update();
    }

    if (this.measure) {
      const a = latLonToVec(this.measure.a.lat, this.measure.a.lon, SURFACE_LIFT);
      this.app.drawLine(toVec(a), toVec(vecNorm(a).map((v) => v * SURFACE_LIFT + 0.00001)), new pc.Color(0.85, 0.66, 0.31));
      if (this.measure.b) this._arc(this.measure.a, this.measure.b);
    }

    if (this.app && this.flight === null) this._applyCamera();
    for (const hook of this.frameHooks) hook(now);
  }

  _ring(o, r, sel) {
    const color = sel ? new pc.Color(1, 0.9, 0.6) : new pc.Color(o.color.r, o.color.g, o.color.b);
    const N = 48;
    let prev = null;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      const p = [
        o.pos[0] + r * (c * o.east[0] + s * o.north[0]),
        o.pos[1] + r * (c * o.east[1] + s * o.north[1]),
        o.pos[2] + r * (c * o.east[2] + s * o.north[2]),
      ];
      if (prev) this.app.drawLine(toVec(prev), toVec(p), color);
      prev = p;
    }
  }

  _arc(a, b) {
    const va = vecNorm(latLonToVec(a.lat, a.lon, 1));
    const vb = vecNorm(latLonToVec(b.lat, b.lon, 1));
    let prev = null;
    for (let i = 0; i <= 128; i++) {
      const p = slerp(va, vb, i / 128).map((v) => v * SURFACE_LIFT);
      if (prev) this.app.drawLine(toVec(prev), toVec(p), new pc.Color(0.85, 0.66, 0.31));
      prev = p;
    }
  }
}