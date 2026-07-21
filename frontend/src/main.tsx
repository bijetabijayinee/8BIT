import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './styles/global.css';

document.documentElement.classList.remove('dark');
window.localStorage.removeItem('careflow-theme');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Fade out the first-paint splash once the app has mounted, keeping it visible
// for a short minimum so the animation is actually seen rather than flashing.
function dismissSplash() {
  const splash = document.getElementById('app-splash');
  if (!splash) {
    return;
  }
  const MIN_VISIBLE_MS = 1100;
  const start = (window as { __cfSplashStart?: number }).__cfSplashStart ?? Date.now();
  const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - start));
  window.setTimeout(() => {
    splash.classList.add('is-hidden');
    splash.addEventListener('transitionend', () => splash.remove(), { once: true });
    // Fallback removal in case the transition never fires.
    window.setTimeout(() => splash.remove(), 700);
  }, remaining);
}

if (document.readyState === 'complete') {
  dismissSplash();
} else {
  window.requestAnimationFrame(() => window.requestAnimationFrame(dismissSplash));
}
