import { MAX_EMPLOYEE_MESSAGES, type Conversation } from '../../domain/conversation'
import type { UserRepository } from '../ports/out'
import type { ConversationView } from '../dto'

export async function toConversationView(conversation: Conversation, users: UserRepository): Promise<ConversationView> {
  const analyst = conversation.assignedAnalystId ? await users.findById(conversation.assignedAnalystId) : null
  return {
    id: conversation.id,
    status: conversation.status,
    employeeMessageCount: conversation.state.employeeMessageCount,
    messageLimit: MAX_EMPLOYEE_MESSAGES,
    analystName: analyst?.name ?? null,
    pendingDraftId: conversation.state.pendingDraft?.id ?? null,
  }
}
