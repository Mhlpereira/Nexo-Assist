import { failure, success, type Result } from '../result'
import type { Category, Impact, Priority, TicketKind } from './ticket'

export const MAX_EMPLOYEE_MESSAGES = 30

export type ConversationStatus = 'agent' | 'waiting_analyst' | 'with_analyst' | 'closed'

export type HandoffReason =
  | 'requested'
  | 'critical'
  | 'overdue'
  | 'low_confidence'
  | 'service_unavailable'
  | 'limit_reached'

export const HANDOFF_REASON_LABEL: Record<HandoffReason, string> = {
  requested: 'Funcionário pediu um analista',
  critical: 'Caso crítico',
  overdue: 'Chamado vencido',
  low_confidence: 'Agent pediu ajuda',
  service_unavailable: 'Sistema de chamados indisponível',
  limit_reached: 'Limite de mensagens atingido',
}

export interface Handoff {
  reason: HandoffReason
  summary: string
  confidence: number | null
  ticketId: string | null
  at: string
}

export interface Draft {
  id: string
  idempotencyKey: string
  mode: 'create' | 'update' | 'reopen'
  ticketId: string | null
  title: string
  description: string
  kind: TicketKind
  category: Category
  priority: Priority
  impact: Impact
  priorityReason: string
  dueAt: string | null
  status: 'pending' | 'confirmed' | 'cancelled'
}

export interface ConversationState {
  pendingDraft: Draft | null
  selectedTicketId: string | null
  lowConfidenceStreak: number
  employeeMessageCount: number
  handoff: Handoff | null
}

export interface Conversation {
  id: string
  employeeId: string
  status: ConversationStatus
  assignedAnalystId: string | null
  state: ConversationState
  version: number
  createdAt: Date
  updatedAt: Date
  closedAt: Date | null
  resolution: 'agent' | 'analyst' | 'employee' | null
}

export const initialState = (): ConversationState => ({
  pendingDraft: null,
  selectedTicketId: null,
  lowConfidenceStreak: 0,
  employeeMessageCount: 0,
  handoff: null,
})

export type ConversationEvent =
  | { type: 'handoff'; handoff: Handoff }
  | { type: 'take_over'; analystId: string }
  | { type: 'return_to_agent'; analystId: string }
  | { type: 'close'; by: 'agent' | 'analyst' | 'employee'; analystId: string | null }

export type TransitionError = 'invalid_transition' | 'not_assigned_analyst'

export function transition(
  conversation: Conversation,
  event: ConversationEvent,
  now: Date,
): Result<Conversation, TransitionError> {
  const { status } = conversation
  const next = (changes: Partial<Conversation>): Result<Conversation, TransitionError> =>
    success({ ...conversation, ...changes, updatedAt: now })

  switch (event.type) {
    case 'handoff':
      if (status !== 'agent') return failure('invalid_transition')
      return next({ status: 'waiting_analyst', state: { ...conversation.state, handoff: event.handoff } })

    case 'take_over':
      if (status !== 'agent' && status !== 'waiting_analyst') return failure('invalid_transition')
      return next({ status: 'with_analyst', assignedAnalystId: event.analystId })

    case 'return_to_agent':
      if (status !== 'waiting_analyst' && status !== 'with_analyst') return failure('invalid_transition')
      if (status === 'with_analyst' && conversation.assignedAnalystId !== event.analystId) {
        return failure('not_assigned_analyst')
      }
      return next({
        status: 'agent',
        assignedAnalystId: null,
        state: { ...conversation.state, handoff: null, lowConfidenceStreak: 0 },
      })

    case 'close':
      if (status === 'closed') return failure('invalid_transition')
      if (status === 'with_analyst' && conversation.assignedAnalystId !== event.analystId) {
        return failure('not_assigned_analyst')
      }
      return next({ status: 'closed', closedAt: now, resolution: event.by })
  }
}
