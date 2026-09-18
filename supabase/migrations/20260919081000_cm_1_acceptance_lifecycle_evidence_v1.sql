-- CM-1 Acceptance Checklist v1
-- Consolidates the 20 official CM-1 exit criteria into one read-only, auditable snapshot.
-- This function never authorizes external activation.

create or replace function public.cm1_acceptance_checklist_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $fn$
declare
  v_transport jsonb:=public.cm1_transport_evidence_v1();
  v_homologation jsonb:=public.cm1_homologation_readiness_v1();
  v_profile jsonb:=public.customer_commercial_profile_summary_v1();
  v_segments jsonb:=public.segment_engine_summary_v1();
  v_opportunities jsonb:=public.opportunity_engine_summary_v1();
  v_graph jsonb:=public.product_relation_graph_summary_v1();
  v_brain jsonb:=public.marketing_strategy_brief_summary_v1();
  v_meta jsonb:=public.get_meta_control_plane_snapshot_v1();
  v_catalog_open integer:=0;
  v_catalog_search integer:=0;
  v_product_view integer:=0;
  v_cart_events integer:=0;
  v_orders integer:=0;
  v_product_stats integer:=0;
  v_timeline integer:=0;
  v_marketing_events integer:=0;
  v_ai_exec integer:=0;
  v_ai_cost_recorded integer:=0;
  v_positive_consent integer:=0;
  v_strategy_ai_enabled boolean:=false;
  v_strategy_ai_daily_limit integer:=0;
  v_suggest_enabled boolean:=false;
  v_meta_contract boolean:=false;
  v_opportunity_total integer:=0;
  v_opportunity_closed integer:=0;
  v_items jsonb;
  v_verified integer:=0;
  v_implemented integer:=0;
  v_blocked integer:=0;
begin
  select
    count(*) filter(where event_type='catalog_open'),
    count(*) filter(where event_type='catalog_search'),
    count(*) filter(where event_type='product_view'),
    count(*) filter(where event_type in ('catalog_add','catalog_remove','catalog_checkout_return'))
  into v_catalog_open,v_catalog_search,v_product_view,v_cart_events
  from public.catalog_events;

  select count(*) into v_orders from public.orders;
  select count(*) into v_product_stats from public.customer_product_stats;
  select count(*) into v_timeline from public.customer_timeline_v1;
  select count(*) into v_marketing_events from public.marketing_events;
  select
    count(*),
    count(*) filter(where status in ('dismissed','converted','expired'))
  into v_opportunity_total,v_opportunity_closed
  from public.customer_marketing_opportunities;
  select
    count(*),
    count(*) filter(where estimated_cost_brl is not null or actual_cost_brl is not null)
  into v_ai_exec,v_ai_cost_recorded
  from public.ai_action_executions;

  select count(distinct customer_id)
  into v_positive_consent
  from public.customer_consent_current_v1
  where channel='whatsapp' and purpose='marketing' and status='granted';

  select
    coalesce((metadata->>'strategy_ai_enabled')::boolean,false),
    coalesce((metadata->>'strategy_max_daily_calls')::integer,0),
    coalesce((metadata->>'opportunity_suggest_enabled')::boolean,false)
  into v_strategy_ai_enabled,v_strategy_ai_daily_limit,v_suggest_enabled
  from public.marketing_runtime_config
  where id=1;

  select coalesce((capabilities->>'meta_control_plane_contract')::boolean,false)
  into v_meta_contract
  from public.channel_accounts
  where channel='whatsapp' and status='active'
  order by updated_at desc
  limit 1;

  v_items:=jsonb_build_array(
    jsonb_build_object(
      'no',1,'key','contact_ingested','label','Cliente entra em contato',
      'status',case when coalesce((v_transport->>'receipts')::int,0)>0 then 'verified' else 'implemented' end,
      'evidence',jsonb_build_object('provider',v_transport->>'provider','receipts',coalesce((v_transport->>'receipts')::int,0),'last_event_at',v_transport->'provider_last_event_at')
    ),
    jsonb_build_object(
      'no',2,'key','identity_resolved','label','Sistema resolve identidade',
      'status',case when coalesce((v_transport->>'customer_linked')::int,0)>0
                          and coalesce((v_homologation->'counters'->>'identity_conflicts_pending')::int,0)=0
                    then 'verified' else 'implemented' end,
      'evidence',jsonb_build_object(
        'customer_linked',coalesce((v_transport->>'customer_linked')::int,0),
        'provider_identities',coalesce((v_transport->>'provider_identities')::int,0),
        'pending_conflicts',coalesce((v_homologation->'counters'->>'identity_conflicts_pending')::int,0)
      )
    ),
    jsonb_build_object(
      'no',3,'key','customer_360_updates','label','Customer 360 atualiza',
      'status',case when coalesce((v_profile->>'customer_count')::int,0)>0
                          and coalesce((v_transport->>'provider_identities')::int,0)>0
                    then 'verified' else 'implemented' end,
      'evidence',jsonb_build_object(
        'customer_count',coalesce((v_profile->>'customer_count')::int,0),
        'provider_identities',coalesce((v_transport->>'provider_identities')::int,0),
        'profile_version',v_profile->>'version'
      )
    ),
    jsonb_build_object(
      'no',4,'key','conversation_event','label','Conversa vira evento',
      'status',case when coalesce((v_transport->>'normalized_linked')::int,0)>0 then 'verified' else 'implemented' end,
      'evidence',jsonb_build_object(
        'normalized_linked',coalesce((v_transport->>'normalized_linked')::int,0),
        'canonical_events_24h',coalesce((v_transport->>'canonical_events_24h')::int,0)
      )
    ),
    jsonb_build_object(
      'no',5,'key','catalog_event','label','Catálogo vira evento',
      'status',case when v_catalog_open>0 then 'verified' else 'implemented' end,
      'evidence',jsonb_build_object('catalog_open',v_catalog_open)
    ),
    jsonb_build_object(
      'no',6,'key','search_event','label','Busca vira evento',
      'status',case when v_catalog_search>0 then 'verified'
                    when to_regprocedure('public.record_catalog_interaction_v1(uuid,text,uuid,jsonb,integer)') is not null then 'implemented'
                    else 'blocked' end,
      'evidence',jsonb_build_object(
        'catalog_search',v_catalog_search,
        'collector_present',to_regprocedure('public.record_catalog_interaction_v1(uuid,text,uuid,jsonb,integer)') is not null,
        'note',case when v_catalog_search=0 then 'collector_homologado; aguardando uso real apos deploy' else 'trafego observado' end
      )
    ),
    jsonb_build_object(
      'no',7,'key','product_view_event','label','Produto visualizado vira evento',
      'status',case when v_product_view>0 then 'verified'
                    when to_regprocedure('public.record_catalog_interaction_v1(uuid,text,uuid,jsonb,integer)') is not null then 'implemented'
                    else 'blocked' end,
      'evidence',jsonb_build_object(
        'product_view',v_product_view,
        'collector_present',to_regprocedure('public.record_catalog_interaction_v1(uuid,text,uuid,jsonb,integer)') is not null,
        'note',case when v_product_view=0 then 'collector_homologado; aguardando uso real apos deploy' else 'trafego observado' end
      )
    ),
    jsonb_build_object(
      'no',8,'key','cart_event','label','Carrinho vira evento',
      'status',case when v_cart_events>0 then 'verified' else 'implemented' end,
      'evidence',jsonb_build_object('catalog_cart_events',v_cart_events)
    ),
    jsonb_build_object(
      'no',9,'key','order_event','label','Pedido vira evento',
      'status',case when v_orders>0 then 'verified' else 'implemented' end,
      'evidence',jsonb_build_object('orders',v_orders,'timeline_rows',v_timeline)
    ),
    jsonb_build_object(
      'no',10,'key','commercial_profile_recalculates','label','Perfil comercial recalcula',
      'status',case when coalesce((v_profile->>'with_purchase_history')::int,0)>0
                          and to_regprocedure('public.get_customer_commercial_profile_v1(uuid,integer,integer,integer)') is not null
                    then 'verified' else 'implemented' end,
      'evidence',jsonb_build_object(
        'with_purchase_history',coalesce((v_profile->>'with_purchase_history')::int,0),
        'profile_version',v_profile->>'version'
      )
    ),
    jsonb_build_object(
      'no',11,'key','affinities_update','label','Afinidades atualizam',
      'status',case when v_product_stats>0 and coalesce((v_graph->>'edges')::int,0)>0 then 'verified' else 'implemented' end,
      'evidence',jsonb_build_object('customer_product_stats',v_product_stats,'graph_edges',coalesce((v_graph->>'edges')::int,0),'graph_version',v_graph->>'version')
    ),
    jsonb_build_object(
      'no',12,'key','segment_changes','label','Segmento muda dinamicamente',
      'status',case when coalesce((v_segments->>'customer_count')::int,0)>0
                          and (select count(*) from jsonb_object_keys(coalesce(v_segments->'segments','{}'::jsonb)))>0
                    then 'verified' else 'implemented' end,
      'evidence',jsonb_build_object('customers',coalesce((v_segments->>'customer_count')::int,0),'engine_version',v_segments->>'engine_version')
    ),
    jsonb_build_object(
      'no',13,'key','opportunity_lifecycle','label','Oportunidade é criada/removida',
      'status',case
        when v_opportunity_total>0 and v_opportunity_closed>0 then 'verified'
        when v_opportunity_total>0
             and to_regprocedure('public.evaluate_customer_opportunities_v1(uuid)') is not null
          then 'implemented'
        else 'blocked'
      end,
      'evidence',jsonb_build_object(
        'active_total',coalesce((v_opportunities->>'active_total')::int,0),
        'suppressed',coalesce((v_opportunities->>'suppressed')::int,0),
        'historical_total',v_opportunity_total,
        'closed_lifecycle',v_opportunity_closed,
        'engine_version',v_opportunities->>'engine_version',
        'note',case
          when v_opportunity_closed>0 then 'lifecycle real de remocao/encerramento observado'
          else 'criacao observada; aguardando lifecycle real sem fixture persistente'
        end
      )
    ),
    jsonb_build_object(
      'no',14,'key','consent_respected','label','Consentimento é respeitado',
      'status',case when v_positive_consent=0
                          and coalesce((v_opportunities->>'active_total')::int,0)>0
                          and coalesce((v_opportunities->>'actionable')::int,0)=0
                    then 'verified'
                    when to_regprocedure('public.evaluate_customer_contact_eligibility_v1(uuid,text,text)') is not null then 'implemented'
                    else 'blocked' end,
      'evidence',jsonb_build_object(
        'positive_marketing_consent_customers',v_positive_consent,
        'opportunities',coalesce((v_opportunities->>'active_total')::int,0),
        'actionable',coalesce((v_opportunities->>'actionable')::int,0),
        'suppressed',coalesce((v_opportunities->>'suppressed')::int,0)
      )
    ),
    jsonb_build_object(
      'no',15,'key','marketing_brain_suggests','label','Marketing Brain consegue sugerir estratégia',
      'status',case when coalesce((v_brain->>'briefs')::int,0)>0 then 'verified'
                    when to_regprocedure('public.marketing_strategy_brief_summary_v1()') is not null then 'implemented'
                    else 'blocked' end,
      'evidence',jsonb_build_object(
        'briefs',coalesce((v_brain->>'briefs')::int,0),
        'engine_version',v_brain->>'engine_version',
        'suggest_enabled',v_suggest_enabled,
        'note','capacidade pronta; SUGGEST permanece fechado durante homologacao'
      )
    ),
    jsonb_build_object(
      'no',16,'key','audit_complete','label','Tudo fica auditado',
      'status',case when v_timeline>0 and v_marketing_events>0 and coalesce((v_transport->>'receipts')::int,0)>0 then 'verified' else 'implemented' end,
      'evidence',jsonb_build_object('timeline_rows',v_timeline,'marketing_events',v_marketing_events,'provider_receipts',coalesce((v_transport->>'receipts')::int,0))
    ),
    jsonb_build_object(
      'no',17,'key','no_improper_external_action','label','Nenhuma ação externa indevida é executada',
      'status',case when coalesce((v_homologation->>'safe_for_internal_homologation')::boolean,false)
                          and coalesce((v_homologation->'counters'->>'marketing_external_side_effects_7d')::int,0)=0
                          and coalesce((v_homologation->'counters'->>'ai_side_effects_7d')::int,0)=0
                    then 'verified' else 'blocked' end,
      'evidence',jsonb_build_object(
        'safe_for_internal_homologation',coalesce((v_homologation->>'safe_for_internal_homologation')::boolean,false),
        'marketing_external_side_effects_7d',coalesce((v_homologation->'counters'->>'marketing_external_side_effects_7d')::int,0),
        'ai_side_effects_7d',coalesce((v_homologation->'counters'->>'ai_side_effects_7d')::int,0),
        'external_activation_authorized',false
      )
    ),
    jsonb_build_object(
      'no',18,'key','ai_cost_measured','label','Custo de IA é medido',
      'status',case when exists(
                          select 1
                          from information_schema.columns
                          where table_schema='public' and table_name='ai_action_executions'
                            and column_name in ('estimated_cost_brl','actual_cost_brl')
                          group by table_schema,table_name
                          having count(*)=2
                        )
                    then case when v_ai_cost_recorded>0 then 'verified' else 'implemented' end
                    else 'blocked' end,
      'evidence',jsonb_build_object(
        'ai_executions',v_ai_exec,
        'executions_with_cost_record',v_ai_cost_recorded,
        'strategy_daily_limit',v_strategy_ai_daily_limit,
        'current_budget_brl',coalesce((v_homologation->'marketing'->>'max_daily_ai_cost_cents')::numeric,0)/100
      )
    ),
    jsonb_build_object(
      'no',19,'key','deterministic_first','label','Tarefa determinística não usa IA sem necessidade',
      'status',case when not v_strategy_ai_enabled
                          and v_strategy_ai_daily_limit=0
                          and coalesce((v_homologation->'marketing'->>'max_daily_ai_cost_cents')::int,0)=0
                    then 'verified' else 'blocked' end,
      'evidence',jsonb_build_object(
        'strategy_ai_enabled',v_strategy_ai_enabled,
        'strategy_max_daily_calls',v_strategy_ai_daily_limit,
        'ai_executions',v_ai_exec,
        'note','segmentos, readiness, graph, perfil, oportunidade e protecao usam SQL/codigo deterministico'
      )
    ),
    jsonb_build_object(
      'no',20,'key','meta_ready_architecture','label','Arquitetura permanece pronta para conexão direta Meta',
      'status',case when v_meta_contract
                          and coalesce((v_homologation->'canonical_channel'->>'outbound_enabled')::boolean,false)=false
                          and coalesce((v_homologation->'whatsapp_direct'->>'enabled')::boolean,false)=false
                    then 'verified' else 'blocked' end,
      'evidence',jsonb_build_object(
        'meta_control_plane_contract',v_meta_contract,
        'meta_foundation_version',v_meta->>'version',
        'meta_direct_ready',coalesce((v_homologation->'canonical_channel'->>'meta_direct_ready')::boolean,false),
        'whatsapp_direct_enabled',coalesce((v_homologation->'whatsapp_direct'->>'enabled')::boolean,false),
        'note','arquitetura pronta; ativacao direta continua fora da homologacao interna'
      )
    )
  );

  select
    count(*) filter(where item->>'status'='verified'),
    count(*) filter(where item->>'status'='implemented'),
    count(*) filter(where item->>'status'='blocked')
  into v_verified,v_implemented,v_blocked
  from jsonb_array_elements(v_items) item;

  return jsonb_build_object(
    'version','cm1-acceptance-v1.1',
    'generated_at',now(),
    'criteria_total',20,
    'verified_count',v_verified,
    'implemented_count',v_implemented,
    'blocked_count',v_blocked,
    'manual_gate_count',5,
    'ready_for_manual_canary',(v_blocked=0 and coalesce((v_homologation->>'safe_for_internal_homologation')::boolean,false)),
    'cm1_complete',false,
    'external_activation_authorized',false,
    'items',v_items,
    'manual_gates',coalesce(v_homologation->'manual_gates','{}'::jsonb),
    'external_side_effect',false
  );
end;
$fn$;

revoke all on function public.cm1_acceptance_checklist_v1() from public,anon,authenticated;
grant execute on function public.cm1_acceptance_checklist_v1() to service_role;
