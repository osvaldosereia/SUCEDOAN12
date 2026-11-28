-- sequence: order_events_id_seq
create sequence if not exists whatsapp_atendimento.order_events_id_seq as bigint increment 1 minvalue 1 maxvalue 9223372036854775807 start 1;

-- sequence: order_items_id_seq
create sequence if not exists whatsapp_atendimento.order_items_id_seq as bigint increment 1 minvalue 1 maxvalue 9223372036854775807 start 1;

-- sequence: outbox_pending_status_events_id_seq
create sequence if not exists whatsapp_atendimento.outbox_pending_status_events_id_seq as bigint increment 1 minvalue 1 maxvalue 9223372036854775807 start 1;

-- sequence: webhook_events_id_seq
create sequence if not exists whatsapp_atendimento.webhook_events_id_seq as bigint increment 1 minvalue 1 maxvalue 9223372036854775807 start 1;
