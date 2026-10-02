-- Dona Antônia — cache local de templates do Atendimento.
-- Não sincroniza PapoAI/Meta. Apenas registra templates já verificados manualmente.

alter table public.whatsapp_templates_v1
  alter column waba_id drop not null;

create unique index if not exists whatsapp_templates_account_name_language_uidx
  on public.whatsapp_templates_v1(whatsapp_account_id,name,language)
  where whatsapp_account_id is not null;

insert into public.whatsapp_templates_v1(
  whatsapp_account_id,waba_id,meta_template_id,name,language,category,status,components,last_synced_at,metadata
)
values
(
  '308660df-72a0-4e23-b3e9-b36d7307bb20'::uuid,
  null,
  null,
  'pedidoorganizadosite0975v1',
  'pt_BR',
  'UTILITY',
  'ACTIVE',
  '[]'::jsonb,
  null,
  '{"source":"papoai_verified_manual","content_verified":false,"attendance":{"show":false,"channel":"0975"}}'::jsonb
),
(
  '230cd673-ded4-4514-8245-58804a1b044b'::uuid,
  '840102181903253',
  null,
  'pedidoorganizadosite1018v1',
  'pt_BR',
  'UTILITY',
  'ACTIVE',
  '[]'::jsonb,
  null,
  '{"source":"papoai_verified_manual","content_verified":false,"attendance":{"show":false,"channel":"1018"}}'::jsonb
)
on conflict (whatsapp_account_id,name,language) where whatsapp_account_id is not null
do update set
  category=excluded.category,
  status=excluded.status,
  metadata=public.whatsapp_templates_v1.metadata || excluded.metadata,
  updated_at=now();

alter table public.whatsapp_templates_v1 enable row level security;
revoke all on table public.whatsapp_templates_v1 from public,anon,authenticated;
grant all on table public.whatsapp_templates_v1 to service_role;
