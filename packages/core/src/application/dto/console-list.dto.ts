import type { ConsoleFilter } from './console-filter.dto'
import type { ConversationSummary } from './conversation-summary.dto'

export interface ConsoleList {
  conversations: ConversationSummary[]
  counts: Record<ConsoleFilter, number>
}
