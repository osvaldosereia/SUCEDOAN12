# HANDOFF — Customer & Marketing OS

**Leia este arquivo primeiro em qualquer nova janela/rodada.**

Projeto: **Dona Antônia — Customer & Marketing OS**. GitHub `osvaldosereia/SUCEDOAN12`; Supabase `ssbesxgaijknwsjbsbcz`. Leia também `CURRENT-STATE.md` e `AUTONOMOUS-COMPLETION-PLAN.md`. Confirme HEAD antes de editar e preserve trabalhos paralelos. Runtime Supabase-first; Make somente histórico/auditoria. Não iniciar CM-2.

## Estado canônico — 19/09/2026 ~05:14 America/Cuiaba

- **20 critérios = 15 verified / 5 implemented / 0 blocked**;
- `safe_for_internal_homologation=true`;
- `cm1_complete=false`;
- `external_activation_authorized=false`;
- external side effect=false.

Pendentes: Identity Resolver (2 conflitos humanos), Product View (`product_view=0`), Opportunity Lifecycle (75 suppressed/0 fechado), Marketing Brain SUGGEST (OFF) e AI cost (0 execução/custo).

Evidência orgânica revalidada: catalog_open=64; catalog_search=50; product_view=0. Opportunity observer: `clock_expired_still_open=0`; próxima expiração natural `2026-09-23T17:00:15.936202+00:00`.

## Gates obrigatórios

Manter Meta Direct OFF, canonical outbound OFF, publishing OFF, strategy AI OFF, canary 0%, marketing kill switch ON e orçamento IA 0. Não testar PIN, não auto-resolver identidade, não fabricar evidência.

Meta: Graph API v26.0; Flow health separado; token WhatsApp read-only no Vault ausente; permissões/callback Direct não verificados; direct_ready_flag=false.

## Plano autônomo

- Rodadas 06–11 — concluídas;
- Rodada 12 — próxima;
- Rodadas 13–14 — pendentes.

### Rodada 11 concluída

Documento: `CM1-AUTONOMOUS-COMPLETION-ROUND-11.md`.

Entregue sem alterar oportunidade real:
- cinco estados lifecycle auditados;
- expiração confirmada apenas quando `expires_at <= now()` e somente para estados abertos;
- observer já expõe próxima expiração, vencido-ainda-aberto e fechamento observado;
- acceptance checklist só promove critério 13 com terminal persistido real;
- criado `scripts/test-cm-1-opportunity-lifecycle-round11.mjs`;
- criado CI `.github/workflows/customer-os-opportunity-lifecycle-round11.yml`.

## Próxima rodada — 12

**Marketing Brain e custo de IA sem ativar IA externa.** Validar OBSERVE/SUGGEST por contrato/mocks, budget, limite diário, kill switch, idempotência e ledger de custo. Manter `strategy_ai_enabled=false`, `max_daily_calls=0`, budget=0 e nenhuma chamada OpenAI/IA externa.

## Dependências humanas/orgânicas atuais

Revisar 2 conflitos; abrir produto real; fornecer System User token WhatsApp no Vault; executar diagnóstico Meta read-only autenticado; validar PIN/interface; aceitar Policy Registry; homologar callback Meta Direct; decidir sobre execução real governada de SUGGEST/IA/custo; autorizar separadamente qualquer ativação externa futura.

Ao final de cada rodada: consultar runtime, confirmar HEAD, programar/testar o máximo seguro, atualizar `CURRENT-STATE.md` e este `HANDOFF.md`, registrar documento/commit e promover critérios somente por evidência real.