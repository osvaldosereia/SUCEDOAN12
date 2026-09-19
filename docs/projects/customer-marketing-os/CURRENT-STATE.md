# CURRENT STATE — Customer & Marketing OS

Snapshot canônico atualizado em **19/09/2026 ~05:14 America/Cuiaba**.

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
- **13 Opportunity Lifecycle:** Rodada 11 tecnicamente esgotada; 75 suppressed, dismissed=0, converted=0, expired=0, `clock_expired_still_open=0`; próxima expiração natural `2026-09-23T17:00:15.936202+00:00`.
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

- Rodadas 06–11 — **concluídas**;
- Rodada 12 — próxima;
- Rodadas 13–14 — pendentes.

### Rodada 11 — Opportunity Lifecycle

Documento: `CM1-AUTONOMOUS-COMPLETION-ROUND-11.md`.

Os RPCs canônicos foram reexecutados. A engine foi auditada nos cinco estados e a observabilidade temporal já expõe `next_expiry_at`, `clock_expired_still_open` e `lifecycle_closed_observed`. O critério 13 só promove com estado terminal real persistido. Criados teste contratual Round 11 e CI dedicado. Nenhuma oportunidade operacional foi alterada.

## Próxima rodada — 12

**Marketing Brain e custo de IA sem ativar IA externa.** Validar OBSERVE/SUGGEST, budget, limite diário, kill switch, idempotência e ledger por contratos/mocks/fixtures não-operacionais. Manter `strategy_ai_enabled=false`, limites e orçamento em zero e não chamar IA externa.

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