import type { Conversation, ConversationState } from '../../../domain/conversation'
import type { Interpretation } from '../../../domain/interpretation'
import type { Message, NewMessage } from '../../../domain/message'
import type { ToolName } from '../../../domain/policy'
import type { NewTicket, Ticket } from '../../../domain/ticket'
import type { LlmUsage } from '../../../domain/trace'
import type { Result } from '../../../result'
import type { TurnEventSink } from '../in'

export type GatewayError = { kind: 'unavailable'; attempts: number } | { kind: 'not_found' } | { kind: 'rejected'; reason: string }

export interface GatewayCall<T> {
  result: Result<T, GatewayError>
  attempts: number
}

export interface TicketGateway {
  listByEmployee(employeeId: string): Promise<GatewayCall<Ticket[]>>
  get(employeeId: string, ticketId: string): Promise<GatewayCall<Ticket>>
  create(employeeId: string, ticket: NewTicket, idempotencyKey: string): Promise<GatewayCall<Ticket>>
  addUpdate(employeeId: string, ticketId: string, text: string, idempotencyKey: string): Promise<GatewayCall<Ticket>>
  reopen(employeeId: string, ticketId: string, reason: string, idempotencyKey: string): Promise<GatewayCall<Ticket>>
  transfer(employeeId: string, ticketId: string, summary: string, idempotencyKey: string): Promise<GatewayCall<Ticket>>
}

export interface Article {
  slug: string
  title: string
  body: string
  appliesTo: string | null
}

export interface KnowledgeBase {
  search(query: string, limit: number): Promise<Article[]>
}

export interface ConsoleRow {
  conversation: Conversation
  employee: User
  analystName: string | null
  lastMessage: Message | null
  trailingEmployeeMessages: number
}

export interface ConversationRepository {
  findById(conversationId: string): Promise<Conversation | null>
  findOpenByEmployee(employeeId: string): Promise<Conversation | null>
  create(employeeId: string, state: ConversationState): Promise<Conversation>
  save(conversation: Conversation): Promise<Result<Conversation, 'version_conflict'>>
  appendMessage(message: NewMessage): Promise<Message>
  listMessages(conversationId: string, after?: Date): Promise<Message[]>
  recentMessages(conversationId: string, limit: number): Promise<Message[]>
  countEmployeeMessagesSince(employeeId: string, since: Date): Promise<number>
  listForConsole(): Promise<ConsoleRow[]>
}

export interface User {
  id: string
  email: string
  name: string
  role: 'employee' | 'analyst'
  department: string
  team: string | null
}

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>
  findById(userId: string): Promise<User | null>
}

export interface HistoryEntry {
  author: 'employee' | 'agent' | 'analyst'
  text: string
}

export interface InterpretRequest {
  employeeName: string
  history: HistoryEntry[]
  text: string
  stateSummary: string
}

export type LlmError = { kind: 'unavailable' | 'invalid_output' | 'budget_exceeded'; detail: string }

export interface Interpreter {
  interpret(request: InterpretRequest): Promise<Result<{ interpretation: Interpretation; usage: LlmUsage }, LlmError>>
}

export interface RespondRequest {
  employeeName: string
  history: HistoryEntry[]
  text: string
  interpretation: Interpretation
  mode: 'respond' | 'clarify'
  allowedTools: ToolName[]
  stateSummary: string
  now: Date
}

export interface TurnTools {
  searchHelpCenter(input: { query: string }): Promise<unknown>
  listMyTickets(): Promise<unknown>
  getTicket(input: { ticketId: string }): Promise<unknown>
  askOptions(input: { options: string[] }): Promise<unknown>
  prepareTicketDraft(input: TicketDraftInput): Promise<unknown>
  prepareUpdateDraft(input: { ticketId: string; text: string }): Promise<unknown>
}

export interface TicketDraftInput {
  title: string
  description: string
  kind: Ticket['kind']
  category: Ticket['category']
  impact: Ticket['impact']
  blocksWork: boolean
  deadlineToday: boolean
}

export interface Responder {
  respond(
    request: RespondRequest,
    tools: TurnTools,
    sink: TurnEventSink,
  ): Promise<Result<{ text: string; usage: LlmUsage }, LlmError>>
}

export interface Clock {
  now(): Date
}

export interface IdGenerator {
  uuid(): string
}
