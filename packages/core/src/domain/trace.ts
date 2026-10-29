import type { GuardrailFinding } from './guardrails'
import type { ConfidenceLevel } from './interpretation'
import type { RuleRef } from './policy'

export type InputKind = 'text' | 'quick_reply' | 'select_ticket' | 'draft_action'

export interface TraceAction {
  label: string
  tool: string
  input: unknown
  output: unknown
  status: 'ok' | 'error' | 'blocked'
  durationMilliseconds: number
  attempts: number
}

export interface LlmUsage {
  model: string
  calls: number
  inputTokens: number
  outputTokens: number
  latencyMilliseconds: number
}

export interface DecisionTrace {
  turnId: string
  at: string
  input: { kind: InputKind; text: string }
  understood: { intent: string; summary: string; entities: Record<string, string> } | null
  confidence: { score: number; level: ConfidenceLevel } | null
  decision: { route: string; rationale: string; rules: RuleRef[] }
  actions: TraceAction[]
  guardrails: GuardrailFinding[]
  llm: LlmUsage | null
}

export const emptyUsage = (model: string): LlmUsage => ({ model, calls: 0, inputTokens: 0, outputTokens: 0, latencyMilliseconds: 0 })

export const addUsage = (total: LlmUsage, increment: LlmUsage): LlmUsage => ({
  model: increment.model || total.model,
  calls: total.calls + increment.calls,
  inputTokens: total.inputTokens + increment.inputTokens,
  outputTokens: total.outputTokens + increment.outputTokens,
  latencyMilliseconds: total.latencyMilliseconds + increment.latencyMilliseconds,
})
