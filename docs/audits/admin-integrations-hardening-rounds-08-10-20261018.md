# Saneamento — Rodadas 08–10/15: Bling, WhatsApp e rastreabilidade

## Rodada 08 — Bling

Inspecionado syncConfirmedOrderToBling. Antes, a chamada ops2_ensure_order_state podia retornar sucesso, mas uma falha na gravação subsequente em orders era ignorada e a função reportava sincronização concluída. Corrigido: a resposta local agora é verificada; se falhar, retorna bling_order_local_persistence_failed, external_write_succeeded=true e reconciliation_required=true, sem emitir evento de sucesso.

O erro sinaliza estado incerto e exige reconciliação; não tenta repetir automaticamente uma escrita externa potencialmente concluída. A idempotência persistente do Hub continua dependente de inspeção e ensaios de falha.

## Rodada 09 — WhatsApp

Inspecionados orderWhatsappSend, dispatchOrderWhatsapp e persistStatus do webhook Meta. Há fila de envio por RPC, duas invocações de gateway, captura de eventos e gravação de status. Os dois envios de gateway não foram modificados sem comprovar se são intencionais, seguros e deduplicados pelo serviço de destino. O retorno delivery_ok não substitui confirmação assíncrona de entrega pelo provedor.

Pendentes: testes de repetição, callbacks fora de ordem, falha após persistência e deduplicação end-to-end.

## Rodada 10 — Clientes e histórico

Confirmada a proteção já existente de customerHistoryRequestSeq e identidade do cliente contra respostas obsoletas. A paginação usa next_offset e a reconciliação de histórico dispõe de retry. Nenhuma mudança funcional adicional foi justificada nessa parte. Pendentes: validação de paginação com dados extensos, concorrência entre operações e isolamento de dados no backend.

## Evidências

- Alterado supabase/functions/admin-products-live-v1/index.ts para tratar falha de persistência local após sucesso externo do Bling.
- Criado scripts/test-admin-integrations-hardening-contract.mjs e incluído no CI do Admin.
- Testes de contrato são estáticos; não demonstram integração real ou estados de produção.
- Sem deploy, merge, chamadas reais de envio ou alterações de dados operacionais.

## Estado

Rodada 08: correção aplicada; testes e homologação pendentes.
Rodada 09: revisão e contrato; integração real pendente.
Rodada 10: proteção prévia confirmada; homologação de dados e concorrência pendente.
