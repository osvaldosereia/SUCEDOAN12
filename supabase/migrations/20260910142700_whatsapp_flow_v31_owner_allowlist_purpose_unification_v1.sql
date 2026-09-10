begin;

-- Unify the V31 owner-only token issuer with the lease/preflight policy.
-- The only active owner authorization is controlled_live_homologation; no new
-- recipient is inserted here and all rollout gates remain fail-closed.
do $$
declare
  v_def text;
begin
  v_def:=pg_get_functiondef('public.issue_whatsapp_flow_owner_homologation_token_v1(uuid,text)'::regprocedure);

  if position('flow_v31_owner_homologation' in v_def)>0 then
    v_def:=replace(v_def,'flow_v31_owner_homologation','controlled_live_homologation');
    execute v_def;
  end if;
end $$;

revoke all on function public.issue_whatsapp_flow_owner_homologation_token_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.issue_whatsapp_flow_owner_homologation_token_v1(uuid,text) to service_role;

commit;
