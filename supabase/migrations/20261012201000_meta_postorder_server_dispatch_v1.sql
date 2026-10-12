-- Meta Utility template commissioning, invoked from service-only database session.
-- The 256-bit bearer secret is generated in database memory and never returned to the caller.
create table if not exists private.ops4_meta_postorder_commands_v1 (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check(token_hash~'^[0-9a-f]{64}$'),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  request_id bigint,
  status text not null default 'queued' check(status in ('queued','claimed'))
);
alter table private.ops4_meta_postorder_commands_v1 enable row level security;
revoke all on private.ops4_meta_postorder_commands_v1 from public,anon,authenticated;
grant select,insert,update on private.ops4_meta_postorder_commands_v1 to service_role;

create or replace function public.ops4_claim_meta_postorder_command_v1(p_token_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  update private.ops4_meta_postorder_commands_v1
  set claimed_at=now(),status='claimed'
  where token_hash=p_token_hash
    and claimed_at is null and expires_at>now()
    and status='queued'
  returning id into v_id;
  return v_id is not null;
end;$$;
revoke all on function public.ops4_claim_meta_postorder_command_v1(text) from public,anon,authenticated;
grant execute on function public.ops4_claim_meta_postorder_command_v1(text) to service_role;

create or replace function public.ops4_dispatch_meta_postorder_v1()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_token text:=encode(extensions.gen_random_bytes(32),'hex');
  v_id uuid;
  v_request_id bigint;
begin
  insert into private.ops4_meta_postorder_commands_v1(token_hash,expires_at)
  values(encode(pg_catalog.sha256(pg_catalog.convert_to(v_token,'UTF8')),'hex'),now()+interval '4 minutes')
  returning id into v_id;
  select net.http_post(
    url:='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-whatsapp-templates-v1?action=postorder_provision_system',
    headers:=jsonb_build_object('Content-Type','application/json','x-meta-provision-once',v_token),
    body:='{}'::jsonb,
    timeout_milliseconds:=25000
  ) into v_request_id;
  update private.ops4_meta_postorder_commands_v1 set request_id=v_request_id where id=v_id;
  return jsonb_build_object('ok',true,'command_id',v_id,'request_id',v_request_id);
end;$$;
revoke all on function public.ops4_dispatch_meta_postorder_v1() from public,anon,authenticated;
grant execute on function public.ops4_dispatch_meta_postorder_v1() to service_role;