import { Receipt, Trash2 } from 'lucide-react';
import { useStatement } from '@/state/statement-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Dropzone } from '@/components/dropzone';
import { FeesSection } from '@/components/sections/fees';
import { OverviewSection } from '@/components/sections/overview';
import { CashSection } from '@/components/sections/cash';
import { PositionsSection } from '@/components/sections/positions';
import { IncomeSection } from '@/components/sections/income';
import { ActivitySection } from '@/components/sections/activity';
import { HealthSection } from '@/components/sections/health';

const TABS = [
  { value: 'fees', label: 'Fees', Component: FeesSection },
  { value: 'overview', label: 'Overview', Component: OverviewSection },
  { value: 'cash', label: 'Cash', Component: CashSection },
  { value: 'positions', label: 'Positions', Component: PositionsSection },
  { value: 'income', label: 'Income', Component: IncomeSection },
  { value: 'activity', label: 'Activity', Component: ActivitySection },
  { value: 'health', label: 'Parse health', Component: HealthSection },
] as const;

function Header() {
  const { state, clear, remember, setRemember, forgetAll } = useStatement();
  const loaded = state.status === 'ready';

  return (
    <header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
        <Receipt className="size-5 shrink-0" aria-hidden />
        <div className="mr-auto">
          <h1 className="leading-tight font-semibold">DEGIRO statement dashboard</h1>
          <p className="text-muted-foreground text-xs">
            Runs entirely in your browser. Nothing is uploaded.
          </p>
        </div>

        {loaded ? (
          <>
            <Badge variant="secondary" className="max-w-[16rem] truncate">
              {state.fileName}
            </Badge>
            <Separator orientation="vertical" className="hidden h-8 sm:block" />
            <div className="flex items-center gap-2">
              <Switch id="remember" checked={remember} onCheckedChange={setRemember} />
              <Label htmlFor="remember" className="text-xs font-normal">
                Remember on this device
              </Label>
            </div>
            <Button variant="outline" size="sm" onClick={clear}>
              Load another
            </Button>
            {remember ? (
              <Button variant="ghost" size="sm" onClick={forgetAll} title="Delete stored data">
                <Trash2 className="size-4" aria-hidden />
                Forget
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </header>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export function AppShell() {
  const { state, restoring, remember } = useStatement();

  return (
    <div className="min-h-dvh">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8">
        {restoring || state.status === 'parsing' ? (
          <LoadingState />
        ) : state.status === 'ready' ? (
          <Tabs defaultValue="fees" className="gap-6">
            <div className="overflow-x-auto">
              <TabsList>
                {TABS.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {TABS.map(({ value, Component }) => (
              <TabsContent key={value} value={value}>
                <Component />
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <div className="py-12">
            <Dropzone />
          </div>
        )}
      </main>

      <footer className="text-muted-foreground mx-auto max-w-7xl px-4 pb-10 text-xs">
        <Separator className="mb-4" />
        <p>
          Built on{' '}
          <a href="https://github.com/nyg/libdegiro" className="underline">
            libdegiro
          </a>
          . This page has no backend and blocks all network access via its content security policy.
          {remember
            ? ' Your statement is stored in this browser until you clear it.'
            : ' Nothing is stored — reloading starts over.'}
        </p>
      </footer>
    </div>
  );
}
