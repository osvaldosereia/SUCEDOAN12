import fs from 'node:fs';

const editor=fs.readFileSync('admin-v3/marketing-editor-v1.js','utf8');
const workflow=fs.readFileSync('supabase/functions/admin-marketing-workflow-v1/index.ts','utf8');
const editorMigration=fs.readFileSync('supabase/migrations/20260910093500_marketing_asset_editor_v5.sql','utf8');
const registryMigration=fs.readFileSync('supabase/migrations/20260910104500_marketing_render_media_registry_v6.sql','utf8');

const must=(ok,msg)=>{if(!ok)throw new Error(msg)};

must(editor.includes("api('editor_save'"),'editor must save through editor_save');
must(editor.includes("api('editor_fork'"),'approved content must support version fork');
must(editor.includes("api('editor_save_and_render'"),'editor must connect save-and-render to guarded backend');
must(editor.includes("api('editor_render'"),'editor must expose guarded render request');
must(editor.includes('Preview local'),'editor must expose local preview');
must(editor.includes('BLOQUEADO PELOS GATES'),'editor must make render gate state explicit');
must(editor.includes('Saídas e arquivos'),'editor must expose media/render read model');
must(!/fetch\([^\n]+graph\.facebook|fetch\([^\n]+pinterest|fetch\([^\n]+googleapis/i.test(editor),'editor must not call external channel APIs');

must(workflow.includes('action==="editor_overview"'),'workflow must expose editor_overview');
must(workflow.includes('action==="editor_save"'),'workflow must expose editor_save');
must(workflow.includes('action==="editor_save_and_render"'),'workflow must expose guarded save-and-render');
must(workflow.includes('action==="editor_render"'),'workflow must expose guarded render');
must(workflow.includes('request_marketing_asset_render_v1'),'workflow render must delegate to database gate');
must(workflow.includes('marketing_media_objects'),'workflow overview must include registered media');
must(workflow.includes('marketing_render_jobs'),'workflow overview must include render jobs');
must(!workflow.includes('publish_marketing'), 'editor workflow must not expose publisher');
must(!/graph\.facebook|api\.pinterest|googleapis\.com/i.test(workflow),'workflow must not call external channel APIs');

must(editorMigration.includes('marketing_asset_revisions'),'migration must keep immutable revisions');
must(editorMigration.includes('marketing_asset_revisions_append_only_v1'),'revisions must be append-only');
must(editorMigration.includes('approved_asset_immutable_use_fork'),'approved asset edits must fail closed');
must(editorMigration.includes("external_side_effect',false"),'editor audit events must be non-external');
must(editorMigration.includes('revoke all on function public.marketing_save_asset_edit_v1'),'editor RPC must revoke public execution');
must(editorMigration.includes('grant execute on function public.marketing_save_asset_edit_v1'),'editor RPC must explicitly grant service role');

must(registryMigration.includes('request_marketing_asset_render_v1'),'v6 must add asset render request');
must(registryMigration.includes('queue_marketing_render_v2'),'render request must reuse gated queue');
must(registryMigration.includes('register_marketing_media_object_v1'),'v6 must add media registry RPC');
must(registryMigration.includes('marketing_asset_media_read_v1'),'v6 must add media read model');
must(registryMigration.includes("carousel_requires_slide_rendering"),'carousel must fail closed until slide renderer exists');
must(registryMigration.includes('revoke all on function public.request_marketing_asset_render_v1'),'render request RPC must revoke public execution');
must(registryMigration.includes('grant execute on function public.request_marketing_asset_render_v1'),'render request RPC must explicitly grant service role');

console.log('marketing-editor-v1 contract: ok');
