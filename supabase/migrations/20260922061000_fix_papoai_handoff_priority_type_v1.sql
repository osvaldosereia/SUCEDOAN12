begin;

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
  v_priority smallint;
begin
  v_priority:=least(5,greatest(1,coalesce(p_priority,2)))::smallint;

  v_id:=public.queue_human_handoff_v1(
    p_conversation_id,
    coalesce(nullif(trim(p_reason),''),'papoai_customer_request'),
    null::uuid,
    v_priority,
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
    'priority',v_priority,
    'external_side_effect',false
  );
end;
$$;

revoke all on function public.queue_papoai_commerce_handoff_v1(uuid,text,text,smallint) from public,anon,authenticated;
grant execute on function public.queue_papoai_commerce_handoff_v1(uuid,text,text,smallint) to service_role;

commit;
