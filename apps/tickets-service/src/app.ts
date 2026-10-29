import {
  canReopen,
  canUpdate,
  CATEGORIES,
  IMPACTS,
  PRIORITIES,
  TICKET_KINDS,
  type Ticket,
  type TicketEvent,
} from '@nexo/core'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import type { Sql } from './database'

export interface ChaosConfiguration {
  failureRate: number
  latencyMilliseconds: number
}

export interface AppDependencies {
  sql: Sql
  serviceToken: string
  chaos: ChaosConfiguration
  now?: () => Date
  random?: () => number
}

type AppEnvironment = { Variables: { employeeId: string } }
type RequestContext = Context<AppEnvironment>
type TicketRow = Omit<Ticket, 'events'>
type TicketEventRow = TicketEvent & { ticketId: string }

const newTicketSchema = z.object({
  kind: z.enum(TICKET_KINDS),
  category: z.enum(CATEGORIES),
  title: z.string().min(3).max(120),
  description: z.string().min(3).max(4000),
  priority: z.enum(PRIORITIES),
  impact: z.enum(IMPACTS),
})
const textSchema = z.object({ text: z.string().min(1).max(4000) })

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export function createApp({ sql, serviceToken, chaos, now = () => new Date(), random = Math.random }: AppDependencies) {
  const app = new Hono<AppEnvironment>()

  async function loadTickets(employeeId: string, ticketId?: string): Promise<Ticket[]> {
    const ticketRows = await sql<TicketRow[]>`
      select * from tickets
      where employee_id = ${employeeId} ${ticketId ? sql`and id = ${ticketId}` : sql``}
      order by last_update_at desc`
    if (ticketRows.length === 0) return []
    const eventRows = await sql<TicketEventRow[]>`
      select ticket_id, type, body, author, at from ticket_events
      where ticket_id in ${sql(ticketRows.map((ticketRow) => ticketRow.id))} order by at`
    return ticketRows.map((ticketRow) => ({
      ...ticketRow,
      events: eventRows
        .filter((eventRow) => eventRow.ticketId === ticketRow.id)
        .map(({ ticketId: _ticketId, ...event }) => event),
    }))
  }

  async function addEvent(ticketId: string, type: TicketEvent['type'], body: string, author: string, at: Date) {
    await sql`insert into ticket_events (ticket_id, type, body, author, at) values (${ticketId}, ${type}, ${body}, ${author}, ${at})`
  }

  const findOwnedTicket = async (context: RequestContext) =>
    (await loadTickets(context.get('employeeId'), context.req.param('id')))[0]

  const notFound = (context: RequestContext) => context.json({ error: 'not_found' }, 404)

  app.get('/health', (context) => context.json({ ok: true }))

  app.use('*', async (context, next) => {
    if (context.req.path === '/health') return next()
    if (context.req.header('authorization') !== `Bearer ${serviceToken}`) {
      return context.json({ error: 'unauthorized' }, 401)
    }
    const employeeId = context.req.header('x-employee-id')
    if (!employeeId) return context.json({ error: 'missing_employee' }, 400)
    context.set('employeeId', employeeId)
    if (chaos.latencyMilliseconds > 0) await wait(random() * chaos.latencyMilliseconds)
    if (random() < chaos.failureRate) return context.json({ error: 'unavailable' }, 503)
    await next()
  })

  app.use('*', async (context, next) => {
    if (context.req.method !== 'POST') return next()
    const idempotencyHeader = context.req.header('idempotency-key')
    if (!idempotencyHeader) return context.json({ error: 'missing_idempotency_key' }, 400)
    const idempotencyKey = `${context.get('employeeId')}:${idempotencyHeader}`
    const [storedResponse] = await sql<{ status: number; response: string }[]>`
      select status, response from idempotency_keys where key = ${idempotencyKey}`
    if (storedResponse) {
      return context.body(storedResponse.response, storedResponse.status === 201 ? 201 : 200, {
        'content-type': 'application/json',
      })
    }
    await next()
    if (context.res.status < 300) {
      await sql`
        insert into idempotency_keys (key, status, response)
        values (${idempotencyKey}, ${context.res.status}, ${await context.res.clone().text()})
        on conflict do nothing`
    }
  })

  app.get('/tickets', async (context) => context.json(await loadTickets(context.get('employeeId'))))

  app.get('/tickets/:id', async (context) => {
    const ticket = await findOwnedTicket(context)
    return ticket ? context.json(ticket) : notFound(context)
  })

  app.post('/tickets', async (context) => {
    const parsed = newTicketSchema.safeParse(await context.req.json())
    if (!parsed.success) return context.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
    const newTicket = parsed.data
    const sequenceName = newTicket.kind === 'INC' ? 'inc_seq' : 'req_seq'
    const [sequenceRow] = await sql<{ nextNumber: string }[]>`select nextval(${sequenceName}) as next_number`
    const ticketId = `${newTicket.kind}-${sequenceRow?.nextNumber}`
    const createdAt = now()
    await sql`
      insert into tickets (id, employee_id, kind, category, title, description, priority, status, impact, created_at, last_update_at)
      values (${ticketId}, ${context.get('employeeId')}, ${newTicket.kind}, ${newTicket.category}, ${newTicket.title},
              ${newTicket.description}, ${newTicket.priority}, 'open', ${newTicket.impact}, ${createdAt}, ${createdAt})`
    await addEvent(ticketId, 'created', newTicket.description, 'Nexo Assist', createdAt)
    return context.json((await loadTickets(context.get('employeeId'), ticketId))[0], 201)
  })

  app.post('/tickets/:id/updates', async (context) => {
    const parsed = textSchema.safeParse(await context.req.json())
    if (!parsed.success) return context.json({ error: 'invalid_body' }, 400)
    const ticket = await findOwnedTicket(context)
    if (!ticket) return notFound(context)
    if (!canUpdate(ticket)) return context.json({ error: 'not_updatable' }, 409)
    const updatedAt = now()
    await sql`
      update tickets set last_update_at = ${updatedAt},
        status = case when status = 'waiting_user' then 'open' else status end
      where id = ${ticket.id}`
    await addEvent(ticket.id, 'update', parsed.data.text, 'Funcionário', updatedAt)
    return context.json(await findOwnedTicket(context))
  })

  app.post('/tickets/:id/reopen', async (context) => {
    const parsed = textSchema.safeParse(await context.req.json())
    if (!parsed.success) return context.json({ error: 'invalid_body' }, 400)
    const ticket = await findOwnedTicket(context)
    if (!ticket) return notFound(context)
    const reopenedAt = now()
    if (!canReopen(ticket, reopenedAt)) return context.json({ error: 'reopen_window_expired' }, 409)
    await sql`update tickets set status = 'open', resolved_at = null, last_update_at = ${reopenedAt} where id = ${ticket.id}`
    await addEvent(ticket.id, 'reopened', parsed.data.text, 'Funcionário', reopenedAt)
    return context.json(await findOwnedTicket(context))
  })

  app.post('/tickets/:id/transfer', async (context) => {
    const parsed = textSchema.safeParse(await context.req.json())
    if (!parsed.success) return context.json({ error: 'invalid_body' }, 400)
    const ticket = await findOwnedTicket(context)
    if (!ticket) return notFound(context)
    await sql`
      update tickets set status = 'waiting_analyst'
      where id = ${ticket.id} and status in ('open', 'in_progress', 'waiting_user')`
    await addEvent(ticket.id, 'transferred', parsed.data.text, 'Nexo Assist', now())
    return context.json(await findOwnedTicket(context))
  })

  return app
}
