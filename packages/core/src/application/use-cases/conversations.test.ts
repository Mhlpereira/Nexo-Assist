import { describe, expect, it } from 'vitest'
import { initialState, type Handoff } from '../../domain/conversation'
import { ANA, BRUNO, fixedClock, inMemoryConversations, inMemoryTickets, inMemoryUsers, RAFAEL } from '../testing/fakes'
import { createAnalystConsole } from './analyst-console'
import { createEmployeeConversations } from './employee-conversations'
import { createLogin } from './login'

function setup() {
  const clock = fixedClock()
  const store = inMemoryConversations(clock)
  const users = inMemoryUsers()
  const tickets = inMemoryTickets([], clock)
  const analystConsole = createAnalystConsole({ conversations: store.repository, users, tickets: tickets.gateway, clock })
  const employeeConversations = createEmployeeConversations({ conversations: store.repository, users, clock })
  const handoffTo = async (conversationId: string, handoff: Partial<Handoff> = {}) => {
    const conversation = await store.repository.findById(conversationId)
    if (!conversation) throw new Error('conversa não encontrada')
    await store.repository.save({
      ...conversation,
      status: 'waiting_analyst',
      state: { ...conversation.state, handoff: { reason: 'requested', summary: 'resumo', confidence: null, ticketId: 'INC-20311', at: '', ...handoff } },
    })
  }
  return { clock, store, analystConsole, employeeConversations, handoffTo }
}

describe('Login', () => {
  it('REQ-AUTH-01: aceita e-mail cadastrado com qualquer senha', async () => {
    const login = createLogin(inMemoryUsers())
    expect((await login.execute(' Ana.Souza@nexo.com.br ', 'qualquer')).ok).toBe(true)
  })

  it('REQ-AUTH-02: recusa e-mail desconhecido ou senha vazia com o mesmo erro', async () => {
    const login = createLogin(inMemoryUsers())
    expect(await login.execute('ninguem@nexo.com.br', 'x1')).toEqual({ ok: false, error: 'invalid_credentials' })
    expect(await login.execute(ANA.email, '')).toEqual({ ok: false, error: 'invalid_credentials' })
  })
})

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
    const { employeeConversations, handoffTo } = setup()
    const first = await employeeConversations.getOrStart(ANA.id)
    await handoffTo(first.conversation.id)
    expect(await employeeConversations.startNew(ANA.id)).toEqual({ ok: false, error: 'analyst_in_progress' })
  })

  it('GR-01: funcionário não lê conversa de outro', async () => {
    const { employeeConversations } = setup()
    const anaConversation = await employeeConversations.getOrStart(ANA.id)
    expect((await employeeConversations.messagesSince(BRUNO.id, anaConversation.conversation.id, null)).ok).toBe(false)
  })
})

describe('AnalystConsole', () => {
  it('REQ-CON-01 / REQ-CON-02: lista com etiquetas, contadores e casos urgentes primeiro', async () => {
    const { store, analystConsole, handoffTo, clock } = setup()
    const withAgent = await store.repository.create(BRUNO.id, initialState())
    clock.advance(1000)
    const requested = await store.repository.create(ANA.id, initialState())
    await handoffTo(requested.id)
    const lowConfidence = await store.repository.create(BRUNO.id, initialState())
    await handoffTo(lowConfidence.id, { reason: 'low_confidence', confidence: 0.41, ticketId: null })

    const list = await analystConsole.list(RAFAEL.id, 'all', '')
    expect(list.conversations.map((summary) => summary.id)).toEqual([lowConfidence.id, requested.id, withAgent.id])
    expect(list.conversations[0]?.tag).toBe('Agent pediu ajuda · confiança 41%')
    expect(list.conversations[1]?.tag).toBe('Transferida · INC-20311')
    expect(list.counts).toEqual({ all: 3, for_you: 2, with_agent: 1, mine: 0 })
  })

  it('REQ-CON-04: assumir pausa o agent e registra evento visível', async () => {
    const { store, analystConsole, handoffTo } = setup()
    const conversation = await store.repository.create(ANA.id, initialState())
    await handoffTo(conversation.id)
    expect(await analystConsole.takeOver(RAFAEL.id, conversation.id)).toEqual({ ok: true, value: undefined })
    expect((await store.repository.findById(conversation.id))?.status).toBe('with_analyst')
    expect(store.messages.at(-1)?.blocks[0]).toMatchObject({ kind: 'system', icon: 'takeover' })
    expect((await analystConsole.list(RAFAEL.id, 'mine', '')).conversations[0]?.tag).toBe('Você está atendendo')
  })

  it('REQ-CON-05: só o analista que assumiu conversa, devolve ou encerra', async () => {
    const { store, analystConsole, handoffTo } = setup()
    const conversation = await store.repository.create(ANA.id, initialState())
    await handoffTo(conversation.id)
    await analystConsole.takeOver(RAFAEL.id, conversation.id)
    expect(await analystConsole.sendMessage('outro-analista', conversation.id, 'oi')).toEqual({ ok: false, error: 'not_assigned_analyst' })
    expect((await analystConsole.sendMessage(RAFAEL.id, conversation.id, 'Oi, Ana!')).ok).toBe(true)
    expect(store.messages.at(-1)).toMatchObject({ author: 'analyst', authorName: 'Rafael Lima' })
    expect((await analystConsole.returnToAgent(RAFAEL.id, conversation.id)).ok).toBe(true)
    expect((await store.repository.findById(conversation.id))?.status).toBe('agent')
  })

  it('REQ-CON-05: encerrar marca a conversa como encerrada pelo analista', async () => {
    const { store, analystConsole, handoffTo } = setup()
    const conversation = await store.repository.create(ANA.id, initialState())
    await handoffTo(conversation.id)
    await analystConsole.takeOver(RAFAEL.id, conversation.id)
    await analystConsole.close(RAFAEL.id, conversation.id)
    expect((await analystConsole.list(RAFAEL.id, 'all', '')).conversations[0]?.tag).toBe('Encerrada pelo analista')
  })

  it('REQ-CON-01: busca por nome ou número de chamado', async () => {
    const { store, analystConsole, handoffTo } = setup()
    const conversation = await store.repository.create(ANA.id, initialState())
    await handoffTo(conversation.id)
    await store.repository.create(BRUNO.id, initialState())
    expect((await analystConsole.list(RAFAEL.id, 'all', 'inc-20311')).conversations).toHaveLength(1)
    expect((await analystConsole.list(RAFAEL.id, 'all', 'bruno')).conversations).toHaveLength(1)
  })
})
