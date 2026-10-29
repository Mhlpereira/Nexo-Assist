# Design — Nexo Assist

Referências entre colchetes apontam para [requirements.md](requirements.md) e [constitution.md](constitution.md).

## 1. Decisões principais

| Decisão | Escolha | Por quê |
|---|---|---|
| Arquitetura | Hexagonal (ports in/out) em monorepo pnpm | [P9] domínio testável sem LLM/banco; adapters trocáveis |
| Framework do agent | **Mastra** (Agent + tools + structured output + processors) | Preferência do PRD; tools tipadas com Zod |
| LLM | **Google Gemini Flash (tier gratuito do AI Studio)**, configurável por `LLM_MODEL`; alternativa offline: **Ollama** local | [P6, NFR-04] custo zero, bom tool calling e pt-BR. Trocar provedor = trocar env, nada no core |
| Interface | Next.js (App Router) + Tailwind, seguindo `docs/prototype/nexo.pen` | Sugestão do PRD; rotas de API servem de adapter de entrada |
| Persistência | Postgres 16 (docker compose) + postgres.js com SQL puro e migrations em `.sql` | [NFR-02] escolha do usuário; schemas separados `app` e `tickets` |
| Serviço de chamados | Processo separado (Hono, porta 4001), schema próprio | [REQ-SVC-01] simula o legado, com instabilidade injetável |
| Central de ajuda | Postgres full-text search (`portuguese`) | [P6] sem embeddings pagos; 5–10 artigos não justificam vetores |
| Tempo real | SSE para o turno do agent; polling (2 s) para mensagens humanas e lista do console | Simplicidade [P8]; suficiente para REQ-CON-06 |
| Auth | Cookie `httpOnly` com JWT assinado (`jose`); qualquer senha não vazia | [REQ-AUTH-*] |

## 2. Estrutura do repositório

```
nexus/
├── apps/
│   ├── web/                      # ADAPTERS DE ENTRADA + composition root
│   │   └── src/
│   │       ├── app/              # páginas: /login, /chat, /perfil, /console
│   │       │   └── api/          # route handlers → chamam ports/in
│   │       ├── components/       # UI (chat, cards, trace, console)
│   │       └── server/
│   │           ├── container.ts  # instancia adapters e injeta nos use cases
│   │           └── session.ts
│   └── tickets-service/          # serviço legado simulado (Hono + Drizzle)
│       └── src/{app.ts, routes.ts, db.ts, chaos.ts, seed.ts}
├── packages/
│   ├── core/                     # SEM dependências de framework
│   │   └── src/
│   │       ├── domain/           # tickets, sla, priority, dedupe, conversation, guardrails, trace
│   │       └── application/
│   │           ├── ports/in/     # interfaces dos casos de uso
│   │           ├── ports/out/    # interfaces de dependências externas
│   │           └── use-cases/    # implementações
│   └── infra/                    # ADAPTERS DE SAÍDA
│       └── src/
│           ├── db/               # migrations SQL, repositórios
│           ├── tickets-client/   # HTTP + retry/backoff/idempotência
│           ├── knowledge-base/   # busca full-text
│           └── mastra/           # Interpreter e Responder (Mastra), processors
├── specs/  docs/  docker-compose.yml  .env.example
```

Regra de dependência: `apps/* → packages/infra → packages/core`. `core` não importa nada de fora dele.

## 3. Portas

### 3.1 Portas de entrada (`ports/in`) — o que a UI/API pode pedir

```ts
interface HandleEmployeeInput {        // coração do chat
  execute(cmd: { employeeId: string; conversationId: string; input: EmployeeInput },
          sink: TurnEventSink): Promise<Result<TurnResult, ChatError>>
}
interface GetOrStartConversation { execute(employeeId: string): Promise<ConversationView> }  // REQ-CHAT-06
interface StartNewConversation   { execute(employeeId: string): Promise<ConversationView> }
interface GetMessagesSince       { execute(q: { viewerId: string; conversationId: string; after?: Date }): Promise<Result<MessageView[], AccessError>> }
interface Login                  { execute(email: string, password: string): Promise<Result<SessionUser, 'invalid_credentials'>> }

// Console
interface ListConversations      { execute(q: { analystId: string; filter: ConsoleFilter; search?: string }): Promise<ConversationSummary[]> }
interface GetConversationDetail  { execute(analystId: string, conversationId: string): Promise<ConversationDetail> } // inclui traces e chamados
interface TakeOverConversation   { execute(analystId: string, conversationId: string): Promise<Result<void, TransitionError>> }
interface ReturnToAgent          { execute(analystId: string, conversationId: string, note?: string): Promise<Result<void, TransitionError>> }
interface CloseConversation      { execute(analystId: string, conversationId: string): Promise<Result<void, TransitionError>> }
interface SendAnalystMessage     { execute(analystId: string, conversationId: string, text: string): Promise<Result<void, TransitionError>> }
```

### 3.2 Portas de saída (`ports/out`) — o que o core precisa

```ts
interface TicketGateway {             // implementado por tickets-client (HTTP)
  listByEmployee(employeeId: string): Promise<Result<Ticket[], GatewayError>>
  get(employeeId: string, ticketId: string): Promise<Result<Ticket | null, GatewayError>>
  create(employeeId: string, data: NewTicket, idempotencyKey: string): Promise<Result<Ticket, GatewayError>>
  addUpdate(employeeId: string, ticketId: string, text: string, idempotencyKey: string): Promise<Result<Ticket, GatewayError>>
  reopen(employeeId: string, ticketId: string, reason: string, idempotencyKey: string): Promise<Result<Ticket, GatewayError>>
  transfer(employeeId: string, ticketId: string, summary: string, idempotencyKey: string): Promise<Result<Ticket, GatewayError>>
}
interface KnowledgeBase        { search(query: string, limit: number): Promise<Article[]> }
interface ConversationRepository { /* get, save (estado + versão), appendMessage, listForConsole, saveTrace */ }
interface UserRepository       { findByEmail(email: string): Promise<User | null>; findById(id: string): Promise<User | null> }
interface Interpreter          { interpret(ctx: InterpretContext): Promise<Result<Interpretation, LlmError>> }   // LLM chamada 1
interface Responder            { respond(ctx: RespondContext, tools: TurnTools, sink: TurnEventSink): Promise<Result<ResponderOutput, LlmError>> } // LLM chamada 2
interface Clock                { now(): Date }
```

`TurnTools` é um objeto de **funções da aplicação** já ligadas ao `employeeId` da sessão [P1, GR-01]. O adapter Mastra só as embrulha como tools; ele nunca vê o `employeeId` nem acessa gateways diretamente.

## 4. Domínio

### 4.1 Chamado
```ts
type TicketKind = 'INC' | 'REQ'
type Category = 'access' | 'network_vpn' | 'hardware' | 'software' | 'email' | 'other'
type Priority = 'critical' | 'high' | 'medium' | 'low'
type TicketStatus = 'open' | 'in_progress' | 'waiting_analyst' | 'waiting_user' | 'approved' | 'resolved' | 'closed'
type Impact = 'individual' | 'team' | 'company'
interface Ticket { id: string; kind; category; title; description; priority; status; impact;
  employeeId: string; createdAt: Date; lastUpdateAt: Date; resolvedAt?: Date; events: TicketEvent[] }
```

### 4.2 Prioridade (determinística) [REQ-OPEN-04]
```
priority(impact, urgency):
  impact ∈ {team, company} e trabalho parado        → critical
  impede a pessoa de trabalhar OU compromisso hoje   → high
  atrapalha, mas há alternativa                     → medium
  pedido/melhoria sem urgência                      → low
```
Entradas vêm do Interpreter (`impact`, `blocksWork`, `deadlineToday`, `hasWorkaround`, `kind`). Saída inclui a **justificativa** em texto ("Só você é afetado, mas há reunião com cliente hoje → Alta"), usada no trace e na resposta.

### 4.3 SLA e vencimento [REQ-STAT-03]
- Expediente: segunda a sexta, 8h–18h, `America/Sao_Paulo`. Crítica: 1 h corrida (plantão 24 h).
- `dueAt = addBusinessTime(lastUpdateAt, sla(priority))`; vencido quando `now > dueAt` e status não é `resolved/closed`.
- Funções puras recebendo `now` (porta `Clock`), 100 % testadas com datas fixas (fins de semana, fim de expediente).

### 4.4 Duplicidade e reabertura [REQ-OPEN-06, REQ-UPD-02]
- `findLikelyDuplicate(newIssue, openTickets)`: mesma categoria **e** similaridade de tokens normalizados (sem acento/stopwords) do título+descrição ≥ 0,35 (Jaccard). Simples, explicável, testável; o score vai para o trace.
- `canReopen(ticket, now)`: `status = resolved` e `now - resolvedAt ≤ 7 dias`.

### 4.5 Conversa — máquina de estados [REQ-HAND-06, REQ-CON-04/05]
```
          handoff                 assumir
 agent ───────────► waiting_analyst ───────► with_analyst
   ▲   ◄──────────────── devolver ◄───────────────┤
   │                                              │ encerrar
   └── (funcionário resolve / nova conversa) ──► closed ◄┘
```
`ConversationState` (JSON persistido): `pendingDraft?`, `selectedTicketId?`, `lowConfidenceStreak`, `employeeMessageCount`, `handoff?: { reason, summary, confidence?, at }`.
Transições são funções puras `transition(conv, event) → Result<Conversation, TransitionError>`; persistência com coluna `version` (optimistic locking) para evitar corrida analista × agent.

### 4.6 Rascunho [P3, GR-02]
```ts
interface Draft { id: string /* D-381 */; mode: 'create' | 'update' | 'reopen'; ticketId?: string;
  fields: { title; description; kind; category; priority; impact; dueAt; priorityReason };
  status: 'pending' | 'confirmed' | 'cancelled' }
```
Apenas uma ação **estruturada** `draft_action: confirm` (botão/atalho) **ou** a intenção `confirm` com rascunho pendente promove `pending → confirmed`. Só então o use case chama `TicketGateway.create/addUpdate/reopen`, com `idempotencyKey = draft.id`. Repetir a confirmação não duplica [REQ-SVC-04].

## 5. Como o agent decide (pipeline de um turno)

```
EmployeeInput
  │
  ├─ 0. Conversa não está com o agent? → só persiste e notifica analista. (GR-09, sem LLM)
  ├─ 1. Guardrails de entrada (puros): tamanho, limite 30, rate limit, máscara de segredos,
  │      heurística de prompt injection                                  (GR-04, 05, 07)
  ├─ 2. Ação estruturada? (botão: confirmar/cancelar rascunho, selecionar chamado,
  │      opção rápida mapeada) → caminho DETERMINÍSTICO, sem LLM          (P6)
  ├─ 3. Interpreter (LLM #1, saída estruturada Zod) → intent, entities, confidence, rationale
  ├─ 4. Policy (pura, no domínio) → Route + regras aplicadas
  │      ├ out_of_scope           → resposta template de redirecionamento  (REQ-SCOPE-01)
  │      ├ talk_to_human          → handoff(reason='requested')            (REQ-HAND-01)
  │      ├ critical               → rascunho + handoff(reason='critical')  (REQ-HAND-02)
  │      ├ confidence baixa       → pergunta de esclarecimento; 2ª vez seguida → handoff('low_confidence')
  │      ├ confirm/cancel + draft → executa/cancela rascunho               (P3)
  │      └ demais                 → Responder com toolset permitido pela intenção
  ├─ 5. Responder (LLM #2, Mastra Agent com tools, streaming)
  ├─ 6. Guardrails de saída: filtro de IDs de chamado alheios, validação de blocos (GR-03, 08)
  └─ 7. Persiste mensagem + blocos + DecisionTrace + estado; emite eventos SSE
```

**Interpreter** — schema de saída:
```ts
{ intent: 'question' | 'ticket_status' | 'update_ticket' | 'open_ticket' | 'confirm' | 'edit_draft'
        | 'cancel' | 'talk_to_human' | 'resolved_thanks' | 'out_of_scope' | 'greeting' | 'unclear',
  confidence: number,                  // 0..1
  ticketRef?: string, issueSummary?: string, details?: string,
  kind?: TicketKind, category?: Category,
  impact?: Impact | 'unknown', blocksWork?: boolean, deadlineToday?: boolean, hasWorkaround?: boolean,
  environment?: string,                // ex.: "Windows 11"
  rationale: string }                  // 1 frase: por que entendeu assim
```
Entrada: últimas 8 mensagens (texto) + `ConversationState` resumido + rascunho pendente. Prompt curto em pt-BR com as definições do Anexo A.

**Faixas de confiança**: alta ≥ 0,75 · média 0,5–0,75 (lê livremente, mas confirma antes de escrita) · baixa < 0,5.

**Responder** — tools disponíveis por intenção (menos tools = prompt menor e menos erro):

| Tool (label na UI) | Faz | Intenções |
|---|---|---|
| `search_help_center` ("buscou na central de ajuda") | KB full-text, retorna artigos com condições | question, open_ticket |
| `list_my_tickets` ("consultou seus chamados") | lista + SLA calculado → bloco seleção/card | ticket_status, update_ticket, open_ticket |
| `get_ticket` ("consultou o INC-…") | detalhe + vencimento → card | ticket_status, update_ticket |
| `ask_options` (sem label) | pergunta com opções rápidas → bloco | todas |
| `prepare_ticket_draft` ("classificou a prioridade", "consultou o SLA", "montou o rascunho") | checa duplicidade, calcula prioridade/SLA, cria rascunho pendente → bloco draft | open_ticket |
| `prepare_update_draft` ("montou a atualização") | rascunho de complemento/reabertura (valida janela de 7 dias) | update_ticket |
| `request_handoff` ("chamou um analista") | gera resumo, transiciona para `waiting_analyst`, transfere chamado | todas |

As tools retornam **dados + blocos de UI**; o texto do LLM é só a "cola" conversacional. Escritas não existem como tool: só via rascunho confirmado [GR-02].

## 6. Guardrails (implementação)

| ID | Onde | Como |
|---|---|---|
| GR-01 | `TurnTools` + tickets-service | `employeeId` fechado em closure; serviço retorna 404 se `ticket.employeeId ≠ X-Employee-Id` |
| GR-02 | use case de confirmação | sem `draft.status = confirmed` → `Result.err('draft_not_confirmed')`, registrado no trace |
| GR-03 | `domain/guardrails/output.ts` | regex `\b(INC\|REQ)-\d{4,6}\b`; IDs fora do conjunto do funcionário viram "[chamado não encontrado]" |
| GR-04 | `domain/guardrails/input.ts` | lista de padrões pt/en; se acionado: Interpreter recebe flag, Responder roda **sem** tools de escrita/handoff automático, trace registra |
| GR-05 | `domain/guardrails/input.ts` | padrões `senha (é\|:)`, tokens longos; substitui por `••••` antes de persistir/enviar ao LLM; resposta inclui aviso |
| GR-06 | Policy | `intent = out_of_scope` → template com canais (RH, Financeiro, Facilities) |
| GR-07 | use case + rota | 1.000 chars; 30 msgs/conversa; 10 msgs/min por usuário; orçamento diário de chamadas LLM (`LLM_DAILY_BUDGET`) → ao estourar, oferece analista |
| GR-08 | adapters Mastra | `structuredOutput` com Zod; erro → 1 retry → fallback (pergunta de esclarecimento) |
| GR-09 | passo 0 do pipeline | não chama Interpreter/Responder se `status ≠ agent` |
| GR-10 | prompt + tools | prompt proíbe procedimentos fora dos artigos; prazos só vindos de `prepare_*`/`get_ticket` |

Os guardrails de entrada/saída são **funções puras no core**; no adapter Mastra eles também são registrados como `inputProcessors`/`outputProcessors` (camada extra no próprio framework), reutilizando as mesmas funções.

## 7. Decision Trace (transparência) [P4, REQ-TRC-*]

```ts
interface DecisionTrace {
  turnId: string; at: string
  input: { kind: 'text' | 'quick_reply' | 'select_ticket' | 'draft_action'; text: string /* mascarado */ }
  understood: { intent: string; summary: string; entities: Record<string, string> } | null   // null em caminhos determinísticos
  confidence: { score: number; level: 'alta' | 'média' | 'baixa' } | null
  decision: { route: string; rationale: string; rules: RuleRef[] }   // ex.: { id: 'A.prioridade', text: 'Impede uma pessoa + compromisso hoje → Alta' }
  actions: { label: string; tool: string; input: unknown; output: unknown;
             status: 'ok' | 'error' | 'blocked'; durationMs: number; attempts: number }[]
  guardrails: { id: string; effect: string }[]
  llm: { model: string; calls: number; inputTokens: number; outputTokens: number; latencyMs: number }
}
```

**UI no chat**: linha de status com chips ✓ das ações (protótipo) + botão "Por que?" que expande um painel legível:
> **Entendi**: VPN não conecta (erro 809), Windows 11, só você afetada, reunião às 14h.
> **Decidi**: montar rascunho de chamado INC / Rede e VPN, porque o artigo do erro 809 vale só para Windows 10.
> **Prioridade**: Alta — impede você de trabalhar e há compromisso hoje (Anexo A). Prazo: resposta até 13:43.
> **Confiança**: alta (0,86) · **Guardrails**: nenhum acionado · **Ações**: 3 (detalhes ▸)

**Console**: o mesmo painel, com dados brutos das tools, tokens, latência e modelo.

## 8. Protocolo de streaming (SSE) — `POST /api/chat/:conversationId/messages`

Requisição (Zod): `EmployeeInput = { type: 'text'; text } | { type: 'quick_reply'; value; label } | { type: 'select_ticket'; ticketId } | { type: 'draft_action'; draftId; action: 'confirm' | 'edit' | 'cancel' }`

Eventos:
```
action.start { id, label }      action.end { id, status }
text.delta   { text }
block        { kind: 'ticket_card' | 'ticket_selector' | 'draft' | 'quick_replies' | 'system', data }
trace        { DecisionTrace }
done         { messageId, employeeMessageCount, conversationStatus }
error        { code, message, retryable }
```

## 9. Dados (Postgres)

**Schema `app`**: `users(id, email, name, role: employee|analyst, department, team)` · `conversations(id, employee_id, status, assigned_analyst_id, state jsonb, version, created_at, updated_at, closed_at, resolution)` · `messages(id, conversation_id, author: employee|agent|analyst|system, author_name, parts jsonb, created_at)` · `decision_traces(id, conversation_id, message_id, trace jsonb, created_at)` · `kb_articles(id, slug, title, body, applies_to, tsv)`

**Schema `tickets`** (só o tickets-service acessa): `tickets(...)` · `ticket_events(id, ticket_id, type, body, author, created_at)` · `idempotency_keys(key, response jsonb, created_at)`

Seed (datas relativas ao `now` do seed) [REQ-SVC-05]: Ana Souza (Financeiro) com INC-20311 (Média, aguardando analista, há 6 dias → vencido), INC-20298 (em andamento), REQ-10442 (Baixa, aprovado), INC-20150 (resolvido há 4 dias → reabrível), INC-19877 (resolvido há > 7 dias); Carla, Bruno, Diego, Elisa com chamados próprios; analistas Rafael Lima (N2) e um N1; 8 artigos (VPN 809 só Win10, horário do service desk, troca de senha, Wi-Fi visitantes, Outlook no celular, impressora, MFA, solicitação de software).

## 10. Serviço de chamados (API)

Auth: `Authorization: Bearer ${TICKETS_SERVICE_TOKEN}` + `X-Employee-Id`.
```
GET  /tickets                         → tickets do funcionário
GET  /tickets/:id                     → 404 se não for dele
POST /tickets                         (Idempotency-Key)
POST /tickets/:id/updates             (Idempotency-Key)
POST /tickets/:id/reopen              (Idempotency-Key) → 409 se fora da janela
POST /tickets/:id/transfer            (Idempotency-Key)
```
Chaos (`chaos.ts`): `CHAOS_FAILURE_RATE` (padrão 0,15) responde 503; `CHAOS_LATENCY_MS` adiciona latência. Cliente: timeout 3 s, 3 tentativas, backoff 200 ms × 2ⁿ + jitter, retry só em 503/timeout/rede [NFR-06]; tentativas aparecem no trace.

## 11. Erros e estados de UI [REQ-CHAT-07]
- `GatewayError` após retries → mensagem "O sistema de chamados está instável agora. Tento de novo?" + opções (Tentar de novo / Falar com analista); trace com `status: error, attempts: 3`.
- `LlmError` (rate limit do tier gratuito, timeout) → evento `error { retryable: true }` e botão "Tentar novamente"; a mensagem do funcionário já está salva.
- Rede do browser caiu → banner de reconexão; polling retoma.

## 12. Qualidade das decisões
1. **Unitários (core)**: prioridade, SLA, vencimento, duplicidade, reabertura, transições, policy, guardrails — com fakes das portas out (vantagem direta do hexagonal).
2. **Integração**: tickets-service (posse, idempotência, chaos), tickets-client (retry), rotas críticas (auth, acesso do console, limite de 30).
3. **Evals (`pnpm eval`)**: ~25 cenários em `packages/infra/evals/scenarios.ts` executados contra o LLM real, cada um com asserções sobre **intenção**, **tools chamadas**, **ações proibidas** (ex.: criar sem rascunho, revelar chamado de outro) e **rota**. Relatório em tabela com taxa de acerto por critério. Cobre: dúvida com artigo condicional, status sem número com 3 chamados, chamado vencido, duplicata, reabertura ≤ 7 dias e > 7 dias, crítico de equipe, fora de escopo, injection, senha digitada, pedido de humano.

## 13. Custo por conversa
- Caminhos determinísticos (botões, confirmações, seleção, handoff pedido explicitamente) não chamam LLM.
- Turno típico: Interpreter (~1,2 k tokens de entrada, saída curta) + Responder (~2 k + tools). Contexto truncado em 8 mensagens + estado estruturado.
- Trace registra tokens por turno; console mostra o total por conversa.
