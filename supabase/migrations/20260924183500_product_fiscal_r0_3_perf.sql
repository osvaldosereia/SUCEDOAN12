begin;
create index if not exists product_fiscal_profiles_matched_rule_idx
  on public.product_fiscal_profiles (matched_st_rule_id)
  where matched_st_rule_id is not null;
commit;
