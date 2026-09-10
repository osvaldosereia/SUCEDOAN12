update public.experience_definitions
set config=coalesce(config,'{}'::jsonb)||jsonb_build_object('flow_cta','Escolher cesta','flow_action','data_exchange'),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('customer_exposure',true,'production_enabled',true,'meta_validation_passed',true),
    updated_at=now()
where slug='flow-cestas-escolha-v1';
