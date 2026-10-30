import { existsSync } from 'node:fs'
import { createHandleEmployeeInput, initialState, type EmployeeInput, type Message, type Ticket } from '@nexo/core'
import { fixedClock, inMemoryConversations, inMemoryTickets, inMemoryUsers, sequentialIds, staticKnowledgeBase } from '@nexo/core/testing'
import { SEED_ARTICLES, SEED_USERS } from '../src/database/seed'
import { createDailyBudget } from '../src/mastra/daily-budget'
import { createMastraInterpreter } from '../src/mastra/mastra-interpreter.adapter'
import { createMastraResponder } from '../src/mastra/mastra-responder.adapter'
import { SCENARIOS, type Scenario, type ScenarioOutcome } from './scenarios'

const rootEnvironment = new URL('../../../.env', import.meta.url)
if (existsSync(rootEnvironment)) process.loadEnvFile(rootEnvironment)

const DAY = 24 * 60 * 60 * 1000
const configuration = {
  model: process.env.LLM_MODEL ?? 'google/gemini-flash-latest',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
  dailyBudget: Number(process.env.LLM_DAILY_BUDGET ?? 500),
}
const pauseBetweenTurns = Number(process.env.EVAL_DELAY_MS ?? 4000)
const only = process.argv[2]

function seedTickets(now: Date): Ticket[] {
  const ago = (milliseconds: number) => new Date(now.getTime() - milliseconds)
  const base = { kind: 'INC' as const, impact: 'individual' as const, resolvedAt: null, events: [] }
  return [
    { ...base, id: 'INC-20311', employeeId: 'emp-ana', category: 'hardware', title: 'Notebook lento após atualização do Windows', description: 'Lentidão geral desde a atualização do Windows. Reiniciar não resolveu.', priority: 'medium', status: 'waiting_analyst', createdAt: ago(7 * DAY), lastUpdateAt: ago(6 * DAY) },
    { ...base, id: 'INC-20298', employeeId: 'emp-ana', kind: 'REQ', category: 'access', title: 'Acesso à pasta Financeiro no SharePoint', description: 'Acesso de leitura à pasta Financeiro/Fechamento.', priority: 'medium', status: 'in_progress', createdAt: ago(9 * DAY), lastUpdateAt: ago(DAY) },
    { ...base, id: 'INC-20150', employeeId: 'emp-ana', category: 'access', title: 'Senha do SAP bloqueada', description: 'Senha do SAP bloqueada após tentativas erradas.', priority: 'medium', status: 'resolved', createdAt: ago(6 * DAY), lastUpdateAt: ago(4 * DAY), resolvedAt: ago(4 * DAY) },
    { ...base, id: 'INC-19877', employeeId: 'emp-ana', category: 'email', title: 'Outlook não sincroniza no celular', description: 'O Outlook do celular parou de sincronizar.', priority: 'medium', status: 'resolved', createdAt: ago(60 * DAY), lastUpdateAt: ago(57 * DAY), resolvedAt: ago(57 * DAY) },
    { ...base, id: 'INC-20402', employeeId: 'emp-bruno', category: 'hardware', title: 'Impressora do 3º andar não imprime', description: 'Trabalhos presos na fila.', priority: 'medium', status: 'open', impact: 'team', createdAt: ago(DAY), lastUpdateAt: ago(DAY) },
  ]
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function runScenario(scenario: Scenario): Promise<ScenarioOutcome> {
  const clock = fixedClock(new Date().toISOString())
  const conversationStore = inMemoryConversations(clock, SEED_USERS)
  const ticketStore = inMemoryTickets(seedTickets(clock.now()), clock)
  const interpreterRequests: ScenarioOutcome['interpreterRequests'] = []
  const budget = createDailyBudget(configuration.dailyBudget)
  const realInterpreter = createMastraInterpreter(configuration, budget)
  const handle = createHandleEmployeeInput({
    conversations: conversationStore.repository,
    users: inMemoryUsers(SEED_USERS),
    tickets: ticketStore.gateway,
    knowledgeBase: staticKnowledgeBase(SEED_ARTICLES),
    interpreter: {
      interpret: (request) => {
        interpreterRequests.push(request)
        return realInterpreter.interpret(request)
      },
    },
    responder: createMastraResponder(configuration, budget),
    clock,
    ids: sequentialIds(),
  })

  const conversation = await conversationStore.repository.create(scenario.employeeId, initialState())
  let lastAgentMessage: Message | null = null
  for (const turn of scenario.turns) {
    const input: EmployeeInput = typeof turn === 'string' ? { type: 'text', text: turn } : turn
    const result = await handle.execute({ employeeId: scenario.employeeId, conversationId: conversation.id, input }, { emit: () => undefined })
    if (result.ok && result.value.agentMessage) lastAgentMessage = result.value.agentMessage
    clock.advance(30_000)
    await wait(pauseBetweenTurns)
  }

  const finalConversation = await conversationStore.repository.findById(conversation.id)
  if (!finalConversation) throw new Error('conversa sumiu')
  return {
    conversation: finalConversation,
    messages: await conversationStore.repository.listMessages(conversation.id),
    lastAgentMessage,
    gatewayCalls: ticketStore.calls,
    interpreterRequests,
  }
}

const scenarios = SCENARIOS.filter((scenario) => !only || scenario.name.toLowerCase().includes(only.toLowerCase()))
console.log(`Modelo: ${configuration.model} · ${scenarios.length} cenários\n`)

let totalChecks = 0
let passedChecks = 0
let criticalFailures = 0
let inputTokens = 0
let outputTokens = 0

for (const scenario of scenarios) {
  const outcome = await runScenario(scenario)
  const results = scenario.checks.map((check) => ({ check, passed: check.passed(outcome) }))
  const scenarioPassed = results.every((result) => result.passed)
  for (const message of outcome.messages) {
    inputTokens += message.trace?.llm?.inputTokens ?? 0
    outputTokens += message.trace?.llm?.outputTokens ?? 0
  }
  totalChecks += results.length
  passedChecks += results.filter((result) => result.passed).length
  criticalFailures += results.filter((result) => !result.passed && result.check.critical).length

  console.log(`${scenarioPassed ? '✓' : '✗'} ${scenario.name}  [${scenario.requirement}]`)
  for (const result of results) {
    if (!result.passed) console.log(`    ✗ ${result.check.name}${result.check.critical ? '  (crítico)' : ''}`)
  }
  if (!scenarioPassed) {
    const trace = outcome.lastAgentMessage?.trace
    console.log(`    entendeu: ${trace?.understood?.intent ?? '-'} (${trace?.confidence?.score ?? '-'}) · rota: ${trace?.decision.route ?? '-'}`)
    console.log(`    resposta: ${(outcome.lastAgentMessage?.blocks.find((block) => block.kind === 'text') ?? { text: '-' }).text.slice(0, 160)}`)
  }
}

const rate = totalChecks === 0 ? 0 : Math.round((passedChecks / totalChecks) * 100)
console.log(`\nAsserções: ${passedChecks}/${totalChecks} (${rate}%) · falhas críticas: ${criticalFailures}`)
console.log(`Tokens: ${inputTokens} entrada + ${outputTokens} saída (média ${Math.round((inputTokens + outputTokens) / Math.max(scenarios.length, 1))} por cenário)`)
process.exitCode = criticalFailures > 0 ? 1 : 0
