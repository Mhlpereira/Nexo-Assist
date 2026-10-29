import type { Result } from '../../../result'
import type { EmployeeConversation } from '../../dto/employee-conversation.dto'

export interface EmployeeConversations {
  getOrStart(employeeId: string): Promise<EmployeeConversation>
  startNew(employeeId: string): Promise<Result<EmployeeConversation, 'analyst_in_progress'>>
  messagesSince(
    employeeId: string,
    conversationId: string,
    after: Date | null,
  ): Promise<Result<EmployeeConversation, 'conversation_not_found'>>
}
