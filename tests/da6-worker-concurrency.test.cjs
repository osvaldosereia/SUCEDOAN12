/* DA6 R4: três tentativas, token fencing e 100 fotos com workers concorrentes reais.
 * Conecta APENAS ao PostgreSQL17 efêmero do GitHub Actions.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Client}=require('pg');
const product='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const batch='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
async function connect(){
 const db=new Client({host:process.env.PGHOST||'localhost',port:Number(process.env.PGPORT||5432),
  user:process.env.PGUSER||'postgres',password:process.env.PGPASSWORD||'postgres',
  database:process.env.PGDATABASE||'da6_worker_homologation'});
 await db.connect();
 await db.query("SET request.jwt.claim.role='service_role'");
 return db;
}
async function reset(db,total=100){
 await db.query('TRUNCATE public.inventory_label_counts,public.inventory_label_photos');
 await db.query({
 text:`INSERT INTO public.inventory_label_photos(batch_id,created_by,storage_path,file_name,mime_type,size_bytes,sha256,status)
 SELECT $1,$2,'ci/'||g||'.png','photo-'||g||'.png','image/png',1024,lpad(to_hex(g),64,'0'),'queued'
 FROM generate_series(1,$3) AS g`,
 values:[batch,'11111111-1111-4111-8111-111111111111',total]
 });
}
const claim=async db=>(await db.query('SELECT * FROM public.inventory_label_claim_next()')).rows[0];
const fail=async(db,p,reason='image_decode_failed')=>
 (await db.query('SELECT public.inventory_label_fail_photo($1,$2,$3,$4) AS status',
 [p.photo_id,p.claim_token,reason,reason])).rows[0].status;
const finish=async(db,p,index=1)=>(
 await db.query('SELECT public.inventory_label_finish_photo($1,$2,$3,$4,$5::jsonb,$6::jsonb) AS result',
 [p.photo_id,p.claim_token,product,index.toString(16).toUpperCase().padStart(10,'0'),
 JSON.stringify([{slot:1,quantity:index%100,confidence:.94}]),'[]'])).rows[0].result;
test('R4 bloqueia chamadas do usuário sem credencial service_role',async()=>{
 const db=await connect();
 try{
  await db.query("SET request.jwt.claim.role='authenticated'");
  await assert.rejects(()=>claim(db),e=>e.code==='42501');
 }finally{await db.end()}
});
test('R4 FOR UPDATE SKIP LOCKED separa claims de 2 conexões simultâneas',async()=>{
 const [a,b]=await Promise.all([connect(),connect()]);
 try{
  await reset(a,4);
  await a.query('BEGIN');
  const first=await claim(a);
  assert.ok(first?.photo_id);
  // Worker A ainda não deu COMMIT: B não pode obter a mesma foto.
  const second=await claim(b);
  assert.ok(second?.photo_id);
  assert.notEqual(first.photo_id,second.photo_id);
  await a.query('COMMIT');
  assert.equal(await fail(a,first),'retry');
  assert.equal(await fail(b,second),'retry');
  const r=await a.query("SELECT count(*)::int AS n FROM public.inventory_label_photos WHERE status='retry'");
  assert.equal(r.rows[0].n,2);
 }finally{
  try{await a.query('ROLLBACK')}catch{}
  await Promise.all([a.end(),b.end()]);
 }
});
test('R4 retry 1, 2 e 3; claim_token expirado nunca pode confirmar',async()=>{
 const db=await connect();
 try{
  await reset(db,1);
  const first=await claim(db);
  assert.equal(first.attempt_no,1);
  assert.equal(await fail(db,first),'retry');
  await db.query("UPDATE public.inventory_label_photos SET next_attempt_at=now()-interval '1 second' WHERE id=$1",[first.photo_id]);
  const second=await claim(db);
  assert.equal(second.photo_id,first.photo_id);
  assert.equal(second.attempt_no,2);
  assert.notEqual(second.claim_token,first.claim_token);
  await assert.rejects(()=>fail(db,first,'stale_claim'),e=>e.code==='40001');
  assert.equal(await fail(db,second),'retry');
  await db.query("UPDATE public.inventory_label_photos SET next_attempt_at=now()-interval '1 second' WHERE id=$1",[second.photo_id]);
  const third=await claim(db);
  assert.equal(third.attempt_no,3);
  assert.equal(await fail(db,third),'failed');
  assert.equal(await claim(db),undefined);
  const row=(await db.query('SELECT status,attempts,claim_token,finished_at FROM public.inventory_label_photos WHERE id=$1',[third.photo_id])).rows[0];
  assert.equal(row.status,'failed');assert.equal(Number(row.attempts),3);
  assert.equal(row.claim_token,null);assert.ok(row.finished_at);
 }finally{await db.end()}
});
test('R4 worker interrompido após 5min recebe novo token, resultado antigo descartado',async()=>{
 const db=await connect();
 try{
  await reset(db,1);
  const old=await claim(db);
  await db.query("UPDATE public.inventory_label_photos SET claimed_at=now()-interval '6 minutes' WHERE id=$1",[old.photo_id]);
  const fresh=await claim(db);
  assert.equal(fresh.photo_id,old.photo_id);
  assert.equal(fresh.attempt_no,2);
  assert.notEqual(fresh.claim_token,old.claim_token);
  await assert.rejects(()=>finish(db,old,1),e=>e.code==='40001');
  const outcome=await finish(db,fresh,1);
  assert.equal(outcome.status,'complete');
  assert.equal(outcome.inserted,1);
  const saved=(await db.query('SELECT count(*)::int AS n FROM public.inventory_label_counts')).rows[0];
  assert.equal(saved.n,1);
 }finally{await db.end()}
});
test('R4 100 fotos em quatro workers: cada foto é processada exatamente uma vez',async()=>{
 const admin=await connect();
 const workers=await Promise.all(Array.from({length:4},()=>connect()));
 try{
  await reset(admin,100);
  let nextIndex=0;const seen=new Set();
  await Promise.all(workers.map(async worker=>{
   while(true){
    const item=await claim(worker);
    if(!item)break;
    assert.ok(!seen.has(item.photo_id),'duplicate concurrent claim');
    seen.add(item.photo_id);
    const index=++nextIndex;
    const result=await finish(worker,item,index);
    assert.equal(result.status,'complete');
    assert.equal(result.inserted,1);
    assert.equal(result.duplicates,0);
   }
  }));
  assert.equal(seen.size,100);
  const stats=(await admin.query(`SELECT status,count(*)::int AS n FROM public.inventory_label_photos GROUP BY status`)).rows;
  assert.deepEqual(stats.map(x=>[x.status,x.n]),[['complete',100]]);
  const counts=(await admin.query('SELECT count(*)::int AS n FROM public.inventory_label_counts')).rows[0];
  assert.equal(counts.n,100);
  assert.equal(await claim(admin),undefined);
 }finally{await Promise.all([admin.end(),...workers.map(w=>w.end())])}
});

test('R4 terceiro worker interrompido termina em failed, sem quarta tentativa',async()=>{
 const db=await connect();
 try{
  await reset(db,1);
  let last=null;
  for(let i=1;i<=3;i++){
   const entry=await claim(db);
   assert.equal(entry.attempt_no,i);
   last=entry;
   await db.query("UPDATE public.inventory_label_photos SET claimed_at=now()-interval '6 minutes' WHERE id=$1",[entry.photo_id]);
  }
  assert.equal(await claim(db),undefined);
  const state=(await db.query('SELECT status,attempts,claim_token,finished_at FROM public.inventory_label_photos WHERE id=$1',[last.photo_id])).rows[0];
  assert.equal(state.status,'failed');assert.equal(Number(state.attempts),3);
  assert.equal(state.claim_token,null);assert.ok(state.finished_at);
  await assert.rejects(()=>finish(db,last,1),e=>e.code==='40001');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.inventory_label_counts')).rows[0].n,0);
 }finally{await db.end()}
});
