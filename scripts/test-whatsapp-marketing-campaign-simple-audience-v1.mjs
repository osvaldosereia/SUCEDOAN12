import assert from 'node:assert/strict';
import fs from 'node:fs';

const modulePath='vitrine/admin/marketing/campaign-simple-ui.js';
assert.equal(fs.existsSync(modulePath),true,'campaign-simple-ui.js deve existir');
const source=fs.readFileSync(modulePath,'utf8');
const entry=fs.readFileSync('vitrine/admin/marketing/campaign-entry.js','utf8');

for(const fn of ['filtersForAudienceMode','openSimpleCampaign','previewSimpleAudience','submitSimpleCampaign','enhanceCampaignCenter']){
  assert.match(source,new RegExp(`function ${fn}\\(`),`${fn} deve existir`);
}
for(const text of ['Nova campanha','Nome da campanha','Descrição','Canal','Template','Iniciar agora','Agendar para','Todos os clientes','Por etiquetas','clientes selecionados','Salvar rascunho','Criar campanha'])assert.ok(source.includes(text),`modal simples deve conter ${text}`);
assert.match(source,/mode\s*===\s*['"]all['"]\s*\?\s*\{\}/,'Todos os clientes deve mapear para filters vazio');
assert.match(source,/label_ids\s*:\s*labelIds/,'Por etiquetas deve mapear para label_ids');
assert.match(source,/attendanceJsonApi\(['"]labels['"]/,'etiquetas devem vir da API autenticada existente');
assert.match(source,/audiencePost\(['"]preview['"]/,'contador deve usar preview server-side');
assert.match(source,/admin-marketing-campaigns-v1/,'criação deve usar API Admin de campanhas');
for(const action of ['create','update_draft','create_snapshot','transition','start_now','schedule'])assert.ok(source.includes(`'${action}'`)||source.includes(`"${action}"`),`fluxo simples deve conhecer ação ${action}`);
assert.match(source,/Nenhum template de campanha aprovado neste canal/,'canal sem template deve ter estado vazio claro');
assert.match(source,/data-simple-label-search/,'Por etiquetas deve permitir buscar etiqueta');
assert.match(source,/data-simple-label-id/,'Por etiquetas deve usar seleção múltipla');
assert.match(source,/data-simple-schedule-at/,'Agendar deve mostrar data e hora');
assert.doesNotMatch(source,/graph\.facebook\.com/,'browser não deve chamar Meta Graph');
assert.doesNotMatch(source,/META_WHATSAPP_ACCESS_TOKEN|SERVICE_ROLE_KEY/,'browser não deve conter segredos');
assert.match(entry,/campaign-simple-ui\.js/,'bootstrap deve carregar a campanha simples');

console.log('marketing campaign simple audience contract: ok');
