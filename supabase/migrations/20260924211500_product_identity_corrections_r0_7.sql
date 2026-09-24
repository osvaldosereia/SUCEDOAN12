begin;

create table if not exists public.product_identity_correction_proposals (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  field_name text not null,
  action text not null check (action in ('replace','clear','merge_duplicate')),
  current_value text,
  proposed_value text,
  duplicate_target_product_id uuid references public.products(id) on delete set null,
  confidence numeric(5,4) not null default 0
    check (confidence>=0 and confidence<=1),
  status text not null default 'proposed'
    check (status in ('proposed','approved','applied','dismissed','blocked')),
  evidence jsonb not null default '[]'::jsonb,
  rationale text,
  approved_at timestamptz,
  approved_by uuid,
  applied_at timestamptz,
  applied_by uuid,
  application_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(field_name))>0),
  check (
    (action='clear' and proposed_value is null)
    or (action in ('replace','merge_duplicate') and proposed_value is not null)
  )
);

create unique index if not exists product_identity_correction_open_uidx
  on public.product_identity_correction_proposals(product_id,field_name)
  where status in ('proposed','approved','blocked');

create index if not exists product_identity_correction_status_idx
  on public.product_identity_correction_proposals(status,confidence desc,created_at);

alter table public.product_identity_correction_proposals enable row level security;
revoke all on table public.product_identity_correction_proposals from anon,authenticated;
grant select,insert,update,delete on table public.product_identity_correction_proposals to service_role;

insert into public.product_identity_correction_proposals(
  product_id,field_name,action,current_value,proposed_value,confidence,status,evidence,rationale
)
values
(
  'c66ad107-6322-4a71-9083-428b0486861e','gtin','replace',
  '7899552808687','7899572808687',0.9900,'proposed',
  jsonb_build_array(
    jsonb_build_object(
      'source','Época Cosméticos',
      'url','https://www.epocacosmeticos.com.br/melhor-oferta/7899572808687',
      'value','7899572808687',
      'match','Shampoo Antifrizz Lola Cosmetics Liso, Leve and Solto 250ml'
    ),
    jsonb_build_object(
      'source','Amobeleza',
      'url','https://www.amobeleza.com.br/shampoo-antifrizz-lola-cosmetics-liso-leve-and-solto-250-ml/p',
      'value','7899572808687',
      'match','Shampoo Lola Cosmetics Liso, Leve And Solto 250ml'
    )
  ),
  'GTIN atual falha no dígito verificador. Duas referências independentes identificam o mesmo produto/volume com GTIN válido 7899572808687.'
),
(
  'fe870468-e7ff-4b8d-8e6a-a5adad9b5b62','gtin','replace',
  '7896004006407','7896004006239',0.9950,'proposed',
  jsonb_build_array(
    jsonb_build_object(
      'source','Kalunga',
      'url','https://www.kalunga.com.br/prod/batata-pringles-creme-e-cebola-109g-pringles-pt-1-un/324932',
      'value','7896004006239',
      'match','Pringles Creme e Cebola 109g'
    ),
    jsonb_build_object(
      'source','Imigrantes Bebidas',
      'url','https://www.imigrantesbebidas.com.br/batata-pringles-creme-e-cebola-109g',
      'value','7896004006239',
      'match','Pringles Creme e Cebola 109g'
    ),
    jsonb_build_object(
      'source','Goiás Atacado',
      'url','https://www.goiasatacado.com.br/batata-pringles-109g-creme-e-cebola-lata-44360-5',
      'value','7896004006239',
      'match','Pringles Creme e Cebola 109g'
    )
  ),
  'GTIN atual falha no dígito verificador. Fontes independentes concordam em 7896004006239 para Creme e Cebola 109g; 7896004006406 corresponde ao sabor Churrasco.'
),
(
  'd513bd0e-ac58-4432-9027-f0a3dea77e35','gtin','merge_duplicate',
  '787896038300136','7896038300136',0.9950,'proposed',
  jsonb_build_array(
    jsonb_build_object(
      'source','Cosmos/Bluesoft',
      'url','https://api.cosmos.bluesoft.com.br/produtos/7896038300136-flocao-milho-urbano-500g',
      'value','7896038300136',
      'match','Flocão Milho Urbano 500g'
    ),
    jsonb_build_object(
      'source','Covabra',
      'url','https://www.covabra.com.br/flocos-milho-urbano-flocao-500g/p',
      'value','7896038300136',
      'match','Flocos Milho Urbano Flocão 500g'
    )
  ),
  'Há outro produto ativo canônico com o mesmo nome e GTIN válido 7896038300136. Não aplicar troca simples: o registro inválido possui estoque próprio e exige conciliação/merge controlado.'
)
on conflict (product_id,field_name) where status in ('proposed','approved','blocked')
do update set
  action=excluded.action,
  current_value=excluded.current_value,
  proposed_value=excluded.proposed_value,
  confidence=excluded.confidence,
  evidence=excluded.evidence,
  rationale=excluded.rationale,
  duplicate_target_product_id=excluded.duplicate_target_product_id,
  updated_at=now();

update public.product_identity_correction_proposals
set duplicate_target_product_id='295c77ae-79cc-42ee-9763-c43b0dbb3e20',updated_at=now()
where product_id='d513bd0e-ac58-4432-9027-f0a3dea77e35'
  and field_name='gtin'
  and status in ('proposed','approved','blocked');

create or replace view public.product_identity_correction_preview_v1
with (security_invoker=true)
as
select
  q.id as proposal_id,
  q.product_id,
  p.name,
  p.is_active,
  q.field_name,
  q.action,
  q.current_value,
  q.proposed_value,
  q.confidence,
  q.status,
  q.duplicate_target_product_id,
  dp.name as duplicate_target_name,
  p.stock as current_stock,
  dp.stock as duplicate_target_stock,
  case
    when q.field_name='gtin' and q.proposed_value is not null
      then public.fiscal_valid_gtin_v1(q.proposed_value)
    else true
  end as proposed_value_valid,
  (
    select count(*)
    from public.products x
    where x.id<>q.product_id
      and q.field_name='gtin'
      and regexp_replace(coalesce(x.gtin,''),'\D','','g')=regexp_replace(coalesce(q.proposed_value,''),'\D','','g')
  )::bigint as proposed_value_existing_products,
  case
    when q.status<>'approved' then 'not_approved'
    when q.action='merge_duplicate' then 'manual_merge_required'
    when q.field_name='gtin' and not public.fiscal_valid_gtin_v1(q.proposed_value) then 'proposed_gtin_invalid'
    when exists (
      select 1 from public.products x
      where x.id<>q.product_id
        and q.field_name='gtin'
        and regexp_replace(coalesce(x.gtin,''),'\D','','g')=regexp_replace(coalesce(q.proposed_value,''),'\D','','g')
    ) then 'proposed_value_already_used'
    else 'ready_for_controlled_apply'
  end as apply_gate,
  q.evidence,
  q.rationale,
  false as external_write
from public.product_identity_correction_proposals q
join public.products p on p.id=q.product_id
left join public.products dp on dp.id=q.duplicate_target_product_id;

revoke all on table public.product_identity_correction_preview_v1 from anon,authenticated;
grant select on table public.product_identity_correction_preview_v1 to service_role;

comment on table public.product_identity_correction_proposals is
  'Auditable identity correction proposals. Proposals never change catalog/Bling by themselves.';
comment on view public.product_identity_correction_preview_v1 is
  'Fail-closed preview for identity corrections; merge_duplicate is never automatically apply-eligible.';

commit;
