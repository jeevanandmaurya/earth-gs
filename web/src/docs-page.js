import { mountShell } from './shell.js';
import { renderDocs } from './docs.js';

mountShell();
renderDocs(document.getElementById('docs-root'));