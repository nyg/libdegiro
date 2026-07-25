import { useDeferredValue, useMemo, useState } from 'react';
import type { Transaction } from 'libdegiro';
import { feesOf } from '@/lib/analytics';
import { useAnalytics } from '@/state/statement-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { MoneyList } from '@/components/money-list';
import { formatDateTime, formatQuantity } from '@/lib/format';

const PAGE_SIZE = 250;

const TYPE_LABELS: Record<Transaction['type'], string> = {
  trade: 'Trade',
  fxTrade: 'FX trade',
  fxConversion: 'FX conversion',
  cashSweep: 'Cash sweep',
  single: 'Single',
  composite: 'Composite',
};

function describe(tx: Transaction): string {
  switch (tx.type) {
    case 'trade':
      return `${tx.side} ${formatQuantity(tx.quantity)} ${tx.product ?? tx.isin ?? ''}`.trim();
    case 'fxTrade':
      return `${tx.side} ${tx.pair ?? 'currency pair'}`;
    case 'fxConversion':
      return 'Currency conversion';
    case 'cashSweep':
      return 'Cash sweep';
    case 'single':
      return tx.movement.record.description;
    case 'composite':
      return `${tx.movements.length} related rows`;
  }
}

const searchable = (tx: Transaction): string =>
  tx.movements
    .map((m) => `${m.record.description} ${m.record.product ?? ''} ${m.record.isin ?? ''}`)
    .join(' ')
    .toLowerCase();

export function ActivitySection() {
  const { result } = useAnalytics();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<'all' | Transaction['type']>('all');
  const [feesOnly, setFeesOnly] = useState(false);
  const [page, setPage] = useState(0);

  // Keeps typing responsive without a hand-rolled debounce; the expensive
  // filter runs against the deferred value while the input stays live.
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return result.transactions.filter((tx) => {
      if (type !== 'all' && tx.type !== type) return false;
      if (feesOnly && feesOf(tx).length === 0) return false;
      if (needle && !searchable(tx).includes(needle)) return false;
      return true;
    });
  }, [result.transactions, deferredQuery, type, feesOnly]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const rows = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity</CardTitle>
        <CardDescription>
          Rows grouped into transactions, newest first — a trade appears with its fee and any
          currency conversion attached. Expand a row to see the underlying statement lines.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder="Search description, product or ISIN"
            className="max-w-xs"
          />
          <Select
            value={type}
            onValueChange={(next) => {
              setType(next as typeof type);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={feesOnly ? 'default' : 'outline'}
            onClick={() => {
              setFeesOnly((previous) => !previous);
              setPage(0);
            }}
          >
            With fees only
          </Button>
        </div>

        <p className="text-muted-foreground text-sm">
          {filtered.length} of {result.transactions.length} transactions
        </p>

        {rows.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            Nothing matches those filters.
          </p>
        ) : (
          <Accordion type="multiple" className="w-full">
            {rows.map((tx, index) => {
              const fees = feesOf(tx);
              return (
                <AccordionItem key={`${tx.orderId ?? 'no-order'}-${index}`} value={`row-${index}`}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="grid w-full grid-cols-[10rem_1fr_auto] items-center gap-3 pr-2 text-left">
                      <span className="tabular text-muted-foreground text-xs">
                        {formatDateTime(tx.date)}
                      </span>
                      <span className="flex min-w-0 items-center gap-2">
                        <Badge variant="outline" className="shrink-0">
                          {TYPE_LABELS[tx.type]}
                        </Badge>
                        <span className="truncate text-sm">{describe(tx)}</span>
                      </span>
                      {fees.length > 0 ? (
                        <Badge variant="secondary" className="shrink-0">
                          {fees.length} fee{fees.length === 1 ? '' : 's'}
                        </Badge>
                      ) : (
                        <span />
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-2 pl-2">
                      {tx.movements.map((movement, movementIndex) => (
                        <div
                          key={`${movement.record.line ?? movementIndex}`}
                          className="grid grid-cols-[5rem_1fr_auto] items-start gap-3 text-sm"
                        >
                          <span className="text-muted-foreground tabular text-xs">
                            line {movement.record.line ?? '—'}
                          </span>
                          <span className="min-w-0">
                            <Badge variant="outline" className="mr-2">
                              {movement.kind}
                            </Badge>
                            {movement.record.description}
                          </span>
                          <MoneyList
                            amounts={movement.amount ? [movement.amount] : []}
                            size="sm"
                            className="items-end"
                          />
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}

        {pageCount > 1 ? (
          <div className="flex items-center justify-between">
            <Button variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>
              Previous
            </Button>
            <span className="text-muted-foreground text-sm">
              Page {current + 1} of {pageCount}
            </span>
            <Button
              variant="outline"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
            >
              Next
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
