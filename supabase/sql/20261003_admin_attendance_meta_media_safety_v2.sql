-- Task 9B safety v2 — canário fail-closed e retry seguro de mídia.

create or replace function public.ops2_admin_attendance_requeue_failed_media_v1(
  p_outbox_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_outbox public.whatsapp_outbox_v1%rowtype;
begin
  if p_outbox_id is null then
    return jsonb_build_object('ok',false,'error','outbox_required');
  end if;

  select o.* into v_outbox
  from public.whatsapp_outbox_v1 o
  where o.id=p_outbox_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','outbox_not_found');
  end if;
  if v_outbox.purpose<>'human_attendance'
     or v_outbox.provider<>'meta'
     or v_outbox.message_type not in ('image','audio','document') then
    return jsonb_build_object('ok',false,'error','outbox_not_retryable_media');
  end if;
  if v_outbox.status='queued' then
    return jsonb_build_object('ok',true,'already_queued',true,'outbox_id',v_outbox.id,'status','queued');
  end if;
  if v_outbox.status<>'failed' then
    return jsonb_build_object('ok',false,'error','media_retry_not_safe','status',v_outbox.status);
  end if;

  update public.whatsapp_outbox_v1
  set status='queued',
      claimed_at=null,
      available_at=now(),
      last_error=null,
      updated_at=now()
  where id=v_outbox.id
    and status='failed';

  if not found then
    return jsonb_build_object('ok',false,'error','media_retry_race');
  end if;

  return jsonb_build_object('ok',true,'already_queued',false,'outbox_id',v_outbox.id,'status','queued');
end;
$$;

create or replace function public.ops2_admin_attendance_media_canary_guard_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_runtime public.whatsapp_channel_runtime_v1%rowtype;
  v_phone text;
begin
  if new.purpose='human_attendance'
     and new.provider='meta'
     and new.message_type in ('image','audio','document')
     and (
       tg_op='INSERT'
       or (tg_op='UPDATE' and old.status is distinct from new.status and new.status='claimed')
     ) then

    select r.* into v_runtime
    from public.whatsapp_channel_runtime_v1 r
    where r.whatsapp_account_id=new.whatsapp_account_id
      and r.send_enabled=true
      and r.human_send_enabled=true
      and r.homologated_at is not null
      and r.outbound_provider='meta';

    if not found then
      raise exception using errcode='P0001',message='human_send_not_homologated';
    end if;

    if lower(coalesce(v_runtime.metadata->>'meta_canary_enabled','false'))<>'true' then
      raise exception using errcode='P0001',message='meta_canary_not_enabled';
    end if;

    v_phone:=public.canonical_whatsapp_e164_br_v2(new.to_phone_e164);
    if v_phone is null or not exists (
      select 1
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(v_runtime.metadata->'meta_canary_to_e164')='array'
            then v_runtime.metadata->'meta_canary_to_e164'
          else '[]'::jsonb
        end
      ) as allowed(value)
      where public.canonical_whatsapp_e164_br_v2(allowed.value)=v_phone
    ) then
      raise exception using errcode='P0001',message='meta_canary_destination_blocked';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists whatsapp_outbox_media_canary_guard_v1 on public.whatsapp_outbox_v1;
create trigger whatsapp_outbox_media_canary_guard_v1
before insert or update of status on public.whatsapp_outbox_v1
for each row execute function public.ops2_admin_attendance_media_canary_guard_v1();

revoke all on function public.ops2_admin_attendance_requeue_failed_media_v1(uuid) from public,anon,authenticated;
grant execute on function public.ops2_admin_attendance_requeue_failed_media_v1(uuid) to service_role;

revoke all on function public.ops2_admin_attendance_media_canary_guard_v1() from public,anon,authenticated;
