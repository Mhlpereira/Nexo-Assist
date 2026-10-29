import { initialState } from '@nexo/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connectDatabase } from './connection'
import { migrateDatabase } from './migrate'
import { createPostgresConversationRepository } from './postgres-conversation-repository.adapter'
import { createPostgresKnowledgeBase } from './postgres-knowledge-base.adapter'
import { createPostgresUserRepository } from './postgres-user-repository.adapter'
import { seedDatabase } from './seed'

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://nexo:nexo@localhost:5440/nexo'
const schema = `app_test_${process.pid}`
const sql = connectDatabase(databaseUrl, schema)
const conversations = createPostgresConversationRepository(sql)
const users = createPostgresUserRepository(sql)
const knowledgeBase = createPostgresKnowledgeBase(sql)

beforeAll(async () => {
  await migrateDatabase(sql, schema)
  await seedDatabase(sql)
})

afterAll(async () => {
  await sql.unsafe(`drop schema "${schema}" cascade`)
  await sql.end()
})

describe('Postgres adapters', () => {
  it('NFR-02: conversa, estado e mensagens persistem com o trace', async () => {
    const created = await conversations.create('emp-ana', initialState())
    const message = await conversations.appendMessage({
      conversationId: created.id,
      author: 'agent',
      authorName: 'Nexo Assist',
      blocks: [{ kind: 'text', text: 'Olá' }],
      trace: {
        turnId: 't1',
        at: new Date().toISOString(),
        input: { kind: 'text', text: 'oi' },
        understood: null,
        confidence: null,
        decision: { route: 'respond', rationale: 'teste', rules: [{ id: 'A.escopo', text: 'regra' }] },
        actions: [],
        guardrails: [],
        llm: null,
      },
    })
    const saved = await conversations.save({ ...created, state: { ...created.state, selectedTicketId: 'INC-20311' } })
    expect(saved.ok && saved.value.version).toBe(2)
    const reloaded = await conversations.findById(created.id)
    expect(reloaded?.state.selectedTicketId).toBe('INC-20311')
    const [stored] = await conversations.listMessages(created.id)
    expect(stored).toMatchObject({ id: message.id, blocks: [{ kind: 'text', text: 'Olá' }] })
    expect(stored?.trace?.decision.rules[0]?.id).toBe('A.escopo')
  })

  it('locking otimista recusa versão desatualizada', async () => {
    const created = await conversations.create('emp-bruno', initialState())
    await conversations.save(created)
    expect(await conversations.save(created)).toEqual({ ok: false, error: 'version_conflict' })
  })

  it('REQ-CON-01: lista do console traz funcionário, última mensagem e não lidas', async () => {
    const created = await conversations.create('emp-carla', initialState())
    await conversations.appendMessage({ conversationId: created.id, author: 'agent', authorName: 'Nexo Assist', blocks: [{ kind: 'text', text: 'Oi' }], trace: null })
    await conversations.appendMessage({ conversationId: created.id, author: 'employee', authorName: 'Carla', blocks: [{ kind: 'text', text: 'Preciso do SAP' }], trace: null })
    await conversations.appendMessage({ conversationId: created.id, author: 'employee', authorName: 'Carla', blocks: [{ kind: 'text', text: 'Ainda hoje' }], trace: null })
    const row = (await conversations.listForConsole()).find((candidate) => candidate.conversation.id === created.id)
    expect(row?.employee.name).toBe('Carla Mendes')
    expect(row?.trailingEmployeeMessages).toBe(2)
    expect(row?.lastMessage?.blocks[0]).toEqual({ kind: 'text', text: 'Ainda hoje' })
    expect(await conversations.countEmployeeMessagesSince('emp-carla', new Date(Date.now() - 60_000))).toBe(2)
  })

  it('REQ-AUTH-01: encontra usuário por e-mail', async () => {
    expect((await users.findByEmail('rafael.lima@nexo.com.br'))?.role).toBe('analyst')
  })

  it('REQ-KB-01: busca na central de ajuda por termos em português', async () => {
    const results = await knowledgeBase.search('Meu notebook não conecta na VPN, erro 809', 3)
    expect(results[0]?.slug).toBe('vpn-erro-809')
    expect(results[0]?.appliesTo).toContain('Windows 10')
    expect((await knowledgeBase.search('esqueci minha senha da rede', 3))[0]?.slug).toBe('senha-rede-expirada')
  })
})
