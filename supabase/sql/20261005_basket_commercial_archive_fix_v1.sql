-- Dona Antônia · exclusão lógica unificada do modelo comercial.
-- Preserva histórico, bloqueia exclusão com estoque/lote vivo e desativa o kit interno na mesma transação.
create or replace function public.archive_basket_template_admin_v1(
  p_basket_id uuid,
  p_operator text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.basket_templates%rowtype;
  v_operator text:=nullif(btrim(coalesce(p_operator,'')),'');
begin
  select * into v_row
  from public.basket_templates
  where id=p_basket_id
  for update;
  if not found then raise exception 'basket_not_found'; end if;

  if exists(
    select 1
    from public.basket_stock_lots l
    left join public.basket_kit_templates k on k.id=l.kit_template_id
    where (l.basket_id=p_basket_id or k.basket_id=p_basket_id)
      and (l.status='draft' or (l.status='ready' and coalesce(l.quantity_available,0)>0))
  ) then raise exception 'basket_has_live_lots'; end if;

  update public.basket_kit_templates
  set is_active=false,
      updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'archived_at',now(),
        'archived_by',v_operator,
        'archived_with_commercial_model',true
      )
  where basket_id=p_basket_id and is_active=true;

  update public.basket_templates
  set is_active=false,
      is_whatsapp_active=false,
      updated_at=now(),
      internal_notes=concat_ws(E'\n',nullif(internal_notes,''),'Modelo arquivado em '||now()::text||coalesce(' por '||v_operator,''))
  where id=p_basket_id;

  return jsonb_build_object('id',p_basket_id,'archived',true);
end;
$function$;

revoke all on function public.archive_basket_template_admin_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.archive_basket_template_admin_v1(uuid,text) to service_role;