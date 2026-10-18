begin;

-- Editable starter presets. They are drafts only and perform no render, AI call or publication.

insert into public.marketing_command_presets(command_key,version,name,media_kind,generation_mode,provider_hint,command_text,variables,settings,status)
values
('oferta_produto_quadrado',1,'Oferta de produto quadrada','image','no_ai','deterministic_renderer','Usar a foto real do produto sem alterar embalagem, centralizar sobre fundo claro uniforme, destacar nome e preço, aplicar logo Dona Antônia discreto e manter leitura rápida em celular.','{"product_name":"text","price":"money","product_image":"image","cta":"text"}'::jsonb,'{"editable":true,"canvas":"1080x1080","safe_area":true,"prefer_real_product_photo":true}'::jsonb,'draft'),
('story_status_oferta_vertical',1,'Story e Status de oferta','image','no_ai','deterministic_renderer','Criar arte vertical com foto real do produto, nome, preço, chamada curta e logo Dona Antônia. Priorizar contraste, poucas palavras e área segura para Story/Status.','{"product_name":"text","price":"money","product_image":"image","cta":"text"}'::jsonb,'{"editable":true,"canvas":"1080x1920","safe_area":true,"prefer_real_product_photo":true}'::jsonb,'draft'),
('carrossel_ofertas',1,'Carrossel de ofertas','carousel','no_ai','deterministic_renderer','Montar carrossel consistente com capa curta e cards de produtos usando foto real, nome e preço. Não repetir visual excessivamente e preservar identidade Dona Antônia.','{"products":"array","headline":"text","cta":"text"}'::jsonb,'{"editable":true,"item_canvas":"1080x1350","max_items":10,"prefer_real_product_photo":true}'::jsonb,'draft'),
('pin_produto_vertical',1,'Pin vertical de produto','image','no_ai','deterministic_renderer','Criar imagem vertical para Pinterest com produto real em destaque, nome, preço ou benefício quando aplicável, marca Dona Antônia e composição limpa.','{"product_name":"text","price":"money","product_image":"image","cta":"text"}'::jsonb,'{"editable":true,"canvas":"1000x1500","safe_area":true,"prefer_real_product_photo":true}'::jsonb,'draft'),
('video_ofertas_economico',1,'Vídeo econômico de ofertas','video','no_ai','deterministic_renderer','Gerar vídeo curto a partir de fotos reais dos produtos com zoom suave, entradas e saídas, preço, nome, transições simples e CTA final. Não gerar pixels com IA; usar renderer/FFmpeg.','{"products":"array","headline":"text","cta":"text"}'::jsonb,'{"editable":true,"canvas":"1080x1920","fps":30,"default_seconds":15,"renderer":"ffmpeg","audio":"optional"}'::jsonb,'draft'),
('imagem_produto_ia_opcional',1,'Imagem de campanha com IA opcional','image','ai','auto','Criar uma peça publicitária mantendo o produto fiel à referência, sem inventar embalagem, marca, volume ou preço. O fundo e a composição podem ser gerados por IA conforme briefing; texto e preço devem vir de dados determinísticos.','{"product_name":"text","price":"money","product_image":"image","brief":"text"}'::jsonb,'{"editable":true,"requires_ai_gate":true,"requires_cost_budget":true,"product_fidelity_required":true}'::jsonb,'draft'),
('video_campanha_ia_opcional',1,'Vídeo de campanha com IA opcional','video','ai','auto','Gerar vídeo publicitário curto somente quando o gate de vídeo IA e o orçamento estiverem autorizados. Preservar marca e produto fiel às referências e evitar texto/preço inventado.','{"product_name":"text","product_image":"image","brief":"text"}'::jsonb,'{"editable":true,"requires_ai_gate":true,"requires_cost_budget":true,"product_fidelity_required":true,"default_seconds":8}'::jsonb,'draft')
on conflict(command_key,version) do nothing;

insert into public.marketing_content_templates(template_key,version,name,media_kind,canvas_spec,layout_spec,brand_spec,variable_schema,status)
values
('square_offer',1,'Oferta quadrada 1:1','image','{"width":1080,"height":1080,"format":"webp"}'::jsonb,'{"zones":["headline","product","price","cta","brand"],"safe_area":48}'::jsonb,'{"brand":"dona_antonia","editable":true}'::jsonb,'{"headline":"text","product_image":"image","product_name":"text","price":"money","cta":"text"}'::jsonb,'draft'),
('vertical_story_status',1,'Story e Status 9:16','image','{"width":1080,"height":1920,"format":"webp"}'::jsonb,'{"zones":["headline","product","price","cta","brand"],"safe_area":{"top":180,"bottom":220,"left":64,"right":64}}'::jsonb,'{"brand":"dona_antonia","editable":true}'::jsonb,'{"headline":"text","product_image":"image","product_name":"text","price":"money","cta":"text"}'::jsonb,'draft'),
('instagram_carousel_card',1,'Card de carrossel 4:5','carousel','{"width":1080,"height":1350,"format":"webp"}'::jsonb,'{"zones":["headline","product","price","brand"],"safe_area":56,"max_items":10}'::jsonb,'{"brand":"dona_antonia","editable":true}'::jsonb,'{"products":"array","headline":"text","cta":"text"}'::jsonb,'draft'),
('pinterest_vertical',1,'Pinterest 2:3','image','{"width":1000,"height":1500,"format":"webp"}'::jsonb,'{"zones":["headline","product","price","cta","brand"],"safe_area":54}'::jsonb,'{"brand":"dona_antonia","editable":true}'::jsonb,'{"headline":"text","product_image":"image","product_name":"text","price":"money","cta":"text"}'::jsonb,'draft'),
('vertical_video_offer',1,'Vídeo vertical econômico 9:16','video','{"width":1080,"height":1920,"fps":30,"codec":"h264"}'::jsonb,'{"scene_model":"product_sequence","transitions":["fade","zoom"],"safe_area":{"top":180,"bottom":220}}'::jsonb,'{"brand":"dona_antonia","editable":true}'::jsonb,'{"products":"array","headline":"text","cta":"text","audio":"optional"}'::jsonb,'draft')
on conflict(template_key,version) do nothing;

create or replace function public.marketing_admin_snapshot_v1()
returns jsonb
language sql
security invoker
set search_path=public,pg_temp
as $$
  select jsonb_build_object(
    'readiness', public.marketing_readiness_v1(),
    'commands', coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select id,command_key,version,name,media_kind,generation_mode,provider_hint,command_text,negative_prompt,variables,settings,status,created_at
      from public.marketing_command_presets order by created_at desc limit 80
    ) x),'[]'::jsonb),
    'templates', coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select id,template_key,version,name,media_kind,canvas_spec,layout_spec,brand_spec,variable_schema,status,created_at
      from public.marketing_content_templates order by created_at desc limit 80
    ) x),'[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(x order by x.updated_at desc) from (
      select id,name,objective,status,enabled,execution_mode,canary_percent,kill_switch,content_policy,product_selection,schedule_rule,channel_plan,ai_policy,max_cost_cents,max_publications_per_day,created_at,updated_at
      from public.marketing_campaigns order by updated_at desc limit 80
    ) x),'[]'::jsonb),
    'assets', coalesce((select jsonb_agg(x order by x.updated_at desc) from (
      select id,campaign_id,title,media_kind,generation_mode,status,template_id,command_preset_id,source_refs,edit_spec,render_spec,output_spec,editable,estimated_cost_cents,actual_cost_cents,created_at,updated_at
      from public.marketing_assets order by updated_at desc limit 100
    ) x),'[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select id,campaign_id,asset_id,channel,content_type,status,manual_confirmation_required,scheduled_for,idempotency_key,external_ref,attempt_count,last_error,estimated_cost_cents,published_at,created_at,updated_at
      from public.marketing_publication_jobs order by created_at desc limit 120
    ) x),'[]'::jsonb),
    'accounts', coalesce((select jsonb_agg(x order by x.channel,x.display_name) from (
      select id,channel,provider,display_name,external_account_id,status,capabilities,last_verified_at,token_expires_at,updated_at
      from public.marketing_channel_accounts order by channel,display_name limit 50
    ) x),'[]'::jsonb),
    'external_side_effect', false
  )
$$;

revoke all on function public.marketing_admin_snapshot_v1() from public,anon,authenticated;
grant execute on function public.marketing_admin_snapshot_v1() to service_role;

commit;
