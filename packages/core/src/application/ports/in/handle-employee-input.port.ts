import type { Result } from '../../../result'
import type { ChatError } from '../../dto/chat-error.dto'
import type { HandleEmployeeInputCommand } from '../../dto/handle-employee-input-command.dto'
import type { TurnResult } from '../../dto/turn-result.dto'
import type { TurnEventSink } from './turn-event-sink.port'

export interface HandleEmployeeInput {
  execute(command: HandleEmployeeInputCommand, sink: TurnEventSink): Promise<Result<TurnResult, ChatError>>
}
