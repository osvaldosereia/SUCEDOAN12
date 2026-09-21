(()=>{
  'use strict';
  // Compatibility bootstrap. The former Firebase/Make implementation is intentionally retired.
  // Cadastro now authenticates through the shared Admin session and writes only to Supabase.
  import('./cadastro-supabase-v1.js').catch(error=>{
    console.error('[cadastro-supabase] bootstrap failed',error);
    const node=document.getElementById('message');
    if(node){node.textContent='Não foi possível iniciar o Cadastro Supabase-only.';node.className='message show error';}
  });
})();
