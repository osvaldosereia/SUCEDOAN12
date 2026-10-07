import fs from 'node:fs';
const sql=fs.readFileSync('supabase/migrations/20261007201822_smart_delivery_operational_rpcs_v1.sql','utf8');
const must=(v,m)=>{if(!v)throw new Error(m)};
for(const name of ['smart_delivery_confirm_location_v1','smart_delivery_assign_run_v1','smart_delivery_confirm_loading_v1','smart_delivery_move_stop_v1']){
  must(sql.includes(name),name+' missing');
}
must(sql.includes("Endereço não pertence ao cliente do pedido"),'customer/address ownership guard missing');
must(sql.includes("Evidência pertence a outro cliente"),'evidence ownership guard missing');
must(sql.includes("status in ('completed','cancelled')")||sql.includes("status in ('completed', 'cancelled')"),'closed route guard missing');
must(sql.includes("v_stop.status<>'planned'")||sql.includes("v_stop.status <> 'planned'"),'move stop state guard missing');
must(sql.includes('custody_confirmed_at'),'custody confirmation missing');
must(sql.includes('admin_audit_logs'),'audit trail missing');
must((sql.match(/from public, anon, authenticated/g)||[]).length>=4,'RPC execute hardening missing');
console.log('smart delivery operational RPCs v1: ok');
