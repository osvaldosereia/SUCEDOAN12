import fs from 'node:fs';

const admin = fs.readFileSync('vitrine/admin/index.html','utf8');
const edge = fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');

const must = (ok,msg)=>{ if(!ok) throw new Error(msg); };

must(edge.includes('canonical_dispatch_required'), 'backend must reject generic out_for_delivery');
must(edge.includes('canonical_delivery_required'), 'backend must reject generic delivered');
must(edge.includes('required_action:"order_dispatch_start_v4"'), 'dispatch canonical action missing');
must(edge.includes('required_action:"order_delivery_complete_v3"'), 'delivery canonical action missing');
must(edge.includes('async function finalizeCapturedDeliveryV4'), 'split-payment delivery finalizer missing');
must(edge.includes('a==="order_delivery_finalize_v4"'), 'split-payment delivery finalizer route missing');

must(!admin.includes("status:'out_for_delivery'"), 'admin still directly writes out_for_delivery');
must(!admin.includes("status:'delivered'"), 'admin still directly writes delivered');
must(admin.includes("api('order_dispatch_start_v4'"), 'admin dispatch canonical action missing');
must(admin.includes("api('order_delivery_complete_v3'"), 'admin delivery canonical action missing');
must(admin.includes("api('order_delivery_finalize_v4'"), 'admin split-payment finalizer missing');

console.log('smart delivery phase 0 canonical flow: ok');
