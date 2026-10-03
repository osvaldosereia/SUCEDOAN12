begin;

create table if not exists public.attendance_human_ai_audit_v1 (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  action text not null check (action in ('takeover','resume_ai','human_outbox_takeover','human_message')),
  admin_user_id uuid null,
  from_mode text null,
  to_mode text null,
  source text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists attendance_human_ai_audit_v1_conversation_created_idx
  on public.attendance_human_ai_audit_v1(conversation_id,created_at desc);

alter table public.attendance_human_ai_audit_v1 enable row level security;
revoke all on public.attendance_human_ai_audit_v1 from anon, authenticated;
grant select,insert on public.attendance_human_ai_audit_v1 to service_role;

create or replace function public.ops2_admin_attendance_takeover_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid:=auth.uid();
  v_conversation public.conversations%rowtype;
  v_before text;
begin
  if p_conversation_id is null then
    return jsonb_build_object('ok',false,'error','conversation_required');
  end if;
  if v_user is null or not exists (
    select 1 from public.admin_users a where a.user_id=v_user and a.is_active=true
  ) then
    return jsonb_build_object('ok',false,'error','admin_not_authorized');
  end if;

  select c.* into v_conversation
  from public.conversations c
  where c.id=p_conversation_id
  for update;
  if not found then
    return jsonb_build_object('ok',false,'error','conversation_not_found');
  end if;

  if v_conversation.mode='human'
     and v_conversation.assigned_admin_user_id is not null
     and v_conversation.assigned_admin_user_id<>v_user then
    return jsonb_build_object('ok',false,'error','conversation_owned_by_other_admin');
  end if;

  v_before:=v_conversation.mode;
  update public.conversations
  set mode='human',
      human_required=true,
      human_takeover_at=case when mode='human' then coalesce(human_takeover_at,now()) else now() end,
      ai_resume_at=null,
      assigned_admin_user_id=v_user,
      updated_at=now()
  where id=p_conversation_id
  returning * into v_conversation;

  if v_before is distinct from 'human' then
    insert into public.attendance_human_ai_audit_v1(conversation_id,action,admin_user_id,from_mode,to_mode,source)
    values (p_conversation_id,'takeover',v_user,v_before,'human','admin');
  end if;

  return jsonb_build_object(
    'ok',true,
    'conversation_id',v_conversation.id,
    'mode',v_conversation.mode,
    'human_takeover_at',v_conversation.human_takeover_at,
    'ai_resume_at',v_conversation.ai_resume_at,
    'assigned_admin_user_id',v_conversation.assigned_admin_user_id,
    'human_required',v_conversation.human_required
  );
end;
$function$;

create or replace function public.ops2_admin_attendance_resume_ai_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid:=auth.uid();
  v_conversation public.conversations%rowtype;
  v_before text;
begin
  if p_conversation_id is null then
    return jsonb_build_object('ok',false,'error','conversation_required');
  end if;
  if v_user is null or not exists (
    select 1 from public.admin_users a where a.user_id=v_user and a.is_active=true
  ) then
    return jsonb_build_object('ok',false,'error','admin_not_authorized');
  end if;

  select c.* into v_conversation
  from public.conversations c
  where c.id=p_conversation_id
  for update;
  if not found then
    return jsonb_build_object('ok',false,'error','conversation_not_found');
  end if;

  v_before:=v_conversation.mode;
  update public.conversations
  set mode='ai',
      human_required=false,
      ai_resume_at=now(),
      assigned_admin_user_id=null,
      updated_at=now()
  where id=p_conversation_id
  returning * into v_conversation;

  if v_before is distinct from 'ai' then
    insert into public.attendance_human_ai_audit_v1(conversation_id,action,admin_user_id,from_mode,to_mode,source)
    values (p_conversation_id,'resume_ai',v_user,v_before,'ai','admin');
  end if;

  return jsonb_build_object(
    'ok',true,
    'conversation_id',v_conversation.id,
    'mode',v_conversation.mode,
    'human_takeover_at',v_conversation.human_takeover_at,
    'ai_resume_at',v_conversation.ai_resume_at,
    'assigned_admin_user_id',v_conversation.assigned_admin_user_id,
    'human_required',v_conversation.human_required
  );
end;
$function$;

create or replace function public.ops2_attendance_ai_gate_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_conversation public.conversations%rowtype;
begin
  if p_conversation_id is null then
    return jsonb_build_object('ok',false,'error','conversation_required','allowed',false);
  end if;
  select c.* into v_conversation
  from public.conversations c
  where c.id=p_conversation_id;
  if not found then
    return jsonb_build_object('ok',false,'error','conversation_not_found','allowed',false);
  end if;
  return jsonb_build_object(
    'ok',true,
    'allowed',v_conversation.mode='ai' and v_conversation.human_required=false,
    'mode',v_conversation.mode,
    'human_required',v_conversation.human_required,
    'updated_at',v_conversation.updated_at
  );
end;
$function$;

create or replace function public.ops2_attendance_outbox_human_ai_guard_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_conversation public.conversations%rowtype;
  v_before text;
begin
  if new.conversation_id is null then
    return new;
  end if;

  if tg_op='INSERT' and new.purpose='human_attendance' then
    select c.* into v_conversation
    from public.conversations c
    where c.id=new.conversation_id
    for update;
    if not found then
      raise exception 'conversation_not_found';
    end if;
    v_before:=v_conversation.mode;
    if v_conversation.mode<>'human' or v_conversation.human_required=false then
      update public.conversations
      set mode='human',
          human_required=true,
          human_takeover_at=case when mode='human' then coalesce(human_takeover_at,now()) else now() end,
          ai_resume_at=null,
          updated_at=now()
      where id=new.conversation_id;
      insert into public.attendance_human_ai_audit_v1(conversation_id,action,from_mode,to_mode,source,metadata)
      values (new.conversation_id,'human_outbox_takeover',v_before,'human','outbox',jsonb_build_object('outbox_id',new.id));
    end if;
    return new;
  end if;

  if new.purpose='ai_attendance' and (
       tg_op='INSERT'
       or (tg_op='UPDATE' and old.status='queued' and new.status='claimed')
     ) then
    select c.* into v_conversation
    from public.conversations c
    where c.id=new.conversation_id
    for update;
    if not found then
      raise exception 'conversation_not_found';
    end if;
    if v_conversation.mode<>'ai' or v_conversation.human_required=true then
      raise exception 'ai_blocked_by_human_takeover';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists attendance_outbox_human_ai_guard_v1 on public.whatsapp_outbox_v1;
create trigger attendance_outbox_human_ai_guard_v1
before insert or update of status on public.whatsapp_outbox_v1
for each row execute function public.ops2_attendance_outbox_human_ai_guard_v1();

revoke all on function public.ops2_admin_attendance_takeover_v1(uuid) from public,anon;
revoke all on function public.ops2_admin_attendance_resume_ai_v1(uuid) from public,anon;
grant execute on function public.ops2_admin_attendance_takeover_v1(uuid) to authenticated,service_role;
grant execute on function public.ops2_admin_attendance_resume_ai_v1(uuid) to authenticated,service_role;
revoke all on function public.ops2_attendance_ai_gate_v1(uuid) from public,anon,authenticated;
grant execute on function public.ops2_attendance_ai_gate_v1(uuid) to service_role;
revoke all on function public.ops2_attendance_outbox_human_ai_guard_v1() from public,anon,authenticated;
grant execute on function public.ops2_attendance_outbox_human_ai_guard_v1() to service_role;

commit;
