-- Synthetic fixture after R06/R07 canonical captured routines and assertions.
-- Existing R07 tests leave the 001 order VERIFIED with provider order 12345.
\set ON_ERROR_STOP on
-- R02 captured minimal schema does not include full production order fields.
ALTER TABLE public.orders ADD COLUMN bling_order_id bigint;
CREATE TABLE public.bling_hub_entity_links_v2(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL,entity_type text NOT NULL,
  source_id text NOT NULL,bling_id bigint NOT NULL,
  identity_value text NOT NULL,status text NOT NULL
);
UPDATE public.orders SET bling_order_id=12345
 WHERE id='00000000-0000-4000-8000-000000000010';
INSERT INTO public.bling_hub_entity_links_v2
(source_system,entity_type,source_id,bling_id,identity_value,status)
VALUES ('vitrine_qx','order','00000000-0000-4000-8000-000000000010',
  12345,'VITRINE-00000000-0000-4000-8000-000000000010','matched');
-- Optional second verified R07 receipt, for concurrency and uncertain outcome.
UPDATE public.orders SET bling_order_id=23456
 WHERE id='00000000-0000-4000-8000-000000000050';
INSERT INTO public.bling_hub_entity_links_v2
(source_system,entity_type,source_id,bling_id,identity_value,status)
VALUES ('vitrine_qx','order','00000000-0000-4000-8000-000000000050',
  23456,'VITRINE-00000000-0000-4000-8000-000000000050','matched');
INSERT INTO public.order_bling_r7_sync_intents_v1
  (order_id,manifest,payload_hash,status,bling_order_id,attempts,finished_at)
SELECT order_id,metadata->'r6_reconciliation',repeat('c',64),
  'verified',23456,1,now()
FROM public.order_separation_completions_v1
WHERE order_id='00000000-0000-4000-8000-000000000050';
