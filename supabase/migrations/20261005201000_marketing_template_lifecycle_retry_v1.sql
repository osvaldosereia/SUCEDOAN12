begin;

-- Revalida toda a segurança também quando uma exclusão já foi aprovada,
-- mas a chamada anterior à Meta falhou. Assim delete_approved é retryable,
-- sem permitir que uma nova campanha/estratégia criada nesse intervalo seja ignorada.

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
  if v_row.protected is true then
    return jsonb_build_object('ok',false,'error','template_protected');
  end if;

  -- Revalidação obrigatória inclusive em retry de delete_approved.
  if exists(
    select 1 from public.marketing_campaigns_v1 c
    where c.template_id=v_template.id
      and c.status in ('draft','ready_for_review','approved','scheduled','running','paused')
  ) then
    return jsonb_build_object('ok',false,'error','template_campaign_dependency');
  end if;
  if exists(
    select 1 from public.marketing_strategy_runs_v1 s
    where s.template_id=v_template.id
      and s.status not in ('completed','discarded','meta_rejected')
  ) then
    return jsonb_build_object('ok',false,'error','template_strategy_dependency');
  end if;
  if v_row.candidate_after is null or v_row.candidate_after>now() then
    return jsonb_build_object('ok',false,'error','template_unused_window_not_met','candidate_after',v_row.candidate_after);
  end if;
  if v_row.lifecycle_status not in ('deletion_candidate','delete_approved') then
    return jsonb_build_object('ok',false,'error','template_not_deletion_candidate','lifecycle_status',v_row.lifecycle_status,'reason',v_row.reason);
  end if;

  if v_row.lifecycle_status='delete_approved' then
    return jsonb_build_object(
      'ok',true,'idempotent',true,
      'template_id',v_template.id,
      'whatsapp_account_id',v_template.whatsapp_account_id,
      'meta_template_id',v_template.meta_template_id,
      'name',v_template.name,
      'lifecycle_status','delete_approved',
      'revalidated',true
    );
  end if;

  update public.marketing_template_lifecycle_v1
  set lifecycle_status='delete_approved',
      delete_requested_at=now(),delete_requested_by=p_actor_user_id,
      delete_approved_at=now(),delete_approved_by=p_actor_user_id,
      reason='Exclusão aprovada por humano; aguardando Meta.',updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'delete_confirmation_source','admin_explicit',
        'delete_approved_at',now()
      )
  where template_id=v_template.id;

  return jsonb_build_object(
    'ok',true,'idempotent',false,
    'template_id',v_template.id,
    'whatsapp_account_id',v_template.whatsapp_account_id,
    'meta_template_id',v_template.meta_template_id,
    'name',v_template.name,
    'lifecycle_status','delete_approved',
    'revalidated',true
  );
end;
$$;

revoke all on function public.marketing_template_lifecycle_approve_delete_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.marketing_template_lifecycle_approve_delete_v1(uuid,uuid) to service_role;

commit;
