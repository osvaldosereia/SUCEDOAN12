-- Atribuição atômica de etiquetas internas a uma conversa.
create or replace function public.ops2_admin_attendance_set_labels_v1(
  p_conversation_id uuid,
  p_label_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ids uuid[] := coalesce(p_label_ids,'{}'::uuid[]);
  v_distinct integer;
  v_valid integer;
  v_labels jsonb;
begin
  if p_conversation_id is null or not exists(select 1 from public.conversations c where c.id=p_conversation_id) then
    return jsonb_build_object('ok',false,'error','conversation_not_found');
  end if;
  if coalesce(array_length(v_ids,1),0)>20 then
    return jsonb_build_object('ok',false,'error','too_many_labels');
  end if;

  select count(distinct x)::integer into v_distinct from unnest(v_ids) x;
  select count(*)::integer into v_valid
  from public.attendance_labels_v1 l
  where l.id=any(v_ids) and l.is_active=true;
  if coalesce(v_distinct,0)<>coalesce(v_valid,0) then
    return jsonb_build_object('ok',false,'error','invalid_or_inactive_label');
  end if;

  delete from public.attendance_conversation_labels_v1 where conversation_id=p_conversation_id;
  insert into public.attendance_conversation_labels_v1(conversation_id,label_id)
  select p_conversation_id,x from (select distinct unnest(v_ids) as x) d
  where x is not null;

  select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'color',l.color,'sort_order',l.sort_order) order by l.sort_order,l.name),'[]'::jsonb)
  into v_labels
  from public.attendance_conversation_labels_v1 cl
  join public.attendance_labels_v1 l on l.id=cl.label_id
  where cl.conversation_id=p_conversation_id and l.is_active=true;

  return jsonb_build_object('ok',true,'conversation_id',p_conversation_id,'labels',v_labels);
end;
$$;

revoke all on function public.ops2_admin_attendance_set_labels_v1(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.ops2_admin_attendance_set_labels_v1(uuid,uuid[]) to service_role;
