# DA6 — Protocolo de homologação física (NÃO executado)

**Status:** pendente. Este documento descreve critérios e recolhimento de provas; não comprova um teste realizado, não aprova release e não contém dados de clientes.

## Preparação
Use somente produtos artificiais/etiquetas de teste, sem fotos de clientes, residências ou dados pessoais. Fixe antes o resultado de `node scripts/da6-release-fingerprint.mjs` e o SHA do commit da branch. Se o código de impressão/OMR ou o gateway mudar depois, refaça os ensaios correspondentes.

No computador, selecione impressora térmica de **203 dpi** e papel **100 × 150 mm vertical**, escala 100%, margens automáticas e ajuste à página desativados. Registre fabricante/modelo, driver, escala, papel, navegador e data. Fotografe a folha impressa inteira, incluindo os quatro marcadores.

## Provas de operação
1. Imprima uma etiqueta de teste completa. Verifique corte, orientação, legibilidade visual de QR/Code128, quatro marcadores, dezena e unidade 0–9 nas seis posições e ausência de data fixa.
2. Marque os seis balanços com **0, 1, 7, 10, 23 e 99** usando caneta real. Escaneie QR, depois Code128, com leitor real ou câmera. Confira identidade do produto e serial.
3. Fotografe a mesma etiqueta usando celular com orientação normal, rotações de 90° e 180°, inclinação leve/moderada, sombra parcial e iluminação mais baixa, registrando modelo do celular e qualidade do foco.
4. Crie duas fotos de exceção, uma com marcações duplas no mesmo grupo e outra sem QR legível. Ambas precisam ser recusadas ou encaminhadas à revisão, **nunca interpretadas como quantidade inventada**.
5. Envie 10 fotos por upload privado; confirme cada arquivo no painel. Repita com 50 e 100 usando somente fotografias de testes artificiais. Feche o navegador **apenas depois do upload confirmado**; reabra e confira o lote, sem fotos desaparecidas ou duplicadas.
6. Comprove fila no servidor, progresso, falhas e até três tentativas por foto; finalize revisão manual e confira nome/horário/quantidade anterior e atual no log histórico. Não execute `inventory_balance_commit`, nem sincronização Bling.
7. Repita após troca de aba de fotos para Balanço A4; controles, planilha e contagem A4 não podem ter sido alterados.

## Critérios obrigatórios
- **Zero atribuições de identidade incorreta; zero quantidades falsas aceitas.** Casos incertos vão para revisão/recaptura.
- 100% dos objetos confirmados permanecem disponíveis no Storage privado; nenhuma leitura anônima permitida.
- Fila sem duplicações sob concorrência; nenhuma foto ultrapassa três tentativas; aprovados/rejeitados com histórico auditável.
- Estoque vigente e Bling permanecem inalterados durante ensaios históricos.
- Falhas são documentadas, corrigidas e reexecutadas antes de aprovar. Um CI digital verde não substitui essas provas.

## Registro para eventual aprovação
Preencher somente após ensaio físico efetivo, em arquivo distinto `docs/projects/DA6_QA_*.md`, com SHA do código, fabricante/modelo de impressora e celular, amostras de resultados por slot e hashes das evidências mantidas em armazenamento privado. Não adicionar fotografias de clientes ao GitHub. Fixar `evidence_file` e `evidence_sha256` no manifesto de release somente após revisão humana.

**Gate pendente:** sem impressora ou fotos físicas disponibilizadas, a homologação física não é realizada e o PR #987 permanece em rascunho.
