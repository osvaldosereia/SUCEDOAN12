# Checkpoint — Canário Meta 1018

**Data:** 2026-10-02

## Estado

O primeiro envio real pelo botão **Enviar** do Vitrine/Admin no canal 1018 foi concluído com sucesso usando a Meta WhatsApp Cloud API própria.

Mensagem de teste:

`TESTE META ADMIN 1018`

Destino permitido no canário:

`+5565998150975`

## Evidência no Supabase

Outbox:
- provider: `meta`
- status final: `sent`
- attempt_count: `1`
- metadata: `meta_canary=true`
- metadata: `meta_acceptance=accepted`
- mensagem canônica vinculada à outbox

Mensagem canônica no 1018:
- direction: `outbound`
- provider: `meta`
- sender_kind: `human`
- provider_message_id: `wamid.HBgMNTU2NTk4MTUwOTc1FQIAERgUQ0VFNDVEMDE4QkIxQTJFNkZCOUEA`
- status final observado: `read`
- exatamente 1 linha canônica para o texto de teste
- exatamente 1 wamid no histórico emissor para esse teste

Status oficiais Meta recebidos pelo webhook:
- `message.status.sent`
- `message.status.delivered`
- `message.status.read`

Todos foram normalizados e processados.

## Evidência no receptor 0975

A mesma mensagem apareceu como inbound no 0975.

Importante: o `wamid` observado no receptor é diferente do `wamid` retornado/registrado no emissor. Portanto, **não tratar wamid como identidade global entre os dois lados da conversa**. A deduplicação deve permanecer por conta/lado e pelo provider_message_id dentro dessa conta.

## Segurança do canário

Runtime 1018:
- `human_send_enabled=true`
- `outbound_provider=meta`
- `meta_canary_enabled=true`
- allowlist: somente `+5565998150975`
- `meta_send_homologated=false` durante esta fase de observação

Runtime 0975:
- `human_send_enabled=false`
- `outbound_provider=papoai`
- `homologated_at=null`

A migration `admin_attendance_meta_canary_guard_v1` valida a allowlist em **enqueue** e **claim**.

Testes do guard:
- RED anterior: outro cliente seria enfileirado pela função antiga;
- GREEN atual: outro cliente retorna `meta_canary_destination_blocked`;
- GREEN atual: 0975 passa enqueue + claim com WABA/Phone Number ID do 1018.

Após o envio real:
- outbox humana pendente (`queued`/`claimed`): `0`.

## Próxima ação

Manter o 1018 restrito ao 0975 por uma pequena janela de estabilidade e fazer mais uma validação controlada antes de marcar `meta_send_homologated=true` e retirar a allowlist.

Não abrir o 0975 para outbound Meta ainda.
