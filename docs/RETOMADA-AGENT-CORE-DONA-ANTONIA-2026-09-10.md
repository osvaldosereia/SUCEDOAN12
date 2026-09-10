# RETOMADA DETALHADA — DONA ANTÔNIA AGENT CORE

Atualizado em **10/09/2026 ~18:10 (America/Cuiaba)**.

Este arquivo é o ponto autoritativo de retomada do trabalho específico do **novo atendente WhatsApp / Dona Antônia Agent Core**. Em uma nova conversa, ler este arquivo **antes de alterar qualquer coisa** e continuar exatamente daqui.

> Não reiniciar Rodadas 1–3. Não refazer blocos já concluídos da Rodada 4. Auditar primeiro o HEAD atual porque existe trabalho paralelo de WhatsApp Flow no mesmo `main`.

---

## 1. Roadmap do Agent Core

Plano oficial: `docs/ROADMAP-AGENT-CORE-DONA-ANTONIA-6-RODADAS.md`.

Estado atual:

- **Rodada 1/6 — Fundação do Agent Core: concluída**.
- **Rodada 2/6 — Responses API + function calling + cache + shadow: concluída**.
- **Rodada 3/6 — memória seletiva + aprendizado assíncrono/controlado: concluída**.
- **Rodada 4/6 — consolidação dos routers legados: em andamento, estágio avançado**.
- Rodada 5/6 — evals profissionais em escala: ainda não iniciar antes de fechar o bloco seguro da Rodada 4.
- Rodada 6/6 — homologação ponta a ponta / preparação para público: ainda não iniciar.

Objetivo final continua sendo:

```text
WhatsApp / Meta
  -> transporte
  -> Agent Core único
  -> estado/memória seletiva
  -> Responses API + function calling
  -> tools governadas
  -> validação determinística / policy
  -> efeito permitido
  -> resposta
```

Princípio obrigatório:

> A IA entende intenção e propõe a próxima ação; o backend determinístico valida preço, estoque, endereço, pagamento, confirmação, pedido, handoff e qualquer efeito comercial.

---

## 2. GATES DE PRODUÇÃO — NÃO ALTERAR

Preservar até autorização explícita do proprietário:

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

Não publicar Flow, não aumentar canary, não ativar Bling, não executar write stateful do Agent Core e não desligar router comercial apenas porque existe contrato de tool.

Handoff humano continua com precedência absoluta.

---

## 3. Edge Agent Core — estado atual

Edge Function:

```text
dona-antonia-agent-core-v1
status=ACTIVE
version=7
verify_jwt=false
```

`verify_jwt=false` é intencional porque essa Edge possui autenticação própria via `x-da-agent-key`. Não mudar esse contrato sem revisar a autenticação inteira.

Estado funcional:

- `execution_mode=observe`;
- somente tools `read_only` podem ser realmente executadas no shadow;
- tools `reversible_write` e `commitment` continuam simuladas/preview-only;
- `wa_confirm_order` / `wa_finalize_basket_order` continuam commitment e exigem confirmação explícita;
- não existe permissão para a Edge criar outbound comercial ou escrever pedido via essas tools no modo atual.

Último CI do Agent Core confirmado **antes da migration V20**:

```text
CI Dona Antonia Agent Core
run 85
id 34525434035
commit 3ff8de51c9a93d6c9a84e777ab8eb4117758d3eb
conclusion=success
```

O `main` avançou depois por trabalho paralelo de Flow. Sempre reler o arquivo alvo antes de escrever.

---

## 4. Rodadas 1–3 — o que já está pronto

### Rodada 1

- catálogo oficial de actions/tools;
- governança de risco/confirmação;
- contexto compacto;
- recuperação de inteligência V3 ligada ao worker real;
- Agent Core em `observe`;
- shadow sem OpenAI duplicando resposta;
- telemetria inicial;
- gates comerciais preservados.

### Rodada 2

- `dona-antonia-agent-core-v1` com Responses API;
- GPT-5.6 Luna como planner principal;
- GPT-5.6 Terra somente como crítica/escalonamento e **sem tools**;
- function calling strict;
- limite próprio de tool calls;
- prompt caching de 30 min;
- `store:false`;
- multi-intenção (`basket` principal + `product_search` secundária quando aplicável);
- replay shadow e relatório de custo/qualidade;
- nenhum write comercial no shadow.

### Rodada 3

- `conversation_memory_snapshots`;
- `customer_service_memory`;
- `service_learning_candidates`;
- precedência **declarado > inferido**;
- TTL/confiança de memória;
- proteção contra PII/identificadores/categorias sensíveis;
- fila durável `pgmq`;
- worker assíncrono `dona-antonia-agent-learning-v1`;
- aprendizagem global não autopublica;
- candidato aprovado vira apenas rascunho;
- Admin `/admin/aprendizados.html`;
- `vector` permaneceu desligado por decisão de custo/necessidade;
- recuperação textual usada antes de qualquer necessidade de embeddings.

---

## 5. Rodada 4 — o que já foi concluído

### 5.1 Inventário e limpeza estrutural

- inventário explícito de routers/triggers em `agent_core_router_inventory`;
- classificação em `hard_safety`, `transport`, `deterministic_policy`, `compatibility`, `legacy`;
- pós-processamento shadow consolidado;
- trigger duplicado de `updated_at` removido;
- dispatcher/recovery canônicos movidos para `conversation-worker-v3`;
- V2 mantido só para compatibilidade/rollback;
- runtime atual de banco não chama endpoint V2;
- Make ativo também não chama worker V2;
- CI impede regressão para endpoint V2.

### 5.2 Busca/canonicalização do Agent Core

A busca nova ficou **isolada** no Agent Core, sem substituir a busca live do worker V3.

Foi criada a camada para separar:

```text
intenção de produto != disponibilidade real
```

Exemplos já validados:

- `Quero arroz` -> `product_search`;
- `Fejao` -> `product_search`, mas pode retornar zero itens vendáveis;
- `Sabonete?` -> `product_search`;
- `Você tem meu cadastro?` -> não é busca de produto;
- resultado indisponível não pode virar substituto inventado como sopa/macarrão só porque contém a palavra “feijão”.

Vocabulário de intenção usa termos comerciais centrais/Flow; disponibilidade continua vindo de `counter_verified`.

### 5.3 Paridade stateless

Gate atual já alcançou:

```text
20 mensagens únicas válidas
10 basket
10 product_search
20/20 política/intenção = 100%
20/20 decisão/tool = 100%
confiança média ~0.9885
legacy intent match = 19/20 = 95% (somente informativo)
```

Replay histórico foi endurecido para não carregar estado/carrinho/cadastro/memória atuais e só aceitar famílias realmente stateless.

Mesmo com esse resultado:

```text
candidate_retirement_ready=true
retirement_execution_permitted=false
```

Nenhum router foi desligado.

### 5.4 Tools e preconditions stateful

Já existem **19 ações stateful**, sendo:

```text
17 reversible_write
2 commitment
```

Todas permanecem em `observe`.

A camada de preconditions cobre **19/19 requisitos declarados**. UUID/número/boolean malformados falham fechado, sem exception de cast.

Exemplos de tools já registradas:

- `wa_select_basket`
- `wa_create_basket_replacement`
- `wa_open_basket_storefront`
- `wa_start_basket_checkout`
- `wa_add_more_products`
- `wa_get_basket_customer_status`
- `wa_get_checkout_contact`
- `wa_save_checkout_customer_data`
- `wa_request_address_flow`
- `wa_cancel_address_flow`
- `wa_set_delivery_locator`
- `wa_request_basket_payment`
- `wa_prepare_basket_confirmation`
- `wa_finalize_basket_order`
- `wa_confirm_order`
- `wa_handoff_human`
- `wa_link_customer_identity`
- `wa_create_search_showcase`

O preview atual é `preview_whatsapp_agent_action_v2` e recebe `message_id`.

### 5.5 Oito routers bloqueados

Foi criado readiness por router. Depois das V18/V19:

```text
blocked_router_count=8
contract_complete_count=8
routers_with_missing_tools=0
all_contracts_complete=true
evidence_ready_count=0
all_evidence_ready=false
```

Ou seja: **arquitetura/substitutos completos, mas ainda sem evidência stateful suficiente para aposentadoria**.

Os oito contratos cobrem:

1. saudação / vínculo de cliente;
2. basket payment/checkout;
3. checkout flow;
4. basket swap;
5. basket fallback;
6. personalization choice;
7. basic sales router amplo;
8. multi-search CTA.

V19 completou as três tools que faltavam:

- `wa_link_customer_identity`;
- `wa_open_basket_storefront`;
- `wa_create_search_showcase`.

Todas são `reversible_write`, `observe`, sem autorun.

### 5.6 Correção da promessa de entrega

O router legado ativo foi corrigido para não prometer entrega como certeza.

Regra atual pretendida:

- até 11h Cuiabá -> **previsão** de entrega no mesmo dia;
- após 11h -> **previsão** no próximo dia útil;
- horário depende da rota/bairro;
- nunca garantir horário exato automaticamente.

### 5.7 Snapshot pré-router stateful

Criada tabela:

`agent_core_pre_router_snapshots`

Ela captura somente estrutura, antes do primeiro router comercial, em homologação:

- mode/stage;
- awaiting;
- basket session ativa;
- carrinho existe/válido;
- cliente cadastrado (boolean);
- endereço conhecido (boolean);
- service window;
- human_required/handoff;
- interactive_id/message_type;
- `pii_stored=false`.

Não grava corpo da mensagem, transcrição, nome, telefone, endereço ou payload cadastral.

Até o último fechamento anterior à V20:

```text
snapshot_rows=0
stateful_evidence_ready=false
reason=awaiting_new_homologation_snapshots
```

Não fazer backfill artificial de estado stateful antigo.

---

## 6. ÚLTIMA ALTERAÇÃO APLICADA NO SUPABASE — V20

### IMPORTANTE: V20 está aplicada no Supabase, mas ainda NÃO foi reproduzida no GitHub/CI

Migration registrada em produção:

```text
20260910202610 dona_antonia_agent_core_round4_pre_router_shadow_packet_v20
```

O objetivo da V20 foi corrigir a principal lacuna da comparação stateful: o Agent Core shadow estava sendo disparado depois do router legado e podia raciocinar com estado já modificado pelo legado.

A V20 adicionou/alterou estruturas para que o shadow possa usar o **snapshot pré-router** como contexto estrutural autoritativo.

Funções presentes após V20:

```text
build_whatsapp_agent_core_packet_v2(conversation_id, message_id)
is_whatsapp_agent_core_shadow_eligible_v2(job_id, replay)
get_agent_core_round4_pre_router_shadow_readiness_v1()
agent_core_shadow_postprocess_trigger_v1()
```

Readiness da V20 atualmente retorna:

```text
version=1
shadow_only=true
execution_mode=observe
packet_builder=build_whatsapp_agent_core_packet_v2
retirement_authorized=false
write_execution_permitted=false
postprocess_trigger_present=true
pre_router_state_contains_pii=false
held_greeting_shadow_supported=true
held_greeting_homologation_only=true
snapshot_structural_columns_complete=true
```

### O que `build_whatsapp_agent_core_packet_v2` faz

Quando existe snapshot pré-router para a mensagem, ele substitui no pacote do Agent Core os campos estruturais que poderiam ter sido alterados depois pelo legado:

- `topic` recomputado com stage/awaiting/interactive_id pré-router;
- `conversation.mode/stage` pré-router;
- `customer.registered/has_known_address` apenas como booleanos;
- `cart.exists/valid` somente estrutura, sem itens;
- `sales_state.awaiting/basket_session_active` pré-router;
- bloco `pre_router_state` explícito;
- `pre_router_snapshot_contains_pii=false`.

Replay histórico stateless continua no caminho histórico existente e não deve ser misturado com esse snapshot.

### Colunas estruturais adicionadas/esperadas pela V20

O snapshot agora também suporta:

```text
fast_checkout
upsell_declined
```

### Saudação `held`

V20 criou elegibilidade V2 para permitir observar o fast-path determinístico de saudação quando o job fica:

```text
status=held
error_message=deterministic_greeting_fastpath
```

Somente em cohort `homologation`, sem replay e sem write.

---

## 7. LACUNA CRÍTICA IDENTIFICADA NO MOMENTO DA PAUSA

Antes de continuar a Rodada 4, **não assumir que V20 já está totalmente conectada ao runtime**.

A inspeção pós-migration mostrou:

### `agent_core_shadow_postprocess_trigger_v1`

Ele aceita `done` ou saudação `held`, porém ainda chama:

```text
observe_whatsapp_agent_core_turn_v1(...)
dispatch_whatsapp_agent_core_shadow_v1(...)
```

### `dispatch_whatsapp_agent_core_shadow_v1`

Na definição atual ele ainda chama:

```text
is_whatsapp_agent_core_shadow_eligible_v1(...)
```

não a V2.

### `observe_whatsapp_agent_core_turn_v1`

Na definição atual ele ainda monta:

```text
build_whatsapp_agent_core_packet_v1(...)
```

não a V2.

Portanto a próxima conversa deve **verificar a Edge v7 e o caminho completo antes de afirmar que o pacote V2 já está realmente sendo usado end-to-end**.

Esse é o primeiro ponto técnico a resolver.

A correção recomendada é criar/usar uma bridge versionada (por exemplo observer/dispatcher V2 ou alteração cuidadosamente testada dos wrappers existentes), mantendo:

- shadow-only;
- homologation-only para held greeting;
- writes proibidos;
- nenhuma alteração de Flow/Bling/canary;
- rollback simples.

Não substituir funções antigas cegamente; primeiro mapear todos os callers.

---

## 8. O QUE FALTA PARA TERMINAR A RODADA 4

Executar nesta ordem:

### 8.1 Sincronizar V20 GitHub <-> Supabase

1. Reconstituir a migration aplicada `20260910202610_dona_antonia_agent_core_round4_pre_router_shadow_packet_v20.sql` a partir das definições atuais do banco.
2. Salvar em `supabase/migrations/` com o mesmo número de versão.
3. Criar teste/contrato V20.
4. Rodar CI Agent Core e `deno check`.
5. Não avançar se CI ficar vermelho.

### 8.2 Ligar corretamente o packet V2 ao shadow runtime

Verificar exatamente:

- qual packet builder a Edge v7 chama;
- qual função o postprocess dispara;
- qual eligibility o dispatcher usa;
- como `held greeting` chega ao Agent Core;
- se `pre_router_snapshot_used=true` aparece em turnos novos de homologação.

Corrigir para que decisões stateful shadow usem realmente o estado pré-router.

### 8.3 Criar comparador stateful ação-legada -> tool-exata

Não usar “qualquer tool do router = acerto”. Criar mapeamento explícito por ação.

Exemplos esperados a validar contra o código real:

```text
show_baskets -> wa_list_baskets
basket_selected_followup / basket_catalog_link -> wa_select_basket (e apresentação determinística)
basket_keep_and_checkout -> wa_start_basket_checkout
basket_storefront_link -> wa_open_basket_storefront
basket_swap_showcase -> wa_create_basket_replacement
basket_customer_data_processed -> wa_save_checkout_customer_data
basket_payment_selection -> wa_request_basket_payment
basket_final_confirmation -> wa_prepare_basket_confirmation
change_basket_delivery_address_flow -> wa_request_address_flow
address_flow_cancelled -> wa_cancel_address_flow
confirm_order -> wa_confirm_order
basket_order_confirmed -> wa_finalize_basket_order
basket_ready_for_human -> wa_handoff_human + finalização determinística conforme contrato
search_product_extra -> wa_create_search_showcase
greeting -> wa_link_customer_identity + resposta do Agent Core
```

Não assumir esse mapa sem conferir o código de cada router; algumas ações legadas agregam mais de uma responsabilidade.

### 8.4 Coletar evidência stateful real

Depois que V20 estiver realmente ligada end-to-end:

- coletar novos snapshots somente em `homologation`;
- não fazer backfill stateful artificial;
- cruzar snapshot pré-router + ação legada + decisão/tool Agent Core;
- mínimo atual: 3 amostras por router/núcleo crítico;
- medir acerto de tool e precondition;
- investigar qualquer divergência antes de retirar router.

Núcleos críticos já definidos:

```text
basket_customer_data_processed
confirm_order
basket_ready_for_human
change_basket_delivery_address
```

### 8.5 Saudação

Agora existe tool `wa_link_customer_identity`, mas ainda falta provar:

- Agent Core escolhe saudação corretamente;
- vínculo de cliente permanece determinístico;
- nome/telefone/endereço não vazam para argumentos/logs;
- o fast-path `held` pode ser observado com contexto pré-router;
- nenhuma segunda resposta é enviada.

### 8.6 Basket swap

Provar com estado real:

- sessão de cesta ativa;
- source product realmente pertence à cesta;
- tool correta `wa_create_basket_replacement`;
- IA não decide estoque/preço/equivalência;
- target query pode ser ambígua sem inventar produto.

### 8.7 Personalização

Provar separadamente:

```text
manter cesta -> wa_start_basket_checkout
personalizar -> wa_open_basket_storefront
```

O token da cesta deve continuar escondido do modelo.

### 8.8 Checkout/pagamento/endereço

Comparar por estado `awaiting` e ação legada:

- customer data;
- adicionar mais produtos;
- alterar endereço;
- cancelar address flow;
- pagamento;
- confirmação final;
- localizador;
- confirmação do pedido;
- handoff humano quando aplicável.

Toda escrita continua simulada até autorização posterior.

### 8.9 Multi-search

Provar que `wa_create_search_showcase` substitui o pós-processamento antigo sem:

- mais de uma vitrine extra por chamada/turno conforme política atual;
- catálogo inventado;
- sessão/URL exposta ao modelo;
- outbound duplicado.

### 8.10 Retirada dos routers

Só depois da evidência:

1. retirar um router por vez;
2. gate por router;
3. CI;
4. shadow/canary controlado;
5. rollback documentado;
6. nunca remover hard safety, transporte ou policy determinística só porque o Agent Core entende a intenção.

`a1_whatsapp_simple_product_query_v1` continua sendo o candidato stateless mais maduro, mas `can_disable_now=false` enquanto Agent Core estiver em observe.

### 8.11 Worker V2

V2 já não é caminho canônico de banco/Make, porém não apagar ainda.

Manter:

```text
worker_v2_edge_removal_authorized=false
```

A Edge V2 fica como rollback até decisão posterior.

### 8.12 Fechar formalmente Rodada 4

Rodada 4 só deve ser marcada concluída quando:

- V20 estiver versionada e CI verde;
- stateful shadow usar snapshot pré-router de verdade;
- 8/8 contratos continuarem completos;
- cobertura/evidência stateful mínima estiver atingida ou houver decisão explícita documentada de mover o restante para Rodada 5;
- nenhum router for retirado sem gate específico;
- gates comerciais permanecerem intactos;
- checkpoint final Rodada 4 atualizado.

---

## 9. O QUE FALTA NAS RODADAS 5 E 6

### Rodada 5/6 — Evals profissionais

Depois de fechar Rodada 4:

- ampliar para centenas de casos/variações;
- cesta padrão;
- personalização;
- extras;
- produto avulso;
- busca curta e com erro de digitação;
- produto inexistente;
- preço/estoque;
- pagamento;
- prazo/taxa/horário de entrega;
- cliente conhecido e novo;
- cadastro/endereço;
- checkout;
- áudio;
- imagem;
- objeção/ambiguidade;
- pós-venda;
- handoff;
- mensagens fora de contexto;
- prompt injection/adversarial;
- loops/repetições;
- mudança de assunto;
- reset de contexto;
- timeout/falha OpenAI;
- falha de tool;
- estoque/preço alterando durante conversa.

Métricas mínimas:

- intenção;
- tool selecionada;
- precondition/policy;
- efeito permitido/bloqueado;
- resposta final;
- hallucination;
- loop;
- handoff;
- latência;
- input/output tokens;
- cached tokens;
- escalonamento Luna -> Terra;
- custo médio por atendimento.

### Rodada 6/6 — Homologação ponta a ponta e preparação para público

Somente após Rodada 5:

- jornada completa no WhatsApp real de homologação;
- cesta -> personalização -> extras -> checkout;
- cadastro conhecido/novo;
- pagamento;
- localizador;
- áudio/imagem;
- handoff;
- Flow conforme projeto paralelo vigente;
- verificar pedidos finalizados no Admin;
- verificar ausência de duplicidade outbound;
- verificar rollback;
- verificar Make como transporte;
- validar custos e observabilidade;
- estabelecer critérios objetivos de go/no-go.

**Não aumentar canary nem liberar público sem autorização explícita do proprietário.**

---

## 10. Make — baseline a preservar

Última auditoria confirmada neste trabalho manteve apenas:

```text
6779824 — Dona Antônia - WhatsApp Inbound Controlado v1
7290488 — Dona Antônia - WhatsApp Outbound Event-Driven v3
6379567 — consultar no cpf
```

Make deve continuar transporte/integração temporária. Inteligência comercial central fica no Supabase/Agent Core.

---

## 11. Primeira ação da próxima conversa

Ao receber `continue` em nova conversa:

1. ler `docs/RETOMADA-AGENT-CORE-DONA-ANTONIA-2026-09-10.md`;
2. ler `docs/AGENT-CORE-RODADA-4-CHECKPOINT-2026-09-10.md`;
3. ler `docs/ROADMAP-AGENT-CORE-DONA-ANTONIA-6-RODADAS.md`;
4. auditar HEAD atual porque existe trabalho paralelo de Flow;
5. consultar Supabase migration `20260910202610 dona_antonia_agent_core_round4_pre_router_shadow_packet_v20`;
6. reproduzir V20 no GitHub;
7. auditar Edge v7 + `observe_whatsapp_agent_core_turn_v1` + `dispatch_whatsapp_agent_core_shadow_v1` + eligibility V1/V2;
8. corrigir a bridge para o packet V2 **sem write e sem rollout**;
9. adicionar CI V20;
10. só depois continuar o comparador stateful ação-legada -> tool-exata.

## Regra de ouro para a retomada

> O próximo problema não é “criar mais IA”. O próximo problema é garantir que a IA shadow esteja sendo avaliada com o **estado correto imediatamente anterior ao router legado**, para que a paridade stateful seja verdadeira e auditável. Depois disso, medir; somente depois retirar legado.
