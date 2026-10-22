import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflow = await readFile(
  resolve(root, ".github/workflows/xml-r31-supabase-deploy-once.yml"),
  "utf8",
);
const triggers = workflow.match(/^on:\n([\s\S]*?)^permissions:/m)?.[1] ?? "";

assert.match(triggers, /^  workflow_dispatch:\s*$/m);
assert.doesNotMatch(triggers, /^  (?:pull_request|push):/m);
assert.match(
  workflow,
  /^  deploy-xml:\n    if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'$/m,
);
assert.match(workflow, /supabase functions deploy admin-service-intelligence-v1 --project-ref ssbesxgaijknwsjbsbcz --use-api/m);
assert.doesNotMatch(workflow, /--debug\b/);

console.log("XML R31 production deploy is manual-only and pinned to main.");
