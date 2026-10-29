import type { ConversationState, HandoffReason } from './conversation'
import { HIGH_CONFIDENCE, LOW_CONFIDENCE, type Intent, type Interpretation } from './interpretation'

export const TOOL_NAMES = [
  'search_help_center',
  'list_my_tickets',
  'get_ticket',
  'ask_options',
  'prepare_ticket_draft',
  'prepare_update_draft',
] as const
export type ToolName = (typeof TOOL_NAMES)[number]

export interface RuleRef {
  id: string
  text: string
}

export type Route =
  | { kind: 'respond'; tools: ToolName[] }
  | { kind: 'clarify' }
  | { kind: 'redirect_out_of_scope' }
  | { kind: 'handoff'; reason: HandoffReason }
  | { kind: 'confirm_draft' }
  | { kind: 'cancel_draft' }
  | { kind: 'close_resolved' }

export interface PolicyDecision {
  route: Route
  rationale: string
  rules: RuleRef[]
  lowConfidenceStreak: number
}

export const RULES = {
  transfer: { id: 'A.transferência', text: 'Transferir quando o funcionário pede, em casos críticos, chamados vencidos ou sem segurança' },
  scope: { id: 'A.escopo', text: 'Apenas assuntos de TI; RH, financeiro e facilities são redirecionados' },
  confirmation: { id: 'A.abertura', text: 'Só cria ou atualiza chamado após confirmação do rascunho' },
  duplicate: { id: 'A.duplicidade', text: 'Chamado aberto sobre o mesmo problema é atualizado, não duplicado' },
  priority: { id: 'A.prioridade', text: 'Prioridade = impacto (quantos afetados) × urgência (compromisso em risco)' },
  reopen: { id: 'A.reabertura', text: 'Chamados resolvidos há até 7 dias podem ser reabertos' },
  privacy: { id: 'A.privacidade', text: 'Informações de um chamado só para quem o abriu' },
} satisfies Record<string, RuleRef>

const READ_ONLY_TOOLS: ToolName[] = ['search_help_center', 'list_my_tickets', 'get_ticket', 'ask_options']

const TOOLS_BY_INTENT: Record<Intent, ToolName[]> = {
  question: ['search_help_center', 'ask_options', 'list_my_tickets', 'prepare_ticket_draft'],
  open_ticket: ['search_help_center', 'list_my_tickets', 'ask_options', 'prepare_ticket_draft', 'prepare_update_draft'],
  ticket_status: ['list_my_tickets', 'get_ticket', 'ask_options'],
  update_ticket: ['list_my_tickets', 'get_ticket', 'ask_options', 'prepare_update_draft'],
  edit_draft: ['ask_options', 'prepare_ticket_draft', 'prepare_update_draft'],
  confirm: ['ask_options'],
  cancel: ['ask_options'],
  greeting: ['ask_options'],
  unclear: ['ask_options', 'search_help_center'],
  talk_to_human: [],
  resolved_thanks: [],
  out_of_scope: [],
}

export interface PolicyInput {
  interpretation: Interpretation
  state: ConversationState
  injectionSuspected: boolean
}

export function decide({ interpretation, state, injectionSuspected }: PolicyInput): PolicyDecision {
  const { intent, confidence } = interpretation
  const decision = (route: Route, rationale: string, rules: RuleRef[] = [], lowConfidenceStreak = 0): PolicyDecision => ({
    route,
    rationale,
    rules,
    lowConfidenceStreak,
  })

  if (intent === 'talk_to_human' && confidence >= LOW_CONFIDENCE) {
    return decision({ kind: 'handoff', reason: 'requested' }, 'O funcionário pediu para falar com um analista', [RULES.transfer])
  }

  if (confidence < LOW_CONFIDENCE) {
    const streak = state.lowConfidenceStreak + 1
    if (streak >= 2) {
      return decision(
        { kind: 'handoff', reason: 'low_confidence' },
        `Segundo turno seguido sem entender com segurança (${Math.round(confidence * 100)}%)`,
        [RULES.transfer],
        streak,
      )
    }
    return decision({ kind: 'clarify' }, 'Confiança baixa: vou pedir esclarecimento antes de agir', [], streak)
  }

  if (intent === 'out_of_scope') {
    return decision({ kind: 'redirect_out_of_scope' }, 'O assunto não é de TI', [RULES.scope])
  }

  if (state.pendingDraft && (intent === 'confirm' || intent === 'cancel')) {
    if (intent === 'cancel') return decision({ kind: 'cancel_draft' }, 'O funcionário desistiu do rascunho')
    if (injectionSuspected || confidence < HIGH_CONFIDENCE) {
      return decision({ kind: 'clarify' }, 'Confirmação ambígua: peço que confirme pelo botão', [RULES.confirmation])
    }
    return decision({ kind: 'confirm_draft' }, `Confirmação explícita do rascunho ${state.pendingDraft.id}`, [RULES.confirmation])
  }

  if (intent === 'resolved_thanks') {
    return decision({ kind: 'close_resolved' }, 'O funcionário informou que o problema foi resolvido')
  }

  const tools = injectionSuspected
    ? TOOLS_BY_INTENT[intent].filter((tool) => READ_ONLY_TOOLS.includes(tool))
    : TOOLS_BY_INTENT[intent]
  const rules = intent === 'open_ticket' ? [RULES.duplicate, RULES.priority, RULES.confirmation] : []
  const rationale = injectionSuspected
    ? 'Mensagem com sinais de manipulação: respondo apenas com consultas, sem ações de escrita'
    : interpretation.rationale
  return decision({ kind: 'respond', tools }, rationale, injectionSuspected ? [...rules, RULES.privacy] : rules)
}
