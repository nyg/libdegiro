import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = fileURLToPath(new URL('../src', import.meta.url));

/**
 * Third-party packages the browser-safe entry is allowed to pull in. Adding one
 * here is a deliberate statement that it carries no Node builtins of its own.
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

  it('imports no Node builtin, so it bundles for browsers and edge runtimes', () => {
    expect([...bare].filter(isNodeBuiltin)).toEqual([]);
  });

  it('depends only on packages known to be free of Node builtins', () => {
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
