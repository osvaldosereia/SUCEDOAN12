# Dona Antônia Operations 2.0 — Pós-venda, Consumidor, Reclamações e Recall (DRAFT FINAL DE ANÁLISE)

> Documento de análise. Não implementar ainda.
> Atualização: 2026-09-25.

## Por que isso entra no projeto
A Dona Antônia vende exclusivamente por delivery/site/WhatsApp. Portanto o pós-venda não é exceção marginal; ele faz parte do fluxo normal do comércio eletrônico e da venda fora do estabelecimento.

## Direito de arrependimento
O art. 49 do CDC prevê 7 dias para desistência quando a contratação ocorre fora do estabelecimento, inclusive por telefone ou a domicílio.

O Decreto 7.962/2013 exige, no comércio eletrônico:
- informações claras;
- ferramenta para corrigir erros antes da conclusão;
- confirmação imediata da contratação;
- canal eletrônico eficaz para dúvida/reclamação/suspensão/cancelamento;
- possibilidade de exercer arrependimento pela mesma ferramenta usada na contratação;
- confirmação imediata do recebimento do pedido de arrependimento;
- comunicação ao meio financeiro para estorno quando aplicável.

Fontes:
- https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm
- https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm

## Consequência no produto
Site e WhatsApp devem oferecer um caminho simples:
**Cancelar / Solicitar devolução / Informar problema**

Não obrigar cliente a telefonar ou procurar outro canal.

PapoAI pode receber a solicitação, mas o motor Dona Antônia classifica o caso.

## Produto com vício/avaria
CDC art. 18 considera impróprios, entre outros:
- vencidos;
- deteriorados;
- avariados;
- inadequados ao consumo.

Portanto a operação precisa tratar:
- produto chegou amassado/rasgado/vazando;
- item errado;
- quantidade errada;
- produto vencido;
- qualidade inadequada.

Não tratar automaticamente como “cliente desistiu”. É uma ocorrência de qualidade/pós-venda.

## Tipos mínimos de ocorrência
- arrependimento/cancelamento;
- produto errado;
- quantidade errada;
- avaria;
- vencido;
- qualidade;
- falta de item;
- cobrança/pagamento;
- entrega;
- recall/interdição.

## Tela administrativa
Ao abrir uma reclamação:
- pedido;
- item;
- lote quando conhecido;
- motivo;
- quantidade;
- foto opcional;
- solução desejada;
- status.

Possíveis soluções:
- substituir;
- devolver;
- reembolsar;
- abatimento;
- nova entrega;
- encaminhar ao supervisor.

Funcionário não decide imposto/CFOP.

## Reembolso
Se pagamento ainda não ocorreu:
- nenhum refund.

Se pagamento ocorreu:
- registrar `refund_pending`;
- executar reembolso real no meio apropriado;
- só depois marcar `refunded`.

Bling consegue:
- estornar recebimento;
- estornar/cancelar contas a receber conforme origem/estado.

Fontes:
- https://ajuda.bling.com.br/hc/pt-br/articles/360037584694-Como-estornar-um-recebimento
- https://ajuda.bling.com.br/hc/pt-br/articles/31941091713431-Como-estornar-uma-conta-a-receber-no-Bling

Não marcar “reembolsado” apenas porque a nota de devolução foi emitida.

## Troca
Fluxo:
1. devolver/regularizar item original;
2. inspecionar retorno;
3. criar nova saída/substituição;
4. registrar vínculo entre os dois movimentos.

Evita corrigir estoque com atalhos invisíveis.

## Recall/recolhimento de alimentos
A Anvisa mantém regra de recolhimento de alimentos e rastreabilidade. Empresas da cadeia precisam colaborar com a segregação/retirada do lote quando houver recolhimento.

Fontes:
- https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2022/rdc-655-2022
- https://www.gov.br/anvisa/pt-br/centraisdeconteudo/publicacoes/alimentos/perguntas-e-respostas-arquivos/recolhimento-de-alimentos.pdf
- https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2026/anvisa-determina-recolhimento-de-sardinha-por-contaminacao-por-salmonella

## Fluxo simples de recall
1. receber aviso de fabricante/Anvisa/fornecedor;
2. identificar GTIN + lote;
3. bloquear venda daquele lote;
4. transferir estoque físico afetado para Quarentena;
5. localizar vendas daquele lote quando a rastreabilidade estiver disponível;
6. gerar lista de clientes afetados;
7. PapoAI/WhatsApp envia comunicação quando necessário;
8. receber produtos retornados;
9. seguir orientação do fornecedor/autoridade para devolução/descarte;
10. ledger registra encerramento.

Não criar módulo sanitário gigante. Um fluxo de ocorrência por lote é suficiente.

## Papel do lote
O controle de lote do Bling é essencial não só para validade, mas para recall:
- saldo por lote;
- depósito;
- histórico;
- vendas filtráveis por lote;
- FEFO.

## Prova de entrega
Para entrega própria, não precisamos copiar Bling Envios.

Registro mínimo:
- delivered_at;
- entregador/dispositivo;
- nome de quem recebeu (opcional);
- pagamento efetivo;
- observação;
- localização da parada/rota;
- foto apenas quando política exigir.

Não exigir assinatura/foto em todas as entregas se isso tornar o processo lento.

## Control Tower
Indicadores:
- reclamações abertas;
- devoluções aguardando retorno;
- refunds pendentes;
- reentregas;
- itens retornados em Quarentena;
- recall aberto;
- clientes a contatar;
- SLA de resolução.

## Automação
Automático:
- classificar solicitação simples;
- localizar pedido;
- sugerir solução;
- abrir devolução;
- bloquear lote em recall;
- enviar confirmação ao cliente.

Humano:
- inspecionar produto retornado;
- aprovar exceção financeira;
- decidir caso ambíguo;
- confirmar descarte.
