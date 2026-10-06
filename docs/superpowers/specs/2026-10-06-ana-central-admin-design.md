# Central ANA Management Area — Design

## Goal

Give the Dona Antônia team one simple Admin area to manage ANA’s operating status, approved knowledge, deterministic triggers, safe testing, and review history, without requiring staff to edit code or learn AI terminology.

## Current State and Evidence

- The Atendimento screen already supports human takeover and releasing an individual conversation to ANA.
- Its ANA panel is a manual, non-sending preview with review buttons and preview metrics.
- Live behavior is currently defined in version-controlled worker instructions and deterministic greeting logic. There is no operator-facing way to change those instructions.
- The old service-intelligence endpoint references knowledge/config tables that are absent from the live public schema, so it is not a usable management surface for ANA.
- The live channel runtime has independent Meta capture/send/ANA switches and a separate marketing switch. The new area must preserve their independent meanings.

## Design Choice

Add a top-level **ANA** section to the existing Admin navigation, implemented as a focused page with five tabs:

1. **Visão geral** — channel status for 0975 and 1018, a clear ANA on/off control per channel, health and handoff indicators, and a short explanation of the safety rules. Marketing campaign controls remain separate.
2. **Comportamento** — a few safe, structured controls for tone and response style (for example: concise/courteous, use a known first name only in the first greeting, emoji sparingly), plus a readable summary of fixed safety rules and handoff conditions. Do not expose a free-form system-prompt editor in v1; hard safety constraints remain protected.
3. **Conhecimento** — a searchable list of short, human-editable answers and policies, grouped by category. Each entry has a title, content, optional keywords, draft/published/archived state, and last editor/update. Published content is eligible for ANA; drafts are not.
4. **Gatilhos** — a compact list of deterministic rules. Each rule has a name, activation condition/phrases, action (approved fixed reply, safe label, or handoff), channel scope, enabled state, and priority. The interface must distinguish conversation-response triggers from existing order-derived labels. No visual workflow builder in v1.
5. **Testes e histórico** — a no-send simulator using synthetic inputs, a small regression suite with expected outcomes, and recent ANA decisions showing channel, outcome (replied, handed off, skipped), safe reason, and staff feedback. It must not expose full phone numbers or unnecessarily reproduce message history.

The page uses plain operational labels and progressive disclosure. The default view surfaces current channel state and anything needing attention; detailed rules remain in their respective tabs.

## Operating and Safety Model

- Apply exact deterministic triggers first. Use the language model only when no deterministic rule handles the message and there is relevant published knowledge/context.
- Ground AI answers in published policies and known operational facts. Keep the existing no-invention boundaries for dynamic price, stock, order, delivery, payment, and customer data. The editable style settings may not weaken these safety constraints.
- Keep low-confidence, ambiguous, sensitive, or unsupported cases on human handoff. Human takeover always overrides ANA.
- Changes are saved as drafts. Publishing runs required validation and the configured regression cases; an unsuccessful validation blocks publication. Keep the last published version available for rollback.
- Log each change with actor, timestamp, action, version, and an optional note. Runtime toggles and content publication require the existing Admin authentication and role model; use a stricter permission for channel activation and rollback than for drafting.
- The simulator must never call Meta send functions, create customer-visible messages, modify an order, or change marketing consent.
- Transactional order/preparation/delivery messages remain independent of marketing consent. Marketing campaigns and opt-in/out stay in their existing separate controls.
- The ANA page does not train or alter the model automatically from staff ratings. Ratings become review data for a human to use when editing rules or knowledge.

## Data and Runtime Integration

Persist ANA settings, knowledge, triggers, test cases, published-version snapshots, and audit events in dedicated ANA-owned database structures rather than reusing legacy PapoAI configuration tables. Add an authenticated Admin management API that checks `admin_users` roles on every read/write. The live worker reads only the active published configuration and must fail closed to the existing safe behavior if configuration is unavailable or invalid. The current per-conversation human/AI gate remains the final send gate.

Publishing must be atomic: validate draft content and test cases, create an immutable version/audit event, then switch the active version. Rollback selects a prior version without deleting audit history. Channel-level ANA switches remain separate from campaign switches and Meta capture/send permissions.

## Rollout

- Do not change current production switches or campaigns while introducing management data structures.
- Seed the new published configuration from the current hard-coded ANA behavior before enabling worker reads from the database, so behavior does not silently change during migration.
- Test with synthetic cases and the isolated company number only. Do not send test messages to customers.
- Keep current live settings unchanged unless a separately verified operational failure requires intervention.

## Out of Scope for v1

- Marketing audience/campaign authoring or consent mutation.
- Meta template submission or management.
- Arbitrary model/prompt tuning, model selection, or automatic learning from reviews.
- Free-form workflow builder, customer-data writes, order creation/edits, or autonomous business actions.
- External knowledge-source synchronization, file uploads, or retrieval infrastructure.

## Why This Structure

Official product documentation supports separating knowledge and behavioral guidance, providing a dedicated test/preview experience before publication, and collecting explicit feedback instead of treating production use as training. Relevant references: [Intercom guidance and pre-live testing](https://www.intercom.com/help/en/articles/10210126-provide-fin-ai-agent-with-specific-guidance), [Zendesk knowledge-source search rules](https://support.zendesk.com/hc/en-us/articles/9185497386394-Configuring-search-rules-for-knowledge-sources-for-AI-agents), and [Microsoft Copilot Studio knowledge testing and feedback](https://learn.microsoft.com/en-us/microsoft-copilot-studio/knowledge-test).

## Acceptance Criteria

- Staff can reach **ANA** from the existing Admin navigation and understand channel status without inspecting Supabase.
- Authorized staff can adjust ANA's supported response style without editing prompts or weakening protected safety rules.
- Authorized staff can draft, edit, publish, archive, and restore approved knowledge and deterministic triggers with actor/version history.
- The worker uses the active published configuration; draft changes never affect live replies.
- Publishing is blocked when required regression cases fail; testing never sends to Meta.
- Human takeover and all current live safety gates remain authoritative.
- The marketing consent ledger and transactional notification flow remain unchanged by ANA configuration.
- There is no automatic learning or customer-data mutation from the management screen.
