export const TICKET_KINDS = ['INC', 'REQ'] as const
export type TicketKind = (typeof TICKET_KINDS)[number]

export const CATEGORIES = ['access', 'network_vpn', 'hardware', 'software', 'email', 'other'] as const
export type Category = (typeof CATEGORIES)[number]

export const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const
export type Priority = (typeof PRIORITIES)[number]

export const TICKET_STATUSES = [
  'open',
  'in_progress',
  'waiting_analyst',
  'waiting_user',
  'approved',
  'resolved',
  'closed',
] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const IMPACTS = ['individual', 'team', 'company'] as const
export type Impact = (typeof IMPACTS)[number]

export interface TicketEvent {
  type: 'created' | 'update' | 'status_change' | 'reopened' | 'transferred'
  body: string
  author: string
  at: Date
}

export interface Ticket {
  id: string
  employeeId: string
  kind: TicketKind
  category: Category
  title: string
  description: string
  priority: Priority
  status: TicketStatus
  impact: Impact
  createdAt: Date
  lastUpdateAt: Date
  resolvedAt: Date | null
  events: TicketEvent[]
}

export interface NewTicket {
  kind: TicketKind
  category: Category
  title: string
  description: string
  priority: Priority
  impact: Impact
}

export const CATEGORY_LABEL: Record<Category, string> = {
  access: 'Acesso',
  network_vpn: 'Rede e VPN',
  hardware: 'Hardware',
  software: 'Software',
  email: 'E-mail',
  other: 'Outros',
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
}

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  waiting_analyst: 'Aguardando analista',
  waiting_user: 'Aguardando você',
  approved: 'Aprovado',
  resolved: 'Resolvido',
  closed: 'Fechado',
}

export const IMPACT_LABEL: Record<Impact, string> = {
  individual: 'Somente você',
  team: 'Sua equipe',
  company: 'Toda a empresa',
}

export const TICKET_ID_PATTERN = /\b(?:INC|REQ)-\d{4,6}\b/g

export const isActive = (status: TicketStatus): boolean => status !== 'resolved' && status !== 'closed'
