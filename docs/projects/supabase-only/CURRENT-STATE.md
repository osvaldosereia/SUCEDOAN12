# Supabase Only — Current State

Data do checkpoint: 2026-09-21

## Estado geral

Migração em andamento. Firebase ainda NÃO pode ser desligado fisicamente porque algumas telas legadas continuam dependentes.

## Concluído nesta fase

- auditoria real de GitHub + Supabase;
- `public.products` definido como fonte única operacional;
- backfill seguro de gôndola/prateleira e fonte de imagem a partir do histórico já armazenado no Supabase;
- `inventory-fast-balance-v3` convertido para busca Supabase-only na branch;
- `inventory-fast-v1` convertido para busca Supabase-only na branch;
- resolver de fontes do Grid18 convertido para fontes Supabase/cache local, sem chamada Firebase;
- worker individual `product-image-openai-v2` preparado sem consulta Firebase;
- worker Grid18 em conversão para retirar autoridade Firebase.

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
- 9 cron jobs ativos;
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

Nenhuma remoção em massa de índice/tabela foi feita.

## Próxima sequência

1. concluir e validar workers de imagem Supabase-only;
2. migrar Validades;
3. migrar Cadastro rápido;
4. migrar Cestas rápidas;
5. migrar Kits;
6. retirar workflows/secrets Firebase;
7. otimizar storage/cron/índices e segurança;
8. executar auditoria final zero-Firebase;
9. ação humana: desligar Firebase.
