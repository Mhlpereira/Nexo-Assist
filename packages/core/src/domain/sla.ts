import type { Priority, Ticket, TicketStatus } from './ticket'

const SAO_PAULO_OFFSET_MS = -3 * 60 * 60 * 1000
const DAY_START_HOUR = 8
const DAY_END_HOUR = 18
const BUSINESS_DAY_MINUTES = (DAY_END_HOUR - DAY_START_HOUR) * 60
const MINUTE_MS = 60_000

export interface Sla {
  minutes: number
  businessTime: boolean
  label: string
}

export const SLA: Record<Priority, Sla> = {
  critical: { minutes: 60, businessTime: false, label: '1 hora' },
  high: { minutes: 4 * 60, businessTime: true, label: '4 horas úteis' },
  medium: { minutes: 3 * BUSINESS_DAY_MINUTES, businessTime: true, label: '3 dias úteis' },
  low: { minutes: 5 * BUSINESS_DAY_MINUTES, businessTime: true, label: '5 dias úteis' },
}

const STATUSES_WITH_RUNNING_CLOCK: readonly TicketStatus[] = ['open', 'in_progress', 'waiting_analyst']

const toSaoPaulo = (date: Date) => new Date(date.getTime() + SAO_PAULO_OFFSET_MS)
const fromSaoPaulo = (local: Date) => new Date(local.getTime() - SAO_PAULO_OFFSET_MS)

const startNextDay = (local: Date) => {
  local.setUTCDate(local.getUTCDate() + 1)
  local.setUTCHours(DAY_START_HOUR, 0, 0, 0)
}

const isWeekend = (local: Date) => local.getUTCDay() === 0 || local.getUTCDay() === 6

function moveIntoBusinessHours(local: Date): void {
  const minutesOfDay = local.getUTCHours() * 60 + local.getUTCMinutes()
  if (minutesOfDay >= DAY_END_HOUR * 60) startNextDay(local)
  else if (minutesOfDay < DAY_START_HOUR * 60) local.setUTCHours(DAY_START_HOUR, 0, 0, 0)
  while (isWeekend(local)) startNextDay(local)
}

export function addBusinessMinutes(start: Date, minutes: number): Date {
  const cursor = toSaoPaulo(start)
  let remaining = minutes
  for (;;) {
    moveIntoBusinessHours(cursor)
    const endOfDay = new Date(cursor)
    endOfDay.setUTCHours(DAY_END_HOUR, 0, 0, 0)
    const available = (endOfDay.getTime() - cursor.getTime()) / MINUTE_MS
    if (remaining <= available) return fromSaoPaulo(new Date(cursor.getTime() + remaining * MINUTE_MS))
    remaining -= available
    startNextDay(cursor)
  }
}

export function dueDate(priority: Priority, from: Date): Date {
  const sla = SLA[priority]
  return sla.businessTime
    ? addBusinessMinutes(from, sla.minutes)
    : new Date(from.getTime() + sla.minutes * MINUTE_MS)
}

export interface SlaStatus {
  dueAt: Date | null
  overdue: boolean
  slaLabel: string
}

export function slaStatus(ticket: Pick<Ticket, 'priority' | 'status' | 'lastUpdateAt'>, now: Date): SlaStatus {
  const slaLabel = SLA[ticket.priority].label
  if (!STATUSES_WITH_RUNNING_CLOCK.includes(ticket.status)) return { dueAt: null, overdue: false, slaLabel }
  const dueAt = dueDate(ticket.priority, ticket.lastUpdateAt)
  return { dueAt, overdue: now.getTime() > dueAt.getTime(), slaLabel }
}

const pad = (n: number) => String(n).padStart(2, '0')

export function formatDue(due: Date, now: Date): string {
  const local = toSaoPaulo(due)
  const hhmm = `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`
  const sameDay = local.toISOString().slice(0, 10) === toSaoPaulo(now).toISOString().slice(0, 10)
  return sameDay ? hhmm : `${pad(local.getUTCDate())}/${pad(local.getUTCMonth() + 1)} às ${hhmm}`
}

export function formatAgo(date: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / MINUTE_MS)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} ${hours === 1 ? 'hora' : 'horas'}`
  const days = Math.floor(hours / 24)
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`
}
