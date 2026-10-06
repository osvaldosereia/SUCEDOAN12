from pathlib import Path
p=Path('supabase/functions/storefront-v2/index.ts')
s=p.read_text(encoding='utf-8')
old='''async function moldDetail(basketId:string,compositionNumber:number,selections:any[]|null=null){\n  const [mq,bq,pq]=await Promise.all(['''
new='''async function moldDetail(basketId:string,compositionNumber:number,selections:any[]|null=null){\n  const gate=await db.rpc("basket_mold_cutover_ready_v1",{p_basket_id:basketId});if(gate.error)throw gate.error;if(gate.data!==true)return null;\n  const [mq,bq,pq]=await Promise.all(['''
if old not in s:
    raise SystemExit('R6 moldDetail guard anchor not found; refusing to modify storefront')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('R6 moldDetail server guard applied')
