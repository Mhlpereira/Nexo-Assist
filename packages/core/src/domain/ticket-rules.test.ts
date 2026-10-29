import { describe, expect, it } from 'vitest'
import type { Ticket } from './ticket'
import { canReopen, canUpdate, findLikelyDuplicate } from './ticket-rules'

const now = new Date('2026-10-29T12:00:00-03:00')
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

const ticket = (overrides: Partial<Ticket>): Ticket => ({
  id: 'INC-1',
  employeeId: 'e1',
  kind: 'INC',
  category: 'hardware',
  title: 'Notebook lento após atualização do Windows',
  description: 'Lentidão geral desde a atualização.',
  priority: 'medium',
  status: 'waiting_analyst',
  impact: 'individual',
  createdAt: daysAgo(6),
  lastUpdateAt: daysAgo(6),
  resolvedAt: null,
  events: [],
  ...overrides,
})

describe('findLikelyDuplicate', () => {
  it('REQ-OPEN-06: encontra chamado aberto sobre o mesmo problema', () => {
    const open = ticket({})
    const match = findLikelyDuplicate({ category: 'hardware', text: 'meu notebook continua muito lento depois da atualização' }, [open])
    expect(match?.ticket.id).toBe('INC-1')
  })

  it('REQ-OPEN-06: ignora problemas diferentes', () => {
    const match = findLikelyDuplicate({ category: 'network_vpn', text: 'VPN não conecta, erro 809' }, [ticket({})])
    expect(match).toBeNull()
  })

  it('REQ-OPEN-06: chamados resolvidos não contam como duplicata', () => {
    const resolved = ticket({ status: 'resolved', resolvedAt: daysAgo(1) })
    expect(findLikelyDuplicate({ category: 'hardware', text: 'notebook lento após atualização' }, [resolved])).toBeNull()
  })
})

describe('reabertura e atualização', () => {
  it('REQ-UPD-02: resolvido há até 7 dias pode ser reaberto', () => {
    expect(canReopen(ticket({ status: 'resolved', resolvedAt: daysAgo(4) }), now)).toBe(true)
    expect(canReopen(ticket({ status: 'resolved', resolvedAt: daysAgo(7) }), now)).toBe(true)
  })

  it('REQ-UPD-02: resolvido há mais de 7 dias não pode ser reaberto', () => {
    expect(canReopen(ticket({ status: 'resolved', resolvedAt: daysAgo(8) }), now)).toBe(false)
  })

  it('REQ-UPD-03: fechado não pode ser atualizado nem reaberto', () => {
    const closed = ticket({ status: 'closed', resolvedAt: daysAgo(1) })
    expect(canUpdate(closed)).toBe(false)
    expect(canReopen(closed, now)).toBe(false)
  })
})
