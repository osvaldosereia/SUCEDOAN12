-- R34 · Gate fiscal antes da saída para entrega
-- Estrutura segura e inicialmente em modo OBSERVE.
-- O bloqueio só passa a valer quando dispatch_gate_mode='enforce'.

alter table public.fiscal_runtime_config
  add column if not exists dispatch_gate_mode text not null default 'observe'
    check (dispatch_gate_mode in ('off','observe','enforce')),
  add column if not exists require_fiscal_authorization_before_dispatch boolean not null default true;

alter table public.order_fiscal_controls
  add column if not exists dispatch_fiscal_status text not null default 'pending'
    check (dispatch_fiscal_status in ('pending','authorized','not_required','review_required','cancelled')),
  add column if not exists dispatch_fiscal_authorized_at timestamptz null,
  add column if not exists dispatch_fiscal_source text null,
  add column if not exists dispatch_fiscal_reason text null;

update public.order_fiscal_controls
set dispatch_fiscal_status='authorized',
    dispatch_fiscal_authorized_at=coalesce(dispatch_fiscal_authorized_at,issued_at),
    dispatch_fiscal_source=coalesce(dispatch_fiscal_source,'existing_fiscal_issue'),
    dispatch_fiscal_reason=null,
    updated_at=now()
where dispatch_fiscal_status='pending'
  and bling_invoice_id is not null
  and issued_at is not null;

create or replace function public.check_order_dispatch_fiscal_gate_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  cfg public.fiscal_runtime_config%rowtype;
  o public.orders%rowtype;
  c public.order_fiscal_controls%rowtype;
  gate_mode text := 'observe';
  authorization_required boolean := true;
  authorized boolean := false;
  enforced boolean := false;
  allowed boolean := true;
  reason text := null;
begin
  select * into o from public.orders where id=p_order_id;
  if not found then
    return jsonb_build_object(
      'ok',false,'error','order_not_found','allowed',false,
      'external_side_effect',false
    );
  end if;

  select * into cfg from public.fiscal_runtime_config where id=1;
  if found then
    gate_mode:=coalesce(cfg.dispatch_gate_mode,'observe');
    authorization_required:=coalesce(cfg.require_fiscal_authorization_before_dispatch,true);
  end if;

  insert into public.order_fiscal_controls(order_id)
  values(o.id)
  on conflict(order_id) do nothing;

  select * into c from public.order_fiscal_controls where order_id=o.id;

  authorized:=c.dispatch_fiscal_status in ('authorized','not_required');
  enforced:=gate_mode='enforce' and authorization_required;
  allowed:=not enforced or authorized;

  if authorized then
    reason:=null;
  elsif gate_mode='off' or not authorization_required then
    reason:='dispatch_fiscal_gate_off';
  elsif gate_mode='observe' then
    reason:='fiscal_authorization_pending_observe';
  else
    reason:='fiscal_authorization_required_before_dispatch';
  end if;

  return jsonb_build_object(
    'ok',true,
    'order_id',o.id,
    'order_status',o.status,
    'mode',gate_mode,
    'authorization_required',authorization_required,
    'enforced',enforced,
    'allowed',allowed,
    'authorized',authorized,
    'dispatch_fiscal_status',c.dispatch_fiscal_status,
    'authorized_at',c.dispatch_fiscal_authorized_at,
    'source',c.dispatch_fiscal_source,
    'reason',coalesce(c.dispatch_fiscal_reason,reason),
    'bling_invoice_id',c.bling_invoice_id,
    'bling_invoice_number',c.bling_invoice_number,
    'sefaz_status',c.sefaz_status,
    'external_side_effect',false
  );
end;
$$;

create or replace function public.mark_order_dispatch_fiscal_authorized_v1(
  p_order_id uuid,
  p_source text,
  p_bling_invoice_id bigint default null,
  p_bling_invoice_number text default null,
  p_sefaz_status text default null,
  p_authorized_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if not exists(select 1 from public.orders where id=p_order_id) then
    return jsonb_build_object('ok',false,'error','order_not_found','external_side_effect',false);
  end if;

  insert into public.order_fiscal_controls(
    order_id,dispatch_fiscal_status,dispatch_fiscal_authorized_at,
    dispatch_fiscal_source,dispatch_fiscal_reason,
    bling_invoice_id,bling_invoice_number,sefaz_status,issued_at,updated_at
  )
  values(
    p_order_id,'authorized',coalesce(p_authorized_at,now()),
    nullif(trim(coalesce(p_source,'')),''),null,
    p_bling_invoice_id,nullif(trim(coalesce(p_bling_invoice_number,'')),''),
    nullif(trim(coalesce(p_sefaz_status,'')),''),coalesce(p_authorized_at,now()),now()
  )
  on conflict(order_id) do update
    set dispatch_fiscal_status='authorized',
        dispatch_fiscal_authorized_at=coalesce(p_authorized_at,now()),
        dispatch_fiscal_source=nullif(trim(coalesce(p_source,'')),''),
        dispatch_fiscal_reason=null,
        bling_invoice_id=coalesce(p_bling_invoice_id,public.order_fiscal_controls.bling_invoice_id),
        bling_invoice_number=coalesce(nullif(trim(coalesce(p_bling_invoice_number,'')),''),public.order_fiscal_controls.bling_invoice_number),
        sefaz_status=coalesce(nullif(trim(coalesce(p_sefaz_status,'')),''),public.order_fiscal_controls.sefaz_status),
        issued_at=coalesce(public.order_fiscal_controls.issued_at,p_authorized_at,now()),
        updated_at=now();

  return public.check_order_dispatch_fiscal_gate_v1(p_order_id);
end;
$$;

revoke all on function public.check_order_dispatch_fiscal_gate_v1(uuid) from public,anon,authenticated;
revoke all on function public.mark_order_dispatch_fiscal_authorized_v1(uuid,text,bigint,text,text,timestamptz) from public,anon,authenticated;

grant execute on function public.check_order_dispatch_fiscal_gate_v1(uuid) to service_role;
grant execute on function public.mark_order_dispatch_fiscal_authorized_v1(uuid,text,bigint,text,text,timestamptz) to service_role;

comment on function public.check_order_dispatch_fiscal_gate_v1(uuid) is
'Gate fiscal da expedição. Em observe não bloqueia; em enforce exige autorização fiscal explícita antes da saída.';
