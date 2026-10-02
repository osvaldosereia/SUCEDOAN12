from pathlib import Path
p=Path('supabase/functions/admin-whatsapp-ops-v1/index.ts')
s=p.read_text()
s=s.replace('"quick_replies"]);','"quick_replies","templates"]);',1)
s=s.replace('"quick_reply_deactivate"]);','"quick_reply_deactivate","template_save","template_deactivate","template_attendance_toggle"]);',1)
marker='''if(req.method==="GET"&&action==="products"){'''
insert='''if(req.method==="GET"&&action==="templates"){
  const accountIdRaw=url.searchParams.get("account_id");const accountId=accountIdRaw?validUuid(accountIdRaw):null;
  if(accountIdRaw&&!accountId)return json(req,{ok:false,error:"invalid_account_id"},400);
  let q=db.from("whatsapp_templates_v1").select("id,whatsapp_account_id,waba_id,meta_template_id,name,language,category,status,components,quality_rating,last_synced_at,metadata,created_at,updated_at").order("name").order("language");
  if(accountId)q=q.eq("whatsapp_account_id",accountId);
  const r=await q;if(r.error)throw r.error;
  return json(req,{ok:true,source:"local_cache",items:(r.data||[]).map((x:any)=>({...x,attendance_show:x?.metadata?.attendance?.show===true}))});
}
'''+marker
if marker not in s: raise SystemExit('GET products marker not found')
s=s.replace(marker,insert,1)
marker2='''if(action==="label_save"){'''
insert2='''if(action==="template_save"){
  const id=body?.id?validUuid(body.id):null;const accountId=validUuid(body?.whatsapp_account_id);const name=clean(body?.name,180);const language=clean(body?.language,20)||"pt_BR";const category=clean(body?.category,40)||null;const statusRaw=clean(body?.status,30).toUpperCase()||"LOCAL_DRAFT";const allowedStatus=new Set(["ACTIVE","PAUSED","REJECTED","PENDING","INACTIVE","LOCAL_DRAFT"]);const status=allowedStatus.has(statusRaw)?statusRaw:"LOCAL_DRAFT";
  if(!accountId)return json(req,{ok:false,error:"invalid_account_id"},400);if(!name)return json(req,{ok:false,error:"template_name_required"},400);
  const account=await db.from("whatsapp_accounts").select("id").eq("id",accountId).eq("is_active",true).maybeSingle();if(account.error)throw account.error;if(!account.data)return json(req,{ok:false,error:"whatsapp_account_not_found"},404);
  let existing:any=null;if(id){const q=await db.from("whatsapp_templates_v1").select("id,metadata").eq("id",id).maybeSingle();if(q.error)throw q.error;if(!q.data)return json(req,{ok:false,error:"template_not_found"},404);existing=q.data}
  const previousMeta:any=existing?.metadata&&typeof existing.metadata==="object"?existing.metadata:{};const show=body?.attendance_show===true;const metadata={...previousMeta,source:previousMeta.source||"admin_manual_cache",attendance:{...(previousMeta.attendance||{}),show}};
  const payload:any={whatsapp_account_id:accountId,waba_id:clean(body?.waba_id,80)||null,meta_template_id:clean(body?.meta_template_id,100)||null,name,language,category,status,components:Array.isArray(body?.components)?body.components:[],metadata,updated_at:new Date().toISOString()};
  const r=id?await db.from("whatsapp_templates_v1").update(payload).eq("id",id).select("*").maybeSingle():await db.from("whatsapp_templates_v1").insert(payload).select("*").single();
  if(r.error){if(String(r.error.code)==="23505")return json(req,{ok:false,error:"template_name_conflict"},409);throw r.error}return json(req,{ok:true,item:r.data});
}
if(action==="template_attendance_toggle"){
  const id=validUuid(body?.id??body?.template_id);if(!id)return json(req,{ok:false,error:"invalid_template_id"},400);const show=body?.show===true;
  const current=await db.from("whatsapp_templates_v1").select("id,metadata,status").eq("id",id).maybeSingle();if(current.error)throw current.error;if(!current.data)return json(req,{ok:false,error:"template_not_found"},404);
  if(show&&String(current.data.status||'').toUpperCase()!=="ACTIVE")return json(req,{ok:false,error:"template_not_active"},409);
  const meta:any=current.data.metadata&&typeof current.data.metadata==="object"?current.data.metadata:{};const metadata={...meta,attendance:{...(meta.attendance||{}),show}};
  const r=await db.from("whatsapp_templates_v1").update({metadata,updated_at:new Date().toISOString()}).eq("id",id).select("*").maybeSingle();if(r.error)throw r.error;return json(req,{ok:true,item:r.data});
}
if(action==="template_deactivate"){
  const id=validUuid(body?.id??body?.template_id);if(!id)return json(req,{ok:false,error:"invalid_template_id"},400);
  const current=await db.from("whatsapp_templates_v1").select("id,metadata").eq("id",id).maybeSingle();if(current.error)throw current.error;if(!current.data)return json(req,{ok:false,error:"template_not_found"},404);
  const meta:any=current.data.metadata&&typeof current.data.metadata==="object"?current.data.metadata:{};const metadata={...meta,attendance:{...(meta.attendance||{}),show:false}};
  const r=await db.from("whatsapp_templates_v1").update({status:"INACTIVE",metadata,updated_at:new Date().toISOString()}).eq("id",id).select("id,status,metadata").maybeSingle();if(r.error)throw r.error;return json(req,{ok:true,item:r.data});
}
'''+marker2
if marker2 not in s: raise SystemExit('POST label marker not found')
s=s.replace(marker2,insert2,1)
p.write_text(s)
