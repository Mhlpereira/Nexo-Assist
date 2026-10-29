import { describe, expect, it } from 'vitest'
import { initialState, type Handoff } from '../../domain/conversation'
import { ANA, BRUNO, fixedClock, inMemoryConversations, inMemoryTickets, inMemoryUsers, RAFAEL } from '../testing/fakes'
import { createAnalystConsole } from './analyst-console.use-case'

function setup() {
  const clock = fixedClock()
  const store = inMemoryConversations(clock)
  const tickets = inMemoryTickets([], clock)
  const analystConsole = createAnalystConsole({ conversations: store.repository, users: inMemoryUsers(), tickets: tickets.gateway, clock })
  const handoffTo = async (conversationId: string, handoff: Partial<Handoff> = {}) => {
    const conversation = await store.repository.findById(conversationId)
    if (!conversation) throw new Error('conversa não encontrada')
    await store.repository.save({
      ...conversation,
      status: 'waiting_analyst',
      state: {
        ...conversation.state,
        handoff: { reason: 'requested', summary: 'resumo', confidence: null, ticketId: 'INC-20311', at: '', ...handoff },
      },
    })
  }
  const waitingConversation = async () => {
    const conversation = await store.repository.create(ANA.id, initialState())
    await handoffTo(conversation.id)
    return conversation
  }
  return { clock, store, analystConsole, handoffTo, waitingConversation }
}

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
    const { store, analystConsole, waitingConversation } = setup()
    const conversation = await waitingConversation()
    expect(await analystConsole.takeOver(RAFAEL.id, conversation.id)).toEqual({ ok: true, value: undefined })
    expect((await store.repository.findById(conversation.id))?.status).toBe('with_analyst')
    expect(store.messages.at(-1)?.blocks[0]).toMatchObject({ kind: 'system', icon: 'takeover' })
    expect((await analystConsole.list(RAFAEL.id, 'mine', '')).conversations[0]?.tag).toBe('Você está atendendo')
  })

  it('REQ-CON-05: só o analista que assumiu conversa, devolve ou encerra', async () => {
    const { store, analystConsole, waitingConversation } = setup()
    const conversation = await waitingConversation()
    await analystConsole.takeOver(RAFAEL.id, conversation.id)
    expect(await analystConsole.sendMessage('outro-analista', conversation.id, 'oi')).toEqual({ ok: false, error: 'not_assigned_analyst' })
    expect((await analystConsole.sendMessage(RAFAEL.id, conversation.id, 'Oi, Ana!')).ok).toBe(true)
    expect(store.messages.at(-1)).toMatchObject({ author: 'analyst', authorName: 'Rafael Lima' })
    expect((await analystConsole.returnToAgent(RAFAEL.id, conversation.id)).ok).toBe(true)
    expect((await store.repository.findById(conversation.id))?.status).toBe('agent')
  })

  it('REQ-CON-05: encerrar marca a conversa como encerrada pelo analista', async () => {
    const { analystConsole, waitingConversation } = setup()
    const conversation = await waitingConversation()
    await analystConsole.takeOver(RAFAEL.id, conversation.id)
    await analystConsole.close(RAFAEL.id, conversation.id)
    expect((await analystConsole.list(RAFAEL.id, 'all', '')).conversations[0]?.tag).toBe('Encerrada pelo analista')
  })

  it('REQ-CON-01: busca por nome ou número de chamado', async () => {
    const { store, analystConsole, waitingConversation } = setup()
    await waitingConversation()
    await store.repository.create(BRUNO.id, initialState())
    expect((await analystConsole.list(RAFAEL.id, 'all', 'inc-20311')).conversations).toHaveLength(1)
    expect((await analystConsole.list(RAFAEL.id, 'all', 'bruno')).conversations).toHaveLength(1)
  })
})
