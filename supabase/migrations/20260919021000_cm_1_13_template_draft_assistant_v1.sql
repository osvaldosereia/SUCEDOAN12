-- CM-1.13 Template Draft Assistant v1
-- Local draft/version/validation only. No submission to Meta.

alter table public.whatsapp_direct_templates
  add column if not exists local_status text not null default 'draft',
  add column if not exists strategy_key text,
  add column if not exists strategy_brief_id uuid references public.marketing_strategy_briefs(id) on delete set null,
  add column if not exists creative_asset_id uuid references public.marketing_assets(id) on delete set null,
  add column if not exists variable_schema jsonb not null default '{}'::jsonb,
  add column if not exists validation_status text not null default 'pending',
  add column if not exists validation_report jsonb not null default '{}'::jsonb,
  add column if not exists source_kind text not null default 'manual',
  add column if not exists ai_generated boolean not null default false,
  add column if not exists notes text,
  add column if not exists active_meta_version integer,
  add column if not exists last_validated_at timestamptz,
  add column if not exists created_by uuid references public.admin_users(user_id) on delete set null;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='whatsapp_direct_templates_local_status_check') then
    alter table public.whatsapp_direct_templates add constraint whatsapp_direct_templates_local_status_check
      check(local_status in ('draft','review','ready_for_submit','archived'));
  end if;
  if not exists(select 1 from pg_constraint where conname='whatsapp_direct_templates_validation_status_check') then
    alter table public.whatsapp_direct_templates add constraint whatsapp_direct_templates_validation_status_check
      check(validation_status in ('pending','valid','warning','invalid'));
  end if;
  if not exists(select 1 from pg_constraint where conname='whatsapp_direct_templates_source_kind_check') then
    alter table public.whatsapp_direct_templates add constraint whatsapp_direct_templates_source_kind_check
      check(source_kind in ('manual','ai_draft','legacy_import','system'));
  end if;
  if not exists(select 1 from pg_constraint where conname='whatsapp_direct_templates_variable_schema_object_check') then
    alter table public.whatsapp_direct_templates add constraint whatsapp_direct_templates_variable_schema_object_check
      check(jsonb_typeof(variable_schema)='object');
  end if;
  if not exists(select 1 from pg_constraint where conname='whatsapp_direct_templates_validation_report_object_check') then
    alter table public.whatsapp_direct_templates add constraint whatsapp_direct_templates_validation_report_object_check
      check(jsonb_typeof(validation_report)='object');
  end if;
end $$;

alter table public.whatsapp_direct_template_versions
  add column if not exists local_status text not null default 'draft',
  add column if not exists strategy_key text,
  add column if not exists strategy_brief_id uuid references public.marketing_strategy_briefs(id) on delete set null,
  add column if not exists creative_asset_id uuid references public.marketing_assets(id) on delete set null,
  add column if not exists variable_schema jsonb not null default '{}'::jsonb,
  add column if not exists validation_status text not null default 'pending',
  add column if not exists validation_report jsonb not null default '{}'::jsonb,
  add column if not exists source_kind text not null default 'manual',
  add column if not exists ai_generated boolean not null default false,
  add column if not exists notes text,
  add column if not exists change_note text;

create or replace function public.validate_whatsapp_template_draft_v1(
  p_template_key text,
  p_body_text text,
  p_category text default 'UTILITY',
  p_language_code text default 'pt_BR',
  p_buttons jsonb default '[]'::jsonb,
  p_media_kind text default 'none'
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $fn$
declare
  v_key text:=lower(btrim(coalesce(p_template_key,'')));
  v_body text:=coalesce(p_body_text,'');
  v_category text:=upper(btrim(coalesce(p_category,'')));
  v_language text:=btrim(coalesce(p_language_code,''));
  v_media text:=lower(btrim(coalesce(p_media_kind,'none')));
  v_errors text[]:='{}'::text[];
  v_warnings text[]:='{}'::text[];
  v_vars integer[]:='{}'::integer[];
  v_var integer;
  v_max integer:=0;
  v_expected integer;
  v_policy_count integer:=0;
begin
  if v_key !~ '^[a-z0-9_]{3,120}$' then v_errors:=array_append(v_errors,'template_key_invalid'); end if;
  if length(btrim(v_body))=0 then v_errors:=array_append(v_errors,'body_required'); end if;
  if length(v_body)>4096 then v_errors:=array_append(v_errors,'body_exceeds_local_limit'); end if;
  if v_category not in ('UTILITY','MARKETING','AUTHENTICATION') then v_errors:=array_append(v_errors,'category_invalid'); end if;
  if v_language !~ '^[a-z]{2}(_[A-Z]{2})?$' then v_errors:=array_append(v_errors,'language_code_invalid'); end if;
  if v_media not in ('none','image','video','document') then v_errors:=array_append(v_errors,'media_kind_invalid'); end if;
  if jsonb_typeof(coalesce(p_buttons,'null'::jsonb))<>'array' then v_errors:=array_append(v_errors,'buttons_must_be_array'); end if;

  for v_var in
    select distinct (m[1])::integer
    from regexp_matches(v_body,'\{\{([0-9]+)\}\}','g') m
    order by 1
  loop
    v_vars:=array_append(v_vars,v_var);
    v_max:=greatest(v_max,v_var);
  end loop;

  if position('{{' in regexp_replace(v_body,'\{\{[0-9]+\}\}','','g'))>0
     or position('}}' in regexp_replace(v_body,'\{\{[0-9]+\}\}','','g'))>0 then
    v_errors:=array_append(v_errors,'variable_syntax_invalid');
  end if;

  if v_max>0 then
    for v_expected in 1..v_max loop
      if not (v_expected=any(v_vars)) then
        v_errors:=array_append(v_errors,'variable_sequence_has_gap');
        exit;
      end if;
    end loop;
  end if;

  if v_max>20 then v_warnings:=array_append(v_warnings,'many_variables_review_recommended'); end if;

  select count(*) into v_policy_count
  from public.meta_policy_registry
  where status='active'
    and (capability is null or capability in ('message_template','whatsapp_template'));

  if v_policy_count=0 then v_warnings:=array_append(v_warnings,'meta_policy_registry_not_yet_verified'); end if;
  if v_category='MARKETING' then v_warnings:=array_append(v_warnings,'marketing_template_requires_consent_and_customer_protection'); end if;

  return jsonb_build_object(
    'valid',cardinality(v_errors)=0,
    'status',case when cardinality(v_errors)>0 then 'invalid' when cardinality(v_warnings)>0 then 'warning' else 'valid' end,
    'errors',to_jsonb(v_errors),
    'warnings',to_jsonb(v_warnings),
    'variables',to_jsonb(v_vars),
    'variable_schema',jsonb_build_object('count',coalesce(cardinality(v_vars),0),'positions',to_jsonb(v_vars),'syntax','{{N}}'),
    'provider_policy_verified',(v_policy_count>0),
    'meta_submission_performed',false,
    'external_side_effect',false,
    'validator_version','cm1.13-v1'
  );
end;
$fn$;

revoke all on function public.validate_whatsapp_template_draft_v1(text,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.validate_whatsapp_template_draft_v1(text,text,text,text,jsonb,text) to service_role;

create or replace function public.save_whatsapp_template_draft_v1(
  p_template_key text,
  p_meta_template_name text,
  p_category text,
  p_language_code text,
  p_purpose text,
  p_body_text text,
  p_media_kind text default 'none',
  p_media_url text default null,
  p_buttons jsonb default '[]'::jsonb,
  p_strategy_key text default null,
  p_strategy_brief_id uuid default null,
  p_creative_asset_id uuid default null,
  p_notes text default null,
  p_source_kind text default 'manual',
  p_ai_generated boolean default false,
  p_change_note text default null,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $fn$
declare
  v_key text:=lower(btrim(coalesce(p_template_key,'')));
  v_category text:=upper(btrim(coalesce(p_category,'UTILITY')));
  v_language text:=btrim(coalesce(p_language_code,'pt_BR'));
  v_purpose text:=btrim(coalesce(p_purpose,''));
  v_body text:=coalesce(p_body_text,'');
  v_media text:=lower(btrim(coalesce(p_media_kind,'none')));
  v_source text:=lower(btrim(coalesce(p_source_kind,'manual')));
  v_validation jsonb;
  v_existing public.whatsapp_direct_templates%rowtype;
  v_next_version integer:=1;
  v_changed boolean:=true;
  v_row public.whatsapp_direct_templates%rowtype;
begin
  if v_source not in ('manual','ai_draft','legacy_import','system') then raise exception 'invalid_source_kind'; end if;
  if p_created_by is not null and not exists(
    select 1 from public.admin_users a where a.user_id=p_created_by and a.is_active=true and a.role in ('owner','operator')
  ) then raise exception 'admin_not_authorized'; end if;
  if p_strategy_brief_id is not null and not exists(select 1 from public.marketing_strategy_briefs where id=p_strategy_brief_id) then raise exception 'strategy_brief_not_found'; end if;
  if p_creative_asset_id is not null and not exists(select 1 from public.marketing_assets where id=p_creative_asset_id) then raise exception 'creative_asset_not_found'; end if;

  v_validation:=public.validate_whatsapp_template_draft_v1(v_key,v_body,v_category,v_language,coalesce(p_buttons,'[]'::jsonb),v_media);
  if coalesce((v_validation->>'valid')::boolean,false)=false then
    return jsonb_build_object('ok',false,'error','template_validation_failed','validation',v_validation,'external_side_effect',false);
  end if;

  select * into v_existing from public.whatsapp_direct_templates where template_key=v_key;
  if found then
    v_changed:=(
      coalesce(v_existing.meta_template_name,'') is distinct from coalesce(nullif(btrim(coalesce(p_meta_template_name,'')),''),'')
      or v_existing.category is distinct from v_category
      or v_existing.language_code is distinct from v_language
      or v_existing.purpose is distinct from v_purpose
      or v_existing.body_text is distinct from v_body
      or v_existing.media_kind is distinct from v_media
      or coalesce(v_existing.media_url,'') is distinct from coalesce(nullif(btrim(coalesce(p_media_url,'')),''),'')
      or v_existing.buttons is distinct from coalesce(p_buttons,'[]'::jsonb)
      or coalesce(v_existing.strategy_key,'') is distinct from coalesce(btrim(coalesce(p_strategy_key,'')),'')
      or v_existing.strategy_brief_id is distinct from p_strategy_brief_id
      or v_existing.creative_asset_id is distinct from p_creative_asset_id
      or coalesce(v_existing.notes,'') is distinct from coalesce(p_notes,'')
    );
    v_next_version:=case when v_changed then v_existing.current_version+1 else v_existing.current_version end;
  end if;

  insert into public.whatsapp_direct_templates(
    template_key,meta_template_name,category,language_code,purpose,body_text,media_kind,media_url,buttons,
    enabled,meta_status,current_version,local_status,strategy_key,strategy_brief_id,creative_asset_id,
    variable_schema,validation_status,validation_report,source_kind,ai_generated,notes,last_validated_at,created_by,updated_at
  )
  values(
    v_key,nullif(btrim(coalesce(p_meta_template_name,'')),''),v_category,v_language,v_purpose,v_body,v_media,
    nullif(btrim(coalesce(p_media_url,'')),''),coalesce(p_buttons,'[]'::jsonb),
    false,'not_submitted',v_next_version,'draft',nullif(btrim(coalesce(p_strategy_key,'')),''),
    p_strategy_brief_id,p_creative_asset_id,coalesce(v_validation->'variable_schema','{}'::jsonb),
    coalesce(v_validation->>'status','pending'),v_validation,v_source,coalesce(p_ai_generated,false),
    nullif(btrim(coalesce(p_notes,'')),''),now(),p_created_by,now()
  )
  on conflict(template_key) do update set
    meta_template_name=excluded.meta_template_name,
    category=excluded.category,
    language_code=excluded.language_code,
    purpose=excluded.purpose,
    body_text=excluded.body_text,
    media_kind=excluded.media_kind,
    media_url=excluded.media_url,
    buttons=excluded.buttons,
    enabled=false,
    meta_status=case when v_changed then 'not_submitted' else public.whatsapp_direct_templates.meta_status end,
    current_version=v_next_version,
    local_status='draft',
    strategy_key=excluded.strategy_key,
    strategy_brief_id=excluded.strategy_brief_id,
    creative_asset_id=excluded.creative_asset_id,
    variable_schema=excluded.variable_schema,
    validation_status=excluded.validation_status,
    validation_report=excluded.validation_report,
    source_kind=excluded.source_kind,
    ai_generated=excluded.ai_generated,
    notes=excluded.notes,
    last_validated_at=now(),
    created_by=coalesce(public.whatsapp_direct_templates.created_by,excluded.created_by),
    updated_at=now()
  returning * into v_row;

  if v_changed or not exists(select 1 from public.whatsapp_direct_template_versions where template_key=v_key and version=v_next_version) then
    insert into public.whatsapp_direct_template_versions(
      template_key,version,body_text,category,language_code,media_kind,media_url,buttons,components,purpose,
      source,meta_status,meta_template_id,provider_snapshot,created_by,updated_at,
      local_status,strategy_key,strategy_brief_id,creative_asset_id,variable_schema,validation_status,
      validation_report,source_kind,ai_generated,notes,change_note
    )
    values(
      v_key,v_next_version,v_body,v_category,v_language,v_media,nullif(btrim(coalesce(p_media_url,'')),''),coalesce(p_buttons,'[]'::jsonb),
      '[]'::jsonb,v_purpose,v_source,'not_submitted',null,'{}'::jsonb,p_created_by,now(),
      'draft',nullif(btrim(coalesce(p_strategy_key,'')),''),p_strategy_brief_id,p_creative_asset_id,
      coalesce(v_validation->'variable_schema','{}'::jsonb),coalesce(v_validation->>'status','pending'),
      v_validation,v_source,coalesce(p_ai_generated,false),nullif(btrim(coalesce(p_notes,'')),''),
      nullif(btrim(coalesce(p_change_note,'')),'')
    )
    on conflict(template_key,version) do update set
      body_text=excluded.body_text,category=excluded.category,language_code=excluded.language_code,
      media_kind=excluded.media_kind,media_url=excluded.media_url,buttons=excluded.buttons,purpose=excluded.purpose,
      strategy_key=excluded.strategy_key,strategy_brief_id=excluded.strategy_brief_id,creative_asset_id=excluded.creative_asset_id,
      variable_schema=excluded.variable_schema,validation_status=excluded.validation_status,validation_report=excluded.validation_report,
      source_kind=excluded.source_kind,ai_generated=excluded.ai_generated,notes=excluded.notes,change_note=excluded.change_note,updated_at=now();
  end if;

  return jsonb_build_object(
    'ok',true,'template',to_jsonb(v_row),'version',v_next_version,'version_created',v_changed,
    'validation',v_validation,'meta_submission_performed',false,'external_side_effect',false,'assistant_version','cm1.13-v1'
  );
end;
$fn$;

revoke all on function public.save_whatsapp_template_draft_v1(text,text,text,text,text,text,text,text,jsonb,text,uuid,uuid,text,text,boolean,text,uuid)
from public,anon,authenticated;
grant execute on function public.save_whatsapp_template_draft_v1(text,text,text,text,text,text,text,text,jsonb,text,uuid,uuid,text,text,boolean,text,uuid)
to service_role;

create or replace function public.whatsapp_template_draft_summary_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $fn$
select jsonb_build_object(
  'version','cm1.13-v1',
  'templates',(select count(*) from public.whatsapp_direct_templates where local_status<>'archived'),
  'drafts',(select count(*) from public.whatsapp_direct_templates where local_status='draft'),
  'ready_for_submit',(select count(*) from public.whatsapp_direct_templates where local_status='ready_for_submit'),
  'valid',(select count(*) from public.whatsapp_direct_templates where validation_status='valid'),
  'warnings',(select count(*) from public.whatsapp_direct_templates where validation_status='warning'),
  'invalid',(select count(*) from public.whatsapp_direct_templates where validation_status='invalid'),
  'ai_generated',(select count(*) from public.whatsapp_direct_templates where ai_generated),
  'submitted_or_known_meta',(select count(*) from public.whatsapp_direct_templates where meta_status not in ('not_configured','not_submitted')),
  'external_side_effect',false
)
$fn$;

revoke all on function public.whatsapp_template_draft_summary_v1() from public,anon,authenticated;
grant execute on function public.whatsapp_template_draft_summary_v1() to service_role;

with validations as (
  select t.template_key,
         public.validate_whatsapp_template_draft_v1(t.template_key,t.body_text,t.category,t.language_code,t.buttons,t.media_kind) report
  from public.whatsapp_direct_templates t
  where t.local_status<>'archived'
)
update public.whatsapp_direct_templates t
set validation_report=v.report,
    validation_status=v.report->>'status',
    variable_schema=coalesce(v.report->'variable_schema','{}'::jsonb),
    last_validated_at=now(),
    local_status='draft',
    source_kind=case when t.source_kind='manual' then 'legacy_import' else t.source_kind end,
    updated_at=now()
from validations v
where v.template_key=t.template_key;

update public.marketing_runtime_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'template_draft_assistant_version','cm1.13-v1',
  'template_manual_enabled',true,
  'template_ai_enabled',false,
  'template_ai_max_daily_calls',0,
  'template_ai_max_output_tokens',700,
  'template_ai_reasoning_effort','low',
  'template_ai_model_task','whatsapp_template_copy',
  'template_submit_enabled',false,
  'template_auto_submit_enabled',false,
  'template_external_side_effect',false
),
updated_at=now()
where id=1;
