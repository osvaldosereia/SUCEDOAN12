from pathlib import Path

SITE_PATHS=[Path('index.html'),Path('vitrine/index.html')]
ADMIN=Path('vitrine/admin/index.html')

old_brands="""    const CAMPAIGN_BRANDS={
      'nivea':{signal:'NIVEA',label:'NIVEA'},
      'elseve':{signal:'ELSEVE',label:'Elseve'},
      'seda':{signal:'SEDA',label:'Seda'},
      'monange':{signal:'MONANGE',label:'Monange'},
      'lola-cosmetics':{signal:'LOLA',label:'Lola Cosmetics'},
      'skala':{signal:'SKALA',label:'Skala'},
      'dove':{signal:'DOVE',label:'Dove'},
      'omo':{signal:'OMO',label:'OMO'},
      'ype':{signal:'YPE',label:'Ypê'},
      'downy':{signal:'DOWNY',label:'Downy'}
    };"""
new_brands="""    const CAMPAIGN_BRANDS={
      'nivea':{signal:'NIVEA',label:'NIVEA'},
      'elseve':{signal:'ELSEVE',label:'Elseve'}
    };"""
old_priority="    const MARKETING_CTA_PRIORITY=['BEBE','PET','CABELOS','BELEZA','LAVANDERIA','LIMPEZA','DOCES_LANCHES','HIGIENE','CASA'];"
new_priority="    const MARKETING_CTA_PRIORITY=['BEBE','CABELOS','BELEZA','LIMPEZA','LAVANDERIA','PET'];"
old_lines="lines.push('','INTERESSES_MKT: '+(marketingSignals.interests.length?marketingSignals.interests.join(' | '):'NENHUM'),'MARCAS_MKT: '+(marketingSignals.brands.length?marketingSignals.brands.join(' | '):'NENHUMA'),'OFERTAS_WHATSAPP: '+(marketingSignals.optIn?'SIM':'NAO'),'CTA_POS_PEDIDO: '+marketingSignals.cta);"
new_lines="lines.push('','OFERTAS_WHATSAPP: '+(marketingSignals.optIn?'SIM':'NAO'));for(const interest of marketingSignals.interests)lines.push('INTERESSES_MKT: '+interest);for(const brand of marketingSignals.brands)lines.push('MARCAS_MKT: '+brand);lines.push('CTA_POS_PEDIDO: '+marketingSignals.cta);"

for path in SITE_PATHS:
    s=path.read_text(encoding='utf-8')
    for old,new,label in [(old_brands,new_brands,'brands'),(old_priority,new_priority,'priority'),(old_lines,new_lines,'signal lines')]:
        if old not in s:
            raise SystemExit(f'{path}: missing {label} anchor')
        s=s.replace(old,new,1)
    path.write_text(s,encoding='utf-8')
    print(f'{path}: aligned')

s=ADMIN.read_text(encoding='utf-8')
old_admin_brands="  const MARKETING_BRANDS=[{key:'nivea',label:'NIVEA'},{key:'elseve',label:'Elseve'},{key:'seda',label:'Seda'},{key:'monange',label:'Monange'},{key:'lola-cosmetics',label:'Lola Cosmetics'},{key:'skala',label:'Skala'},{key:'dove',label:'Dove'},{key:'omo',label:'OMO'},{key:'ype',label:'Ypê'},{key:'downy',label:'Downy'}];"
new_admin_brands="  const MARKETING_BRANDS=[{key:'nivea',label:'NIVEA'},{key:'elseve',label:'Elseve'}];"
old_admin_priority="Bebê → Pet → Cabelos → Beleza → Lavanderia → Limpeza → Doces/Lanches → Higiene → Casa → Ofertas para cesta."
new_admin_priority="Bebê → Cabelos → Beleza → Limpeza → Lavanderia → Pet → Ofertas para cesta."
for old,new,label in [(old_admin_brands,new_admin_brands,'admin brands'),(old_admin_priority,new_admin_priority,'admin CTA priority')]:
    if old not in s:
        raise SystemExit(f'admin: missing {label} anchor')
    s=s.replace(old,new,1)
ADMIN.write_text(s,encoding='utf-8')
print('admin aligned')
