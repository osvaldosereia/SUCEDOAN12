# Arquitetura proposta — Dona Antônia V2

## Status real
Fase 1 implementada: estrutura isolada, regras puras de cesta, layout responsivo demonstrativo e importador do CSV Bling.
Fases de backend, autenticação, sincronismo e checkout ainda NÃO implementadas.
Nenhuma modificação em produção, domínio, Edge Function atual ou banco legado.

## Fonte de verdade
| Informação | Origem canônica | Cópia usada pelo site |
|---|---|---|
| SKU, EAN unitário, EAN caixa/DUN, nome, marca, unidade, NCM/CEST, fornecedor | Bling | catálogo privado sincronizado |
| Custo e preço de venda | Bling | custo privado; preço público |
| Saldo disponível | Bling (depois do balanço) | espelho de disponibilidade no app |
| Tipos Arroz/Feijão/Açúcar etc. | Admin V2 | banco da_next |
| Vínculo tipo → SKUs permitidos | Admin V2 | banco da_next |
| Tamanhos e quantidades-padrão | Admin V2 | banco da_next |
| Escolhas do cliente e composição do pedido | Checkout V2 | pedido e linhas imutáveis |
| NF-e | Bling | chave e status na integração |

**Uma variação de sabor/aroma é um SKU independente.** Os tipos de produto representam opções de substituição, NÃO variações do Bling. EAN do fardo/caixa refere-se ao mesmo SKU de venda quando comprovado.

## Regra de precificação de cestas
1. Cada cesta contém pares (tipo de produto, quantidade padrão), configurados por tamanho.
2. O tipo contém uma lista de SKUs elegíveis.
3. Ao abrir a cesta, selecionar entre os SKUs ativos com estoque para a quantidade desejada o de menor preço.
4. O cliente pode escolher qualquer outro SKU do tipo, alterar a quantidade até 0, restaurá-la ou trocar de marca.
5. Total sempre é soma(preço-em-centavos x quantidade) dos SKUs escolhidos. Não há preço fixo ou diferença escondida.
6. Se não houver SKU elegível, mostrar indisponibilidade sem inventar item ou preço.
7. O servidor precisa recalcular o total e conferir estoque/preços na confirmação. Dados do navegador NÃO são fonte de verdade.
8. Ao confirmar pedido, gravar cabeçalho/linhas/snapshot de preços e reservar estoque atomicamente; impedir excesso por múltiplos compradores.

## Separação de responsabilidades
- src/core: entidades, contratos, seleção, validações e total em centavos. Sem acesso a API, DOM ou banco.
- src/data: adaptadores de leitura do catálogo e dados de demonstração. Substituir mock somente quando backend estiver homologado.
- src/main-site.tsx: experiência móvel do cliente, carrinho e composição. Nunca acessa tokens privados.
- src/main-admin.tsx: interface operacional e configuração; deve passar por Auth/RBAC antes de qualquer deploy.
- scripts/import-bling.mjs: valida layout CSV do Bling e converte para formato de trabalho. Nunca altera Bling.
- db: SQL somente para planejamento e futura execução em projeto de homologação isolado.

## APIs da próxima etapa
Não colocar segredo de OAuth Bling no navegador. API v3 com OAuth 2.0 e URL atual api.bling.com.br/Api/v3.
Futuras rotas protegidas:
- GET /catalogo: produtos disponíveis e preços sem custo;
- GET /cestas: tamanhos/tipos/alternativas, cacheáveis;
- POST /pedidos: validação transacional e chave de idempotência;
- Admin: CRUD tipos/cestas, produtos e fila de sincronização;
- Webhook Bling: verifica assinatura/autenticidade aplicável, deduplica eventos, reconcilia alterações e atualiza espelho.
- Outbox: envio retry para Bling e fluxo fiscal; falha de API não perde o pedido local.
Limites e contratos de API serão validados na implementação usando a documentação vigente.

## Segurança
- Criar banco/projeto de homologação independente ou schema isolado com acesso fechado; NÃO reutilizar tabelas legadas.
- RLS habilitada com política negando por padrão; somente roles autorizadas via endpoints autenticados.
- Chaves secretas e refresh tokens armazenados no servidor, nunca em variáveis VITE_*.
- Rate limiting, logs sem dados sensíveis, reconciliação diária, backups e auditoria de alterações.
- Admin só vai a staging após login, controle de papéis e revisão de autorização por operação.

## Performance e UX
- Site mobile-first, carrosséis horizontais nativos com rolagem por toque.
- Escolhas e totais síncronos em memória, sem refetch da página a cada seleção.
- Catálogo de opções carregado por tipo/lazy-loading; cache curto, invalidação por atualização.
- Imagens leves e responsivas; placeholders enquanto fotos não estiverem cadastradas.
- Barra fixa de total/Ver pedido; toasts curtos sem bloquear navegação.
- Acessibilidade: botões de quantidade nomeados, foco visível, alvos de toque e estados de indisponibilidade claros.

## Gate de publicação
Não mesclar esta branch à main, não alterar DNS nem workflow de deploy.
Publicar só após: dados reais importados em staging; fluxo de pedido ponta a ponta; estoque transacional; Bling OAuth; fiscal; separação; testes mobile; teste de carga; plano de rollback; aprovação expressa.

## Política para crescer sem degradação do código (V2)

**A partir desta refatoração:**
- Interface da vitrine: `src/features/{baskets,storefront,checkout}/components`; mídia quadrada reutilizável: `src/ui/media`.
- Telas admin por seção: `src/admin/features/{products,product-types,baskets,extras}`.
- Lógica pura e independente: `src/core`, com testes de cenários reais.
- Preços internos e decisões de cobrança que não podem vazar: `src/server/pricing`; nunca importar em componentes do site.
- Origem de dados: `src/data/catalog.ts` expõe uma interface `CatalogReader` que pode receber um novo adaptador Supabase mais tarde.
- Estilos por responsabilidade: `src/styles/{base,flow,admin-mobile,media}.css`.
- No banco, `db/003_private_basket_price.sql` introduz `private_adjustment_cents` (NÃO aplicado até homologação). O servidor calcula valor público, sem retornar o detalhamento do ajuste.
- Imagens: componente `SquareImage` usa caixa quadrada, `object-fit:contain`, dimensões explícitas e lazy-loading para imagens não prioritárias.
- Vite DEV usa dados de demonstração quando o catálogo falta; build de produção falha fechado sem catálogo (sem preços fictícios).
- Qualquer nova sessão precisa ter seu próprio módulo e testes; refatorar antes de componentes com mais de 320 linhas ou CSS com mais de 11,5 KB.
- `scripts/check-architecture.mjs` será executado no CI antes da tipagem, dos testes e do navegador.
- Checkout e Supabase reais exigirão outro ciclo de homologação, principalmente regras de valor interno, estoque e pedidos.

**Atenção:** código separado não significa autenticação pronta. O admin permanece uma prévia sem login nem persistência.
