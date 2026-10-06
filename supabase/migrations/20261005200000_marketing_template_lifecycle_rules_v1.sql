begin;

-- Dona Antônia · Marketing template lifecycle v1
-- A limpeza é uma recomendação local. A exclusão na Meta continua dependendo
-- de ação Admin explícita e é executada somente pela Edge server-side.

create or replace function public.marketing_template_lifecycle_refresh_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  r record;
  v_last_used timestamptz;
  v_baseline timestamptz;
  v_campaign_dependency boolean;
  v_strategy_dependency boolean;
  v_status text;
  v_reason text;
  v_candidate_after timestamptz;
  v_candidates integer:=0;
  v_protected integer:=0;
  v_in_use integer:=0;
begin
  insert into public.marketing_template_lifecycle_v1(template_id,protected,lifecycle_status,metadata)
  select t.id,false,'active',jsonb_build_object('source','lifecycle_refresh_v1')
  from public.whatsapp_templates_v1 t
  where upper(coalesce(t.category,''))='MARKETING'
  on conflict(template_id) do nothing;

  for r in
    select t.id,t.created_at,t.metadata,l.protected,l.lifecycle_status,l.meta_deleted_at
    from public.whatsapp_templates_v1 t
    join public.marketing_template_lifecycle_v1 l on l.template_id=t.id
    where upper(coalesce(t.category,''))='MARKETING'
    order by t.created_at,t.id
  loop
    select max(coalesce(c.completed_at,c.started_at))
    into v_last_used
    from public.marketing_campaigns_v1 c
    where c.template_id=r.id
      and (c.started_at is not null or c.completed_at is not null);

    select exists(
      select 1
      from public.marketing_campaigns_v1 c
      where c.template_id=r.id
        and c.status in ('draft','ready_for_review','approved','scheduled','running','paused')
    ) into v_campaign_dependency;

    select exists(
      select 1
      from public.marketing_strategy_runs_v1 s
      where s.template_id=r.id
        and s.status not in ('completed','discarded','meta_rejected')
    ) into v_strategy_dependency;

    v_baseline:=coalesce(v_last_used,r.created_at,now());
    v_candidate_after:=v_baseline+interval '60 days';

    if coalesce((r.metadata->>'meta_missing')::boolean,false)=true or r.meta_deleted_at is not null or r.lifecycle_status='deleted_meta' then
      v_status:='deleted_meta';
      v_reason:='Já removido da Meta; histórico local preservado.';
    elsif r.lifecycle_status='delete_approved' then
      v_status:='delete_approved';
      v_reason:='Exclusão aprovada por humano; aguardando conclusão na Meta.';
    elsif r.protected is true then
      v_status:=case when v_campaign_dependency or v_strategy_dependency then 'in_use' else 'active' end;
      v_reason:='Protegido: nunca entra na limpeza automática.';
      v_protected:=v_protected+1;
    elsif v_campaign_dependency then
      v_status:='in_use';
      v_reason:='Há campanha ativa, em revisão, aprovada ou agendada usando este template.';
      v_in_use:=v_in_use+1;
    elsif v_strategy_dependency then
      v_status:='in_use';
      v_reason:='Há Estratégia de Marketing ainda dependente deste template.';
      v_in_use:=v_in_use+1;
    elsif v_candidate_after<=now() then
      v_status:='deletion_candidate';
      v_reason:='Sem dependências e sem uso por pelo menos 60 dias.';
      v_candidates:=v_candidates+1;
    else
      v_status:='active';
      v_reason:='Ainda dentro da janela mínima de 60 dias ou sem motivo para limpeza.';
    end if;

    update public.marketing_template_lifecycle_v1
    set lifecycle_status=v_status,
        last_used_at=v_last_used,
        retired_at=case when v_status='deletion_candidate' then coalesce(retired_at,now()) else retired_at end,
        candidate_after=v_candidate_after,
        reason=v_reason,
        updated_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'campaign_dependency',v_campaign_dependency,
          'strategy_dependency',v_strategy_dependency,
          'last_refresh_at',now()
        )
    where template_id=r.id;
  end loop;

  return jsonb_build_object('ok',true,'candidates',v_candidates,'protected',v_protected,'in_use',v_in_use,'minimum_unused_days',60);
end;
$$;
revoke all on function public.marketing_template_lifecycle_refresh_v1() from public,anon,authenticated;
grant execute on function public.marketing_template_lifecycle_refresh_v1() to service_role;

create or replace function public.marketing_template_lifecycle_list_v1(
  p_whatsapp_account_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_items jsonb:='[]'::jsonb;
begin
  perform public.marketing_template_lifecycle_refresh_v1();

  select coalesce(jsonb_agg(jsonb_build_object(
    'template_id',t.id,
    'whatsapp_account_id',t.whatsapp_account_id,
    'meta_template_id',t.meta_template_id,
    'name',t.name,
    'language',t.language,
    'category',t.category,
    'meta_status',t.status,
    'protected',l.protected,
    'lifecycle_status',l.lifecycle_status,
    'last_used_at',l.last_used_at,
    'candidate_after',l.candidate_after,
    'reason',l.reason,
    'delete_approved_at',l.delete_approved_at,
    'meta_deleted_at',l.meta_deleted_at,
    'campaign_dependency_count',(
      select count(*) from public.marketing_campaigns_v1 c
      where c.template_id=t.id and c.status in ('draft','ready_for_review','approved','scheduled','running','paused')
    ),
    'strategy_dependency_count',(
      select count(*) from public.marketing_strategy_runs_v1 s
      where s.template_id=t.id and s.status not in ('completed','discarded','meta_rejected')
    )
  ) order by
    case l.lifecycle_status when 'deletion_candidate' then 0 when 'delete_approved' then 1 when 'in_use' then 2 when 'active' then 3 else 4 end,
    coalesce(l.candidate_after,'infinity'::timestamptz),t.name),'[]'::jsonb)
  into v_items
  from public.whatsapp_templates_v1 t
  join public.marketing_template_lifecycle_v1 l on l.template_id=t.id
  where upper(coalesce(t.category,''))='MARKETING'
    and (p_whatsapp_account_id is null or t.whatsapp_account_id=p_whatsapp_account_id);

  return jsonb_build_object(
    'ok',true,
    'minimum_unused_days',60,
    'candidate_count',(select count(*) from jsonb_array_elements(v_items) item where item->>'lifecycle_status'='deletion_candidate'),
    'items',v_items
  );
end;
$$;
revoke all on function public.marketing_template_lifecycle_list_v1(uuid) from public,anon,authenticated;
grant execute on function public.marketing_template_lifecycle_list_v1(uuid) to service_role;

create or replace function public.marketing_template_lifecycle_set_protected_v1(
  p_template_id uuid,
  p_protected boolean,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_template public.whatsapp_templates_v1%rowtype;
  v_row public.marketing_template_lifecycle_v1%rowtype;
begin
  select * into v_template from public.whatsapp_templates_v1 where id=p_template_id;
  if not found then return jsonb_build_object('ok',false,'error','template_not_found'); end if;
  if upper(coalesce(v_template.category,''))<>'MARKETING' then return jsonb_build_object('ok',false,'error','template_not_marketing'); end if;

  insert into public.marketing_template_lifecycle_v1(template_id,protected,lifecycle_status,metadata)
  values(v_template.id,coalesce(p_protected,false),'active',jsonb_build_object('source','manual_protection'))
  on conflict(template_id) do update
  set protected=excluded.protected,
      lifecycle_status=case when excluded.protected then 'active' else public.marketing_template_lifecycle_v1.lifecycle_status end,
      delete_requested_at=case when excluded.protected then null else public.marketing_template_lifecycle_v1.delete_requested_at end,
      delete_requested_by=case when excluded.protected then null else public.marketing_template_lifecycle_v1.delete_requested_by end,
      delete_approved_at=case when excluded.protected then null else public.marketing_template_lifecycle_v1.delete_approved_at end,
      delete_approved_by=case when excluded.protected then null else public.marketing_template_lifecycle_v1.delete_approved_by end,
      reason=case when excluded.protected then 'Protegido manualmente por Admin.' else public.marketing_template_lifecycle_v1.reason end,
      updated_at=now(),
      metadata=coalesce(public.marketing_template_lifecycle_v1.metadata,'{}'::jsonb)||jsonb_build_object('protection_changed_by',p_actor_user_id,'protection_changed_at',now());

  perform public.marketing_template_lifecycle_refresh_v1();
  select * into v_row from public.marketing_template_lifecycle_v1 where template_id=v_template.id;
  return jsonb_build_object('ok',true,'template_id',v_template.id,'protected',v_row.protected,'lifecycle_status',v_row.lifecycle_status,'reason',v_row.reason);
end;
$$;
revoke all on function public.marketing_template_lifecycle_set_protected_v1(uuid,boolean,uuid) from public,anon,authenticated;
grant execute on function public.marketing_template_lifecycle_set_protected_v1(uuid,boolean,uuid) to service_role;

create or replace function public.marketing_template_lifecycle_approve_delete_v1(
  p_template_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_template public.whatsapp_templates_v1%rowtype;
  v_row public.marketing_template_lifecycle_v1%rowtype;
begin
  perform public.marketing_template_lifecycle_refresh_v1();

  select t.* into v_template
  from public.whatsapp_templates_v1 t
  where t.id=p_template_id
  for update;
  if not found then return jsonb_build_object('ok',false,'error','template_not_found'); end if;
  if upper(coalesce(v_template.category,''))<>'MARKETING' then return jsonb_build_object('ok',false,'error','template_not_marketing'); end if;

  select * into v_row
  from public.marketing_template_lifecycle_v1
  where template_id=v_template.id
  for update;
  if not found then return jsonb_build_object('ok',false,'error','template_lifecycle_missing'); end if;

  if v_row.lifecycle_status='deleted_meta' or coalesce((v_template.metadata->>'meta_missing')::boolean,false)=true then
    return jsonb_build_object('ok',true,'idempotent',true,'template_id',v_template.id,'lifecycle_status','deleted_meta');
  end if;
  if v_row.protected is true then return jsonb_build_object('ok',false,'error','template_protected'); end if;
  if v_row.lifecycle_status<>'deletion_candidate' then
    return jsonb_build_object('ok',false,'error','template_not_deletion_candidate','lifecycle_status',v_row.lifecycle_status,'reason',v_row.reason);
  end if;
  if exists(select 1 from public.marketing_campaigns_v1 c where c.template_id=v_template.id and c.status in ('draft','ready_for_review','approved','scheduled','running','paused')) then
    return jsonb_build_object('ok',false,'error','template_campaign_dependency');
  end if;
  if exists(select 1 from public.marketing_strategy_runs_v1 s where s.template_id=v_template.id and s.status not in ('completed','discarded','meta_rejected')) then
    return jsonb_build_object('ok',false,'error','template_strategy_dependency');
  end if;
  if v_row.candidate_after is null or v_row.candidate_after>now() then
    return jsonb_build_object('ok',false,'error','template_unused_window_not_met','candidate_after',v_row.candidate_after);
  end if;

  update public.marketing_template_lifecycle_v1
  set lifecycle_status='delete_approved',
      delete_requested_at=now(),delete_requested_by=p_actor_user_id,
      delete_approved_at=now(),delete_approved_by=p_actor_user_id,
      reason='Exclusão aprovada por humano; aguardando Meta.',updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('delete_confirmation_source','admin_explicit','delete_approved_at',now())
  where template_id=v_template.id;

  return jsonb_build_object(
    'ok',true,'idempotent',false,'template_id',v_template.id,'whatsapp_account_id',v_template.whatsapp_account_id,
    'meta_template_id',v_template.meta_template_id,'name',v_template.name,'lifecycle_status','delete_approved'
  );
end;
$$;
revoke all on function public.marketing_template_lifecycle_approve_delete_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.marketing_template_lifecycle_approve_delete_v1(uuid,uuid) to service_role;

create or replace function public.marketing_template_lifecycle_mark_deleted_v1(
  p_template_id uuid,
  p_actor_user_id uuid,
  p_provider_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_template public.whatsapp_templates_v1%rowtype;
  v_row public.marketing_template_lifecycle_v1%rowtype;
  v_now timestamptz:=now();
begin
  select * into v_template from public.whatsapp_templates_v1 where id=p_template_id for update;
  if not found then return jsonb_build_object('ok',false,'error','template_not_found'); end if;
  select * into v_row from public.marketing_template_lifecycle_v1 where template_id=v_template.id for update;
  if not found then return jsonb_build_object('ok',false,'error','template_lifecycle_missing'); end if;

  if v_row.lifecycle_status='deleted_meta' then
    return jsonb_build_object('ok',true,'idempotent',true,'template_id',v_template.id,'lifecycle_status','deleted_meta');
  end if;
  if v_row.lifecycle_status<>'delete_approved' then
    return jsonb_build_object('ok',false,'error','template_delete_not_approved','lifecycle_status',v_row.lifecycle_status);
  end if;

  update public.marketing_template_lifecycle_v1
  set lifecycle_status='deleted_meta',meta_deleted_at=v_now,
      reason='Excluído da Meta; histórico local preservado.',updated_at=v_now,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('meta_delete_completed_by',p_actor_user_id,'meta_delete_completed_at',v_now,'provider_payload',coalesce(p_provider_payload,'{}'::jsonb))
  where template_id=v_template.id;

  update public.whatsapp_templates_v1
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'meta_missing',true,'meta_deleted_at',v_now,'meta_delete_source','marketing_template_lifecycle_v1'
      ),
      updated_at=v_now
  where id=v_template.id;

  return jsonb_build_object('ok',true,'idempotent',false,'template_id',v_template.id,'lifecycle_status','deleted_meta','meta_deleted_at',v_now,'history_preserved',true);
end;
$$;
revoke all on function public.marketing_template_lifecycle_mark_deleted_v1(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.marketing_template_lifecycle_mark_deleted_v1(uuid,uuid,jsonb) to service_role;

commit;
