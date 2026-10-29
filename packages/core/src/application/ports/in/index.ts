import type { Conversation } from '../../../domain/conversation'
import type { Message, MessageBlock, TicketView } from '../../../domain/message'
import type { DecisionTrace } from '../../../domain/trace'
import type { Result } from '../../../result'
import type { User } from '../out'

export type EmployeeInput =
  | { type: 'text'; text: string }
  | { type: 'quick_reply'; label: string; value: string }
  | { type: 'select_ticket'; ticketId: string; label: string }
  | { type: 'draft_action'; draftId: string; action: 'confirm' | 'edit' | 'cancel' }

export type TurnEvent =
  | { type: 'employee_message'; message: Message }
  | { type: 'action_start'; id: string; label: string }
  | { type: 'action_end'; id: string; status: 'ok' | 'error' | 'blocked' }
  | { type: 'text_delta'; text: string }
  | { type: 'block'; block: MessageBlock }

export interface TurnEventSink {
  emit(event: TurnEvent): void
}

export type ChatError =
  | 'conversation_not_found'
  | 'conversation_closed'
  | 'message_limit_reached'
  | 'rate_limited'
  | 'empty_message'
  | 'message_too_long'

export interface TurnResult {
  employeeMessage: Message
  agentMessage: Message | null
  conversation: ConversationView
}

export interface HandleEmployeeInput {
  execute(
    command: { employeeId: string; conversationId: string; input: EmployeeInput },
    sink: TurnEventSink,
  ): Promise<Result<TurnResult, ChatError>>
}

export interface ConversationView {
  id: string
  status: Conversation['status']
  employeeMessageCount: number
  messageLimit: number
  analystName: string | null
  pendingDraftId: string | null
}

export interface EmployeeConversation {
  conversation: ConversationView
  messages: Message[]
}

export interface EmployeeConversations {
  getOrStart(employeeId: string): Promise<EmployeeConversation>
  startNew(employeeId: string): Promise<Result<EmployeeConversation, 'analyst_in_progress'>>
  messagesSince(
    employeeId: string,
    conversationId: string,
    after: Date | null,
  ): Promise<Result<EmployeeConversation, 'conversation_not_found'>>
}

export interface Login {
  execute(email: string, password: string): Promise<Result<User, 'invalid_credentials'>>
}

export type ConsoleFilter = 'all' | 'for_you' | 'with_agent' | 'mine'

export interface ConversationSummary {
  id: string
  employee: { id: string; name: string; department: string }
  status: Conversation['status']
  tag: string
  tagTone: 'warning' | 'danger' | 'info' | 'success' | 'neutral'
  lastMessagePreview: string
  lastMessageAt: string | null
  unread: number
  updatedAt: string
}

export interface ConsoleList {
  conversations: ConversationSummary[]
  counts: Record<ConsoleFilter, number>
}

export interface ConversationDetail {
  summary: ConversationSummary
  handoff: Conversation['state']['handoff']
  assignedAnalystId: string | null
  messages: Message[]
  traces: DecisionTrace[]
  employee: User
  tickets: TicketView[] | null
}

export type ConsoleError = 'conversation_not_found' | 'invalid_transition' | 'not_assigned_analyst' | 'empty_message'

export interface AnalystConsole {
  list(analystId: string, filter: ConsoleFilter, search: string): Promise<ConsoleList>
  detail(analystId: string, conversationId: string): Promise<Result<ConversationDetail, ConsoleError>>
  takeOver(analystId: string, conversationId: string): Promise<Result<void, ConsoleError>>
  returnToAgent(analystId: string, conversationId: string): Promise<Result<void, ConsoleError>>
  close(analystId: string, conversationId: string): Promise<Result<void, ConsoleError>>
  sendMessage(analystId: string, conversationId: string, text: string): Promise<Result<void, ConsoleError>>
}
