# Plano de desativação do Firebase

## Gate de projeto compartilhado

O Firebase `cedar-chemist-310801` ainda é referenciado por código do projeto separado **Caneca Fácil**. Portanto:

- o gate destas quatro rodadas é zerar o runtime Firebase da **Dona Antônia**;
- isso permite deixar Dona Antônia totalmente Supabase-only;
- o projeto Firebase físico NÃO pode ser excluído/revogado globalmente enquanto Caneca Fácil ou qualquer outro consumidor ainda depender dele;
- a Rodada 4 deve emitir também a lista de consumidores externos ao escopo para o corte físico posterior.

## Gate de desligamento

Firebase só pode ser desligado quando TODOS os itens abaixo forem verdadeiros:

- nenhum arquivo de runtime do Admin usa `firebaseio.com`;
- nenhuma Edge Function ativa consulta Firebase;
- nenhum cron ativo chama lógica dependente de Firebase;
- Cadastro rápido cria/edita somente `public.products`;
- Validades lê/escreve somente Supabase;
- Balanço rápido não usa fallback Firebase;
- Cestas rápidas e Kits carregam catálogo do Supabase;
- Imagens IA não usam Firebase para ativo/inativo nem para fonte remota;
- workflow manual de sincronização Firebase está arquivado/desativado;
- segredos Firebase deixam de ser necessários;
- smoke tests operacionais aprovados.

## Fases

### F0 — Congelar autoridade
Proibir novas dependências Firebase e marcar campos como legado.

### F1 — Estoque + Imagens
Remover fallback/import do Balanço e autoridade Firebase dos workers de imagem.

### F2 — Validades
Substituir GET/PATCH Firebase por API Supabase autenticada.

### F3 — Cadastro rápido
Substituir consulta, criação, atualização, exclusão e Make por Supabase + OpenAI. Novo produto nasce inativo e exige revisão humana.

### F4 — Cestas e Kits
Produto sempre vem do Supabase. Persistência das coleções será migrada/normalizada separadamente sem alterar o catálogo canônico.

### F5 — Infraestrutura legada
Desativar workflows Firebase e eliminar secrets/credenciais não usados.

### F6 — Limpeza econômica
Retenção de objetos intermediários, revisão de cron, índices duplicados e funções/tabelas obsoletas com evidência.

### F7 — Desligamento humano
Após relatório zero-Firebase da Dona Antônia **e** confirmação de zero consumidores do projeto Firebase compartilhado:
1. revogar service account/tokens Firebase;
2. bloquear RTDB para escrita/leitura;
3. manter backup exportado por período definido;
4. desativar projeto/billing quando não houver dependências externas.
