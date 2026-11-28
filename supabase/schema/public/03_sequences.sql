-- sequence: bling_hub_audit_v2_id_seq
create sequence if not exists public.bling_hub_audit_v2_id_seq as bigint increment 1 minvalue 1 maxvalue 9223372036854775807 start 1;

-- sequence: cosmos_research_requests_id_seq
create sequence if not exists public.cosmos_research_requests_id_seq as bigint increment 1 minvalue 1 maxvalue 9223372036854775807 start 1;

-- sequence: da_instagram_job_events_v1_id_seq
create sequence if not exists public.da_instagram_job_events_v1_id_seq as bigint increment 1 minvalue 1 maxvalue 9223372036854775807 start 1;

-- sequence: fiscal_ai_family_jobs_id_seq
create sequence if not exists public.fiscal_ai_family_jobs_id_seq as bigint increment 1 minvalue 1 maxvalue 9223372036854775807 start 1;

-- sequence: fiscal_nfe_recovery_events_v1_id_seq
create sequence if not exists public.fiscal_nfe_recovery_events_v1_id_seq as bigint increment 1 minvalue 1 maxvalue 9223372036854775807 start 1;

-- sequence: order_public_code_seq_v1
create sequence if not exists public.order_public_code_seq_v1 as bigint increment 1 minvalue 0 maxvalue 675999 start 0;

-- sequence: si5_research_requests_id_seq
create sequence if not exists public.si5_research_requests_id_seq as bigint increment 1 minvalue 1 maxvalue 9223372036854775807 start 1;

-- sequence: storefront_identity_resolve_attempts_id_seq
create sequence if not exists public.storefront_identity_resolve_attempts_id_seq as bigint increment 1 minvalue 1 maxvalue 9223372036854775807 start 1;

-- sequence: whatsapp_papoai_status_queue_v1_id_seq
create sequence if not exists public.whatsapp_papoai_status_queue_v1_id_seq as bigint increment 1 minvalue 1 maxvalue 9223372036854775807 start 1;
