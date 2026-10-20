-- Persist the admin review lifecycle for existing product suggestions.
alter table public.oscb_product_research_v1
  add column if not exists review_state text not null default 'pending'
    check (review_state in ('pending','reviewed')),
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id);

create index if not exists oscb_product_research_review_queue_v1
  on public.oscb_product_research_v1 (review_state, updated_at desc);
