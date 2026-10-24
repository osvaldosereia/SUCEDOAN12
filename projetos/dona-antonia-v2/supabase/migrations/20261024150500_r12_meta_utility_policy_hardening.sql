-- R12 follow-up: avoid overlapping permissive policies on utility tables.

drop policy utility_settings_admin_write on da_next.whatsapp_utility_settings;
create policy utility_settings_admin_insert on da_next.whatsapp_utility_settings
  for insert to authenticated with check (da_next.has_permission('admin.all'));
create policy utility_settings_admin_update on da_next.whatsapp_utility_settings
  for update to authenticated
  using (da_next.has_permission('admin.all'))
  with check (da_next.has_permission('admin.all'));
create policy utility_settings_admin_delete on da_next.whatsapp_utility_settings
  for delete to authenticated using (da_next.has_permission('admin.all'));

drop policy utility_templates_admin_write on da_next.whatsapp_utility_templates;
create policy utility_templates_admin_insert on da_next.whatsapp_utility_templates
  for insert to authenticated with check (da_next.has_permission('admin.all'));
create policy utility_templates_admin_update on da_next.whatsapp_utility_templates
  for update to authenticated
  using (da_next.has_permission('admin.all'))
  with check (da_next.has_permission('admin.all'));
create policy utility_templates_admin_delete on da_next.whatsapp_utility_templates
  for delete to authenticated using (da_next.has_permission('admin.all'));

drop policy utility_messages_admin_write on da_next.whatsapp_utility_messages;
create policy utility_messages_admin_insert on da_next.whatsapp_utility_messages
  for insert to authenticated with check (da_next.has_permission('admin.all'));
create policy utility_messages_admin_update on da_next.whatsapp_utility_messages
  for update to authenticated
  using (da_next.has_permission('admin.all'))
  with check (da_next.has_permission('admin.all'));
create policy utility_messages_admin_delete on da_next.whatsapp_utility_messages
  for delete to authenticated using (da_next.has_permission('admin.all'));
