update public.marketing_runtime_config
set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
  'image_generation_quality','low',
  'image_variants_default',1,
  'video_mode','light_motion',
  'video_duration_seconds',10,
  'generative_video_enabled',false,
  'reuse_assets_first',true,
  'deterministic_first',true,
  'strategy_ai_enabled',false,
  'strategy_model','gpt-5.6-luna',
  'strategy_max_candidates',18,
  'strategy_max_output_tokens',900,
  'strategy_max_daily_calls',0,
  'strategy_lookback_days',14,
  'strategy_auto_escalation',false
),
updated_at=now()
where id=1;
