export interface LlmError {
  kind: 'unavailable' | 'invalid_output' | 'budget_exceeded'
  detail: string
}
