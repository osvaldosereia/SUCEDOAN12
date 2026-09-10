# WhatsApp Flow V31 — checkpoint 2026-09-10 12:24 UTC

## Objetivo desta rodada

Continuar a homologação segura da candidata `flow-cestas-comercial-v8-stable`, sem expor clientes e sem abrir gates globais.

## Estado real confirmado no Supabase

A candidata V31/V22 existe no banco mesmo que parte do histórico V31 ainda não esteja presente no `main` do GitHub:

- definition slug: `flow-cestas-comercial-v8-stable`
- Meta Flow ID: `2579927222524475`
- status: `ready`
- meta status: `DRAFT`
- handler: `v22`
- flow JSON version: `v31-stable-text-products`
- `candidate_not_live=true`
- `customer_exposure=false`
- `default_for_new_sessions=false`

Sessão de homologação owner-only atual:

- session: `caf9452b-8df9-43f1-9487-cee2e9aff02a`
- status: `offered`
- expires: `2026-09-10 21:21:22+00`
- exchange count: `0`
- current screen: `null`
- next expected: `OPEN_FLOW`
- preflight: 28/28 checks OK

O outbound da sessão foi aceito pela Meta com HTTP 200 e possui um único job de Flow vinculado à sessão.

## Correção implementada

Foi detectado que `get_whatsapp_flow_v31_journey_audit_v1` agregava todos os `outbound_jobs` da mesma conversa após `offered_at`. Como a conversa de homologação também recebe mensagens normais do atendente, o auditor mostrava vários jobs que não pertenciam à sessão V31.

Criado `get_whatsapp_flow_v31_journey_audit_v2(uuid)`.

O V2 mantém o auditor V1 como base, mas substitui a projeção `outbound` por jobs que atendem simultaneamente:

1. mesma conversa da sessão;
2. `message_type=interactive`;
3. `interactive.type=flow`;
4. `flow_id` igual ao `provider_id` da definição;
5. SHA-256 do `flow_token` do job igual ao `flow_token_hash` da sessão.

Resultado do teste real da sessão atual:

- V1: misturava várias mensagens da conversa;
- V2: `outbound_scope.mode=session_flow_token_hash`;
- `flow_jobs=1`;
- job correto com status `sent`, HTTP 200 e provider message id da Meta.

Permissões do V2:

```text
anon_execute=false
authenticated_execute=false
service_role_execute=true
```

Migration persistida:

`supabase/migrations/20260910122400_whatsapp_flow_v31_journey_audit_v2_outbound_scope.sql`

## Gates preservados

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

Nenhum rollout foi aumentado. Nenhum cliente recebeu o Flow nesta rodada. Nenhum pedido comercial foi gravado.

## Make auditado

Continuam ativos somente os cenários autorizados:

- `Dona Antônia - WhatsApp Outbound Event-Driven v3`
- `Dona Antônia - WhatsApp Inbound Controlado v1`
- `consultar no cpf`

Os três estavam com `incompleteExecutions=0` na auditoria desta rodada.

## Segurança pós-DDL

Supabase Advisor não apontou novo alerta relacionado à nova função. Permanecem os avisos preexistentes do projeto:

- `RLS Enabled No Policy` em tabelas server-only;
- `Leaked Password Protection Disabled` no Auth.

A configuração de Auth não foi alterada.

## Drift GitHub x Supabase

Foi confirmado que o estado V31/V22 e as funções de homologação existem no Supabase, enquanto alguns checkpoints/migrations das rodadas V31 anteriores não aparecem no `main` atual do GitHub. Esta rodada não apagou nem recriou esse estado. A partir daqui, toda nova mudança deve ser persistida explicitamente no `main` e novos checkpoints devem registrar o que é estado comprovado do banco versus histórico ainda não backfilled no repositório.

## Próximo passo

A jornada real continua bloqueada apenas pela ausência de abertura do DRAFT no aparelho autorizado. Assim que ocorrer `INIT`, usar `get_whatsapp_flow_v31_journey_audit_v2` para acompanhar a sessão sem ruído de outras mensagens e validar sequencialmente:

`CESTAS -> PERSONALIZACAO -> SECOES/TERMOS -> PRODUTOS -> QUANTIDADE -> UPSELL -> REVISAO -> CLIENTE/ENDERECO -> PAGAMENTO -> FINALIZAR -> nfm_reply -> PEDIR LOCALIZACAO`.
