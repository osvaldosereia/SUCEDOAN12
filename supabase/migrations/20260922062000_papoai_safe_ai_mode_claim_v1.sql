begin;

create or replace function public.activate_papoai_commerce_ai_mode_v1(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_conv public.conversations%rowtype;
  v_open_handoffs integer:=0;
begin
  select * into v_cfg
  from public.papoai_commerce_brain_config
  where id=1;

  if not coalesce(v_cfg.enabled,false) then
    return jsonb_build_object(
      'ok',true,'activated',false,'reason','commerce_brain_disabled'
    );
  end if;

  select * into v_conv
  from public.conversations
  where id=p_conversation_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok',false,'activated',false,'reason','conversation_not_found'
    );
  end if;

  select count(*)::integer into v_open_handoffs
  from public.human_handoffs
  where conversation_id=p_conversation_id
    and status in ('open','claimed');

  if coalesce(v_conv.human_required,false) then
    return jsonb_build_object(
      'ok',true,'activated',false,
      'reason','human_required',
      'mode',v_conv.mode
    );
  end if;

  if v_open_handoffs>0 then
    return jsonb_build_object(
      'ok',true,'activated',false,
      'reason','open_handoff',
      'open_handoff_count',v_open_handoffs,
      'mode',v_conv.mode
    );
  end if;

  if v_conv.mode='paused' then
    return jsonb_build_object(
      'ok',true,'activated',false,
      'reason','conversation_paused',
      'mode',v_conv.mode
    );
  end if;

  update public.conversations
     set mode='ai',
         status=case
           when status='needs_human' then 'open'
           else status
         end,
         updated_at=now()
   where id=p_conversation_id
   returning * into v_conv;

  return jsonb_build_object(
    'ok',true,
    'activated',true,
    'mode',v_conv.mode,
    'human_required',v_conv.human_required,
    'open_handoff_count',v_open_handoffs
  );
end;
$$;

revoke all on function public.activate_papoai_commerce_ai_mode_v1(uuid) from public,anon,authenticated;
grant execute on function public.activate_papoai_commerce_ai_mode_v1(uuid) to service_role;

update public.papoai_commerce_brain_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'ai_mode_claim_version','v1',
  'ai_mode_claim_policy','commerce_enabled_and_no_human_precedence'
),
updated_at=now()
where id=1;

commit;
