# Dona Antônia Operations 2.0 — Revisão Cruzada Pré-Projeto Final

> Resultado da revisão de contradições em 2026-09-25.

## Contradições atuais que o Projeto Final deve eliminar

### 1. Pedido -> Bling
Hoje: pedido vai ao Bling quando começa separação.
Alvo: pedido aparece cedo no Bling como Aguardando confirmação.

### 2. Reserva
Hoje: Supabase reserva no checkout.
Alvo: não reservar até cliente confirmar; Bling reserva após aprovação.

### 3. Baixa de estoque
Hoje: Supabase reduz saldo ao iniciar/consumir separação.
Alvo: Bling é fonte oficial; baixa conforme Checkout/transição homologada.

### 4. Balanço
Hoje: tela boa, mas grava estoque somente no Supabase.
Alvo: Bling recebe lançamento oficial de balanço.

### 5. Fiscal
Hoje: readiness exige entregue + pago, mas expedição exige fiscal antes de sair.
Alvo: fiscal antes da saída; pagamento real e financeiro depois, sujeito à homologação fiscal.

### 6. Pagamento
Hoje: um único meio e valor total.
Alvo: previsto, fiscal e efetivo separados; efetivo pode ser split.

### 7. Cestas
Hoje: componentes + diferença em outras despesas.
Alvo: componentes reais permanecem; política fiscal da diferença precisa homologação (rateio é candidato).

### 8. Validade
Hoje: uma data pode desativar produto inteiro.
Alvo: lotes Bling; oferta limitada à quantidade do lote elegível.

### 9. PapoAI
Hoje: endpoint aposentado ainda recebe chamadas.
Alvo: adapter mínimo e canônico.

### 10. Admin
Hoje: foco em pedidos `source=vitrine`.
Alvo: fila operacional multicanal.

### 11. Segurança
Hoje: PIN administrativo desemboca em owner.
Alvo: Owner/Supervisor/Operador/Entregador/Automation.

### 12. Webhooks
Hoje: desligados.
Alvo: principal mecanismo de sincronização.

### 13. Control Tower
Hoje: informação fragmentada.
Alvo: ledger mínimo + attention + approvals.

### 14. Eficiência
Hoje: 100 Edge Functions, 56 tabelas e 3 crons ativos fisicamente.
Alvo: consolidar após homologação; nenhum polling vazio.

## Pontos que já estão suficientemente definidos
- papel do Bling;
- papel do Supabase;
- papel do PapoAI;
- venda manual;
- aprovação antes da separação;
- impressão automática;
- separação e conferência;
- balanço;
- lote/validade;
- rota;
- entregador;
- Control Tower;
- IA;
- segurança;
- exceções;
- confiabilidade.

## Gates humanos restantes
1. contador/fiscal: entrega domiciliar + campos NF-e + cesta/rateio;
2. acesso/configuração Bling: permissões de situações e usuários;
3. testes físicos: tablets, leitores, impressora, POS.

## Conclusão
A análise arquitetural está próxima do fechamento.

Depois da validação desses gates, o Projeto Final pode ser escrito sem depender de descobrir novas funções durante a programação.

## Complemento final — pós-venda, recebimento e recall
A rodada final adicionou cinco pontos que devem constar do Projeto Master:
1. vendas por site/WhatsApp precisam de fluxo claro de cancelamento/arrependimento e pós-venda;
2. devolução/refund é processo próprio, não exclusão retroativa da venda;
3. Check-in de Recebimentos Bling deve tratar falta/dano/incorreto/recusa antes do estoque;
4. estoque vendável deve seguir saldo virtual do depósito Geral, refletido por webhook;
5. recall/interdição por lote precisa bloquear venda, segregar em Quarentena e permitir rastrear clientes afetados.

O escopo continua simples: uma operação física, delivery próprio, dois depósitos lógicos (Geral e Quarentena), sem WMS ou multi-loja.
