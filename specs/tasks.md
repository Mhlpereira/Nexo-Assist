# Tasks — Nexo Assist

Cada task: **cobre** (requisitos) · **verifica** (como sabemos que está pronta). Marque `[x]` ao concluir e faça um commit citando o ID.
Ordem pensada para ter, o quanto antes, um fluxo de ponta a ponta funcionando e depois refinar.

## Fase 0 — Fundação
- [x] **T0.1** Monorepo pnpm (`apps/web`, `apps/tickets-service`, `packages/core`, `packages/infra`), `tsconfig.base.json` strict, ESLint com `@typescript-eslint/no-explicit-any: error`, Vitest, Prettier. · cobre NFR-01 · verifica `pnpm typecheck && pnpm lint` verdes
- [x] **T0.2** `docker-compose.yml` (Postgres 16), `.env.example`, validação de env com Zod em cada app. · NFR-03, NFR-07 · `docker compose up -d` + app sobe
- [x] **T0.3** Tipo `Result<T, E>` e utilitários mínimos no core. · P8 · unit

## Fase 1 — Domínio (core, sem I/O)
- [x] **T1.1** Tipos de domínio: Ticket, Category, Priority, Status, Impact, Draft, Conversation, DecisionTrace. · design §4, §7
- [x] **T1.2** SLA em horas/dias úteis + `dueAt` + `isOverdue`. · REQ-STAT-03 · unit (fins de semana, fora do expediente, crítica 24 h)
- [x] **T1.3** `computePriority` com justificativa. · REQ-OPEN-04 · unit (tabela do Anexo A)
- [x] **T1.4** `findLikelyDuplicate` e `canReopen`/`canUpdate`. · REQ-OPEN-06, REQ-UPD-02, REQ-UPD-03 · unit
- [x] **T1.5** Máquina de estados da conversa. · REQ-HAND-06, REQ-CON-04/05 · unit (transições válidas e inválidas)
- [x] **T1.6** Guardrails puros: input (tamanho, injection, máscara de segredos) e output (filtro de IDs). · GR-03/04/05/07 · unit
- [x] **T1.7** Policy: `(interpretation, state, flags) → Route + rules`. · REQ-HAND-01..04, REQ-SCOPE-01, GR-06 · unit

## Fase 2 — Serviço de chamados simulado
- [x] **T2.1** Schema `tickets` + migrations + seed com datas relativas. · REQ-SVC-05
- [x] **T2.2** API Hono (listar, detalhar, criar, atualizar, reabrir, transferir) com checagem de posse e token. · REQ-SVC-01/02, GR-01 · integração
- [x] **T2.3** Idempotência e chaos (503 + latência configuráveis). · REQ-SVC-03/04 · integração

## Fase 3 — Portas e casos de uso
- [x] **T3.1** Portas `in` e `out` (interfaces) conforme design §3. · P9
- [x] **T3.2** Fakes em memória das portas `out` para testes.
- [x] **T3.3** `HandleEmployeeInput` — passos 0, 1, 2 (determinísticos): agent pausado, guardrails, limite de 30, ações estruturadas (confirmar/cancelar rascunho, selecionar chamado, opções). · REQ-CHAT-04/05, REQ-OPEN-05, GR-02/07/09 · unit
- [x] **T3.4** `HandleEmployeeInput` — passos 3–7 com Interpreter/Responder fakes; `TurnTools`; montagem do DecisionTrace. · REQ-TRC-01, GR-01/03/08 · unit
- [x] **T3.5** Casos de uso de conversa e console (get/start, messages since, list, detail, take over, return, close, analyst message). · REQ-CHAT-06, REQ-CON-* · unit

## Fase 4 — Adapters de saída (infra)
- [x] **T4.1** Schema `app` (SQL), migrations, repositórios (conversations com `version`, messages, traces, users) e seed de usuários. · NFR-02 · integração
- [x] **T4.2** Central de ajuda: tabela + 8 artigos + busca full-text `portuguese`. · REQ-KB-01 · integração
- [x] **T4.3** Tickets client HTTP com timeout, retry/backoff/jitter e contagem de tentativas. · NFR-06, P7 · unit (fetch fake)
- [x] **T4.4** Mastra: provedor configurável (`LLM_MODEL`, Gemini/Ollama), `Interpreter` com structured output + retry de validação. · NFR-04, GR-08
- [x] **T4.5** Mastra: `Responder` (Agent com tools filtradas por intenção, streaming), prompt do sistema com Anexo A, processors de guardrail reutilizando o core, contagem de tokens e orçamento diário. · REQ-KB-*, REQ-STAT-*, REQ-OPEN-*, GR-04/07/10

## Fase 5 — Adapter de entrada: API (apps/web)
- [x] **T5.1** Composition root (`container.ts`), sessão JWT, middleware de rotas e papéis. · REQ-AUTH-01..04 · integração
- [x] **T5.2** `POST /api/chat/:id/messages` com SSE (eventos do design §8); `GET` conversa e mensagens desde; nova conversa; rate limit. · REQ-CHAT-01/04/06, GR-07
- [x] **T5.3** Rotas do console (lista com filtros/busca, detalhe, assumir, devolver, encerrar, mensagem do analista, chamados do funcionário). · REQ-CON-*

## Fase 6 — UI do funcionário (seguindo `docs/prototype/nexo.pen`)
- [x] **T6.1** Design tokens (cores, raios, fontes Schibsted Grotesk / Newsreader / IBM Plex Mono) e componentes base (botão, badge de status/prioridade, avatar). · M
- [x] **T6.2** Tela 1 — Login (painel "Showcase" + formulário). · REQ-AUTH-01/02
- [x] **T6.3** Tela 2/3 — Chat: sidebar, top bar, mensagens com streaming, linha de status com ações, cards de chamado, seletor, rascunho (Confirmar ⌘↵ / Editar / Cancelar), opções rápidas, contador "N/30", estados de carregamento e erro. · REQ-CHAT-01..09
- [x] **T6.4** Painel "Por que?" do Decision Trace. · REQ-TRC-02 — **prioridade alta, é o item mais avaliado**
- [x] **T6.5** Modo analista no chat do funcionário (aguardando / falando com Rafael) via polling. · REQ-CHAT-08
- [x] **T6.6** Tela "Meu perfil". · REQ-PROF-01

## Fase 7 — Console do analista
- [x] **T7.1** Tela 4 — rail, lista com filtros/contadores/busca/etiquetas, conversa com resumo da transferência, barra "Assumir / Devolver", composer bloqueado, painel "Chamados da {nome}". · REQ-CON-01..03
- [x] **T7.2** Tela 5 — atendimento assumido: composer ativo, Devolver / Encerrar, eventos de sistema. · REQ-CON-04..06
- [x] **T7.3** Traces no console (mesmo painel + métricas de LLM). · REQ-TRC-03

## Fase 8 — Qualidade e entrega
- [ ] **T8.1** Evals: ~25 cenários + runner `pnpm eval` + relatório. Ajustar prompts até ≥ 90 % de acerto nas asserções críticas (nenhuma violação de privacidade/confirmação). · design §12
- [ ] **T8.2** Teste de persistência: reiniciar apps e retomar conversa/estado. · NFR-02, REQ-CHAT-06
- [ ] **T8.3** README: como rodar, arquitetura (diagrama hexagonal), como o agent decide, como garanti qualidade (evals + testes), escolha do LLM gratuito, trade-offs, o que faria com mais tempo.
- [ ] **T8.4** Revisão final: `pnpm typecheck && pnpm lint && pnpm test`, busca por `any`, histórico de commits.
