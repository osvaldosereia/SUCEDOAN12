const LI_BASE=(process.env.LOJA_INTEGRADA_BASE_URL||'https://api.awsli.com.br/v1').replace(/\/$/,'');
const AUTH=String(process.env.LOJA_INTEGRADA_AUTHORIZATION||'').trim();
const text=v=>String(v??'').trim();
if(!AUTH)throw new Error('Token Loja Integrada ausente.');
async function li(path){const r=await fetch(`${LI_BASE}${path}`,{headers:{Authorization:AUTH,Accept:'application/json','User-Agent':'CanecaFacil-Order-Structure-Diagnostic/1.0'},signal:AbortSignal.timeout(15000)});const raw=await r.text();let data=null;try{data=raw?JSON.parse(raw):null}catch{data={raw}};if(!r.ok)throw new Error(`${r.status} ${data?.message||data?.detail||raw}`);return data;}
function resourceId(value){const m=text(value).match(/\/(\d+)\/?$/);return m?m[1]:'';}
function sanitizeItem(item={}){
  const produto=item.produto&&typeof item.produto==='object'?item.produto:{};
  return {
    keys:Object.keys(item).sort(),
    produto_id:text(item.produto_id||item.id_produto||produto.id||resourceId(item.produto)),
    produto_uri:typeof item.produto==='string'?item.produto:text(produto.resource_uri),
    sku:text(item.sku||item.codigo||item.codigo_produto||produto.sku),
    nome:text(item.nome||item.nome_produto||produto.nome).slice(0,120),
    quantidade:Number(item.quantidade||item.qtd||0)||0,
    has_variacao:Boolean(item.variacao||item.grade||item.opcao),
  };
}
const search=await li('/pedido/search?limit=5');
const candidates=Array.isArray(search?.objects)?search.objects:Array.isArray(search)?search:[];
console.log(`PEDIDOS_ENCONTRADOS ${candidates.length}`);
if(!candidates.length){console.log('SEM_PEDIDOS_PARA_DIAGNOSTICO');process.exit(0);}
const summary=candidates[0]||{};
const pedidoId=text(summary.id||resourceId(summary.resource_uri));
if(!pedidoId)throw new Error('API não retornou ID de pedido utilizável.');
const pedido=await li(`/pedido/${encodeURIComponent(pedidoId)}`);
const possibleArrays=['itens','items','produtos','line_items'];
let field='';let items=[];
for(const k of possibleArrays){if(Array.isArray(pedido?.[k])){field=k;items=pedido[k];break;}}
console.log(`PEDIDO_ESTRUTURA id=${pedidoId} · keys=${Object.keys(pedido||{}).sort().join(',')}`);
console.log(`CAMPO_ITENS ${field||'não identificado'} · quantidade=${items.length}`);
console.log('ITENS_SANITIZADOS '+JSON.stringify(items.map(sanitizeItem)));
console.log('DIAGNOSTICO '+JSON.stringify({pedido_id:pedidoId,pedido_keys:Object.keys(pedido||{}).sort(),campo_itens:field,itens:items.map(sanitizeItem)}));
