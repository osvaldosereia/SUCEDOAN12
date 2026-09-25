# Dona Antônia Operations 2.0 — Cancelamentos, Recusas, Devoluções e Trocas (DRAFT FINAL DE ANÁLISE)

> Documento de análise. Não implementar ainda.
> Atualização: 2026-09-25.

## Objetivo
Tratar corretamente as variantes reais do delivery sem transformar toda exceção em procedimento manual complexo.

Princípio:
**antes da circulação, cancelar; depois da circulação, retornar/devolver; depois da entrega, devolver/trocar.**

A decisão exata fiscal fica condicionada ao estágio real da mercadoria e da NF-e.

## Cenário 1 — cliente desiste antes de confirmar
Estado:
- pedido/draft ainda não aprovado;
- sem NF-e;
- sem baixa física.

Ação:
- cancelar localmente;
- cancelar pedido Bling se já tiver sido criado como Aguardando confirmação;
- não reservar;
- não imprimir;
- não gerar financeiro;
- registrar motivo.

Automático.

## Cenário 2 — cliente cancela depois de confirmar, mas antes da separação/NF-e
Ação:
- mudar pedido para Cancelado;
- liberar reserva;
- invalidar eventual impressão pendente;
- não emitir NF-e;
- não lançar contas.

Automático quando cancelamento for inequívoco.

## Cenário 3 — cancelamento durante separação, antes de NF-e
Ação:
- interromper pedido;
- operador devolve fisicamente itens à gôndola;
- liberar reserva;
- se ainda não houve baixa física oficial, não criar movimentação artificial;
- fechar como cancelado depois da confirmação do retorno físico.

A única interação humana é o retorno físico.

## Cenário 4 — pedido conferido/estoque lançado, mas NF-e ainda não autorizada
Se a estratégia de baixa ocorrer antes da NF-e:
- estornar lançamento de estoque;
- cancelar pedido;
- não emitir nota.

O Bling suporta estorno de estoque e contas de pedido.

Referências Bling:
- https://ajuda.bling.com.br/hc/pt-br/articles/360036005114-Lan%C3%A7ar-e-estornar-estoque-de-vendas
- https://ajuda.bling.com.br/hc/pt-br/articles/360036347134-Lan%C3%A7ar-e-estornar-contas-de-vendas

Essa é outra razão para preferir baixa física vinculada à NF-e/autorização quando o fluxo fiscal homologado permitir: reduz retrabalho antes da saída.

## Cenário 5 — NF-e autorizada, mercadoria AINDA NÃO saiu
Se a operação realmente não ocorreu e não houve circulação:
- pedir cancelamento da NF-e dentro das regras/prazo aplicáveis;
- Bling consegue cancelar a NF-e;
- se estoque/contas foram lançados pela própria nota e a configuração estiver correta, o Bling pode estornar esses lançamentos ao cancelar.

Referências:
- https://ajuda.bling.com.br/hc/pt-br/articles/360034461714-Cancelar-uma-nota-fiscal
- https://ajuda.bling.com.br/hc/pt-br/articles/28210338039063-Quais-s%C3%A3o-as-op%C3%A7%C3%B5es-de-lan%C3%A7amento-no-envio-de-NF-e
- RICMS/MT, cancelamento de documento eletrônico condicionado à não saída:
  https://www.sefaz.mt.gov.br/legislacao/SubIndice.aspx?ID=27

Não confundir exclusão de nota no ERP com cancelamento fiscal.

## Cenário 6 — cartão falha na entrega, cliente troca forma de pagamento
Não é cancelamento.

Exemplo:
- previsto: crédito;
- cartão recusou;
- cliente paga PIX.

Ação:
- pedido continua entregue;
- registrar meio efetivo;
- financeiro Bling recebe a forma real;
- manter trilha previsto x efetivo.

Nenhuma devolução fiscal porque a venda foi concluída.

## Cenário 7 — cartão falha e cliente desiste/recusa toda a entrega
A mercadoria já saiu fisicamente com NF-e.

**Não tratar como simples cancelamento de NF-e.**

RICMS/MT atual determina que, quando mercadoria retorna por não ter sido entregue ao destinatário, o estabelecimento emite NF-e de entrada referenciando o documento original. O transporte de retorno é acompanhado pelo documento de saída com anotação do motivo.

Referência:
https://www.sefaz.mt.gov.br/legislacao/SubIndice.aspx?ID=53
e art. 201, V:
https://www.sefaz.mt.gov.br/legislacao/SubIndice.aspx?ID=27

Fluxo:
1. entregador marca NÃO ENTREGUE;
2. motivo: pagamento recusado / cliente desistiu;
3. não registrar recebimento financeiro;
4. pedido fica `returning_to_warehouse`;
5. motorista retorna mercadoria;
6. operador confirma fisicamente o retorno;
7. sistema prepara/gera NF-e de entrada/retorno referenciando a NF-e original, conforme natureza homologada;
8. mercadoria entra inicialmente em Quarentena;
9. inspeção decide se volta ao estoque vendável;
10. financeiro é reconciliado sem recebimento.

O Bling suporta nota de entrada para devolução de venda e devolução vinculada à venda original.

Referências:
- https://ajuda.bling.com.br/hc/pt-br/articles/360037138954-Como-inserir-uma-nota-de-entrada-para-devolu%C3%A7%C3%A3o-de-venda
- https://ajuda.bling.com.br/hc/pt-br/articles/360037180494-Como-gerar-uma-nota-de-devolu%C3%A7%C3%A3o-a-partir-da-venda-salva

## Cenário 8 — cliente recusa somente parte da entrega
Exemplo:
- produto avariado;
- item errado;
- cliente aceita o restante.

Não alterar silenciosamente a NF-e original.

Fluxo:
- entregador marca RECUSA PARCIAL;
- seleciona item/quantidade;
- recebe somente o valor efetivamente devido conforme política comercial;
- mercadoria recusada retorna;
- emitir devolução/retorno parcial referenciando documento original;
- ajustar financeiro/refund conforme necessário.

Bling suporta devolução parcial a partir da nota de venda.

## Cenário 9 — cliente devolve produto depois de ter recebido
Fluxo profissional:
1. localizar venda/NF-e original;
2. registrar motivo;
3. gerar devolução de venda total/parcial;
4. produto retorna para Quarentena, não diretamente ao Geral;
5. inspecionar;
6. se vendável -> transferir para Geral;
7. se não vendável -> perda/descarte;
8. financeiro: estorno/reembolso/crédito conforme acordo.

O Bling trata devolução de venda como nota de entrada e pode relacioná-la à nota original.

## Cenário 10 — troca de produto
Não fazer "troca invisível" de estoque.

Modelo profissional:
- devolução do item original;
- inspeção/entrada;
- nova saída do item substituto (novo pedido/NF-e ou documento adequado);
- referências cruzadas.

Isso mantém estoque e fiscal auditáveis.

## Cenário 11 — pedido não entregue por cliente ausente/endereço
Não é cancelamento automático.

Fluxo:
- NÃO ENTREGUE;
- retorno ao depósito;
- retorno fiscal/estoque conforme documento já emitido e estágio;
- pedido vira `redelivery_pending` se cliente quer nova tentativa;
- em nova saída, documento fiscal/logístico deve seguir política homologada.

Não criar segundo pedido comercial apenas por uma tentativa frustrada.

## Estados adicionais necessários
Sem exagerar no número de estados:
- `returning_to_warehouse`
- `return_received`
- `return_fiscal_pending`
- `refund_pending`
- `redelivery_pending`

A UI do funcionário continua simples:
- NÃO ENTREGUE
- DEVOLVIDO AO DEPÓSITO
- PROBLEMA

A complexidade fica no backend/Control Tower.

## Política de estoque no retorno
Nunca devolver automaticamente ao estoque vendável apenas porque o motorista voltou.

Primeiro:
**Quarentena**

Depois:
- Embalagem íntegra / produto vendável -> Geral
- Avariado / vencido / violado -> fluxo de descarte
- dúvida -> supervisor

## Automação
Pode ser automática:
- geração da tarefa de retorno;
- identificação da NF-e original;
- preparação da devolução;
- cálculo dos itens/quantidades;
- entrada em Quarentena;
- atualização de fila;
- mensagens ao cliente.

Exige humano:
- confirmação de que produto retornou fisicamente;
- condição do produto;
- refund/ajuste excepcional;
- qualquer situação fiscal que não bata com o fluxo homologado.

## Gate contábil
A natureza/CFOP exatos da devolução para consumidor final e os efeitos financeiros devem ser homologados com contador antes da automação de emissão.
