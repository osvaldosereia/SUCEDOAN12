-- view: catalog_external_evidence_compare_v1
create or replace view public.catalog_external_evidence_compare_v1 with (security_invoker=true) as
 SELECT s.product_id,
    p.name,
    p.gtin,
    s.status AS si5_status,
    c.status AS cosmos_status,
    s.proposed_attributes ->> 'ncm_candidate'::text AS si5_ncm,
    c.proposed_attributes ->> 'ncm_candidate'::text AS cosmos_ncm,
    s.proposed_attributes ->> 'cest_candidate'::text AS si5_cest,
        CASE
            WHEN s.status = 'review'::text AND c.status = 'review'::text AND (s.proposed_attributes ->> 'ncm_candidate'::text) IS DISTINCT FROM (c.proposed_attributes ->> 'ncm_candidate'::text) THEN true
            ELSE false
        END AS ncm_conflict,
    false AS fiscal_auto_approved
   FROM si5_product_research s
     JOIN products p ON p.id = s.product_id
     LEFT JOIN cosmos_product_research c ON c.product_id = s.product_id;

-- view: cosmos_catalog_progress_v2
create or replace view public.cosmos_catalog_progress_v2 with (security_invoker=true) as
 SELECT (( SELECT count(*) AS count
           FROM products))::integer AS products_total,
    (( SELECT count(*) AS count
           FROM products
          WHERE products.is_active))::integer AS products_active,
    (( SELECT count(*) AS count
           FROM cosmos_product_research))::integer AS research_queue_total,
    (( SELECT count(*) AS count
           FROM cosmos_product_research
          WHERE cosmos_product_research.status = 'review'::text))::integer AS researched_for_review,
    (( SELECT count(*) AS count
           FROM cosmos_research_requests))::integer AS api_attempts_total,
    (( SELECT count(*) AS count
           FROM cosmos_family_candidate_review_v2))::integer AS proposed_multivariant_families,
    (( SELECT count(*) AS count
           FROM cosmos_product_identity_audit_v2
          WHERE cosmos_product_identity_audit_v2.is_active AND COALESCE(TRIM(BOTH FROM cosmos_product_identity_audit_v2.gtin), ''::text) <> ''::text AND cosmos_product_identity_audit_v2.gtin_checksum_valid IS FALSE))::integer AS active_invalid_gtin,
    ( SELECT cosmos_research_config.enabled
           FROM cosmos_research_config
          WHERE cosmos_research_config.id = true) AS worker_enabled;

-- view: cosmos_family_attribute_preview_v1
create or replace view public.cosmos_family_attribute_preview_v1 with (security_invoker=true) as
 SELECT m.product_id,
    f.id AS family_id,
    jsonb_strip_nulls(jsonb_build_object('brand', f.shared_attributes -> 'brand'::text, 'product_type', f.shared_attributes -> 'product_type'::text, 'product_line', f.shared_attributes -> 'product_line'::text, 'category', f.shared_attributes -> 'category'::text, 'subcategory', f.shared_attributes -> 'subcategory'::text, 'packaging_type', f.shared_attributes -> 'packaging_type'::text, 'gpc', f.shared_attributes -> 'gpc'::text)) AS shared_proposal,
        CASE
            WHEN (m.evidence ->> 'presentation_verified'::text) = 'true'::text THEN f.shared_attributes -> 'dimensions_raw'::text
            ELSE NULL::jsonb
        END AS dimensions_proposal,
    m.evidence AS membership_evidence
   FROM cosmos_catalog_families f
     JOIN cosmos_catalog_family_members m ON m.family_id = f.id
  WHERE f.verification_status = 'verified'::text AND m.status = 'confirmed'::text;

-- view: cosmos_family_candidate_review_v2
create or replace view public.cosmos_family_candidate_review_v2 with (security_invoker=true) as
 SELECT proposed_family_key,
    min(proposed_family_type) AS proposed_family_type,
    min(normalized_content_amount) AS normalized_content_amount,
    min(normalized_content_unit) AS normalized_content_unit,
    min(brand) AS example_brand,
    count(*)::integer AS product_count,
    count(*) FILTER (WHERE gtin_checksum_valid IS FALSE)::integer AS invalid_gtin_count,
    count(DISTINCT NULLIF(TRIM(BOTH FROM ncm), ''::text))::integer AS distinct_ncm_count,
    array_agg(name ORDER BY name) AS product_names,
    array_agg(gtin ORDER BY name) AS gtins,
        CASE
            WHEN count(DISTINCT NULLIF(TRIM(BOTH FROM ncm), ''::text)) > 1 THEN 'fiscal_disagreement_review'::text
            ELSE 'line_and_packaging_verification_required'::text
        END AS review_reason
   FROM cosmos_product_identity_audit_v2
  WHERE is_active AND proposed_family_key IS NOT NULL
  GROUP BY proposed_family_key
 HAVING count(*) >= 2;

-- view: cosmos_family_representatives_v2
create or replace view public.cosmos_family_representatives_v2 with (security_invoker=true) as
 WITH ranked AS (
         SELECT a.product_id,
            a.name,
            a.gtin,
            a.proposed_family_key,
            c.product_count,
            c.review_reason,
                CASE
                    WHEN NULLIF(TRIM(BOTH FROM p.description_short), ''::text) IS NOT NULL THEN 4
                    ELSE 0
                END +
                CASE
                    WHEN NULLIF(TRIM(BOTH FROM p.image_url), ''::text) IS NOT NULL THEN 3
                    ELSE 0
                END +
                CASE
                    WHEN NULLIF(TRIM(BOTH FROM p.packaging), ''::text) IS NOT NULL AND (lower(TRIM(BOTH FROM p.packaging)) <> ALL (ARRAY['un'::text, 'unidade'::text])) THEN 2
                    ELSE 0
                END +
                CASE
                    WHEN NULLIF(TRIM(BOTH FROM p.brand), ''::text) IS NOT NULL THEN 1
                    ELSE 0
                END AS evidence_score,
            row_number() OVER (PARTITION BY a.proposed_family_key ORDER BY (
                CASE
                    WHEN NULLIF(TRIM(BOTH FROM p.description_short), ''::text) IS NOT NULL THEN 4
                    ELSE 0
                END +
                CASE
                    WHEN NULLIF(TRIM(BOTH FROM p.image_url), ''::text) IS NOT NULL THEN 3
                    ELSE 0
                END +
                CASE
                    WHEN NULLIF(TRIM(BOTH FROM p.packaging), ''::text) IS NOT NULL AND (lower(TRIM(BOTH FROM p.packaging)) <> ALL (ARRAY['un'::text, 'unidade'::text])) THEN 2
                    ELSE 0
                END +
                CASE
                    WHEN NULLIF(TRIM(BOTH FROM p.brand), ''::text) IS NOT NULL THEN 1
                    ELSE 0
                END) DESC, a.name, a.product_id) AS rank_in_group
           FROM cosmos_product_identity_audit_v2 a
             JOIN products p ON p.id = a.product_id
             JOIN cosmos_family_candidate_review_v2 c ON c.proposed_family_key = a.proposed_family_key
          WHERE a.is_active AND a.gtin_checksum_valid IS TRUE
        )
 SELECT product_id AS representative_product_id,
    name AS representative_name,
    gtin AS representative_gtin,
    proposed_family_key,
    product_count,
    review_reason,
    evidence_score
   FROM ranked
  WHERE rank_in_group = 1;

-- view: cosmos_product_identity_audit_v2
create or replace view public.cosmos_product_identity_audit_v2 with (security_invoker=true) as
 WITH base AS (
         SELECT p.id AS product_id,
            p.name,
            p.brand,
            p.gtin,
            p.ncm,
            p.packaging,
            p.category,
            p.subcategory,
            p.customer_subsubcategory,
            p.is_active,
            r.status AS research_status,
                CASE
                    WHEN p.name ~* '(detergente|lava.lou[cç])'::text AND (p.subcategory ~~* '%detergente%'::text OR p.customer_subsubcategory ~~* '%detergente%'::text) THEN 'detergente_loucas'::text
                    WHEN p.name ~* 'amaciante'::text AND p.name ~* 'concentrado'::text THEN 'amaciante_concentrado'::text
                    WHEN p.name ~* 'amaciante'::text THEN 'amaciante_comum'::text
                    WHEN p.name ~* 'creme para pentear'::text THEN 'creme_para_pentear'::text
                    ELSE NULL::text
                END AS proposed_family_type,
            regexp_match(lower(p.name), '([0-9]+(?:[.,][0-9]+)?)\s*(ml|l|kg|g)(?:$|\s)'::text) AS content_match
           FROM products p
             LEFT JOIN cosmos_product_research r ON r.product_id = p.id
        ), typed AS (
         SELECT b.product_id,
            b.name,
            b.brand,
            b.gtin,
            b.ncm,
            b.packaging,
            b.category,
            b.subcategory,
            b.customer_subsubcategory,
            b.is_active,
            b.research_status,
            b.proposed_family_type,
            b.content_match,
                CASE
                    WHEN b.content_match IS NOT NULL THEN (replace(b.content_match[1], ','::text, '.'::text)::numeric *
                    CASE
                        WHEN b.content_match[2] = ANY (ARRAY['l'::text, 'kg'::text]) THEN 1000
                        ELSE 1
                    END::numeric)::numeric(15,3)
                    ELSE NULL::numeric
                END AS normalized_content_amount,
                CASE
                    WHEN b.content_match[2] = ANY (ARRAY['ml'::text, 'l'::text]) THEN 'ml'::text
                    WHEN b.content_match[2] = ANY (ARRAY['g'::text, 'kg'::text]) THEN 'g'::text
                    ELSE NULL::text
                END AS normalized_content_unit
           FROM base b
        )
 SELECT product_id,
    name,
    brand,
    gtin,
    ncm,
    packaging,
    category,
    subcategory,
    customer_subsubcategory,
    is_active,
    research_status,
    proposed_family_type,
    content_match,
    normalized_content_amount,
    normalized_content_unit,
    cosmos_gtin_valid(TRIM(BOTH FROM gtin)) AS gtin_checksum_valid,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM brand), ''::text) IS NOT NULL AND proposed_family_type IS NOT NULL AND normalized_content_amount IS NOT NULL THEN ((((lower(TRIM(BOTH FROM brand)) || '|'::text) || proposed_family_type) || '|'::text) || normalized_content_amount::text) || normalized_content_unit
            ELSE NULL::text
        END AS proposed_family_key,
        CASE
            WHEN proposed_family_type IS NULL THEN 'type_needs_research'::text
            WHEN NULLIF(TRIM(BOTH FROM brand), ''::text) IS NULL THEN 'brand_needs_research'::text
            WHEN normalized_content_amount IS NULL THEN 'content_needs_research'::text
            ELSE 'candidate_only_not_verified'::text
        END AS classification_status
   FROM typed t;

-- view: marketing_customer_consent_current_v1
create or replace view public.marketing_customer_consent_current_v1 with (security_invoker=true) as
 SELECT c.id AS customer_id,
    canonical_whatsapp_e164_br_v2(c.primary_whatsapp_e164) AS phone_e164,
        CASE
            WHEN latest.decision = 'opt_in'::text THEN 'opt_in'::text
            WHEN latest.decision = 'opt_out'::text THEN 'opt_out'::text
            WHEN COALESCE(c.marketing_opt_in, false) IS TRUE THEN 'opt_in'::text
            ELSE 'never_consented'::text
        END AS consent_state,
    COALESCE(c.marketing_opt_in, false) AS marketing_opt_in,
    c.marketing_consent_updated_at,
    latest.id AS latest_event_id,
    latest.decision AS latest_decision,
    latest.source AS latest_source,
    latest.source_ref AS latest_source_ref,
    latest.consent_text_version,
    latest.occurred_at AS latest_event_at
   FROM customers c
     LEFT JOIN LATERAL ( SELECT e.id,
            e.customer_id,
            e.phone_e164,
            e.decision,
            e.source,
            e.source_ref,
            e.source_event_key,
            e.consent_text_version,
            e.consent_text_snapshot,
            e.occurred_at,
            e.recorded_by,
            e.metadata,
            e.created_at
           FROM marketing_consent_events_v1 e
          WHERE e.customer_id = c.id
          ORDER BY e.occurred_at DESC, e.created_at DESC, e.id DESC
         LIMIT 1) latest ON true;

-- view: marketing_repurchase_ready_v1
create or replace view public.marketing_repurchase_ready_v1 as
 SELECT s.customer_id,
    s.last_purchase_order_id,
    s.last_purchase_order_number,
    s.last_purchase_at,
    s.due_at,
    s.status,
    s.marketing_opt_in,
    s.phone_e164,
    s.send_channel_e164,
    s.template_name,
    s.last_sent_at,
    s.last_sent_order_id,
    s.blocked_reason,
    s.metadata,
    s.updated_at
   FROM marketing_repurchase_state_v1 s
     JOIN customers c ON c.id = s.customer_id
  WHERE s.last_purchase_order_id IS NOT NULL AND s.due_at IS NOT NULL AND s.due_at <= now() AND (s.status = ANY (ARRAY['scheduled'::text, 'ready'::text])) AND s.marketing_opt_in IS TRUE AND COALESCE(c.marketing_opt_in, false) IS TRUE AND s.phone_e164 IS NOT NULL AND s.last_sent_order_id IS DISTINCT FROM s.last_purchase_order_id;

-- view: ops2_admin_customer_registration_v1
create or replace view public.ops2_admin_customer_registration_v1 with (security_invoker=true) as
 SELECT c.id AS customer_id,
    c.name AS customer_name,
    c.cpf_cnpj,
    c.primary_whatsapp_e164,
    c.bling_contact_id,
    s.state AS registration_state,
    COALESCE((s.state ->> 'registration_complete'::text)::boolean, false) AS registration_complete,
    COALESCE((s.state ->> 'flow_required'::text)::boolean, true) AS flow_required,
    COALESCE((s.state ->> 'document_only_pending'::text)::boolean, false) AS document_only_pending,
    COALESCE((s.state ->> 'bling_ready'::text)::boolean, false) AS bling_ready,
    COALESCE((s.state ->> 'already_linked_bling'::text)::boolean, false) AS bling_linked,
    COALESCE(s.state -> 'missing_fields'::text, '[]'::jsonb) AS missing_fields,
        CASE
            WHEN a.id IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object('id', a.id, 'street', a.street, 'number', a.number, 'complement', a.complement, 'neighborhood', a.neighborhood, 'city', a.city, 'state', a.state, 'postal_code', a.postal_code, 'reference', a.reference, 'google_maps_url', a.google_maps_url, 'block', a.block, 'is_default', a.is_default, 'updated_at', a.updated_at)
        END AS current_address
   FROM customers c
     CROSS JOIN LATERAL ( SELECT ops2_customer_registration_state_v1(c.id) AS state) s
     LEFT JOIN LATERAL ( SELECT ca.id,
            ca.customer_id,
            ca.bling_address_ref,
            ca.label,
            ca.street,
            ca.number,
            ca.complement,
            ca.neighborhood,
            ca.city,
            ca.state,
            ca.postal_code,
            ca.reference,
            ca.is_default,
            ca.is_active,
            ca.last_confirmed_at,
            ca.created_at,
            ca.updated_at,
            ca.google_maps_url,
            ca.block,
            ca.latitude,
            ca.longitude
           FROM customer_addresses ca
          WHERE ca.customer_id = c.id AND ca.is_active = true
          ORDER BY ca.is_default DESC NULLS LAST, ca.updated_at DESC NULLS LAST, ca.created_at DESC
         LIMIT 1) a ON true;

-- view: ops2_bling_stock_worker_health_v1
create or replace view public.ops2_bling_stock_worker_health_v1 with (security_invoker=true) as
 SELECT count(*) FILTER (WHERE domain = 'stock'::text AND status = 'processing'::text) AS processing,
    count(*) FILTER (WHERE domain = 'stock'::text AND status = 'processing'::text AND locked_at < (now() - '00:01:30'::interval)) AS stale_90s,
    count(*) FILTER (WHERE domain = 'stock'::text AND status = 'retry'::text) AS retry,
    count(*) FILTER (WHERE domain = 'stock'::text AND status = 'review_required'::text) AS review_required,
    min(locked_at) FILTER (WHERE domain = 'stock'::text AND status = 'processing'::text) AS oldest_processing_at,
    max(updated_at) FILTER (WHERE domain = 'stock'::text) AS last_stock_job_at
   FROM bling_hub_jobs_v2 j;

-- view: ops2_catalog_product_parity_summary_v1
create or replace view public.ops2_catalog_product_parity_summary_v1 with (security_invoker=true) as
 SELECT count(*) AS total,
    count(*) FILTER (WHERE local_active) AS active,
    count(*) FILTER (WHERE review_status = 'matched'::text) AS matched,
    count(*) FILTER (WHERE review_status = 'price_mismatch'::text) AS price_mismatch,
    count(*) FILTER (WHERE review_status = 'identity_mismatch'::text) AS identity_mismatch,
    count(*) FILTER (WHERE review_status = 'status_mismatch'::text) AS status_mismatch,
    count(*) FILTER (WHERE review_status = 'multiple_mismatch'::text) AS multiple_mismatch,
    count(*) FILTER (WHERE review_status = 'remote_missing'::text) AS remote_missing,
    count(*) FILTER (WHERE review_status = 'readonly_failed'::text) AS readonly_failed,
    max(updated_at) AS last_updated_at
   FROM ops2_catalog_product_parity_reviews;

-- view: ops2_catalog_stock_highrisk_review_summary_v1
create or replace view public.ops2_catalog_stock_highrisk_review_summary_v1 with (security_invoker=true) as
 SELECT run_id,
    count(*) AS total,
    count(*) FILTER (WHERE status = 'pending_review'::text) AS pending_review,
    count(*) FILTER (WHERE status = 'snapshot_rebased'::text) AS snapshot_rebased,
    count(*) FILTER (WHERE status = 'confirmed_readonly'::text) AS confirmed_readonly,
    count(*) FILTER (WHERE status = ANY (ARRAY['target_drift'::text, 'binding_drift'::text, 'readonly_failed'::text])) AS blocked,
    count(*) FILTER (WHERE risk_bucket = 'elevated_21_50'::text) AS elevated_21_50,
    count(*) FILTER (WHERE risk_bucket = 'high_51_100'::text) AS high_51_100,
    count(*) FILTER (WHERE risk_bucket = 'critical_over_100'::text) AS critical_over_100,
    max(updated_at) AS last_updated_at
   FROM ops2_catalog_stock_highrisk_reviews
  GROUP BY run_id;

-- view: ops2_catalog_sync_canary_summary_v1
create or replace view public.ops2_catalog_sync_canary_summary_v1 with (security_invoker=true) as
 SELECT c.id,
    c.run_id,
    c.created_at,
    c.status,
    c.max_items,
    c.item_count,
    c.external_write_enabled,
    count(i.*) FILTER (WHERE i.state = 'prepared'::text) AS prepared,
    count(i.*) FILTER (WHERE i.state = 'confirmed'::text) AS confirmed,
    count(i.*) FILTER (WHERE i.state = 'divergent'::text) AS divergent,
    count(i.*) FILTER (WHERE i.state = 'failed'::text) AS failed
   FROM ops2_catalog_sync_canaries c
     LEFT JOIN ops2_catalog_sync_canary_items i ON i.canary_id = c.id
  GROUP BY c.id;

-- view: ops2_catalog_sync_run_summary_v1
create or replace view public.ops2_catalog_sync_run_summary_v1 with (security_invoker=true) as
 SELECT r.id,
    r.created_at,
    r.status,
    r.product_count,
    count(p.*) FILTER (WHERE p.operation = 'stock_update'::text) AS stock_updates,
    count(p.*) FILTER (WHERE p.operation = 'noop'::text) AS noops,
    count(p.*) FILTER (WHERE p.state = 'blocked'::text) AS blocked,
    count(p.*) FILTER (WHERE p.state = 'confirmed'::text) AS confirmed,
    count(p.*) FILTER (WHERE p.state = 'divergent'::text) AS divergent,
    count(p.*) FILTER (WHERE p.state = 'failed'::text) AS failed
   FROM ops2_catalog_baseline_runs r
     LEFT JOIN ops2_catalog_sync_plan_items p ON p.run_id = r.id
  GROUP BY r.id;

-- view: ops2_expiry_offer_policy_v1
create or replace view public.ops2_expiry_offer_policy_v1 with (security_invoker=true) as
 SELECT product_id,
    name,
    is_active,
    price,
    legacy_validity_date,
    lot_tracking_complete,
    lot_count,
    quantified_lot_count,
    unquantified_lot_count,
    tracked_physical_qty,
    sellable_lot_qty,
    expired_lot_qty,
    earliest_sellable_expiration,
    earliest_expired_expiration,
    bling_physical_qty,
    effective_expiration_date,
    has_sellable_validity,
    expiry_deactivation_candidate,
        CASE
            WHEN effective_expiration_date IS NULL THEN NULL::integer
            ELSE effective_expiration_date - CURRENT_DATE
        END AS days_to_expiry,
        CASE
            WHEN effective_expiration_date IS NULL THEN NULL::integer
            WHEN effective_expiration_date < CURRENT_DATE THEN NULL::integer
            WHEN effective_expiration_date < (CURRENT_DATE + 30) THEN 40
            WHEN effective_expiration_date < (CURRENT_DATE + 60) THEN 20
            WHEN effective_expiration_date <= (CURRENT_DATE + 90) THEN 10
            ELSE NULL::integer
        END AS recommended_discount_percent
   FROM ops2_product_lot_summary_v1 s;

-- view: ops2_integrated_order_readiness_v1
create or replace view public.ops2_integrated_order_readiness_v1 with (security_invoker=true) as
 SELECT o.id AS order_id,
    o.order_number,
    o.status,
    o.sync_status,
    o.bling_order_id,
    o.bling_synced_at,
    count(DISTINCT r.id) FILTER (WHERE r.status = 'reserved'::text) AS reserved_lines,
    count(DISTINCT cs.id) FILTER (WHERE cs.status = 'verified'::text) AS verified_checks,
    max(fc.dispatch_fiscal_status) AS dispatch_fiscal_status,
    count(DISTINCT ds.id) AS delivery_stops,
    count(DISTINCT ps.id) AS payment_settlements,
    count(DISTINCT rc.id) AS return_cases,
        CASE
            WHEN o.bling_synced_at IS NOT NULL THEN 'sync_proven'::text
            WHEN o.bling_order_id IS NOT NULL THEN 'bling_id_without_sync_proof'::text
            WHEN o.sync_status = ANY (ARRAY['synced'::text, 'success'::text]) THEN 'sync_state_without_timestamp'::text
            ELSE COALESCE(o.sync_status, 'local'::text)
        END AS bling_observability_state,
        CASE
            WHEN (o.status = ANY (ARRAY['ready'::text, 'out_for_delivery'::text, 'delivered'::text])) AND count(DISTINCT cs.id) FILTER (WHERE cs.status = 'verified'::text) = 0 THEN 'legacy_or_missing_ean_evidence'::text
            WHEN (o.status = ANY (ARRAY['out_for_delivery'::text, 'delivered'::text])) AND COALESCE(max(fc.dispatch_fiscal_status), 'pending'::text) <> 'authorized'::text THEN 'legacy_or_missing_fiscal_evidence'::text
            WHEN o.status = 'delivered'::text AND count(DISTINCT ps.id) = 0 THEN 'legacy_or_missing_payment_evidence'::text
            ELSE 'consistent_with_current_evidence'::text
        END AS evidence_state
   FROM orders o
     LEFT JOIN vitrine_stock_reservations r ON r.order_id = o.id
     LEFT JOIN ops_order_check_sessions cs ON cs.order_id = o.id
     LEFT JOIN order_fiscal_controls fc ON fc.order_id = o.id
     LEFT JOIN ops_delivery_stops ds ON ds.order_id = o.id
     LEFT JOIN order_payment_settlements ps ON ps.order_id = o.id
     LEFT JOIN order_delivery_return_cases rc ON rc.order_id = o.id
  GROUP BY o.id, o.order_number, o.status, o.sync_status, o.bling_order_id, o.bling_synced_at;

-- view: ops2_loose_sellable_stock_v1
create or replace view public.ops2_loose_sellable_stock_v1 as
 SELECT product_id,
    name,
    sku,
    gtin,
    is_active,
    legacy_stock,
    bling_product_id,
    link_status,
    bling_physical_total,
    bling_virtual_total,
    selected_deposit_id,
    sellable_physical,
    sellable_virtual,
    mirror_observed_at,
    source_event_id,
    source_resource,
    stock_authority,
    stock_cutover_at,
    bling_stock_ready,
    effective_sellable_stock,
    stock_source_reason,
    0::numeric AS basket_locked_quantity,
    GREATEST(0::numeric, COALESCE(effective_sellable_stock, 0::numeric)) AS loose_sellable_stock
   FROM ops2_sellable_stock_v1 s;

-- view: ops2_order_whatsapp_confirmation_v1
create or replace view public.ops2_order_whatsapp_confirmation_v1 with (security_invoker=true) as
 SELECT order_id,
    message_kind,
    status,
    delivery_mode,
    channel_origin,
    channel_phone_e164,
    attempt_count,
    external_message_id,
    last_error,
    created_at,
    sent_at,
    updated_at
   FROM ops2_whatsapp_outbox_v1 q;

-- view: ops2_papoai_operational_readiness_v1
create or replace view public.ops2_papoai_operational_readiness_v1 with (security_invoker=true) as
 SELECT w.id AS webhook_id,
    w.received_at,
    w.event_key,
    w.event_name,
    w.conversation_ref,
    w.phone_candidate,
    w.status AS webhook_status,
    w.processed_at,
    w.last_error,
    d.id AS draft_id,
    d.status AS draft_status,
    d.revision AS draft_revision,
    d.customer_id,
    d.canonical_order_id,
    d.last_source_event_key,
        CASE
            WHEN (w.status = ANY (ARRAY['failed'::text, 'error'::text])) OR w.last_error IS NOT NULL THEN 'technical_error'::text
            WHEN NULLIF(w.phone_candidate, ''::text) IS NULL THEN 'identity_missing'::text
            WHEN d.id IS NULL THEN 'captured_no_draft'::text
            WHEN d.customer_id IS NULL THEN 'customer_missing'::text
            WHEN d.status = 'confirmed'::text AND d.canonical_order_id IS NULL THEN 'confirmed_without_order'::text
            WHEN d.canonical_order_id IS NOT NULL THEN 'order_linked'::text
            ELSE 'draft_active'::text
        END AS operational_state
   FROM papoai_webhook_inbox_v2 w
     LEFT JOIN LATERAL ( SELECT x.id,
            x.conversation_ref,
            x.phone_e164,
            x.customer_id,
            x.revision,
            x.status,
            x.cart,
            x.payment_method,
            x.customer_snapshot,
            x.delivery,
            x.quoted_total_cents,
            x.summary_hash,
            x.sent_message_id,
            x.confirmed_message_id,
            x.canonical_order_id,
            x.last_source_event_key,
            x.expires_at,
            x.created_at,
            x.updated_at,
            x.confirmed_at,
            x.cancelled_at
           FROM papoai_order_drafts_v2 x
          WHERE x.conversation_ref = w.conversation_ref OR x.last_source_event_key = w.event_key
          ORDER BY x.updated_at DESC
         LIMIT 1) d ON true;

-- view: ops2_pre_human_catalog_readiness_v1
create or replace view public.ops2_pre_human_catalog_readiness_v1 with (security_invoker=true) as
 SELECT p.id AS product_id,
    p.sku,
    p.gtin,
    p.name,
    p.is_active,
    p.price,
    p.stock AS supabase_stock,
    p.bling_product_id AS materialized_bling_product_id,
    m.bling_product_id AS mirror_bling_product_id,
    m.physical_total AS bling_physical_mirror,
    m.virtual_total AS bling_virtual_mirror,
    m.observed_at AS bling_observed_at,
        CASE
            WHEN NOT p.is_active THEN 'inactive'::text
            WHEN m.bling_product_id IS NULL THEN 'missing_bling_identity'::text
            WHEN p.bling_product_id IS NOT NULL AND p.bling_product_id <> m.bling_product_id THEN 'identity_conflict'::text
            WHEN p.price IS NULL OR p.price <= 0::numeric THEN 'invalid_sale_price'::text
            WHEN p.stock < 0::numeric THEN 'invalid_stock'::text
            WHEN p.stock IS DISTINCT FROM m.physical_total THEN 'ready_to_push_supabase_baseline'::text
            ELSE 'already_stock_aligned'::text
        END AS readiness_state
   FROM products p
     LEFT JOIN bling_stock_mirror_v2 m ON m.product_id = p.id;

-- view: ops2_product_lot_summary_v1
create or replace view public.ops2_product_lot_summary_v1 with (security_invoker=true) as
 WITH lots AS (
         SELECT l_1.product_id,
            count(*) FILTER (WHERE l_1.status <> 'cancelled'::text) AS lot_count,
            count(*) FILTER (WHERE l_1.status <> 'cancelled'::text AND l_1.quantity_on_hand IS NOT NULL) AS quantified_lot_count,
            count(*) FILTER (WHERE l_1.status <> 'cancelled'::text AND l_1.quantity_on_hand IS NULL) AS unquantified_lot_count,
            COALESCE(sum(COALESCE(l_1.quantity_on_hand, 0::numeric)) FILTER (WHERE l_1.status <> 'cancelled'::text), 0::numeric)::numeric(14,3) AS tracked_physical_qty,
            COALESCE(sum(GREATEST(COALESCE(l_1.quantity_on_hand, 0::numeric) - COALESCE(l_1.quantity_reserved, 0::numeric), 0::numeric)) FILTER (WHERE l_1.status = 'active'::text AND l_1.expiration_date >= CURRENT_DATE AND l_1.quantity_on_hand IS NOT NULL), 0::numeric)::numeric(14,3) AS sellable_lot_qty,
            COALESCE(sum(GREATEST(COALESCE(l_1.quantity_on_hand, 0::numeric) - COALESCE(l_1.quantity_reserved, 0::numeric), 0::numeric)) FILTER (WHERE (l_1.status = ANY (ARRAY['active'::text, 'expired'::text])) AND l_1.expiration_date < CURRENT_DATE AND l_1.quantity_on_hand IS NOT NULL), 0::numeric)::numeric(14,3) AS expired_lot_qty,
            min(l_1.expiration_date) FILTER (WHERE l_1.status = 'active'::text AND l_1.expiration_date >= CURRENT_DATE AND (l_1.quantity_on_hand IS NULL OR GREATEST(l_1.quantity_on_hand - l_1.quantity_reserved, 0::numeric) > 0::numeric)) AS earliest_sellable_expiration,
            min(l_1.expiration_date) FILTER (WHERE (l_1.status = ANY (ARRAY['active'::text, 'expired'::text])) AND l_1.expiration_date < CURRENT_DATE AND (l_1.quantity_on_hand IS NULL OR GREATEST(l_1.quantity_on_hand - l_1.quantity_reserved, 0::numeric) > 0::numeric)) AS earliest_expired_expiration
           FROM product_inventory_lots l_1
          GROUP BY l_1.product_id
        )
 SELECT p.id AS product_id,
    p.name,
    p.is_active,
    p.price,
    p.validity_date AS legacy_validity_date,
    COALESCE((p.metadata ->> 'lot_tracking_complete'::text)::boolean, false) AS lot_tracking_complete,
    COALESCE(l.lot_count, 0::bigint) AS lot_count,
    COALESCE(l.quantified_lot_count, 0::bigint) AS quantified_lot_count,
    COALESCE(l.unquantified_lot_count, 0::bigint) AS unquantified_lot_count,
    COALESCE(l.tracked_physical_qty, 0::numeric)::numeric(14,3) AS tracked_physical_qty,
    COALESCE(l.sellable_lot_qty, 0::numeric)::numeric(14,3) AS sellable_lot_qty,
    COALESCE(l.expired_lot_qty, 0::numeric)::numeric(14,3) AS expired_lot_qty,
    l.earliest_sellable_expiration,
    l.earliest_expired_expiration,
    s.sellable_physical AS bling_physical_qty,
        CASE
            WHEN COALESCE((p.metadata ->> 'lot_tracking_complete'::text)::boolean, false) THEN l.earliest_sellable_expiration
            ELSE p.validity_date
        END AS effective_expiration_date,
        CASE
            WHEN COALESCE((p.metadata ->> 'lot_tracking_complete'::text)::boolean, false) THEN l.earliest_sellable_expiration IS NOT NULL
            ELSE p.validity_date IS NULL OR p.validity_date >= CURRENT_DATE
        END AS has_sellable_validity,
        CASE
            WHEN COALESCE((p.metadata ->> 'lot_tracking_complete'::text)::boolean, false) THEN l.earliest_sellable_expiration IS NULL AND COALESCE(l.expired_lot_qty, 0::numeric) > 0::numeric
            ELSE p.validity_date IS NOT NULL AND p.validity_date < CURRENT_DATE
        END AS expiry_deactivation_candidate
   FROM products p
     LEFT JOIN lots l ON l.product_id = p.id
     LEFT JOIN ops2_sellable_stock_v1 s ON s.product_id = p.id;

-- view: ops2_purchase_xml_conversion_readiness_v1
create or replace view public.ops2_purchase_xml_conversion_readiness_v1 with (security_invoker=true) as
 SELECT d.id AS document_id,
    d.document_key,
    d.recipient_kind,
    d.financial_eligible,
    d.finance_status,
    d.receipt_status,
    d.processing_status,
    count(i.id)::integer AS item_count,
    count(i.id) FILTER (WHERE i.product_id IS NULL)::integer AS unmatched_items,
    count(i.id) FILTER (WHERE i.conversion_status = 'review_required'::text)::integer AS conversion_review_items,
    count(i.id) FILTER (WHERE i.purchase_unit <> i.base_unit AND (i.conversion_factor IS NULL OR i.conversion_factor < 1::numeric))::integer AS invalid_conversion_items,
    count(i.id) FILTER (WHERE i.converted_quantity IS NULL OR i.converted_quantity < 0::numeric)::integer AS quantity_review_items,
    bool_and(i.product_id IS NOT NULL AND (i.conversion_status = ANY (ARRAY['not_needed'::text, 'known'::text, 'inferred_xml'::text])) AND (i.purchase_unit = i.base_unit OR COALESCE(i.conversion_factor, 0::numeric) >= 1::numeric) AND COALESCE(i.converted_quantity, 0::numeric) >= 0::numeric) AS conversion_ready,
    d.recipient_kind <> 'CPF'::text OR d.financial_eligible = false AND d.finance_status = 'blocked_personal'::text AS finance_guard_ok
   FROM purchase_xml_documents d
     LEFT JOIN purchase_xml_items i ON i.document_id = d.id
  GROUP BY d.id, d.document_key, d.recipient_kind, d.financial_eligible, d.finance_status, d.receipt_status, d.processing_status;

-- view: ops2_sellable_stock_v1
create or replace view public.ops2_sellable_stock_v1 as
 SELECT p.id AS product_id,
    p.name,
    p.sku,
    p.gtin,
    p.is_active,
    COALESCE(p.stock, 0::numeric) AS legacy_stock,
    p.bling_product_id,
    NULL::text AS link_status,
    NULL::numeric AS bling_physical_total,
    NULL::numeric AS bling_virtual_total,
    NULL::bigint AS selected_deposit_id,
    NULL::numeric AS sellable_physical,
    NULL::numeric AS sellable_virtual,
    NULL::timestamp with time zone AS mirror_observed_at,
    NULL::text AS source_event_id,
    NULL::text AS source_resource,
    'supabase'::text AS stock_authority,
    NULLIF(rt.metadata ->> 'ops2_supabase_stock_authority_at'::text, ''::text)::timestamp with time zone AS stock_cutover_at,
    false AS bling_stock_ready,
    GREATEST(0::numeric, COALESCE(p.stock, 0::numeric)) AS effective_sellable_stock,
    'supabase_products_stock'::text AS stock_source_reason
   FROM products p
     CROSS JOIN bling_hub_runtime_v2 rt
  WHERE rt.id = 1;

-- view: ops2_stock_reconciliation_v1
create or replace view public.ops2_stock_reconciliation_v1 with (security_invoker=true) as
 SELECT s.product_id,
    s.name,
    s.sku,
    s.gtin,
    s.legacy_stock,
    s.sellable_physical,
    s.sellable_virtual,
    s.legacy_stock - s.sellable_virtual AS quantity_delta,
        CASE
            WHEN s.legacy_stock > 0::numeric AND s.sellable_virtual = 0::numeric AND COALESCE(p.physically_verified, false) THEN 'bling_zero_local_verified'::text
            WHEN s.legacy_stock > 0::numeric AND s.sellable_virtual = 0::numeric THEN 'bling_zero_recount_required'::text
            WHEN s.legacy_stock = 0::numeric AND s.sellable_virtual > 0::numeric THEN 'local_zero_recount_required'::text
            WHEN s.legacy_stock > 0::numeric AND s.sellable_virtual >= (s.legacy_stock * 5::numeric) THEN 'bling_extreme_high'::text
            WHEN s.sellable_virtual > 0::numeric AND s.legacy_stock >= (s.sellable_virtual * 5::numeric) THEN 'legacy_extreme_high'::text
            ELSE 'quantity_difference'::text
        END AS reconciliation_class,
        CASE
            WHEN s.legacy_stock > 0::numeric AND s.sellable_virtual = 0::numeric AND COALESCE(p.physically_verified, false) THEN 'verify_bling_opening_balance'::text
            WHEN s.legacy_stock > 0::numeric AND s.sellable_virtual = 0::numeric THEN 'physical_recount_before_adjustment'::text
            WHEN s.legacy_stock = 0::numeric AND s.sellable_virtual > 0::numeric THEN 'physical_recount_before_cutover'::text
            WHEN s.legacy_stock > 0::numeric AND s.sellable_virtual >= (s.legacy_stock * 5::numeric) THEN 'review_packaging_conversion_and_bling_balance'::text
            WHEN s.sellable_virtual > 0::numeric AND s.legacy_stock >= (s.sellable_virtual * 5::numeric) THEN 'review_packaging_conversion_and_local_balance'::text
            ELSE 'review_quantity_history'::text
        END AS recommended_action,
    p.packaging,
    p.unit,
    p.physically_verified,
    p.physically_verified_at,
    p.last_counted_at,
    s.bling_product_id,
    s.mirror_observed_at,
    s.selected_deposit_id
   FROM ops2_sellable_stock_v1 s
     JOIN products p ON p.id = s.product_id
  WHERE s.is_active = true AND s.bling_stock_ready = true AND abs(s.legacy_stock - s.sellable_virtual) > 0.0001;

-- view: product_fiscal_bling_diff_v1
create or replace view public.product_fiscal_bling_diff_v1 with (security_invoker=true) as
 WITH latest_bling AS (
         SELECT DISTINCT ON (e.product_id) e.product_id,
            e.document_key AS bling_product_id_evidence,
            e.ncm AS bling_ncm,
            e.cest AS bling_cest,
            e.origin_code AS bling_origin_code,
            e.observed_at AS bling_observed_at,
            e.evidence_payload AS bling_payload
           FROM product_fiscal_evidence e
          WHERE e.evidence_type = 'bling_product_detail'::text
          ORDER BY e.product_id, e.observed_at DESC NULLS LAST, e.created_at DESC
        )
 SELECT p.id AS product_id,
    p.name,
    p.gtin,
    COALESCE(p.bling_product_id, l.bling_id) AS bling_product_id,
    pf.ncm AS proposed_ncm,
    pf.cest AS proposed_cest,
    pf.origin_code AS proposed_origin_code,
    pf.review_status,
    pf.st_status,
    pf.rule_version,
    pf.classification_source,
    lb.bling_ncm,
    lb.bling_cest,
    lb.bling_origin_code,
    lb.bling_observed_at,
        CASE
            WHEN NOT s.sync_eligible THEN 'not_sync_eligible'::text
            WHEN lb.product_id IS NULL THEN 'bling_not_audited'::text
            WHEN lb.bling_ncm IS DISTINCT FROM pf.ncm THEN 'ncm_diff'::text
            WHEN lb.bling_origin_code IS DISTINCT FROM pf.origin_code THEN 'origin_diff'::text
            WHEN lb.bling_cest IS NOT NULL AND lb.bling_cest <> pf.cest THEN 'cest_diff'::text
            WHEN lb.bling_cest = pf.cest THEN 'aligned'::text
            WHEN lb.bling_cest IS NULL AND pf.cest IS NOT NULL THEN 'cest_missing'::text
            ELSE 'review_required'::text
        END AS diff_status,
    s.sync_eligible AND lb.product_id IS NOT NULL AND lb.bling_ncm = pf.ncm AND lb.bling_origin_code = pf.origin_code AND lb.bling_cest IS NULL AND pf.cest IS NOT NULL AND lb.bling_observed_at >= (now() - '24:00:00'::interval) AS canary_eligible,
    jsonb_build_object('tributacao', jsonb_build_object('ncm', pf.ncm, 'cest', pf.cest, 'origem', pf.origin_code)) AS proposed_patch,
    lb.bling_payload AS current_bling_snapshot
   FROM products p
     JOIN product_fiscal_profiles pf ON pf.product_id = p.id
     JOIN product_fiscal_bling_sync_preview_v1 s ON s.product_id = p.id
     LEFT JOIN bling_hub_entity_links_v2 l ON l.entity_type = 'product'::text AND l.source_id = p.id::text AND l.status = 'matched'::text
     LEFT JOIN latest_bling lb ON lb.product_id = p.id
  WHERE p.is_active;

-- view: product_fiscal_bling_sync_preview_v1
create or replace view public.product_fiscal_bling_sync_preview_v1 with (security_invoker=true) as
 SELECT p.id AS product_id,
    p.is_active,
    p.name,
    p.gtin,
    COALESCE(p.bling_product_id, l.bling_id) AS bling_product_id,
    pf.ncm,
    pf.cest,
    pf.origin_code,
    pf.st_status,
    pf.review_status,
    pf.rule_version,
    pf.classification_source,
    pf.classification_confidence,
        CASE
            WHEN NOT p.is_active THEN 'inactive_product'::text
            WHEN pf.review_status = 'blocked'::text THEN 'fiscal_review_blocked'::text
            WHEN pf.review_status <> ALL (ARRAY['auto_validated'::text, 'human_validated'::text]) THEN 'fiscal_profile_not_validated'::text
            WHEN pf.ncm IS NULL THEN 'ncm_missing'::text
            WHEN pf.origin_code IS NULL THEN 'origin_missing'::text
            WHEN pf.st_status <> ALL (ARRAY['applicable'::text, 'not_applicable'::text]) THEN 'st_decision_unresolved'::text
            WHEN pf.st_status = 'applicable'::text AND pf.cest IS NULL THEN 'cest_required_for_st'::text
            WHEN COALESCE(p.bling_product_id, l.bling_id) IS NULL THEN 'bling_product_not_linked'::text
            ELSE 'ready'::text
        END AS sync_gate,
    p.is_active AND (pf.review_status = ANY (ARRAY['auto_validated'::text, 'human_validated'::text])) AND pf.ncm IS NOT NULL AND pf.origin_code IS NOT NULL AND (pf.st_status = ANY (ARRAY['applicable'::text, 'not_applicable'::text])) AND (pf.st_status <> 'applicable'::text OR pf.cest IS NOT NULL) AND COALESCE(p.bling_product_id, l.bling_id) IS NOT NULL AS sync_eligible,
    jsonb_strip_nulls(jsonb_build_object('tributacao', jsonb_strip_nulls(jsonb_build_object('ncm', pf.ncm, 'cest',
        CASE
            WHEN pf.st_status = 'applicable'::text THEN pf.cest
            ELSE NULL::text
        END, 'origem', pf.origin_code)))) AS proposed_bling_payload,
    false AS external_write
   FROM products p
     JOIN product_fiscal_profiles pf ON pf.product_id = p.id
     LEFT JOIN bling_hub_entity_links_v2 l ON l.entity_type = 'product'::text AND l.source_id = p.id::text AND l.status = 'matched'::text;

-- view: product_fiscal_catalog_scan_v1
create or replace view public.product_fiscal_catalog_scan_v1 with (security_invoker=true) as
 SELECT p.id AS product_id,
    p.name,
    p.is_active,
    p.gtin,
    pf.ncm,
    pf.cest,
    pf.origin_code,
    pf.st_status,
    pf.review_status,
    COALESCE(c.evidence_count, 0::bigint) AS evidence_count,
    c.ncm_consensus,
    c.cest_consensus,
    c.origin_consensus,
    c.ncm_conflict,
    c.cest_conflict,
    COALESCE(blockers.open_blockers, 0::bigint) AS open_blockers,
    COALESCE(lm.rule_match_count, 0::bigint) AS legal_rule_match_count,
    lm.candidate_cests,
        CASE
            WHEN COALESCE(blockers.open_blockers, 0::bigint) > 0 OR pf.review_status = 'blocked'::text OR COALESCE(c.ncm_conflict, false) OR COALESCE(c.cest_conflict, false) THEN 'blocker_conflict'::text
            WHEN NULLIF(regexp_replace(COALESCE(p.gtin, ''::text), '\D'::text, ''::text, 'g'::text), ''::text) IS NOT NULL AND NOT fiscal_valid_gtin_v1(p.gtin) THEN 'gtin_invalid'::text
            WHEN pf.ncm IS NULL THEN 'ncm_missing'::text
            WHEN COALESCE(lm.rule_match_count, 0::bigint) > 1 THEN 'legal_rule_ambiguous'::text
            WHEN c.cest_consensus IS NOT NULL AND COALESCE(lm.rule_match_count, 0::bigint) = 0 THEN 'cest_evidence_unmapped'::text
            WHEN pf.st_status = 'candidate'::text THEN 'candidate_needs_validation'::text
            WHEN COALESCE(lm.rule_match_count, 0::bigint) = 1 AND c.cest_consensus IS NULL THEN 'legal_match_needs_evidence'::text
            WHEN COALESCE(c.evidence_count, 0::bigint) > 0 AND c.origin_consensus IS NULL THEN 'origin_evidence_missing'::text
            WHEN NULLIF(regexp_replace(COALESCE(p.gtin, ''::text), '\D'::text, ''::text, 'g'::text), ''::text) IS NULL THEN 'gtin_missing'::text
            WHEN COALESCE(c.evidence_count, 0::bigint) = 0 THEN 'no_fiscal_evidence'::text
            ELSE 'review_low_risk'::text
        END AS risk_code,
        CASE
            WHEN COALESCE(blockers.open_blockers, 0::bigint) > 0 OR pf.review_status = 'blocked'::text OR COALESCE(c.ncm_conflict, false) OR COALESCE(c.cest_conflict, false) THEN 100
            WHEN NULLIF(regexp_replace(COALESCE(p.gtin, ''::text), '\D'::text, ''::text, 'g'::text), ''::text) IS NOT NULL AND NOT fiscal_valid_gtin_v1(p.gtin) THEN 90
            WHEN pf.ncm IS NULL THEN 90
            WHEN COALESCE(lm.rule_match_count, 0::bigint) > 1 THEN 85
            WHEN c.cest_consensus IS NOT NULL AND COALESCE(lm.rule_match_count, 0::bigint) = 0 THEN 80
            WHEN pf.st_status = 'candidate'::text THEN 70
            WHEN COALESCE(lm.rule_match_count, 0::bigint) = 1 AND c.cest_consensus IS NULL THEN 65
            WHEN COALESCE(c.evidence_count, 0::bigint) > 0 AND c.origin_consensus IS NULL THEN 55
            WHEN NULLIF(regexp_replace(COALESCE(p.gtin, ''::text), '\D'::text, ''::text, 'g'::text), ''::text) IS NULL THEN 45
            WHEN COALESCE(c.evidence_count, 0::bigint) = 0 THEN 40
            ELSE 20
        END AS risk_score,
        CASE
            WHEN NULLIF(regexp_replace(COALESCE(p.gtin, ''::text), '\D'::text, ''::text, 'g'::text), ''::text) IS NULL THEN 'missing'::text
            WHEN fiscal_valid_gtin_v1(p.gtin) THEN 'valid'::text
            ELSE 'invalid'::text
        END AS gtin_status,
    COALESCE(ev.cest_evidence_count, 0::bigint) AS cest_evidence_count,
    COALESCE(ev.supplier_xml_evidence_count, 0::bigint) AS supplier_xml_evidence_count,
    COALESCE(ev.supplier_xml_cest_count, 0::bigint) AS supplier_xml_cest_count,
    COALESCE(ev.bling_evidence_count, 0::bigint) AS bling_evidence_count,
    COALESCE(ev.bling_cest_count, 0::bigint) AS bling_cest_count
   FROM products p
     JOIN product_fiscal_profiles pf ON pf.product_id = p.id
     LEFT JOIN product_fiscal_evidence_consensus_v1 c ON c.product_id = p.id
     LEFT JOIN LATERAL ( SELECT count(*) AS open_blockers
           FROM product_fiscal_review_items r
          WHERE r.product_id = p.id AND (r.status = ANY (ARRAY['open'::text, 'in_review'::text])) AND r.severity = 'blocker'::text) blockers ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS rule_match_count,
            array_agg(DISTINCT r.cest ORDER BY r.cest) AS candidate_cests
           FROM fiscal_rule_sets rs
             JOIN fiscal_st_rules_mt r ON r.rule_set_id = rs.id AND r.status = 'active'::text
          WHERE rs.jurisdiction = 'MT'::text AND rs.tax_kind = 'ICMS_ST'::text AND (rs.status = ANY (ARRAY['draft'::text, 'active'::text])) AND pf.ncm IS NOT NULL AND r.ncm_prefix IS NOT NULL AND "left"(pf.ncm, length(r.ncm_prefix)) = r.ncm_prefix AND fiscal_rule_description_matches_v1(COALESCE(NULLIF(pf.fiscal_description, ''::text), NULLIF(p.description_long, ''::text), NULLIF(p.description_short, ''::text), p.name), r.qualifiers)) lm ON true
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE e.cest IS NOT NULL) AS cest_evidence_count,
            count(*) FILTER (WHERE e.evidence_type = 'supplier_nfe_xml'::text) AS supplier_xml_evidence_count,
            count(*) FILTER (WHERE e.evidence_type = 'supplier_nfe_xml'::text AND e.cest IS NOT NULL) AS supplier_xml_cest_count,
            count(*) FILTER (WHERE e.evidence_type = 'bling_product_detail'::text) AS bling_evidence_count,
            count(*) FILTER (WHERE e.evidence_type = 'bling_product_detail'::text AND e.cest IS NOT NULL) AS bling_cest_count
           FROM product_fiscal_evidence e
          WHERE e.product_id = p.id) ev ON true;

-- view: product_fiscal_complex_bundle_v1
create or replace view public.product_fiscal_complex_bundle_v1 with (security_invoker=true) as
 SELECT p.id AS product_id,
    p.name,
    p.gtin,
    p.ncm AS product_ncm,
    pf.ncm AS fiscal_ncm,
    pf.cest AS fiscal_cest,
    pf.review_status,
    pf.st_status,
    fiscal_normalize_text_v1(p.name) ~ '(^| )kit( |$)'::text OR fiscal_normalize_text_v1(p.name) ~ '(^| )combo( |$)'::text AS is_complex_bundle,
    COALESCE(ev.independent_evidence_count, 0::bigint) AS independent_evidence_count,
    COALESCE(ev.matching_fiscal_evidence_count, 0::bigint) AS matching_fiscal_evidence_count,
    COALESCE(ev.evidence_types, '{}'::text[]) AS independent_evidence_types,
    COALESCE(ev.matching_fiscal_evidence_count, 0::bigint) > 0 AS independently_supported
   FROM products p
     JOIN product_fiscal_profiles pf ON pf.product_id = p.id
     LEFT JOIN LATERAL ( SELECT count(*) AS independent_evidence_count,
            count(*) FILTER (WHERE e.ncm = pf.ncm AND e.cest = pf.cest) AS matching_fiscal_evidence_count,
            array_agg(DISTINCT e.evidence_type ORDER BY e.evidence_type) AS evidence_types
           FROM product_fiscal_evidence e
          WHERE e.product_id = p.id AND (e.evidence_type = ANY (ARRAY['supplier_nfe_xml'::text, 'manufacturer_catalog'::text, 'web_product_catalog'::text]))) ev ON true;

-- view: product_fiscal_evidence_consensus_v1
create or replace view public.product_fiscal_evidence_consensus_v1 with (security_invoker=true) as
 SELECT p.id AS product_id,
    p.is_active,
    p.name,
    p.gtin AS product_gtin,
    pf.ncm AS profile_ncm,
    pf.cest AS profile_cest,
    pf.origin_code AS profile_origin_code,
    count(e.id) AS evidence_count,
    count(DISTINCT e.document_key) FILTER (WHERE e.document_key IS NOT NULL) AS document_count,
    count(DISTINCT e.ncm) FILTER (WHERE e.ncm IS NOT NULL) AS ncm_distinct_count,
        CASE
            WHEN count(DISTINCT e.ncm) FILTER (WHERE e.ncm IS NOT NULL) = 1 THEN min(e.ncm) FILTER (WHERE e.ncm IS NOT NULL)
            ELSE NULL::text
        END AS ncm_consensus,
    count(DISTINCT e.cest) FILTER (WHERE e.cest IS NOT NULL) AS cest_distinct_count,
        CASE
            WHEN count(DISTINCT e.cest) FILTER (WHERE e.cest IS NOT NULL) = 1 THEN min(e.cest) FILTER (WHERE e.cest IS NOT NULL)
            ELSE NULL::text
        END AS cest_consensus,
    count(DISTINCT e.origin_code) FILTER (WHERE e.origin_code IS NOT NULL) AS origin_distinct_count,
        CASE
            WHEN count(DISTINCT e.origin_code) FILTER (WHERE e.origin_code IS NOT NULL) = 1 THEN min(e.origin_code) FILTER (WHERE e.origin_code IS NOT NULL)
            ELSE NULL::smallint
        END AS origin_consensus,
    max(COALESCE(e.observed_at, e.created_at)) AS last_evidence_at,
    count(DISTINCT e.ncm) FILTER (WHERE e.ncm IS NOT NULL) > 1 OR pf.ncm IS NOT NULL AND (EXISTS ( SELECT 1
           FROM product_fiscal_evidence ex
          WHERE ex.product_id = p.id AND ex.evidence_type <> 'official_mt_legal_rule'::text AND ex.ncm IS NOT NULL AND ex.ncm <> pf.ncm)) AS ncm_conflict,
    count(DISTINCT e.cest) FILTER (WHERE e.cest IS NOT NULL) > 1 AS cest_conflict,
    count(DISTINCT e.origin_code) FILTER (WHERE e.origin_code IS NOT NULL) > 1 AS origin_variation
   FROM products p
     LEFT JOIN product_fiscal_profiles pf ON pf.product_id = p.id
     LEFT JOIN product_fiscal_evidence e ON e.product_id = p.id AND e.evidence_type <> 'official_mt_legal_rule'::text
  GROUP BY p.id, p.is_active, p.name, p.gtin, pf.ncm, pf.cest, pf.origin_code;

-- view: product_fiscal_readiness_v1
create or replace view public.product_fiscal_readiness_v1 with (security_invoker=true) as
 SELECT p.id AS product_id,
    p.is_active,
    p.name,
    p.gtin AS product_gtin,
    p.ncm AS product_ncm,
    pf.ncm AS fiscal_ncm,
    pf.cest,
    pf.origin_code,
    pf.commercial_gtin,
    pf.tax_gtin,
    pf.commercial_unit,
    pf.tax_unit,
    pf.st_status,
    pf.review_status,
    pf.classification_source,
    pf.classification_confidence,
    pf.validated_at,
    COALESCE(ev.evidence_count, 0::bigint) AS evidence_count,
    ev.last_evidence_at,
    COALESCE(rv.open_issue_count, 0::bigint) AS open_issue_count,
    pf.ncm IS NOT NULL AS ncm_present,
    pf.origin_code IS NOT NULL AS origin_present,
    pf.cest IS NOT NULL AS cest_present,
    pf.st_status = ANY (ARRAY['not_applicable'::text, 'applicable'::text]) AS st_decision_present,
    (pf.review_status = ANY (ARRAY['human_validated'::text, 'not_required'::text])) AND (pf.st_status = ANY (ARRAY['not_applicable'::text, 'applicable'::text])) AND (pf.st_status <> 'applicable'::text OR pf.cest IS NOT NULL) AND pf.origin_code IS NOT NULL AS fiscal_profile_validated
   FROM products p
     LEFT JOIN product_fiscal_profiles pf ON pf.product_id = p.id
     LEFT JOIN ( SELECT product_fiscal_evidence.product_id,
            count(*) AS evidence_count,
            max(COALESCE(product_fiscal_evidence.observed_at, product_fiscal_evidence.created_at)) AS last_evidence_at
           FROM product_fiscal_evidence
          GROUP BY product_fiscal_evidence.product_id) ev ON ev.product_id = p.id
     LEFT JOIN ( SELECT product_fiscal_review_items.product_id,
            count(*) AS open_issue_count
           FROM product_fiscal_review_items
          WHERE product_fiscal_review_items.status = ANY (ARRAY['open'::text, 'in_review'::text])
          GROUP BY product_fiscal_review_items.product_id) rv ON rv.product_id = p.id;

-- view: product_fiscal_rule_candidates_v1
create or replace view public.product_fiscal_rule_candidates_v1 with (security_invoker=true) as
 SELECT c.product_id,
    p.is_active,
    p.name,
    c.profile_ncm,
    c.ncm_consensus,
    c.cest_consensus,
    c.evidence_count,
    c.document_count,
    latest.fiscal_description AS evidence_description,
    r.id AS rule_id,
    r.segment_code,
    r.segment_name,
    r.cest AS rule_cest,
    r.ncm_legal_text,
    r.ncm_prefix,
    r.legal_description,
    rs.version_key AS rule_version,
    rs.status AS rule_set_status,
    fiscal_rule_description_matches_v1(COALESCE(latest.fiscal_description, p.name), r.qualifiers) AS description_matches
   FROM product_fiscal_evidence_consensus_v1 c
     JOIN products p ON p.id = c.product_id
     JOIN fiscal_rule_sets rs ON rs.jurisdiction = 'MT'::text AND rs.tax_kind = 'ICMS_ST'::text AND (rs.status = ANY (ARRAY['draft'::text, 'active'::text]))
     JOIN fiscal_st_rules_mt r ON r.rule_set_id = rs.id AND r.status = 'active'::text AND r.cest = c.cest_consensus AND c.ncm_consensus IS NOT NULL AND r.ncm_prefix IS NOT NULL AND "left"(c.ncm_consensus, length(r.ncm_prefix)) = r.ncm_prefix
     LEFT JOIN LATERAL ( SELECT e.fiscal_description,
            e.observed_at
           FROM product_fiscal_evidence e
          WHERE e.product_id = c.product_id AND e.evidence_type = 'supplier_nfe_xml'::text
          ORDER BY e.observed_at DESC NULLS LAST, e.created_at DESC
         LIMIT 1) latest ON true
  WHERE c.is_active AND c.evidence_count > 0 AND c.cest_consensus IS NOT NULL AND NOT c.ncm_conflict AND NOT c.cest_conflict AND NOT (EXISTS ( SELECT 1
           FROM product_fiscal_review_items ri
          WHERE ri.product_id = c.product_id AND (ri.status = ANY (ARRAY['open'::text, 'in_review'::text])) AND ri.severity = 'blocker'::text));

-- view: product_fiscal_rule_integrity_v1
create or replace view public.product_fiscal_rule_integrity_v1 with (security_invoker=true) as
 WITH matches AS (
         SELECT s.product_id,
            r.id AS rule_id,
            r.cest AS rule_cest,
            r.ncm_prefix,
            r.legal_description,
            rs.version_key,
            count(*) OVER (PARTITION BY s.product_id) AS rule_match_count
           FROM product_fiscal_catalog_scan_v1 s
             JOIN fiscal_rule_sets rs ON rs.jurisdiction = 'MT'::text AND rs.tax_kind = 'ICMS_ST'::text AND (rs.status = ANY (ARRAY['draft'::text, 'active'::text]))
             JOIN fiscal_st_rules_mt r ON r.rule_set_id = rs.id AND r.status = 'active'::text AND r.ncm_prefix IS NOT NULL AND s.ncm IS NOT NULL AND "left"(s.ncm, length(r.ncm_prefix)) = r.ncm_prefix AND fiscal_rule_description_matches_v1(COALESCE(( SELECT pf.fiscal_description
                   FROM product_fiscal_profiles pf
                  WHERE pf.product_id = s.product_id), s.name), r.qualifiers)
          WHERE s.is_active
        )
 SELECT m.product_id,
    m.rule_id,
    m.rule_cest,
    c.cest_consensus AS evidence_cest,
    m.ncm_prefix,
    m.legal_description,
    m.version_key,
    m.rule_match_count = 1 AS unique_legal_rule,
    m.rule_match_count = 1 AND c.cest_consensus IS NOT NULL AND c.cest_consensus <> m.rule_cest AS cest_rule_mismatch
   FROM matches m
     LEFT JOIN product_fiscal_evidence_consensus_v1 c ON c.product_id = m.product_id
  WHERE m.rule_match_count = 1;

-- view: product_fiscal_strict_validation_preview_v1
create or replace view public.product_fiscal_strict_validation_preview_v1 with (security_invoker=true) as
 SELECT p.id AS product_id,
    p.name,
    p.category,
    p.gtin,
    s.ncm,
    pf.origin_code,
    r.id AS rule_id,
    r.cest AS rule_cest,
    r.segment_code,
    r.segment_name,
    r.legal_description,
    rs.version_key AS rule_version,
    vp.source_url,
    vp.rationale,
    s.cest_consensus AS evidence_cest,
    s.ncm_consensus AS evidence_ncm,
    s.bling_evidence_count,
    s.supplier_xml_cest_count,
    s.open_blockers,
    s.gtin_status,
    p.is_active AND vp.validation_tier = 'strict_auto'::text AND s.legal_rule_match_count = 1 AND s.open_blockers = 0 AND s.gtin_status = 'valid'::text AND s.bling_evidence_count > 0 AND s.ncm_consensus = s.ncm AND COALESCE(c.ncm_conflict, false) = false AND COALESCE(c.cest_conflict, false) = false AND pf.origin_code IS NOT NULL AND c.origin_consensus IS NOT NULL AND COALESCE(c.origin_variation, false) = false AND c.origin_consensus = pf.origin_code AND (s.cest_consensus IS NULL OR s.cest_consensus = r.cest) AND (upper(TRIM(BOTH FROM COALESCE(p.category, ''::text))) = ANY (vp.allowed_categories)) AND (NOT (fiscal_normalize_text_v1(p.name) ~ '(^| )kit( |$)'::text OR fiscal_normalize_text_v1(p.name) ~ '(^| )combo( |$)'::text) OR (EXISTS ( SELECT 1
           FROM product_fiscal_evidence ce
          WHERE ce.product_id = p.id AND (ce.evidence_type = ANY (ARRAY['supplier_nfe_xml'::text, 'manufacturer_catalog'::text, 'web_product_catalog'::text])) AND ce.ncm = s.ncm AND ce.cest = r.cest))) AND NOT (EXISTS ( SELECT 1
           FROM product_fiscal_review_items ri
          WHERE ri.product_id = p.id AND (ri.status = ANY (ARRAY['open'::text, 'in_review'::text])) AND (ri.issue_code = ANY (ARRAY['ncm_evidence_conflict'::text, 'cest_evidence_conflict'::text, 'cest_rule_mismatch'::text, 'origin_evidence_conflict'::text, 'gtin_invalid'::text, 'legal_rule_ambiguous'::text, 'complex_bundle_needs_evidence'::text])))) AS validation_eligible
   FROM products p
     JOIN product_fiscal_profiles pf ON pf.product_id = p.id
     JOIN product_fiscal_catalog_scan_v1 s ON s.product_id = p.id
     JOIN product_fiscal_evidence_consensus_v1 c ON c.product_id = p.id
     JOIN fiscal_rule_sets rs ON rs.jurisdiction = 'MT'::text AND rs.tax_kind = 'ICMS_ST'::text AND (rs.status = ANY (ARRAY['draft'::text, 'active'::text]))
     JOIN fiscal_st_rules_mt r ON r.rule_set_id = rs.id AND r.status = 'active'::text AND r.ncm_prefix IS NOT NULL AND s.ncm IS NOT NULL AND "left"(s.ncm, length(r.ncm_prefix)) = r.ncm_prefix AND fiscal_rule_description_matches_v1(COALESCE(NULLIF(pf.fiscal_description, ''::text), NULLIF(p.description_long, ''::text), NULLIF(p.description_short, ''::text), p.name), r.qualifiers)
     JOIN fiscal_rule_validation_policy vp ON vp.rule_id = r.id AND vp.validation_tier = 'strict_auto'::text
  WHERE s.legal_rule_match_count = 1;

-- view: purchase_xml_catalog_candidates_v1
create or replace view public.purchase_xml_catalog_candidates_v1 with (security_invoker=true) as
 WITH observations AS (
         SELECT o.id,
            o.document_id,
            o.item_number,
            o.document_key,
            o.supplier_item_code,
            o.description,
            o.commercial_gtin,
            o.tax_gtin,
            o.ncm,
            o.cest,
            o.cfop,
            o.tax_code,
            o.origin_code,
            o.purchase_unit,
            o.purchase_quantity,
            o.purchase_unit_price,
            o.tax_unit,
            o.tax_quantity,
            o.line_total,
            o.net_line_total,
            o.lot_traces,
            o.tax_detail,
            o.raw_item,
            o.source_state,
            o.source_content_sha256,
            o.parser_version,
            o.extracted_at,
            o.updated_at,
            d.supplier_document,
            d.supplier_name,
            d.issued_at,
            i.product_id,
                CASE
                    WHEN TRIM(BOTH FROM COALESCE(o.commercial_gtin, ''::text)) ~ '^[0-9]{8,14}$'::text THEN 'gtin:'::text || TRIM(BOTH FROM o.commercial_gtin)
                    WHEN TRIM(BOTH FROM COALESCE(o.tax_gtin, ''::text)) ~ '^[0-9]{8,14}$'::text THEN 'tax_gtin:'::text || TRIM(BOTH FROM o.tax_gtin)
                    WHEN NULLIF(TRIM(BOTH FROM COALESCE(o.supplier_item_code, ''::text)), ''::text) IS NOT NULL AND NULLIF(TRIM(BOTH FROM COALESCE(d.supplier_document, ''::text)), ''::text) IS NOT NULL THEN (('supplier:'::text || d.supplier_document) || ':'::text) || o.supplier_item_code
                    ELSE (('unidentified:'::text || o.document_id::text) || ':'::text) || o.item_number::text
                END AS candidate_key
           FROM purchase_xml_catalog_observations_v1 o
             JOIN purchase_xml_documents d ON d.id = o.document_id
             LEFT JOIN purchase_xml_items i ON i.document_id = o.document_id AND i.item_number = o.item_number
        )
 SELECT candidate_key,
    (array_agg(description ORDER BY issued_at DESC NULLS LAST, extracted_at DESC))[1] AS display_name,
    (array_agg(commercial_gtin ORDER BY issued_at DESC NULLS LAST, extracted_at DESC))[1] AS gtin,
    (array_agg(tax_gtin ORDER BY issued_at DESC NULLS LAST, extracted_at DESC))[1] AS tax_gtin,
    (array_agg(ncm ORDER BY issued_at DESC NULLS LAST, extracted_at DESC))[1] AS last_observed_ncm,
    (array_agg(cest ORDER BY issued_at DESC NULLS LAST, extracted_at DESC))[1] AS last_observed_cest,
    (array_agg(purchase_unit ORDER BY issued_at DESC NULLS LAST, extracted_at DESC))[1] AS last_purchase_unit,
    count(*)::integer AS observations_count,
    count(DISTINCT document_id)::integer AS distinct_invoices,
    count(DISTINCT NULLIF(TRIM(BOTH FROM COALESCE(supplier_document, ''::text)), ''::text))::integer AS suppliers_count,
    count(DISTINCT NULLIF(TRIM(BOTH FROM COALESCE(ncm, ''::text)), ''::text))::integer AS ncm_variations,
    count(DISTINCT NULLIF(TRIM(BOTH FROM COALESCE(cest, ''::text)), ''::text))::integer AS cest_variations,
    count(DISTINCT product_id)::integer AS matched_product_variations,
        CASE
            WHEN count(DISTINCT product_id) = 1 THEN min(product_id::text)::uuid
            ELSE NULL::uuid
        END AS linked_product_id,
    bool_or(source_state = 'xml_verified'::text) AS xml_verified,
    min(issued_at) AS first_seen,
    max(issued_at) AS last_seen,
        CASE
            WHEN count(DISTINCT product_id) > 1 THEN 'identity_conflict'::text
            WHEN count(DISTINCT NULLIF(TRIM(BOTH FROM COALESCE(ncm, ''::text)), ''::text)) > 1 THEN 'fiscal_conflict'::text
            WHEN count(DISTINCT NULLIF(TRIM(BOTH FROM COALESCE(cest, ''::text)), ''::text)) > 1 THEN 'cest_conflict'::text
            WHEN count(DISTINCT product_id) = 0 THEN 'not_linked'::text
            ELSE 'linked_reviewable'::text
        END AS review_status
   FROM observations
  GROUP BY candidate_key;

-- view: purchase_xml_catalog_ingest_failures_v1
create or replace view public.purchase_xml_catalog_ingest_failures_v1 with (security_invoker=true) as
 SELECT e.document_id,
    d.document_key,
    d.source,
    d.supplier_name,
    d.issued_at,
    d.item_count,
    e.error_code,
    e.error_message,
    e.first_failed_at,
    e.last_failed_at,
    e.resolved_at
   FROM purchase_xml_catalog_ingest_errors_v1 e
     JOIN purchase_xml_documents d ON d.id = e.document_id
  WHERE e.resolved_at IS NULL;

-- view: purchase_xml_catalog_observation_details_v2
create or replace view public.purchase_xml_catalog_observation_details_v2 with (security_invoker=true) as
 SELECT
        CASE
            WHEN TRIM(BOTH FROM COALESCE(o.commercial_gtin, ''::text)) ~ '^[0-9]{8,14}$'::text THEN 'gtin:'::text || TRIM(BOTH FROM o.commercial_gtin)
            WHEN TRIM(BOTH FROM COALESCE(o.tax_gtin, ''::text)) ~ '^[0-9]{8,14}$'::text THEN 'tax_gtin:'::text || TRIM(BOTH FROM o.tax_gtin)
            WHEN NULLIF(TRIM(BOTH FROM COALESCE(o.supplier_item_code, ''::text)), ''::text) IS NOT NULL AND NULLIF(TRIM(BOTH FROM COALESCE(d.supplier_document, ''::text)), ''::text) IS NOT NULL THEN (('supplier:'::text || d.supplier_document) || ':'::text) || o.supplier_item_code
            ELSE (('unidentified:'::text || o.document_id::text) || ':'::text) || o.item_number::text
        END AS candidate_key,
    o.id AS observation_id,
    o.document_id,
    o.item_number,
    i.id AS purchase_item_id,
    i.product_id AS linked_product_id,
    p.name AS linked_product_name,
    p.gtin AS linked_product_gtin,
    p.ncm AS linked_product_ncm,
    f.cest AS linked_product_cest,
    p.is_active AS linked_product_active,
    d.document_key,
    d.issued_at,
    d.supplier_name,
    d.supplier_document,
    d.source,
    d.metadata ->> 'catalog_only'::text AS catalog_only,
    o.description AS xml_description,
    o.supplier_item_code,
    o.commercial_gtin,
    o.tax_gtin,
    o.ncm AS xml_ncm,
    o.cest AS xml_cest,
    o.cfop AS xml_cfop,
    o.purchase_unit,
    o.purchase_quantity,
    o.purchase_unit_price,
    o.line_total,
    o.net_line_total,
    o.tax_unit,
    o.tax_quantity,
    o.lot_traces,
    o.source_state,
    o.parser_version,
    i.conversion_status,
    i.conversion_factor,
    i.processing_status AS item_status,
    o.extracted_at
   FROM purchase_xml_catalog_observations_v1 o
     JOIN purchase_xml_documents d ON d.id = o.document_id
     LEFT JOIN purchase_xml_items i ON i.document_id = o.document_id AND i.item_number = o.item_number
     LEFT JOIN products p ON p.id = i.product_id
     LEFT JOIN product_fiscal_profiles f ON f.product_id = p.id;

-- view: purchase_xml_catalog_reconciliation_v1
create or replace view public.purchase_xml_catalog_reconciliation_v1 with (security_invoker=true) as
 SELECT d.id AS document_id,
    d.document_key,
    d.source,
    d.issued_at,
    d.created_at,
    d.item_count AS declared_items,
    count(DISTINCT i.item_number)::integer AS items_staged,
    count(DISTINCT o.item_number)::integer AS observations_captured,
    count(DISTINCT o.item_number) FILTER (WHERE o.source_state = 'xml_verified'::text)::integer AS xml_verified_items,
    GREATEST(COALESCE(d.item_count, 0) - count(DISTINCT i.item_number), 0::bigint)::integer AS missing_staging_items,
    GREATEST(COALESCE(d.item_count, 0) - count(DISTINCT o.item_number), 0::bigint)::integer AS missing_observations,
    d.processing_status,
        CASE
            WHEN count(DISTINCT o.item_number) FILTER (WHERE o.source_state = 'xml_verified'::text) = d.item_count THEN 'complete_from_xml'::text
            WHEN count(DISTINCT o.item_number) = d.item_count THEN 'staging_only'::text
            ELSE 'incomplete'::text
        END AS catalog_readiness
   FROM purchase_xml_documents d
     LEFT JOIN purchase_xml_items i ON i.document_id = d.id
     LEFT JOIN purchase_xml_catalog_observations_v1 o ON o.document_id = d.id
  GROUP BY d.id;

-- view: purchase_xml_catalog_technical_evidence_v4
create or replace view public.purchase_xml_catalog_technical_evidence_v4 with (security_invoker=true) as
 WITH raw AS (
         SELECT o.id AS observation_id,
            o.document_id,
            o.item_number,
            d.document_key,
            d.issued_at,
            d.source AS document_source,
            d.supplier_document,
            d.supplier_name,
            o.description,
            o.commercial_gtin,
            o.tax_gtin,
            o.supplier_item_code,
            o.ncm AS xml_ncm,
            o.cest AS xml_cest,
            o.cfop AS xml_cfop,
            o.purchase_unit AS xml_commercial_unit,
            o.purchase_quantity AS xml_commercial_quantity,
            o.tax_unit AS xml_tax_unit,
            o.tax_quantity AS xml_tax_quantity,
            o.purchase_unit_price AS xml_commercial_unit_price,
            o.line_total AS xml_line_total,
            o.net_line_total AS xml_net_line_total,
            o.lot_traces,
            o.source_state,
            o.parser_version,
            o.source_content_sha256,
            COALESCE(o.raw_item -> 'prod'::text, '{}'::jsonb) AS prod,
            COALESCE(o.tax_detail, '{}'::jsonb) AS tax
           FROM purchase_xml_catalog_observations_v1 o
             JOIN purchase_xml_documents d ON d.id = o.document_id
        ), decomposed AS (
         SELECT r.observation_id,
            r.document_id,
            r.item_number,
            r.document_key,
            r.issued_at,
            r.document_source,
            r.supplier_document,
            r.supplier_name,
            r.description,
            r.commercial_gtin,
            r.tax_gtin,
            r.supplier_item_code,
            r.xml_ncm,
            r.xml_cest,
            r.xml_cfop,
            r.xml_commercial_unit,
            r.xml_commercial_quantity,
            r.xml_tax_unit,
            r.xml_tax_quantity,
            r.xml_commercial_unit_price,
            r.xml_line_total,
            r.xml_net_line_total,
            r.lot_traces,
            r.source_state,
            r.parser_version,
            r.source_content_sha256,
            r.prod,
            r.tax,
            ( SELECT jsonb_each.key
                   FROM jsonb_each(COALESCE(r.tax -> 'ICMS'::text, '{}'::jsonb)) jsonb_each(key, value)
                 LIMIT 1) AS icms_group,
            ( SELECT jsonb_each.value
                   FROM jsonb_each(COALESCE(r.tax -> 'ICMS'::text, '{}'::jsonb)) jsonb_each(key, value)
                 LIMIT 1) AS icms_values,
            ( SELECT jsonb_each.key
                   FROM jsonb_each(COALESCE(r.tax -> 'PIS'::text, '{}'::jsonb)) jsonb_each(key, value)
                 LIMIT 1) AS pis_group,
            ( SELECT jsonb_each.value
                   FROM jsonb_each(COALESCE(r.tax -> 'PIS'::text, '{}'::jsonb)) jsonb_each(key, value)
                 LIMIT 1) AS pis_values,
            ( SELECT jsonb_each.key
                   FROM jsonb_each(COALESCE(r.tax -> 'COFINS'::text, '{}'::jsonb)) jsonb_each(key, value)
                 LIMIT 1) AS cofins_group,
            ( SELECT jsonb_each.value
                   FROM jsonb_each(COALESCE(r.tax -> 'COFINS'::text, '{}'::jsonb)) jsonb_each(key, value)
                 LIMIT 1) AS cofins_values,
            ( SELECT jsonb_each.key
                   FROM jsonb_each(COALESCE(r.tax -> 'IPI'::text, '{}'::jsonb)) jsonb_each(key, value)
                  WHERE jsonb_each.key = ANY (ARRAY['IPITrib'::text, 'IPINT'::text])
                 LIMIT 1) AS ipi_group,
            ( SELECT jsonb_each.value
                   FROM jsonb_each(COALESCE(r.tax -> 'IPI'::text, '{}'::jsonb)) jsonb_each(key, value)
                  WHERE jsonb_each.key = ANY (ARRAY['IPITrib'::text, 'IPINT'::text])
                 LIMIT 1) AS ipi_values
           FROM raw r
        )
 SELECT observation_id,
    document_id,
    item_number,
    document_key,
    issued_at,
    document_source,
    supplier_document,
    supplier_name,
    description,
    commercial_gtin,
    tax_gtin,
    supplier_item_code,
    xml_ncm,
    xml_cest,
    xml_cfop,
        CASE
            WHEN "left"(xml_cfop, 1) = '5'::text THEN 'issuer_in_state'::text
            WHEN "left"(xml_cfop, 1) = '6'::text THEN 'issuer_interstate'::text
            WHEN "left"(xml_cfop, 1) = '7'::text THEN 'issuer_foreign'::text
            ELSE 'issuer_region_unclassified'::text
        END AS cfop_region_hint,
    xml_cfop = '5910'::text AS operation_requires_manual_review,
    xml_commercial_unit,
    xml_commercial_quantity,
    xml_commercial_unit_price,
    xml_tax_unit,
    xml_tax_quantity,
    prod ->> 'vUnTrib'::text AS xml_tax_unit_price_text,
    prod ->> 'indTot'::text AS xml_in_invoice_total_flag,
    prod ->> 'xPed'::text AS supplier_order_reference,
    prod ->> 'nItemPed'::text AS supplier_order_line,
    prod ->> 'indEscala'::text AS manufacturing_scale_flag,
    prod ->> 'cBenef'::text AS fiscal_benefit_code,
    prod ->> 'nFCI'::text AS import_fci_number,
    prod ->> 'CNPJFab'::text AS manufacturer_document_xml,
    xml_line_total,
    xml_net_line_total,
    prod ->> 'vDesc'::text AS xml_discount_text,
    prod ->> 'vFrete'::text AS xml_freight_text,
    prod ->> 'vSeg'::text AS xml_insurance_text,
    prod ->> 'vOutro'::text AS xml_other_expenses_text,
    icms_group,
    icms_values ->> 'orig'::text AS xml_origin_code,
    icms_values ->> 'CST'::text AS xml_icms_cst,
    icms_values ->> 'CSOSN'::text AS xml_icms_csosn,
    icms_values ->> 'pICMS'::text AS xml_icms_rate_text,
    icms_values ->> 'vICMS'::text AS xml_icms_amount_text,
    icms_values ->> 'pICMSST'::text AS xml_icms_st_rate_text,
    icms_values ->> 'vICMSST'::text AS xml_icms_st_amount_text,
    pis_group,
    pis_values ->> 'CST'::text AS xml_pis_cst,
    pis_values ->> 'pPIS'::text AS xml_pis_rate_text,
    pis_values ->> 'vPIS'::text AS xml_pis_amount_text,
    cofins_group,
    cofins_values ->> 'CST'::text AS xml_cofins_cst,
    cofins_values ->> 'pCOFINS'::text AS xml_cofins_rate_text,
    cofins_values ->> 'vCOFINS'::text AS xml_cofins_amount_text,
    ipi_group,
    ipi_values ->> 'CST'::text AS xml_ipi_cst,
    ipi_values ->> 'pIPI'::text AS xml_ipi_rate_text,
    ipi_values ->> 'vIPI'::text AS xml_ipi_amount_text,
    tax -> 'II'::text AS xml_import_duty_detail,
    (tax -> 'IBSCBS'::text) ->> 'CST'::text AS xml_ibs_cbs_cst,
    (tax -> 'IBSCBS'::text) ->> 'cClassTrib'::text AS xml_ibs_cbs_classification,
    tax #>> '{IBSCBS,gIBSCBS,vBC}'::text[] AS xml_ibs_cbs_tax_base_text,
    tax #>> '{IBSCBS,gIBSCBS,vIBS}'::text[] AS xml_ibs_amount_text,
    tax #>> '{IBSCBS,gIBSCBS,gIBSUF,pIBSUF}'::text[] AS xml_ibs_state_rate_text,
    tax #>> '{IBSCBS,gIBSCBS,gIBSUF,vIBSUF}'::text[] AS xml_ibs_state_amount_text,
    tax #>> '{IBSCBS,gIBSCBS,gIBSMun,pIBSMun}'::text[] AS xml_ibs_city_rate_text,
    tax #>> '{IBSCBS,gIBSCBS,gIBSMun,vIBSMun}'::text[] AS xml_ibs_city_amount_text,
    tax #>> '{IBSCBS,gIBSCBS,gCBS,pCBS}'::text[] AS xml_cbs_rate_text,
    tax #>> '{IBSCBS,gIBSCBS,gCBS,vCBS}'::text[] AS xml_cbs_amount_text,
    tax -> 'ICMSUFDest'::text AS xml_destination_icms_detail,
        CASE
            WHEN jsonb_typeof(lot_traces) = 'array'::text THEN jsonb_array_length(lot_traces)
            ELSE 0
        END AS xml_lot_count,
    lot_traces AS xml_lot_trace,
    NULL::numeric AS unconfirmed_package_height_cm,
    NULL::numeric AS unconfirmed_package_width_cm,
    NULL::numeric AS unconfirmed_package_depth_cm,
    NULL::numeric AS unconfirmed_item_gross_weight_kg,
    'external_supplier_nfe_observation_only'::text AS fiscal_evidence_status,
    false AS approved_for_catalog_update,
    false AS approved_for_stock_movement,
    source_state,
    parser_version,
    source_content_sha256
   FROM decomposed;

-- view: si5_catalog_research_progress_v1
create or replace view public.si5_catalog_research_progress_v1 with (security_invoker=true) as
 SELECT ( SELECT si5_research_config.enabled
           FROM si5_research_config
          WHERE si5_research_config.id = true) AS enabled,
    ( SELECT si5_research_config.research_mode
           FROM si5_research_config
          WHERE si5_research_config.id = true) AS research_mode,
    (( SELECT count(*) AS count
           FROM si5_product_research))::integer AS queue_total,
    (( SELECT count(*) AS count
           FROM si5_product_research
          WHERE si5_product_research.status = 'pending'::text))::integer AS pending,
    (( SELECT count(*) AS count
           FROM si5_product_research
          WHERE si5_product_research.status = 'review'::text))::integer AS ready_for_review,
    (( SELECT count(*) AS count
           FROM si5_research_requests
          WHERE si5_research_requests.quota_date = (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date))::integer AS api_attempts_today,
    (( SELECT count(*) AS count
           FROM si5_research_requests))::integer AS api_attempts_total;

-- view: site_product_taxonomy_usage_v1
create or replace view public.site_product_taxonomy_usage_v1 with (security_invoker=true) as
 SELECT id,
    kind,
    name,
    parent_id,
    created_at,
    updated_at,
        CASE kind
            WHEN 'category'::text THEN ( SELECT count(*) AS count
               FROM products p
              WHERE lower(btrim(p.category)) = lower(t.name))
            WHEN 'brand'::text THEN ( SELECT count(*) AS count
               FROM products p
              WHERE lower(btrim(p.brand)) = lower(t.name))
            WHEN 'gondola'::text THEN ( SELECT count(*) AS count
               FROM products p
              WHERE lower(btrim(p.gondola)) = lower(t.name))
            WHEN 'subcategory'::text THEN ( SELECT count(*) AS count
               FROM products p
              WHERE lower(btrim(p.subcategory)) = lower(t.name) AND COALESCE(lower(btrim(p.category)), ''::text) = COALESCE(( SELECT lower(c.name) AS lower
                       FROM product_taxonomy_terms c
                      WHERE c.id = t.parent_id), ''::text))
            ELSE 0::bigint
        END AS usage_count,
    ( SELECT count(*) AS count
           FROM product_taxonomy_terms child
          WHERE child.parent_id = t.id) AS child_count
   FROM product_taxonomy_terms t;

-- view: storefront_ean_sellable_stock_v1
create or replace view public.storefront_ean_sellable_stock_v1 as
 SELECT s.product_id,
    s.name,
    s.sku,
    s.gtin,
    s.is_active,
    s.legacy_stock,
    s.bling_product_id,
    s.link_status,
    s.bling_physical_total,
    s.bling_virtual_total,
    s.selected_deposit_id,
    s.sellable_physical,
    s.sellable_virtual,
    s.mirror_observed_at,
    s.source_event_id,
    s.source_resource,
    s.stock_authority,
    s.stock_cutover_at,
    s.bling_stock_ready,
    s.effective_sellable_stock,
    s.stock_source_reason,
    s.basket_locked_quantity,
    s.loose_sellable_stock,
        CASE
            WHEN p.is_active IS NOT TRUE OR COALESCE(p.price, 0::numeric) <= 0::numeric OR p.validity_date IS NOT NULL AND p.validity_date < CURRENT_DATE THEN 0::numeric
            ELSE GREATEST(0::numeric, floor(s.loose_sellable_stock - supabase_stock_pending_reservations_v1(p.id, NULL::uuid)))
        END AS ean_sellable_stock
   FROM ops2_loose_sellable_stock_v1 s
     JOIN products p ON p.id = s.product_id;

-- view: storefront_product_sellable_stock_v1
create or replace view public.storefront_product_sellable_stock_v1 as
 SELECT p.id AS product_id,
    COALESCE(p.stock, 0::numeric) AS catalog_stock,
    0::numeric AS basket_locked_quantity,
    reservations.pending_order_quantity,
    GREATEST(0::numeric, COALESCE(p.stock, 0::numeric) - reservations.pending_order_quantity) AS sellable_stock,
    p.is_active,
    p.is_whatsapp_active,
    COALESCE(p.price, 0::numeric) AS price,
    p.validity_date
   FROM products p
     CROSS JOIN LATERAL ( SELECT COALESCE(supabase_stock_pending_reservations_v1(p.id, NULL::uuid), 0::numeric) AS pending_order_quantity) reservations;
