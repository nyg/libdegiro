import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The promise this app makes is that a *statement* never leaves the browser, so
 * enforce it rather than merely stating it. `connect-src` names exactly one
 * host, Frankfurter, and every other fetch, XHR, WebSocket and beacon is
 * blocked. What can be sent there is a date range and a list of currency codes,
 * which is all its endpoint accepts — no ISINs, no amounts, no holdings — and
 * the app only calls it when the FX setting is on.
 *
 * Notes, each of which is load-bearing:
 *  - `style-src` must allow inline styles: Recharts sets them on every element
 *    and Vite injects a `<style>` block.
 *  - `frame-ancestors` and `report-uri` are ignored in a meta CSP, and GitHub
 *    Pages cannot set headers, so they are deliberately absent rather than
 *    implying protection we do not have.
 *  - `img-src` allows `blob:` so a chart can be exported to a canvas later.
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  'connect-src https://api.frankfurter.dev',
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

/**
 * Injected at build time only. A static CSP in index.html would break `vite dev`,
 * which needs a WebSocket for HMR and injects inline scripts.
 */
function cspMeta(): Plugin {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => ({
        html,
        tags: [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
            injectTo: 'head-prepend',
          },
        ],
      }),
    },
  };
}

export default defineConfig({
  // Served from https://<user>.github.io/libdegiro/.
  base: '/libdegiro/',
  plugins: [react(), tailwindcss(), cspMeta()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    sourcemap: false,
    // Vite's modulePreload polyfill is an *inline* script, which `script-src
    // 'self'` blocks -- the page would render blank with a lone console error.
    // Every browser we target supports modulepreload natively.
    modulePreload: { polyfill: false },
  },
});
