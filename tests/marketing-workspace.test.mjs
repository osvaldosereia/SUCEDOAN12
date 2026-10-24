import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const polish=readFileSync(new URL('../vitrine/admin/marketing/marketing-polish.js',import.meta.url),'utf8');
const template=readFileSync(new URL('../vitrine/admin/marketing/template-center.js',import.meta.url),'utf8');
const campaign=readFileSync(new URL('../vitrine/admin/marketing/campaign-center.js',import.meta.url),'utf8');
const repurchase=readFileSync(new URL('../vitrine/admin/marketing/repurchase-center.js',import.meta.url),'utf8');
const strategy=readFileSync(new URL('../vitrine/admin/marketing/strategy-center.js',import.meta.url),'utf8');
const postSale=readFileSync(new URL('../vitrine/admin/marketing/post-sale-center.js',import.meta.url),'utf8');
const campaignEntry=readFileSync(new URL('../vitrine/admin/marketing/campaign-entry.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../supabase/functions/whatsapp-marketing-worker-v1/index.ts',import.meta.url),'utf8');
const orders=readFileSync(new URL('../vitrine/admin/runtime-src/08-orders-detail.part.js.txt',import.meta.url),'utf8');
const adminIndex=readFileSync(new URL('../vitrine/admin/index.html',import.meta.url),'utf8');
const basketLotImage=readFileSync(new URL('../vitrine/admin/basket-lot-image.js',import.meta.url),'utf8');
const audienceApi=readFileSync(new URL('../supabase/functions/admin-marketing-audiences-v1/index.ts',import.meta.url),'utf8');
const adminProducts=readFileSync(new URL('../supabase/functions/admin-products-live-v1/index.ts',import.meta.url),'utf8');
const overviewPath=new URL('../vitrine/admin/marketing/marketing-overview-data.js',import.meta.url);
const overview=existsSync(overviewPath)?readFileSync(overviewPath,'utf8'):'';

test('Marketing keeps advanced subviews active after normalizing the subnavigation',()=>{
  assert.match(polish,/function activeView\\(root\\)\\{\\s*return root\.querySelector\\('\\[data-marketing-subnav\\] \\[data-marketing-view\\]\.active'\\)/);
  assert.match(polish,/const currentView=activeView\\(root\\)[\\s\\S]{0,700}const active=button\.dataset\.marketingView===currentView;[\\s\\S]{0,120}classList\.toggle\\('active',active\\)/);
});

test('Marketing reuses an existing Mais menu instead of rendering a duplicate',()=>{
  assert.match(polish,/let more=nav\.querySelector\\('\\[data-marketing-more-menu\\],\.marketing-admin-more'\\)/);
});

test('Marketing routes reused Mais menus with one delegated handler',()=>{
  assert.match(polish,/function bindMarketingMoreMenu/);
  assert.ok(polish.includes("nav.addEventListener('click'"),'menu navigation must be delegated from the nav');
  assert.ok(polish.includes('event.stopImmediatePropagation()'),'delegation must prevent duplicate module handlers');
  assert.ok(polish.includes('mountConsentView'),'delegation must route Consentimentos');
});

test('orders API permits the public API key header from the storefront origin',()=>{
  assert.match(adminProducts,/\"Access-Control-Allow-Headers\":\"content-type,authorization,apikey\"/);
});

test('Pós-venda opens its own view instead of redirecting to Orders',()=>{
  assert.match(polish,/function loadPostSaleModule\(\)[\s\S]*?post-sale-center\.js/);
  assert.match(polish,/if\(view==='post_sale'\)\{[\s\S]{0,180}loadPostSaleModule\(\)[\s\S]{0,120}mountPostSaleView/);
  assert.doesNotMatch(polish,/if\(view==='post_sale'\)return document\.querySelector\('\[data-tab="orders"\]'\)/);
  assert.match(polish,/data-marketing-overview-card="post_sale"[^\n]*open\('post_sale'\)/);
});

test('Marketing coordinator invalidates cached view code after navigation changes',()=>{
  assert.match(campaignEntry,/marketing-polish\.js\?v=marketing-polish-v6/);
  assert.match(campaignEntry,/marketing-polish\.css\?v=marketing-polish-v2/);
  assert.match(adminIndex,/basket-lot-image\.js\?v=marketing-workspace-v5/);
  assert.match(adminIndex,/admin-runtime\.js\?v=marketing-workspace-v2/);
});

test('Marketing campaign-entry cache key is current in every secondary navigation module',()=>{
  for(const source of [postSale,repurchase,strategy])assert.match(source,/campaign-entry\.js\?v=marketing-campaign-entry-v8/);
  assert.match(polish,/campaign-entry\.js\?v=whatsapp-flow-manager-20261024/);
  assert.doesNotMatch([postSale,repurchase,strategy,polish].join('\n'),/campaign-entry\.js\?v=marketing-campaign-entry-v4/);
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
  assert.match(campaign,/outro lote exige um novo clique/);
  assert.match(campaign,/data-campaign-send-manual-batch/);
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

test('Marketing refreshes the template view and all parent module cache keys',()=>{
  assert.match(basketLotImage,/template-center\.js\?v=marketing-template-center-v2/);
  assert.match(basketLotImage,/campaign-entry\.js\?v=whatsapp-flow-manager-20261024/);
  assert.match(campaignEntry,/marketing-polish\.js\?v=marketing-polish-v6/);
  assert.match(polish,/post-sale-center\.js\?v=whatsapp-flow-active-router-20261024/);
  assert.match(polish,/repurchase-center\.js\?v=marketing-repurchase-v3/);
  assert.match(adminIndex,/basket-lot-image\.js\?v=marketing-workspace-v5/);
});

test('Marketing Strategy module parses as an ES module',()=>{
  const path=new URL('../vitrine/admin/marketing/strategy-center.js',import.meta.url);
  const result=spawnSync(process.execPath,['--check','--input-type=module'],{input:readFileSync(path,'utf8'),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
});

test('Marketing Strategy syntax fix invalidates every cached module in its import chain',()=>{
  assert.match(adminIndex,/basket-lot-image\.js\?v=marketing-workspace-v5/);
  assert.match(basketLotImage,/campaign-entry\.js\?v=whatsapp-flow-manager-20261024/);
  assert.match(campaignEntry,/marketing-polish\.js\?v=marketing-polish-v6/);
  assert.match(polish,/strategy-center\.js\?v=marketing-strategy-v3/);
  assert.match(polish,/post-sale-center\.js\?v=whatsapp-flow-active-router-20261024/);
  assert.match(polish,/repurchase-center\.js\?v=marketing-repurchase-v3/);
  assert.match(postSale,/strategy-center\.js\?v=marketing-strategy-v3/);
  assert.match(repurchase,/strategy-center\.js\?v=marketing-strategy-v3/);
});

test('template center exposes the mount function to dynamically imported navigation modules',()=>{
  assert.match(template,/async function mountTemplateView\(/);
  assert.match(template,/export \{mountTemplateView\}/);
});
