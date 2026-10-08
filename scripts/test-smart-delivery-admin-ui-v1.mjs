import fs from 'node:fs';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const must=(v,m)=>{if(!v)throw new Error(m)};

must(html.includes("deliveryCatalog:{regions:[],drivers:[],vehicles:[]}"),'Smart Delivery catalog state missing');
must(html.includes("deliveryPlan:{region_id:'',driver_id:'',vehicle_id:''}"),'route assignment state missing');
must(html.includes("data-smart-new=\"regions\""),'region configuration UI missing');
must(html.includes("data-smart-new=\"drivers\""),'driver configuration UI missing');
must(html.includes("data-smart-new=\"vehicles\""),'vehicle configuration UI missing');
must(html.includes("smart_delivery_region_save"),'region save action missing');
must(html.includes("smart_delivery_driver_save"),'driver save action missing');
must(html.includes("smart_delivery_vehicle_save"),'vehicle save action missing');
must(html.includes("destination_latitude")&&html.includes("destination_longitude"),'precise Maps destination support missing');
must(html.includes("LOCALIZAÇÃO CONFIRMADA"),'confirmed location indicator missing');
must(html.includes("CONFIRMAR CARGA"),'loading/custody UI missing');
must(html.includes("smart_delivery_run_assign"),'route reassignment UI missing');
must(html.includes("smart_delivery_stop_move"),'stop move UI missing');
must(html.includes("smart_delivery_optimize"),'route optimization action missing');
must(html.includes("Pronta para otimizar"),'route optimization ready state missing');
must(html.includes("Localização pendente"),'route optimization location-pending state missing');
must(html.includes("Rota otimizada"),'route optimization completed state missing');
must(html.includes("Carga iniciada"),'route optimization loading lock state missing');
must(html.includes("O pedido e seu número permanecem os mesmos"),'order identity guard copy missing');
must(html.includes("Preparar Rota 1")&&html.includes("Preparar Rota 2"),'legacy vehicle slots must be presented as routes, not physical vehicles');
console.log('smart delivery admin UI v1: ok');
