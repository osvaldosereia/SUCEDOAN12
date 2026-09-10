import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const must=(text,needle,label)=>{if(!text.includes(needle))throw new Error(`${label}: faltando ${needle}`)};
const mustNot=(text,needle,label)=>{if(text.includes(needle))throw new Error(`${label}: conteúdo proibido ${needle}`)};

const files={
  memory:'supabase/migrations/20260910150412_dona_antonia_agent_core_round3_memory_v1.sql',
  queue:'supabase/migrations/20260910150747_dona_antonia_agent_core_round3_async_queue_v1.sql',
  privacy:'supabase/migrations/20260910150915_dona_antonia_agent_core_round3_privacy_hardening_v1.sql',
  trigger:'supabase/migrations/20260910151206_dona_antonia_agent_core_round3_inbound_trigger_fix_v1.sql',
  packet:'supabase/migrations/20260910151318_dona_antonia_agent_core_round3_packet_integration_v1.sql',
  worker:'supabase/functions/dona-antonia-agent-learning-v1/index.ts',
  adminApi:'supabase/functions/admin-agent-learning-v1/index.ts',
  adminUi:'admin-v3/agent-learning.js',
  adminPage:'admin/aprendizados.html'
};
for(const [name,p] of Object.entries(files))if(!fs.existsSync(p))throw new Error(`${name}: arquivo ausente ${p}`);
const memory=read(files.memory),queue=read(files.queue),privacy=read(files.privacy),trigger=read(files.trigger),packet=read(files.packet),worker=read(files.worker),adminApi=read(files.adminApi),adminUi=read(files.adminUi),adminPage=read(files.adminPage);

must(memory,'learning_write_enabled=false','gate de escrita');
must(memory,'global_candidate_autopublish_enabled=false','autopublicação');
must(memory,"'declared','inferred','imported'",'precedência de origem');
must(memory,"'preferred_product'",'allowlist de memória');
must(memory,"'payment_method_preference'",'allowlist de memória');
must(memory,'declared_precedence','precedência declarado > inferido');

must(queue,"pgmq.create('agent_core_learning_v1')",'fila durável');
must(queue,"if not found or not cfg.learning_write_enabled",'dispatcher inerte');
must(queue,"*/5 * * * *",'cron de aprendizagem');
must(queue,"new.direction='inbound'",'contrato direction inbound');
must(queue,"human_handoff_precedence",'precedência humana');

must(privacy,'agent_core_text_is_safe_to_persist_v1','filtro de persistência');
must(privacy,'candidate_sensitive_or_identifier_rejected','proteção de candidato');
must(privacy,'summary_rejected','proteção de resumo');
must(privacy,'learning_write_disabled','aplicação bloqueada por gate');
for(const sensitive of ['cpf|cnpj','telefone|celular|email','cancer|diabet','politic|partido'])must(privacy,sensitive,`filtro ${sensitive}`);

must(trigger,"new.direction='inbound'",'trigger inbound');
must(packet,'get_agent_core_selective_memory_v1','memória seletiva no pacote');
must(packet,'search_service_knowledge_text_v1','busca textual no pacote');
must(packet,"'global_learning_requires_human_review',true",'revisão humana no pacote');
must(packet,"'sensitive_attributes_excluded',true",'política de memória no pacote');

must(worker,'store:false','Responses API sem armazenamento');
must(worker,'gpt-5.6-luna','modelo de aprendizagem');
must(worker,'apply_agent_core_learning_result_v1','aplicação governada');
mustNot(worker,'confirm_order','worker não confirma pedido');
mustNot(worker,'messages.send','worker não envia WhatsApp');
mustNot(worker,'bling','worker não chama Bling');

must(adminApi,'approve_draft','aprovação cria rascunho');
must(adminApi,'reject','rejeição disponível');
must(adminApi,'owner_required','revisão só pelo owner');
must(adminApi,'approval_creates_draft_only:true','política de revisão');
mustNot(adminApi,'decision==="publish"','sem publicação direta');

must(adminUi,'Criar rascunho para revisão','UX de dupla revisão');
must(adminPage,'Autopublicação bloqueada','aviso de segurança');
must(adminPage,'Escrita automática','estado do gate');

console.log('Agent Core Rodada 3: contrato estático OK');
