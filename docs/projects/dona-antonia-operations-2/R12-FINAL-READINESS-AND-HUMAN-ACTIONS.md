# Operations 2.0 — R12 · Auditoria final e readiness

Data: 2026-09-26
Status: sequência autônoma R1–R12 encerrada. Próxima fase depende de homologação física/externa.

## Veredito técnico
A arquitetura Operations 2.0 está preparada para homologação real controlada, mas NÃO está autorizada para cutover global automático.

Preservados:
- pedidos históricos somente leitura;
- gates EAN, fiscal, pagamento e retorno;
- Bling/estoque em modo conservador até canário;
- sem Make na arquitetura nova;
- sem polling novo desnecessário;
- workers antigos Bling Hub e IA fiscal inativos;
- XML diário ativo como rotina prevista.

## Snapshot final
UX operacional:
- 33 pedidos confirmados;
- 1 pronto;
- 16 atenções abertas;
- 9 urgentes;
- recomendação atual: central_attention.

Readiness integrado:
- 87 pedidos totais;
- 58 consistentes com evidência atual;
- 27 com bling_order_id sem bling_synced_at;
- 29 com evidência EAN legada/ausente;
- sem backfill inventado.

Cron:
- Bling Hub antigo: inativo;
- worker IA fiscal: inativo;
- XML diário: ativo.

Advisors:
- R10 eliminou 7 foreign keys sem índice;
- avisos de performance restantes são índices sem uso observado, sem base segura para remoção;
- RLS enabled/no policy permanece em tabelas internas fechadas; não criar policy permissiva para silenciar lint;
- proteção contra senha vazada é configuração humana pendente.

## O que está tecnicamente pronto para canário
- motor canônico de pedido;
- reserva/controle de estoque com gates;
- integração Bling preparada para shadow/canary;
- conferência EAN;
- gate fiscal antes da expedição;
- rota/entregador;
- pagamento efetivo e split;
- não entrega/retorno sem restauração automática indevida;
- XML/compras e conversão caixa->unidade com revisão;
- PapoAI receiver/observabilidade;
- read models de Central/UX e readiness integrado.

## O que permanece deliberadamente bloqueado
- cutover global de estoque Bling;
- ativação global de early-order/direct state;
- sincronização financeira real de pagamento sem homologação;
- automação fiscal destrutiva;
- remoção massiva de Edge Functions/tabelas históricas;
- criação retroativa de evidência para pedidos legados.

## Lista única de ações humanas — executar nesta ordem
1. Segurança: habilitar leaked-password protection no Auth após conferir usuários atuais.
2. Bling/estoque: confirmar produtos ainda sem vínculo determinístico; fazer contagem física/canário e validar saldo virtual x físico.
3. Separação: usar tablet + leitor EAN em um pedido novo; conferir erro de EAN, quantidade e conclusão.
4. Impressão: testar impressora 85 mm física e confirmar queued/presented/printed/retry.
5. Fiscal: com contador/regra operacional confirmada, emitir NF-e canário e validar DANFE/SEFAZ.
6. Entregador: testar em celular real endereço, Maps, WhatsApp, observações e botões.
7. Pagamento: testar forma única e, em canário apropriado, split; total deve fechar exatamente; validar mapeamentos Bling antes de qualquer lançamento financeiro automático.
8. Fluxo feliz completo: link catálogo -> checkout -> pedido -> Bling -> separar -> EAN -> fiscal -> expedição -> rota -> pagamento -> entregue -> reconciliação.
9. Fluxo de exceção: segundo pedido canário com não entrega -> retorno -> inspeção -> reentrega/cancelamento, confirmando que estoque não volta automaticamente antes da revisão.
10. XML/compras: testar 10–20 XML reais CNPJ/CPF, incluindo exemplos de caixa 6/12/24; confirmar que CPF não gera financeiro empresarial.
11. PapoAI: testar Flow real, /catalogo_####, reconhecimento do cliente e um evento estruturado draft -> confirmação -> exatamente um pedido.
12. UX: operador real percorre Central, Pedidos, Tablet Separação, Estoque Mobile e Entregador; registrar somente confusões reais e cliques desnecessários.

## Critério para autorizar cutover
Somente após os canários:
- nenhum pedido duplicado;
- nenhum estoque negativo ou dupla baixa;
- Bling com identidade/situação corretas;
- EAN obrigatório comprovado;
- NF-e autorizada no ponto correto;
- pagamento efetivo fecha 100%;
- retorno não restaura estoque sem inspeção;
- retry idempotente;
- reconciliação final sem divergência inexplicada.

## Rollback
Enquanto os gates globais permanecerem fechados, rollback é manter legacy_shadow/fluxo atual e desabilitar apenas o canário afetado.
Não promover globalmente nenhuma flag durante homologação inicial.

## Pendências que NÃO devem ser tratadas como defeito agora
- 27 pedidos históricos com ID Bling sem timestamp novo;
- 29 pedidos históricos sem evidência EAN do modelo novo;
- índices com idx_scan=0 em ambiente ainda pouco exercitado;
- Edge Functions antigas apenas por existirem implantadas.

## Próxima fase
Pausar programação que dependa de evidência humana.
Após a execução da lista acima, registrar evidências e iniciar rodadas pós-homologação para:
1. corrigir falhas observadas;
2. autorizar canário ampliado;
3. executar cutover de estoque/early-order quando todos os gates passarem;
4. só então limpar legado/Edge Functions comprovadamente sem uso.
