-- ANA própria — review e métricas de sugestões cadastrais v1
-- Phase 1: review changes suggestion state only; it never writes canonical customer data.

create or replace function public.ops2_admin_ana_customer_profile_review_v1(
  p_suggestion_id uuid,
  p_outcome text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_access jsonb:=public.ops2_admin_attendance_customer_access_v1(true);
  v_suggestion public.customer_profile_suggestions_v1%rowtype;
  v_outcome text:=lower(btrim(coalesce(p_outcome,'')));
  v_target_status text;
  v_user_id uuid:=auth.uid();
  v_doc text;
  v_other_customer uuid;
begin
  if coalesce((v_access->>'ok')::boolean,false) is not true then return v_access; end if;
  if p_suggestion_id is null then return jsonb_build_object('ok',false,'error','suggestion_required'); end if;
  if v_outcome not in ('accepted','rejected') then return jsonb_build_object('ok',false,'error','review_outcome_invalid'); end if;

  v_target_status:=case when v_outcome='accepted' then 'reviewed_accepted' else 'reviewed_rejected' end;

  select * into v_suggestion
  from public.customer_profile_suggestions_v1
  where id=p_suggestion_id
  for update;
  if not found then return jsonb_build_object('ok',false,'error','suggestion_not_found'); end if;

  if v_suggestion.status=v_target_status then
    return jsonb_build_object('ok',true,'suggestion_id',v_suggestion.id,'status',v_suggestion.status,'idempotent',true);
  end if;
  if v_suggestion.status<>'pending' then
    return jsonb_build_object('ok',false,'error','suggestion_already_reviewed','status',v_suggestion.status);
  end if;

  if v_outcome='accepted' and v_suggestion.recommendation='ignore' then
    return jsonb_build_object('ok',false,'error','suggestion_not_usable');
  end if;

  if v_outcome='accepted' and v_suggestion.field_name='cpf_cnpj' then
    v_doc:=regexp_replace(coalesce(v_suggestion.normalized_value,''),'[^0-9]','','g');
    if public.ops2_valid_cpf_cnpj_v1(v_doc) is not true then
      return jsonb_build_object('ok',false,'error','invalid_cpf_cnpj');
    end if;

    select c.id into v_other_customer
    from public.customers c
    where regexp_replace(coalesce(c.cpf_cnpj,''),'[^0-9]','','g')=v_doc
      and (v_suggestion.customer_id is null or c.id<>v_suggestion.customer_id)
    limit 1;
    if found then
      return jsonb_build_object('ok',false,'error','cpf_cnpj_belongs_to_other_customer');
    end if;
  end if;

  update public.customer_profile_suggestions_v1
  set status=case when v_outcome='accepted' then 'reviewed_accepted' else 'reviewed_rejected' end,
      reviewed_by_admin_user_id=v_user_id,
      reviewed_at=now(),
      updated_at=now()
  where id=p_suggestion_id
  returning * into v_suggestion;

  return jsonb_build_object(
    'ok',true,
    'suggestion_id',v_suggestion.id,
    'conversation_id',v_suggestion.conversation_id,
    'field_name',v_suggestion.field_name,
    'status',v_suggestion.status,
    'idempotent',false
  );
end;
$function$;

create or replace function public.ops2_admin_ana_customer_profile_metrics_v1()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_access jsonb:=public.ops2_admin_attendance_customer_access_v1(false);
  v_total bigint;
  v_pending bigint;
  v_accepted bigint;
  v_rejected bigint;
  v_by_field jsonb;
begin
  if coalesce((v_access->>'ok')::boolean,false) is not true then return v_access; end if;

  select count(*),
         count(*) filter(where status='pending'),
         count(*) filter(where status='reviewed_accepted'),
         count(*) filter(where status='reviewed_rejected')
    into v_total,v_pending,v_accepted,v_rejected
  from public.customer_profile_suggestions_v1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'field_name',x.field_name,
    'total',x.total,
    'pending',x.pending,
    'accepted',x.accepted,
    'rejected',x.rejected,
    'acceptance_rate',case when (x.accepted+x.rejected)>0 then round(x.accepted::numeric/(x.accepted+x.rejected),4) else null end
  ) order by x.field_name),'[]'::jsonb)
  into v_by_field
  from (
    select field_name,count(*) total,
           count(*) filter(where status='pending') pending,
           count(*) filter(where status='reviewed_accepted') accepted,
           count(*) filter(where status='reviewed_rejected') rejected
    from public.customer_profile_suggestions_v1
    group by field_name
  ) x;

  return jsonb_build_object(
    'ok',true,'total',v_total,'pending',v_pending,'accepted',v_accepted,'rejected',v_rejected,
    'acceptance_rate',case when (v_accepted+v_rejected)>0 then round(v_accepted::numeric/(v_accepted+v_rejected),4) else null end,
    'by_field',v_by_field
  );
end;
$function$;

revoke all on function public.ops2_admin_ana_customer_profile_review_v1(uuid,text) from public,anon;
revoke all on function public.ops2_admin_ana_customer_profile_metrics_v1() from public,anon;
grant execute on function public.ops2_admin_ana_customer_profile_review_v1(uuid,text) to authenticated,service_role;
grant execute on function public.ops2_admin_ana_customer_profile_metrics_v1() to authenticated,service_role;
