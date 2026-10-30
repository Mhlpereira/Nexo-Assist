import type { Handoff, TicketView } from '@nexo/core'
import { ArrowRightLeft, ChevronRight, Headset } from 'lucide-react'
import { formatDay, formatTime } from '@/lib/format'
import { Dot } from '../ui/dot'
import { STATUS_TONE, TEXT_CLASS } from '../ui/tone'

interface ConsoleTicketsProps {
  employeeName: string
  tickets: TicketView[] | null
  handoff: Handoff | null
  focusTicketId: string | null
  assignedAnalystName: string | null
}

const isClosed = (ticket: TicketView) => ticket.status === 'resolved' || ticket.status === 'closed'

export function ConsoleTickets({ employeeName, tickets, handoff, focusTicketId, assignedAnalystName }: ConsoleTicketsProps) {
  const firstName = employeeName.split(' ')[0]
  const current = tickets?.find((ticket) => ticket.id === focusTicketId) ?? null
  const others = (tickets ?? []).filter((ticket) => ticket.id !== current?.id)
  const openCount = (tickets ?? []).filter((ticket) => !isClosed(ticket)).length

  return (
    <aside className="hidden w-[340px] shrink-0 flex-col border-l border-rule bg-paper xl:flex">
      <header className="flex h-16 shrink-0 flex-col justify-center gap-0.5 border-b border-rule px-5">
        <h2 className="text-[15.5px] font-semibold text-ink">Chamados da {firstName}</h2>
        <span className="text-[12.5px] text-ink-3">
          {tickets ? `${openCount} abertos · ${tickets.length - openCount} encerrados` : 'Sistema de chamados indisponível'}
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-8 overflow-y-auto px-5 pt-6 pb-5">
        {current && (
          <section className="flex flex-col gap-3">
            <h3 className="text-[12.5px] font-medium text-ink-3">Desta conversa</h3>
            <div className="flex flex-col gap-3.5 rounded-xl bg-desk p-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center">
                  <span className="flex-1 text-[12.5px] font-medium text-ink-3">{current.id}</span>
                  <span className={`flex items-center gap-1.5 text-[12.5px] font-semibold ${TEXT_CLASS[STATUS_TONE[current.status]]}`}>
                    <Dot tone={STATUS_TONE[current.status]} size={7} />
                    {current.statusLabel}
                  </span>
                </div>
                <p className="text-[15.5px] leading-[1.3] font-semibold text-ink">{current.title}</p>
                <p className="text-[13.5px] text-ink-3">
                  {current.categoryLabel} · prioridade {current.priorityLabel.toLowerCase()}
                  {current.overdue && <span className="font-medium text-warning-text"> · prazo vencido</span>}
                </p>
              </div>
              {(handoff || assignedAnalystName) && (
                <div className="flex items-center gap-2 border-t border-rule pt-3 text-[13.5px] text-ink-2">
                  {assignedAnalystName ? <Headset size={15} className="text-ink-3" /> : <ArrowRightLeft size={15} className="text-ink-3" />}
                  <span className="flex-1">{assignedAnalystName ? `Assumido por ${assignedAnalystName}` : 'Transferido para um analista'}</span>
                  {handoff && !assignedAnalystName && <span className="text-[12.5px] text-ink-3">{formatTime(handoff.at)}</span>}
                </div>
              )}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-1">
          <h3 className="text-[12.5px] font-medium text-ink-3">{current ? 'Outros chamados' : 'Chamados'}</h3>
          {others.length === 0 && <p className="py-3 text-[13.5px] text-ink-3">Nenhum outro chamado.</p>}
          {others.map((ticket) => (
            <div key={ticket.id} className="flex items-center gap-3 border-b border-rule py-3 last:border-b-0">
              <Dot tone={STATUS_TONE[ticket.status]} size={7} />
              <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <span className="truncate text-[14.5px] font-medium text-ink">{ticket.title}</span>
                <span className="text-[12.5px] text-ink-3">
                  {ticket.id} · {isClosed(ticket) ? `${ticket.statusLabel} em ${formatDay(ticket.lastUpdateAt)}` : ticket.statusLabel}
                  {ticket.overdue && <span className="text-warning-text"> · vencido</span>}
                </span>
              </div>
              <ChevronRight size={16} className="text-ink-3" />
            </div>
          ))}
        </section>
      </div>
    </aside>
  )
}
