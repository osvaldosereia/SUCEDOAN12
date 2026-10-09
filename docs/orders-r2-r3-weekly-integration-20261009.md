# Checkpoint R02+R03 — Identidade semanal no checkout canônico (09/10/2026)

**Projeto:** Dona Antônia · **Plano-mestre:** [#964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964) · **PR de integração:** [#1026](https://github.com/osvaldosereia/SUCEDOAN12/pull/1026).

## Contexto e política de integração
- O checkout e as cestas corrigidas estão empilhados em **R02 #966 → #988 → #991 → #994**. O código da numeração semanal foi elaborado na **R03 #968**, cujo pai é **#953**, uma cadeia independente. Fazer merge de #953 ou de versões antigas de números com quatro dígitos pode sobrescrever o checkout seguro.
- Esta branch `agent/orders-r2-r3-identity-20261009` é baseada em **#994** e transporta *somente* o contrato de R03, sem merge automático da cadeia antiga, evitando perder a correção do mínimo R$75 ou do kit de alimentos/higiene.
- Todos os arquivos permanecem em desenvolvimento, exceto as migrações de origem já existentes. A migração `20261008032000_order_public_identity_at_creation_v1.sql` é **draft no GitHub, não aplicada no banco real**.

## Implementado
1. Migração R03 exata da numeração `DD|MM|AAAA - NNN` (Cuiabá), sequência semanal reiniciada segunda-feira, `BEFORE INSERT orders` gera o mesmo código copiado `AFTER INSERT` ao snapshot; protege identidade imutável e preserva importações/legado.
2. Contratos R03, testes SQL e Node e workflow atualizados para o novo empilhamento R02.
3. Seis consumidores do número público aceitam o código completo, sem truncar: `montar/app.js`, `vitrine/admin/index.html`, `admin-orders-v1`, `admin-products-live-v1`, `admin-order-vitrine-send-v1`, `order-separation-notify-v1`. Formatos históricos quatro dígitos e `AA001` permanecem válidos.
4. **Sétimo banco PostgreSQL 17 efêmero:** `orders-r2-r3-weekly-bridge-fixture.sql` + migração R03 + checkout real R02 capturado da produção + cestas/lotes/moldes + correções R02 em revisão. `orders-r2-r3-checkout-identity-assertions.sql` compara código semanal do pedido e snapshot após executar o checkout, confirma `item_count` pós-transação, imutabilidade de pedido e snapshot, não numeração do `bling_import`, ignorar código fornecido falsamente por `manual_whatsapp`.
5. **Concorrência no mesmo banco:** duas compras simultâneas disputam duas unidades de produto fictício de R$80. Ambas recebem número semanal exclusivo e snapshot coerente; uma terceira é recusada sem estoque. R03 também testa virada domingo/segunda e contador transacional.

## Evidências e limitações
- A primeira execução da integração foi **SUCCESS em dois workflows**: [R02 #37975743438](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37975743438) e [R03 #37975743421](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37975743421). Teste de concorrência adicional foi acionado depois e necessita resultado verde no último commit.
- Testes **isolados** em PostgreSQL17 e Node22, sem credenciais Bling/SEFAZ/Meta e sem dados de clientes. R02 ainda não é clone integral: seu modelo de estoque Bling, RLS históricos, triggers administrativos completos e Meta seguem parcialmente simulados. O formato semanal ainda depende de avaliação de todos os canais reais.
- Na `main` e no Supabase de produção nenhuma alteração foi efetuada; nenhum pedido/NF-e/estoque/WhatsApp foi escrito. **Não aplicar ou mesclar** PR #968/#953 e #1026 indiscriminadamente. A estratégia de integração final deve escolher a cadeia nova, fazer staging e executar rollback canário.

## Próxima rodada
Consolidar R04 (botão Meta CONFIRMADO verificado) e R05 (bloqueio de separação antes da confirmação), produzindo E2E sintético com checkout R02+R03 e garantia de número preservado no webhook/picker. Depois R06–R10 com a fila e autorização fiscal; regras de CFOP/CST/CSOSN continuam bloqueando emissão automática.
