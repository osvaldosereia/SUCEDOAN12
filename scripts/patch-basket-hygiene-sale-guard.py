from pathlib import Path

ADMIN=Path('vitrine/admin/index.html')
API=Path('supabase/functions/admin-products-live-v1/index.ts')

def once(text,old,new,label):
    c=text.count(old)
    if c!=1: raise SystemExit(f'{label}: expected 1 anchor, found {c}')
    return text.replace(old,new,1)

admin=ADMIN.read_text()
old="""    }catch(e){
      toast(String(e?.message||'')==='lot_not_available_for_sale'?'Este lote não está disponível para ativação.':'Não consegui alterar o lote.');
    }
  }
  async function openBasketKitAdmin(id){
"""
new="""    }catch(e){
      const code=String(e?.message||'');
      toast(code==='linked_hygiene_lot_required'?'Vincule um lote de Limpeza/Higiene antes de ativar esta cesta no site.':code==='linked_hygiene_lot_unavailable'?'O lote de Limpeza/Higiene vinculado não está mais montado/disponível. Escolha outro lote.':code==='lot_not_available_for_sale'?'Este lote não está disponível para ativação.':'Não consegui alterar o lote.');
    }
  }
  async function openBasketKitAdmin(id){
"""
admin=once(admin,old,new,'admin sale toggle error')
ADMIN.write_text(admin)

api=API.read_text()
old='''    const code=m.includes("lot_not_available_for_sale")?"lot_not_available_for_sale":m.includes("lot_not_found")?"lot_not_found":"lot_sale_toggle_failed";
'''
new='''    const code=m.includes("linked_hygiene_lot_required")?"linked_hygiene_lot_required":m.includes("linked_hygiene_lot_unavailable")?"linked_hygiene_lot_unavailable":m.includes("lot_not_available_for_sale")?"lot_not_available_for_sale":m.includes("lot_not_found")?"lot_not_found":"lot_sale_toggle_failed";
'''
api=once(api,old,new,'api sale toggle error')
API.write_text(api)
print('hygiene sale guard patch applied')