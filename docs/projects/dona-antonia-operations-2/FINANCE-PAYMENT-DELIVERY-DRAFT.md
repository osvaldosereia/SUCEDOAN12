# Dona Antônia Operations 2.0 — Financeiro, Pagamento na Entrega e Fiscal (DRAFT)

> Documento de análise. Não implementar ainda.
> Última atualização: 2026-09-25.

## Objetivo
Fechar um modelo seguro para vendas com pagamento somente na entrega, mantendo Bling como ERP/financeiro e permitindo alteração da forma de pagamento no momento real da entrega.

## Fatos atuais da Dona Antônia
Meios de pagamento praticados:
- PIX;
- dinheiro;
- cartão de crédito;
- cartão alimentação;
- cartão refeição;
- possibilidade operacional de divisão em mais de um meio/cartão.

Não há venda fiada, boleto ou prazo para cliente final.

## Capacidades nativas atuais do Bling confirmadas
Fontes oficiais consultadas em 2026-09-25:
- https://ajuda.bling.com.br/hc/pt-br/articles/360035630474-Como-cadastrar-uma-forma-de-pagamento-no-Bling
- https://ajuda.bling.com.br/hc/pt-br/articles/360036358474-Inserir-um-pedido-de-venda
- https://ajuda.bling.com.br/hc/pt-br/articles/360038073453-Como-inserir-mais-de-uma-forma-de-pagamento-na-nota
- https://ajuda.bling.com.br/hc/pt-br/articles/360036347134-Lan%C3%A7ar-e-estornar-contas-de-vendas
- https://ajuda.bling.com.br/hc/pt-br/articles/360036853693-Como-dar-baixa-em-uma-conta-a-receber

O Bling suporta tipos fiscais específicos:
- dinheiro (tPag 01);
- cartão de crédito (03);
- cartão de débito (04);
- vale alimentação (10);
- vale refeição (11);
- PIX dinâmico (17);
- PIX estático/transferência (20);
- outros e sem pagamento, quando aplicável.

O Bling permite:
- formas de pagamento diferentes por parcela;
- múltiplas formas de pagamento na nota;
- conta a receber com baixa total/parcial;
- destino em Caixa/Bancos ou Contas a Receber;
- taxa e prazo de recebimento configuráveis por forma de pagamento.

## O que isso significa para Dona Antônia
O ERP é capaz de representar corretamente os meios usados na entrega, inclusive alimentação/refeição e divisão de pagamento.

A camada Dona Antônia deve capturar o **fato real da entrega**:
- forma efetivamente usada;
- valor por meio;
- eventual troca de meio;
- bandeira/adquirente/transação quando exigido;
- operador/entregador;
- data/hora;
- total conferido.

Depois, Bling recebe/reflete esse fechamento.

## Problema crítico encontrado no sistema atual
O fluxo atual possui uma contradição arquitetural.

### Regra A — readiness fiscal atual
`refresh_order_fiscal_readiness_v1` só deixa o pedido fiscalmente `ready` quando:
1. pedido já está `delivered`;
2. entrega confirmada;
3. pagamento confirmado;
4. valor recebido igual ao total.

### Regra B — gate de expedição atual
`check_order_dispatch_fiscal_gate_v1` está em modo:
- `dispatch_gate_mode='enforce'`;
- `require_fiscal_authorization_before_dispatch=true`.

Portanto a mercadoria deveria ter NF-e autorizada **antes de sair**.

### Contradição
Para emitir fiscal pelo readiness atual, precisa entregar primeiro.
Para sair para entrega pelo gate atual, precisa estar fiscalmente autorizado primeiro.

Isso forma um ciclo impossível no fluxo normal.

Há canários/exceções históricas que permitiram alguns testes, mas a arquitetura final não pode depender disso.

## Situação observada no banco
- 86 pedidos totais;
- meios: 25 PIX, 19 cartão de crédito, 5 refeição, 4 dinheiro, 1 alimentação, 32 sem método;
- 11 controles fiscais;
- 9 ainda estão delivery/payment pending + fiscal blocked;
- 1 entregue + pagamento PIX confirmado + fiscal ready.

O fechamento atual no Admin:
- só confirma pagamento depois de status `delivered`;
- assume um único meio;
- confirma sempre o valor total do pedido;
- não representa split entre dois cartões/meios;
- não registra mudança estruturada de meio;
- reduz alimentação/refeição para categorias simplificadas em partes do código.

## Risco fiscal específico em Mato Grosso
Fontes oficiais:
- https://www5.sefaz.mt.gov.br/servicos?c=16773297&e=74924341&s=74926054
- https://app1.sefaz.mt.gov.br/Sistema/legislacao/legislacaotribut.nsf/7c7b6a9347c50f55032569140065ebbf/5fec2f97d5ad548404258a760050b920

SEFAZ-MT exige, para operações alcançadas pela regra, vinculação tecnológica entre comprovante de pagamento eletrônico e NF-e/NFC-e para cartão, PIX e outros meios eletrônicos.

Implicação: o desenho final não pode simplesmente "chutar" a forma de pagamento antes da entrega e corrigir depois sem validar a conformidade.

## Decisão de projeto provisória
Separar três conceitos:

### 1. Meio previsto
Informado pelo cliente no site/WhatsApp:
- "pretendo pagar em cartão".

Serve para operação/logística, não é necessariamente o fato financeiro final.

### 2. Meio efetivo
Registrado na entrega:
- PIX;
- dinheiro;
- crédito;
- alimentação;
- refeição;
- split.

É o fato financeiro oficial.

### 3. Documento fiscal
Deve seguir regra fiscal/SEFAZ homologada para o momento correto de emissão e para o meio de pagamento que precisa constar/vincular.

## Fluxos candidatos a homologar

### Candidato A — NF-e antes da saída, pagamento posterior
Pedido -> separação -> conferência -> NF-e autorizada -> saída -> entrega -> pagamento/baixa.

Vantagem:
- respeita gate de documento antes da circulação.

Problema:
- meio efetivo pode mudar na porta;
- precisa definir como informar pagamento no documento antes de ele ocorrer;
- em MT há exigência de vinculação para pagamentos eletrônicos, então este desenho exige validação fiscal/contábil específica.

### Candidato B — documento fiscal muito próximo/na entrega
Pedido -> separação -> rota -> meio efetivo capturado -> fiscal -> entrega concluída.

Vantagem:
- documento reflete meio efetivo.

Problema:
- risco de circulação da mercadoria antes da autorização;
- precisa confirmar se o processo operacional e legal permite a emissão no momento correto.

### Candidato C — fiscal antes da saída com informação apropriada de pagamento pendente + financeiro após entrega
Somente considerar se contador/SEFAZ confirmar que o uso do meio fiscal correspondente é correto para estas vendas e que a vinculação posterior atende MT.

Não assumir como válido apenas porque existe tPag 90 "Sem Pagamento".

## Gate obrigatório
Antes da implementação final:
1. revisar com documentação fiscal oficial vigente;
2. confirmar o CNAE/regime/obrigatoriedade concreta da Dona Antônia;
3. validar no Bling como a NF-e originada do Pedido de Venda trata pagamentos futuros;
4. validar integração TEF/POS/PIX exigida em MT, se aplicável;
5. homologar com contador/consultoria fiscal da empresa;
6. só então definir o momento de emissão.

## Modelo operacional recomendado para o Admin
Independentemente do momento fiscal, a tela do entregador precisa aceitar:

Pedido #...
Total R$ X

**Pagamento previsto:** cartão de crédito

Na entrega:
- [PIX]
- [Dinheiro]
- [Crédito]
- [Alimentação]
- [Refeição]
- [+ Dividir pagamento]

Split:
- Crédito R$ 100
- Refeição R$ 80
- Total R$ 180

Botão:
**Confirmar recebimento**

O sistema valida soma = total e cria um evento financeiro único com componentes.

## Modelo de dados conceitual necessário
Não implementar ainda.

`order_payment_settlements`
- id
- order_id
- status
- total
- confirmed_at
- confirmed_by
- delivery_event_id
- source

`order_payment_parts`
- settlement_id
- method
- amount
- provider/band
- transaction_reference quando aplicável
- financial_account/portador Bling
- fee rule
- expected_receipt_date

O Bling continua fonte oficial do financeiro. Essas estruturas seriam somente prova operacional/ponte/auditoria quando necessárias.

## Contas financeiras sugeridas conceitualmente
No Bling, avaliar separar:
- Caixa/Dinheiro;
- Banco/PIX;
- Cartões a Receber;
- Vale Alimentação a Receber;
- Vale Refeição a Receber.

Para cartão/benefícios:
- configurar taxa;
- configurar prazo de recebimento;
- conciliar depois.

## Central de Controle
A Control Tower deve mostrar:
- entregues sem pagamento confirmado;
- pagamento dividido;
- pagamento divergente do previsto;
- pagamentos eletrônicos sem vínculo/referência esperada;
- contas a receber não criadas;
- baixa financeira pendente;
- divergência pedido x NF-e x recebimento;
- cartões/benefícios a receber por data;
- diferenças de taxas.

## Papel da IA
A IA pode:
- explicar divergência;
- sugerir reconciliação;
- agrupar pendências;
- comparar pedido x Bling x pagamento;
- gerar fechamento diário.

A IA não deve:
- inventar pagamento;
- marcar recebimento sem evidência/ação autorizada;
- escolher tPag em cenário fiscal incerto;
- alterar valor de recebimento sem gate.

## Próxima análise relacionada
- mapear configuração real de formas de pagamento existentes no Bling;
- verificar capacidades de integração/vínculo de pagamento eletrônico em MT;
- desenhar fechamento do entregador;
- confrontar NF-e x pagamento na entrega com contador/SEFAZ;
- integrar resultado na arquitetura final.
