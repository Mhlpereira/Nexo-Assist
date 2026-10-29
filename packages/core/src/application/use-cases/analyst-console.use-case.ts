import { HANDOFF_REASON_LABEL, transition, type Conversation, type ConversationEvent } from '../../domain/conversation'
import { plainText, toTicketView, type SystemEventIcon } from '../../domain/message'
import { formatDue } from '../../domain/sla'
import type { DecisionTrace } from '../../domain/trace'
import { err, ok, type Result } from '../../result'
import type { AnalystConsole } from '../ports/in'
import type { Clock, ConversationRepository, TicketGateway, UserRepository } from '../ports/out'
import type { ConsoleError, ConsoleFilter, ConsoleRow, ConversationSummary } from '../dto'

export interface AnalystConsoleDependencies {
  conversations: ConversationRepository
  users: UserRepository
  tickets: TicketGateway
  clock: Clock
}

const URGENT_REASONS = new Set(['critical', 'low_confidence', 'overdue'])

function describeTag(row: ConsoleRow, analystId: string): Pick<ConversationSummary, 'tag' | 'tagTone'> {
  const { conversation, analystName } = row
  const handoff = conversation.state.handoff
  switch (conversation.status) {
    case 'waiting_analyst':
      if (handoff?.reason === 'low_confidence') {
        const confidence = handoff.confidence === null ? '' : ` · confiança ${Math.round(handoff.confidence * 100)}%`
        return { tag: `Agent pediu ajuda${confidence}`, tagTone: 'danger' }
      }
      if (handoff?.reason === 'critical') return { tag: `Crítico${handoff.ticketId ? ` · ${handoff.ticketId}` : ''}`, tagTone: 'danger' }
      return {
        tag: `Transferida · ${handoff?.ticketId ?? (handoff ? HANDOFF_REASON_LABEL[handoff.reason] : 'aguardando')}`,
        tagTone: 'warning',
      }
    case 'with_analyst':
      return conversation.assignedAnalystId === analystId
        ? { tag: 'Você está atendendo', tagTone: 'info' }
        : { tag: `Com ${analystName ?? 'outro analista'}`, tagTone: 'neutral' }
    case 'agent':
      return { tag: 'Agent atendendo', tagTone: 'neutral' }
    case 'closed':
      return {
        tag: conversation.resolution === 'agent' ? 'Resolvida pelo agent' : conversation.resolution === 'analyst' ? 'Encerrada pelo analista' : 'Encerrada',
        tagTone: 'success',
      }
  }
}

function matchesFilter(conversation: Conversation, filter: ConsoleFilter, analystId: string): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'for_you':
      return conversation.status === 'waiting_analyst'
    case 'with_agent':
      return conversation.status === 'agent'
    case 'mine':
      return conversation.status === 'with_analyst' && conversation.assignedAnalystId === analystId
  }
}

function priorityOf(conversation: Conversation): number {
  if (conversation.status === 'waiting_analyst') return URGENT_REASONS.has(conversation.state.handoff?.reason ?? '') ? 0 : 1
  if (conversation.status === 'with_analyst') return 2
  if (conversation.status === 'agent') return 3
  return 4
}

function toSummary(row: ConsoleRow, analystId: string): ConversationSummary {
  const lastText = row.lastMessage ? plainText(row.lastMessage) : ''
  const prefix = row.lastMessage?.author === 'agent' ? 'Nexo: ' : ''
  return {
    id: row.conversation.id,
    employee: { id: row.employee.id, name: row.employee.name, department: row.employee.department },
    status: row.conversation.status,
    ...describeTag(row, analystId),
    lastMessagePreview: `${prefix}${lastText}`.slice(0, 80),
    lastMessageAt: row.lastMessage?.createdAt.toISOString() ?? null,
    unread: row.conversation.status === 'waiting_analyst' || row.conversation.status === 'with_analyst' ? row.trailingEmployeeMessages : 0,
    updatedAt: row.conversation.updatedAt.toISOString(),
  }
}

export function createAnalystConsole({ conversations, users, tickets, clock }: AnalystConsoleDependencies): AnalystConsole {
  async function applyEvent(
    analystId: string,
    conversationId: string,
    event: ConversationEvent,
    systemText: (analystName: string, time: string) => string,
    icon: SystemEventIcon,
  ): Promise<Result<void, ConsoleError>> {
    const conversation = await conversations.findById(conversationId)
    if (!conversation) return err('conversation_not_found')
    const transitioned = transition(conversation, event, clock.now())
    if (!transitioned.ok) return err(transitioned.error)
    const saved = await conversations.save(transitioned.value)
    if (!saved.ok) return err('invalid_transition')
    const analyst = await users.findById(analystId)
    await conversations.appendMessage({
      conversationId,
      author: 'system',
      authorName: 'Sistema',
      blocks: [{ kind: 'system', icon, text: systemText(analyst?.name ?? 'Analista', formatDue(clock.now(), clock.now())) }],
      trace: null,
    })
    return ok(undefined)
  }

  return {
    async list(analystId, filter, search) {
      const rows = await conversations.listForConsole()
      const term = search.trim().toLowerCase()
      const searched = term
        ? rows.filter(
            (row) =>
              row.employee.name.toLowerCase().includes(term) ||
              (row.conversation.state.handoff?.ticketId ?? '').toLowerCase().includes(term) ||
              (row.conversation.state.selectedTicketId ?? '').toLowerCase().includes(term),
          )
        : rows
      const counts: Record<ConsoleFilter, number> = {
        all: searched.length,
        for_you: searched.filter((row) => matchesFilter(row.conversation, 'for_you', analystId)).length,
        with_agent: searched.filter((row) => matchesFilter(row.conversation, 'with_agent', analystId)).length,
        mine: searched.filter((row) => matchesFilter(row.conversation, 'mine', analystId)).length,
      }
      const visible = searched
        .filter((row) => matchesFilter(row.conversation, filter, analystId))
        .sort(
          (first, second) =>
            priorityOf(first.conversation) - priorityOf(second.conversation) ||
            second.conversation.updatedAt.getTime() - first.conversation.updatedAt.getTime(),
        )
      return { conversations: visible.map((row) => toSummary(row, analystId)), counts }
    },

    async detail(analystId, conversationId) {
      const rows = await conversations.listForConsole()
      const row = rows.find((candidate) => candidate.conversation.id === conversationId)
      if (!row) return err('conversation_not_found')
      const messages = await conversations.listMessages(conversationId)
      const ticketCall = await tickets.listByEmployee(row.employee.id)
      const now = clock.now()
      return ok({
        summary: toSummary(row, analystId),
        handoff: row.conversation.state.handoff,
        assignedAnalystId: row.conversation.assignedAnalystId,
        messages,
        traces: messages.flatMap((message): DecisionTrace[] => (message.trace ? [message.trace] : [])),
        employee: row.employee,
        tickets: ticketCall.result.ok ? ticketCall.result.value.map((ticket) => toTicketView(ticket, now)) : null,
      })
    },

    takeOver: (analystId, conversationId) =>
      applyEvent(analystId, conversationId, { type: 'take_over', analystId }, (name, time) => `${name} assumiu · agent pausado · ${time}`, 'takeover'),

    returnToAgent: (analystId, conversationId) =>
      applyEvent(analystId, conversationId, { type: 'return_to_agent', analystId }, (name, time) => `${name} devolveu ao agent · ${time}`, 'return'),

    close: (analystId, conversationId) =>
      applyEvent(analystId, conversationId, { type: 'close', by: 'analyst', analystId }, (name, time) => `Atendimento encerrado por ${name} · ${time}`, 'close'),

    async sendMessage(analystId, conversationId, text) {
      const trimmed = text.trim()
      if (!trimmed) return err('empty_message')
      const conversation = await conversations.findById(conversationId)
      if (!conversation) return err('conversation_not_found')
      if (conversation.status !== 'with_analyst') return err('invalid_transition')
      if (conversation.assignedAnalystId !== analystId) return err('not_assigned_analyst')
      const analyst = await users.findById(analystId)
      await conversations.appendMessage({
        conversationId,
        author: 'analyst',
        authorName: analyst?.name ?? 'Analista',
        blocks: [{ kind: 'text', text: trimmed }],
        trace: null,
      })
      await conversations.save({ ...conversation, updatedAt: clock.now() })
      return ok(undefined)
    },
  }
}
