import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const U=Deno.env.get("SUPABASE_URL")||"";
const K=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);

const cors=(r:Request)=>{
  const o=r.headers.get("origin")||"";
  return {
    "Access-Control-Allow-Origin":ORIGINS.has(o)?o:"https://www.donaantonia.com.br",
    "Vary":"Origin",
    "Access-Control-Allow-Headers":"content-type,authorization",
    "Access-Control-Allow-Methods":"GET,OPTIONS"
  };
};
const json=(r:Request,b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors(r),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const txt=(v:any,n=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const cleanCnpj=(v:any)=>String(v??"").toUpperCase().replace(/[^0-9A-Z]/g,"").slice(0,14);

async function adminAuth(r:Request){
  const token=(r.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return {ok:false,status:401,error:"admin_auth_required"};
  const user=await db.auth.getUser(token);
  if(user.error||!user.data?.user?.id)return {ok:false,status:401,error:"admin_session_invalid"};
  const q=await db.from("admin_users").select("role,is_active").eq("user_id",user.data.user.id).maybeSingle();
  if(q.error)return {ok:false,status:500,error:"admin_lookup_failed"};
  if(!q.data?.is_active)return {ok:false,status:403,error:"admin_not_authorized"};
  return {ok:true,status:200,user_id:user.data.user.id,role:q.data.role||"viewer"};
}

function normalize(raw:any){
  const ies=Array.isArray(raw?.inscricoes_estaduais)?raw.inscricoes_estaduais:[];
  const ie=ies.find((x:any)=>x&&x.ativo!==false&&txt(x.uf||x.estado,2).toUpperCase()===txt(raw?.uf,2).toUpperCase())
    ||ies.find((x:any)=>x&&x.ativo!==false)||ies[0]||{};
  const secondaries=Array.isArray(raw?.cnaes_secundarios)?raw.cnaes_secundarios:[];
  const partners=Array.isArray(raw?.qsa)?raw.qsa:[];
  return {
    cnpj:txt(raw?.cnpj,30),
    razao_social:txt(raw?.razao_social||raw?.nome,300),
    nome_fantasia:txt(raw?.nome_fantasia||raw?.fantasia,300),
    situacao:txt(raw?.descricao_situacao_cadastral||raw?.situacao,120),
    data_inicio_atividade:txt(raw?.data_inicio_atividade||raw?.abertura,30),
    natureza_juridica:txt(raw?.natureza_juridica,240),
    porte:txt(raw?.porte,120),
    tipo_logradouro:txt(raw?.descricao_tipo_de_logradouro||raw?.tipo_logradouro,80),
    logradouro:txt(raw?.logradouro,300),
    numero:txt(raw?.numero,60),
    complemento:txt(raw?.complemento,200),
    bairro:txt(raw?.bairro,180),
    cep:txt(raw?.cep,20),
    municipio:txt(raw?.municipio,180),
    uf:txt(raw?.uf,2).toUpperCase(),
    telefone_1:txt(raw?.ddd_telefone_1||raw?.telefone,60),
    telefone_2:txt(raw?.ddd_telefone_2,60),
    email:txt(raw?.email,240),
    inscricao_estadual:txt(ie?.inscricao_estadual||ie?.numero||ie?.ie,80),
    cnae_principal_codigo:txt(raw?.cnae_fiscal||raw?.atividade_principal?.[0]?.code,30),
    cnae_principal_descricao:txt(raw?.cnae_fiscal_descricao||raw?.atividade_principal?.[0]?.text,300),
    atividades_secundarias:secondaries.slice(0,50).map((x:any)=>({codigo:txt(x?.codigo||x?.code,30),descricao:txt(x?.descricao||x?.text,300)})),
    socios:partners.slice(0,100).map((x:any)=>({nome:txt(x?.nome_socio||x?.nome,300),qualificacao:txt(x?.qualificacao_socio||x?.qual,180)}))
  };
}

Deno.serve(async(r:Request)=>{
  if(r.method==="OPTIONS")return new Response(null,{status:204,headers:cors(r)});
  if(r.method!=="GET")return json(r,{ok:false,error:"method_not_allowed"},405);
  const auth=await adminAuth(r);if(!auth.ok)return json(r,{ok:false,error:auth.error},auth.status||401);
  const u=new URL(r.url),cnpj=cleanCnpj(u.searchParams.get("cnpj"));
  if(!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj))return json(r,{ok:false,error:"invalid_cnpj",message:"Informe um CNPJ com 14 caracteres."},400);
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),12000);
    let res:Response;
    try{
      res=await fetch("https://brasilapi.com.br/api/cnpj/v1/"+encodeURIComponent(cnpj),{
        headers:{"Accept":"application/json","User-Agent":"DonaAntoniaAdmin/1.0"},
        signal:controller.signal
      });
    }finally{clearTimeout(timer)}
    const raw=await res.json().catch(()=>null);
    if(res.status===404)return json(r,{ok:false,error:"cnpj_not_found",message:"CNPJ não encontrado na base consultada."},404);
    if(!res.ok||!raw)return json(r,{ok:false,error:"cnpj_provider_error",message:"A consulta de CNPJ está temporariamente indisponível."},502);
    return json(r,{ok:true,source:"BrasilAPI / Minha Receita",company:normalize(raw)});
  }catch(e){
    return json(r,{ok:false,error:"cnpj_lookup_failed",message:e instanceof DOMException&&e.name==="AbortError"?"A consulta demorou demais. Tente novamente.":"Não foi possível consultar o CNPJ agora."},502);
  }
});
