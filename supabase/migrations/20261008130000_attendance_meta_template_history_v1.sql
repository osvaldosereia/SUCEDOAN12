-- Registra o texto exibivel dos templates Meta usando somente o snapshot ja enviado.
-- Nao envia WhatsApp, nao altera WAMID nem cria conversas.
begin;

create or replace function public.ops2_render_whatsapp_template_body_v1(
  p_whatsapp_account_id uuid,
  p_template_name text,
  p_components jsonb default '[]'::jsonb,
  p_variable_values jsonb default '{}'::jsonb
)
returns text
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_body text;
  v_parameters jsonb:='[]'::jsonb;
  v_values jsonb:=case when jsonb_typeof(p_variable_values)='object' then p_variable_values else '{}'::jsonb end;
  v_index integer;
  v_value text;
begin
  if p_whatsapp_account_id is null or nullif(btrim(coalesce(p_template_name,'')),'') is null then return null; end if;
  select component->>'text' into v_body
  from public.whatsapp_templates_v1 t
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(t.components)='array' then t.components else '[]'::jsonb end
  ) component
  where t.whatsapp_account_id=p_whatsapp_account_id
    and t.name=p_template_name
    and upper(coalesce(component->>'type',''))='BODY'
    and t.language='pt_BR'
  order by t.updated_at desc
  limit 1;
  if nullif(btrim(coalesce(v_body,'')),'') is null then return null; end if;

  select component->'parameters' into v_parameters
  from jsonb_array_elements(
    case when jsonb_typeof(p_components)='array' then p_components else '[]'::jsonb end
  ) component
  where lower(coalesce(component->>'type',''))='body'
  limit 1;
  if jsonb_typeof(v_parameters)<>'array' then v_parameters:='[]'::jsonb; end if;

  for v_index in 1..80 loop
    if position('{{'||v_index::text||'}}' in v_body)>0 then
      v_value:=nullif(v_values->>v_index::text,'');
      if v_value is null and jsonb_array_length(v_parameters)>=v_index then
        v_value:=nullif(v_parameters->(v_index-1)->>'text','');
      end if;
      if v_value is null then return null; end if;
      v_body:=replace(v_body,'{{'||v_index::text||'}}',v_value);
    end if;
  end loop;
  if v_body ~ '\{\{[0-9]+\}\}' then return null; end if;
  return v_body;
end;
$function$;

revoke all on function public.ops2_render_whatsapp_template_body_v1(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ops2_render_whatsapp_template_body_v1(uuid,text,jsonb,jsonb) to service_role;

create or replace function public.ops2_whatsapp_canonical_template_body_v1(
  p_message_id uuid,
  p_whatsapp_account_id uuid,
  p_metadata jsonb
)
returns text
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_source text:=coalesce(p_metadata->>'source','');
  v_template_name text:=nullif(p_metadata->>'template_name','');
  v_components jsonb:='[]'::jsonb;
  v_values jsonb:='{}'::jsonb;
  v_body text;
  v_ref text;
begin
  if v_source='order_confirmation' then
    v_ref:=p_metadata->>'order_outbox_id';
    if coalesce(v_ref,'') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select coalesce(q.payload#>>'{meta_request,template_name}',v_template_name),
             q.payload#>'{meta_request,components}'
      into v_template_name,v_components
      from public.ops2_whatsapp_outbox_v1 q
      where q.id=v_ref::uuid and q.whatsapp_account_id=p_whatsapp_account_id;
    end if;
  elsif v_source='order_separation_notification' then
    v_ref:=p_metadata->>'notification_id';
    if coalesce(v_ref,'') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select coalesce(q.template_name,v_template_name),q.payload->'components'
      into v_template_name,v_components
      from public.order_separation_customer_notifications_v1 q
      where q.id=v_ref::uuid and q.whatsapp_account_id=p_whatsapp_account_id;
    end if;
  elsif v_source='marketing_campaign_worker' or v_source='marketing_campaign' then
    select coalesce(o.payload->>'template_name',v_template_name),
           o.payload->'variable_values'
    into v_template_name,v_values
    from public.whatsapp_outbox_v1 o
    where o.message_id=p_message_id
      and o.whatsapp_account_id=p_whatsapp_account_id
      and o.purpose='marketing_campaign'
    limit 1;
  end if;

  v_body:=public.ops2_render_whatsapp_template_body_v1(
    p_whatsapp_account_id,v_template_name,v_components,v_values
  );
  if nullif(btrim(coalesce(v_body,'')),'') is not null then return v_body; end if;
  if nullif(btrim(coalesce(v_template_name,'')),'') is not null then
    return 'Modelo de WhatsApp: '||v_template_name||' (conteúdo não recuperável neste histórico).';
  end if;
  return 'Mensagem automática do WhatsApp (conteúdo não recuperável neste histórico).';
end;
$function$;

revoke all on function public.ops2_whatsapp_canonical_template_body_v1(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ops2_whatsapp_canonical_template_body_v1(uuid,uuid,jsonb) to service_role;

create or replace function public.ops2_whatsapp_capture_template_text_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.direction='outbound'
     and new.message_type='template'
     and new.provider='meta'
     and new.provider_message_id like 'wamid.%'
     and nullif(btrim(coalesce(new.text_body,'')),'') is null then
    new.text_body:=public.ops2_whatsapp_canonical_template_body_v1(
      new.id,new.whatsapp_account_id,coalesce(new.metadata,'{}'::jsonb)
    );
  end if;
  return new;
end;
$function$;

revoke all on function public.ops2_whatsapp_capture_template_text_v1() from public,anon,authenticated;
grant execute on function public.ops2_whatsapp_capture_template_text_v1() to service_role;

drop trigger if exists ops2_whatsapp_capture_template_text_v1 on public.whatsapp_messages_v1;
create trigger ops2_whatsapp_capture_template_text_v1
before insert or update of provider_message_id,metadata,message_type,text_body
on public.whatsapp_messages_v1
for each row execute function public.ops2_whatsapp_capture_template_text_v1();

-- Recupera registros ja aceitos sem reenvio nem mudanca de identidade.
update public.whatsapp_messages_v1 m
set text_body=public.ops2_whatsapp_canonical_template_body_v1(
  m.id,m.whatsapp_account_id,coalesce(m.metadata,'{}'::jsonb)
)
where m.direction='outbound'
  and m.message_type='template'
  and m.provider='meta'
  and m.provider_message_id like 'wamid.%'
  and nullif(btrim(coalesce(m.text_body,'')),'') is null;
commit;
