# Rodada 01/05 — Fechamento técnico e homologação isolada
Data: 18/10/2026. Branch `fix/admin-fiscal-hardening-20261018`; PR draft #1126.
**Situação: código/SQL transacional e testes de banco em staging concluídos. Não houve deploy/merge em produção. Integrações externas ponta a ponta permanecem fora da evidência.**

## Mudanças implementadas na branch
- `admin_order_stock_transition_atomic_v1` (SQL ainda marcado DRAFT): bloqueio `FOR UPDATE`, comparação de status real, reserva e confirmação em transação, cancelamento/liberação, patch limitado a campos operacionais, erro que reverte a transação.
- `admin-products-live-v1`: passa o status bruto do banco como `p_expected_status`; evita o erro `storefront_received` (exibido ao operador como `created`) e preserva o caminho anterior para `storefront_v2`, cuja origem não é aceita pela RPC de reserva existente.
- SQL trata `storefront_received -> confirmed` e `storefront_received -> cancelled`; rejeita confirmação de pedidos sem itens (`empty_order`).
- Atualizados os contratos do CI e adicionados testes SQL **executáveis** de homologação:
  - `supabase/tests/admin_atomic_stock_staging_plan.sql`
  - `supabase/tests/admin_atomic_stock_basket_staging.sql`
  - `supabase/tests/admin_operational_gates_staging.sql`.

## Homologação SQL realizada
Banco isolado: Supabase `trglbjtbkdkyqocufusw`. Produção `ssbesxgaijknwsjbsbcz` foi consultada **somente leitura**, para definições de esquema, funções e gatilhos. Nenhum dado real de pedido ou cliente foi copiado.

1. Reproduzidos com definição **idêntica à produção** os objetos de estoque `reserve_vitrine_order_stock_v1`, `consume_vitrine_order_stock_v1`, `release_vitrine_order_stock_v1`, `sync_vitrine_order_stock_reservation_v1` e `sync_basket_allocations_from_order_status_v1` (comparação do SQL de ambos os projetos: 5/5 iguais).
2. Reproduzidas identicamente as views `ops2_sellable_stock_v1`, `ops2_loose_sellable_stock_v1` e `basket_locked_component_stock_v1` (3/3 iguais), com tabelas de apoio fictícias para espelho Bling e estoque de cestas. O staging anterior usava mocks simplificados que não refletiam a produção; isso foi corrigido.
3. Reproduzidos gatilhos/funções reais para fila de confirmação da vitrine, conferência antes de `ready`, pagamento antes de `delivered`, portão fiscal de despacho e liberação de alocações de cestas.
4. **PASSOU**: `R1_STAGING_TESTS_PASSED` — pedido de vitrine real `storefront_received -> confirmed`, fila, patch, cancelamento, restauração física no modo legado, reserva/consumo/liberação sem alterar o físico no modo Bling, estoque insuficiente, versão obsoleta, pedido vazio, patch proibido, pedido manual, grants (`service_role` somente).
5. **PASSOU**: `BASKET_STOCK_PARITY_PASSED` — estoque reservado a cestas não é vendido como avulso; item pré-montado é tratado como tal, sem baixa física duplicada; cancelamento devolve alocação.
6. **PASSOU**: `OPERATIONAL_GATES_PASSED` — separação sem conferência é recusada; entrega sem pagamento válido é recusada; despacho sem autorização fiscal ou sem lançamento físico Bling é recusado; os estados válidos são aceitos.
7. Testes complementares passaram: duas chamadas simultâneas para confirmar o mesmo pedido (somente uma aceita); dois pedidos concorrentes para o mesmo produto com demanda conjunta superior ao saldo (somente uma reserva de 8/10 aceita); falha de gatilho após reserva desfaz pedido e reservas.
8. Segurança staging: RLS ativado em tabelas de apoio; views configuradas como `security_invoker`; revogada execução pública de funções sensíveis. Último advisor: sem findings de nível ERROR; resta aviso de proteção de senhas vazadas do Auth e INFO por RLS sem políticas (staging propositalmente restrito).
9. As três suítes SQL foram novamente executadas, obtendo PASS; a limpeza final deixou **zero pedidos e zero reservas** no staging.

## O que estes testes não demonstram
- Staging reproduz os **caminhos críticos** e os gatilhos selecionados, não todos os gatilhos e serviços de produção.
- Não foi feito deploy nem invocação ponta a ponta da Edge Function em staging. Testes de contrato no CI verificam o roteamento, mas não substituem essa execução.
- Bling usou registros fictícios em tabelas-espelho e lógica real das views/RPCs; não houve consulta, aprovação ou movimentação na API real do Bling.
- Não houve impressão física, envio de WhatsApp, emissão/autorização fiscal externa nem confirmação de entrega real.
- `storefront_v2` preserva CAS antigo por compatibilidade: não foi migrado à nova RPC de reserva. Fluxos manuais usam a reserva existente, mas o consumo em etapas posteriores depende de seus próprios processos operacionais.

## Decisão de liberação
**Rodada 01 transacional em staging: homologada.** Código preparado no PR **draft**, sem merge/deploy. **Homologação operacional integral (Edge Function + integrações externas em sandbox): ainda não comprovada**, portanto a liberação em produção segue bloqueada até sua execução e aprovação explícita. Essa distinção evita declarar homologado o que não foi testado.
