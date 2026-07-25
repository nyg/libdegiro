import { useAnalytics } from '@/state/statement-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MoneyList } from '@/components/money-list';
import { formatQuantity } from '@/lib/format';

const PNL_CAVEATS: Record<string, string> = {
  default:
    'Realised profit and loss could not be computed unambiguously — usually because the instrument was traded in more than one currency, or a sale had no matching purchase inside this statement.',
};

export function PositionsSection() {
  const { portfolio } = useAnalytics();
  const pnlByIsin = new Map(portfolio.realizedPnl.map((entry) => [entry.isin, entry]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Positions</CardTitle>
        <CardDescription>
          Quantities only. The statement carries no market prices, so there is no current value and
          no unrealised profit or loss. Realised P/L is FIFO, computed within this statement&rsquo;s
          date range, and excludes fees.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Instrument</TableHead>
                <TableHead>ISIN</TableHead>
                <TableHead className="text-right">Bought</TableHead>
                <TableHead className="text-right">Sold</TableHead>
                <TableHead className="text-right">Held</TableHead>
                <TableHead className="text-right">Realised P/L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {portfolio.positions.map((position) => {
                const pnl = pnlByIsin.get(position.isin);
                const closed = position.quantity === 0;
                return (
                  <TableRow key={position.isin}>
                    <TableCell className="max-w-xs">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{position.product ?? position.isin}</span>
                        {closed ? (
                          <Badge variant="outline" className="shrink-0">
                            closed
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="tabular text-muted-foreground text-xs">
                      {position.isin}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatQuantity(position.bought)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {formatQuantity(position.sold)}
                    </TableCell>
                    <TableCell className="tabular text-right font-medium">
                      {formatQuantity(position.quantity)}
                    </TableCell>
                    <TableCell className="text-right">
                      {pnl?.amount ? (
                        <MoneyList amounts={[pnl.amount]} size="sm" signed className="items-end" />
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground cursor-help text-sm underline decoration-dotted">
                              n/a
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            {PNL_CAVEATS.default}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
