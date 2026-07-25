import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';

/**
 * This app must never talk to a network. In production the CSP enforces that;
 * in development it would fail silently, so make it fail loudly instead. Any
 * dependency that phones home breaks on the first dev run rather than shipping.
 */
if (import.meta.env.DEV) {
  const forbid = (api: string) => () => {
    throw new Error(`${api} is forbidden: this dashboard makes no network calls`);
  };
  window.fetch = forbid('fetch') as never;
  window.XMLHttpRequest = forbid('XMLHttpRequest') as never;
  navigator.sendBeacon = forbid('navigator.sendBeacon') as never;
}

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
