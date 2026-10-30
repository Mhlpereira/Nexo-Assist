import type { TicketView } from '@nexo/core'
import { formatDay } from '@/lib/format'
import { Dot } from '../ui/dot'
import { STATUS_TONE } from '../ui/tone'
import { CardFrame } from './card-frame'

interface TicketSelectorProps {
  tickets: TicketView[]
  selectedId: string | null
  disabled: boolean
  onSelect: (ticket: TicketView) => void
}

export function TicketSelector({ tickets, selectedId, disabled, onSelect }: TicketSelectorProps) {
  return (
    <CardFrame>
      <ul role="listbox" aria-label="Seus chamados">
        {tickets.map((ticket) => {
          const selected = ticket.id === selectedId
          return (
            <li key={ticket.id} className="border-t border-rule first:border-t-0">
              <button
                type="button"
                role="option"
                aria-selected={selected}
                disabled={disabled}
                onClick={() => onSelect(ticket)}
                className={`flex h-[46px] w-full items-center gap-3.5 px-4 text-left transition enabled:hover:bg-cta/[0.04] disabled:cursor-default ${selected ? 'bg-cta/[0.04]' : ''}`}
              >
                <span className={`h-4 w-4 shrink-0 rounded-full bg-paper ${selected ? 'border-[5px] border-cta' : 'border-[1.5px] border-ink/20'}`} />
                <span className="text-[12.5px] font-medium text-ink-3">{ticket.id}</span>
                <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-ink">{ticket.title}</span>
                <span className="flex items-center gap-1.5 text-[12.5px] whitespace-nowrap text-ink-3">
                  <Dot tone={STATUS_TONE[ticket.status]} />
                  {ticket.statusLabel}
                </span>
                <span className="w-12 text-right text-[12.5px] whitespace-nowrap text-ink-3">{formatDay(ticket.createdAt)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </CardFrame>
  )
}
