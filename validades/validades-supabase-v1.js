import {adminProductsApi,authenticateAdminPin,requireAdminSession} from '../admin/admin-secure-api-v1.js';

const PLACEHOLDER="data:image/svg+xml;charset=UTF-8,"+encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><rect width='100%' height='100%' fill='#f4f1ea'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#999' font-family='Arial' font-size='14'>sem foto</text></svg>");
const state={items:[],changed:{},loading:false,saving:false};
const $=id=>document.getElementById(id);
const trim=value=>String(value??'').replace(/\s+/g,' ').trim();
const esc=value=>String(value??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const num=value=>{const n=Number(String(value??'').replace(',','.'));return Number.isFinite(n)?Math.max(0,n):0};
const pad=value=>String(value).padStart(2,'0');

function setStatus(value,type='warn'){const el=$('status');el.textContent=value;el.className='status '+type}
function busy(show,value='Carregando…'){$('busyText').textContent=value;$('busy').className=show?'busy show':'busy'}
function nameOf(p){return trim(p?.name)||'Produto sem nome'}
function codeOf(p){return trim(p?.gtin||p?.sku)}
function imageOf(p){return trim(p?.image_url)||PLACEHOLDER}
function parseDate(value){
  const raw=trim(value);if(!raw)return null;
  const m=raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(!m)return null;
  const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]),date=new Date(y,mo-1,d,12,0,0,0);
  return date.getFullYear()===y&&date.getMonth()===mo-1&&date.getDate()===d?date:null;
}
function inputDate(value){const d=parseDate(value);return d?d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()):''}
function daysUntil(value){const d=parseDate(value);if(!d)return null;const today=new Date();today.setHours(12,0,0,0);return Math.round((d.getTime()-today.getTime())/86400000)}
function dayText(days){if(days==null)return'sem data';if(days<0)return'vencido há '+Math.abs(days)+' dia'+(Math.abs(days)===1?'':'s');if(days===0)return'vence hoje';if(days===1)return'vence amanhã';return'vence em '+days+' dias'}
function urgency(days){if(days<0)return'expired';if(days<=7)return'urgent';if(days<=30)return'attention';return''}
function findItem(id){return state.items.find(x=>x.id===id)||null}
function current(item){return state.changed[item.id]||{validity_date:inputDate(item.validity_date),stock:num(item.stock)}}
function original(item){return{validity_date:inputDate(item.validity_date),stock:num(item.stock)}}
function same(a,b){return trim(a.validity_date)===trim(b.validity_date)&&num(a.stock)===num(b.stock)}
function hay(item){return [item.name,item.brand,item.category,item.subcategory,item.gtin,item.sku].join(' ').toLocaleLowerCase('pt-BR')}

function configureHorizon(){
  const el=$('horizonSelect');
  el.innerHTML='<option value="5">Até 5 dias</option><option value="15">Até 15 dias</option><option value="30">Até 30 dias</option><option value="60">Até 60 dias</option>';
  el.value='30';
}
function filtered(){
  const term=trim($('searchInput').value).toLocaleLowerCase('pt-BR'),horizon=Number($('horizonSelect').value||30),showZero=$('showZeroInput').checked;
  return state.items.filter(item=>{
    const values=current(item),days=daysUntil(values.validity_date);
    if(days==null)return false;
    if(!showZero&&num(values.stock)<=0)return false;
    if(term&&!hay(item).includes(term))return false;
    return days<=horizon;
  }).sort((a,b)=>{
    const da=daysUntil(current(a).validity_date),db=daysUntil(current(b).validity_date);
    return da!==db?da-db:nameOf(a).localeCompare(nameOf(b),'pt-BR');
  });
}
function updateChangedUi(){
  const count=Object.keys(state.changed).length;
  $('changedCount').textContent=String(count);$('saveCount').textContent=String(count);$('savebar').className=count?'savebar':'savebar hidden';
}
function render(){
  const list=filtered(),host=$('productsList');
  $('visibleCount').textContent=String(list.length);
  let today=0,seven=0,thirty=0;
  for(const item of list){const days=daysUntil(current(item).validity_date);if(days===0)today++;if(days>=0&&days<=7)seven++;if(days>=0&&days<=30)thirty++}
  $('expiredCount').textContent=String(today);$('sevenCount').textContent=String(seven);$('thirtyCount').textContent=String(thirty);
  $('emptyState').hidden=list.length!==0;
  host.innerHTML=list.map(item=>{
    const values=current(item),days=daysUntil(values.validity_date),dirty=Boolean(state.changed[item.id]),meta=[item.brand,item.packaging,codeOf(item)].filter(Boolean).join(' · ');
    return '<article class="product-row '+urgency(days)+(dirty?' dirty':'')+'" data-key="'+esc(item.id)+'">'+
      '<img class="product-photo" src="'+esc(imageOf(item))+'" alt="" onerror="this.src=\''+PLACEHOLDER+'\'">'+
      '<div class="product-info"><strong class="product-name">'+esc(nameOf(item))+'</strong><span class="product-meta">'+esc(meta||item.id)+'</span><span class="validity-note">'+esc(dayText(days))+'</span></div>'+
      '<div class="edit-field field-validity"><label>Validade</label><input class="validity-input" type="date" value="'+esc(values.validity_date)+'" data-field="validity_date"></div>'+
      '<div class="edit-field field-stock"><label>Estoque</label><input class="stock-input" type="number" min="0" step="1" inputmode="decimal" value="'+esc(values.stock)+'" data-field="stock"></div>'+
      '<button class="row-save" type="button" data-save="1" '+(dirty?'':'disabled')+'>'+(dirty?'Salvar':'Salvo')+'</button>'+
      '</article>';
  }).join('');
  updateChangedUi();
}
function updateDraft(row){
  const id=row.dataset.key,item=findItem(id);if(!item)return;
  const values={validity_date:row.querySelector('[data-field="validity_date"]').value,stock:num(row.querySelector('[data-field="stock"]').value)};
  if(same(values,original(item)))delete state.changed[id];else state.changed[id]=values;
  const dirty=Boolean(state.changed[id]);row.classList.toggle('dirty',dirty);
  const button=row.querySelector('[data-save]');button.disabled=!dirty;button.textContent=dirty?'Salvar':'Salvo';updateChangedUi();
}
function validate(id){
  const item=findItem(id),values=state.changed[id]||current(item);
  if(!item)return new Error('Produto não encontrado na lista.');
  if(!values.validity_date||!parseDate(values.validity_date))return new Error('Informe uma validade válida.');
  if(num(values.stock)<0)return new Error('O estoque não pode ser negativo.');
  return null;
}
async function persist(id){
  const item=findItem(id),values=state.changed[id];if(!item||!values)return false;
  const error=validate(id);if(error)throw error;
  const result=await adminProductsApi('save_product',{id,patch:{validity_date:values.validity_date,stock:num(values.stock)}});
  Object.assign(item,result.product||{validity_date:values.validity_date,stock:num(values.stock)});
  delete state.changed[id];return true;
}
async function saveOne(id){
  if(state.saving||!state.changed[id])return;
  const error=validate(id);if(error)return setStatus(error.message,'err');
  state.saving=true;busy(true,'Salvando produto no Supabase…');
  try{await persist(id);navigator.vibrate?.(50);render();setStatus('Validade e estoque atualizados no Supabase.','ok')}
  catch(e){setStatus('Erro ao salvar: '+e.message,'err')}
  finally{state.saving=false;busy(false)}
}
async function saveAll(){
  if(state.saving)return;
  const ids=Object.keys(state.changed);if(!ids.length)return;
  for(const id of ids){const error=validate(id);if(error)return setStatus(error.message,'err')}
  state.saving=true;busy(true,'Salvando alterações…');let done=0;const errors=[];
  for(const id of ids){
    $('busyText').textContent='Salvando '+(done+1)+' de '+ids.length+'…';
    try{await persist(id)}catch(error){errors.push({id,error})}finally{done++}
  }
  state.saving=false;busy(false);render();
  if(errors.length)setStatus((ids.length-errors.length)+' salvo(s); '+errors.length+' falharam.','err');
  else{navigator.vibrate?.([50,30,50]);setStatus(ids.length+' produto(s) atualizados no Supabase.','ok')}
}
function showAuth(){
  const dialog=$('adminAuthDialog');if(!dialog.open)dialog.showModal();
  setStatus('Sessão administrativa necessária para consultar e alterar produtos.','warn');
}
async function loadProducts(force=false){
  if(state.loading)return;
  if(force&&Object.keys(state.changed).length&&!confirm('Existem alterações não salvas. Deseja descartá-las e recarregar?'))return;
  state.loading=true;busy(true,'Carregando produtos do Supabase…');setStatus('Consultando Supabase…','warn');
  try{
    const data=await adminProductsApi('catalog',{limit:2500});
    state.items=(data.products||[]).filter(item=>item&&item.id);state.changed={};render();
    setStatus('Lista atualizada pelo Supabase. Edite validade ou estoque e salve somente o que mudou.','ok');
  }catch(error){
    if(error.code==='PIN_REQUIRED'||error.status===401)showAuth();
    else setStatus('Não foi possível carregar os produtos: '+error.message,'err');
  }finally{state.loading=false;busy(false)}
}

document.addEventListener('input',event=>{
  const field=event.target?.getAttribute?.('data-field');
  if(field){const row=event.target.closest('.product-row');if(row)updateDraft(row);return}
  if(event.target?.id==='searchInput')render();
});
document.addEventListener('change',event=>{
  if(event.target?.getAttribute?.('data-field')){const row=event.target.closest('.product-row');if(row)updateDraft(row);return}
  if(/^(horizonSelect|showZeroInput)$/.test(event.target?.id||''))render();
});
document.addEventListener('click',event=>{
  const save=event.target?.closest?.('[data-save]');
  if(save){const row=save.closest('.product-row');if(row)saveOne(row.dataset.key);return}
  if(event.target?.id==='reloadButton')loadProducts(true);
  if(event.target?.id==='saveAllButton')saveAll();
});
$('adminAuthForm').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('adminAuthSubmit'),status=$('adminAuthStatus');button.disabled=true;status.textContent='Entrando…';
  try{await authenticateAdminPin($('adminAuthPin').value);$('adminAuthDialog').close();$('adminAuthPin').value='';status.textContent='';await loadProducts(false)}
  catch(error){status.textContent=error.message||'PIN inválido.'}
  finally{button.disabled=false}
});

configureHorizon();
await requireAdminSession({onRequired:showAuth});
await loadProducts(false);
