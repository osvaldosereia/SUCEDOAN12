# Dona Antônia Operations 2.0 — Validade, Lotes e Ofertas (DRAFT)

> Documento de análise. Não implementar ainda.
> Última atualização: 2026-09-25.

## Objetivo
Manter a política comercial:
- 60–90 dias: 10%;
- 30–59 dias: 20%;
- menos de 30 dias: 40%;
- vencido: não vender;

mas sem manter uma validade única falsa quando um produto possui vários lotes.

## Bling como fonte oficial de lote
O Bling atual oferece:
- lotes por produto simples/variação;
- fabricação e validade;
- depósito;
- saldo do lote;
- obrigatoriedade de data;
- alertas de vencimento;
- baixa automática pelo lote com validade mais próxima (FEFO).

Fontes oficiais:
- https://ajuda.bling.com.br/hc/pt-br/articles/32537052882967-Como-informar-o-lote-no-cadastro-do-produto-no-Bling
- https://ajuda.bling.com.br/hc/pt-br/articles/36277066728343-Como-configurar-a-obrigatoriedade-da-Data-de-Validade-e-ou-Fabrica%C3%A7%C3%A3o-no-Controle-de-Lotes
- https://ajuda.bling.com.br/hc/pt-br/articles/34291368501911-Como-usar-o-lote-no-pedido-de-venda-do-Bling
- https://ajuda.bling.com.br/hc/pt-br/articles/32537119046039-Relat%C3%B3rio-de-controle-de-lote-do-Bling

A API oficial também possui recursos de Produtos - Lotes e Produtos - Lotes Lançamentos.

## Problema com o modelo atual
Hoje o produto possui uma única `validity_date`.

Isso funciona somente se todo o saldo tiver a mesma validade.

Exemplo realista:
- lote A: 8 unidades, vence em 20 dias;
- lote B: 30 unidades, vence em 120 dias.

Aplicar 40% no produto inteiro faria 38 unidades serem vendidas com desconto, embora somente 8 estejam próximas do vencimento.

## Regra correta por lote
A oferta deve possuir **quantidade promocional disponível**, derivada dos lotes elegíveis.

Exemplo:
- 8 unidades <30 dias -> pool 40%;
- depois que 8 forem vendidas/baixadas -> preço volta ao normal ou à próxima faixa disponível.

Isso combina com FEFO do Bling, que baixa primeiro o lote mais próximo do vencimento.

## Preço regular
Bling continua fonte do preço regular/cadastro ERP.

O Bling também possui Listas de Preços, com desconto/acréscimo por valor/percentual, período e preços customizados.

Fontes:
- https://ajuda.bling.com.br/hc/pt-br/articles/360054015233-Como-criar-listas-de-pre%C3%A7os-para-os-produtos-no-Bling
- https://ajuda.bling.com.br/hc/pt-br/articles/360054015753-Como-utilizar-a-lista-de-pre%C3%A7os-nas-vendas-do-Bling

## Por que a oferta de validade deve continuar específica da Dona Antônia
Lista de Preços é regra comercial por produto/lista/período, mas nossa lógica depende de:
- lote;
- dias para vencer;
- quantidade restante naquele lote;
- FEFO;
- ativação/desativação por produto;
- vitrine online.

Portanto:
- Bling = lotes + saldo + preço regular;
- Dona Antônia = política automática de oferta por validade;
- pedido Bling recebe o preço efetivo vendido.

## Read model local
Não copiar todos os lotes a cada abertura de página.

Manter somente uma projeção pequena por produto quando necessário:
- nearest_expiry_date;
- promo_tier;
- promo_available_qty;
- promo_price;
- observed_at;
- source_version/ref.

Atualizar por:
- webhook/evento quando possível;
- reconciliação leve;
- alteração de lote/estoque.

## Checkout do site
Ao mostrar oferta:
- preço promocional;
- quantidade promocional restante;
- estoque geral.

Regra de venda:
1. até o limite `promo_available_qty`, aplicar desconto;
2. quantidade além do pool usa preço regular ou regra definida;
3. não permitir vender mais promo que o lote elegível;
4. pedido registra exatamente qual quantidade recebeu promoção.

A UI pode manter isso simples para o cliente.

## Pedido manual/PapoAI
Usar o mesmo motor de preço do site.
Atendente não escolhe percentual manualmente.

## Vencido
Se um lote vence:
- saldo daquele lote não deve ser disponibilizado para venda;
- produto só deve ser desativado integralmente se não houver outro lote vendável.

Isso é diferente da regra atual que pode zerar/desativar o produto inteiro com base em uma única data.

## Control Tower
Mostrar:
- lotes <90 dias;
- quantidade por faixa;
- valor de estoque em risco;
- produtos sem validade quando controle deveria existir;
- lotes vencidos com saldo;
- ofertas ativas;
- pool promocional acabando;
- divergência oferta x lote.

## IA
Pode:
- explicar risco de perda;
- recomendar promoção adicional;
- priorizar marketing;
- sugerir compra menor.

Não pode:
- inventar validade;
- alterar lote;
- mudar regra comercial sem aprovação.

## Custo e eficiência
Não rodar um job pesado sobre 1.600 produtos a cada minuto.

Melhor:
- eventos de estoque/lote;
- cálculo somente dos produtos afetados;
- resumo diário;
- reconciliação eventual.

## Gate
1. confirmar acesso API Produtos-Lotes;
2. testar lotes reais;
3. confirmar saldo por lote;
4. testar FEFO automático;
5. decidir venda parcial promo + regular no mesmo pedido;
6. validar preço efetivo enviado ao Bling;
7. validar fiscal de descontos;
8. só então substituir validity_date como fonte oficial.
