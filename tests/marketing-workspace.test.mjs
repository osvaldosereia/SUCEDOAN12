import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const polish=readFileSync(new URL('../vitrine/admin/marketing/marketing-polish.js',import.meta.url),'utf8');
const template=readFileSync(new URL('../vitrine/admin/marketing/template-center.js',import.meta.url),'utf8');
const campaign=readFileSync(new URL('../vitrine/admin/marketing/campaign-center.js',import.meta.url),'utf8');
const postSale=readFileSync(new URL('../vitrine/admin/marketing/post-sale-center.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../supabase/functions/whatsapp-marketing-worker-v1/index.ts',import.meta.url),'utf8');
const orders=readFileSync(new URL('../vitrine/admin/runtime-src/08-orders-detail.part.js.txt',import.meta.url),'utf8');
const audienceApi=readFileSync(new URL('../supabase/functions/admin-marketing-audiences-v1/index.ts',import.meta.url),'utf8');
const overviewPath=new URL('../vitrine/admin/marketing/marketing-overview-data.js',import.meta.url);
const overview=existsSync(overviewPath)?readFileSync(overviewPath,'utf8'):'';

test('Pós-venda opens its own view instead of redirecting to Orders',()=>{
  assert.match(polish,/function loadPostSaleModule\(\)[\s\S]*?post-sale-center\.js/);
  assert.match(polish,/if\(view==='post_sale'\)\{[\s\S]{0,180}loadPostSaleModule\(\)[\s\S]{0,120}mountPostSaleView/);
  assert.doesNotMatch(polish,/if\(view==='post_sale'\)return document\.querySelector\('\[data-tab="orders"\]'\)/);
  assert.match(polish,/data-marketing-overview-card="post_sale"[^\n]*open\('post_sale'\)/);
});

test('overview New template action opens the Meta template creator',()=>{
  assert.match(polish,/data-overview-new-template[\s\S]{0,160}openOverviewView\([^)]*'templates'[^)]*\)/);
  assert.match(template,/data-template-create[\s\S]{0,160}openBuilder\('create'\)/);
});

test('overview shows real campaign, Meta template, cadence, and runtime counts',()=>{
  assert.match(polish,/data-marketing-overview-stats/);
  assert.match(overview,/admin-marketing-campaigns-v1/);
  assert.match(overview,/admin-whatsapp-templates-v1/);
  assert.match(overview,/repurchase_state/);
  assert.match(overview,/runtime_status/);
  assert.match(overview,/APPROVED|PENDING|REJECTED/);
});

test('campaign composer does not expose scheduled sends',()=>{
  assert.doesNotMatch(campaign,/data-campaign-schedule-at/);
  assert.doesNotMatch(campaign,/apiPost\('schedule'/);
  assert.doesNotMatch(campaign,/data-campaign-start-now/);
  assert.match(campaign,/controle de disparo único/);
  assert.match(worker,/const DEFAULT_BATCH=10;\s*const MAX_BATCH=10;/);
});

test('post-sale follow-up requires manual confirmation and never invents contact history',()=>{
  assert.match(postSale,/attendanceAuthorizedFetch\(url,\{method:'GET'/);
  assert.match(postSale,/tab:'delivered'/);
  assert.match(postSale,/confirm\(`Enviar manualmente o pós-venda/);
  assert.match(postSale,/consentimento para ofertas semanais/);
  assert.match(postSale,/delivery\.sent===true/);
  assert.match(postSale,/Histórico de contato: indisponível nesta consulta/);
});

test('post-sale order and conversation links open the selected order workflow',()=>{
  assert.match(postSale,/marketing:open-order/);
  assert.match(postSale,/marketing:open-conversation/);
  assert.match(orders,/marketing:open-order/);
  assert.match(orders,/marketing:open-conversation/);
});

test('monthly replenishment uses cadence states, offers recalculation, and never enables automation',()=>{
  assert.match(polish,/view==='repurchase'[\s\S]{0,180}mountRepurchaseView/);
  assert.match(audienceApi,/action==="repurchase_state"/);
  assert.match(audienceApi,/action==="repurchase_recalc"/);
  assert.match(audienceApi,/marketing_repurchase_recalc_v1/);
  assert.match(audienceApi,/marketing_repurchase_state_v1/);
  assert.doesNotMatch(audienceApi,/marketing_repurchase_runtime_v1[\s\S]{0,80}update\(/);
});
