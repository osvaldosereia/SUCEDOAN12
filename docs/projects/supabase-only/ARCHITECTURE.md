# Dona Antônia — Supabase Only Architecture

## Regra canônica

`public.products` no projeto Supabase `ssbesxgaijknwsjbsbcz` é a única fonte operacional de produtos.

Firebase não pode ser consultado por runtime do Admin, workers, cron, catálogo, estoque, validade, imagens, cestas ou kits.

Campos legados `firebase_key`, `firebase_snapshot` e `image_firebase_source_url` podem existir temporariamente apenas para auditoria/migração. Eles não conferem autoridade ao Firebase.

## Fluxos oficiais

### Produtos
Admin / ferramentas operacionais → Edge Function autenticada → `public.products`.

### EAN desconhecido
Leitura → busca em `public.products` → não encontrado → `unresolved_product_eans` → `inventory-product-research-v1` → produto inativo → revisão humana.

Nunca: EAN desconhecido → Firebase.

### Imagens
`public.products.image_source_url` → `image_original_url` → fonte histórica já cacheada em Supabase → Supabase Storage → pesquisa controlada quando necessária.

Nunca: worker → Firebase para decidir se produto existe ou está ativo.

### Estoque e validade
Toda alteração operacional escreve no Supabase. Integração ERP é downstream e continua protegida pelos gates existentes.

## Segurança

- escrita administrativa deve exigir sessão Supabase e vínculo ativo em `admin_users`;
- service role fica somente em Edge Functions/server-side;
- frontend recebe apenas publishable key;
- ações destrutivas permanecem humanas e auditáveis;
- tabelas server-only devem permanecer inacessíveis por anon/authenticated ou migrar gradualmente para schema privado.

## Economia

- evitar duplicar Edge Functions para o mesmo domínio;
- preferir endpoints administrativos consolidados e estreitos;
- evitar polling/cron agressivo quando dispatcher condicional resolve;
- intermediários de IA devem ter retenção finita;
- índices só são criados/removidos com evidência de consulta/duplicidade.
