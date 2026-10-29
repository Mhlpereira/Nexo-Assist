import { describe, expect, it } from 'vitest'
import { createDailyBudget } from './daily-budget'
import { resolveModel } from './model'

describe('orçamento diário do LLM', () => {
  it('GR-07: bloqueia ao atingir o limite e renova no dia seguinte', () => {
    let now = new Date('2026-10-29T12:00:00Z')
    const budget = createDailyBudget(2, () => now)
    expect([budget.tryConsume(), budget.tryConsume(), budget.tryConsume()]).toEqual([true, true, false])
    now = new Date('2026-10-30T00:01:00Z')
    expect(budget.tryConsume()).toBe(true)
  })
})

describe('resolveModel', () => {
  it('NFR-04: usa o roteador do Mastra para provedor/modelo e o endpoint compatível para Ollama', () => {
    expect(resolveModel({ model: 'google/gemini-flash-latest', ollamaBaseUrl: '' })).toEqual({ id: 'google/gemini-flash-latest' })
    expect(resolveModel({ model: 'ollama/qwen3:8b', ollamaBaseUrl: 'http://localhost:11434' })).toMatchObject({
      providerId: 'ollama',
      modelId: 'qwen3:8b',
      url: 'http://localhost:11434/v1',
    })
    expect(() => resolveModel({ model: 'gemini', ollamaBaseUrl: '' })).toThrow()
  })
})
