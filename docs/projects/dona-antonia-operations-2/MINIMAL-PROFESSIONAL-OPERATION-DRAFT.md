# Dona Antônia Operations 2.0 — Operação Profissional Mínima (FINAL DRAFT)

> Escopo deliberadamente simples: uma operação física, delivery próprio, sem multi-loja.

## Processos que realmente precisamos

### Entrada
- NF-e CNPJ via Bling/SEFAZ;
- Check-in;
- caixa/DUN;
- lote/validade;
- divergência;
- fornecedor;
- estoque/financeiro.

### Estoque
- Geral;
- Quarentena;
- balanço mobile;
- avaria/perda/vencimento;
- lotes;
- FEFO;
- recall.

### Venda
- site;
- WhatsApp/manual;
- confirmação;
- reserva;
- separação;
- conferência;
- fiscal;
- rota;
- entrega;
- pagamento.

### Pós-venda
- não entregue;
- devolução parcial/total;
- troca;
- refund;
- reentrega;
- reclamação.

### Gestão
- Control Tower;
- Precisa de você;
- ledger;
- IA;
- Bling.

## O que NÃO precisamos
- múltiplas filiais;
- transferências entre lojas;
- WMS complexo;
- gestão de frota;
- manufatura;
- ordem de produção;
- PDV/balcão;
- marketplace;
- comissão de vendedores;
- CRM paralelo completo;
- BI pesado;
- microserviços por domínio;
- data lake.

## Dois depósitos são suficientes
- Geral
- Quarentena

Eles são depósitos lógicos dentro da mesma empresa, não lojas.

## Cinco telas operacionais próprias são suficientes
1. Central
2. Pedidos/Nova venda WhatsApp
3. Tablet Separação
4. Balanço/Avaria/Retorno
5. Entregador

Compras/Check-in/Checkout/fiscal/financeiro preferencialmente Bling.

## Princípio final
**Customizar só onde a operação da Dona Antônia é diferente do ERP.**

## Indicadores essenciais
- pedidos aguardando confirmação;
- pedidos para separar;
- prontos;
- em entrega;
- não entregues;
- recebimento pendente;
- fiscal pendente;
- estoque crítico;
- perdas;
- vencimentos;
- Quarentena;
- XML/Check-in pendente;
- PapoAI/handoff;
- integrações com falha.

Não construir dezenas de KPIs antes de haver necessidade real.
