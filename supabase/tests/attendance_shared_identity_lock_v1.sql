-- Run with a database owner in staging or in a rollback transaction.
begin;
do $test$
declare
  bridge text;
  resolver text;
  capture uuid;
  r jsonb;
  s jsonb;
begin
  bridge:=pg_get_functiondef('public.papoai_ensure_conversation_v2(uuid)'::regprocedure);
  resolver:=pg_get_functiondef('public.whatsapp_resolve_conversation_v1(uuid,text,uuid,text)'::regprocedure);
  if position('whatsapp-conversation:' in bridge)=0 or position('whatsapp-conversation:' in resolver)=0 then
    raise exception 'REGRESSION: Meta and PapoAI must share the identity lock';
  end if;
  if has_function_privilege('anon','public.papoai_ensure_conversation_v2(uuid)','execute') then
    raise exception 'bridge must remain service-only';
  end if;
  select p.id into capture from public.papoai_webhook_inbox_v2 p
  where p.status in ('normalized','processed') and p.event_name='message.received'
    and exists(select 1 from public.conversations c where c.id::text=p.metadata->>'conversation_id' and c.status<>'closed')
  order by p.received_at desc limit 1;
  if capture is null then raise exception 'Normalized inbound fixture required'; end if;
  r:=public.papoai_ensure_conversation_v2(capture);
  if r->>'ok'<>'true' or r->>'created'<>'false' then raise exception 'bridge replay failed: %',r; end if;
  s:=public.whatsapp_resolve_conversation_v1((r->>'whatsapp_account_id')::uuid,r->>'phone_e164');
  if s->>'conversation_id'<>r->>'conversation_id' or s->>'created'<>'false' then
    raise exception 'provider routes disagree: % %',r,s;
  end if;
end $test$;
rollback;
