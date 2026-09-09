# WhatsApp Flow Cestas — Run 8 — 2026-09-09

## Objetivo

Continuar do Run 7 e separar explicitamente as regras de retirada, redução e aumento de componentes da cesta, sem relaxar a escrita strict/fail-closed e sem ativar nenhum gate.

## Implementação preparada

Migration: `20260909123000_whatsapp_flow_basket_adjustment_policy_v3.sql`.

### `get_whatsapp_flow_basket_adjustment_options_v1`

- recebe apenas uma cesta e um componente selecionado;
- calcula `min_quantity`/`max_quantity` a partir de `basket_template_items`;
- expõe somente quantidades realmente permitidas para aquele componente;
- distingue `removal_allowed`, `decrease_allowed` e `increase_allowed`;
- continua sem preço individual de componente;
- não consulta nem carrega catálogo completo.

### `patch_whatsapp_flow_basket_selection_v2`

Validação determinística antes de delegar ao validador legado:

- quantidade inteira e não negativa;
- zero somente se o componente for removível;
- redução/aumento somente se `quantity_editable=true`;
- limites mínimo/máximo continuam obrigatórios;
- validação final permanece no backend.

### `handle_whatsapp_flow_commercial_exchange_v3`

Foi criado um wrapper compatível sobre o handler V2.

Novos contratos preparados:

```text
PERSONALIZAR + basket_item_prepare
  -> AJUSTAR_ITEM
  -> backend entrega somente quantidades permitidas

AJUSTAR_ITEM + basket_item_apply
  -> valida alteração
  -> PERSONALIZAR
```

Todos os caminhos já existentes continuam delegados para `handle_whatsapp_flow_commercial_exchange_v2`, portanto busca dinâmica, múltiplos adicionais, upsell, revisão, cliente, pagamento e finalização permanecem preservados.

A Edge Function `whatsapp-flow-data-exchange-v1` foi preparada para chamar o handler V3 quando a definição for `flow-cestas-comercial-v1`.

## Teste estático

Novo teste:

`scripts/test-whatsapp-flow-basket-adjustment-policy-v3.mjs`

Protege:

- separação de remoção/redução/aumento;
- ausência de preço individual;
- backend validation;
- delegação V3 -> V2;
- rota do Data Exchange para V3;
- manutenção explícita dos gates OFF.

## Make auditado

O cenário `Dona Antônia - WhatsApp Outbound Event-Driven v3` já possui rota `interactive.type=flow` por HTTP para a Cloud API e o cenário inbound já envia `interactive.nfm_reply.response_json` ao Supabase. Nenhuma mudança adicional no Make foi necessária neste bloco.

## Segurança confirmada no Supabase antes desta mudança

```text
whatsapp_release_mode=live
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

## Estado de deploy

Os artefatos desta rodada foram versionados no GitHub. A migration e a nova versão da Edge Function não devem ser ativadas em produção até o Flow JSON ganhar a tela `AJUSTAR_ITEM` e passar pela homologação do schema da Meta. Isso evita colocar o backend em um contrato visual que o Flow publicado ainda não conhece.

## Próximo bloco

1. criar/validar Flow JSON V3 com `AJUSTAR_ITEM`;
2. concluir cache/conversão WebP/AVIF -> JPEG/PNG para fotos no Flow;
3. registrar chave pública e conectar app Meta;
4. validar integridade do endpoint;
5. manter rollout 0/gates OFF até teste exclusivo no número de homologação.

## Ação manual do proprietário

Nenhuma ação manual necessária para este bloco de código. A etapa manual da Meta continua sendo o registro/assinatura da chave pública e conexão do app quando a homologação técnica estiver pronta.
