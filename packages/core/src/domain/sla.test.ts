import { describe, expect, it } from 'vitest'
import { addBusinessMinutes, dueDate, formatDue, slaStatus } from './sla'

const saoPauloTime = (isoWithoutOffset: string) => new Date(`${isoWithoutOffset}-03:00`)

describe('SLA em horas úteis', () => {
  it('REQ-STAT-03: soma dentro do mesmo dia útil', () => {
    expect(addBusinessMinutes(saoPauloTime('2026-10-28T09:43'), 240)).toEqual(saoPauloTime('2026-10-28T13:43'))
  })

  it('REQ-STAT-03: transborda para o próximo dia útil', () => {
    expect(addBusinessMinutes(saoPauloTime('2026-10-28T16:00'), 240)).toEqual(saoPauloTime('2026-10-29T10:00'))
  })

  it('REQ-STAT-03: pula o fim de semana', () => {
    expect(addBusinessMinutes(saoPauloTime('2026-10-30T17:00'), 120)).toEqual(saoPauloTime('2026-11-02T09:00'))
  })

  it('REQ-STAT-03: começa a contar às 8h quando aberto fora do expediente', () => {
    expect(addBusinessMinutes(saoPauloTime('2026-10-28T22:00'), 60)).toEqual(saoPauloTime('2026-10-29T09:00'))
    expect(addBusinessMinutes(saoPauloTime('2026-10-31T10:00'), 60)).toEqual(saoPauloTime('2026-11-02T09:00'))
  })

  it('REQ-STAT-03: crítica usa 1 hora corrida (plantão 24h)', () => {
    expect(dueDate('critical', saoPauloTime('2026-10-31T23:30'))).toEqual(saoPauloTime('2026-11-01T00:30'))
  })

  it('REQ-STAT-03: média = 3 dias úteis', () => {
    expect(dueDate('medium', saoPauloTime('2026-10-23T14:20'))).toEqual(saoPauloTime('2026-10-28T14:20'))
  })

  it('REQ-STAT-03: chamado médio sem atualização há 6 dias está vencido', () => {
    const now = saoPauloTime('2026-10-29T10:00')
    const status = slaStatus({ priority: 'medium', status: 'waiting_analyst', lastUpdateAt: saoPauloTime('2026-10-23T10:00') }, now)
    expect(status.overdue).toBe(true)
  })

  it('REQ-STAT-03: resolvido ou aguardando o funcionário não vence', () => {
    const now = saoPauloTime('2026-10-29T10:00')
    const old = saoPauloTime('2026-09-01T10:00')
    expect(slaStatus({ priority: 'high', status: 'resolved', lastUpdateAt: old }, now).overdue).toBe(false)
    expect(slaStatus({ priority: 'high', status: 'waiting_user', lastUpdateAt: old }, now).overdue).toBe(false)
  })

  it('formata o prazo no fuso de São Paulo', () => {
    const now = saoPauloTime('2026-10-29T09:43')
    expect(formatDue(saoPauloTime('2026-10-29T13:43'), now)).toBe('13:43')
    expect(formatDue(saoPauloTime('2026-10-30T10:00'), now)).toBe('30/10 às 10:00')
  })
})
