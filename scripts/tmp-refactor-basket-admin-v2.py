from pathlib import Path
import re

p=Path('vitrine/admin/index.html')
s=p.read_text(encoding='utf-8')

start=s.find('  function basketModelCapacity(items){')
end=s.find("  async function renderProducts(q=''){", start)
if start < 0 or end <= start:
    raise SystemExit(f'basket legacy block not found: start={start} end={end}')

canonical_delegate="""  async function renderBaskets(){
    const host=$('#content');
    if(!window.DonaAntoniaBasketAdmin?.render){
      if(host)host.innerHTML='<div class="empty">O módulo de Cestas/Kits não carregou. <button class="text" id="retryBasketModule" type="button">Tentar novamente</button></div>';
      $('#retryBasketModule')?.addEventListener('click',renderBaskets);
      return;
    }
    return await window.DonaAntoniaBasketAdmin.render();
  }

"""
s=s[:start]+canonical_delegate+s[end:]

marker="  function start(){setTab('today')}"
pos=s.find(marker)
if pos < 0:
    raise SystemExit('main runtime start marker not found')
if 'window.DonaAntoniaAdminBridge=' not in s[:pos]:
    bridge="""  window.DonaAntoniaAdminBridge={
    api,
    token:adminStepUp,
    operator:requireOperator,
    toast,
    refresh:renderBaskets,
    errorMessage
  };

"""
    s=s[:pos]+bridge+s[pos:]

s,n=re.subn(r"\n\s*window\.DonaAntoniaGuidedBridge\s*=\s*\{[\s\S]*?\n\s*\};", "", s, count=1)
if n != 1:
    raise SystemExit(f'old basket-specific bridge removal count={n}')

pattern=r'<script\s+src=["\']/?vitrine/admin/basket-guided-builder\.js[^"\']*["\']\s*></script>'
replacement='<script src="/vitrine/admin/basket-guided-builder.js?v=guided-v2"></script>\n<script src="/vitrine/admin/basket-admin-section.js?v=canonical-v2"></script>'
s,n=re.subn(pattern,replacement,s,count=1)
if n != 1:
    raise SystemExit(f'guided builder script tag replacement count={n}')

p.write_text(s,encoding='utf-8')
print('basket admin canonical refactor patch applied')
