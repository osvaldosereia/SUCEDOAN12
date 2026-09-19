# HANDOFF — Customer & Marketing OS

**Leia este arquivo primeiro em qualquer nova janela/rodada.**

Projeto: **Dona Antônia — Customer & Marketing OS**. GitHub `osvaldosereia/SUCEDOAN12`; Supabase `ssbesxgaijknwsjbsbcz`. Leia também `CURRENT-STATE.md` e `AUTONOMOUS-COMPLETION-PLAN.md`. Confirme HEAD antes de editar e preserve trabalhos paralelos. Runtime Supabase-first; Make somente histórico/auditoria. Não iniciar CM-2.

## Estado canônico — 19/09/2026 ~06:16 America/Cuiaba

- **20 critérios = 15 verified / 5 implemented / 0 blocked**;
- `safe_for_internal_homologation=true`;
- `cm1_complete=false`;
- `external_activation_authorized=false`;
- external side effect=false.

Pendentes: Identity Resolver (2 conflitos humanos), Product View (`product_view=0`), Opportunity Lifecycle (75 suppressed/0 fechado), Marketing Brain SUGGEST (OFF) e AI cost (0 execução/custo).

Evidência orgânica: catalog_open=64; catalog_search=50; product_view=0; cart events=466. Próxima expiração natural `2026-09-23T17:00:15.936202+00:00`.

## Gates obrigatórios

Manter Meta Direct OFF, canonical outbound OFF, publishing OFF, strategy AI OFF, canary 0%, marketing kill switch ON e orçamento IA 0. Não testar PIN, não auto-resolver identidade, não fabricar evidência.

## Plano autônomo

- Rodadas 06–12 — concluídas;
- Rodada 13 — próxima;
- Rodada 14 — pendente.

### Rodada 12 concluída

Documento: `CM1-AUTONOMOUS-COMPLETION-ROUND-12.md`.

Marketing Brain OBSERVE/SUGGEST e custo foram esgotados tecnicamente sem IA externa. OBSERVE continua determinístico; SUGGEST fail-closed; budget/limite diário continuam zero; ledger `ai_action_executions` registra custo estimado/real com idempotência; nenhum side effect/campanha é permitido nesta etapa. Criados teste contratual e CI Round 12. Nenhuma execução real foi fabricada, portanto critérios 15/18 permanecem implemented.

## Próxima rodada — 13

**Auditoria final de segurança e legado.** Auditar automation_config sem limpeza perigosa; confirmar canonical outbound/PapoAI outbound/templates/Meta Direct/publishing OFF; bundle sem secrets; RLS/RBAC/service_role; Edge/migrations; Make não operacional. Corrigir apenas problemas seguros.

## Dependências humanas/orgânicas atuais

Revisar 2 conflitos; abrir produto real; fornecer System User token WhatsApp no Vault; diagnóstico Meta read-only autenticado; validar PIN/interface; aceitar Policy Registry; homologar callback Meta Direct; decidir sobre execução real governada de SUGGEST/IA/custo; autorizar separadamente qualquer ativação externa futura.

Ao final de cada rodada: consultar runtime, confirmar HEAD, programar/testar o máximo seguro, atualizar `CURRENT-STATE.md` e este `HANDOFF.md`, registrar documento/commit e promover critérios somente por evidência real.