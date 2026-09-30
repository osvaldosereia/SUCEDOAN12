from pathlib import Path
p=Path('vitrine/admin/index.html')
s=p.read_text(encoding='utf-8')
marker='/* PRODUCTS_MOBILE_DETAIL_V2 */'
if marker in s:
    print('already patched'); raise SystemExit(0)
css=r'''
    /* PRODUCTS_MOBILE_DETAIL_V2 */
    @media(max-width:640px){
      html,body{width:100%;max-width:100%;overflow-x:hidden!important}
      .wrap{max-width:100%;overflow-x:hidden}
      #productRows.mobile-product-grid{width:100%;max-width:100%;overflow-x:hidden;align-items:start}
      .mobile-product-card{height:420px!important;min-height:420px!important;max-width:100%;overflow:hidden!important;contain:layout paint;overflow-anchor:none}
      .mobile-product-card .mobile-product-thumb{width:100%!important;height:138px!important;max-height:138px!important;object-fit:contain}
      .mobile-product-card-head,.mobile-product-card-body,.mobile-product-card-foot{min-width:0;max-width:100%}
      .mobile-product-card .row-title,.mobile-product-card .sub{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
      .mobile-product-fields{min-width:0;max-width:100%}
      .mobile-product-field{min-width:0;max-width:100%}
      .mobile-product-field input,.mobile-product-field select{min-width:0;max-width:100%;width:100%}
      dialog.product-editor-dialog{position:fixed!important;inset:0!important;margin:0!important;width:100vw!important;max-width:100vw!important;height:100dvh!important;max-height:100dvh!important;border-radius:0!important;padding:0!important;overflow:hidden!important}
      dialog.product-editor-dialog .modal-head{position:absolute;top:0;left:0;right:0;height:58px;min-height:58px;padding:7px 10px;z-index:4}
      dialog.product-editor-dialog .modal-head strong{font-size:17px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      dialog.product-editor-dialog .close{flex:0 0 42px;width:42px;height:42px}
      dialog.product-editor-dialog .modal-body{position:absolute;top:58px;bottom:68px;left:0;right:0;width:100%;max-width:100%;height:auto!important;max-height:none!important;padding:10px!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
      dialog.product-editor-dialog .modal-actions{position:absolute!important;left:0;right:0;bottom:0;height:68px;min-height:68px;padding:10px!important;display:flex;gap:8px;align-items:center;z-index:4;overflow:hidden}
      dialog.product-editor-dialog .modal-actions button{flex:1 1 0;min-width:0;max-width:100%;height:46px;white-space:normal}
      dialog.product-editor-dialog #productForm{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:10px!important;width:100%!important;max-width:100%!important;min-width:0!important;margin:0!important}
      dialog.product-editor-dialog #productForm>*{grid-column:1/-1!important;min-width:0!important;max-width:100%!important;width:100%}
      dialog.product-editor-dialog #productForm label{min-width:0!important;max-width:100%!important;width:100%}
      dialog.product-editor-dialog #productForm input,dialog.product-editor-dialog #productForm select,dialog.product-editor-dialog #productForm textarea{width:100%!important;min-width:0!important;max-width:100%!important}
      dialog.product-editor-dialog .product-image-admin{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:10px!important;width:100%!important;min-width:0!important;max-width:100%!important}
      dialog.product-editor-dialog .product-image-preview{width:100%!important;max-width:100%!important;height:220px!important;min-height:220px!important;overflow:hidden!important;display:flex;align-items:center;justify-content:center}
      dialog.product-editor-dialog .product-image-preview img{width:100%!important;height:100%!important;max-width:100%!important;object-fit:contain!important}
      dialog.product-editor-dialog .product-image-tools{min-width:0!important;max-width:100%!important;width:100%!important}
      dialog.product-editor-dialog .product-image-tools small,dialog.product-editor-dialog .product-image-status{white-space:normal!important;overflow-wrap:anywhere!important;word-break:break-word}
      dialog.product-editor-dialog .product-image-actions{display:grid!important;grid-template-columns:1fr!important;gap:8px!important;width:100%!important}
      dialog.product-editor-dialog .product-image-actions button{width:100%!important;min-width:0!important}
      dialog.product-editor-dialog .product-stock-breakdown{grid-template-columns:1fr 1fr!important;min-width:0!important;max-width:100%!important;width:100%!important}
      dialog.product-editor-dialog .product-stock-warning{grid-column:1/-1!important;min-width:0!important;overflow-wrap:anywhere}
      dialog.product-editor-dialog .section-title{margin-top:8px!important}
    }
'''
if '</style>' not in s: raise SystemExit('style end missing')
s=s.replace('</style>',css+'\n  </style>',1)
old="    $('#saveProduct').onclick=()=>saveProduct(isDuplicate?'':(p?.id||''),isDuplicate?p.id:'');\n    $('#editor').showModal();"
new="    $('#saveProduct').onclick=()=>saveProduct(isDuplicate?'':(p?.id||''),isDuplicate?p.id:'');\n    const productEditor=$('#editor');productEditor.classList.add('product-editor-dialog');productEditor.addEventListener('close',()=>productEditor.classList.remove('product-editor-dialog'),{once:true});\n    productEditor.showModal();"
if old not in s: raise SystemExit('product editor open marker missing')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('patched products mobile detail')
