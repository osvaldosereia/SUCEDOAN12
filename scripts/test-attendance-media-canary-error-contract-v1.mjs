import assert from 'node:assert/strict';
import {sendAttendanceMediaViaMeta} from '../supabase/functions/_shared/admin-attendance-media-send-v1.mjs';

function mediaForm(){
  const form=new FormData();
  form.set('conversation_id','12231329-0f90-4e8f-8207-85243493db82');
  form.set('idempotency_key','admin-media:test-canary-error');
  form.set('file',new File([new Uint8Array([0x89,0x50,0x4e,0x47])],'canary.png',{type:'image/png'}));
  return form;
}

async function expectCanaryError(code){
  const db={
    async rpc(name){
      assert.equal(name,'ops2_admin_attendance_enqueue_media_v1');
      return {data:null,error:{code:'P0001',message:code,details:null,hint:null}};
    }
  };
  const result=await sendAttendanceMediaViaMeta({
    db,
    form:mediaForm(),
    accessToken:'TEST_SECRET_TOKEN',
    graphVersion:'v26.0',
    markClaimFailed:async()=>{throw new Error('não deve chegar ao claim')},
    markMetaUncertain:async()=>{throw new Error('não deve marcar resultado incerto')},
  });
  assert.deepEqual(result,{ok:false,error:code},`${code} deve ser retornado de forma estruturada`);
}

await expectCanaryError('meta_canary_not_enabled');
await expectCanaryError('meta_media_canary_not_enabled');
await expectCanaryError('meta_canary_destination_blocked');

console.log('OK · erros do gate de mídia chegam estruturados ao Admin.');
