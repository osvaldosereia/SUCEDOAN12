import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
src = ROOT / "whatsapp" / "flows" / "flow-cestas-comercial-v6.json"
dst = ROOT / "whatsapp" / "flows" / "flow-cestas-comercial-v25.json"

flow = json.loads(src.read_text(encoding="utf-8"))

removed = {
    "AJUSTAR_ITEM_A", "AJUSTAR_ITEM_B", "AJUSTAR_ITEM_C",
    "PERSONALIZAR_B", "PERSONALIZAR_C",
}
flow["screens"] = [s for s in flow["screens"] if s["id"] not in removed]

# One single personalization screen with every basket component visible as a quantity Dropdown.
# 16 slots are reserved for food and 11 for hygiene/cleaning = max 27 official basket items.
data = {
    "basket_name": {"type": "string", "__example__": "Mini Koblenz"},
    "basket_price": {"type": "string", "__example__": "R$ 180,00"},
    "basket_note": {"type": "string", "__example__": "A quantidade atual já vem selecionada. 0 retira o item quando permitido."},
    "basket_image_base64": {"type": "string", "__example__": "iVBORw0KGgoAAA..."},
    "has_basket_image": {"type": "boolean", "__example__": True},
    "has_hygiene": {"type": "boolean", "__example__": True},
    "init_values": {
        "type": "object",
        "properties": {f"q{i:02d}": {"type": "string"} for i in range(1, 28)},
        "__example__": {f"q{i:02d}": "1" for i in range(1, 28)},
    },
}

for i in range(1, 28):
    q = f"q{i:02d}"
    data[f"{q}_label"] = {"type": "string", "__example__": "Arroz 5kg"}
    data[f"{q}_visible"] = {"type": "boolean", "__example__": True}
    data[f"{q}_enabled"] = {"type": "boolean", "__example__": True}
    data[f"{q}_options"] = {
        "type": "array",
        "items": {
            "type": "object",
            "properties": {
                "id": {"type": "string"},
                "title": {"type": "string"},
            },
        },
        "__example__": [
            {"id": "0", "title": "0 · Retirar"},
            {"id": "1", "title": "1 · atual"},
            {"id": "2", "title": "2"},
        ],
    }

form_children = [
    {"type": "TextSubheading", "text": "Alimentos"},
]

for i in range(1, 17):
    q = f"q{i:02d}"
    form_children.append({
        "type": "Dropdown",
        "name": q,
        "label": f"${{data.{q}_label}}",
        "data-source": f"${{data.{q}_options}}",
        "required": False,
        "visible": f"${{data.{q}_visible}}",
        "enabled": f"${{data.{q}_enabled}}",
    })

form_children.append({
    "type": "TextSubheading",
    "text": "Higiene e Limpeza",
    "visible": "${data.has_hygiene}",
})

for i in range(17, 28):
    q = f"q{i:02d}"
    form_children.append({
        "type": "Dropdown",
        "name": q,
        "label": f"${{data.{q}_label}}",
        "data-source": f"${{data.{q}_options}}",
        "required": False,
        "visible": f"${{data.{q}_visible}}",
        "enabled": f"${{data.{q}_enabled}}",
    })

payload = {"trigger": "basket_bulk_update_v1"}
payload.update({f"q{i:02d}": f"${{form.q{i:02d}}}" for i in range(1, 28)})
form_children.append({
    "type": "Footer",
    "label": "Atualizar cesta",
    "on-click-action": {"name": "data_exchange", "payload": payload},
})

bulk_screen = {
    "id": "PERSONALIZAR_A",
    "title": "Personalize sua cesta",
    "data": data,
    "layout": {
        "type": "SingleColumnLayout",
        "children": [
            {
                "type": "Image",
                "src": "${data.basket_image_base64}",
                "scale-type": "contain",
                "aspect-ratio": 1,
                "alt-text": "${data.basket_name}",
            },
            {"type": "TextHeading", "text": "${data.basket_name}"},
            {"type": "TextSubheading", "text": "${data.basket_price}"},
            {"type": "TextCaption", "text": "${data.basket_note}"},
            {
                "type": "Form",
                "name": "bulk_quantity_form",
                "init-values": {f"q{i:02d}": f"${{data.init_values.q{i:02d}}}" for i in range(1, 28)},
                "children": form_children,
            },
        ],
    },
}

replaced = False
for idx, screen in enumerate(flow["screens"]):
    if screen["id"] == "PERSONALIZAR_A":
        flow["screens"][idx] = bulk_screen
        replaced = True
        break
if not replaced:
    raise SystemExit("PERSONALIZAR_A not found")

routing = flow["routing_model"]
for key in list(routing):
    if key in removed:
        routing.pop(key, None)
for key, targets in list(routing.items()):
    routing[key] = [t for t in targets if t not in removed]
routing["CESTAS"] = ["PERSONALIZAR_A"]
routing["PERSONALIZAR_A"] = ["SECOES_A"]

# Static guardrails matching Meta's current component constraints.
personal = next(s for s in flow["screens"] if s["id"] == "PERSONALIZAR_A")
children = personal["layout"]["children"]
form = next(c for c in children if c.get("type") == "Form")
nested_count = len(children) + len(form["children"])
if nested_count > 50:
    raise SystemExit(f"PERSONALIZAR_A has {nested_count} components; Meta maximum is 50")
if sum(1 for c in children if c.get("type") == "Image") > 3:
    raise SystemExit("PERSONALIZAR_A exceeds Meta image limit")

for i in range(1, 28):
    q = f"q{i:02d}"
    example = personal["data"][f"{q}_label"]["__example__"]
    if len(example) > 20:
        raise SystemExit(f"Dropdown label example too long: {q}")

flow["x-dona-antonia"] = {
    "generation": "v25-bulk-quantity",
    "personalization": {
        "single_screen": True,
        "food_slots": 16,
        "hygiene_cleaning_slots": 11,
        "max_items": 27,
        "quantity_zero_removes_when_allowed": True,
        "component_prices_visible": False,
        "individual_product_images": False,
        "basket_image_only": True,
        "recalculation": "single_footer_data_exchange",
    },
}

dst.write_text(json.dumps(flow, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(dst)
print(f"PERSONALIZAR_A components={nested_count}")
