# CURRENT STATE — Customer & Marketing OS

Snapshot canônico atualizado em **19/09/2026 ~04:20 America/Cuiaba**.

## Estado geral

- fase: `internal_homologation`;
- critérios: **20 = 15 verified / 5 implemented / 0 blocked**;
- `ready_for_manual_canary=true`;
- `cm1_complete=false`;
- `safe_for_internal_homologation=true`;
- `external_activation_authorized=false`;
- external side effect=false.

## Cinco critérios ainda implemented

- **2 Identity Resolver:** 2 conflitos reais; revisão humana obrigatória; nenhum auto-merge.
- **7 Product View:** caminho técnico integralmente endurecido na Rodada 10; `product_view=0`; aguarda exclusivamente abertura real de produto.
- **13 Opportunity Lifecycle:** 75 suppressed; dismissed=0, converted=0, expired=0; próxima expiração natural `2026-09-23T17:00:15.936202+00:00`.
- **15 Marketing Brain SUGGEST:** capacidade pronta; gate OFF; briefs=0.
- **18 AI cost measured:** ledger pronto; 0 execuções governadas e custo 0.

## Evidência real atual

- PapoAI receipts=18;
- `catalog_open=64`;
- `catalog_search=50`;
- `product_view=0`;
- consentimento positivo de marketing=0.

## Runtime protegido

PapoAI inbound ativo/outbound desligado; canonical outbound=false; AI=false; auto reply=false; canary=0%; marketing enabled=false; publishing=false; kill switch=true; orçamento IA=0; efeitos externos marketing/IA 7d=0.

## Meta / WhatsApp Direct

WABA e Phone Number ID presentes; Graph API `v26.0`; Flow health separado; Meta Direct OFF; token WhatsApp read-only no Vault ausente; permissões e callback Direct unverified; `direct_ready_flag=false`.

## Plano autônomo

- Rodadas 06–10 — **concluídas**;
- Rodada 11 — próxima;
- Rodadas 12–14 — pendentes.

### Rodada 10 — Comprar / Product View / Event Collector

Documento: `CM1-AUTONOMOUS-COMPLETION-ROUND-10.md`.

Foi auditada a cadeia real `openDetail -> trackProductView -> productApi(track) -> shopping-chat-products-v1 -> record_catalog_interaction_v1`. Edge/RPC exigem room token/sessão válida, UUID e produto existente; dedupe Product View permanece 900 s; collector marca `external_side_effect=false`; RPC é service_role-only. O HTML versionado referencia `products.js?v=20260918-cm1-events-02`. Criados teste contratual Round 10 e CI dedicado. Nenhum evento operacional foi criado.

## Próxima rodada — 11

**Opportunity Lifecycle e observabilidade temporal.** Revisar regras suggested/suppressed/dismissed/converted/expired, testar somente com fixtures não-operacionais, validar relógio/próxima expiração e hardenizar alerta/read model de oportunidade vencida ainda aberta. Não antecipar expiração real.

## Ações humanas/orgânicas que permanecem

- revisar 2 conflitos reais de identidade;
- abrir produto real no Comprar para `product_view`;
- fornecer/configurar System User token WhatsApp no Vault;
- executar diagnóstico Meta read-only autenticado;
- validar PIN/interface no navegador;
- aceitar Policy Registry;
- homologar callback Meta Direct;
- decidir sobre execução real governada de SUGGEST/IA/custo;
- autorizar separadamente qualquer ativação externa futura.

Supabase é runtime/source of truth; Make somente histórico/auditoria. Não iniciar CM-2.