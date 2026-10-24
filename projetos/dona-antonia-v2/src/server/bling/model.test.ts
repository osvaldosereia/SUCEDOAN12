import {describe,it,expect} from 'vitest';
import type {BlingProductProfile} from './model';
import {validateBlingProfile} from './model';
const p:BlingProductProfile={
 sku:'DA-1',blingProductId:null,unit:'UN',originCode:'0',ncm:'10063021',cest:null,
 gtin:'7898220470092',packagingGtin:null,unitsPerCase:null,supplierName:'Fornecedor',
 supplierCode:'123',purchaseCostCents:900,originalImportFields:{'Código':'DA-1','NCM':'10063021'}
};
describe('Bling product fiscal profile',()=>{
 it('mantém perfil fiscal separado do produto público',()=>{
  expect(validateBlingProfile(p)).toEqual([]);
  expect(p.originalImportFields['Código']).toBe('DA-1');
 });
 it('detecta NCM/CEST e caixa inválidos antes de sincronizar',()=>{
  expect(validateBlingProfile({...p,ncm:'123',cest:'0',unitsPerCase:0})).toEqual(
   expect.arrayContaining(['NCM deve ter oito dígitos','CEST deve ter sete dígitos','Conversão de caixa inválida'])
  );
 });
});
