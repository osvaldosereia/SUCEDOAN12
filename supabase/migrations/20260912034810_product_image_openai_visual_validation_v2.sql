alter table public.products
  add column if not exists image_ai_validation jsonb,
  add column if not exists image_ai_validation_cost_usd numeric(12,6);

alter table public.product_image_jobs
  add column if not exists validation jsonb not null default '{}'::jsonb,
  add column if not exists validation_usage jsonb not null default '{}'::jsonb,
  add column if not exists generation_cost_usd numeric(12,6),
  add column if not exists validation_cost_usd numeric(12,6);

create or replace function public.set_product_image_job_cost_v1()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_image_in numeric:=0;
  v_text_in numeric:=0;
  v_image_out numeric:=0;
  v_gen numeric:=0;
  v_val_in numeric:=0;
  v_val_out numeric:=0;
  v_val_cached numeric:=0;
  v_val_cache_write numeric:=0;
  v_val_regular numeric:=0;
  v_val numeric:=0;
begin
  v_image_in:=coalesce((new.openai_usage#>>'{input_tokens_details,image_tokens}')::numeric,0);
  v_text_in:=coalesce((new.openai_usage#>>'{input_tokens_details,text_tokens}')::numeric,0);
  v_image_out:=coalesce((new.openai_usage#>>'{output_tokens_details,image_tokens}')::numeric,0);
  v_gen:=round(((v_image_in*8)+(v_text_in*5)+(v_image_out*30))/1000000,6);

  v_val_in:=coalesce((new.validation_usage->>'input_tokens')::numeric,0);
  v_val_out:=coalesce((new.validation_usage->>'output_tokens')::numeric,0);
  v_val_cached:=coalesce((new.validation_usage#>>'{input_tokens_details,cached_tokens}')::numeric,0);
  v_val_cache_write:=coalesce((new.validation_usage#>>'{input_tokens_details,cache_write_tokens}')::numeric,0);
  v_val_regular:=greatest(v_val_in-v_val_cached-v_val_cache_write,0);
  v_val:=round(((v_val_regular*0.20)+(v_val_cached*0.02)+(v_val_cache_write*0.25)+(v_val_out*1.20))/1000000,6);

  new.generation_cost_usd:=v_gen;
  new.validation_cost_usd:=v_val;
  new.estimated_cost_usd:=round(v_gen+v_val,6);
  new.updated_at:=now();
  return new;
end;
$$;

drop trigger if exists trg_product_image_job_cost_v1 on public.product_image_jobs;
create trigger trg_product_image_job_cost_v1
before insert or update of openai_usage,validation_usage,status on public.product_image_jobs
for each row execute function public.set_product_image_job_cost_v1();

create or replace function public.sync_product_image_job_cost_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status='completed' and new.estimated_cost_usd is not null then
    update public.products
       set image_ai_cost_usd=new.estimated_cost_usd,
           image_ai_validation_cost_usd=new.validation_cost_usd,
           image_ai_validation=case when new.validation='{}'::jsonb then image_ai_validation else new.validation end
     where id=new.product_id;
  end if;
  return new;
end;
$$;

revoke all on function public.set_product_image_job_cost_v1() from public,anon,authenticated;
revoke all on function public.sync_product_image_job_cost_v1() from public,anon,authenticated;

update public.product_image_jobs set openai_usage=openai_usage where status='completed';