# CURRENT STATE — Customer & Marketing OS

Snapshot canônico atualizado em **19/09/2026 ~01:14 America/Cuiaba**.

## Estado geral

- fase: `internal_homologation`;
- CM-0 e CM-1.1 a CM-1.15 implementadas;
- critérios: **20 = 15 verified / 5 implemented / 0 blocked**;
- `ready_for_manual_canary=true`;
- `cm1_complete=false`;
- `safe_for_internal_homologation=true`;
- `external_activation_authorized=false`;
- external side effect=false.

## Cinco critérios ainda implemented

- **2 Identity Resolver:** 2 conflitos reais; revisão humana obrigatória; nenhum auto-merge.
- **7 Product View:** collector pronto; `product_view=0`; aguarda abertura real de produto.
- **13 Opportunity Lifecycle:** 75 oportunidades suppressed; dismissed=0, converted=0, expired=0; próxima expiração natural `2026-09-23T17:00:15.936202+00:00`.
- **15 Marketing Brain SUGGEST:** capacidade pronta; gate OFF; briefs=0.
- **18 AI cost measured:** ledger pronto; 0 execuções governadas e custo 0.

## Evidência real atual

- PapoAI receipts=18;
- customers=506;
- `catalog_open=64`;
- `catalog_search=31` — critério 6 verified por tráfego real;
- `product_view=0`;
- carrinho=437;
- pedidos=47;
- timeline=1388;
- customer_product_stats=699;
- graph edges=526;
- marketing events=144;
- consentimento positivo de marketing=0.

## Runtime protegido

- provider canônico: PapoAI inbound ativo / outbound desligado;
- canonical outbound=false;
- AI=false;
- auto reply=false;
- canary=0%;
- marketing enabled=false / publishing=false / kill switch=true;
- max daily publications=0;
- max daily AI cost=0;
- external effects marketing 7d=0;
- external effects AI 7d=0.

## Meta / WhatsApp Direct

- WABA e Phone Number ID presentes;
- Graph API `v26.0`;
- Flow health funciona separadamente;
- Meta Direct OFF / release_mode=off;
- token `dona_antonia_whatsapp_access_token_v1` no Vault: ausente;
- permissões WhatsApp: unverified;
- callback específico Meta Direct: unverified;
- `direct_ready_flag=false`;
- blockers: `permissions_unverified_or_blocking`, `webhook_not_verified`, `direct_ready_flag_false`.

## Warnings / gates humanos

Warnings: `identity_conflicts_pending`, `no_positive_marketing_consent`, `legacy_automation_outbound_live_but_canonical_gate_closed`.

Gates manuais: Customer OS PIN browser validation, Relationship Center PIN browser validation, Meta Policy Registry verification, Meta Direct homologation e external activation authorization. PIN não deve ser descoberto/testado automaticamente.

## Rodada 07 — concluída

Documento: `CM1-AUTONOMOUS-COMPLETION-ROUND-07.md`.

Hardening da Central entregue sem PIN e sem side effect:
- módulo progressivo `relationship-homologation-hardening.js` e CSS isolado;
- critérios implemented passam a indicar visualmente **Ação humana** ou **Evidência real**;
- Meta preflight explicita que o diagnóstico é somente leitura e não autoriza ativação;
- tabs/tabpanel ARIA, `aria-selected`, live regions, foco visível e ajustes mobile;
- contrato `test-cm-1-relationship-hardening-v1.mjs`;
- workflow dedicado `Customer OS · Relationship Hardening`, run inicial `35423379708`, ainda em progresso no último check desta rodada.

HEAD antes da programação: `106cc4589ba1a43a99f1e2d15c6403778de8e67c`, pertencente a trabalho paralelo de vídeo; preservado.

## Plano autônomo

- Rodada 06 — concluída;
- Rodada 07 — **concluída**;
- Rodada 08 — próxima: Meta Direct preflight completo sem credencial humana;
- Rodadas 09–14 — pendentes conforme `AUTONOMOUS-COMPLETION-PLAN.md`.

## Ações humanas/orgânicas que permanecem

- revisar 2 conflitos reais de identidade;
- abrir produto real no Comprar para `product_view`;
- fornecer/configurar System User token WhatsApp no Vault;
- executar diagnóstico Meta read-only autenticado;
- validar PIN/interface no navegador;
- aceitar Policy Registry como gate humano;
- homologar callback Meta Direct;
- decidir futuramente sobre execução real governada de SUGGEST/IA/custo;
- autorizar separadamente qualquer ativação externa futura.

Supabase é runtime/source of truth; Make somente histórico/auditoria. Não iniciar CM-2 antes do encerramento correto da CM-1.
