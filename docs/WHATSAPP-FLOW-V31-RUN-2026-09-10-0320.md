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

### Teste realizado

O emissor foi executado com os seis gates globais nos valores obrigatórios e criou com sucesso uma sessão `offered` da V31, vinculada ao Meta Flow DRAFT `2579927222524475`. A sessão foi marcada como homologação do proprietário e não altera rollout nem exposição a clientes.

Migration persistida:

`supabase/migrations/20260910072400_whatsapp_flow_v31_owner_homologation_token.sql`

A definição `flow-cestas-comercial-v8-stable` foi atualizada com `implementation_stage=v31_v22_owner_token_path_ready` e metadados registrando que o emissor/allowlist foram verificados.

## Estado que permanece obrigatório

- Meta Flow: DRAFT, não publicar.
- Handler determinístico: V22.
- Edge: V41.
- Catálogo: somente consultas segmentadas/dinâmicas; nunca carregar catálogo completo.
- Make Flow outbound: somente número de homologação autorizado.
- Bling: desligado.
- Escrita comercial: desligada.

## Próximo bloco

Usar a sessão/token de homologação pelo caminho outbound já protegido, realizar o smoke real no DRAFT e inspecionar os eventos criptografados de Data Exchange/`nfm_reply`. Corrigir eventuais divergências visuais ou contratuais sem publicar nem alterar os gates globais.
