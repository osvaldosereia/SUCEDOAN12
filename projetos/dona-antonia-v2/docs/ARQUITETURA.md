# Arquitetura proposta — Dona Antônia V2

## Status real

**Revisão R00 (23/10/2026):** este documento foi alinhado à regra de ajuste interno privado e à responsabilidade operacional do app. Consulte docs/AUDITORIA_COMPLETA_V2.md para o baseline auditado na SHA 1a846beba768192c366937c1462bcfd6baeccee9.
Fases 1–3 implementadas parcialmente na V2 isolada: estrutura e design system, regras de cesta, schema com RLS/RBAC e cliente de Supabase Auth no admin. O projeto remoto V2 foi criado e as seis migrações foram aplicadas.
Nenhum funcionário ADMIN foi atribuído ainda; o login ponta a ponta aguarda o cadastro inicial. Adapter de dados, sincronismo e checkout transacional seguem pendentes.
Nenhuma modificação em produção, domínio, Edge Function atual ou banco legado.

## Fonte de verdade
| Informação | Origem canônica | Cópia usada pelo site |
|---|---|---|
| Identidade e dados fiscais do SKU (NCM/CEST/fornecedor e vínculo Bling) | Perfil Bling privado, após validação | Perfil fiscal privado no backend; nunca na projeção pública |
| Custo | Perfil fiscal/fornecedor privado, quando importado e validado | Somente backend e papéis autorizados |
| Preço operacional de venda | Admin V2/app (autoridade operacional proposta) | Preço público; precedência e reconciliação pendentes antes da integração |
| Estoque disponível | Operação de estoque V2 (fonte física/canônica ainda a definir) | Validado e reservado transacionalmente pelo backend; Bling não é o admin operacional |
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
5. O preço da cesta mostrado ao cliente é agregado: soma dos itens escolhidos mais o ajuste interno autorizado por tamanho, calculado no servidor. O componente do ajuste e o preço unitário dos itens da cesta nunca são expostos. Extras mantêm preço unitário/subtotal visíveis.
6. Se não houver SKU elegível, mostrar indisponibilidade sem inventar item ou preço.
7. O servidor precisa recalcular o total e conferir estoque/preços na confirmação. Dados do navegador NÃO são fonte de verdade.
8. Ao confirmar pedido, gravar cabeçalho/linhas/snapshot de preços e reservar estoque atomicamente; impedir excesso por múltiplos compradores.

## Separação de responsabilidades
- src/core: entidades, contratos, seleção, validações e total em centavos. Sem acesso a API, DOM ou banco.
- src/data: adaptadores de leitura do catálogo e dados de demonstração. Substituir mock somente quando backend estiver homologado.
- src/main-site.tsx: experiência móvel do cliente, carrinho e composição. Nunca acessa tokens privados.
- src/main-admin.tsx: interface operacional e configuração; deve passar por Auth/RBAC antes de qualquer deploy.
- scripts/import-bling.mjs: valida layout CSV do Bling e converte para formato de trabalho. Nunca altera Bling.
- supabase/migrations: migrações versionadas validadas no PGlite e aplicadas somente no projeto V2 isolado; nenhum banco existente foi alterado.

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
- No banco, migrações versionadas isolam preços privados em tabelas próprias; políticas/grants passaram no PGlite e foram aplicados no Supabase V2 isolado. Nenhum legado foi alterado.
- Imagens: componente `SquareImage` usa caixa quadrada, `object-fit:contain`, dimensões explícitas e lazy-loading para imagens não prioritárias.
- Vite DEV usa dados de demonstração quando o catálogo falta; build de produção falha fechado sem catálogo (sem preços fictícios).
- Qualquer nova sessão precisa ter seu próprio módulo e testes; refatorar antes de componentes com mais de 320 linhas ou CSS com mais de 11,5 KB.
- `scripts/check-architecture.mjs` será executado no CI antes da tipagem, dos testes e do navegador.
- Checkout e Supabase reais exigirão outro ciclo de homologação, principalmente regras de valor interno, estoque e pedidos.

**Atenção:** o login e o client Auth estão conectados ao projeto V2, mas ainda não existe usuário ADMIN da aplicação. O painel continua com dados demonstrativos e sem persistência operacional; não publicar nesta etapa.


## Fonte de estoque e preço — decisão pendente antes de integrar
O Bling não deve disputar a gestão operacional. O app V2/admin operacional será responsável por catálogo de venda, disponibilidade e pedidos; a origem do saldo físico, reconciliação e regras de entrada/saída ainda precisam ser decididas e documentadas antes de conectar serviços. O CSV de 802 SKUs é histórico de cadastro, não representa saldo atual. Não ativar nem importar em produção.
