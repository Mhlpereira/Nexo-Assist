import { describe, expect, it } from 'vitest'
import { initialState, MAX_EMPLOYEE_MESSAGES } from '../../domain/conversation'
import { HANDOFF_ACTION, type MessageBlock } from '../../domain/message'
import type { Ticket } from '../../domain/ticket'
import type { EmployeeInput } from '../ports/in'
import {
  ANA,
  fixedClock,
  inMemoryConversations,
  inMemoryTickets,
  inMemoryUsers,
  interpretationOf,
  recordingSink,
  scriptedInterpreter,
  scriptedResponder,
  sequentialIds,
  staticKnowledgeBase,
  type ResponderStep,
} from '../testing/fakes'
import type { Interpretation } from '../../domain/interpretation'
import { createHandleEmployeeInput } from './handle-employee-input'

const DAY = 24 * 60 * 60 * 1000

function ticketsFor(now: Date): Ticket[] {
  const ago = (milliseconds: number) => new Date(now.getTime() - milliseconds)
  const base = { kind: 'INC' as const, impact: 'individual' as const, resolvedAt: null, events: [] }
  return [
    { ...base, id: 'INC-20311', employeeId: 'emp-ana', category: 'hardware', title: 'Notebook lento após atualização do Windows', description: 'Lentidão geral desde a atualização.', priority: 'medium', status: 'waiting_analyst', createdAt: ago(7 * DAY), lastUpdateAt: ago(6 * DAY) },
    { ...base, id: 'INC-20298', employeeId: 'emp-ana', category: 'access', title: 'Acesso à pasta Financeiro', description: 'Acesso ao SharePoint.', priority: 'medium', status: 'in_progress', createdAt: ago(9 * DAY), lastUpdateAt: ago(1 * DAY) },
    { ...base, id: 'INC-20150', employeeId: 'emp-ana', category: 'access', title: 'Senha do SAP bloqueada', description: 'Bloqueada.', priority: 'medium', status: 'resolved', createdAt: ago(6 * DAY), lastUpdateAt: ago(4 * DAY), resolvedAt: ago(4 * DAY) },
    { ...base, id: 'INC-19877', employeeId: 'emp-ana', category: 'email', title: 'Outlook não sincroniza', description: 'Celular.', priority: 'medium', status: 'resolved', createdAt: ago(60 * DAY), lastUpdateAt: ago(57 * DAY), resolvedAt: ago(57 * DAY) },
    { ...base, id: 'INC-20402', employeeId: 'emp-bruno', category: 'hardware', title: 'Impressora do 3º andar', description: 'Fila presa.', priority: 'medium', status: 'open', createdAt: ago(DAY), lastUpdateAt: ago(DAY) },
  ]
}

async function setup(options: { interpretations?: Interpretation[]; responses?: ResponderStep[] } = {}) {
  const clock = fixedClock()
  const conversationStore = inMemoryConversations(clock)
  const ticketStore = inMemoryTickets(ticketsFor(clock.now()), clock)
  const { interpreter, requests: interpreterRequests } = scriptedInterpreter(options.interpretations ?? [])
  const { responder, requests: responderRequests } = scriptedResponder(options.responses ?? [])
  const handle = createHandleEmployeeInput({
    conversations: conversationStore.repository,
    users: inMemoryUsers(),
    tickets: ticketStore.gateway,
    knowledgeBase: staticKnowledgeBase([
      { slug: 'vpn-809', title: 'VPN com erro 809', body: 'Erro 809 na VPN: reinstale o cliente de VPN e reinicie.', appliesTo: 'Somente Windows 10' },
    ]),
    interpreter,
    responder,
    clock,
    ids: sequentialIds(),
  })
  const conversation = await conversationStore.repository.create(ANA.id, initialState())
  const send = async (input: EmployeeInput, employeeId = ANA.id) => {
    const sink = recordingSink()
    const result = await handle.execute({ employeeId, conversationId: conversation.id, input }, sink)
    return { result, sink }
  }
  const text = (value: string) => send({ type: 'text', text: value })
  const stored = () => conversationStore.repository.findById(conversation.id)
  return { send, text, stored, ticketStore, conversationStore, interpreterRequests, responderRequests, clock }
}

const blocksOf = (result: Awaited<ReturnType<Awaited<ReturnType<typeof setup>>['send']>>['result']): MessageBlock[] =>
  result.ok ? (result.value.agentMessage?.blocks ?? []) : []

const vpnDraftInput = {
  title: 'VPN não conecta no notebook — erro 809',
  description: 'Windows 11, erro 809 desde ontem. Precisa para reunião às 14h.',
  kind: 'INC',
  category: 'network_vpn',
  impact: 'individual',
  blocksWork: true,
  deadlineToday: true,
} as const

describe('HandleEmployeeInput — abertura de chamado', () => {
  it('REQ-OPEN-05 / GR-02: mostra rascunho e não cria o chamado sem confirmação', async () => {
    const context = await setup({
      interpretations: [interpretationOf({ intent: 'open_ticket', category: 'network_vpn' })],
      responses: [
        async (tools) => {
          await tools.prepareTicketDraft(vpnDraftInput)
          return 'Coloquei prioridade alta por causa da reunião. Confira antes de eu criar:'
        },
      ],
    })
    const { result } = await context.text('Meu notebook não conecta na VPN, erro 809, tenho reunião às 14h')
    const draft = blocksOf(result).find((block) => block.kind === 'draft')
    expect(draft?.kind === 'draft' && draft.draft).toMatchObject({ priority: 'high', status: 'pending' })
    expect(context.ticketStore.calls).not.toContain('create')
    expect((await context.stored())?.state.pendingDraft?.id).toMatch(/^D-\d{3}$/)
  })

  it('REQ-OPEN-05: confirmar pelo botão cria o chamado sem chamar o LLM', async () => {
    const context = await setup({
      interpretations: [interpretationOf({ intent: 'open_ticket' })],
      responses: [async (tools) => (await tools.prepareTicketDraft(vpnDraftInput), 'Confira:')],
    })
    await context.text('VPN com erro 809')
    const draftId = (await context.stored())?.state.pendingDraft?.id ?? ''
    const { result } = await context.send({ type: 'draft_action', draftId, action: 'confirm' })
    expect(context.ticketStore.calls).toContain('create')
    expect(context.interpreterRequests).toHaveLength(1)
    expect(blocksOf(result).some((block) => block.kind === 'ticket_card')).toBe(true)
    expect((await context.stored())?.state.pendingDraft).toBeNull()
    expect(result.ok && result.value.agentMessage?.trace?.decision.route).toBe('confirm_draft')
  })

  it('REQ-OPEN-06: chamado aberto sobre o mesmo problema vira proposta de atualização', async () => {
    const context = await setup({
      interpretations: [interpretationOf({ intent: 'open_ticket', category: 'hardware' })],
      responses: [
        async (tools) => {
          const outcome = await tools.prepareTicketDraft({ ...vpnDraftInput, category: 'hardware', title: 'Notebook continua lento', description: 'Notebook lento depois da atualização do Windows' })
          expect(outcome).toMatchObject({ duplicateOf: { id: 'INC-20311' } })
          return 'Você já tem o INC-20311 sobre isso. Quer que eu adicione a informação nele?'
        },
      ],
    })
    const { result } = await context.text('meu notebook continua lento depois da atualização')
    expect(blocksOf(result).some((block) => block.kind === 'draft')).toBe(false)
    expect((await context.stored())?.state.pendingDraft).toBeNull()
  })

  it('REQ-HAND-02: confirmar rascunho crítico cria o chamado e transfere', async () => {
    const context = await setup({
      interpretations: [interpretationOf({ intent: 'open_ticket' })],
      responses: [async (tools) => (await tools.prepareTicketDraft({ ...vpnDraftInput, impact: 'team' }), 'Confira:')],
    })
    await context.text('A VPN caiu para a equipe toda')
    const draftId = (await context.stored())?.state.pendingDraft?.id ?? ''
    await context.send({ type: 'draft_action', draftId, action: 'confirm' })
    const stored = await context.stored()
    expect(stored?.status).toBe('waiting_analyst')
    expect(stored?.state.handoff?.reason).toBe('critical')
  })

  it('P7: serviço indisponível ao confirmar mantém o rascunho e oferece tentar de novo', async () => {
    const context = await setup({
      interpretations: [interpretationOf({ intent: 'open_ticket' })],
      responses: [async (tools) => (await tools.prepareTicketDraft(vpnDraftInput), 'Confira:')],
    })
    await context.text('VPN com erro 809')
    const draftId = (await context.stored())?.state.pendingDraft?.id ?? ''
    context.ticketStore.setFailing(true)
    const { result } = await context.send({ type: 'draft_action', draftId, action: 'confirm' })
    expect((await context.stored())?.state.pendingDraft?.id).toBe(draftId)
    const trace = result.ok ? result.value.agentMessage?.trace : null
    expect(trace?.actions.at(-1)).toMatchObject({ status: 'error', attempts: 3 })
    expect(blocksOf(result).find((block) => block.kind === 'quick_replies')).toBeTruthy()
  })
})

describe('HandleEmployeeInput — consulta', () => {
  it('REQ-STAT-02: sem número, mostra seleção dos chamados ativos', async () => {
    const context = await setup({
      interpretations: [interpretationOf({ intent: 'ticket_status' })],
      responses: [async (tools) => (await tools.listMyTickets(), 'Você tem 2 chamados abertos. Sobre qual deles quer saber?')],
    })
    const { result } = await context.text('Qual o status do meu chamado?')
    const selector = blocksOf(result).find((block) => block.kind === 'ticket_selector')
    expect(selector?.kind === 'ticket_selector' && selector.tickets.map((ticket) => ticket.id)).toEqual(['INC-20311', 'INC-20298'])
  })

  it('REQ-STAT-03 / REQ-STAT-04: selecionar chamado vencido oferece analista sem chamar o LLM', async () => {
    const context = await setup()
    const { result } = await context.send({ type: 'select_ticket', ticketId: 'INC-20311', label: 'INC-20311 · Notebook lento' })
    const blocks = blocksOf(result)
    const card = blocks.find((block) => block.kind === 'ticket_card')
    expect(card?.kind === 'ticket_card' && card.ticket.overdue).toBe(true)
    const replies = blocks.find((block) => block.kind === 'quick_replies')
    expect(replies?.kind === 'quick_replies' && replies.options[0]).toEqual({ label: 'Falar com um analista', value: HANDOFF_ACTION })
    expect(context.interpreterRequests).toHaveLength(0)
  })

  it('REQ-HAND-03: aceitar o analista em chamado vencido transfere com motivo "vencido"', async () => {
    const context = await setup()
    await context.send({ type: 'select_ticket', ticketId: 'INC-20311', label: 'INC-20311' })
    await context.send({ type: 'quick_reply', label: 'Falar com um analista', value: HANDOFF_ACTION })
    const stored = await context.stored()
    expect(stored?.status).toBe('waiting_analyst')
    expect(stored?.state.handoff).toMatchObject({ reason: 'overdue', ticketId: 'INC-20311' })
    expect(stored?.state.handoff?.summary).toContain('PRAZO VENCIDO')
    expect(context.ticketStore.calls).toContain('transfer:INC-20311')
  })

  it('REQ-STAT-05 / GR-01: chamado de outro funcionário não é revelado', async () => {
    const context = await setup({
      interpretations: [interpretationOf({ intent: 'ticket_status', ticketRef: 'INC-20402' })],
      responses: [
        async (tools) => {
          expect(await tools.getTicket({ ticketId: 'INC-20402' })).toMatchObject({ found: false })
          return 'Não encontrei esse chamado entre os seus.'
        },
      ],
    })
    const { result } = await context.text('como está o INC-20402?')
    expect(blocksOf(result).some((block) => block.kind === 'ticket_card')).toBe(false)
  })

  it('GR-03: remove da resposta número de chamado que não é do funcionário', async () => {
    const context = await setup({
      interpretations: [interpretationOf({ intent: 'ticket_status' })],
      responses: [async () => 'Seu chamado parece ligado ao INC-20402.'],
    })
    const { result } = await context.text('tem algo parecido?')
    const text = blocksOf(result)[0]
    expect(text?.kind === 'text' && text.text).not.toContain('INC-20402')
    expect(result.ok && result.value.agentMessage?.trace?.guardrails.map((finding) => finding.id)).toContain('GR-03')
  })
})

describe('HandleEmployeeInput — atualização e reabertura', () => {
  it('REQ-UPD-02: resolvido há 4 dias gera rascunho de reabertura', async () => {
    const context = await setup({
      interpretations: [interpretationOf({ intent: 'update_ticket', ticketRef: 'INC-20150' })],
      responses: [async (tools) => (await tools.prepareUpdateDraft({ ticketId: 'INC-20150', text: 'Bloqueou de novo.' }), 'Confira:')],
    })
    await context.text('a senha do SAP bloqueou de novo')
    expect((await context.stored())?.state.pendingDraft).toMatchObject({ mode: 'reopen', ticketId: 'INC-20150' })
  })

  it('REQ-UPD-02: resolvido há mais de 7 dias não pode ser reaberto', async () => {
    const context = await setup({
      interpretations: [interpretationOf({ intent: 'update_ticket', ticketRef: 'INC-19877' })],
      responses: [
        async (tools) => {
          expect(await tools.prepareUpdateDraft({ ticketId: 'INC-19877', text: 'Voltou.' })).toHaveProperty('error')
          return 'Esse chamado é antigo; posso abrir um novo citando o INC-19877.'
        },
      ],
    })
    await context.text('o outlook parou de novo')
    expect((await context.stored())?.state.pendingDraft).toBeNull()
  })
})

describe('HandleEmployeeInput — transferência e guardrails', () => {
  it('REQ-HAND-01 / REQ-HAND-05: pedido de analista transfere com resumo', async () => {
    const context = await setup({ interpretations: [interpretationOf({ intent: 'talk_to_human', summary: 'Quer falar com uma pessoa' })] })
    await context.text('quero falar com um analista')
    const stored = await context.stored()
    expect(stored?.status).toBe('waiting_analyst')
    expect(stored?.state.handoff?.summary).toContain('Funcionário pediu um analista')
    expect(context.responderRequests).toHaveLength(0)
  })

  it('REQ-HAND-06 / GR-09: com analista, o agent não responde nem chama o LLM', async () => {
    const context = await setup({ interpretations: [interpretationOf({ intent: 'talk_to_human' })] })
    await context.text('quero falar com um analista')
    const { result } = await context.text('oi, alguém aí?')
    expect(result.ok && result.value.agentMessage).toBeNull()
    expect(context.interpreterRequests).toHaveLength(1)
  })

  it('REQ-SCOPE-01: assunto fora de TI é redirecionado sem tools', async () => {
    const context = await setup({ interpretations: [interpretationOf({ intent: 'out_of_scope' })] })
    const { result } = await context.text('quero saber das minhas férias')
    expect(blocksOf(result)[0]).toMatchObject({ kind: 'text' })
    expect(context.responderRequests).toHaveLength(0)
  })

  it('GR-05: senha digitada não chega ao modelo nem ao histórico', async () => {
    const context = await setup({ interpretations: [interpretationOf({ intent: 'question' })], responses: [async () => 'Nunca compartilhe sua senha.'] })
    const { result } = await context.text('minha senha é Nexo@2026 e não entra')
    expect(context.interpreterRequests[0]?.text).not.toContain('Nexo@2026')
    expect(JSON.stringify(result.ok && result.value.employeeMessage)).not.toContain('Nexo@2026')
  })

  it('REQ-CHAT-05: bloqueia a 31ª mensagem da sessão', async () => {
    const context = await setup()
    const stored = await context.stored()
    if (!stored) throw new Error('conversa não criada')
    await context.conversationStore.repository.save({ ...stored, state: { ...stored.state, employeeMessageCount: MAX_EMPLOYEE_MESSAGES } })
    expect((await context.text('mais uma')).result).toEqual({ ok: false, error: 'message_limit_reached' })
  })

  it('GR-07: limita mensagens por minuto', async () => {
    const context = await setup()
    for (let index = 0; index < 10; index++) await context.send({ type: 'select_ticket', ticketId: 'INC-20298', label: 'INC-20298' })
    expect((await context.text('de novo')).result).toEqual({ ok: false, error: 'rate_limited' })
  })

  it('REQ-TRC-01: o trace registra entendimento, confiança, decisão, ações e uso do modelo', async () => {
    const context = await setup({
      interpretations: [interpretationOf({ intent: 'question', confidence: 0.86, summary: 'VPN com erro 809 no Windows 11', environment: 'Windows 11' })],
      responses: [async (tools) => (await tools.searchHelpCenter({ query: 'erro 809 vpn' }), 'O artigo vale só para Windows 10.')],
    })
    const { result } = await context.text('VPN com erro 809, uso Windows 11')
    const trace = result.ok ? result.value.agentMessage?.trace : null
    expect(trace?.understood).toMatchObject({ intent: 'Tirar uma dúvida', entities: { ambiente: 'Windows 11' } })
    expect(trace?.confidence).toEqual({ score: 0.86, level: 'alta' })
    expect(trace?.actions[0]).toMatchObject({ label: 'buscou na central de ajuda', status: 'ok' })
    expect(trace?.llm).toMatchObject({ calls: 2, inputTokens: 300 })
  })

  it('falha do modelo vira mensagem de contingência com "Tentar de novo"', async () => {
    const context = await setup()
    const { result } = await context.text('oi')
    const replies = blocksOf(result).find((block) => block.kind === 'quick_replies')
    expect(replies?.kind === 'quick_replies' && replies.options.map((option) => option.label)).toEqual(['Tentar de novo', 'Falar com um analista'])
  })
})
