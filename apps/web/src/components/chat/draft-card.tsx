import { CATEGORY_LABEL, IMPACT_LABEL, PRIORITY_LABEL, type Draft } from '@nexo/core'
import { formatTime } from '@/lib/format'
import { Dot } from '../ui/dot'
import { PRIORITY_TONE } from '../ui/tone'
import { CardEyebrow, CardFrame, Field } from './card-frame'

const DRAFT_KIND: Record<Draft['mode'], string> = {
  create: 'Novo chamado',
  update: 'Complemento de chamado',
  reopen: 'Reabertura de chamado',
}

interface DraftCardProps {
  draft: Draft
  pending: boolean
  busy: boolean
  onAction: (action: 'confirm' | 'edit' | 'cancel') => void
}

export function DraftCard({ draft, pending, busy, onAction }: DraftCardProps) {
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
  return (
    <CardFrame>
      <div className="flex flex-col gap-1.5 px-[18px] pt-4 pb-3.5">
        <CardEyebrow
          kind={DRAFT_KIND[draft.mode]}
          reference={`Rascunho ${draft.id}`}
          status={
            pending ? (
              <span className="flex items-center gap-1.5 font-medium text-warning-text">
                <Dot tone="warning" />
                Aguardando confirmação
              </span>
            ) : (
              <span className="text-ink-3">Rascunho encerrado</span>
            )
          }
        />
        <h3 className="text-[18px] leading-tight font-semibold tracking-[-0.2px] text-ink">
          {draft.ticketId ? `${draft.ticketId} · ${draft.title}` : draft.title}
        </h3>
        <p className="text-[13.5px] leading-normal whitespace-pre-line text-ink-2">{draft.description}</p>
      </div>
      {draft.mode === 'create' && (
        <div className="px-[18px] pb-4">
          <div className="flex flex-wrap gap-6 border-t border-rule pt-3">
            <Field label="Tipo">{draft.kind === 'INC' ? 'Incidente' : 'Requisição'}</Field>
            <Field label="Categoria">{CATEGORY_LABEL[draft.category]}</Field>
            <Field label="Prioridade">
              <Dot tone={PRIORITY_TONE[draft.priority]} />
              {PRIORITY_LABEL[draft.priority]}
              {draft.dueAt && <span className="text-[13.5px] font-normal text-ink-3">· resposta até {formatTime(draft.dueAt)}</span>}
            </Field>
            <Field label="Afetados">{IMPACT_LABEL[draft.impact]}</Field>
          </div>
          {draft.priorityReason && <p className="mt-2 text-[12.5px] text-ink-3">Por que essa prioridade: {draft.priorityReason}</p>}
        </div>
      )}
      {pending && (
        <div className="flex items-center gap-1.5 border-t border-rule bg-desk py-2 pr-3.5 pl-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction('confirm')}
            className="flex h-9 items-center gap-2 rounded-lg bg-cta pr-2.5 pl-3.5 text-[13.5px] font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            Confirmar
            <kbd className="rounded-md bg-white/15 px-1.5 py-px font-ui text-[11.5px] font-normal text-white/80">{isMac ? '⌘↵' : 'Ctrl ↵'}</kbd>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction('edit')}
            className="flex h-9 items-center rounded-lg border border-ink/[0.12] bg-paper px-3.5 text-[13.5px] font-medium text-ink shadow-[0_1px_2px_rgba(27,36,49,0.05)] transition hover:bg-desk disabled:opacity-60"
          >
            Editar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction('cancel')}
            className="flex h-9 items-center rounded-lg px-3.5 text-[13.5px] font-medium text-ink-2 transition hover:bg-paper disabled:opacity-60"
          >
            Cancelar
          </button>
        </div>
      )}
    </CardFrame>
  )
}
