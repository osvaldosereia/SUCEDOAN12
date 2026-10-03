-- Dona Antônia — compatibilidade de rollout da Central de Atendimento.
-- Mantém o contrato v3 operacional enquanto o gateway migra para a fila v4.

create or replace function public.ops2_admin_attendance_queue_v3(
  p_whatsapp_account_id uuid,
  p_limit integer default 50,
  p_search text default null,
  p_label_id uuid default null
)
returns jsonb
language sql
security definer
set search_path to ''
as $$
  select public.ops2_admin_attendance_queue_v4(
    p_whatsapp_account_id,
    p_limit,
    p_search,
    p_label_id
  );
$$;

revoke all on function public.ops2_admin_attendance_queue_v3(uuid,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.ops2_admin_attendance_queue_v3(uuid,integer,text,uuid) to service_role;
