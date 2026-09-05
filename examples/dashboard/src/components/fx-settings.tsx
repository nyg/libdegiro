import { Globe } from 'lucide-react';
import { useStatement } from '@/state/statement-context';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FRANKFURTER_ORIGIN } from '@/lib/fx';
import type { FxStatus } from '@/state/use-fx-rates';

const STATUS: Record<FxStatus, string> = {
  off: 'Off. Figures that need a rate stay blank, and no request is made.',
  unnecessary: 'Not needed: this statement is denominated in a single currency.',
  loading: 'Fetching rates…',
  ready: 'Rates loaded.',
  stale: 'The request failed. Showing the rates cached from an earlier visit.',
  failed: 'Rates could not be fetched. Figures that need one stay blank.',
};

export function FxSettings() {
  const { fx, fxPreference, setFx } = useStatement();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" title="Exchange rates">
          <Globe className="size-4" aria-hidden />
          {fxPreference.enabled ? (fx.base ?? 'FX') : 'FX off'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 text-sm">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <Switch
              id="fx-enabled"
              checked={fxPreference.enabled}
              onCheckedChange={(enabled) => setFx({ ...fxPreference, enabled })}
            />
            <div className="flex flex-col gap-1">
              <Label htmlFor="fx-enabled" className="font-medium">
                Convert with ECB rates
              </Label>
              <p className="text-muted-foreground text-xs">
                Fills in the figures this statement cannot produce on its own: a profit on an
                instrument bought and sold in different currencies, and a fee charged in a currency
                its trade did not settle in.
              </p>
            </div>
          </div>

          {fxPreference.enabled && fx.currencies.length > 1 ? (
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="fx-base" className="text-xs font-normal">
                Convert into
              </Label>
              <Select
                value={fx.base ?? ''}
                onValueChange={(base) => setFx({ ...fxPreference, base })}
              >
                <SelectTrigger id="fx-base" size="sm" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fx.currencies.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <p className="text-muted-foreground text-xs">
            {STATUS[fx.status]}
            {fx.status === 'ready' && fx.asOf ? ` Latest published rate: ${fx.asOf}.` : ''}
          </p>

          <p className="text-muted-foreground border-t pt-3 text-xs">
            This is the only request this app ever makes. It goes to{' '}
            <span className="font-mono">{FRANKFURTER_ORIGIN}</span>, once per statement, and carries
            a date range and the currency codes{' '}
            <span className="font-mono">{fx.symbols.join(', ') || '—'}</span>. No ISIN, amount or
            holding is ever sent, here or anywhere.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
