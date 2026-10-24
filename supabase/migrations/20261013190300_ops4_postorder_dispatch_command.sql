-- Schedule an authenticated, one-shot invocation of the confirmation worker
-- using an ephemeral secret; no service role key is stored in cron or sent to Meta.
create table if not exists private.ops4_postorder_dispatch_commands_v1(
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check(token_hash~'^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  request_id bigint,
  created_at timestamptz not null default now()
);
alter table private.ops4_postorder_dispatch_commands_v1 enable row level security;
revoke all on private.ops4_postorder_dispatch_commands_v1 from public,anon,authenticated;
grant select,insert,update on private.ops4_postorder_dispatch_commands_v1 to service_role;

create or replace function public.ops4_claim_postorder_dispatch_command_v1(p_token_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then return false; end if;
  update private.ops4_postorder_dispatch_commands_v1
  set claimed_at=now()
  where token_hash=p_token_hash and claimed_at is null and expires_at>now();
  return found;
end;$$;
revoke all on function public.ops4_claim_postorder_dispatch_command_v1(text) from public,anon,authenticated;
grant execute on function public.ops4_claim_postorder_dispatch_command_v1(text) to service_role;

create or replace function public.ops4_dispatch_due_postorder_confirmation_v1()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_token text:=encode(extensions.gen_random_bytes(32),'hex');
  v_id uuid;
  v_request_id bigint;
begin
  -- If nothing is due and already approved by Meta, no HTTP invocation.
  if not exists(
    select 1 from private.ops4_postorder_followups_v1 f
    where f.confirm_status='pending' and f.confirm_due_at<=now()
      and f.expires_at>now() and f.attempts<2
      and exists(select 1 from public.whatsapp_templates_v1 t
         where t.whatsapp_account_id=f.whatsapp_account_id and t.language='pt_BR'
           and t.name='pedidoconfirmacao'||f.channel||'v1' and t.status='APPROVED')
  ) then return jsonb_build_object('ok',true,'status','idle'); end if;
  insert into private.ops4_postorder_dispatch_commands_v1(token_hash,expires_at)
  values(encode(pg_catalog.sha256(pg_catalog.convert_to(v_token,'UTF8')),'hex'),now()+interval '4 minutes')
  returning id into v_id;
  select net.http_post(
    url:='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/order-postorder-confirm-v1',
    headers:=jsonb_build_object('Content-Type','application/json','x-postorder-once',v_token),
    body:='{}'::jsonb,
    timeout_milliseconds:=105000
  ) into v_request_id;
  update private.ops4_postorder_dispatch_commands_v1
    set request_id=v_request_id where id=v_id;
  return jsonb_build_object('ok',true,'status','dispatched','request_id',v_request_id);
end;$$;
revoke all on function public.ops4_dispatch_due_postorder_confirmation_v1() from public,anon,authenticated;
grant execute on function public.ops4_dispatch_due_postorder_confirmation_v1() to service_role;

-- The worker is deliberately not scheduled until the Edge Function and
-- Meta templates are ready; the release step enables the cron idempotently.
