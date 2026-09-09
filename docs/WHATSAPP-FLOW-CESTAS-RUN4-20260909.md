# Dona Antônia — WhatsApp Flow Cestas — Run 4

Data: 09/09/2026

## Entregue nesta rodada

1. O Flow comercial passou de uma navegação de demonstração para um contrato de checkout estruturado e reutilizável.
2. Criado editor estruturado de cesta (`get_whatsapp_flow_basket_editor_v1`): lista componentes, quantidades, ações de alterar/concluir e mantém preço individual de componentes oculto.
3. Criada edição incremental de seleção (`patch_whatsapp_flow_basket_selection_v1`): valida remoção/quantidade/min/max/editabilidade durante a experiência e mantém validação comercial rígida separada para a escrita real.
4. Criado resumo real de carrinho (`format_whatsapp_flow_cart_review_v1`).
5. Criada finalização idempotente local (`finalize_whatsapp_flow_commercial_order_v1`) usando `confirm_cart_order_v2`, sem enfileirar Bling.
6. Criado cadastro/endereço idempotente para checkout (`save_whatsapp_flow_customer_checkout_v1`), reutilizando `save_whatsapp_basket_customer_v2`.
7. `handle_whatsapp_flow_commercial_exchange_v1` foi evoluído para integrar, quando todos os gates estiverem homologados:
   - início da cesta;
   - aplicação da personalização;
   - adicionais;
   - upsell opcional;
   - resumo real;
   - cadastro/endereço;
   - pagamento;
   - confirmação do pedido.
   Com os gates atuais OFF, o mesmo handler funciona em prévia sem gravar carrinho/pedido.
8. O JSON `whatsapp/flows/flow-cestas-comercial-v1.json` deixou de usar TextArea livre na personalização e passou a usar controles estruturados de ação, produto e quantidade.
9. O bridge `whatsapp-ingest-make-v1` foi atualizado e publicado na versão 4 para processar `nfm_reply.response_json` de forma determinística, resolver a sessão pelo `flow_token`, suprimir IA no retorno e, quando houver pedido confirmado, pedir localização no chat.
10. Criado `get_whatsapp_basket_component_readiness_v1` e `get_whatsapp_flow_commercial_readiness_v2` para impedir homologação real enquanto composição das cestas, transporte e provider ID não estiverem prontos.

## Segurança confirmada

```text
whatsapp_release_mode=live
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

`whatsapp_flow_write_operations=0`: nenhuma operação comercial do Flow foi gravada durante esta rodada.

## Descoberta importante — composição das cestas

A auditoria das 9 cestas ativas encontrou uma inconsistência anterior ao Flow: os `basket_template_items` apontam majoritariamente para registros antigos/inativos/não verificados do catálogo.

Estado atual:

- 9 cestas ativas;
- 0/9 aptas à escrita rígida do carrinho;
- cada cesta possui 14–27 componentes;
- apenas 3 componentes por cesta estão atualmente `is_active=true AND physically_verified=true`;
- sob o filtro estrito de produto vendável no WhatsApp, nenhuma cesta possui todos os componentes prontos.

A função existente `start_basket_cart` já bloqueia corretamente uma cesta se qualquer componente estiver inativo ou não verificado (`basket_has_unavailable_product`). Essa proteção **não foi afrouxada**.

Também não foi feito remapeamento automático de produtos, pois não houve correspondência segura por GTIN/SKU nem correspondência exata confiável. Substituir componentes por aproximação de nome seria comercialmente inseguro.

## Decisão técnica

A experiência visual de personalização pode ser homologada usando a composição comercial cadastrada, mas qualquer escrita real continua sujeita à validação rígida no backend.

Assim:

```text
Flow / prévia
→ valida regras da cesta (removível, editável, min/max)

Escrita real
→ valida novamente produto, disponibilidade e regras
→ se composição não estiver reconciliada, falha fechado
```

O novo readiness torna `ready_for_real_homologation=false` enquanto existir qualquer um destes bloqueios:

- `basket_components_not_reconciled`;
- `flow_provider_id_missing`;
- `flow_transport_not_ready`.

## Próximos passos

1. reconciliar os componentes das 9 cestas com a base atual de produtos sem correspondência aproximada insegura;
2. preferir fonte oficial de composição/código do Bling ou outro identificador estável para reconstruir `basket_template_items`;
3. concluir conversão/cache de imagem WebP → JPEG/PNG/base64 para o componente `Image` do Flow;
4. validar o JSON V2 no validador oficial da Meta e ajustar incompatibilidades de schema, se houver;
5. gerar/configurar chave Flow e provider ID real mantendo rollout 0%;
6. executar homologação allowlisted somente no número autorizado;
7. somente após todos os readiness gates verdes avaliar ativação controlada do Flow, sem alterar o canary geral e sem ativar Bling.

## Ação manual do proprietário

Nenhuma ação manual é necessária neste momento. O bloqueio das cestas é de reconciliação de dados e deve ser resolvido programaticamente/por fonte confiável antes de pedir qualquer intervenção manual.
