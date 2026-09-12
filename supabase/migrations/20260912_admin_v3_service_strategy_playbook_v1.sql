-- Dona Antônia Admin V3: Estratégia permanente de análise do atendimento.
-- Este playbook é a memória operacional da evolução: descreve como analisar os últimos 7 dias,
-- decidir mudanças e comparar resultados sem permitir alterações automáticas de estratégia.

create table if not exists public.service_strategy_playbook (
  id smallint primary key default 1 check (id=1),
  version integer not null default 1 check (version>=1),
  title text not null default 'Estratégia permanente de evolução do atendimento',
  strategy_text text not null,
  analysis_method jsonb not null default '{}'::jsonb,
  success_metrics jsonb not null default '{}'::jsonb,
  constraints jsonb not null default '{}'::jsonb,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.service_strategy_playbook enable row level security;
revoke all on table public.service_strategy_playbook from public, anon, authenticated;
grant select, insert, update on table public.service_strategy_playbook to service_role;

insert into public.service_strategy_playbook(
  id,version,title,strategy_text,analysis_method,success_metrics,constraints,updated_at
)
values(
  1,
  1,
  'Estratégia permanente de evolução do atendimento',
  'Analisar sempre os últimos 7 dias de conversas reais. Identificar dúvidas recorrentes, falhas de cobertura, repasses para humano, erros de ferramenta e atritos no funil. Comparar o comportamento observado com as regras publicadas. Propor no máximo 5 ajustes por rodada, priorizando alto impacto, baixa complexidade e baixo risco. Registrar motivo e resultado esperado antes de cada ajuste. Na rodada seguinte, comparar o resultado observado com o snapshot anterior e classificar a mudança como manter, ajustar novamente ou reverter. Nunca alterar a estratégia automaticamente e nunca ativar o motor de atendimento sem homologação controlada.',
  jsonb_build_object(
    'window_days',7,
    'steps',jsonb_build_array(
      'Ler as conversas e mensagens reais dos últimos 7 dias',
      'Separar dúvidas recorrentes, falhas operacionais, fallback e repasses humanos',
      'Agrupar mensagens semanticamente semelhantes por intenção',
      'Comparar as intenções com as regras publicadas e recursos disponíveis',
      'Propor no máximo 5 ajustes por rodada',
      'Registrar motivo e resultado esperado antes da mudança',
      'Gerar novo snapshot e comparar antes/depois na rodada seguinte',
      'Manter, ajustar novamente ou reverter conforme o resultado observado'
    ),
    'prioritization',jsonb_build_array('recorrência','impacto comercial','redução de atrito','segurança','custo de IA'),
    'auto_apply',false
  ),
  jsonb_build_object(
    'coverage_ratio','percentual de mensagens elegíveis atendidas pelo motor simples',
    'uncovered_intents','intenções sem orientação cadastrada',
    'human_handoffs','repasses humanos operacionais excluindo canários/homologação',
    'automated_replies','respostas automáticas efetivamente registradas',
    'flow_usage','uso do Flow de cestas e outros recursos comerciais',
    'error_reasons','falhas de despacho, ferramenta ou integração'
  ),
  jsonb_build_object(
    'max_changes_per_round',5,
    'automatic_strategy_changes',false,
    'automatic_runtime_activation',false,
    'preserve_simple_engine',true,
    'admin_surface','admin-v3',
    'sensitive_history_requires_protected_session',true
  ),
  now()
)
on conflict(id) do update set
  version=greatest(public.service_strategy_playbook.version,excluded.version),
  title=excluded.title,
  strategy_text=excluded.strategy_text,
  analysis_method=excluded.analysis_method,
  success_metrics=excluded.success_metrics,
  constraints=excluded.constraints,
  updated_at=now();

drop trigger if exists trg_audit_service_strategy_playbook_v1 on public.service_strategy_playbook;
create trigger trg_audit_service_strategy_playbook_v1
after update on public.service_strategy_playbook
for each row execute function public.audit_service_strategy_change_v1();
