import { createElement, PanelLeft, Sun, Moon, Maximize, Minimize, Eye, EyeOff, Layers } from 'lucide';

const ICONS = {
  panel: PanelLeft,
  sun: Sun,
  moon: Moon,
  expand: Maximize,
  collapse: Minimize,
  eye: Eye,
  eyeOff: EyeOff,
  layers: Layers,
};

/** Replace each <span data-icon="name"> with the matching Lucide SVG. */
export function mountIcons(root = document) {
  for (const holder of root.querySelectorAll('[data-icon]')) {
    const Icon = ICONS[holder.dataset.icon];
    if (!Icon) continue;
    const svg = createElement(Icon);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('class', holder.className);
    holder.replaceWith(svg);
  }
}