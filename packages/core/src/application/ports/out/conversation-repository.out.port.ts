import type { Conversation, ConversationState } from '../../../domain/conversation'
import type { Message, NewMessage } from '../../../domain/message'
import type { Result } from '../../../result'
import type { ConsoleRow } from '../../dto/console-row.dto'

export interface ConversationRepository {
  findById(conversationId: string): Promise<Conversation | null>
  findOpenByEmployee(employeeId: string): Promise<Conversation | null>
  create(employeeId: string, state: ConversationState): Promise<Conversation>
  save(conversation: Conversation): Promise<Result<Conversation, 'version_conflict'>>
  appendMessage(message: NewMessage): Promise<Message>
  listMessages(conversationId: string, after?: Date): Promise<Message[]>
  recentMessages(conversationId: string, limit: number): Promise<Message[]>
  countEmployeeMessagesSince(employeeId: string, since: Date): Promise<number>
  listForConsole(): Promise<ConsoleRow[]>
}
