from pathlib import Path

ADMIN = Path("vitrine/admin/index.html")
BACKENDS = [
    Path("supabase/functions/purchase-xml-v1/index.ts"),
    Path("supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts"),
]

admin = ADMIN.read_text(encoding="utf-8")

required_admin = [
    "PURCHASE_XML_EDIT_NAME_V1",
    "<label>Nome do produto</label>",
    "data-catalog-product-name",
    "Você pode editar o nome antes de salvar.",
    "const proposedName=String(card.querySelector('[data-catalog-product-name]')?.value||'').trim();",
    "if(!proposedName){if(!quiet)toast('Informe o nome do produto');return false}",
    "proposed_name:proposedName",
    "card.querySelector('[data-catalog-product-name]')?.value||card.querySelector('[data-catalog-identity-name]')?.value",
    "if(!name){toast('Informe o nome do produto');return}",
]
missing = [needle for needle in required_admin if needle not in admin]
assert not missing, f"{ADMIN}: missing {missing}"

for backend in BACKENDS:
    text = backend.read_text(encoding="utf-8")
    required_backend = [
        "const proposedName=clean(body?.proposed_name,300);",
        "if(proposedName)upd.name=proposedName;",
    ]
    missing = [needle for needle in required_backend if needle not in text]
    assert not missing, f"{backend}: missing {missing}"

print("purchase XML editable product name verification: PASS")
