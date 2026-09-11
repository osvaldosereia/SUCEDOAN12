create table if not exists public.shopping_chat_helper_config (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  prompt_text text not null default 'Quer ajuda?',
  avatar_url text,
  menu_items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.shopping_chat_helper_config enable row level security;

insert into public.shopping_chat_helper_config (id, enabled, prompt_text, avatar_url, menu_items)
values (
  1,
  true,
  'Quer ajuda?',
  null,
  jsonb_build_array(
    jsonb_build_object('id','baskets','label','Cestas Básicas','kind','baskets','enabled',true,'sort_order',10,'response_text',''),
    jsonb_build_object('id','offers','label','Ofertas','kind','offers','enabled',true,'sort_order',20,'response_text',''),
    jsonb_build_object('id','products','label','Produtos','kind','products','enabled',true,'sort_order',30,'response_text',''),
    jsonb_build_object('id','payment','label','Formas de pagamento','kind','payment','enabled',true,'sort_order',40,'response_text','Você pode pagar na entrega por PIX, cartão de crédito, cartão alimentação/refeição ou dinheiro.'),
    jsonb_build_object('id','delivery','label','Sobre as entregas','kind','delivery','enabled',true,'sort_order',50,'response_text','Entregamos em Cuiabá e Várzea Grande. As informações da entrega e da rota são confirmadas no atendimento e no fechamento do pedido.'),
    jsonb_build_object('id','profile','label','Meu cadastro','kind','profile','enabled',true,'sort_order',60,'response_text','Vou mostrar abaixo os dados básicos que já temos no seu cadastro.')
  )
)
on conflict (id) do nothing;

comment on table public.shopping_chat_helper_config is 'Configuração singleton do botão flutuante e menu determinístico do chat de compra.';
