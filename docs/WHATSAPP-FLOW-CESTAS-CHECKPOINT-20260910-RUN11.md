# WhatsApp Flow Cestas Dona Antônia — Checkpoint RUN11 — 2026-09-10

## Estado relido

- O `main` já continha a RUN10 concluída com runtime comercial V24, Edge Data Exchange 45 e primeiro envio real do Flow V31 aceito pela Meta no número owner-only autorizado.
- Sessão owner-only atual: `836b1b60-8030-424a-aab3-c6f8f6a0969b`.
- Outbound atual: `09f7fe1f-7c0c-4173-afdd-6ff1e4b0f39d`, reconciliado como `sent`, HTTP 200 no segundo envio protegido.
- A sessão permanece `offered`, `opened_at=null`, `flow_current_screen=null`, `flow_state_version=0`, `flow_exchange_count=0`.
- Não existe evento Data Exchange real da sessão ainda; `next_expected=OPEN_FLOW`.
- Make continua com exatamente três cenários ativos autorizados e zero execuções incompletas. No cenário outbound 7290488, a execução owner-only corrigida `974ecf7c0dc14b4a9993010572744882` terminou `success`; a execução anterior `ced5f8f7b569433596f72747e4e01a9e` é o HTTP 400 já diagnosticado/corrigido na RUN10.

## Implementação desta rodada

### Auditoria live da jornada V31

Criada e aplicada no Supabase:

`get_whatsapp_flow_v31_live_session_audit_v1(uuid)`

A função é somente leitura e foi desenhada especificamente para acompanhar a homologação real quando o proprietário abrir o Flow. Ela:

- aceita apenas sessão do candidato estável `flow-cestas-comercial-v8-stable`;
- lê somente `experience_sessions`, `whatsapp_flow_exchange_events` e catálogo determinístico;
- valida allowlist das telas V31;
- conta erros e replays de Data Exchange;
- compara estado corrente e quantidade de exchanges observados;
- audita `flow_pending_addons` para impedir duplicação do mesmo `product_id`;
- exige quantidade de adicionais entre 1 e 6;
- revalida produto ativo, WhatsApp ativo, preço positivo e estoque atual;
- quando já existir seleção de cesta, usa `format_whatsapp_flow_session_preview_v2` para expor apenas disponibilidade e total da prévia;
- retorna `next_expected` de acordo com a tela real corrente;
- nunca retorna nome, telefone, rua, localizador ou outro PII;
- declara explicitamente `pii_returned=false` e `writes_executed=false`.

Na sessão real atual o resultado foi:

- `ok=true`;
- `opened=false`;
- `init_count=0`;
- `error_count=0`;
- `replay_count=0`;
- `pending_addon_rows=0`;
- `pending_addon_duplicate_free=true`;
- `next_expected=OPEN_FLOW`.

### Contrato e CI

Persistidos no GitHub:

- `supabase/migrations/20260910225200_whatsapp_flow_v31_live_session_audit_v1.sql`;
- `scripts/test-whatsapp-flow-v31-live-session-audit-contract.mjs`;
- `.github/workflows/test-whatsapp-flow-v31-live-audit.yml`.

O contrato impede que a auditoria passe a executar INSERT/UPDATE/DELETE, exige o candidato V31, allowlist das telas comerciais, validações de extras/estoque/quantidade e nega campos conhecidos de PII.

Workflow `Test WhatsApp Flow V31 Live Audit`, run `34539554448`: **success**.

## Readiness atual

`get_whatsapp_flow_v31_full_release_readiness_v6(session)` continua **21/21**, `healthy=true`, `homologation_ready=true`, `ok=true`.

Readiness complementares permanecem verdes:

- jornada comercial 20/20;
- behavioral catalog 10/10;
- transactional read-only 16/16;
- deep read-only 14/14;
- silent `nfm_reply` 8/8;
- navigation/preview integrity 15/15;
- live session audit atual `ok=true`.

## Gates preservados

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

Nenhum rollout geral foi aumentado, nenhum Flow foi enviado para cliente fora da allowlist e nenhum write comercial foi habilitado.

## Próximo ponto exato

1. Observar o primeiro `INIT` real da sessão owner-only.
2. Usar `get_whatsapp_flow_v31_live_session_audit_v1` depois de cada avanço para auditar automaticamente `CESTAS -> PERSONALIZAR -> SECOES -> TERMOS/busca direta -> PRODUTOS -> PRODUTO -> UPSELL -> REVISAO -> CLIENTE -> FINALIZAR`.
3. Confirmar no aparelho que voltar/editar não duplica adicional e que o total de revisão continua igual ao preview V2.
4. Completar `nfm_reply` e confirmar pedido de localização no WhatsApp, sem segunda resposta em replay.
5. Manter todos os gates globais e Bling desligados até homologação integral e autorização explícita.

## Ação manual indispensável para a homologação visual

A mensagem real do Flow já foi aceita pela Meta e enviada ao número autorizado. Para produzir o primeiro `INIT` real e validar a interface/Data Exchange no aparelho, o proprietário precisa abrir essa mensagem no WhatsApp e tocar em **Montar pedido**. Nenhuma outra configuração manual é necessária neste momento.
