from pathlib import Path

p=Path('supabase/functions/storefront-v2/index.ts')
s=p.read_text(encoding='utf-8')

old='''async function moldHomeCards(){\n  const mq=await db.from("basket_molds").select("id,basket_id,hidden_adjustment,public_composition_count");if(mq.error)throw mq.error;const molds=mq.data||[];if(!molds.length)return [];\n  const basketIds=molds.map((m:any)=>String(m.basket_id)),moldIds=molds.map((m:any)=>String(m.id));'''
new='''async function moldHomeCards(){\n  const mq=await db.from("basket_molds").select("id,basket_id,hidden_adjustment,public_composition_count,metadata");if(mq.error)throw mq.error;const molds=mq.data||[];if(!molds.length)return [];\n  const legacySourceIds=[...new Set(molds.flatMap((m:any)=>String(m?.metadata?.transition_mode||"")==="legacy_first"&&Array.isArray(m?.metadata?.legacy_source_basket_ids)?m.metadata.legacy_source_basket_ids.map((x:any)=>String(x)).filter(Boolean):[]))];\n  const legacyAvailable=new Set<string>();\n  if(legacySourceIds.length){const lq=await db.from("basket_commercial_catalog_v1").select("commercial_id,public_available").eq("source_kind","basket").in("commercial_id",legacySourceIds).gt("public_available",0);if(lq.error)throw lq.error;for(const row of lq.data||[])if(Number(row.public_available||0)>0)legacyAvailable.add(String(row.commercial_id))}\n  const visibleMolds=molds.filter((m:any)=>{if(String(m?.metadata?.transition_mode||"")!=="legacy_first")return true;const ids=Array.isArray(m?.metadata?.legacy_source_basket_ids)?m.metadata.legacy_source_basket_ids:[];return !ids.some((x:any)=>legacyAvailable.has(String(x)))});\n  if(!visibleMolds.length)return [];\n  const basketIds=visibleMolds.map((m:any)=>String(m.basket_id)),moldIds=visibleMolds.map((m:any)=>String(m.id));'''
if old not in s:
    raise SystemExit('R6 anchor moldHomeCards header not found; refusing to modify storefront')
s=s.replace(old,new,1)

old2='''  const generated=await Promise.all(molds.map(async(m:any)=>{const q=await db.rpc("basket_mold_public_compositions_v2",{p_basket_id:m.basket_id});if(q.error)throw q.error;return {m,data:q.data||{}}}));'''
new2='''  const generated=await Promise.all(visibleMolds.map(async(m:any)=>{const q=await db.rpc("basket_mold_public_compositions_v2",{p_basket_id:m.basket_id});if(q.error)throw q.error;return {m,data:q.data||{}}}));'''
if old2 not in s:
    raise SystemExit('R6 anchor mold generation not found; refusing to modify storefront')
s=s.replace(old2,new2,1)

p.write_text(s,encoding='utf-8')
print('R6 storefront cutover transformation applied')
