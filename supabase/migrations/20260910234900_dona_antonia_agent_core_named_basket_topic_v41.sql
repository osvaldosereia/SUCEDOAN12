begin;

create or replace function public.resolve_whatsapp_agent_core_topic_v4(p_message text,p_stage text,p_awaiting text,p_interactive_id text)
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  base text:=public.resolve_whatsapp_agent_core_topic_v3(p_message,p_stage,p_awaiting,p_interactive_id);
  q text:=public.service_norm_text_v1(p_message);
  vocab jsonb;
  qn text;
begin
  qn:=translate(lower(coalesce(q,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');
  if qn ~ '(^| )(mini|pequena|media|grande) +(bonini|koblenz)( |$)' or qn ~ '(^| )economica( +bonini)?( |$)' then return 'basket'; end if;
  if base not in ('general','product_search') then return base; end if;
  if q ~ '(^| )(cadastro|meu cadastro|meus dados)( |$)' then return 'general'; end if;
  vocab:=public.match_whatsapp_product_vocabulary_v1(p_message);
  if coalesce((vocab->>'matched')::boolean,false) then return 'product_search'; end if;
  return base;
end
$$;

revoke all on function public.resolve_whatsapp_agent_core_topic_v4(text,text,text,text) from public,anon,authenticated;
grant execute on function public.resolve_whatsapp_agent_core_topic_v4(text,text,text,text) to service_role;

commit;
