import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  metaOrderConfirmationCandidate,
  markSignedMetaOrderConfirmation
} from "../supabase/functions/_shared/order-meta-confirmation-v1.mjs";
import {
  verifyMetaSignature,
  normalizeMetaWebhook
} from "../supabase/functions/_shared/whatsapp-meta-webhook-v1.mjs";

const account0975 = "00000000-0000-4000-8000-000000000975";
const account1018 = "00000000-0000-4000-8000-000000001018";
function signedFixture(channel="0975", type="button") {
  return {
    object:"whatsapp_business_account",
    entry:[{id:"1234509876",changes:[{field:"messages",value:{
      metadata:{phone_number_id:channel==="0975"?"100000000975":"100000001018"},
      messages:[{
        from:"5565991111111",id:"wamid.SYNTHETIC_INBOUND_123456",
        type, timestamp:"1791470100",
        context:{id:"wamid.SYNTHETIC_OUTBOUND_123456"},
        ...(type==="button"
          ?{button:{text:"Confirmado",payload:"CONFIRMADO"}}
          :{interactive:{type:"button_reply",button_reply:{id:"CONFIRMADO",title:"Confirmado"}}})
      }]
    }}]}]
  };
}
async function normalize(payload) {
  return normalizeMetaWebhook({
    payload,rawBody:JSON.stringify(payload),
    accountByPhoneNumberId:new Map([
      ["100000000975",account0975],["100000001018",account1018]
    ])
  });
}

test("signed Meta quick reply is identified by payload and outbound WAMID",async()=>{
  const payload=signedFixture();
  const {messages}=await normalize(payload);
  assert.equal(messages.length,1);
  assert.equal(messages[0].message.metadata.button_payload,"CONFIRMADO");
  assert.equal(metaOrderConfirmationCandidate(messages[0]),null,"HMAC guard is required");
  const candidate=metaOrderConfirmationCandidate(messages[0],{signatureVerified:true});
  assert.equal(candidate?.button_id,"CONFIRMADO");
  assert.equal(candidate?.outbound_wamid,"wamid.SYNTHETIC_OUTBOUND_123456");
  assert.equal(candidate?.whatsapp_account_id,account0975);
  const attested=markSignedMetaOrderConfirmation(messages[0],candidate);
  assert.equal(attested.message.metadata.order_meta_confirmation.signature_verified,true);
  assert.equal(attested.message.metadata.order_meta_confirmation.source,"signed_meta_webhook");
});

test("both 0975 and 1018 channel answers are supported",async()=>{
  for(const channel of ["0975","1018"]){
    const {messages}=await normalize(signedFixture(channel));
    const selected=metaOrderConfirmationCandidate(messages[0],{signatureVerified:true});
    assert.equal(selected?.whatsapp_account_id,channel==="0975"?account0975:account1018);
  }
});

test("interactive button reply is eligible; ordinary text is never eligible",async()=>{
  const {messages}=await normalize(signedFixture("1018","interactive"));
  assert.equal(metaOrderConfirmationCandidate(messages[0],{signatureVerified:true})?.button_id,"CONFIRMADO");
  const text=structuredClone(messages[0]);
  text.message.message_type="text";
  text.message.text_body="CONFIRMADO";
  assert.equal(metaOrderConfirmationCandidate(text,{signatureVerified:true}),null);
});

test("fake payloads, missing context, altered button and WhatsApp echoes fail closed",async()=>{
  const {messages}=await normalize(signedFixture());
  for(const mutate of [
    m=>{m.message.metadata.button_payload="CONFIRMAR";},
    m=>{m.message.metadata.button_payload=undefined;},
    m=>{m.message.metadata.context_message_id=undefined;},
    m=>{m.message.metadata.context_message_id="fake-order-number";},
    m=>{m.event_type="message.sent";m.message.direction="outbound";},
    m=>{m.whatsapp_account_id="malformed";},
    m=>{m.provider_message_id="not_a_wamid";},
    m=>{m.phone_e164="+0";}
  ]){
    const msg=structuredClone(messages[0]);mutate(msg);
    assert.equal(metaOrderConfirmationCandidate(msg,{signatureVerified:true}),null);
  }
});

test("cryptographic HMAC signature rejects modified raw bytes",async()=>{
  const secret="LOCAL_TEST_ONLY_NOT_A_META_CREDENTIAL";
  const raw=JSON.stringify(signedFixture());
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const digest=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw));
  const signature="sha256="+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
  assert.equal(await verifyMetaSignature(raw,signature,secret),true);
  assert.equal(await verifyMetaSignature(raw+" ",signature,secret),false);
});

test("signed routing applies confirmation only after ingestion and before ANA",()=>{
  const source=fs.readFileSync("supabase/functions/whatsapp-meta-webhook-v1/index.ts","utf8");
  const verified=source.indexOf("if (!await verifyMetaSignature(");
  const applied=source.indexOf("const customerOrderConfirmed = await applyOrderMetaConfirmation(");
  const persisted=source.indexOf("await persistMessage(canonicalMessage");
  const ana=source.indexOf("if (!customerOrderConfirmed)");
  assert.ok(verified>=0&&persisted>verified&&applied>persisted&&ana>applied);
  assert.match(source,/metaOrderConfirmationCandidate\(message, \{ signatureVerified: true \}\)/);
  assert.match(source,/order_meta_confirmations_applied:/);
});

test("quick reply outbound is behind a default-OFF flag and explicit approved template",()=>{
  const source=fs.readFileSync("supabase/functions/admin-orders-v1/index.ts","utf8");
  assert.match(source,/ORDER_META_CONFIRM_BUTTON_ENABLED/);
  assert.match(source,/ORDER_META_CONFIRM_BUTTON_TEMPLATE_/);
  assert.match(source,/sub_type:"quick_reply",index:"0"/);
  assert.match(source,/payload:"CONFIRMADO"/);
  assert.match(source,/approved_confirm_button_template_missing/);
});
