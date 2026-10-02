-- Dona Antônia — Central de Atendimento v2 / Fase 2
-- Organização interna: etiquetas e respostas rápidas. Sem relação com tags do PapoAI.

create table if not exists public.attendance_labels_v1 (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#5f6368',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_labels_v1_name_nonempty check (length(btrim(name)) between 1 and 60),
  constraint attendance_labels_v1_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$')
);
create unique index if not exists attendance_labels_v1_active_name_uidx on public.attendance_labels_v1(lower(btrim(name))) where is_active=true;

create table if not exists public.attendance_conversation_labels_v1 (
  conversation_id uuid not null,
  label_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (conversation_id,label_id),
  constraint attendance_conversation_labels_v1_conversation_fk foreign key (conversation_id) references public.conversations(id) on delete cascade,
  constraint attendance_conversation_labels_v1_label_fk foreign key (label_id) references public.attendance_labels_v1(id) on delete cascade
);
create index if not exists attendance_conversation_labels_v1_label_idx on public.attendance_conversation_labels_v1(label_id,conversation_id);

create table if not exists public.attendance_quick_replies_v1 (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  is_favorite boolean not null default true,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_quick_replies_v1_title_nonempty check (length(btrim(title)) between 1 and 80),
  constraint attendance_quick_replies_v1_content_nonempty check (length(btrim(content)) between 1 and 4000)
);
create unique index if not exists attendance_quick_replies_v1_active_title_uidx on public.attendance_quick_replies_v1(lower(btrim(title))) where is_active=true;

alter table public.attendance_labels_v1 enable row level security;
alter table public.attendance_conversation_labels_v1 enable row level security;
alter table public.attendance_quick_replies_v1 enable row level security;

revoke all on table public.attendance_labels_v1 from public,anon,authenticated;
revoke all on table public.attendance_conversation_labels_v1 from public,anon,authenticated;
revoke all on table public.attendance_quick_replies_v1 from public,anon,authenticated;
grant all on table public.attendance_labels_v1 to service_role;
grant all on table public.attendance_conversation_labels_v1 to service_role;
grant all on table public.attendance_quick_replies_v1 to service_role;

-- Migra as respostas rápidas atuais para dados editáveis. ON CONFLICT lógico é resolvido por título ativo.
insert into public.attendance_quick_replies_v1(title,content,is_favorite,sort_order,is_active)
select v.title,v.content,true,v.sort_order,true
from (values
  ('Pagamento','O pagamento é feito na entrega. Aceitamos PIX, dinheiro, cartão de crédito e cartão alimentação/refeição. 😊',10),
  ('Entrega','Entregamos em Cuiabá e Várzea Grande. Pedidos feitos após 12h em Cuiabá ficam para o dia seguinte.',20),
  ('Cidades atendidas','Atendemos Cuiabá e Várzea Grande.',30),
  ('Pedido pelo catálogo','Você pode fazer seu pedido direto pelo nosso catálogo: www.donaantonia.com.br',40),
  ('Prazo e horário','Pedidos feitos após 12h em Cuiabá são entregues no dia seguinte. Aos domingos e feriados nacionais não realizamos entregas.',50),
  ('Pedido recebido','Recebemos seu pedido 😊 Vou acompanhar por aqui.',60)
) as v(title,content,sort_order)
where not exists (
  select 1 from public.attendance_quick_replies_v1 q where lower(btrim(q.title))=lower(btrim(v.title)) and q.is_active=true
);

create or replace function public.ops2_admin_attendance_queue_v3(
  p_whatsapp_account_id uuid,
  p_limit integer default 50,
  p_search text default null,
  p_label_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_limit integer := least(50,greatest(1,coalesce(p_limit,50)));
  v_search text := nullif(btrim(coalesce(p_search,'')),'');
  v_account public.whatsapp_accounts%rowtype;
  v_rows jsonb;
begin
  select wa.* into v_account
  from public.whatsapp_accounts wa
  where wa.id=p_whatsapp_account_id and wa.is_active=true;
  if not found then return jsonb_build_object('ok',false,'error','whatsapp_account_not_found'); end if;

  if p_label_id is not null and not exists(select 1 from public.attendance_labels_v1 l where l.id=p_label_id and l.is_active=true) then
    return jsonb_build_object('ok',false,'error','attendance_label_not_found');
  end if;

  with queue_base as (
    select
      c.id as conversation_id,
      c.whatsapp_account_id,
      c.customer_id,
      coalesce(nullif(btrim(cu.name),''),public.canonical_whatsapp_e164_br_v2(c.wa_contact_e164),c.wa_contact_e164) as display_name,
      public.canonical_whatsapp_e164_br_v2(c.wa_contact_e164) as phone_e164,
      c.status,c.mode,c.stage,coalesce(c.human_required,false) as human_required,
      c.last_inbound_at,c.last_outbound_at,c.service_window_expires_at,
      coalesce(lm.message_at,c.created_at) as canonical_last_message_at,
      st.follow_up_at,
      coalesce(unread.unread_count,0)::integer as unread_count,
      lm.text_body as last_message_text,lm.message_type as last_message_type,lm.direction as last_message_direction,
      coalesce(lbl.labels,'[]'::jsonb) as labels,
      exists(select 1 from public.orders o where o.conversation_id=c.id or (c.customer_id is not null and o.customer_id=c.customer_id)) as has_order,
      case when c.customer_id is null then true else coalesce((public.ops2_customer_registration_state_v1(c.customer_id)->>'registration_complete')::boolean,false) is not true end as registration_incomplete
    from public.conversations c
    left join public.customers cu on cu.id=c.customer_id
    left join public.attendance_conversation_state_v1 st on st.conversation_id=c.id
    left join lateral (
      select count(*)::integer as unread_count from public.whatsapp_messages_v1 m
      where m.conversation_id=c.id and m.whatsapp_account_id=c.whatsapp_account_id and m.direction='inbound'
        and coalesce(m.received_at,m.sent_at,m.created_at)>coalesce(st.last_read_at,'epoch'::timestamptz)
    ) unread on true
    left join lateral (
      select m.text_body,m.message_type,m.direction,coalesce(m.received_at,m.sent_at,m.created_at) as message_at
      from public.whatsapp_messages_v1 m
      where m.conversation_id=c.id and m.whatsapp_account_id=c.whatsapp_account_id
      order by coalesce(m.received_at,m.sent_at,m.created_at) desc,m.created_at desc,m.id desc limit 1
    ) lm on true
    left join lateral (
      select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'color',l.color,'sort_order',l.sort_order) order by l.sort_order,l.name) as labels
      from public.attendance_conversation_labels_v1 cl
      join public.attendance_labels_v1 l on l.id=cl.label_id and l.is_active=true
      where cl.conversation_id=c.id
    ) lbl on true
    where c.whatsapp_account_id=p_whatsapp_account_id
      and (v_search is null or coalesce(cu.name,'') ilike '%'||v_search||'%' or coalesce(public.canonical_whatsapp_e164_br_v2(c.wa_contact_e164),c.wa_contact_e164,'') ilike '%'||v_search||'%')
      and (p_label_id is null or exists(select 1 from public.attendance_conversation_labels_v1 f where f.conversation_id=c.id and f.label_id=p_label_id))
  ), limited as (
    select q.* from queue_base q
    order by q.canonical_last_message_at desc,q.conversation_id limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'conversation_id',q.conversation_id,'whatsapp_account_id',q.whatsapp_account_id,'customer_id',q.customer_id,
    'display_name',q.display_name,'phone_e164',q.phone_e164,'status',q.status,'mode',q.mode,'stage',q.stage,'human_required',q.human_required,
    'unread_count',q.unread_count,'last_message_text',q.last_message_text,'last_message_type',q.last_message_type,'last_message_direction',q.last_message_direction,
    'last_message_at',q.canonical_last_message_at,'canonical_last_message_at',q.canonical_last_message_at,'last_activity_at',q.canonical_last_message_at,
    'last_inbound_at',q.last_inbound_at,'last_outbound_at',q.last_outbound_at,'service_window_expires_at',q.service_window_expires_at,
    'follow_up_at',q.follow_up_at,'has_order',q.has_order,'registration_incomplete',q.registration_incomplete,'labels',q.labels
  ) order by q.canonical_last_message_at desc,q.conversation_id),'[]'::jsonb) into v_rows from limited q;

  return jsonb_build_object('ok',true,'account',jsonb_build_object('id',v_account.id,'slug',v_account.slug,'display_name',v_account.display_name,'phone_e164',v_account.phone_e164),'limit',v_limit,'label_id',p_label_id,'items',v_rows);
end;
$$;

revoke all on function public.ops2_admin_attendance_queue_v3(uuid,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.ops2_admin_attendance_queue_v3(uuid,integer,text,uuid) to service_role;
