create or replace function public.set_product_image_job_cost_v1()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_image_in numeric:=0;
  v_text_in numeric:=0;
  v_image_out numeric:=0;
begin
  v_image_in:=coalesce((new.openai_usage#>>'{input_tokens_details,image_tokens}')::numeric,0);
  v_text_in:=coalesce((new.openai_usage#>>'{input_tokens_details,text_tokens}')::numeric,0);
  v_image_out:=coalesce((new.openai_usage#>>'{output_tokens_details,image_tokens}')::numeric,0);
  if v_image_in>0 or v_text_in>0 or v_image_out>0 then
    new.estimated_cost_usd:=round(((v_image_in*8)+(v_text_in*5)+(v_image_out*30))/1000000,6);
  end if;
  new.updated_at:=now();
  return new;
end;
$$;

drop trigger if exists trg_product_image_job_cost_v1 on public.product_image_jobs;
create trigger trg_product_image_job_cost_v1
before insert or update of openai_usage,status on public.product_image_jobs
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
       set image_ai_cost_usd=new.estimated_cost_usd
     where id=new.product_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_product_image_job_cost_sync_v1 on public.product_image_jobs;
create trigger trg_product_image_job_cost_sync_v1
after insert or update of status,estimated_cost_usd on public.product_image_jobs
for each row execute function public.sync_product_image_job_cost_v1();

revoke all on function public.set_product_image_job_cost_v1() from public,anon,authenticated;
revoke all on function public.sync_product_image_job_cost_v1() from public,anon,authenticated;

update public.product_image_jobs
set openai_usage=openai_usage
where status='completed' and estimated_cost_usd is null;