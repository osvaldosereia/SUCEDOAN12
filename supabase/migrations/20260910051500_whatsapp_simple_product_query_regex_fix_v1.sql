-- Corrige os grupos de captura para consultas simples de catálogo.
begin;

create or replace function public.route_whatsapp_simple_product_query_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  m public.messages%rowtype;
  raw_text text;
  n text;
  q text;
  rows_json jsonb;
  row_count integer:=0;
  reply text;
  interactive jsonb;
  first_row jsonb;
  price_question boolean:=false;
begin
  if new.job_type<>'conversation' or new.status<>'pending' then return new; end if;
  select * into m from public.messages where id=new.message_id and direction='inbound';
  if not found then return new; end if;
  if coalesce(m.ai_interpretation->>'id','')<>'' then return new; end if;

  raw_text:=trim(regexp_replace(coalesce(m.body_text,m.transcript,''),'\s+',' ','g'));
  if raw_text='' or length(raw_text)>140 then return new; end if;
  n:=translate(lower(raw_text),'áàãâéêíóôõúç','aaaaeeiooouc');

  if n ~ '^(qual|quais) (marca|marcas) de .+ (voce(s)? )?tem' then
    q:=regexp_replace(n,'^(qual|quais) (marca|marcas) de (.+?) (voce(s)? )?tem.*$','\3');
  elsif n ~ '^qual .+ (voce(s)? )?tem[ ?!]*$' then
    q:=regexp_replace(n,'^qual (.+?) (voce(s)? )?tem[ ?!]*$','\1');
  elsif n ~ '^(voce(s)? )?tem .+' then
    q:=regexp_replace(n,'^(voce(s)? )?tem (.+?)[ ?!]*$','\3');
  elsif n ~ '^quanto (custa|ta|esta) .+' then
    q:=regexp_replace(n,'^quanto (custa|ta|esta) (o |a |um |uma )?(.+?)[ ?!]*$','\3');
    price_question:=true;
  elsif n ~ '^(qual )?(o )?preco (do|da|de) .+' then
    q:=regexp_replace(n,'^(qual )?(o )?preco (do|da|de) (.+?)[ ?!]*$','\4');
    price_question:=true;
  else
    return new;
  end if;

  q:=trim(regexp_replace(coalesce(q,''),'\s+',' ','g'));
  if length(q)<2 or length(q)>80 then return new; end if;
  if q ~ '(cesta|cestas|entrega|frete|pagamento|pagar|pix|boleto|horario|hora|endereco|atendimento)' then return new; end if;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.score desc),'[]'::jsonb),count(*)::integer
    into rows_json,row_count
  from public.search_whatsapp_sellable_products_v1(q,8) s;

  if row_count=0 then
    reply:='Não encontrei '||left(q,70)||' entre os produtos disponíveis agora. Se quiser, me diga outra marca ou tamanho.';
    perform public.queue_whatsapp_sales_reply_v1(new.conversation_id,m.id,reply,'text',null,null,'simple_product_search',jsonb_build_object('query',q,'products','[]'::jsonb,'deterministic',true),1);
  elsif row_count=1 then
    first_row:=rows_json->0;
    reply:='Temos '||left(first_row->>'name',110)||' — R$ '||replace(to_char(coalesce((first_row->>'price')::numeric,0),'FM999999990.00'),'.',',')||'.';
    perform public.queue_whatsapp_sales_reply_v1(new.conversation_id,m.id,reply,'text',null,null,'simple_product_search',jsonb_build_object('query',q,'products',rows_json,'deterministic',true),1);
  else
    reply:=case when price_question then 'Encontrei estas opções e preços:' else 'Temos estas opções. Se quiser colocar alguma no pedido, toque nela:' end;
    select jsonb_build_object(
      'type','list',
      'body',jsonb_build_object('text',left(reply,1024)),
      'action',jsonb_build_object(
        'button','Escolher',
        'sections',jsonb_build_array(jsonb_build_object(
          'title','Opções',
          'rows',coalesce(jsonb_agg(jsonb_build_object(
            'id','da_add_product:'||(x->>'id'),
            'title',left(x->>'name',24),
            'description',left('R$ '||replace(to_char(coalesce((x->>'price')::numeric,0),'FM999999990.00'),'.',',')||case when coalesce(x->>'packaging','')<>'' then ' · '||(x->>'packaging') else '' end,72)
          )),'[]'::jsonb)
        ))
      )
    ) into interactive
    from jsonb_array_elements(rows_json) x;
    perform public.queue_whatsapp_sales_reply_v1(new.conversation_id,m.id,reply,'interactive',null,interactive,'simple_product_search',jsonb_build_object('query',q,'products',rows_json,'deterministic',true),1);
  end if;

  new.status:='done';
  new.result:=jsonb_build_object('deterministic',true,'action','simple_product_search','query',q,'product_count',row_count);
  new.updated_at:=now();
  return new;
end;
$$;

revoke all on function public.route_whatsapp_simple_product_query_v1() from public,anon,authenticated;
commit;
