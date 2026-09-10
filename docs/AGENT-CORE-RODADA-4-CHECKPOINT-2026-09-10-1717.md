# Dona Antônia — Agent Core — Rodada 4 — checkpoint 2026-09-10 17:17Z

## Escopo concluído nesta rodada

A Rodada 4 continua em `observe`, sem substituir o atendimento live e sem executar escrita comercial pelo Agent Core.

Foram consolidados nesta sequência:

- inventário e classificação dos routers/triggers legados;
- dispatcher/recovery explícitos do `conversation-worker-v3`;
- gate de paridade V2 baseado em tópico/política determinísticos, sem tratar o legado como verdade absoluta;
- normalizador shadow auditável e replay autorizado;
- 10 tools governadas de cesta/checkout;
- outputs compactos para cesta/cadastro, sem token interno e sem PII desnecessária;
- observabilidade dos routers legados sem armazenar o texto da mensagem nem payload de PII;
- 4 transições governadas de checkout: salvar dados básicos, registrar localizador, abrir e cancelar fluxo de endereço;
- resolução de tópico sensível a `sales_state.awaiting`;
- Edge Agent Core com schemas de tools filtrados pelo tópico para reduzir contexto/custo;
- gate consolidado `get_agent_core_round4_consolidated_readiness_v2()` em modo fail-closed.

## Edge e smoke real

`dona-antonia-agent-core-v1` foi promovida para a versão 4 somente depois do CI verde.

Smoke pós-deploy:

- healthcheck via pg_net + chave obtida internamente do Vault: HTTP 200, request 226;
- readiness do healthcheck: `enabled=true`, `execution_mode=observe`, `tool_count=25`, planner `gpt-5.6-luna`, escalonamento `gpt-5.6-terra`, `stale_dispatches=0`;
- replay shadow controlado do job `3b774011-680d-4915-abb0-7f0c473ffbf7`: HTTP 200, request 227;
- decisão: `basket`, secundária `product_search`, `show_baskets`, confiança `0.99`, 1 tool call, sem escalonamento;
- filtro por tópico comprovado no replay: `allowed_tool_count=20`;
- ações não-read-only continuam retornando `observe_no_side_effects`; não há executor direto de checkout/finalização no shadow.

## Checkout state-aware

`resolve_whatsapp_agent_core_topic_v2` preserva o identificador interno de `awaiting` e resolve:

- `basket_payment_selection` -> `payment`;
- `basket_final_confirmation` -> `checkout`;
- `basket_customer_base_data` -> `checkout`;
- `order_customer_base_data` -> `checkout`;
- `basket_locator_confirmation` -> `checkout`.

As 4 tools de transição estão em `observe`, são `reversible_write` e usam schemas vazios: a mensagem atual/PII é injetada pelo backend determinístico, não reenviada pelo modelo como argumentos.

## Observabilidade do legado

Backfill de 30 dias produziu 41 decisões determinísticas observadas:

- 23 originadas de interação estruturada;
- 18 originadas de texto;
- basic_sales: 27;
- basket_fallback: 2;
- basket_payment_checkout: 6;
- checkout_flow: 2;
- other_legacy: 4.

A tabela `agent_core_legacy_router_observations` não armazena corpo da mensagem nem payload de PII. RLS está habilitado; `anon` e `authenticated` não receberam privilégios, e o acesso operacional permanece restrito a postgres/service_role.

## Gate de aposentadoria

Estado de `get_agent_core_round4_consolidated_readiness_v2()` neste checkpoint:

- `retirement_ready=false`;
- motivo: `insufficient_shadow_sample`;
- amostra Agent Core: 4/20;
- policy intent match: 100%;
- decision/tool coherence: 100%;
- ferramentas de cesta: 10/10, sem risk mismatch, confirmation guard ativo;
- ferramentas de transição de checkout: 4/4, observe-only, reversible-only, PII fora dos argumentos;
- inventário: 5 candidates, 4 blocked, 1 retired e 0 hard-safety em estado inválido.

Nenhum router adicional deve ser aposentado enquanto esse gate permanecer falso.

## CI

- run `34506555561`: success — Edge state-aware checkout + contratos das transições;
- run `34507156504`: success — gate consolidado fail-closed e contratos da Rodada 4.

## Rollout preservado

Confirmado em `automation_config`:

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

Nenhum Flow foi publicado ou exposto a clientes por esta rodada.

## Próximo passo seguro

Continuar acumulando/paralelizando amostra shadow real e usar a observabilidade de ações para separar interpretação textual dos side effects determinísticos nos routers `basket_payment_checkout`, `checkout_flow`, `basket_fallback` e `basic_sales`. Só iniciar aposentadoria controlada quando o gate consolidado ficar verdadeiro e houver nova revisão dos casos divergentes.