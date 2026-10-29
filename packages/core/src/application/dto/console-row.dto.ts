import type { Conversation } from '../../domain/conversation'
import type { Message } from '../../domain/message'
import type { User } from './user.dto'

export interface ConsoleRow {
  conversation: Conversation
  employee: User
  analystName: string | null
  lastMessage: Message | null
  trailingEmployeeMessages: number
}
