# CLAUDE.md — Nexo Assist

Agent de service desk de TI (desafio técnico). Desenvolvimento **spec-driven**: leia `specs/` antes de qualquer mudança.

## Fluxo obrigatório (SDD)
1. Toda mudança de comportamento começa em `specs/` (requirements → design → tasks). Atualize a spec **antes** do código.
2. Implemente uma task de `specs/tasks.md` por vez, marcando-a como concluída ao terminar.
3. Commits citam a task: `feat(core): T1.2 cálculo de SLA em horas úteis`.
4. Testes citam o requisito: `it('REQ-OPEN-04: ...')`.

## Regras de código (inegociáveis)
- **Proibido `any`**: nem explícito, nem `as any`, nem `@ts-ignore`. Use `unknown` + narrowing/Zod. TypeScript `strict` sempre.
- **O mais simples possível**: a menor solução que atende a spec. Sem abstração especulativa, sem generalização "para o futuro", sem padrões que não pagam o próprio custo. Prefira funções puras a classes; prefira menos arquivos a muitos arquivos minúsculos. Se três linhas resolvem, não crie um helper.
- **Arquitetura hexagonal com portas de entrada (in) e saída (out)**:
  - `packages/core/src/domain`: entidades, value objects e regras de negócio puras. Sem dependência de framework, I/O ou relógio do sistema.
  - `packages/core/src/application/ports/in`: interfaces dos casos de uso (o que o mundo externo pode pedir ao sistema).
  - `packages/core/src/application/ports/out`: interfaces do que o sistema precisa do mundo externo (repositórios, serviço de chamados, LLM/agent, relógio).
  - `packages/core/src/application/dto`: os contratos de dados que atravessam as portas (comandos, resultados, erros, views, requests).
  - `packages/core/src/application/use-cases`: implementações das portas `in`, dependendo apenas de portas `out`.
- **Organização de arquivos (pastas planas, um contrato por arquivo)**:
  - Sem subpastas dentro de `ports/in`, `ports/out`, `dto` e `use-cases`: apenas arquivos.
  - **Uma interface (ou tipo) exportada por arquivo**, com o nome do arquivo em kebab-case igual ao do contrato.
  - Sufixos obrigatórios: portas `*.in.port.ts` em `ports/in` e `*.out.port.ts` em `ports/out` (ex.: `ports/in/login.in.port.ts`, `ports/out/clock.out.port.ts`); dados `*.dto.ts` (ex.: `dto/employee-input.dto.ts`); casos de uso `*.use-case.ts` com o teste ao lado `*.use-case.test.ts`.
  - Portas só declaram comportamento (métodos); qualquer dado que elas recebem ou devolvem vira um DTO em `dto/`.
  - Cada pasta tem um `index.ts` que reexporta seus arquivos; fora do core, importe sempre de `@nexo/core`.
  - `packages/infra`: adapters de saída (Postgres via postgres.js com SQL puro, cliente HTTP do serviço de chamados, Mastra).
  - `apps/web`: adapters de entrada (rotas Next.js, UI) e o composition root (`src/server/container.ts`).
  - Dependências sempre apontam para dentro: `apps/* → infra → core`. `core` nunca importa de `infra` ou `apps`.
- Regras do Anexo A (prioridade, SLA, vencimento, reabertura, duplicidade, transferência) são **código puro no domínio**, nunca só prompt.
- Identidade do funcionário vem da sessão, nunca de argumentos gerados pelo LLM.
- Validação de fronteira com Zod (HTTP, saída do LLM, variáveis de ambiente).
- Erros esperados como valores (`Result`) no core; exceções só para o inesperado.
- **Sem comentários no código**: nada de `//` ou `/* */` explicativos nem JSDoc. O código deve se explicar por nomes claros e funções pequenas. Se algo precisa de explicação, renomeie ou extraia; decisões de design vão em `specs/design.md`.
- **Nomes completos, sem abreviações** (Clean Code / Clean Architecture): nada de `c`, `t`, `e`, `x`, `n`, `ms`, `env`, `ctx`, `req`, `res`, `cfg`, `tmp`. Use `context`, `ticket`, `event`, `milliseconds`, `environment`, `request`, `response`, `configuration`. Vale para variáveis, parâmetros de callbacks/lambdas, funções, tipos e constantes. Siglas consagradas do domínio ou da tecnologia são permitidas (`id`, `url`, `sql`, `sla`, `llm`, `http`, `json`).
- Código e nomes de domínio em inglês; textos para o usuário em pt-BR.

## Comandos
```bash
docker compose up -d     # Postgres
pnpm install
pnpm db:setup            # migrations + seed
pnpm dev                 # web (3000) + tickets-service (4001)
pnpm test                # vitest
pnpm typecheck && pnpm lint
pnpm eval                # cenários de decisão do agent com o LLM real
```

## Referências
- PRD: `docs/prd.pdf` (se presente) · Protótipo: `docs/prototype/nexo.pen` (resumo legível em `docs/prototype/outline.txt`)
- Specs: `specs/constitution.md`, `specs/requirements.md`, `specs/design.md`, `specs/tasks.md`
