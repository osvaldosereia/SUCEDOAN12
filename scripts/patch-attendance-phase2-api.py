from pathlib import Path
p=Path('supabase/functions/admin-whatsapp-ops-v1/index.ts')
s=p.read_text()
s=s.replace('const READ_ACTIONS=new Set(["accounts","queue","conversation","context","products","media"]);','const READ_ACTIONS=new Set(["accounts","queue","conversation","context","products","media","labels","conversation_labels","quick_replies"]);')
s=s.replace('const SAFE_POST_ACTIONS=new Set(["mark_read","follow_up","issue_catalog","marketing_opt_out"]);','const SAFE_POST_ACTIONS=new Set(["mark_read","follow_up","issue_catalog","marketing_opt_out","label_save","label_deactivate","conversation_labels_set","quick_reply_save","quick_reply_deactivate"]);')
s=s.replace('ops2_admin_attendance_queue_v2','ops2_admin_attendance_queue_v3')
s=s.replace('p_search:clean(url.searchParams.get("search"),80)||null\n      });','p_search:clean(url.searchParams.get("search"),80)||null,\n        p_label_id:validUuid(url.searchParams.get("label_id"))\n      });')
marker='''    if(req.method==="GET"&&action==="products"){\n'''
insert='''    if(req.method==="GET"&&action==="labels"){
      const includeInactive=url.searchParams.get("include_inactive")==="1";
      let q=db.from("attendance_labels_v1").select("id,name,color,sort_order,is_active,created_at,updated_at").order("sort_order").order("name");
      if(!includeInactive)q=q.eq("is_active",true);
      const r=await q;if(r.error)throw r.error;return json(req,{ok:true,items:r.data||[]});
    }

    if(req.method==="GET"&&action==="conversation_labels"){
      const conversationId=validUuid(url.searchParams.get("conversation_id"));
      if(!conversationId)return json(req,{ok:false,error:"invalid_conversation_id"},400);
      const r=await db.from("attendance_conversation_labels_v1").select("label_id").eq("conversation_id",conversationId);
      if(r.error)throw r.error;return json(req,{ok:true,conversation_id:conversationId,label_ids:(r.data||[]).map((x:any)=>x.label_id)});
    }

    if(req.method==="GET"&&action==="quick_replies"){
      const includeInactive=url.searchParams.get("include_inactive")==="1";
      let q=db.from("attendance_quick_replies_v1").select("id,title,content,is_favorite,sort_order,is_active,created_at,updated_at").order("sort_order").order("title");
      if(!includeInactive)q=q.eq("is_active",true);
      const r=await q;if(r.error)throw r.error;return json(req,{ok:true,items:r.data||[]});
    }

'''+marker
if marker not in s: raise SystemExit('products marker not found')
s=s.replace(marker,insert,1)
old='''    const body=await req.json().catch(()=>({}));\n    const conversationId=validUuid(body?.conversation_id);\n    if(!conversationId)return json(req,{ok:false,error:"invalid_conversation_id"},400);\n\n'''
new='''    const body=await req.json().catch(()=>({}));

    if(action==="label_save"){
      const id=body?.id?validUuid(body.id):null;const name=clean(body?.name,60);const color=clean(body?.color,7)||"#5f6368";const sortOrder=num(body?.sort_order,0,-9999,9999);
      if(!name)return json(req,{ok:false,error:"label_name_required"},400);
      if(!/^#[0-9a-fA-F]{6}$/.test(color))return json(req,{ok:false,error:"invalid_label_color"},400);
      const payload={name,color,sort_order:sortOrder,is_active:true,updated_at:new Date().toISOString()};
      const r=id?await db.from("attendance_labels_v1").update(payload).eq("id",id).select("id,name,color,sort_order,is_active").maybeSingle():await db.from("attendance_labels_v1").insert(payload).select("id,name,color,sort_order,is_active").single();
      if(r.error){if(String(r.error.code)==="23505")return json(req,{ok:false,error:"label_name_conflict"},409);throw r.error}
      if(id&&!r.data)return json(req,{ok:false,error:"label_not_found"},404);return json(req,{ok:true,item:r.data});
    }

    if(action==="label_deactivate"){
      const id=validUuid(body?.id??body?.label_id);if(!id)return json(req,{ok:false,error:"invalid_label_id"},400);
      const r=await db.from("attendance_labels_v1").update({is_active:false,updated_at:new Date().toISOString()}).eq("id",id).select("id").maybeSingle();if(r.error)throw r.error;
      return json(req,r.data?{ok:true,id}:{ok:false,error:"label_not_found"},r.data?200:404);
    }

    if(action==="quick_reply_save"){
      const id=body?.id?validUuid(body.id):null;const title=clean(body?.title,80);const content=clean(body?.content,4000);const sortOrder=num(body?.sort_order,0,-9999,9999);const favorite=body?.is_favorite!==false;
      if(!title)return json(req,{ok:false,error:"quick_reply_title_required"},400);
      if(!content)return json(req,{ok:false,error:"quick_reply_content_required"},400);
      const payload={title,content,is_favorite:favorite,sort_order:sortOrder,is_active:true,updated_at:new Date().toISOString()};
      const r=id?await db.from("attendance_quick_replies_v1").update(payload).eq("id",id).select("id,title,content,is_favorite,sort_order,is_active").maybeSingle():await db.from("attendance_quick_replies_v1").insert(payload).select("id,title,content,is_favorite,sort_order,is_active").single();
      if(r.error){if(String(r.error.code)==="23505")return json(req,{ok:false,error:"quick_reply_title_conflict"},409);throw r.error}
      if(id&&!r.data)return json(req,{ok:false,error:"quick_reply_not_found"},404);return json(req,{ok:true,item:r.data});
    }

    if(action==="quick_reply_deactivate"){
      const id=validUuid(body?.id??body?.quick_reply_id);if(!id)return json(req,{ok:false,error:"invalid_quick_reply_id"},400);
      const r=await db.from("attendance_quick_replies_v1").update({is_active:false,updated_at:new Date().toISOString()}).eq("id",id).select("id").maybeSingle();if(r.error)throw r.error;
      return json(req,r.data?{ok:true,id}:{ok:false,error:"quick_reply_not_found"},r.data?200:404);
    }

    const conversationId=validUuid(body?.conversation_id);
    if(!conversationId)return json(req,{ok:false,error:"invalid_conversation_id"},400);

    if(action==="conversation_labels_set"){
      if(!Array.isArray(body?.label_ids))return json(req,{ok:false,error:"invalid_label_ids"},400);
      const raw=body.label_ids;const ids=[...new Set(raw.map((x:any)=>validUuid(x)).filter(Boolean))];
      if(ids.length!==raw.length)return json(req,{ok:false,error:"invalid_label_ids"},400);
      const r=await db.rpc("ops2_admin_attendance_set_labels_v1",{p_conversation_id:conversationId,p_label_ids:ids});if(r.error)throw r.error;
      return json(req,r.data||{ok:false,error:"conversation_labels_failed"},r.data?.ok===false?400:200);
    }

'''
if old not in s: raise SystemExit('body marker not found')
s=s.replace(old,new,1)
p.write_text(s)
