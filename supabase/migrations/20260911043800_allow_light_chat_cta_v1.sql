begin;

do $$
declare
  d text;
  target text := $q$$') then raise exception 'cta_url_not_allowed'; end if;$q$;
  replacement text := $q$$' and cta_url !~ '^https://donaantonia\\.com\\.br/comprar/\\?s=[A-Fa-f0-9]{64}$') then raise exception 'cta_url_not_allowed'; end if;$q$;
begin
  d:=pg_get_functiondef('public.queue_whatsapp_sales_reply_v1(uuid,uuid,text,text,text,jsonb,text,jsonb,numeric)'::regprocedure);
  if position(target in d)=0 then
    raise exception 'cta_allowlist_patch_target_not_found';
  end if;
  d:=replace(d,target,replacement);
  execute d;
end $$;

-- Defesa positiva: somente os três caminhos próprios continuam autorizados.
do $$
declare d text;
begin
  d:=pg_get_functiondef('public.queue_whatsapp_sales_reply_v1(uuid,uuid,text,text,text,jsonb,text,jsonb,numeric)'::regprocedure);
  if position('/comprar/' in d)=0 or position('cta_url_not_allowed' in d)=0 then
    raise exception 'cta_allowlist_patch_not_applied';
  end if;
end $$;

commit;
