# WhatsApp Flow Cestas — checkpoint RUN38 / V55

## Objetivo desta rodada
Remover um bloqueio real da homologação física terminal sem abrir rollout, sem criar pedido real e sem alterar o comportamento de clientes.

## Problema encontrado
Com `whatsapp_flow_commercial_write_enabled=false`, o runtime terminava o checkout em `FALHA_FINALIZACAO`. Além disso, `process_whatsapp_flow_nfm_reply_legacy_v1` só retornava `location_required=true` quando existia um pedido real confirmado em `public.orders`.

Isso tornava impossível comprovar fisicamente a sequência `FINALIZAR -> nfm_reply -> localização` mantendo os gates de segurança fechados.

## Implementação V55
Aplicada no Supabase a migration `20260912022619_whatsapp_flow_v55_owner_terminal_no_order_homologation`.

### Terminal owner-only sem pedido real
O runtime `handle_whatsapp_flow_commercial_exchange_v26` preserva o comportamento comercial existente e só converte `FALHA_FINALIZACAO` em uma tela física `FINALIZAR` quando todas as condições de homologação são verdadeiras:

- definição exata `flow-cestas-comercial-v8-stable`;
- candidate DRAFT/ready, sem exposição a cliente e criado para owner homologation;
- `homologation_test=true` e `requested_by_owner=true`;
- telefone da conversa igual ao `test_recipient` da sessão;
- número ativo na allowlist `controlled_live_homologation`;
- canary continua em 1%;
- Orchestrator, Data Exchange, Flow Send, commercial write e Bling continuam desligados;
- forma de pagamento válida;
- resumo e total são obtidos do preview determinístico do backend.

Nesse caminho não há chamada para `finalize_whatsapp_flow_commercial_order_v1`, `confirm_cart_order_v2` ou inserção em `orders`. A sessão recebe somente marcadores explícitos de homologação terminal e permanece vinculada ao owner autorizado.

### nfm_reply de homologação
`process_whatsapp_flow_nfm_reply_legacy_v1` mantém o comportamento de pedido real inalterado. Quando não existe pedido confirmado, ele só permite `location_required=true` no V8 estável se os marcadores owner-only estiverem presentes, o preview terminal tiver menos de 2 horas, a conversa continuar allowlisted e todos os gates continuarem fechados.

O evento `flow_nfm_reply` registra `homologation_no_order=true` e `has_confirmed_order=false`, permitindo provar posteriormente que a homologação terminou sem fabricar um pedido comercial.

## Verificação viva
RED antes da migration:
- `runtime_has_owner_terminal_preview=false`;
- `nfm_has_owner_no_order_path=false`.

GREEN após a migration:
- ambos ficaram `true`;
- `get_whatsapp_flow_v55_owner_terminal_no_order_readiness_v1()` retornou `ok=true` com 7/7 checks verdes;
- runtime permanece V26 / Edge 49;
- `physical_next_required=UPSELL`;
- `safe_to_launch_owner_v9=false` porque não existe conversa owner elegível na janela neste momento.

Verificação de efeitos colaterais após a migration:
- 0 pedidos criados nos 10 minutos seguintes;
- 0 mensagens criadas;
- 0 outbound jobs criados;
- 0 novas sessões owner de homologação;
- ACL do readiness V55: somente `postgres` e `service_role`.

## Gates preservados
- `whatsapp_live_canary_percent=1`;
- `experience_orchestrator_enabled=false`;
- `whatsapp_flow_data_exchange_enabled=false`;
- `whatsapp_flow_send_enabled=false`;
- `whatsapp_flow_commercial_write_enabled=false`;
- `bling_order_sync_enabled=false`.

## Make
Somente `consultar no cpf` permanece ativo. `incompleteExecutions=0`. Nenhum cenário Make foi modificado.

## Segurança
O Security Advisor não apontou finding novo relacionado ao V55. Permanecem avisos preexistentes em outras superfícies do banco, inclusive funções SECURITY DEFINER antigas fora deste Flow e tabelas RLS sem políticas; nenhuma delas foi criada ou ampliada por esta migration.

## Contrato estático
Adicionado `scripts/test-whatsapp-flow-v55-owner-terminal-no-order-contract.mjs`, exigindo os guards owner-only, limite de 20 produtos, backend determinístico, gates fechados, ACL service-role-only e ausência de criação de pedidos/outbound/mensagens no runtime V55.

## Próximo passo
A implementação técnica agora permite comprovar o terminal físico sem gerar pedido real. A evidência física continua pendente a partir de `UPSELL` e só poderá começar quando houver exatamente uma conversa do número autorizado dentro da janela de serviço. O lançador V9 permanece fail-closed enquanto isso não ocorrer.
