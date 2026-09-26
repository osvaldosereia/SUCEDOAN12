# Operations 2.0 — Pré-homologação · Baseline e bindings

Data: 2026-09-26

## Objetivo
Preparar Supabase -> Bling antes dos testes humanos sem executar escrita externa de preço/estoque no Bling.

## Regra transitória
Até o novo balanço físico:
- Supabase = baseline confiável para ativo, preço de venda e estoque;
- Bling = shadow para estoque;
- Bling não pode sobrescrever o estoque atual do Supabase;
- produto histórico no Bling não reativa vitrine;
- após balanço/homologação, Bling poderá assumir autoridade definitiva de estoque.

## Implementado
Migration `ops2_catalog_baseline_and_dry_run_v1`:
- `ops2_catalog_baseline_runs`;
- `ops2_catalog_baseline_items`;
- `ops2_catalog_sync_plan_items`;
- captura imutável por run;
- dry-run de estoque com before/desired;
- resumo por estado;
- RLS e sem grants anon/authenticated.

Run capturado:
`9db0ee8c-6954-4b21-8a54-4a273a9ce069`

Resultado:
- 1.630 ativos snapshotados;
- 1.630 identidades únicas do mirror;
- 539 stock_update planejados;
- 1.091 noop;
- 0 bloqueados;
- nenhuma escrita externa no Bling.

Migration `ops2_materialize_verified_catalog_bindings_v1`:
- gate de identidade única;
- aborta em conflito;
- materializa somente vínculo já provado pelo mirror;
- registra evento idempotente em `bling_product_binding_events`.

Resultado:
- 1.630/1.630 ativos com bling_product_id;
- 1.630 IDs Bling distintos;
- 1.630 eventos de binding;
- preço e estoque não alterados.

## Próximo bloco autônomo
1. preparar executor canário explícito, sem habilitar batch global;
2. separar stock/price/status em operações independentes;
3. reconciliar resposta Bling pós-write;
4. integrar estados à observabilidade;
5. classificar Edge Functions históricas por referência/risco;
6. somente depois avaliar primeiro canário externo.

## Rollback
O snapshot preserva o estado pré-sync. A materialização de binding é auditável pelo external_key do run. Nenhuma alteração de estoque/preço externo foi feita nesta rodada.
