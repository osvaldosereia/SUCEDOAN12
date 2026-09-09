begin;

update public.experience_definitions
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'production_final_smoke_passed',true,
      'production_final_smoke_passed_at',now(),
      'production_final_smoke_scope','basket_personalization_addon_review_existing_customer_checkout_order_confirmation',
      'test_order_persisted',false,
      'implementation_stage','production_smoke_passed_v14'
    ),
    updated_at=now()
where slug='flow-cestas-comercial-v1'
  and status='active'
  and config->>'live_percent'='100'
  and metadata->>'meta_status'='published';

-- Esta migration somente registra a prova já executada. Não altera gates.

commit;
