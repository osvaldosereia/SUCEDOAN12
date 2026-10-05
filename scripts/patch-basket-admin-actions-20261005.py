from pathlib import Path
import re

p=Path('vitrine/admin/index.html')
s=p.read_text()


def replace_once(old,new,label):
    global s
    n=s.count(old)
    if n!=1:
        raise SystemExit(f'{label}: expected 1 occurrence, got {n}')
    s=s.replace(old,new,1)

# 1. Remover botão legado de sugestões: famílias continuam usadas pelo editor guiado,
# mas não devem chamar RPC protegida diretamente do browser.
replace_once(
    '<button class="secondary" id="basketProductSuggestions" type="button">Sugestões de produtos</button>',
    '',
    'remove legacy suggestions button'
)
replace_once(
    "$('#refreshBaskets').onclick=renderBaskets;$('#basketProductSuggestions').onclick=openBasketSubstitutionCatalog;$('#basketCommercialCreate').onclick=openBasketCommercialCreate;",
    "$('#refreshBaskets').onclick=renderBaskets;$('#basketCommercialCreate').onclick=openBasketCommercialCreate;",
    'remove legacy suggestions binding'
)

# 2. Imprimir direto do card sem navegar para o detalhe e sempre passar o UUID do lote.
old_print="host.querySelectorAll('[data-commercial-print]').forEach(b=>b.onclick=async()=>{const m=find(b.dataset.commercialPrint);if(!m?.editor_kit_template_id)return;await openBasketKitAdmin(m.editor_kit_template_id);const lot=(state.basketKitDetail?.lots||[]).find(x=>String(x.id)===String(m.operational_lot_id));if(lot)printBasketKitLot(lot)});"
new_print="host.querySelectorAll('[data-commercial-print]').forEach(b=>b.onclick=async()=>{const m=find(b.dataset.commercialPrint);if(!m?.editor_kit_template_id||!m?.operational_lot_id)return;try{const data=await api('basket_kit_admin',{id:m.editor_kit_template_id});state.basketKitDetail=data;printBasketKitLot(m.operational_lot_id)}catch(e){toast('Não consegui preparar a impressão deste lote.')}});"
replace_once(old_print,new_print,'commercial card print')

# 3. Excluir modelo comercial completo, e não apenas o kit interno.
pattern=r"  async function archiveBasketKitTemplate\(\)\{[\s\S]*?\n  \}\n  function basketKitDraftCapacityFromItems"
replacement="""  async function archiveBasketKitTemplate(){
    const d=state.basketKitDetail,op=requireOperator();if(!d||!op)return;
    const basketId=d.kit?.basket?.id||d.kit?.basket_id||null;
    if(!confirm('Excluir este modelo? O histórico será preservado. Lotes em edição ou com unidades disponíveis precisam ser encerrados antes.'))return;
    try{
      if(basketId){
        await api('basket_archive',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({basket_id:basketId,operator:op})});
      }else{
        await api('basket_kit_template_archive',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kit_template_id:d.kit.id,operator:op})});
      }
      toast('Modelo excluído');await renderBaskets();
    }catch(e){
      const code=String(e?.message||'');
      toast(code==='basket_has_live_lots'||code==='kit_template_has_live_lots'?'Há lote em edição ou com unidades disponíveis. Cancele/finalize esses lotes antes de excluir o modelo.':'Não consegui excluir o modelo.');
    }
  }
  function basketKitDraftCapacityFromItems"""
s,n=re.subn(pattern,replacement,s,count=1)
if n!=1:
    raise SystemExit(f'commercial model archive: expected 1 function, got {n}')

p.write_text(s)
print('basket admin actions patch applied')
