# Admin — Gôndolas por leitura rápida de EAN

Data: 2026-09-16
Status: design aprovado em conversa; aguardando revisão do documento antes da implementação

## Objetivo

Criar dentro do Admin oficial `/admin/` uma seção **Gôndolas** para organizar fisicamente os produtos da Dona Antônia por leitura rápida de EAN.

A operação deve ser simples: o usuário cria uma gôndola, entra nela e passa os códigos EAN dos produtos. Cada leitura vincula imediatamente o produto à gôndola aberta.

## Regras de negócio aprovadas

1. Cada produto pode ter **somente uma gôndola principal**.
2. O módulo controlará **somente gôndola**; não haverá prateleira na interface ou no fluxo operacional.
3. Os dados antigos de `products.gondola` e `products.shelf` não serão importados.
4. O banco foi previamente limpo para começar do zero: todos os produtos ficaram sem gôndola e sem prateleira.
5. Ao ler um EAN em uma gôndola:
   - produto sem gôndola: vincular à gôndola atual;
   - produto já na mesma gôndola: não duplicar; mostrar que já está nela;
   - produto em outra gôndola: **transferir automaticamente**, sem pedir confirmação;
   - EAN desconhecido: não criar produto; sinalizar `Produto não encontrado`.
6. A última leitura válida define a gôndola atual do produto.
7. O cadastro individual de produto terá campo **Gôndola** editável, com opção `Sem gôndola`.
8. Alterar a gôndola no cadastro individual deve produzir o mesmo vínculo normalizado que a leitura rápida.

## Estrutura de dados

### Fonte principal

Reutilizar a estrutura WMS já existente:

- `warehouse_locations`
- `product_location_assignments`
- `product_pick_location_v2`

Não criar uma tabela paralela de gôndolas.

### Representação de uma gôndola

Cada gôndola operacional será uma linha ativa em `warehouse_locations`.

Como a tabela existente exige `shelf_code`, o módulo usará internamente um valor técnico fixo, por exemplo `GERAL`. Esse valor **não aparecerá no Admin** e não será gravado em `products.shelf`.

Campos relevantes:

- `warehouse_locations.code`: código único técnico da gôndola;
- `warehouse_locations.gondola_code`: nome/código exibido da gôndola;
- `warehouse_locations.shelf_code`: `GERAL` apenas por compatibilidade do schema;
- `warehouse_locations.pick_sequence`: ordem opcional de separação;
- `warehouse_locations.active`: ativo/inativo.

### Um produto em uma única gôndola

O banco deverá garantir que um produto tenha no máximo **um vínculo ativo principal** em `product_location_assignments`.

A implementação deve usar uma restrição/índice parcial apropriado para impedir dois vínculos ativos principais para o mesmo `product_id`.

Ao transferir um produto:

1. desativar/remover o vínculo ativo anterior;
2. criar ou reativar o vínculo com a nova gôndola;
3. manter `is_primary=true` e `active=true` apenas para a gôndola atual.

### Compatibilidade com `products`

Manter `products.gondola` sincronizado com o `gondola_code` da localização atual para compatibilidade com telas e código legado.

`products.shelf` continuará `NULL`/vazio.

A estrutura WMS normalizada será a fonte de verdade para localização; `products.gondola` será um espelho de compatibilidade.

## Nova seção no Admin

Adicionar uma rota/menu **Gôndolas** no Admin oficial `/admin/`.

### Tela inicial

Exibir:

- botão `Nova gôndola`;
- lista de gôndolas cadastradas;
- nome/código;
- quantidade de produtos vinculados;
- status ativo/inativo;
- ação `Abrir`;
- ação `Renomear`;
- ação `Desativar/Ativar`.

Não excluir fisicamente uma gôndola que tenha histórico operacional; preferir desativação.

### Criar gôndola

Fluxo curto:

1. clicar `Nova gôndola`;
2. informar nome/código, por exemplo `Gôndola 01`;
3. salvar;
4. abrir automaticamente a gôndola criada ou retornar à lista.

O código exibido deve ser único sem diferenciar apenas espaços/caixa de forma enganosa.

## Tela de leitura rápida da gôndola

Ao abrir uma gôndola, mostrar uma interface otimizada para leitor de código de barras.

### Elementos

- título grande com o nome da gôndola atual;
- contador de produtos vinculados;
- campo de EAN sempre focado;
- card da última leitura;
- lista dos últimos produtos lidos nessa sessão;
- lista dos produtos atualmente vinculados à gôndola;
- busca por nome/EAN dentro da gôndola;
- botão para remover um produto da gôndola;
- botão para voltar à lista de gôndolas.

### Comportamento do leitor

Reaproveitar os princípios do `contagem/fast-mode.js`:

- capturar Enter/Tab do leitor;
- normalizar apenas dígitos do EAN;
- manter foco automaticamente;
- feedback visual imediato;
- impedir leituras duplicadas acidentais da mesma entrada;
- não bloquear a tela desnecessariamente.

Para esta primeira versão, cada EAN pode ser processado imediatamente pelo backend, porque não existe contagem de quantidade. Se a latência real prejudicar a leitura contínua, implementar fila local curta e envio em lote seguindo o padrão já usado no Balanço rápido.

### Resultado visual da leitura

Sucesso:

- `Produto X → Gôndola 05`
- mostrar nome, EAN e imagem quando disponível;
- feedback verde e retorno automático ao foco.

Já estava na gôndola:

- `Produto X já está nesta gôndola`;
- não criar outro vínculo.

Transferência:

- `Produto X movido de Gôndola 02 para Gôndola 05`;
- sem modal e sem confirmação.

EAN desconhecido:

- `Produto não encontrado`;
- feedback vermelho;
- nenhuma criação automática de produto.

## Cadastro individual do produto

No editor oficial de produto dentro de `Admin → Produtos`, acrescentar campo **Gôndola**.

O campo será um seletor com:

- `Sem gôndola`;
- todas as gôndolas ativas.

Ao salvar:

- selecionar uma gôndola: criar/transferir o vínculo normalizado e sincronizar `products.gondola`;
- selecionar `Sem gôndola`: remover/desativar o vínculo ativo e limpar `products.gondola`;
- nunca preencher `products.shelf`.

A edição em lote da lista de produtos não ganhará controle de gôndola nesta primeira versão. O campo ficará apenas no editor completo, para evitar excesso de colunas e mudanças acidentais.

## Backend

Criar um endpoint dedicado do Admin para operações de gôndola, por exemplo `admin-gondolas-v1`, ou incorporar as ações a uma função administrativa existente somente se a revisão de segurança mostrar que isso mantém o mesmo padrão de autorização do Admin oficial.

A API deve oferecer ações equivalentes a:

- `list_gondolas`
- `create_gondola`
- `rename_gondola`
- `set_gondola_active`
- `get_gondola`
- `scan_ean`
- `remove_product`
- `set_product_gondola`
- `list_gondola_products`

Todas as gravações devem ocorrer no servidor. O navegador nunca receberá `service_role`.

## Consistência transacional

A operação `scan_ean`/`set_product_gondola` deve ser atômica.

Em uma única transação/RPC ou sequência protegida no backend:

1. localizar produto por `gtin`;
2. validar gôndola ativa;
3. encerrar vínculo anterior ativo, se existir;
4. garantir um único vínculo ativo principal;
5. criar/reativar vínculo da nova gôndola;
6. atualizar `products.gondola`;
7. limpar `products.shelf`;
8. devolver produto + gôndola anterior + gôndola atual.

Falhas não podem deixar `products.gondola` divergente de `product_location_assignments`.

## Segurança

- Seguir o mecanismo de autorização do Admin oficial vigente no momento da implementação.
- Nenhuma chave `service_role` no frontend.
- Tabelas públicas novas não serão criadas desnecessariamente.
- Se for criada RPC `SECURITY DEFINER`, ela deve ficar protegida, validar autorização no servidor e ter `EXECUTE` explicitamente restrito; não usar `SECURITY DEFINER` apenas para contornar RLS.
- Rodar advisors/revisão de segurança após mudanças de schema.

## Migração

A migração será **somente estrutural**.

Não importar nenhum dado antigo de gôndola/prateleira.

Mudanças previstas:

- constraint/índice para uma única localização ativa principal por produto;
- ajustes mínimos necessários para o módulo utilizar as tabelas WMS existentes;
- nenhuma recriação dos 675 valores apagados anteriormente.

## Tratamento de gôndola desativada

- não permitir novas leituras para gôndola desativada;
- produtos que ainda estejam vinculados a uma gôndola desativada continuam com o vínculo registrado até serem movidos/removidos;
- o seletor do produto deve mostrar a gôndola atual mesmo que ela tenha sido desativada, mas não permitir selecionar outra gôndola inativa.

## Concorrência

Se dois leitores moverem o mesmo produto quase ao mesmo tempo, o último commit válido vence, mantendo sempre um único vínculo ativo.

O banco, e não apenas a interface, deve impedir dois vínculos ativos simultâneos.

## Testes

Implementação guiada por TDD.

Cobertura mínima:

1. criar gôndola;
2. impedir código duplicado;
3. listar apenas status correto;
4. leitura de produto sem gôndola;
5. leitura repetida na mesma gôndola;
6. transferência automática entre gôndolas;
7. EAN inexistente;
8. produto termina com somente um vínculo ativo;
9. `products.gondola` sincronizado;
10. `products.shelf` permanece vazio;
11. remover produto da gôndola;
12. alterar gôndola pelo editor de produto;
13. selecionar `Sem gôndola`;
14. bloquear leitura em gôndola inativa;
15. rota e menu `Gôndolas` presentes no Admin;
16. leitor retorna foco e aceita sequência de EANs;
17. testes existentes do Admin, Comprar e WMS continuam verdes.

## Fora de escopo nesta versão

- prateleiras;
- múltiplas gôndolas por produto;
- quantidade por gôndola;
- importação das antigas localizações;
- cadastro automático de produto por EAN desconhecido;
- impressão de etiquetas de gôndola;
- mapa visual do depósito;
- alteração de gôndola diretamente na tabela inline de Produtos.

## Critérios de aceite

O módulo estará pronto quando:

- seja possível criar uma gôndola no Admin;
- abrir a gôndola e bipar EANs continuamente;
- cada produto fique em apenas uma gôndola;
- leitura em outra gôndola mova automaticamente o produto;
- a localização apareça e seja editável no cadastro do produto;
- o WMS e `products.gondola` permaneçam sincronizados;
- nenhuma prateleira apareça na operação;
- nenhum dado antigo seja reimportado;
- testes e validações de banco/segurança passem antes do merge.
