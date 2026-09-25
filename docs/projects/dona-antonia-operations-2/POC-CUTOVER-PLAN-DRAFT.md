# Dona Antônia Operations 2.0 — Sequência de POCs, Homologação e Cutover (DRAFT)

> Documento de análise. Nenhuma execução autorizada por este arquivo.
> Atualização: 2026-09-25.

## Regra
Não fazer big-bang.

Pedidos antigos continuam legado somente leitura.

Nova arquitetura entra apenas para pedidos criados após um timestamp de cutover.

## POC 1 — Bling base
- corrigir escopo `situacoes/modulos`;
- ler catálogo de situações;
- criar situações necessárias em homologação/configuração;
- provar update de situação;
- provar webhooks;
- provar deduplicação;
- provar rate limit/retry.

Gate: verde antes de qualquer dependência de workflow.

## POC 2 — Pedido aguardando confirmação
Criar 1 pedido de teste no Bling:
- situação Aguardando confirmação;
- sem reserva;
- cliente/produtos corretos.

Depois confirmar:
- situação Aprovado;
- reserva aparece;
- evento retorna.

## POC 3 — Impressão 85 mm
- template com foto;
- nome;
- EAN;
- quantidade;
- gôndola/prateleira;
- QR;
- QZ Tray ou agente mínimo;
- retry/reimpressão;
- revisão de pedido.

## POC 4 — Separação/Checkout
- tablet real;
- leitor real;
- Picking/Packing;
- cesta com componentes;
- checkout parcial;
- Verificado;
- automação de estoque.

## POC 5 — Estoque/Balanço/Lotes
- Conferência de Estoque nativa;
- leitor Bluetooth/USB;
- balanço apenas conferidos;
- lançamento no depósito Geral;
- webhook de estoque;
- lote/validade;
- FEFO.

## POC 6 — Cestas e fiscal
- componentes reais;
- preço comercial;
- alternativa de rateio;
- desconto/acréscimo;
- NF-e homologação;
- DANFE;
- validação contábil.

## POC 7 — Fiscal entrega domiciliar
Com contador:
- confirmar Portaria 262 art. 2 III;
- CNAE;
- requisitos do comprovante POS;
- campos XML;
- campo de pagamento na NF-e;
- NF-e antes da saída;
- pagamento real depois.

## POC 8 — PapoAI
- novo endpoint mínimo;
- evento duplicado;
- confirmação/cancelamento;
- localização;
- Flow;
- humano;
- template utilidade;
- venda manual fallback.

## POC 9 — Rota/entregador
- 5 a 10 paradas;
- endereço + pin;
- duas rotas;
- Maps;
- entrega não concluída;
- pagamento efetivo/split.

## POC 10 — Control Tower
- ledger;
- Precisa de você;
- health;
- timeline;
- copiloto read-only;
- approvals.

## Shadow mode
Antes do cutover:
- nova lógica observa pedidos reais sem executar efeitos críticos;
- comparar com processo atual;
- registrar diferenças.

## Canary
Depois:
- 1 pedido real;
- depois pequeno lote;
- depois todos os pedidos novos.

## Rollback
Cada domínio precisa ter rollback próprio.

Exemplos:
- webhook pode ser pausado;
- pedido volta a fluxo manual;
- impressão manual disponível;
- Bling continua ERP;
- PapoAI pode transferir tudo para humano;
- rota pode ser manual;
- IA pode ser desligada sem parar operação.

## Cleanup
Somente depois de estabilidade:
1. confirmar zero dependência;
2. confirmar zero tráfego útil;
3. backup/export;
4. remover cron;
5. remover função;
6. remover tabela;
7. smoke test;
8. atualizar documentação.

Nunca limpar e migrar simultaneamente.
