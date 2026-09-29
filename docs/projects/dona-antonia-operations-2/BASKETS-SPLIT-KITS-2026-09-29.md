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
- Os 90 cestos completos antigos permanecem preservados.
- A vitrine continua no modelo antigo até a montagem real dos novos kits.
- Admin já está preparado para duplicação rápida.
- `storefront-v2` publicado.
- `admin-products-live-v1` publicado.
- Migration: `20260929_basket_split_food_hygiene_kits_v1.sql`.
