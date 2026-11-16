import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/literata';
import '@fontsource-variable/literata/wght-italic.css';
import './styles.css';
import './editor.css';
import './wiki.css';
import App from './App';
import { flush } from './store';
import { isDesktop } from './utils';
import { saveChangedProjects } from './cloud/sync';

if (isDesktop) {
  // Make sure the last keystrokes reach the database, and the cloud if it's quick, before the window closes.
  import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
    getCurrentWindow().onCloseRequested(async () => {
      await flush();
      await Promise.race([saveChangedProjects(), new Promise((r) => setTimeout(r, 8000))]);
    });
  });
  // Keep the browser's context menu (spellcheck, copy/paste) only where you can type.
  document.addEventListener('contextmenu', (e) => {
    if (!(e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) e.preventDefault();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
