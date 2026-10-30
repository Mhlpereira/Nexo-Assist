import {
  HANDOFF_REASON_LABEL,
  MAX_EMPLOYEE_MESSAGES,
  transition,
  type Conversation,
  type ConversationState,
  type HandoffReason,
} from '../../domain/conversation'
import { checkInput, filterForeignTicketIds, type GuardrailFinding } from '../../domain/guardrails'
import { confidenceLevel, INTENT_LABEL, type Interpretation } from '../../domain/interpretation'
import {
  CONFIRM_DRAFT_ACTION,
  HANDOFF_ACTION,
  LIST_TICKETS_ACTION,
  toTicketView,
  type Message,
  type MessageBlock,
} from '../../domain/message'
import { decide, RULES, type RuleRef } from '../../domain/policy'
import { formatDue } from '../../domain/sla'
import { PRIORITY_LABEL, TICKET_ID_PATTERN, type Ticket } from '../../domain/ticket'
import { canReopen } from '../../domain/ticket-rules'
import { addUsage, type DecisionTrace, type InputKind, type LlmUsage } from '../../domain/trace'
import { err, ok } from '../../result'
import type { HandleEmployeeInput } from '../ports/in'
import type { Clock, ConversationRepository, IdGenerator, Interpreter, KnowledgeBase, Responder, TicketGateway, UserRepository } from '../ports/out'
import { toConversationView } from './to-conversation-view'
import { createTurn } from './turn'
import { createTurnTools, toQuickReplies, UNAVAILABLE_MESSAGE } from './turn-tools'
import type { ChatError, EmployeeInput, HistoryEntry } from '../dto'

export const AGENT_NAME = 'Nexo Assist'
export const RATE_LIMIT_PER_MINUTE = 10
const HISTORY_SIZE = 8

export interface HandleEmployeeInputDependencies {
  conversations: ConversationRepository
  users: UserRepository
  tickets: TicketGateway
  knowledgeBase: KnowledgeBase
  interpreter: Interpreter
  responder: Responder
  clock: Clock
  ids: IdGenerator
}

interface TurnDecision {
  route: string
  rationale: string
  rules: RuleRef[]
  interpretation: Interpretation | null
}

const DRAFT_ACTION_LABEL = { confirm: 'Confirmar', edit: 'Editar', cancel: 'Cancelar' } as const

const OUT_OF_SCOPE_REPLY =
  'Esse assunto não é de TI, então não consigo tratar por aqui. Para RH, use o portal do RH; para financeiro, escreva para financeiro@nexo.com.br; para facilities (salas, manutenção, limpeza), ligue no ramal 4100. Se tiver algo de TI, é só falar!'

const HANDOFF_REPLY: Record<HandoffReason, string> = {
  requested: 'Encaminhei para um analista do Suporte. Ele continua por aqui, já com o histórico da conversa. Atendimento de segunda a sexta, das 8h às 18h.',
  critical: 'Como é um caso crítico, acionei o plantão do Suporte: um analista fala com você em até 1 hora, inclusive fora do horário comercial.',
  overdue: 'Encaminhei para um analista, já que o prazo venceu. Ele continua por aqui, com o histórico da conversa.',
  low_confidence: 'Não tenho segurança para resolver isso sozinho, então chamei um analista. Ele continua por aqui, já com o histórico.',
  service_unavailable: 'O sistema de chamados está instável, então encaminhei sua conversa para um analista.',
  limit_reached: 'Atingimos o limite de mensagens desta conversa, então encaminhei para um analista.',
}

function describeInput(input: EmployeeInput): { kind: InputKind; text: string } {
  switch (input.type) {
    case 'text':
      return { kind: 'text', text: input.text }
    case 'quick_reply':
      return { kind: 'quick_reply', text: input.label }
    case 'select_ticket':
      return { kind: 'select_ticket', text: input.label }
    case 'draft_action':
      return { kind: 'draft_action', text: DRAFT_ACTION_LABEL[input.action] }
  }
}

function toHistory(messages: Message[]): HistoryEntry[] {
  return messages.flatMap((message) =>
    message.author === 'system'
      ? []
      : [{ author: message.author, text: message.blocks.map(describeBlock).filter(Boolean).join('\n') }],
  )
}

function describeBlock(block: MessageBlock): string {
  switch (block.kind) {
    case 'text':
      return block.text
    case 'ticket_card':
      return `[card ${block.ticket.id}: ${block.ticket.title} — ${block.ticket.statusLabel}${block.ticket.overdue ? ', vencido' : ''}]`
    case 'ticket_selector':
      return `[seleção de chamados: ${block.tickets.map((ticket) => ticket.id).join(', ')}]`
    case 'draft':
      return `[rascunho ${block.draft.id} (${block.draft.mode}): ${block.draft.title} — ${PRIORITY_LABEL[block.draft.priority]}]`
    case 'quick_replies':
      return `[opções: ${block.options.map((option) => option.label).join(' | ')}]`
    case 'system':
      return ''
  }
}

export function summarizeState(state: ConversationState): string {
  const parts: string[] = []
  if (state.pendingDraft) {
    const draft = state.pendingDraft
    parts.push(`Rascunho pendente ${draft.id} (${draft.mode}${draft.ticketId ? ` do ${draft.ticketId}` : ''}): "${draft.title}", prioridade ${PRIORITY_LABEL[draft.priority]}.`)
  }
  if (state.selectedTicketId) parts.push(`Chamado em foco: ${state.selectedTicketId}.`)
  return parts.join(' ') || 'Nenhum rascunho pendente nem chamado em foco.'
}

export function createHandleEmployeeInput(dependencies: HandleEmployeeInputDependencies): HandleEmployeeInput {
  const { conversations, users, tickets, knowledgeBase, interpreter, responder, clock, ids } = dependencies

  return {
    async execute({ employeeId, conversationId, input }, sink) {
      const conversation = await conversations.findById(conversationId)
      if (!conversation || conversation.employeeId !== employeeId) return err('conversation_not_found')
      if (conversation.status === 'closed') return err('conversation_closed')
      if (conversation.state.employeeMessageCount >= MAX_EMPLOYEE_MESSAGES) return err('message_limit_reached')
      const oneMinuteAgo = new Date(clock.now().getTime() - 60_000)
      if ((await conversations.countEmployeeMessagesSince(employeeId, oneMinuteAgo)) >= RATE_LIMIT_PER_MINUTE) {
        return err('rate_limited')
      }

      const described = describeInput(input)
      const inputFindings: GuardrailFinding[] = []
      let employeeText = described.text
      let injectionSuspected = false
      if (input.type === 'text') {
        const check = checkInput(input.text)
        if (check.blocked) return err<ChatError>(check.reason === 'empty' ? 'empty_message' : 'message_too_long')
        employeeText = check.text
        injectionSuspected = check.injectionSuspected
        inputFindings.push(...check.findings)
      }

      const employee = await users.findById(employeeId)
      const employeeName = employee?.name ?? 'Funcionário'
      const history = toHistory(await conversations.recentMessages(conversationId, HISTORY_SIZE))
      const employeeMessage = await conversations.appendMessage({
        conversationId,
        author: 'employee',
        authorName: employeeName,
        blocks: [{ kind: 'text', text: employeeText }],
        trace: null,
      })
      sink.emit({ type: 'employee_message', message: employeeMessage })

      let working: Conversation = {
        ...conversation,
        state: { ...conversation.state, employeeMessageCount: conversation.state.employeeMessageCount + 1 },
      }

      if (conversation.status !== 'agent') {
        const saved = await persist(working)
        return ok({ employeeMessage, agentMessage: null, conversation: await toConversationView(saved, users) })
      }

      const turn = createTurn(sink, clock)
      turn.guardrails.push(...inputFindings)
      const state = working.state
      const tools = createTurnTools({ employeeId, state, turn, tickets, knowledgeBase, clock, ids })
      let usage: LlmUsage | null = null

      const handoff = async (reason: HandoffReason, interpretation: Interpretation | null) => {
        const ticketId = state.selectedTicketId
        const ticket = ticketId ? await loadTicketQuietly(ticketId) : null
        const lastWrittenRequest = described.kind === 'text' ? employeeText : history.findLast((entry) => entry.author === 'employee')?.text
        const summary = buildHandoffSummary({ reason, state, lastRequest: lastWrittenRequest ?? employeeText, interpretation, ticket, now: clock.now() })
        if (ticketId) {
          await turn.track('transferiu o chamado', 'transfer_ticket', { ticketId }, async () => {
            const call = await tickets.transfer(employeeId, ticketId, summary, `handoff-${conversation.id}-${state.employeeMessageCount}`)
            return { value: null, output: call.result.ok ? 'ok' : call.result.error, status: call.result.ok ? 'ok' : 'error', attempts: call.attempts }
          })
        }
        const transitioned = transition(
          working,
          {
            type: 'handoff',
            handoff: { reason, summary, confidence: interpretation?.confidence ?? null, ticketId, at: clock.now().toISOString() },
          },
          clock.now(),
        )
        if (transitioned.ok) working = transitioned.value
        turn.addRule(RULES.transfer)
        turn.say(HANDOFF_REPLY[reason])
        turn.addBlock({ kind: 'system', icon: 'transfer', text: `Transferida para o Suporte · ${formatDue(clock.now(), clock.now())}` })
      }

      async function loadTicketQuietly(ticketId: string): Promise<Ticket | null> {
        const call = await tickets.get(employeeId, ticketId)
        return call.result.ok ? call.result.value : null
      }

      const confirmDraft = async (): Promise<TurnDecision> => {
        const draft = state.pendingDraft
        const base = { route: 'confirm_draft', rules: [RULES.confirmation], interpretation: null }
        if (!draft) {
          turn.say('Esse rascunho não está mais pendente. Quer que eu monte um novo?')
          return { ...base, rationale: 'Não havia rascunho pendente para confirmar' }
        }
        const label = draft.mode === 'create' ? 'criou o chamado' : draft.mode === 'update' ? 'atualizou o chamado' : 'reabriu o chamado'
        const created = await turn.track(label, `${draft.mode}_ticket`, { draftId: draft.id }, async () => {
          const call =
            draft.mode === 'create'
              ? await tickets.create(
                  employeeId,
                  { kind: draft.kind, category: draft.category, title: draft.title, description: draft.description, priority: draft.priority, impact: draft.impact },
                  draft.idempotencyKey,
                )
              : draft.mode === 'update'
                ? await tickets.addUpdate(employeeId, draft.ticketId ?? '', draft.description, draft.idempotencyKey)
                : await tickets.reopen(employeeId, draft.ticketId ?? '', draft.description, draft.idempotencyKey)
          return {
            value: call.result.ok ? call.result.value : null,
            output: call.result.ok ? { ticketId: call.result.value.id } : call.result.error,
            status: call.result.ok ? 'ok' : 'error',
            attempts: call.attempts,
          }
        })

        if (!created) {
          turn.say('O sistema de chamados está instável e não consegui registrar agora. Seu rascunho continua guardado.')
          turn.addBlock({
            kind: 'quick_replies',
            options: [
              { label: 'Tentar de novo', value: CONFIRM_DRAFT_ACTION },
              { label: 'Falar com um analista', value: HANDOFF_ACTION },
            ],
          })
          return { ...base, rationale: `Falha ao gravar o rascunho ${draft.id}: serviço indisponível` }
        }

        state.pendingDraft = null
        state.selectedTicketId = created.id
        turn.seenTicketIds.add(created.id)
        const view = toTicketView(created, clock.now())
        turn.addBlock({ kind: 'ticket_card', ticket: view })
        const doneText =
          draft.mode === 'create'
            ? `Pronto! Abri o ${created.id} com prioridade ${view.priorityLabel.toLowerCase()}.${view.dueLabel ? ` A primeira resposta chega até ${view.dueLabel}.` : ''}`
            : draft.mode === 'update'
              ? `Pronto! Adicionei a informação ao ${created.id}.`
              : `Pronto! Reabri o ${created.id}.`
        turn.say(doneText)
        if (created.priority === 'critical' && draft.mode === 'create') await handoff('critical', null)
        return { ...base, rationale: `Confirmação explícita do rascunho ${draft.id}` }
      }

      const cancelDraft = (): TurnDecision => {
        const draft = state.pendingDraft
        state.pendingDraft = null
        turn.say(draft ? `Tudo bem, descartei o rascunho ${draft.id}. Posso ajudar com mais alguma coisa?` : 'Tudo bem. Posso ajudar com mais alguma coisa?')
        return { route: 'cancel_draft', rationale: 'O funcionário cancelou o rascunho', rules: [], interpretation: null }
      }

      const showSelectedTicket = async (ticketId: string): Promise<TurnDecision> => {
        const result = await tools.getTicket({ ticketId })
        const view = state.selectedTicketId === ticketId ? turn.blocks.findLast((block) => block.kind === 'ticket_card') : undefined
        const base = { route: 'show_ticket', rules: [RULES.privacy], interpretation: null }
        if (!view || view.kind !== 'ticket_card') {
          const unavailable = typeof result === 'object' && result !== null && 'message' in result && result.message === UNAVAILABLE_MESSAGE
          turn.say(unavailable ? 'O sistema de chamados está instável agora. Quer tentar de novo em instantes ou falar com um analista?' : 'Não encontrei esse chamado entre os seus.')
          return { ...base, rationale: 'Chamado não disponível para este funcionário' }
        }
        const ticket = view.ticket
        if (ticket.overdue) {
          turn.say(`Está sem atualização ${ticket.lastUpdateAgo}, acima do prazo de ${ticket.slaLabel} para prioridade ${ticket.priorityLabel.toLowerCase()}. Quer que eu chame um analista?`)
          turn.addBlock({
            kind: 'quick_replies',
            options: [
              { label: 'Falar com um analista', value: HANDOFF_ACTION },
              { label: 'Adicionar informação', value: `Quero adicionar uma informação ao ${ticket.id}` },
              { label: 'Não, obrigado', value: 'Não, obrigado. Por enquanto é só.' },
            ],
          })
          return { ...base, rationale: `${ticket.id} está vencido: ofereço um analista (Anexo A)`, rules: [RULES.transfer] }
        }
        if (ticket.status === 'resolved' || ticket.status === 'closed') {
          turn.say(`O ${ticket.id} está ${ticket.statusLabel.toLowerCase()}.`)
          const reopenable = typeof result === 'object' && result !== null && 'canReopen' in result && result.canReopen === true
          if (reopenable) turn.addBlock({ kind: 'quick_replies', options: toQuickReplies([`O problema do ${ticket.id} voltou`]) })
          return { ...base, rationale: `${ticket.id} já foi resolvido` }
        }
        turn.say(
          `Está ${ticket.statusLabel.toLowerCase()}, prioridade ${ticket.priorityLabel.toLowerCase()}.${ticket.dueLabel ? ` A próxima atualização está prevista até ${ticket.dueLabel}.` : ''}`,
        )
        turn.addBlock({ kind: 'quick_replies', options: toQuickReplies(['Adicionar informação', 'Falar com um analista']) })
        return { ...base, rationale: `${ticket.id} dentro do prazo` }
      }

      const showMyTickets = async (): Promise<TurnDecision> => {
        await tools.listMyTickets()
        const shown = turn.blocks.at(-1)
        const base = { route: 'list_tickets', rules: [RULES.privacy], interpretation: null }
        if (shown?.kind === 'ticket_selector') {
          turn.say(`Você tem ${shown.tickets.length} chamados abertos. Sobre qual deles quer saber?`, 'start')
          return { ...base, rationale: 'Mais de um chamado aberto: peço para escolher' }
        }
        if (shown?.kind === 'ticket_card') return showSelectedTicket(shown.ticket.id)
        const failed = turn.actions.at(-1)?.status === 'error'
        turn.say(failed ? 'O sistema de chamados está instável agora. Quer tentar de novo em instantes ou falar com um analista?' : 'Você não tem chamados abertos no momento. Posso ajudar com algo?')
        if (failed) turn.addBlock({ kind: 'quick_replies', options: [{ label: 'Tentar de novo', value: LIST_TICKETS_ACTION }, { label: 'Falar com um analista', value: HANDOFF_ACTION }] })
        return { ...base, rationale: failed ? 'Serviço de chamados indisponível' : 'Nenhum chamado aberto' }
      }

      const handleText = async (text: string): Promise<TurnDecision> => {
        const stateSummary = summarizeState(state)
        const interpreted = await interpreter.interpret({ employeeName, history, text, stateSummary })
        if (!interpreted.ok) return llmFallback(text, interpreted.error.detail)
        usage = interpreted.value.usage
        const interpretation = interpreted.value.interpretation
        const decision = decide({ interpretation, state, injectionSuspected })
        state.lowConfidenceStreak = decision.lowConfidenceStreak
        const result = { route: decision.route.kind, rationale: decision.rationale, rules: decision.rules, interpretation }

        switch (decision.route.kind) {
          case 'handoff':
            await handoff(decision.route.reason, interpretation)
            return result
          case 'redirect_out_of_scope':
            turn.say(OUT_OF_SCOPE_REPLY)
            return result
          case 'confirm_draft':
            return { ...(await confirmDraft()), interpretation }
          case 'cancel_draft':
            return { ...cancelDraft(), interpretation }
          case 'close_resolved': {
            turn.say('Que bom que resolveu! Vou encerrar esta conversa. Se precisar, é só começar uma nova.')
            const closed = transition(working, { type: 'close', by: 'agent', analystId: null }, clock.now())
            if (closed.ok) working = closed.value
            return result
          }
          case 'clarify':
          case 'respond': {
            const allowedTools = decision.route.kind === 'respond' ? decision.route.tools : ['ask_options' as const]
            const responded = await responder.respond(
              { employeeName, history, text, interpretation, mode: decision.route.kind, allowedTools, stateSummary, now: clock.now() },
              tools,
              sink,
            )
            if (!responded.ok) return llmFallback(text, responded.error.detail)
            usage = addUsage(interpreted.value.usage, responded.value.usage)
            const filtered = await filterOutput(responded.value.text)
            turn.blocks.unshift({ kind: 'text', text: filtered })
            return result
          }
        }
      }

      const llmFallback = (text: string, detail: string): TurnDecision => {
        turn.say('Tive um problema para processar sua mensagem agora. Quer tentar de novo ou falar com um analista?')
        turn.addBlock({
          kind: 'quick_replies',
          options: [
            { label: 'Tentar de novo', value: text },
            { label: 'Falar com um analista', value: HANDOFF_ACTION },
          ],
        })
        return { route: 'fallback', rationale: `Modelo indisponível (${detail})`, rules: [], interpretation: null }
      }

      async function filterOutput(text: string): Promise<string> {
        const mentioned = text.match(TICKET_ID_PATTERN) ?? []
        if (mentioned.every((ticketId) => turn.seenTicketIds.has(ticketId))) return text
        const call = await tickets.listByEmployee(employeeId)
        const own = new Set([...turn.seenTicketIds, ...(call.result.ok ? call.result.value.map((ticket) => ticket.id) : [])])
        const filtered = filterForeignTicketIds(text, own)
        turn.guardrails.push(...filtered.findings)
        return filtered.text
      }

      const route = async (): Promise<TurnDecision> => {
        switch (input.type) {
          case 'draft_action': {
            const pending = state.pendingDraft
            if (!pending || pending.id !== input.draftId) {
              turn.say('Esse rascunho não está mais pendente.')
              return { route: 'stale_draft', rationale: `Rascunho ${input.draftId} já não está pendente`, rules: [], interpretation: null }
            }
            if (input.action === 'confirm') return confirmDraft()
            if (input.action === 'cancel') return cancelDraft()
            turn.say(`Claro! O que você quer mudar no rascunho ${pending.id}?`)
            return { route: 'edit_draft', rationale: 'O funcionário quer editar o rascunho', rules: [], interpretation: null }
          }
          case 'select_ticket':
            return showSelectedTicket(input.ticketId)
          case 'quick_reply':
            if (input.value === HANDOFF_ACTION) {
              const selected = state.selectedTicketId
              const overdue = selected ? await isOverdue(selected) : false
              await handoff(overdue ? 'overdue' : 'requested', null)
              return { route: 'handoff', rationale: 'O funcionário escolheu falar com um analista', rules: [RULES.transfer], interpretation: null }
            }
            if (input.value === CONFIRM_DRAFT_ACTION) return confirmDraft()
            if (input.value === LIST_TICKETS_ACTION) return showMyTickets()
            return handleText(input.value)
          case 'text':
            return handleText(employeeText)
        }
      }

      async function isOverdue(ticketId: string): Promise<boolean> {
        const ticket = await loadTicketQuietly(ticketId)
        return ticket ? toTicketView(ticket, clock.now()).overdue : false
      }

      const decision = await route()
      const interpretation = decision.interpretation
      const trace: DecisionTrace = {
        turnId: ids.uuid(),
        at: clock.now().toISOString(),
        input: { kind: described.kind, text: employeeText },
        understood: interpretation
          ? { intent: INTENT_LABEL[interpretation.intent], summary: interpretation.summary, entities: entitiesOf(interpretation) }
          : null,
        confidence: interpretation ? { score: interpretation.confidence, level: confidenceLevel(interpretation.confidence) } : null,
        decision: { route: decision.route, rationale: decision.rationale, rules: mergeRules(decision.rules, turn.rules) },
        actions: turn.actions,
        guardrails: turn.guardrails,
        llm: usage,
      }

      const agentMessage = await conversations.appendMessage({
        conversationId,
        author: 'agent',
        authorName: AGENT_NAME,
        blocks: turn.blocks,
        trace,
      })
      const saved = await persist(working)
      return ok({ employeeMessage, agentMessage, conversation: await toConversationView(saved, users) })
    },
  }

  async function persist(conversation: Conversation): Promise<Conversation> {
    const saved = await conversations.save(conversation)
    if (saved.ok) return saved.value
    return (await conversations.findById(conversation.id)) ?? conversation
  }
}

function mergeRules(first: RuleRef[], second: RuleRef[]): RuleRef[] {
  return [...first, ...second.filter((rule) => !first.some((existing) => existing.id === rule.id))]
}

function entitiesOf(interpretation: Interpretation): Record<string, string> {
  const entities: Record<string, string> = {}
  const add = (key: string, value: string | boolean | null) => {
    if (value !== null) entities[key] = typeof value === 'boolean' ? (value ? 'sim' : 'não') : value
  }
  add('chamado', interpretation.ticketRef)
  add('tipo', interpretation.kind)
  add('categoria', interpretation.category)
  add('impacto', interpretation.impact)
  add('impede de trabalhar', interpretation.blocksWork)
  add('compromisso hoje', interpretation.deadlineToday)
  add('ambiente', interpretation.environment)
  return entities
}

interface HandoffSummaryInput {
  reason: HandoffReason
  state: ConversationState
  lastRequest: string
  interpretation: Interpretation | null
  ticket: Ticket | null
  now: Date
}

export function buildHandoffSummary({ reason, state, lastRequest, interpretation, ticket, now }: HandoffSummaryInput): string {
  const lines = [`Motivo: ${HANDOFF_REASON_LABEL[reason]}.`]
  if (interpretation) {
    lines.push(`Entendimento do agent: ${interpretation.summary} (confiança ${Math.round(interpretation.confidence * 100)}%).`)
  }
  lines.push(`Último pedido: "${lastRequest}".`)
  if (ticket) {
    const view = toTicketView(ticket, now)
    const reopenNote = canReopen(ticket, now) ? ' (reabrível)' : ''
    lines.push(`Chamado: ${ticket.id} — ${ticket.title}; ${view.statusLabel}, prioridade ${view.priorityLabel}, última atualização ${view.lastUpdateAgo}${view.overdue ? ', PRAZO VENCIDO' : ''}${reopenNote}.`)
  }
  if (state.pendingDraft) lines.push(`Rascunho não confirmado: ${state.pendingDraft.title} (${PRIORITY_LABEL[state.pendingDraft.priority]}).`)
  return lines.join('\n')
}

