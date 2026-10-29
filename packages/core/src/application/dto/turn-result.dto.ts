import type { Message } from '../../domain/message'
import type { ConversationView } from './conversation-view.dto'

export interface TurnResult {
  employeeMessage: Message
  agentMessage: Message | null
  conversation: ConversationView
}
