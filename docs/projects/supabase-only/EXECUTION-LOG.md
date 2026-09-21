# Supabase Only — Execution Log

## 2026-09-21 — Rodada 1

- criada branch `supabase-only-admin-migration-20260921`;
- auditados Supabase, Storage, pg_cron, advisors, tabelas, funções e dependências Firebase;
- aplicado backfill seguro de localização/fonte de imagem já existente no Supabase;
- 9/9 pg_cron pausados;
- dispatch automático de IA/outbound/Bling pausado e automações globais em OFF;
- Balanço rápido, Validades, Cestas mobile, Kits mobile e workers principais migrados para catálogo Supabase-only;
- criada API administrativa consolidada `admin-products-live-v1` e cliente seguro `admin-secure-api-v1.js`;
- runtimes Supabase-only principais publicados e filas abertas zeradas.

## 2026-09-21 — Rodada 2

- relidos ARCHITECTURE, CURRENT-STATE, DECOMMISSION-FIREBASE e COST-SECURITY-AUDIT antes de editar;
- confirmado que `basket_templates` e `basket_template_items` existem e contêm 9 templates;
- Cadastro rápido migrado no branch para runtime Supabase-only;
- commit `1280a570a70905d8d948528842ac39013979aa65`: novo `cadastro/cadastro-supabase-v1.js`;
- commit `d7637a131ad04b1c358e8b6f47866eadfbb31e5b`: `cadastro-v10.js` deixa de executar Firebase/Make e vira bootstrap de compatibilidade;
- commit `c0b52af5e006f6a10bb4a3f0a55aa264aefdd396`: compatibilidade do novo Cadastro com o formulário atual;
- Cadastro agora consulta EAN, atualiza estoque e cria produto exclusivamente via API administrativa autenticada do Supabase;
- produto novo nasce inativo para revisão; exclusão destrutiva e upload/IA automática ficam bloqueados enquanto automações estão pausadas;
- nenhum endpoint/Edge Function duplicado criado;
- verificação de filas confirmou `ai_jobs` abertos = 0; nenhum cron foi reativado;
- persistência de Cestas/Kits não foi trocada às cegas: as tabelas canônicas foram verificadas e a migração transacional fica explicitamente como primeira tarefa da R3.
