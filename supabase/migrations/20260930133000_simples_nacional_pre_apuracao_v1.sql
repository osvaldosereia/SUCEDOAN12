-- Dona Antonia · Simples Nacional pre-apuracao v1
-- Server-only homologation model. No PGDAS/DAS/payment side effects.

create table if not exists public.simples_rule_sets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  annex_code text not null default 'I',
  effective_from date not null,
  effective_to date,
  status text not null default 'draft' check (status in ('draft','active','retired')),
  brackets jsonb not null default '[]'::jsonb,
  tax_shares jsonb not null default '{}'::jsonb,
  legal_basis jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.simples_tax_classification_rules (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null references public.simples_rule_sets(id) on delete restrict,
  code text not null,
  version integer not null default 1 check (version > 0),
  tax_bucket text not null check (tax_bucket in ('normal_resale','icms_st','monophase','cancellation','return','manual_review')),
  application_mode text not null default 'manual_only' check (application_mode in ('strict_auto','manual_only')),
  effective_from date not null,
  effective_to date,
  match_criteria jsonb not null default '{}'::jsonb,
  required_evidence jsonb not null default '{}'::jsonb,
  legal_basis jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','active','retired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code, version),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.simples_periods (
  id uuid primary key default gen_random_uuid(),
  competence_month date not null check (date_trunc('month', competence_month)::date = competence_month),
  version integer not null default 1 check (version > 0),
  status text not null default 'draft' check (status in ('draft','review_required','ready','locked','superseded')),
  rule_set_id uuid references public.simples_rule_sets(id) on delete restrict,
  collection_status text not null default 'incomplete' check (collection_status in ('complete','incomplete','failed','stale')),
  gross_revenue_month numeric(14,2) not null default 0,
  segregated_revenue jsonb not null default '{}'::jsonb,
  rbt12 numeric(14,2),
  nominal_rate numeric(9,6),
  deduction_amount numeric(14,2),
  effective_rate numeric(9,6),
  estimated_das_amount numeric(14,2),
  blocking_issue_count integer not null default 0 check (blocking_issue_count >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  calculation_memory jsonb not null default '{}'::jsonb,
  input_hash text,
  calculated_at timestamptz,
  locked_at timestamptz,
  locked_by uuid,
  supersedes_period_id uuid references public.simples_periods(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competence_month, version)
);

create table if not exists public.simples_revenue_lines (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.simples_periods(id) on delete cascade,
  source_type text not null,
  source_document_id text,
  access_key text,
  bling_invoice_id bigint,
  order_id uuid references public.orders(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  issued_at timestamptz,
  gross_amount numeric(14,2) not null default 0,
  recognized_amount numeric(14,2) not null default 0,
  tax_bucket text not null default 'manual_review' check (tax_bucket in ('normal_resale','icms_st','monophase','cancellation','return','manual_review')),
  classification_status text not null default 'manual_review' check (classification_status in ('classified','manual_review','blocked')),
  classification_rule_id uuid references public.simples_tax_classification_rules(id) on delete set null,
  classification_rule_version integer,
  confidence numeric(5,4),
  evidence jsonb not null default '{}'::jsonb,
  blocking_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (access_key is null or access_key ~ '^[0-9]{44}$')
);

create table if not exists public.simples_reconciliation_issues (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.simples_periods(id) on delete cascade,
  issue_type text not null check (issue_type in (
    'order_without_invoice','invoice_without_order','cancel_status_mismatch','return_status_mismatch',
    'product_without_fiscal_profile','st_unresolved','monophase_unresolved','document_value_mismatch',
    'duplicated_document','rule_not_effective_for_date','rbt12_history_incomplete','collection_incomplete','other'
  )),
  severity text not null default 'blocking' check (severity in ('blocking','warning')),
  status text not null default 'open' check (status in ('open','resolved','ignored_with_reason')),
  source_document_id text,
  access_key text,
  order_id uuid references public.orders(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  amount numeric(14,2),
  title text not null,
  explanation text not null,
  evidence jsonb not null default '{}'::jsonb,
  resolution jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.simples_validation_runs (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.simples_periods(id) on delete cascade,
  run_kind text not null default 'recalculate' check (run_kind in ('collect','reconcile','recalculate','lock_check','homologation')),
  status text not null check (status in ('running','succeeded','failed','blocked')),
  input_hash text,
  input_summary jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  error_detail text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  actor_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.simples_homologation_checks (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.simples_periods(id) on delete cascade,
  accountant_das_amount numeric(14,2) not null check (accountant_das_amount >= 0),
  accountant_values jsonb not null default '{}'::jsonb,
  system_das_amount numeric(14,2) not null check (system_das_amount >= 0),
  absolute_difference numeric(14,2) not null,
  percentage_difference numeric(12,6),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists simples_rule_sets_effective_idx on public.simples_rule_sets(status,effective_from,effective_to);
create index if not exists simples_tax_rules_effective_idx on public.simples_tax_classification_rules(rule_set_id,status,effective_from,effective_to,tax_bucket);
create index if not exists simples_periods_competence_status_idx on public.simples_periods(competence_month desc,status,version desc);
create index if not exists simples_revenue_lines_period_product_idx on public.simples_revenue_lines(period_id,product_id);
create index if not exists simples_revenue_lines_access_key_idx on public.simples_revenue_lines(access_key) where access_key is not null;
create index if not exists simples_reconciliation_issues_period_status_idx on public.simples_reconciliation_issues(period_id,status,severity);
create index if not exists simples_validation_runs_period_idx on public.simples_validation_runs(period_id,created_at desc);
create index if not exists simples_homologation_checks_period_idx on public.simples_homologation_checks(period_id,created_at desc);

alter table public.simples_rule_sets enable row level security;
alter table public.simples_tax_classification_rules enable row level security;
alter table public.simples_periods enable row level security;
alter table public.simples_revenue_lines enable row level security;
alter table public.simples_reconciliation_issues enable row level security;
alter table public.simples_validation_runs enable row level security;
alter table public.simples_homologation_checks enable row level security;

revoke all on public.simples_rule_sets from anon, authenticated;
revoke all on public.simples_tax_classification_rules from anon, authenticated;
revoke all on public.simples_periods from anon, authenticated;
revoke all on public.simples_revenue_lines from anon, authenticated;
revoke all on public.simples_reconciliation_issues from anon, authenticated;
revoke all on public.simples_validation_runs from anon, authenticated;
revoke all on public.simples_homologation_checks from anon, authenticated;

create or replace function public.get_simples_period_gate_v1(p_period_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with p as (
  select * from public.simples_periods where id=p_period_id
), counts as (
  select
    count(*) filter (where status='open' and severity='blocking')::int as blocking,
    count(*) filter (where status='open' and severity='warning')::int as warnings
  from public.simples_reconciliation_issues
  where period_id=p_period_id
), lines as (
  select count(*) filter (where classification_status <> 'classified')::int as unresolved
  from public.simples_revenue_lines where period_id=p_period_id
), reason_rows as (
  select 'collection_not_complete'::text as reason from p where collection_status <> 'complete'
  union all select 'blocking_issues' from counts where blocking > 0
  union all select 'unresolved_revenue_lines' from lines where unresolved > 0
  union all select 'rbt12_missing' from p where rbt12 is null
  union all select 'rule_set_missing' from p where rule_set_id is null
  union all select 'period_locked' from p where status in ('locked','superseded')
)
select jsonb_build_object(
  'ready', coalesce((select collection_status='complete' and status not in ('locked','superseded') and rule_set_id is not null and rbt12 is not null from p),false)
           and coalesce((select blocking=0 from counts),true)
           and coalesce((select unresolved=0 from lines),true),
  'blocking_issue_count', coalesce((select blocking from counts),0),
  'warning_count', coalesce((select warnings from counts),0),
  'reasons', coalesce((select jsonb_agg(reason order by reason) from reason_rows),'[]'::jsonb)
);
$$;

create or replace function public.guard_simples_locked_snapshot_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op='DELETE' and old.status in ('locked','superseded') then
    raise exception 'simples_locked_snapshot_immutable';
  end if;
  if tg_op='UPDATE' and old.status in ('locked','superseded') then
    if old.status='locked' and new.status='superseded'
       and (to_jsonb(new) - 'status' - 'updated_at') = (to_jsonb(old) - 'status' - 'updated_at') then
      return new;
    end if;
    raise exception 'simples_locked_snapshot_immutable';
  end if;
  return coalesce(new,old);
end;
$$;

drop trigger if exists trg_guard_simples_locked_snapshot_v1 on public.simples_periods;
create trigger trg_guard_simples_locked_snapshot_v1
before update or delete on public.simples_periods
for each row execute function public.guard_simples_locked_snapshot_v1();

revoke all on function public.get_simples_period_gate_v1(uuid) from public, anon, authenticated;
grant execute on function public.get_simples_period_gate_v1(uuid) to service_role;
revoke all on function public.guard_simples_locked_snapshot_v1() from public, anon, authenticated;
