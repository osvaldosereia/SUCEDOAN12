# Admin V2 Operacional — Design

Data: 2026-09-11

## Objetivo

Completar o Admin V2 da Dona Antônia reaproveitando componentes operacionais já existentes, sem reintroduzir módulos de atendimento/Meta/IA conversacional.

## Navegação

O Admin V2 terá quatro áreas principais:

- Produtos
- Cestas básicas
- Clientes
- Balanço rápido

## Produtos

A listagem deve mostrar todos os produtos relevantes do banco novo, incluindo ativos, inativos, fisicamente conferidos, descobertos pela contagem e criados pela pesquisa automática de EAN. Produtos `source_system = ai_ean_research` e inativos devem aparecer com estado de revisão, nunca ficar escondidos pelo filtro `physically_verified=true`.

Filtros mínimos: Todos, Ativos, Inativos, Revisão IA, Sem estoque, Ofertas. O editor mantém os campos atuais e permite ativação humana após revisão.

## Clientes

Cadastro completo com nome, telefone, CPF/CNPJ, e-mail e endereço principal: CEP, rua, número, complemento, bairro, cidade, estado e referência. Deve existir campo opcional `google_maps_url` para salvar um pino/link exato. Quando não houver link salvo, a interface gera um link de pesquisa do Google Maps a partir do endereço.

## Balanço rápido

Reaproveitar o leitor já existente em `/contagem/`, cujo runtime atual usa `inventory-fast-balance-v3`, mantendo `inventory-count-v2` para o fluxo detalhado existente. O Admin V2 terá acesso claro ao balanço rápido sem duplicar regras de estoque. A operação continua protegida pelo mecanismo de autorização já usado pelo backend de inventário; não expor gravação de estoque através do endpoint público `admin-simple-v2`.

## Pesquisa automática de EAN

Reutilizar `inventory-product-research-v1` e a fila `unresolved_product_eans`. EAN desconhecido entra na fila, a pesquisa usa busca web com validação por evidência e cria o produto como `is_active=false`, `physically_verified=false`, `source_system='ai_ean_research'`, aguardando revisão humana.

## Imagem de produto

Reutilizar `automation/product-image-studio/enrich_researched_products.py` e o workflow de produção. A imagem confiável encontrada pela pesquisa é baixada, tem o fundo removido, recebe fundo `#ECECEC`, é convertida para WebP quadrado e armazenada no Supabase Storage antes de atualizar `products.image_url`.

## Segurança

- Não colocar `service_role` no navegador.
- Não criar endpoint público de escrita para balanço.
- Produtos criados por IA permanecem inativos até revisão humana.
- O Admin 2 atual ainda possui endpoint público de escrita; esta mudança não amplia essa superfície e deve deixar explícita a necessidade de proteção posterior.

## Critérios de aceite

- Admin 2 lista produtos inativos e produtos em revisão IA.
- Cliente pode ser criado/alterado com endereço completo e link do Maps.
- Existe entrada funcional para Balanço rápido reutilizando a ferramenta existente.
- EAN desconhecido continua sendo enviado à pesquisa automática.
- Produto criado pela pesquisa aparece no Admin 2 mesmo antes de ser fisicamente conferido.
- Pipeline de imagem continua usando fundo `#ECECEC` e mantém o produto inativo para revisão.
