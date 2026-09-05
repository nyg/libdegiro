import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { FRANKFURTER_ORIGIN } from '@/lib/fx';

/**
 * The one host this app may talk to is Frankfurter, for ECB exchange rates. In
 * production the CSP enforces that; in development it would fail silently, so
 * make it fail loudly instead. Any dependency that phones home anywhere else
 * still breaks on the first dev run rather than shipping.
 */
if (import.meta.env.DEV) {
  const forbid = (api: string) => () => {
    throw new Error(`${api} is forbidden: this dashboard makes no network calls`);
  };
  const allowed = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith(`${FRANKFURTER_ORIGIN}/`)) return allowed(input, init);
    throw new Error(`fetch(${url}) is forbidden: the only allowed host is ${FRANKFURTER_ORIGIN}`);
  }) as typeof window.fetch;
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
