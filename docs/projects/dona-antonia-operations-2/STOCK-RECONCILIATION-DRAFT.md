# Dona Antônia Operations 2.0 — Reconciliação de Estoque e Política de Disponibilidade (DRAFT FINAL)

> Documento de análise. Não implementar ainda.
> Atualização: 2026-09-25.

## Fonte de verdade
Bling:
- saldo físico;
- saldo virtual;
- reserva;
- depósito;
- lote.

Supabase:
- espelho para o site;
- nunca autoridade independente.

## Saldo para vender
O Bling distingue:
- saldo físico;
- saldo virtual.

O saldo virtual é afetado por reservas de pedidos.

Webhooks oficiais existem para:
- `stock`;
- `virtual_stock`.

Fonte:
https://developer.bling.com.br/webhooks

## Política proposta
Site usa **saldo vendável espelhado do Bling**, preferencialmente baseado no saldo virtual do depósito Geral.

Quarentena é desconsiderada.

## Reserva
Pedido Aguardando confirmação:
- não reserva.

Pedido Aprovado:
- situação entra na configuração de reserva;
- saldo virtual cai.

Quando a saída física é lançada:
- reserva deve deixar de incidir para evitar dupla redução.

O Bling alerta explicitamente que manter uma situação de reserva depois do lançamento físico pode continuar reduzindo o saldo.

Fonte:
https://ajuda.bling.com.br/hc/pt-br/articles/360036512833-Como-dar-baixa-no-estoque-no-momento-que-o-pedido-for-feito-Reserva-de-estoque

## Site não consulta Bling por clique
Webhook atualiza:
- physical_stock;
- virtual_stock;
- observed_at.

Checkout lê localmente.

Em caso de espelho muito antigo:
- bloquear ou revalidar antes de confirmar pedido.

## Overselling
Gate de aprovação:
antes de transformar Aguardando -> Aprovado, confirmar que a reserva consegue ser sustentada.

Se outro pedido consumiu o saldo:
- não imprimir;
- cliente recebe necessidade de ajuste.

## Balanço
Contagem não deve apagar a causa da divergência.

Fluxo:
- contar;
- comparar;
- divergência vira reconciliação;
- aplicar movimento fiscal/operacional correto.

## Sobra
Não aumentar automaticamente se origem desconhecida.

## Falta
Não diminuir cegamente se pode existir:
- venda não sincronizada;
- entrada faltante;
- fator de conversão;
- devolução;
- perda.

## Quarentena
Nunca entra no saldo comercial.

Usos:
- retorno do cliente;
- retorno não entregue;
- avaria;
- vencido;
- recall;
- produto aguardando decisão.

## Transferências
Geral -> Quarentena:
- fato físico conhecido;
- preserva lote.

Quarentena -> Geral:
- somente após inspeção.

## Métricas
- divergência física x sistema;
- perdas;
- sobras;
- valor em Quarentena;
- reserva;
- estoque disponível;
- itens zerados;
- idade do espelho;
- último webhook.

## Anti-sobrecarga
Nada de sincronização integral frequente.

Usar:
- webhook;
- reconciliação incremental;
- varredura completa eventual/off-hours apenas como segurança.


## Implementação/homologação — 2026-09-25
A política deste documento começou a ser implantada em shadow mode.

Concluído:
- `bling_stock_mirror_v2` cobre 1.630/1.630 produtos ativos vinculados;
- backfill completo a partir do Bling;
- saldo vendável-alvo é o virtual do depósito Geral;
- `virtual_stock.updated` assinado atualiza o mirror diretamente;
- eventos antigos não sobrescrevem snapshots novos;
- nenhum webhook altera `products.stock`;
- nenhum webhook escreve de volta no Bling;
- 28 eventos reais de liberação foram processados automaticamente com HTTP 200;
- quatro produtos ativos seguem sem vínculo exato e permanecem fora do cutover automático.

O cutover do site ainda NÃO ocorreu porque checkout, readiness e confirmação possuem dependências do modelo legado `products.stock + vitrine_stock_reservations`.
