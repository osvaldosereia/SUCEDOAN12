import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(import.meta.dirname,'..');
const migration=path.join(root,'supabase/migrations/20260930160500_simples_anexo_i_2026_seed_v1.sql');
assert.ok(fs.existsSync(migration),'migration missing: simples_anexo_i_2026_seed_v1');
const sql=fs.readFileSync(migration,'utf8').toLowerCase();

assert.ok(sql.includes("'sn-anexo-i-2026'"),'official 2026 Anexo I seed missing');
assert.ok(sql.includes("'2026-01-01'"),'rule effective_from missing');
assert.ok(sql.includes("'2026-12-31'"),'rule effective_to missing');
for(const value of ['0.04','0.073','0.095','0.107','0.143','0.19','5940','13860','22500','87300','378000'])assert.ok(sql.includes(value),`official Anexo I parameter missing: ${value}`);
assert.ok(sql.includes('3600000'),'2026 ICMS/ISS sublimite evidence missing');
assert.ok(sql.includes('official_only'),'official source policy missing');
assert.ok(sql.includes('resolução cgsn nº 140/2018')||sql.includes('resolucao cgsn 140/2018'),'legal basis missing');

console.log('PASS official Anexo I 2026 seed contract');
