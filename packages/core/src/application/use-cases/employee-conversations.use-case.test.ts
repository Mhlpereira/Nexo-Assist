import { describe, expect, it } from 'vitest'
import { ANA, BRUNO, fixedClock, inMemoryConversations, inMemoryUsers } from '../testing/fakes'
import { createEmployeeConversations } from './employee-conversations.use-case'

function setup() {
  const clock = fixedClock()
  const store = inMemoryConversations(clock)
  const employeeConversations = createEmployeeConversations({ conversations: store.repository, users: inMemoryUsers(), clock })
  return { store, employeeConversations }
}

describe('EmployeeConversations', () => {
  it('REQ-CHAT-06: retoma a conversa aberta em vez de criar outra', async () => {
    const { employeeConversations } = setup()
    const first = await employeeConversations.getOrStart(ANA.id)
    const again = await employeeConversations.getOrStart(ANA.id)
    expect(again.conversation.id).toBe(first.conversation.id)
    expect(first.messages[0]?.blocks[0]).toMatchObject({ kind: 'text' })
  })

  it('nova conversa encerra a atual quando ela está com o agent', async () => {
    const { employeeConversations, store } = setup()
    const first = await employeeConversations.getOrStart(ANA.id)
    const second = await employeeConversations.startNew(ANA.id)
    expect(second.ok && second.value.conversation.id).not.toBe(first.conversation.id)
    expect((await store.repository.findById(first.conversation.id))?.resolution).toBe('employee')
  })

  it('não abre nova conversa enquanto um analista atende', async () => {
    const { employeeConversations, store } = setup()
    const first = await employeeConversations.getOrStart(ANA.id)
    const stored = await store.repository.findById(first.conversation.id)
    if (!stored) throw new Error('conversa não encontrada')
    await store.repository.save({ ...stored, status: 'waiting_analyst' })
    expect(await employeeConversations.startNew(ANA.id)).toEqual({ ok: false, error: 'analyst_in_progress' })
  })

  it('GR-01: funcionário não lê conversa de outro', async () => {
    const { employeeConversations } = setup()
    const anaConversation = await employeeConversations.getOrStart(ANA.id)
    expect((await employeeConversations.messagesSince(BRUNO.id, anaConversation.conversation.id, null)).ok).toBe(false)
  })
})
