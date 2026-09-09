#!/usr/bin/env python3
import copy
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'whatsapp/flows/flow-cestas-comercial-v6.json'
flow=json.loads(p.read_text(encoding='utf-8'))

# Meta screen IDs accept only letters and underscores: translate unrolled numeric rounds.
raw=json.dumps(flow,ensure_ascii=False)
for old,new in (('_1','_A'),('_2','_B'),('_3','_C')):
    raw=raw.replace(old,new)
flow=json.loads(raw)

screens=[]
client=next(s for s in flow['screens'] if s['id']=='CLIENTE')
data=client['data']

payment={'type':'Dropdown','label':'Forma de pagamento','name':'payment_method','data-source':'${data.payment_options}','required':True}
notes={'type':'TextArea','label':'Observação (opcional)','name':'notes','required':False}
known_footer={'type':'Footer','label':'Confirmar pedido','on-click-action':{'name':'data_exchange','payload':{'trigger':'checkout_confirm','payment_method':'${form.payment_method}','notes':'${form.notes}'}}}
known={
  'id':'CLIENTE_EXISTENTE','title':'Entrega e pagamento','data':copy.deepcopy(data),
  'layout':{'type':'SingleColumnLayout','children':[
    {'type':'TextHeading','text':'Entrega e pagamento'},
    {'type':'TextBody','text':'${data.customer_name}'},
    {'type':'TextBody','text':'Entrega: ${data.address_summary}'},
    {'type':'TextCaption','text':'Se estiver correto, escolha apenas como deseja pagar na entrega.'},
    {'type':'Form','name':'known_customer_form','children':[copy.deepcopy(payment),copy.deepcopy(notes),known_footer]}
  ]}
}
fields=[('Nome','name',True),('Rua','street',True),('Número','number',True),('Complemento','complement',False),('Bairro','neighborhood',True),('Cidade','city',True),('Referência','locator',False)]
new_children=[{'type':'TextInput','label':label,'name':name,'required':required} for label,name,required in fields]
new_children += [copy.deepcopy(payment),copy.deepcopy(notes),{
  'type':'Footer','label':'Confirmar pedido','on-click-action':{'name':'data_exchange','payload':{
    'trigger':'checkout_confirm','name':'${form.name}','street':'${form.street}','number':'${form.number}',
    'complement':'${form.complement}','neighborhood':'${form.neighborhood}','city':'${form.city}',
    'locator':'${form.locator}','payment_method':'${form.payment_method}','notes':'${form.notes}'
  }}
}]
new={
  'id':'CLIENTE_NOVO','title':'Entrega e pagamento','data':copy.deepcopy(data),
  'layout':{'type':'SingleColumnLayout','children':[
    {'type':'TextHeading','text':'Onde vamos entregar?'},
    {'type':'TextBody','text':'Preencha somente os dados necessários para a entrega.'},
    {'type':'TextBody','text':'${data.error_text}'},
    {'type':'Form','name':'new_customer_form','children':new_children}
  ]}
}

for s in flow['screens']:
    if s['id']=='CLIENTE': screens.extend([known,new])
    else: screens.append(s)
flow['screens']=screens
flow['routing_model'].pop('CLIENTE',None)
flow['routing_model']['REVISAO']=['CLIENTE_EXISTENTE','CLIENTE_NOVO']
flow['routing_model']['CLIENTE_EXISTENTE']=['FINALIZAR']
flow['routing_model']['CLIENTE_NOVO']=['FINALIZAR']

p.write_text(json.dumps(flow,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
ids=[s['id'] for s in flow['screens']]
assert all(x.replace('_','').isalpha() for x in ids), ids
assert not any(s.get('layout',{}).__str__().find("'type': 'If'")>=0 for s in flow['screens'])
print('Meta normalization OK:',len(ids),'screens')
