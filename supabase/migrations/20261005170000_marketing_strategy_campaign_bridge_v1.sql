begin;

-- Dona Antônia · Marketing Strategy → Campaign bridge v1
-- Reutiliza o motor canônico de campanhas. Não liga runtime, worker ou Meta.

create unique index if not exists marketing_campaigns_v1_strategy_uidx
  on public.marketing_campaigns_v1(strategy_id)
  where strategy_id is not null;

create or replace function public.marketing_strategy_revalidate_commercial_v1(
  p_strategy_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_strategy public.marketing_strategy_runs_v1%rowtype;
  v_offer_count integer:=0;
  v_issues jsonb:='[]'::jsonb;
begin
  select * into v_strategy
  from public.marketing_strategy_runs_v1
  where id=p_strategy_id;

  if not found then
    return jsonb_build_object('ok',false,'error','strategy_not_found');
  end if;

  select count(*)::integer into v_offer_count
  from public.marketing_strategy_offers_v1
  where strategy_id=p_strategy_id;

  if v_offer_count<1 then
    return jsonb_build_object('ok',false,'error','strategy_material_change','issues',jsonb_build_array(jsonb_build_object('reason','no_strategy_offers')));
  end if;

  with checked as (
    select
      o.id as strategy_offer_id,
      o.position,
      o.commercial_id,
      o.public_lot_id as snapshot_public_lot_id,
      o.public_name as snapshot_public_name,
      o.sale_price_snapshot,
      o.public_available_snapshot,
      c.public_lot_id as current_public_lot_id,
      c.public_name as current_public_name,
      c.sale_price as current_sale_price,
      c.public_available as current_public_available,
      c.availability_reason as current_availability_reason,
      c.model_active as current_model_active,
      c.category_active as current_category_active,
      case
        when c.commercial_id is null then 'offer_missing'
        when c.model_active is not true then 'model_inactive'
        when c.category_active is not true then 'category_inactive'
        when coalesce(c.availability_reason,'') <> 'available' then 'not_available'
        when coalesce(c.public_available,0) <= 0 then 'sold_out'
        when coalesce(c.sale_price,0) < 75 then 'below_minimum'
        when c.public_lot_id is distinct from o.public_lot_id then 'public_lot_changed'
        when round(coalesce(c.sale_price,0)::numeric,2) is distinct from round(coalesce(o.sale_price_snapshot,0)::numeric,2) then 'price_changed'
        when coalesce(c.public_name,'') is distinct from coalesce(o.public_name,'') then 'public_name_changed'
        else null
      end as reason
    from public.marketing_strategy_offers_v1 o
    left join lateral (
      select c0.*
      from public.basket_commercial_catalog_v1 c0
      where c0.commercial_id=o.commercial_id
      order by
        case when c0.public_lot_id is not distinct from o.public_lot_id then 0 else 1 end,
        c0.public_available desc nulls last,
        c0.public_name
      limit 1
    ) c on true
    where o.strategy_id=p_strategy_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'strategy_offer_id',strategy_offer_id,
    'position',position,
    'commercial_id',commercial_id,
    'reason',reason,
    'snapshot_public_lot_id',snapshot_public_lot_id,
    'current_public_lot_id',current_public_lot_id,
    'snapshot_price',sale_price_snapshot,
    'current_price',current_sale_price,
    'current_available',current_public_available,
    'current_availability_reason',current_availability_reason
  ) order by position),'[]'::jsonb)
  into v_issues
  from checked
  where reason is not null;

  if jsonb_array_length(v_issues)>0 then
    return jsonb_build_object('ok',false,'error','strategy_material_change','issues',v_issues,'checked_offers',v_offer_count);
  end if;

  return jsonb_build_object('ok',true,'strategy_id',p_strategy_id,'checked_offers',v_offer_count,'minimum_price',75);
end;
$$;

revoke all on function public.marketing_strategy_revalidate_commercial_v1(uuid) from public,anon,authenticated;
grant execute on function public.marketing_strategy_revalidate_commercial_v1(uuid) to service_role;

create or replace function public.marketing_strategy_materialize_campaign_v1(
  p_strategy_id uuid,
  p_expected_revision integer,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_strategy public.marketing_strategy_runs_v1%rowtype;
  v_template public.whatsapp_templates_v1%rowtype;
  v_campaign public.marketing_campaigns_v1%rowtype;
  v_revalidate jsonb;
  v_created jsonb;
  v_snapshot jsonb;
  v_campaign_transition jsonb;
  v_strategy_transition jsonb;
  v_filters jsonb:='{}'::jsonb;
  v_variables jsonb:='{}'::jsonb;
  v_deep_link jsonb:='{}'::jsonb;
  v_offer_links jsonb:='[]'::jsonb;
  v_name text;
  v_headline text;
  v_body text;
  v_idempotency text;
  v_campaign_id uuid;
  v_campaign_revision integer;
begin
  select * into v_strategy
  from public.marketing_strategy_runs_v1
  where id=p_strategy_id
  for update;

  if not found then return jsonb_build_object('ok',false,'error','strategy_not_found'); end if;
  if v_strategy.revision<>p_expected_revision then return jsonb_build_object('ok',false,'error','revision_conflict','revision',v_strategy.revision,'status',v_strategy.status); end if;

  if v_strategy.campaign_id is not null and v_strategy.status in ('ready_to_send','send_approved','scheduled','running','completed') then
    select * into v_campaign from public.marketing_campaigns_v1 where id=v_strategy.campaign_id;
    return jsonb_build_object('ok',true,'idempotent',true,'strategy_id',v_strategy.id,'strategy_status',v_strategy.status,'revision',v_strategy.revision,'campaign_id',v_strategy.campaign_id,'campaign_status',v_campaign.status);
  end if;

  if v_strategy.status<>'meta_approved' then
    return jsonb_build_object('ok',false,'error','strategy_invalid_transition','from_status',v_strategy.status,'to_status','ready_to_send');
  end if;
  if v_strategy.template_id is null then return jsonb_build_object('ok',false,'error','strategy_template_required'); end if;

  v_revalidate:=public.marketing_strategy_revalidate_commercial_v1(v_strategy.id);
  if coalesce((v_revalidate->>'ok')::boolean,false) is not true then return v_revalidate; end if;

  select * into v_template
  from public.whatsapp_templates_v1
  where id=v_strategy.template_id
    and whatsapp_account_id=v_strategy.whatsapp_account_id
    and upper(category)='MARKETING'
    and upper(status)='APPROVED';
  if not found then return jsonb_build_object('ok',false,'error','template_not_sendable'); end if;

  if jsonb_typeof(v_strategy.audience_snapshot->'filters')='object' then
    v_filters:=v_strategy.audience_snapshot->'filters';
  end if;

  v_headline:=coalesce(nullif(btrim(v_strategy.copy_snapshot->>'headline'),''),'Oferta Dona Antônia');
  v_body:=coalesce(nullif(btrim(v_strategy.copy_snapshot->>'body'),''),'Confira nossa seleção de Cestas e Kits.');
  if v_strategy.offer_format='single' then
    v_variables:=jsonb_build_object('1',v_headline,'2',v_body,'3','https://www.donaantonia.com.br/');
  else
    v_variables:='{}'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'position',o.position,
    'commercial_id',o.commercial_id,
    'public_lot_id',o.public_lot_id,
    'public_name',o.public_name,
    'sale_price',o.sale_price_snapshot
  ) order by o.position),'[]'::jsonb)
  into v_offer_links
  from public.marketing_strategy_offers_v1 o
  where o.strategy_id=v_strategy.id;

  v_deep_link:=jsonb_build_object(
    'source','marketing_strategy_v1',
    'strategy_id',v_strategy.id,
    'offers',v_offer_links
  );
  v_name:=left(format('Estratégia %s · %s',to_char(v_strategy.period_start,'DD/MM/YYYY'),v_headline),160);
  v_idempotency:=format('strategy:%s:campaign',v_strategy.id);

  v_created:=public.marketing_create_campaign_v1(
    v_name,
    v_strategy.whatsapp_account_id,
    v_strategy.template_id,
    v_filters,
    v_variables,
    v_deep_link,
    v_idempotency
  );
  if coalesce((v_created->>'ok')::boolean,false) is not true then return v_created; end if;

  v_campaign_id:=(v_created->>'campaign_id')::uuid;
  select * into v_campaign from public.marketing_campaigns_v1 where id=v_campaign_id for update;
  if not found then raise exception 'strategy_campaign_bridge_failed:campaign_missing'; end if;
  if v_campaign.strategy_id is not null and v_campaign.strategy_id<>v_strategy.id then
    raise exception 'strategy_campaign_bridge_failed:campaign_strategy_conflict';
  end if;

  update public.marketing_campaigns_v1
  set strategy_id=v_strategy.id,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('source','marketing_strategy_v1','strategy_revision',v_strategy.revision),
      updated_at=now()
  where id=v_campaign.id
  returning * into v_campaign;

  v_campaign_revision:=v_campaign.revision;
  v_snapshot:=public.marketing_create_campaign_snapshot_v1(v_campaign.id,v_campaign_revision,format('strategy:%s:snapshot:r%s',v_strategy.id,v_campaign_revision));
  if coalesce((v_snapshot->>'ok')::boolean,false) is not true then
    raise exception 'strategy_campaign_bridge_failed:snapshot:%',coalesce(v_snapshot->>'error','unknown');
  end if;

  if v_campaign.status='draft' then
    v_campaign_transition:=public.marketing_transition_campaign_v1(v_campaign.id,v_campaign_revision,'ready_for_review','materialized_from_strategy');
    if coalesce((v_campaign_transition->>'ok')::boolean,false) is not true then
      raise exception 'strategy_campaign_bridge_failed:campaign_transition:%',coalesce(v_campaign_transition->>'error','unknown');
    end if;
  elsif v_campaign.status<>'ready_for_review' then
    raise exception 'strategy_campaign_bridge_failed:campaign_status:%',v_campaign.status;
  end if;

  update public.marketing_strategy_runs_v1
  set campaign_id=v_campaign.id,updated_at=now()
  where id=v_strategy.id;

  v_strategy_transition:=public.marketing_strategy_transition_v1(v_strategy.id,v_strategy.revision,'ready_to_send',p_actor_user_id,'Campanha preparada para o Portão C');
  if coalesce((v_strategy_transition->>'ok')::boolean,false) is not true then
    raise exception 'strategy_campaign_bridge_failed:strategy_transition:%',coalesce(v_strategy_transition->>'error','unknown');
  end if;

  perform public.marketing_strategy_append_event_v1(v_strategy.id,'campaign_materialized',p_actor_user_id,jsonb_build_object(
    'campaign_id',v_campaign.id,
    'snapshot_id',v_snapshot->>'snapshot_id',
    'campaign_status','ready_for_review'
  ));

  return jsonb_build_object(
    'ok',true,'idempotent',coalesce((v_created->>'idempotent')::boolean,false),
    'strategy_id',v_strategy.id,'strategy_status','ready_to_send','revision',(v_strategy_transition->>'revision')::integer,
    'campaign_id',v_campaign.id,'campaign_status','ready_for_review','snapshot_id',v_snapshot->>'snapshot_id',
    'eligible_count',coalesce((v_snapshot->>'eligible_count')::integer,0)
  );
end;
$$;

revoke all on function public.marketing_strategy_materialize_campaign_v1(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.marketing_strategy_materialize_campaign_v1(uuid,integer,uuid) to service_role;

create or replace function public.marketing_strategy_approve_send_v1(
  p_strategy_id uuid,
  p_expected_revision integer,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_strategy public.marketing_strategy_runs_v1%rowtype;
  v_campaign public.marketing_campaigns_v1%rowtype;
  v_revalidate jsonb;
  v_campaign_transition jsonb;
  v_strategy_transition jsonb;
begin
  select * into v_strategy
  from public.marketing_strategy_runs_v1
  where id=p_strategy_id
  for update;
  if not found then return jsonb_build_object('ok',false,'error','strategy_not_found'); end if;
  if v_strategy.revision<>p_expected_revision then return jsonb_build_object('ok',false,'error','revision_conflict','revision',v_strategy.revision,'status',v_strategy.status); end if;

  if v_strategy.status='send_approved' then
    return jsonb_build_object('ok',true,'idempotent',true,'strategy_id',v_strategy.id,'strategy_status',v_strategy.status,'revision',v_strategy.revision,'campaign_id',v_strategy.campaign_id);
  end if;
  if v_strategy.status<>'ready_to_send' then return jsonb_build_object('ok',false,'error','strategy_invalid_transition','from_status',v_strategy.status,'to_status','send_approved'); end if;
  if v_strategy.campaign_id is null then return jsonb_build_object('ok',false,'error','strategy_campaign_required'); end if;

  v_revalidate:=public.marketing_strategy_revalidate_commercial_v1(v_strategy.id);
  if coalesce((v_revalidate->>'ok')::boolean,false) is not true then return v_revalidate; end if;

  select * into v_campaign
  from public.marketing_campaigns_v1
  where id=v_strategy.campaign_id and strategy_id=v_strategy.id
  for update;
  if not found then return jsonb_build_object('ok',false,'error','strategy_campaign_not_found'); end if;
  if v_campaign.template_id<>v_strategy.template_id or v_campaign.whatsapp_account_id<>v_strategy.whatsapp_account_id then
    return jsonb_build_object('ok',false,'error','strategy_material_change','issues',jsonb_build_array(jsonb_build_object('reason','campaign_identity_changed')));
  end if;

  if not exists(
    select 1 from public.whatsapp_templates_v1 t
    where t.id=v_strategy.template_id and t.whatsapp_account_id=v_strategy.whatsapp_account_id
      and upper(t.category)='MARKETING' and upper(t.status)='APPROVED'
  ) then
    return jsonb_build_object('ok',false,'error','template_not_sendable');
  end if;

  if v_campaign.status='ready_for_review' then
    v_campaign_transition:=public.marketing_transition_campaign_v1(v_campaign.id,v_campaign.revision,'approved','Portão C aprovado na Estratégia');
    if coalesce((v_campaign_transition->>'ok')::boolean,false) is not true then
      raise exception 'strategy_campaign_bridge_failed:campaign_approval:%',coalesce(v_campaign_transition->>'error','unknown');
    end if;
  elsif v_campaign.status<>'approved' then
    return jsonb_build_object('ok',false,'error','campaign_invalid_transition','status',v_campaign.status);
  end if;

  v_strategy_transition:=public.marketing_strategy_transition_v1(v_strategy.id,v_strategy.revision,'send_approved',p_actor_user_id,'Portão C aprovado');
  if coalesce((v_strategy_transition->>'ok')::boolean,false) is not true then
    raise exception 'strategy_campaign_bridge_failed:strategy_approval:%',coalesce(v_strategy_transition->>'error','unknown');
  end if;

  perform public.marketing_strategy_append_event_v1(v_strategy.id,'portal_c_approved',p_actor_user_id,jsonb_build_object('campaign_id',v_campaign.id));

  return jsonb_build_object('ok',true,'idempotent',false,
    'strategy_id',v_strategy.id,'strategy_status','send_approved','revision',(v_strategy_transition->>'revision')::integer,
    'campaign_id',v_campaign.id,'campaign_status','approved');
end;
$$;

revoke all on function public.marketing_strategy_approve_send_v1(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.marketing_strategy_approve_send_v1(uuid,integer,uuid) to service_role;

create or replace function public.marketing_strategy_schedule_send_v1(
  p_strategy_id uuid,
  p_expected_revision integer,
  p_scheduled_for timestamptz,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_strategy public.marketing_strategy_runs_v1%rowtype;
  v_campaign public.marketing_campaigns_v1%rowtype;
  v_revalidate jsonb;
  v_scheduled jsonb;
  v_strategy_transition jsonb;
  v_when timestamptz:=coalesce(p_scheduled_for,now());
begin
  select * into v_strategy
  from public.marketing_strategy_runs_v1
  where id=p_strategy_id
  for update;
  if not found then return jsonb_build_object('ok',false,'error','strategy_not_found'); end if;
  if v_strategy.revision<>p_expected_revision then return jsonb_build_object('ok',false,'error','revision_conflict','revision',v_strategy.revision,'status',v_strategy.status); end if;

  if v_strategy.status='scheduled' then
    return jsonb_build_object('ok',true,'idempotent',true,'strategy_id',v_strategy.id,'strategy_status','scheduled','revision',v_strategy.revision,'campaign_id',v_strategy.campaign_id);
  end if;
  if v_strategy.status<>'send_approved' then return jsonb_build_object('ok',false,'error','strategy_invalid_transition','from_status',v_strategy.status,'to_status','scheduled'); end if;
  if v_strategy.campaign_id is null then return jsonb_build_object('ok',false,'error','strategy_campaign_required'); end if;

  v_revalidate:=public.marketing_strategy_revalidate_commercial_v1(v_strategy.id);
  if coalesce((v_revalidate->>'ok')::boolean,false) is not true then return v_revalidate; end if;

  select * into v_campaign
  from public.marketing_campaigns_v1
  where id=v_strategy.campaign_id and strategy_id=v_strategy.id
  for update;
  if not found then return jsonb_build_object('ok',false,'error','strategy_campaign_not_found'); end if;
  if v_campaign.status<>'approved' then return jsonb_build_object('ok',false,'error','campaign_invalid_transition','status',v_campaign.status); end if;

  v_scheduled:=public.marketing_schedule_campaign_v1(v_campaign.id,v_campaign.revision,v_when);
  if coalesce((v_scheduled->>'ok')::boolean,false) is not true then
    -- campaigns_disabled/runtime off chega aqui sem alterar campanha ou estratégia.
    return v_scheduled||jsonb_build_object('strategy_id',v_strategy.id,'strategy_status',v_strategy.status);
  end if;

  v_strategy_transition:=public.marketing_strategy_transition_v1(v_strategy.id,v_strategy.revision,'scheduled',p_actor_user_id,'Agendamento confirmado pelo motor canônico');
  if coalesce((v_strategy_transition->>'ok')::boolean,false) is not true then
    -- Exceção garante rollback também do marketing_schedule_campaign_v1 executado acima.
    raise exception 'strategy_campaign_bridge_failed:strategy_schedule:%',coalesce(v_strategy_transition->>'error','unknown');
  end if;

  perform public.marketing_strategy_append_event_v1(v_strategy.id,'campaign_scheduled',p_actor_user_id,jsonb_build_object(
    'campaign_id',v_campaign.id,
    'scheduled_for',v_when
  ));

  return jsonb_build_object('ok',true,
    'strategy_id',v_strategy.id,'strategy_status','scheduled','revision',(v_strategy_transition->>'revision')::integer,
    'campaign_id',v_campaign.id,'campaign_status','scheduled','scheduled_for',v_when,
    'mode',v_scheduled->>'mode');
end;
$$;

revoke all on function public.marketing_strategy_schedule_send_v1(uuid,integer,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.marketing_strategy_schedule_send_v1(uuid,integer,timestamptz,uuid) to service_role;

commit;
