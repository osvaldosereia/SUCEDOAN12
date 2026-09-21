begin;

alter table public.papoai_commerce_turns
  add column if not exists provider_event_key text,
  add column if not exists external_message_id text,
  add column if not exists external_event_id text,
  add column if not exists response_body jsonb,
  add column if not exists ai_used boolean not null default false,
  add column if not exists planner_source text not null default 'deterministic';

create unique index if not exists papoai_commerce_turns_provider_event_uidx
  on public.papoai_commerce_turns(adapter_id,provider_event_key)
  where provider_event_key is not null;

commit;
