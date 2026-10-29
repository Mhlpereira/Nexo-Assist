import type { Interpretation } from '../../../domain/interpretation'
import type { LlmUsage } from '../../../domain/trace'
import type { Result } from '../../../result'
import type { InterpretRequest } from '../../dto/interpret-request.dto'
import type { LlmError } from '../../dto/llm-error.dto'

export interface Interpreter {
  interpret(request: InterpretRequest): Promise<Result<{ interpretation: Interpretation; usage: LlmUsage }, LlmError>>
}
