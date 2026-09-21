# Supabase Only — Current State

Data do checkpoint: 2026-09-21
Branch: `supabase-only-admin-migration-20260921`
Rodada atual: R1 DONE → próxima R2

## Estado geral

Migração controlada para Supabase-only em andamento. Firebase ainda NÃO deve ser desligado fisicamente porque Cadastro rápido, Cestas/Kits e outros legados Dona Antônia ainda precisam ser migrados.

## Automações Supabase

Estado solicitado pelo proprietário: PAUSADAS.

- pg_cron: 0 ativos / 9 preservados;
- dispatch automático de ai_jobs: pausado;
- dispatch automático de outbound_jobs/WhatsApp: pausado;
- fila automática de pedido → Bling: pausada;
- fila automática de pedido → outbound: pausada;
- automation_config: automation OFF / AI OFF / outbound OFF / WhatsApp inbound OFF / auto reply OFF / canary 0;
- Agent Core: OFF;
- Service Simple automático: OFF;
- product_image_automation_settings: OFF;
- automation_workflows: OFF + kill switch ON.

Gatilhos internos de integridade, segurança, auditoria e updated_at permanecem ativos.

## Concluído na Rodada 1

- auditoria real de GitHub + Supabase;
- `public.products` definido como fonte única operacional;
- backfill seguro de gôndola/prateleira e fonte de imagem a partir do histórico já armazenado no Supabase;
- `inventory-fast-balance-v3` convertido para busca Supabase-only na branch;
- `inventory-fast-v1` convertido para busca Supabase-only na branch;
- resolver de fontes do Grid18 convertido para fontes Supabase/cache local, sem chamada live Firebase;
- worker individual `product-image-openai-v2` convertido sem consulta live Firebase;
- Grid18 não usa Firebase para decidir ativo/inativo;
- `admin-products-live-v1` ampliada como API administrativa segura e consolidada;
- cliente compartilhado `admin-secure-api-v1.js` criado;
- Validades convertida para Supabase autenticado;
- Cestas mobile agora carregam catálogo de produtos pela API segura do Supabase;
- Kits mobile e fila de Instagram agora carregam catálogo de produtos pelo Supabase;
- backend Supabase-only publicado em produção: `inventory-fast-v1` v7, `inventory-fast-balance-v3` v9, `admin-products-live-v1` v7, `product-image-openai-v2` v4 e `product-image-openai-grid18-v1` v16;
- um job outbound antigo preso em `processing` foi cancelado de forma auditável; filas abertas agora = 0;
- contratos anti-regressão Firebase adicionados;
- plano de 4 rodadas e log de execução criados.

## Inventário auditado

- 1.814 produtos;
- 1.673 ativos;
- 1.479 fisicamente verificados;
- 1.746 ainda guardam `firebase_key`/snapshot histórico;
- após backfill: 674 produtos com gôndola e 670 com prateleira em colunas canônicas;
- 1.777 produtos com `image_source_url`;
- 288 tabelas públicas;
- 979 funções SQL públicas;
- 100 Edge Functions ativas;
- 9 pg_cron preservados, todos inativos;
- bucket `product-image-batches`: ~1,09 GB / 7.650 objetos.

## Segurança / performance

Pendências detectadas:
- 1 função com search_path mutável;
- 1 SECURITY DEFINER executável por anon;
- 4 SECURITY DEFINER executáveis por authenticated;
- leaked-password protection desativada;
- 6 pares de índices duplicados;
- 189 FKs sem índice;
- 130 índices sem uso observado.

Nenhuma remoção em massa de tabela, função ou índice foi feita.

## Próxima execução — R2

1. migrar Cadastro rápido para Supabase-only e retirar Make/Firebase do runtime;
2. concluir persistência canônica das Cestas em `basket_templates` / `basket_template_items`;
3. concluir persistência canônica dos Kits no Supabase e retirar dependências GitHub/Make que ainda forem runtime;
4. preservar UX móvel e autenticação;
5. ampliar contracts zero-Firebase desses três módulos;
6. atualizar este checkpoint e EXECUTION-LOG.
