begin;

-- Dona Antônia · Marketing Strategy carousel media tracking v1
-- Hardening incremental sobre a migration de atribuição já aplicada em produção.
-- Não altera runtime; apenas enriquece o payload server-side emitido ao worker.

create or replace function public.marketing_issue_tracking_links_v1(p_dispatch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_dispatch public.marketing_campaign_dispatches_v1%rowtype;
  v_campaign public.marketing_campaigns_v1%rowtype;
  v_offer record;
  v_raw text;
  v_hash text;
  v_link public.marketing_tracking_links_v1%rowtype;
  v_links jsonb:='[]'::jsonb;
begin
  select * into v_dispatch
  from public.marketing_campaign_dispatches_v1
  where id=p_dispatch_id;
  if not found then return jsonb_build_object('ok',false,'error','dispatch_not_found'); end if;

  select * into v_campaign
  from public.marketing_campaigns_v1
  where id=v_dispatch.campaign_id;
  if not found then return jsonb_build_object('ok',false,'error','campaign_not_found'); end if;

  -- Campanhas legadas permanecem intocadas e não passam a exigir tracking novo.
  if v_campaign.strategy_id is null then
    return jsonb_build_object('ok',true,'strategy_tracked',false,'tracking_links','[]'::jsonb);
  end if;

  for v_offer in
    select o.position,o.commercial_id,o.public_lot_id,o.public_name,o.image_url
    from public.marketing_strategy_offers_v1 o
    where o.strategy_id=v_campaign.strategy_id
    order by o.position
  loop
    v_raw:=encode(extensions.gen_random_bytes(18),'hex');
    v_hash:=encode(extensions.digest(convert_to(v_raw,'UTF8'),'sha256'),'hex');

    insert into public.marketing_tracking_links_v1(
      token_hash,dispatch_id,strategy_id,campaign_id,customer_id,offer_position,
      commercial_id,public_lot_id,expires_at,metadata,updated_at
    ) values (
      v_hash,v_dispatch.id,v_campaign.strategy_id,v_campaign.id,v_dispatch.customer_id,v_offer.position,
      v_offer.commercial_id,v_offer.public_lot_id,now()+interval '7 days',
      jsonb_build_object(
        'source','marketing_strategy_v1',
        'public_name',v_offer.public_name,
        'image_url',v_offer.image_url
      ),now()
    )
    on conflict (dispatch_id,offer_position) do update
      set token_hash=excluded.token_hash,
          commercial_id=excluded.commercial_id,
          public_lot_id=excluded.public_lot_id,
          expires_at=excluded.expires_at,
          first_opened_at=null,
          last_opened_at=null,
          open_count=0,
          checkout_started_at=null,
          attributed_order_id=null,
          attribution_kind=null,
          metadata=excluded.metadata,
          updated_at=now()
    returning * into v_link;

    v_links:=v_links||jsonb_build_array(jsonb_build_object(
      'card_index',v_offer.position-1,
      'offer_position',v_offer.position,
      'commercial_id',v_offer.commercial_id,
      'public_lot_id',v_offer.public_lot_id,
      'image_url',v_offer.image_url,
      'tracking_token',v_raw,
      'url','https://www.donaantonia.com.br/?mt='||v_raw
    ));
  end loop;

  if jsonb_array_length(v_links)=0 then
    return jsonb_build_object('ok',false,'error','strategy_offers_missing');
  end if;

  return jsonb_build_object(
    'ok',true,'strategy_tracked',true,'strategy_id',v_campaign.strategy_id,
    'campaign_id',v_campaign.id,'dispatch_id',v_dispatch.id,'tracking_links',v_links
  );
end;
$$;

revoke all on function public.marketing_issue_tracking_links_v1(uuid) from public,anon,authenticated;
grant execute on function public.marketing_issue_tracking_links_v1(uuid) to service_role;

commit;
