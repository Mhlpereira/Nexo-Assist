# Requirements — Nexo Assist

Formato EARS: *Quando* \<gatilho\>, *o sistema deve* \<resposta\>. Cada requisito tem um ID estável, usado em tasks, testes e commits.

Legenda de verificação: **U** teste unitário · **I** teste de integração · **E** eval com LLM real · **M** verificação manual/visual.

---

## 1. Autenticação e sessão

| ID | Requisito | Verif. |
|---|---|---|
| REQ-AUTH-01 | Quando um funcionário informa um e-mail corporativo existente nos dados de exemplo e **qualquer** senha não vazia, o sistema deve autenticá-lo e redirecioná-lo para o chat. | I |
| REQ-AUTH-02 | Quando o e-mail não existe, o sistema deve exibir erro genérico ("E-mail ou senha inválidos") sem revelar se o e-mail existe. | I |
| REQ-AUTH-03 | O sistema deve manter a sessão em cookie `httpOnly`, assinado, com expiração; rotas de chat e console sem sessão válida redirecionam para o login. | I |
| REQ-AUTH-04 | Quando o usuário tem papel `analyst`, o sistema deve direcioná-lo ao console; funcionários não acessam rotas do console (403). | I |

## 2. Chat do funcionário

| ID | Requisito | Verif. |
|---|---|---|
| REQ-CHAT-01 | O sistema deve exibir as respostas do agent em tempo real (streaming de texto). | M |
| REQ-CHAT-02 | Acima de cada resposta do agent, o sistema deve exibir as ações executadas em linguagem natural (ex.: "Consultou seus chamados", "Classificou a prioridade"). | M |
| REQ-CHAT-03 | O sistema deve renderizar elementos estruturados: **card de chamado**, **seleção de chamado**, **rascunho para confirmação** e **opções rápidas** (quick replies). | M |
| REQ-CHAT-04 | Quando o usuário clica numa opção rápida ou seleciona um chamado, o sistema deve enviar a escolha como mensagem estruturada (não ambígua) ao servidor. | I |
| REQ-CHAT-05 | O sistema deve limitar cada sessão de conversa a **30 mensagens do funcionário**; o contador fica visível e, ao atingir o limite, o input é bloqueado com a opção de iniciar nova conversa ou falar com analista. O limite é imposto no servidor. | U, I |
| REQ-CHAT-06 | Quando o funcionário volta outro dia, o sistema deve retomar a última conversa não encerrada com histórico, estado (rascunho pendente, chamado selecionado) e status (agent/analista). | I |
| REQ-CHAT-07 | O sistema deve exibir estados de carregamento (agent "pensando", ação em andamento) e de erro (falha de rede, serviço indisponível) com opção de tentar novamente. | M |
| REQ-CHAT-08 | Enquanto a conversa está com analista, o chat deve indicar "Você está falando com {analista}" ou "Aguardando um analista" e exibir as mensagens do analista. | M |
| REQ-CHAT-09 | O rascunho deve oferecer **Confirmar** (atalho Ctrl/⌘+Enter), **Editar** (o funcionário diz o que mudar e o agent gera novo rascunho) e **Cancelar**. | I, M |
| REQ-PROF-01 | A tela "Meu perfil" deve exibir nome e e-mail corporativo (gerenciado pela TI) e o bloco de senha com "Redefinir senha" (simulado: apenas mensagem informativa). | M |

## 3. Agent — decisões por história

### 3.1 Tirar dúvida (História F1)
| ID | Requisito | Verif. |
|---|---|---|
| REQ-KB-01 | Quando o funcionário faz uma pergunta coberta pela central de ajuda, o agent deve buscar os artigos e responder com base neles, citando o artigo, **sem abrir chamado**. | E |
| REQ-KB-02 | Quando um artigo tem condição de aplicabilidade (ex.: "apenas Windows 10") e a condição é desconhecida, o agent deve perguntar antes de recomendar (com opções rápidas). | E |
| REQ-KB-03 | Quando a condição não é atendida ou nenhum artigo resolve, o agent deve oferecer abrir chamado. | E |
| REQ-KB-04 | O agent não deve inventar procedimentos que não estejam na central de ajuda; sem artigo relevante, ele diz isso e oferece chamado/analista. | E |

### 3.2 Consultar chamado (História F2)
| ID | Requisito | Verif. |
|---|---|---|
| REQ-STAT-01 | Quando o funcionário pergunta por um chamado com número, o agent deve consultar e exibir o card com status, prioridade, última atualização e prazo. | E, I |
| REQ-STAT-02 | Quando o funcionário não informa o número, o agent deve listar os chamados **dele** e, se houver mais de um candidato, exibir **seleção de chamado**; se houver só um compatível com a descrição, usá-lo diretamente. | E |
| REQ-STAT-03 | O sistema deve calcular se o chamado está **vencido** (prazo da prioridade, em horas/dias úteis, contado da última atualização) e o agent deve informar claramente o atraso. | U, E |
| REQ-STAT-04 | Quando o chamado está vencido, o agent deve oferecer chamar um analista (opções rápidas). | E |
| REQ-STAT-05 | Quando o número informado pertence a outro funcionário ou não existe, o agent deve responder "não encontrei esse chamado entre os seus" sem confirmar a existência. | U, I, E |

### 3.3 Complementar chamado (História F3)
| ID | Requisito | Verif. |
|---|---|---|
| REQ-UPD-01 | Quando o funcionário quer acrescentar informação a um chamado aberto, o agent deve identificar o chamado (número ou seleção), mostrar um rascunho da atualização e só registrá-la após confirmação. | E, I |
| REQ-UPD-02 | Quando o chamado está resolvido há até 7 dias e o problema voltou, o agent deve propor **reabertura** (com confirmação). Acima de 7 dias, deve propor um novo chamado referenciando o antigo. | U, E |
| REQ-UPD-03 | Chamados fechados/cancelados não podem ser atualizados. | U |

### 3.4 Abrir chamado (História F4)
| ID | Requisito | Verif. |
|---|---|---|
| REQ-OPEN-01 | Quando o funcionário descreve um problema/pedido sem solução na central de ajuda, o agent deve coletar as informações obrigatórias: título, descrição, tipo, categoria, impacto (quem é afetado) e urgência. | E |
| REQ-OPEN-02 | O agent deve perguntar **uma coisa por vez** quando faltar informação, preferindo opções rápidas (ex.: "Só você / Sua equipe / A empresa toda"). | E |
| REQ-OPEN-03 | O sistema deve classificar **tipo** (INC: algo parou/não funciona; REQ: pedido de acesso, equipamento, software) e **categoria** (Acesso, Rede e VPN, Hardware, Software, E-mail, Outros). | E |
| REQ-OPEN-04 | O sistema deve calcular a **prioridade** de forma determinística a partir de impacto × urgência (tabela do Anexo A) e exibir o prazo correspondente. | U |
| REQ-OPEN-05 | Antes de criar, o agent deve exibir um **rascunho** com todos os campos e botões "Confirmar" / "Editar"; o chamado só é criado após confirmação. | U, I, E |
| REQ-OPEN-06 | Antes de gerar o rascunho, o sistema deve verificar **duplicidade** contra os chamados abertos do funcionário; havendo provável duplicata, o agent deve propor atualizar o existente em vez de criar outro. | U, E |
| REQ-OPEN-07 | Após criar, o agent deve exibir o card do chamado criado com número e prazo. | M |

### 3.5 Falar com analista (História F5)
| ID | Requisito | Verif. |
|---|---|---|
| REQ-HAND-01 | Quando o funcionário pede um humano, o sistema deve transferir a conversa (sem tentar dissuadir). | E, I |
| REQ-HAND-02 | Quando o caso é **crítico** (algo parado para uma equipe ou empresa), o sistema deve transferir após registrar/rascunhar o chamado, informando o plantão. | E |
| REQ-HAND-03 | Quando um chamado consultado está **vencido** e o funcionário aceita, o sistema deve transferir. | E |
| REQ-HAND-04 | Quando a confiança da interpretação estiver abaixo do limiar (ver design) por 2 turnos seguidos, ou houver ambiguidade não resolvível, o sistema deve transferir marcando o motivo "baixa confiança". | U, E |
| REQ-HAND-05 | Toda transferência deve gerar um **resumo do caso** (problema, o que já foi tentado, chamados envolvidos, motivo da transferência). | E |
| REQ-HAND-06 | Enquanto a conversa estiver com analista (aguardando ou em atendimento), o agent **não** deve responder; mensagens do funcionário vão para o analista. | U, I |

### 3.6 Escopo e contexto
| ID | Requisito | Verif. |
|---|---|---|
| REQ-SCOPE-01 | Quando o assunto não é de TI (RH, financeiro, facilities), o agent deve redirecionar educadamente, indicando o canal adequado, sem abrir chamado. | E |
| REQ-CTX-01 | O agent deve manter o contexto da conversa (não perguntar de novo o que já foi dito). | E |

## 4. Console do analista

| ID | Requisito | Verif. |
|---|---|---|
| REQ-CON-01 | O console deve listar conversas com etiqueta de estado ("Transferida · INC-20311", "Agent pediu ajuda · confiança 41%", "Agent atendendo", "Você está atendendo", "Resolvida pelo agent"), última mensagem, horário e não lidas, com busca por nome/chamado e filtros **Todas · Para você · Com o agent · Minhas** (com contadores). | M, I |
| REQ-CON-02 | Conversas "baixa confiança" e "crítico" devem ser destacadas e ordenadas primeiro. | M |
| REQ-CON-03 | Ao abrir uma conversa, o console deve mostrar histórico completo (incluindo ações e traces do agent), o resumo da transferência e o painel com os chamados do funcionário. | M |
| REQ-CON-04 | O analista deve poder **assumir** a conversa: status → Em atendimento, agent pausado, funcionário vê o nome do analista. | I |
| REQ-CON-05 | O analista deve poder **devolver ao agent** (status → Com o agent, agent recebe nota de contexto) ou **encerrar** (status → Encerrada). | I |
| REQ-CON-06 | Analista e funcionário devem ver as mensagens um do outro em até ~3 s. | M |

## 5. Serviço de chamados simulado

| ID | Requisito | Verif. |
|---|---|---|
| REQ-SVC-01 | O serviço deve ser um processo separado do agent, com API HTTP para consultar, criar, atualizar (comentário/campos), reabrir e transferir chamados. | I |
| REQ-SVC-02 | O serviço deve exigir o funcionário solicitante e retornar 404 para chamados de outro funcionário. | I |
| REQ-SVC-03 | O serviço deve simular instabilidade configurável (taxa de erro 503 e latência) para exercitar a resiliência. | I |
| REQ-SVC-04 | Escritas devem aceitar `Idempotency-Key`; repetir a mesma chave não duplica o efeito. | I |
| REQ-SVC-05 | Seed com: 5+ funcionários, 2 analistas, 5–10 artigos, chamados em situações variadas (aberto, vencido, resolvido há ≤7 dias, resolvido há >7 dias, de outros funcionários). Datas relativas ao momento do seed. | M |
| REQ-SVC-06 | Seed com conversas de demonstração para o console, uma por estado: transferida a pedido, agent pediu ajuda (baixa confiança), agent atendendo, resolvida pelo agent. Mensagens do agent com Decision Trace. A Ana não recebe conversa semeada, para o fluxo do funcionário começar do zero. | M |

## 6. Guardrails

| ID | Guardrail | Camada | Verif. |
|---|---|---|---|
| GR-01 | **Isolamento por funcionário**: tools usam o `employeeId` da sessão (runtime context), nunca do LLM; o serviço revalida a posse. | Tool + serviço | U, I |
| GR-02 | **Confirmação antes de escrita**: tools de escrita exigem um `draftId` em estado `confirmed` no servidor; sem isso retornam erro e o trace registra o bloqueio. | Tool | U |
| GR-03 | **Filtro de saída de IDs**: qualquer número de chamado (`INC-\d+`/`REQ-\d+`) na resposta que não pertença ao funcionário é removido antes de enviar. | Output | U |
| GR-04 | **Prompt injection**: detecção heurística (ex.: "ignore as instruções", "você agora é", pedidos de dados de outros usuários) → resposta segura, sem executar tools de escrita, registrado no trace. | Input | U, E |
| GR-05 | **Dados sensíveis**: senhas/tokens digitados pelo funcionário ("minha senha é ...") são mascarados antes de persistir e de ir ao LLM; o agent orienta a nunca compartilhar senhas. | Input | U |
| GR-06 | **Escopo de TI**: assuntos fora de TI são redirecionados (REQ-SCOPE-01). | Classificador | E |
| GR-07 | **Limites de uso**: tamanho máximo da mensagem (1.000 caracteres), 30 mensagens por sessão, rate limit por usuário (ex.: 10 msg/min) e orçamento diário de chamadas ao LLM. | Input / API | U, I |
| GR-08 | **Validação de saída estruturada**: saídas do classificador e argumentos de tools são validados por schema (Zod); falha → 1 nova tentativa → fallback seguro (pergunta de esclarecimento ou transferência). | Agent | U |
| GR-09 | **Agent pausado**: nenhuma chamada ao LLM é feita enquanto a conversa está com analista (REQ-HAND-06). | Orquestração | U |
| GR-10 | **Sem promessas inventadas**: prazos citados vêm do cálculo de SLA; procedimentos vêm de artigos (REQ-KB-04). | Prompt + dados | E |

## 7. Transparência

| ID | Requisito | Verif. |
|---|---|---|
| REQ-TRC-01 | Cada turno do agent deve gerar um Decision Trace persistido com: intenção entendida, entidades extraídas, confiança (alta/média/baixa + valor), decisão tomada, justificativa, ações (tool, entrada resumida, saída resumida, status, duração, tentativas), regras do Anexo A aplicadas e guardrails acionados. | U |
| REQ-TRC-02 | O funcionário deve poder expandir as ações acima de cada resposta para ver o trace em formato legível ("Entendi que…", "Decidi… porque…", "Confiança: alta"). | M |
| REQ-TRC-03 | O analista deve ver os mesmos traces no console, incluindo modelo usado, tokens e latência. | M |

## 8. Não funcionais

| ID | Requisito | Verif. |
|---|---|---|
| NFR-01 | TypeScript `strict`, sem `any` explícito; lint no CI local. | M |
| NFR-02 | Conversas, mensagens, traces, estado da conversa e chamados persistem em Postgres e sobrevivem a reinício. | I |
| NFR-03 | Rodar localmente com `docker compose up -d`, `pnpm install`, `pnpm db:setup`, `pnpm dev`; `.env.example` documentado. | M |
| NFR-04 | Custo zero: provedor de LLM com tier gratuito ou local, configurável por variável de ambiente. | M |
| NFR-05 | No máximo 2 chamadas ao LLM "pesadas" por turno típico; contexto limitado às últimas N mensagens + estado estruturado da conversa. | U |
| NFR-06 | Chamadas ao serviço de chamados: timeout 3 s, até 3 tentativas com backoff exponencial + jitter, apenas com idempotência garantida. | U |
| NFR-07 | Chaves apenas em variáveis de ambiente; `.env` no `.gitignore`. | M |
| NFR-08 | Primeiro token da resposta em < 3 s no caso típico (exceto latência do provedor gratuito). | M |
