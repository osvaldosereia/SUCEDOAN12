-- sequence: whatsapp_ana_admin_events_v1_id_seq
create sequence if not exists private.whatsapp_ana_admin_events_v1_id_seq as bigint increment 1 minvalue 1 maxvalue 9223372036854775807 start 1;

-- sequence: whatsapp_ana_admin_versions_v1_id_seq
create sequence if not exists private.whatsapp_ana_admin_versions_v1_id_seq as bigint increment 1 minvalue 1 maxvalue 9223372036854775807 start 1;
