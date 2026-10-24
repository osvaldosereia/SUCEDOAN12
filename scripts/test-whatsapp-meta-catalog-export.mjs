import assert from 'node:assert/strict';
import {SIZE_ORDER,SIZE_LABELS,collectBasketVariants,buildMetaCatalogCsv,buildSizeListMessage,buildCombinationsListMessage,buildMetaProductListPreview,validatePreviewPayload,skuForBasket} from '../vitrine/admin/whatsapp-lab/catalog-tools.mjs';

const mockId=index=>'00000000-0000-4000-8000-'+String(index).padStart(12,'0');
const models=SIZE_ORDER.map((size,i)=>({id:mockId(i+1),size_key:size,name:SIZE_LABELS[size],image_url:'https://example.org/cesta.webp'}));
const variants=new Map();
models.forEach((model,i)=>{for(let n=1;n<=3;n++)variants.set(model.id+'@'+n,{data:{
 basket:{display_price_cents:10000+i*5000+n*750,image_url:model.image_url,stock_quantity:n===2?0:3},
 items:[{product_id:mockId(100+i*3+n),quantity:2,name:'Arroz Marca X 5 kg'},{product_id:mockId(200+i*3+n),quantity:1,name:'Feijão Carioca 1 kg'}]
}})});
const result=collectBasketVariants(models,variants);
assert.equal(result.ready,true,'5x3 data must be exportable');
assert.equal(result.rows.length,15);
assert.equal(result.issues.length,0);
assert.deepEqual(result.rows.slice(0,3).map(r=>r.id),['DA-CESTA-ECONOMICA-01','DA-CESTA-ECONOMICA-02','DA-CESTA-ECONOMICA-03']);
assert.equal(skuForBasket('mini',3),'DA-CESTA-MINI-03');
const csv=buildMetaCatalogCsv(result);
assert.match(csv,/^\uFEFFid,title,description,availability,condition,price,link,image_link,brand,item_group_id\r\n/);
assert.equal(csv.trim().split('\r\n').length,16,'15 catalog items + header');
assert.match(csv,/"out of stock"/,'zero inventory must not be marked in stock');
assert.match(csv,/"DA-CESTA-MEDIA-03"/);
assert.match(csv,/"107.50 BRL"/);
assert.match(csv,/"https:\/\/donaantonia.com.br\/"/,'use explicit provisional home link');
const bySize=buildSizeListMessage(result);
assert.equal(bySize.interactive.type,'list');
assert.equal(bySize.interactive.action.sections[0].rows.length,5);
assert.ok(validatePreviewPayload(bySize));
const byOption=buildCombinationsListMessage(result,'mini');
assert.equal(byOption.interactive.action.sections[0].rows.length,3);
assert.ok(validatePreviewPayload(byOption));
const productList=buildMetaProductListPreview(result);
assert.equal(productList.interactive.type,'product_list');
assert.equal(productList.interactive.action.sections.length,5);
assert.equal(productList.interactive.action.sections.flatMap(x=>x.product_items).length,15);
assert.ok(validatePreviewPayload(productList));
assert.equal(productList.interactive.action.sections[0].product_items[0].product_retailer_id,'DA-CESTA-ECONOMICA-01');
assert.throws(()=>buildCombinationsListMessage(result,'sem_tamanho'),/invalid_size/);
const incomplete=new Map(variants);incomplete.delete(models[0].id+'@3');
const notReady=collectBasketVariants(models,incomplete);
assert.equal(notReady.ready,false);
assert.equal(notReady.rows.length,14);
assert.throws(()=>buildMetaCatalogCsv(notReady),/catalog_feed_incomplete/,'never publish an incomplete batch');
const missingImage=new Map(variants), changed=structuredClone(missingImage.get(models[0].id+'@1'));
changed.data.basket.image_url='';models[0].image_url='';
missingImage.set(models[0].id+'@1',changed);
assert.equal(collectBasketVariants(models,missingImage).ready,false,'Meta feed requires product image');
console.log('PASS 15 versions, stable SKUs, BRL pricing, stock, CSV safety and Meta interactive structures');
