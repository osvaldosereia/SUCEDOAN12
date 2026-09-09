import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
src=ROOT/'whatsapp'/'flows'/'flow-cestas-comercial-v25.json'
dst=ROOT/'whatsapp'/'flows'/'flow-cestas-comercial-v26.json'
flow=json.loads(src.read_text(encoding='utf-8'))

# V26 keeps the proven basket and checkout screens, but removes intermediate
# product-detail/term/upsell screens. Extras are 3 visual products per screen,
# with quantity directly below each product.
keep={'CESTAS','PERSONALIZAR_A','REVISAO','CLIENTE_EXISTENTE','CLIENTE_NOVO','FINALIZAR'}
base={s['id']:s for s in flow['screens'] if s['id'] in keep}

personal=base['PERSONALIZAR_A']
for child in personal.get('layout',{}).get('children',[]):
    if child.get('type')=='Image' and child.get('src')=='${data.basket_image_base64}':
        child['visible']='${data.has_basket_image}'
if 'basket_note' in personal.get('data',{}):
    personal['data']['basket_note']['__example__']='A quantidade já vem selecionada. Máximo de 6 unidades e sempre respeitando o estoque.'
for key,value in personal.get('data',{}).items():
    if key.startswith('q') and key.endswith('_options') and isinstance(value,dict) and isinstance(value.get('__example__'),list):
        value['__example__']=[
            {'id':'0','title':'0 · Retirar'},
            {'id':'1','title':'1 unidade'},
            {'id':'2','title':'2 unidades'},
        ]

choice_schema={
    'type':'array',
    'items':{'type':'object','properties':{'id':{'type':'string'},'title':{'type':'string'}}},
    '__example__':[
        {'id':'mercearia','title':'Mercearia'},
        {'id':'limpeza','title':'Limpeza e lavanderia'},
        {'id':'higiene','title':'Higiene e beleza'},
        {'id':'buscar','title':'Buscar pelo nome'},
        {'id':'revisar','title':'Revisar pedido'},
    ],
}
option_schema={
    'type':'array',
    'items':{'type':'object','properties':{'id':{'type':'string'},'title':{'type':'string'}}},
    '__example__':[
        {'id':'0','title':'0 · Não adicionar'},
        {'id':'1','title':'1 unidade'},
        {'id':'2','title':'2 unidades'},
    ],
}
action_schema={
    'type':'array',
    'items':{'type':'object','properties':{'id':{'type':'string'},'title':{'type':'string'}}},
    '__example__':[
        {'id':'mais','title':'Ver mais produtos'},
        {'id':'buscar','title':'Outra categoria ou busca'},
        {'id':'revisar','title':'Revisar pedido'},
    ],
}

def section_screen(suffix:str):
    return {
        'id':f'SECOES_{suffix}',
        'title':'Adicionar produtos',
        'data':{
            'message':{'type':'string','__example__':'Escolha uma categoria ou busque pelo nome.'},
            'cart_total':{'type':'string','__example__':'Total atual: R$ 180,00'},
            'choices':choice_schema,
        },
        'layout':{
            'type':'SingleColumnLayout',
            'children':[
                {'type':'TextHeading','text':'Adicionar mais produtos'},
                {'type':'TextSubheading','text':'${data.cart_total}'},
                {'type':'TextBody','text':'${data.message}'},
                {
                    'type':'RadioButtonsGroup','name':'choice','label':'O que deseja ver?',
                    'data-source':'${data.choices}','required':True,
                },
                {
                    'type':'TextInput','name':'direct_query','label':'Nome do produto (opcional)',
                    'required':False,'helper-text':'Preencha somente se escolher Buscar pelo nome.',
                },
                {
                    'type':'Footer','label':'Continuar',
                    'on-click-action':{
                        'name':'data_exchange',
                        'payload':{
                            'trigger':'simple_extras_continue_v1',
                            'choice':'${form.choice}',
                            'direct_query':'${form.direct_query}',
                        },
                    },
                },
            ],
        },
    }


def product_data():
    data={
        'query_title':{'type':'string','__example__':'Limpeza e lavanderia'},
        'result_note':{'type':'string','__example__':'Escolha a quantidade. Mostrando 3 de 12'},
        'cart_total':{'type':'string','__example__':'Total atual: R$ 180,00'},
        'next_actions':action_schema,
    }
    for i in range(1,4):
        p=f'p{i}'
        data[f'{p}_visible']={'type':'boolean','__example__':True}
        data[f'{p}_id']={'type':'string','__example__':'00000000-0000-0000-0000-000000000000'}
        data[f'{p}_name']={'type':'string','__example__':f'Produto {i}'}
        data[f'{p}_price']={'type':'string','__example__':'R$ 9,90'}
        data[f'{p}_description']={'type':'string','__example__':'Marca · embalagem'}
        data[f'{p}_image_base64']={'type':'string','__example__':'iVBORw0KGgoAAA...'}
        data[f'{p}_has_image']={'type':'boolean','__example__':True}
        data[f'q{i}_options']=option_schema
    return data


def product_screen(suffix:str):
    children=[
        {'type':'TextHeading','text':'${data.query_title}'},
        {'type':'TextSubheading','text':'${data.cart_total}'},
        {'type':'TextBody','text':'${data.result_note}'},
    ]
    for i in range(1,4):
        p=f'p{i}'
        children.extend([
            {
                'type':'Image','src':f'${{data.{p}_image_base64}}','scale-type':'contain',
                'aspect-ratio':1,'alt-text':f'${{data.{p}_name}}','visible':f'${{data.{p}_has_image}}',
            },
            {'type':'TextSubheading','text':f'${{data.{p}_name}}','visible':f'${{data.{p}_visible}}'},
            {'type':'TextBody','text':f'${{data.{p}_price}}','visible':f'${{data.{p}_visible}}'},
            {'type':'TextCaption','text':f'${{data.{p}_description}}','visible':f'${{data.{p}_visible}}'},
            {
                'type':'Dropdown','name':f'q{i}','label':'Quantidade',
                'data-source':f'${{data.q{i}_options}}','required':False,
                'visible':f'${{data.{p}_visible}}',
            },
        ])
    payload={
        'trigger':'simple_products_continue_v1',
        'q1':'${form.q1}','q2':'${form.q2}','q3':'${form.q3}',
    }
    if suffix in ('A','B'):
        children.append({
            'type':'RadioButtonsGroup','name':'next_action','label':'Depois disso',
            'data-source':'${data.next_actions}','required':True,
        })
        payload['next_action']='${form.next_action}'
        footer='Continuar'
    else:
        payload['next_action']='revisar'
        footer='Revisar pedido'
    children.append({'type':'Footer','label':footer,'on-click-action':{'name':'data_exchange','payload':payload}})
    return {
        'id':f'PRODUTOS_{suffix}',
        'title':'Adicionar produtos',
        'data':product_data(),
        'layout':{'type':'SingleColumnLayout','children':children},
    }

screens=[
    base['CESTAS'],
    personal,
    section_screen('A'),
    product_screen('A'),
    section_screen('B'),
    product_screen('B'),
    section_screen('C'),
    product_screen('C'),
    base['REVISAO'],
    base['CLIENTE_EXISTENTE'],
    base['CLIENTE_NOVO'],
    base['FINALIZAR'],
]
flow['screens']=screens
flow['routing_model']={
    'CESTAS':['PERSONALIZAR_A'],
    'PERSONALIZAR_A':['SECOES_A'],
    'SECOES_A':['PRODUTOS_A','REVISAO'],
    'PRODUTOS_A':['PRODUTOS_B','SECOES_B','REVISAO'],
    'SECOES_B':['PRODUTOS_B','REVISAO'],
    'PRODUTOS_B':['PRODUTOS_C','SECOES_C','REVISAO'],
    'SECOES_C':['PRODUTOS_C','REVISAO'],
    'PRODUTOS_C':['REVISAO'],
    'REVISAO':['CLIENTE_EXISTENTE','CLIENTE_NOVO'],
    'CLIENTE_EXISTENTE':['FINALIZAR'],
    'CLIENTE_NOVO':['FINALIZAR'],
    'FINALIZAR':[],
}

assert flow['version']=='7.3'
assert flow['data_api_version']=='3.0'
assert len(flow['screens'])==12
assert not any(s['id'].startswith('PRODUTO_') for s in flow['screens'])
assert not any(s['id'].startswith('TERMOS_') for s in flow['screens'])
assert not any(s['id']=='UPSELL' for s in flow['screens'])
for suffix in 'ABC':
    s=next(x for x in flow['screens'] if x['id']==f'PRODUTOS_{suffix}')
    assert sum(1 for c in s['layout']['children'] if c.get('type')=='Image')==3
    assert sum(1 for c in s['layout']['children'] if c.get('type')=='Dropdown')==3
    assert len(s['layout']['children'])<=25
for suffix in 'ABC':
    s=next(x for x in flow['screens'] if x['id']==f'SECOES_{suffix}')
    assert sum(1 for c in s['layout']['children'] if c.get('type')=='Footer')==1

allowed={'version','data_api_version','routing_model','screens'}
assert set(flow).issubset(allowed),set(flow)-allowed

dst.write_text(json.dumps(flow,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(dst)
print('screens',len(flow['screens']))
print('V26: direct quantity on 3 visual products; no term/detail/upsell screens')
