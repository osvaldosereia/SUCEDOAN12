REVOKE EXECUTE
ON FUNCTION public.marketing_has_verified_campaign_consent_v1(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.marketing_has_verified_campaign_consent_v1(uuid)
TO service_role;
