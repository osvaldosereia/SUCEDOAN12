# WhatsApp Flow Cestas — checkpoint RUN29 / V47 — 2026-09-11

## Objetivo da rodada
Fechar a regressão segura do trecho terminal do Flow comercial sem abrir rollout, sem criar pedido e sem alterar estado persistente de cliente/sessão. Reforçar o contrato de `nfm_reply` e localização, que no V46 era verificado apenas pela existência das funções.

## Estado lido antes da alteração
- Runtime comercial: `handle_whatsapp_flow_commercial_exchange_v26` / Edge 49.
- V46: `ok=true`.
- Evidência física anterior: 7 exchanges, state version 6, até `PRODUTO` / resposta `PRODUTOS_A`.
- A sessão física de evidência estava marcada como `abandoned`; ela foi usada apenas dentro de subtransação para a regressão e voltou exatamente ao estado original.
- Gates mantidos: canary 1%; Orchestrator OFF; Data Exchange OFF; Flow Send OFF; commercial write OFF; Bling OFF.
- Make: apenas `consultar no cpf` ativo, sem execução incompleta no momento da auditoria.

## Regressão terminal transacional com rollback
Foi executada uma regressão no Supabase usando o runtime V26 e a sessão owner-only de evidência. Dentro de uma subtransação, a sessão foi temporariamente reaberta apenas para simulação e toda a subtransação foi revertida intencionalmente.

Caminho comprovado:

`PRODUTO_A -> SECOES_B -> UPSELL -> REVISAO -> CLIENTE_EXISTENTE -> FINALIZAR`

Resultados observados na simulação:
- produto extra selecionado com quantidade 1;
- `UPSELL` retornou 6 sugestões do backend e texto explicitamente opcional;
- `REVISAO` calculou resumo e total pelo backend;
- cliente/endereço existentes foram reutilizados sem novo preenchimento;
- formas de pagamento retornadas: PIX, dinheiro, cartão crédito/débito e alimentação/refeição;
- `FINALIZAR` retornou modo de homologação com `write_enabled=false` e orientação para enviar localização ao voltar ao WhatsApp.

Prova de neutralidade após o rollback:
- pedidos: mesmo total antes/depois;
- `whatsapp_flow_write_operations`: mesmo total antes/depois;
- outbound jobs: mesmo total antes/depois;
- status, tela e state version da sessão: exatamente iguais antes/depois.

Nenhum pedido, cliente, carrinho, outbound ou rollout foi persistido por este teste.

## nfm_reply auditado
O roteador `process_whatsapp_flow_nfm_reply_v1` delega os Flows comerciais ao `process_whatsapp_flow_nfm_reply_legacy_v1`.

O handler legado atual:
- aceita explicitamente `flow-cestas-comercial-v8-stable`;
- aceita sessão terminal `completed`;
- valida o `flow_order_id` contra pedido confirmado;
- é idempotente por `message_id`;
- retorna `location_required=true` quando existe pedido confirmado;
- retorna texto pedindo localização no WhatsApp;
- replay duplicado permanece silencioso no bridge Edge.

Portanto não foi feita alteração desnecessária nesse caminho.

## V47 implementado
Migration aplicada no Supabase:
`20260911172252_whatsapp_flow_v47_terminal_contract_readiness_v1.sql`

Nova função somente leitura:
`get_whatsapp_flow_v47_terminal_contract_readiness_v1()`

O gate V47 protege 10 contratos:
1. V46/runtime atual verde;
2. cadeia V26 -> V25;
3. transições UPSELL -> REVISAO -> CLIENTE -> FINALIZAR;
4. upsell backend e opcional;
5. reutilização de cliente/endereço conhecido;
6. quatro formas de pagamento atuais;
7. finalização fail-closed;
8. roteamento do nfm comercial;
9. compatibilidade explícita do candidato estável + localização;
10. todos os gates de rollout continuam bloqueados.

Resultado após aplicar: `ok=true`, 10/10 checks verdes.

## Proteção no GitHub
Adicionados:
- `supabase/migrations/20260911172252_whatsapp_flow_v47_terminal_contract_readiness_v1.sql`;
- `scripts/test-whatsapp-flow-v47-terminal-contract-readiness.mjs`;
- `.github/workflows/whatsapp-flow-v47-terminal-contract.yml`.

O workflow executa o contrato Node em push/PR dos arquivos V47.

## O que continua pendente
1. Evidência física real do trecho terminal no número owner-only autorizado: `UPSELL -> REVISAO -> CLIENTE/ENDERECO -> FINALIZAR -> nfm_reply -> localização`.
2. Como a sessão usada como evidência anterior agora está `abandoned`, o próximo teste físico deve iniciar/abrir uma sessão owner-only nova pelo mecanismo de homologação; não alterar essa sessão antiga para fabricar evidência.
3. Restaurar `whatsapp/flows/flow-cestas-comercial-v31-stable-text-products.json` exclusivamente pelo builder oficial `scripts/build-flow-v31-stable-text-products.py` antes de qualquer futura republicação na Meta. O artefato não possui histórico no GitHub, então não deve ser reconstruído manualmente.
4. Manter todos os gates fechados até a evidência física terminal e a checagem final de release.

## Ação manual do proprietário
Nenhuma ação manual é necessária para o bloco de backend concluído nesta rodada. A única ação humana indispensável continua sendo, quando chegar a hora da evidência física, atravessar o Flow pelo número de homologação autorizado. Como a sessão anterior está abandonada, o teste deverá começar em uma nova sessão owner-only.
