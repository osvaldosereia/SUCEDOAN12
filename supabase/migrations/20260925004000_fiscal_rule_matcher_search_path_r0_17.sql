begin;

alter function public.fiscal_rule_description_matches_v1(text,jsonb)
  set search_path = public;

comment on function public.fiscal_rule_description_matches_v1(text,jsonb) is
  'Fail-closed normalized description matcher for versioned fiscal rules. R0.17 pins search_path to public.';

commit;
