# Dona Antônia — PapoAI Commerce OS

## Papel do projeto

Este projeto concentra a integração comercial entre PapoAI e o cérebro próprio da Dona Antônia.

- **PapoAI:** transporte WhatsApp, inbox, CRM, handoff e recursos operacionais.
- **Supabase:** fonte de verdade comercial, identidade, estado, regras e orquestração.
- **OpenAI:** interpretação e linguagem somente nas fases posteriores, nunca autoridade de preço, estoque, cálculo ou pedido.
- **Bling:** downstream de ERP.
- **Make:** não é dependência deste projeto.

O projeto é separado do **Customer & Marketing OS**. Reutiliza seus componentes canônicos de identidade/eventos, mas não altera os gates congelados daquele projeto.

## Evidência de capacidades

Capacidades específicas do PapoAI são registradas em `channel_provider_capability_evidence`.

O `CAPABILITY_REGISTRY` genérico de canal descreve o que o WhatsApp pode renderizar em tese. Ele **não prova** que o provider PapoAI expõe aquele recurso. Uma capacidade do PapoAI só é liberada depois de evidência do provider.

Estados: `unknown`, `observed_ui`, `observed_payload`, `verified_lab`, `verified_production`, `unsupported`, `manual_setup_required`.

## Fase atual

**R0-A — Agent External Lab.**

Objetivo único: provar PapoAI → Edge Function → resposta PapoAI sem IA comercial e sem qualquer efeito comercial.

Pontos de entrada:
1. `CURRENT-STATE.md`
2. `R0-A-AGENT-EXTERNAL-RUNBOOK.md`
3. `../../superpowers/specs/2026-09-21-papoai-commerce-os-r0a-agent-external-design.md`
4. `../../superpowers/plans/2026-09-21-papoai-commerce-os-r0a-agent-external.md`
