import { Agent } from '@mastra/core/agent'
import { failure, interpretationSchema, success, type Interpreter, type LlmUsage } from '@nexo/core'
import type { DailyBudget } from './daily-budget'
import { inputGuardrails } from './guardrail-processors'
import { providerOptions, resolveModel, type LlmConfiguration } from './model'
import { INTERPRETER_INSTRUCTIONS, interpreterPrompt } from './prompts'

const MAX_ATTEMPTS = 2

const withoutEmptyStrings = (value: unknown): unknown =>
  typeof value === 'object' && value !== null
    ? Object.fromEntries(Object.entries(value).map(([key, field]) => [key, field === '' ? null : field]))
    : value

export const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 200)

export function createMastraInterpreter(configuration: LlmConfiguration, budget: DailyBudget): Interpreter {
  const agent = new Agent({
    id: 'nexo-interpreter',
    name: 'Nexo Interpreter',
    instructions: INTERPRETER_INSTRUCTIONS,
    model: resolveModel(configuration),
    inputProcessors: inputGuardrails(),
  })

  return {
    async interpret(request) {
      const usage: LlmUsage = { model: configuration.model, calls: 0, inputTokens: 0, outputTokens: 0, latencyMilliseconds: 0 }
      let lastProblem = 'sem resposta'
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (!budget.tryConsume()) return failure({ kind: 'budget_exceeded', detail: 'limite diário de chamadas ao modelo atingido' })
        const startedAt = Date.now()
        try {
          const response = await agent.generate(interpreterPrompt(request), {
            structuredOutput: { schema: interpretationSchema },
            modelSettings: { temperature: 0 },
            providerOptions: providerOptions(configuration),
          })
          usage.calls++
          usage.inputTokens += response.totalUsage?.inputTokens ?? 0
          usage.outputTokens += response.totalUsage?.outputTokens ?? 0
          usage.latencyMilliseconds += Date.now() - startedAt
          const parsed = interpretationSchema.safeParse(withoutEmptyStrings(response.object))
          if (parsed.success) return success({ interpretation: parsed.data, usage })
          lastProblem = `saída inválida: ${parsed.error.issues[0]?.message ?? 'formato'}`
        } catch (error) {
          usage.latencyMilliseconds += Date.now() - startedAt
          lastProblem = describeError(error)
        }
      }
      return failure({ kind: lastProblem.startsWith('saída inválida') ? 'invalid_output' : 'unavailable', detail: lastProblem })
    },
  }
}
