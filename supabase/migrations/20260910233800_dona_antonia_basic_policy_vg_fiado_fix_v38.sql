begin;

create or replace function public.get_whatsapp_basic_policy_reply_v1(p_message text)
returns jsonb
language plpgsql
immutable
security definer
set search_path=''
as $$
declare
  n text:=translate(lower(trim(regexp_replace(coalesce(p_message,''),'\s+',' ','g'))),'áàãâéêíóôõúç','aaaaeeiooouc');
  payment boolean:=false;
  delivery_time boolean:=false;
  delivery_fee boolean:=false;
  delivery_area boolean:=false;
  offers_link boolean:=false;
begin
  payment := n ~ '(forma(s)? de pagamento|como (posso )?pagar|pagamento|cartao|credito|debito|pix|dinheiro|alelo|sodexo|pluxee|puxee|caju|cajur|flash|ifood|boleto|30 dias|trinta dias|fiado)';
  delivery_time := n ~ '(que horas|qual horario|horario da entrega|hora da entrega|quando chega|que hora chega|periodo da entrega)';
  delivery_fee := n ~ '(taxa de entrega|frete|cobra entrega|cobram entrega|entrega e gratis|entrega gratis)';
  delivery_area := n ~ '(cuiaba|varzea grande|(^|[^a-z0-9])vg([^a-z0-9]|$)|onde (voces )?entrega|onde entregam|area de entrega|regiao de entrega|fora de cuiaba|fora de varzea grande)';
  offers_link := n ~ '(link.{0,30}oferta|oferta.{0,30}link|ver ofertas|pagina.{0,20}oferta)';

  if payment then return jsonb_build_object('matched',true,'kind','payment','handoff',false,'reply',E'FORMAS DE PAGAMENTO\n\n• Cartão de Crédito em 3x sem juros\n• Cartão de Débito\n• Pix e Dinheiro\n• Cartão Alimentação Alelo, Sodexo, Pluxee, Caju, Flash e iFood.\n\nNão vendemos fiado. Por enquanto também não vendemos pra 30 dias ou no Boleto.'); end if;
  if delivery_fee then return jsonb_build_object('matched',true,'kind','delivery_fee','handoff',false,'reply','Não cobramos taxa de entrega.'); end if;
  if delivery_area then return jsonb_build_object('matched',true,'kind','delivery_area','handoff',false,'reply','Entregamos somente em Cuiabá e Várzea Grande.'); end if;
  if offers_link then return jsonb_build_object('matched',true,'kind','offers_link','handoff',false,'reply','Veja as ofertas atuais em https://donaantonia.com.br/#/ofertas'); end if;
  if delivery_time then return jsonb_build_object('matched',true,'kind','delivery_time','handoff',true,'reply','As entregas são por rota e o horário depende do bairro. Vou transferir você para o atendimento humano.'); end if;
  return jsonb_build_object('matched',false);
end
$$;

revoke all on function public.get_whatsapp_basic_policy_reply_v1(text) from public,anon,authenticated;
grant execute on function public.get_whatsapp_basic_policy_reply_v1(text) to service_role;

commit;