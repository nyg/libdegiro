import type { Money } from 'libdegiro'
import type { ReactNode } from 'react'

import { Approx } from '@/components/converted'
import { MoneyList } from '@/components/money-list'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ConvertedTotal } from '@/lib/analytics'
import { cn } from '@/lib/utils'

/**
 * Most KPIs here are a `Money[]` rather than a single figure, because the
 * library never nets across currencies. Pass `value` instead for the few stats
 * that are counts or dates, or `total` for one figure in the reference
 * currency, which falls back to `amounts` when it is unavailable.
 */
export function StatCard({
   title,
   amounts,
   total,
   converted,
   value,
   hint,
   footer,
   className,
   signed = false,
   hideZero = false,
}: {
   title: string
   amounts?: readonly Money[]
   total?: ConvertedTotal
   /** Tooltip on a `total` that came out of a rate. */
   converted?: string
   value?: ReactNode
   hint?: string
   footer?: ReactNode
   className?: string
   signed?: boolean
   hideZero?: boolean
}) {
   return (
      <Card className={cn('gap-3', className)}>
         <CardHeader className="pb-0">
            <CardTitle className="text-muted-foreground text-sm font-medium">{title}</CardTitle>
         </CardHeader>
         <CardContent className="flex flex-col gap-1">
            {value !== undefined ? (
               <span className="tabular text-2xl font-semibold tracking-tight">{value}</span>
            ) : (
               <Figure
                  amounts={total?.amount ? [total.amount] : (amounts ?? [])}
                  converted={total?.amount && total.converted ? (converted ?? null) : null}
                  signed={signed}
                  hideZero={hideZero}
               />
            )}
            {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
            {footer}
         </CardContent>
      </Card>
   )
}

function Figure({
   amounts,
   converted,
   signed,
   hideZero,
}: {
   amounts: readonly Money[]
   converted: string | null
   signed: boolean
   hideZero: boolean
}) {
   const list = <MoneyList amounts={amounts} size="lg" signed={signed} hideZero={hideZero} />
   return converted ? (
      <Approx explanation={converted} className="justify-start">
         {list}
      </Approx>
   ) : (
      list
   )
}
