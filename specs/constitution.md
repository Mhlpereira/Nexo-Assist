# Constitution — Nexo Assist

Princípios que se sobrepõem a qualquer conveniência de implementação. Quando houver conflito, o princípio de número menor vence.

## P1. Privacidade por construção
A identidade do funcionário vem **somente** da sessão autenticada no servidor. O LLM nunca escolhe "de quem" é um chamado: as tools recebem o `employeeId` do contexto de execução, nunca de argumentos gerados pelo modelo. O serviço de chamados também valida a posse (defesa em profundidade).

## P2. O LLM interpreta; o código decide regras
Tudo o que é regra de negócio determinística do Anexo A é **código puro e testado**, não prompt:
cálculo de prioridade (impacto × urgência), prazo/SLA em horas úteis, vencimento, janela de reabertura de 7 dias, detecção de duplicidade, gatilhos de transferência e confirmação antes de escrever.
O LLM extrai intenção e entidades da linguagem natural e redige respostas.

## P3. Nada é escrito sem confirmação
Criar, atualizar, reabrir ou transferir chamado só acontece após confirmação explícita do funcionário sobre um rascunho exibido. A confirmação é uma transição de estado verificada no servidor, não uma "promessa" do prompt.

## P4. Toda resposta é explicável
Cada turno do agent gera um **Decision Trace** persistido: o que entendeu, com que confiança, quais ações executou (com entrada, saída, duração e tentativas), quais regras e guardrails se aplicaram e por quê. Se não dá para explicar, não dá para fazer.

## P5. Na dúvida, um humano
Confiança baixa, caso crítico, chamado vencido ou pedido explícito → transferência para analista com resumo. Errar para o lado do encaminhamento é preferível a uma ação errada.

## P6. Custo zero e consciente
O projeto deve rodar sem gasto: LLM com tier gratuito (ou local), busca na central de ajuda sem embeddings pagos, poucas chamadas ao modelo por turno, contexto curto, e respostas determinísticas sem LLM quando possível (ex.: confirmar rascunho por botão).

## P7. Falhas são esperadas
O sistema de chamados é instável. Toda chamada externa tem timeout, retry com backoff e idempotência em escritas; falhas viram mensagens claras para o funcionário e aparecem no trace.

## P8. Simplicidade rastreável
O código deve ser **o mais simples possível**: a menor solução que atende a spec, sem abstração especulativa. TypeScript estrito, **proibido `any`**. Testes onde mudam o resultado (regras, guardrails, autorização, resiliência), não por cobertura. Commits contam a história e citam a task da spec.

## P9. Hexagonal com portas in/out
O domínio e os casos de uso não conhecem Next.js, Mastra, Postgres nem HTTP. Casos de uso são expostos por **portas de entrada** (`ports/in`) e dependem apenas de **portas de saída** (`ports/out`). Frameworks são adapters plugados no composition root. Trocar o LLM, o banco ou o serviço de chamados não deve tocar no domínio.
