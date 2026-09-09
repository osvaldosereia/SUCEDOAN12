begin;

-- O Admin/Supabase é a fonte oficial. A flag de canal estava nunca inicializada.
-- Ativamos o canal WhatsApp somente para produtos adotados, ativos, verificados e precificados.
-- Estoque continua sendo validado em tempo de consulta/adicao, portanto produto sem estoque nao aparece.
update public.products
set is_whatsapp_active=true,
    updated_at=now()
where is_active=true
  and physically_verified=true
  and coalesce(price,0)>0
  and coalesce(is_whatsapp_active,false)=false;

-- Produtos que deixaram de ser ativos/verificados/precificados nao devem permanecer habilitados no canal.
update public.products
set is_whatsapp_active=false,
    updated_at=now()
where coalesce(is_whatsapp_active,false)=true
  and (not coalesce(is_active,false) or not coalesce(physically_verified,false) or coalesce(price,0)<=0);

update public.experience_definitions
set config=coalesce(config,'{}'::jsonb)||jsonb_build_object(
      'product_channel_flag','products.is_whatsapp_active',
      'product_channel_initialization','active_verified_priced',
      'product_stock_checked_runtime',true
    ),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'implementation_stage','product_channel_activation_v12'
    ),
    updated_at=now()
where slug='flow-cestas-comercial-v1';

-- Seguranca enquanto o smoke final nao passa.
update public.automation_config
set whatsapp_live_canary_percent=1,
    experience_orchestrator_enabled=false,
    whatsapp_flow_data_exchange_enabled=false,
    whatsapp_flow_send_enabled=false,
    whatsapp_flow_commercial_write_enabled=false,
    bling_order_sync_enabled=false,
    updated_at=now()
where id=1;

commit;
