import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp, type ChaosConfiguration } from './app'
import { connect, migrate } from './database'
import { seed } from './seed'

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://nexo:nexo@localhost:5440/nexo'
const schema = `tickets_test_${process.pid}`
const sql = connect(databaseUrl, schema)
const serviceToken = 'test-token'
const withoutChaos: ChaosConfiguration = { failureRate: 0, latencyMilliseconds: 0 }

const app = createApp({ sql, serviceToken, chaos: withoutChaos })

interface CallOptions {
  method?: string
  body?: unknown
  idempotencyKey?: string
}

const call = (path: string, employeeId: string, options: CallOptions = {}) =>
  app.request(path, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${serviceToken}`,
      'x-employee-id': employeeId,
      'content-type': 'application/json',
      ...(options.idempotencyKey ? { 'idempotency-key': options.idempotencyKey } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

const newTicket = {
  kind: 'INC',
  category: 'network_vpn',
  title: 'VPN não conecta — erro 809',
  description: 'Windows 11, erro 809 desde ontem.',
  priority: 'high',
  impact: 'individual',
}

beforeAll(async () => {
  await migrate(sql, schema)
  await seed(sql)
})

afterAll(async () => {
  await sql.unsafe(`drop schema "${schema}" cascade`)
  await sql.end()
})

describe('tickets-service', () => {
  it('REQ-SVC-02: exige token de serviço', async () => {
    const response = await app.request('/tickets', { headers: { 'x-employee-id': 'emp-ana' } })
    expect(response.status).toBe(401)
  })

  it('REQ-SVC-01: lista apenas os chamados do funcionário', async () => {
    const tickets = (await (await call('/tickets', 'emp-ana')).json()) as { id: string; employeeId: string }[]
    expect(tickets.length).toBeGreaterThan(0)
    expect(tickets.every((ticket) => ticket.employeeId === 'emp-ana')).toBe(true)
  })

  it('REQ-SVC-02 / GR-01: chamado de outro funcionário retorna 404', async () => {
    expect((await call('/tickets/INC-20402', 'emp-ana')).status).toBe(404)
    expect((await call('/tickets/INC-20402', 'emp-bruno')).status).toBe(200)
  })

  it('REQ-SVC-01: cria chamado com número sequencial', async () => {
    const response = await call('/tickets', 'emp-ana', { method: 'POST', body: newTicket, idempotencyKey: 'D-1' })
    expect(response.status).toBe(201)
    const ticket = (await response.json()) as { id: string; status: string }
    expect(ticket.id).toMatch(/^INC-\d+$/)
    expect(ticket.status).toBe('open')
  })

  it('REQ-SVC-04: repetir a mesma Idempotency-Key não duplica', async () => {
    const options = { method: 'POST', body: newTicket, idempotencyKey: 'D-2' }
    const first = (await (await call('/tickets', 'emp-ana', options)).json()) as { id: string }
    const second = (await (await call('/tickets', 'emp-ana', options)).json()) as { id: string }
    expect(second.id).toBe(first.id)
  })

  it('REQ-SVC-04: escrita sem Idempotency-Key é recusada', async () => {
    expect((await call('/tickets', 'emp-ana', { method: 'POST', body: newTicket })).status).toBe(400)
  })

  it('REQ-UPD-01: adiciona atualização a chamado aberto', async () => {
    const response = await call('/tickets/INC-20311/updates', 'emp-ana', {
      method: 'POST',
      body: { text: 'Continua lento.' },
      idempotencyKey: 'U-1',
    })
    const ticket = (await response.json()) as { events: { type: string; body: string }[] }
    expect(ticket.events.at(-1)).toMatchObject({ type: 'update', body: 'Continua lento.' })
  })

  it('REQ-UPD-02: reabre resolvido há até 7 dias e recusa os antigos', async () => {
    const recent = await call('/tickets/INC-20150/reopen', 'emp-ana', {
      method: 'POST',
      body: { text: 'Bloqueou de novo' },
      idempotencyKey: 'R-1',
    })
    expect(recent.status).toBe(200)
    const old = await call('/tickets/INC-19877/reopen', 'emp-ana', {
      method: 'POST',
      body: { text: 'Voltou' },
      idempotencyKey: 'R-2',
    })
    expect(old.status).toBe(409)
  })

  it('REQ-SVC-03: simula indisponibilidade', async () => {
    const unstableApp = createApp({ sql, serviceToken, chaos: { failureRate: 1, latencyMilliseconds: 0 } })
    const response = await unstableApp.request('/tickets', {
      headers: { authorization: `Bearer ${serviceToken}`, 'x-employee-id': 'emp-ana' },
    })
    expect(response.status).toBe(503)
  })
})
