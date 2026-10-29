import type { ConversationStatus } from '../../domain/conversation'

export interface ConversationSummary {
  id: string
  employee: { id: string; name: string; department: string }
  status: ConversationStatus
  tag: string
  tagTone: 'warning' | 'danger' | 'info' | 'success' | 'neutral'
  lastMessagePreview: string
  lastMessageAt: string | null
  unread: number
  updatedAt: string
}
