create index if not exists product_gondola_assignments_gondola_idx
  on public.product_gondola_assignments (gondola_id);

create index if not exists inventory_balance_entries_product_idx
  on public.inventory_balance_entries (product_id);

drop policy if exists "service_role_gondolas" on public.warehouse_gondolas;
create policy "service_role_gondolas"
  on public.warehouse_gondolas
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "service_role_product_gondolas" on public.product_gondola_assignments;
create policy "service_role_product_gondolas"
  on public.product_gondola_assignments
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "service_role_balance_entries" on public.inventory_balance_entries;
create policy "service_role_balance_entries"
  on public.inventory_balance_entries
  for all
  to service_role
  using (true)
  with check (true);
