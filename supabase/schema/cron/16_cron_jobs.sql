-- cron_job: bling-hub-v2-cycle
-- active: t
select cron.schedule('bling-hub-v2-cycle', '*/2 * * * *', 'select public.dispatch_bling_hub_cycle_v2();');

-- cron_job: capineca_b2b_retention
-- active: t
select cron.schedule('capineca_b2b_retention', '35 4 * * *', '
      select net.http_post(
        url := ''https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/capineca-b2b'',
        headers := jsonb_build_object(
          ''Content-Type'', ''application/json'',
          ''apikey'', (select decrypted_secret from vault.decrypted_secrets where name = ''capineca_b2b_anon_key'' limit 1),
          ''Authorization'', ''Bearer '' || (select decrypted_secret from vault.decrypted_secrets where name = ''capineca_b2b_anon_key'' limit 1)
        ),
        body := jsonb_build_object(''action'', ''cleanup''),
        timeout_milliseconds := 60000
      );
    ');

-- cron_job: da-instagram-automation-v1
-- active: t
select cron.schedule('da-instagram-automation-v1', '*/5 * * * *', 'select private.da_instagram_automation_cron_tick_v1();');

-- cron_job: da-offer-cycle-v1
-- active: t
select cron.schedule('da-offer-cycle-v1', '0 4 * * *', 'select private.da_offer_cycle_with_status_images_v1();');

-- cron_job: dona-papoai-guard-drain-v1
-- active: t
select cron.schedule('dona-papoai-guard-drain-v1', '10 seconds', 'select public.whatsapp_papoai_guard_drain_v1(12)');

-- cron_job: fiscal-ai-autonomous-worker-v1
-- active: f
select cron.schedule('fiscal-ai-autonomous-worker-v1', '* * * * *', 'select public.run_fiscal_ai_worker_tick_v1();');

-- cron_job: fiscal-nfe-autorecovery-v1
-- active: f
select cron.schedule('fiscal-nfe-autorecovery-v1', '*/5 * * * *', 'select public.dispatch_fiscal_nfe_autorecovery_v1();');

-- cron_job: inventory-label-worker-da6-v1
-- active: f
select cron.schedule('inventory-label-worker-da6-v1', '* * * * *', 'select public.da6_worker_dispatch_tick_v1();');

-- cron_job: marketing-campaign-worker-v1
-- active: f
select cron.schedule('marketing-campaign-worker-v1', '* * * * *', 'select public.run_marketing_campaign_worker_tick_v1();');

-- cron_job: oscb-catalog-worker-v1
-- active: f
select cron.schedule('oscb-catalog-worker-v1', '*/30 * * * *', '
 select net.http_post(
   url:=(select decrypted_secret from vault.decrypted_secrets where name=''oscb_catalog_project_url_v1'')||''/functions/v1/oscb-catalog-worker-v1'',
   headers:=jsonb_build_object(
     ''Content-Type'',''application/json'',
     ''apikey'',(select decrypted_secret from vault.decrypted_secrets where name=''oscb_catalog_publishable_key_v1''),
     ''Authorization'',''Bearer ''||(select decrypted_secret from vault.decrypted_secrets where name=''oscb_catalog_publishable_key_v1''),
     ''x-oscb-worker-secret'',(select decrypted_secret from vault.decrypted_secrets where name=''oscb_catalog_worker_secret_v1'')
   ),
   body:=''{}''::jsonb,
   timeout_milliseconds:=120000
 );
 ');

-- cron_job: product-catalog-enrichment-v1
-- active: f
select cron.schedule('product-catalog-enrichment-v1', '*/15 * * * *', '
      select net.http_post(
        url:=(select decrypted_secret from vault.decrypted_secrets where name=''product_catalog_enrichment_project_url_v1'')||''/functions/v1/product-catalog-enrichment-v1'',
        headers:=jsonb_build_object(
          ''Content-Type'',''application/json'',
          ''apikey'',(select decrypted_secret from vault.decrypted_secrets where name=''product_catalog_enrichment_publishable_key_v1''),
          ''Authorization'',''Bearer ''||(select decrypted_secret from vault.decrypted_secrets where name=''product_catalog_enrichment_publishable_key_v1''),
          ''x-product-catalog-worker-secret'',(select decrypted_secret from vault.decrypted_secrets where name=''product_catalog_enrichment_worker_secret_v1'')
        ),
        body:=''{"limit":5}''::jsonb,
        timeout_milliseconds:=120000
      );
    ');

-- cron_job: purchase-xml-daily-v1
-- active: f
select cron.schedule('purchase-xml-daily-v1', '0 10,22 * * *', 'select public.dispatch_purchase_xml_daily_v1();');
