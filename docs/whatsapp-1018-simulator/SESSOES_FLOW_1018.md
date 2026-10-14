# Fluxo de sessão para Meta Flow 1018 — especificação de segurança

**Status:** somente branch, sem provisionamento Meta e sem deploy no Supabase.

1. Gerar `flow_token` com `create1018FlowToken()` (prefixo `da1018_` + 256 bits aleatórios). `build1018FlowDraftMessage()` monta o payload Meta sem transmiti-lo. Ao enviar, vincular token ao WhatsApp account id **1018**, telefone E.164 do cliente, Meta Flow ID, WAMID da mensagem de abertura e à geração atual do piloto. Persistir somente SHA-256 do token, status pending e expiração em até 30 minutos.
2. Enviar o Flow pela API Meta já existente, apenas após autorização do piloto. A resposta recebida deve passar por assinatura HMAC válida, resolução do phone_number_id, normalização canônica e deduplicação por WAMID.
3. Ler `nfm_reply.response_json` **somente do evento original com assinatura verificada**, localizando a mensagem por WAMID, remetente, identificador telefônico Meta e WABA. O normalizador e a persistência ocultam o JSON bruto por segurança. Validar `flow_token` e `intent` e calcular hash SHA-256. O adaptador `ana-1018-meta-flow-completion-v1.mjs` **não executa ações**.
4. Recuperar a sessão **do banco pelo hash do token**; não aceitar sessão passada pelo navegador/cliente. Verificar conta 1018, telefone do cliente, origem Flow/WAMID, prazo e status. `ana-1018-flow-session-v1.mjs` é o validador puro.
5. Consumir a sessão em uma **transação atômica** no servidor, com lock na sessão e lock compartilhado na geração do piloto: somente pending pode mudar para consumed. Gravar o WAMID inbound. Duplicatas idênticas retornam o mesmo resultado sem nova operação. `ops2_1018_flow_session_register_v1` e `ops2_1018_flow_session_consume_v1` já estão preparados como SQL, **não aplicados em produção**.
6. Registrar e verificar a geração do piloto nos dois RPCs. Se houve rollback ou troca de geração, bloquear o consumo. O webhook chama `handle1018FlowWebhook()` apenas quando `WHATSAPP_1018_FLOW_HOOK_ENABLED=true` e conta/Flow ID forem explicitamente configurados. Valor padrão: desligado.
7. Mesmo após consumo, a intenção de consultar/alterar pedido exige vínculo verificado do cliente e regras do pedido. Não é autorização para alterar carrinho, cesta, preço, estoque ou valor oculto.
8. Mensagens de orientação e handoff só podem ser enviadas por uma operação separada, idempotente, com controle de janela de 24h ou template aprovado. Não responder automaticamente durante atendimento humano.

**Pendências antes de uso real:** aplicar e testar schema/RPC em banco isolado; verificar comportamento transacional sob concorrência real; cadastrar ou validar o Flow na Meta; registrar WAMID após envio e testar a janela de 24 horas; homologar o efeito das intenções nos pedidos/cestas; autorizar explicitamente a ativação. O webhook experimental está apenas na branch, com hook desligado por padrão. Não reutilizar Edge Functions aposentadas nem ligar o novo piloto durante esses trabalhos.

## Garantias já cobertas por testes locais
- Somente canal 1018, conta e telefone do cliente correspondentes.
- Sessão com prazo curto, token hash presente, referência de Flow e WAMID.
- Rejeição de resposta não verificada, expirada, repetida ou de outra conta.
- Nenhum efeito colateral no verificador puro.

**Não garantido ainda:** execução real das migrações, persistência e consumo atômico em PostgreSQL, autenticação do cliente no pedido, Meta Flow aprovado e envio real. O hook está programado, mas não implantado nem habilitado.

## Preparação do envio — 13/10
- `ana-1018-flow-send-v1.mjs` agora coordena, em módulo isolado, a construção do payload, o envio via função injetada e o registro de WAMID, hash do token e geração do piloto.
- A função retorna bloqueio quando o piloto está desligado, conta é diferente ou a janela de atendimento não foi previamente verificada. Ela não verifica a janela por conta própria; o chamador deverá comprovar a janela de 24 horas.
- Se a resposta do envio ou o registro forem incertos, retorna `requiresReconciliation=true` e **não repete o envio automaticamente**, evitando mensagens duplicadas.
- **Limitação arquitetural ainda aberta:** enviar primeiro e registrar depois deixa uma janela de falha. Para uso real, será necessário criar registro de intenção de envio persistente e mecanismo de conciliação com o WAMID, sem reenviar após timeout incerto. O módulo ainda não está ligado ao worker real.

## Rodada ampla de pré-implantação — outbox (13/10)
- Criada migração **isolada, não aplicada em produção**: `supabase/migrations/20261013_whatsapp_1018_flow_outbox_v1.sql`.
- Antes de chamar a Meta, `ops2_1018_flow_outbox_reserve_v1` persiste a intenção de envio, o hash SHA-256, cliente, Flow ID e geração ativa do piloto. Sem reserva, não há envio.
- `ops2_1018_flow_outbox_finalize_v1` registra o WAMID e a sessão **na mesma transação**, com proteção contra duplicidade, expiração, troca de geração e rollback.
- Erro/timeout de envio deixa estado `uncertain` para conciliação; **não há repetição automática**.
- O módulo `ana-1018-flow-send-v1.mjs` exige explicitamente `enabled=true`, conta correta, piloto ativo e janela de 24h previamente verificada. O remetente Meta é injetado; **não existe chamada real nem ligação ao worker**.
- Testes em `scripts/test-whatsapp-1018-flow-send-v1.mjs` e PostgreSQL isolado em `scripts/fixtures/whatsapp-1018-outbox-postgres-test-v1.sql`.
- Pendente: conciliação manual/assistida de WAMIDs incertos, checagem real de janela de serviço, validação Meta, teste em aparelhos, hospedagem pública isolada do simulador e autorização de liberação.
