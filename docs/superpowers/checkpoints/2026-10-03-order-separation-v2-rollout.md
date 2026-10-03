# Order Separation V2 · rollout checkpoint · 2026-10-03

## Canonical Supabase

Project: `ssbesxgaijknwsjbsbcz`

Applied migrations:
- `20261003201103_order_separation_v2`
- `20261003201158_order_separation_v2_completion`
- `20261003201432_order_separation_v2_order_item_index`

Post-DDL checks:
- V2 tables have RLS enabled.
- `anon` and `authenticated` have no direct V2 table privileges.
- V2 mutation/read RPCs are restricted to `service_role` and use fixed `search_path`.
- the V2 `order_item_id` foreign key now has a covering index; the specific unindexed-FK advisor finding is cleared.

## Edge Functions

Pinned to verified source commit `cbf195dab7b64d76dde41491aa3e7d09434974e1`:
- `admin-products-live-v1` · version 131 · existing custom Bearer/Admin auth retained.
- `order-public-view-v1` · version 5 · public short-token read-only route retained.

## Controlled homologation

Only orders explicitly marked `source = system_canary` may be used for state-changing smoke tests. Real customer orders must not be mutated for rollout verification.

The full completion/physical-stock path must remain blocked unless the selected canary is deliberately admitted to the existing Bling homologation safeguards and all preflight checks pass.
