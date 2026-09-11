import fs from 'node:fs';

const corePath='supabase/functions/dona-antonia-agent-core-v1/index.ts';
const evalPath='supabase/functions/dona-antonia-agent-eval-v1/index.ts';
const harnessPath='scripts/test-agent-eval-harness-v1.mjs';

const core=fs.readFileSync(corePath,'utf8');
const evaluator=fs.readFileSync(evalPath,'utf8');
const harness=fs.readFileSync(harnessPath,'utf8');

const replaceExactlyOnce=(src,from,to,label)=>{
  const count=src.split(from).length-1;
  if(count!==1) throw new Error(`${label}: expected exactly one occurrence of ${from}, found ${count}`);
  return src.replace(from,to);
};

let nextCore=replaceExactlyOnce(
  core,
  'sb.rpc("build_whatsapp_agent_core_packet_v1",',
  'sb.rpc("build_whatsapp_agent_core_packet_v4",',
  'Agent Core canonical packet'
);

let nextEval=replaceExactlyOnce(
  evaluator,
  'resolve_whatsapp_agent_core_topic_v5',
  'resolve_whatsapp_agent_core_topic_v6',
  'Evaluator canonical topic resolver'
);

let nextHarness=harness;
if(nextHarness.includes("must(ev,'resolve_whatsapp_agent_core_topic_v5','same topic resolver');")){
  nextHarness=nextHarness.replace(
    "must(ev,'resolve_whatsapp_agent_core_topic_v5','same topic resolver');",
    "must(ev,'resolve_whatsapp_agent_core_topic_v6','same topic resolver');"
  );
}else if(!nextHarness.includes("must(ev,'resolve_whatsapp_agent_core_topic_v6','same topic resolver');")){
  throw new Error('Eval harness resolver assertion is neither V5 nor V6');
}
nextHarness=nextHarness.replace(
  'OK Dona Antonia Agent Eval V36-V50 isolation/parity contract',
  'OK Dona Antonia Agent Eval V36-V51 isolation/parity contract'
);

for(const [path,before,after] of [
  [corePath,core,nextCore],
  [evalPath,evaluator,nextEval],
  [harnessPath,harness,nextHarness],
]){
  if(before!==after){
    fs.writeFileSync(path,after);
    console.log(`patched ${path}`);
  }else{
    console.log(`already aligned ${path}`);
  }
}
