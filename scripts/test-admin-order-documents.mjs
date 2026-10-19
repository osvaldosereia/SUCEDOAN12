import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={window:{},Blob,Uint8Array,atob,URL,setTimeout:()=>1};vm.createContext(context);
vm.runInContext(fs.readFileSync('vitrine/admin/orders/documents.js','utf8'),context);
const calls=[],messages=[],urls=[];let popup=null;
const documents=context.window.DonaAntoniaAdminOrderDocuments.create({api:async(action,params,options)=>{calls.push([action,JSON.parse(options.body)]);return {base64:btoa('%PDF-1.7'),invoice_number:'123'}},
 ui:{window:{open:()=>popup},toast:m=>messages.push(m)},formatters:{esc:String,fmtQty:String,dateTime:String,orderDisplayCode:o=>o.id,formatPhone:String,formatCpf:String,money:String},separationModel:{separationItems:()=>[],separationKitRefs:()=>[]},openPrint:()=>{}});
await documents.openDanfeForOrder('a');assert.equal(calls.length,0);assert.match(messages[0],/pop-ups/);
popup={document:{open(){},write(){},close(){}},location:{replace:url=>urls.push(url)},close(){}};
await documents.openDanfeForOrder('a');assert.equal(calls[0][0],'order_fiscal_document_pdf');assert.equal(calls[0][1].id,'a');assert.ok(urls[0].startsWith('blob:'));
URL.revokeObjectURL(urls[0]);
console.log('Admin order documents and popup guard: PASS');
