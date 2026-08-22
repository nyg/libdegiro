import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * justETF, because a DEGIRO statement is overwhelmingly ETFs and justETF is the
 * only free ISIN-addressable profile that shows holdings, TER and domicile
 * without an account. It has no page for an ordinary share, so the link is
 * marked as a lookup rather than dressed up as the instrument's home page.
 *
 * Navigation, not a request: the app's `connect-src 'none'` policy is untouched
 * and nothing about the statement leaves this tab until the user clicks.
 */
const profileUrl = (isin: string): string =>
  `https://www.justetf.com/en/etf-profile.html?isin=${encodeURIComponent(isin)}`;

export function IsinLink({ isin, className }: { isin: string; className?: string }) {
  return (
    <a
      href={profileUrl(isin)}
      target="_blank"
      rel="noreferrer noopener"
      title={`Look up ${isin} on justETF`}
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
