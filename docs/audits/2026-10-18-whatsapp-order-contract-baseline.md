# DONA ANTONIA — Baseline de contratos operacionais (2026-10-18)

## Escopo e proteção

Esta preparação não modifica runtime, banco, autenticação, pedidos, estoque, Bling, NF-e, WhatsApp ou produção. Os testes de caracterização são locais e não usam credenciais. O workflow roda testes estáticos já existentes e um novo teste do fluxo manual WhatsApp.

## Fluxos a preservar

| Domínio | Contrato |
| --- | --- |
| Criação WhatsApp | `createManualWhatsappOrder` valida papel, telefone e itens |
| Criação canônica | `create_canonical_cart_order_v2` preserva a origem `manual_whatsapp` |
| Reserva | `reserve_vitrine_order_stock_v1` e `release_vitrine_order_stock_v1` |
| Separação | `ops2_prepare_order_separation_completion_v2`, `ops2_apply_order_separation_stock_v2`, `ops2_mark_order_separation_completion_v2` |
| Saída | `ops4_start_dispatch_v1` e gate fiscal |
| Entrega | `ops3_complete_delivery_v1` e conciliação de pagamento |
| Comunicação | Transporte WhatsApp existente, idempotência e rastreio de envio |
| Fiscal | Gate NF-e/Bling e reconciliação antes de emitir novamente |

## Achado crítico ainda não corrigido

O handler `createManualWhatsappOrder` escolhe `create_vitrine_cart_order_v3` quando todas as cestas ativas usam `split_kits_enabled=true`; caso contrário escolhe `create_canonical_cart_order_v2` com `p_source='manual_whatsapp'`.

Na função SQL implantada, `create_vitrine_cart_order_v3` tenta reservar estoque no momento da criação. Já `create_canonical_cart_order_v2` tenta reservar nesse momento apenas se `p_source='vitrine'`. O handler responde invariavelmente `source:'manual_whatsapp'`, `stock_reserved:false` e `reservation_timing:'on_confirmation'`. A resposta pode não refletir o estado persistido quando `splitReady=true`.

Na consulta pontual de 2026-10-18, existiam 15 cestas, seis ativas e apenas uma das ativas com `split_kits_enabled=true`. Logo a condição `splitReady` era falsa **naquele instante**. Não se pode garantir que permanecerá assim.

## Condições antes de alterar o fluxo

1. Testar os dois ramos com transações isoladas em ambiente de homologação, sem mensagens reais ou emissão fiscal.
2. Confirmar origem persistida em `orders.source`, estado da reserva e idempotência.
3. Cobrir falta de estoque, pedido duplicado, cancelamento, confirmação, separação com falta e concorrência.
4. Verificar a continuidade dos gates Bling/NF-e e de entrega/pagamento.
5. Somente depois propor correção pontual, revisão humana e implantação controlada.

## Baseline CI

```bash
node scripts/test-manual-whatsapp-order-contract-characterization.mjs
node scripts/test-admin-orders-clean-flow-v3.mjs
node scripts/test-admin-orders-fiscal-flow-v4.mjs
node scripts/test-admin-order-whatsapp-ui-integration.mjs
```

A aprovação desses testes estáticos **não substitui** testes transacionais e end-to-end. O novo teste documenta o comportamento atual, inclusive a inconsistência conhecida; não afirma que o contrato está correto.

## Critérios de saída

- CI estático verde no PR.
- Plano de homologação aprovado e executado em ambiente isolado.
- Nenhuma mudança na produção sem revisão do comportamento do estoque, Bling, fiscal e WhatsApp.
