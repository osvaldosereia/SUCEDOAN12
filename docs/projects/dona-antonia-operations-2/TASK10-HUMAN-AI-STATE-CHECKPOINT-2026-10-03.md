# Task 10 — Estado Humano × IA — checkpoint 2026-10-03

## Objetivo

Tornar o controle de atendimento explícito e independente do PapoAI, usando os campos já existentes em `conversations` e fechando corrida entre takeover humano e futuro worker da ANA.

## Implementação desta rodada

- `ops2_admin_attendance_takeover_v1(conversation_id)`:
  - exige usuário autenticado e `admin_users.is_active=true`;
  - serializa a conversa com `FOR UPDATE`;
  - muda para `mode='human'`;
  - marca `human_required=true`;
  - grava `human_takeover_at`;
  - limpa `ai_resume_at`;
  - atribui `assigned_admin_user_id`;
  - não permite tomar silenciosamente conversa já atribuída a outro admin.
- `ops2_admin_attendance_resume_ai_v1(conversation_id)`:
  - operação explícita;
  - muda para `mode='ai'`;
  - marca `human_required=false`;
  - grava `ai_resume_at`;
  - limpa `assigned_admin_user_id`.
- `ops2_attendance_ai_gate_v1(conversation_id)`:
  - interno/service-role;
  - libera IA somente com `mode='ai'` e `human_required=false`.
- Guard transacional da outbox:
  - outbound `human_attendance` força takeover antes do envio;
  - futuro `ai_attendance` é bloqueado se conversa não estiver liberada para IA;
  - a transição `queued -> claimed` da IA revalida o estado para fechar corrida com takeover humano.
- `attendance_human_ai_audit_v1` registra transições de estado.
- UI da Central:
  - `Assumir atendimento`;
  - `Liberar para IA`;
  - utiliza JWT real da sessão do Admin;
  - não chama Meta diretamente e não depende do PapoAI.

## Evidências desta rodada

- PR #660 — checks `test` e `contract`: **success**.
- Migration `attendance_human_ai_state_v1`: aplicada com sucesso no Supabase canônico `ssbesxgaijknwsjbsbcz`.
- Smoke transacional com rollback: **PASS** para:
  1. outbound humano força `mode='human'` e `human_required=true`;
  2. enqueue `ai_attendance` em conversa humana falha com `ai_blocked_by_human_takeover`;
  3. outbound IA enfileirado em modo AI é bloqueado no `queued -> claimed` se takeover humano ocorrer antes do claim.
- Chamada sem usuário autenticado para takeover/resume retorna `admin_not_authorized` em ambos os casos.
- Nenhuma mensagem foi enviada durante esses smokes.

## Segurança

- nenhum gate de Meta/canário é ampliado;
- nenhuma mensagem é enviada por esta migration;
- nenhuma alteração em checkout, pedido, estoque ou Bling;
- RPC de gate da IA não fica exposta a `authenticated`/browser;
- takeover/resume validam admin ativo server-side;
- corrida Humano × IA é revalidada no banco imediatamente antes do claim da IA.

## Gate pendente da Task 9B

O canário real de mídia 0975↔1018 continua pendente porque `admin-whatsapp-ops-v1?action=send_media` exige sessão JWT real de administrador. O conector de banco não possui esse token de navegador e não será criado bypass de autenticação.

## Próximo passo

A base técnica da Task 10 está pronta. Após integrar o PR, a próxima frente segura é iniciar a Task 11 em **dry-run**, sem envio automático: worker da ANA gera sugestão, consulta o gate Humano × IA e persiste resultado para comparação antes de qualquer canário de IA.
