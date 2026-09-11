# Dona Antônia Agent Core — Rodada 4 — checkpoint V50

Data: 2026-09-11

## Estado alcançado

A suíte sintética profissional do Agent Core concluiu 97/97 cenários aprovados, sem falhas, sem erros e sem falhas críticas.

Run oficial da suíte sintética: `0b599b53-332d-4286-bdb6-aee43b637b96`.

A suíte cobre informação e comparação de cestas, composição real, busca de cestas por itens, produtos avulsos, ofertas, entrega, pagamento, personalização, checkout, confirmação final, erros de digitação, segurança, handoff, jornada completa e pós-venda.

## Evoluções V36–V50

- V36: ferramenta read-only `wa_get_basket_contents` para composição real de cesta, sem expor preço individual/custo/estoque de componentes.
- V37/V38: políticas determinísticas de área de entrega Cuiabá/Várzea Grande, ofertas, formas de pagamento e não-fiado.
- V39/V40/V43/V49: calibração do corpus de avaliação para distinguir falha real de critério artificial, preservando segurança comercial.
- V41: nomes completos das famílias de cestas reconhecidos como `basket`.
- V42: `wa_find_baskets_by_items` resolve em uma consulta perguntas como “quais cestas têm arroz e feijão”.
- V45/V46: contexto compacto de pedido confirmado sem PII e guarda de pós-venda; pedido confirmado não reutiliza checkout/Flow para mutações silenciosas.
- V47: transições obrigatórias derivadas do estado: finalização de cesta inicia checkout e confirmação explícita em `basket_final_confirmation` chama finalização governada.
- V48: pedido genérico para alterar dados, sem campo/novo valor, pede esclarecimento curto em vez de escrever ou fazer handoff desnecessário.
- V50: normalização semântica trata pontuação antes das regras de borda, evitando dependência de uma frase terminar exatamente sem ponto/interrogação.

## Segurança preservada

A suíte é exclusivamente sintética e não conta como evidência de homologação real. Ela não envia WhatsApp, não cria pedidos reais, não altera clientes e não autoriza efeitos comerciais.

Gates que permanecem obrigatoriamente preservados:

- `agent_core_runtime_config.execution_mode = observe`
- `legacy_router_policy = shadow`
- `whatsapp_live_canary_percent = 1`
- `experience_orchestrator_enabled = false`
- `whatsapp_flow_data_exchange_enabled = false`
- `whatsapp_flow_send_enabled = false`
- `whatsapp_flow_commercial_write_enabled = false`
- `bling_order_sync_enabled = false`
- nenhuma aposentadoria de router comercial autorizada
- nenhuma execução stateful global autorizada

## Próxima etapa

A fundação sintética está pronta. A Rodada 4 só pode ser encerrada depois da evidência stateful real, controlada e não fabricada, na conversa de homologação autorizada. Depois disso pode-se avançar para a Rodada 5 (eval/replay/qualidade profissional) e Rodada 6 (homologação/public readiness), sem pular gates.