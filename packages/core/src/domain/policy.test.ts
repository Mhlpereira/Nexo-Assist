import { describe, expect, it } from 'vitest'
import { initialState, type Draft } from './conversation'
import type { Interpretation } from './interpretation'
import { decide } from './policy'

const interpretation = (overrides: Partial<Interpretation>): Interpretation => ({
  intent: 'question',
  confidence: 0.9,
  summary: '',
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

const draft: Draft = {
  id: 'D-381',
  idempotencyKey: 'key-1',
  mode: 'create',
  ticketId: null,
  title: 'VPN',
  description: 'VPN',
  kind: 'INC',
  category: 'network_vpn',
  priority: 'high',
  impact: 'individual',
  priorityReason: '',
  dueAt: null,
  status: 'pending',
}

const run = (overrides: Partial<Interpretation>, state = initialState(), injectionSuspected = false) =>
  decide({ interpretation: interpretation(overrides), state, injectionSuspected })

describe('policy', () => {
  it('REQ-HAND-01: pedido de analista transfere sem tentar dissuadir', () => {
    expect(run({ intent: 'talk_to_human' }).route).toEqual({ kind: 'handoff', reason: 'requested' })
  })

  it('REQ-SCOPE-01: assunto fora de TI é redirecionado', () => {
    expect(run({ intent: 'out_of_scope' }).route.kind).toBe('redirect_out_of_scope')
  })

  it('REQ-HAND-04: confiança baixa pede esclarecimento na primeira vez', () => {
    const result = run({ confidence: 0.3 })
    expect(result.route.kind).toBe('clarify')
    expect(result.lowConfidenceStreak).toBe(1)
  })

  it('REQ-HAND-04: confiança baixa pela segunda vez seguida transfere', () => {
    const result = run({ confidence: 0.3 }, { ...initialState(), lowConfidenceStreak: 1 })
    expect(result.route).toEqual({ kind: 'handoff', reason: 'low_confidence' })
  })

  it('REQ-HAND-04: turno com boa confiança zera a sequência', () => {
    expect(run({}, { ...initialState(), lowConfidenceStreak: 1 }).lowConfidenceStreak).toBe(0)
  })

  it('REQ-OPEN-05: confirmação clara com rascunho pendente confirma', () => {
    expect(run({ intent: 'confirm' }, { ...initialState(), pendingDraft: draft }).route.kind).toBe('confirm_draft')
  })

  it('REQ-OPEN-05: confirmação com confiança média pede o botão', () => {
    expect(run({ intent: 'confirm', confidence: 0.6 }, { ...initialState(), pendingDraft: draft }).route.kind).toBe('clarify')
  })

  it('GR-04: com suspeita de injection não confirma nem prepara rascunhos', () => {
    expect(run({ intent: 'confirm' }, { ...initialState(), pendingDraft: draft }, true).route.kind).toBe('clarify')
    const route = run({ intent: 'open_ticket' }, initialState(), true).route
    expect(route.kind === 'respond' && route.tools).not.toContain('prepare_ticket_draft')
  })

  it('REQ-STAT-02: consulta de status libera apenas tools de leitura', () => {
    expect(run({ intent: 'ticket_status' }).route).toEqual({ kind: 'respond', tools: ['list_my_tickets', 'get_ticket', 'ask_options'] })
  })
})
