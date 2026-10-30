import { Agent } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { CATEGORIES, failure, IMPACTS, success, TICKET_KINDS, type HistoryEntry, type Responder, type ToolName, type TurnTools } from '@nexo/core'
import { z } from 'zod'
import type { DailyBudget } from './daily-budget'
import { inputGuardrails } from './guardrail-processors'
import { describeError } from './mastra-interpreter.adapter'
import { resolveModel, type LlmConfiguration } from './model'
import { responderInstructions } from './prompts'

const MAX_STEPS = 5

const ticketIdSchema = z.string().describe('Número do chamado, ex.: INC-20311 ou REQ-10442')

function buildTools(tools: TurnTools) {
  return {
    search_help_center: createTool({
      id: 'search_help_center',
      description: 'Busca artigos na central de ajuda de TI. Use antes de abrir chamado e para responder dúvidas.',
      inputSchema: z.object({ query: z.string().describe('Termos de busca em português, com o erro ou sistema citado') }),
      execute: async (input) => tools.searchHelpCenter(input),
    }),
    list_my_tickets: createTool({
      id: 'list_my_tickets',
      description: 'Lista os chamados do funcionário e mostra na tela a seleção (ou o card, se houver um só). Use quando ele não informar o número.',
      inputSchema: z.object({}),
      execute: async () => tools.listMyTickets(),
    }),
    get_ticket: createTool({
      id: 'get_ticket',
      description: 'Consulta um chamado do funcionário pelo número, calcula o prazo e mostra o card na tela.',
      inputSchema: z.object({ ticketId: ticketIdSchema }),
      execute: async (input) => tools.getTicket(input),
    }),
    ask_options: createTool({
      id: 'ask_options',
      description: 'Mostra botões de resposta rápida para a pergunta que você fizer no texto. Use 2 a 4 opções curtas.',
      inputSchema: z.object({ options: z.array(z.string()).min(2).max(4) }),
      execute: async (input) => tools.askOptions(input),
    }),
    prepare_ticket_draft: createTool({
      id: 'prepare_ticket_draft',
      description:
        'Monta o rascunho de um chamado novo: verifica duplicidade, calcula prioridade e prazo e mostra o rascunho para confirmação. Só chame com problema, impacto e urgência conhecidos.',
      inputSchema: z.object({
        title: z.string().describe('Título curto e específico, ex.: "VPN não conecta no notebook — erro 809"'),
        description: z.string().describe('Descrição completa para o analista: o que acontece, desde quando, ambiente, o que já foi tentado'),
        kind: z.enum(TICKET_KINDS).describe('INC se algo parou ou não funciona; REQ se é pedido de acesso, equipamento ou software'),
        category: z.enum(CATEGORIES),
        impact: z.enum(IMPACTS).describe('individual, team ou company'),
        blocksWork: z.boolean().describe('Impede de trabalhar (sem alternativa)?'),
        deadlineToday: z.boolean().describe('Há compromisso em risco hoje?'),
      }),
      execute: async (input) => tools.prepareTicketDraft(input),
    }),
    prepare_update_draft: createTool({
      id: 'prepare_update_draft',
      description: 'Monta o rascunho para complementar um chamado aberto, ou reabrir um resolvido há até 7 dias, e mostra para confirmação.',
      inputSchema: z.object({ ticketId: ticketIdSchema, text: z.string().describe('Informação a acrescentar, escrita para o analista') }),
      execute: async (input) => tools.prepareUpdateDraft(input),
    }),
  } satisfies Record<ToolName, unknown>
}

const toMessage = (entry: HistoryEntry) =>
  entry.author === 'employee'
    ? { role: 'user' as const, content: entry.text }
    : { role: 'assistant' as const, content: entry.author === 'analyst' ? `[Mensagem do analista] ${entry.text}` : entry.text }

const toMessages = (history: HistoryEntry[], text: string) => [...history.map(toMessage), { role: 'user' as const, content: text }]

export function createMastraResponder(configuration: LlmConfiguration, budget: DailyBudget): Responder {
  const agent = new Agent({
    id: 'nexo-assist',
    name: 'Nexo Assist',
    instructions: 'Você é o Nexo Assist, atendente de service desk de TI.',
    model: resolveModel(configuration),
    inputProcessors: inputGuardrails(),
  })

  return {
    async respond(request, tools, sink) {
      if (!budget.tryConsume()) return failure({ kind: 'budget_exceeded', detail: 'limite diário de chamadas ao modelo atingido' })
      const startedAt = Date.now()
      try {
        const stream = await agent.stream(toMessages(request.history, request.text), {
          instructions: responderInstructions(request),
          toolsets: { nexo: buildTools(tools) },
          activeTools: request.allowedTools,
          maxSteps: MAX_STEPS,
          modelSettings: { temperature: 0.2 },
        })
        let text = ''
        for await (const delta of stream.textStream) {
          text += delta
          sink.emit({ type: 'text_delta', text: delta })
        }
        const totalUsage = await stream.totalUsage
        const steps = await stream.steps
        return success({
          text: text.trim(),
          usage: {
            model: configuration.model,
            calls: Math.max(steps.length, 1),
            inputTokens: totalUsage?.inputTokens ?? 0,
            outputTokens: totalUsage?.outputTokens ?? 0,
            latencyMilliseconds: Date.now() - startedAt,
          },
        })
      } catch (error) {
        return failure({ kind: 'unavailable', detail: describeError(error) })
      }
    },
  }
}
