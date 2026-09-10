begin;

create or replace function public.match_whatsapp_product_vocabulary_v1(p_message text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  q text:=public.canonicalize_whatsapp_product_query_v1(p_message);
  qn text:=translate(lower(trim(coalesce(q,''))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');
  r record;
  sim real;
  mode text;
  best_sim real:=0;
  best_section text:=null;
  best_key text:=null;
  best_title text:=null;
  best_query text:=null;
  best_mode text:=null;
begin
  if qn='' then return jsonb_build_object('matched',false,'canonical_query',''); end if;
  if qn ~ '(^| )(cadastro|meus dados|meu cadastro|endereco|telefone|cpf|cnpj)( |$)' then
    return jsonb_build_object('matched',false,'canonical_query',qn,'reason','non_product_customer_data_term');
  end if;

  for r in
    select t.section_key,t.term_key,t.term_title,t.search_query,
           translate(lower(trim(coalesce(t.search_query,''))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') as term_norm
    from public.whatsapp_flow_search_terms t
    where t.enabled=true and nullif(trim(coalesce(t.search_query,'')),'') is not null
  loop
    sim:=0; mode:=null;
    if qn=r.term_norm or (' '||qn||' ') like '% '||r.term_norm||' %' then
      sim:=1; mode:='exact_or_phrase';
    elsif position(' ' in qn)=0 and position(' ' in r.term_norm)=0
      and length(qn)>=4 and abs(length(qn)-length(r.term_norm))<=2
      and left(qn,1)=left(r.term_norm,1)
    then
      sim:=extensions.word_similarity(qn,r.term_norm);
      if sim>=0.42 then mode:='fuzzy_single_token'; else sim:=0; end if;
    end if;
    if sim>best_sim then
      best_sim:=sim;
      best_section:=r.section_key;
      best_key:=r.term_key;
      best_title:=r.term_title;
      best_query:=r.search_query;
      best_mode:=mode;
    end if;
  end loop;

  if best_sim<=0 then
    return jsonb_build_object('matched',false,'canonical_query',qn);
  end if;
  return jsonb_build_object(
    'matched',true,'canonical_query',qn,
    'section_key',best_section,'term_key',best_key,'term_title',best_title,'search_query',best_query,
    'match_mode',best_mode,'similarity',round(best_sim::numeric,4)
  );
end
$$;

revoke all on function public.match_whatsapp_product_vocabulary_v1(text) from public,anon,authenticated;
grant execute on function public.match_whatsapp_product_vocabulary_v1(text) to service_role;

commit;