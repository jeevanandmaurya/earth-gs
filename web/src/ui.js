import { bodyElevation } from './geo.js';
import { STATUS, fmtCoord, fmtDate, fmtDistance, fmtUTC, statusOf } from './data.js';
import { getSettings } from './settings.js';
import { lodForAltitude } from './lod.js';

const $ = (id) => document.getElementById(id);

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const FILTERS = ['all', 'ready', 'training', 'queued', 'needs capture'];

export function renderChips(places, filter, onFilter) {
  const counts = { all: places.length };
  for (const p of places) {
    const s = statusOf(p);
    counts[s] = (counts[s] ?? 0) + 1;
  }
  const chips = $('chips');
  chips.innerHTML = FILTERS.filter((k) => k === 'all' || counts[k])
    .map(
      (k) =>
        `<button class="chip${k === filter ? ' on' : ''}" data-k="${esc(k)}" aria-pressed="${k === filter}">` +
        `${esc(k)} <span>${counts[k] ?? 0}</span></button>`,
    )
    .join('');
  chips.querySelectorAll('button').forEach((b) => (b.onclick = () => onFilter(b.dataset.k)));
}

function lodTicks(p) {
  return Array.from({ length: p.targetLOD }, (_, k) => `<b class="${k < p.achievedLOD ? 'full' : ''}"></b>`).join('');
}

export function renderPlaceList(places, selectedId) {
  $('place-count').textContent = String(places.length);
  $('place-list').innerHTML =
    places
      .map((p, i) => {
        const s = statusOf(p);
        return (
          `<li><button class="card${p.id === selectedId ? ' on' : ''}" data-id="${esc(p.id)}" style="--i:${i}">` +
          `<span class="card-idx">${String(i + 1).padStart(2, '0')}</span>` +
          `<span class="card-main"><span class="card-name">${esc(p.name)}</span>` +
          `<span class="card-meta"><i class="dot" style="--c:${STATUS[s].color}"></i>` +
          `${esc(s)} · LOD ${p.achievedLOD}/${p.targetLOD} · tier ${esc(p.licenseTier)}</span></span>` +
          `<span class="lod" aria-hidden="true">${lodTicks(p)}</span></button></li>`
        );
      })
      .join('') || '<li class="empty">No places match this filter.</li>';
}

function sunPhase(elev) {
  if (elev < -6) return 'night';
  if (elev < 0) return 'twilight';
  if (elev < 10) return 'low sun';
  return 'daylight';
}

let chunkStatusText = 'checking…';

/** Status of the splat chunk for the selected place, shown on the Details page. */
export function setChunkStatus(text) {
  chunkStatusText = text;
  const el = $('chunk-status');
  if (el) el.textContent = text;
}

export function renderDetail(p, sky) {
  const el = $('detail');
  if (!p) {
    el.innerHTML =
      '<h2 class="kicker">Selected</h2><p class="muted">Choose a place to see its registry record.</p>';
    return;
  }
  const s = statusOf(p);
  const hasSplat = p.achievedLOD > 0;
  el.innerHTML = `
    <h2 class="kicker">Selected · ${esc(p.id)}</h2>
    <h3 class="title">${esc(p.name)}</h3>
    <p class="coords">${fmtCoord(p.lat, 'N', 'S')} &nbsp;·&nbsp; ${fmtCoord(p.lon, 'E', 'W')}</p>
    <dl class="facts">
      <div><dt>status</dt><dd><i class="dot" style="--c:${STATUS[s].color}"></i>${esc(s)}</dd></div>
      <div><dt>detail level</dt><dd>LOD ${p.achievedLOD} of ${p.targetLOD}</dd></div>
      <div><dt>licence tier</dt><dd>${esc(p.licenseTier)}</dd></div>
      <div><dt>registration</dt><dd>${p.registrationErrorM == null ? 'unregistered' : `${p.registrationErrorM} m`}</dd></div>
      <div><dt>last verified</dt><dd>${esc(fmtDate(p.lastVerified))}</dd></div>
      <div><dt>sun at site</dt><dd id="sun-at-site">—</dd></div>
      <div><dt>votes</dt><dd>${p.votes ?? 0}</dd></div>
      <div><dt>splat chunk</dt><dd id="chunk-status">${esc(chunkStatusText)}</dd></div>
      <div><dt>sources</dt><dd>${(p.sources || []).map(esc).join(', ') || 'none yet'}</dd></div>
    </dl>
    ${p.note ? `<p class="note">${esc(p.note)}</p>` : ''}
    <p class="proxy-note">${
      hasSplat
        ? 'PROXY · stand-in geometry drawn at this site. It is not captured data.'
        : 'No splat data yet. Shown as a marker only.'
    }</p>
    <div class="actions">
      <button class="btn" data-act="fly">Fly here</button>
      <button class="btn ghost" data-act="contribute-data">Contribute data</button>
      <button class="btn ghost" data-act="contribute-compute">Contribute compute</button>
    </div>`;
  updateSunAtSite(p, sky);
}

export function updateSunAtSite(p, sky) {
  const out = $('sun-at-site');
  if (!out) return;
  if (!p || !sky) {
    out.textContent = '—';
    return;
  }
  const elev = bodyElevation(p.lat, p.lon, sky.sun);
  out.textContent = `${Math.round(elev)}° · ${sunPhase(elev)}`;
}

/** Floating labels over the globe. Returns Map(id -> element). */
export function createLabels(places, onClick) {
  const host = $('labels');
  host.innerHTML = '';
  const map = new Map();
  for (const p of places) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'label';
    el.innerHTML = `<i style="--c:${STATUS[statusOf(p)].color}"></i>${esc(p.name.split(' - ')[0])}`;
    el.addEventListener('click', () => onClick(p.id));
    host.appendChild(el);
    map.set(p.id, el);
  }
  return map;
}

export function placeLabels(globe, labels, selectedId) {
  for (const [id, el] of labels) {
    const p = globe.projectPlace(id);
    if (!p) continue;
    el.style.display = p.visible ? '' : 'none';
    if (p.visible) el.style.transform = `translate(${p.x}px, ${p.y}px)`;
    el.classList.toggle('on', id === selectedId);
  }
}
export function renderTicker(pose) {
  $('ticker').textContent =
    `focus ${fmtCoord(pose.lat, 'N', 'S')} ${fmtCoord(pose.lon, 'E', 'W')}  ·  ` +
    `view LOD ${lodForAltitude(pose.alt).level} ${lodForAltitude(pose.alt).name}  ·  eye ${Math.round(pose.alt)} m  ·  heading ${pose.hd.toFixed(0)}°  ·  pitch ${pose.pt.toFixed(0)}°`;
}

export function renderClock(date, mode) {
  $('clock').textContent = fmtUTC(date);
  $('clock-label').textContent = mode === 'capture' ? 'CAPTURE UTC' : 'SIM UTC';
}

export function renderTimeline(state, p, sky) {
  const live = state.timeMode === 'live';
  const hasCapture = Boolean(p?.lastVerified);
  $('mode-live').setAttribute('aria-pressed', String(live));
  $('mode-capture').setAttribute('aria-pressed', String(!live));
  $('mode-capture').title = hasCapture ? 'Sky at the time the photos were taken' : 'No capture time recorded for this place';
  $('play').disabled = !live;
  $('speed').disabled = !live;
  $('scrub').disabled = !live;
  $('play').textContent = state.playing ? '❚❚' : '▶';
  $('play').setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
  if (live && document.activeElement !== $('scrub')) $('scrub').value = String(state.offsetH);
  $('scrub-out').textContent = live
    ? Math.abs(state.offsetH) < 0.02
      ? 'now'
      : `${state.offsetH > 0 ? '+' : ''}${state.offsetH.toFixed(2)} h`
    : 'capture time';

  let note;
  if (!live && hasCapture) {
    note = 'Sky at capture time. Splat lighting is baked in and matches that moment.';
  } else if (!live) {
    note = 'No capture time recorded here, so the live sky is shown.';
  } else if (p && p.achievedLOD > 0) {
    note = 'Live sky. Shading inside splat chunks stays at capture time and will not relight.';
  } else {
    note = 'Live sky, following the real UTC clock.';
  }
  $('notice').textContent = note;
  const scrubText = $('scrub-out').textContent;
  $('timeline-summary').textContent = live
    ? `${state.playing ? '▶ ' : ''}live · ${scrubText}`
    : 'capture time';
}

export function fillPoseForm(pose) {
  const f = $('pose-form');
  f.lat.value = pose.lat.toFixed(5);
  f.lon.value = pose.lon.toFixed(5);
  f.alt.value = Math.round(pose.alt);
  f.hd.value = pose.hd.toFixed(1);
  f.pt.value = pose.pt.toFixed(1);
}

export function poseFormHasFocus() {
  return $('pose-form').contains(document.activeElement);
}

/** Reads and validates the camera form. Returns {lat, lon, alt, hd, pt} or null after showing a toast. */
export function readPoseForm() {
  const f = $('pose-form');
  const v = {
    lat: parseFloat(f.lat.value),
    lon: parseFloat(f.lon.value),
    alt: parseFloat(f.alt.value),
    hd: parseFloat(f.hd.value),
    pt: parseFloat(f.pt.value),
  };
  if (!Number.isFinite(v.lat) || Math.abs(v.lat) > 89.9) return fail('Latitude must be between −89.9 and 89.9');
  if (!Number.isFinite(v.lon) || Math.abs(v.lon) > 180) return fail('Longitude must be between −180 and 180');
  if (!Number.isFinite(v.alt) || v.alt < 50 || v.alt > 60_000_000) return fail('Eye altitude must be 50 m to 60,000 km');
  if (!Number.isFinite(v.hd)) return fail('Heading must be a number');
  if (!Number.isFinite(v.pt) || v.pt > -5 || v.pt < -89) return fail('Pitch must be between −89° and −5°');
  return v;
}

function fail(msg) {
  toast(msg);
  return null;
}

export function showMeasure(meters, a, b) {
  const el = $('measure-out');
  el.hidden = false;
  if (!b) {
    el.textContent = `A set at ${fmtCoord(a.lat, 'N', 'S')} ${fmtCoord(a.lon, 'E', 'W')}. Click a second point.`;
    return;
  }
  const dist = fmtDistance(meters, getSettings().units);
  el.textContent = `${dist} great-circle distance (spherical approximation)`;
}

export function hideMeasure() {
  $('measure-out').hidden = true;
}

export function setMeasureMode(on) {
  $('measure').setAttribute('aria-pressed', String(on));
  $('measure').textContent = on ? 'Measuring · click two points' : 'Measure';
}

export function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

/** Opens the dialog with plain text. Never pass untrusted HTML here. */
export function openDialog(title, body) {
  $('dialog-title').textContent = title;
  $('dialog-body').textContent = body;
  $('dialog').showModal();
}
/** Training status from source-models/live/status.json, or null when no run is live. */
export function setTraining(s) {
  const el = $('training-status');
  if (!el) return;
  if (!s || !s.version) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const step = s.step ?? s.converted_step ?? 0;
  const total = s.total ?? null;
  const pct = total ? Math.min(100, (100 * step) / total) : 0;
  const trained = (s.splats ?? 0).toLocaleString();
  const shown = s.published_splats != null ? ` · ${s.published_splats.toLocaleString()} shown` : '';
  const psnr = s.psnr != null ? ` · PSNR ${s.psnr.toFixed(1)}` : '';
  const head = s.state === 'done' ? 'training finished' : s.state === 'stopped' ? 'training stopped' : 'training';
  el.innerHTML =
    `<span class="train-head">${esc(head)}</span>` +
    `<span class="train-text">step ${step}${total ? ` / ${total}` : ''} · ${trained} trained${shown}${psnr}</span>` +
    `<span class="train-bar" aria-hidden="true"><i style="width:${pct.toFixed(1)}%"></i></span>`;
}