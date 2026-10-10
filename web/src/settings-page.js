import { mountShell } from './shell.js';
import { DEFAULTS, getSettings, onSettings, updateSettings } from './settings.js';
import * as ui from './ui.js';

const $ = (id) => document.getElementById(id);

function sync() {
  const s = getSettings();
  $('set-theme').value = s.theme;
  $('set-units').value = s.units;
  $('set-quality').value = s.quality;
  $('set-start-mode').value = s.startMode;
  $('set-rail').checked = s.railOpen;
  $('set-overlays').checked = s.overlays;
  $('set-timeline').checked = s.timelineOpen;
}

mountShell();
sync();
onSettings(sync);

$('set-theme').addEventListener('change', (e) => updateSettings({ theme: e.target.value }));
$('set-units').addEventListener('change', (e) => updateSettings({ units: e.target.value }));
$('set-quality').addEventListener('change', (e) => updateSettings({ quality: e.target.value }));
$('set-start-mode').addEventListener('change', (e) => updateSettings({ startMode: e.target.value }));
$('set-rail').addEventListener('change', (e) => updateSettings({ railOpen: e.target.checked }));
$('set-overlays').addEventListener('change', (e) => updateSettings({ overlays: e.target.checked }));
$('set-timeline').addEventListener('change', (e) => updateSettings({ timelineOpen: e.target.checked }));
$('set-reset').addEventListener('click', () => {
  updateSettings({ ...DEFAULTS });
  ui.toast('Settings reset to defaults');
});