begin;

create or replace function public.get_papoai_commerce_human_precedence_v1(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_conv public.conversations%rowtype;
  v_handoff public.human_handoffs%rowtype;
begin
  select * into v_conv
  from public.conversations
  where id=p_conversation_id;

  if not found then
    return jsonb_build_object(
      'human_active',false,
      'reason','conversation_not_found'
    );
  end if;

  select * into v_handoff
  from public.human_handoffs
  where conversation_id=p_conversation_id
    and status in ('open','claimed')
  order by created_at
  limit 1;

  return jsonb_build_object(
    'human_active',
      coalesce(v_conv.human_required,false)
      or v_conv.mode in ('human','human_copilot','paused')
      or v_handoff.id is not null,
    'conversation_mode',v_conv.mode,
    'human_required',coalesce(v_conv.human_required,false),
    'handoff_id',v_handoff.id,
    'handoff_status',v_handoff.status,
    'reason',case
      when v_handoff.id is not null then 'open_handoff'
      when coalesce(v_conv.human_required,false) then 'conversation_human_required'
      when v_conv.mode in ('human','human_copilot','paused') then 'conversation_mode'
      else 'ai_available'
    end
  );
end;
$$;

create or replace function public.queue_papoai_commerce_handoff_v1(
  p_conversation_id uuid,
  p_reason text,
  p_summary text default null,
  p_priority smallint default 2
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_id uuid;
begin
  v_id:=public.queue_human_handoff_v1(
    p_conversation_id,
    coalesce(nullif(trim(p_reason),''),'papoai_customer_request'),
    null,
    least(5,greatest(1,coalesce(p_priority,2))),
    left(coalesce(p_summary,''),1000),
    jsonb_build_object(
      'source','papoai_commerce',
      'provider','papoai'
    )
  );

  return jsonb_build_object(
    'ok',true,
    'handoff_id',v_id,
    'human_active',true,
    'external_side_effect',false
  );
end;
$$;

create or replace function public.resume_papoai_commerce_after_handoff_v1(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_open_count integer;
  v_conv public.conversations%rowtype;
begin
  select count(*)::integer into v_open_count
  from public.human_handoffs
  where conversation_id=p_conversation_id
    and status in ('open','claimed');

  select * into v_conv
  from public.conversations
  where id=p_conversation_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'reason','conversation_not_found');
  end if;

  if v_open_count>0 then
    return jsonb_build_object(
      'ok',false,
      'reason','open_handoff_exists',
      'open_handoff_count',v_open_count,
      'human_active',true
    );
  end if;

  update public.conversations
     set mode='ai',
         human_required=false,
         status=case
           when status='needs_human' then 'open'
           else status
         end,
         human_takeover_at=null,
         updated_at=now()
   where id=p_conversation_id;

  return jsonb_build_object(
    'ok',true,
    'human_active',false,
    'mode','ai',
    'open_handoff_count',0
  );
end;
$$;

revoke all on function public.get_papoai_commerce_human_precedence_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_papoai_commerce_human_precedence_v1(uuid) to service_role;

revoke all on function public.queue_papoai_commerce_handoff_v1(uuid,text,text,smallint) from public,anon,authenticated;
grant execute on function public.queue_papoai_commerce_handoff_v1(uuid,text,text,smallint) to service_role;

revoke all on function public.resume_papoai_commerce_after_handoff_v1(uuid) from public,anon,authenticated;
grant execute on function public.resume_papoai_commerce_after_handoff_v1(uuid) to service_role;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'human_precedence_version','v1',
  'human_precedence_policy','any_human_signal_makes_ai_silent',
  'human_resume_policy','explicit_resume_only_when_no_open_handoff'
),
updated_at=now()
where id=1;

commit;
