import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');

// A ordem local READY não basta: a UI só pode dizer SEPARADO quando a conclusão real existe.
const helperStart=admin.indexOf('function orderSeparationCompletedV4');
const milestoneStart=admin.indexOf('function orderV3Milestones');
assert.ok(helperStart>=0,'Admin precisa de helper canônico para conclusão real da separação');
assert.ok(milestoneStart>=0,'Admin precisa manter orderV3Milestones');
const flowBlock=admin.slice(helperStart,Math.min(admin.length,milestoneStart+900));
assert.match(flowBlock,/summary\?\.completed_at/,'Marco SEPARADO deve usar a conclusão operacional persistida no resumo');
assert.match(flowBlock,/readiness\?\.separation_completed===true/,'Readiness fiscal continua sendo fallback compatível para conclusão da separação');
assert.match(flowBlock,/separated:orderSeparationCompletedV4\(o\)/,'Milestone SEPARADO precisa depender do helper de conclusão real');
assert.doesNotMatch(flowBlock,/separated:\['ready','out_for_delivery','delivered'\]\.includes\(s\)/,'READY sozinho não pode significar separação concluída');

assert.match(admin,/SEPARAÇÃO PENDENTE/i,'Card precisa mostrar quando a separação ainda não terminou de verdade');
assert.match(admin,/SEPARAÇÃO CONCLUÍDA/i,'Card/botão precisa mostrar claramente quando a separação terminou');
assert.match(admin,/CONTINUAR SEPARAÇÃO/i,'Pedido pendente precisa oferecer continuidade, não parecer concluído');
assert.match(admin,/NÃO foi concluída|não foi concluída/i,'Falha ao concluir precisa deixar claro que a separação não terminou');

// Quando FALTOU reduz o total, o PUT no Bling deve manter parcelas coerentes com o novo total.
assert.match(hub,/function blingHubRebalanceInstallmentsForTotal/,'Hub precisa de helper canônico para rebalancear parcelas');
assert.match(hub,/blingHubRebalanceInstallmentsForTotal\(payload\.parcelas,\s*Number\(desired\?\.total/,'Payload PUT precisa rebalancear parcelas pelo total final desejado');
assert.match(hub,/Math\.round\([^\n]*\*100\)\/100/,'Rebalanceamento de parcelas precisa arredondar em centavos');

console.log('order separation completion feedback v4: ok');
