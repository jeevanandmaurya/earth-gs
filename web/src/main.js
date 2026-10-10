import { Globe } from './globe.js';
import { defaultPlace, loadPlaces, statusOf } from './data.js';
import { loadChunk, parseSplatBuffer } from './chunks.js';
import { greatCircleMeters, skyAt } from './geo.js';
import { mountShell } from './shell.js';
import { getSettings, onSettings, resolvedTheme, updateSettings } from './settings.js';
import * as ui from './ui.js';

const QUALITY_BUDGET = { phone: 15000, desktop: 60000 };

const settings = getSettings();

const state = {
  places: [],
  selectedId: null,
  filter: 'all',
  query: '',
  timeMode: settings.startMode, // 'live' follows the UTC clock; 'capture' uses the place's capture time
  offsetH: 0, // hours away from now, kept within ±12
  playing: false,
  speed: 60, // simulated seconds per real second
  quality: settings.quality,
  measuring: false,
  measurePts: [],
};

let globe = null;
let labels = null;
let sky = null;
let skyKey = '';
let lastFrame = 0;
let lastSkyAt = 0;
let lastReadoutAt = 0;
let lastSaveAt = 0;
let fpsFrames = 0;
let fpsSince = performance.now();

const $ = (id) => document.getElementById(id);
const placeById = (id) => state.places.find((p) => p.id === id) ?? null;
const selected = () => placeById(state.selectedId);
const wrapHours = (h) => ((((h + 12) % 24) + 24) % 24) - 12;

function simDate() {
  const p = selected();
  if (state.timeMode === 'capture' && p?.lastVerified) return new Date(p.lastVerified);
  return new Date(Date.now() + state.offsetH * 3600e3);
}

function visiblePlaces() {
  const q = state.query.trim().toLowerCase();
  return state.places.filter(
    (p) =>
      (state.filter === 'all' || statusOf(p) === state.filter) &&
      (!q || p.name.toLowerCase().includes(q) || p.id.includes(q)),
  );
}

function renderPanels() {
  ui.renderChips(state.places, state.filter, (f) => {
    state.filter = f;
    renderPanels();
  });
  ui.renderPlaceList(visiblePlaces(), state.selectedId);
  ui.renderDetail(selected(), sky);
  ui.renderTimeline(state, selected(), sky);
}

// ---------- sidebar pages (Places / Details / Camera) ----------

function showPage(name) {
  for (const tab of document.querySelectorAll('#rail .tab')) {
    const on = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  }
  for (const page of document.querySelectorAll('#rail .page')) {
    page.hidden = page.id !== `page-${name}`;
  }
}

// ---------- splat chunks ----------

const chunkCache = new Map(); // place id -> { state: 'none' | 'loaded' | 'error', chunk?, message? }

async function ensureChunk(p) {
  if (!chunkCache.has(p.id)) {
    try {
      const chunk = await loadChunk(p.id);
      chunkCache.set(p.id, chunk ? { state: 'loaded', chunk } : { state: 'none' });
    } catch (err) {
      chunkCache.set(p.id, { state: 'error', message: err.message });
    }
  }
  return chunkCache.get(p.id);
}

function chunkText(entry) {
  if (!entry) return 'checking…';
  if (entry.state === 'loaded') return `${entry.chunk.splats.count.toLocaleString()} splats`;
  if (entry.state === 'error') return `error: ${entry.message}`;
  return 'none yet';
}

/** Draw the chunk if one is loaded, otherwise the stand-in geometry. */
function showGeometry(p) {
  const entry = chunkCache.get(p.id);
  if (entry?.state === 'loaded') {
    globe.setProxy(null, 0);
    globe.setChunk(entry.chunk);
  } else {
    globe.setChunk(null);
    globe.setProxy(p.achievedLOD > 0 ? p : null, QUALITY_BUDGET[state.quality]);
  }
  ui.setChunkStatus(chunkText(entry));
}

function selectPlace(id, { fly = true, instant = false, show = true } = {}) {
  const p = placeById(id);
  if (!p) return;
  state.selectedId = id;
  globe.setSelected(id);
  globe.setGround(p);
  showGeometry(p);
  ensureChunk(p).then(() => {
    if (state.selectedId === p.id) showGeometry(p);
  });
  if (fly) globe.flyTo({ lat: p.lat, lon: p.lon, alt: 900, hd: 0, pt: -40 }, { instant });
  if (show) showPage('details');
  renderPanels();
}

function setTimeMode(mode) {
  if (mode === 'capture' && !selected()?.lastVerified) {
    ui.toast('No capture time recorded for this place');
    return;
  }
  state.timeMode = mode;
  state.playing = false;
  renderPanels();
}

function handleAct(act) {
  const p = selected();
  if (!p) return;
  if (act === 'fly') globe.flyTo({ lat: p.lat, lon: p.lon, alt: 900, hd: 0, pt: -40 });
  if (act === 'contribute-data') {
    ui.openDialog(
      'Contribute data',
      'Uploads need GPS or ground-control coordinates, a licence you choose at upload, and automatic ' +
        'face and plate blurring. Nothing is published until the registration check passes. ' +
        'Coming in phase 4.',
    );
  }
  if (act === 'contribute-compute') {
    ui.openDialog(
      'Contribute compute',
      'A worker pulls a chunk job, trains it, saves checkpoints as it goes and uploads the result. ' +
        'Quality is checked on held-out views before anything counts. Coming in phase 4.',
    );
  }
}

// ---------- share link ----------

const VIEW_KEY = 'earth-gs:view';

/** The current place, camera and time as URL parameters. */
function viewParams() {
  const pose = globe.readPose();
  const params = new URLSearchParams();
  if (state.selectedId) params.set('place', state.selectedId);
  params.set('lat', pose.lat.toFixed(5));
  params.set('lon', pose.lon.toFixed(5));
  params.set('alt', String(Math.round(pose.alt)));
  params.set('hd', pose.hd.toFixed(1));
  params.set('pt', pose.pt.toFixed(1));
  params.set('m', state.timeMode);
  params.set('o', state.offsetH.toFixed(2));
  params.set('q', state.quality);
  return params;
}

function shareLink() {
  return `${location.origin}${location.pathname}?${viewParams()}`;
}

/** Remember the view for this tab, so the Globe link returns to where you were. */
function saveView() {
  if (!globe) return;
  try {
    sessionStorage.setItem(VIEW_KEY, viewParams().toString());
  } catch {
    /* storage can be blocked; the view just is not remembered */
  }
}

async function copyLink() {
  const url = shareLink();
  try {
    history.replaceState(null, '', url);
  } catch {
    /* some embedded contexts forbid history changes; the link is still valid */
  }
  try {
    await navigator.clipboard.writeText(url);
    ui.toast('Link copied');
  } catch {
    ui.openDialog('Share link', url);
  }
}

// ---------- globe clicks and measuring ----------

function handleCanvasClick(x, y) {
  if (state.measuring) {
    const ll = globe.pickGlobe(x, y);
    if (!ll) return;
    if (state.measurePts.length === 2) state.measurePts = [];
    state.measurePts.push(ll);
    const [a, b] = state.measurePts;
    if (b) {
      globe.setMeasure(a, b);
      ui.showMeasure(greatCircleMeters(a, b), a, b);
    } else {
      globe.setMeasure(a, null);
      ui.showMeasure(null, a, null);
    }
    return;
  }
  const id = globe.pickPlace(x, y);
  if (id) selectPlace(id);
}

// ---------- per-frame update ----------

function onFrame(now) {
  const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
  lastFrame = now;

  // frame rate: frames counted over the last half second
  fpsFrames++;
  if (now - fpsSince >= 500) {
    $('fps').textContent = `${Math.round((fpsFrames * 1000) / (now - fpsSince))} fps`;
    fpsFrames = 0;
    fpsSince = now;
  }

  if (state.playing && state.timeMode === 'live') {
    state.offsetH = wrapHours(state.offsetH + (state.speed * dt) / 3600);
  }

  const key = `${state.timeMode}|${state.selectedId}`;
  const changed = key !== skyKey;
  const liveTick = state.timeMode === 'live' && now - lastSkyAt > 100;
  if (changed || liveTick) {
    skyKey = key;
    lastSkyAt = now;
    sky = skyAt(simDate());
    globe.setSky(sky);
    ui.updateSunAtSite(selected(), sky);
    ui.renderTimeline(state, selected(), sky);
  }

  ui.placeLabels(globe, labels, state.selectedId);

  if (now - lastSaveAt > 1000) {
    lastSaveAt = now;
    saveView();
  }

  if (now - lastReadoutAt > 200) {
    lastReadoutAt = now;
    const pose = globe.readPose();
    ui.renderTicker(pose);
    ui.renderClock(simDate(), state.timeMode);
    if (!ui.poseFormHasFocus()) ui.fillPoseForm(pose);
  }
}

// ---------- panel, overlays, time bar ----------

function setRail(open) {
  $('layout').classList.toggle('rail-collapsed', !open);
  $('rail-toggle').setAttribute('aria-expanded', String(open));
  if (globe) globe.resize();
}

function setOverlays(on) {
  $('overlay-toggle').setAttribute('aria-pressed', String(on));
  $('overlay-toggle').title = on ? 'Hide labels and readout' : 'Show labels and readout';
  document.querySelector('.stage').classList.toggle('no-overlays', !on);
}

function setTimeline(open) {
  $('timeline').classList.toggle('open', open);
  $('timeline-toggle').setAttribute('aria-expanded', String(open));
}

// Settings change from any page; apply the parts the globe uses
function onSettingsChanged(s) {
  if (!globe) return;
  state.quality = s.quality;
  const p = selected();
  if (p) showGeometry(p);
  globe.setTheme(resolvedTheme() === 'light');
  if (state.measurePts.length === 2) {
    const [a, b] = state.measurePts;
    ui.showMeasure(greatCircleMeters(a, b), a, b);
  }
}

// ---------- wiring ----------

function bindControls() {
  const canvas = globe.canvas;
  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved <= 6) handleCanvasClick(e.clientX, e.clientY); // ignore drags
  });

  $('rail').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) return showPage(tab.dataset.tab);
    const card = e.target.closest('[data-id]');
    if (card) return selectPlace(card.dataset.id);
    const act = e.target.closest('[data-act]');
    if (act) handleAct(act.dataset.act);
  });

  // Arrow keys move between tabs
  $('rail').addEventListener('keydown', (e) => {
    if (!e.target.matches('#rail .tab')) return;
    const tabs = [...document.querySelectorAll('#rail .tab')];
    const i = tabs.indexOf(e.target);
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    const next = tabs[(i + dir + tabs.length) % tabs.length];
    next.focus();
    showPage(next.dataset.tab);
  });

  $('search').addEventListener('input', (e) => {
    state.query = e.target.value;
    ui.renderPlaceList(visiblePlaces(), state.selectedId);
  });

  $('pose-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const pose = ui.readPoseForm();
    if (pose) globe.flyTo(pose, { duration: 1200 });
  });

  $('share').addEventListener('click', copyLink);

  $('measure').addEventListener('click', () => {
    state.measuring = !state.measuring;
    state.measurePts = [];
    globe.setMeasure(null);
    ui.setMeasureMode(state.measuring);
    if (!state.measuring) ui.hideMeasure();
  });

  $('timeline-toggle').addEventListener('click', () => {
    setTimeline(!$('timeline').classList.contains('open'));
  });

  $('splat-toggle').addEventListener('click', () => {
    const on = $('splat-toggle').getAttribute('aria-pressed') !== 'true';
    $('splat-toggle').setAttribute('aria-pressed', String(on));
    globe.setSplatsVisible(on);
  });
  $('overlay-toggle').addEventListener('click', () => {
    setOverlays($('overlay-toggle').getAttribute('aria-pressed') !== 'true');
  });

  $('rail-toggle').addEventListener('click', () => {
    setRail($('rail-toggle').getAttribute('aria-expanded') !== 'true');
  });

  $('mode-live').addEventListener('click', () => setTimeMode('live'));
  $('mode-capture').addEventListener('click', () => setTimeMode('capture'));

  $('play').addEventListener('click', () => {
    state.playing = !state.playing;
    ui.renderTimeline(state, selected(), sky);
  });
  $('speed').addEventListener('change', (e) => {
    state.speed = parseFloat(e.target.value) || 60;
  });
  $('scrub').addEventListener('input', (e) => {
    state.offsetH = parseFloat(e.target.value) || 0;
    state.playing = false;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.measuring) $('measure').click();
    if (e.target.matches('input, select, textarea, button, a')) return;
    if (e.code === 'Space' && state.timeMode === 'live') {
      e.preventDefault();
      $('play').click();
    }
  });

  onSettings(onSettingsChanged);
  window.addEventListener('pagehide', saveView);
}

function readUrl() {
  const q = new URLSearchParams(location.search || sessionStorage.getItem(VIEW_KEY) || '');
  if (q.get('m') === 'capture') state.timeMode = 'capture';
  if (q.has('o')) state.offsetH = wrapHours(parseFloat(q.get('o')) || 0);
  if (QUALITY_BUDGET[q.get('q')]) state.quality = q.get('q');
  return q;
}

async function init() {
  mountShell();

  globe = new Globe($('canvas-host'));
 
  globe.setTheme(resolvedTheme() === 'light');

  try {
    state.places = await loadPlaces();
  } catch (err) {
    ui.toast(`Could not load registry: ${err.message}`);
    state.places = [];
  }

  globe.setPlaces(state.places);
  labels = ui.createLabels(state.places, (id) => selectPlace(id));
  globe.frameHooks.push(onFrame);
  bindControls();

  // Initial panel and overlay state from settings
  setRail(settings.railOpen);
  setOverlays(settings.overlays);
  setTimeline(settings.timelineOpen);
  showPage('places');

  const q = readUrl();
  const fromUrl = q.get('place') && placeById(q.get('place'));
  const start = fromUrl ? q.get('place') : defaultPlace(state.places)?.id;

  if (start) {
    selectPlace(start, { fly: false, show: false });
    if (q.has('lat') && q.has('lon')) {
      globe.flyTo(
        {
          lat: parseFloat(q.get('lat')),
          lon: parseFloat(q.get('lon')),
          alt: parseFloat(q.get('alt')) || 900,
          hd: parseFloat(q.get('hd')) || 0,
          pt: parseFloat(q.get('pt')) || -40,
        },
        { instant: true },
      );
    } else {
      const p = placeById(start);
      globe.flyTo({ lat: p.lat, lon: p.lon, alt: 900, hd: 0, pt: -40 });
    }
  } else {
    renderPanels();
  }
  if (!state.places.length) ui.toast('No places available. Check registry/places.json.');
}

// ---------- live training ----------

let liveVersion = 0;

/** Poll the live training output: status line, and the splats whenever a new version is published. */
async function pollLive() {
  try {
    const res = await fetch('./live/status.json', { cache: 'no-store' });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) {
      ui.setTraining(null);
      return;
    }
    const status = await res.json();
    ui.setTraining(status);
    if (status.version && status.version !== liveVersion) {
      const bin = await fetch(`./live/earth-clouds.splat?v=${status.version}`, { cache: 'no-store' });
      if (bin.ok) {
        await globe.setGlobalSplats(parseSplatBuffer(await bin.arrayBuffer()));
        liveVersion = status.version;
        document.querySelector('.stage').dataset.globalSplats = String(globe.globalCount);
      }
    }
  } catch {
    ui.setTraining(null);
  }
}

setInterval(pollLive, 1500);
pollLive();
init();