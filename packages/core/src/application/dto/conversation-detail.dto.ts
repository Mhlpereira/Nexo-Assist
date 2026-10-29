import type { Handoff } from '../../domain/conversation'
import type { Message, TicketView } from '../../domain/message'
import type { DecisionTrace } from '../../domain/trace'
import type { User } from './user.dto'
import type { ConversationSummary } from './conversation-summary.dto'

export interface ConversationDetail {
  summary: ConversationSummary
  handoff: Handoff | null
  assignedAnalystId: string | null
  messages: Message[]
  traces: DecisionTrace[]
  employee: User
  tickets: TicketView[] | null
}
