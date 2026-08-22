import { useState, type ReactNode } from 'react';
import type { BalanceDiscrepancy } from 'libdegiro';
import { CheckCircle2, Copy, Info, TriangleAlert } from 'lucide-react';
import {
  describeHealthNotes,
  describeHealthProblems,
  diagnosticsText,
  explainDiscrepancy,
} from '@/lib/analytics';
import { useAnalytics } from '@/state/statement-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { MoneyList } from '@/components/money-list';

function countKind(
  entries: readonly BalanceDiscrepancy[],
  kind: BalanceDiscrepancy['kind'],
): number {
  return entries.filter((entry) => entry.kind === kind).length;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 sm:grid-cols-[12rem_1fr]">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="tabular text-xs break-words">{children}</dd>
    </div>
  );
}

/**
 * A block, not a table row. The numbers that identify a discrepancy — both
 * lines, both balances, the statement's two readings of the same mutation —
 * do not fit five columns, and truncating them is exactly what made the old
 * panel unreportable.
 */
function DiscrepancyCard({ entry }: { entry: BalanceDiscrepancy }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant={entry.kind === 'rounding' ? 'secondary' : 'destructive'}>
          {entry.kind === 'rounding' ? 'Rounding' : 'Unexplained'}
        </Badge>
        <span className="text-sm font-medium">
          {entry.currency} · line {entry.line ?? '—'}
        </span>
        <span className="text-muted-foreground text-xs">{entry.movementKind}</span>
      </div>

      <p className="text-muted-foreground mb-3 font-mono text-xs break-words">
        {entry.description}
      </p>

      <dl className="flex flex-col gap-1">
        <Field label="Previous balance">
          {entry.previousBalance.toString()} (line {entry.previousLine ?? '—'})
        </Field>
        <Field label="Amount column says">{entry.statedMutation.toString()}</Field>
        <Field label="Balance moved by">{entry.appliedMutation.toString()}</Field>
        {entry.exactAmount ? (
          <Field label="Quantity × unit price">{entry.exactAmount.toString()}</Field>
        ) : null}
        <Field label="Expected balance">{entry.expected.toString()}</Field>
        <Field label="Reported balance">{entry.actual.toString()}</Field>
        <Field label="Difference">{entry.difference.toString()}</Field>
      </dl>

      <p className="text-muted-foreground mt-3 text-xs">{explainDiscrepancy(entry)}</p>
    </div>
  );
}

export function HealthSection() {
  const { health, result } = useAnalytics();
  const [copied, setCopied] = useState(false);
  const problems = describeHealthProblems(health);
  const notes = describeHealthNotes(health);

  const copyDiagnostics = async () => {
    // The clipboard is not a network destination, so this is CSP-safe and does
    // not weaken the no-upload promise.
    await navigator.clipboard.writeText(diagnosticsText(health, result.dialect.id));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6">
      <Alert variant={health.ok ? 'default' : 'destructive'}>
        {health.ok ? (
          <CheckCircle2 className="size-4" aria-hidden />
        ) : (
          <TriangleAlert className="size-4" aria-hidden />
        )}
        <AlertTitle>
          {health.ok
            ? 'Every row was understood and the balances reconcile'
            : `${problems.length} ${problems.length === 1 ? 'thing needs' : 'things need'} attention`}
        </AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          <span>
            Parsed {health.rows} rows using the {result.dialect.id} dialect. {health.errors.length}{' '}
            errors, {health.warnings.length} warnings, {health.unknown.length} unrecognised
            descriptions.
          </span>
          {problems.length > 0 ? (
            <ul className="list-disc space-y-1 pl-4">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}
        </AlertDescription>
      </Alert>

      {notes.length > 0 ? (
        <Alert>
          <Info className="size-4" aria-hidden />
          <AlertTitle>Worth knowing, but not a fault</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Balance reconciliation</CardTitle>
          <CardDescription>
            Every movement is replayed against the running balance the statement reports, per
            currency.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Currency</TableHead>
                <TableHead className="text-right">Rows checked</TableHead>
                <TableHead className="text-right">Opening</TableHead>
                <TableHead className="text-right">Closing</TableHead>
                <TableHead className="text-right">Rounding</TableHead>
                <TableHead className="text-right">Unexplained</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {health.reconciliation.byCurrency.map((entry) => (
                <TableRow key={entry.currency}>
                  <TableCell className="font-medium">{entry.currency}</TableCell>
                  <TableCell className="tabular text-right">{entry.checked}</TableCell>
                  <TableCell>
                    <MoneyList amounts={[entry.openingBalance]} size="sm" className="items-end" />
                  </TableCell>
                  <TableCell>
                    <MoneyList amounts={[entry.closingBalance]} size="sm" className="items-end" />
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {countKind(entry.discrepancies, 'rounding') || '—'}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {countKind(entry.discrepancies, 'unexplained') || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {health.reconciliation.discrepancies.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Balance discrepancies</CardTitle>
            <CardDescription>
              Rows where the replayed balance and the statement&rsquo;s own balance column disagree.
              Every figure behind the verdict is here, so this is what to send when one of them is
              wrong.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {health.reconciliation.discrepancies.map((entry, index) => (
              <DiscrepancyCard key={`${entry.currency}-${entry.line ?? index}`} entry={entry} />
            ))}
          </CardContent>
        </Card>
      ) : null}

      {health.unknownDescriptions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unrecognised descriptions</CardTitle>
            <CardDescription>
              These rows were kept, not dropped — but libdegiro has no classifier for them yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20 text-right">Count</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-24 text-right">First line</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {health.unknownDescriptions.map((entry) => (
                  <TableRow key={entry.description}>
                    <TableCell className="tabular text-right">{entry.count}</TableCell>
                    <TableCell className="font-mono text-xs">{entry.description}</TableCell>
                    <TableCell className="tabular text-right">{entry.firstLine ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report a parsing gap</CardTitle>
          <CardDescription>
            The summary is counts and unrecognised description text only. If a balance failed to
            reconcile, its arithmetic is appended — amounts, ISINs and product names for those rows
            only — because a report saying &ldquo;one transition is off&rdquo; cannot be acted on.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void copyDiagnostics()}>
            <Copy className="size-4" aria-hidden />
            {copied ? 'Copied' : 'Copy diagnostics'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
