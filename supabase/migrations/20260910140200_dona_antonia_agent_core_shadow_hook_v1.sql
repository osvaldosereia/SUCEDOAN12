begin;

create or replace function public.agent_core_shadow_observe_ai_job_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='done' and new.conversation_id is not null and new.message_id is not null then
    begin
      perform public.observe_whatsapp_agent_core_turn_v1(new.conversation_id,new.message_id);
    exception when others then
      -- Observabilidade nunca pode quebrar o atendimento principal.
      null;
    end;
  end if;
  return new;
end $$;
revoke all on function public.agent_core_shadow_observe_ai_job_v1() from public,anon,authenticated;
grant execute on function public.agent_core_shadow_observe_ai_job_v1() to service_role;

drop trigger if exists trg_agent_core_shadow_observe_ai_job_v1 on public.ai_jobs;
create trigger trg_agent_core_shadow_observe_ai_job_v1
after insert or update of status on public.ai_jobs
for each row
when (new.status='done')
execute function public.agent_core_shadow_observe_ai_job_v1();

commit;