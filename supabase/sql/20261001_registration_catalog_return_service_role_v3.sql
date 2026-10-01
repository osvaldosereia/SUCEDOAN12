-- Dona Antônia — restringe retorno pós-cadastro ao servidor
-- 2026-10-01
-- O navegador chama a Edge Function. Somente a service_role executa a RPC SECURITY DEFINER.

revoke all on function public.ops2_issue_registration_catalog_return_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ops2_issue_registration_catalog_return_v1(uuid,uuid) to service_role;
