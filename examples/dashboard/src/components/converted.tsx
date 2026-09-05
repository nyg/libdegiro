import type { ReactNode } from 'react';
import type { ConvertedTotal } from '@/lib/analytics';
import { MoneyList } from '@/components/money-list';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function Approx({ explanation, children }: { explanation: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex cursor-help items-center justify-end gap-1">
          <span className="text-muted-foreground text-xs">≈</span>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{explanation}</TooltipContent>
    </Tooltip>
  );
}

export function Unavailable({ explanation }: { explanation: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-muted-foreground cursor-help text-sm underline decoration-dotted">
          n/a
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{explanation}</TooltipContent>
    </Tooltip>
  );
}

export function TotalAmount({
  total,
  converted,
  unavailable,
  signed = false,
}: {
  total: ConvertedTotal;
  converted: string;
  unavailable: string;
  signed?: boolean;
}) {
  if (total.amount === null) return <Unavailable explanation={unavailable} />;

  const money = (
    <MoneyList amounts={[total.amount]} size="sm" signed={signed} className="items-end" />
  );

  return total.converted ? <Approx explanation={converted}>{money}</Approx> : money;
}
