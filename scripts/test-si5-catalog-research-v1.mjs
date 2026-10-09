import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {si5Proposal} from "../supabase/functions/si5-catalog-research-v1/si5-mapper.mjs";
const migration=readFileSync(new URL("../supabase/migrations/20261009031500_si5_catalog_research_v1.sql",import.meta.url),"utf8");
const worker=readFileSync(new URL("../supabase/functions/si5-catalog-research-v1/index.ts",import.meta.url),"utf8");
const sample={codbar:"7891000325858",produto:"LEITE PO NINHO INTEGRAL",marca:"Nestlé Ninho",
  categoria:"ALIMENTOS",ncm:"04022110",cest_codigo:"1701200",peso:"380.00",
  imagem_url:"https://global.si5.com.br/img/78/91/7891000325858.webp",
  ingredientes:"Leite integral",nutrientes:{energia_kcal:496,proteinas_g:25.2}};
const got=si5Proposal(sample,"7891000325858");
assert.equal(got.exact,true);
assert.equal(si5Proposal(sample,"07891000325858").exact,false);
assert.equal(si5Proposal({...sample,codbar:"7891000325859"},"7891000325858").exact,false);
assert.equal(got.proposed.ncm_candidate,"04022110");
assert.equal(got.proposed.cest_candidate,"1701200");
assert.equal(si5Proposal({...sample,cest_codigo:"100"},"7891000325858").proposed.cest_candidate,null);
assert.equal(got.proposed.reported_weight_raw,380);
assert.equal(got.proposed.weight_unit_unverified,true);
assert.equal(si5Proposal({...sample,peso:null},"7891000325858").proposed.reported_weight_raw,null);
assert.equal(si5Proposal({...sample,peso:-5},"7891000325858").proposed.reported_weight_raw,null);
assert.equal(si5Proposal({...sample,imagem_url:"https://attacker.test/x"},"7891000325858").proposed.image_reference,null);
assert.equal(got.proposed.nutrition_candidate.energia_kcal,496);
assert.equal("script" in (si5Proposal({...sample,nutrientes:{script:"X",sodio_mg:392}},"7891000325858").proposed.nutrition_candidate||{}),false);
assert.match(migration,/enabled boolean not null default false/);
assert.match(migration,/America\/Sao_Paulo/);
assert.match(migration,/default 'representatives_only'/);
assert.match(migration,/public\.cosmos_gtin_valid\(r\.gtin\)/);
assert.match(migration,/where id=true for update/);
assert.match(migration,/enable row level security/);
assert.match(migration,/security_invoker=true/);
assert.match(worker,/SI5_WORKER_SECRET/);
assert.match(worker,/if\(!cfg\.data\.enabled\)/);
assert.match(worker,/const limit=Math\.min\(batch/);
assert.doesNotMatch(worker,/\.from\(["']products["']\)\.update/);
assert.doesNotMatch(worker,/\.from\(["']product_fiscal_profiles["']\)\.update/);
assert.doesNotMatch(migration,/update\s+public\.products/i);
assert.doesNotMatch(migration,/cron\.schedule/);
console.log("PASS SI5 Global — 25 mapper, safety and deployment guards");
