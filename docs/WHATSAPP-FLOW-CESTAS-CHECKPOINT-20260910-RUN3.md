# WhatsApp Flow Cestas — checkpoint Run 3 — 2026-09-10

## Escopo

Continuação da homologação segura do candidato `flow-cestas-comercial-v8-stable` (V31 / runtime V22), sem exposição a clientes e sem alteração dos gates globais.

## Auditoria inicial

GitHub, Supabase e Make foram relidos antes das mudanças.

Supabase confirmou:

- `whatsapp_live_canary_percent=1`;
- `experience_orchestrator_enabled=false`;
- `whatsapp_flow_data_exchange_enabled=false`;
- `whatsapp_flow_send_enabled=false`;
- `whatsapp_flow_commercial_write_enabled=false`;
- `bling_order_sync_enabled=false`;
- candidato V31 `ready`;
- Meta `DRAFT`;
- `provider_id=2579927222524475`;
- `handler_version=v22`;
- `flow_json_version=v31-stable-text-products`;
- `production_enabled=false`;
- `live_percent=0`;
- validação Meta com zero erros.

Make permaneceu com os cenários operacionais autorizados; o outbound continua ativo e os probes/testes permanecem inativos.

## Terminal nfm_reply endurecido

A auditoria do caminho terminal mostrou que o entrypoint atual de `nfm_reply` é um wrapper que atende Address Flow / escolha simples de cesta e delega os demais Flows comerciais para `process_whatsapp_flow_nfm_reply_legacy_v1`.

Foi confirmada em produção a compatibilidade do processador comercial com `flow-cestas-comercial-v8-stable`, mas essa garantia não estava reproduzida de forma explícita no checkpoint V31 atual. Para eliminar drift futuro foi criada e aplicada a migration:

`20260910153000_whatsapp_flow_v31_terminal_nfm_bridge_v1.sql`

Ela fixa de forma reproduzível que:

1. `flow-cestas-comercial-v8-stable` é aceito no retorno terminal;
2. sessões `completed` continuam válidas para o `nfm_reply` final;
3. o retorno pertence obrigatoriamente à mesma conversa;
4. somente pedido real `status='confirmed'`, `confirmed_at` preenchido e total positivo produz `location_required=true`;
5. `message_id` deduplica o `nfm_reply` para não pedir localização duas vezes;
6. o evento terminal é persistido em `experience_events`;
7. o texto final pede localização pelo WhatsApp somente após pedido confirmado;
8. as funções permanecem `service_role` only.

Nenhum gate de envio, Data Exchange ou escrita comercial foi ligado por essa migration.

## Readiness terminal V1

Foi criada a RPC somente leitura:

`get_whatsapp_flow_v31_terminal_readiness_v1()`

Ela inspeciona as definições reais no banco e valida 12 invariantes do trecho final da jornada:

- candidato ready;
- Meta DRAFT;
- candidato isolado;
- canary global em 1%;
- gates globais de Flow fechados;
- Bling fechado;
- wrapper atual delegando para o processador comercial;
- V31 explicitamente suportado;
- sessão completed suportada;
- pedido confirmado obrigatório;
- handoff para localização presente;
- idempotência do `nfm_reply` presente.

Resultado após aplicação: **12/12 checks aprovados (`ok=true`)**.

## CI / regressão

`scripts/test-whatsapp-flow-v31-runtime-contract.mjs` agora cobre também:

- V31 no processador terminal;
- sessão completed;
- confirmação real do pedido antes da localização;
- idempotência;
- `location_required`;
- texto de solicitação de localização;
- readiness terminal;
- transporte de `interactive_type=nfm_reply` pelo ingest do Make/Supabase;
- privilégios server-only.

O workflow `Test WhatsApp Flow V31 Runtime` passou a observar a nova migration e mudanças no ingest de WhatsApp. No momento deste checkpoint, o status do commit mais recente ainda estava pendente de consolidação pelo GitHub.

## Homologação owner-only

O preflight V3 foi executado novamente contra o alvo autorizado.

Infraestrutura e contrato comercial continuam aprovados, incluindo:

- candidato/Meta;
- handler V22;
- catálogo somente por subconjunto;
- máximo 20 produtos por consulta;
- componentes da cesta sem preço individual;
- estoque real;
- upsell opcional;
- criptografia/assinatura/replay guard;
- allowlist do alvo.

A conversa homologada permanece:

- `mode=human`;
- service window aberta;
- handoff humano ativo.

Por isso o preflight retorna `ok=false` somente nos checks `owner_conversation_ai` e `owner_handoff_clear`. Nenhum Flow foi enviado e nenhum atendimento humano foi alterado ou encerrado automaticamente.

## Próximo ponto exato

1. confirmar CI verde do contrato V31 atualizado;
2. continuar regressões offline/determinísticas enquanto o alvo homologado estiver sob controle humano;
3. quando a conversa homologada estiver naturalmente em IA e sem handoff, executar exclusivamente `queue_and_dispatch_whatsapp_flow_owner_homologation_v6`;
4. validar ponta a ponta: cesta → personalização → seção/termo → extras → upsell → revisão → cadastro/endereço → pagamento → confirmação → `nfm_reply` → solicitação de localização;
5. não abrir gates globais, não aumentar canary e não ativar Bling antes da homologação final.

## Ação manual

Nenhuma ação manual indispensável do proprietário neste ponto. A proteção de handoff humano continua intencional e não deve ser contornada.
