import type { Message } from '../../domain/message'
import type { ConversationView } from './conversation-view.dto'

export interface EmployeeConversation {
  conversation: ConversationView
  messages: Message[]
}
