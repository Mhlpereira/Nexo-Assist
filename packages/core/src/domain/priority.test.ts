import { describe, expect, it } from 'vitest'
import { computePriority } from './priority'

const base = { kind: 'INC', impact: 'individual', blocksWork: false, deadlineToday: false } as const

describe('computePriority (Anexo A)', () => {
  it('REQ-OPEN-04: algo parado para a equipe ou empresa é Crítica', () => {
    expect(computePriority({ ...base, impact: 'team', blocksWork: true }).priority).toBe('critical')
    expect(computePriority({ ...base, impact: 'company', blocksWork: true }).priority).toBe('critical')
  })

  it('REQ-OPEN-04: impede uma pessoa de trabalhar é Alta', () => {
    expect(computePriority({ ...base, blocksWork: true }).priority).toBe('high')
  })

  it('REQ-OPEN-04: compromisso no mesmo dia é Alta', () => {
    const decision = computePriority({ ...base, deadlineToday: true })
    expect(decision.priority).toBe('high')
    expect(decision.reason).toContain('compromisso')
  })

  it('REQ-OPEN-04: atrapalha mas há alternativa é Média', () => {
    expect(computePriority(base).priority).toBe('medium')
    expect(computePriority({ ...base, impact: 'team' }).priority).toBe('medium')
  })

  it('REQ-OPEN-04: pedido sem urgência é Baixa', () => {
    expect(computePriority({ ...base, kind: 'REQ' }).priority).toBe('low')
  })

  it('REQ-OPEN-04: pedido com compromisso hoje sobe para Alta', () => {
    expect(computePriority({ ...base, kind: 'REQ', deadlineToday: true }).priority).toBe('high')
  })
})
