-- R37 · Isolamento do canário fiscal pré-expedição
-- Mantém o módulo fiscal legado desligado e cria um gate dedicado para o canário novo.

alter table public.fiscal_runtime_config
  add column if not exists dispatch_fiscal_canary_enabled boolean not null default false,
  add column if not exists dispatch_fiscal_canary_armed_at timestamptz null;

update public.fiscal_runtime_config
set dispatch_fiscal_canary_enabled=false,
    dispatch_fiscal_canary_armed_at=null,
    dispatch_invoice_generate_enabled=false,
    dispatch_invoice_authorize_enabled=false,
    dispatch_invoice_canary_source_order_id=null,
    updated_at=now()
where id=1
  and dispatch_fiscal_canary_enabled is distinct from false;

comment on column public.fiscal_runtime_config.dispatch_fiscal_canary_enabled is
'Gate mestre exclusivo do canário fiscal pré-expedição. Não depende de fiscal_runtime_config.enabled.';

comment on column public.fiscal_runtime_config.dispatch_fiscal_canary_armed_at is
'Momento em que o canário fiscal pré-expedição foi armado de forma explícita.';
