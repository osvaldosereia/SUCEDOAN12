# WhatsApp Flow Cestas Dona Antônia — checkpoint RUN6

Data: 2026-09-10

## Estado relido

- Candidato principal: `flow-cestas-comercial-v8-stable`.
- Meta Flow: `2579927222524475`, status `DRAFT`, candidato isolado.
- Runtime: `handle_whatsapp_flow_commercial_exchange_v23`.
- Sessão owner-only: `caf9452b-8df9-43f1-9487-cee2e9aff02a`, ainda `offered`, sem INIT/Data Exchange.
- Make: `Dona Antônia - WhatsApp Outbound Event-Driven v3` e `Dona Antônia - WhatsApp Inbound Controlado v1` continuam ativos e sem execuções incompletas; cenários temporários/legados de Flow permanecem inativos.

## Implementação desta rodada

Criado no Supabase e persistido no main o gate somente-leitura `get_whatsapp_flow_v31_behavioral_catalog_readiness_v1()`.

Ele testa o estado REAL do catálogo/cestas antes da homologação:

- exatamente 9 cestas comerciais;
- imagem disponível para as 9 cestas;
- editor/personalização resolvendo para as 9 cestas;
- nenhum campo de preço individual vazando nos itens editáveis da cesta;
- termos segmentados existentes;
- consultas por termo limitadas a no máximo 20 produtos;
- todos os produtos retornados continuam ativos, WhatsApp ativos, com preço positivo e estoque positivo;
- todas as opções retornadas possuem imagem;
- busca direta real (`sabonete`) fica dentro do subconjunto de até 12 itens.

Resultado real no Supabase: **10/10 checks verdes**.

Snapshot observado:

- cestas: 9;
- cestas com imagem: 9/9;
- editores resolvidos: 9/9;
- vazamento de preço de componente: 0;
- termos cadastrados/ativos: 32;
- termos com produto vendável no momento: 23/32;
- violações de limite: 0;
- produtos inválidos/sem estoque/preço retornados: 0;
- imagens faltantes nos resultados: 0;
- busca direta `sabonete`: 10 itens.

A diferença `23/32` é esperada e reforça a arquitetura correta: termos sem produto disponível são filtrados dinamicamente e não obrigam o Flow a carregar catálogo inteiro ou mostrar uma categoria vazia.

## Gate principal reforçado

`get_whatsapp_flow_v31_full_release_readiness_v1(uuid)` agora incorpora `behavioral_catalog_ready` e inclui o resultado comportamental no cálculo de `healthy`.

Estado real após a integração:

- `healthy=true`;
- gate principal: 14/16 checks positivos;
- `behavioral_catalog_ready=true`;
- jornada comercial: 20/20;
- terminal nfm_reply: pronto;
- únicos checks negativos: `owner_conversation_ai=false` e `owner_handoff_clear=false`;
- `next_expected=OPEN_FLOW`;
- nenhum outbound novo foi criado.

## CI

Adicionado `scripts/test-whatsapp-flow-v31-behavioral-catalog-contract.mjs` e incluído no workflow `Test WhatsApp Flow V31 Runtime`.

A migration reproduzível está em:

`supabase/migrations/20260910182000_whatsapp_flow_v31_behavioral_release_readiness_v2.sql`

## Gates preservados

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

Nenhum cliente foi exposto, nenhum rollout foi aumentado, nenhum handoff humano foi encerrado e nenhuma sessão adicional foi criada.

## Próximo ponto

Enquanto a conversa owner-only permanecer em modo humano/handoff, continuar regressões determinísticas principalmente de:

1. alteração de quantidades/personalização A/B/C;
2. escolha efetiva de upsell/cross-sell e limites de estoque;
3. revisão do carrinho após personalização + extras + upsell;
4. integração transacional com rollback até `FINALIZAR -> nfm_reply -> localização`.

Quando o preflight ficar naturalmente verde, executar a homologação visual completa no aparelho autorizado.

## Ação manual

Nenhuma ação manual indispensável neste momento.
