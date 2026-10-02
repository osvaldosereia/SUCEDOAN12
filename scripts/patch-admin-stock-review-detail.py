from pathlib import Path

path = Path('vitrine/admin/index.html')
source = path.read_text(encoding='utf-8')
start = source.index('  function orderStockAlertHtml(readiness){')
end = source.index('\n\n  function orderBlingLinkHtml', start)

replacement = r'''  function orderStockAlertHtml(readiness){
    const focused=state.orderFocusIssue==='stock';
    if(!readiness)return focused?'<div class="rule-notice warn" id="orderStockAlert" tabindex="-1"><strong>⚠️ Não consegui conferir o estoque agora</strong><div>Feche o pedido, clique em Atualizar e tente novamente.</div></div>':'';
    if(readiness.ok!==false)return focused?'<div class="rule-notice" id="orderStockAlert" tabindex="-1" style="border-color:#b9dec9;background:#f2fbf5"><strong style="color:#176b43">✓ Estoque conferido agora</strong><div>Nenhuma falta de estoque foi encontrada neste momento. O aviso da lista estava desatualizado; ao fechar este pedido, clique em Atualizar.</div></div>':'';
    const rows=Array.isArray(readiness.shortages)?readiness.shortages:[];
    const cards=rows.map(x=>{
      const required=Number(x.required??x.requested??0)||0;
      const available=Number(x.available||0)||0;
      const shortage=Number(x.shortage??Math.max(0,required-available))||0;
      const locator=[x.gondola_number!=null?'Gôndola '+x.gondola_number:'',x.shelf_label?'Prateleira '+x.shelf_label:''].filter(Boolean).join(' · ');
      const code=x.gtin||x.sku||'';
      return '<div style="border:1px solid #f0c8c3;background:#fff;border-radius:10px;padding:10px 12px;margin-top:8px">'+
        '<strong style="display:block;color:#18221c;font-size:13px">'+esc(x.name||'Produto')+'</strong>'+
        '<div style="margin-top:4px;color:#5f6962;font-size:12px">Precisa <b>'+esc(fmtQty(required))+'</b> · Disponível <b>'+esc(fmtQty(available))+'</b> · <b style="color:#b3261e">Faltam '+esc(fmtQty(shortage))+'</b></div>'+
        ((code||locator)?'<div style="margin-top:3px;color:#66716a;font-size:11px">'+(code?'Código '+esc(code):'')+(code&&locator?' · ':'')+esc(locator)+'</div>':'')+
      '</div>';
    }).join('');
    const total=Number(readiness.shortage_count||rows.length||0);
    const extra=total>rows.length?'<div style="margin-top:7px;font-size:11px;color:#66716a">Há mais '+esc(String(total-rows.length))+' item(ns) com falta além dos exibidos.</div>':'';
    return '<div class="rule-notice warn" id="orderStockAlert" tabindex="-1" style="border-color:#e6a9a2;background:#fff8f7">'+
      '<strong style="display:block;color:#b3261e;font-size:14px">⚠️ Revisar estoque antes de confirmar</strong>'+
      '<div style="margin-top:3px">O pedido está bloqueado porque o estoque disponível não cobre todos os itens abaixo.</div>'+
      (cards||'<div style="margin-top:8px">Não há estoque disponível suficiente para este pedido.</div>')+extra+
      '<div class="print-actions" style="margin-top:10px"><button class="secondary" id="openBalanceFromOrder" type="button">Abrir Balanço para corrigir estoque</button></div>'+
    '</div>';
  }'''

updated = source[:start] + replacement + source[end:]
if updated == source:
    raise SystemExit('patch produced no change')
path.write_text(updated, encoding='utf-8')
print('patched admin stock review detail')
