/**
 * The exchange an annual connectivity fee relates to appears only in the raw
 * description, never in a parsed field:
 *
 *   Frais de connexion aux places boursières 2024 (Euronext Amsterdam - EAM)
 *   Frais de connexion aux places boursières 2025 (- - FX)
 */
export interface ExchangeRef {
  /** Short venue code, e.g. `EAM`. */
  readonly code: string | null;
  /** Venue name, e.g. `Euronext Amsterdam`. */
  readonly name: string | null;
  /** The parenthesised text verbatim, for display when parsing is partial. */
  readonly raw: string;
  /** Best available human label. */
  readonly label: string;
}

const TRAILING_PARENS = /\(([^)]*)\)\s*$/;

/** A lone `-` is DEGIRO's placeholder for "not applicable", not a name. */
const clean = (value: string | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' || trimmed === '-' ? null : trimmed;
};

/**
 * Parse the venue out of a connectivity-fee description. Returns `null` rather
 * than guessing when the description has no trailing parenthesised group, so
 * unparseable rows can be counted and surfaced instead of silently mislabelled.
 */
export function parseExchange(description: string): ExchangeRef | null {
  const match = TRAILING_PARENS.exec(description);
  if (!match) return null;

  const raw = match[1] ?? '';
  // Split on the LAST separator: venue names may themselves contain " - ".
  const separator = raw.lastIndexOf(' - ');
  const name = clean(separator === -1 ? raw : raw.slice(0, separator));
  const code = clean(separator === -1 ? undefined : raw.slice(separator + 3));

  return { code, name, raw: raw.trim(), label: name ?? code ?? 'Unknown exchange' };
}
