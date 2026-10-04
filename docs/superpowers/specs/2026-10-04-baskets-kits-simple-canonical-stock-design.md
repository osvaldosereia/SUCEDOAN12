# Cestas/Kits simples com estoque e publicação canônicos

## Objetivo

Transformar a área **Cestas** do Vitrine/Admin em uma ferramenta rápida e simples para criar, editar, montar e vender cestas/kits, mantendo a complexidade técnica escondida.

Para a operação e para o cliente, **cesta e kit são a mesma entidade comercial: Cesta/Kit**. As estruturas internas atuais (`basket_templates`, `basket_kit_templates`, `basket_stock_lots`, vínculos e alocações) podem permanecer quando necessárias para preservar histórico e reduzir risco de migração, mas não devem obrigar o operador a entender `food`, `hygiene`, `split`, `business_type` ou outras distinções técnicas.

## Decisões de produto

1. A ferramenta passa a usar o termo **Cesta/Kit** para qualquer item comercial desse módulo.
2. Um **modelo** define nome, categoria, composição padrão e valores padrão.
3. Um **lote** representa uma composição/quantidade física concreta daquele modelo.
4. Criar o primeiro lote deve fazer parte do mesmo fluxo de criação do modelo, sem exigir navegação por telas diferentes.
5. Duplicar um lote existente deve ser o caminho mais rápido para criar o lote seguinte.
6. A publicação pública é consequência do estado e do estoque; não deve depender de uma sequência manual confusa de “Montado” + “Ativar no site”.
7. Deve continuar existindo somente a exceção manual **Pausar venda / Retomar venda**.

## Categorias oficiais

As categorias públicas de Cestas/Kits são fixas e ordenadas:

1. **Cestas Completas** (`cestas-completas`)
2. **Cestas Só Alimento** (`cestas-so-alimento`)
3. **Kits Limpeza e Higiene** (`kits-limpeza-e-higiene`)
4. **Kits Limpeza** (`kits-limpeza`)
5. **Kits Higiene** (`kits-higiene`)

Regras:

- Todo modelo comercial deve pertencer obrigatoriamente a uma dessas categorias.
- A categoria pertence ao modelo e é herdada pelos seus lotes; o operador não deve recadastrar categoria em cada lote.
- As categorias acima são também as categorias públicas do site para Cestas/Kits.
- As categorias gerais de produtos (“Mercearia”, “Limpeza e lavanderia” etc.) continuam independentes e não podem ser substituídas pelas categorias de Cestas/Kits.
- A API pública deve expor `basket_categories` separadamente das categorias de produtos.

### Migração dos modelos atuais

- Modelos de cesta atuais com `uses_hygiene_kit=true` entram inicialmente em **Cestas Completas**.
- Modelos de cesta atuais com `uses_hygiene_kit=false` entram inicialmente em **Cestas Só Alimento**.
- O modelo avulso atual `Kit Limpeza e Higiene` entra em **Kits Limpeza e Higiene**.
- Modelos futuros de limpeza ou higiene puros usam, respectivamente, **Kits Limpeza** ou **Kits Higiene**.
- A migração deve ser determinística e auditável; nenhuma cesta/kit comercial pode permanecer sem categoria.

## Catálogo comercial unificado

A camada operacional/pública deve normalizar as estruturas atuais sem exigir uma migração destrutiva imediata.

Um catálogo canônico de Cestas/Kits deve representar:

- `basket_templates` como modelos comerciais de cesta;
- `basket_kit_templates` sem `basket_id` como modelos comerciais avulsos de kit;
- `basket_kit_templates` vinculados a uma `basket_template` apenas como composição interna daquela cesta, sem gerar um segundo produto público.

A camada canônica deve fornecer, no mínimo:

- identificador comercial;
- tipo de origem interna;
- nome;
- categoria pública;
- preço atual;
- imagem;
- lote público atual;
- estoque público calculado;
- composição pública atual;
- estado público e motivo de indisponibilidade.

## Regra canônica de disponibilidade do lote

Deve existir uma única regra de disponibilidade, consumida pelo Admin, site público e checkout. Nenhuma dessas superfícies deve recalcular disponibilidade com regras próprias.

Para um lote simples, `public_available` é maior que zero somente quando **todas** as condições forem verdadeiras:

1. `status = ready` (Montado);
2. `sale_enabled = true` (não está pausado manualmente);
3. `quantity_available > 0`;
4. todos os produtos da composição continuam com estoque físico efetivamente vendável maior que zero;
5. o modelo e a categoria permanecem ativos.

Se qualquer produto da composição tiver estoque físico efetivamente vendável igual a zero, o lote fica com `public_available = 0` e sai automaticamente do site, mesmo que `quantity_available` ainda seja positivo.

**Importante:** essa checagem deve usar o estoque físico/efetivo do produto, e não apenas o “estoque avulso”. Um produto já fisicamente reservado dentro de lotes montados não deve ser tratado como inexistente apenas porque o saldo avulso chegou a zero.

### Motivos canônicos de indisponibilidade

A camada de disponibilidade deve fornecer um `availability_reason`, pelo menos:

- `available`
- `draft`
- `paused`
- `depleted`
- `component_out_of_stock`
- `linked_lot_unavailable`
- `model_inactive`
- `category_inactive`

O Admin deve traduzir isso em linguagem operacional curta.

## Lotes conectados

Um lote pode depender de outro lote já existente.

Regras:

- O vínculo continua limitado a um nível; não criar cadeias de lotes compostos.
- O estoque público do conjunto é sempre o **menor estoque disponível** entre os lotes conectados.
- Exemplo: lote principal com 8 unidades + lote vinculado com 3 unidades = **3 Cestas/Kits disponíveis**.
- Se qualquer um dos lotes conectados zerar, o conjunto sai automaticamente do site.
- Se qualquer produto de qualquer um dos lotes conectados ficar sem estoque físico efetivo, o conjunto sai automaticamente do site.
- Um vínculo pode ser planejado enquanto o lote dependente ainda está em edição, mas a Cesta/Kit principal não pode ser marcada como Montada enquanto a dependência não estiver Montada e disponível.
- O checkout deve reservar/consumir os lotes envolvidos na mesma operação transacional já usada para alocação de estoque.

## Esgotamento e retorno automático

- Quando todas as unidades de um lote forem vendidas, `quantity_available` chega a zero e o lote deixa de aparecer no site sem ação humana.
- Se houver outro lote Montado, não pausado e disponível do mesmo modelo, ele assume automaticamente como lote público atual, respeitando FIFO por `built_at/created_at`.
- Se não houver outro lote disponível, o modelo deixa de aparecer no site.
- Se um lote saiu do site apenas por `component_out_of_stock` e o estoque físico do componente voltar a ser positivo, ele pode reaparecer automaticamente, desde que continue Montado, com unidades disponíveis e não pausado.
- Um lote `paused` nunca volta automaticamente até ação humana de **Retomar venda**.

## Estados operacionais simplificados

Na interface diária mostrar somente:

- **Em edição** — rascunho, não reserva/vende;
- **Montado** — fisicamente montado e apto a venda quando a disponibilidade canônica for positiva;
- **Esgotado** — nenhuma unidade restante;
- **Pausado** — possui estoque, mas venda foi interrompida manualmente.

Estados técnicos/históricos podem continuar no banco, mas não devem poluir a operação.

### Mudança em relação ao fluxo anterior

A especificação anterior separava “Marcar como montado” de “Ativar no site”. Esta especificação substitui essa regra:

- **Marcar como montado** deve deixar `sale_enabled=true` por padrão.
- O lote só aparece publicamente se também passar pela disponibilidade canônica.
- O botão manual **Ativar no site** deixa de existir no fluxo diário.
- Em seu lugar existe **Pausar venda / Retomar venda**.

## Admin: experiência simplificada

### Tela principal de Cestas/Kits

A tela deve priorizar o que é necessário para o dia a dia:

- filtros pelas 5 categorias públicas;
- nome da Cesta/Kit;
- lote público atual/código;
- estoque público atual;
- estado curto;
- preço;
- ações rápidas.

Ações principais:

- **Editar**
- **Novo lote**
- **Duplicar lote**
- **Pausar/Retomar venda**
- **Imprimir**

Ações destrutivas ou raras ficam secundárias/recolhidas.

Não exibir na visão principal painéis técnicos de transição, `split`, `food`, `hygiene`, `business_type`, “ativar lote”, contadores ambíguos ou controles duplicados.

### Criar Cesta/Kit

Um único fluxo deve pedir somente:

1. **Nome**
2. **Categoria**
3. **Preço**
4. **Composição** (produto + quantidade)
5. **Quantidade do lote**
6. **Lote vinculado** opcional, quando aplicável

Código do lote é automático.

No mesmo formulário deve ser possível:

- salvar como **Em edição**;
- ou **Marcar como montado** quando todas as validações passarem.

### Editar Cesta/Kit

Edição deve permitir rapidamente:

- nome;
- categoria;
- preço;
- composição padrão;
- produtos/quantidades do lote em edição;
- vínculo opcional.

Produtos devem continuar usando as famílias de substituição já implementadas: ao clicar **Trocar**, mostrar imediatamente todos os produtos autorizados da mesma família, com estoque.

### Novo lote / duplicação

- `Novo lote` começa com a composição padrão do modelo.
- `Duplicar lote` copia composição, preço, categoria herdada e vínculo, gerando novo código automaticamente.
- O operador altera somente o que mudou e informa a quantidade.
- Alterar um lote não modifica lotes históricos anteriores.

## Contadores sem ambiguidade

Nunca usar “Montados” para representar unidades.

Mostrar conceitos distintos:

- **Lotes existentes** — quantidade de registros de lote;
- **Lotes montados** — quantidade de lotes no estado `ready`;
- **Unidades disponíveis** — soma/unidades efetivamente disponíveis conforme o contexto;
- **Em edição** — quantidade de lotes rascunho e, quando útil, unidades planejadas.

Para um lote conectado, o card deve mostrar explicitamente o estoque público calculado pelo menor saldo.

## Site público

### Categorias

A seção de Cestas/Kits deve usar as 5 categorias de `basket_categories`.

O `storefront-v2` deve continuar devolvendo as categorias de produtos atuais e acrescentar um campo separado `basket_categories`.

Cada Cesta/Kit deve trazer:

- `category_name`
- `category_slug`
- `stock_quantity` calculado pela regra canônica
- composição do lote público atual
- preço público atual

O site pode exibir filtros/seções pelas categorias de Cestas/Kits sem afetar Mercearia/Limpeza/Higiene/Casa-Pet do catálogo comum.

### Visibilidade

Uma Cesta/Kit só aparece se existir pelo menos um lote público canônico com `public_available > 0`.

O site não deve consultar diretamente `quantity_available` e inventar uma segunda regra.

## Checkout

O checkout deve usar a mesma regra canônica do site, mas recalcular sob transação antes de reservar.

Requisitos:

- não confiar no estoque exibido anteriormente ao cliente;
- validar novamente lote, vínculo e produtos componentes;
- impedir oversell em pedidos concorrentes;
- consumir/alocar lote principal e lote vinculado juntos;
- após consumo, o novo `public_available` deve refletir imediatamente o menor saldo restante;
- se o último item for consumido, o lote deixa de ser público automaticamente.

## Fonte única de verdade

Criar uma camada SQL canônica (nome final a confirmar no plano de implementação) equivalente a:

- disponibilidade por lote;
- lote público atual por modelo comercial;
- catálogo público unificado de Cestas/Kits.

Admin, `storefront-v2` e checkout devem ler essa camada. Regras duplicadas antigas devem ser removidas ou transformadas em wrappers compatíveis.

O objetivo é evitar divergências como:

- Admin mostra 2 e site mostra 1;
- “Montados” significar unidades;
- lote esgotado continuar publicável;
- produto zerado não retirar a cesta;
- vínculo mostrar estoque diferente do checkout.

## Compatibilidade e migração

- Preservar IDs, lotes, pedidos, alocações e histórico atuais.
- Não apagar `basket_templates`, `basket_kit_templates` nem lotes históricos nesta fase.
- APIs antigas usadas por checkout/pedidos só podem ser removidas após testes de compatibilidade.
- `sale_enabled` permanece no banco por compatibilidade, mas passa a representar a decisão humana **não pausado/pausado**, e não uma etapa obrigatória depois da montagem.
- Views antigas podem permanecer temporariamente como wrappers, desde que apontem para a regra canônica e não mantenham lógica divergente.

## Segurança operacional

- Reabrir lote Montado para edição continua exigindo que ele não tenha histórico incompatível, consumo parcial ou dependências que tornem a edição destrutiva.
- Lotes históricos não são reescritos ao editar o modelo.
- Alterações de categoria/nome/composição do modelo não alteram pedidos passados.
- Exclusão de modelo continua sendo arquivamento lógico quando houver histórico.
- Vínculo cíclico ou vínculo com lote composto continua proibido.

## Testes obrigatórios

A implementação deve seguir TDD e cobrir pelo menos:

1. lote com 5 unidades aparece com estoque 5;
2. venda da quinta unidade zera o lote e o remove da vitrine;
3. um componente com estoque físico efetivo zero torna `public_available=0`;
4. recomposição de estoque faz lote elegível reaparecer automaticamente;
5. lote pausado não reaparece sozinho;
6. lote A=8 conectado ao lote B=3 publica estoque 3;
7. lote B zerado remove o conjunto da vitrine;
8. componente zerado no lote B remove o conjunto da vitrine;
9. checkout concorrente não vende acima do menor saldo conectado;
10. novo lote montado recebe `sale_enabled=true` automaticamente;
11. próximo lote FIFO assume quando o anterior esgota;
12. categorias públicas são exatamente as 5 categorias de Cestas/Kits;
13. categorias de produtos comuns continuam inalteradas;
14. todos os modelos comerciais migrados possuem categoria;
15. Admin, site e checkout retornam o mesmo estoque para a mesma Cesta/Kit;
16. contadores de lotes não confundem quantidade de lotes com unidades;
17. Cesta/Kit standalone proveniente de `basket_kit_templates` sem `basket_id` pode aparecer no catálogo público;
18. template interno ligado a uma cesta não aparece como produto público duplicado;
19. famílias de substituição continuam funcionando no editor;
20. histórico de pedidos/lotes antigos permanece íntegro.

## Critérios de aceite

A revisão só pode ser considerada concluída quando:

- o operador consegue criar uma nova Cesta/Kit e seu primeiro lote em um único fluxo;
- editar/duplicar um lote exige somente as alterações necessárias;
- não existe botão obrigatório “Ativar no site” após montar;
- esgotamento de lote retira automaticamente a oferta pública;
- produto componente com estoque físico efetivo zero retira automaticamente a oferta pública;
- lote conectado usa o menor saldo;
- as 5 categorias classificam e filtram Cestas/Kits no site público;
- Cestas e Kits aparecem e são administrados pelo mesmo fluxo operacional;
- Admin, site e checkout compartilham a mesma disponibilidade canônica;
- nenhum pedido histórico é perdido ou reinterpretado.

## Fora de escopo desta revisão

- reescrever todo o histórico de lotes em uma tabela nova;
- alterar regras fiscais/Bling;
- alterar a lógica geral de estoque de produtos fora do necessário para consultar o estoque físico efetivo;
- criar automação de sugestões de lotes;
- permitir cadeia de vínculos com mais de um nível;
- redesenhar a seção de produtos comuns do site.
