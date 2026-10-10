# DA6 — Guia de execução expressa para homologação presencial e release

**Situação:** PLANO DE EXECUÇÃO, NÃO TESTADO E NÃO APROVADO. O PR #987 continua em draft. Este guia não modifica os sete gates e não substitui evidências reais.

## Objetivo operacional
Concluir a implantação de etiquetas 100×150 mm, leitura fotográfica de seis registros (0–99) e Balanço A4 preservado sem colocar pedidos, estoque, Bling ou clientes em risco. Usar dados artificiais do princípio ao fim.

## Bloco 1 — Preparar o ambiente sem tocar em produção (responsável técnico)
- [ ] Confirmar impressão digital do código com `node scripts/da6-release-fingerprint.mjs`; registrar o SHA de Git.
- [ ] Identificar projeto Supabase **separado** para staging; proibido usar `ssbesxgaijknwsjbsbcz` ou `qxstkwshuvplmmftrctj`. O projeto `Caneca Fácil` também não é ambiente DA6 e não deve ser reutilizado.
- [ ] Antes de criar ou reativar instância com cobrança, obter autorização de custo específica; staging temporário deve ser desativado/destruído após QA seguro. Branch Supabase pode ser cobrada por hora.
- [ ] Conferir destino exato: `DA6_TARGET_ENV=staging`, `DA6_STAGING_PROJECT_REF`, `DA6_STAGING_CONFIRM_REF`, `DA6_STAGING_WORKER_URL`; executar `node scripts/da6-staging-preflight.mjs --enforce`. Exit 3 = parar.
- [ ] Implantar somente no staging, sob conta técnica, as migrações DA6 em ordem, Edge, Storage privado, Vault, `pg_cron`/`pg_net`; usar credenciais exclusivas do staging e testar autorização/negativas. Não copiar dados produtivos.
- [ ] Validar 10 + 50 + 100 uploads exclusivos confirmados (nenhum blob duplicado), API, logs, worker independente da janela do navegador, até 3 tentativas, filas de concorrência, memória/latência/timeout e revisão auditável.
- [ ] Registrar evidência dos quatro casos: URL do worker correto, segredo inválido retorna erro, acesso anônimo negado, destino de produção recusado pelo preflight.

## Bloco 2 — Impressora e celular reais (responsável da operação + técnico)
**Kit mínimo:** impressora térmica **203 dpi**, papel **100 × 150 mm** vertical, caneta escura, celular com câmera, computador com impressão em escala 100%, seis etiquetas artificiais e conexão ao staging.

- [ ] Imprimir etiquetas reais (não PDF sintético), com QR, Code128 e quatro marcadores completos; registrar fabricante/modelo da impressora, papel, driver e dimensões medidas.
- [ ] Preencher os seis balanços de uma etiqueta com `0, 1, 7, 10, 23, 99`, respectivamente. Conferir visualmente cada ativação/dezena/unidade antes de fotografar.
- [ ] Registrar fotos reais de frente, rotação 90°/180°, inclinação, pouca luz e sombra; cadastrar todos os resultados esperados na planilha de auditoria abaixo.
- [ ] Criar uma foto com dupla marcação e uma com QR danificado; ambas devem ser rejeitadas ou revisadas, **nunca aceitas como produto/quantidade inventados**.
- [ ] Escanear QR e Code128 reais; produto, código/serial e seis quantidades precisam coincidir.
- [ ] Executar no staging uploads de 10, 50 e 100 **arquivos confirmados e diferentes**; fechar/reabrir o navegador, conferir que a fila continuou no servidor, revisar um resultado, confirmar rastreabilidade. Não usar contagens para atualizar estoque nem chamar Bling.
- [ ] Alternar com o balanço A4 e validar que suas funções e layout permanecem intactos.

| Slot | Marca esperada | Lida pelo motor | Ação se divergente |
|---|---:|---|---|
| 1 | 0 | PENDENTE | Reprovar/recapturar |
| 2 | 1 | PENDENTE | Reprovar/recapturar |
| 3 | 7 | PENDENTE | Reprovar/recapturar |
| 4 | 10 | PENDENTE | Reprovar/recapturar |
| 5 | 23 | PENDENTE | Reprovar/recapturar |
| 6 | 99 | PENDENTE | Reprovar/recapturar |

**Critério de aceite:** zero identidades incorretas e zero quantidades falsas aceitas. Um único falso positivo reprova a homologação, exige correção e nova execução do ensaio da versão corrigida.

## Bloco 3 — Backup, rollback e publicação (responsável técnico)
- [ ] Registrar backup/snapshot restaurável do banco de produção, versões de Edge/Admin anteriores e evidência do procedimento de reversão.
- [ ] Ensaiar em staging a reversão de Edge e frontend; comprovar que fotos e histórico existentes continuam presentes, que A4/estoque/integração Bling não sofrem mutação.
- [ ] Para CADA um dos sete gates do manifesto, criar documento real `docs/projects/DA6_QA_*.md` com o cabeçalho `DA6_ATTESTATION_V1` do protocolo oficial, identificando gate, SHA-256 exato da implementação e PASS **somente se a prova foi realmente verificada**; calcular hash SHA-256 do documento inteiro.
- [ ] Atualizar o manifesto com caminhos/hashes verificáveis; congelar fingerprint somente da versão realmente homologada; rodar `node scripts/da6-release-gate.mjs --report` e `--enforce`.
- [ ] Se qualquer gate falhar ou se CI geral estiver vermelho: **PARAR**. Se passar, realizar revisão protegida do PR, confirmar main atual, planejar rollout gradual, observar logs/erros, testar A4 e contagens históricas.
- [ ] Desligar agendamento horário de desenvolvimento **apenas** após publicação e monitoramento de sucesso.

## Decisão que não pode ser automatizada
A prova de impressora/celular reais requer uma pessoa e os equipamentos no local. Staging hospedado separado exige disponibilidade de projeto/recursos e, se houver custo, aprovação explícita. Não trocar por emulação, não reaproveitar projeto de outra empresa, não declarar gate como aprovado sem executar.

**Este guia não é atestado de execução.**
