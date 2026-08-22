import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * No single free site resolves every ISIN into something a holder wants to
 * read, so the destination follows the instrument.
 *
 * justETF has the profile — holdings, TER, domicile, replication — for a fund,
 * and no page at all for an ordinary share. Börse Frankfurt is the reverse: its
 * `/equity/{isin}` path resolves any listed share, Swiss or American, but its
 * fund pages are addressed by slug rather than by ISIN. An ISIN carries no
 * instrument type, so the product name decides.
 *
 * Navigation, not a request: the app's `connect-src 'none'` policy is untouched
 * and nothing about the statement leaves this tab until the user clicks.
 */
const FUND_NAME = /\b(etf|etc|etn|ucits|fund|fonds|sicav|index|trust)\b/i;

interface Destination {
  readonly url: string;
  readonly site: string;
}

function destinationFor(isin: string, product: string | null): Destination {
  const encoded = encodeURIComponent(isin);
  return product !== null && FUND_NAME.test(product)
    ? { url: `https://www.justetf.com/en/etf-profile.html?isin=${encoded}`, site: 'justETF' }
    : { url: `https://www.boerse-frankfurt.de/equity/${encoded}`, site: 'Börse Frankfurt' };
}

export function IsinLink({
  isin,
  product = null,
  className,
}: {
  isin: string;
  product?: string | null;
  className?: string;
}) {
  const { url, site } = destinationFor(isin, product);

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title={`Look up ${isin} on ${site}`}
      className={cn(
        'tabular text-muted-foreground hover:text-foreground group inline-flex items-center gap-1 text-xs underline decoration-dotted underline-offset-4',
        className,
      )}
    >
      {isin}
      <ExternalLink
        className="size-3 opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </a>
  );
}
