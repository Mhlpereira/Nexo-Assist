import type { Category, Impact, Priority, TicketKind, TicketStatus } from '@nexo/core'
import type { Sql } from './database'

const ONE_HOUR = 60 * 60 * 1000
const ONE_DAY = 24 * ONE_HOUR

interface SeedTicket {
  id: string
  employeeId: string
  kind: TicketKind
  category: Category
  title: string
  description: string
  priority: Priority
  status: TicketStatus
  impact: Impact
  createdAgo: number
  updatedAgo: number
  resolvedAgo?: number
}

const TICKETS: SeedTicket[] = [
  {
    id: 'INC-20311',
    employeeId: 'emp-ana',
    kind: 'INC',
    category: 'hardware',
    title: 'Notebook lento após atualização do Windows',
    description: 'Lentidão geral desde a atualização do Windows. Reiniciar e rodar o diagnóstico da central não resolveu.',
    priority: 'medium',
    status: 'waiting_analyst',
    impact: 'individual',
    createdAgo: 7 * ONE_DAY,
    updatedAgo: 6 * ONE_DAY,
  },
  {
    id: 'INC-20298',
    employeeId: 'emp-ana',
    kind: 'REQ',
    category: 'access',
    title: 'Acesso à pasta Financeiro no SharePoint',
    description: 'Preciso de acesso de leitura à pasta Financeiro/Fechamento no SharePoint para o fechamento mensal.',
    priority: 'medium',
    status: 'in_progress',
    impact: 'individual',
    createdAgo: 9 * ONE_DAY,
    updatedAgo: 1 * ONE_DAY,
  },
  {
    id: 'REQ-10442',
    employeeId: 'emp-ana',
    kind: 'REQ',
    category: 'hardware',
    title: 'Segundo monitor para home office',
    description: 'Solicito um segundo monitor de 24" para o home office.',
    priority: 'low',
    status: 'approved',
    impact: 'individual',
    createdAgo: 14 * ONE_DAY,
    updatedAgo: 7 * ONE_DAY,
  },
  {
    id: 'INC-20150',
    employeeId: 'emp-ana',
    kind: 'INC',
    category: 'access',
    title: 'Senha do SAP bloqueada',
    description: 'Senha do SAP bloqueada após tentativas erradas.',
    priority: 'medium',
    status: 'resolved',
    impact: 'individual',
    createdAgo: 6 * ONE_DAY,
    updatedAgo: 4 * ONE_DAY,
    resolvedAgo: 4 * ONE_DAY,
  },
  {
    id: 'INC-19877',
    employeeId: 'emp-ana',
    kind: 'INC',
    category: 'email',
    title: 'Outlook não sincroniza no celular',
    description: 'O Outlook do celular parou de sincronizar os e-mails.',
    priority: 'medium',
    status: 'resolved',
    impact: 'individual',
    createdAgo: 60 * ONE_DAY,
    updatedAgo: 57 * ONE_DAY,
    resolvedAgo: 57 * ONE_DAY,
  },
  {
    id: 'REQ-10448',
    employeeId: 'emp-carla',
    kind: 'REQ',
    category: 'access',
    title: 'Acesso ao SAP módulo FI',
    description: 'Preciso de acesso ao módulo FI do SAP para lançar notas ainda hoje.',
    priority: 'high',
    status: 'open',
    impact: 'individual',
    createdAgo: 2 * ONE_HOUR,
    updatedAgo: 2 * ONE_HOUR,
  },
  {
    id: 'INC-20402',
    employeeId: 'emp-bruno',
    kind: 'INC',
    category: 'hardware',
    title: 'Impressora do 3º andar não imprime',
    description: 'A impressora do 3º andar fica com os trabalhos presos na fila.',
    priority: 'medium',
    status: 'open',
    impact: 'team',
    createdAgo: 1 * ONE_DAY,
    updatedAgo: 1 * ONE_DAY,
  },
  {
    id: 'INC-20415',
    employeeId: 'emp-diego',
    kind: 'INC',
    category: 'software',
    title: 'Teams sem áudio nas reuniões',
    description: 'Ninguém me ouve nas reuniões do Teams; o microfone funciona em outros apps.',
    priority: 'high',
    status: 'in_progress',
    impact: 'individual',
    createdAgo: 2 * ONE_DAY,
    updatedAgo: 3 * ONE_HOUR,
  },
  {
    id: 'INC-20420',
    employeeId: 'emp-elisa',
    kind: 'INC',
    category: 'network_vpn',
    title: 'Wi-Fi caindo na sala de reuniões 2',
    description: 'A conexão Wi-Fi cai a cada poucos minutos na sala de reuniões 2.',
    priority: 'medium',
    status: 'open',
    impact: 'team',
    createdAgo: 3 * ONE_DAY,
    updatedAgo: 3 * ONE_DAY,
  },
  {
    id: 'INC-20333',
    employeeId: 'emp-fabio',
    kind: 'INC',
    category: 'software',
    title: 'Excel fecha ao abrir planilhas grandes',
    description: 'O Excel trava e fecha ao abrir planilhas acima de 50 MB.',
    priority: 'medium',
    status: 'resolved',
    impact: 'individual',
    createdAgo: 5 * ONE_DAY,
    updatedAgo: 2 * ONE_DAY,
    resolvedAgo: 2 * ONE_DAY,
  },
]

export async function seed(sql: Sql, now = new Date()): Promise<void> {
  const ago = (milliseconds: number) => new Date(now.getTime() - milliseconds)
  await sql`truncate ticket_events, tickets, idempotency_keys restart identity`
  for (const ticket of TICKETS) {
    await sql`
      insert into tickets (id, employee_id, kind, category, title, description, priority, status, impact,
                           created_at, last_update_at, resolved_at)
      values (${ticket.id}, ${ticket.employeeId}, ${ticket.kind}, ${ticket.category}, ${ticket.title},
              ${ticket.description}, ${ticket.priority}, ${ticket.status}, ${ticket.impact},
              ${ago(ticket.createdAgo)}, ${ago(ticket.updatedAgo)},
              ${ticket.resolvedAgo === undefined ? null : ago(ticket.resolvedAgo)})`
    await sql`insert into ticket_events (ticket_id, type, body, author, at)
              values (${ticket.id}, 'created', ${ticket.description}, 'Funcionário', ${ago(ticket.createdAgo)})`
    if (ticket.resolvedAgo !== undefined) {
      await sql`insert into ticket_events (ticket_id, type, body, author, at)
                values (${ticket.id}, 'status_change', 'Chamado resolvido', 'Suporte N1', ${ago(ticket.resolvedAgo)})`
    }
  }
}
