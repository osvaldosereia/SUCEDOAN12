const enc=(v)=>new TextEncoder().encode(v);
const b64url=(bytes)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const pemBytes=(pem)=>Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g,"").replace(/\s/g,"")),c=>c.charCodeAt(0));

export async function googleAccessTokenFromServiceAccount(raw,nowSeconds=Math.floor(Date.now()/1000)){
  let sa; try{sa=typeof raw==="string"?JSON.parse(raw):raw}catch{throw new Error("invalid_service_account_json")}
  if(!sa?.client_email||!sa?.private_key) throw new Error("invalid_service_account");
  const header=b64url(enc(JSON.stringify({alg:"RS256",typ:"JWT"})));
  const payload=b64url(enc(JSON.stringify({
    iss:sa.client_email,scope:"https://www.googleapis.com/auth/cloud-platform",
    aud:"https://oauth2.googleapis.com/token",iat:nowSeconds,exp:nowSeconds+3300
  })));
  const key=await crypto.subtle.importKey("pkcs8",pemBytes(sa.private_key),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const sig=new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,enc(header+"."+payload)));
  const assertion=header+"."+payload+"."+b64url(sig);
  const response=await fetch("https://oauth2.googleapis.com/token",{
    method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion}),
    signal:AbortSignal.timeout(10000)
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok||!body?.access_token) throw new Error("google_token_exchange_failed");
  return String(body.access_token);
}
