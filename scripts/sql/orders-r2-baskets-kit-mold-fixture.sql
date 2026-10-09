-- R02 basket/kit/mold test data. PostgreSQL 17 ephemeral database ONLY.
-- Runs AFTER orders-r2-checkout-base-fixture.sql. No real customer data.
\set ON_ERROR_STOP on
ALTER TABLE public.basket_templates
  ADD COLUMN base_price numeric(14,2),
  ADD COLUMN hidden_adjustment numeric(14,2) DEFAULT 0,
  ADD COLUMN uses_hygiene_kit boolean DEFAULT false,
  ADD COLUMN split_kits_enabled boolean DEFAULT false;
ALTER TABLE public.basket_stock_lots
  ADD COLUMN lot_kind text,
  ADD COLUMN kit_template_id uuid,
  ADD COLUMN linked_lot_id uuid,
  ADD COLUMN linked_hygiene_lot_id uuid,
  ADD COLUMN sale_price_override numeric(14,2),
  ADD COLUMN lot_code text,
  ADD COLUMN short_code text,
  ADD COLUMN public_name text;
ALTER TABLE public.basket_molds
  ADD COLUMN hidden_adjustment numeric(14,2) DEFAULT 0,
  ADD COLUMN public_composition_count smallint DEFAULT 1,
  ADD COLUMN conditional_hidden_enabled boolean DEFAULT false,
  ADD COLUMN conditional_hidden_product_id uuid,
  ADD COLUMN conditional_hidden_adjustment numeric(14,2) DEFAULT 0;
CREATE TABLE public.basket_mold_positions(
  id uuid PRIMARY KEY,mold_id uuid NOT NULL,
  label text NOT NULL,quantity numeric(14,3) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE public.basket_mold_position_options(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL,
  product_id uuid NOT NULL
);
CREATE TABLE public.basket_kit_templates(
  id uuid PRIMARY KEY,kind text NOT NULL,
  basket_id uuid NOT NULL,name text NOT NULL
);
CREATE TABLE public.basket_kit_template_items(
  id uuid PRIMARY KEY,
  kit_template_id uuid NOT NULL,
  product_id uuid NOT NULL,
  removable boolean DEFAULT true,
  quantity_editable boolean DEFAULT true,
  min_quantity numeric(14,3),
  max_quantity numeric(14,3),
  remove_unit_delta numeric(14,2),
  add_unit_delta numeric(14,2)
);
CREATE TABLE public.basket_stock_lot_items(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL,
  product_id uuid NOT NULL,
  source_template_item_id uuid,
  kit_template_item_id uuid,
  quantity_per_basket numeric(14,3) NOT NULL DEFAULT 1,
  position_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.basket_template_items(
  id uuid PRIMARY KEY,
  basket_id uuid NOT NULL,
  product_id uuid NOT NULL,
  removable boolean DEFAULT true,
  quantity_editable boolean DEFAULT true,
  min_quantity numeric(14,3),
  max_quantity numeric(14,3),
  remove_unit_delta numeric(14,2),
  add_unit_delta numeric(14,2)
);

-- The live availability view references ~40 other columns and categories.
-- This isolated shim keeps its availability/linked-stock semantics for the
-- checkout branch under test. It is NOT a canonical clone of the real view.
CREATE VIEW public.basket_lot_public_availability_v1 AS
SELECT l.id AS lot_id,
CASE WHEN l.status='ready' AND l.quantity_available>0
  AND (l.linked_lot_id IS NULL OR EXISTS (
    SELECT 1 FROM public.basket_stock_lots linked
    WHERE linked.id=l.linked_lot_id
      AND linked.status='ready' AND linked.quantity_available>0
  )) THEN 'available' ELSE 'depleted' END AS availability_reason,
CASE WHEN l.status='ready' AND l.quantity_available>0 THEN
  CASE WHEN l.linked_lot_id IS NOT NULL THEN LEAST(l.quantity_available,
    COALESCE((SELECT h.quantity_available FROM public.basket_stock_lots h
      WHERE h.id=l.linked_lot_id AND h.status='ready'),0))
  ELSE l.quantity_available END
  ELSE 0 END::integer AS public_available
FROM public.basket_stock_lots l;

INSERT INTO public.products(id,sku,name,price,stock,is_active)
VALUES
('00000000-0000-4000-8000-0000000000e1','FOOD-1','ALIMENTO KIT',50,20,true),
('00000000-0000-4000-8000-0000000000e2','CLEAN-1','HIGIENE KIT',20,20,true),
('00000000-0000-4000-8000-0000000000e3','MOLD-1','MOLDE ARROZ',60,10,true),
('00000000-0000-4000-8000-0000000000e4','MOLD-2','MOLDE SABAO',30,10,true),
('00000000-0000-4000-8000-0000000000e5','LEGACY-1','CESTA LEGADA',40,10,true);
INSERT INTO public.basket_templates(id,name,base_price,uses_hygiene_kit,split_kits_enabled)
VALUES
('00000000-0000-4000-8000-0000000000d1','CESTA KITS',160,true,true),
('00000000-0000-4000-8000-0000000000d3','CESTA MOLDE',100,false,true),
('00000000-0000-4000-8000-0000000000d4','CESTA LEGADA',120,false,false);
INSERT INTO public.basket_kit_templates(id,kind,basket_id,name)
VALUES
('00000000-0000-4000-8000-0000000000a1','food','00000000-0000-4000-8000-0000000000d1','ALIMENTOS'),
('00000000-0000-4000-8000-0000000000a2','hygiene','00000000-0000-4000-8000-0000000000d1','HIGIENE');
INSERT INTO public.basket_kit_template_items
(id,kit_template_id,product_id,remove_unit_delta,add_unit_delta)
VALUES
('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000e1',-50,50),
('00000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-0000000000e2',-20,20);
INSERT INTO public.basket_stock_lots
(id,basket_id,kit_template_id,status,lot_kind,quantity_available,
 linked_lot_id,short_code,sale_price_override,public_name,lot_code)
VALUES
('00000000-0000-4000-8000-0000000000f1',null,'00000000-0000-4000-8000-0000000000a1','ready','food',6,
 '00000000-0000-4000-8000-0000000000f2','AB1',160,'ALIMENTOS LOTE','AB1'),
('00000000-0000-4000-8000-0000000000f2',null,'00000000-0000-4000-8000-0000000000a2','ready','hygiene',6,
 null,'CL1',null,'HIGIENE LOTE','CL1'),
('00000000-0000-4000-8000-0000000000f3','00000000-0000-4000-8000-0000000000d4',null,'ready','legacy_full',4,
 null,'LG1',120,'LEGADO LOTE','LG1');
INSERT INTO public.basket_stock_lot_items
(lot_id,product_id,kit_template_item_id,quantity_per_basket,position_order)
VALUES
('00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000e1',
 '00000000-0000-4000-8000-0000000000b1',1,1),
('00000000-0000-4000-8000-0000000000f2','00000000-0000-4000-8000-0000000000e2',
 '00000000-0000-4000-8000-0000000000b2',1,1),
('00000000-0000-4000-8000-0000000000f3','00000000-0000-4000-8000-0000000000e5',
 null,1,1);
INSERT INTO public.basket_molds(id,basket_id,hidden_adjustment,public_composition_count,
 conditional_hidden_enabled,conditional_hidden_product_id,conditional_hidden_adjustment)
VALUES ('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000d3',
 10,3,true,'00000000-0000-4000-8000-0000000000e3',5);
INSERT INTO public.basket_mold_positions(id,mold_id,label,quantity,sort_order)
VALUES
('00000000-0000-4000-8000-0000000000c2','00000000-0000-4000-8000-0000000000c1','ARROZ',1,1),
('00000000-0000-4000-8000-0000000000c3','00000000-0000-4000-8000-0000000000c1','LIMPEZA',1,2);
INSERT INTO public.basket_mold_position_options(position_id,product_id)
VALUES
('00000000-0000-4000-8000-0000000000c2','00000000-0000-4000-8000-0000000000e3'),
('00000000-0000-4000-8000-0000000000c3','00000000-0000-4000-8000-0000000000e4');
