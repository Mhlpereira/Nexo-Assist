import type { TicketView } from '@nexo/core'
import { formatDayTime } from '@/lib/format'
import { Dot } from '../ui/dot'
import { PRIORITY_TONE, STATUS_TONE, TEXT_CLASS } from '../ui/tone'
import { CardEyebrow, CardFrame, Field } from './card-frame'

export function TicketCard({ ticket }: { ticket: TicketView }) {
  const statusTone = STATUS_TONE[ticket.status]
  return (
    <CardFrame>
      <div className="flex flex-col gap-1.5 px-[18px] pt-4 pb-3.5">
        <CardEyebrow
          kind="Chamado"
          reference={ticket.id}
          status={
            <span className={`flex items-center gap-1.5 font-medium ${TEXT_CLASS[statusTone]}`}>
              <Dot tone={statusTone} />
              {ticket.statusLabel}
            </span>
          }
        />
        <h3 className="text-[18px] leading-tight font-semibold tracking-[-0.2px] text-ink">{ticket.title}</h3>
        <p className="text-[13.5px] leading-normal text-ink-2">{ticket.description}</p>
      </div>
      <div className="px-[18px] pb-4">
        <div className="flex flex-wrap gap-6 border-t border-rule pt-3">
          <Field label="Categoria">{ticket.categoryLabel}</Field>
          <Field label="Prioridade">
            <Dot tone={PRIORITY_TONE[ticket.priority]} />
            {ticket.priorityLabel}
          </Field>
          <Field label="Aberto em">{formatDayTime(ticket.createdAt)}</Field>
          <Field label="Última atualização">
            <span className={ticket.overdue ? 'text-warning-text' : ''}>{ticket.lastUpdateAgo}</span>
            {ticket.overdue && <span className="text-[13.5px] font-normal text-ink-3">· prazo vencido</span>}
          </Field>
        </div>
      </div>
    </CardFrame>
  )
}
