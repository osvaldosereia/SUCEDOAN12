# Dona Antônia Agent Core — Rodada 4 — checkpoint V26

Data: 2026-09-10

Este documento é o ponto de retomada mais recente da **Rodada 4/6 — consolidação dos routers legados** do projeto Dona Antônia Agent Core.

Ler junto com:

- `docs/ROADMAP-AGENT-CORE-DONA-ANTONIA-6-RODADAS.md`;
- `docs/RETOMADA-AGENT-CORE-DONA-ANTONIA-2026-09-10.md`;
- os checkpoints/migrations V20–V26.

## Estado da sequência de 6 rodadas

- Rodada 1/6 — concluída.
- Rodada 2/6 — concluída.
- Rodada 3/6 — concluída.
- Rodada 4/6 — **em andamento, estágio avançado**.
- Rodada 5/6 — não iniciar antes do fechamento seguro da Rodada 4.
- Rodada 6/6 — não iniciar antes da Rodada 5.

## Invariantes preservados

Continuam vigentes:

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
Agent Core execution_mode=observe
legacy_router_policy=shadow
stateful_execution_permitted_now=false
retirement_execution_permitted=false
global_retirement_ready=false
worker_v2_edge_removal_authorized=false
```

Handoff humano continua com precedência absoluta.

Nenhum router comercial foi aposentado nesta rodada. Nenhuma escrita stateful foi autorizada. Nenhum rollout foi ampliado.

---

## 1. Reconciliação V20–V23

Antes de programar, o estado real foi relido no GitHub e no Supabase.

As migrations V20–V23 já estavam presentes e aplicadas:

- V20 — snapshot/pacote pré-router;
- V21 — bridge de elegibilidade shadow V2;
- V22 — bridge do pacote V2;
- V23 — paridade por ação e contrato `wa_start_order_checkout`.

A principal pendência encontrada no readiness V23 era:

```text
wa_start_order_checkout
edge_allowlist_pending=true
executor_mapping_pending=true
runtime_pending_count=1
```

O backend/contrato já existia, mas a Edge implantada ainda estava na versão 7 e não possuía a superfície nova do checkout avulso.

---

## 2. Edge Agent Core promovida para v8

Edge Function:

```text
dona-antonia-agent-core-v1
status=ACTIVE
version=8
verify_jwt=false
```

`verify_jwt=false` foi preservado intencionalmente porque a função usa autenticação própria por `x-da-agent-key`.

A v8 agora inclui:

- `wa_start_order_checkout` na superfície permitida para tópico `checkout`;
- distinção explícita no kernel:
  - checkout de produto avulso -> `wa_start_order_checkout`;
  - checkout de cesta -> `wa_start_basket_checkout`;
- qualquer tool que não seja `read_only` continua **somente simulada** em `observe`;
- a Edge não chama diretamente `start_whatsapp_order_checkout_agent_v1`;
- `observe_no_side_effects` continua sendo o contrato de writes no shadow.

Nenhuma escrita comercial real foi habilitada.

---

## 3. V24 — superfície runtime completa

Migration Supabase/GitHub:

```text
20260910213421_dona_antonia_agent_core_round4_runtime_surface_v24.sql
```

Criadas:

```text
get_agent_core_round4_runtime_surface_readiness_v1()
get_agent_core_round4_consolidated_readiness_v15()
```

A V24 removeu os dois marcadores transitórios de `wa_start_order_checkout` somente depois da implantação da Edge v8:

```text
edge_allowlist_pending=false
executor_mapping_pending=false
edge_surface_verified_version=8
observe_simulation_only=true
```

Readiness confirmado:

```text
ready=true
reason=runtime_surface_ready
runtime_pending_count=0
all_runtime_contracts_complete=true
```

Portanto a superfície do Agent Core está atualmente em:

```text
38/38 contratos runtime completos
```

Com:

```text
stateful_execution_permitted_now=false
retirement_execution_permitted=false
```

---

## 4. V25 — preflight de evidência stateful real

Migration:

```text
20260910213727_dona_antonia_agent_core_round4_evidence_preflight_v25.sql
```

Criadas:

```text
get_agent_core_round4_homologation_evidence_preflight_v1()
get_agent_core_round4_consolidated_readiness_v16()
```

O preflight exige simultaneamente:

- canal WhatsApp;
- `automation_cohort=homologation`;
- conversa em `mode=ai`;
- `human_required=false`;
- nenhum handoff `open|claimed`;
- janela de serviço Meta ainda aberta;
- Agent Core em `observe`;
- `legacy_router_policy=shadow`;
- shadow OpenAI habilitado;
- runtime surface verde;
- trigger de snapshot pré-router presente.

Também declara explicitamente:

```text
requires_real_homologation_turns=true
synthetic_backfill_allowed=false
writes_permitted=false
router_retirement_permitted=false
pii_returned=false
```

### Estado real no momento deste checkpoint

```text
homologation_conversations=2
homologation_ai_clear=1
homologation_ai_clear_open_window=0
homologation_human_blocked=1
snapshot_rows=0
passive_collection_ready=false
reason=awaiting_clear_homologation_service_window
```

Interpretação:

- existe uma conversa de homologação livre para IA;
- a janela de 24h dessa conversa está fechada;
- existe outra conversa protegida por controle humano, e ela não deve ser usada/alterada para contornar o gate;
- portanto a coleta de evidência stateful está corretamente parada até um novo inbound real da conversa owner-only/allowlisted apropriada.

Não alterar `service_window_expires_at` manualmente e não fabricar mensagens/snapshots.

---

## 5. V26 — normalização de aliases da evidência

Migration:

```text
20260910214333_dona_antonia_agent_core_round4_stateful_evidence_aliases_v26.sql
```

Foi identificada uma inconsistência entre nomes históricos do relatório V14 e os contratos atuais V23.

Aliases normalizados retrocompativelmente:

```text
change_basket_delivery_address -> change_basket_delivery_address_flow
basket_payment_selected -> basket_payment_selection
basket_payment_confirmation -> basket_final_confirmation
```

O alvo canônico de endereço passou a ser:

```text
change_basket_delivery_address_flow
```

O relatório `get_agent_core_round4_stateful_evidence_report_v1()` agora retorna `version=2` e preserva eventos históricos pelos aliases, sem alterar observações existentes.

Critérios centrais atuais de evidência real continuam exigindo no mínimo 3 amostras cada:

```text
basket_customer_data_processed                0/3
basket_ready_for_human                        0/3
change_basket_delivery_address_flow           0/3
confirm_order                                 0/3
```

Como os snapshots válidos pós-V20 ainda são zero, nenhuma evidência histórica foi artificialmente reaproveitada.

---

## 6. Correção do CI V23

O CI do Agent Core já vinha falhando desde a entrada da V23.

A falha era de teste estático, não de runtime: o contrato procurava metadata JSON usando aspas simples, enquanto a migration contém JSON válido com aspas duplas.

Foi corrigido:

```text
'edge_allowlist_pending':true
```

para a representação efetivamente presente no JSON:

```text
"edge_allowlist_pending":true
```

O mesmo ajuste foi feito para `executor_mapping_pending`.

Nenhum gate foi relaxado.

O workflow também foi melhorado para executar cada contrato em passo separado, tornando futuras regressões imediatamente identificáveis.

---

## 7. CI final desta rodada

Workflow:

```text
CI Dona Antonia Agent Core
run #99
id 34533872473
head ac051cd1aee722d5a2849f11fadb220d6e1be4e4
conclusion=success
```

Passaram individualmente:

- Agent Core base;
- Rodada 3 memória/aprendizado;
- Rodada 4 foundation;
- safe replay;
- parity V3;
- semantic V5;
- stateful V10;
- router contracts V19;
- pre-router parity V23;
- runtime surface V24;
- evidence preflight V25;
- evidence aliases V26;
- worker V2 retirement guard;
- sintaxe Admin;
- `deno check` das Edge Functions do Agent Core.

---

## 8. Segurança pós-DDL

As novas/redefinidas funções auditadas permanecem:

```text
anon_execute=false
authenticated_execute=false
service_role_execute=true
```

Supabase Security Advisor não apontou nova exposição específica criada por V24–V26.

Persistem avisos preexistentes do projeto:

- `RLS Enabled No Policy` em tabelas server-only;
- `Leaked Password Protection Disabled` no Supabase Auth.

Não alterar Auth automaticamente nesta frente.

Performance Advisor continua mostrando achados globais preexistentes de FKs sem índice, índices não utilizados e dois pares de índices duplicados. Não pertencem ao corte da Rodada 4 e não foram modificados.

---

## 9. Estado correto da Rodada 4 agora

### Programação estrutural

```text
packet/eligibility pre-router V2 = conectado
runtime tool contracts = 38/38
runtime pending tools = 0
Edge Agent Core = v8 ACTIVE
stateless policy/intention parity = 20/20
stateless decision/tool coherence = 20/20
legacy intent comparison = 19/20 informativo
blocked routers contracts complete = 8/8
stateful write execution = OFF
router retirement = OFF
```

### Evidência real

```text
valid pre-router snapshots pós-V20 = 0
stateful evidence ready = false
passive collection ready = false
current blocker = awaiting_clear_homologation_service_window
```

A Rodada 4 **não deve ser marcada como concluída ainda**.

---

## 10. Próximo ponto exato de retomada

Não criar mais substitutos de tools apenas para aumentar volume de código.

A próxima ação correta é:

1. aguardar/receber um novo inbound real no número/conversa owner-only de homologação que esteja livre para IA;
2. confirmar que isso abre naturalmente a janela de serviço;
3. reler `get_agent_core_round4_homologation_evidence_preflight_v1()`;
4. quando `passive_collection_ready=true`, executar a jornada de homologação stateful real em shadow;
5. coletar snapshots pré-router pós-V20 sem PII;
6. atingir as amostras mínimas reais dos quatro alvos centrais;
7. cruzar cada ação legada com intenção/next_action/tools do Agent Core;
8. somente com evidência verde avaliar aposentadoria gradual dos routers correspondentes;
9. não iniciar Rodada 5 enquanto esse gate stateful da Rodada 4 estiver vermelho.

## Regra de ouro

> O próximo gargalo não é programação de mais IA. É obter evidência stateful real, com o estado correto anterior ao router legado, em uma conversa de homologação autorizada e sem controle humano. Não contornar esse gate.
