/** Options controlling how raw CSV text is split into rows and cells. */
export interface TokenizeOptions {
  /** Field delimiter. Defaults to `,`. */
  readonly delimiter?: string;
}

/** The `papaparse` configuration shared by the sync and streaming tokenizers. */
export const papaParseOptions = (options: TokenizeOptions) => ({
  delimiter: options.delimiter ?? ',',
  header: false,
  skipEmptyLines: true,
  // papaparse strips a BOM from string input, but from a stream only when
  // `header` is on -- without this the first header cell keeps its U+FEFF.
  beforeFirstChunk: (chunk: string) => (chunk.charCodeAt(0) === 0xfeff ? chunk.slice(1) : chunk),
});
