# WhatsApp Flow Cestas — Run 8 — 2026-09-09

## Objetivo

Continuar do Run 7 e separar explicitamente as regras de retirada, redução e aumento de componentes da cesta, sem relaxar a escrita strict/fail-closed e sem ativar nenhum gate.

## Implementação concluída no GitHub

Migrations:

- `20260909123000_whatsapp_flow_basket_adjustment_policy_v3.sql`;
- `20260909124500_whatsapp_flow_basket_adjustment_contract_v3_fix.sql`.

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

Wrapper compatível sobre o handler V2. O contrato visual final desta rodada é:

```text
PERSONALIZAR + basket_customize_v3
  edit -> AJUSTAR_ITEM
  continue -> fluxo legado seguro -> SECOES

AJUSTAR_ITEM + basket_item_apply
  -> valida alteração no backend
  -> PERSONALIZAR
```

A tela `PERSONALIZAR` não oferece mais uma lista global de quantidades. Primeiro o cliente seleciona o componente; só então o backend retorna as quantidades realmente permitidas para aquele item.

Todos os demais caminhos continuam delegados para `handle_whatsapp_flow_commercial_exchange_v2`, preservando busca dinâmica, múltiplos adicionais, upsell opcional, revisão, cadastro/endereço, pagamento e finalização.

A Edge Function `whatsapp-flow-data-exchange-v1` foi preparada para chamar o handler V3 quando a definição for `flow-cestas-comercial-v1`.

## Flow JSON V3

Artefato criado:

`whatsapp/flows/flow-cestas-comercial-v3.json`

Características:

- Flow 7.1 / Data API 3.0;
- nova tela `AJUSTAR_ITEM`;
- `PERSONALIZAR -> AJUSTAR_ITEM | SECOES`;
- `AJUSTAR_ITEM -> PERSONALIZAR`;
- nenhuma quantidade genérica no editor de cesta;
- catálogo completo continua proibido;
- extras continuam por seção, termo segmentado ou busca direta;
- produtos extras mostram preço real do Supabase;
- upsell permanece opcional;
- checkout e retorno ao WhatsApp permanecem preservados.

## Teste estático

`scripts/test-whatsapp-flow-basket-adjustment-policy-v3.mjs`

Protege:

- contrato visual V3 e roteamento da tela `AJUSTAR_ITEM`;
- separação de remoção/redução/aumento;
- ausência de preço individual dos componentes;
- backend validation;
- delegação V3 -> V2;
- rota do Data Exchange para V3;
- manutenção explícita dos gates OFF.

A suíte principal de CI do repositório passou para o head do PR antes da atualização final desta documentação; nova execução é esperada após este commit.

## Supabase auditado

Readiness real consultado nesta rodada:

- 9 cestas ativas no WhatsApp;
- 9/9 com `preview_ready=true`;
- 0/9 com `cart_write_ready=true`;
- composição integralmente resolvida em `public.products` para prévia;
- escrita real continua bloqueada pela verificação estrita dos componentes.

Flags confirmadas:

```text
whatsapp_release_mode=live
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

## Make auditado

O cenário `Dona Antônia - WhatsApp Outbound Event-Driven v3` já possui rota `interactive.type=flow` para a Cloud API. O cenário `Dona Antônia - WhatsApp Inbound Controlado v1` já preserva `interactive.nfm_reply.response_json` até o Supabase. O backend já transforma o retorno concluído em solicitação para o cliente enviar localização no chat.

Nenhuma alteração no Make foi necessária neste bloco.

## Imagens

A auditoria confirmou que muitos produtos vendáveis ainda usam imagens `.webp`. A Edge atual hidrata somente JPEG/PNG em base64, portanto o cache/conversão WebP/AVIF -> JPEG/PNG segue como pendência de homologação visual. Nenhuma imagem original será alterada.

## Estado de deploy

Os artefatos V3 estão versionados e testados no GitHub, mas as novas migrations e a Edge V3 **não foram aplicadas em produção** nesta rodada. Essa decisão é intencional: o JSON V3 ainda precisa passar pelo validador/editor oficial da Meta e o transporte continua sem homologação completa. Assim evitamos que backend e Flow publicado operem com contratos diferentes.

## Próximo bloco

1. validar `flow-cestas-comercial-v3.json` no tooling oficial da Meta e corrigir qualquer incompatibilidade de schema;
2. concluir cache/conversão WebP/AVIF -> JPEG/PNG para fotos;
3. registrar/assinar chave pública e conectar o app Meta;
4. validar health check e criptografia de ponta a ponta;
5. só então aplicar migrations/Edge V3 em homologação, mantendo rollout e gates desligados para clientes;
6. liberar escrita apenas quando `cart_write_ready` estiver estritamente satisfeito e houver autorização explícita.

## Ação manual do proprietário

A única ação manual externa que continua necessária é a etapa da Meta: registro/assinatura da chave pública e conexão do app ao Flow. Nenhum gate deve ser ligado nessa etapa.
