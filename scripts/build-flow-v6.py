#!/usr/bin/env python3
import json
from pathlib import Path
import copy

ROOT=Path(__file__).resolve().parents[1]
src=ROOT/"whatsapp/flows/flow-cestas-comercial-v5.json"
dst=ROOT/"whatsapp/flows/flow-cestas-comercial-v6.json"
flow=json.loads(src.read_text(encoding="utf-8"))
by={s["id"]:s for s in flow["screens"]}

def props_media(data,key):
    props=data[key]["items"]["properties"]
    props["image"]={"type":"string"}
    props["alt-text"]={"type":"string"}
    for x in data[key].get("__example__",[]):
        x.setdefault("image","iVBORw0KGgoAAA...")
        x.setdefault("alt-text",x.get("title","Produto"))

c=by["CESTAS"]
props_media(c["data"],"baskets")
form=c["layout"]["children"][2]
form["children"][0]={"type":"RadioButtonsGroup","label":"Escolha sua cesta","name":"basket_id","data-source":"${data.baskets}","required":True,"media-size":"large"}
form["children"][1]["label"]="Ver e personalizar"

p0=by["PERSONALIZAR"]
p0["data"]["basket_image_base64"]={"type":"string","__example__":"iVBORw0KGgoAAA..."}
p0["data"]["has_basket_image"]={"type":"boolean","__example__":True}
props_media(p0["data"],"items")
kids=p0["layout"]["children"]
kids.insert(0,{"type":"Image","src":"${data.basket_image_base64}","scale-type":"contain","aspect-ratio":1,"alt-text":"${data.basket_name}"})
form=next(x for x in kids if x.get("type")=="Form")
form["children"][0]={"type":"RadioButtonsGroup","label":"O que deseja fazer?","name":"customize_action","data-source":"${data.actions}","required":True}
form["children"][1]={"type":"RadioButtonsGroup","label":"Item para alterar (só se quiser personalizar)","name":"product_id","data-source":"${data.items}","required":False,"media-size":"regular"}
p_rounds=[]
a_rounds=[]
for r in (1,2,3):
    p=copy.deepcopy(p0); p["id"]=f"PERSONALIZAR_{r}"; p["title"]="Sua cesta"; p["layout"]["children"][-1]["name"]=f"customize_form_{r}"; p_rounds.append(p)
    a=copy.deepcopy(by["AJUSTAR_ITEM"]); a["id"]=f"AJUSTAR_ITEM_{r}"; a["title"]="Quantidade do item"
    af=next(x for x in a["layout"]["children"] if x.get("type")=="Form"); af["name"]=f"adjust_form_{r}"
    af["children"][0]={"type":"RadioButtonsGroup","label":"Nova quantidade","name":"quantity","data-source":"${data.allowed_quantities}","required":True}
    a_rounds.append(a)

for r in (1,2,3):
    s=by[f"SECOES_{r}"]; f=next(x for x in s["layout"]["children"] if x.get("type")=="Form")
    f["children"][0]={"type":"RadioButtonsGroup","label":"Escolha uma opção","name":"extras_action","data-source":"${data.extras_actions}","required":True}
    f["children"][1]={"type":"CheckboxGroup","label":"Categorias (até 3)","name":"section_keys","data-source":"${data.sections}","required":False,"max-selected-items":3}
    f["children"][-1]["on-click-action"]["payload"]={"trigger":"extras_continue_v2","extras_action":"${form.extras_action}","section_keys":"${form.section_keys}","direct_query":"${form.direct_query}","round":str(r)}
    t=by[f"TERMOS_{r}"]; tf=next(x for x in t["layout"]["children"] if x.get("type")=="Form")
    tf["children"][0]={"type":"RadioButtonsGroup","label":"O que você procura?","name":"term_id","data-source":"${data.terms}","required":True}
    tf["children"][1]["on-click-action"]["payload"]={"trigger":"term_selected_v2","term_id":"${form.term_id}","round":str(r)}
    pr=by[f"PRODUTOS_{r}"]; props_media(pr["data"],"products"); pf=next(x for x in pr["layout"]["children"] if x.get("type")=="Form")
    pf["children"][0]={"type":"RadioButtonsGroup","label":"Produtos","name":"product_id","data-source":"${data.products}","required":True,"media-size":"regular"}
    pd=by[f"PRODUTO_{r}"]; qf=next(x for x in pd["layout"]["children"] if x.get("type")=="Form")
    qf["children"][0]={"type":"RadioButtonsGroup","label":"Quantidade","name":"quantity","data-source":"${data.quantities}","required":True}
    pd["data"]["has_product_image"]={"type":"boolean","__example__":True}

u=by["UPSELL"]; props_media(u["data"],"products"); uf=next(x for x in u["layout"]["children"] if x.get("type")=="Form")
uf["children"][0]={"type":"RadioButtonsGroup","label":"Sugestão opcional","name":"product_id","data-source":"${data.products}","required":False,"media-size":"regular"}

cl=by["CLIENTE"]
cl["data"].update({"name_value":{"type":"string","__example__":""},"street_value":{"type":"string","__example__":""},"number_value":{"type":"string","__example__":""},"complement_value":{"type":"string","__example__":""},"neighborhood_value":{"type":"string","__example__":""},"city_value":{"type":"string","__example__":"Cuiabá"},"locator_value":{"type":"string","__example__":""}})
pay={"type":"Dropdown","label":"Forma de pagamento","name":"payment_method","data-source":"${data.payment_options}","required":True}
known={"type":"Form","name":"known_customer_form","children":[pay,{"type":"TextArea","label":"Observação (opcional)","name":"notes","required":False},{"type":"Footer","label":"Confirmar pedido","on-click-action":{"name":"data_exchange","payload":{"trigger":"checkout_confirm","payment_method":"${form.payment_method}","notes":"${form.notes}"}}}]}
fields=[("Nome","name",True),("Rua","street",True),("Número","number",True),("Complemento","complement",False),("Bairro","neighborhood",True),("Cidade","city",True),("Referência","locator",False)]
newkids=[{"type":"TextInput","label":lab,"name":name,"required":req} for lab,name,req in fields]+[pay,{"type":"TextArea","label":"Observação (opcional)","name":"notes","required":False},{"type":"Footer","label":"Confirmar pedido","on-click-action":{"name":"data_exchange","payload":{"trigger":"checkout_confirm","name":"${form.name}","street":"${form.street}","number":"${form.number}","complement":"${form.complement}","neighborhood":"${form.neighborhood}","city":"${form.city}","locator":"${form.locator}","payment_method":"${form.payment_method}","notes":"${form.notes}"}}}]
cl["layout"]["children"]=[{"type":"TextHeading","text":"Entrega e pagamento"},{"type":"TextBody","text":"${data.error_text}"},{"type":"If","condition":"${data.customer_registered}","then":[{"type":"TextBody","text":"Já encontramos seus dados: ${data.customer_name}"},{"type":"TextBody","text":"Entrega: ${data.address_summary}"},known],"else":[{"type":"TextBody","text":"Preencha somente os dados necessários para a entrega."},{"type":"Form","name":"new_customer_form","children":newkids}]}]

new=[]
for s in flow["screens"]:
    if s["id"]=="PERSONALIZAR": new.extend([p_rounds[0],a_rounds[0],p_rounds[1],a_rounds[1],p_rounds[2],a_rounds[2]])
    elif s["id"]=="AJUSTAR_ITEM": continue
    else: new.append(s)
flow["screens"]=new
flow["routing_model"]={"CESTAS":["PERSONALIZAR_1"],"PERSONALIZAR_1":["AJUSTAR_ITEM_1","SECOES_1"],"AJUSTAR_ITEM_1":["PERSONALIZAR_2","SECOES_1"],"PERSONALIZAR_2":["AJUSTAR_ITEM_2","SECOES_1"],"AJUSTAR_ITEM_2":["PERSONALIZAR_3","SECOES_1"],"PERSONALIZAR_3":["AJUSTAR_ITEM_3","SECOES_1"],"AJUSTAR_ITEM_3":["SECOES_1"],"SECOES_1":["TERMOS_1","PRODUTOS_1","UPSELL"],"TERMOS_1":["PRODUTOS_1"],"PRODUTOS_1":["PRODUTO_1"],"PRODUTO_1":["SECOES_2"],"SECOES_2":["TERMOS_2","PRODUTOS_2","UPSELL"],"TERMOS_2":["PRODUTOS_2"],"PRODUTOS_2":["PRODUTO_2"],"PRODUTO_2":["SECOES_3"],"SECOES_3":["TERMOS_3","PRODUTOS_3","UPSELL"],"TERMOS_3":["PRODUTOS_3"],"PRODUTOS_3":["PRODUTO_3"],"PRODUTO_3":["UPSELL"],"UPSELL":["REVISAO"],"REVISAO":["CLIENTE"],"CLIENTE":["FINALIZAR"],"FINALIZAR":[]}
dst.write_text(json.dumps(flow,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
json.loads(dst.read_text(encoding="utf-8"))
print(f"generated {dst} with {len(flow['screens'])} screens")
