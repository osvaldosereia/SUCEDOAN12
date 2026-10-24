# Vitrine Admin WhatsApp Flow Center

## Intent

Manage WhatsApp Flows for Dona Antônia inside the existing Vitrine Admin Marketing tools, using the current Meta Cloud API connection and its server-side credentials. Normal Flow creation, JSON upload, validation, endpoint configuration, key registration, status review, and publication should be available in Admin.

## Current integration

- The existing Meta template center calls the authenticated admin-whatsapp-templates-v1 Edge Function through the Admin session.
- The Meta access token and Graph API version remain server-side; browser code never receives either.
- The dynamic basket Flow JSON and encrypted exchange endpoint already exist in the repository.
- The Flow endpoint is not currently deployed. Its runtime requires DA_FLOW_1018_RSA_PKCS8, DA_FLOW_1018_META_APP_SECRET, and DA_FLOW_1018_SESSION_SECRET.

## Scope

- Add a Flows view next to Templates in the existing Marketing Meta tools.
- Restrict every Flow operation on the server to the active account dona-antonia-1018.
- Reuse the current Admin authorization, Meta access token, Graph API version, Supabase project, and Edge Function.
- Support remote Flow listing/details, draft creation, JSON upload/update, official validation report, fixed endpoint registration, public-key registration, publish after clean validation, and delete with confirmation.
- Use the existing Lab for canary messaging, with sender 1018 and recipient 8360 only.

## Security and operational constraints

- Never accept WABA IDs or phone-number IDs from the browser.
- Never expose Meta tokens, private keys, session secrets, or decrypted Flow state.
- Never select, mutate, test, or send through the channel ending 0975.
- Never publish unless the Meta validation response is clean and endpoint requirements for that JSON are satisfied.
- No customer messaging, order creation, or edits to the commercial Attendance UI.
- If the existing token lacks the required Meta permission, show a sanitized Meta error; do not create another Meta connection or use an alternate credential path.
- Keep deploy and live Meta operations subject to the already established security controls.

## Acceptance

1. Marketing exposes a Flows view using the same authenticated Admin session as Templates.
2. Backend Flow calls use the current META_WHATSAPP_ACCESS_TOKEN and META_WHATSAPP_GRAPH_VERSION.
3. Backend code pins the WABA to channel 1018.
4. Tests cover authorization boundaries, channel pinning, JSON validation, Flow API payloads, and publish gating.
5. CI passes for the Flow manager and existing WhatsApp Meta tools.
6. No live Flow is claimed created, validated, or published until a Meta API response proves it.
