-- Dona Antônia Admin V3: histórico e evolução da estratégia de atendimento.
-- Não ativa o worker e não altera regras existentes.

create table if not exists public.service_strategy_analysis_snapshots (
  id uuid primary key default gen_random_uuid(),
  window_started_at timestamptz not null,
  window_ended_at timestamptz not null,
  window_days smallint not null default 7 check (window_days between 1 and 30),
  metrics jsonb not null default '{}'::jsonb,
  findings jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  analysis_note text null,
  source text not null default 'admin_v3',
  created_by uuid null,
  created_at timestamptz not null default now()
);

create index if not exists service_strategy_analysis_snapshots_created_idx
  on public.service_strategy_analysis_snapshots(created_at desc);

alter table public.service_strategy_analysis_snapshots enable row level security;
revoke all on table public.service_strategy_analysis_snapshots from public, anon, authenticated;
grant select, insert, update on table public.service_strategy_analysis_snapshots to service_role;

create table if not exists public.service_strategy_change_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE','ANNOTATION','BASELINE')),
  before_data jsonb null,
  after_data jsonb null,
  source text not null default 'db_trigger',
  reason text null,
  expected_result text null,
  observed_result text null,
  review_status text not null default 'pending' check (review_status in ('pending','kept','adjusted','reverted','baseline')),
  analysis_snapshot_id uuid null references public.service_strategy_analysis_snapshots(id) on delete set null,
  changed_by uuid null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz null
);

create index if not exists service_strategy_change_log_created_idx
  on public.service_strategy_change_log(created_at desc);
create index if not exists service_strategy_change_log_entity_idx
  on public.service_strategy_change_log(entity_type, entity_id, created_at desc);

alter table public.service_strategy_change_log enable row level security;
revoke all on table public.service_strategy_change_log from public, anon, authenticated;
grant select, insert, update on table public.service_strategy_change_log to service_role;

create or replace function public.audit_service_strategy_change_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_entity_id text;
  v_changed_by uuid;
begin
  if tg_op='DELETE' then
    v_entity_id:=coalesce(old.id::text,'');
    if tg_table_name='service_simple_rules' then v_changed_by:=old.updated_by; end if;
    insert into public.service_strategy_change_log(entity_type,entity_id,operation,before_data,after_data,source,changed_by)
    values(tg_table_name,v_entity_id,tg_op,to_jsonb(old),null,'db_trigger',v_changed_by);
    return old;
  end if;

  v_entity_id:=coalesce(new.id::text,'');
  if tg_table_name='service_simple_rules' then v_changed_by:=new.updated_by; end if;

  if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then
    return new;
  end if;

  insert into public.service_strategy_change_log(entity_type,entity_id,operation,before_data,after_data,source,changed_by)
  values(
    tg_table_name,
    v_entity_id,
    tg_op,
    case when tg_op='UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new),
    'db_trigger',
    v_changed_by
  );
  return new;
end;
$$;

revoke all on function public.audit_service_strategy_change_v1() from public, anon, authenticated;
grant execute on function public.audit_service_strategy_change_v1() to service_role;

drop trigger if exists trg_audit_service_simple_rules_strategy_v1 on public.service_simple_rules;
create trigger trg_audit_service_simple_rules_strategy_v1
after insert or update or delete on public.service_simple_rules
for each row execute function public.audit_service_strategy_change_v1();

drop trigger if exists trg_audit_service_simple_runtime_strategy_v1 on public.service_simple_runtime_config;
create trigger trg_audit_service_simple_runtime_strategy_v1
after update on public.service_simple_runtime_config
for each row execute function public.audit_service_strategy_change_v1();

create or replace function public.get_service_strategy_7d_metrics_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_since timestamptz:=now()-interval '7 days';
  v_conversations bigint:=0;
  v_inbound bigint:=0;
  v_outbound bigint:=0;
  v_automated bigint:=0;
  v_handoffs bigint:=0;
  v_uncovered bigint:=0;
  v_action_counts jsonb:='{}'::jsonb;
  v_handoff_reasons jsonb:='{}'::jsonb;
  v_uncovered_samples jsonb:='[]'::jsonb;
  v_rules jsonb:='{}'::jsonb;
  v_runtime jsonb:='{}'::jsonb;
begin
  select count(*) into v_conversations
  from public.conversations c
  where coalesce(c.last_inbound_at,c.opened_at,c.created_at)>=v_since;

  select
    count(*) filter(where m.direction='inbound'),
    count(*) filter(where m.direction='outbound'),
    count(*) filter(
      where m.direction='outbound'
        and (coalesce(m.ai_interpretation->>'source','')='simple_ai'
          or coalesce(m.raw_event->>'simple_ai','')='true')
    )
  into v_inbound,v_outbound,v_automated
  from public.messages m
  where m.created_at>=v_since;

  select count(*) into v_handoffs
  from public.human_handoffs h
  where h.created_at>=v_since
    and coalesce(h.reason,'') not in ('live_canary_human_control','observe_homologation_allowlist');

  select count(*) into v_uncovered
  from public.human_handoffs h
  where h.created_at>=v_since and h.reason='simple_rule_not_found';

  select coalesce(jsonb_object_agg(x.action_type,x.total),'{}'::jsonb)
  into v_action_counts
  from (
    select e.action_type,count(*)::bigint total
    from public.whatsapp_sales_action_events e
    where e.created_at>=v_since and e.action_type like 'simple_%'
    group by e.action_type
    order by count(*) desc
  ) x;

  select coalesce(jsonb_object_agg(x.reason,x.total),'{}'::jsonb)
  into v_handoff_reasons
  from (
    select coalesce(h.reason,'unknown') reason,count(*)::bigint total
    from public.human_handoffs h
    where h.created_at>=v_since
      and coalesce(h.reason,'') not in ('live_canary_human_control','observe_homologation_allowlist')
    group by coalesce(h.reason,'unknown')
    order by count(*) desc
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.total desc,x.last_seen desc),'[]'::jsonb)
  into v_uncovered_samples
  from (
    select
      left(coalesce(nullif(trim(m.body_text),''),nullif(trim(m.transcript),''),'Mensagem sem texto'),300) sample,
      count(*)::bigint total,
      max(h.created_at) last_seen
    from public.human_handoffs h
    left join public.messages m on m.id=h.source_message_id
    where h.created_at>=v_since and h.reason='simple_rule_not_found'
    group by left(coalesce(nullif(trim(m.body_text),''),nullif(trim(m.transcript),''),'Mensagem sem texto'),300)
    order by count(*) desc,max(h.created_at) desc
    limit 20
  ) x;

  select jsonb_build_object(
    'total',count(*),
    'published',count(*) filter(where r.status='published'),
    'draft',count(*) filter(where r.status='draft'),
    'archived',count(*) filter(where r.status='archived')
  ) into v_rules
  from public.service_simple_rules r;

  select jsonb_build_object(
    'service_simple',coalesce((select to_jsonb(s) from public.service_simple_runtime_config s where s.id=1),'{}'::jsonb),
    'automation',coalesce((select jsonb_build_object(
      'automation_enabled',a.automation_enabled,
      'ai_enabled',a.ai_enabled,
      'conversation_worker_enabled',a.conversation_worker_enabled,
      'conversation_worker_dispatch_enabled',a.conversation_worker_dispatch_enabled,
      'whatsapp_sales_mvp_enabled',a.whatsapp_sales_mvp_enabled,
      'whatsapp_auto_reply_enabled',a.whatsapp_auto_reply_enabled,
      'whatsapp_sales_interactive_enabled',a.whatsapp_sales_interactive_enabled,
      'updated_at',a.updated_at
    ) from public.automation_config a where a.id=1),'{}'::jsonb)
  ) into v_runtime;

  return jsonb_build_object(
    'window_started_at',v_since,
    'window_ended_at',now(),
    'window_days',7,
    'conversations',v_conversations,
    'messages_inbound',coalesce(v_inbound,0),
    'messages_outbound',coalesce(v_outbound,0),
    'automated_replies',coalesce(v_automated,0),
    'human_handoffs',coalesce(v_handoffs,0),
    'uncovered_intents',coalesce(v_uncovered,0),
    'coverage_ratio',case when coalesce(v_inbound,0)>0 then round((coalesce(v_automated,0)::numeric/coalesce(v_inbound,1)::numeric),4) else 0 end,
    'simple_action_counts',v_action_counts,
    'handoff_reasons',v_handoff_reasons,
    'uncovered_samples',v_uncovered_samples,
    'rules',v_rules,
    'runtime',v_runtime
  );
end;
$$;

revoke all on function public.get_service_strategy_7d_metrics_v1() from public, anon, authenticated;
grant execute on function public.get_service_strategy_7d_metrics_v1() to service_role;

create or replace function public.annotate_latest_service_strategy_change_v1(
  p_entity_type text,
  p_entity_id text,
  p_reason text default null,
  p_expected_result text default null,
  p_source text default 'admin_v3'
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
begin
  select c.id into v_id
  from public.service_strategy_change_log c
  where c.entity_type=left(coalesce(p_entity_type,''),120)
    and c.entity_id=left(coalesce(p_entity_id,''),160)
  order by c.created_at desc
  limit 1;

  if v_id is null then return null; end if;

  update public.service_strategy_change_log
  set reason=nullif(left(coalesce(p_reason,''),2000),''),
      expected_result=nullif(left(coalesce(p_expected_result,''),2000),''),
      source=coalesce(nullif(left(coalesce(p_source,''),80),''),source)
  where id=v_id;
  return v_id;
end;
$$;

revoke all on function public.annotate_latest_service_strategy_change_v1(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.annotate_latest_service_strategy_change_v1(text,text,text,text,text) to service_role;
