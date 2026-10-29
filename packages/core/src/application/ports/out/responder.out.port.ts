import type { LlmUsage } from '../../../domain/trace'
import type { Result } from '../../../result'
import type { TurnEventSink } from '../in/turn-event-sink.in.port'
import type { LlmError } from '../../dto/llm-error.dto'
import type { RespondRequest } from '../../dto/respond-request.dto'
import type { TurnTools } from './turn-tools.out.port'

export interface Responder {
  respond(request: RespondRequest, tools: TurnTools, sink: TurnEventSink): Promise<Result<{ text: string; usage: LlmUsage }, LlmError>>
}
