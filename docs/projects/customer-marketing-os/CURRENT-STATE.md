# CURRENT STATE — Customer & Marketing OS

Snapshot canônico atualizado em **19/09/2026 ~03:16 America/Cuiaba**.

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
- **7 Product View:** collector pronto; `product_view=0`; aguarda abertura real de produto.
- **13 Opportunity Lifecycle:** 75 suppressed; dismissed=0, converted=0, expired=0; próxima expiração natural `2026-09-23T17:00:15.936202+00:00`.
- **15 Marketing Brain SUGGEST:** capacidade pronta; gate OFF; briefs=0.
- **18 AI cost measured:** ledger pronto; 0 execuções governadas e custo 0.

## Evidência real atual

- PapoAI receipts=18;
- customers=506;
- `catalog_open=64`;
- `catalog_search=50`;
- `product_view=0`;
- carrinho=466;
- pedidos=47;
- timeline=1436;
- graph edges=526;
- consentimento positivo de marketing=0.

## Runtime protegido

PapoAI inbound ativo/outbound desligado; canonical outbound=false; AI=false; auto reply=false; canary=0%; marketing enabled=false; publishing=false; kill switch=true; orçamento IA=0; efeitos externos marketing/IA 7d=0.

## Meta / WhatsApp Direct

WABA e Phone Number ID presentes; Graph API `v26.0`; Flow health separado; Meta Direct OFF; token WhatsApp read-only no Vault ausente; permissões e callback Direct unverified; `direct_ready_flag=false`.

## Plano autônomo

- Rodada 06 — concluída;
- Rodada 07 — concluída;
- Rodada 08 — concluída; CI dedicado `35426161049` confirmado SUCCESS;
- Rodada 09 — **concluída**;
- Rodada 10 — próxima;
- Rodadas 11–14 — pendentes.

### Rodada 09 — Identity Review

Documento: `CM1-AUTONOMOUS-COMPLETION-ROUND-09.md`.

A UI já exigia escolha explícita, justificativa e confirmação, mostrava dados sensíveis mascarados e declarava review-only/no-merge. Foi acrescentado ledger persistente `customer_identity_review_audit` com ACL service-role only, bloqueio de UPDATE/DELETE e trigger automático para registrar transições reais pending -> approved/rejected. Validação read-only confirmou os dois triggers ativos, anon/authenticated sem SELECT e zero registros — nenhum conflito real foi tocado.

## Próxima rodada — 10

**Comprar / Product View / Event Collector.** Provar frontend publicado, cache busting e caminho clique -> tracking -> Edge -> RPC por testes não-operacionais; cobrir deduplicação, room token, produto inexistente/reload/navegação. Não criar `product_view` artificial.

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