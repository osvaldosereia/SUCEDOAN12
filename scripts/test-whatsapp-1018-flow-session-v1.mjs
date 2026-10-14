import assert from 'node:assert/strict';
import {verify1018FlowSession as verify} from '../supabase/functions/_shared/ana-1018-flow-session-v1.mjs';
const now=new Date('2026-10-13T16:00:00.000Z');
const completion={ok:true,actionable:false,requiresSessionVerification:true,intent:'offers',kind:'offers_navigation',requiresHuman:false,requiresOrderLookup:false};
const session={status:'pending',whatsapp_account_id:'account-1018',customer_phone_e164:'+5565999999999',
 flow_id:'1234567890',outbound_message_id:'wamid.example123456',
 flow_token_sha256:'a'.repeat(64),issued_at:'2026-10-13T15:55:00Z',expires_at:'2026-10-13T16:25:00Z',inbound_message_id:null};
const input={completion,session,channelPhone:'+5565984491018',accountId:'account-1018',customerPhone:'+5565999999999',now};
const valid=verify(input);
assert.equal(valid.ok,true);
assert.equal(valid.requiresAtomicConsume,true);
assert.equal(valid.actionable,false);
for(const [name,change] of [
 ['foreign channel',{channelPhone:'+5565998150975'}],
 ['wrong account',{accountId:'account-0975'}],
 ['wrong customer',{customerPhone:'+5565888888888'}],
 ['unsigned result',{completion:{...completion,ok:false}}],
 ['already actionable',{completion:{...completion,actionable:true}}],
 ['wrong status',{session:{...session,status:'completed'}}],
 ['replayed inbound',{session:{...session,inbound_message_id:'wamid.replayed'}}],
 ['missing token',{session:{...session,flow_token_sha256:null}}],
 ['no outbound',{session:{...session,outbound_message_id:null}}],
 ['expired',{now:new Date('2026-10-13T16:25:00Z')}],
 ['future issuance',{now:new Date('2026-10-13T15:54:00Z')}],
 ['long lived',{session:{...session,expires_at:'2026-10-13T17:00:00Z'}}]
])assert.equal(verify({...input,...change}).ok,false,name);
console.log('PASS: Flow session verifier rejects cross-account, replay, stale and unverified results');
