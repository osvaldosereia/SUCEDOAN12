create policy "service role manages saved cards"
  on public.admin_saved_cards_v1
  for all
  to service_role
  using (true)
  with check (true);

create policy "service role manages saved card usage"
  on public.admin_saved_card_uses_v1
  for all
  to service_role
  using (true)
  with check (true);