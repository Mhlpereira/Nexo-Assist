import type { ConversationState, Draft } from '../../domain/conversation'
import { HANDOFF_ACTION, toTicketView, type QuickReply, type TicketView } from '../../domain/message'
import { RULES } from '../../domain/policy'
import { computePriority } from '../../domain/priority'
import { dueDate, formatDue, SLA } from '../../domain/sla'
import { isActive, PRIORITY_LABEL, type Ticket } from '../../domain/ticket'
import { canReopen, canUpdate, findLikelyDuplicate } from '../../domain/ticket-rules'
import type { Clock, IdGenerator, KnowledgeBase, TicketGateway, TurnTools } from '../ports/out'
import type { ActionOutcome, Turn } from './turn'
import type { GatewayCall } from '../dto'

export interface TurnToolsDependencies {
  employeeId: string
  state: ConversationState
  turn: Turn
  tickets: TicketGateway
  knowledgeBase: KnowledgeBase
  clock: Clock
  ids: IdGenerator
}

export const UNAVAILABLE_MESSAGE =
  'O sistema de chamados não respondeu depois de algumas tentativas. Avise o funcionário e ofereça tentar de novo ou falar com um analista.'
const NOT_FOUND_MESSAGE = 'Não encontrei esse chamado entre os do funcionário. Não confirme se ele existe para outra pessoa.'

export const compactTicket = (view: TicketView) => ({
  id: view.id,
  title: view.title,
  status: view.statusLabel,
  priority: view.priorityLabel,
  category: view.categoryLabel,
  lastUpdate: view.lastUpdateAgo,
  overdue: view.overdue,
  nextUpdateDue: view.dueLabel,
  sla: view.slaLabel,
})

export const shortDraftId = (uuid: string) => `D-${100 + (Number.parseInt(uuid.slice(0, 6), 16) % 900)}`

export function toQuickReplies(options: string[]): QuickReply[] {
  return options.map((label) => ({
    label,
    value: /analista|atendente|humano/i.test(label) ? HANDOFF_ACTION : label,
  }))
}

function fromGateway<T, V>(call: GatewayCall<T>, onSuccess: (value: T) => { value: V; output: unknown }, fallback: V): ActionOutcome<V> {
  if (call.result.ok) return { ...onSuccess(call.result.value), status: 'ok', attempts: call.attempts }
  const error = call.result.error
  const output = error.kind === 'not_found' ? NOT_FOUND_MESSAGE : error.kind === 'unavailable' ? UNAVAILABLE_MESSAGE : error.reason
  return { value: fallback, output, status: error.kind === 'not_found' ? 'ok' : 'error', attempts: call.attempts }
}

export function createTurnTools(dependencies: TurnToolsDependencies): TurnTools {
  const { employeeId, state, turn, tickets, knowledgeBase, clock, ids } = dependencies

  const remember = (ticket: Ticket) => {
    turn.seenTicketIds.add(ticket.id)
    return toTicketView(ticket, clock.now())
  }

  const loadTicket = (ticketId: string) =>
    turn.track(`consultou o ${ticketId}`, 'get_ticket', { ticketId }, async () =>
      fromGateway(await tickets.get(employeeId, ticketId), (ticket) => ({ value: ticket, output: compactTicket(remember(ticket)) }), null),
    )

  const loadMyTickets = () =>
    turn.track('consultou seus chamados', 'list_my_tickets', {}, async () =>
      fromGateway(
        await tickets.listByEmployee(employeeId),
        (list) => ({ value: list, output: `${list.length} chamados` }),
        null,
      ),
    )

  const describeFailure = () => turn.actions.at(-1)?.output

  const showDraft = (draft: Draft) => {
    state.pendingDraft = draft
    turn.addBlock({ kind: 'draft', draft })
  }

  return {
    async searchHelpCenter({ query }) {
      const articles = await turn.track('buscou na central de ajuda', 'search_help_center', { query }, async () => {
        const found = await knowledgeBase.search(query, 3)
        return { value: found, output: found.map((article) => article.title), status: 'ok', attempts: 1 }
      })
      if (articles.length === 0) {
        return { articles: [], note: 'Nenhum artigo relevante. Não invente procedimento: ofereça abrir um chamado.' }
      }
      return { articles: articles.map(({ title, body, appliesTo }) => ({ title, body, appliesTo })) }
    },

    async listMyTickets() {
      const list = await loadMyTickets()
      if (!list) return { error: describeFailure() }
      const now = clock.now()
      const active = list.filter((ticket) => isActive(ticket.status)).map(remember)
      const recentlyResolved = list.filter((ticket) => canReopen(ticket, now)).map(remember)
      if (active.length > 1) turn.addBlock({ kind: 'ticket_selector', tickets: active })
      if (active.length === 1 && active[0]) turn.addBlock({ kind: 'ticket_card', ticket: active[0] })
      return {
        active: active.map(compactTicket),
        recentlyResolved: recentlyResolved.map(compactTicket),
        shownToEmployee: active.length > 1 ? 'seleção de chamados' : active.length === 1 ? 'card do chamado' : 'nada',
      }
    },

    async getTicket({ ticketId }) {
      const ticket = await loadTicket(ticketId.trim().toUpperCase())
      if (!ticket) return { found: false, message: describeFailure() }
      state.selectedTicketId = ticket.id
      const view = await turn.track('calculou o prazo', 'sla', { priority: ticket.priority }, async () => {
        const computed = toTicketView(ticket, clock.now())
        return { value: computed, output: { overdue: computed.overdue, due: computed.dueLabel }, status: 'ok', attempts: 1 }
      })
      turn.addBlock({ kind: 'ticket_card', ticket: view })
      return {
        found: true,
        ticket: { ...compactTicket(view), description: ticket.description },
        recentEvents: ticket.events.slice(-3).map((event) => `${event.author}: ${event.body}`),
        canReopen: canReopen(ticket, clock.now()),
      }
    },

    async askOptions({ options }) {
      turn.addBlock({ kind: 'quick_replies', options: toQuickReplies(options) })
      return { shown: true }
    },

    async prepareTicketDraft(input) {
      const list = await loadMyTickets()
      if (!list) return { error: describeFailure() }

      turn.addRule(RULES.duplicate)
      const duplicate = findLikelyDuplicate({ category: input.category, text: `${input.title} ${input.description}` }, list)
      if (duplicate) {
        const view = remember(duplicate.ticket)
        turn.addBlock({ kind: 'ticket_card', ticket: view })
        return {
          duplicateOf: compactTicket(view),
          similarity: Number(duplicate.score.toFixed(2)),
          instruction: 'Já existe chamado aberto sobre isso. Ofereça complementar esse chamado (prepare_update_draft) em vez de abrir outro.',
        }
      }

      const decision = await turn.track('classificou a prioridade', 'compute_priority', input, async () => {
        const computed = computePriority(input)
        return { value: computed, output: computed, status: 'ok', attempts: 1 }
      })
      turn.addRule(RULES.priority)

      const now = clock.now()
      const due = await turn.track('consultou o SLA', 'sla', { priority: decision.priority }, async () => {
        const computed = dueDate(decision.priority, now)
        return { value: computed, output: { sla: SLA[decision.priority].label, due: formatDue(computed, now) }, status: 'ok', attempts: 1 }
      })

      const draft = await turn.track('montou o rascunho', 'prepare_ticket_draft', {}, async () => {
        const uuid = ids.uuid()
        const created: Draft = {
          id: shortDraftId(uuid),
          idempotencyKey: uuid,
          mode: 'create',
          ticketId: null,
          title: input.title,
          description: input.description,
          kind: input.kind,
          category: input.category,
          priority: decision.priority,
          impact: input.impact,
          priorityReason: decision.reason,
          dueAt: due.toISOString(),
          status: 'pending',
        }
        return { value: created, output: { draftId: created.id }, status: 'ok', attempts: 1 }
      })
      showDraft(draft)
      turn.addRule(RULES.confirmation)

      return {
        draftId: draft.id,
        priority: PRIORITY_LABEL[draft.priority],
        priorityReason: decision.reason,
        firstResponseDue: formatDue(due, now),
        sla: SLA[draft.priority].label,
        instruction: 'O rascunho já está na tela com os botões Confirmar, Editar e Cancelar. Explique a prioridade em uma frase e peça para conferir. Não diga que o chamado foi criado.',
      }
    },

    async prepareUpdateDraft({ ticketId, text }) {
      const ticket = await loadTicket(ticketId.trim().toUpperCase())
      if (!ticket) return { error: describeFailure() }
      state.selectedTicketId = ticket.id

      const mode = canUpdate(ticket) ? 'update' : canReopen(ticket, clock.now()) ? 'reopen' : null
      if (!mode) {
        turn.addRule(RULES.reopen)
        return {
          error: `O ${ticket.id} foi resolvido há mais de 7 dias e não pode ser reaberto. Ofereça abrir um novo chamado citando o ${ticket.id}.`,
        }
      }
      if (mode === 'reopen') turn.addRule(RULES.reopen)

      const draft = await turn.track(mode === 'update' ? 'montou a atualização' : 'montou a reabertura', 'prepare_update_draft', { ticketId, mode }, async () => {
        const uuid = ids.uuid()
        const created: Draft = {
          id: shortDraftId(uuid),
          idempotencyKey: uuid,
          mode,
          ticketId: ticket.id,
          title: ticket.title,
          description: text,
          kind: ticket.kind,
          category: ticket.category,
          priority: ticket.priority,
          impact: ticket.impact,
          priorityReason: '',
          dueAt: null,
          status: 'pending',
        }
        return { value: created, output: { draftId: created.id, mode }, status: 'ok', attempts: 1 }
      })
      showDraft(draft)
      turn.addRule(RULES.confirmation)
      return {
        draftId: draft.id,
        mode: mode === 'update' ? 'complemento' : 'reabertura',
        instruction: 'O rascunho já está na tela com os botões Confirmar, Editar e Cancelar. Peça para conferir.',
      }
    },
  }
}
