# HANDOFF — Customer & Marketing OS

**Leia este arquivo primeiro em qualquer nova janela/rodada.**

Projeto: **Dona Antônia — Customer & Marketing OS**. GitHub `osvaldosereia/SUCEDOAN12`; Supabase `ssbesxgaijknwsjbsbcz`. Leia também `CURRENT-STATE.md` e `AUTONOMOUS-COMPLETION-PLAN.md`. Confirme HEAD antes de editar e preserve trabalhos paralelos. Runtime Supabase-first; Make somente histórico/auditoria. Não iniciar CM-2.

## Estado canônico — 19/09/2026 ~03:16 America/Cuiaba

- **20 critérios = 15 verified / 5 implemented / 0 blocked**;
- `safe_for_internal_homologation=true`;
- `cm1_complete=false`;
- `external_activation_authorized=false`;
- external side effect=false.

Pendentes: Identity Resolver (2 conflitos humanos), Product View (`product_view=0`), Opportunity Lifecycle (75 suppressed/0 fechado), Marketing Brain SUGGEST (OFF) e AI cost (0 execução/custo).

Evidência orgânica atual: receipts=18; catalog_open=64; catalog_search=50; product_view=0; carrinho=466; pedidos=47; timeline=1436.

## Gates obrigatórios

Manter Meta Direct OFF, canonical outbound OFF, publishing OFF, strategy AI OFF, canary 0%, marketing kill switch ON e orçamento IA 0. Não testar PIN, não auto-resolver identidade, não fabricar evidência.

Meta: WABA + Phone Number ID presentes; Graph API v26.0; Flow health separado; token WhatsApp read-only no Vault ausente; permissões/callback Direct não verificados; direct_ready_flag=false.

## Plano autônomo

- Rodadas 06–09 — concluídas;
- Rodada 10 — próxima;
- Rodadas 11–14 — pendentes.

### Rodada 09 concluída

Documento: `CM1-AUTONOMOUS-COMPLETION-ROUND-09.md`.

Entregue sem tocar nos 2 casos reais:
- CI Meta da Rodada 08 `35426161049` confirmado SUCCESS;
- revisão da UI: escolha explícita, justificativa, confirmação, mascaramento visual e aviso no-merge já presentes;
- ledger `customer_identity_review_audit` criado no Supabase;
- anon/authenticated sem acesso; service_role only;
- UPDATE/DELETE bloqueados por trigger append-only;
- toda transição real pending -> approved/rejected passa a gerar auditoria automaticamente;
- RPC transacional preparado para evolução segura;
- validação read-only: 0 registros de auditoria, ambos triggers ativos; portanto nenhum conflito real foi decidido.

## Próxima rodada — 10

**Comprar / Product View / Event Collector.**

1. confirmar HEAD e preservar paralelo;
2. reexecutar RPCs canônicos;
3. provar asset/frontend publicado e cache busting;
4. validar caminho clique -> trackProductView -> Edge -> RPC sem criar evento real artificial;
5. cobrir deduplicação, room token, produto inexistente, reload e navegação;
6. confirmar que critério 7 passa a depender exclusivamente de abertura real de produto.

## Dependências humanas/orgânicas atuais

Revisar 2 conflitos; abrir produto real; fornecer System User token WhatsApp no Vault; executar diagnóstico Meta read-only autenticado; validar PIN/interface; aceitar Policy Registry; homologar callback Meta Direct; decidir sobre execução real governada de SUGGEST/IA/custo; autorizar separadamente qualquer ativação externa futura.

Ao final de cada rodada: consultar runtime, confirmar HEAD, programar/testar o máximo seguro, atualizar `CURRENT-STATE.md` e este `HANDOFF.md`, registrar documento/commit e promover critérios somente por evidência real.