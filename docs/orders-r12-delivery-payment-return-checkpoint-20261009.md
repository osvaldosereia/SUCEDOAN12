# R12 — Pagamento na entrega, retornos e fechamento operacional (09/10/2026)

**Projeto:** Dona Antônia · **Plano-mestre:** [#964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964) · **Base:** R11 [#1019](https://github.com/osvaldosereia/SUCEDOAN12/pull/1019).

## Auditoria canônica, somente leitura

As funções reais `ops_record_delivery_payment_v1`, `ops3_complete_delivery_v1`, `ops_register_failed_delivery_v1` e o trigger `ops_enforce_delivery_payment_before_delivered_v1` foram lidos de `ssbesxgaijknwsjbsbcz` através de `pg_get_functiondef`, sem executar ações sobre pedidos. Fontes arquivadas em `scripts/sql/orders-r12-real-delivery-payment-rpcs.sql`.

### Lacunas confirmadas pelo código

1. **Pagamento dividido:** `ops_record_delivery_payment_v1` pode registrar dois métodos e um total exato (ex.: R$70 PIX + R$70 dinheiro). Mas `ops3_complete_delivery_v1` exige `count(parts)=1` e confere somente a primeira parcela contra R$140, bloqueando a entrega após o pagamento legítimo.
2. **Proteção incompleta por função:** a RPC de pagamento verifica `orders.status`, total e idempotência, mas **não consulta** `order_delivery_return_cases` ou o recibo de prova fiscal R10. O Admin verifica retorno aberto antes de invocar, porém esse controle não deve depender apenas do endpoint.
3. **Mutabilidade/isolamento:** sem gatilhos adicionais, mudanças SQL diretas em parcelas e valores de pagamentos já capturados podem alterar a integridade da liquidação. O gatilho existente de `orders.status='delivered'` verifica soma, mas não protege todos os caminhos prévios de captura/retorno.
4. **Fluxo externo:** `ops_prepare_delivery_payment_bling_shadow_v1` continua bloqueado para homologação; **não é autorização para sincronizar pagamentos reais** nem mexer em conciliação fiscal.

## Desenvolvimento em branch isolada

- `supabase/sql/orders-r12-split-payment-delivery-complete-review-v1.sql`: patch idempotente **DRAFT** da RPC `ops3_complete_delivery_v1`, condicionado ao hash MD5 original `d20eb30841dae4ea7b3820e51a6ca7f9`. Preserva quitação de parcela única, aceita reutilizar pagamento já capturado de duas ou mais parcelas *apenas quando soma, métodos, quantidades e estado são válidos*, responde `payment_method=mixed`; não cria segundo recibo.
- `supabase/sql/orders-r12-payment-return-integrity-guard-review-v1.sql`: quatro funções de trigger e cinco triggers **DRAFT**. Exigem status de entrega e total em centavos, nenhum retorno ativo e prova fiscal R10 para pedidos R07 antes da captura. Protegem valores de quitação contra alteração, impedem abrir retorno após pagamento e executam **verificação diferida** de soma, quantidade, métodos e sequência das partes no final da transação (para compatibilidade com a RPC que cria settlement antes das parcelas). Sem alterar as regras e permissões de vendas legadas fora de R07.
- `scripts/sql/orders-r12-delivery-payment-fixture.sql`: insere tabelas mínimas de pagamento/devoluções no **mesmo PostgreSQL 17 fictício** da R02–R11, usando os UUIDs da cesta de R$140 já separada e com autorização SEFAZ **sintética**. As chamadas de registro de eventos e *shadow Bling* são mocks explícitos, sem rede.
- `scripts/sql/orders-r12-split-payment-baseline.sql`: demonstra a recusa do fechamento da entrega pela RPC anterior, apesar do pagamento válido, em transação com `ROLLBACK`.
- `scripts/sql/orders-r12-delivery-payment-assertions.sql`: chama as RPCs reais, confirma pagamento de R$140 em 2 partes, replay idempotente, bloqueio de segunda cobrança, valores imutáveis, retorno após captura recusado, entrega sem pagamento recusada, entrega concluída uma vez, R07 incerto sem R10 impedido de registrar pagamento, retorno pendente impede quitação. Comprovação do trigger de partes diferidas.
- A suíte R02–R11 reutilizada em `.github/workflows/orders-r2-r7-bling-chain-ci.yml` foi ampliada com a etapa R12, transportes Meta, Bling e fiscal desativados.

## Gates e limitações

- **Sem produção:** SQL é arquivo de revisão em `supabase/sql`, não migration aplicada. Não houve merge, deploy, alteração de cliente, pedido, estoque, fiscal, motorista, pagamento real ou WhatsApp.
- **A autorização SEFAZ no CI é fictícia**. Não há validação tributária de saída aprovada nem conexão de Bling/SEFAZ em staging; geração de NF-e R10 permanece bloqueada em desenvolvimento.
- Pagamentos no Bling ainda ficam em *shadow*. Um registro `captured` no laboratório não significa dinheiro recebido de verdade.
- Homologar RLS e gatilhos reais do banco canônico e qualquer caminho direto por PostgREST. Antes do deploy, executar migrações em staging, revisão financeira/contábil e testes com equipe.
- O Admin deve distinguir `mixed` no histórico, detalhar as parcelas e exibir mensagens claras `pagamento capturado`, `retorno em revisão` e `pedido sem NF-e`; isso ainda requer teste visual real de celular.

## Próximas ações

1. Verificar CI com as 12 rodadas sintéticas e corrigir qualquer falha.
2. Consolidar a PR R12 sobre a cadeia de desenvolvimento R02–R11 e registrar seu checkpoint.
3. R13: E2E completo com cópia real do esquema/RLS/Edge Function em staging e relatórios de divergência fiscal/estoque/cliente.
4. R14: rollout controlado apenas após aprovação tributária de saída, emissão/autorização SEFAZ genuína, templates Meta validados e plano de reversão.
