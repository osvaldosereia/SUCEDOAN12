from pathlib import Path
import re

ROOT = Path(".")
front_path = ROOT / "vitrine/admin/index.html"
edge_path = ROOT / "supabase/functions/admin-products-live-v1/index.ts"

def must_replace(text, old, new, label):
    n = text.count(old)
    if n != 1:
        raise RuntimeError(f"{label}: expected 1 occurrence, found {n}")
    return text.replace(old, new, 1)

def must_regex(text, pattern, repl, label):
    out, n = re.subn(pattern, repl, text, count=1, flags=re.S)
    if n != 1:
        raise RuntimeError(f"{label}: expected 1 regex match, found {n}")
    return out

# ---------- Frontend ----------
front = front_path.read_text(encoding="utf-8")

front = must_regex(
    front,
    r"  function inventoryPrintCard\(p\)\{.*?\n  \}\n\n  function inventoryPrintSelectedFilters",
    """  function inventoryPrintCard(p){
    const img=inventoryPrintEscape(p.image_url||'/img/logoantonia5.png');
    return '<article class="count-card">'+
      '<div class="card-ref">REF '+String(p.printed_index).padStart(4,'0')+'</div>'+
      '<div class="product-photo"><img src="'+img+'" alt=""></div>'+
      '<div class="product-name">'+inventoryPrintEscape(p.name||'')+'</div>'+
      '<div class="product-ean">EAN '+inventoryPrintEscape(p.gtin||'SEM EAN')+'</div>'+
      '<div class="write-pair">'+
        '<div class="write-field"><b>ESTOQUE</b><span title="Escreva a quantidade em estoque"></span></div>'+
        '<div class="write-field"><b>GÔNDOLA</b><span title="Escreva o número da gôndola"></span></div>'+
      '</div>'+
    '</article>';
  }

  function inventoryPrintSelectedFilters""",
    "frontend inventoryPrintCard",
)

old_css = """.count-sheet{height:265mm;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));grid-template-rows:repeat(4,minmax(0,1fr));gap:1.35mm;align-items:stretch}'+
        '.count-card{position:relative;border:.3mm solid #222;border-radius:1mm;padding:1mm;overflow:hidden;background:#fff;display:flex;flex-direction:column;min-width:0}.card-ref{position:absolute;top:.8mm;right:1mm;font-size:5.8pt;font-weight:800;background:#fff;padding-left:.6mm}.product-photo{height:35mm;flex:0 0 35mm;display:flex;align-items:center;justify-content:center;margin-bottom:.7mm}.product-photo img{display:block;max-width:100%;max-height:35mm;object-fit:contain}.product-name{height:7.6mm;flex:0 0 7.6mm;overflow:hidden;font-weight:700;font-size:6.7pt;line-height:1.08;text-align:center}.product-ean{text-align:center;font-size:6pt;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:.35mm}.product-validity{text-align:center;font-size:5.5pt;min-height:3.1mm;margin-top:.25mm}.count-row{display:grid;gap:.4mm;margin-top:.45mm}.count-row-first{grid-template-columns:repeat(6,1fr)}.count-row-second{grid-template-columns:repeat(5,1fr) 1.8fr}.count-box,.count-write{height:4.2mm;border:.3mm solid #111;display:flex;align-items:center;justify-content:center;background:#fff}.count-box b{font-size:5.6pt}.count-write{border-width:.4mm}.count-write:after{content:""}'+"""
new_css = """.count-sheet{height:265mm;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));grid-template-rows:repeat(5,minmax(0,1fr));gap:1.15mm;align-items:stretch}'+
        '.count-card{position:relative;border:.3mm solid #222;border-radius:1mm;padding:.9mm;overflow:hidden;background:#fff;display:flex;flex-direction:column;min-width:0}.card-ref{position:absolute;top:.7mm;right:.9mm;font-size:5.2pt;font-weight:800;background:#fff;padding-left:.5mm}.product-photo{height:25mm;flex:0 0 25mm;display:flex;align-items:center;justify-content:center;margin-bottom:.4mm}.product-photo img{display:block;max-width:100%;max-height:25mm;object-fit:contain}.product-name{height:6.2mm;flex:0 0 6.2mm;overflow:hidden;font-weight:700;font-size:6pt;line-height:1.05;text-align:center}.product-ean{text-align:center;font-size:5.2pt;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:.2mm}.write-pair{display:grid;grid-template-columns:1fr 1fr;gap:.8mm;margin-top:auto;padding-top:.5mm}.write-field{min-width:0}.write-field b{display:block;text-align:center;font-size:4.8pt;line-height:1;margin-bottom:.35mm;letter-spacing:.1px}.write-field span{display:block;height:8.4mm;border:.45mm solid #111;background:#fff}'+"""
front = must_replace(front, old_css, new_css, "frontend print CSS")

front = must_replace(
    front,
    """'<header class="sheet-head"><div><h1>Dona Antônia · Balanço físico</h1><p>Marque X de 0 a 10. Acima de 10, escreva no quadro largo. Fotografe a folha A4 inteira para importar.</p></div>'+""",
    """'<header class="sheet-head"><div><h1>Dona Antônia · Balanço físico</h1><p>Escreva a quantidade no quadro ESTOQUE e o número da localização no quadro GÔNDOLA. Fotografe a folha A4 inteira.</p></div>'+""",
    "frontend print instruction",
)

front = must_regex(
    front,
    r"  function inventorySheetRowApproved\(row\)\{.*?\n  \}\n\n  function inventorySheetReviewLabel",
    """  function inventorySheetRowApproved(row){
    const q=Number(row.quantity),g=Number(row.gondola);
    if(!Number.isInteger(q)||q<0||!Number.isInteger(g)||g<1||g>9999)return false;
    if(row.review_state==='applied'||row.review_state==='confirmed')return true;
    if(row.manual_confirmed===true)return true;
    return row.review_state==='ready'&&Number(row.ai_quantity)===q&&Number(row.ai_gondola)===g&&!row.user_edited;
  }

  function inventorySheetReviewLabel""",
    "frontend row approval",
)

front = must_replace(
    front,
    """        return '<div class="simple-row" style="grid-template-columns:minmax(0,1fr) 88px auto;gap:8px;align-items:center">'+
          '<div class="simple-main"><strong>'+esc(r.name)+'</strong><small>'+esc(detail)+'</small></div>'+
          '<input type="number" min="0" step="1" inputmode="numeric" data-sheet-qty="'+esc(r.result_id)+'" value="'+(r.quantity==null?'':esc(r.quantity))+'" style="min-height:38px;padding:6px 8px;text-align:center;font-weight:900">'+
          '<div style="display:flex;gap:5px;align-items:center;justify-content:flex-end;flex-wrap:wrap">'+inventorySheetReviewLabel(r)+(needsConfirm?'<button class="secondary" type="button" data-sheet-confirm="'+esc(r.result_id)+'" style="min-height:36px;padding:0 9px">Confirmar</button>':'')+'</div>'+
        '</div>';""",
    """        return '<div class="simple-row" style="grid-template-columns:minmax(0,1fr) 82px 76px auto;gap:8px;align-items:center">'+
          '<div class="simple-main"><strong>'+esc(r.name)+'</strong><small>'+esc(detail)+'</small></div>'+
          '<input type="number" min="0" step="1" inputmode="numeric" aria-label="Estoque" title="Estoque" placeholder="Est." data-sheet-qty="'+esc(r.result_id)+'" value="'+(r.quantity==null?'':esc(r.quantity))+'" style="min-height:38px;padding:6px 8px;text-align:center;font-weight:900">'+
          '<input type="number" min="1" max="9999" step="1" inputmode="numeric" aria-label="Gôndola" title="Gôndola" placeholder="Gôn." data-sheet-gondola="'+esc(r.result_id)+'" value="'+(r.gondola==null?'':esc(r.gondola))+'" style="min-height:38px;padding:6px 8px;text-align:center;font-weight:900">'+
          '<div style="display:flex;gap:5px;align-items:center;justify-content:flex-end;flex-wrap:wrap">'+inventorySheetReviewLabel(r)+(needsConfirm?'<button class="secondary" type="button" data-sheet-confirm="'+esc(r.result_id)+'" style="min-height:36px;padding:0 9px">Confirmar</button>':'')+'</div>'+
        '</div>';""",
    "frontend review row",
)

front = must_replace(
    front,
    """    host.querySelectorAll('[data-sheet-qty]').forEach(el=>el.oninput=e=>{
      const row=rows.find(x=>x.result_id===e.currentTarget.dataset.sheetQty);if(!row)return;
      const raw=e.currentTarget.value;row.quantity=raw===''?null:Number(raw);row.user_edited=true;row.manual_confirmed=false;
      paintInventorySheetPhoto();
    });
    host.querySelectorAll('[data-sheet-confirm]').forEach(b=>b.onclick=()=>{
      const row=rows.find(x=>x.result_id===b.dataset.sheetConfirm);if(!row)return;
      if(!Number.isInteger(Number(row.quantity))||Number(row.quantity)<0){toast('Informe uma quantidade inteira válida');return}
      row.manual_confirmed=true;paintInventorySheetPhoto();
    });""",
    """    host.querySelectorAll('[data-sheet-qty]').forEach(el=>el.oninput=e=>{
      const row=rows.find(x=>x.result_id===e.currentTarget.dataset.sheetQty);if(!row)return;
      const raw=e.currentTarget.value;row.quantity=raw===''?null:Number(raw);row.user_edited=true;row.manual_confirmed=false;
      paintInventorySheetPhoto();
    });
    host.querySelectorAll('[data-sheet-gondola]').forEach(el=>el.oninput=e=>{
      const row=rows.find(x=>x.result_id===e.currentTarget.dataset.sheetGondola);if(!row)return;
      const raw=e.currentTarget.value;row.gondola=raw===''?null:Number(raw);row.user_edited=true;row.manual_confirmed=false;
      paintInventorySheetPhoto();
    });
    host.querySelectorAll('[data-sheet-confirm]').forEach(b=>b.onclick=()=>{
      const row=rows.find(x=>x.result_id===b.dataset.sheetConfirm);if(!row)return;
      if(!Number.isInteger(Number(row.quantity))||Number(row.quantity)<0){toast('Informe uma quantidade inteira válida');return}
      if(!Number.isInteger(Number(row.gondola))||Number(row.gondola)<1||Number(row.gondola)>9999){toast('Informe um número de gôndola válido');return}
      row.manual_confirmed=true;paintInventorySheetPhoto();
    });""",
    "frontend review events",
)

front = must_replace(
    front,
    """      state.inventorySheetScan={...data,rows:(data.rows||[]).map(r=>({...r,manual_confirmed:false,user_edited:false}))};""",
    """      state.inventorySheetScan={...data,rows:(data.rows||[]).map(r=>({...r,gondola:r.gondola??r.ai_gondola??null,manual_confirmed:false,user_edited:false}))};""",
    "frontend scan init",
)

front = must_replace(
    front,
    """      if(u.confirmed_quantity!=null)row.quantity=Number(u.confirmed_quantity);
      if(['applied','confirmed','error'].includes(row.review_state))row.manual_confirmed=true;""",
    """      if(u.confirmed_quantity!=null)row.quantity=Number(u.confirmed_quantity);
      if(u.confirmed_gondola!=null)row.gondola=Number(u.confirmed_gondola);
      if(['applied','confirmed','error'].includes(row.review_state))row.manual_confirmed=true;""",
    "frontend merge",
)

front = must_replace(
    front,
    """body:JSON.stringify({scan_id:scan.scan_id,operator,items:chunk.map(r=>({result_id:r.result_id,quantity:Number(r.quantity),manual_confirmed:r.manual_confirmed===true||r.user_edited===true}))})""",
    """body:JSON.stringify({scan_id:scan.scan_id,operator,items:chunk.map(r=>({result_id:r.result_id,quantity:Number(r.quantity),gondola:Number(r.gondola),manual_confirmed:r.manual_confirmed===true||r.user_edited===true}))})""",
    "frontend apply payload",
)

front = must_replace(
    front,
    """<span>Uma foto deve mostrar a folha vertical inteira, com as quatro bordas visíveis.</span>""",
    """<span>Uma foto deve mostrar a folha vertical inteira, com as quatro bordas visíveis. A IA lê Estoque e Gôndola dos 25 produtos.</span>""",
    "frontend photo text",
)

# ---------- Edge Function ----------
edge = edge_path.read_text(encoding="utf-8")
edge = must_replace(edge, "const INVENTORY_SHEET_CARDS_PER_PAGE=20;", "const INVENTORY_SHEET_CARDS_PER_PAGE=25;", "edge cards/page")

schema = r'''const INVENTORY_SHEET_SCAN_SCHEMA:any={
  type:"object",additionalProperties:false,
  properties:{
    batch_code:{type:"string"},page_number:{type:["integer","null"]},page_confidence:{type:"number",minimum:0,maximum:1},page_complete:{type:"boolean"},
    items:{type:"array",maxItems:25,items:{type:"object",additionalProperties:false,properties:{
      slot_number:{type:"integer",minimum:1,maximum:25},printed_index:{type:["integer","null"],minimum:1},ean:{type:"string"},product_name_visible:{type:"string"},
      quantity:{type:["integer","null"],minimum:0},gondola:{type:["integer","null"],minimum:1,maximum:9999},
      quantity_confidence:{type:"number",minimum:0,maximum:1},gondola_confidence:{type:"number",minimum:0,maximum:1},
      ambiguous_quantity:{type:"boolean"},ambiguous_gondola:{type:"boolean"},note:{type:"string"}
    },required:["slot_number","printed_index","ean","product_name_visible","quantity","gondola","quantity_confidence","gondola_confidence","ambiguous_quantity","ambiguous_gondola","note"]}}
  },
  required:["batch_code","page_number","page_confidence","page_complete","items"]
};'''
edge = must_regex(
    edge,
    r'const INVENTORY_SHEET_SCAN_SCHEMA:any=\{.*?\n\};\n\nasync function inventorySheetVision',
    schema + "\n\nasync function inventorySheetVision",
    "edge schema",
)

new_instructions = r'''        instructions:[
          "Você lê uma FOTO ÚNICA de uma folha A4 vertical inteira de balanço físico da Dona Antônia.",
          "A página tem exatamente 5 colunas e no máximo 5 linhas de cards, portanto no máximo 25 produtos.",
          "No cabeçalho existem o código do lote BAL-...... e o número Página X/Y.",
          "Cada card tem REF (índice impresso), foto, nome, EAN e EXATAMENTE dois quadros manuscritos: ESTOQUE à esquerda e GÔNDOLA à direita.",
          "O card NÃO mostra validade e NÃO possui caixas numeradas de 0 a 10. Não procure nem invente esses elementos.",
          "quantity é somente o número manuscrito no quadro ESTOQUE. gondola é somente o número manuscrito no quadro GÔNDOLA.",
          "Nunca use conhecimento prévio, aparência do produto ou outra linha para inferir estoque ou gôndola.",
          "Se um dos dois números estiver ilegível, vazio, cortado, com rasura duvidosa, reflexo ou sombra forte, marque a ambiguidade daquele campo e devolva null para ele.",
          "Leia a página inteira, da esquerda para a direita e de cima para baixo. slot_number é a posição física 1..25 nessa ordem.",
          "Copie EAN e REF visíveis. Não corrija EAN por conhecimento do produto.",
          "Só use confiança alta quando o número manuscrito estiver claramente legível dentro do quadro correto."
        ].join(" "),'''
edge = must_regex(
    edge,
    r'        instructions:\[\n.*?\n        \]\.join\(" "\),',
    new_instructions,
    "edge vision instructions",
)

review_fn = r'''function inventorySheetReview(expected:any[],parsed:any){
  const bySlot=new Map<number,any>();
  for(const x of Array.isArray(parsed?.items)?parsed.items:[]){const slot=Number(x?.slot_number);if(Number.isInteger(slot)&&slot>=1&&slot<=25&&!bySlot.has(slot))bySlot.set(slot,x)}
  const pageOk=Number(parsed?.page_confidence||0)>=0.90&&parsed?.page_complete===true;
  return expected.map((item:any)=>{
    const ai=bySlot.get(Number(item.slot_number))||null,expectedEan=dg(item.gtin_snapshot),aiEan=dg(ai?.ean);
    const eanMatch=expectedEan?aiEan===expectedEan:true,indexMatch=Number(ai?.printed_index||0)===Number(item.printed_index);
    const q=ai?.quantity,g=ai?.gondola;
    const validQty=Number.isInteger(q)&&q>=0&&q<=100000,validGondola=Number.isInteger(g)&&g>=1&&g<=9999;
    const quantityConfidence=Number(ai?.quantity_confidence||0),gondolaConfidence=Number(ai?.gondola_confidence||0),confidence=Math.min(quantityConfidence,gondolaConfidence);
    const ready=Boolean(ai)&&pageOk&&indexMatch&&eanMatch&&validQty&&validGondola&&ai?.ambiguous_quantity===false&&ai?.ambiguous_gondola===false&&quantityConfidence>=0.95&&gondolaConfidence>=0.95;
    const reasons:string[]=[];
    if(!ai)reasons.push("card_nao_lido");
    if(ai&&!indexMatch)reasons.push("ref_nao_confere");
    if(ai&&expectedEan&&!eanMatch)reasons.push("ean_nao_confere");
    if(ai&&!validQty)reasons.push("quantidade_duvidosa");
    if(ai&&!validGondola)reasons.push("gondola_duvidosa");
    if(ai?.ambiguous_quantity===true)reasons.push("quantidade_ambigua");
    if(ai?.ambiguous_gondola===true)reasons.push("gondola_ambigua");
    if(ai&&quantityConfidence<0.95)reasons.push("baixa_confianca_estoque");
    if(ai&&gondolaConfidence<0.95)reasons.push("baixa_confianca_gondola");
    if(!pageOk)reasons.push("pagina_incompleta_ou_duvidosa");
    return {sheet_item_id:item.id,product_id:item.product_id,page_number:item.page_number,slot_number:item.slot_number,printed_index:item.printed_index,name:item.product_name_snapshot,gtin:expectedEan||"",
      ai_ean:aiEan||"",ai_quantity:validQty?q:null,quantity:validQty?q:null,ai_gondola:validGondola?g:null,gondola:validGondola?g:null,
      confidence,quantity_confidence:quantityConfidence,gondola_confidence:gondolaConfidence,mark_kind:"written_pair",note:tx(ai?.note,300),review_state:ready?"ready":"review",reason:ready?"":reasons.join(",")};
  });
}'''
edge = must_regex(
    edge,
    r'function inventorySheetReview\(expected:any\[],parsed:any\)\{.*?\n\}\n\nasync function inventorySheetAnalyze',
    review_fn + "\n\nasync function inventorySheetAnalyze",
    "edge review function",
)

edge = must_replace(
    edge,
    '''ai_ean:r.ai_ean||null,ai_quantity:r.ai_quantity,ai_confidence:r.confidence,ai_mark_kind:r.mark_kind,ai_note:r.note||null,review_state:r.review_state''',
    '''ai_ean:r.ai_ean||null,ai_quantity:r.ai_quantity,ai_gondola:r.ai_gondola,ai_confidence:r.confidence,ai_mark_kind:r.mark_kind,ai_note:r.note||null,review_state:r.review_state''',
    "edge analyze persistence",
)

edge = must_replace(
    edge,
    '''if(row.review_state==="applied"){applied.push({result_id:rid,ok:true,already_applied:true,stock_count_id:row.stock_count_id||null,bling_job_id:row.bling_job_id||null});continue}''',
    '''if(row.review_state==="applied"){applied.push({result_id:rid,ok:true,already_applied:true,stock_count_id:row.stock_count_id||null,bling_job_id:row.bling_job_id||null,confirmed_gondola:row.confirmed_gondola||null});continue}''',
    "edge applied shortcut",
)

edge = must_replace(
    edge,
    '''    const quantity=Number(req?.quantity);
    if(!Number.isInteger(quantity)||quantity<0||quantity>100000){applied.push({result_id:rid,ok:false,error:"invalid_quantity"});continue}
    const aiQuantity=row.ai_quantity==null?null:Number(row.ai_quantity);
    if(row.review_state==="ready"&&aiQuantity!==null&&quantity!==aiQuantity&&req?.manual_confirmed!==true){
      applied.push({result_id:rid,ok:false,error:"manual_confirmation_required_for_override",ai_quantity:aiQuantity});
      continue;
    }''',
    '''    const quantity=Number(req?.quantity),gondola=Number(req?.gondola);
    if(!Number.isInteger(quantity)||quantity<0||quantity>100000){applied.push({result_id:rid,ok:false,error:"invalid_quantity"});continue}
    if(!Number.isInteger(gondola)||gondola<1||gondola>9999){applied.push({result_id:rid,ok:false,error:"invalid_gondola"});continue}
    const aiQuantity=row.ai_quantity==null?null:Number(row.ai_quantity),aiGondola=row.ai_gondola==null?null:Number(row.ai_gondola);
    if(row.review_state==="ready"&&((aiQuantity!==null&&quantity!==aiQuantity)||(aiGondola!==null&&gondola!==aiGondola))&&req?.manual_confirmed!==true){
      applied.push({result_id:rid,ok:false,error:"manual_confirmation_required_for_override",ai_quantity:aiQuantity,ai_gondola:aiGondola});
      continue;
    }''',
    "edge apply validation",
)

edge = must_replace(
    edge,
    '''    const previousConfirmed=row.confirmed_quantity==null?null:Number(row.confirmed_quantity);
    const previousCountId=id(row.stock_count_id);
    const previousJobId=id(row.bling_job_id);
    if(previousCountId&&previousConfirmed!==null&&previousConfirmed!==quantity){
      applied.push({result_id:rid,ok:false,error:"quantity_changed_after_confirmation",confirmed_quantity:previousConfirmed});
      continue;
    }

    let countId=previousCountId;''',
    '''    const previousConfirmed=row.confirmed_quantity==null?null:Number(row.confirmed_quantity);
    const previousGondola=row.confirmed_gondola==null?null:Number(row.confirmed_gondola);
    const previousCountId=id(row.stock_count_id);
    const previousJobId=id(row.bling_job_id);
    if(previousCountId&&((previousConfirmed!==null&&previousConfirmed!==quantity)||(previousGondola!==null&&previousGondola!==gondola))){
      applied.push({result_id:rid,ok:false,error:"values_changed_after_confirmation",confirmed_quantity:previousConfirmed,confirmed_gondola:previousGondola});
      continue;
    }

    let vg=await db.from("vitrine_gondolas").select("id,number,active").eq("number",gondola).maybeSingle();
    if(vg.error){applied.push({result_id:rid,ok:false,error:tx(vg.error.message,240)});continue}
    if(!vg.data){
      vg=await db.from("vitrine_gondolas").insert({number:gondola,active:true}).select("id,number,active").single();
      if(vg.error){applied.push({result_id:rid,ok:false,error:tx(vg.error.message,240)});continue}
    }else if(vg.data.active!==true){
      vg=await db.from("vitrine_gondolas").update({active:true,updated_at:new Date().toISOString()}).eq("id",vg.data.id).select("id,number,active").single();
      if(vg.error){applied.push({result_id:rid,ok:false,error:tx(vg.error.message,240)});continue}
    }
    const currentProduct=await one(item.product_id);
    if(!currentProduct){applied.push({result_id:rid,ok:false,error:"product_not_found"});continue}
    if(String(currentProduct.gondola||"")!==String(gondola)){
      const loc=await db.from("products").update({gondola:String(gondola),shelf:null,updated_at:new Date().toISOString()}).eq("id",item.product_id);
      if(loc.error){applied.push({result_id:rid,ok:false,error:tx(loc.error.message,240)});continue}
    }

    let countId=previousCountId;''',
    "edge location update",
)

edge = must_replace(
    edge,
    '''        confirmed_quantity:quantity,confirmed_by:auth.user_id,confirmed_at:new Date().toISOString(),''',
    '''        confirmed_quantity:quantity,confirmed_gondola:gondola,confirmed_by:auth.user_id,confirmed_at:new Date().toISOString(),''',
    "edge confirmed gondola",
)

edge = must_replace(
    edge,
    '''applied.push({result_id:rid,ok:true,quantity,stock_count_id:countId,bling_job_id:previousJobId,reused:true});''',
    '''applied.push({result_id:rid,ok:true,quantity,gondola,confirmed_gondola:gondola,stock_count_id:countId,bling_job_id:previousJobId,reused:true});''',
    "edge reused response",
)
edge = must_replace(
    edge,
    '''applied.push({result_id:rid,ok:true,quantity,stock_count_id:countId,queued:true});''',
    '''applied.push({result_id:rid,ok:true,quantity,gondola,confirmed_gondola:gondola,stock_count_id:countId,queued:true});''',
    "edge queued response",
)
edge = must_replace(
    edge,
    '''applied.push({result_id:rid,ok:true,quantity,stock_count_id:countId,queued:false});''',
    '''applied.push({result_id:rid,ok:true,quantity,gondola,confirmed_gondola:gondola,stock_count_id:countId,queued:false});''',
    "edge local response",
)
edge = must_replace(
    edge,
    '''select("id,review_state,confirmed_quantity,stock_count_id,bling_job_id,apply_error")''',
    '''select("id,review_state,confirmed_quantity,confirmed_gondola,stock_count_id,bling_job_id,apply_error")''',
    "edge final select",
)
edge = must_replace(edge, 'version:49,legacy_proxy:false', 'version:50,legacy_proxy:false', "edge health version")

# Basic guards
checks = {
    "front_25_grid": "grid-template-rows:repeat(5" in front,
    "front_two_fields": "write-field" in front and "data-sheet-gondola" in front,
    "front_no_validity_card": "product-validity" not in front[front.index("function inventoryPrintCard"):front.index("function inventoryPrintSelectedFilters")],
    "edge_25": "INVENTORY_SHEET_CARDS_PER_PAGE=25" in edge and "maxItems:25" in edge and "maximum:25" in edge,
    "edge_gondola": "ai_gondola" in edge and "confirmed_gondola" in edge,
    "edge_new_prompt": "O card NÃO mostra validade" in edge,
}
bad = [k for k,v in checks.items() if not v]
if bad:
    raise RuntimeError("verification failed: " + ", ".join(bad))

front_path.write_text(front, encoding="utf-8")
edge_path.write_text(edge, encoding="utf-8")
print("patched", front_path, len(front), edge_path, len(edge))
