/**
 * Node-only entry point — `libdegiro/node`.
 *
 * Everything exported here depends on Node builtins (`node:fs`, `node:stream`).
 * They live behind a separate entry so the root `libdegiro` entry stays free of
 * Node builtins and can be bundled for browsers, Deno, workers and edge runtimes.
 */

export * from './csv/rowStream';
export * from './io/index';
