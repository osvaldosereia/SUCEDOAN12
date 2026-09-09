# WhatsApp Flow Dona Antônia — Run 12 — V25 + hard lock

## Estado auditado

A implementação evoluiu para `flow-cestas-comercial-v25.json`, definição `flow-cestas-comercial-v2`, handler determinístico `handle_whatsapp_flow_commercial_exchange_v9` e Edge Function `whatsapp-flow-data-exchange-v1` versão 12.

A V25 foi submetida ao validador de assets da Meta e retornou HTTP 200 com `success=true` e `validation_errors=[]`.

## Personalização V25

A personalização da cesta foi consolidada em uma única tela `PERSONALIZAR_A`, com até 27 slots estruturados de quantidade: 16 para alimentos e 11 para higiene/limpeza. O preço individual dos componentes não é exibido. A imagem principal é a imagem da cesta. Quantidade zero retira o componente somente quando a política determinística permitir.

Uma sessão sintética V2 confirmou alteração em lote com itens retirados (`quantity=0`) e itens aumentados (`quantity=2`) antes de avançar para extras.

## Extras e busca dinâmica

Regressão sintética executada com busca direta `sabonete`. O backend retornou somente 10 produtos reais correspondentes, com IDs, preços e imagens reais. O catálogo completo nunca foi carregado.

Um produto real foi selecionado e a quantidade 2 foi exercitada. A navegação avançou para `SECOES_B` e preservou as categorias macro para nova busca.

## Upsell, revisão e checkout

O caminho `Terminei de adicionar` retornou 6 sugestões opcionais reais. O caminho sem escolher upsell avançou normalmente para `REVISAO`.

A revisão preservou a regra comercial: cesta com preço próprio e componentes sem preço individual exposto.

Cliente não conhecido avançou para `CLIENTE_NOVO` com Cuiabá como cidade inicial e meios de pagamento vigentes. Com escrita comercial desligada, a finalização retornou `FINALIZAR`, `write_enabled=false` e a instrução para voltar à conversa e enviar localização.

## Correção nfm_reply V2

Foi identificado que `process_whatsapp_flow_nfm_reply_v1` aceitava somente `flow-cestas-comercial-v1`. A função foi corrigida para aceitar também `flow-cestas-comercial-v2`, registrar a definição no evento e devolver `location_required=true` quando existir pedido efetivamente finalizado. O texto de retorno solicita a localização no WhatsApp para confirmar o ponto da entrega.

A emissão de novo Flow token continuou fail-closed com os gates OFF (`experience_orchestrator_disabled`), como esperado.

## Incidente de rollout concorrente e hard lock

Durante a auditoria, outro processo colocou repetidamente o ambiente em `canary=100%` e ligou Orchestrator, Data Exchange, Flow Send e escrita comercial. O baseline seguro foi restaurado imediatamente.

O primeiro guardrail transacional ainda podia ser contornado por uma via concorrente. Por isso foi aplicado o hard lock `whatsapp_flow_rollout_hard_lock_v27`: enquanto ele existir, qualquer tentativa de canary acima de 1% ou de ligar Orchestrator, Data Exchange, Flow Send, escrita comercial ou Bling sync é rejeitada pelo PostgreSQL, inclusive via service role. A liberação futura exige uma mudança explícita de migration após autorização do proprietário.

Estado final confirmado:

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

Teste de tentativa de `whatsapp_flow_send_enabled=true` + canary 100 confirmou que o hard lock bloqueia e o estado permanece seguro.

## Make

Foram desligados os cenários temporários/não autorizados encontrados ativos durante esta rodada. O baseline ativo voltou a ser somente:

- Dona Antônia - WhatsApp Inbound Controlado v1
- Dona Antônia - WhatsApp Outbound Event-Driven v3
- consultar no cpf

O cenário temporário usado para validar a V25 ficou novamente inativo.

## Próximos blocos

1. regressão completa do `nfm_reply` V2 usando mensagem/token sintéticos quando houver forma segura de emiti-los sem liberar gates;
2. cliente existente na V25, confirmando reutilização de endereço sem nova digitação;
3. upsell selecionado com escrita transacional isolada/rollback, sem abrir gates globais;
4. regressão criptografada da Edge Function com hidratação real de imagens de cesta/produto;
5. preview no aparelho/número de homologação somente após autorização e sem remover o hard lock antes da hora.

Nenhuma ação manual do proprietário é necessária neste ponto.
