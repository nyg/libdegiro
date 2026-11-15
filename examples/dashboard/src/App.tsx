import { AppShell } from '@/components/app-shell'
import { TooltipProvider } from '@/components/ui/tooltip'
import { StatementProvider } from '@/state/statement'

export function App() {
   return (
      <TooltipProvider delayDuration={150}>
         <StatementProvider>
            <AppShell />
         </StatementProvider>
      </TooltipProvider>
   )
}
