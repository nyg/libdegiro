import { useState } from 'react';
import { CheckCircle2, Copy, TriangleAlert } from 'lucide-react';
import { diagnosticsText } from '@/lib/analytics';
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
import { MoneyList } from '@/components/money-list';

export function HealthSection() {
  const { health, result } = useAnalytics();
  const [copied, setCopied] = useState(false);

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
            : 'Some rows need attention'}
        </AlertTitle>
        <AlertDescription>
          Parsed {health.rows} rows using the {result.dialect.id} dialect. {health.errors.length}{' '}
          errors, {health.warnings.length} warnings, {health.unknown.length} unrecognised
          descriptions.
        </AlertDescription>
      </Alert>

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
                <TableHead className="text-right">Discrepancies</TableHead>
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
                    {entry.discrepancies.length === 0 ? '—' : entry.discrepancies.length}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
            Copies counts and unrecognised description text only — never amounts, ISINs, product
            names or dates.
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
