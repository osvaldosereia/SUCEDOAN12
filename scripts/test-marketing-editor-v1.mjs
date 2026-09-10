import fs from 'node:fs';

const editor=fs.readFileSync('admin-v3/marketing-editor-v1.js','utf8');
const workflow=fs.readFileSync('supabase/functions/admin-marketing-workflow-v1/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20260910093500_marketing_asset_editor_v5.sql','utf8');

const must=(ok,msg)=>{if(!ok)throw new Error(msg)};

must(editor.includes("api('editor_save'"),'editor must save through editor_save');
must(editor.includes("api('editor_fork'"),'approved content must support version fork');
must(editor.includes('Preview local'),'editor must expose local preview');
must(editor.includes('não renderiza / não publica'),'preview must state it does not render or publish');
must(!/fetch\([^\n]+graph\.facebook|fetch\([^\n]+pinterest|fetch\([^\n]+googleapis/i.test(editor),'editor must not call external channel APIs');

must(workflow.includes('action==="editor_overview"'),'workflow must expose editor_overview');
must(workflow.includes('action==="editor_save"'),'workflow must expose editor_save');
must(workflow.includes('action==="editor_fork"'),'workflow must expose editor_fork');
must(!workflow.includes('publish_marketing'), 'editor workflow must not expose publisher');

must(migration.includes('marketing_asset_revisions'),'migration must keep immutable revisions');
must(migration.includes('marketing_asset_revisions_append_only_v1'),'revisions must be append-only');
must(migration.includes('approved_asset_immutable_use_fork'),'approved asset edits must fail closed');
must(migration.includes("external_side_effect',false"),'editor audit events must be non-external');
must(migration.includes('revoke all on function public.marketing_save_asset_edit_v1'),'editor RPC must revoke public execution');
must(migration.includes('grant execute on function public.marketing_save_asset_edit_v1'),'editor RPC must explicitly grant service role');

console.log('marketing-editor-v1 contract: ok');
