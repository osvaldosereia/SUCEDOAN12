import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync('vitrine/admin/marketing/audience-center.js','utf8');
const audienceStart=source.indexOf('async function mountAudienceView(');
const consentDetailStart=source.indexOf('async function loadConsentDetail(',audienceStart);
const consentStart=source.indexOf('async function mountConsentView(',consentDetailStart);
const stop=source.indexOf('\nensureCss();\nexport ',consentStart);
assert.ok(audienceStart>0&&consentDetailStart>audienceStart&&consentStart>consentDetailStart&&stop>consentStart);

for(const [name,start,end] of [['audience',audienceStart,source.indexOf('function consentSearchMarkup()',audienceStart)],['consent',consentStart,stop]]){
  const block=source.slice(start,end);
  assert.match(block,/generation=\+\+audienceMountGeneration/,name+' needs an independent mount revision');
  assert.match(block,/const isCurrent=\(\)=>activeRoot===root&&generation===audienceMountGeneration/,name+' must reject previous views on same container');
  assert.match(block,/if\(!isCurrent\(\)\)return/,name+' must guard delayed success');
}

{
  // Run the real consent detail loader; the latest selected customer must win.
  const sourceCode=source.slice(consentDetailStart,consentStart);
  const host={innerHTML:'',querySelector:()=>null};
  let currentHost=host;
  const root={querySelector:selector=>selector==='[data-consent-detail]'?currentHost:null};
  const pending=new Map();
  const apiGet=(_,{customer_id})=>new Promise(resolve=>pending.set(customer_id,resolve));
  const load=new Function('activeRoot','apiGet','esc','fmtDate','stateLabels','openConsentDialog',
    'let consentDetailGeneration=0;'+sourceCode+'return loadConsentDetail;')(
      root,apiGet,String,String,{opt_in:'Consentiu'},()=>{}
    );
  const old=load(root,'first'),latest=load(root,'second');
  pending.get('second')({customer:{name:'Atual',consent_state:'opt_in'},items:[]});
  await latest;
  pending.get('first')({customer:{name:'Antigo',consent_state:'opt_in'},items:[]});
  await old;
  assert.match(host.innerHTML,/Atual/);
  assert.doesNotMatch(host.innerHTML,/Antigo/);
  const gone=load(root,'detached');
  currentHost=null;
  pending.get('detached')({customer:{name:'Fora de tela'},items:[]});
  await gone;
  assert.doesNotMatch(host.innerHTML,/Fora de tela/);
}
console.log('PASS marketing audience and consent response isolation');
