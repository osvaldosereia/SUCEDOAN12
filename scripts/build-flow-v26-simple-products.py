import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
src=ROOT/'whatsapp'/'flows'/'flow-cestas-comercial-v25.json'
dst=ROOT/'whatsapp'/'flows'/'flow-cestas-comercial-v26.json'
flow=json.loads(src.read_text(encoding='utf-8'))

# Runtime now returns clean unit labels. Keep examples aligned so Meta preview never shows "atual".
for screen in flow['screens']:
    data=screen.get('data',{})
    for key,value in data.items():
        if key.startswith('q') and key.endswith('_options') and isinstance(value,dict) and isinstance(value.get('__example__'),list):
            value['__example__']=[
                {'id':'0','title':'0 · Retirar'},
                {'id':'1','title':'1 unidade'},
                {'id':'2','title':'2 unidades'},
            ]

for screen in flow['screens']:
    sid=screen['id']
    children=screen.get('layout',{}).get('children',[])

    if sid=='PERSONALIZAR_A':
        for child in children:
            if child.get('type')=='Image' and child.get('src')=='${data.basket_image_base64}':
                child['visible']='${data.has_basket_image}'
        if 'basket_note' in screen.get('data',{}):
            screen['data']['basket_note']['__example__']='A quantidade já vem selecionada. Máximo de 6 unidades e sempre respeitando o estoque.'

    if sid.startswith('SECOES_'):
        # Put the current total before choices. Remove the small caption at the bottom.
        total=None
        for child in list(children):
            if child.get('text')=='${data.cart_total}':
                total=child
                children.remove(child)
                break
        if total:
            total['type']='TextSubheading'
            insert_at=1 if children and children[0].get('type')=='TextHeading' else 0
            children.insert(insert_at,total)
        for child in children:
            if child.get('type')!='Form':
                continue
            for field in child.get('children',[]):
                if field.get('name')=='extras_action': field['label']='O que deseja fazer?'
                if field.get('name')=='section_keys': field['label']='Categorias'
                if field.get('name')=='direct_query': field['label']='Buscar produto'
                if field.get('type')=='Footer': field['label']='Continuar'

    if sid.startswith('TERMOS_'):
        for child in children:
            if child.get('type')=='TextBody':
                child['text']='Escolha o tipo de produto.'

    if sid.startswith('PRODUTOS_'):
        for child in children:
            if child.get('type')!='Form': continue
            for field in child.get('children',[]):
                if field.get('name')=='product_id':
                    field['label']='Escolha um produto ou continue'
                if field.get('type')=='Footer':
                    field['label']='Continuar'
        # Candidate handler V11 can return the same page for "Ver mais", or leave it for categories/upsell.
        suffix=sid.rsplit('_',1)[1]
        targets=[sid,f'PRODUTO_{suffix}',f'SECOES_{suffix}','UPSELL']
        flow['routing_model'][sid]=targets

    if sid.startswith('PRODUTO_'):
        for child in children:
            if child.get('type')=='Image' and child.get('src')=='${data.product_image_base64}':
                child['visible']='${data.has_product_image}'
            if child.get('type')!='Form': continue
            for field in child.get('children',[]):
                if field.get('name')=='quantity' and field.get('type')=='RadioButtonsGroup':
                    field['type']='Dropdown'
                    field['label']='Quantidade'

# Defensive static constraints.
assert flow['version']=='7.3'
assert flow['data_api_version']=='3.0'
assert any(s['id']=='PERSONALIZAR_A' for s in flow['screens'])
for sid in ('PRODUTOS_A','PRODUTOS_B','PRODUTOS_C'):
    assert sid in flow['routing_model'][sid], f'{sid} must allow same-screen dynamic paging'

# Keep only known Flow JSON top-level keys.
allowed={'version','data_api_version','routing_model','screens'}
assert set(flow).issubset(allowed), set(flow)-allowed

dst.write_text(json.dumps(flow,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(dst)
print('screens',len(flow['screens']))
