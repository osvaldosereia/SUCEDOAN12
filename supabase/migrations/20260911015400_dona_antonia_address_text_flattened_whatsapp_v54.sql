create or replace function public.parse_whatsapp_address_text_v1(p_message text)
returns jsonb
language plpgsql
immutable
set search_path=''
as $function$
declare
  raw text:=coalesce(p_message,'');
  normalized text;
  m text[];
  street text:=''; num text:=''; complement text:=''; neighborhood text:=''; city text:=''; postal text:=''; reference text:='';
begin
  normalized:=regexp_replace(
    raw,
    '\s+(n[uú]mero/casa|n[uú]mero|nº|n°|casa|bairro|cidade|complemento|cep|refer[eê]ncia|localizador)\s*:',
    E'\n\\1:',
    'gi'
  );

  m:=regexp_match(normalized,'(?:^|\n)\s*(?:rua|logradouro)\s*:\s*([^\n;]+)','i'); if m is not null then street:=trim(m[1]); end if;
  m:=regexp_match(normalized,'(?:^|\n)\s*(?:numero/casa|número/casa|numero|número|nº|n°|casa)\s*:\s*([^\n;]+)','i'); if m is not null then num:=trim(m[1]); end if;
  m:=regexp_match(normalized,'(?:^|\n)\s*(?:complemento)\s*:\s*([^\n;]+)','i'); if m is not null then complement:=trim(m[1]); end if;
  m:=regexp_match(normalized,'(?:^|\n)\s*(?:bairro)\s*:\s*([^\n;]+)','i'); if m is not null then neighborhood:=trim(m[1]); end if;
  m:=regexp_match(normalized,'(?:^|\n)\s*(?:cidade)\s*:\s*([^\n;]+)','i'); if m is not null then city:=trim(m[1]); end if;
  m:=regexp_match(normalized,'(?:^|\n)\s*(?:cep)\s*:\s*([^\n;]+)','i'); if m is not null then postal:=trim(m[1]); end if;
  m:=regexp_match(normalized,'(?:^|\n)\s*(?:referencia|referência|localizador)\s*:\s*([^\n;]+)','i'); if m is not null then reference:=trim(m[1]); end if;

  if lower(regexp_replace(complement,'\s+','','g')) in ('(opcional)','opcional','-','—') then complement:=''; end if;
  if lower(regexp_replace(reference,'\s+','','g')) in ('(opcional)','opcional','-','—') then reference:=''; end if;
  if lower(regexp_replace(postal,'\s+','','g')) in ('(opcional)','opcional','-','—') then postal:=''; end if;

  return jsonb_build_object(
    'street',street,'number',num,'complement',complement,'neighborhood',neighborhood,
    'city',city,'postal_code',postal,'reference',reference,
    'complete',street<>'' and num<>'' and neighborhood<>'' and city<>''
  );
end;
$function$;

comment on function public.parse_whatsapp_address_text_v1(text) is
'V54: parses both multiline and WhatsApp-flattened address text using field labels as delimiters.';
