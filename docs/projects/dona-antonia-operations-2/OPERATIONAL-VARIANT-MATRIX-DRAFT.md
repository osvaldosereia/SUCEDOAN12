# Dona Antônia Operations 2.0 — Matriz de Variantes Reais da Operação (DRAFT FINAL)

> Guia analítico resumido. Não implementar ainda.
> Atualização: 2026-09-25.

| Evento real | Documento/estoque alvo | Ação humana mínima | Automação desejada |
|---|---|---|---|
| Cliente não confirmou | nenhum fiscal | nenhuma | expirar/cancelar draft |
| Cancelou antes da separação | cancelar pedido/liberar reserva | nenhuma | total |
| Cancelou durante separação | retornar itens físicos | confirmar retorno | restante automático |
| NF-e autorizada, sem saída | cancelar NF-e se legalmente possível | supervisor só em exceção | estornos Bling |
| Cartão falhou, pagou outro meio | venda continua | entregador escolhe meio real | financeiro |
| Cartão falhou e desistiu | retorno não entregue | motorista + check-in retorno | NF-e entrada/retorno |
| Cliente ausente | retorno/reentrega | motorista motivo | fila reentrega |
| Recusa parcial | devolução parcial | selecionar itens recusados | preparar devolução |
| Devolução pós-entrega | NF-e devolução/entrada | receber + inspecionar | estoque/financeiro |
| Troca | devolução + nova saída | selecionar substituto | documentos e vínculos |
| Avaria no estoque | Quarentena -> perda ou fornecedor | bipar/confirmar | bloquear venda + preparar fiscal |
| Vencimento | Quarentena -> descarte | confirmar descarte | bloqueio + fila 5.927 |
| Roubo/extravio | baixa perda | supervisor | preparar 5.927 |
| Balanço com falta | investigar -> regularizar | só divergência | sem ação se bate |
| Balanço com sobra | investigar origem | supervisor | não criar estoque automaticamente |
| Compra CNPJ | entrada Bling/SEFAZ | check-in | estoque/financeiro |
| Compra CPF | staging até política fiscal | exceção | sem AP empresarial |
| Produto devolvido vendável | Quarentena -> Geral | inspeção | transferência |
| Produto devolvido não vendável | Quarentena -> perda | inspeção | fluxo descarte |

## Regra operacional
Funcionário registra o **fato físico**.
Sistema decide o **workflow digital**.
Bling executa o **ERP/fiscal**.
Contador homologa as naturezas fiscais.

## Regra de não exagero
Para a Dona Antônia não precisamos:
- gestão multi-loja;
- RMA complexo;
- WMS completo;
- módulo de manufatura;
- gestão de frota;
- dezenas de depósitos.

Precisamos somente:
- Geral;
- Quarentena;
- pedidos;
- retorno;
- perdas;
- lotes;
- delivery;
- pagamento;
- Control Tower.
