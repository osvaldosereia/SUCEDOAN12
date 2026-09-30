from pathlib import Path

admin=Path('vitrine/admin/index.html')
s=admin.read_text(encoding='utf-8')
s=s.replace('Sessão administrativa expirada. Confirme o PIN novamente.','Sessão administrativa expirada. Tente novamente.')
s=s.replace('A sessão financeira expirou. Informe o PIN novamente.','A sessão financeira expirou. Tente novamente.')
admin.write_text(s,encoding='utf-8')

quote=Path('orcamento/index.html')
q=quote.read_text(encoding='utf-8')
q=q.replace("if(!adminToken()){box.innerHTML='<div class=\"saved-client-empty\">Abra esta ferramenta pelo Vitrine/Admin para consultar a base oficial de clientes.</div>';return}","await ensureAdminToken();")
quote.write_text(q,encoding='utf-8')
print('cleanup applied')
