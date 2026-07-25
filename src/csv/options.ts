/** Options controlling how raw CSV text is split into rows and cells. */
export interface TokenizeOptions {
  /** Field delimiter. Defaults to `,`. */
  readonly delimiter?: string;
}

/** The `csv-parse` configuration shared by the sync and streaming tokenizers. */
export const csvParseOptions = (options: TokenizeOptions) =>
  ({
    delimiter: options.delimiter ?? ',',
    // DEGIRO rows occasionally vary in trailing-column count.
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    // Preserve values exactly (double spaces in product names, etc.).
    trim: false,
    bom: true,
  }) as const;
