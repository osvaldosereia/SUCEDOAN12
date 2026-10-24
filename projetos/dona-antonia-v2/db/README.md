# Persistência V2

O SQL que existia em `001_schema.sql` a `004_bling_product_profiles.sql` era um conjunto de propostas,
sem histórico de aplicação e sem teste de replay. Foi substituído pelas migrações versionadas e
ordenadas em `supabase/migrations/`. Não mantenha uma segunda cópia executável do schema nesta pasta.

Para validar em ambiente descartável, use `npm run test:db`. O teste inicia PostgreSQL WASM em memória,
cria papéis efêmeros, aplica toda a cadeia e encerra o banco sem conexão de rede ou persistência.

Nenhuma migração foi aplicada a um Supabase remoto nesta rodada. `supabase db reset` é destrutivo e só
pode ser usado em um projeto local descartável. Antes de homologar em um projeto remoto isolado, definir
RBAC/RLS, validar restore de backup e registrar o projeto-alvo; os bancos legados são proibidos.
