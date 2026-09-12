alter table public.products
  add column if not exists image_ai_cost_usd numeric(12,6);

alter table public.product_image_jobs
  add column if not exists estimated_cost_usd numeric(12,6);

comment on column public.products.image_ai_cost_usd is 'Estimated OpenAI image edit cost in USD for the latest successful product image generation.';
comment on column public.product_image_jobs.estimated_cost_usd is 'Estimated OpenAI cost in USD calculated from returned token usage and published GPT Image 2.5 token rates.';