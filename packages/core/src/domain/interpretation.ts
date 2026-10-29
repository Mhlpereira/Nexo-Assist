import { z } from 'zod'
import { CATEGORIES, IMPACTS, TICKET_KINDS } from './ticket'

export const INTENTS = [
  'question',
  'ticket_status',
  'update_ticket',
  'open_ticket',
  'confirm',
  'edit_draft',
  'cancel',
  'talk_to_human',
  'resolved_thanks',
  'out_of_scope',
  'greeting',
  'unclear',
] as const
export type Intent = (typeof INTENTS)[number]

export const INTENT_LABEL: Record<Intent, string> = {
  question: 'Tirar uma dúvida',
  ticket_status: 'Consultar um chamado',
  update_ticket: 'Complementar um chamado',
  open_ticket: 'Abrir um chamado',
  confirm: 'Confirmar o rascunho',
  edit_draft: 'Alterar o rascunho',
  cancel: 'Cancelar',
  talk_to_human: 'Falar com um analista',
  resolved_thanks: 'Problema resolvido',
  out_of_scope: 'Assunto fora de TI',
  greeting: 'Cumprimento',
  unclear: 'Não ficou claro',
}

export const interpretationSchema = z.object({
  intent: z.enum(INTENTS),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  ticketRef: z.string().nullable(),
  kind: z.enum(TICKET_KINDS).nullable(),
  category: z.enum(CATEGORIES).nullable(),
  impact: z.enum(IMPACTS).nullable(),
  blocksWork: z.boolean().nullable(),
  deadlineToday: z.boolean().nullable(),
  environment: z.string().nullable(),
  rationale: z.string(),
})

export type Interpretation = z.output<typeof interpretationSchema>

export type ConfidenceLevel = 'alta' | 'média' | 'baixa'

export const HIGH_CONFIDENCE = 0.75
export const LOW_CONFIDENCE = 0.5

export const confidenceLevel = (score: number): ConfidenceLevel =>
  score >= HIGH_CONFIDENCE ? 'alta' : score >= LOW_CONFIDENCE ? 'média' : 'baixa'
