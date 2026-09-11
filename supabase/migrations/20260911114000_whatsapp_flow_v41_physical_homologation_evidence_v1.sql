-- WhatsApp Flow V41: evidence gate for the remaining physical owner-only homologation.
-- Read-only: never writes cart/customer/order, never changes rollout gates.

create or replace function public.get_whatsapp_flow_v41_physical_homologation_evidence_v1(
  p_session_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  cfg public.automation_config%rowtype;
  d public.experience_definitions%rowtype;
  v_session_id uuid;
  v_last_at timestamptz;
  v_observed jsonb := '[]'::jsonb;
  v_missing jsonb := '[]'::jsonb;
  v_terminal jsonb;
  v_accepted integer := 0;
  v_errors integer := 0;
  v_max_products integer := 0;
  v_has_product boolean := false;
  v_has_upsell boolean := false;
  v_has_review boolean := false;
  v_has_customer boolean := false;
  v_has_final boolean := false;
  v_gates_safe boolean := false;
  v_physical_complete boolean := false;
begin
  select * into cfg from public.automation_config where id=1;
  select * into d from public.experience_definitions where slug='flow-cestas-comercial-v8-stable' limit 1;

  if p_session_id is not null then
    v_session_id := p_session_id;
  else
    select e.session_id
      into v_session_id
    from public.whatsapp_flow_exchange_events e
    join public.experience_sessions s on s.id=e.session_id
    where e.session_id is not null
      and coalesce((s.context->>'homologation_test')::boolean,false)
      and exists (
        select 1 from public.whatsapp_flow_exchange_events x
        where x.session_id=e.session_id and x.status='accepted' and x.screen='PRODUTOS_A'
      )
    group by e.session_id
    order by max(e.created_at) desc
    limit 1;
  end if;

  if v_session_id is not null then
    select
      max(e.created_at),
      count(*) filter (where e.status='accepted'),
      count(*) filter (where e.status<>'accepted'),
      coalesce(jsonb_agg(coalesce(e.screen,e.action) order by e.created_at)
        filter (where e.status='accepted'),'[]'::jsonb),
      bool_or(e.status='accepted' and e.screen in ('PRODUTOS_A','PRODUTO_A','PRODUTOS_B','PRODUTO_B','PRODUTOS_C','PRODUTO_C')),
      bool_or(e.status='accepted' and e.screen='UPSELL'),
      bool_or(e.status='accepted' and e.screen='REVISAO'),
      bool_or(e.status='accepted' and e.screen in ('CLIENTE_EXISTENTE','CLIENTE_NOVO')),
      bool_or(e.status='accepted' and e.screen='FINALIZAR')
    into v_last_at,v_accepted,v_errors,v_observed,v_has_product,v_has_upsell,v_has_review,v_has_customer,v_has_final
    from public.whatsapp_flow_exchange_events e
    where e.session_id=v_session_id;
  end if;

  v_terminal := public.get_whatsapp_flow_v39_terminal_checkout_readiness_v1(v_session_id);

  v_gates_safe := cfg.whatsapp_live_canary_percent=1
    and not coalesce(cfg.experience_orchestrator_enabled,false)
    and not coalesce(cfg.whatsapp_flow_data_exchange_enabled,false)
    and not coalesce(cfg.whatsapp_flow_send_enabled,false)
    and not coalesce(cfg.whatsapp_flow_commercial_write_enabled,false)
    and not coalesce(cfg.bling_order_sync_enabled,false);

  select coalesce(jsonb_agg(x.name order by x.ord),'[]'::jsonb)
    into v_missing
  from (values
    (1,'produto_quantidade'::text,v_has_product),
    (2,'upsell'::text,v_has_upsell),
    (3,'revisao'::text,v_has_review),
    (4,'cliente_endereco'::text,v_has_customer),
    (5,'finalizar'::text,v_has_final)
  ) x(ord,name,ok)
  where not coalesce(x.ok,false);

  -- Physical completion deliberately remains false until every Flow screen is
  -- observed in one owner-only homologation session. nfm_reply/location are
  -- terminal WhatsApp events and stay as explicit next evidence outside this table.
  v_physical_complete := v_session_id is not null
    and v_has_product and v_has_upsell and v_has_review and v_has_customer and v_has_final
    and v_errors=0;

  return jsonb_build_object(
    'ok',v_gates_safe and coalesce((v_terminal->>'ok')::boolean,false),
    'readiness_version','v41-physical-homologation-evidence-v1',
    'evidence_session_id',v_session_id,
    'evidence_last_at',v_last_at,
    'accepted_exchange_count',v_accepted,
    'error_exchange_count',v_errors,
    'observed_screens',v_observed,
    'missing_flow_evidence',v_missing,
    'physical_flow_path_complete',v_physical_complete,
    'nfm_reply_physical_evidence_required',true,
    'location_request_physical_evidence_required',true,
    'structural_terminal_ready',coalesce((v_terminal->>'ok')::boolean,false),
    'runtime_handler',d.config->>'handler_version',
    'runtime_edge_version',d.config->>'runtime_edge_version',
    'catalog_full_load_forbidden',coalesce((d.config->>'full_catalog_load_forbidden')::boolean,false),
    'max_products_per_query',coalesce((d.config->>'max_products_per_query')::int,0),
    'gates_safe_for_owner_homologation',v_gates_safe,
    'writes_executed',false,
    'orders_created',false,
    'pii_returned',false,
    'next_required_evidence',case
      when not v_has_product then 'produto_quantidade'
      when not v_has_upsell then 'upsell'
      when not v_has_review then 'revisao'
      when not v_has_customer then 'cliente_endereco'
      when not v_has_final then 'finalizar'
      else 'nfm_reply_e_localizacao'
    end,
    'gates',jsonb_build_object(
      'whatsapp_live_canary_percent',cfg.whatsapp_live_canary_percent,
      'experience_orchestrator_enabled',cfg.experience_orchestrator_enabled,
      'whatsapp_flow_data_exchange_enabled',cfg.whatsapp_flow_data_exchange_enabled,
      'whatsapp_flow_send_enabled',cfg.whatsapp_flow_send_enabled,
      'whatsapp_flow_commercial_write_enabled',cfg.whatsapp_flow_commercial_write_enabled,
      'bling_order_sync_enabled',cfg.bling_order_sync_enabled
    )
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v41_physical_homologation_evidence_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v41_physical_homologation_evidence_v1(uuid) to service_role;
