import {describe,expect,it} from 'vitest';
import {DEMO_PRODUCTS,DEMO_TYPES,DEMO_TEMPLATES} from '../data/demo';
import {DEMO_EXTRA_PRODUCTS,DEMO_EXTRA_TYPES,DEMO_EXTRA_GROUPS} from '../data/demo-extra';
import {MemoryCatalogStore} from './testing/memory-catalog-store';
import {saveCatalogChange,publicCatalogProjection,CatalogConflict} from './catalog';
import type {AdminCatalogSnapshot} from './catalog';
const snapshot:AdminCatalogSnapshot={
 revision:1,products:[...DEMO_PRODUCTS,...DEMO_EXTRA_PRODUCTS],
 types:[...DEMO_TYPES,...DEMO_EXTRA_TYPES],baskets:DEMO_TEMPLATES,
 extras:DEMO_EXTRA_GROUPS,privateBasketAdjustments:{mini:700}
};
describe('Catálogo administrável por versão',()=>{
 it('altera estoque e ativo e exclui produtos indisponíveis da vitrine',async()=>{
   const store=new MemoryCatalogStore(snapshot);
   const res=await saveCatalogChange(store,1,{type:'UPDATE_PRODUCT',sku:'DA-0028',patch:{stock:0,active:false}});
   expect(res.revision).toBe(2);
   const pub=publicCatalogProjection(res);
   expect(pub.products.some(p=>p.sku==='DA-0028')).toBe(false);
   expect(pub.types.find(t=>t.id==='arroz')?.productSkus).not.toContain('DA-0028');
 });
 it('não publica valor privado no payload da loja',()=>{
   const pub=publicCatalogProjection(snapshot);
   expect(JSON.stringify(pub)).not.toMatch(/privateBasketAdjustments|costCents|originalImportFields/);
   expect(JSON.stringify(snapshot)).toContain('700');
 });
 it('rejeita update obsoleto e conserva dados consistentes',async()=>{
   const store=new MemoryCatalogStore(snapshot);
   await saveCatalogChange(store,1,{type:'UPDATE_PRODUCT',sku:'DA-0028',patch:{stock:7}});
   await expect(saveCatalogChange(store,1,{type:'UPDATE_PRODUCT',sku:'DA-0028',patch:{stock:9}}))
     .rejects.toBeInstanceOf(CatalogConflict);
   expect((await store.loadAdmin()).products.find(p=>p.sku==='DA-0028')?.stock).toBe(7);
 });
 it('valida vínculo entre tipo e SKU em vez de gravar item inexistente',async()=>{
   const store=new MemoryCatalogStore(snapshot);
   await expect(saveCatalogChange(store,1,{type:'SET_TYPE_SKUS',typeId:'arroz',skus:['sem-sku']}))
     .rejects.toThrow(/SKUs/);
   expect((await store.loadAdmin()).revision).toBe(1);
 });
 it('valor da cesta é editável só no snapshot privado e não pode ser negativo',async()=>{
   const store=new MemoryCatalogStore(snapshot);
   const updated=await saveCatalogChange(store,1,{type:'SET_BASKET_PRIVATE_ADJUSTMENT',basketId:'mini',amountCents:825});
   expect(updated.privateBasketAdjustments.mini).toBe(825);
   expect(JSON.stringify(publicCatalogProjection(updated))).not.toContain('825');
 });
});
