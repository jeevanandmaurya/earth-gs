// User preferences, saved in this browser. Applied to the page and the globe by main.js.
export const DEFAULTS = {
  theme: 'dark', // 'system' | 'light' | 'dark'
  units: 'metric', // 'metric' | 'imperial'
  quality: 'desktop', // 'phone' | 'desktop'
  startMode: 'live', // 'live' | 'capture'
  railOpen: true,
  overlays: true,
  timelineOpen: false,
};

const KEY = 'earth-gs:settings';
const listeners = new Set();

function normalize(s) {
  const out = { ...DEFAULTS, ...s };
  if (!['system', 'light', 'dark'].includes(out.theme)) out.theme = DEFAULTS.theme;
  if (!['metric', 'imperial'].includes(out.units)) out.units = DEFAULTS.units;
  if (!['phone', 'desktop'].includes(out.quality)) out.quality = DEFAULTS.quality;
  if (!['live', 'capture'].includes(out.startMode)) out.startMode = DEFAULTS.startMode;
  out.railOpen = Boolean(out.railOpen);
  out.overlays = Boolean(out.overlays);
  out.timelineOpen = Boolean(out.timelineOpen);
  return out;
}

function load() {
  try {
    return normalize(JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch {
    return { ...DEFAULTS };
  }
}

let current = load();

export function getSettings() {
  return { ...current };
}

export function updateSettings(patch) {
  current = normalize({ ...current, ...patch });
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage can be blocked; settings still apply for this visit */
  }
  applyTheme();
  for (const fn of listeners) fn(current);
}

export function onSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The theme actually shown: 'system' follows the operating system. */
export function resolvedTheme() {
  if (current.theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return current.theme;
}

export function applyTheme() {
  document.documentElement.dataset.theme = resolvedTheme();
}

// Follow the OS when the setting is 'system'.
window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => {
  if (current.theme === 'system') {
    applyTheme();
    for (const fn of listeners) fn(current);
  }
});