import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const helperPath='supabase/functions/_shared/marketing-strategy-engine-v1.mjs';
assert.equal(fs.existsSync(helperPath),true,'helper determinístico de estratégia deve existir');
const mod=await import(pathToFileURL(path.resolve(helperPath)).href);
const {DEFAULT_STRATEGY_WEIGHTS_V1,isEligibleOffer,scoreOffer,rankOffers,chooseFormat,canAdvertiseFreeDelivery}=mod;

const baseOffer={
  commercial_id:'11111111-1111-4111-8111-111111111111',
  public_lot_id:'22222222-2222-4222-8222-222222222222',
  model_active:true,category_active:true,public_available:10,availability_reason:'available',sale_price:75,
  public_name:'Cesta Teste',image_url:'https://example.test/cesta.jpg'
};

assert.deepEqual(isEligibleOffer(baseOffer),{eligible:true,reasons:[]});
assert.equal(isEligibleOffer({...baseOffer,public_available:0}).eligible,false);
assert.ok(isEligibleOffer({...baseOffer,public_available:0}).reasons.includes('out_of_stock'));
assert.ok(isEligibleOffer({...baseOffer,availability_reason:'paused'}).reasons.includes('unavailable'));
assert.ok(isEligibleOffer({...baseOffer,model_active:false}).reasons.includes('model_inactive'));
assert.ok(isEligibleOffer({...baseOffer,category_active:false}).reasons.includes('category_inactive'));
assert.ok(isEligibleOffer({...baseOffer,sale_price:74.99}).reasons.includes('below_minimum_order'));
assert.equal(isEligibleOffer({...baseOffer,sale_price:75}).eligible,true);
assert.ok(isEligibleOffer({...baseOffer,public_lot_id:null}).reasons.includes('missing_public_lot'));

assert.deepEqual(DEFAULT_STRATEGY_WEIGHTS_V1,{
  availability_stock:25,seasonality:20,audience_fit:20,historical_performance:20,exploration:10,operational_quality:5
});

const scored=scoreOffer({signals:{availability_stock:1,seasonality:.5,audience_fit:.5,historical_performance:.5,exploration:2,operational_quality:1}},DEFAULT_STRATEGY_WEIGHTS_V1);
assert.equal(scored.total,70,'exploration deve ser limitado a 100% do seu peso');
assert.equal(scored.breakdown.exploration,10);
assert.ok(scored.total>=0&&scored.total<=100);

const noHistory=scoreOffer({signals:{availability_stock:1,seasonality:1,audience_fit:1,operational_quality:1}},DEFAULT_STRATEGY_WEIGHTS_V1);
assert.equal(noHistory.breakdown.historical_performance,0,'ausência de histórico não pode inventar desempenho');
assert.ok(noHistory.reasons.includes('no_historical_evidence'));

const ranked=rankOffers([
  {...baseOffer,commercial_id:'a',signals:{availability_stock:.8,seasonality:.5,audience_fit:.5,historical_performance:.5,exploration:0,operational_quality:1}},
  {...baseOffer,commercial_id:'b',signals:{availability_stock:1,seasonality:1,audience_fit:1,historical_performance:1,exploration:0,operational_quality:1}},
  {...baseOffer,commercial_id:'c',sale_price:74.99,signals:{availability_stock:1,seasonality:1,audience_fit:1,historical_performance:1,exploration:1,operational_quality:1}},
],DEFAULT_STRATEGY_WEIGHTS_V1);
assert.deepEqual(ranked.map(x=>x.commercial_id),['b','a'],'ranking deve remover inelegíveis e ordenar por score');

const tied=rankOffers([
  {...baseOffer,commercial_id:'first',signals:{availability_stock:1}},
  {...baseOffer,commercial_id:'second',signals:{availability_stock:1}},
],DEFAULT_STRATEGY_WEIGHTS_V1);
assert.deepEqual(tied.map(x=>x.commercial_id),['first','second'],'empate deve preservar ordem original');

const carousel=chooseFormat([
  ...ranked,
  {...baseOffer,commercial_id:'bad',eligible:false,total:100},
],{preferCarousel:true,maxCards:4});
assert.equal(carousel.format,'carousel');
assert.deepEqual(carousel.offer_ids,['b','a'],'carrossel não pode incluir card inelegível');
assert.deepEqual(chooseFormat([ranked[0]],{preferCarousel:true}),{format:'single',offer_ids:['b']});

assert.deepEqual(canAdvertiseFreeDelivery({free_delivery_enabled:true,destination_in_service_area:true,offer_delivery_eligible:true}),{ok:true,reason:'eligible'});
assert.equal(canAdvertiseFreeDelivery({free_delivery_enabled:true,destination_in_service_area:false,offer_delivery_eligible:true}).ok,false);
assert.equal(canAdvertiseFreeDelivery({free_delivery_enabled:false,destination_in_service_area:true,offer_delivery_eligible:true}).reason,'free_delivery_disabled');
assert.equal(canAdvertiseFreeDelivery({free_delivery_enabled:true,destination_in_service_area:true,offer_delivery_eligible:false}).reason,'offer_not_delivery_eligible');

console.log('marketing strategy deterministic engine: ok');
