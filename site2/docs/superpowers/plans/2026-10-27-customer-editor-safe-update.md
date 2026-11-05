# Safe customer profile and address editing

## Goal

Enable an authorized operator to edit the name and one explicitly selected active delivery address on a customer linked to the current WhatsApp conversation.

## Fixed decisions

- Keep phone, CPF/CNPJ, email, marketing consent, and activity status read-only in this slice. The customer-save writer treats a missing document as `NULL` and can replace the default address, so do not call it from this form.
- Do not return full CPF/CNPJ to application code or HTML. The read projection computes a masked value in SQL.
- Anchor every read/write to the conversation. Re-resolve the linked customer inside the write transaction; never trust a browser-supplied customer ID.
- Return active address options from a bounded server-side projection. Automatically preselect only one default address, or the sole active address when there is no default. When the data is ambiguous, require an explicit address choice.
- Save an address by exact `customer_addresses.id`, confirm ownership and active state under lock, and compare the expected `updated_at`. Never edit an address just because it is default or displayed first.
- Compare the expected customer `updated_at` as well. A stale form returns a safe conflict and reloads current data.
- Use the existing active-staff write guard and a fixed `search_path`. Update only `customers.name` and explicitly editable address columns. Preserve CPF, phone, email, default/active flags, marketing fields, and other operational counters.
- Insert an `admin_audit_logs` row in the same transaction with IDs and changed-column names only; do not copy names, addresses, phone, or document into audit details.
- Keep the candidate migration local. Do not apply DDL to production or the legacy local database until the isolated canonical baseline and business-path checks are available.
- No automated tests in this slice. Use targeted TypeScript/Deno checks, PostgreSQL top-level parsing, and diff checks.

## Implementation tasks

1. [x] Add a safe, bounded customer editor projection returning masked document, primary contact display, customer revision, and active address choices with their revisions.
2. [x] Add a service-only-in-practice authenticated RPC pair for editor read/update. The update RPC locks the conversation, customer, and selected address, checks revisions, validates an allowlisted payload, updates atomically, and writes a PII-minimal audit row.
3. [x] Add a server-only repository call and Server Action. Validate UUIDs, timestamps, name, address field lengths, state, and CEP before calling the RPC; map conflicts and authorization failures to safe notices.
4. [x] Replace the read-only warning with a simple edit form. Require explicit address selection when the active/default data is ambiguous. Do not render a CPF value or include it in a form.
5. [x] Record the remote contract evidence, known triggers, local-only migration status, and exact isolated-baseline blocker in the technical notebook and implementation ledger.
6. [x] Run only the focused static checks listed above; no DB migration, deployment, external send, or automated tests.

## Estado e gate restante

O código, UI, Server Action e migration estão somente no worktree local. A migration passou pelo parser PostgreSQL de topo, mas isso não compila PL/pgSQL nem resolve dependências do schema. Não aplicar até validar em uma cópia isolada do schema canônico; o stack Supabase local existente é experimental e foi preservado. A checagem estática confirma TypeScript/estilo e formato SQL, não funcionamento transacional no banco.
