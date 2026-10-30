import { failure, success, type ConsoleRow, type Conversation, type ConversationRepository, type Message, type User } from '@nexo/core'
import { toJsonb, type Sql } from './connection'

type ConversationRow = Omit<Conversation, 'state'> & { state: Conversation['state'] }
type MessageRow = Message
type ConsoleQueryRow = ConversationRow & {
  employeeEmail: string
  employeeName: string
  employeeRole: User['role']
  employeeDepartment: string
  employeeTeam: string | null
  analystName: string | null
  trailingEmployeeMessages: number
}

const toConversation = (row: ConversationRow): Conversation => ({
  id: row.id,
  employeeId: row.employeeId,
  status: row.status,
  assignedAnalystId: row.assignedAnalystId,
  state: row.state,
  version: row.version,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  closedAt: row.closedAt,
  resolution: row.resolution,
})

const toMessage = (row: MessageRow): Message => ({
  id: row.id,
  conversationId: row.conversationId,
  author: row.author,
  authorName: row.authorName,
  blocks: row.blocks,
  trace: row.trace,
  createdAt: row.createdAt,
})

export function createPostgresConversationRepository(sql: Sql): ConversationRepository {
  return {
    async findById(conversationId) {
      const [row] = await sql<ConversationRow[]>`select * from conversations where id = ${conversationId}`
      return row ? toConversation(row) : null
    },

    async findOpenByEmployee(employeeId) {
      const [row] = await sql<ConversationRow[]>`
        select * from conversations
        where employee_id = ${employeeId} and status <> 'closed'
        order by updated_at desc limit 1`
      return row ? toConversation(row) : null
    },

    async create(employeeId, state) {
      const [row] = await sql<ConversationRow[]>`
        insert into conversations (employee_id, status, state)
        values (${employeeId}, 'agent', ${toJsonb(state)}::text::jsonb)
        returning *`
      if (!row) throw new Error('Falha ao criar conversa')
      return toConversation(row)
    },

    async save(conversation) {
      const [row] = await sql<ConversationRow[]>`
        update conversations set
          status = ${conversation.status},
          assigned_analyst_id = ${conversation.assignedAnalystId},
          state = ${toJsonb(conversation.state)}::text::jsonb,
          version = version + 1,
          updated_at = now(),
          closed_at = ${conversation.closedAt},
          resolution = ${conversation.resolution}
        where id = ${conversation.id} and version = ${conversation.version}
        returning *`
      return row ? success(toConversation(row)) : failure('version_conflict')
    },

    async appendMessage(message) {
      const [row] = await sql<MessageRow[]>`
        insert into messages (conversation_id, author, author_name, blocks, trace)
        values (${message.conversationId}, ${message.author}, ${message.authorName},
                ${toJsonb(message.blocks)}::text::jsonb, ${message.trace ? toJsonb(message.trace) : null}::text::jsonb)
        returning *`
      if (!row) throw new Error('Falha ao gravar mensagem')
      await sql`update conversations set updated_at = now() where id = ${message.conversationId}`
      return toMessage(row)
    },

    async listMessages(conversationId, after) {
      const rows = await sql<MessageRow[]>`
        select * from messages
        where conversation_id = ${conversationId} ${after ? sql`and created_at > ${after}` : sql``}
        order by created_at`
      return rows.map(toMessage)
    },

    async recentMessages(conversationId, limit) {
      const rows = await sql<MessageRow[]>`
        select * from (
          select * from messages where conversation_id = ${conversationId} order by created_at desc limit ${limit}
        ) recent order by created_at`
      return rows.map(toMessage)
    },

    async countEmployeeMessagesSince(employeeId, since) {
      const [row] = await sql<{ total: number }[]>`
        select count(*)::int as total from messages m
        join conversations c on c.id = m.conversation_id
        where c.employee_id = ${employeeId} and m.author = 'employee' and m.created_at >= ${since}`
      return row?.total ?? 0
    },

    async listForConsole() {
      const rows = await sql<ConsoleQueryRow[]>`
        select c.*,
          employee.email as employee_email, employee.name as employee_name, employee.role as employee_role,
          employee.department as employee_department, employee.team as employee_team,
          analyst.name as analyst_name,
          (select count(*)::int from messages m
             where m.conversation_id = c.id and m.author = 'employee'
               and m.created_at > coalesce(
                 (select max(other.created_at) from messages other
                   where other.conversation_id = c.id and other.author <> 'employee'), '-infinity')
          ) as trailing_employee_messages
        from conversations c
        join users employee on employee.id = c.employee_id
        left join users analyst on analyst.id = c.assigned_analyst_id
        where c.updated_at > now() - interval '30 days'`
      if (rows.length === 0) return []
      const lastMessages = await sql<MessageRow[]>`
        select distinct on (conversation_id) * from messages
        where conversation_id in ${sql(rows.map((row) => row.id))}
        order by conversation_id, created_at desc`
      return rows.map(
        (row): ConsoleRow => ({
          conversation: toConversation(row),
          employee: {
            id: row.employeeId,
            email: row.employeeEmail,
            name: row.employeeName,
            role: row.employeeRole,
            department: row.employeeDepartment,
            team: row.employeeTeam,
          },
          analystName: row.analystName,
          lastMessage: lastMessages.map(toMessage).find((message) => message.conversationId === row.id) ?? null,
          trailingEmployeeMessages: row.trailingEmployeeMessages,
        }),
      )
    },
  }
}
