// Rotina original de impressão com dependências injetadas explicitamente.
(function(global){
  function createOpenPrint(toast,esc){
  function openPrint(title,body,mode,existingWindow=null){
    const w=existingWindow||window.open('','_blank','width=420,height=700');
    if(!w){toast('Libere pop-ups para imprimir');return}
    const css='@page{size:85mm auto;margin:2mm}*{box-sizing:border-box}html,body{margin:0;padding:0;width:81mm;background:#fff;color:#000;font-family:Arial,sans-serif}body{font-size:10px}.ticket-head{text-align:center;border-bottom:1px dashed #000;padding:1mm 0 2mm;margin-bottom:2mm}.ticket-head strong{display:block;font-size:15px}.ticket-head span{display:block;font-weight:700;font-size:11px;margin-top:1mm}.ticket-head small{display:block;margin-top:.6mm}.gondola-title{font-weight:900;font-size:13px;border:2px solid #000;padding:1.5mm;margin:2mm 0 1.5mm;text-align:center}.shelf-title-print{font-weight:800;font-size:10px;border-bottom:1px solid #000;padding:1mm 0 .8mm;margin:1.5mm 0 1mm}.sep-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.8mm}.sep-card{border:1px solid #000;padding:1mm;min-height:48mm;display:flex;flex-direction:column;align-items:center;text-align:center;break-inside:avoid}.sep-card img{width:32mm;height:26mm;object-fit:contain;filter:grayscale(1);margin:auto}.sep-name{font-weight:700;font-size:9px;line-height:1.15;min-height:9mm}.sep-ean{font:700 8px monospace;line-height:1.2;margin:.6mm 0;word-break:break-all}.sep-ean.missing{font-family:Arial,sans-serif;font-weight:700}.sep-qty{font-weight:900;font-size:20px;line-height:1}.foot{text-align:center;border-top:1px dashed #000;margin-top:2mm;padding-top:1.5mm}.block{border-bottom:1px dashed #000;padding:2mm 0}.block>b{display:block;font-size:10px;margin-bottom:1mm}.big-total{font-size:15px;font-weight:900;margin-top:1mm}.delivery-item{display:grid;grid-template-columns:9mm 1fr;gap:1mm;padding:1mm 0;border-bottom:1px dotted #777}.delivery-item b{font-size:11px}.lines{min-height:28mm}@media print{button{display:none!important}}';
    w.document.open();
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>'+css+'</style></head><body class="'+esc(mode)+'">'+body+'<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),350));<\/script></body></html>');
    w.document.close();
  }

    return openPrint;
  }
  global.DonaAntoniaAdminPrinting=Object.freeze({createOpenPrint});
})(window);
