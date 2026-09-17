alter table public.creative_storyboard_gemini_packages
  add column if not exists critical_reinforcement text;

comment on column public.creative_storyboard_gemini_packages.critical_reinforcement is
  'Regras críticas de continuidade/fidelidade que devem acompanhar o prompt principal do pacote Gemini.';
