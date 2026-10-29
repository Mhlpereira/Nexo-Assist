import type { Draft } from './conversation'
import { formatAgo, formatDue, slaStatus } from './sla'
import {
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type Category,
  type Priority,
  type Ticket,
  type TicketKind,
  type TicketStatus,
} from './ticket'
import type { DecisionTrace } from './trace'

export type MessageAuthor = 'employee' | 'agent' | 'analyst' | 'system'

export const HANDOFF_ACTION = 'action:handoff'
export const CONFIRM_DRAFT_ACTION = 'action:confirm_draft'

export interface QuickReply {
  label: string
  value: string
}

export interface TicketView {
  id: string
  kind: TicketKind
  title: string
  description: string
  category: Category
  categoryLabel: string
  priority: Priority
  priorityLabel: string
  status: TicketStatus
  statusLabel: string
  createdAt: string
  lastUpdateAt: string
  lastUpdateAgo: string
  dueAt: string | null
  dueLabel: string | null
  overdue: boolean
  slaLabel: string
}

export type SystemEventIcon = 'transfer' | 'takeover' | 'return' | 'close'

export type MessageBlock =
  | { kind: 'text'; text: string }
  | { kind: 'ticket_card'; ticket: TicketView }
  | { kind: 'ticket_selector'; tickets: TicketView[] }
  | { kind: 'draft'; draft: Draft }
  | { kind: 'quick_replies'; options: QuickReply[] }
  | { kind: 'system'; text: string; icon: SystemEventIcon }

export interface Message {
  id: string
  conversationId: string
  author: MessageAuthor
  authorName: string
  blocks: MessageBlock[]
  trace: DecisionTrace | null
  createdAt: Date
}

export type NewMessage = Omit<Message, 'id' | 'createdAt'>

export function toTicketView(ticket: Ticket, now: Date): TicketView {
  const sla = slaStatus(ticket, now)
  return {
    id: ticket.id,
    kind: ticket.kind,
    title: ticket.title,
    description: ticket.description,
    category: ticket.category,
    categoryLabel: CATEGORY_LABEL[ticket.category],
    priority: ticket.priority,
    priorityLabel: PRIORITY_LABEL[ticket.priority],
    status: ticket.status,
    statusLabel: STATUS_LABEL[ticket.status],
    createdAt: ticket.createdAt.toISOString(),
    lastUpdateAt: ticket.lastUpdateAt.toISOString(),
    lastUpdateAgo: formatAgo(ticket.lastUpdateAt, now),
    dueAt: sla.dueAt?.toISOString() ?? null,
    dueLabel: sla.dueAt ? formatDue(sla.dueAt, now) : null,
    overdue: sla.overdue,
    slaLabel: sla.slaLabel,
  }
}

export const plainText = (message: Pick<Message, 'blocks'>): string =>
  message.blocks
    .flatMap((block) => (block.kind === 'text' || block.kind === 'system' ? [block.text] : []))
    .join('\n')
