# WhatsApp Flow Cestas Dona Antônia — checkpoint RUN8

Data: 2026-09-10

## Estado relido

- Candidato principal: `flow-cestas-comercial-v8-stable`.
- Meta Flow: `2579927222524475`, `DRAFT`, isolado de clientes.
- Runtime comercial: `handle_whatsapp_flow_commercial_exchange_v23`.
- Sessão owner-only: `caf9452b-8df9-43f1-9487-cee2e9aff02a`, ainda `offered`, sem INIT/Data Exchange.
- Gate unificado V2 estava em 15/17, `healthy=true`, com apenas `owner_conversation_ai=false` e `owner_handoff_clear=false`.
- Make continua sem drift: exatamente inbound controlado, outbound event-driven e consulta CPF ativos, todos sem execuções incompletas.

## Implementação desta rodada

### Regressão profunda somente leitura V2

Criada `get_whatsapp_flow_v31_deep_readonly_readiness_v2()`.

A função percorre as 9 cestas reais e valida sem persistir alteração:

- baseline de composição: 9/9 válido;
- remoção real de um componente até quantidade zero: 9/9 válido;
- tentativa de quantidade 7: bloqueada em 9/9 pelo teto do cliente de 6;
- 222 componentes reais atualmente removíveis/editáveis;
- atualmente não existem componentes não removíveis nas 9 cestas;
- atualmente não existem componentes de cesta com estoque baixo 1–3; menor estoque observado no snapshot foi 12;
- os guards de item não removível e estoque/teto continuam presentes no validador canônico, sem criar ou adulterar dados para fabricar cenários inexistentes;
- preview matemático read-only de cesta personalizada + produto extra + upsell;
- fórmula do preview conferida contra a estrutura de `recalculate_cart`;
- finalização exige persistência de `flow_order_id` e sessão `completed`;
- `nfm_reply` comercial V31 aceita sessão concluída;
- localização só é liberada para pedido `confirmed`, com `confirmed_at` e total positivo;
- replay do mesmo `nfm_reply` é identificado e não solicita localização novamente.

Resultado real: **14/14 checks verdes**.

Exemplo matemático exercitado com dados reais no snapshot:

```text
base cesta = 92.00
personalização = -19.90
extra = 12.90
upsell = 1.80
preview total = 86.80
```

A função declara `writes_executed=false`, `orders_created=false`, `pii_returned=false`.

### Gate unificado V3

Criada `get_whatsapp_flow_v31_full_release_readiness_v3(uuid)`, incorporando a regressão profunda.

Estado após aplicação:

- total: 18 checks;
- positivos: 16/18;
- `deep_readonly_regression=true`;
- `healthy=true`;
- `homologation_ready=false`;
- únicos negativos: `owner_conversation_ai=false` e `owner_handoff_clear=false`.

### Idempotência real do retorno `nfm_reply`

Foi identificado um detalhe na Edge `whatsapp-ingest-make-v1`: o banco já retornava `duplicate=true` e suprimia `location_required`, mas a Edge ainda aplicava um fallback textual genérico quando `reply_text` vinha vazio em replay.

Corrigido para fail-silent em replay:

- `duplicate=true` => `should_reply=false`, `reply_type=none`, sem corpo textual;
- `reply_text` vazio => idem;
- resposta válida inédita continua usando exclusivamente o `reply_text` determinístico vindo do backend.

A correção foi persistida no GitHub e implantada como versão **5** da Edge `whatsapp-ingest-make-v1`.

## Persistência / CI

Adicionados:

- `supabase/migrations/20260910201745_whatsapp_flow_v31_deep_readonly_regression_v4.sql`;
- `supabase/migrations/20260910201806_whatsapp_flow_v31_full_release_readiness_v3.sql`;
- `scripts/test-whatsapp-flow-v31-deep-readonly-contract.mjs`.

Atualizado:

- `.github/workflows/test-whatsapp-flow-v31-runtime.yml`, incluindo as duas novas migrations e o contrato profundo.

A trilha de CI foi disparada pelas alterações. Não declarar sucesso final enquanto o run correspondente não tiver conclusão `success` confirmada.

## Supabase Advisor

Auditoria de segurança após o DDL não trouxe alerta novo específico desta implementação. Permanecem os avisos já conhecidos do projeto:

- `RLS Enabled No Policy` em tabelas server-only;
- `Leaked Password Protection Disabled` no Auth.

Nenhum deles foi alterado automaticamente nesta rodada.

## Gates preservados

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

Nenhum cliente foi exposto, nenhum rollout foi aumentado, nenhum handoff foi alterado e nenhum pedido foi criado por esta rodada.

## Próximo ponto

1. confirmar CI da regressão profunda e da correção de idempotência da Edge;
2. reforçar contrato automatizado da Edge para garantir que replay de `nfm_reply` permaneça silencioso;
3. revisar a cadeia real Make -> Edge -> `process_whatsapp_flow_nfm_reply_v1` -> resposta outbound para confirmar que `location_required`/`reply_text` não têm outro caminho duplicado;
4. quando o preflight owner-only ficar naturalmente verde, executar a homologação visual completa no aparelho autorizado: cesta -> personalização -> seção/termo -> extras -> upsell -> revisão -> cadastro/endereço -> pagamento -> finalizar -> `nfm_reply` -> localização.

## Ação manual

Nenhuma ação manual indispensável neste momento. A precedência do atendimento humano continua sendo respeitada e não deve ser contornada para forçar o teste.
