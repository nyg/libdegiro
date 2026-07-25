/** libdegiro — parse DEGIRO account statement exports into a typed domain model. */

export const version = '0.1.0';

export * from './errors';
export * from './money/money';
export * from './csv/tokenizer';
export * from './dialects/index';
export * from './records/index';
export * from './classify/index';
export * from './group/index';
export * from './parse';
export * from './io/index';
export * from './validate/index';
export * from './portfolio/index';
