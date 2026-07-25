import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const srcDir = fileURLToPath(new URL('../src', import.meta.url));

/**
 * Third-party packages the root entry is allowed to import.
 *
 * This is a dependency-surface check, **not** a browser-safety check. An import
 * graph free of Node builtins proves very little on its own: `csv-parse/sync`
 * imports none, yet reaches for the `Buffer` global at module scope and so
 * throws on import in a browser. Browser safety is proven by actually running
 * the browser bundle without Node's globals — see the suite at the bottom.
 */
const ALLOWED_DEPENDENCIES = ['big.js', 'csv-parse/sync'];

const builtins = new Set(builtinModules);
const isNodeBuiltin = (specifier: string): boolean =>
  specifier.startsWith('node:') || builtins.has(specifier);

const SPECIFIER_PATTERNS = [/\bfrom\s*['"]([^'"]+)['"]/g, /^\s*import\s*['"]([^'"]+)['"]/gm];

const specifiersOf = (source: string): string[] =>
  SPECIFIER_PATTERNS.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1]!));

const resolveRelative = (fromFile: string, specifier: string): string => {
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, `${base}/index.ts`]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Cannot resolve '${specifier}' from ${relative(srcDir, fromFile)}`);
};

/** Walk the static import graph of an entry file, staying inside `src/`. */
function collectImports(entry: string): { files: string[]; bare: Set<string> } {
  const visited = new Set<string>();
  const bare = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);

    for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
      if (specifier.startsWith('.')) queue.push(resolveRelative(file, specifier));
      else bare.add(specifier);
    }
  }

  return { files: [...visited], bare };
}

describe('the root entry point', () => {
  const { files, bare } = collectImports(resolve(srcDir, 'index.ts'));

  it('reaches a non-trivial part of the library', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('imports no Node builtin', () => {
    expect([...bare].filter(isNodeBuiltin)).toEqual([]);
  });

  it('pulls in no dependency beyond the reviewed allowlist', () => {
    expect([...bare].sort()).toEqual([...ALLOWED_DEPENDENCIES].sort());
  });

  it('does not reach the Node-only modules', () => {
    const nodeOnly = files
      .map((file) => relative(srcDir, file))
      .filter((path) => path.startsWith('io/') || path === 'csv/rowStream.ts');
    expect(nodeOnly).toEqual([]);
  });
});

describe('the node entry point', () => {
  const { bare } = collectImports(resolve(srcDir, 'node.ts'));

  it('is where the Node builtins live', () => {
    expect([...bare].filter(isNodeBuiltin).sort()).toEqual([
      'node:fs',
      'node:fs/promises',
      'node:stream',
    ]);
  });
});

const browserBundle = resolve(srcDir, '../dist/index.browser.js');
const fixture = resolve(srcDir, '../test/fixtures/Account.csv');

/**
 * Run a snippet in a child process with Node's `Buffer` global removed, which is
 * the closest we get to a browser without booting one. A child process is
 * required: deleting `Buffer` in-process breaks vitest itself.
 */
function runWithoutBuffer(body: string): string {
  const script = `
    import { readFileSync } from 'node:fs';
    const csv = readFileSync(${JSON.stringify(fixture)}, 'utf8');
    delete globalThis.Buffer;
    const lib = await import(${JSON.stringify(pathToFileURL(browserBundle).href)});
    ${body}
  `;
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

describe('the browser bundle', () => {
  it('is built by `pnpm build`', () => {
    expect(existsSync(browserBundle)).toBe(true);
  });

  it('parses a statement with no Buffer global', () => {
    const out = runWithoutBuffer(`
      const result = lib.parseDegiroCsv(csv);
      process.stdout.write(JSON.stringify({
        movements: result.movements.length,
        errors: result.errors.length,
        buffer: typeof globalThis.Buffer,
      }));
    `);
    expect(JSON.parse(out)).toEqual({ movements: 236, errors: 0, buffer: 'undefined' });
  });

  it('reconciles and aggregates with no Buffer global', () => {
    const out = runWithoutBuffer(`
      const { movements } = lib.parseDegiroCsv(csv);
      process.stdout.write(JSON.stringify({
        ok: lib.reconcileBalances(movements).ok,
        fees: lib.summarizePortfolio(movements).fees.map(String),
      }));
    `);
    expect(JSON.parse(out)).toEqual({ ok: true, fees: ['-40.57 CHF', '-46.23 EUR'] });
  });
});
