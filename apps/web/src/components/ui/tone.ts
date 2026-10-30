import type { Priority, TicketStatus } from '@nexo/core'

export type Tone = 'warning' | 'danger' | 'info' | 'success' | 'neutral' | 'violet'

export const DOT_CLASS: Record<Tone, string> = {
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-primary',
  success: 'bg-success',
  neutral: 'bg-ink/40',
  violet: 'bg-violet',
}

export const TEXT_CLASS: Record<Tone, string> = {
  warning: 'text-warning-text',
  danger: 'text-danger-text',
  info: 'text-primary-text',
  success: 'text-success-text',
  neutral: 'text-ink-3',
  violet: 'text-violet-text',
}

export const SOFT_CLASS: Record<Tone, string> = {
  warning: 'bg-warning-soft text-warning-text',
  danger: 'bg-danger-soft text-danger-text',
  info: 'bg-primary-soft text-primary-text',
  success: 'bg-success-soft text-success-text',
  neutral: 'bg-desk text-ink-3',
  violet: 'bg-violet-soft text-violet-text',
}

export const STATUS_TONE: Record<TicketStatus, Tone> = {
  open: 'info',
  in_progress: 'info',
  waiting_analyst: 'warning',
  waiting_user: 'violet',
  approved: 'success',
  resolved: 'success',
  closed: 'neutral',
}

export const PRIORITY_TONE: Record<Priority, Tone> = {
  critical: 'danger',
  high: 'warning',
  medium: 'neutral',
  low: 'neutral',
}
