import { mountIcons } from './icons.js';
import { applyTheme, onSettings, resolvedTheme, updateSettings } from './settings.js';

/** Top bar shared by every page: current link, theme, full screen. */
export function mountShell() {
  mountIcons();
  applyTheme();

  const page = document.body.dataset.page;
  for (const link of document.querySelectorAll('.nav-link')) {
    if (link.dataset.route === page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    updateSettings({ theme: resolvedTheme() === 'dark' ? 'light' : 'dark' });
  });

  const fs = document.getElementById('fullscreen-toggle');
  fs?.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', syncFullscreen);
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyF' && !e.target.matches('input, select, textarea, button, a')) toggleFullscreen();
  });

  onSettings(() => applyTheme());
}

export function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
  } else {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }
}

function syncFullscreen() {
  const on = Boolean(document.fullscreenElement);
  const btn = document.getElementById('fullscreen-toggle');
  if (!btn) return;
  btn.setAttribute('aria-pressed', String(on));
  btn.title = on ? 'Exit full screen (F)' : 'Full screen (F)';
}