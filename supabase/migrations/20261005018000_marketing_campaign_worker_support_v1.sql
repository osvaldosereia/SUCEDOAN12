begin;

create table if not exists public.marketing_campaign_worker_secret_v1(
  singleton boolean primary key default true check(singleton is true),
  secret text not null check(length(secret)>=48),
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);
alter table public.marketing_campaign_worker_secret_v1 enable row level security;
revoke all on public.marketing_campaign_worker_secret_v1 from public,anon,authenticated;
grant select,insert,update on public.marketing_campaign_worker_secret_v1 to service_role;

insert into public.marketing_campaign_worker_secret_v1(singleton,secret)
values(true,encode(gen_random_bytes(32),'hex'))
on conflict(singleton) do nothing;

create or replace function public.marketing_campaign_worker_internal_key_v1()
returns text
language sql
security definer
set search_path=''
as $$
  select s.secret from public.marketing_campaign_worker_secret_v1 s where s.singleton=true;
$$;
revoke all on function public.marketing_campaign_worker_internal_key_v1() from public,anon,authenticated;
grant execute on function public.marketing_campaign_worker_internal_key_v1() to service_role;

create or replace function public.marketing_accept_meta_dispatch_v1(
  p_dispatch_id uuid,
  p_provider_message_id text,
  p_accepted_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_dispatch public.marketing_campaign_dispatches_v1%rowtype;
  v_outbox public.whatsapp_outbox_v1%rowtype;
  v_message public.whatsapp_messages_v1%rowtype;
  v_finish jsonb;
  v_status jsonb;
  v_accepted_at timestamptz:=coalesce(p_accepted_at,now());
  v_wamid text:=nullif(btrim(coalesce(p_provider_message_id,'')),'');
begin
  if v_wamid is null or v_wamid !~ '^wamid\.' then
    return jsonb_build_object('ok',false,'error','provider_message_id_required');
  end if;

  select * into v_dispatch
  from public.marketing_campaign_dispatches_v1
  where id=p_dispatch_id
  for update;
  if not found then return jsonb_build_object('ok',false,'error','dispatch_not_found'); end if;

  if v_dispatch.status='accepted' then
    if v_dispatch.provider_message_id=v_wamid then
      select * into v_outbox from public.whatsapp_outbox_v1 where id=v_dispatch.outbox_id;
      return jsonb_build_object('ok',true,'duplicate',true,'dispatch_id',v_dispatch.id,'outbox_id',v_dispatch.outbox_id,
        'message_id',v_outbox.message_id,'status','accepted','provider_message_id',v_wamid);
    end if;
    return jsonb_build_object('ok',false,'error','provider_message_conflict');
  end if;
  if v_dispatch.status<>'claimed' then return jsonb_build_object('ok',false,'error','dispatch_not_claimed','status',v_dispatch.status); end if;
  if v_dispatch.outbox_id is null then return jsonb_build_object('ok',false,'error','campaign_outbox_missing'); end if;

  select * into v_outbox
  from public.whatsapp_outbox_v1
  where id=v_dispatch.outbox_id
  for update;
  if not found or v_outbox.purpose<>'marketing_campaign' or v_outbox.message_type<>'template'
     or v_outbox.whatsapp_account_id<>v_dispatch.whatsapp_account_id
     or v_outbox.customer_id is distinct from v_dispatch.customer_id then
    return jsonb_build_object('ok',false,'error','campaign_outbox_invalid');
  end if;
  if v_outbox.message_id is null then return jsonb_build_object('ok',false,'error','canonical_message_missing'); end if;

  select * into v_message from public.whatsapp_messages_v1 where id=v_outbox.message_id for update;
  if not found then return jsonb_build_object('ok',false,'error','canonical_message_missing'); end if;

  v_finish:=public.marketing_finish_dispatch_v1(v_dispatch.id,'accepted',v_wamid,null,null);
  if coalesce((v_finish->>'ok')::boolean,false) is not true then
    raise exception 'marketing_accept_finish_failed:%',coalesce(v_finish->>'error','unknown');
  end if;

  update public.whatsapp_messages_v1
  set provider='meta',provider_message_id=v_wamid,status_current='accepted',sender_kind='campaign',sent_at=v_accepted_at,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('source','marketing_campaign_worker','campaign_dispatch_id',v_dispatch.id)
  where id=v_message.id
  returning * into v_message;

  v_status:=public.whatsapp_record_status_v1(
    v_dispatch.whatsapp_account_id,'meta',v_wamid,'accepted',v_accepted_at,v_accepted_at,
    null,null,null,jsonb_build_object('source','marketing_campaign_worker','dispatch_id',v_dispatch.id)
  );
  if coalesce((v_status->>'ok')::boolean,false) is not true then
    raise exception 'marketing_accept_status_failed:%',coalesce(v_status->>'error','unknown');
  end if;

  return jsonb_build_object('ok',true,'duplicate',false,'dispatch_id',v_dispatch.id,'outbox_id',v_outbox.id,
    'message_id',v_message.id,'status','accepted','provider_message_id',v_wamid);
end;
$$;
revoke all on function public.marketing_accept_meta_dispatch_v1(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.marketing_accept_meta_dispatch_v1(uuid,text,timestamptz) to service_role;

commit;
