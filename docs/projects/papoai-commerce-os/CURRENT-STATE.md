# PapoAI Commerce OS — Current State

Atualizado: 2026-09-21

## Estado

- fase: `r0a_lab_ready_for_deploy`
- projeto Supabase: `ssbesxgaijknwsjbsbcz`
- branch GitHub: `papoai-commerce-os-r0a-spec-20260921`
- efeitos externos comerciais: **false**
- lab: **desabilitado por padrão**
- OpenAI: **off na R0-A**
- pedidos: **off**
- Bling: **off**
- marketing/campanhas/templates: **off**
- Meta Direct: **não alterado**
- PapoAI outbound canônico: **não alterado/desabilitado**

## Capacidades iniciais

- `agent_external.request`: `observed_ui` — a interface do PapoAI mostra Agente Externo por endpoint HTTPS.
- todas as demais capacidades do Agente Externo: `unknown` até prova física.
- CRUD administrativo de campanha, automação, funil e definições de etiqueta: `unknown`.

## Próximo gate

Aplicar a migration e deployar `papoai-agent-external-lab-v1` dormente. Depois configurar um Agente Externo isolado no PapoAI e fazer a prova física.

Nenhuma capacidade será marcada `verified_lab` por inferência.
