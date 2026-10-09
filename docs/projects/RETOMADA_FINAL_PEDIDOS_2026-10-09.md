# RETOMADA OFICIAL — Conclusão acelerada dos Pedidos Dona Antônia
Data da auditoria: 09/10/2026, aproximadamente 16h15, Brasília. Documento para INICIAR NOVO CHAT. Não é prova de implantação.

## 1. LEIA PRIMEIRO
- Plano-mestre e últimos comentários: https://github.com/osvaldosereia/SUCEDOAN12/issues/964
- Código mais consolidado: PR draft R15 #1032 https://github.com/osvaldosereia/SUCEDOAN12/pull/1032, branch agent/orders-r15-unify-weekly-id-release-20261009, base PR R14 #1029.
- Relatório R15: https://github.com/osvaldosereia/SUCEDOAN12/blob/agent/orders-r15-unify-weekly-id-release-20261009/docs/orders-r15-weekly-identity-unification-20261009.md
- Controle de publicação R14: https://github.com/osvaldosereia/SUCEDOAN12/blob/agent/orders-r15-unify-weekly-id-release-20261009/scripts/fixtures/orders-r14-release-evidence-20261009.json
- Projeto canônico Supabase ssbesxgaijknwsjbsbcz (read-only); GitHub osvaldosereia/SUCEDOAN12. Verificar HEADs frescos. Main observado: 168558b6b8710ee7feda1b7c6a9360357357b0d3; R15 antes deste documento: 1fabe59c56a5f7e9e498e3fea2009552fa6d6a39.

## 2. ESTADO REAL CONFIRMADO
- R02 a R15 possuem grande volume de código e testes em PRs draft. R02 checkout, cestas, lotes, R03 número semanal, R04/05 confirmação Meta sintética, R06 separação/manifesto, R07 Bling sintético, R08 fiscal fail-closed, R09 observação, R10 XML SEFAZ fictício, R11 custódia, R12 pagamentos e retorno, R13 paridade, R14 release e R15 unificação de identidade.
- O código público aprovado em DESENVOLVIMENTO é DD|MM|YYYY - NNN, reinicia segunda-feira em America/Cuiaba, imutável. R15 substituiu uma migration concorrente de quatro dígitos NÃO aplicada e corrigiu seis consumidores; NÃO mesclar cegamente PR #953 ou #1026 sobre R15.
- PR #994 (checkout de cestas) passou CI #37928068917; R15 CI integrada sintética #37978776845 passou. Esses testes não validam Meta/Bling/SEFAZ reais.
- Última leitura R13: 29 de 30 triggers canônicos não reproduzidos no laboratório; 11 de 11 tabelas da fixture sem RLS igual ao canônico; cinco tabelas críticas com grants perigosos (conjunto de 29 tabelas no Supabase real). R13 #1024, CI #37971955620 gera diagnóstico mas NÃO libera produção.
- R14 #1029: NOVE gates de evidência sem aprovação no JSON. O CI #37977438220 passou porque constatou que release deve permanecer BLOQUEADO, não porque está pronta para deploy.
- Origem fiscal: 1 rule_set em draft e nenhum aprovado; R10 bloqueia geração com r8_approved_tax_attestation_not_integrated. Sem NF-e automática real segura. Sem prova de template Utility CONFIRMADO para ambos os números 0975 e 1018; sem Bling read-back e autorização SEFAZ reais.
- O último PR R15 #1032 ainda draft, sem merge nem deploy. Confirmar situação atual antes de modificar.

## 3. FALHAS E PENDÊNCIAS QUE MAIS ATRASAM
A. Resolver convergência R02–R15 x main e cadeia R02+R03 #1026 x R14/R15; migrations, arquivos Admin e funções grandes mudam em paralelo. NÃO substituir integralmente código mais novo por cópia antiga, não dar git merge global sem revisão.
B. Clone de staging com paridade: triggers reais, RLS, FORCE RLS, policy counts, permissões inclusive role PUBLIC, grants de TRUNCATE/TRIGGER/REFERENCES e default privileges, dependências Edge/cron/Storage/Vault. Corrigir 29/30 triggers ausentes e 11/11 RLS divergentes em teste fiel; o comparador R13 deve exigir paridade de verdade, não apenas produzir relatório verde.
C. Outra frente Compras/XML encontrou divergências no histórico de migrations; NÃO fazer supabase db push global, nem migration repair automático. Planejar migrações selecionadas e ensaiar backup/restore/rollback em staging.
D. Regra fiscal de saída CFOP/CST/CSOSN/CEST aplicável, NCM, ICMS e IBS/CBS 2026 dependem de revisão/aprovação por responsável fiscal. Só depois completar claim de NF-e única e homologação autorizada de SEFAZ.
E. Meta Utility 0975 e 1018 devem ser homologadas com webhook assinado, replay e botão CONFIRMADO; Bling GET/PUT/readback e dedup por VITRINE-order_id; logística não libera carga/rota sem prova fiscal.
F. Além dos pedidos, outras frentes ativas escrevem no mesmo repositório: Compras/XML e Etiquetas/Balanço. Conferir SHAs e evitar conflito por escrita simultânea.

## 4. PACOTES DE AUTOMAÇÃO: NÃO INVENTAR ACESSO
A automação horária Programação Dona Antônia está ATIVA (verificado em 09/10/2026) e deve permanecer sem duplicação. Ela registrou correções offline R13 não publicadas, citando /mnt/data/r15work, PACOTE_RODADA_15_2026-10-09.zip, PACOTES_RODADA_11/12/13/14_2026-10-09.zip.
Os caminhos citados NÃO existem na sessão que escreveu este documento; foram explicitamente verificados em container. Não dizer que estão publicados nem inventar link sandbox. No novo chat, tentar recuperá-los se estiverem disponíveis; senão reconstruir a partir do PR #1024 e código real.
Correções relatadas: evitar falso positivo no comparador R13 com policy_count e FORCE RLS divergentes, grants a PUBLIC e MAINTAIN/UPDATE, trigger extra, snapshot vazio/incompleto. A automação relatou testes locais Node/Python aprovados, mas SEM commit nem CI PostgreSQL. Prioridade absoluta: reproduzir testes, implementar com SHA fresco em branch, CI real e anexar no #964.

## 5. PLANO MAIS RÁPIDO, SEM REFAZER O QUE JÁ EXISTE
**FASE 1 — Primeira rodada do novo chat, executar por inteiro:** ler este documento, issue #964, PR #1032/R15, HEAD main e projetos concorrentes; criar matriz de conflitos e migrations. Recuperar/refazer patch de falsos positivos R13; testes RED/GREEN com policy count, FORCE, PUBLIC/grants, triggers extras e snapshots vazios; criar PR draft e CI PostgreSQL17, atualizar #964. Não refazer R01–R15.
**FASE 2 — Paridade fiel e segurança:** reproduzir no Supabase local/ambiente isolado os objetos canônicos, capturar triggers/read-only, instalar apenas migrations selecionadas, executar R02–R15 com RLS/roles verdadeiros; ensaiar rollback, checar segurança, preservação de estoque e número semanal. Emissão fiscal OFF.
**FASE 3 — Integrações e fiscal:** obter evidência real de homologação Meta/Bling/SEFAZ e aprovação de regras fiscais, completar worker autônomo de emissão única, timeout sem POST cego, defesa de duplicate invoice, logística com custódia/pagamento/retorno. Prosseguir frentes independentes quando aprovação externa travar uma parte.
**FASE 4 — R13/R14 gates finais:** testar E2E (dois clientes e separadores, faltas totais/parciais, duas workers, rejeição/tardia SEFAZ, retorno, split payment, perda de rede/rollback). Atualizar evidence R14 apenas com provas auditáveis; canário supervisionado após autorização específica. Não marcar gates como prontos falsamente.

## 6. SEGURANÇA E CUSTOS
- Mudanças apenas branch agent/*, SHA atual antes de editar, commits atômicos, PR draft/CI; Supabase canônico somente SELECT.
- Sem merge na main, SQL/migrations/deploy de produção, mensagem real, pedido, estoque, pagamento ou NF-e real sem gates comprovados e autorização específica.
- Se precisar criar staging remoto com custo (Supabase Pro preview branches ou projeto pago), pedir aprovação de custo; priorizar Supabase local/containers isolados sem despesas adicionais.
- A programação automática HORA EM HORA não substitui fila fiscal/worker autônomos no sistema real. Sem duplicar automação.

## 7. COMANDO PRONTO PARA O NOVO CHAT
CONTINUAR E CONCLUIR PEDIDOS DONA ANTÔNIA — R15 EM DIANTE. Atue como programador sênior. Acesse GitHub osvaldosereia/SUCEDOAN12. PRIMEIRO LEIA INTEGRALMENTE o arquivo docs/projects/RETOMADA_FINAL_PEDIDOS_2026-10-09.md na branch agent/orders-r15-unify-weekly-id-release-20261009 e os últimos comentários da issue #964. O PR #1032 é o código mais consolidado, com testes sintéticos, mas R14 ainda BLOQUEADO. Não volte à R01 nem repita funcionalidades já testadas. Confira HEAD main, trabalhos paralelos e estado das automações. Execute toda a Fase 1: R13 comparador de RLS/triggers/grants com testes robustos, CI Postgres, branch/PR e atualização #964; em seguida consolide e prepare staging canônico, aprovação fiscal, Bling/Meta e canário. Não publique em produção nem gere NF-e real antes de todas as comprovações. Programe o máximo tecnicamente seguro, registre commits, CI e checkpoints para a próxima rodada.

**STATUS FORMAL: DESENVOLVIMENTO R02–R15 avançado, operação final NÃO homologada nem implantada.**
