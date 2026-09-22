begin;

create table if not exists public.papoai_commerce_pending_actions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  action_type text not null check(action_type in ('replace_basket_item')),
  status text not null default 'pending' check(status in ('pending','confirmed','cancelled','expired','failed')),
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default now()+interval '15 minutes',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.papoai_commerce_pending_actions enable row level security;
revoke all on table public.papoai_commerce_pending_actions from public,anon,authenticated;
grant all on table public.papoai_commerce_pending_actions to service_role;

create index if not exists papoai_commerce_pending_actions_conversation_idx
  on public.papoai_commerce_pending_actions(conversation_id,status,created_at desc);

create unique index if not exists papoai_commerce_one_pending_action_per_conversation_idx
  on public.papoai_commerce_pending_actions(conversation_id)
  where status='pending';

create or replace function public.resolve_papoai_commerce_replacement_candidates_v1(
  p_conversation_id uuid,
  p_source_query text,
  p_replacement_query text,
  p_limit integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_source_match jsonb;
  v_source_id uuid;
  v_source_product public.products%rowtype;
  v_limit integer:=greatest(1,least(coalesce(p_limit,5),8));
  v_items jsonb;
  v_query_norm text;
begin
  v_source_match:=public.resolve_papoai_commerce_cart_item_v1(p_conversation_id,p_source_query);
  if not coalesce((v_source_match->>'found')::boolean,false) then
    return jsonb_build_object(
      'ok',false,
      'needs_clarification',true,
      'reason',coalesce(v_source_match->>'reason','source_not_found'),
      'source_candidates',coalesce(v_source_match->'candidates','[]'::jsonb),
      'replacement_candidates','[]'::jsonb
    );
  end if;

  v_source_id:=(v_source_match->>'product_id')::uuid;
  select * into v_source_product from public.products where id=v_source_id;
  if not found then
    return jsonb_build_object('ok',false,'reason','source_product_missing','replacement_candidates','[]'::jsonb);
  end if;

  v_query_norm:=translate(lower(trim(coalesce(p_replacement_query,''))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');

  with base as (
    select s.id,s.name,s.brand,s.category,p.subcategory,
           p.customer_category,p.customer_subcategory,
           p.price,p.offer_price,p.is_offer,p.stock,
           coalesce(p.image_url,p.image_ai_url,p.image_source_url) image_url,
           s.score,s.match_mode,
           translate(lower(coalesce(p.name,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') name_norm,
           greatest(
             extensions.similarity(v_query_norm,translate(lower(coalesce(p.name,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc')),
             extensions.word_similarity(v_query_norm,translate(lower(coalesce(p.name,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc'))
           ) semantic_score,
           case
             when coalesce(p.subcategory,'')<>'' and lower(p.subcategory)=lower(coalesce(v_source_product.subcategory,'')) then 3
             when lower(coalesce(p.category,''))=lower(coalesce(v_source_product.category,'')) then 2
             when coalesce(p.customer_subcategory,'')<>'' and lower(p.customer_subcategory)=lower(coalesce(v_source_product.customer_subcategory,'')) then 1
             else 0
           end compatibility
    from public.search_whatsapp_sellable_products_agent_v1(p_replacement_query,greatest(v_limit*4,12)) s
    join public.products p on p.id=s.id
    where s.id<>v_source_id
      and p.physically_verified=true
      and p.is_active=true
      and p.is_whatsapp_active=true
      and coalesce(p.stock,0)>0
      and coalesce(p.price,0)>0
  ), ranked as (
    select *,
      case
        when name_norm=v_query_norm then 3
        when name_norm like v_query_norm||'%' or name_norm like '%'||v_query_norm||'%' then 2
        else 1
      end exactness
    from base
    where compatibility>0
    order by compatibility desc,exactness desc,semantic_score desc,score desc,name
    limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',id,
    'name',name,
    'brand',brand,
    'category',category,
    'subcategory',subcategory,
    'commercial_price',case when is_offer and coalesce(offer_price,0)>0 and offer_price<=price then offer_price else price end,
    'regular_price',price,
    'is_offer',coalesce(is_offer,false),
    'stock',stock,
    'image_url',image_url,
    'compatibility',compatibility,
    'exactness',exactness,
    'semantic_score',round(semantic_score::numeric,3),
    'match_score',score,
    'match_mode',match_mode,
    'requires_confirmation',true
  ) order by compatibility desc,exactness desc,semantic_score desc,score desc,name),'[]'::jsonb)
  into v_items
  from ranked;

  return jsonb_build_object(
    'ok',true,
    'source',jsonb_build_object(
      'product_id',v_source_product.id,
      'name',v_source_product.name,
      'category',v_source_product.category,
      'subcategory',v_source_product.subcategory
    ),
    'replacement_candidates',v_items,
    'count',jsonb_array_length(v_items),
    'requires_confirmation',true,
    'writes_performed',false
  );
end;
$$;

create or replace function public.propose_papoai_commerce_replacement_v1(
  p_conversation_id uuid,
  p_source_query text,
  p_replacement_query text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_candidates jsonb;
  v_items jsonb;
  v_first jsonb;
  v_second jsonb;
  v_first_semantic numeric;
  v_second_semantic numeric;
  v_safe boolean:=false;
  v_action_id uuid;
begin
  update public.papoai_commerce_pending_actions
     set status='expired',resolved_at=now(),updated_at=now()
   where conversation_id=p_conversation_id
     and status='pending'
     and expires_at<=now();

  v_candidates:=public.resolve_papoai_commerce_replacement_candidates_v1(
    p_conversation_id,p_source_query,p_replacement_query,5
  );

  if not coalesce((v_candidates->>'ok')::boolean,false) then return v_candidates; end if;

  v_items:=coalesce(v_candidates->'replacement_candidates','[]'::jsonb);
  if jsonb_array_length(v_items)=0 then
    return jsonb_build_object(
      'ok',false,'needs_clarification',true,'reason','replacement_not_found',
      'source',v_candidates->'source','candidates',v_items
    );
  end if;

  v_first:=v_items->0;
  v_second:=case when jsonb_array_length(v_items)>1 then v_items->1 else null end;
  v_first_semantic:=coalesce((v_first->>'semantic_score')::numeric,0);
  v_second_semantic:=coalesce((v_second->>'semantic_score')::numeric,0);

  v_safe:=
    coalesce((v_first->>'exactness')::integer,0)>=2
    or (
      coalesce((v_first->>'compatibility')::integer,0)>=2
      and v_first_semantic>=0.82
      and (v_second is null or v_first_semantic-v_second_semantic>=0.10)
    );

  if not v_safe then
    return jsonb_build_object(
      'ok',false,
      'needs_clarification',true,
      'reason','replacement_ambiguous',
      'source',v_candidates->'source',
      'candidates',v_items
    );
  end if;

  update public.papoai_commerce_pending_actions
     set status='cancelled',resolved_at=now(),updated_at=now()
   where conversation_id=p_conversation_id and status='pending';

  insert into public.papoai_commerce_pending_actions(
    conversation_id,action_type,status,payload,expires_at
  ) values(
    p_conversation_id,'replace_basket_item','pending',
    jsonb_build_object(
      'source',v_candidates->'source',
      'replacement',v_first,
      'source_query',p_source_query,
      'replacement_query',p_replacement_query
    ),
    now()+interval '15 minutes'
  )
  returning id into v_action_id;

  return jsonb_build_object(
    'ok',true,
    'pending_action_id',v_action_id,
    'action_type','replace_basket_item',
    'source',v_candidates->'source',
    'replacement',v_first,
    'requires_confirmation',true,
    'expires_in_seconds',900,
    'writes_performed',false
  );
end;
$$;

create or replace function public.get_papoai_commerce_pending_action_v1(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_action public.papoai_commerce_pending_actions%rowtype;
begin
  update public.papoai_commerce_pending_actions
     set status='expired',resolved_at=now(),updated_at=now()
   where conversation_id=p_conversation_id and status='pending' and expires_at<=now();

  select * into v_action
  from public.papoai_commerce_pending_actions
  where conversation_id=p_conversation_id and status='pending'
  order by created_at desc limit 1;

  if not found then return jsonb_build_object('has_pending',false); end if;

  return jsonb_build_object(
    'has_pending',true,
    'id',v_action.id,
    'action_type',v_action.action_type,
    'payload',v_action.payload,
    'expires_at',v_action.expires_at
  );
end;
$$;

create or replace function public.confirm_papoai_commerce_pending_action_v1(
  p_conversation_id uuid,
  p_confirm boolean
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_action public.papoai_commerce_pending_actions%rowtype;
  v_result jsonb;
begin
  select * into v_action
  from public.papoai_commerce_pending_actions
  where conversation_id=p_conversation_id and status='pending'
  order by created_at desc limit 1
  for update;

  if not found then return jsonb_build_object('ok',false,'reason','no_pending_action'); end if;

  if v_action.expires_at<=now() then
    update public.papoai_commerce_pending_actions
       set status='expired',resolved_at=now(),updated_at=now()
     where id=v_action.id;
    return jsonb_build_object('ok',false,'reason','pending_action_expired');
  end if;

  if not coalesce(p_confirm,false) then
    update public.papoai_commerce_pending_actions
       set status='cancelled',resolved_at=now(),updated_at=now()
     where id=v_action.id;
    return jsonb_build_object('ok',true,'cancelled',true,'action_type',v_action.action_type);
  end if;

  if v_action.action_type='replace_basket_item' then
    v_result:=public.replace_papoai_commerce_basket_item_v2(
      p_conversation_id,
      (v_action.payload#>>'{source,product_id}')::uuid,
      (v_action.payload#>>'{replacement,product_id}')::uuid,
      true
    );
  else
    raise exception 'unsupported_pending_action';
  end if;

  update public.papoai_commerce_pending_actions
     set status='confirmed',resolved_at=now(),updated_at=now()
   where id=v_action.id;

  return jsonb_build_object(
    'ok',true,
    'confirmed',true,
    'action_type',v_action.action_type,
    'result',v_result
  );
end;
$$;

revoke all on function public.resolve_papoai_commerce_replacement_candidates_v1(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.resolve_papoai_commerce_replacement_candidates_v1(uuid,text,text,integer) to service_role;
revoke all on function public.propose_papoai_commerce_replacement_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function public.propose_papoai_commerce_replacement_v1(uuid,text,text) to service_role;
revoke all on function public.get_papoai_commerce_pending_action_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_papoai_commerce_pending_action_v1(uuid) to service_role;
revoke all on function public.confirm_papoai_commerce_pending_action_v1(uuid,boolean) from public,anon,authenticated;
grant execute on function public.confirm_papoai_commerce_pending_action_v1(uuid,boolean) to service_role;

commit;
