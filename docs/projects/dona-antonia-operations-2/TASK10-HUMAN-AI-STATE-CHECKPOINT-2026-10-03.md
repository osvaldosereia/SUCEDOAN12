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

## Segurança

- nenhum gate de Meta/canário é ampliado;
- nenhuma mensagem é enviada por esta migration;
- nenhuma alteração em checkout, pedido, estoque ou Bling;
- RPC de gate da IA não fica exposta a `authenticated`/browser;
- takeover/resume validam admin ativo server-side.

## Gate pendente da Task 9B

O canário real de mídia 0975↔1018 continua pendente porque `admin-whatsapp-ops-v1?action=send_media` exige sessão JWT real de administrador. O conector de banco não possui esse token de navegador e não será criado bypass de autenticação.

## Próximo gate

1. CI verde no PR da Task 10.
2. Aplicar migration no Supabase canônico.
3. Rodar smoke transacional com rollback para takeover/resume/AI guard.
4. Integrar controles de estado na UI da Central.
5. Só depois iniciar Task 11 (ANA própria).
