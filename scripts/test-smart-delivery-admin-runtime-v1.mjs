import fs from 'node:fs';

const backend=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20261007202921_smart_delivery_admin_runtime_v1.sql','utf8');
const must=(v,m)=>{if(!v)throw new Error(m)};

must(backend.includes('db.rpc("get_ops_delivery_runs_today_v2")'),'admin must use Smart Delivery run reader v2');
must(backend.includes('db.rpc("smart_delivery_plan_run_v1"'),'admin must plan through Smart Delivery planner');
for(const action of [
  'smart_delivery_catalog','smart_delivery_region_save','smart_delivery_driver_save','smart_delivery_vehicle_save',
  'smart_delivery_location_confirm','smart_delivery_run_assign','smart_delivery_loading_confirm','smart_delivery_stop_move'
]){
  must(backend.includes('"'+action+'"'),'missing admin action '+action);
}
for(const fn of [
  'smart_delivery_catalog_v1','smart_delivery_region_save_v1','smart_delivery_driver_save_v1',
  'smart_delivery_vehicle_save_v1','smart_delivery_plan_run_v1','get_ops_delivery_runs_today_v2'
]){
  must(migration.includes(fn),'missing migration function '+fn);
}
must(migration.includes('v_run_id := public.ops_plan_delivery_run_v1'),'Smart planner must preserve canonical legacy planning gates');
must(migration.includes("when e.confidence='confirmed' then 'confirmed'"),'confirmed destination evidence propagation missing');
must(migration.includes('p_actor_user_id'),'audit actor propagation missing');
must((migration.match(/from public, anon, authenticated/g)||[]).length>=6,'service-role privilege hardening incomplete');
must(backend.includes('WRITE_ACTIONS=new Set')&&backend.includes('"smart_delivery_stop_move"'),'viewer write protection missing for Smart Delivery');
console.log('smart delivery admin runtime v1: ok');
