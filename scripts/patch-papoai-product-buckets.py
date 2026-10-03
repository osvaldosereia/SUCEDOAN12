from pathlib import Path

p=Path('supabase/functions/admin-orders-v1/index.ts')
s=p.read_text(encoding='utf-8')

old='''  const productBucket=Math.min(60,Math.max(5,Math.ceil(lines.length/5)*5));
  const productPaddingCount=productBucket-lines.length;
  const productSlots=Object.fromEntries(Array.from({length:productBucket},(_,index)=>[
'''
new='''  const productOverflow=lines.length>60;
  const productBucket=productOverflow?0:Math.max(5,Math.ceil(lines.length/5)*5);
  const productTemplateMode=productOverflow?"legacy_fallback":"bucketed";
  const productSlotCount=productOverflow?0:productBucket;
  const productPaddingCount=productOverflow?0:productBucket-lines.length;
  const productSlots=Object.fromEntries(Array.from({length:productSlotCount},(_,index)=>[
'''
if old not in s:
    raise SystemExit('product bucket block not found')
s=s.replace(old,new,1)

old='''    itemsText,
    itemsTextLineSeparator,
    productBucket,
    productPaddingCount,
    productSlots,
'''
new='''    itemsText,
    itemsTextLineSeparator,
    productTemplateMode,
    productOverflow,
    productBucket,
    productPaddingCount,
    productSlots,
'''
if old not in s:
    raise SystemExit('order details return block not found')
s=s.replace(old,new,1)

old='''    product_count:details.itemCount,
    product_bucket:details.productBucket,
    product_padding_count:details.productPaddingCount,
'''
new='''    product_count:details.itemCount,
    product_template_mode:details.productTemplateMode,
    product_overflow:details.productOverflow,
    product_bucket:details.productBucket,
    product_padding_count:details.productPaddingCount,
'''
if old not in s:
    raise SystemExit('provider payload product block not found')
s=s.replace(old,new,1)

p.write_text(s,encoding='utf-8')
print('patched safe PapoAI product bucket metadata')
