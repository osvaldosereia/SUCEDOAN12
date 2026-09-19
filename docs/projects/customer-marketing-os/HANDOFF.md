# HANDOFF — Customer & Marketing OS

**Leia este arquivo primeiro em qualquer nova janela/rodada.**

Projeto: **Dona Antônia — Customer & Marketing OS**. GitHub `osvaldosereia/SUCEDOAN12`; Supabase `ssbesxgaijknwsjbsbcz`. Leia também `CURRENT-STATE.md` e `AUTONOMOUS-COMPLETION-PLAN.md`. Confirme HEAD antes de editar e preserve trabalhos paralelos. Runtime Supabase-first; Make somente histórico/auditoria. Não iniciar CM-2.

## Estado canônico — 19/09/2026 ~07:13 America/Cuiaba

- **20 critérios = 15 verified / 5 implemented / 0 blocked**;
- `safe_for_internal_homologation=true`;
- `cm1_complete=false`;
- `external_activation_authorized=false`;
- external side effect=false.

Pendentes: Identity Resolver (2 conflitos humanos), Product View (`product_view=0`), Opportunity Lifecycle (75 suppressed/0 fechado), Marketing Brain SUGGEST (OFF) e AI cost (0 execução/custo).

Evidência orgânica: PapoAI receipts=18; catalog_open=64; catalog_search=50; product_view=0; cart=466; orders=47. Próxima expiração natural `2026-09-23T17:00:15.936202+00:00`.

## Gates obrigatórios

Manter Meta Direct OFF, canonical outbound OFF, publishing OFF, strategy AI OFF, canary 0%, marketing kill switch ON e orçamento IA 0. Não testar PIN, não auto-resolver identidade, não fabricar evidência.

## Plano autônomo

- Rodadas 06–13 — concluídas;
- Rodada 14 — próxima/final.

### Rodada 13 concluída

Documento: `CM1-AUTONOMOUS-COMPLETION-ROUND-13.md`.

Auditoria final de segurança/legado confirmou: canonical outbound OFF; PapoAI outbound disabled; Meta Direct OFF; publishing OFF; templates runtime=0; side effects=0; configurações sensíveis auditadas com RLS; RPCs canônicos executáveis apenas por postgres/service_role; sem evidência de service-role secret literal em frontend; sem dependência operacional Make encontrada. `automation_config` legado outbound/live foi preservado atrás dos gates canônicos e permanece warning, sem limpeza perigosa.

## Próxima rodada — 14

**Freeze autônomo e pacote final.** Reexecutar RPCs/CI conhecido, criar `HUMAN-ACTIONS-FINAL.md` e `FINAL-AUTONOMOUS-CHECKLIST.md`, consolidar CURRENT-STATE/HANDOFF e então limitar rodadas futuras a observação read-only até surgirem evidências reais ou ações humanas.

## Dependências humanas/orgânicas atuais

Revisar 2 conflitos; abrir produto real; fornecer System User token WhatsApp no Vault; diagnóstico Meta read-only autenticado; validar PIN/interface; aceitar Policy Registry; homologar callback Meta Direct; decidir sobre execução real governada de SUGGEST/IA/custo; autorizar separadamente qualquer ativação externa futura.

Ao final da Rodada 14, não inventar trabalho nem CM-2: somente observar novas evidências reais, regressões e segurança.