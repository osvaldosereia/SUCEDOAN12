create or replace function public.admin1_reorder_basket_sizes_v1(p_size_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(array_length(p_size_ids, 1), 0) <> (select count(*) from public.admin1_basket_sizes) then
    raise exception using errcode = '23514', message = 'A lista de tamanhos mudou. Atualize a tela e tente novamente.';
  end if;
  if (select count(distinct item) from unnest(p_size_ids) item) <> array_length(p_size_ids, 1) then
    raise exception using errcode = '23514', message = 'A ordem contém tamanhos repetidos.';
  end if;
  if exists (select 1 from unnest(p_size_ids) item left join public.admin1_basket_sizes s on s.id = item where s.id is null) then
    raise exception using errcode = '23514', message = 'Um dos tamanhos não existe mais.';
  end if;
  update public.admin1_basket_sizes s
  set sort_order = ordered.ordinality - 1, updated_at = now()
  from unnest(p_size_ids) with ordinality as ordered(id, ordinality)
  where s.id = ordered.id;
end;
$$;
grant execute on function public.admin1_reorder_basket_sizes_v1(uuid[]) to anon, authenticated;
