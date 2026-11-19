import type { ReactNode } from 'react'

import { MoneyList } from '@/components/money-list'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ConvertedTotal } from '@/lib/analytics'
import { cn } from '@/lib/utils'

export function Approx({
   explanation,
   children,
   className,
}: {
   explanation: string
   children: ReactNode
   className?: string
}) {
   return (
      <Tooltip>
         <TooltipTrigger asChild>
            <span className={cn('flex cursor-help items-center justify-end gap-1', className)}>
               <span className="text-muted-foreground text-xs">≈</span>
               {children}
            </span>
         </TooltipTrigger>
         <TooltipContent className="max-w-xs">{explanation}</TooltipContent>
      </Tooltip>
   )
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
   )
}

export function TotalAmount({
   total,
   converted,
   unavailable,
   signed = false,
}: {
   total: ConvertedTotal
   converted: string
   unavailable: string
   signed?: boolean
}) {
   if (total.amount === null) {
      return <Unavailable explanation={unavailable} />
   }

   const money = (
      <MoneyList amounts={[total.amount]} size="sm" signed={signed} className="items-end" />
   )

   return total.converted ? <Approx explanation={converted}>{money}</Approx> : money
}
