import {
  CATEGORIES,
  failure,
  IMPACTS,
  success,
  PRIORITIES,
  TICKET_KINDS,
  TICKET_STATUSES,
  type GatewayCall,
  type Ticket,
  type TicketGateway,
} from '@nexo/core'
import { z } from 'zod'

const ticketEventSchema = z.object({
  type: z.enum(['created', 'update', 'status_change', 'reopened', 'transferred']),
  body: z.string(),
  author: z.string(),
  at: z.coerce.date(),
})

const ticketSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  kind: z.enum(TICKET_KINDS),
  category: z.enum(CATEGORIES),
  title: z.string(),
  description: z.string(),
  priority: z.enum(PRIORITIES),
  status: z.enum(TICKET_STATUSES),
  impact: z.enum(IMPACTS),
  createdAt: z.coerce.date(),
  lastUpdateAt: z.coerce.date(),
  resolvedAt: z.coerce.date().nullable(),
  events: z.array(ticketEventSchema),
})

const errorBodySchema = z.object({ error: z.string() })

export interface HttpTicketGatewayConfiguration {
  baseUrl: string
  serviceToken: string
  timeoutMilliseconds?: number
  maxAttempts?: number
  baseDelayMilliseconds?: number
  fetchFunction?: typeof fetch
  wait?: (milliseconds: number) => Promise<void>
}

interface RequestOptions<T> {
  employeeId: string
  method: 'GET' | 'POST'
  path: string
  schema: z.ZodType<T>
  body?: unknown
  idempotencyKey?: string
}

const RETRYABLE_STATUSES = new Set([502, 503, 504])

export function createHttpTicketGateway(configuration: HttpTicketGatewayConfiguration): TicketGateway {
  const {
    baseUrl,
    serviceToken,
    timeoutMilliseconds = 3000,
    maxAttempts = 3,
    baseDelayMilliseconds = 200,
    fetchFunction = fetch,
    wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = configuration

  const backoff = (attempt: number) => baseDelayMilliseconds * 2 ** (attempt - 1) + Math.random() * baseDelayMilliseconds

  async function request<T>({ employeeId, method, path, schema, body, idempotencyKey }: RequestOptions<T>): Promise<GatewayCall<T>> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetchFunction(`${baseUrl}${path}`, {
          method,
          signal: AbortSignal.timeout(timeoutMilliseconds),
          headers: {
            authorization: `Bearer ${serviceToken}`,
            'x-employee-id': employeeId,
            'content-type': 'application/json',
            ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
        if (response.ok) return { result: success(schema.parse(await response.json())), attempts: attempt }
        if (response.status === 404) return { result: failure({ kind: 'not_found' }), attempts: attempt }
        if (!RETRYABLE_STATUSES.has(response.status)) {
          const parsed = errorBodySchema.safeParse(await response.json().catch(() => null))
          return { result: failure({ kind: 'rejected', reason: parsed.success ? parsed.data.error : `http_${response.status}` }), attempts: attempt }
        }
      } catch (error) {
        if (error instanceof z.ZodError) throw error
      }
      if (attempt < maxAttempts) await wait(backoff(attempt))
    }
    return { result: failure({ kind: 'unavailable', attempts: maxAttempts }), attempts: maxAttempts }
  }

  const encoded = (ticketId: string) => encodeURIComponent(ticketId)

  return {
    listByEmployee: (employeeId) => request<Ticket[]>({ employeeId, method: 'GET', path: '/tickets', schema: z.array(ticketSchema) }),
    get: (employeeId, ticketId) => request<Ticket>({ employeeId, method: 'GET', path: `/tickets/${encoded(ticketId)}`, schema: ticketSchema }),
    create: (employeeId, ticket, idempotencyKey) =>
      request<Ticket>({ employeeId, method: 'POST', path: '/tickets', schema: ticketSchema, body: ticket, idempotencyKey }),
    addUpdate: (employeeId, ticketId, text, idempotencyKey) =>
      request<Ticket>({ employeeId, method: 'POST', path: `/tickets/${encoded(ticketId)}/updates`, schema: ticketSchema, body: { text }, idempotencyKey }),
    reopen: (employeeId, ticketId, reason, idempotencyKey) =>
      request<Ticket>({ employeeId, method: 'POST', path: `/tickets/${encoded(ticketId)}/reopen`, schema: ticketSchema, body: { text: reason }, idempotencyKey }),
    transfer: (employeeId, ticketId, summary, idempotencyKey) =>
      request<Ticket>({ employeeId, method: 'POST', path: `/tickets/${encoded(ticketId)}/transfer`, schema: ticketSchema, body: { text: summary }, idempotencyKey }),
  }
}
