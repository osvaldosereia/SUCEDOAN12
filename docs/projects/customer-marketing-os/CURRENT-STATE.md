# CURRENT STATE — Customer & Marketing OS

Snapshot canônico atualizado em **19/09/2026 ~07:13 America/Cuiaba**.

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
- **7 Product View:** caminho técnico endurecido; `product_view=0`; aguarda abertura real.
- **13 Opportunity Lifecycle:** 75 suppressed e 0 terminal; próxima expiração natural `2026-09-23T17:00:15.936202+00:00`.
- **15 Marketing Brain SUGGEST:** capacidade pronta; gate OFF; briefs=0.
- **18 AI cost measured:** ledger/idempotência prontos; 0 execuções governadas e custo 0.

## Evidência real atual

- PapoAI receipts=18;
- `catalog_open=64`;
- `catalog_search=50`;
- `product_view=0`;
- cart events=466;
- orders=47;
- consentimento positivo de marketing=0.

## Runtime protegido

PapoAI inbound ativo/outbound desligado; canonical outbound=false; AI=false; auto reply=false; canary=0%; Meta Direct=false; marketing enabled=false; publishing=false; runtime templates=0; kill switch=true; orçamento IA=0; efeitos externos marketing/IA 7d=0.

`automation_config` ainda possui flags legadas outbound/live, mantidas sem mutação porque os gates canônicos fechados são autoritativos; readiness expõe isso apenas como warning informacional.

## Plano autônomo

- Rodadas 06–13 — **concluídas**;
- Rodada 14 — próxima/final.

### Rodada 13 — auditoria final de segurança e legado

Documento: `CM1-AUTONOMOUS-COMPLETION-ROUND-13.md`.

Revalidados gates canônicos, PapoAI outbound OFF, Meta Direct OFF, publishing OFF, templates runtime=0, side effects=0, RLS em configurações sensíveis e grants dos RPCs canônicos restritos a `postgres/service_role`. Busca de código não encontrou dependência operacional Make nem evidência de service-role secret literal em frontend. Nenhuma limpeza perigosa do legado foi feita.

## Próxima rodada — 14

Freeze da programação autônoma e pacote final: reexecutar checklist/readiness/evidence, consolidar CI/estado, criar `HUMAN-ACTIONS-FINAL.md` e `FINAL-AUTONOMOUS-CHECKLIST.md`, atualizar docs canônicos e não declarar CM-1 concluída enquanto faltarem evidências/gates.

## Ações humanas/orgânicas que permanecem

Revisar 2 conflitos; abrir produto real; fornecer System User token WhatsApp no Vault; diagnóstico Meta read-only autenticado; validar PIN/interface; aceitar Policy Registry; homologar callback Meta Direct; decidir sobre execução real governada de SUGGEST/IA/custo; autorizar separadamente qualquer ativação externa futura.

Supabase é runtime/source of truth; Make somente histórico/auditoria. Não iniciar CM-2.