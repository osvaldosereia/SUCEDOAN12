import assert from 'node:assert/strict';
import fs from 'node:fs';

const path='supabase/sql/20261002_whatsapp_sender_kind_unknown_v1.sql';
assert.ok(fs.existsSync(path),'migration sender_kind unknown deve existir');
const sql=fs.readFileSync(path,'utf8');
assert.match(sql,/drop\s+constraint\s+if\s+exists\s+whatsapp_messages_v1_sender_kind_check/i);
assert.match(sql,/add\s+constraint\s+whatsapp_messages_v1_sender_kind_check/i);
assert.match(sql,/'unknown'/i,'constraint deve aceitar autoria desconhecida explicitamente');
assert.match(sql,/'customer'/i);
assert.match(sql,/'ana_ai'/i);
assert.match(sql,/'human'/i);

console.log('OK · schema aceita sender_kind unknown sem remover categorias existentes.');
