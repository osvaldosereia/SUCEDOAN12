begin;

update public.experience_definitions
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'new_customer_smoke_passed',true,
      'new_customer_smoke_passed_at',now(),
      'new_customer_smoke_rollback_clean',true,
      'new_customer_smoke_customer_registered',true,
      'new_customer_smoke_order_confirmed',true,
      'new_customer_smoke_session_completed',true,
      'implementation_stage','production_complete_v18'
    ),
    updated_at=now()
where slug='flow-cestas-comercial-v1';

commit;
