import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {adminDomFixture} from './admin-dom-fixture.mjs';

export function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
export function deliveryFixture(api,tab='expedition'){
  const {nodes,document}=adminDomFixture(),messages=[],writes=[];
  const shared={orders:[],fiscal:{},tab,detail:null};
  const window={};
  const context={window,document,console,URL,URLSearchParams,setTimeout,clearTimeout};
  vm.createContext(context);
  for(const file of ['model.js','controller.js']){
    const path='vitrine/admin/delivery/'+file;
    assert.ok(fs.existsSync(path),'delivery module must exist: '+file);
    vm.runInContext(fs.readFileSync(path,'utf8'),context,{filename:path});
  }
  const ports={
    api,
    orders:{get:()=>shared.orders,set:rows=>{shared.orders=rows;writes.push(rows)},fiscal:()=>shared.fiscal,loadFiscal:async()=>{}},
    detail:{get:()=>shared.detail,set:value=>{shared.detail=value},loadFiscal:async()=>{},paint(){},refreshList:async()=>{},open(){},openDanfe(){}},
    navigation:{currentTab:()=>shared.tab,stockIncident(){},today(){}},
    ui:{query:selector=>nodes.get(selector)||null,document,window,confirm:()=>true,prompt:()=>null,toast:message=>messages.push(message),currentOperator:()=> 'Operação',requireOperator:()=> 'Operação'},
    formatters:{esc:value=>String(value??''),money:value=>String(value),dateTime:String,normalize:value=>String(value).toLowerCase(),formatPhone:String,errorMessage:String},
    orderView:{orderDisplayCode:order=>order.id,relativeAge:()=>'',statusPill:String,whatsappHref:()=>'',mapsHrefFromAddress:()=>'',orderSearchMatch:()=>true,deliveredToday:()=>false}
  };
  const controller=context.window.DonaAntoniaAdminDelivery.create(ports);
  return {controller,shared,nodes,messages,writes,ports,model:context.window.DonaAntoniaAdminDeliveryModel};
}
