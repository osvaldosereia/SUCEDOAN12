# WhatsApp Flow Dona Antônia — execução V31 / V22

Data: 2026-09-10
Branch: `flow-v29-fast-owner-test`

## Avanço desta execução

Foi removida uma dependência estrutural do emissor normal de token de WhatsApp Flow. O emissor normal `issue_whatsapp_flow_token_v1` exige os gates globais de orquestração, Data Exchange e envio ligados, o que é incompatível com a regra de homologação da V31.

Foi criada e aplicada a função `issue_whatsapp_flow_owner_homologation_token_v1(uuid,text)` exclusivamente para homologação controlada do proprietário.

### Regras do emissor de homologação

A função somente emite token quando TODAS as condições abaixo são verdadeiras:

- `whatsapp_live_canary_percent = 1`;
- `experience_orchestrator_enabled = false`;
- `whatsapp_flow_data_exchange_enabled = false`;
- `whatsapp_flow_send_enabled = false`;
- `whatsapp_flow_commercial_write_enabled = false`;
- `bling_order_sync_enabled = false`;
- a conversa pertence a telefone habilitado em `whatsapp_test_allowlist` com `purpose='flow_v31_owner_homologation'`;
- a definição é exatamente `flow-cestas-comercial-v8-stable`;
- a definição está `ready` e possui `provider_id` Meta;
- `candidate_not_live=true`;
- `customer_exposure=false`;
- `default_for_new_sessions=false`;
- `meta_status=DRAFT`;
- `production_enabled=false`.

A sessão criada recebe explicitamente `test_mode=true`, `homologation_test=true`, `requested_by_owner=true`, `audit_only=true` e o destinatário de teste no contexto. O token é armazenado somente como hash no banco, seguindo o mecanismo normal do projeto.

### Segurança

A função é `SECURITY DEFINER`, mas EXECUTE foi removido de `PUBLIC`, `anon` e `authenticated`; somente `service_role` possui permissão. Isso foi validado no banco.

A allowlist operacional foi habilitada para o número de homologação já autorizado, com expiração automática. O número não foi gravado nesta migration/documentação.

### Dispatcher exclusivo de homologação

Foi criada também `dispatch_whatsapp_flow_owner_homologation_job_v1(uuid)`. Ela somente despacha um job Flow quando:

- os seis gates globais continuam travados nos valores de homologação;
- destinatário e conversa coincidem;
- o destinatário está na allowlist específica V31;
- a sessão é owner-only e ainda válida;
- a definição é exatamente a V31 `flow-cestas-comercial-v8-stable`, `ready`, `DRAFT`, não-live e sem exposição;
- `flow_id` coincide com o `provider_id` da definição;
- o SHA-256 do `flow_token` enviado coincide com `experience_sessions.flow_token_hash` da sessão.

Também é `service_role`-only.

Migration persistida:

`supabase/migrations/20260910072700_whatsapp_flow_v31_owner_homologation_dispatch.sql`

### Smoke real outbound

Foi criada uma sessão/token owner-only da V31 com todos os gates globais desligados e um job foi encaminhado pelo dispatcher exclusivo ao cenário Make `Dona Antônia - WhatsApp Outbound Event-Driven v3`.

Na primeira tentativa, a Meta respondeu erro `131009`: um Flow em estado DRAFT exige explicitamente `mode: "draft"` no payload de envio. O módulo Flow do Make foi corrigido apenas na rota de homologação para acrescentar `mode: "draft"`.

Após a correção, o mesmo smoke controlado recebeu **HTTP 200 da Graph API** e retornou um `wamid`, confirmando que o Meta Flow DRAFT V31 foi aceito para entrega ao número autorizado de homologação. O Make voltou a operar com `stopOnHttpError=true` após o diagnóstico, mantendo falha explícita para novos erros HTTP.

O job de homologação foi finalizado como sucesso usando o `provider_message_id` retornado pela Meta.

### Teste do emissor

O emissor foi executado com os seis gates globais nos valores obrigatórios e criou com sucesso uma sessão `offered` da V31, vinculada ao Meta Flow DRAFT `2579927222524475`. A sessão foi marcada como homologação do proprietário e não altera rollout nem exposição a clientes.

Migration persistida:

`supabase/migrations/20260910072400_whatsapp_flow_v31_owner_homologation_token.sql`

A definição `flow-cestas-comercial-v8-stable` foi atualizada com `implementation_stage=v31_v22_owner_token_path_ready` e metadados registrando que o emissor/allowlist foram verificados.

## Estado que permanece obrigatório

- Meta Flow: DRAFT, não publicar.
- Handler determinístico: V22.
- Edge: V41.
- Catálogo: somente consultas segmentadas/dinâmicas; nunca carregar catálogo completo.
- Make Flow outbound: somente número de homologação autorizado e `mode=draft`.
- Bling: desligado.
- Escrita comercial: desligada.

## Próximo bloco

Inspecionar a abertura/interação real do DRAFT através dos eventos de Data Exchange e inbound do número de homologação. Validar `INIT`, escolha das 9 cestas, personalização, busca segmentada, detalhe/quantidade, repetição/estoque, upsell, revisão, cliente/endereço e `nfm_reply`. Corrigir eventuais divergências sem publicar nem alterar os gates globais.
