# Task 11 — ANA própria — dry-run checkpoint — 2026-10-03

## Estado

Primeira camada da ANA própria implementada **sem envio automático**.

## Entregue

- `whatsapp_ana_jobs_v1`: fila própria, service-role-only, RLS habilitado, dedupe único por `inbound_message_id`.
- `ops2_ana_enqueue_dry_run_v1`: enqueue explícito, somente inbound texto, respeita `ops2_attendance_ai_gate_v1`.
- `ops2_ana_claim_dry_run_v1`: claim concorrente com `FOR UPDATE SKIP LOCKED`.
- `ops2_ana_finish_dry_run_v1`: resultado auditável `completed/skipped/failed`, sempre marcado `dry_run_not_sendable=true`.
- `ana-policy-v1.mjs`: policy própria da ANA, sem depender do PapoAI; não pode inventar fatos e faz no máximo uma pergunta.
- `whatsapp-ana-worker-v1`: worker próprio via OpenAI Responses API + Structured Outputs.
- Gate Humano × IA é consultado antes da geração e novamente depois da geração; takeover durante o processamento invalida a sugestão.
- Worker não contém qualquer integração de envio Meta/WhatsApp e não escreve na fila de outbound.

## TDD e validação

- PR #662 começou RED com fila/policy/worker inexistentes.
- CI RED confirmado no commit `5fbb75c9044a881a4beba7b6802f28a5a07b3d33`.
- Implementação GREEN no commit `bb565e2000af9536b6bdc79a4c0e6623be405c4a`.
- CI `test`: success.
- Migration `whatsapp_ana_jobs_v1` aplicada no Supabase canônico.
- Edge Function `whatsapp-ana-worker-v1` publicada ACTIVE v1.
- Smoke transacional com rollback: PASS para enqueue, dedupe, claim, finish, rejeição de outbound e gate humano.
- Após os smokes: `whatsapp_ana_jobs_v1` contém 0 jobs.
- `ana_enabled=false` e `campaigns_enabled=false` nos dois canais.
- Nenhum trigger automático de inbound e nenhum cron/agendamento ANA foram habilitados.

## Segurança

- Worker exige `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` por validação própria server-side.
- `OPENAI_API_KEY` é lida apenas do ambiente server-side.
- OpenAI é chamada com `store:false` e Structured Outputs.
- Nenhuma mensagem real foi enviada nesta fase.
- PapoAI continua preservado como sombra/fallback.

## Ainda não homologado

Esta etapa **não conclui a Task 11**. Ainda faltam:

1. executar um dry-run real do modelo sobre mensagens de canário e revisar qualidade;
2. enriquecer contexto com políticas publicadas e ferramentas de dados atuais antes de permitir respostas sobre preço/estoque/pedido;
3. criar visualização/comparação das sugestões no Admin;
4. somente depois criar canário explícito de outbound ANA 0975↔1018;
5. manter clientes reais bloqueados até evidência suficiente.

## Gate paralelo pendente

Task 9B ainda precisa de um envio real de mídia pelo gateway autenticado 0975↔1018 para comprovar `wamid/status/dedupe`.
