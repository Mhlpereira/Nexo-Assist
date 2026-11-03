import {
  HANDOFF_ACTION,
  HANDOFF_REASON_LABEL,
  initialState,
  RULES,
  toQuickReplies,
  toTicketView,
  type ConversationState,
  type ConversationStatus,
  type DecisionTrace,
  type Handoff,
  type HandoffReason,
  type MessageAuthor,
  type MessageBlock,
  type RuleRef,
  type Ticket,
  type TraceAction,
} from '@nexo/core'
import { toJsonb, type Sql } from './connection'

const MINUTE = 60_000
const AGENT_NAME = 'Nexo Assist'

interface SeedMessage {
  author: MessageAuthor
  minutesAgo: number
  blocks: MessageBlock[]
  trace?: DecisionTrace
}

interface SeedConversation {
  employeeId: string
  employeeName: string
  status: ConversationStatus
  resolution: 'agent' | null
  state: ConversationState
  messages: SeedMessage[]
}

interface TraceInput {
  minutesAgo: number
  inputText: string
  intent: string
  summary: string
  confidence: number | null
  route: string
  rationale: string
  rules?: RuleRef[]
  actions?: Omit<TraceAction, 'status' | 'attempts' | 'input' | 'output'>[]
  entities?: Record<string, string>
}

const confidenceLevel = (score: number) => (score >= 0.75 ? 'alta' : score >= 0.5 ? 'média' : 'baixa')

function buildTrace(now: Date, input: TraceInput): DecisionTrace {
  const at = new Date(now.getTime() - input.minutesAgo * MINUTE).toISOString()
  return {
    turnId: `seed-${input.minutesAgo}-${input.route}`,
    at,
    input: { kind: 'text', text: input.inputText },
    understood: { intent: input.intent, summary: input.summary, entities: input.entities ?? {} },
    confidence: input.confidence === null ? null : { score: input.confidence, level: confidenceLevel(input.confidence) },
    decision: { route: input.route, rationale: input.rationale, rules: input.rules ?? [] },
    actions: (input.actions ?? []).map((action) => ({ ...action, input: {}, output: 'ok', status: 'ok', attempts: 1 })),
    guardrails: [],
    llm: { model: 'google/gemini-3.1-flash-lite', calls: 2, inputTokens: 1850, outputTokens: 140, latencyMilliseconds: 2400 },
  }
}

const say = (text: string): MessageBlock => ({ kind: 'text', text })
const transferEvent = (now: Date, minutesAgo: number): MessageBlock => {
  const time = new Date(now.getTime() - minutesAgo * MINUTE).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
  return { kind: 'system', icon: 'transfer', text: `Transferida para o Suporte · ${time}` }
}

function handoffOf(now: Date, reason: HandoffReason, minutesAgo: number, details: Omit<Handoff, 'reason' | 'at'>): Handoff {
  return { ...details, reason, at: new Date(now.getTime() - minutesAgo * MINUTE).toISOString() }
}

function demoConversations(now: Date): SeedConversation[] {
  const ago = (minutes: number) => new Date(now.getTime() - minutes * MINUTE)
  const sapAccess: Ticket = {
    id: 'REQ-10448',
    employeeId: 'emp-carla',
    kind: 'REQ',
    category: 'access',
    title: 'Acesso ao SAP módulo FI',
    description: 'Preciso de acesso ao módulo FI do SAP para lançar notas ainda hoje.',
    priority: 'high',
    status: 'open',
    impact: 'individual',
    createdAt: ago(120),
    lastUpdateAt: ago(120),
    resolvedAt: null,
    events: [],
  }
  const teamsAudio: Ticket = {
    id: 'INC-20415',
    employeeId: 'emp-diego',
    kind: 'INC',
    category: 'software',
    title: 'Teams sem áudio nas reuniões',
    description: 'Ninguém me ouve nas reuniões do Teams; o microfone funciona em outros apps.',
    priority: 'high',
    status: 'in_progress',
    impact: 'individual',
    createdAt: ago(2 * 24 * 60),
    lastUpdateAt: ago(180),
    resolvedAt: null,
    events: [],
  }
  const sapView = toTicketView(sapAccess, now)
  const teamsView = toTicketView(teamsAudio, now)

  return [
    {
      employeeId: 'emp-carla',
      employeeName: 'Carla Mendes',
      status: 'waiting_analyst',
      resolution: null,
      state: {
        ...initialState(),
        selectedTicketId: 'REQ-10448',
        employeeMessageCount: 3,
        handoff: handoffOf(now, 'requested', 30, {
          confidence: 0.97,
          ticketId: 'REQ-10448',
          summary: [
            `Motivo: ${HANDOFF_REASON_LABEL.requested}.`,
            'Entendimento do agent: quer acelerar a liberação do acesso ao SAP FI para lançar notas hoje (confiança 97%).',
            'Último pedido: "Sim, quero falar com alguém agora."',
            `Chamado: REQ-10448 — Acesso ao SAP módulo FI; Aberto, prioridade Alta, última atualização ${sapView.lastUpdateAgo}.`,
          ].join('\n'),
        }),
      },
      messages: [
        { author: 'employee', minutesAgo: 32, blocks: [say('Meu acesso ao SAP módulo FI ainda não foi liberado e preciso lançar notas hoje.')] },
        {
          author: 'agent',
          minutesAgo: 31,
          blocks: [
            { kind: 'ticket_card', ticket: sapView },
            say(`O REQ-10448 está aberto, com prioridade alta${sapView.dueLabel ? ` e resposta prevista até ${sapView.dueLabel}` : ''}. Quer que eu chame um analista para agilizar?`),
            { kind: 'quick_replies', options: [{ label: 'Falar com um analista', value: HANDOFF_ACTION }, ...toQuickReplies(['Adicionar informação'])] },
          ],
          trace: buildTrace(now, {
            minutesAgo: 31,
            inputText: 'Meu acesso ao SAP módulo FI ainda não foi liberado e preciso lançar notas hoje.',
            intent: 'Consultar um chamado',
            summary: 'Quer saber da liberação do acesso ao SAP FI, com prazo hoje',
            confidence: 0.91,
            route: 'respond',
            rationale: 'Pedido de acesso já existe; consultar o chamado e informar o prazo',
            rules: [RULES.privacy],
            actions: [
              { label: 'consultou seus chamados', tool: 'list_my_tickets', durationMilliseconds: 142 },
              { label: 'consultou o REQ-10448', tool: 'get_ticket', durationMilliseconds: 118 },
              { label: 'calculou o prazo', tool: 'sla', durationMilliseconds: 1 },
            ],
            entities: { chamado: 'REQ-10448', 'compromisso hoje': 'sim' },
          }),
        },
        { author: 'employee', minutesAgo: 30, blocks: [say('Sim, quero falar com alguém agora.')] },
        {
          author: 'agent',
          minutesAgo: 30,
          blocks: [
            say('Encaminhei para um analista do Suporte. Ele continua por aqui, já com o histórico da conversa. Atendimento de segunda a sexta, das 8h às 18h.'),
            transferEvent(now, 30),
          ],
          trace: buildTrace(now, {
            minutesAgo: 30,
            inputText: 'Sim, quero falar com alguém agora.',
            intent: 'Falar com um analista',
            summary: 'Pede para falar com um analista',
            confidence: 0.97,
            route: 'handoff',
            rationale: 'O funcionário pediu para falar com um analista',
            rules: [RULES.transfer],
            actions: [{ label: 'transferiu o chamado', tool: 'transfer_ticket', durationMilliseconds: 133 }],
          }),
        },
        { author: 'employee', minutesAgo: 25, blocks: [say('Preciso de acesso ao SAP ainda hoje')] },
      ],
    },
    {
      employeeId: 'emp-bruno',
      employeeName: 'Bruno Tavares',
      status: 'waiting_analyst',
      resolution: null,
      state: {
        ...initialState(),
        lowConfidenceStreak: 2,
        employeeMessageCount: 2,
        handoff: handoffOf(now, 'low_confidence', 18, {
          confidence: 0.41,
          ticketId: null,
          summary: [
            `Motivo: ${HANDOFF_REASON_LABEL.low_confidence}.`,
            'Entendimento do agent: algum sistema usado para fechar rotas não está funcionando, sem identificar qual (confiança 41%).',
            'Último pedido: "aquele que a gente usa pra fechar as rotas".',
          ].join('\n'),
        }),
      },
      messages: [
        { author: 'employee', minutesAgo: 20, blocks: [say('o negócio do sistema lá não tá indo de novo')] },
        {
          author: 'agent',
          minutesAgo: 20,
          blocks: [say('Não entendi bem qual sistema está com problema. Pode me dizer qual é?'), { kind: 'quick_replies', options: toQuickReplies(['SAP', 'E-mail', 'VPN', 'Outro']) }],
          trace: buildTrace(now, {
            minutesAgo: 20,
            inputText: 'o negócio do sistema lá não tá indo de novo',
            intent: 'Não ficou claro',
            summary: 'Algum sistema parou, sem dizer qual',
            confidence: 0.38,
            route: 'clarify',
            rationale: 'Confiança baixa: vou pedir esclarecimento antes de agir',
          }),
        },
        { author: 'employee', minutesAgo: 19, blocks: [say('aquele que a gente usa pra fechar as rotas')] },
        {
          author: 'agent',
          minutesAgo: 18,
          blocks: [say('Vou chamar um analista para isso. Ele continua por aqui, já com o histórico.'), transferEvent(now, 18)],
          trace: buildTrace(now, {
            minutesAgo: 18,
            inputText: 'aquele que a gente usa pra fechar as rotas',
            intent: 'Não ficou claro',
            summary: 'Sistema de fechamento de rotas, sem nome nem sintoma',
            confidence: 0.41,
            route: 'handoff',
            rationale: 'Segundo turno seguido sem entender com segurança (41%)',
            rules: [RULES.transfer],
          }),
        },
      ],
    },
    {
      employeeId: 'emp-diego',
      employeeName: 'Diego Ramos',
      status: 'agent',
      resolution: null,
      state: { ...initialState(), selectedTicketId: 'INC-20415', employeeMessageCount: 1 },
      messages: [
        { author: 'employee', minutesAgo: 4, blocks: [say('O Teams continua sem áudio nas reuniões, alguma novidade?')] },
        {
          author: 'agent',
          minutesAgo: 3,
          blocks: [
            { kind: 'ticket_card', ticket: teamsView },
            say(`O INC-20415 está em andamento, prioridade alta.${teamsView.dueLabel ? ` A próxima atualização está prevista até ${teamsView.dueLabel}.` : ''}`),
            { kind: 'quick_replies', options: toQuickReplies(['Adicionar informação', 'Falar com um analista']) },
          ],
          trace: buildTrace(now, {
            minutesAgo: 3,
            inputText: 'O Teams continua sem áudio nas reuniões, alguma novidade?',
            intent: 'Consultar um chamado',
            summary: 'Quer saber do chamado do Teams sem áudio',
            confidence: 0.88,
            route: 'respond',
            rationale: 'Pergunta sobre chamado existente: consultar e informar status e prazo',
            rules: [RULES.privacy],
            actions: [
              { label: 'consultou seus chamados', tool: 'list_my_tickets', durationMilliseconds: 131 },
              { label: 'consultou o INC-20415', tool: 'get_ticket', durationMilliseconds: 97 },
            ],
          }),
        },
      ],
    },
    {
      employeeId: 'emp-fabio',
      employeeName: 'Fábio Nunes',
      status: 'closed',
      resolution: 'agent',
      state: { ...initialState(), employeeMessageCount: 2 },
      messages: [
        { author: 'employee', minutesAgo: 75, blocks: [say('Qual a senha do Wi-Fi para um visitante?')] },
        {
          author: 'agent',
          minutesAgo: 75,
          blocks: [say('Visitantes usam a rede Nexo-Visitantes. A senha muda todo dia e fica na recepção. Funcionários usam a Nexo-Corp com o login da rede.')],
          trace: buildTrace(now, {
            minutesAgo: 75,
            inputText: 'Qual a senha do Wi-Fi para um visitante?',
            intent: 'Tirar uma dúvida',
            summary: 'Quer a senha do Wi-Fi de visitantes',
            confidence: 0.94,
            route: 'respond',
            rationale: 'Dúvida coberta pela central de ajuda (Wi-Fi para visitantes)',
            actions: [{ label: 'buscou na central de ajuda', tool: 'search_help_center', durationMilliseconds: 64 }],
          }),
        },
        { author: 'employee', minutesAgo: 74, blocks: [say('Isso resolveu, obrigado!')] },
        {
          author: 'agent',
          minutesAgo: 74,
          blocks: [say('Que bom que resolveu! Vou encerrar esta conversa. Se precisar, é só começar uma nova.')],
          trace: buildTrace(now, {
            minutesAgo: 74,
            inputText: 'Isso resolveu, obrigado!',
            intent: 'Problema resolvido',
            summary: 'Confirma que a dúvida foi resolvida',
            confidence: 0.96,
            route: 'close_resolved',
            rationale: 'O funcionário informou que o problema foi resolvido',
          }),
        },
      ],
    },
  ]
}

export async function seedDemoConversations(sql: Sql, now = new Date()): Promise<void> {
  for (const conversation of demoConversations(now)) {
    const lastMinutesAgo = Math.min(...conversation.messages.map((message) => message.minutesAgo))
    const firstMinutesAgo = Math.max(...conversation.messages.map((message) => message.minutesAgo))
    const [row] = await sql<{ id: string }[]>`
      insert into conversations (employee_id, status, state, created_at, updated_at, closed_at, resolution)
      values (${conversation.employeeId}, ${conversation.status}, ${toJsonb(conversation.state)}::text::jsonb,
              ${new Date(now.getTime() - firstMinutesAgo * MINUTE)}, ${new Date(now.getTime() - lastMinutesAgo * MINUTE)},
              ${conversation.status === 'closed' ? new Date(now.getTime() - lastMinutesAgo * MINUTE) : null}, ${conversation.resolution})
      returning id`
    if (!row) throw new Error(`Falha ao semear a conversa de ${conversation.employeeName}`)
    for (const message of conversation.messages) {
      await sql`
        insert into messages (conversation_id, author, author_name, blocks, trace, created_at)
        values (${row.id}, ${message.author}, ${message.author === 'employee' ? conversation.employeeName : AGENT_NAME},
                ${toJsonb(message.blocks)}::text::jsonb, ${message.trace ? toJsonb(message.trace) : null}::text::jsonb,
                ${new Date(now.getTime() - message.minutesAgo * MINUTE)})`
    }
  }
}
