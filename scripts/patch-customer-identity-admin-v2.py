from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    return text.replace(old, new, 1)

edge_path = Path('supabase/functions/admin-service-intelligence-v1/index.ts')
edge = edge_path.read_text()

old_auth = 'if(new Set(["vitrine_customers_list","vitrine_customer_get","vitrine_customer_save","vitrine_customer_history","vitrine_customer_order_detail"]).has(action)){'
new_auth = 'if(new Set(["vitrine_customers_list","vitrine_customer_get","vitrine_customer_save","vitrine_customer_delete","vitrine_customer_history","vitrine_customer_order_detail"]).has(action)){'
edge = replace_once(edge, old_auth, new_auth, 'admin customer auth actions')

old_role = 'if(action==="vitrine_customer_save"&&!["owner","admin","manager"].includes(String(auth.role||""))){'
new_role = 'if(new Set(["vitrine_customer_save","vitrine_customer_delete"]).has(action)&&!["owner","admin","manager"].includes(String(auth.role||""))){'
edge = replace_once(edge, old_role, new_role, 'admin customer editor role')

start = edge.index('async function vitrineSaveCustomer(sb:any,body:any){')
end = edge.index('async function vitrineAdminAuth(sb:any,req:Request){', start)
new_save = '''async function vitrineSaveCustomer(sb:any,body:any){
  const q=await sb.rpc("ops2_admin_customer_save_v2",{p_payload:body&&typeof body==="object"?body:{}});
  if(q.error)throw q.error;
  const result=q.data&&typeof q.data==="object"?q.data:{ok:false,error:"customer_save_failed"};
  if(result.ok!==true){
    const status=result.error==="customer_not_found"?404:["phone_already_in_use","cpf_already_in_use","duplicate_customer_identity"].includes(String(result.error||""))?409:400;
    return {...result,status};
  }
  const customerId=uuid(result.customer_id);
  if(!customerId)return {ok:false,error:"customer_save_failed",status:500};
  const savedCustomer=await vitrineGetCustomer(sb,customerId);
  if(!savedCustomer)return {ok:false,error:"customer_not_found",status:404};
  try{
    const snapshot=await blingHubCustomerSnapshot(sb,customerId);
    const queued=await sb.rpc("enqueue_bling_hub_job_v2",{
      p_domain:"customer",p_operation:"sync_customer",p_source_system:"canonical_ssbes",p_source_id:customerId,
      p_idempotency_key:"canonical_ssbes:customer:"+customerId+":"+String(snapshot?.updated_at||new Date().toISOString()),
      p_payload:{customer_id:customerId,allow_create:blingHubValidCpfCnpj(snapshot?.cpf_cnpj)},p_payload_version:1
    });
    if(queued.error)throw queued.error;
  }catch(e){
    console.error("bling_customer_enqueue_failed",clean((e as Error)?.message||e,300));
  }
  return {ok:true,customer_id:customerId,customer:savedCustomer};
}

'''
edge = edge[:start] + new_save + edge[end:]

anchor = '  if(action==="vitrine_customer_get"){' 
delete_action = '''  if(action==="vitrine_customer_delete"){
    const id=uuid(body?.id);if(!id)return json({ok:false,error:"invalid_customer"},400);
    try{
      const q=await sb.rpc("ops2_admin_customer_delete_v1",{p_customer_id:id});
      if(q.error)throw q.error;
      const result=q.data&&typeof q.data==="object"?q.data:{ok:false,error:"customer_delete_failed"};
      return json(result,result.ok===true?200:result.error==="customer_not_found"?404:400);
    }catch(e){
      return json({ok:false,error:"customer_delete_failed",detail:clean((e as Error)?.message,300)},500);
    }
  }
'''
if delete_action.strip() not in edge:
    edge = replace_once(edge, anchor, delete_action + anchor, 'customer delete action anchor')

edge_path.write_text(edge)

admin_path = Path('vitrine/admin/index.html')
admin = admin_path.read_text()

old_bind = "      host.querySelectorAll('[data-edit-customer]').forEach(b=>b.onclick=()=>openCustomerEditor(state.customers.find(c=>c.id===b.dataset.editCustomer)));"
new_bind = old_bind + "\n      host.querySelectorAll('[data-delete-customer]').forEach(b=>b.onclick=()=>{const c=state.customers.find(x=>x.id===b.dataset.deleteCustomer);deleteCustomer(c?.id||'',c?.display_name||'')});"
admin = replace_once(admin, old_bind, new_bind, 'customer row delete binding')

old_actions = "      '<div class=\"customer-row-actions\"><button class=\"text\" data-history-customer=\"'+esc(c.id)+'\">Histórico</button><button class=\"text\" data-edit-customer=\"'+esc(c.id)+'\">Editar</button></div></div>';"
new_actions = "      '<div class=\"customer-row-actions\"><button class=\"text\" data-history-customer=\"'+esc(c.id)+'\">Histórico</button><button class=\"text\" data-edit-customer=\"'+esc(c.id)+'\">Editar</button><button class=\"text danger\" data-delete-customer=\"'+esc(c.id)+'\">Excluir</button></div></div>';"
admin = replace_once(admin, old_actions, new_actions, 'customer row actions')

old_editor_actions = "    $('#editorActions').innerHTML='<button class=\"secondary\" id=\"cancelEditor\">Cancelar</button><button class=\"primary\" id=\"saveCustomer\">Salvar cliente</button>';"
new_editor_actions = "    $('#editorActions').innerHTML='<button class=\"secondary\" id=\"cancelEditor\">Cancelar</button>'+(c?'<button class=\"text danger\" id=\"deleteCustomer\">Excluir definitivamente</button>':'')+'<button class=\"primary\" id=\"saveCustomer\">Salvar cliente</button>';"
admin = replace_once(admin, old_editor_actions, new_editor_actions, 'customer editor actions')

old_save_bind = "    $('#saveCustomer').onclick=()=>saveCustomer(c?.id||'',returnOrderId);"
new_save_bind = "    if(c&&$('#deleteCustomer'))$('#deleteCustomer').onclick=()=>deleteCustomer(c.id,c.display_name||'',true);\n" + old_save_bind
admin = replace_once(admin, old_save_bind, new_save_bind, 'customer editor delete binding')

handler_anchor = '  function customerStatusOptions(current){'
delete_handler = '''  async function deleteCustomer(id,name='',fromEditor=false){
    if(!id)return;
    const label=String(name||'este cliente').trim()||'este cliente';
    if(!confirm('Excluir definitivamente o cadastro de '+label+'?\\n\\nOs pedidos históricos serão mantidos, mas os dados de cadastro e contato serão apagados. Esta ação não pode ser desfeita.'))return;
    const q=$('#customerSearch')?.value.trim()||'';
    try{
      await customerApi('vitrine_customer_delete',{id});
      if(fromEditor&&$('#editor')?.open)$('#editor').close();
      state.customerProfile=null;
      state.customers=(state.customers||[]).filter(c=>c.id!==id);
      toast('Cadastro do cliente excluído definitivamente');
      await renderCustomers(q);
    }catch(e){
      toast(errorMessage(e.message));
    }
  }

'''
if delete_handler.strip() not in admin:
    admin = replace_once(admin, handler_anchor, delete_handler + handler_anchor, 'customer delete handler anchor')

admin_path.write_text(admin)
print('customer identity/admin v2 patch applied')
