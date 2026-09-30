from pathlib import Path

path=Path('vitrine/admin/index.html')
s=path.read_text(encoding='utf-8')
old="""  async function start(){
    try{
      await api('health');
      setTab('today');
    }catch(e){
      $('#content').innerHTML='<div class=\"empty\">Não consegui abrir o Admin agora. <button class=\"text\" id=\"retryAdmin\">Tentar novamente</button></div>';
      if($('#retryAdmin'))$('#retryAdmin').onclick=()=>location.reload();
    }
  }
"""
new="""  function start(){setTab('today')}
"""
if old not in s:
    raise SystemExit('startup health anchor not found')
s=s.replace(old,new,1)
path.write_text(s,encoding='utf-8')
print('patched admin startup')
