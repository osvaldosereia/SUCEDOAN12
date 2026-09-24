-- R39 · Emissão fiscal humana normal após canário aprovado
-- Ativa apenas quando existe evidência auditável de canário fiscal aprovado.

alter table public.fiscal_runtime_config
  add column if not exists dispatch_fiscal_human_issue_enabled boolean not null default false;

update public.fiscal_runtime_config cfg
set dispatch_fiscal_human_issue_enabled=true,
    updated_at=now()
where cfg.id=1
  and cfg.dispatch_gate_mode='enforce'
  and exists (
    select 1
    from public.bling_hub_audit_v2 a
    where a.domain='fiscal'
      and a.event_type='dispatch_fiscal_canary_passed'
  );

comment on column public.fiscal_runtime_config.dispatch_fiscal_human_issue_enabled is
'Permite emissão fiscal humana, um pedido por vez, somente após canário fiscal aprovado e gate de expedição em enforce.';
