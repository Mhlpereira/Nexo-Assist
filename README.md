# Nexo Assist

Agent de atendimento do service desk de TI da Nexo. O funcionário descreve o problema em um chat; o agent consulta os chamados dele, busca na central de ajuda, abre ou complementa chamados (sempre com rascunho e confirmação) e chama um analista quando precisa. O analista acompanha tudo em um console, assume a conversa com o agent pausado e devolve ou encerra.

A peça central é a **transparência**: acima de cada resposta aparecem as ações executadas ("consultou seus chamados", "classificou a prioridade") e o botão **Por quê?** abre o raciocínio completo do turno — o que foi entendido, com que confiança, qual decisão, quais regras do service desk se aplicaram, cada ação com entrada/saída/tempo/tentativas e os guardrails acionados.

---

## Como rodar

Pré-requisitos: Node 22+, pnpm 9, Docker.

```bash
cp .env.example .env          # preencha GOOGLE_GENERATIVE_AI_API_KEY (gratuita) e um SESSION_SECRET
docker compose up -d          # Postgres na porta 5440 (mude com POSTGRES_PORT)
pnpm install
pnpm db:setup                 # schemas, funcionários, central de ajuda e chamados de exemplo
pnpm dev                      # web em http://localhost:3000 + serviço de chamados em :4001
```

Contas de demonstração (qualquer senha):

| Quem | E-mail | Para ver |
|---|---|---|
| Ana Souza | `ana.souza@nexo.com.br` | chamado vencido (INC-20311), resolvido há 4 dias (reabrível), resolvido há 57 dias |
| Bruno Tavares | `bruno.tavares@nexo.com.br` | funcionário com impressora da equipe com problema |
| Rafael Lima | `rafael.lima@nexo.com.br` | **console do analista** (N2) |

Outros comandos:

```bash
pnpm test                     # 96 testes (domínio, casos de uso, adapters, serviço) — exige o Postgres no ar
pnpm typecheck && pnpm lint
pnpm eval                     # 17 cenários de decisão contra o LLM real (pnpm eval "vencido" filtra)
```

> Se o Docker Desktop não estiver rodando no Linux, `DOCKER_CONTEXT=default docker compose up -d` usa o engine do sistema.

---

## Arquitetura

```
apps/web (Next.js)                 apps/tickets-service (Hono)
 ├─ páginas: login, chat,           └─ "sistema legado" simulado: API própria,
 │  perfil, console                    schema próprio, falhas 503 e latência
 ├─ rotas /api (adapters de            injetáveis, Idempotency-Key
 │  entrada) + SSE                              ▲ HTTP
 └─ container.ts (composition root)             │
          │                                     │
          ▼                                     │
packages/core  ◄──────────  packages/infra ─────┘
 ├─ domain/  regras puras       ├─ Postgres (postgres.js, SQL puro)
 │  SLA, prioridade,            ├─ cliente HTTP com retry/backoff
 │  duplicidade, policy,        ├─ central de ajuda (full-text pt)
 │  guardrails, trace           └─ Mastra: Interpreter e Responder
 └─ application/
    ├─ ports/in   *.in.port.ts   (o que a UI pode pedir)
    ├─ ports/out  *.out.port.ts  (o que o core precisa)
    ├─ dto/       *.dto.ts       (contratos de dados)
    └─ use-cases/ *.use-case.ts
```

- **Hexagonal com portas de entrada e saída.** O `core` não conhece Next, Mastra, Postgres nem HTTP; dependências apontam para dentro (`apps → infra → core`). Trocar o LLM ou o banco não toca no domínio, e os casos de uso são testados com fakes em memória.
- **Serviço de chamados separado do agent**, como o PRD pede: processo e schema próprios, posse validada no próprio serviço (404 para chamado de outra pessoa) e instabilidade simulada (`CHAOS_FAILURE_RATE=0.15`).
- **Persistência em Postgres**: conversas (com estado e `version` para locking otimista), mensagens com blocos e trace em `jsonb`, chamados no schema do serviço. Tudo sobrevive a reinício — a conversa volta com histórico, rascunho pendente e quem está atendendo.
- **Tempo real**: o turno do agent é transmitido por SSE (ações, blocos e texto à medida que acontecem); mensagens entre funcionário e analista usam polling de 2,5 s, suficiente para o caso e sem infraestrutura extra.

O desenvolvimento foi **spec-driven**: [`specs/`](specs/) tem a constituição do projeto, os requisitos numerados (REQ/GR/NFR), o design e o plano de tasks. Testes e commits citam os IDs.

---

## Como o agent decide

Cada mensagem passa por um pipeline em que **o LLM interpreta e o código decide as regras**:

```
mensagem
  0. conversa com analista?         → só registra; o agent não responde (sem LLM)
  1. guardrails de entrada           → tamanho, limite de 30, rate limit, máscara de senhas, injection
  2. ação de botão?                  → caminho determinístico, sem LLM
     (confirmar/editar/cancelar rascunho, escolher chamado, "Falar com um analista",
      "Como está meu chamado?")
  3. Interpreter (LLM, saída estruturada Zod) → intenção, entidades, confiança, justificativa
  4. Policy (código puro)            → rota + tools permitidas + regras aplicadas
       fora de TI → redireciona          pediu analista → transfere
       confiança < 0,5 → pergunta; 2ª vez seguida → transfere ("agent pediu ajuda")
       "pode criar" com rascunho → executa (com confiança alta; senão pede o botão)
       demais → Responder com apenas as tools daquela intenção
  5. Responder (LLM com tools, streaming)
  6. guardrails de saída             → remove números de chamado que não são do funcionário
  7. persiste mensagem + DecisionTrace + estado
```

As regras do Anexo A são funções puras e testadas, nunca só prompt:

| Regra | Onde |
|---|---|
| Prioridade = impacto × urgência, com a justificativa em texto | `domain/priority.ts` |
| Prazo em horas/dias úteis (seg–sex 8h–18h, crítica 1 h corrida) e vencimento | `domain/sla.ts` |
| Duplicidade (mesma categoria + similaridade de termos) e janela de reabertura de 7 dias | `domain/ticket-rules.ts` |
| Confirmação antes de escrever: escrita só via rascunho confirmado, com `Idempotency-Key` | caso de uso + serviço |
| Transferência: pedido, crítico (automática após confirmar), vencido, baixa confiança | `domain/policy.ts` + caso de uso |
| Privacidade: `employeeId` vem da sessão e fica preso nas tools; o modelo nunca o escolhe | `turn-tools.ts` + serviço |

**Guardrails** (GR-01 a GR-10 em `specs/requirements.md`): isolamento por funcionário, confirmação obrigatória, filtro de IDs alheios na saída, detecção de prompt injection (o turno perde as tools de escrita), máscara de senhas antes de salvar e de enviar ao modelo, escopo de TI, limites de uso e orçamento diário de chamadas ao LLM, validação de saída estruturada com nova tentativa, agent pausado com analista. Os guardrails de entrada também estão registrados como `inputProcessors` do Mastra, junto de um `TokenLimiter`.

**Resumo para o analista** é montado por código (motivo, entendimento do agent com confiança, último pedido, chamado com status/vencimento, rascunho pendente): sem custo extra e sem risco de alucinação no texto que o analista lê.

---

## Escolha do modelo

**Google Gemini Flash no tier gratuito** (`LLM_MODEL=google/gemini-flash-latest`), via o roteador de modelos do Mastra.

- Custo zero — requisito pessoal para um projeto de processo seletivo — com bom suporte a tool calling, saída estruturada e português.
- Configurável por variável de ambiente; nada no core muda. Para rodar 100% local: `LLM_MODEL=ollama/qwen3:8b` (usa o endpoint compatível com OpenAI do Ollama).
- Custo por conversa: botões e confirmações não chamam o modelo; um turno de texto típico faz 2 chamadas (interpretação curta + resposta com tools), com contexto limitado às 8 últimas mensagens e ao estado estruturado. Tokens e latência de cada turno ficam no trace e aparecem no console.

---

## Como garanti a qualidade das decisões

1. **Testes de domínio e casos de uso** (Vitest, 96 testes): SLA com fins de semana e fora do expediente, tabela de prioridade, duplicidade, reabertura, máquina de estados, policy, guardrails, e o turno completo com Interpreter/Responder roteirizados — cada teste cita o requisito (`REQ-OPEN-05: não cria chamado sem confirmação`).
2. **Testes de integração** contra Postgres real: repositórios, busca na central de ajuda, serviço de chamados (posse, idempotência, janela de reabertura, indisponibilidade) e cliente HTTP (retry com backoff, Idempotency-Key repetida em cada tentativa).
3. **Evals com o LLM real** (`pnpm eval`): 17 cenários com asserções sobre intenção, rota, tools chamadas, blocos exibidos, estado e chamadas ao serviço. As asserções **críticas** — privacidade, nunca criar sem confirmação, guardrails — falham o processo. O relatório mostra taxa de acerto e tokens por cenário.
4. **Trace persistido** de cada turno: qualquer decisão errada pode ser inspecionada depois no chat ou no console.

---

## Principais trade-offs

- **Duas chamadas ao LLM por turno de texto** (interpretar + responder) em vez de uma: custa um pouco mais de latência, mas dá intenção e confiança estruturadas para a policy decidir com código, e é isso que torna o trace confiável.
- **Busca full-text em vez de embeddings**: 8 artigos não justificam vetores; é grátis, determinística e explicável. Com uma base grande, trocaria o adapter de `KnowledgeBase` por busca híbrida.
- **Polling para mensagens humanas** em vez de WebSocket: simples e suficiente para o volume do protótipo.
- **Duplicidade por similaridade de termos**: transparente (o score vai para o trace), mas pode errar em descrições muito diferentes do mesmo problema; o agent sempre mostra o chamado parecido e deixa o funcionário decidir.
- **Senha qualquer no login**, como o PRD pede; a sessão é um JWT em cookie `httpOnly`.

## O que faria com mais tempo

- Rodar e ajustar os evals em mais modelos e ampliar os cenários com conversas reais anonimizadas.
- Notificações em tempo real (SSE/WebSocket) para o console e o chat, e indicador de "digitando".
- Fila de analistas com atribuição automática, SLA da própria conversa transferida e métricas no console (resolução sem fila, motivos de transferência).
- Busca híbrida na central de ajuda e sugestão de novos artigos a partir de chamados recorrentes.
- Testes end-to-end com Playwright cobrindo os fluxos das 5 telas.
- Deploy (Railway/Fly com Postgres gerenciado), rate limit distribuído e orçamento de LLM persistido.
