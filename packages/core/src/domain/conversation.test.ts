import { describe, expect, it } from 'vitest'
import { initialState, transition, type Conversation, type Handoff } from './conversation'

const now = new Date('2026-10-29T10:05:00-03:00')

const conversation = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: 'c1',
  employeeId: 'e1',
  status: 'agent',
  assignedAnalystId: null,
  state: initialState(),
  version: 1,
  createdAt: now,
  updatedAt: now,
  closedAt: null,
  resolution: null,
  ...overrides,
})

const handoff: Handoff = { reason: 'requested', summary: 'resumo', confidence: null, ticketId: null, at: now.toISOString() }

describe('máquina de estados da conversa', () => {
  it('REQ-HAND-06: transferência deixa a conversa aguardando atendente', () => {
    const result = transition(conversation(), { type: 'handoff', handoff }, now)
    expect(result.ok && result.value.status).toBe('waiting_analyst')
    expect(result.ok && result.value.state.handoff?.reason).toBe('requested')
  })

  it('REQ-CON-04: analista assume a conversa', () => {
    const result = transition(conversation({ status: 'waiting_analyst' }), { type: 'take_over', analystId: 'a1' }, now)
    expect(result.ok && result.value).toMatchObject({ status: 'with_analyst', assignedAnalystId: 'a1' })
  })

  it('REQ-CON-05: devolver ao agent limpa a transferência', () => {
    const current = conversation({ status: 'with_analyst', assignedAnalystId: 'a1', state: { ...initialState(), handoff } })
    const result = transition(current, { type: 'return_to_agent', analystId: 'a1' }, now)
    expect(result.ok && result.value).toMatchObject({ status: 'agent', assignedAnalystId: null })
    expect(result.ok && result.value.state.handoff).toBeNull()
  })

  it('REQ-CON-05: só o analista que assumiu pode devolver ou encerrar', () => {
    const current = conversation({ status: 'with_analyst', assignedAnalystId: 'a1' })
    expect(transition(current, { type: 'return_to_agent', analystId: 'a2' }, now)).toEqual({ ok: false, error: 'not_assigned_analyst' })
    expect(transition(current, { type: 'close', by: 'analyst', analystId: 'a2' }, now)).toEqual({ ok: false, error: 'not_assigned_analyst' })
  })

  it('REQ-CON-05: encerrar registra quem resolveu', () => {
    const result = transition(conversation({ status: 'with_analyst', assignedAnalystId: 'a1' }), { type: 'close', by: 'analyst', analystId: 'a1' }, now)
    expect(result.ok && result.value).toMatchObject({ status: 'closed', resolution: 'analyst', closedAt: now })
  })

  it('não transfere conversa que já está com analista nem reabre encerrada', () => {
    expect(transition(conversation({ status: 'with_analyst' }), { type: 'handoff', handoff }, now).ok).toBe(false)
    expect(transition(conversation({ status: 'closed' }), { type: 'take_over', analystId: 'a1' }, now).ok).toBe(false)
  })
})
