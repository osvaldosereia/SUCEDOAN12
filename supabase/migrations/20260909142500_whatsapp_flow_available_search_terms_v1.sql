begin;

-- Forward-only WhatsApp Flows cannot safely send the customer to a product
-- selector with zero options. Surface only segmented searches that currently
-- resolve to at least one sellable product in the deterministic backend.
create or replace function public.get_whatsapp_flow_search_terms_v1(p_section_key text)
returns table(term_key text, term_title text, search_query text, sort_order integer)
language sql
stable
security definer
set search_path=''
as $$
  select t.term_key,t.term_title,t.search_query,t.sort_order
  from public.whatsapp_flow_search_terms t
  where t.enabled=true
    and t.section_key=lower(trim(coalesce(p_section_key,'')))
    and exists (
      select 1
      from public.search_whatsapp_sellable_products_v1(t.search_query,1) p
      where p.id is not null
    )
  order by t.sort_order,t.term_title
$$;

revoke all on function public.get_whatsapp_flow_search_terms_v1(text) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_search_terms_v1(text) to service_role;

-- Likewise, do not show a macro section when all of its configured search
-- terms are temporarily unavailable. Direct search remains available in the
-- Flow independently of this list.
create or replace function public.get_whatsapp_flow_sections_v1()
returns table(section_key text, section_title text, sort_order integer, term_count bigint)
language sql
stable
security definer
set search_path=''
as $$
  select t.section_key,min(t.section_title),min(t.sort_order),count(*)
  from public.whatsapp_flow_search_terms t
  where t.enabled=true
    and exists (
      select 1
      from public.search_whatsapp_sellable_products_v1(t.search_query,1) p
      where p.id is not null
    )
  group by t.section_key
  order by min(t.sort_order),min(t.section_title)
$$;

revoke all on function public.get_whatsapp_flow_sections_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_sections_v1() to service_role;

commit;
