# Supabase — Auditoria de organização, segurança e custo

## Diagnóstico

O projeto está funcional, porém acumulou muitas versões experimentais no schema público.

### Escala atual
- 288 tabelas públicas
- 979 funções SQL públicas
- 100 Edge Functions ativas
- 9 cron jobs ativos

A meta não é apagar agressivamente. A meta é reduzir superfície sem quebrar produção.

## Custos prioritários

### Storage
`product-image-batches` ocupa ~1,09 GB com 7.650 objetos. É o maior alvo de retenção.

Plano: manter somente intermediários necessários para lote ativo/revisão recente e remover artefatos antigos por política idempotente, depois de comprovar que nenhum registro ativo os referencia.

### Cron
Há jobs a cada minuto para WhatsApp/reconciliação e jobs de IA a cada 3–10 minutos.

Plano: medir volume real e manter minuto-a-minuto apenas onde há SLA operacional real. Dispatchers de IA devem ser condicionais e econômicos.

### Banco
`products` tem ~16 MB; tabelas de jobs de imagem somam volume relevante. Logs e jobs devem ter retenção e índices alinhados às consultas reais.

## Segurança

Prioridade:
1. corrigir search_path mutável;
2. revogar EXECUTE de SECURITY DEFINER que não precisa estar exposto;
3. consolidar autenticação do Admin em sessão Supabase + `admin_users`;
4. classificar tabelas RLS sem policy como server-only versus tabelas que realmente precisam de políticas;
5. habilitar leaked-password protection por configuração humana no dashboard quando aplicável.

## Performance

- 6 índices duplicados: candidatos fortes a limpeza após confirmar constraints;
- 189 FKs sem índice: indexar apenas caminhos realmente consultados/deletados;
- 130 índices sem uso: não remover automaticamente; observar workloads e origem das migrations.

## Princípios econômicos

- uma fonte de verdade;
- um endpoint por domínio sempre que possível;
- sem polling de catálogo inteiro;
- sem sincronização duplicada Firebase → GitHub → Supabase;
- IA somente por fila e sob necessidade;
- intermediários com retenção;
- logs com prazo e finalidade.
