# Cestas e Kits V2 — Design aprovado

Data: 2026-10-04
Projeto: Dona Antônia / SUCEDOAN12
Status: design aprovado em conversa; esta especificação é o contrato escrito para revisão antes do plano TDD.

## 1. Objetivo

Criar uma nova seção paralela **Cestas e Kits**, sem remover nem alterar destrutivamente a seção atual **Cestas** durante o desenvolvimento.

A nova seção deve ser rápida, objetiva e operacional. Para o usuário, **Cesta e Kit são a mesma entidade comercial**. A complexidade de lote, composição, combinação e estoque fica escondida sempre que possível.

A seção atual continua funcionando até a V2 estar homologada. O cutover para o site público e checkout ocorre somente depois de comparação lado a lado e testes de regressão.

## 2. Princípios de UX

1. Uma tela principal de catálogo operacional.
2. Criação/edição em uma única tela sempre que possível.
3. Campos essenciais primeiro; detalhes avançados recolhidos.
4. Duplicar deve ser o caminho mais rápido para criar variações.
5. Financeiro e disponibilidade atualizam em tempo real.
6. Estados apresentados ao operador devem ser poucos e claros.
7. Não expor termos técnicos como `ready`, `sale_enabled`, `split`, `food`, `legacy_full` etc.
8. Ações comuns devem exigir poucos cliques.
9. Mobile utilizável, mas desktop otimizado para velocidade operacional.

## 3. Entidade comercial

### 3.1 Cesta/Kit

É o item que o cliente vê e compra.

Campos principais:
- nome público;
- categoria;
- foto;
- descrição curta;
- preço final de venda;
- modo de composição: `products` ou `combined_kits`;
- estado comercial: Vendendo, Pausado, Sem estoque;
- ordem de exibição.

Categoria pertence à Cesta/Kit, nunca ao lote.

Categorias públicas oficiais:
- Cestas Completas;
- Cestas Só Alimento;
- Kits Limpeza e Higiene;
- Kits Limpeza;
- Kits Higiene.

## 4. Dois modos de composição

### 4.1 Montado com produtos

A Cesta/Kit possui uma receita de produtos e quantidades.

Exemplo:
- Arroz 5 kg × 2;
- Feijão 1 kg × 2;
- Óleo 900 ml × 2.

Este modo possui **lotes físicos**.

### 4.2 Combinação de Cestas/Kits

A Cesta/Kit comercial é formada por outras Cestas/Kits base.

Exemplo:
- Cesta Só Alimentos Pequena × 1;
- Kit Limpeza × 1;
- Kit Higiene × 1.

Deve ser possível adicionar **quantos componentes forem necessários**, sem limite artificial de 2.

A combinação não cria estoque físico duplicado. Sua disponibilidade é derivada das Cestas/Kits componentes.

### 4.3 Profundidade

V1 da arquitetura permitirá apenas **um nível de combinação**.

Uma Cesta/Kit de modo `combined_kits` não pode ser usada como componente de outra combinação. Isso evita ciclos, dupla reserva e recursão de estoque.

## 5. Lotes físicos

Lote existe somente para Cesta/Kit montada diretamente com produtos.

O lote é estoque físico e histórico, não produto público.

Campos relevantes:
- código automático;
- cesta_kit_id;
- quantidade montada;
- quantidade disponível;
- composição real do lote;
- custo total congelado;
- valor total dos produtos congelado;
- data de montagem;
- status: Rascunho, Montado, Esgotado.

O lote não terá preço público próprio. O preço pertence à Cesta/Kit comercial.

Venda segue FIFO entre lotes montados disponíveis da mesma Cesta/Kit.

## 6. Estoque e disponibilidade

### 6.1 Produto montado

Capacidade de montagem de cada produto:

`floor(estoque_vendavel_produto / quantidade_por_cesta)`

Capacidade da Cesta/Kit = menor capacidade entre todos os produtos necessários.

### 6.2 Lotes existentes

Disponibilidade pública de uma Cesta/Kit montada = soma das quantidades disponíveis dos lotes montados e vendáveis.

Quando a quantidade disponível chegar a zero, ela sai automaticamente do site público.

### 6.3 Combinações

Para cada componente:

`capacidade_componente = floor(disponibilidade_componente / quantidade_necessaria)`

Disponibilidade da combinação = menor `capacidade_componente` entre todos os componentes.

Se qualquer componente ficar indisponível, a combinação fica automaticamente Sem estoque e sai do site.

### 6.4 Pausa manual

Estado Pausado sempre prevalece sobre estoque. Retomar venda volta a usar a disponibilidade calculada automaticamente.

## 7. Financeiro

### 7.1 Produto dentro de lote

O backend é a autoridade do custo. O frontend nunca deve consolidar custo com base apenas em dados locais.

Ao salvar/montar:
- reler `products.cost`;
- reler `products.price` quando necessário;
- calcular quantidade × custo;
- calcular quantidade × venda do produto;
- bloquear montagem se existir produto sem custo válido.

É permitido salvar rascunho com custo faltante, mas não marcar como Montado.

### 7.2 Bug atual confirmado

O endpoint atual de sugestões por família busca `price` mas não `cost`. Ao trocar produto pelo picker, o editor usa `p.cost || 0`, fazendo custo ausente virar R$ 0,00.

Correção obrigatória na V2:
- endpoints de produto/sugestão retornam `cost`;
- ausência de custo é `null/unknown`, nunca zero implícito;
- backend valida custo novamente no save/mount;
- UI mostra alerta explícito `Custo não informado`.

### 7.3 Snapshot de lote

Ao marcar lote como Montado, congelar:
- custo total daquele lote;
- valor total dos produtos daquele lote;
- composição real;
- custos unitários usados;
- preços unitários usados.

Mudanças futuras no cadastro do produto não alteram histórico financeiro do lote montado.

### 7.4 Combinação — plano B

Cada componente mostra:
- custo atual de referência;
- valor total dos produtos;
- valor de venda da Cesta/Kit componente;
- disponibilidade.

Resumo consolidado mostra:
- custo total;
- valor total dos produtos;
- soma da venda dos componentes;
- preço final manual da combinação;
- ajuste comercial = preço final − soma da venda dos componentes;
- disponibilidade final.

O preço final pode ser diferente da soma das vendas dos componentes.

## 8. Tela principal — Cestas e Kits

Nova entrada no menu: **Cestas e Kits**.

A entrada atual **Cestas** permanece intacta durante o desenvolvimento.

Tela principal:
- botão `+ Nova Cesta/Kit`;
- filtros por 5 categorias;
- busca por nome;
- cards compactos.

Cada card mostra somente:
- foto;
- nome;
- categoria;
- preço final;
- disponibilidade;
- modo: Produtos ou Combinação;
- estado: Vendendo / Pausado / Sem estoque;
- ações rápidas: Editar, Novo lote (se aplicável), Duplicar, Pausar/Retomar.

Não exibir dezenas de KPIs na listagem.

## 9. Criação / edição rápida

Fluxo principal em uma tela.

### Bloco A — Dados
- Nome no site;
- Categoria;
- Preço final;
- Foto;
- Descrição curta.

### Bloco B — Tipo de composição
Dois controles grandes:
- Produtos;
- Combinar Cestas/Kits.

### Bloco C1 — Produtos
Tabela/linhas com:
- foto;
- nome;
- quantidade;
- custo unitário;
- venda unitária;
- estoque;
- Trocar;
- Remover.

Ações:
- `+ Adicionar produto`;
- troca por família já configurada;
- busca manual.

### Bloco C2 — Combinar Cestas/Kits
Ação `+ Adicionar Cesta/Kit` repetível sem limite artificial.

Cada componente vira um card organizado com:
- nome;
- quantidade;
- custo;
- valor dos produtos;
- venda;
- disponibilidade;
- remover.

### Bloco D — Financeiro fixo
Desktop: painel lateral sticky.
Mobile: painel recolhível.

Para `products`:
- custo;
- valor dos produtos;
- preço final;
- margem sobre custo;
- diferença preço final × produtos.

Para `combined_kits`:
- custo total;
- valor total dos produtos;
- soma das vendas dos componentes;
- preço final;
- ajuste comercial;
- disponibilidade.

## 10. Criação de lote

Somente para modo `products`.

Fluxo:
1. composição definida;
2. informar quantidade desejada;
3. mostrar capacidade máxima;
4. se quantidade exceder capacidade, bloquear Montar e permitir salvar rascunho;
5. validar custo de todos os produtos;
6. montar;
7. reservar estoque;
8. congelar snapshot financeiro.

Ações:
- Salvar rascunho;
- Montar N unidades.

## 11. Site público

O cliente vê somente Cesta/Kit comercial.

Não mostrar código de lote.

Listagem por categoria pública.

No detalhe:
- nome;
- foto;
- preço final;
- disponibilidade;
- composição expandida por grupos quando aplicável.

Combinação é mostrada como um único item comercial, mas sua composição pode ser detalhada ao cliente.

## 12. Checkout e separação

Checkout compra uma Cesta/Kit comercial.

No backend:
- recalcular disponibilidade canônica;
- bloquear corrida concorrente;
- selecionar lotes FIFO para componentes montados;
- reservar/consumir exatamente os componentes necessários;
- para combinação, reservar cada Cesta/Kit componente de forma atômica.

Na separação, expandir os produtos físicos necessários, preservando referência ao item comercial vendido.

## 13. Estrutura de dados V2 isolada

Durante desenvolvimento, criar estruturas novas e independentes das tabelas atuais.

Nomes propostos (podem ser refinados no plano):
- `basket_v2_products` ou `basket_v2_catalog` — entidade comercial Cesta/Kit;
- `basket_v2_product_items` — composição por produtos;
- `basket_v2_components` — combinação por outras Cestas/Kits;
- `basket_v2_lots` — lotes físicos;
- `basket_v2_lot_items` — composição real congelada;
- `basket_v2_lot_financials` — snapshots/financeiro do lote, se separado for necessário.

A relação de combinação é normalizada 1→N. Não guardar múltiplos componentes apenas como JSON.

Integridade:
- FK entre entidades;
- impedir auto-referência;
- impedir componente combinado como filho de outra combinação;
- impedir duplicidade de componente sem intenção explícita; preferir aumentar `quantity`;
- índices para pai, filho, estado e disponibilidade.

## 14. Compatibilidade e migração

Durante desenvolvimento:
- seção antiga intacta;
- site público antigo intacto;
- checkout antigo intacto;
- V2 usa mesmas tabelas de produtos/estoque como fonte, mas suas próprias estruturas de cesta.

Antes do cutover:
1. migrar/espelhar modelos atuais para V2;
2. comparar composição;
3. comparar preços;
4. comparar disponibilidade;
5. comparar custo;
6. executar pedidos controlados;
7. validar separação;
8. somente então mudar storefront/checkout para V2.

Depois do cutover:
- seção antiga passa primeiro para somente leitura;
- histórico nunca é apagado;
- remoção visual da seção antiga ocorre somente após período de segurança.

## 15. Critérios de aceite

1. Criar Cesta/Kit com produtos em poucos passos.
2. Criar combinação com 1, 2, 3 ou muitos componentes.
3. Financeiro por componente e consolidado correto.
4. Nenhum custo ausente vira R$ 0,00 silenciosamente.
5. Montagem bloqueada se existir custo faltante.
6. Lote físico mantém snapshot financeiro histórico.
7. FIFO automático entre lotes.
8. Combinação usa menor disponibilidade de seus componentes.
9. Zerou qualquer componente → combinação sai do site.
10. Zerou lote e não há outro lote disponível → Cesta/Kit sai do site.
11. Categorias V2 controlam a navegação pública.
12. Pausar/Retomar funciona sem alterar estoque.
13. Site e checkout não conhecem códigos internos de lote como produto comercial.
14. Seção antiga continua funcionando até homologação e cutover.
15. Testes cobrem concorrência de checkout, estoque, custo, snapshots, combinação e regressão da seção antiga.

## 16. Fora do escopo inicial

- combinações recursivas multinível;
- fórmulas promocionais complexas;
- preço variável automático por margem;
- apagar histórico antigo;
- migrar imediatamente o site público antes de homologação;
- reescrever o cadastro geral de produtos.

## 17. Estratégia de entrega

A implementação deverá ser fatiada em PRs pequenos:
1. schema V2 + regras financeiras/estoque;
2. APIs V2;
3. nova seção Admin `Cestas e Kits`;
4. criação com produtos;
5. lotes + FIFO + snapshots;
6. combinações 1→N;
7. homologação lado a lado;
8. storefront V2;
9. checkout V2;
10. cutover controlado.

Cada etapa deve ter teste RED→GREEN e não deve remover a seção antiga antes do gate final.