begin;

create or replace function public.is_agent_core_stateless_historical_replay_job_v3(p_job_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  j public.ai_jobs%rowtype;
  c public.conversations%rowtype;
  m public.messages%rowtype;
  v_action text;
  v_msg text;
  v_interactive text;
  v_topic text;
  v_family text;
begin
  select * into j from public.ai_jobs where id=p_job_id;
  if not found then return jsonb_build_object('safe',false,'reason','job_not_found'); end if;
  if j.status<>'done' or j.job_type<>'conversation' then return jsonb_build_object('safe',false,'reason','job_not_replayable'); end if;
  select * into c from public.conversations where id=j.conversation_id;
  if not found then return jsonb_build_object('safe',false,'reason','conversation_not_found'); end if;
  if coalesce(c.automation_cohort,'')<>'homologation' then return jsonb_build_object('safe',false,'reason','not_homologation'); end if;
  if j.created_at>=now()-interval '15 minutes' then return jsonb_build_object('safe',false,'reason','message_not_historical'); end if;
  select * into m from public.messages where id=j.message_id and conversation_id=j.conversation_id;
  if not found then return jsonb_build_object('safe',false,'reason','message_not_found'); end if;

  v_action:=lower(coalesce(j.result->>'action',j.result#>>'{plan,intent}',''));
  v_msg:=coalesce(m.body_text,m.transcript,'');
  v_interactive:=coalesce(m.ai_interpretation->>'id','');
  v_topic:=public.resolve_whatsapp_agent_core_topic_v4(v_msg,'','',v_interactive);

  if v_action='search' and v_topic='product_search' then v_family:='catalog_search';
  elsif v_action in ('show_baskets','basket_list_fallback','basket_choice_flow','whatsapp_flow_baskets') and v_topic='basket' then v_family:='basket_catalog';
  elsif v_action='greeting' and v_topic='greeting' then v_family:='none';
  else
    return jsonb_build_object('safe',false,'reason','historical_semantic_family_mismatch','action',v_action,'resolved_topic',v_topic);
  end if;

  return jsonb_build_object('safe',true,'reason','homologation_semantic_stateless_replay_v3','action',v_action,'resolved_topic',v_topic,'conversation_id',j.conversation_id,'message_id',j.message_id,'allowed_tool_family',v_family);
end
$$;

revoke all on function public.is_agent_core_stateless_historical_replay_job_v3(uuid) from public,anon,authenticated;
grant execute on function public.is_agent_core_stateless_historical_replay_job_v3(uuid) to service_role;

create or replace function public.canonicalize_whatsapp_product_query_v2(p_message text)
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v jsonb:=public.match_whatsapp_product_vocabulary_v1(p_message);
  q text;
begin
  if coalesce((v->>'matched')::boolean,false) then return left(coalesce(v->>'search_query',''),120); end if;
  q:=public.canonicalize_whatsapp_product_query_v1(p_message);
  q:=regexp_replace(q,'\\s+(voce|voces|vc|vcs)\\s+(tem|temos|vendem|vende)$','','g');
  q:=regexp_replace(q,'\\s+(tem|vende)\\s+(ai|disponivel)$','','g');
  return left(trim(q),120);
end
$$;

revoke all on function public.canonicalize_whatsapp_product_query_v2(text) from public,anon,authenticated;
grant execute on function public.canonicalize_whatsapp_product_query_v2(text) to service_role;

create or replace function public.search_whatsapp_sellable_products_agent_v1(p_query text,p_limit integer default 8)
returns table(id uuid,sku text,gtin text,name text,brand text,category text,packaging text,price numeric,stock numeric,image_url text,gondola text,shelf text,score integer,canonical_query text,match_mode text)
language sql
stable
security definer
set search_path=''
as $$
with q as (
  select public.canonicalize_whatsapp_product_query_v2(p_query) as term,
         greatest(1,least(coalesce(p_limit,8),20)) as lim
), exact_hits as (
  select s.*,q.term as canonical_query,'exact'::text as match_mode
  from q cross join lateral public.search_whatsapp_sellable_products_v1(q.term,q.lim) s
), fuzzy_pool as (
  select p.id,p.sku,p.gtin,p.name,p.brand,p.category,p.packaging,p.price,p.stock,p.image_url,p.gondola,p.shelf,q.term as canonical_query,
    greatest(
      extensions.word_similarity(q.term,translate(lower(coalesce(p.name,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc')),
      extensions.word_similarity(q.term,translate(lower(coalesce(p.category,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc')),
      extensions.word_similarity(q.term,translate(lower(coalesce(p.brand,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc'))
    ) as sim
  from public.products p cross join q
  where not exists(select 1 from exact_hits)
    and length(q.term)>=4
    and p.physically_verified=true and p.is_active=true and p.is_whatsapp_active=true
    and p.price is not null and p.price>=0 and coalesce(p.stock,0)>0
), fuzzy_hits as (
  select f.id,f.sku,f.gtin,f.name,f.brand,f.category,f.packaging,f.price,f.stock,f.image_url,f.gondola,f.shelf,
         greatest(50,least(79,round(f.sim*100)::int)) as score,f.canonical_query,'fuzzy'::text as match_mode
  from fuzzy_pool f where f.sim>=0.68 order by f.sim desc,f.name,f.id limit (select lim from q)
)
select e.id,e.sku,e.gtin,e.name,e.brand,e.category,e.packaging,e.price,e.stock,e.image_url,e.gondola,e.shelf,e.score,e.canonical_query,e.match_mode from exact_hits e
union all
select f.id,f.sku,f.gtin,f.name,f.brand,f.category,f.packaging,f.price,f.stock,f.image_url,f.gondola,f.shelf,f.score,f.canonical_query,f.match_mode from fuzzy_hits f
limit (select lim from q);
$$;

revoke all on function public.search_whatsapp_sellable_products_agent_v1(text,integer) from public,anon,authenticated;
grant execute on function public.search_whatsapp_sellable_products_agent_v1(text,integer) to service_role;

update public.ai_action_registry
set description='Busca no catálogo fisicamente conferido; passe em query somente o produto ou termo desejado. A disponibilidade é validada no banco; nunca inventa produto, preço ou estoque.',updated_at=now()
where action_key='wa_search_products';

commit;