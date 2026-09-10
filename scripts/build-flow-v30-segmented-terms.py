import json
from copy import deepcopy
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
src=ROOT/'whatsapp'/'flows'/'flow-cestas-comercial-v28.json'
dst=ROOT/'whatsapp'/'flows'/'flow-cestas-comercial-v30.json'
flow=json.loads(src.read_text(encoding='utf-8'))
rounds=list('ABCDEFGHIJKL')
base={s['id']:deepcopy(s) for s in flow['screens']}

nav_item_schema={
 'type':'object','properties':{
  'id':{'type':'string'},
  'main-content':{'type':'object','properties':{'title':{'type':'string'},'description':{'type':'string'},'metadata':{'type':'string'}}},
  'on-click-action':{'type':'object','properties':{'name':{'type':'string'},'payload':{'type':'object','properties':{'trigger':{'type':'string'},'term_key':{'type':'string'},'search_query':{'type':'string'}}}}}
 }
}

def terms_screen(r):
 return {
  'id':f'TERMOS_{r}','title':'Escolha o tipo',
  'data':{
   'section_title':{'type':'string','__example__':'Higiene e beleza'},
   'message':{'type':'string','__example__':'Escolha o tipo de produto que procura.'},
   'term_items':{'type':'array','items':nav_item_schema,'__example__':[
    {'id':'sabonete','main-content':{'title':'Sabonete','metadata':'Ver produtos disponíveis'},'on-click-action':{'name':'data_exchange','payload':{'trigger':'nav_term_open_v1','term_key':'sabonete','search_query':'sabonete'}}}
   ]}
  },
  'layout':{'type':'SingleColumnLayout','children':[
   {'type':'TextHeading','text':'${data.section_title}'},
   {'type':'TextBody','text':'${data.message}'},
   {'type':'NavigationList','name':f'terms_{r.lower()}','list-items':'${data.term_items}'}
  ]}
 }

screens=[]
for s in flow['screens']:
 screens.append(s)
 if s['id'].startswith('MENU_'):
  r=s['id'][-1]
  screens.append(terms_screen(r))
flow['screens']=screens

routing=deepcopy(flow['routing_model'])
for r in rounds:
 menu=f'MENU_{r}'
 old=routing.get(menu,[])
 # category selection goes to TERMOS; direct search remains BUSCA; review unchanged.
 routing[menu]=[f'TERMOS_{r}',f'BUSCA_{r}','REVISAO']
 routing[f'TERMOS_{r}']=[f'PRODUTOS_{r}']
flow['routing_model']=routing

# Structural guardrails.
ids=[s['id'] for s in flow['screens']]
assert len(ids)==len(set(ids)), 'duplicate screen id'
for src_id,targets in routing.items():
 assert src_id in ids, f'missing route source {src_id}'
 for target in targets:
  assert target in ids, f'missing route target {target}'
assert len([x for x in ids if x.startswith('TERMOS_')])==12

dst.write_text(json.dumps(flow,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'wrote {dst} with {len(flow["screens"])} screens')
