create or replace function public.get_agent_workflow_admin_v1()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); role_name text; out_stages jsonb; out_tools jsonb; cfg public.agent_workflow_settings%rowtype;
begin
  select role into role_name from public.admin_users where user_id=uid and is_active limit 1;
  if role_name is null then raise exception 'admin_not_authorized'; end if;
  select * into cfg from public.agent_workflow_settings where id=1;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.position),'[]'::jsonb) into out_stages from public.agent_workflow_stages s;
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'action_key',a.action_key,
        'risk_class',a.risk_class,
        'description',coalesce(a.description,'')
      ) order by a.action_key
    ),
    '[]'::jsonb
  ) into out_tools
  from public.ai_action_registry a
  where a.enabled;
  return jsonb_build_object('ok',true,'role',role_name,'settings',to_jsonb(cfg),'stages',out_stages,'tools',out_tools);
end;
$$;

revoke all on function public.get_agent_workflow_admin_v1() from public,anon;
grant execute on function public.get_agent_workflow_admin_v1() to authenticated,service_role;
