import type { GuardrailFinding } from '../../domain/guardrails'
import type { MessageBlock } from '../../domain/message'
import type { RuleRef } from '../../domain/policy'
import type { TraceAction } from '../../domain/trace'
import type { TurnEventSink } from '../ports/in'
import type { Clock } from '../ports/out'

export interface ActionOutcome<T> {
  value: T
  output: unknown
  status: TraceAction['status']
  attempts: number
}

export interface Turn {
  readonly actions: TraceAction[]
  readonly blocks: MessageBlock[]
  readonly guardrails: GuardrailFinding[]
  readonly rules: RuleRef[]
  readonly seenTicketIds: Set<string>
  track<T>(label: string, tool: string, input: unknown, run: () => Promise<ActionOutcome<T>>): Promise<T>
  addBlock(block: MessageBlock): void
  say(text: string): void
  addRule(rule: RuleRef): void
}

export function createTurn(sink: TurnEventSink, clock: Clock): Turn {
  const actions: TraceAction[] = []
  const blocks: MessageBlock[] = []
  const guardrails: GuardrailFinding[] = []
  const rules: RuleRef[] = []
  const seenTicketIds = new Set<string>()

  return {
    actions,
    blocks,
    guardrails,
    rules,
    seenTicketIds,

    async track(label, tool, input, run) {
      const actionId = `action-${actions.length + 1}`
      const startedAt = clock.now().getTime()
      sink.emit({ type: 'action_start', id: actionId, label })
      const outcome = await run()
      actions.push({
        label,
        tool,
        input,
        output: outcome.output,
        status: outcome.status,
        durationMilliseconds: clock.now().getTime() - startedAt,
        attempts: outcome.attempts,
      })
      sink.emit({ type: 'action_end', id: actionId, status: outcome.status })
      return outcome.value
    },

    addBlock(block) {
      blocks.push(block)
      sink.emit({ type: 'block', block })
    },

    say(text) {
      blocks.push({ kind: 'text', text })
      sink.emit({ type: 'text_delta', text })
    },

    addRule(rule) {
      if (!rules.some((existing) => existing.id === rule.id)) rules.push(rule)
    },
  }
}
