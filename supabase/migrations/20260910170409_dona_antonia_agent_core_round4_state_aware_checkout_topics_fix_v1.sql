create or replace function public.resolve_whatsapp_agent_core_topic_v2(
  p_message text,
  p_stage text default null,
  p_awaiting text default null
)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  v_awaiting text := lower(trim(coalesce(p_awaiting,'')));
  v_base text;
begin
  v_base := public.classify_whatsapp_service_topic_v1(p_message,p_stage);
  if v_awaiting='basket_payment_selection' then return 'payment'; end if;
  if v_awaiting in ('basket_final_confirmation','basket_customer_base_data','order_customer_base_data','basket_address_flow','basket_locator_confirmation','order_locator_confirmation') then return 'checkout'; end if;
  if v_awaiting='basket_post_storefront' then return 'basket'; end if;
  return v_base;
end
$$;

revoke all on function public.resolve_whatsapp_agent_core_topic_v2(text,text,text) from public,anon,authenticated;
grant execute on function public.resolve_whatsapp_agent_core_topic_v2(text,text,text) to service_role;