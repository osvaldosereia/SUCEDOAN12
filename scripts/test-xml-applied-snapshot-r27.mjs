import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,existsSync} from "node:fs";
const root=new URL("../",import.meta.url);
const audited=[
 ["20261009023146_purchase_xml_catalog_observations_v1.sql","bb011848c8abaadb9adf306bf5809dd7",7782,"20261009051500_purchase_xml_catalog_observations_v1.sql"],
 ["20261009025849_purchase_xml_catalog_details_v2.sql","5f82e39c665ead23429aa1b011c52f42",2293,"20261009071500_purchase_xml_catalog_details_v2.sql"],
 ["20261009133642_sales_quote_bling_conversion_v1.sql","6e718614829047f2d092b55dba1f3319",2328,"20261009133000_sales_quote_bling_conversion_v1.sql"],
 ["20261009155231_separation_ready_reservation_idempotence_20261009.sql","2392276f2fd061dfbbaedd7a2c5eb59c",2112,"20261009160000_separation_ready_reservation_idempotence.sql"]
];
for(const [filename,remoteMd5,chars,oldName] of audited){
 const path="supabase/migrations/"+filename;
 const sql=readFileSync(new URL(path,root),"utf8");
 assert.equal(sql.length,chars,filename+" character count changed");
 assert.equal(createHash("md5").update(sql).digest("hex"),remoteMd5,
   filename+" differs from a remote Supabase statement snapshot verified on 2026-10-09");
 assert.equal(existsSync(new URL("supabase/migrations/"+oldName,root)),false,
   "Old duplicate migration still present: "+oldName);
}
console.log("PASS R27: 4 installed SQL files have exact remote MD5/length and no duplicate local versions");
