# Specs — Nexo Assist

Este projeto é desenvolvido com **Spec-Driven Development (SDD)**: nenhuma linha de código de produto é escrita sem uma especificação que a justifique, e toda especificação tem um critério de aceite verificável.

## Fluxo

```
constitution.md  →  requirements.md  →  design.md  →  tasks.md  →  código + testes
   (princípios)      (o quê / aceite)    (como)        (ordem)       (rastreável)
```

1. **Constitution**: princípios inegociáveis que guiam todas as decisões.
2. **Requirements**: histórias do PRD convertidas em requisitos numerados (`REQ-*`, `GR-*`, `NFR-*`) no formato EARS, cada um com critério de aceite.
3. **Design**: arquitetura, contratos (APIs, schemas), máquina de estados, fluxo de decisão do agent e guardrails. Cada decisão referencia os requisitos que atende.
4. **Tasks**: plano incremental. Cada task lista os requisitos que cobre e como é verificada (teste unitário, teste de integração, eval ou verificação manual).

## Regras de rastreabilidade

- Todo commit referencia a task: `feat(agent): T4.3 tool de rascunho de chamado`.
- Testes citam o requisito no nome: `it('REQ-OPEN-04: não cria chamado sem confirmação', ...)`.
- Mudou o comportamento? Atualize a spec **antes** do código, no mesmo PR/commit.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| [constitution.md](constitution.md) | Princípios do projeto |
| [requirements.md](requirements.md) | Requisitos funcionais, guardrails e não funcionais |
| [design.md](design.md) | Arquitetura e decisões técnicas |
| [tasks.md](tasks.md) | Plano de implementação rastreável |
| [../docs/prototype/](../docs/prototype/) | Capturas do protótipo (Anexo C) |
