import { describe, expect, it } from 'vitest'
import { createHttpTicketGateway } from './http-ticket-gateway.adapter'

const ticket = {
  id: 'INC-20311',
  employeeId: 'emp-ana',
  kind: 'INC',
  category: 'hardware',
  title: 'Notebook lento',
  description: 'Lento.',
  priority: 'medium',
  status: 'waiting_analyst',
  impact: 'individual',
  createdAt: '2026-10-22T10:00:00.000Z',
  lastUpdateAt: '2026-10-23T10:00:00.000Z',
  resolvedAt: null,
  events: [],
}

function scriptedFetch(responses: (() => Response)[]) {
  const requests: { url: string; headers: Headers }[] = []
  const fetchFunction: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), headers: new Headers(init?.headers) })
    const next = responses.shift()
    if (!next) throw new Error('sem resposta roteirizada')
    return next()
  }
  return { fetchFunction, requests }
}

const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status })
const networkFailure = () => {
  throw new TypeError('fetch failed')
}

const gatewayWith = (responses: (() => Response)[]) => {
  const fetched = scriptedFetch(responses)
  const waits: number[] = []
  const gateway = createHttpTicketGateway({
    baseUrl: 'http://tickets',
    serviceToken: 'token',
    fetchFunction: fetched.fetchFunction,
    wait: async (milliseconds) => {
      waits.push(milliseconds)
    },
  })
  return { gateway, waits, requests: fetched.requests }
}

describe('HttpTicketGateway', () => {
  it('NFR-06: tenta de novo após 503 e falha de rede, com backoff crescente', async () => {
    const { gateway, waits } = gatewayWith([json({ error: 'unavailable' }, 503), networkFailure, json(ticket)])
    const call = await gateway.get('emp-ana', 'INC-20311')
    expect(call.attempts).toBe(3)
    expect(call.result.ok && call.result.value.lastUpdateAt).toEqual(new Date('2026-10-23T10:00:00.000Z'))
    expect(waits).toHaveLength(2)
    expect(waits[1]).toBeGreaterThan(waits[0] ?? 0)
  })

  it('P7: após 3 tentativas devolve indisponível', async () => {
    const unavailable = json({ error: 'unavailable' }, 503)
    const { gateway } = gatewayWith([unavailable, unavailable, unavailable])
    expect(await gateway.listByEmployee('emp-ana')).toEqual({ result: { ok: false, error: { kind: 'unavailable', attempts: 3 } }, attempts: 3 })
  })

  it('GR-01: envia o funcionário da sessão e o token de serviço', async () => {
    const { gateway, requests } = gatewayWith([json([ticket])])
    await gateway.listByEmployee('emp-ana')
    expect(requests[0]?.headers.get('x-employee-id')).toBe('emp-ana')
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer token')
  })

  it('REQ-SVC-04: escritas levam Idempotency-Key, inclusive nas novas tentativas', async () => {
    const { gateway, requests } = gatewayWith([json({ error: 'unavailable' }, 503), json(ticket, 201)])
    await gateway.addUpdate('emp-ana', 'INC-20311', 'continua lento', 'draft-key')
    expect(requests.map((request) => request.headers.get('idempotency-key'))).toEqual(['draft-key', 'draft-key'])
  })

  it('404 vira not_found e 409 vira rejeição sem novas tentativas', async () => {
    const { gateway } = gatewayWith([json({ error: 'not_found' }, 404), json({ error: 'reopen_window_expired' }, 409)])
    expect((await gateway.get('emp-ana', 'INC-1')).result).toEqual({ ok: false, error: { kind: 'not_found' } })
    expect(await gateway.reopen('emp-ana', 'INC-19877', 'voltou', 'key')).toEqual({
      result: { ok: false, error: { kind: 'rejected', reason: 'reopen_window_expired' } },
      attempts: 1,
    })
  })
})
