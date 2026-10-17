import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import * as auth from '../vitrine/admin/admin-auth-session.mjs';

const token=(expires=3600)=>'e30.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+expires})).toString('base64url')+'.signature';
function makeEnv(handler){
  const values=new Map(),calls=[];
  globalThis.sessionStorage={
    getItem:key=>values.get(key)||null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key)
  };
  globalThis.location={origin:'https://www.donaantonia.com.br',pathname:'/vitrine/admin/',search:'',hash:''};
  globalThis.history={replaceState(_a,_b,url){
    const u=new URL(url,location.origin);location.pathname=u.pathname;location.search=u.search;location.hash=u.hash;
  }};
  globalThis.fetch=async(url,options={})=>{
    const u=new URL(String(url));calls.push({url:u.toString(),path:u.pathname,body:options.body?JSON.parse(options.body):null,options});
    const reply=await handler(u,options);
    return {ok:reply.status>=200&&reply.status<300,status:reply.status,json:async()=>reply.body||{}};
  };
  return {values,calls};
}
const success=(body={})=>({status:200,body});
const reject=(status=403)=>({status,body:{error:'forbidden'}});

test('no silent login and no owner token without human interaction',async()=>{
  const env=makeEnv(()=>{throw new Error('Unexpected external request')});
  await assert.rejects(()=>auth.ensureAdminToken({interactive:false}),/admin_login_required/);
  assert.equal(env.calls.length,0);
  assert.equal(auth.currentAdminToken(),'');
});

test('email sign-in never auto-creates users and never requests privileged bootstrap',async()=>{
  const env=makeEnv((u)=>u.pathname==='/auth/v1/otp'?success():reject(404));
  await assert.rejects(()=>auth.beginEmailLogin('invalid'),/admin_email_invalid/);
  await auth.beginEmailLogin('operador@example.com');
  assert.equal(env.calls.length,1);
  assert.equal(env.calls[0].path,'/auth/v1/otp');
  assert.equal(env.calls[0].body.create_user,false);
  assert.equal(env.calls[0].body.email,'operador@example.com');
  assert.match(env.calls[0].url,/redirect_to=/);
  assert.doesNotMatch(env.calls[0].url,/admin-pin-auth-v1/);
});

test('valid email code must pass server-side admin authorization before storing session',async()=>{
  const jwt=token();
  const env=makeEnv((u)=>{
    if(u.pathname==='/auth/v1/verify')return success({access_token:jwt,refresh_token:'ref-test'});
    if(u.pathname.includes('/functions/v1/admin-products-live-v1'))return success({ok:true});
    return reject(404);
  });
  const received=await auth.finishEmailLogin('operador@example.com','123456');
  assert.equal(received,jwt);
  assert.equal(auth.currentAdminToken(),jwt);
  assert.equal(env.values.get('da_admin_refresh_token_v2'),'ref-test');
  assert.deepEqual(env.calls.map(x=>x.path),['/auth/v1/verify','/functions/v1/admin-products-live-v1']);
  assert.match(env.calls[1].url,/action=ops_summary/);
});

test('inactive or unauthorized user cannot obtain an operational token',async()=>{
  const jwt=token();
  const env=makeEnv(u=>u.pathname==='/auth/v1/verify'
    ?success({access_token:jwt,refresh_token:'ref-test'}):reject(403));
  await assert.rejects(()=>auth.finishEmailLogin('operador@example.com','123456'),/admin_not_authorized/);
  assert.equal(auth.currentAdminToken(),'');
  assert.equal(env.values.get('da_admin_refresh_token_v2'),undefined);
});

test('expired JWT refresh uses refresh_token, then re-checks admin role',async()=>{
  const jwt=token();
  const env=makeEnv(u=>{
    if(u.pathname==='/auth/v1/token')return success({access_token:jwt,refresh_token:'new-refresh'});
    if(u.pathname==='/functions/v1/admin-products-live-v1')return success({ok:true});
    return reject(404);
  });
  env.values.set('da_finance_access_token_v1',token(-10));
  env.values.set('da_admin_refresh_token_v2','old-refresh');
  env.values.set('da_admin_verified_session_v2','verified');
  const result=await auth.ensureAdminToken({interactive:false});
  assert.equal(result,jwt);
  assert.equal(env.calls[0].body.refresh_token,'old-refresh');
  assert.equal(env.values.get('da_admin_refresh_token_v2'),'new-refresh');
  assert.equal(env.calls[1].path,'/functions/v1/admin-products-live-v1');
});

test('revoked refresh fails closed and clears both tokens',async()=>{
  const env=makeEnv(()=>reject(401));
  env.values.set('da_finance_access_token_v1',token(-10));
  env.values.set('da_admin_refresh_token_v2','revoked-refresh');
  env.values.set('da_admin_verified_session_v2','verified');
  await assert.rejects(()=>auth.ensureAdminToken({interactive:false}),/admin_login_required/);
  assert.equal(env.values.size,0);
});

test('magic link URL credentials are removed before authorization network call',async()=>{
  const jwt=token();
  const env=makeEnv(()=>{assert.equal(location.hash,'');return success({ok:true})});
  globalThis.location.search='?tab=orders';
  globalThis.location.hash='#access_token='+jwt+'&refresh_token=magic-refresh&token_type=bearer';
  const returned=await auth.completeRedirectSession();
  assert.equal(returned,jwt);
  assert.equal(location.search,'?tab=orders');
  assert.equal(location.hash,'');
  assert.equal(env.values.get('da_admin_refresh_token_v2'),'magic-refresh');
});

test('logout clears session and refresh credentials',()=>{
  const env=makeEnv(()=>success());
  env.values.set('da_finance_access_token_v1',token());
  env.values.set('da_admin_refresh_token_v2','refresh');
  env.values.set('da_admin_verified_session_v2','verified');
  auth.clearAdminSession();
  assert.equal(env.values.size,0);
});

test('all active entry points use shared login; privileged endpoint is retired',()=>{
  const files=[
    'vitrine/admin/index.html','vitrine/admin/atendimento/attendance-auth.js',
    'montar/app.js','orcamento/app-original.html'
  ];
  for(const path of files){
    const content=fs.readFileSync(path,'utf8');
    assert.doesNotMatch(content,/admin-pin-auth-v1|pin:\s*['"]000000['"]/,
      path+' cannot silently mint owner credentials');
    assert.match(content,/admin-auth-session\.mjs/,path+' must use shared login');
  }
  const retired=fs.readFileSync('supabase/functions/admin-pin-auth-v1/index.ts','utf8');
  assert.match(retired,/status:410/);
  assert.doesNotMatch(retired,/generateLink|getUserById|SUPABASE_SERVICE_ROLE_KEY|access_token\s*:/);
  const picker=fs.readFileSync('montar/index.html','utf8');
  assert.doesNotMatch(picker,/id="pin"/);
  for(const workflow of [
    'one-shot-admin-passwordless.yml','one-shot-admin-passwordless-cleanup.yml',
    'one-shot-admin-auto-session-retry.yml']){
    const yml=fs.readFileSync('.github/workflows/'+workflow,'utf8');
    assert.doesNotMatch(yml,/contents:\s*write|patch-admin-passwordless\.py|patch-admin-auto-session-retry\.py/);
  }
});

test('Admin, Orçamentos and picking JavaScript remain syntactically valid',()=>{
  const src=fs.readFileSync('montar/app.js','utf8');
  new vm.Script(src,{filename:'montar/app.js'});
  for(const path of ['vitrine/admin/index.html','orcamento/app-original.html']){
    const html=fs.readFileSync(path,'utf8');
    const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
      .map(match=>match[1]).filter(Boolean);
    assert.ok(scripts.length>0,path+' has inline script');
    for(const [i,script] of scripts.entries())
      new vm.Script(script,{filename:path+'#'+(i+1)});
  }
});


test('legacy privileged JWT is not silently accepted as individual sign-in',async()=>{
  const env=makeEnv(()=>{throw new Error('Legacy session must never request an API');});
  env.values.set('da_finance_access_token_v1',token());
  assert.equal(auth.currentAdminToken(),'');
  await assert.rejects(()=>auth.ensureAdminToken({interactive:false}),/admin_login_required/);
  assert.equal(env.calls.length,0);
});

test('unverified refresh token cannot silently mint operator session',async()=>{
  const env=makeEnv(()=>{throw new Error('Unverified refresh must not be used');});
  env.values.set('da_finance_access_token_v1',token(-1));
  env.values.set('da_admin_refresh_token_v2','unverified-refresh');
  await assert.rejects(()=>auth.ensureAdminToken({interactive:false}),/admin_login_required/);
  assert.equal(env.calls.length,0);
});

test('reject external and malicious login redirect destinations before sending any email',async()=>{
  const env=makeEnv(()=>{throw new Error('No auth email must be sent to bad URL');});
  for(const url of [
    'https://evil.example/vitrine/admin/',
    'https://www.donaantonia.com.br/other/',
    'https://www.donaantonia.com.br/vitrine/admin/#access_token=bad',
    'https://www.donaantonia.com.br/vitrine/admin/?next=https://evil.example'
  ])await assert.rejects(()=>auth.beginEmailLogin('operator@example.com',url),/admin_redirect_invalid/);
  assert.equal(env.calls.length,0);
});

test('denied magic link does not persist credentials and cleans URL',async()=>{
  const jwt=token();
  const env=makeEnv(()=>reject(403));
  location.hash='#access_token='+jwt+'&refresh_token=test-refresh';
  await assert.rejects(()=>auth.completeRedirectSession(),/admin_not_authorized/);
  assert.equal(location.hash,'');
  assert.equal(env.values.size,0);
});

test('error callback sanitizes tokens and error description before any network request',async()=>{
  const env=makeEnv(()=>{throw new Error('Error callback should not call backend');});
  location.search='?tab=orders&error=access_denied&error_description=secret';
  location.hash='#error=access_denied&error_description=secret';
  await assert.rejects(()=>auth.completeRedirectSession(),/admin_login_link_invalid/);
  assert.equal(location.search,'?tab=orders');
  assert.equal(location.hash,'');
  assert.equal(env.calls.length,0);
});

test('expired OTP access token cannot be persisted',async()=>{
  const env=makeEnv(u=>u.pathname==='/auth/v1/verify'
    ?success({access_token:token(-5),refresh_token:'fake'}):success({ok:true}));
  await assert.rejects(()=>auth.finishEmailLogin('operator@example.com','123456'),/admin_session_invalid/);
  assert.equal(env.values.size,0);
  assert.equal(env.calls.length,1);
});

test('unknown OTP error rejects login and never writes credentials',async()=>{
  const env=makeEnv(()=>reject(401));
  await assert.rejects(()=>auth.finishEmailLogin('operator@example.com','123456'),/admin_auth_rejected/);
  assert.equal(env.values.size,0);
  assert.equal(env.calls.length,1);
});
