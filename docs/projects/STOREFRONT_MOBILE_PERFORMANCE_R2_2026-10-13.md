# Dona Antônia — Performance mobile — Rodada 2 (2026-10-13)

## Objetivo
Retirar a montagem integral das cestas do caminho crítico da primeira visita, sem alterar valores, estoque, composição, checkout ou integração de pedidos.

## Implantação
- Edge Function: `supabase/functions/storefront-v2/index.ts`.
- Migração SQL: `supabase/migrations/20261013170604_storefront_public_home_snapshot_v1.sql` (registrada no Supabase).
- Teste: `node scripts/test-storefront-mobile-r2.mjs`.

## Modelo de dados e segurança
A tabela `public.storefront_public_home_snapshot_v1` possui uma única linha (`snapshot_key='home'`) e armazena somente o JSON público já devolvido por `action=home`, data da geração e um lease de atualização. RLS está habilitado e as permissões para `anon` e `authenticated` foram revogadas; somente a função com `service_role` lê/escreve. Nenhum dado de cliente é armazenado.

## Fluxo da vitrine
1. `home` e `home_priority` acessam a **mesma** cópia persistente. A resposta prioritária é filtrada para `Cestas Completas > Grande`, sem outra consulta pesada.
2. Cache da instância: até 120 segundos. Snapshot fresco é reutilizado entre instâncias e visitantes.
3. Após 120 segundos o snapshot é entregue imediatamente como `catalog_stale:true` e reconstruído em background com `EdgeRuntime.waitUntil`.
4. Lease condicional no Postgres (token UUID + limite de 120 segundos) impede que muitas instâncias reconstruam simultaneamente. Escritas só são aceitas por quem mantém o token.
5. Se não existir snapshot inicial, a primeira chamada o constrói e persiste. Se outra instância estiver construindo, aguarda brevemente e só então recorre à montagem atual.
6. Snapshot com mais de 2 horas provoca tentativa de reconstrução antes de entrega, com fallback para último snapshot válido se a geração falhar.
7. Checkout continua validando o estado **atual** de preço, composição, disponibilidade e estoque nos endpoints `basket`, `basket_mold_quote`, `basket_quote` e `submit_order`. **Nunca** usar a cópia pública para autorizar uma venda.
8. Headers HTTP `home`/`home_priority`: cache público de 30 s com stale-while-revalidate de 120 s; as demais ações preservam suas políticas anteriores.

## Inicialização e verificação operacional
- Conferir RLS, grants, uma linha singleton e código implantado.
- Aquecer uma vez a URL pública `GET action=home` para preencher o snapshot; isso não cria pedidos.
- Confirmar que `payload.baskets` está preenchido e que `generated_at` é recente.
- Confirmar `home_priority` com a mesma origem e somente cestas Grande.
- Monitorar logs HTTP 500 e `statement timeout`. Medidas de LCP em Android/4G continuam pendentes.

## Rollback
- Reimplantar `storefront-v2` v66, **sem excluir a tabela**. A tabela inerte não afeta a versão anterior.
- Reverter o PR de código se necessário. Não executar migração destrutiva.

## Próxima rodada
R3: renderização incremental no mobile, evitar trocas completas de DOM, pré-carregar somente primeira imagem e reduzir HTTP/JSON baixados na primeira visita.
