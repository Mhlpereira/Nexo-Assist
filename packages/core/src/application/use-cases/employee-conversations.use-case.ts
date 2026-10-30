import { initialState, transition } from '../../domain/conversation'
import { LIST_TICKETS_ACTION } from '../../domain/message'
import { err, ok } from '../../result'
import type { EmployeeConversations } from '../ports/in'
import type { Clock, ConversationRepository, UserRepository } from '../ports/out'
import { toConversationView } from './to-conversation-view'
import { AGENT_NAME } from './handle-employee-input.use-case'
import { toQuickReplies } from './turn-tools'
import type { EmployeeConversation } from '../dto'

export interface EmployeeConversationsDependencies {
  conversations: ConversationRepository
  users: UserRepository
  clock: Clock
}

const firstName = (name: string) => name.split(' ')[0] ?? name

export function createEmployeeConversations({ conversations, users, clock }: EmployeeConversationsDependencies): EmployeeConversations {
  async function start(employeeId: string): Promise<EmployeeConversation> {
    const employee = await users.findById(employeeId)
    const conversation = await conversations.create(employeeId, initialState())
    await conversations.appendMessage({
      conversationId: conversation.id,
      author: 'agent',
      authorName: AGENT_NAME,
      blocks: [
        {
          kind: 'text',
          text: `Olá${employee ? `, ${firstName(employee.name)}` : ''}! Sou o Nexo Assist, do service desk de TI. Me conte o que está acontecendo — posso consultar seus chamados, buscar na central de ajuda, abrir um chamado ou chamar um analista.`,
        },
        {
          kind: 'quick_replies',
          options: [{ label: 'Como está meu chamado?', value: LIST_TICKETS_ACTION }, ...toQuickReplies(['Tenho um problema', 'Preciso de um acesso'])],
        },
      ],
      trace: null,
    })
    return load(conversation.id)
  }

  async function load(conversationId: string, after: Date | null = null): Promise<EmployeeConversation> {
    const conversation = await conversations.findById(conversationId)
    if (!conversation) throw new Error(`Conversa ${conversationId} sumiu durante a leitura`)
    return {
      conversation: await toConversationView(conversation, users),
      messages: await conversations.listMessages(conversationId, after ?? undefined),
    }
  }

  return {
    async getOrStart(employeeId) {
      const open = await conversations.findOpenByEmployee(employeeId)
      return open ? load(open.id) : start(employeeId)
    },

    async startNew(employeeId) {
      const open = await conversations.findOpenByEmployee(employeeId)
      if (open) {
        if (open.status !== 'agent') return err('analyst_in_progress')
        const closed = transition(open, { type: 'close', by: 'employee', analystId: null }, clock.now())
        if (closed.ok) await conversations.save(closed.value)
      }
      return ok(await start(employeeId))
    },

    async messagesSince(employeeId, conversationId, after) {
      const conversation = await conversations.findById(conversationId)
      if (!conversation || conversation.employeeId !== employeeId) return err('conversation_not_found')
      return ok(await load(conversationId, after))
    },
  }
}
