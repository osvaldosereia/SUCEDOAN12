# CURRENT STATE — Customer & Marketing OS

Snapshot canônico atualizado em **19/09/2026 ~02:16 America/Cuiaba**.

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
- `catalog_search=31`;
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

## Rodada 08 — concluída tecnicamente

Documento: `CM1-AUTONOMOUS-COMPLETION-ROUND-08.md`.

Entregue:
- confirmação do CI da Rodada 07: run `35423379708` SUCCESS;
- auditoria completa do contrato `meta_diagnostics_readonly`;
- confirmação de GET-only, scopes obrigatórios, callback exato, separação Flow health/Direct e ausência de mutação de gates;
- novo contrato `scripts/test-cm-1-meta-preflight-fail-closed-v2.mjs`;
- novo workflow `.github/workflows/test-customer-os-meta-preflight.yml`;
- run inicial `35426161049` disparado e ainda `in_progress` no último check.

Nenhuma Edge Function precisou ser alterada/deployada nesta rodada: o runtime já possuía o comportamento seguro requerido. A mudança foi hardening de teste/CI e documentação.

## Plano autônomo

- Rodada 06 — concluída;
- Rodada 07 — concluída;
- Rodada 08 — **concluída tecnicamente; confirmar CI dedicado no início da próxima rodada**;
- Rodada 09 — próxima: Identity Review, preparação final humana;
- Rodadas 10–14 — pendentes conforme `AUTONOMOUS-COMPLETION-PLAN.md`.

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
