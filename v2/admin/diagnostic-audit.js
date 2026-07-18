function number(value){const n=Number(value);return Number.isFinite(n)?n:0;}
function ratio(ok,total){return total>0?Math.round(ok/total*100):0;}

export function buildDiagnosticSummary({products=[],baskets=[],kits=[],orders=[],integrationResults=[],publicationPlan=null}={}){
  const productIssues=products.filter(product=>!product.nome||!product.codigo||!product.categoria||number(product.preco)<=0).length;
  const stockIssues=products.filter(product=>number(product.estoque)<=0).length;
  const collectionTotal=baskets.length+kits.length;
  const collectionIssues=[...baskets,...kits].filter(item=>!item?.id||!(item?.items||[]).length||number(item?.preco)<=0).length;
  const orderIssues=orders.filter(order=>!order?.cliente?.nome||!(order?.itens||[]).length||order?.integrationError).length;
  const integrationOk=integrationResults.filter(result=>result?.status==='ok').length;
  const integrationTotal=integrationResults.length;
  const publicationReady=Boolean(publicationPlan?.ready);
  const checks=[
    {id:'catalog',label:'Catálogo estrutural',ok:products.length>0&&productIssues===0,detail:`${products.length} produtos · ${productIssues} pendências essenciais`},
    {id:'stock',label:'Disponibilidade de estoque',ok:stockIssues===0,detail:`${stockIssues} produtos sem estoque`},
    {id:'collections',label:'Cestas e kits',ok:collectionTotal>0&&collectionIssues===0,detail:`${collectionTotal} coleções · ${collectionIssues} problemas`},
    {id:'orders',label:'Pedidos',ok:orders.length===0||orderIssues===0,detail:`${orders.length} pedidos · ${orderIssues} alertas`},
    {id:'integrations',label:'Integrações verificadas',ok:integrationTotal>0&&integrationOk===integrationTotal,detail:`${integrationOk} de ${integrationTotal} leituras aprovadas`},
    {id:'publication',label:'Plano de publicação',ok:publicationReady,detail:publicationReady?'Checklist pronto para revisão':'Publicação ainda bloqueada'}
  ];
  const passed=checks.filter(check=>check.ok).length;
  const score=ratio(passed,checks.length);
  const status=score===100?'ready':score>=70?'attention':'blocked';
  return Object.freeze({score,status,checks,passed,total:checks.length,productIssues,stockIssues,collectionIssues,orderIssues,integrationOk,integrationTotal,publicationReady});
}

export function diagnosticRecommendations(summary){
  const map={catalog:'Corrigir os cadastros essenciais dos produtos.',stock:'Revisar produtos zerados antes de liberar compra.',collections:'Corrigir composições e preços de cestas ou kits.',orders:'Revisar pedidos com dados ou integrações incompletas.',integrations:'Executar novamente apenas as leituras seguras das integrações.',publication:'Concluir checklist, revisão humana e referência de rollback.'};
  return summary.checks.filter(check=>!check.ok).map(check=>Object.freeze({id:check.id,text:map[check.id]}));
}
