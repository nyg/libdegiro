import { parseDegiroCsv } from 'libdegiro';
import { sampleCsv } from '@/lib/sample';

// Placeholder: replaced by the real shell in the next commit. Exists so the
// build chain (Vite -> browser condition -> libdegiro) can be verified early.
export function App() {
  const result = parseDegiroCsv(sampleCsv);
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">DEGIRO statement dashboard</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Parsed {result.movements.length} movements into {result.transactions.length} transactions,
        with {result.errors.length} errors.
      </p>
    </main>
  );
}
