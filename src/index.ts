/**
 * libdegiro — parse DEGIRO account statement exports into a typed domain model.
 *
 * This entry point is free of Node builtins, so it bundles for browsers, Deno,
 * workers and edge runtimes. File- and stream-based helpers live in
 * `libdegiro/node`.
 */

export const version = '0.1.0';

export * from './errors';
export * from './money/money';
export * from './csv/tokenizer';
export * from './dialects/index';
export * from './records/index';
export * from './classify/index';
export * from './group/index';
export * from './parse';
export * from './validate/index';
export * from './portfolio/index';
