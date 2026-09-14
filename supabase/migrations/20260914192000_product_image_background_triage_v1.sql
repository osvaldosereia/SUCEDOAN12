-- Triage only already-generated active images with strong background-failure signals.
-- Keep the current catalog image live while a replacement is generated manually.
-- Idempotent: rows already tagged by this triage are not queued again.

with suspects as (
  select id
  from public.products
  where is_active is true
    and image_ai_status='completed'
    and coalesce(image_ai_manual_review_reason,'') not like 'auto_triage_background_v1:%'
    and (
      coalesce((image_ai_validation->>'background_score')::numeric,1) < 0.90
      or coalesce(image_ai_manual_review_reason,'') ~* '(fundo|background|borda branca|moldura|faixa branca|original)'
    )
), upd_products as (
  update public.products p
  set image_ai_manual_review_required=true,
      image_ai_manual_review_reason=concat(
        'auto_triage_background_v1: ',
        coalesce(
          nullif(p.image_ai_manual_review_reason,''),
          concat('background_score=',coalesce(p.image_ai_validation->>'background_score','unknown'))
        )
      ),
      image_ai_manual_prompt='Recrie exatamente o MESMO produto e a MESMA variante da referência, preservando marca, peso/volume, embalagem, tampa, formato, cores e rótulo. Use a referência somente para a identidade do produto. Remova completamente o fundo original, cenário, parede, mesa, prateleira, piso, textura e qualquer elemento extra. O fundo final deve ser sólido, uniforme #ECECEC em toda a imagem até os quatro cantos. Não usar fundo branco, quase branco diferente de #ECECEC, degradê, transparência, moldura branca, borda branca ou faixa branca. Produto inteiro, centralizado, com margens confortáveis e somente uma sombra de contato discreta na base. Não invente nem troque variante, peso, sabor, fragrância ou embalagem.',
      image_ai_manual_requested_at=now(),
      image_ai_manual_requested_by=null,
      image_ai_manual_resolved_at=null,
      updated_at=now()
  from suspects s
  where p.id=s.id
  returning p.id
)
update public.product_image_jobs j
set status='pending',
    force_individual=true,
    attempts=0,
    error_message='manual_reprocess:auto_triage_background_v1',
    started_at=null,
    processed_at=null,
    updated_at=now()
from upd_products u
where j.product_id=u.id;
