# Cestas separadas em Alimentos + Limpeza/Higiene — 2026-09-29

## Regra operacional nova

A cesta comercial continua sendo uma única oferta para o cliente, com o mesmo preço-base e a mesma regra de valor oculto.

Fisicamente, porém, ela passa a ser composta por partes independentes:

- **Kit de Alimentos**: específico de cada modelo de cesta.
- **Kit Limpeza e Higiene (LH)**: único e compartilhado por todas as cestas que usam limpeza/higiene.
- **Cesta Econômica**: atualmente não usa LH porque o modelo atual não possui itens de limpeza/higiene.

O cliente não vê a regra interna de lote versus avulso.

## Modelos de kits

Foram criados os seguintes prefixos físicos de 2 letras + 1 número:

| Modelo | Prefixo |
|---|---|
| Econômica Bonini · alimentos | EB |
| Mini Bonini · alimentos | NB |
| Mini Koblenz · alimentos | NK |
| Pequena Bonini · alimentos | PB |
| Pequena Koblenz · alimentos | PK |
| Média Bonini · alimentos | MB |
| Média Koblenz · alimentos | MK |
| Grande Bonini · alimentos | GB |
| Grande Koblenz · alimentos | GK |
| Limpeza e Higiene universal | LH |

Exemplos de lotes físicos: `MB1`, `MB2`, `LH1`, `LH2`.

O número pode ser reutilizado somente quando o lote antigo não está mais ativo/pronto. Existem até 10 códigos simultâneos por modelo: 1–9 e 0.

## Modelo inicial do LH

Como os kits antigos de limpeza/higiene variavam por tamanho de cesta, foi necessário escolher uma base inicial para começar a nova estrutura.

O **Kit Limpeza e Higiene universal** foi inicializado com a composição da **Mini Bonini**. Esse é apenas o modelo inicial da nova estrutura; cada lote pode ser duplicado e alterado livremente.

## Criação rápida de lote

No Admin > Cestas:

1. escolha Alimentos da cesta desejada ou Kit Limpeza e Higiene;
2. use **Novo lote pelo modelo** ou, preferencialmente, **Duplicar**;
3. informe a quantidade de kits a montar;
4. escolha o código curto disponível;
5. altere somente o que mudou;
6. pode trocar produto, alterar quantidade, remover item ou adicionar outro produto;
7. o Admin mostra estoque solto e sugestões seguras;
8. o sistema recalcula quantos kits a composição suporta;
9. não permite confirmar lote acima do estoque solto.

O lote original nunca é modificado quando é duplicado.

Também existe atalho **Duplicar [código atual]** diretamente na tela principal de Cestas.

## Regra de venda da cesta

No momento em que o cliente escolhe uma cesta, o preço-base comercial da cesta é preservado.

A decisão de usar kit pronto ou estoque avulso é feita separadamente para cada grupo.

### Sem alteração

Se o cliente não alterar Alimentos:
- usa 1 unidade do lote de Alimentos.

Se o cliente não alterar Limpeza/Higiene:
- usa 1 unidade do lote LH.

### Alteração somente nos Alimentos

- Alimentos deixam de consumir o lote pronto;
- todos os alimentos da cesta passam a sair do estoque solto/avulso;
- LH continua sendo consumido do lote pronto se não foi alterado.

### Alteração somente em Limpeza/Higiene

- Alimentos continuam usando o lote pronto;
- Limpeza/Higiene passa inteira para estoque solto/avulso.

### Alteração nas duas partes

- nenhum kit pronto é consumido;
- todos os componentes efetivos saem como produtos avulsos.

A mudança de quantidade de qualquer item dentro de um grupo já transforma **aquele grupo inteiro** em avulso.

## Valor oculto

A transformação operacional de kit para avulso **não elimina o valor oculto da cesta**.

O pedido mantém:
- cesta comercial escolhida;
- preço-base da cesta;
- acréscimos/reduções comerciais decorrentes da personalização;
- diferença comercial/fiscal já usada pela arquitetura atual.

O banco grava `hidden_value_preserved=true` no snapshot do pedido novo.

## Estoque

Produtos dentro de lotes prontos continuam bloqueados do estoque solto.

Quando um grupo é usado como kit pronto:
- a unidade do lote é alocada ao pedido;
- seus componentes não recebem reserva avulsa local.

Quando um grupo virou avulso:
- nenhum lote desse grupo é baixado;
- os componentes reais são reservados no estoque solto.

A baixa física no Bling continua ocorrendo uma única vez no fluxo normal de saída, usando os SKUs efetivos do pedido.

## Pedido e separação

O pedido guarda um `separation_plan`.

Exemplo:

```text
Cesta Média Bonini
Alimentos: MB1
Limpeza/Higiene: LH1
```

Se somente Alimentos foram alterados:

```text
Cesta Média Bonini
Alimentos: avulso
Limpeza/Higiene: LH1
```

No Admin:
- a tela do pedido mostra exatamente o que pegar pronto e o que separar avulso;
- a impressão de separação cria um bloco **PEGAR PRONTO** com código e quantidade;
- componentes pertencentes a kit pronto não aparecem novamente na lista de produtos avulsos.

## WhatsApp

A mensagem enviada pelo site inclui somente as referências de kits que realmente serão usados.

Exemplo:

```text
REF. INTERNA DE SEPARACAO:
1x KIT ALIMENTOS MB1
1x KIT LIMPEZA/HIGIENE LH1
```

Se Alimentos foi alterado e apenas LH permaneceu pronto, só aparece o LH.

A mensagem não informa ao cliente termos como "virou avulso" ou a lógica interna da conversão.

## Virada segura da vitrine

Os 9 lotes completos antigos permanecem funcionando durante a transição.

A nova estrutura só entra na vitrine quando houver:
- ao menos 1 lote novo de Alimentos para **cada cesta ativa**;
- ao menos 1 lote novo LH para as cestas que usam Limpeza/Higiene.

A função `enable_split_baskets_for_ready_kits_v1` habilita cada modelo quando seus kits estiverem prontos.

O storefront só troca globalmente quando todas as cestas ativas estiverem habilitadas. Assim não há mistura parcial de arquitetura no carrinho.

## Testes executados

### Criação e duplicação

Teste temporário:
- criado `NB1`;
- duplicado para `NB2`;
- composição alterada;
- ambos criados corretamente;
- lotes de teste apagados.

### Personalização parcial

Teste com Mini Bonini:
- lote Alimentos `NB1`;
- lote Limpeza/Higiene `LH1`;
- cliente alterou apenas a quantidade de um item dos Alimentos.

Resultado:
- Alimentos: `mode=loose`;
- LH: `mode=lot`;
- somente `LH1` entrou em `basket_stock_allocations`;
- apenas os alimentos foram reservados como avulsos;
- `hidden_value_preserved=true`;
- cancelamento devolveu a alocação;
- pedido e lotes de teste foram removidos;
- flags de split retornaram ao estado de transição.

## Estado ao final desta rodada

- Nenhum lote novo real foi criado automaticamente.
- Os 90 cestos completos antigos permanecem contabilizados: no fechamento desta rodada, 89 estão disponíveis e 1 Pequena Bonini está legitimamente alocada a um pedido recebido e ainda não confirmado.
- A vitrine continua no modelo antigo até a montagem real dos novos kits.
- Admin já está preparado para duplicação rápida.
- `storefront-v2` publicado.
- `admin-products-live-v1` publicado.
- Migration: `20260929_basket_split_food_hygiene_kits_v1.sql`.


## Migração prática dos lotes completos antigos

Como os componentes dos 90 cestos originais ficam corretamente bloqueados enquanto estão dentro das cestas prontas, o estoque solto pode mostrar capacidade zero para alguns kits novos.

Foi adicionada a ação **Migrar unidades** no detalhe dos lotes antigos.

Uso:
1. desmonte fisicamente a quantidade escolhida de cestas completas;
2. no Admin, informe exatamente essa mesma quantidade em **Migrar unidades**;
3. esses componentes deixam de ficar bloqueados no lote antigo e voltam ao saldo solto;
4. use o saldo liberado para criar/duplicar os lotes de Alimentos e LH.

Durante a transição, o Admin sugere deixar pelo menos 1 cesta completa antiga disponível por modelo até que todos os kits novos estejam prontos. A operação pode ser parcial mesmo quando outra unidade do mesmo lote está alocada a pedido, porque somente `quantity_available` pode ser desmontada.

A operação não altera o estoque físico do Bling; apenas muda a classificação operacional de “dentro de cesta antiga” para “solto para remontagem”. Isso evita criar estoque artificial ou dar baixa duas vezes.


## Validação complementar e UX de migração

### Correção de saldo independente no carrinho

A vitrine foi ajustada para não usar o menor saldo combinado da cesta ao validar uma metade intacta.

Agora:
- Alimentos intactos usam exclusivamente `food_lot_quantity`;
- Limpeza/Higiene intacto usa exclusivamente `hygiene_lot_quantity`;
- um grupo personalizado usa somente a capacidade do estoque solto de seus próprios componentes.

Isso evita bloquear uma venda válida quando, por exemplo, Alimentos foram personalizados mas ainda existe LH pronto suficiente, ou vice-versa.

### Migração guiada no Admin

A tela **Cestas** passou a mostrar de forma direta:
- quantos modelos de Alimentos já possuem lote novo;
- se o Kit LH já está pronto;
- quantas unidades completas antigas ainda permanecem montadas;
- situação da virada da vitrine.

Cada cartão de Alimentos mostra também a quantidade antiga correspondente e possui o atalho **Liberar antigas**.

Quando o operador entra por esse atalho e confirma que desmontou fisicamente N cestas:
1. o lote antigo libera exatamente N unidades;
2. o Admin abre automaticamente o modelo de Alimentos correspondente;
3. inicia um novo lote;
4. preenche a quantidade com o mesmo N;
5. recalcula a capacidade usando o estoque solto real;
6. se houver divergência digital, mantém o lote em edição e informa a capacidade efetivamente comprovada.

Para o kit LH existe o atalho **Ver cestas antigas**, porque o LH é universal e seus componentes podem vir da desmontagem física de diferentes modelos antigos.

Cancelar/liberar um lote novo também exige confirmação explícita de que as unidades foram desmontadas fisicamente.

### Teste de troca automática de lote

Teste transacional com rollback:
- lote `NB8` como primeiro lote de Alimentos;
- lote `NB9` como segundo lote;
- `NB8` era o lote corrente;
- após zerar `NB8`, `NB9` passou automaticamente a ser o lote corrente.

Resultado: **aprovado**.

### Matriz de personalização validada

Testes transacionais com rollback:

| Situação | Alimentos | Limpeza/Higiene | Alocações de kit |
| --- | --- | --- | --- |
| Sem alteração | lote | lote | Food + LH |
| Só Alimentos alterados | avulso | lote | somente LH |
| Só LH alterado | lote | avulso | somente Food |
| Ambos alterados | avulso | avulso | nenhuma |

Nos quatro cenários a regra comercial continua preservada; nos cenários personalizados foi validado `hidden_value_preserved=true`.

Cancelamentos devolveram somente as alocações de kit que realmente tinham sido usadas.

### Teste de reserva/consumo sob autoridade Bling

Foi testado o cenário misto:
- Mini Bonini;
- Alimentos personalizados e portanto avulsos;
- LH intacto e portanto retirado do lote pronto.

Resultado:
- plano de separação: Alimentos `loose` + LH `lot`;
- demanda avulsa esperada: **14 unidades**;
- demanda realmente reservada: **14 unidades**;
- componentes exclusivos do LH indevidamente reservados como avulsos: **0**;
- `reserve_vitrine_order_stock_v1`: aprovado;
- `consume_vitrine_order_stock_v1`: aprovado;
- `physical_stock_changed=false`;
- soma de `products.stock` antes e depois do consumo permaneceu idêntica;
- `release_vitrine_order_stock_v1`: aprovado e sem restauração física artificial.

Conclusão: o fluxo misto não duplica baixa e continua respeitando o Bling como autoridade física.

Todos os dados de teste foram executados de forma transacional e revertidos. Ao final:
- lotes de teste: 0;
- pedidos de teste: 0;
- modelos ativos com split habilitado: 0;
- lotes novos reais prontos: 0;
- unidades completas antigas disponíveis: 89.

A virada real continua aguardando a desmontagem/montagem física feita pela operação.

### Versões verificadas

Na validação desta rodada:
- `admin-products-live-v1`: Edge Function ACTIVE, deployment **v96**, gateway interno **v58**;
- `storefront-v2`: Edge Function ACTIVE, deployment **v24**, fonte de vitrine split com health interno **v22**;
- `vitrine/admin/index.html`, `vitrine/index.html` e `index.html`: JavaScript validado sem erro de sintaxe.

A falha anterior que deixava o Admin sem Produtos/Cestas/Pedidos foi corrigida: havia uma declaração duplicada de `basketProductSearch`, que causava BOOT_ERROR. A abertura de **Gerenciar lotes** também foi corrigida para não enviar milhares de IDs de produto em uma única URL.
