alter table public.creative_video_projects
  alter column product_id drop not null;

comment on column public.creative_video_projects.product_id is
  'Produto principal opcional; projetos institucionais podem não possuir produto.';
