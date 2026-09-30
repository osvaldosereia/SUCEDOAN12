from pathlib import Path
p=Path('vitrine/admin/index.html')
s=p.read_text(encoding='utf-8')
marker='GOOGLE_IMAGES_PRODUCT_BUTTON_V1'
if marker in s:
    print('already patched'); raise SystemExit(0)
old="<input id=\"productImageFile\" type=\"file\" accept=\"image/jpeg,image/png,image/webp\" hidden><div class=\"product-image-actions\"><button class=\"secondary\" id=\"chooseProductImage\" type=\"button\">'+(p?.image_url?'Trocar foto original':'Adicionar foto')+'</button><button class=\"primary\" id=\"standardizeProductImage\" type=\"button\" '+(!(p?.image_original_url||p?.image_url)?'disabled':'')+'>Padronizar com IA</button></div>"
new="<input id=\"productImageFile\" type=\"file\" accept=\"image/jpeg,image/png,image/webp\" hidden><div class=\"product-image-actions\"><button class=\"secondary\" id=\"chooseProductImage\" type=\"button\">'+(p?.image_url?'Trocar foto original':'Adicionar foto')+'</button><a class=\"secondary product-google-images-link\" id=\"productGoogleImages\" data-google-product-name=\"'+esc(p?.name||'')+'\" target=\"_blank\" rel=\"noopener noreferrer\" href=\"https://www.google.com/search?tbm=isch&q='+encodeURIComponent(p?.name||'')+'\">Google Imagens ↗</a><button class=\"primary\" id=\"standardizeProductImage\" type=\"button\" '+(!(p?.image_original_url||p?.image_url)?'disabled':'')+'>Padronizar com IA</button></div>"
if old not in s: raise SystemExit('image action block not found')
s=s.replace(old,new,1)
css="""\n    /* GOOGLE_IMAGES_PRODUCT_BUTTON_V1 */\n    .product-google-images-link{border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:11px;min-height:44px;padding:0 14px;font-weight:850;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}\n    .product-google-images-link:hover{background:var(--soft)}\n"""
s=s.replace('</style>',css+'\n  </style>',1)
p.write_text(s,encoding='utf-8')
print('patched Google Images product button')
