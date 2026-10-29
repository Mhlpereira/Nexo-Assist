import type { Result } from '../../../result'
import type { ConsoleError } from '../../dto/console-error.dto'
import type { ConsoleFilter } from '../../dto/console-filter.dto'
import type { ConsoleList } from '../../dto/console-list.dto'
import type { ConversationDetail } from '../../dto/conversation-detail.dto'

export interface AnalystConsole {
  list(analystId: string, filter: ConsoleFilter, search: string): Promise<ConsoleList>
  detail(analystId: string, conversationId: string): Promise<Result<ConversationDetail, ConsoleError>>
  takeOver(analystId: string, conversationId: string): Promise<Result<void, ConsoleError>>
  returnToAgent(analystId: string, conversationId: string): Promise<Result<void, ConsoleError>>
  close(analystId: string, conversationId: string): Promise<Result<void, ConsoleError>>
  sendMessage(analystId: string, conversationId: string, text: string): Promise<Result<void, ConsoleError>>
}
