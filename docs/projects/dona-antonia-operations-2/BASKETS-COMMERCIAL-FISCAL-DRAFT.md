# Dona Antônia Operations 2.0 — Cestas Personalizáveis, Bling e Fiscal (DRAFT)

> Documento de análise. Não implementar ainda.
> Última atualização: 2026-09-25.

## Objetivo
Manter a experiência especial da Dona Antônia:
- cesta tem preço comercial próprio;
- cliente não vê preço unitário dos componentes;
- cliente pode remover/aumentar itens permitidos;
- total é recalculado por regra determinística;
- separação/estoque/fiscal conhecem os produtos reais.

## Estado atual do motor
A função `create_vitrine_cart_order_v1` já implementa:
- preço-base da cesta;
- componentes;
- removível;
- quantidade editável;
- mínimo/máximo;
- add_unit_delta;
- remove_unit_delta;
- componentes individualizados em `order_items`;
- total comercial separado da soma dos preços normais dos componentes.

Hoje a diferença positiva entre total comercial e soma fiscal vai para `other_expenses`; diferença negativa vai para `discount`.

O sincronizador atual envia ao Bling:
- cada componente real como item;
- `outrasDespesas`;
- desconto;
- total final.

## O que o Bling nativo resolve
Produtos com composição:
- produto pai + componentes;
- estoque pode ser controlado pelos componentes;
- preço do pai pode ser manual e diferente da soma;
- Checkout pode desmembrar o kit e conferir os componentes.

Fontes oficiais:
- https://ajuda.bling.com.br/hc/pt-br/articles/360035495774-Cadastrar-produtos-com-composi%C3%A7%C3%A3o-kit
- https://ajuda.bling.com.br/hc/pt-br/articles/38697602211479-Como-atualizar-o-pre%C3%A7o-de-venda-das-composi%C3%A7%C3%B5es-com-base-nos-componentes-no-Bling
- https://ajuda.bling.com.br/hc/pt-br/articles/8029910215575-Como-desmembrar-os-produtos-com-composi%C3%A7%C3%A3o-no-checkout-de-pedidos-de-venda

## Limitação para Dona Antônia
A composição do Bling é cadastro estrutural do produto.

Nossa cesta muda por pedido:
- cliente remove;
- aumenta;
- troca;
- quantidade final varia.

Não é profissional criar centenas de variações/composições para representar combinações temporárias.

Portanto a cesta personalizada precisa continuar sendo montada pelo motor Dona Antônia.

## Duas representações possíveis no Bling

### Modelo A — produto pai "Cesta" com composição fixa
Bom para cesta sem alteração.
Ruim quando a composição real muda por pedido.

Risco:
Bling entende estrutura padrão, não necessariamente o que foi separado fisicamente naquele pedido.

### Modelo B — componentes reais como itens do pedido
Cada arroz/feijão/óleo etc. entra no pedido com a quantidade efetiva escolhida pelo cliente.

Vantagens:
- estoque correto;
- Checkout confere o que realmente vai na cesta;
- lote/FEFO correto por produto;
- NCM/tributação individual;
- picking mostra itens reais;
- substituição fica explícita.

**Direção preferida para cestas personalizadas.**

## Descoberta fiscal importante
A legislação/layout NF-e exige detalhamento de produtos com, entre outros campos:
- código;
- descrição;
- quantidade;
- unidade;
- valor unitário;
- valor total do item.

A legislação de MT também trata "outras despesas acessórias" como campo separado dos valores dos produtos.

Fontes oficiais:
- Portal NF-e / leiaute de produtos: https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=AoPQKN2Orqw%3D
- Regulamento MT / dados do produto e totais: https://www.sefaz.mt.gov.br/legislacao/SubIndice.aspx?ID=27

### Consequência
Usar a margem comercial da cesta inteira como `outrasDespesas` pode ser tecnicamente conveniente, mas NÃO deve ser considerado automaticamente a melhor solução fiscal.

Precisamos validar se essa diferença é realmente uma despesa acessória ou se o correto é distribuir o preço comercial entre os produtos.

## Modelo fiscal candidato — rateio do preço comercial
Exemplo:
componentes pelos preços de referência = R$100
preço comercial da cesta = R$120

Em vez de:
- itens = R$100
- outras despesas = R$20

candidato:
- distribuir os R$120 entre os componentes usando uma regra determinística de rateio;
- cada item continua com valor próprio;
- soma dos itens = preço comercial da cesta;
- cliente no site continua vendo apenas "Cesta R$120";
- NF-e/Bling vê os produtos reais.

O rateio pode usar como peso:
- preço regular de venda de cada componente;
- ou outra base fiscal homologada.

Exemplo proporcional:
produto que representava 20% da cesta continua com 20% do valor comercial final.

## Por que esse modelo parece melhor arquiteturalmente
- não cria produto artificial "diferença";
- não precisa usar embalagem falsa só para fechar total;
- cada produto mantém NCM/tributação;
- pedido/Checkout/estoque trabalham com itens reais;
- total fiscal pode coincidir diretamente com total comercial.

## Mas ainda não está aprovado
Distribuição/rateio afeta valor unitário e eventualmente base tributária.

Portanto precisa de:
1. simulação no Bling;
2. NF-e de homologação;
3. validação com contador/fiscal;
4. conferir ST/CEST e produtos com regimes diferentes;
5. conferir arredondamentos;
6. decidir tratamento de descontos e acréscimos por personalização.

## Personalização
Regra atual deve continuar conceitualmente:
`basket_base_price + soma(deltas)`

Depois:
1. calcular composição final;
2. calcular total comercial;
3. gerar alocação fiscal dos itens conforme política homologada;
4. enviar itens reais ao Bling.

IA não calcula preço.
Preço é determinístico.

## Checkout Bling
Como os itens chegam individualmente no Modelo B:
- Checkout lê cada EAN real;
- não depende de desmembrar uma composição variável;
- picking/reforço de localização funciona normalmente.

A cesta permanece como agrupamento comercial no nosso pedido:
- basket_id;
- basket_name;
- componentes;
- regras;
- total comercial.

No Bling, os componentes são a verdade operacional/fiscal da venda.

## Impressão de separação
Folha 85 mm pode agrupar visualmente:

Cesta Grande
  2x Arroz
  3x Feijão
  ...

mas o estoque/Checkout continua por componente.

## Histórico do cliente
Manter dois níveis:
- cliente comprou "Cesta Grande";
- componentes reais daquela compra.

Isso permite:
- repetir a cesta comercial;
- analisar consumo por produto;
- mostrar histórico amigável.

## Produtos de cesta no Bling
Ainda pode ser útil cadastrar as cestas padrão como produtos com composição para:
- referência;
- preço-base;
- simulações;
- vendas manuais fixas.

Mas não usar automaticamente o produto-pai como única linha de uma cesta que foi personalizada.

## Gate final
Antes da implementação:
1. homologar Modelo B em pedido Bling;
2. validar Checkout com componentes;
3. validar lote/estoque;
4. definir rateio fiscal;
5. testar desconto e acréscimo;
6. gerar NF-e de teste;
7. validar DANFE;
8. validar contador;
9. somente então remover `other_expenses` como mecanismo padrão se o rateio for aprovado.
