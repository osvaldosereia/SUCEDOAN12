create or replace function public.ops2_ana_remove_trigger_label_v1(
  p_conversation_id uuid,
  p_label_id uuid,
  p_trigger_key text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  label_source uuid;
  removed_count integer := 0;
  consolidated_removed integer := 0;
  has_other_origin boolean := false;
begin
  if p_conversation_id is null
     or p_label_id is null
     or btrim(coalesce(p_trigger_key,'')) = ''
     or char_length(p_trigger_key) > 40 then
    return jsonb_build_object('ok',false,'error','trigger_label_input_invalid');
  end if;

  if not exists(select 1 from public.conversations where id=p_conversation_id) then
    return jsonb_build_object('ok',false,'error','conversation_not_found');
  end if;

  if not exists(select 1 from public.attendance_labels_v1 where id=p_label_id) then
    return jsonb_build_object('ok',false,'error','label_not_found');
  end if;

  label_source := md5('ana-trigger:' || p_trigger_key)::uuid;

  delete from public.attendance_conversation_auto_labels_v1
  where conversation_id=p_conversation_id
    and label_id=p_label_id
    and source_kind='ana_trigger'
    and source_ref=label_source;
  get diagnostics removed_count = row_count;

  select
    exists(
      select 1
      from public.attendance_conversation_auto_labels_v1
      where conversation_id=p_conversation_id and label_id=p_label_id
    )
    or exists(
      select 1
      from public.attendance_conversation_manual_labels_v1
      where conversation_id=p_conversation_id and label_id=p_label_id
    )
  into has_other_origin;

  if not has_other_origin then
    delete from public.attendance_conversation_labels_v1
    where conversation_id=p_conversation_id and label_id=p_label_id;
    get diagnostics consolidated_removed = row_count;
  end if;

  return jsonb_build_object(
    'ok',true,
    'removed',removed_count > 0,
    'consolidated_removed',consolidated_removed > 0,
    'preserved_by_other_origin',has_other_origin
  );
end;
$$;

revoke all on function public.ops2_ana_remove_trigger_label_v1(uuid,uuid,text) from public;
revoke execute on function public.ops2_ana_remove_trigger_label_v1(uuid,uuid,text) from anon;
revoke execute on function public.ops2_ana_remove_trigger_label_v1(uuid,uuid,text) from authenticated;
grant execute on function public.ops2_ana_remove_trigger_label_v1(uuid,uuid,text) to service_role;
