# WhatsApp Flow Cestas — checkpoint RUN33 — 2026-09-11

## Objetivo da rodada
Reduzir o risco da próxima prova física owner-only validando o lançamento do Flow estável e o payload nativo de WhatsApp Flow sem abrir gates, emitir token, criar sessão, mensagem, outbound ou pedido.

## Estado relido antes da alteração
- RUN32 confirmado no `main`.
- `get_whatsapp_flow_v49_physical_terminal_evidence_v1()` continua com `preflight_ok=true` e `ok=false`.
- Evidência física segue em `CESTAS -> PERSONALIZAR_A -> SECOES_A -> TERMOS_A -> PRODUTOS_A`.
- `next_required=UPSELL`.
- A sessão owner-only anterior está `abandoned`; a próxima prova precisa de nova sessão.
- Make continua com somente `consultar no cpf` ativo e `incompleteExecutions=0`.

## V50 aplicado
Migration Supabase: `20260911212209_whatsapp_flow_v50_owner_launch_dry_run_v1`.

Nova função read-only e service-role-only:
`get_whatsapp_flow_v50_owner_launch_dry_run_v1()`.

Ela valida:
1. preflight V49 ainda verde;
2. candidato `flow-cestas-comercial-v8-stable` em `ready` com provider id;
3. candidato fora de produção;
4. proibição explícita de catálogo completo;
5. hard cap de até 20 produtos por consulta;
6. IA sem autoridade sobre catálogo;
7. preços individuais dos componentes da cesta ocultos;
8. `flow_action=data_exchange`;
9. todos os gates de rollout ainda fechados;
10. necessidade de nova sessão física;
11. ausência de evidência terminal artificial.

Também monta somente em memória o payload nativo esperado:
`interactive.type=flow`, `flow_message_version=3`, `flow_id`, `flow_cta`, `flow_action=data_exchange` e um placeholder explícito de token. Nenhum token real é emitido.

## Resultado real
A execução após a migration retornou `ok=true`, 11/11 checks verdes.

Candidato validado:
- slug: `flow-cestas-comercial-v8-stable`
- provider id: `2579927222524475`
- handler: `v26`
- Edge runtime: `49`
- Flow JSON: `v31-stable-text-products`

Segurança reportada pelo próprio dry-run:
- writes_performed=false
- session_created=false
- token_issued=false
- outbound_created=false
- message_created=false
- order_created=false
- canary=1
- Orchestrator OFF
- Data Exchange OFF
- Flow Send OFF
- commercial write OFF
- Bling OFF

## Make
Somente `consultar no cpf` permanece ativo; `incompleteExecutions=0`. Nenhum cenário Make foi alterado.

## Segurança / advisors
O advisor do Supabase foi executado após a migration. Não surgiu alerta novo relacionado à V50. Permanecem avisos antigos de outras áreas do projeto; não foram alterados nesta rodada para evitar mudança fora do escopo do Flow.

## Testes e persistência
- TDD RED confirmado antes da implementação: chamada de `get_whatsapp_flow_v50_owner_launch_dry_run_v1()` falhou porque a função ainda não existia.
- Migration V50 aplicada.
- GREEN confirmado no Supabase: `ok=true`, 11/11 checks.
- Contrato estático adicionado em `scripts/test-whatsapp-flow-v50-owner-launch-dry-run-contract.mjs`.

## O que falta
A implementação técnica continua bloqueada apenas pela evidência física owner-only do trecho terminal:
`UPSELL -> REVISAO -> CLIENTE_EXISTENTE|CLIENTE_NOVO -> FINALIZAR -> nfm_reply -> location`.

A próxima prova deve iniciar em uma nova sessão owner-only no número autorizado. Os gates globais não devem ser abertos para fabricar essa evidência.

## Ação manual do proprietário
Nenhuma ação manual necessária nesta rodada. A única ação humana indispensável continua sendo atravessar fisicamente o Flow no número de homologação autorizado quando a prova final for iniciada.
