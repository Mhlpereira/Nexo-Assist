import type { ConversationStatus } from '../../domain/conversation'

export interface ConversationView {
  id: string
  status: ConversationStatus
  employeeMessageCount: number
  messageLimit: number
  analystName: string | null
  pendingDraftId: string | null
}
