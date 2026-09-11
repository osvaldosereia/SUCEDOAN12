begin;

create or replace function public.queue_whatsapp_sales_reply_v1(
  p_conversation_id uuid,
  p_source_message_id uuid,
  p_body_text text,
  p_delivery_mode text default 'text',
  p_image_url text default null,
  p_interactive jsonb default null,
  p_action_type text default 'reply',
  p_action_result jsonb default '{}'::jsonb,
  p_confidence numeric default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  cfg public.automation_config%rowtype;
  c public.conversations%rowtype;
  customer public.customers%rowtype;
  v_mode text:=lower(trim(coalesce(p_delivery_mode,'text')));
  body text:=left(trim(coalesce(p_body_text,'')),4096);
  img text:=nullif(trim(coalesce(p_image_url,'')),'');
  reply_id uuid;
  job_id uuid;
  payload jsonb;
  interactive_type text;
  cta_url text;
  cta_label text;
  search_query text;
  search_session jsonb;
begin
  select * into cfg from public.automation_config where id=1;
  if not found or not coalesce(cfg.automation_enabled and cfg.outbound_enabled and cfg.whatsapp_inbound_enabled and cfg.whatsapp_auto_reply_enabled and cfg.whatsapp_sales_mvp_enabled,false) then raise exception 'whatsapp_sales_reply_disabled'; end if;
  select cv.* into c from public.conversations cv where cv.id=p_conversation_id and cv.mode='ai' and cv.status<>'closed' for update;
  if not found or c.service_window_expires_at<=now() then raise exception 'conversation_service_window_closed'; end if;
  if c.customer_id is not null then select * into customer from public.customers where id=c.customer_id; end if;
  if coalesce(p_action_type,'')='basket_ready_for_human' and coalesce(p_action_result->>'pricing_status','ready')='needs_review' then body:='Encomenda recebida para conferência. Como sua cesta foi personalizada e um dos itens ainda precisa de conferência de valor, nossa equipe vai confirmar o total final com você. Não cobramos taxa de entrega.'; end if;
  if coalesce(p_action_type,'')='search_product' and v_mode='interactive' and coalesce(p_interactive->>'type','')='list' then
    search_query:=left(trim(coalesce(p_action_result->>'query','')),120);
    if search_query<>'' then
      search_session:=public.create_whatsapp_search_catalog_session_v1(c.id,search_query,20);
      if coalesce((search_session->>'item_count')::integer,0)>0 then
        cta_label:=left('Ver '||initcap(search_query),20);
        cta_url:=search_session->>'url';
        body:=left('Encontrei opções de '||search_query||'. Toque em '||cta_label||' para ver os produtos, preços e adicionar ao pedido.',1024);
        p_interactive:=jsonb_build_object('type','cta_url','body',jsonb_build_object('text',body),'action',jsonb_build_object('name','cta_url','parameters',jsonb_build_object('display_text',cta_label,'url',cta_url)));
        p_action_result:=coalesce(p_action_result,'{}'::jsonb)||jsonb_build_object('showcase',search_session,'presentation','search_cta_url');
      end if;
    end if;
  end if;
  if v_mode not in ('text','audio','image','interactive') then raise exception 'unsupported_delivery_mode'; end if;
  if v_mode in ('text','audio') and body='' then raise exception 'body_required'; end if;
  if v_mode='image' then
    if not cfg.whatsapp_sales_images_enabled then raise exception 'whatsapp_sales_images_disabled'; end if;
    if img is null or img !~ '^https://' then raise exception 'https_image_url_required'; end if;
  end if;
  if v_mode='interactive' then
    if not cfg.whatsapp_sales_interactive_enabled then raise exception 'whatsapp_sales_interactive_disabled'; end if;
    if jsonb_typeof(p_interactive) is distinct from 'object' then raise exception 'invalid_interactive_payload'; end if;
    interactive_type:=coalesce(p_interactive->>'type','');
    if interactive_type not in ('button','list','cta_url') then raise exception 'invalid_interactive_payload'; end if;
    if interactive_type='cta_url' then
      cta_url:=nullif(trim(coalesce(p_interactive->'action'->'parameters'->>'url','')),'');
      cta_label:=nullif(trim(coalesce(p_interactive->'action'->'parameters'->>'display_text','')),'');
      if coalesce(p_interactive->'action'->>'name','')<>'cta_url' then raise exception 'invalid_cta_action'; end if;
      if cta_url is null or not (
        cta_url ~ '^https://donaantonia[.]com[.]br/cesta/[?]t=[A-Fa-f0-9]{64}$'
        or cta_url ~ '^https://donaantonia[.]com[.]br/catalogo/[?]c=[A-Fa-f0-9]{64}&q=[A-Za-z0-9%._~!$''()*+,;:@/-]+$'
        or cta_url ~ '^https://donaantonia[.]com[.]br/comprar/[?]s=[A-Fa-f0-9]{64}$'
      ) then raise exception 'cta_url_not_allowed'; end if;
      if cta_label is null or length(cta_label)>20 then raise exception 'cta_label_invalid'; end if;
      if body='' then raise exception 'cta_body_required'; end if;
    end if;
  end if;
  insert into public.messages(conversation_id,direction,message_type,body_text,ai_interpretation,raw_event)
  values(c.id,'outbound',case when v_mode='image' then 'image' when v_mode='interactive' then 'interactive' else 'text' end,body,jsonb_build_object('source','whatsapp_sales_mvp','action_type',left(coalesce(p_action_type,'reply'),80),'confidence',p_confidence,'delivery_mode',v_mode,'action_result',coalesce(p_action_result,'{}'::jsonb)),jsonb_build_object('source','whatsapp','sales_mvp',true,'source_message_id',p_source_message_id)) returning id into reply_id;
  payload:=jsonb_build_object('message_kind','conversation_reply','message_type',v_mode,'body_text',body,'delivery_mode',v_mode,'image_url',img,'interactive',p_interactive,'reply_message_id',reply_id,'source_message_id',p_source_message_id,'service_window_expires_at',c.service_window_expires_at,'voice_profile','dona_antonia_marin_b_v1');
  insert into public.outbound_jobs(whatsapp_account_id,customer_id,conversation_id,job_type,recipient_e164,dedupe_key,payload) values(c.whatsapp_account_id,c.customer_id,c.id,'seller_message',c.wa_contact_e164,'sales_reply:'||reply_id::text,payload) on conflict(dedupe_key) do nothing returning id into job_id;
  insert into public.whatsapp_sales_action_events(conversation_id,message_id,action_type,action_payload,result,reversible,required_confirmation,confidence) values(c.id,p_source_message_id,left(coalesce(p_action_type,'reply'),80),jsonb_build_object('delivery_mode',v_mode,'image_url',img,'interactive',p_interactive),coalesce(p_action_result,'{}'::jsonb),true,false,p_confidence);
  return jsonb_build_object('reply_message_id',reply_id,'outbound_job_id',job_id,'delivery_mode',v_mode,'interactive_type',interactive_type);
end;
$$;

revoke all on function public.queue_whatsapp_sales_reply_v1(uuid,uuid,text,text,text,jsonb,text,jsonb,numeric) from public,anon,authenticated;
grant execute on function public.queue_whatsapp_sales_reply_v1(uuid,uuid,text,text,text,jsonb,text,jsonb,numeric) to service_role;

commit;
