# Pedidos Dona Antônia — NF-e automática após separação (contrato, 08/10/2026)

## Decisão operacional definitiva

A aprovação do **cliente** por template Meta habilita a separação. A conclusão da
separação habilita, sem novo clique humano, as etapas de sincronização final no
Bling, geração da NF-e, envio à SEFAZ e consulta da autorização. Se faltarem
itens, faturar **somente os itens separados** e o total resultante.

Não converter `ready` em `out_for_delivery` após a autorização fiscal: o
motorista/expedição deve registrar o **fato físico** de saída. A nota autoriza
a saída, mas não a comprova. Cobrança na entrega segue como hoje.

## Evidências do código atual (não é um sistema pronto)

- `ops2_prepare_order_separation_completion_v2` já calcula `missing_subtotal`,
  atualiza `orders.total` e `orders.fiscal_subtotal`, e guarda os IDs separados.
- `buildSnapshot(...)` no `admin-products-live-v1` seleciona
  `deliverable_order_item_ids` após a conclusão.
- `orderSeparationComplete` já conclui antes de tentar as integrações, mas
  apenas dispara `runSeparationPostCompletionIntegrations` no contexto de
  Edge Function (`waitUntil`). Isso não substitui fila durável.
- `autoIssueFiscalAfterSeparation` chama a subaction destinada à emissão
  **humana** (`fiscal_dispatch_canary_human_execute`) com confirmação fixa
  `EMITIR_NFE`. A rota automática definitiva não deve registrar auditoria
  falsa de aprovação humana.
- `dispatch_fiscal_jobs` já registra `idempotency_key`, `invoice_id`,
  tentativas, autorização, incertezas e erros. Reaproveitar esse ledger.
- Os flags globais de escrita fiscal de produção estão desligados. Não os
  habilitar por migration; introduzir gate independente de automação, restrito
  à homologação e depois a rollout gradual autorizado.
- As transições `out_for_delivery`/`delivered` possuem proteções fiscais
  e de pagamento. Não eliminar esses gates.

## Contrato do processamento automático

1. No recebimento, registrar confirmação comercial verificável a partir do
   botão Meta e garantir precedência sobre a ANA. Nenhum texto livre de cliente
   pode autorizar automaticamente o faturamento.
2. No ato transacional de conclusão da separação, produzir uma **intenção
   durável** de pós-separação, com unicidade por pedido/versão. Somente
   persistência confirmada pode produzir jobs. A conclusão humana não fica
   dependente de disponibilidade momentânea do Bling/SEFAZ.
3. Ler snapshot de itens efetivamente separados. Atualizar a venda no Bling,
   retirar itens faltantes, recalcular total, outras despesas e qualquer
   acréscimo condicional de cesta à luz da composição final. Conferir
   correspondência de itens, quantidades e total entre Supabase e Bling.
   Caso o total comercial de cesta utilize valor fixo/oculto, reconciliar
   a classificação fiscal do acréscimo antes de emitir; não inventar tributo.
4. Assegurar situação correta do pedido no Bling (Verificado), com fila
   de recuperação nos HTTP 400/estoque virtual quando seguros para retry.
5. Executar preflight fiscal atual (NCM, origem, GTIN quando exigido, natureza
   de operação, destinatário, total, estoques, NF-e anterior).
6. Consultar documento anterior por chave externa/numeroLoja **antes**
   de qualquer POST irreversível. Um resultado incerto nunca habilita
   repetir o POST por tentativa cega. É permitido somente reconciliar.
7. Criar a NF-e pelo Bling e pedir autorização à SEFAZ por operação
   **automática explicitamente autorizada**, com auditoria source='automation'
   e flag/gate próprio; não reaproveitar `confirmation='EMITIR_NFE'`.
8. Polling controlado e/ou recebimento de webhook para conciliar número
   da nota, ID, chave de acesso e status autorizado/rejeitado.
9. Autorizada: habilitar operação de expedição, mostrar DANFE e atualizar
   trilha de auditoria. A baixa física de estoque é feita no ponto definido
   da **saída**, uma única vez.
10. Falhas transitórias: backoff e retry idempotente; falhas fiscais
    determinísticas: revisão humana **excepcional** sem destravar saída.
    Se tudo faltar, nunca faturar NF-e vazia.

## Padrão de filas

Preferir adaptar `dispatch_fiscal_jobs`/orquestração existente em vez de
criar outra fonte concorrente de estado. Se a intenção de pós-separação
precisar de novo outbox, ele representa somente uma intenção durável e
deve compartilhar `orders.id`, versionamento e unicidade. O snapshot não
deve mudar depois de um POST fiscal irreversível sem fluxo de correção
fiscal apropriado.

O worker deve ser autorizado por service role e credencial interna,
com auditoria e lease. Na homologação, **todos os transportes externos**
devem estar falsos/dry-run. Nunca alternar flags globais em paralelo para
pedidos diferentes sem lock transacional explícito e recuperação de lease.

## Etapas de homologação

- Contrato puro de decisão: `order-auto-fiscal-policy-v1.mjs` +
  `scripts/test-order-auto-fiscal-policy-v1.mjs`.
- Integrar o contrato no worker real com fila persistente (ainda não feito).
- Validar ajustes de item faltante e valor oculto de cesta.
- Criar subaction automática distinta, autenticação de serviço, dedupe,
  gates e telemetria (ainda não feito).
- Testar dois workers concorrentes, timeout em gerar-nfe, timeout em enviar,
  retorno autorizado atrasado, rejeição e reprocessamento seguro.
- Testar lote completo em ambiente isolado com Bling/Meta simulados.
- Após homologação e aprovação de liberação: rollout controlado, canário,
  monitoramento de erro e rollback sem apagar ledger nem notas anteriores.

## Limitação

Esta branch contém **o contrato de decisão e testes iniciais**. Não ativou
rotina automática na produção, não implantou worker, não enviou mensagens
nem gerou NF-e real. O PR #953 continua em draft com a antiga migration de
código de quatro dígitos; não deve ser integrado como está.
