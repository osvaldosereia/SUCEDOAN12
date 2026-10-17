-- Pedidos V4 — separadores oficiais e emissão fiscal automática pós-separação.
-- Mantém o gate fiscal obrigatório antes da expedição e deixa os flags de escrita
-- fiscal desligados em repouso; o bridge canônico arma/desarma um pedido elegível
-- por vez durante a emissão.

update public.order_separation_assignments_v1
set separator_key='claudio',
    separator_label='Cláudio',
    updated_at=now()
where separator_key='claudenil';

update public.order_separation_completions_v1
set separator_key='claudio',
    metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'separator_migrated_from','claudenil',
      'separator_migrated_at',now()
    ),
    updated_at=now()
where separator_key='claudenil'
  and completed_at is null;

create or replace function public.ops2_set_order_separator_v2(
  p_order_id uuid,
  p_separator_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_order public.orders%rowtype;
  v_completion public.order_separation_completions_v1%rowtype;
  v_key text := nullif(lower(trim(coalesce(p_separator_key,''))), '');
  v_label text;
  v_now timestamptz := now();
begin
  if p_order_id is null then
    return jsonb_build_object('ok',false,'error','invalid_order_id');
  end if;

  if v_key is not null and v_key not in ('jose','claudio','jovenil','kelly') then
    return jsonb_build_object('ok',false,'error','invalid_separator');
  end if;

  select * into v_order
  from public.orders
  where id=p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','order_not_found');
  end if;

  if v_order.status not in ('confirmed','processing','ready') then
    return jsonb_build_object('ok',false,'error','order_not_in_separation','status',v_order.status);
  end if;

  select * into v_completion
  from public.order_separation_completions_v1
  where order_id=p_order_id
  for update;

  if found and v_completion.completed_at is not null then
    return jsonb_build_object('ok',false,'error','separation_already_completed');
  end if;

  v_label := case v_key
    when 'jose' then 'José'
    when 'claudio' then 'Cláudio'
    when 'jovenil' then 'Jovenil'
    when 'kelly' then 'Kelly'
    else null
  end;

  insert into public.order_separation_assignments_v1(
    order_id,separator_key,separator_label,assigned_at,created_at,updated_at
  ) values(
    p_order_id,v_key,v_label,case when v_key is null then null else v_now end,v_now,v_now
  )
  on conflict (order_id) do update
    set separator_key=excluded.separator_key,
        separator_label=excluded.separator_label,
        assigned_at=excluded.assigned_at,
        updated_at=v_now;

  if v_completion.id is not null and v_completion.completed_at is null then
    update public.order_separation_completions_v1
    set separator_key=v_key,
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'separator_reassigned_at',v_now,
          'separator_label',v_label
        ),
        updated_at=v_now
    where order_id=p_order_id;
  end if;

  update public.orders
  set updated_at=v_now
  where id=p_order_id;

  return jsonb_build_object(
    'ok',true,
    'order_id',p_order_id,
    'separator_key',v_key,
    'separator_label',v_label,
    'assigned_at',case when v_key is null then null else v_now end,
    'order_updated_at',v_now
  );
end;
$function$;

revoke all on function public.ops2_set_order_separator_v2(uuid,text) from public,anon,authenticated;
grant execute on function public.ops2_set_order_separator_v2(uuid,text) to service_role;

create or replace function public.ops2_require_separator_completion_v4()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  if new.separator_key is null
     or new.separator_key not in ('jose','claudio','jovenil','kelly') then
    raise exception 'separator_required_before_completion';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_ops2_require_separator_completion_v4
on public.order_separation_completions_v1;

create trigger trg_ops2_require_separator_completion_v4
before insert or update of separator_key
on public.order_separation_completions_v1
for each row execute function public.ops2_require_separator_completion_v4();

revoke all on function public.ops2_require_separator_completion_v4() from public,anon,authenticated;
grant execute on function public.ops2_require_separator_completion_v4() to service_role;

-- Ativa somente o caminho de emissão por pedido já protegido pelo preflight.
-- O bridge arma geração/autorização temporariamente e volta os flags para false.
update public.fiscal_runtime_config
set dispatch_fiscal_human_issue_enabled=true,
    dispatch_fiscal_canary_enabled=false,
    dispatch_fiscal_canary_armed_at=null,
    dispatch_invoice_generate_enabled=false,
    dispatch_invoice_authorize_enabled=false,
    dispatch_invoice_canary_source_order_id=null,
    updated_at=now()
where id=1
  and dispatch_gate_mode='enforce'
  and require_fiscal_authorization_before_dispatch=true;
