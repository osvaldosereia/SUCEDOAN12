# Retrato do banco de produção

Estrutura do banco do projeto `ssbesxgaijknwsjbsbcz` exportada em 28/11/2026. Não contém dados de clientes, pedidos ou produtos.

O histórico do Supabase tem 1.355 migrações e o repositório tem 76, então as migrações sozinhas não recriam o banco. Esta pasta é a referência do que está realmente em produção.

## Conteúdo

| Pasta | O que tem |
|---|---|
| `public/`, `private/`, `whatsapp_atendimento/`, `whatsapp_ordering_private/` | Tabelas, chaves, índices, views, funções SQL, triggers, políticas RLS e permissões |
| `cron/` | Rotinas agendadas (`cron.job`), inclusive as desligadas |
| `storage/` | Buckets e políticas do Storage |
| `extensions/` | Extensões do Postgres |

Os arquivos são numerados na ordem de criação: tipos e sequências, tabelas, chaves estrangeiras, índices, views, funções, triggers, políticas e permissões. As permissões aparecem como comentário (`-- acl`) no formato do Postgres.

## Como atualizar

1. Rode `scripts/schema-export/export-schema.sql` no SQL Editor do Supabase (ou pelo conector) e salve a saída JSON.
2. Rode `python3 scripts/schema-export/write-schema.py <saida.json>`.
3. Confira o `git diff` antes de commitar: ele mostra exatamente o que mudou no banco.

O script substitui tokens que pareçam segredos por `<REDACTED>`. Os segredos ficam no Vault do Supabase e não são exportados.
