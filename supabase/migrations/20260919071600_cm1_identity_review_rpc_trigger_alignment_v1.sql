create or replace function public.review_identity_conflict_v1(
  p_evaluation_id uuid,
  p_review text,
  p_selected_customer_id uuid,
  p_notes text,
  p_reviewed_by uuid,
  p_actor_role text default null,
  p_actor_display_name text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eval public.customer_identity_resolution_evaluations%rowtype;
  v_candidates jsonb;
  v_result jsonb;
begin
  if p_review not in ('approved','rejected') then raise exception 'invalid_review'; end if;
  if length(trim(coalesce(p_notes,''))) < 5 then raise exception 'identity_review_note_required'; end if;
  select * into v_eval from public.customer_identity_resolution_evaluations where id=p_evaluation_id for update;
  if not found then raise exception 'identity_evaluation_not_found'; end if;
  if v_eval.decision <> 'conflict' then raise exception 'identity_review_requires_conflict'; end if;
  if v_eval.review_status <> 'pending' then raise exception 'identity_review_already_closed'; end if;
  v_candidates := coalesce(v_eval.evidence->'candidate_ids','[]'::jsonb);
  if p_review='approved' then
    if p_selected_customer_id is null then raise exception 'customer_id_required'; end if;
    if not (v_candidates ? p_selected_customer_id::text) then raise exception 'customer_not_in_candidates'; end if;
  else
    p_selected_customer_id := null;
  end if;
  update public.customer_identity_resolution_evaluations
  set review_status=p_review,
      customer_id=case when p_review='approved' then p_selected_customer_id else customer_id end,
      reviewed_at=now(), reviewed_by=p_reviewed_by, review_notes=trim(p_notes)
  where id=p_evaluation_id
  returning jsonb_build_object('id',id,'decision',decision,'customer_id',customer_id,'confidence',confidence,'match_method',match_method,'review_status',review_status,'reviewed_at',reviewed_at,'review_notes',review_notes)
  into v_result;
  return v_result;
end;
$$;