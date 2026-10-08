# Smart Delivery — checkpoint R17 (2026-10-08)

## Baseline audited
- GitHub main at start: bb95fdf766c68f6f553c450b1c04dca6d0480661.
- Supabase canonical: ssbesxgaijknwsjbsbcz, ACTIVE_HEALTHY.
- Runtime at audit: 0 delivery runs, 0 delivery stops.
- Latest Smart Delivery migration in canonical DB: 20261007202921.
- Existing operational PRs: #921, #929, #930; prior contract-only branch agent/smart-delivery-route-opt-r16 remains unmerged.

## Implemented on agent/smart-delivery-route-opt-r17
- Pure guard for delivery stop IDs, count and coordinates.
- Google Route Optimization request builder with only opaque stop IDs and coordinates; no customer names, phones or addresses.
- Fail-closed response parser rejecting skipped, missing, duplicate and foreign shipments.
- Node assertion test script and scoped GitHub Actions workflow.
- V8 functional checks: valid 3-stop route and four rejected malformed scenarios.

## Not implemented or verified
- SQL prepare/apply/fail contract: GitHub SQL writes blocked by connector safety checks; no DB migration applied.
- Google OAuth worker and real API call: not implemented; credentials and API enablement not verified.
- PWA, Admin button, logistics WhatsApp, end-to-end test: pending.
- Node CI: no workflow run was confirmed. PR creation was blocked. Do not merge this isolated adapter until the integration is complete.

## Next steps
1. Resolve safe SQL migration authoring, with immutable token and snapshot checks, without bypassing repository safety.
2. Keep legacy stop sequence intact; use nullable optimized_sequence for optional route ordering and update readers accordingly.
3. Implement authenticated Edge worker, Google OAuth and fail-closed apply with a default-off feature flag.
4. Wire Admin and driver PWA, test offline and order/stock/WhatsApp regression, then open PR and run CI.
5. Only apply migrations after review and verify production deployment separately.
