# HANDOFF — Customer & Marketing OS

**Leia este arquivo primeiro em qualquer nova janela/rodada.**

Projeto: **Dona Antônia — Customer & Marketing OS**. GitHub `osvaldosereia/SUCEDOAN12`; Supabase `ssbesxgaijknwsjbsbcz`. Leia também `CURRENT-STATE.md` e `AUTONOMOUS-COMPLETION-PLAN.md`. Confirme HEAD antes de editar e preserve trabalhos paralelos. Runtime Supabase-first; Make somente histórico/auditoria. Não iniciar CM-2.

## Estado canônico — 19/09/2026 ~04:20 America/Cuiaba

- **20 critérios = 15 verified / 5 implemented / 0 blocked**;
- `safe_for_internal_homologation=true`;
- `cm1_complete=false`;
- `external_activation_authorized=false`;
- external side effect=false.

Pendentes: Identity Resolver (2 conflitos humanos), Product View (`product_view=0`), Opportunity Lifecycle (75 suppressed/0 fechado), Marketing Brain SUGGEST (OFF) e AI cost (0 execução/custo).

Evidência orgânica revalidada: catalog_open=64; catalog_search=50; product_view=0. Próxima expiração natural de oportunidade: `2026-09-23T17:00:15.936202+00:00`.

## Gates obrigatórios

Manter Meta Direct OFF, canonical outbound OFF, publishing OFF, strategy AI OFF, canary 0%, marketing kill switch ON e orçamento IA 0. Não testar PIN, não auto-resolver identidade, não fabricar evidência.

Meta: Graph API v26.0; Flow health separado; token WhatsApp read-only no Vault ausente; permissões/callback Direct não verificados; direct_ready_flag=false.

## Plano autônomo

- Rodadas 06–10 — concluídas;
- Rodada 11 — próxima;
- Rodadas 12–14 — pendentes.

### Rodada 10 concluída

Documento: `CM1-AUTONOMOUS-COMPLETION-ROUND-10.md`.

Entregue sem criar `product_view` operacional:
- cadeia `openDetail -> trackProductView -> productApi(track) -> Edge -> RPC` auditada;
- room token/sessão ativa, UUID e produto existente validados server-side;
- dedupe Product View de 900 s confirmado para reload/reabertura/navegação;
- RPC service_role-only e `external_side_effect=false`;
- cache busting versionado `products.js?v=20260918-cm1-events-02` confirmado no HTML;
- criado `scripts/test-cm-1-product-view-round10.mjs`;
- criado CI `.github/workflows/customer-os-product-view-round10.yml`.

A consulta HTTP pública externa do asset não ficou disponível pelo navegador de pesquisa desta execução; não foi usada como justificativa para gerar evento. O artefato versionado no repositório está comprovado e o critério 7 continua aguardando abertura real.

## Próxima rodada — 11

**Opportunity Lifecycle e observabilidade temporal.** Revisar estados suggested/suppressed/dismissed/converted/expired, testar somente de forma não-operacional, validar relógio/próxima expiração, hardenizar read model/alerta de oportunidade vencida ainda aberta e garantir que critério 13 só promova por estado real persistido. Não antecipar expiração real.

## Dependências humanas/orgânicas atuais

Revisar 2 conflitos; abrir produto real; fornecer System User token WhatsApp no Vault; executar diagnóstico Meta read-only autenticado; validar PIN/interface; aceitar Policy Registry; homologar callback Meta Direct; decidir sobre execução real governada de SUGGEST/IA/custo; autorizar separadamente qualquer ativação externa futura.

Ao final de cada rodada: consultar runtime, confirmar HEAD, programar/testar o máximo seguro, atualizar `CURRENT-STATE.md` e este `HANDOFF.md`, registrar documento/commit e promover critérios somente por evidência real.