import { useCallback, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Download, FileUp, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SAMPLE_FILE_NAME, sampleCsv } from '@/lib/sample';
import { useStatement } from '@/state/statement-context';

function Ui({ children }: { children: ReactNode }) {
  return <span className="text-foreground font-medium">{children}</span>;
}

export function Dropzone() {
  const { load, state } = useStatement();
  const [dragging, setDragging] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const readFile = useCallback(
    async (file: File) => {
      setReadError(null);
      try {
        // File.text() reads from disk into memory. Nothing is uploaded — there
        // is no code path in this app that could.
        load(await file.text(), file.name);
      } catch (error) {
        setReadError(error instanceof Error ? error.message : 'Could not read that file');
      }
    },
    [load],
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files.item(0);
      if (file) void readFile(file);
    },
    [readFile],
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex w-full flex-col items-center gap-4 rounded-xl border-2 border-dashed px-8 py-14 text-center transition-colors',
          dragging ? 'border-primary bg-accent' : 'border-border',
        )}
      >
        <FileUp className="text-muted-foreground size-8" aria-hidden />
        <div className="space-y-1">
          <p className="font-medium">Drop your DEGIRO Account.csv here</p>
          <p className="text-muted-foreground text-sm">
            English and French statements are both recognised.
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.item(0);
            if (file) void readFile(file);
            event.target.value = '';
          }}
        />
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => inputRef.current?.click()}>Choose a file</Button>
          <Button variant="outline" onClick={() => load(sampleCsv, SAMPLE_FILE_NAME)}>
            Try the sample statement
          </Button>
        </div>

        {readError ? <p className="text-destructive text-sm">{readError}</p> : null}
        {state.status === 'error' ? (
          <p className="text-destructive text-sm">
            {state.fileName} could not be parsed: {state.message}
          </p>
        ) : null}
      </div>

      <section className="text-muted-foreground w-full space-y-3 text-sm">
        <h2 className="text-foreground flex items-center gap-2 font-medium">
          <Download className="size-4 shrink-0" aria-hidden />
          Exporting Account.csv from DEGIRO
        </h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Sign in to <Ui>degiro.com</Ui> in a browser. The statement export lives in the web
            client.
          </li>
          <li>
            Open <Ui>Inbox</Ui>, then the <Ui>Account statement</Ui> tab.
          </li>
          <li>
            Set <Ui>Start date</Ui> to the day you opened the account, or anything earlier, and{' '}
            <Ui>End date</Ui> to today. Every number here is computed from the rows in the file, so
            a narrower range silently gives you partial positions, fees and realized P/L.
          </li>
          <li>
            Leave <Ui>Curr.</Ui> on <Ui>All</Ui> and the product search empty, so no currency or
            instrument is filtered out.
          </li>
          <li>
            <Ui>Hide cash movements</Ui> only changes the table on screen. The export contains every
            row either way, and this dashboard needs those rows to reconcile your balances.
          </li>
          <li>
            Click the download button at the top right of the table and choose <Ui>CSV</Ui>. Drop
            the file it saves — <Ui>Account.csv</Ui> — above.
          </li>
        </ol>
      </section>

      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <ShieldCheck className="size-4 shrink-0" aria-hidden />
        Your statement is parsed in this tab and never uploaded. The only request the page can make
        is for exchange rates, carrying a date range and a list of currency codes; everything else
        is blocked outright. Verify both in your browser&rsquo;s Network tab.
      </p>
    </div>
  );
}
