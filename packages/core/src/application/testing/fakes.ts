import type { Conversation, ConversationState } from '../../domain/conversation'
import type { Interpretation } from '../../domain/interpretation'
import type { Message, NewMessage } from '../../domain/message'
import type { Ticket } from '../../domain/ticket'
import { emptyUsage } from '../../domain/trace'
import { err, ok } from '../../result'
import type { TurnEventSink } from '../ports/in'
import type { Clock, ConversationRepository, IdGenerator, Interpreter, KnowledgeBase, Responder, TicketGateway, TurnTools, UserRepository } from '../ports/out'
import type { Article, ConsoleRow, GatewayCall, RespondRequest, TurnEvent, User } from '../dto'

export const fixedClock = (iso = '2026-10-29T09:43:00-03:00'): Clock & { advance(milliseconds: number): void } => {
  let current = new Date(iso)
  return {
    now: () => new Date(current),
    advance: (milliseconds) => {
      current = new Date(current.getTime() + milliseconds)
    },
  }
}

export const sequentialIds = (): IdGenerator => {
  let counter = 0
  return { uuid: () => `${(++counter).toString(16).padStart(8, '0')}-0000-4000-8000-000000000000` }
}

export const ANA: User = { id: 'emp-ana', email: 'ana.souza@nexo.com.br', name: 'Ana Souza', role: 'employee', department: 'Financeiro', team: 'Controladoria' }
export const BRUNO: User = { id: 'emp-bruno', email: 'bruno.tavares@nexo.com.br', name: 'Bruno Tavares', role: 'employee', department: 'Operações', team: null }
export const RAFAEL: User = { id: 'ana-rafael', email: 'rafael.lima@nexo.com.br', name: 'Rafael Lima', role: 'analyst', department: 'Suporte N2', team: null }

export const inMemoryUsers = (users: User[] = [ANA, BRUNO, RAFAEL]): UserRepository => ({
  findByEmail: async (email) => users.find((user) => user.email === email) ?? null,
  findById: async (userId) => users.find((user) => user.id === userId) ?? null,
})

export function inMemoryConversations(clock: Clock, users: User[] = [ANA, BRUNO, RAFAEL]) {
  const conversations = new Map<string, Conversation>()
  const messages: Message[] = []
  let counter = 0

  const repository: ConversationRepository = {
    findById: async (conversationId) => structuredClone(conversations.get(conversationId) ?? null),
    findOpenByEmployee: async (employeeId) =>
      structuredClone([...conversations.values()].find((conversation) => conversation.employeeId === employeeId && conversation.status !== 'closed') ?? null),
    async create(employeeId, state: ConversationState) {
      const now = clock.now()
      const conversation: Conversation = {
        id: `conv-${++counter}`,
        employeeId,
        status: 'agent',
        assignedAnalystId: null,
        state,
        version: 1,
        createdAt: now,
        updatedAt: now,
        closedAt: null,
        resolution: null,
      }
      conversations.set(conversation.id, conversation)
      return structuredClone(conversation)
    },
    async save(conversation) {
      const stored = conversations.get(conversation.id)
      if (!stored || stored.version !== conversation.version) return err('version_conflict')
      const saved = { ...structuredClone(conversation), version: conversation.version + 1 }
      conversations.set(conversation.id, saved)
      return ok(structuredClone(saved))
    },
    async appendMessage(newMessage: NewMessage) {
      const message: Message = { ...structuredClone(newMessage), id: `msg-${messages.length + 1}`, createdAt: clock.now() }
      messages.push(message)
      return structuredClone(message)
    },
    listMessages: async (conversationId, after) =>
      structuredClone(messages.filter((message) => message.conversationId === conversationId && (!after || message.createdAt > after))),
    recentMessages: async (conversationId, limit) =>
      structuredClone(messages.filter((message) => message.conversationId === conversationId).slice(-limit)),
    countEmployeeMessagesSince: async (employeeId, since) =>
      messages.filter(
        (message) =>
          message.author === 'employee' &&
          message.createdAt >= since &&
          conversations.get(message.conversationId)?.employeeId === employeeId,
      ).length,
    async listForConsole() {
      return [...conversations.values()].flatMap((conversation): ConsoleRow[] => {
        const employee = users.find((user) => user.id === conversation.employeeId)
        if (!employee) return []
        const own = messages.filter((message) => message.conversationId === conversation.id)
        const lastNonEmployee = own.findLastIndex((message) => message.author !== 'employee')
        return [
          {
            conversation: structuredClone(conversation),
            employee,
            analystName: users.find((user) => user.id === conversation.assignedAnalystId)?.name ?? null,
            lastMessage: own.at(-1) ?? null,
            trailingEmployeeMessages: own.length - 1 - lastNonEmployee,
          },
        ]
      })
    },
  }
  return { repository, messages, conversations }
}

export function inMemoryTickets(initial: Ticket[], clock: Clock) {
  const tickets = structuredClone(initial)
  const calls: string[] = []
  let failing = false
  let counter = 20520

  const owned = (employeeId: string, ticketId: string) =>
    tickets.find((ticket) => ticket.id === ticketId && ticket.employeeId === employeeId)

  const respond = <T>(value: T | undefined): GatewayCall<T> =>
    failing
      ? { result: err({ kind: 'unavailable', attempts: 3 }), attempts: 3 }
      : value === undefined
        ? { result: err({ kind: 'not_found' }), attempts: 1 }
        : { result: ok(structuredClone(value)), attempts: 1 }

  const gateway: TicketGateway = {
    async listByEmployee(employeeId) {
      calls.push('list')
      return respond(tickets.filter((ticket) => ticket.employeeId === employeeId))
    },
    async get(employeeId, ticketId) {
      calls.push(`get:${ticketId}`)
      return respond(owned(employeeId, ticketId))
    },
    async create(employeeId, newTicket) {
      calls.push('create')
      if (failing) return respond<Ticket>(undefined)
      const now = clock.now()
      const ticket: Ticket = {
        ...newTicket,
        id: `${newTicket.kind}-${counter++}`,
        employeeId,
        status: 'open',
        createdAt: now,
        lastUpdateAt: now,
        resolvedAt: null,
        events: [],
      }
      tickets.push(ticket)
      return respond(ticket)
    },
    async addUpdate(employeeId, ticketId, text) {
      calls.push(`update:${ticketId}`)
      const ticket = owned(employeeId, ticketId)
      ticket?.events.push({ type: 'update', body: text, author: 'Funcionário', at: clock.now() })
      return respond(ticket)
    },
    async reopen(employeeId, ticketId) {
      calls.push(`reopen:${ticketId}`)
      const ticket = owned(employeeId, ticketId)
      if (ticket) Object.assign(ticket, { status: 'open', resolvedAt: null })
      return respond(ticket)
    },
    async transfer(employeeId, ticketId) {
      calls.push(`transfer:${ticketId}`)
      return respond(owned(employeeId, ticketId))
    },
  }
  return {
    gateway,
    calls,
    tickets,
    setFailing(value: boolean) {
      failing = value
    },
  }
}

export const staticKnowledgeBase = (articles: Article[]): KnowledgeBase => ({
  search: async (query) => articles.filter((article) => query.toLowerCase().split(/\s+/).some((word) => word.length > 2 && article.body.toLowerCase().includes(word))),
})

export const interpretationOf = (overrides: Partial<Interpretation>): Interpretation => ({
  intent: 'question',
  confidence: 0.9,
  summary: 'resumo',
  ticketRef: null,
  kind: null,
  category: null,
  impact: null,
  blocksWork: null,
  deadlineToday: null,
  environment: null,
  rationale: 'motivo',
  ...overrides,
})

export function scriptedInterpreter(script: Interpretation[]) {
  const requests: Parameters<Interpreter['interpret']>[0][] = []
  const interpreter: Interpreter = {
    async interpret(request) {
      requests.push(request)
      const next = script.shift()
      if (!next) return err({ kind: 'unavailable', detail: 'roteiro vazio' })
      return ok({ interpretation: next, usage: { ...emptyUsage('fake'), calls: 1, inputTokens: 100, outputTokens: 20 } })
    },
  }
  return { interpreter, requests }
}

export type ResponderStep = (tools: TurnTools, request: RespondRequest) => Promise<string>

export function scriptedResponder(script: ResponderStep[]) {
  const requests: RespondRequest[] = []
  const responder: Responder = {
    async respond(request, tools, sink) {
      requests.push(request)
      const step = script.shift()
      if (!step) return err({ kind: 'unavailable', detail: 'roteiro vazio' })
      const text = await step(tools, request)
      sink.emit({ type: 'text_delta', text })
      return ok({ text, usage: { ...emptyUsage('fake'), calls: 1, inputTokens: 200, outputTokens: 40 } })
    },
  }
  return { responder, requests }
}

export function recordingSink(): TurnEventSink & { events: TurnEvent[] } {
  const events: TurnEvent[] = []
  return { events, emit: (event) => events.push(event) }
}
