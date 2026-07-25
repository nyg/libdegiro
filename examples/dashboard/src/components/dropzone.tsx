import { useCallback, useRef, useState, type DragEvent } from 'react';
import { FileUp, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SAMPLE_FILE_NAME, sampleCsv } from '@/lib/sample';
import { useStatement } from '@/state/statement-context';

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
            Export it from DEGIRO under Inbox → Account statement.
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

      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <ShieldCheck className="size-4 shrink-0" aria-hidden />
        Your statement is parsed in this tab and never uploaded. The page blocks all network access,
        so you can verify that in your browser&rsquo;s Network tab.
      </p>
    </div>
  );
}
