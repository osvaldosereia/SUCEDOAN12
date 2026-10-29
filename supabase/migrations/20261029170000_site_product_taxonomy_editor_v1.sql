
-- Catálogo editável, preservando os campos textuais originais de public.products.
create table if not exists public.product_taxonomy_terms (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('category','subcategory','brand','gondola')),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 100),
  parent_id uuid references public.product_taxonomy_terms(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_taxonomy_parent_scope check (kind = 'subcategory' or parent_id is null)
);
create unique index if not exists product_taxonomy_terms_unique_name
  on public.product_taxonomy_terms (kind, lower(name), coalesce(parent_id::text,''));
create index if not exists product_taxonomy_terms_parent_idx on public.product_taxonomy_terms(parent_id);
alter table public.product_taxonomy_terms enable row level security;
revoke all on public.product_taxonomy_terms from PUBLIC, anon, authenticated;
grant select, insert, update, delete on public.product_taxonomy_terms to service_role;

create or replace function public.site_product_taxonomy_sync_v1()
returns integer
language plpgsql security invoker set search_path=public,pg_temp
as $$
declare v_count integer;
begin
  insert into public.product_taxonomy_terms (kind,name)
  select distinct on (lower(btrim(category))) 'category', btrim(category)
  from public.products where nullif(btrim(category),'') is not null
  order by lower(btrim(category)), btrim(category)
  on conflict do nothing;

  insert into public.product_taxonomy_terms (kind,name)
  select distinct on (lower(btrim(brand))) 'brand', btrim(brand)
  from public.products where nullif(btrim(brand),'') is not null
  order by lower(btrim(brand)), btrim(brand)
  on conflict do nothing;

  insert into public.product_taxonomy_terms (kind,name)
  select distinct on (lower(btrim(gondola))) 'gondola', btrim(gondola)
  from public.products where nullif(btrim(gondola),'') is not null
  order by lower(btrim(gondola)), btrim(gondola)
  on conflict do nothing;

  insert into public.product_taxonomy_terms (kind,name,parent_id)
  select distinct on (lower(btrim(p.subcategory)),coalesce(c.id::text,''))
    'subcategory',btrim(p.subcategory),c.id
  from public.products p
  left join public.product_taxonomy_terms c
    on c.kind='category' and lower(c.name)=lower(btrim(p.category))
  where nullif(btrim(p.subcategory),'') is not null
  order by lower(btrim(p.subcategory)),coalesce(c.id::text,''), btrim(p.subcategory)
  on conflict do nothing;
  select count(*)::integer into v_count from public.product_taxonomy_terms;
  return v_count;
end $$;
revoke all on function public.site_product_taxonomy_sync_v1() from PUBLIC, anon, authenticated;
grant execute on function public.site_product_taxonomy_sync_v1() to service_role;

create or replace view public.site_product_taxonomy_usage_v1
with (security_invoker = true) as
select t.id,t.kind,t.name,t.parent_id,t.created_at,t.updated_at,
  case t.kind
    when 'category' then (select count(*) from public.products p where lower(btrim(p.category))=lower(t.name))
    when 'brand' then (select count(*) from public.products p where lower(btrim(p.brand))=lower(t.name))
    when 'gondola' then (select count(*) from public.products p where lower(btrim(p.gondola))=lower(t.name))
    when 'subcategory' then (
      select count(*) from public.products p
      where lower(btrim(p.subcategory))=lower(t.name)
        and coalesce(lower(btrim(p.category)),'') =
        coalesce((select lower(c.name) from public.product_taxonomy_terms c where c.id=t.parent_id),'')
    )
    else 0
  end::bigint as usage_count,
  (select count(*) from public.product_taxonomy_terms child where child.parent_id=t.id)::bigint as child_count
from public.product_taxonomy_terms t;
revoke all on public.site_product_taxonomy_usage_v1 from PUBLIC, anon, authenticated;
grant select on public.site_product_taxonomy_usage_v1 to service_role;

create or replace function public.site_product_taxonomy_manage_v1(
  p_action text, p_id uuid default null, p_kind text default null,
  p_name text default null, p_parent_id uuid default null
) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp
as $$
declare
  v_term public.product_taxonomy_terms%rowtype;
  v_parent public.product_taxonomy_terms%rowtype;
  v_name text := btrim(coalesce(p_name,''));
  v_count bigint := 0;
  v_children bigint := 0;
  v_parent_name text := '';
  v_new public.product_taxonomy_terms%rowtype;
begin
  if current_user not in ('service_role','postgres') then raise exception 'Acesso negado'; end if;
  if p_action = 'create' then
    if p_kind not in ('category','subcategory','brand','gondola') then raise exception 'Tipo inválido'; end if;
    if length(v_name) not between 1 and 100 then raise exception 'Informe um nome entre 1 e 100 caracteres'; end if;
    if p_kind = 'subcategory' and p_parent_id is not null then
      select * into v_parent from public.product_taxonomy_terms where id=p_parent_id and kind='category';
      if not found then raise exception 'Categoria não encontrada'; end if;
    elsif p_kind <> 'subcategory' and p_parent_id is not null then
      raise exception 'Este tipo não aceita categoria vinculada';
    end if;
    insert into public.product_taxonomy_terms(kind,name,parent_id)
    values(p_kind,v_name,case when p_kind='subcategory' then p_parent_id else null end)
    returning * into v_new;
    insert into public.admin_audit_logs(action,entity_type,entity_id,details)
      values('taxonomy_create','product_taxonomy',v_new.id::text,jsonb_build_object('kind',v_new.kind,'name',v_new.name));
    return jsonb_build_object('id',v_new.id,'affected',0,'action','create');
  end if;

  select * into v_term from public.product_taxonomy_terms where id=p_id for update;
  if not found then raise exception 'Classificação não encontrada'; end if;
  if v_term.parent_id is not null then
    select name into v_parent_name from public.product_taxonomy_terms where id=v_term.parent_id;
  end if;
  select usage_count, child_count into v_count,v_children
    from public.site_product_taxonomy_usage_v1 where id=p_id;

  if p_action = 'delete' then
    if v_count > 0 then raise exception 'Esta classificação está em uso por % produto(s). Renomeie antes de excluir',v_count; end if;
    if v_children > 0 then raise exception 'Remova primeiro as subcategorias desta categoria'; end if;
    delete from public.product_taxonomy_terms where id=p_id;
    insert into public.admin_audit_logs(action,entity_type,entity_id,details)
      values('taxonomy_delete','product_taxonomy',p_id::text,jsonb_build_object('kind',v_term.kind,'name',v_term.name));
    return jsonb_build_object('id',p_id,'affected',0,'action','delete');
  elsif p_action <> 'rename' then
    raise exception 'Operação inválida';
  end if;

  if length(v_name) not between 1 and 100 then raise exception 'Informe um nome entre 1 e 100 caracteres'; end if;
  if lower(v_name)=lower(v_term.name) and v_name=v_term.name then
    return jsonb_build_object('id',p_id,'affected',0,'action','rename');
  end if;
  update public.product_taxonomy_terms set name=v_name, updated_at=now() where id=p_id;
  if v_term.kind='category' then
    update public.products set category=v_name,updated_at=now()
      where lower(btrim(category))=lower(v_term.name);
  elsif v_term.kind='brand' then
    update public.products set brand=v_name,updated_at=now()
      where lower(btrim(brand))=lower(v_term.name);
  elsif v_term.kind='gondola' then
    update public.products set gondola=v_name,updated_at=now()
      where lower(btrim(gondola))=lower(v_term.name);
  elsif v_term.kind='subcategory' then
    update public.products set subcategory=v_name,updated_at=now()
      where lower(btrim(subcategory))=lower(v_term.name)
        and coalesce(lower(btrim(category)),'')=coalesce(lower(v_parent_name),'');
  end if;
  get diagnostics v_count = row_count;
  insert into public.admin_audit_logs(action,entity_type,entity_id,details)
    values('taxonomy_rename','product_taxonomy',p_id::text,
      jsonb_build_object('kind',v_term.kind,'from',v_term.name,'to',v_name,'affected_products',v_count));
  return jsonb_build_object('id',p_id,'affected',v_count,'action','rename');
exception
  when unique_violation then
    raise exception 'Já existe uma classificação com esse nome neste grupo';
end $$;
revoke all on function public.site_product_taxonomy_manage_v1(text,uuid,text,text,uuid) from PUBLIC, anon, authenticated;
grant execute on function public.site_product_taxonomy_manage_v1(text,uuid,text,text,uuid) to service_role;

select public.site_product_taxonomy_sync_v1();
