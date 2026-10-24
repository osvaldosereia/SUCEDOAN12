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
