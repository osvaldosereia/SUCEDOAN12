import assert from 'node:assert/strict';
import {inspectBlingNfeR2,inspectBlingNfeProviderErrorsR2} from '../supabase/functions/admin-service-intelligence-v1/_shared/fiscal-r2-nfe-inspector.mjs';
const failures=[
 'O NCM 0904.20.00 para o item PÁPRICA DOCE 30g não está contido no conjunto de valores permitidos.',
 'O NCM 2103.90.90 para o item Tempero do Edu 30g não está contido no conjunto de valores permitidos.',
 'O NCM 0901.11.00 para o item Café Brasileiro Extraforte 500g não está contido no conjunto de valores permitidos.',
 'O NCM 2103.90.90 para o item Chimichurri Sem Pimenta Ltt Real Sabor 40g Pacote não está contido no conjunto de valores permitidos.',
 'O NCM 2103.90.90 para o item Chimichurri 20g não está contido no conjunto de valores permitidos.'
];
const itemNames=['PÁPRICA DOCE 30g','Tempero do Edu 30g','Café Brasileiro Extraforte 500g','Chimichurri Sem Pimenta Ltt Real Sabor 40g Pacote','Chimichurri 20g'];
const source={
 data:{id:27090735788,situacao:{id:4},alertas:failures.map(m=>({mensagem:m})),
 itens:itemNames.map((nome,i)=>({codigo:'SKU'+i,descricao:nome,quantidade:1,valor:2.5,total:2.5}))}
};
const inspected=inspectBlingNfeR2(source,{});
assert.equal(inspected.validation_message_count,5);
assert.equal(inspected.validation_source,'provider_response');
assert.deepEqual(inspected.validation_errors.map(v=>v.item_index),[1,2,3,4,5]);
assert.deepEqual(inspected.validation_errors.map(v=>v.reported_code),['09042000','21039090','09011100','21039090','21039090']);
assert.ok(inspected.validation_errors.every(v=>v.requires_validation===true));
assert.ok(inspected.validation_errors.every(v=>v.matched_by==='exact_normalized_name'));
assert.equal(inspected.editing.eligible,false,'Rejected NF-e must not be auto-updated by the API');
assert.equal(inspected.editing.manual_correction_possible,false,'No trusted sale identity in fixture');
assert.equal(inspected.editing.auto_tax_put_approved,false,'API fiscal rewriting is not homologated');
const linked=inspectBlingNfeR2(source,{
  bling_order_id:123,sale_invoice_id:27090735788,
  contact_id:456,fiscal_subtotal:99
});
assert.equal(linked.editing.manual_correction_possible,false,'Conflicting subtotal must block identity verification');
const trustedSource={data:{...source.data,contato:{id:456}}};
const trusted=inspectBlingNfeR2(trustedSource,{
  bling_order_id:123,sale_invoice_id:27090735788,
  contact_id:456,fiscal_subtotal:12.50
});
assert.equal(trusted.editing.manual_correction_possible,true,'Bling UI can correct rejected, unposted notes with strong identity');
assert.equal(trusted.editing.eligible,false,'Rejected tax PUT remains unapproved');
assert.equal(trusted.editing.auto_tax_put_approved,false);
const posted=inspectBlingNfeR2({data:{...trustedSource.data,lancamentosEstoque:[{id:9}]}},{
  bling_order_id:123,sale_invoice_id:27090735788,
  contact_id:456,fiscal_subtotal:12.50
});
assert.equal(posted.editing.manual_correction_possible,false,'Stock postings block edits');
const unknown=inspectBlingNfeR2({data:{id:5,situacao:4,itens:source.data.itens}});
assert.equal(unknown.validation_message_count,0);
assert.equal(unknown.validation_source,'not_returned_by_provider_get');
assert.equal(unknown.ncm_not_exposed_count,5);
assert.equal(unknown.invalid_ncm_format_count,0);
const noisy=inspectBlingNfeProviderErrorsR2({data:{avisos:[{message:'Recipient document 11122233344'}, {message:failures[0]}]}},
 inspected.items);
assert.equal(noisy.length,1,'Nonfiscal personal details must not be surfaced');
console.log('PASS: extract five validation errors, match exact items, ignore unrelated messages and protect rejected NF-e.');
