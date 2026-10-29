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
  durationMs: number
  attempts: number
}

export interface LlmUsage {
  model: string
  calls: number
  inputTokens: number
  outputTokens: number
  latencyMs: number
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

export const emptyUsage = (model: string): LlmUsage => ({ model, calls: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0 })

export const addUsage = (a: LlmUsage, b: LlmUsage): LlmUsage => ({
  model: b.model || a.model,
  calls: a.calls + b.calls,
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  latencyMs: a.latencyMs + b.latencyMs,
})
